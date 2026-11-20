const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, issueSession, clearSession, MIN_PASSWORD_LENGTH } = require('../auth');

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

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
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

  return router;
};
