const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
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

    -- Campos del torneo (añadidos para soportar el modelo completo; sin IF NOT EXISTS
    -- no sería posible migrar una base de datos que ya tenga la tabla)
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS game TEXT;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_name TEXT;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS link TEXT;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS setup_mode TEXT;
    ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS players_per_team INTEGER;

    -- Matrices: una propia (kind = 'own') y una por cada equipo rival (kind = 'rival')
    CREATE TABLE IF NOT EXISTS matrices (
      id            SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('own', 'rival')),
      rival_name    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS matrix_players (
      id         SERIAL PRIMARY KEY,
      matrix_id  INTEGER NOT NULL REFERENCES matrices(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      faction    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Crear el superadministrador inicial si todavía no existe
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE role = 'superadmin'`);
  if (rowCount === 0) {
    const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      throw new Error('Define ADMIN_USERNAME y ADMIN_PASSWORD para crear el superadministrador inicial');
    }
    await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'superadmin')`,
      [ADMIN_USERNAME, await bcrypt.hash(ADMIN_PASSWORD, 12)]
    );
    console.log(`Superadministrador "${ADMIN_USERNAME}" creado`);
  }
}

module.exports = { pool, initDb };
