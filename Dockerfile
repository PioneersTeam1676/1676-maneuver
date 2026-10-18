# Frontend (PWA) image: build with Vite, serve the static output with nginx.
# Replaces `vite preview`, which Vite documents as not meant for production.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Vite inlines VITE_* values into the public bundle at build time, so they
# are build args (Dokploy: Environment → Build-time arguments), not runtime
# env. Only public values belong here. VITE_API_AUTH_TOKEN is deliberately
# NOT accepted: it would publish the API master token to every visitor.
ARG VITE_API_BASE_URL
ARG VITE_APP_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_REDIRECT_URI
ARG VITE_GOOGLE_ADMIN_EMAIL
ARG VITE_ULTRA_ADMIN_EMAIL
ARG VITE_ALLOWED_EMAIL_DOMAIN
ARG VITE_ALLOWED_EMAIL_DOMAINS
ARG VITE_TBA_API_KEY
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_MATCH_NOTIFICATION_LOOKAHEAD
ARG VITE_DISABLE_ANALYTICS
ARG VITE_HIDE_TBA_LINKS
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GOOGLE_REDIRECT_URI=$VITE_GOOGLE_REDIRECT_URI \
    VITE_GOOGLE_ADMIN_EMAIL=$VITE_GOOGLE_ADMIN_EMAIL \
    VITE_ULTRA_ADMIN_EMAIL=$VITE_ULTRA_ADMIN_EMAIL \
    VITE_ALLOWED_EMAIL_DOMAIN=$VITE_ALLOWED_EMAIL_DOMAIN \
    VITE_ALLOWED_EMAIL_DOMAINS=$VITE_ALLOWED_EMAIL_DOMAINS \
    VITE_TBA_API_KEY=$VITE_TBA_API_KEY \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
    VITE_MATCH_NOTIFICATION_LOOKAHEAD=$VITE_MATCH_NOTIFICATION_LOOKAHEAD \
    VITE_DISABLE_ANALYTICS=$VITE_DISABLE_ANALYTICS \
    VITE_HIDE_TBA_LINKS=$VITE_HIDE_TBA_LINKS

COPY . .
# Same gate as `npm run build`: a type error fails the deploy instead of shipping.
RUN npx tsc -b && npx vite build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
