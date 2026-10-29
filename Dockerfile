# Build del portal (Vite) para Coolify sin Railpack/mise: Node llega como
# imagen de Docker Hub, así el servidor no necesita salir a nodejs.org.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Variables que Vite incrusta al compilar. En Coolify, márquelas como
# "Build Variable" con estos mismos nombres.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_TURNSTILE_SITEKEY
ARG VITE_OSRM_URL
ARG VITE_ALUNA_ALERTAS_URL
ARG VITE_ALUNA_VAPID_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_TURNSTILE_SITEKEY=$VITE_TURNSTILE_SITEKEY \
    VITE_OSRM_URL=$VITE_OSRM_URL \
    VITE_ALUNA_ALERTAS_URL=$VITE_ALUNA_ALERTAS_URL \
    VITE_ALUNA_VAPID_KEY=$VITE_ALUNA_VAPID_KEY

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
