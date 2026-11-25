const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { USERNAME_RE, parseId } = require('../auth');
const { sendMail } = require('../mail/brevo');
const { issueToken } = require('../mail/tokens');
const { inviteEmail, resetEmail } = require('../mail/templates');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { validateMetaRows, HEADER } = require('../meta/validate');
const { GAMES } = require('../config');

// Montado en /api/admin con requireAuth + requireSuperAdmin
const router = express.Router();

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.email, u.display_name, u.team_name, u.role, u.created_at, u.active,
           COUNT(t.id)::int AS tournament_count,
           EXISTS (
             SELECT 1 FROM user_tokens k
             WHERE k.user_id = u.id AND k.purpose = 'invite' AND k.used_at IS NULL AND k.expires_at > now()
           ) AS invite_pending
    FROM users u
    LEFT JOIN tournaments t ON t.owner_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at
  `);
  res.json({ users: rows });
});

// Crea un usuario y le envía la invitación por email. No se muestra ninguna contraseña.
router.post('/users', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const displayName = String(req.body?.displayName ?? '').trim().slice(0, 80);
  const teamName = String(req.body?.teamName ?? '').trim().slice(0, 80);
  const profile = req.body?.profile === 'superadmin' ? 'superadmin' : 'user';

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo',
    });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Introduce un email válido' });
  if (!displayName) return res.status(400).json({ error: 'Introduce el nombre del usuario' });

  // Contraseña aleatoria que nadie conoce: la cuenta solo se activa al elegir contraseña desde el enlace
  const placeholder = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 12);
  let user;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, display_name, team_name, role, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id, username, email, display_name, team_name, role, created_at`,
      [username, email, displayName, teamName || null, profile, placeholder]
    );
    user = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: err.constraint === 'users_email_key' ? 'Ya existe un usuario con ese email' : 'Ese nombre de usuario ya existe',
      });
    }
    throw err;
  }

  const invitation = await sendInvitation(user);
  res.status(201).json({ user, invitation });
});

// Envía (o reenvía) la invitación. Reenviar anula el enlace anterior.
async function sendInvitation(user) {
  try {
    const { token, expiresAt } = await issueToken(user.id, 'invite');
    const mail = inviteEmail({ name: user.display_name || user.username, username: user.username, token });
    await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
    return { sent: true, expiresAt };
  } catch (err) {
    console.error('[correo] invitación:', err.message);
    return { sent: false, error: 'No se pudo enviar el correo. Puedes reenviar la invitación más tarde.' };
  }
}

// Reenvía la invitación a un usuario que todavía no ha elegido contraseña
router.post('/users/:id/invite', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });
  const { rows } = await pool.query(
    `SELECT id, username, email, display_name FROM users WHERE id = $1 AND role = 'user' AND active`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado o desactivado' });
  if (!rows[0].email) return res.status(400).json({ error: 'Este usuario no tiene email' });
  res.json({ invitation: await sendInvitation(rows[0]) });
});

// Edita los datos de un usuario, o activa y desactiva su cuenta
router.patch('/users/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes modificar tu propia cuenta desde aquí' });
  }

  // Activar o desactivar: cierra las sesiones del usuario al cambiar
  if (typeof req.body?.active === 'boolean' && Object.keys(req.body).length === 1) {
    const { rowCount } = await pool.query(
      'UPDATE users SET active = $1, token_version = token_version + 1 WHERE id = $2',
      [req.body.active, id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ ok: true });
  }

  const displayName = String(req.body?.displayName ?? '').trim().slice(0, 80);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const teamName = String(req.body?.teamName ?? '').trim().slice(0, 80);
  const role = req.body?.profile === 'superadmin' ? 'superadmin' : 'user';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Introduce un email válido' });
  if (!displayName) return res.status(400).json({ error: 'Introduce el nombre del usuario' });

  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = $1, email = $2, team_name = $3, role = $4
       WHERE id = $5
       RETURNING id, username, email, display_name, team_name, role, active`,
      [displayName, email, teamName || null, role, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    throw err;
  }
});

// Envía un enlace para restablecer la contraseña y cierra las sesiones abiertas
router.post('/users/:id/reset-password', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador no válido' });

  const { rows } = await pool.query(
    `SELECT id, username, email, display_name FROM users WHERE id = $1 AND role = 'user' AND active`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado o desactivado' });
  if (!rows[0].email) return res.status(400).json({ error: 'Este usuario no tiene email' });

  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
  try {
    const { token } = await issueToken(id, 'reset');
    const mail = resetEmail({ name: rows[0].display_name || rows[0].username, username: rows[0].username, token });
    await sendMail({ to: rows[0].email, subject: mail.subject, text: mail.text });
    res.json({ sent: true });
  } catch (err) {
    console.error('[correo] restablecer contraseña (admin):', err.message);
    res.status(502).json({ error: 'No se pudo enviar el correo de restablecimiento.' });
  }
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

// Diagnóstico del navegador de BCP dentro del contenedor (solo superadmin)
router.get('/bcp-diagnostic', (req, res) => {
  const fs = require('fs');
  const os = require('os');
  const out = {
    user: (() => { try { return os.userInfo().username; } catch { return null; } })(),
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    browsersDirExists: fs.existsSync('/ms-playwright'),
    browsersDirEntries: (() => { try { return fs.readdirSync('/ms-playwright'); } catch (e) { return e.code; } })(),
  };
  try {
    const { chromium } = require('playwright');
    const exe = chromium.executablePath();
    out.executablePath = exe;
    out.executableExists = fs.existsSync(exe);
  } catch (e) {
    out.playwrightError = String(e.message).split('\n')[0];
  }
  res.json(out);
});

module.exports = router;
