// Genera un enlace de un solo uso (24 h) para que una persona elija una nueva contraseña.
// Útil mientras no haya correo configurado. En Render: pestaña "Shell" del servicio.
// Uso: node --import tsx scripts/reset-link.ts correo@dominio
import { config } from '../server/config.js';
import { one, pool, q } from '../server/db.js';
import { hashToken, newToken } from '../server/lib/security.js';

const email = (process.argv[2] ?? '').toLowerCase();
const u = await one('select id from users where email=$1 and disabled_at is null', [email]);
if (!u) {
  console.error('No existe una cuenta activa con ese correo');
  process.exit(1);
}
const token = newToken();
await q("insert into password_resets(user_id, token_hash, expires_at) values ($1,$2, now() + interval '24 hours')", [u.id, hashToken(token)]);
console.log(`${config.appUrl}/restablecer/${token}`);
await pool.end();
