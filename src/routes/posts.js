const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { ensureActive } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const maxMb = Math.max(1, Math.min(Number(process.env.MAX_UPLOAD_MB || 30), 100));
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage, limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Formato no permitido. Usa JPG, PNG, GIF, WEBP, MP4 o WEBM.'), allowed.includes(file.mimetype));
  }
});

router.get('/', ensureActive, async (_req, res, next) => {
  try {
    const result = await db.query(`
      SELECT p.id, p.user_id AS "userId", p.caption, p.media_path AS "mediaPath",
             p.media_type AS "mediaType", p.created_at AS "createdAt",
             u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
             COUNT(l.user_id)::int AS likes,
             BOOL_OR(l.user_id = $1) AS "likedByMe"
      FROM posts p JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      WHERE u.suspended = FALSE
      GROUP BY p.id, u.display_name, u.avatar_url
      ORDER BY p.created_at DESC LIMIT 100`, [_req.user.id]);
    res.json({ posts: result.rows });
  } catch (err) { next(err); }
});

router.post('/', ensureActive, (req, res, next) => {
  upload.single('media')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen o vídeo.' });
    try {
      const caption = String(req.body.caption || '').trim().slice(0, 500);
      const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      const mediaPath = `/uploads/${req.file.filename}`;
      const result = await db.query(
        `INSERT INTO posts (user_id, caption, media_path, media_type)
         VALUES ($1, $2, $3, $4) RETURNING id, caption, media_path AS "mediaPath", media_type AS "mediaType", created_at AS "createdAt"`,
        [req.user.id, caption, mediaPath, mediaType]
      );
      res.status(201).json({ post: result.rows[0] });
    } catch (err) { next(err); }
  });
});

router.post('/:id/like', ensureActive, async (req, res, next) => {
  try {
    const post = await db.query('SELECT id FROM posts WHERE id = $1', [req.params.id]);
    if (!post.rowCount) return res.status(404).json({ error: 'Publicación no encontrada.' });
    const existing = await db.query('SELECT 1 FROM likes WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]);
    if (existing.rowCount) {
      await db.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2', [req.user.id, req.params.id]);
      return res.json({ liked: false });
    }
    await db.query('INSERT INTO likes (user_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
    res.json({ liked: true });
  } catch (err) { next(err); }
});

router.delete('/:id', ensureActive, async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM posts WHERE id=$1 AND (user_id=$2 OR EXISTS (SELECT 1 FROM users WHERE id=$2 AND role=$3)) RETURNING id',
      [req.params.id, req.user.id, 'admin']);
    if (!result.rowCount) return res.status(404).json({ error: 'Publicación no encontrada o sin permisos.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
