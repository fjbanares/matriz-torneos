-- 006 · Datos de meta precargados por el administrador (sustituyen a la consulta a Listhammer).
-- Una fila por par facción-rival. Los valores ausentes se guardan como NULL y se muestran como "-".
DROP TABLE IF EXISTS listhammer_cache;

CREATE TABLE IF NOT EXISTS meta_matchups (
  game       TEXT NOT NULL,
  faction    TEXT NOT NULL,
  rival      TEXT NOT NULL,
  win_rate   NUMERIC(5,2),
  avg_diff   NUMERIC(6,2),
  games      INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game, faction, rival)
);
