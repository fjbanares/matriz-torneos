const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { USERNAME_RE, generateTempPassword, parseId } = require('../auth');
const { validateMetaRows, HEADER } = require('../meta/validate');
const { GAMES } = require('../config');

// Montado en /api/admin con requireAuth + requireSuperAdmin
const router = express.Router();

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.role, u.must_change_password, u.created_at,
           COUNT(t.id)::int AS tournament_count
    FROM users u
    LEFT JOIN tournaments t ON t.owner_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at
  `);
  res.json({ users: rows });
});

// Crea un usuario con contraseña temporal. La contraseña se devuelve UNA vez.
router.post('/users', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo',
    });
  }

  const temporaryPassword = generateTempPassword();
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, must_change_password)
       VALUES ($1, $2, true)
       RETURNING id, username, role, must_change_password, created_at`,
      [username, await bcrypt.hash(temporaryPassword, 12)]
    );
    res.status(201).json({ user: rows[0], temporaryPassword });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    }
    throw err;
  }
});

// Restablece la contraseña de un usuario normal y cierra sus sesiones
router.post('/users/:id/reset-password', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const temporaryPassword = generateTempPassword();
  const { rows } = await pool.query(
    `UPDATE users
     SET password_hash = $1, must_change_password = true, token_version = token_version + 1
     WHERE id = $2 AND role = 'user'
     RETURNING username`,
    [await bcrypt.hash(temporaryPassword, 12), id]
  );

  if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ username: rows[0].username, temporaryPassword });
});

// Elimina un usuario y, por ON DELETE CASCADE, también sus torneos
router.delete('/users/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  const { rowCount } = await pool.query(
    `DELETE FROM users WHERE id = $1 AND role = 'user'`,
    [id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.status(204).end();
});

// ---------- Datos de meta (precargados por el administrador, en Excel) ----------

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB

// Lee la primera hoja de un Excel (.xls o .xlsx, enviado en base64) y devuelve sus filas
function readExcelRows(base64) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    const err = new Error('La lectura de Excel no está instalada en el servidor (falta la dependencia "xlsx").');
    err.status = 500;
    throw err;
  }
  if (typeof base64 !== 'string' || base64.length === 0) {
    const err = new Error('Sube un archivo Excel (.xls o .xlsx).');
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_FILE_BYTES) {
    const err = new Error('El archivo supera 1 MB.');
    err.status = 413;
    throw err;
  }
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    const err = new Error('No se pudo leer el archivo. Asegúrate de que es un Excel (.xls o .xlsx).');
    err.status = 400;
    throw err;
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
}

// Valida el Excel sin guardar nada
router.post('/meta/:game/validate', (req, res) => {
  try {
    const rows = readExcelRows(req.body?.file);
    res.json(validateMetaRows(rows, req.params.game));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Valida y guarda (reemplaza los datos del juego). Solo si no hay errores.
router.post('/meta/:game', async (req, res) => {
  const game = req.params.game;
  let report;
  try {
    report = validateMetaRows(readExcelRows(req.body?.file), game);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  if (!report.canSave) {
    return res.status(400).json({ error: 'El archivo tiene errores. Corrígelos antes de guardar.', report });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM meta_matchups WHERE game = $1', [game]);
    const saved = report.rows.filter((r) => r.status !== 'error');
    if (saved.length) {
      await client.query(
        `INSERT INTO meta_matchups (game, faction, rival, win_rate, avg_diff, games)
         SELECT $1, x.f, x.r, x.w, x.a, x.g
         FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::int[]) AS x(f, r, w, a, g)`,
        [
          game,
          saved.map((r) => r.faction),
          saved.map((r) => r.rival),
          saved.map((r) => r.win_rate),
          saved.map((r) => r.avg_diff),
          saved.map((r) => r.games),
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, saved: saved.length, report });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Descarga los datos actuales en Excel, listos para editar y volver a subir
router.get('/meta/:game/export', async (req, res) => {
  const game = req.params.game;
  if (!GAMES[game]) return res.status(404).json({ error: 'Juego no válido' });
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    return res.status(500).json({ error: 'La lectura de Excel no está instalada en el servidor.' });
  }
  const { rows } = await pool.query(
    'SELECT faction, rival, win_rate, avg_diff, games FROM meta_matchups WHERE game = $1 ORDER BY faction, rival',
    [game]
  );
  const data = [HEADER].concat(rows.map((r) => [
    r.faction, r.rival,
    r.win_rate === null ? '-' : Number(r.win_rate),
    r.avg_diff === null ? '-' : Number(r.avg_diff),
    r.games === null ? '-' : Number(r.games),
  ]));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Meta');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="meta-${game}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

module.exports = router;
