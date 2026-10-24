// Alta de una cuenta profesional desde la consola (para producción, con registro abierto deshabilitado).
// Uso: node --import tsx scripts/create-professional.ts "Nombre Apellido" correo@dominio "contraseña-de-10+"
import { pool, one, q } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { hashPassword } from '../server/lib/security.js';

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 10) {
  console.error('Uso: create-professional.ts "Nombre" correo contraseña (mínimo 10 caracteres)');
  process.exit(1);
}
await migrate(false);
const exists = await one('select 1 from users where email=$1', [email.toLowerCase()]);
if (exists) {
  console.error('Ya existe una cuenta con ese correo');
  process.exit(1);
}
const u = await one("insert into users(email, password_hash, role, name) values ($1,$2,'professional',$3) returning id", [email.toLowerCase(), await hashPassword(password), name]);
await q('insert into professionals(user_id) values ($1)', [u.id]);
console.log(`Cuenta profesional creada: ${email}`);
await pool.end();
