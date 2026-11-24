-- 001 · Usuarios y torneos (base).
-- Idempotente: seguro sobre bases ya creadas por versiones anteriores del proyecto.

CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  username             TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  token_version        INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS game TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS setup_mode TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS players_per_team INTEGER;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Rellena valores antiguos y deja las columnas obligatorias
UPDATE tournaments SET game = '40k' WHERE game IS NULL;
UPDATE tournaments SET team_name = '' WHERE team_name IS NULL;
UPDATE tournaments SET setup_mode = 'manual' WHERE setup_mode IS NULL;
UPDATE tournaments SET players_per_team = 5 WHERE players_per_team IS NULL;
ALTER TABLE tournaments
  ALTER COLUMN game SET NOT NULL,
  ALTER COLUMN team_name SET NOT NULL,
  ALTER COLUMN setup_mode SET NOT NULL,
  ALTER COLUMN players_per_team SET NOT NULL;
