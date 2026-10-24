import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { startScheduler } from './scheduler.js';

await migrate();
createApp().listen(config.port, () => {
  console.log(`${config.appName} escuchando en ${config.appUrl} (puerto ${config.port})`);
});
startScheduler();
