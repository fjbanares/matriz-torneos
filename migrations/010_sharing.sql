-- 010 · Torneos compartidos. El propietario es tournaments.owner_id; los editores van en tournament_members.
-- version: se incrementa en cada guardado para detectar cambios simultáneos.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tournament_members (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS tournament_members_user_idx ON tournament_members (user_id);
