const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { USERNAME_RE, generateTempPassword, parseId } = require('../auth');

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

module.exports = router;
