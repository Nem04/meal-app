FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
