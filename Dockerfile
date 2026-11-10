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
# La dirección de Supabase también la necesita nginx (microportales de Documentos,
# /portales/…). Es pública; sale del mismo valor con que se compiló el portal. Si
# en Coolify se define como variable de ejecución con otro nombre, SUPABASE_ORIGIN
# tiene prioridad.
ARG VITE_SUPABASE_URL
ENV SUPABASE_ORIGIN=$VITE_SUPABASE_URL
# La imagen de nginx convierte /etc/nginx/templates/*.template en conf.d/*.conf al arrancar.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
