const express = require('express');
const { pool } = require('../db');
const { parseId } = require('../auth');
const { GAMES, DISPOSITIONS, MIN_PLAYERS, MAX_PLAYERS } = require('../config');
const { validateTournamentInput, validateState } = require('../validate');
const { replaceState } = require('../store');
const { isBcpEventUrl } = require('../validate');
const { fetchEvent, BcpError } = require('../bcp/fetch');
const { sanitizeBcpEvent } = require('../validate');
const { buildFromImport, summarize } = require('../bcp/normalize');

// Montado en /api/tournaments con requireAuth. Cada usuario solo accede a sus torneos.
const router = express.Router();

const summary = (t) => ({
  id: t.id,
  title: t.name,
  teamName: t.team_name,
  game: t.game,
  gameLabel: GAMES[t.game]?.label ?? t.game,
  playersPerTeam: t.players_per_team,
  matrixCount: t.matrix_count,
  createdAt: t.created_at,
});

async function ownTournament(id, userId) {
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1 AND owner_id = $2', [id, userId]);
  return rows[0] ?? null;
}

// ---------- Catálogo ----------

router.get('/meta', (req, res) => {
  res.json({
    games: Object.entries(GAMES).map(([key, g]) => ({ key, label: g.label, available: g.available, factions: g.factions })),
    dispositions: DISPOSITIONS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  });
});

// ---------- Torneos ----------

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM matrices m WHERE m.tournament_id = t.id) AS matrix_count
     FROM tournaments t WHERE t.owner_id = $1 ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json({ tournaments: rows.map(summary) });
});

router.post('/', async (req, res) => {
  const v = validateTournamentInput(req.body ?? {});
  if (v.error) return res.status(400).json({ error: v.error });
  const { name, teamName, game, playersPerTeam, link } = v.value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tournaments (owner_id, name, team_name, game, setup_mode, link, players_per_team)
       VALUES ($1, $2, $3, $4, 'manual', $5, $6) RETURNING id`,
      [req.user.id, name, teamName, game, link, playersPerTeam]
    );
    await client.query(
      `INSERT INTO tournament_players (tournament_id, slot)
       SELECT $1, generate_series(0, $2::int - 1)`,
      [rows[0].id, playersPerTeam]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Estado completo del torneo: jugadores propios y todas sus matrices
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const t = await ownTournament(id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

  const n = t.players_per_team;
  const [players, matrices] = await Promise.all([
    pool.query('SELECT slot, name, faction, disposition FROM tournament_players WHERE tournament_id = $1', [id]),
    pool.query('SELECT id, position, rival_name FROM matrices WHERE tournament_id = $1 ORDER BY position', [id]),
  ]);

  const mids = matrices.rows.map((m) => m.id);
  const empty = { rows: [] };
  const [rivals, rowFlags, cells, mapFlags] = mids.length
    ? await Promise.all([
        pool.query('SELECT matrix_id, slot, name, faction, disposition, hidden, list_text, list_url FROM matrix_rivals WHERE matrix_id = ANY($1::int[])', [mids]),
        pool.query('SELECT matrix_id, slot, hidden FROM matrix_rows WHERE matrix_id = ANY($1::int[])', [mids]),
        pool.query('SELECT matrix_id, row_slot, col_slot, score FROM matrix_cells WHERE matrix_id = ANY($1::int[])', [mids]),
        pool.query('SELECT matrix_id, row_slot, col_slot FROM matrix_map_flags WHERE matrix_id = ANY($1::int[])', [mids]),
      ])
    : [empty, empty, empty, empty];

  const slotList = Array.from({ length: n }, (_, s) => s);
  const own = slotList.map((s) => {
    const p = players.rows.find((r) => r.slot === s);
    return { name: p?.name ?? '', faction: p?.faction ?? '', disposition: p?.disposition ?? '' };
  });

  const out = matrices.rows.map((m) => {
    const rv = rivals.rows.filter((r) => r.matrix_id === m.id);
    const rw = rowFlags.rows.filter((r) => r.matrix_id === m.id);
    const cl = cells.rows.filter((c) => c.matrix_id === m.id);
    const mf = mapFlags.rows.filter((f) => f.matrix_id === m.id);

    const grid = slotList.map(() => Array(n).fill(null));
    cl.forEach((c) => { grid[c.row_slot][c.col_slot] = c.score; });
    const mapGrid = slotList.map(() => Array(n).fill(false));
    mf.forEach((f) => { mapGrid[f.row_slot][f.col_slot] = true; });

    return {
      id: m.id,
      rivalName: m.rival_name,
      rivals: slotList.map((s) => {
        const r = rv.find((x) => x.slot === s);
        return { name: r?.name ?? '', faction: r?.faction ?? '', disposition: r?.disposition ?? '', listText: r?.list_text ?? '', listUrl: r?.list_url ?? null };
      }),
      hiddenCols: slotList.map((s) => rv.find((x) => x.slot === s)?.hidden ?? false),
      hiddenRows: slotList.map((s) => rw.find((x) => x.slot === s)?.hidden ?? false),
      cells: grid,
      mapCells: mapGrid,
    };
  });

  res.json({
    id: t.id,
    title: t.name,
    teamName: t.team_name,
    game: t.game,
    gameLabel: GAMES[t.game]?.label ?? t.game,
    playersPerTeam: n,
    own,
    matrices: out,
  });
});

// Guarda el estado completo (la pantalla envía todo cada vez que hay cambios)
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const t = await ownTournament(id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

  const v = validateState(req.body ?? {}, t.game);
  if (v.error) return res.status(400).json({ error: v.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceState(client, id, v.value);
    await client.query('COMMIT');
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---------- Importación desde Best Coast Pairings ----------

const BCP_LINK_ERROR = 'El enlace debe ser de un evento de Best Coast Pairings (https://www.bestcoastpairings.com/event/...)';

// Paso 1: leer el evento y devolver sus equipos para que el usuario elija el suyo
router.post('/bcp/preview', async (req, res) => {
  const link = String(req.body?.link ?? '').trim();
  if (!isBcpEventUrl(link)) return res.status(400).json({ error: BCP_LINK_ERROR });
  try {
    const data = await fetchEvent(link);
    // Se devuelven también los datos completos: la importación no tiene que volver a leer BCP
    res.json({ ...summarize(data), event: { title: data.title, teams: data.teams } });
  } catch (err) {
    if (err instanceof BcpError) return res.status(err.status).json({ error: err.message, details: err.details });
    throw err;
  }
});

// Paso 2: crear el torneo con las matrices generadas a partir del equipo elegido
router.post('/bcp/import', async (req, res) => {
  const link = String(req.body?.link ?? '').trim();
  const teamName = String(req.body?.teamName ?? '').trim();
  if (!isBcpEventUrl(link)) return res.status(400).json({ error: BCP_LINK_ERROR });
  if (!teamName || teamName.length > 80) return res.status(400).json({ error: 'Elige tu equipo' });

  // Si el cliente envía los datos leídos al validar, se usan (sin abrir el navegador)
  let data = req.body?.event ? sanitizeBcpEvent(req.body.event) : null;
  if (req.body?.event && !data) {
    return res.status(400).json({ error: 'Los datos del evento no son válidos. Vuelve a leer el evento.' });
  }
  if (!data) {
    try {
      data = await fetchEvent(link);
    } catch (err) {
      if (err instanceof BcpError) return res.status(err.status).json({ error: err.message, details: err.details });
      throw err;
    }
  }

  const built = buildFromImport(data, teamName, '40k');
  if (built.error) return res.status(400).json({ error: built.error });
  const check = validateState(built.value, '40k');
  if (check.error) return res.status(400).json({ error: check.error });
  const v = check.value;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tournaments (owner_id, name, team_name, game, setup_mode, link, players_per_team)
       VALUES ($1, $2, $3, '40k', 'bcp', $4, $5) RETURNING id`,
      [req.user.id, v.title, v.teamName, link, v.playersPerTeam]
    );
    await replaceState(client, rows[0].id, v);
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id, warnings: built.warnings });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const { rowCount } = await pool.query('DELETE FROM tournaments WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Torneo no encontrado' });
  res.status(204).end();
});

module.exports = router;
