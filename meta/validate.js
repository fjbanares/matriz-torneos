// Valida las filas de datos de meta que carga el administrador desde un Excel (.xls / .xlsx).
// La primera fila es la cabecera: faction | rival | win_rate | avg_diff | games.
// Un valor vacío o "-" es un dato ausente: se marca con "-" y no impide guardar.
// Son errores reales: nombres de facción que no existen, números mal escritos y pares repetidos.

const { GAMES } = require('../config');
const { norm } = require('../bcp/normalize');

const HEADER = ['faction', 'rival', 'win_rate', 'avg_diff', 'games'];
// Clave de comparación: sin mayúsculas, tildes ni apóstrofos (Emperor’s = Emperors)
const key = (t) => norm(t).replace(/'/g, '');
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-';

function parseNumber(value, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (isBlank(value)) return { value: null, missing: true };
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return { error: `"${value}" no es un número` };
  if (integer && !Number.isInteger(n)) return { error: `"${value}" debe ser un número entero` };
  if (n < min || n > max) return { error: `${n} está fuera del rango ${min} a ${max}` };
  return { value: n };
}

// rawRows: matriz de valores (primera fila = cabecera), tal como sale de la hoja de cálculo
function validateMetaRows(rawRows, game) {
  const g = GAMES[game];
  const report = { game, errors: [], rows: [], canSave: false, summary: {}, grid: null };
  if (!g) { report.errors.push('Juego no válido'); return report; }
  if (!g.available || g.factions.length === 0) {
    report.errors.push('Este juego todavía no tiene facciones configuradas');
    return report;
  }

  const all = Array.isArray(rawRows) ? rawRows : [];
  if (all.length === 0) { report.errors.push('El archivo está vacío'); return report; }
  const header = (all[0] || []).map((h) => String(h ?? '').trim().toLowerCase());
  if (header.slice(0, HEADER.length).join(',') !== HEADER.join(',')) {
    report.errors.push(`La cabecera de la primera hoja debe ser: ${HEADER.join(' | ')}`);
    return report;
  }

  const byName = new Map(g.factions.map((f) => [key(f), f]));
  const seen = new Set();
  all.slice(1).forEach((cells, idx) => {
    // Filas completamente vacías (habituales en Excel) se ignoran
    if (!cells || cells.every((c) => isBlank(c))) return;
    const row = { line: idx + 2, faction: null, rival: null, win_rate: null, avg_diff: null, games: null, status: 'ok', message: '' };
    const fail = (msg) => { row.status = 'error'; row.message = msg; };
    const [f, r, wr, ad, gm] = cells;

    const faction = byName.get(key(f));
    const rival = byName.get(key(r));
    row.faction = faction ?? String(f ?? '');
    row.rival = rival ?? String(r ?? '');

    if (!faction) fail(`Facción desconocida: "${f ?? ''}"`);
    else if (!rival) fail(`Rival desconocido: "${r ?? ''}"`);
    else if (seen.has(`${faction}|${rival}`)) fail('Par facción-rival repetido');

    if (row.status !== 'error') {
      const a = parseNumber(wr, { min: 0, max: 100 });
      const b = parseNumber(ad, { min: -1000, max: 1000 });
      const c = parseNumber(gm, { min: 0, integer: true });
      const errs = [a, b, c].filter((x) => x.error).map((x) => x.error);
      if (errs.length) fail(errs.join('; '));
      else {
        row.win_rate = a.value;
        row.avg_diff = b.value;
        row.games = c.value;
        const missing = [];
        if (a.missing) missing.push('win_rate');
        if (b.missing) missing.push('avg_diff');
        if (c.missing) missing.push('games');
        if (missing.length) { row.status = 'missing'; row.message = `Sin dato: ${missing.join(', ')}`; }
      }
    }
    if (row.faction && row.rival && row.status !== 'error') seen.add(`${row.faction}|${row.rival}`);
    report.rows.push(row);
  });

  // Cuadrícula completa: cada facción frente a cada rival. Lo que no aparece se muestra como "-".
  const factions = [...g.factions].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const lookup = new Map(report.rows.filter((x) => x.status !== 'error').map((x) => [`${x.faction}|${x.rival}`, x]));
  let absent = 0;
  const cells = factions.map((f) => factions.map((r) => {
    if (f === r) return { value: '—', status: 'na' };
    const row = lookup.get(`${f}|${r}`);
    if (!row) { absent++; return { value: '-', status: 'missing' }; }
    if (row.avg_diff === null) return { value: '-', status: 'missing' };
    return { value: row.avg_diff, status: 'ok' };
  }));
  report.grid = { factions, cells };

  const counts = { ok: 0, missing: 0, error: 0 };
  report.rows.forEach((x) => { counts[x.status]++; });
  report.summary = { ...counts, pairsExpected: factions.length * (factions.length - 1), pairsAbsent: absent };
  report.canSave = report.errors.length === 0 && counts.error === 0 && report.rows.length > 0;
  return report;
}

module.exports = { validateMetaRows, HEADER, parseNumber };
