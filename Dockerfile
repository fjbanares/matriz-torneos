# Imagen oficial de Playwright: ya incluye Chromium y sus dependencias.
# La versión debe coincidir con la de package.json ("playwright": "1.47.2").
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BCP_DEBUG_DIR=/app/debug \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
