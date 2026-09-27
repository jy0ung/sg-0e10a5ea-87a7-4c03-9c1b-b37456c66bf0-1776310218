FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build --workspace=@flc/recovery-service

FROM node:20-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client gnupg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/apps/recovery-service/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/server.js"]
