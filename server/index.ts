import { createApp } from './app.js';
import { config } from './config.js';
import { one } from './db.js';
import { migrate } from './migrate.js';
import { startScheduler } from './scheduler.js';

await migrate();
// Catálogo común: carga idempotente (no borra alimentos ni afecta planes existentes).
if (process.env.SEED_CATALOG_ON_START !== '0') {
  const { seedCatalog } = await import('../scripts/seed-catalog.js');
  await seedCatalog();
}
// Entorno de demostración: crea las cuentas ficticias solo si todavía no existen.
if (process.env.DEMO_MODE === '1' && process.env.SEED_DEMO_IF_EMPTY === '1') {
  const exists = await one("select 1 from users where email = 'nutri@demo.nutriar.local'");
  if (!exists) {
    const { seedDemo } = await import('../scripts/seed-demo.js');
    await seedDemo();
    console.log('Datos de demostración creados (ficticios).');
  }
}
createApp().listen(config.port, () => {
  console.log(`${config.appName} escuchando en ${config.appUrl} (puerto ${config.port})`);
});
startScheduler();
