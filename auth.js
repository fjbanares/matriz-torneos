const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const COOKIE_NAME = 'session';
const SESSION_HOURS = 8;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
});

// Crea la sesión (cookie con JWT). Incluye token_version para poder invalidarla.
function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, v: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
  );
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Comprueba la sesión en cada petición contra la base de datos,
// así un usuario eliminado o una contraseña cambiada corta el acceso al instante.
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Tu sesión ha caducado' });
  }

  const { rows } = await pool.query(
    'SELECT id, username, role, must_change_password, token_version, active FROM users WHERE id = $1',
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.active || user.token_version !== payload.v) {
    return res.status(401).json({ error: 'Tu sesión ha caducado' });
  }

  // Con contraseña temporal solo se permite usar las rutas de /api/auth
  if (user.must_change_password && !req.originalUrl.startsWith('/api/auth/')) {
    return res.status(403).json({
      error: 'Debes cambiar tu contraseña antes de continuar',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }

  req.user = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso solo para el superadministrador' });
  }
  next();
}

// Contraseña temporal legible y segura (12 caracteres)
const generateTempPassword = () => crypto.randomBytes(9).toString('base64url');

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

module.exports = {
  issueSession,
  clearSession,
  requireAuth,
  requireSuperAdmin,
  generateTempPassword,
  parseId,
  USERNAME_RE,
  MIN_PASSWORD_LENGTH,
};
