# Usa imagem Node.js leve (Debian)
FROM node:18-slim

# Instala Chromium e libs necessárias pro Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  ca-certificates \
  fonts-liberation \
  libnss3 \
  libatk-bridge2.0-0 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libatk1.0-0 \
  libpangocairo-1.0-0 \
  libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia só manifests primeiro pra aproveitar cache
COPY package*.json ./

# Variáveis do Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Instala dependências (sem dev)
RUN npm install --omit=dev

# Copia o restante do projeto
COPY . .

# Porta do Express
EXPOSE 3000

# Sobe o bot
CMD ["npm", "start"]
