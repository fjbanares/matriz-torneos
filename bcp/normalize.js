// Convierte los datos de un evento de BCP en el estado interno de un torneo y genera las matrices.
// No hace peticiones de red: recibe datos ya leídos por bcp/fetch.js.
//
// Formato de entrada (contrato del lector de BCP):
//   { title: string, teams: [ { name: string, players: [ { name, army, disposition } ] } ] }

const { GAMES, DISPOSITIONS, MIN_PLAYERS, MAX_PLAYERS } = require('../config');

const norm = (s) => String(s ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’`]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// Nombres alternativos con los que pueden aparecer los ejércitos (sin tildes ni mayúsculas)
const FACTION_ALIASES = {
  'eldar': 'Aeldari',
  'dark eldar': 'Drukhari',
  'tau': 'T’au Empire',
  'tau empire': 'T’au Empire',
  'emperors children': 'Emperor’s Children',
  'sisters of battle': 'Adepta Sororitas',
  'imperial guard': 'Astra Militarum',
  'chaos marines': 'Chaos Space Marines',
  'squats': 'Leagues of Votann',
};

function mapFaction(army, game = '40k') {
  const catalog = GAMES[game]?.factions ?? [];
  const n = norm(army);
  if (!n) return null;
  const exact = catalog.find((f) => norm(f) === n);
  if (exact) return exact;
  const alias = FACTION_ALIASES[n];
  return alias && catalog.includes(alias) ? alias : null;
}

function mapDisposition(label) {
  const n = norm(label);
  if (!n) return null;
  const d = DISPOSITIONS.find((x) => norm(x.label) === n || norm(x.key) === n);
  return d ? d.key : null;
}

// Resumen para la pantalla de selección de equipo
function summarize(data) {
  return {
    title: data.title || 'Torneo importado',
    teams: data.teams.map((t) => ({ name: t.name, playerCount: t.players.length })),
  };
}

// Construye el estado del torneo: el equipo del usuario contra cada equipo rival.
// Regla: una matriz por cada equipo rival; filas = jugadores propios; columnas = jugadores del rival.
function buildFromImport(data, ownTeamName, game = '40k') {
  const warnings = [];
  if (!data || !Array.isArray(data.teams) || data.teams.length < 2) {
    return { error: 'El evento de BCP no tiene suficientes equipos para generar matrices' };
  }

  const own = data.teams.find((t) => norm(t.name) === norm(ownTeamName));
  if (!own) return { error: 'No se encuentra tu equipo en el evento' };

  const n = own.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    return { error: `Tu equipo tiene ${n} jugadores. El sistema admite entre ${MIN_PLAYERS} y ${MAX_PLAYERS}.` };
  }

  const blank = () => ({ name: '', faction: '', disposition: '' });
  const toSlot = (p, team) => {
    const faction = mapFaction(p.army, game);
    if (p.army && !faction) warnings.push(`Ejército no reconocido en ${team}: "${p.army}" (${p.name})`);
    const disposition = mapDisposition(p.disposition);
    if (p.disposition && !disposition) warnings.push(`Disposición no reconocida en ${team}: "${p.disposition}" (${p.name})`);
    return { name: String(p.name ?? '').trim().slice(0, 60), faction: faction ?? '', disposition: disposition ?? '' };
  };

  const ownSlots = own.players.map((p) => toSlot(p, own.name));

  const rivals = data.teams.filter((t) => t !== own);
  const matrices = rivals.map((team) => {
    if (team.players.length !== n) {
      warnings.push(`${team.name} tiene ${team.players.length} jugadores (tu equipo tiene ${n})`);
    }
    const cols = team.players.slice(0, n).map((p) => ({ ...toSlot(p, team.name), listUrl: p.listUrl ?? null }));
    while (cols.length < n) cols.push({ ...blank(), listUrl: null });
    return {
      rivalName: String(team.name).slice(0, 60),
      rivals: cols,
      hiddenCols: Array(n).fill(false),
      hiddenRows: Array(n).fill(false),
      cells: Array.from({ length: n }, () => Array(n).fill(null)),
    };
  });

  return {
    value: {
      title: String(data.title || 'Torneo importado').slice(0, 80),
      teamName: String(own.name).slice(0, 80),
      playersPerTeam: n,
      own: ownSlots,
      matrices,
    },
    warnings,
  };
}

module.exports = { buildFromImport, summarize, mapFaction, mapDisposition, norm };
