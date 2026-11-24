// Validación de todo lo que llega del cliente. Nada se guarda sin pasar por aquí.
const { GAMES, DISPOSITIONS, MIN_PLAYERS, MAX_PLAYERS } = require('./config');

const DISP_KEYS = new Set(DISPOSITIONS.map((d) => d.key));
const MAX_MATRICES = 30;

const str = (v) => String(v ?? '').trim();
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const boolArray = (a, n) =>
  Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'boolean') ? a : null;

// Enlace a la lista de un jugador en BCP: https://www.bestcoastpairings.com/list/<id>
function isBcpListUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /(^|\.)bestcoastpairings\.com$/i.test(u.hostname) && /^\/list\/[A-Za-z0-9-]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Un hueco de jugador (propio o rival). Nombre, ejército y disposición pueden estar vacíos
// mientras el usuario rellena la matriz, pero si tienen valor deben ser válidos.
function validateSlot(p, factions) {
  if (!p || typeof p !== 'object') return { error: 'Datos de jugador no válidos' };
  const name = str(p.name);
  const faction = str(p.faction);
  const disposition = str(p.disposition);
  if (name.length > 60) return { error: 'Los nombres pueden tener hasta 60 caracteres' };
  if (faction && !factions.has(faction)) return { error: 'Ejército no válido' };
  if (disposition && !DISP_KEYS.has(disposition)) return { error: 'Disposición no válida' };
  return { value: { name, faction, disposition } };
}

// Alta de torneo (desde el diálogo "Nuevo torneo")
function validateTournamentInput(body = {}) {
  const name = str(body.name);
  const teamName = str(body.teamName);
  const game = str(body.gameType);
  const mode = str(body.setupMode);
  const link = str(body.link);

  if (!GAMES[game] || !GAMES[game].available) return { error: 'Elige un tipo de juego disponible' };
  if (mode !== 'manual') return { error: 'Importar desde Best Coast Pairings estará disponible próximamente' };
  if (!name || name.length > 80) return { error: 'El nombre del torneo debe tener entre 1 y 80 caracteres' };
  if (!teamName || teamName.length > 80) return { error: 'Indica el nombre de tu equipo (1 a 80 caracteres)' };

  const playersPerTeam = Number(body.playersPerTeam);
  if (!isInt(playersPerTeam, MIN_PLAYERS, MAX_PLAYERS)) {
    return { error: `Indica entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores por equipo` };
  }
  if (link && (link.length > 300 || !isHttpUrl(link))) return { error: 'El enlace no es válido' };

  return { value: { name, teamName, game, playersPerTeam, link: link || null } };
}

// Estado completo de un torneo (lo que envía la pantalla al guardar)
function validateState(body, game) {
  const g = GAMES[game];
  if (!g) return { error: 'Juego no válido' };

  const title = str(body.title);
  const teamName = str(body.teamName);
  if (!title || title.length > 80) return { error: 'El nombre del torneo debe tener entre 1 y 80 caracteres' };
  if (!teamName || teamName.length > 80) return { error: 'Indica el nombre de tu equipo' };

  const n = Number(body.playersPerTeam);
  if (!isInt(n, MIN_PLAYERS, MAX_PLAYERS)) {
    return { error: `Jugadores por equipo: entre ${MIN_PLAYERS} y ${MAX_PLAYERS}` };
  }

  const factions = new Set(g.factions);

  if (!Array.isArray(body.own) || body.own.length !== n) {
    return { error: 'La lista de tus jugadores no coincide con el tamaño de la matriz' };
  }
  const own = [];
  for (const p of body.own) {
    const r = validateSlot(p, factions);
    if (r.error) return r;
    own.push(r.value);
  }

  if (!Array.isArray(body.matrices) || body.matrices.length > MAX_MATRICES) {
    return { error: 'Número de matrices no válido' };
  }
  const matrices = [];
  for (const m of body.matrices) {
    if (!m || typeof m !== 'object') return { error: 'Matriz no válida' };
    const rivalName = str(m.rivalName);
    if (rivalName.length > 60) return { error: 'El nombre del rival puede tener hasta 60 caracteres' };

    if (!Array.isArray(m.rivals) || m.rivals.length !== n) {
      return { error: 'Las columnas de rivales no coinciden con el tamaño de la matriz' };
    }
    const rivals = [];
    for (const r of m.rivals) {
      const x = validateSlot(r, factions);
      if (x.error) return x;
      // Lista del rival: texto pegado a mano (opcional) y enlace a BCP (opcional)
      const listText = typeof r.listText === 'string' ? r.listText : '';
      if (listText.length > 20000) return { error: 'La lista de un rival puede tener hasta 20.000 caracteres' };
      const listUrl = r.listUrl ? String(r.listUrl) : null;
      if (listUrl && !isBcpListUrl(listUrl)) return { error: 'El enlace de la lista no es de Best Coast Pairings' };
      rivals.push({ ...x.value, listText, listUrl });
    }

    const hiddenCols = boolArray(m.hiddenCols, n);
    const hiddenRows = boolArray(m.hiddenRows, n);
    if (!hiddenCols || !hiddenRows) return { error: 'Filas o columnas ocultas no válidas' };

    const cells = m.cells;
    if (!Array.isArray(cells) || cells.length !== n || cells.some((row) => !Array.isArray(row) || row.length !== n)) {
      return { error: 'La cuadrícula de valoraciones no coincide con el tamaño de la matriz' };
    }
    for (const row of cells) {
      for (const c of row) {
        if (c !== null && !isInt(c, 1, 7)) return { error: 'Las valoraciones van del 1 al 7' };
      }
    }

    // Marca "elige mapa" por casilla. Si no viene, ninguna casilla está marcada.
    let mapCells = m.mapCells;
    if (mapCells === undefined) {
      mapCells = Array.from({ length: n }, () => Array(n).fill(false));
    } else if (!Array.isArray(mapCells) || mapCells.length !== n ||
      mapCells.some((row) => !Array.isArray(row) || row.length !== n || row.some((x) => typeof x !== 'boolean'))) {
      return { error: 'La marca de elección de mapa no coincide con el tamaño de la matriz' };
    }

    matrices.push({ rivalName, rivals, hiddenCols, hiddenRows, cells, mapCells });
  }

  return { value: { title, teamName, playersPerTeam: n, own, matrices } };
}

// Enlace de un evento de Best Coast Pairings: https://www.bestcoastpairings.com/event/<id>
function isBcpEventUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /(^|\.)bestcoastpairings\.com$/i.test(u.hostname) && /^\/event\/[A-Za-z0-9]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

module.exports = { validateTournamentInput, validateState, isHttpUrl, isBcpEventUrl, isBcpListUrl };
