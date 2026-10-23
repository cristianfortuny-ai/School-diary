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
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage, limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato no permitido.'), ok);
  }
});

router.get('/', ensureActive, async (_req, res, next) => {
  try {
    const result = await db.query(`
      SELECT s.id, s.user_id AS "userId", s.media_path AS "mediaPath",
             s.media_type AS "mediaType", s.caption, s.created_at AS "createdAt",
             s.expires_at AS "expiresAt", u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
      FROM stories s JOIN users u ON u.id=s.user_id
      WHERE s.expires_at > NOW() AND u.suspended=FALSE
      ORDER BY s.created_at DESC LIMIT 100`);
    res.json({ stories: result.rows });
  } catch (err) { next(err); }
});

router.post('/', ensureActive, (req, res) => {
  upload.single('media')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen o vídeo.' });
    try {
      const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      const result = await db.query(
        `INSERT INTO stories (user_id, media_path, media_type, caption)
         VALUES ($1,$2,$3,$4)
         RETURNING id, media_path AS "mediaPath", media_type AS "mediaType", caption, created_at AS "createdAt", expires_at AS "expiresAt"`,
        [req.user.id, `/uploads/${req.file.filename}`, type, String(req.body.caption || '').trim().slice(0, 200)]
      );
      res.status(201).json({ story: result.rows[0] });
    } catch (err) { res.status(500).json({ error: 'No se pudo publicar el estado.' }); }
  });
});

module.exports = router;
