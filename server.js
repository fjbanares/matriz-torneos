const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, ensureSuperadmin } = require('./db');
const { migrate } = require('./migrate');
const { requireAuth, requireSuperAdmin } = require('./auth');

if (!process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

const app = express();

// Necesario en Render: la app está detrás de un proxy HTTPS
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

// Estado de la aplicación y de la base de datos (útil para Render)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, bcpReader: require('./bcp/fetch').VERSION });
  } catch {
    res.status(503).json({ ok: false, bcpReader: require('./bcp/fetch').VERSION });
  }
});

app.use('/api/auth', require('./routes/auth')(loginLimiter));
app.use('/api/admin', requireAuth, requireSuperAdmin, require('./routes/admin'));
app.use('/api/tournaments', requireAuth, require('./routes/tournaments'));
app.use('/api/suggest', requireAuth, require('./routes/suggest'));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

// Manejador de errores (Express 5 captura también los errores de funciones async)
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

migrate()
  .then(() => ensureSuperadmin())
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
  })
  .catch((err) => {
    // Algunos errores de conexión (AggregateError) no tienen mensaje: mostramos los códigos
    const detail = err.errors ? err.errors.map((e) => e.code || e.message).join(', ') : err.message;
    console.error('No se pudo iniciar la aplicación:', detail || err.code || String(err));
    if (err.code === 'ECONNREFUSED' || (err.errors && err.errors.some((e) => e.code === 'ECONNREFUSED'))) {
      console.error('No hay PostgreSQL escuchando en DATABASE_URL. Arranca la base de datos con: docker compose up -d db');
    }
    process.exit(1);
  });
