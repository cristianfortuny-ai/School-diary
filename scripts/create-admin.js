require('dotenv').config();
const db = require('../src/db');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: npm run admin:create -- correo@ejemplo.com');
    process.exitCode = 1;
    await db.pool.end();
    return;
  }
  try {
    const result = await db.query(
      `UPDATE users SET role='admin' WHERE email=$1 RETURNING id,email,role`,
      [email]);
    if (!result.rowCount) {
      console.error('No existe esa cuenta. Regístrala primero y vuelve a ejecutar el comando.');
      process.exitCode = 1;
    } else {
      console.log('Administrador configurado:', result.rows[0]);
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
