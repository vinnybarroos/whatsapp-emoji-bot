const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

class EmojiCounterBot {
    constructor() {
        // Configuração mais simples e compatível
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './auth_info'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ],
                // Tentar encontrar Chrome automaticamente
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
                               process.env.CHROME_BIN || 
                               '/usr/bin/chromium-browser' ||
                               '/usr/bin/google-chrome-stable' ||
                               undefined
            }
        });
        
        this.emojiCounts = new Map();
        this.trackedEmojis = new Set();
        this.userNames = new Map();
        this.qrCode = null;
        this.isReady = false;
        
        this.initializeBot();
    }

    initializeBot() {
        // Event handlers
        this.client.on('qr', (qr) => {
            console.log('✅ QR Code gerado! Acesse /qr para visualizar');
            this.qrCode = qr;
        });

        this.client.on('ready', () => {
            console.log('🚀 Bot WhatsApp conectado e funcionando!');
            this.isReady = true;
            this.qrCode = null;
        });

        this.client.on('disconnected', (reason) => {
            console.log('❌ Bot desconectado:', reason);
            this.isReady = false;
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
        });

        this.client.on('message', async (message) => {
            try {
                await this.handleMessage(message);
            } catch (error) {
                console.error('❌ Erro ao processar mensagem:', error);
            }
        });

        // Inicializar com tratamento de erro
        this.client.initialize().catch(error => {
            console.error('❌ Erro ao inicializar cliente:', error);
            // Tentar novamente em 30 segundos
            setTimeout(() => {
                console.log('🔄 Tentando reconectar...');
                this.client.initialize();
            }, 30000);
        });
    }

    async handleMessage(message) {
        try {
            const chat = await message.getChat();
            
            // Só funciona em grupos
            if (!chat.isGroup) return;
            
            const groupId = chat.id._serialized;
            const messageBody = message.body;
            const currentDate = new Date();
            const monthYear = `${currentDate.getMonth() + 1}-${currentDate.getFullYear()}`;
            const userId = message.author || message.from;

            // Salvar nome do usuário
            try {
                const contact = await message.getContact();
                this.userNames.set(userId, contact.pushname || contact.name || 'Usuário');
            } catch (error) {
                console.log('⚠️ Erro ao obter contato, usando nome padrão');
                this.userNames.set(userId, 'Usuário');
            }

            // Processar comandos
            if (messageBody.startsWith('!emoji')) {
                await this.handleCommand(message, chat, groupId);
                return;
            }

            // Contar emojis
            this.countEmojisInMessage(messageBody, groupId, monthYear, userId);
        } catch (error) {
            console.error('❌ Erro em handleMessage:', error);
        }
    }

    async handleCommand(message, chat, groupId) {
        const args = message.body.split(' ');
        const command = args[1];

        try {
            switch (command) {
                case 'add':
                    await this.addEmojiTracking(message, chat, args);
                    break;
                case 'remove':
                    await this.removeEmojiTracking(message, chat, args);
                    break;
                case 'count':
                    await this.showEmojiCount(message, chat, groupId, args);
                    break;
                case 'ranking':
                    await this.showEmojiRanking(message, chat, groupId, args);
                    break;
                case 'user':
                    await this.showUserEmojiCount(message, chat, groupId, args);
                    break;
                case 'list':
                    await this.listTrackedEmojis(message, chat);
                    break;
                case 'help':
                    await this.showHelp(message, chat);
                    break;
                default:
                    await message.reply('❓ Comando não reconhecido. Use !emoji help para ajuda.');
            }
        } catch (error) {
            console.error('❌ Erro ao executar comando:', error);
            await message.reply('❌ Erro interno. Tente novamente em alguns segundos.');
        }
    }

    async addEmojiTracking(message, chat, args) {
        if (args.length < 3) {
            await message.reply('❓ Uso: !emoji add 😀');
            return;
        }

        const emoji = args[2];
        this.trackedEmojis.add(emoji);
        await message.reply(`✅ Emoji ${emoji} adicionado!`);
        console.log(`➕ Emoji ${emoji} adicionado ao tracking`);
    }

    async removeEmojiTracking(message, chat, args) {
        if (args.length < 3) {
            await message.reply('❓ Uso: !emoji remove 😀');
            return;
        }

        const emoji = args[2];
        this.trackedEmojis.delete(emoji);
        await message.reply(`❌ Emoji ${emoji} removido!`);
    }

    async showEmojiCount(message, chat, groupId, args) {
        const emoji = args[2];
        const month = args[3] || (new Date().getMonth() + 1);
        const year = args[4] || new Date().getFullYear();
        const monthYear = `${month}-${year}`;

        if (!emoji) {
            await message.reply('❓ Uso: !emoji count 😀 [mês] [ano]');
            return;
        }

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear]) {
            await message.reply(`📭 Nenhum ${emoji} encontrado em ${month}/${year}`);
            return;
        }

        const userData = groupData[emoji][monthYear];
        let totalCount = 0;
        let userList = [];

        for (const [userId, count] of Object.entries(userData)) {
            totalCount += count;
            const userName = this.userNames.get(userId) || 'Usuário';
            userList.push({ name: userName, count: count });
        }

        userList.sort((a, b) => b.count - a.count);

        let response = `📊 *${emoji} em ${month}/${year}*\n`;
        response += `📈 Total: ${totalCount}\n\n`;
        
        userList.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
            response += `${medal} ${user.name}: ${user.count}\n`;
        });

        await message.reply(response);
    }

    async showEmojiRanking(message, chat, groupId, args) {
        const emoji = args[2];
        const month = args[3] || (new Date().getMonth() + 1);
        const year = args[4] || new Date().getFullYear();
        const monthYear = `${month}-${year}`;

        if (!emoji) {
            await message.reply('❓ Uso: !emoji ranking 😀');
            return;
        }

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear]) {
            await message.reply(`📭 Sem ranking para ${emoji} em ${month}/${year}`);
            return;
        }

        const userData = groupData[emoji][monthYear];
        let userList = [];

        for (const [userId, count] of Object.entries(userData)) {
            const userName = this.userNames.get(userId) || 'Usuário';
            userList.push({ name: userName, count: count });
        }

        userList.sort((a, b) => b.count - a.count);

        let response = `🏆 *Ranking ${emoji} - ${month}/${year}*\n\n`;
        
        userList.forEach((user, index) => {
            let position = '';
            if (index === 0) position = '🥇 1º';
            else if (index === 1) position = '🥈 2º';
            else if (index === 2) position = '🥉 3º';
            else position = `${index + 1}º`;
            
            response += `${position} ${user.name} - ${user.count} ${emoji}\n`;
        });

        await message.reply(response);
    }

    async showUserEmojiCount(message, chat, groupId, args) {
        const emoji = args[2];
        const month = args[3] || (new Date().getMonth() + 1);
        const year = args[4] || new Date().getFullYear();
        const monthYear = `${month}-${year}`;

        if (!emoji) {
            await message.reply('❓ Uso: !emoji user 😀');
            return;
        }

        const userId = message.author || message.from;
        const userName = this.userNames.get(userId) || 'Você';

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear] || !groupData[emoji][monthYear][userId]) {
            await message.reply(`📭 ${userName}, você não enviou ${emoji} em ${month}/${year}`);
            return;
        }

        const userCount = groupData[emoji][monthYear][userId];
        await message.reply(`📊 ${userName}: ${userCount}x ${emoji} em ${month}/${year}`);
    }

    async listTrackedEmojis(message, chat) {
        if (this.trackedEmojis.size === 0) {
            await message.reply('📝 Nenhum emoji sendo rastreado.\nUse: !emoji add 😀');
            return;
        }

        const emojiList = Array.from(this.trackedEmojis).join(' ');
        await message.reply(`📋 Rastreando: ${emojiList}`);
    }

    async showHelp(message, chat) {
        const helpText = `🤖 *Bot Contador de Emojis*

📝 *Configuração:*
!emoji add 😀 - Adicionar emoji
!emoji remove 😀 - Remover emoji  
!emoji list - Ver emojis rastreados

📊 *Contagem:*
!emoji count 😀 - Ver contagem detalhada
!emoji ranking 😀 - Ver ranking
!emoji user 😀 - Sua contagem

💡 *Exemplos:*
!emoji add 👍
!emoji count 👍
!emoji ranking 😂 12 2024`;
        
        await message.reply(helpText);
    }

    countEmojisInMessage(messageBody, groupId, monthYear, userId) {
        if (this.trackedEmojis.size === 0) return;

        if (!this.emojiCounts.has(groupId)) {
            this.emojiCounts.set(groupId, {});
        }

        const groupData = this.emojiCounts.get(groupId);

        for (const emoji of this.trackedEmojis) {
            const count = (messageBody.match(new RegExp(this.escapeRegex(emoji), 'g')) || []).length;
            
            if (count > 0) {
                if (!groupData[emoji]) groupData[emoji] = {};
                if (!groupData[emoji][monthYear]) groupData[emoji][monthYear] = {};
                if (!groupData[emoji][monthYear][userId]) groupData[emoji][monthYear][userId] = 0;
                
                groupData[emoji][monthYear][userId] += count;
                
                const userName = this.userNames.get(userId) || 'Usuário';
                console.log(`📊 ${userName}: +${count} ${emoji}`);
            }
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getStatus() {
        return {
            isReady: this.isReady,
            hasQrCode: !!this.qrCode,
            trackedEmojis: Array.from(this.trackedEmojis),
            totalGroups: this.emojiCounts.size,
            uptime: process.uptime()
        };
    }

    getQrCode() {
        return this.qrCode;
    }
}

// Inicializar bot
console.log('🚀 Iniciando Bot WhatsApp...');
const bot = new EmojiCounterBot();

// Servidor HTTP
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        message: '🤖 Bot WhatsApp Emoji Counter',
        status: bot.getStatus(),
        timestamp: new Date().toISOString()
    });
});

app.get('/qr', (req, res) => {
    const qr = bot.getQrCode();
    if (qr) {
        res.json({ 
            qrCode: qr,
            message: 'Use este QR Code para conectar o WhatsApp'
        });
    } else if (bot.isReady) {
        res.json({ 
            message: 'Bot já está conectado! ✅' 
        });
    } else {
        res.json({ 
            message: 'Aguarde... Gerando QR Code...' 
        });
    }
});

app.get('/status', (req, res) => {
    res.json(bot.getStatus());
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse /qr para obter QR Code`);
});

// Tratamento de erros global
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

module.exports = EmojiCounterBot;
