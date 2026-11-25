const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAuth, issueSession, clearSession, MIN_PASSWORD_LENGTH } = require('../auth');
const { sendMail } = require('../mail/brevo');
const { issueToken, consumeToken } = require('../mail/tokens');
const { resetEmail } = require('../mail/templates');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_FORGOT = 'Si el correo está registrado, recibirás un enlace para restablecer la contraseña.';

// Recuperación: pocas peticiones por IP para no saturar bandejas ni la cuenta de correo
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo de nuevo más tarde.' },
});

// Hash ficticio: hace que el tiempo de respuesta sea igual exista o no el usuario
const DUMMY_HASH = bcrypt.hashSync('contraseña-ficticia', 12);

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  must_change_password: u.must_change_password,
});

module.exports = function authRouter(loginLimiter) {
  const router = express.Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Introduce usuario y contraseña' });
    }

    // Se puede entrar con el nombre de usuario o con el email
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR lower(email) = lower($1)',
      [username]
    );
    const user = rows[0];
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    issueSession(res, user);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    }

    // token_version + 1 invalida las sesiones abiertas en otros dispositivos
    const { rows: updated } = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = false, token_version = token_version + 1
       WHERE id = $2
       RETURNING *`,
      [await bcrypt.hash(newPassword, 12), req.user.id]
    );

    issueSession(res, updated[0]);
    res.json({ user: publicUser(updated[0]) });
  });

  // ¿Has olvidado tu contraseña? Responde lo mismo exista o no el correo.
  router.post('/forgot', forgotLimiter, async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const generic = { ok: true, message: GENERIC_FORGOT };
    if (!EMAIL_RE.test(email)) return res.json(generic);

    const { rows } = await pool.query(
      'SELECT id, username, display_name FROM users WHERE lower(email) = $1',
      [email]
    );
    if (rows[0]) {
      try {
        const { token } = await issueToken(rows[0].id, 'reset');
        const mail = resetEmail({ name: rows[0].display_name || rows[0].username, token });
        await sendMail({ to: email, subject: mail.subject, text: mail.text });
      } catch (err) {
        console.error('[correo] restablecer contraseña:', err.message);
      }
    }
    res.json(generic);
  });

  // Elige contraseña con un enlace de invitación o de recuperación (un solo uso)
  router.post('/set-password', async (req, res) => {
    const password = String(req.body?.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
    }

    const used = await consumeToken(req.body?.token);
    if (!used) {
      return res.status(400).json({ error: 'El enlace no es válido, ha caducado o ya se ha usado. Pide uno nuevo.' });
    }

    // Cambiar la contraseña cierra las sesiones abiertas y anula otros enlaces de recuperación pendientes
    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = false, token_version = token_version + 1
       WHERE id = $2
       RETURNING *`,
      [await bcrypt.hash(password, 12), used.user_id]
    );
    await pool.query(
      `UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [used.user_id]
    );

    issueSession(res, rows[0]);
    res.json({ user: publicUser(rows[0]) });
  });

  return router;
};
