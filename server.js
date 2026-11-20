const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');
const { requireAuth, requireSuperAdmin } = require('./auth');

if (!process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

const app = express();

// Necesario en Render/Heroku: la app está detrás de un proxy HTTPS
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Límite de intentos de login para frenar ataques de fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

app.use('/api/auth', require('./routes/auth')(loginLimiter));
app.use('/api/admin', requireAuth, requireSuperAdmin, require('./routes/admin'));
app.use('/api/tournaments', requireAuth, require('./routes/tournaments'));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

// Manejador de errores (Express 5 captura también los errores de funciones async)
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: status < 500 ? err.message : 'Error interno del servidor',
  });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo iniciar la aplicación:', err.message);
    process.exit(1);
  });
