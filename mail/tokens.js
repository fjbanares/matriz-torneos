// Enlaces de un solo uso. Solo se guarda el hash del token.
const crypto = require('crypto');
const { pool } = require('../db');

const INVITE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const RESET_MS = 60 * 60 * 1000;           // 1 hora

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Crea un token nuevo y anula los anteriores del mismo tipo (reenviar invalida el enlace anterior)
async function issueToken(userId, purpose) {
  await pool.query(
    `UPDATE user_tokens SET used_at = now()
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (purpose === 'invite' ? INVITE_MS : RESET_MS));
  await pool.query(
    `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, purpose, sha256(token), expiresAt]
  );
  return { token, expiresAt };
}

// Consume el token de forma atómica: solo una petición puede usarlo
async function consumeToken(token) {
  const { rows } = await pool.query(
    `UPDATE user_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id, purpose`,
    [sha256(String(token ?? ''))]
  );
  return rows[0] || null;
}

module.exports = { issueToken, consumeToken, INVITE_MS, RESET_MS };
