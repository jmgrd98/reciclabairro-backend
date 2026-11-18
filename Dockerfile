# ── Build ────────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
# O prisma generate não acessa o banco, mas a configuração exige a variável definida.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# ── Runtime ──────────────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Cliente gerado: usado pelo seed (npx prisma db seed) dentro do contêiner.
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/package.json /app/prisma7.config.ts ./
USER node
EXPOSE 3000
# Aplica as migrations pendentes e sobe a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
