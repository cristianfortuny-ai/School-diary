const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const db = require('../db');
const { ensureActive } = require('../middleware/auth');

const router = express.Router();
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function domainAllowed(email) {
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
  return !domain || email.toLowerCase().endsWith('@' + domain);
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (typeof email !== 'string' || !validEmail.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Introduce un correo válido.' });
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
    }
    if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 50) {
      return res.status(400).json({ error: 'El nombre debe tener entre 2 y 50 caracteres.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!domainAllowed(normalizedEmail)) return res.status(403).json({ error: 'Usa el correo autorizado de tu centro.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, avatar_url, role, suspended`,
      [normalizedEmail, displayName.trim(), passwordHash]
    );
    req.login(result.rows[0], (err) => {
      if (err) return next(err);
      res.status(201).json({ user: safeUser(req.user) });
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese correo ya tiene una cuenta.' });
    next(err);
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Credenciales incorrectas.' });
    if (user.suspended) return res.status(403).json({ error: 'Esta cuenta está suspendida.' });
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ user: safeUser(req.user) });
    });
  })(req, res, next);
});

router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google OAuth no está configurado. Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.');
  }
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    if (req.user?.suspended) {
      req.logout(() => req.session.destroy(() => res.redirect('/?auth=suspended')));
    } else res.redirect('/');
  }
);

router.get('/me', (req, res) => res.json({ user: req.user ? safeUser(req.user) : null }));

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'No se pudo cerrar sesión.' });
    req.session.destroy(() => {
      res.clearCookie('school.sid');
      res.json({ ok: true });
    });
  });
});

function safeUser(user) {
  return {
    id: user.id, email: user.email, displayName: user.display_name || user.displayName,
    avatarUrl: user.avatar_url || user.avatarUrl || null, role: user.role, suspended: !!user.suspended
  };
}

module.exports = router;
