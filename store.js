const { pool } = require('./db');

// Sustituye por completo el estado de un torneo (dentro de una transacción).
// Usa arrays (unnest) para insertar cada bloque en una sola sentencia.
async function replaceState(c, tid, v) {
  await c.query(
    'UPDATE tournaments SET name = $2, team_name = $3, players_per_team = $4, updated_at = now() WHERE id = $1',
    [tid, v.title, v.teamName, v.playersPerTeam]
  );
  // Borrar matrices y jugadores arrastra en cascada rivales, filas y celdas
  await c.query('DELETE FROM matrices WHERE tournament_id = $1', [tid]);
  await c.query('DELETE FROM tournament_players WHERE tournament_id = $1', [tid]);

  const slots = v.own.map((_, s) => s);
  await c.query(
    `INSERT INTO tournament_players (tournament_id, slot, name, faction, disposition)
     SELECT $1, x.s, x.n, x.f, x.d FROM unnest($2::smallint[], $3::text[], $4::text[], $5::text[]) AS x(s, n, f, d)`,
    [tid, slots, v.own.map((p) => p.name), v.own.map((p) => p.faction), v.own.map((p) => p.disposition)]
  );

  for (let pos = 0; pos < v.matrices.length; pos++) {
    const m = v.matrices[pos];
    const { rows } = await c.query(
      'INSERT INTO matrices (tournament_id, position, rival_name) VALUES ($1, $2, $3) RETURNING id',
      [tid, pos, m.rivalName]
    );
    const mid = rows[0].id;

    await c.query(
      `INSERT INTO matrix_rivals (matrix_id, slot, name, faction, disposition, hidden, list_text, list_url)
       SELECT $1, x.s, x.n, x.f, x.d, x.h, x.t, x.u
       FROM unnest($2::smallint[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[]) AS x(s, n, f, d, h, t, u)`,
      [mid, slots, m.rivals.map((r) => r.name), m.rivals.map((r) => r.faction), m.rivals.map((r) => r.disposition), m.hiddenCols,
       m.rivals.map((r) => r.listText ?? ''), m.rivals.map((r) => r.listUrl ?? null)]
    );
    await c.query(
      `INSERT INTO matrix_rows (matrix_id, slot, hidden)
       SELECT $1, x.s, x.h FROM unnest($2::smallint[], $3::boolean[]) AS x(s, h)`,
      [mid, slots, m.hiddenRows]
    );

    const rowSlots = [];
    const colSlots = [];
    const scores = [];
    m.cells.forEach((row, i) => row.forEach((val, j) => {
      if (val !== null) { rowSlots.push(i); colSlots.push(j); scores.push(val); }
    }));
    const mapRows = [];
    const mapCols = [];
    m.mapCells.forEach((row, i) => row.forEach((flag, j) => {
      if (flag) { mapRows.push(i); mapCols.push(j); }
    }));
    if (mapRows.length) {
      await c.query(
        `INSERT INTO matrix_map_flags (matrix_id, row_slot, col_slot)
         SELECT $1, x.r, x.c FROM unnest($2::smallint[], $3::smallint[]) AS x(r, c)`,
        [mid, mapRows, mapCols]
      );
    }
    if (scores.length) {
      await c.query(
        `INSERT INTO matrix_cells (matrix_id, row_slot, col_slot, score)
         SELECT $1, x.r, x.c, x.s FROM unnest($2::smallint[], $3::smallint[], $4::smallint[]) AS x(r, c, s)`,
        [mid, rowSlots, colSlots, scores]
      );
    }
  }
}


module.exports = { replaceState };
