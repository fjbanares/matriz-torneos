const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Crea el superadministrador inicial si todavía no existe ninguno
async function ensureSuperadmin() {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE role = 'superadmin'`);
  if (rowCount > 0) return;

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

module.exports = { pool, ensureSuperadmin };
