# Navegador de Mr. Pilo.
# La imagen oficial de Playwright ya trae Chromium y lo que necesita para correr.
# Su versión debe ser LA MISMA que la de «playwright» en package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# No corre como root, y no necesita escribir en disco.
USER pwuser

ENV PORT=8787
EXPOSE 8787

# NAVEGADOR_CLAVE se da al arrancar (docker run -e …): sin ella el servicio no arranca.
CMD ["node", "src/servidor.js"]
