const express = require('express');
const db = require('../db');
const { ensureActive, ensureAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(ensureActive, ensureAdmin);

router.get('/users', async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, email, display_name AS "displayName", role, suspended, created_at AS "createdAt"
       FROM users ORDER BY created_at DESC LIMIT 500`);
    res.json({ users: result.rows });
  } catch (err) { next(err); }
});

router.patch('/users/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
  const { suspended, role } = req.body || {};
  if (suspended === undefined && role === undefined) return res.status(400).json({ error: 'No hay cambios.' });
  if (role !== undefined && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol no válido.' });
  if (id === Number(req.user.id) && (suspended === true || role === 'user')) {
    return res.status(400).json({ error: 'No puedes quitarte tu propio acceso de administrador.' });
  }
  try {
    const result = await db.query(
      `UPDATE users SET
         suspended = COALESCE($2, suspended),
         role = COALESCE($3, role)
       WHERE id=$1
       RETURNING id, email, display_name AS "displayName", role, suspended`,
      [id, typeof suspended === 'boolean' ? suspended : null, role || null]);
    if (!result.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
