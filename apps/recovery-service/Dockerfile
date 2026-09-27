FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build --workspace=@flc/recovery-service

FROM node:20-bookworm-slim AS node-runtime

FROM postgres:17-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends gnupg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN useradd --create-home --uid 10001 recovery
WORKDIR /app
COPY --from=build /app/apps/recovery-service/dist ./dist
USER recovery
EXPOSE 8787
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
