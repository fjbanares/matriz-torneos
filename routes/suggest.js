const express = require('express');
const { pool } = require('../db');
const { GAMES } = require('../config');
const { norm } = require('../bcp/normalize');
const { scoreFromAvgDiff } = require('../meta/scale');

// Montado en /api/suggest con requireAuth. Lee los datos que carga el administrador.
const router = express.Router();

// Valor sugerido 1-7 para cada rival de la matriz, según la diferencia media precargada
router.post('/matchups', async (req, res) => {
  const game = String(req.body?.game ?? '40k');
  const faction = String(req.body?.faction ?? '').trim();
  const rivals = Array.isArray(req.body?.rivals) ? req.body.rivals.map((r) => String(r).trim()).filter(Boolean) : [];

  const catalog = GAMES[game]?.factions ?? [];
  if (!catalog.includes(faction)) return res.status(400).json({ error: 'Elige un ejército de la lista' });
  if (rivals.length === 0 || rivals.length > 8 || rivals.some((r) => !catalog.includes(r))) {
    return res.status(400).json({ error: 'Los rivales deben ser ejércitos de la lista' });
  }

  const { rows } = await pool.query(
    'SELECT rival, win_rate, avg_diff, games, updated_at FROM meta_matchups WHERE game = $1 AND faction = $2',
    [game, faction]
  );
  const results = {};
  for (const rival of rivals) {
    const row = rows.find((r) => norm(r.rival) === norm(rival));
    if (!row) {
      results[rival] = { score: null, reason: '-' };
    } else if (row.avg_diff === null) {
      results[rival] = { score: null, winRate: row.win_rate, games: row.games, reason: '-' };
    } else {
      const avgDiff = Number(row.avg_diff);
      results[rival] = { score: scoreFromAvgDiff(avgDiff), avgDiff, winRate: row.win_rate === null ? null : Number(row.win_rate), games: row.games };
    }
  }
  const updatedAt = rows.length ? rows.reduce((a, b) => (new Date(b.updated_at) > new Date(a) ? b.updated_at : a), rows[0].updated_at) : null;
  res.json({ faction, dataslate: updatedAt ? `Datos cargados el ${new Date(updatedAt).toLocaleDateString('es-ES')}` : 'Sin datos cargados', results });
});

module.exports = router;
