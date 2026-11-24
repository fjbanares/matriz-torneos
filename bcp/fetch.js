// Lector de eventos de Best Coast Pairings (BCP) con un navegador headless (Playwright).
// BCP carga los datos con JavaScript: se abre Chromium, se pulsa la pestaña Roster y se leen los
// párrafos ya renderizados. Cada etapa se registra, para que un fallo indique exactamente dónde.

const fs = require('fs');
const path = require('path');
const { isBcpEventUrl } = require('../validate');
const { tablesToTeams, collectTables, collectRosterEntries, entriesToTeams } = require('./extract');

const VERSION = 'lector-bcp-v4';
console.log(`[BCP] ${VERSION} cargado`);

class BcpError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function launchBrowser() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    throw new BcpError(`Playwright no está instalado (${err.message.split('\n')[0]})`, 500);
  }
  return playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

// Con BCP_DEBUG=1 guarda el HTML que vio el navegador y una captura
async function saveDebug(page) {
  if (!process.env.BCP_DEBUG) return;
  const dir = process.env.BCP_DEBUG_DIR || path.join(process.cwd(), 'debug');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bcp-roster.html'), await page.content());
  await page.screenshot({ path: path.join(dir, 'bcp-roster.png'), fullPage: true }).catch(() => {});
}

async function fetchEvent(url) {
  if (!isBcpEventUrl(url)) {
    throw new BcpError('El enlace debe ser de un evento de Best Coast Pairings (https://www.bestcoastpairings.com/event/...)', 400);
  }

  const details = { version: VERSION, url };
  let stage = 'arranque del navegador';
  let browser;
  try {
    browser = await launchBrowser();

    stage = 'creación de la página';
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    stage = 'carga de la URL';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    details.finalUrl = page.url();
    details.pageTitle = await page.title();

    stage = 'pestaña Roster';
    const rosterTab = page.getByRole('tab', { name: /roster/i })
      .or(page.getByRole('link', { name: /roster/i }))
      .or(page.getByText(/^roster$/i));
    details.rosterTabFound = (await rosterTab.count()) > 0;
    if (details.rosterTabFound) {
      await rosterTab.first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    stage = 'espera de los datos';
    details.dataAppeared = await page
      .waitForSelector('p.MuiTypography-caption', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    await saveDebug(page);

    stage = 'lectura de las páginas';
    const allEntries = [];
    const pages = [];
    for (let guard = 0; guard < 50; guard++) {
      const { entries, stats, pager } = await page.evaluate(collectRosterEntries);
      allEntries.push(...entries);
      pages.push({ ...stats, pager });
      const next = page.getByRole('button', { name: 'next page' });
      if (!(await next.count()) || !(await next.first().isEnabled())) break;
      await next.first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
    }
    details.pages = pages;
    details.pairs = allEntries;

    stage = 'conversión a equipos';
    const title = await page.evaluate(() => document.querySelector('h1')?.innerText?.trim() || document.title);
    let teams = entriesToTeams(allEntries);
    if (teams.length < 2) {
      details.usedTableFallback = true;
      teams = tablesToTeams(await page.evaluate(collectTables));
    }
    if (teams.length < 2) {
      details.visibleText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 4000);
      console.error('[BCP] Sin equipos', JSON.stringify(details).slice(0, 2000));
      throw new BcpError(
        `No se encontraron equipos en la pestaña Roster. Pares encontrados: ${allEntries.length}. Ver "detalles".`,
        422,
        details
      );
    }
    return { title, teams };
  } catch (err) {
    if (err instanceof BcpError) throw err;
    details.step = stage;
    details.errorName = err.name;
    details.errorMessage = String(err.message).split('\n').slice(0, 3).join(' ');
    console.error(`[BCP] Fallo en la etapa "${stage}": ${details.errorMessage}`);
    throw new BcpError(`Fallo en la etapa "${stage}": ${details.errorMessage}`, 502, details);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchEvent, BcpError, VERSION };
