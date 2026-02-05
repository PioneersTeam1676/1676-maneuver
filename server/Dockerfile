FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --production

COPY src ./src
COPY data ./data

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "start"]
