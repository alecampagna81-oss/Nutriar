// Uso: node --import tsx scripts/import-table.ts <tabla.csv> <ficha.json> [--aplicar]
// La ficha describe la fuente (ver data/catalog/sara2.meta.example.json). Sin --aplicar solo valida.
import fs from 'node:fs';
import { pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { importTable } from '../server/importers/table.js';

const [csvFile, metaFile] = process.argv.slice(2);
if (!csvFile || !metaFile) {
  console.error('Uso: import-table.ts <tabla.csv> <ficha.json> [--aplicar]');
  process.exit(1);
}
await migrate(false);
const r = await importTable(fs.readFileSync(csvFile, 'utf8'), JSON.parse(fs.readFileSync(metaFile, 'utf8')), process.argv.includes('--aplicar'));
console.log(JSON.stringify({ ...r, errors: r.errors.slice(0, 50), total_errores: r.errors.length }, null, 2));
await pool.end();
