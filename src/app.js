require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters long.');
}
if (production) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(session({
  name: 'school.sid',
  store: new PgSession({ pool: db.pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, secure: production, sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query(
      'SELECT id, email, display_name, avatar_url, role, suspended, password_hash, google_id FROM users WHERE id=$1',
      [id]);
    done(null, result.rows[0] || false);
  } catch (err) { done(err); }
});

passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE email=$1', [String(email || '').trim().toLowerCase()]);
    const user = result.rows[0];
    if (!user || !user.password_hash || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      return done(null, false, { message: 'Correo o contraseña incorrectos.' });
    }
    if (user.suspended) return done(null, false, { message: 'Esta cuenta está suspendida.' });
    done(null, user);
  } catch (err) { done(err); }
}));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${(process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '')}/api/auth/google/callback`
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(null, false, { message: 'Google no proporcionó un correo.' });
      const domain = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
      if (domain && !email.endsWith('@' + domain)) return done(null, false, { message: 'Usa el correo autorizado de tu centro.' });
      let result = await db.query('SELECT * FROM users WHERE google_id=$1 OR email=$2 LIMIT 1', [profile.id, email]);
      let user = result.rows[0];
      if (!user) {
        result = await db.query(
          `INSERT INTO users (email, display_name, avatar_url, google_id)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [email, profile.displayName || email.split('@')[0], profile.photos?.[0]?.value || null, profile.id]);
        user = result.rows[0];
      } else if (!user.google_id) {
        result = await db.query(
          `UPDATE users SET google_id=$1, avatar_url=COALESCE(avatar_url,$2)
           WHERE id=$3 RETURNING *`,
          [profile.id, profile.photos?.[0]?.value || null, user.id]);
        user = result.rows[0];
      }
      if (user.suspended) return done(null, false, { message: 'Esta cuenta está suspendida.' });
      done(null, user);
    } catch (err) { done(err); }
  }));
}

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const storyRoutes = require('./routes/stories');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false }), authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { fallthrough: false, maxAge: production ? '1h' : 0 }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta API no encontrada.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => { if (err) next(err); });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Ha ocurrido un error. Inténtalo de nuevo.' });
});

app.listen(port, () => console.log(`School Diary escuchando en ${port}`));
