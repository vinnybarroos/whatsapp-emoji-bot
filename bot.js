const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

class EmojiCounterBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
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
                    '--disable-gpu'
                ]
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
        // Gerar QR Code para autenticação
        this.client.on('qr', (qr) => {
            console.log('QR Code gerado!');
            this.qrCode = qr;
        });

        // Bot conectado
        this.client.on('ready', () => {
            console.log('Bot do WhatsApp está pronto!');
            this.isReady = true;
            this.qrCode = null;
        });

        // Bot desconectado
        this.client.on('disconnected', (reason) => {
            console.log('Bot desconectado:', reason);
            this.isReady = false;
        });

        // Processar mensagens recebidas
        this.client.on('message', async (message) => {
            try {
                await this.handleMessage(message);
            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        });

        // Inicializar cliente
        this.client.initialize();
    }

    async handleMessage(message) {
        const chat = await message.getChat();
        
        // Verificar se é um grupo
        if (!chat.isGroup) return;
        
        const groupId = chat.id._serialized;
        const messageBody = message.body;
        const currentDate = new Date();
        const monthYear = `${currentDate.getMonth() + 1}-${currentDate.getFullYear()}`;
        const userId = message.author || message.from;

        // Armazenar nome do usuário
        const contact = await message.getContact();
        this.userNames.set(userId, contact.pushname || contact.name || 'Usuário');

        // Processar comandos do bot
        if (messageBody.startsWith('!emoji')) {
            await this.handleCommand(message, chat, groupId);
            return;
        }

        // Contar emojis nas mensagens normais
        this.countEmojisInMessage(messageBody, groupId, monthYear, userId);
    }

    async handleCommand(message, chat, groupId) {
        const args = message.body.split(' ');
        const command = args[1];

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
                await message.reply('Comando não reconhecido. Use !emoji help para ver os comandos disponíveis.');
        }
    }

    async addEmojiTracking(message, chat, args) {
        if (args.length < 3) {
            await message.reply('Uso: !emoji add 😀 (substitua 😀 pelo emoji desejado)');
            return;
        }

        const emoji = args[2];
        this.trackedEmojis.add(emoji);
        await message.reply(`✅ Emoji ${emoji} adicionado para rastreamento!`);
    }

    async removeEmojiTracking(message, chat, args) {
        if (args.length < 3) {
            await message.reply('Uso: !emoji remove 😀');
            return;
        }

        const emoji = args[2];
        this.trackedEmojis.delete(emoji);
        await message.reply(`❌ Emoji ${emoji} removido do rastreamento!`);
    }

    async showEmojiCount(message, chat, groupId, args) {
        const emoji = args[2];
        const month = args[3] || (new Date().getMonth() + 1);
        const year = args[4] || new Date().getFullYear();
        const monthYear = `${month}-${year}`;

        if (!emoji) {
            await message.reply('Uso: !emoji count 😀 [mês] [ano]\nExemplo: !emoji count 😀 12 2024');
            return;
        }

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear]) {
            await message.reply(`Nenhum registro encontrado para o emoji ${emoji} em ${month}/${year}`);
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

        let response = `📊 *Contagem do emoji ${emoji} em ${month}/${year}*\n`;
        response += `📈 Total: ${totalCount} vezes\n\n`;
        response += `👥 *Por pessoa:*\n`;
        
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
            await message.reply('Uso: !emoji ranking 😀 [mês] [ano]');
            return;
        }

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear]) {
            await message.reply(`Nenhum registro encontrado para o emoji ${emoji} em ${month}/${year}`);
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
            await message.reply('Uso: !emoji user 😀 [mês] [ano] - Mostra sua contagem pessoal');
            return;
        }

        const userId = message.author || message.from;
        const userName = this.userNames.get(userId) || 'Você';

        const groupData = this.emojiCounts.get(groupId);
        if (!groupData || !groupData[emoji] || !groupData[emoji][monthYear] || !groupData[emoji][monthYear][userId]) {
            await message.reply(`${userName}, você não enviou o emoji ${emoji} em ${month}/${year}`);
            return;
        }

        const userCount = groupData[emoji][monthYear][userId];
        await message.reply(`📊 ${userName}, você enviou o emoji ${emoji} ${userCount} vezes em ${month}/${year}`);
    }

    async listTrackedEmojis(message, chat) {
        if (this.trackedEmojis.size === 0) {
            await message.reply('Nenhum emoji está sendo rastreado. Use !emoji add para adicionar emojis.');
            return;
        }

        const emojiList = Array.from(this.trackedEmojis).join(' ');
        await message.reply(`📋 Emojis rastreados: ${emojiList}`);
    }

    async showHelp(message, chat) {
        const helpText = `
🤖 *Comandos do Bot Contador de Emojis:*

*Configuração:*
!emoji add 😀 - Adiciona emoji para rastreamento
!emoji remove 😀 - Remove emoji do rastreamento
!emoji list - Lista emojis rastreados

*Contagem:*
!emoji count 😀 [mês] [ano] - Contagem detalhada por pessoa
!emoji ranking 😀 [mês] [ano] - Ranking do emoji
!emoji user 😀 [mês] [ano] - Sua contagem pessoal

!emoji help - Mostra esta ajuda

*Exemplos:*
!emoji add 👍
!emoji count 👍 - (mês atual)
!emoji count 👍 12 2024
!emoji ranking 😂
!emoji user 🎉 11 2024
        `;
        
        await message.reply(helpText);
    }

    countEmojisInMessage(messageBody, groupId, monthYear, userId) {
        if (!this.emojiCounts.has(groupId)) {
            this.emojiCounts.set(groupId, {});
        }

        const groupData = this.emojiCounts.get(groupId);

        for (const emoji of this.trackedEmojis) {
            const count = (messageBody.match(new RegExp(this.escapeRegex(emoji), 'g')) || []).length;
            
            if (count > 0) {
                if (!groupData[emoji]) {
                    groupData[emoji] = {};
                }
                
                if (!groupData[emoji][monthYear]) {
                    groupData[emoji][monthYear] = {};
                }
                
                if (!groupData[emoji][monthYear][userId]) {
                    groupData[emoji][monthYear][userId] = 0;
                }
                
                groupData[emoji][monthYear][userId] += count;
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
            totalGroups: this.emojiCounts.size
        };
    }

    getQrCode() {
        return this.qrCode;
    }
}

// Inicializar o bot
const bot = new EmojiCounterBot();

// Rotas do servidor
app.get('/', (req, res) => {
    const status = bot.getStatus();
    res.json({
        message: '🤖 WhatsApp Emoji Counter Bot',
        status: status,
        timestamp: new Date().toISOString()
    });
});

app.get('/qr', (req, res) => {
    const qr = bot.getQrCode();
    if (qr) {
        res.json({ qrCode: qr });
    } else {
        res.json({ message: 'Bot já está conectado ou QR Code não disponível' });
    }
});

app.get('/status', (req, res) => {
    res.json(bot.getStatus());
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = EmojiCounterBot;
