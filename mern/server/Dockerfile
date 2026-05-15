# Node.js 20 LTS — official open source image (MIT-licensed runtime)
FROM node:20-alpine

WORKDIR /app

# Install only production deps (deterministic via package-lock)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4000

# Healthcheck endpoint for docker-compose
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O- http://localhost:4000/api/version || exit 1

CMD ["node", "server.js"]
