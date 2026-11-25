-- 009 · Enlaces de un solo uso para invitaciones (invite) y recuperación (reset).
-- Solo se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE IF NOT EXISTS user_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens (user_id, purpose);
