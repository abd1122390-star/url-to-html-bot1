FROM node:20-alpine
WORKDIR /app
COPY package.json bot.js decoder.js ./
CMD ["node", "bot.js"]
