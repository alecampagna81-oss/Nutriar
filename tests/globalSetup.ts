import pg from 'pg';
import fs from 'node:fs';

// Base de pruebas limpia en cada corrida.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/nutriar_test';
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('drop schema public cascade; create schema public;');
  await c.end();
  fs.rmSync('./storage-test', { recursive: true, force: true });
  process.env.DATABASE_URL = url;
  const { migrate } = await import('../server/migrate.js');
  await migrate(false);
  const { seedCatalog } = await import('../scripts/seed-catalog.js');
  await seedCatalog(false);
  const { pool } = await import('../server/db.js');
  await pool.end();
}
