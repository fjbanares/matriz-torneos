const express = require('express');
const { pool } = require('../db');
const { parseId } = require('../auth');
const { GAMES, DISPOSITIONS, MAX_PLAYERS } = require('../config');

// Montado en /api/tournaments con requireAuth.
// Cada usuario solo ve y gestiona sus propios torneos.
const router = express.Router();

const str = (v) => String(v ?? '').trim();

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function isBcpUrl(value) {
  if (!isHttpUrl(value)) return false;
  return /(^|\.)bestcoastpairings\.com$/i.test(new URL(value).hostname);
}

const publicTournament = (t) => ({
  id: t.id,
  name: t.name,
  game: t.game,
  gameLabel: GAMES[t.game]?.label ?? t.game,
  teamName: t.team_name,
  link: t.link,
  setupMode: t.setup_mode,
  playersPerTeam: t.players_per_team,
  createdAt: t.created_at,
});

// Devuelve el torneo solo si pertenece al usuario actual
async function ownTournament(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM tournaments WHERE id = $1 AND owner_id = $2',
    [id, userId]
  );
  return rows[0] ?? null;
}

// Devuelve la matriz solo si su torneo pertenece al usuario actual
async function ownMatrix(matrixId, userId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.kind, t.id AS tournament_id, t.game, t.players_per_team
     FROM matrices m JOIN tournaments t ON t.id = m.tournament_id
     WHERE m.id = $1 AND t.owner_id = $2`,
    [matrixId, userId]
  );
  return rows[0] ?? null;
}

// Devuelve el jugador solo si su torneo pertenece al usuario actual
async function ownPlayer(playerId, userId) {
  const { rows } = await pool.query(
    `SELECT mp.id, m.id AS matrix_id
     FROM matrix_players mp
     JOIN matrices m ON m.id = mp.matrix_id
     JOIN tournaments t ON t.id = m.tournament_id
     WHERE mp.id = $1 AND t.owner_id = $2`,
    [playerId, userId]
  );
  return rows[0] ?? null;
}

async function countPlayers(matrixId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM matrix_players WHERE matrix_id = $1',
    [matrixId]
  );
  return rows[0].n;
}

// ---------- Catálogos ----------

router.get('/meta', (req, res) => {
  res.json({
    games: Object.entries(GAMES).map(([key, g]) => ({
      key,
      label: g.label,
      available: g.available,
      factions: g.factions,
    })),
    dispositions: DISPOSITIONS,
    maxPlayers: MAX_PLAYERS,
  });
});

// ---------- Torneos ----------

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM tournaments WHERE owner_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ tournaments: rows.map(publicTournament) });
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const name = str(body.name);
  const teamName = str(body.teamName);
  const link = str(body.link);
  const gameType = str(body.gameType);
  const setupMode = str(body.setupMode);

  const game = GAMES[gameType];
  if (!game || !game.available) {
    return res.status(400).json({ error: 'Elige un tipo de juego disponible' });
  }
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'El nombre del torneo debe tener entre 1 y 80 caracteres' });
  }
  if (!teamName || teamName.length > 80) {
    return res.status(400).json({ error: 'Indica el nombre de tu equipo (1 a 80 caracteres)' });
  }

  let playersPerTeam = null;
  if (setupMode === 'bcp') {
    if (!isBcpUrl(link)) {
      return res.status(400).json({ error: 'Introduce un enlace válido de Best Coast Pairings' });
    }
  } else if (setupMode === 'manual') {
    if (link && (!isHttpUrl(link) || link.length > 300)) {
      return res.status(400).json({ error: 'El enlace no es válido' });
    }
    playersPerTeam = Number(body.playersPerTeam);
    if (!Number.isInteger(playersPerTeam) || playersPerTeam < 1 || playersPerTeam > MAX_PLAYERS) {
      return res.status(400).json({ error: `Indica entre 1 y ${MAX_PLAYERS} jugadores por equipo` });
    }
  } else {
    return res.status(400).json({ error: 'Elige cómo preparar el torneo' });
  }

  // Torneo y matriz propia en una sola transacción
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tournaments (owner_id, name, game, team_name, link, setup_mode, players_per_team)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, name, gameType, teamName, link || null, setupMode, playersPerTeam]
    );
    if (setupMode === 'manual') {
      await client.query(`INSERT INTO matrices (tournament_id, kind) VALUES ($1, 'own')`, [rows[0].id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ tournament: publicTournament(rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Detalle: torneo, tu equipo (compartido) y las matrices de rivales
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const tournament = await ownTournament(id, req.user.id);
  if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

  const { rows: matrices } = await pool.query(
    'SELECT id, kind, rival_name FROM matrices WHERE tournament_id = $1 ORDER BY id',
    [id]
  );
  const { rows: players } = await pool.query(
    `SELECT mp.id, mp.matrix_id, mp.name, mp.faction
     FROM matrix_players mp JOIN matrices m ON m.id = mp.matrix_id
     WHERE m.tournament_id = $1 ORDER BY mp.id`,
    [id]
  );

  const playersOf = (matrixId) =>
    players
      .filter((p) => p.matrix_id === matrixId)
      .map((p) => ({ id: p.id, name: p.name, faction: p.faction }));

  const own = matrices.find((m) => m.kind === 'own');
  res.json({
    tournament: publicTournament(tournament),
    ownMatrixId: own?.id ?? null,
    ownPlayers: own ? playersOf(own.id) : [],
    rivalMatrices: matrices
      .filter((m) => m.kind === 'rival')
      .map((m) => ({ id: m.id, rivalName: m.rival_name, players: playersOf(m.id) })),
  });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const { rowCount } = await pool.query(
    'DELETE FROM tournaments WHERE id = $1 AND owner_id = $2',
    [id, req.user.id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Torneo no encontrado' });
  res.status(204).end();
});

// ---------- Matrices de rivales ----------

router.post('/:id/rival-matrices', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const tournament = await ownTournament(id, req.user.id);
  if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });
  if (tournament.setup_mode !== 'manual') {
    return res.status(400).json({ error: 'Las matrices de rivales se crean a mano en torneos sin BCP' });
  }

  const rivalName = str(req.body?.rivalName);
  if (!rivalName || rivalName.length > 80) {
    return res.status(400).json({ error: 'El nombre del equipo rival debe tener entre 1 y 80 caracteres' });
  }

  const { rows } = await pool.query(
    `INSERT INTO matrices (tournament_id, kind, rival_name) VALUES ($1, 'rival', $2) RETURNING id, rival_name`,
    [id, rivalName]
  );
  res.status(201).json({ matrix: { id: rows[0].id, rivalName: rows[0].rival_name, players: [] } });
});

router.delete('/matrices/:matrixId', async (req, res) => {
  const matrixId = parseId(req.params.matrixId);
  if (!matrixId) return res.status(400).json({ error: 'Identificador no válido' });

  const matrix = await ownMatrix(matrixId, req.user.id);
  if (!matrix) return res.status(404).json({ error: 'Matriz no encontrada' });
  if (matrix.kind === 'own') {
    return res.status(400).json({ error: 'La matriz de tu equipo no se puede eliminar' });
  }

  await pool.query('DELETE FROM matrices WHERE id = $1', [matrixId]);
  res.status(204).end();
});

// ---------- Jugadores ----------

router.post('/matrices/:matrixId/players', async (req, res) => {
  const matrixId = parseId(req.params.matrixId);
  if (!matrixId) return res.status(400).json({ error: 'Identificador no válido' });

  const matrix = await ownMatrix(matrixId, req.user.id);
  if (!matrix) return res.status(404).json({ error: 'Matriz no encontrada' });

  const name = str(req.body?.name);
  const faction = str(req.body?.faction);
  if (!name || name.length > 60) {
    return res.status(400).json({ error: 'El nombre del jugador debe tener entre 1 y 60 caracteres' });
  }
  const validFactions = GAMES[matrix.game]?.factions ?? [];
  if (!validFactions.includes(faction)) {
    return res.status(400).json({ error: 'Elige una facción de la lista' });
  }
  if ((await countPlayers(matrixId)) >= matrix.players_per_team) {
    return res.status(400).json({ error: `Este equipo ya tiene ${matrix.players_per_team} jugadores` });
  }

  const { rows } = await pool.query(
    'INSERT INTO matrix_players (matrix_id, name, faction) VALUES ($1, $2, $3) RETURNING id, name, faction',
    [matrixId, name, faction]
  );
  res.status(201).json({ player: rows[0] });
});

router.delete('/players/:playerId', async (req, res) => {
  const playerId = parseId(req.params.playerId);
  if (!playerId) return res.status(400).json({ error: 'Identificador no válido' });

  const player = await ownPlayer(playerId, req.user.id);
  if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

  await pool.query('DELETE FROM matrix_players WHERE id = $1', [playerId]);
  res.status(204).end();
});

module.exports = router;
