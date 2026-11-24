// Aplica las migraciones pendientes de ./migrations en orden, cada una en su propia transacción.
// Se ejecuta automáticamente al arrancar el servidor y también con: npm run migrate
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const DIR = path.join(__dirname, 'migrations');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
  );
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { migrate };

// Ejecución directa: npm run migrate
if (require.main === module) {
  migrate()
    .then(() => { console.log('Migraciones al día.'); return pool.end(); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
