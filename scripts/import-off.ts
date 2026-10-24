// Uso: node --import tsx scripts/import-off.ts <exportacion.csv|.jsonl[.gz]> [--aplicar]
// Sin --aplicar solo valida y muestra el informe. Ver docs/CATALOGO.md.
import fs from 'node:fs';
import { pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { importOff, readOffExport } from '../server/importers/off.js';

const file = process.argv[2];
const apply = process.argv.includes('--aplicar');
if (!file || !fs.existsSync(file)) {
  console.error('Indicá el archivo exportado de Open Food Facts');
  process.exit(1);
}
await migrate(false);
const report = await importOff(readOffExport(file), apply);
console.log(JSON.stringify(report, null, 2));
console.log(apply ? `Importados: ${report.inserted} nuevos, ${report.updated} actualizados.` : 'Validación solamente. Agregá --aplicar para importar.');
await pool.end();
