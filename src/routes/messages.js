const express = require('express');
const db = require('../db');
const { ensureActive } = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', ensureActive, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT c.id, c.created_at AS "createdAt",
             json_agg(json_build_object('id', u.id, 'displayName', u.display_name, 'avatarUrl', u.avatar_url))
               FILTER (WHERE u.id <> $1) AS participants,
             (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
             (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS "lastMessageAt"
      FROM conversations c
      JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=$1
      JOIN conversation_members cm ON cm.conversation_id=c.id
      JOIN users u ON u.id=cm.user_id AND u.suspended=FALSE
      GROUP BY c.id ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id=c.id), c.created_at) DESC`,
      [req.user.id]);
    res.json({ conversations: result.rows });
  } catch (err) { next(err); }
});

router.post('/conversations', ensureActive, async (req, res, next) => {
  const otherId = Number(req.body?.userId);
  if (!Number.isSafeInteger(otherId) || otherId < 1 || otherId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Selecciona otro usuario válido.' });
  }
  const client = await db.pool.connect();
  try {
    const other = await client.query('SELECT id FROM users WHERE id=$1 AND suspended=FALSE', [otherId]);
    if (!other.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
    await client.query('BEGIN');
    const existing = await client.query(`
      SELECT a.conversation_id FROM conversation_members a
      JOIN conversation_members b ON b.conversation_id=a.conversation_id
      JOIN conversations c ON c.id=a.conversation_id
      WHERE a.user_id=$1 AND b.user_id=$2
        AND (SELECT COUNT(*) FROM conversation_members x WHERE x.conversation_id=c.id)=2
      LIMIT 1`, [req.user.id, otherId]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.json({ conversationId: existing.rows[0].conversation_id });
    }
    const conv = await client.query('INSERT INTO conversations DEFAULT VALUES RETURNING id');
    await client.query('INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3)', [conv.rows[0].id, req.user.id, otherId]);
    await client.query('COMMIT');
    res.status(201).json({ conversationId: conv.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

router.get('/conversations/:id', ensureActive, async (req, res, next) => {
  try {
    const member = await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!member.rowCount) return res.status(403).json({ error: 'No tienes acceso a esta conversación.' });
    const result = await db.query(`
      SELECT m.id, m.body, m.created_at AS "createdAt", m.sender_id AS "senderId",
             u.display_name AS "senderName"
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conversation_id=$1 ORDER BY m.created_at ASC LIMIT 500`, [req.params.id]);
    res.json({ messages: result.rows });
  } catch (err) { next(err); }
});

router.post('/conversations/:id', ensureActive, async (req, res, next) => {
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 4000 caracteres.' });
  try {
    const member = await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!member.rowCount) return res.status(403).json({ error: 'No tienes acceso a esta conversación.' });
    const result = await db.query(
      `INSERT INTO messages (conversation_id,sender_id,body) VALUES ($1,$2,$3)
       RETURNING id, body, created_at AS "createdAt", sender_id AS "senderId"`,
      [req.params.id, req.user.id, body]);
    res.status(201).json({ message: result.rows[0] });
  } catch (err) { next(err); }
});

router.get('/users', ensureActive, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl"
       FROM users WHERE id<>$1 AND suspended=FALSE ORDER BY display_name LIMIT 100`, [req.user.id]);
    res.json({ users: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
