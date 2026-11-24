# Imagen oficial de Playwright: ya incluye Chromium y sus dependencias del sistema.
# La versión debe coincidir con la de package.json ("playwright": "1.47.2").
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

# Ruta fija del navegador: el contenedor puede ejecutarse con un usuario distinto de root
ENV NODE_ENV=production \
    PORT=3000 \
    BCP_DEBUG_DIR=/app/debug \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Instala Chromium dentro de la imagen, en la ruta fijada. Se desactiva la omisión de descarga solo para este paso.
RUN unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD && npx playwright install chromium && chmod -R a+rX /ms-playwright && ls -la /ms-playwright

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
