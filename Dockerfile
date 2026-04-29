# syntax=docker/dockerfile:1.7
# ============================================================================
# FLC BI — Production image (multi-stage)
# ----------------------------------------------------------------------------
# Stage 1 (`build`): install deps + produce the Vite bundle.
# Stage 2 (`runtime`): tiny nginx image that serves the static bundle with
# SPA fallback and a read-only filesystem.
# ----------------------------------------------------------------------------
# Build args:
#   BUILD_WORKSPACE, BUILD_OUTPUT_DIR — optional single workspace build target
#   and dist directory. Defaults keep the root app behavior.
#   BUILD_HRMS_WEB — when true, build the root app at `/` and HRMS web at `/hrms/`.
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_ENV, VITE_SENTRY_DSN,
#   VITE_APP_URL, VITE_HRMS_APP_URL, VITE_APP_VERSION — inlined into the client bundle. Only public values.
# ============================================================================

FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first so the cached npm layer is reused when only source
# changes. npm ci requires package-lock.json to be present.
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig*.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci --prefer-offline --no-audit --no-fund

COPY . .

# Build-time public envs (baked into the bundle by Vite).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_ENV=production
ARG VITE_SENTRY_DSN
ARG VITE_APP_URL
ARG VITE_HRMS_APP_URL
ARG VITE_APP_VERSION
ARG BUILD_WORKSPACE=
ARG BUILD_OUTPUT_DIR=dist
ARG BUILD_HRMS_WEB=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_HRMS_APP_URL=$VITE_HRMS_APP_URL \
    VITE_APP_VERSION=$VITE_APP_VERSION

RUN if [ -n "$BUILD_WORKSPACE" ]; then npm run build --workspace "$BUILD_WORKSPACE"; else npm run build; fi \
    && rm -rf /app/.deploy-dist \
    && mkdir -p /app/.deploy-dist \
        && cp -a "$BUILD_OUTPUT_DIR"/. /app/.deploy-dist/ \
        && if [ "$BUILD_HRMS_WEB" = "true" ]; then \
            VITE_BASE_PATH=/hrms/ npm run build --workspace apps/hrms-web \
            && mkdir -p /app/.deploy-dist/hrms \
            && cp -a apps/hrms-web/dist/. /app/.deploy-dist/hrms/; \
        fi

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

ARG SUPABASE_INTERNAL_URL=http://192.168.1.241:54321

# Drop the stock default.conf and ship a hardened SPA config.
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/app.conf
RUN sed -i "s|__SUPABASE_INTERNAL_URL__|${SUPABASE_INTERNAL_URL}|g" /etc/nginx/conf.d/app.conf

# Copy static bundle selected by the build stage.
COPY --from=build /app/.deploy-dist /usr/share/nginx/html

# Non-root runtime. The stock nginx image already creates user `nginx`.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
