// Convierte las tablas leídas de la página en equipos con jugadores.
// Funciona sobre datos ya extraídos del DOM (sin navegador), así que se puede probar aquí.
//
// Entrada: [ { title, headers: [string], rows: [[string]] } ]
// Salida:  [ { name, players: [ { name, army, disposition } ] } ]

const { norm } = require('./normalize');

function tablesToTeams(tables) {
  const teams = [];
  for (const t of tables) {
    const headers = (t.headers || []).map(norm);
    const find = (re) => headers.findIndex((h) => re.test(h));
    const iName = find(/player|jugador|name|nombre/);
    const iArmy = find(/army|faction|ejercito|ejército|faccion|facción/);
    const iDisp = find(/disposition|disposicion|disposición|force/);
    if (iName < 0) continue;

    const players = (t.rows || [])
      .map((r) => ({
        name: String(r[iName] ?? '').trim(),
        army: iArmy >= 0 ? String(r[iArmy] ?? '').trim() : '',
        disposition: iDisp >= 0 ? String(r[iDisp] ?? '').trim() : '',
      }))
      .filter((p) => p.name);

    if (players.length === 0) continue;
    teams.push({ name: String(t.title || `Equipo ${teams.length + 1}`).trim(), players });
  }
  return teams;
}

// ---------- Estructura real de la pestaña Roster de BCP ----------
// Cada equipo empieza con un par (nombre del equipo, "Team Captain: …").
// Cada jugador es un par (nombre del jugador, "Ejército - Disposición").
// Se leen los pares en orden de aparición en la página.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Se ejecuta dentro de la página (page.evaluate).
// Recorre TODOS los párrafos en orden de aparición y empareja cada subtítulo (caption)
// con el último nombre (body1) que haya aparecido antes. No depende de que sean hermanos.
function collectRosterEntries() {
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const entries = [];
  let stats = { names: 0, captions: 0, pairs: 0 };
  let lastName = null;
  let lastLink = null;
  for (const p of document.querySelectorAll('p')) {
    const cls = String(p.className || '');
    const text = clean(p.innerText || p.textContent);
    if (cls.includes('MuiTypography-body1')) {
      stats.names++;
      lastName = text;
      // Enlace a la lista del jugador (/list/ID), si la fila lo incluye en el HTML
      const row = p.parentElement?.parentElement;
      const a = row && row.querySelector('a[href*="/list/"]');
      lastLink = a ? a.href : null;
    } else if (cls.includes('MuiTypography-caption') && lastName !== null) {
      stats.captions++;
      stats.pairs++;
      entries.push({ name: lastName, caption: text, link: lastLink });
      lastName = null;
    } else if (cls.includes('MuiTypography-caption')) {
      stats.captions++;
    }
  }
  const pager = Array.from(document.querySelectorAll('p'))
    .map((p) => clean(p.innerText || p.textContent))
    .find((t) => /^\d+-\d+ of \d+$/.test(t)) || '';
  return { entries, stats, pager };
}

// Convierte los pares en equipos. Función pura: se puede probar aquí.
function entriesToTeams(entries) {
  const teams = [];
  let current = null;
  for (const e of entries) {
    const name = clean(e.name);
    const caption = clean(e.caption);
    if (/^team captain/i.test(caption)) {
      current = { name, players: [] };
      teams.push(current);
      continue;
    }
    if (!current || !name) continue;
    const at = caption.indexOf(' - ');
    const army = at >= 0 ? caption.slice(0, at).trim() : caption;
    const disposition = at >= 0 ? caption.slice(at + 3).trim() : '';
    current.players.push({ name, army, disposition, listUrl: e.link || null });
  }
  return teams.filter((t) => t.players.length > 0);
}

// Se ejecuta dentro de la página (page.evaluate): recoge todas las tablas con su título cercano
function collectTables() {
  const out = [];
  for (const table of document.querySelectorAll('table')) {
    const headers = Array.from(table.querySelectorAll('thead th, tr th')).map((th) => th.innerText.trim());
    const rows = Array.from(table.querySelectorAll('tr'))
      .filter((tr) => tr.querySelector('td'))
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()));

    let title = '';
    let node = table.previousElementSibling;
    while (node && !title) {
      if (/^H[1-6]$/.test(node.tagName)) title = node.innerText.trim();
      node = node.previousElementSibling;
    }
    if (!title) {
      const heading = table.closest('section, div')?.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) title = heading.innerText.trim();
    }
    out.push({ title, headers, rows });
  }
  return out;
}

module.exports = { tablesToTeams, collectTables, collectRosterEntries, entriesToTeams };
