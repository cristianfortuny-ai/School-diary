const db = require('../db');

function ensureAuthenticated(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}

async function ensureActive(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  try {
    const result = await db.query('SELECT suspended FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0] || result.rows[0].suspended) {
      req.logout(() => {});
      req.session.destroy(() => {});
      return res.status(403).json({ error: 'Esta cuenta no puede usar la plataforma.' });
    }
    next();
  } catch (err) { next(err); }
}

function ensureAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores.' });
  next();
}

module.exports = { ensureAuthenticated, ensureActive, ensureAdmin };
