// Prueba de punta a punta con navegador real (Chromium + Playwright).
// Uso: npm run test:e2e   (requiere PostgreSQL y el frontend compilado: npm run build)
// Crea una base limpia `nutriar_e2e`, levanta el servidor en el puerto 3100 y recorre la interfaz
// como profesional y como paciente, en computadora y en celular.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pg from 'pg';
import { chromium } from 'playwright';

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/nutriar_e2e';
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.resolve('test-results/e2e');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const c = new pg.Client({ connectionString: DB });
await c.connect();
await c.query('drop schema public cascade; create schema public;');
await c.end();
const env = { ...process.env, DATABASE_URL: DB, PORT: String(PORT), STORAGE_DIR: './storage-e2e', DISABLE_RATE_LIMIT: '1', APP_URL: BASE, NODE_ENV: 'development' };
fs.rmSync('./storage-e2e', { recursive: true, force: true });
execSync('node --import tsx scripts/seed-catalog.ts', { env, stdio: 'inherit' });
const server = spawn('node', ['--import', 'tsx', 'server/index.ts'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('El servidor no arrancó')), 20000);
  server.stdout.on('data', (d) => d.toString().includes('escuchando') && (clearTimeout(t), res()));
});

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const problems = [];
const steps = [];
const step = async (name, fn) => {
  try {
    await fn();
    steps.push(`OK   ${name}`);
  } catch (e) {
    steps.push(`FALLA ${name}: ${e.message.split('\n')[0]}`);
    throw e;
  }
};
const watch = (page, who) => {
  page.on('pageerror', (e) => problems.push(`${who}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('409') && !m.text().includes('400') && !m.text().includes('415') && problems.push(`${who}: ${m.text()}`));
};
const expectText = async (page, text, timeout = 8000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });

let exitCode = 0;
try {
  const proCtx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  proCtx.setDefaultTimeout(10000);
  const pro = await proCtx.newPage();
  watch(pro, 'profesional');
  let inviteLink = '';
  let patientUrl = '';

  await step('La profesional crea su cuenta', async () => {
    await pro.goto(`${BASE}/registro`);
    await pro.getByLabel('Nombre y apellido').fill('Lic. E2E Prueba');
    await pro.getByLabel('Correo electrónico').fill('e2e.pro@test.local');
    await pro.getByLabel('Contraseña').fill('Clave-E2E-12345');
    await pro.getByRole('button', { name: 'Crear cuenta' }).click();
    await expectText(pro, 'Hola, Lic. E2E Prueba');
  });

  await step('Alta de paciente con validación de errores', async () => {
    await pro.getByRole('link', { name: 'Nuevo paciente' }).click();
    await pro.getByRole('button', { name: 'Guardar paciente' }).click();
    await expectText(pro, 'Ingresá el nombre'); // error mostrado, sin éxito falso
    await pro.getByRole('dialog').getByLabel('Nombre').fill('Julia');
    await pro.getByLabel('Apellido').fill('Ficticia E2E');
    await pro.getByLabel('Correo electrónico').fill('julia@test.local');
    await pro.getByRole('button', { name: 'Guardar paciente' }).click();
    await expectText(pro, 'Acceso del paciente');
    patientUrl = pro.url();
  });

  await step('Invitación generada', async () => {
    await pro.getByRole('button', { name: 'Generar enlace de invitación' }).click();
    const input = pro.getByRole('textbox', { name: 'Enlace' });
    await input.waitFor();
    inviteLink = await input.inputValue();
    if (!inviteLink.includes('/invitacion/')) throw new Error('enlace inválido');
    await pro.getByRole('button', { name: 'Listo' }).click();
    await expectText(pro, 'Invitación pendiente');
  });

  await step('Historia clínica con alergia registrada', async () => {
    await pro.getByRole('tab', { name: 'Historia clínica' }).click();
    await pro.getByLabel('Gluten (TACC)').check();
    await pro.getByLabel('Motivo de consulta').fill('Caso ficticio de prueba automatizada');
    await pro.getByRole('button', { name: 'Guardar historia clínica' }).click();
    await expectText(pro, 'Historia clínica guardada');
  });

  // Paciente en celular
  const patCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  patCtx.setDefaultTimeout(10000);
  const pat = await patCtx.newPage();
  watch(pat, 'paciente');

  await step('El paciente acepta la invitación desde el celular', async () => {
    await pat.goto(inviteLink);
    await expectText(pat, 'Hola, Julia');
    await pat.getByLabel('Elegí una contraseña').fill('Clave-Paciente-123');
    await pat.getByLabel('Repetí la contraseña').fill('Clave-Paciente-123');
    await pat.getByRole('button', { name: 'Crear mi acceso' }).click();
    await expectText(pat, 'Tenés que aceptar'); // falta aceptar condiciones
    await pat.locator('#acc').check();
    await pat.getByRole('button', { name: 'Crear mi acceso' }).click();
    await expectText(pat, 'todavía no publicó tu plan');
    await pat.screenshot({ path: `${SHOTS}/paciente-sin-plan.png`, fullPage: true });
  });

  await step('Cuestionario: la profesional lo pide, el paciente lo envía', async () => {
    await pro.reload();
    await pro.getByRole('tab', { name: 'Cuestionarios' }).click();
    await pro.getByRole('button', { name: 'Solicitar cuestionario' }).click();
    await expectText(pro, 'Pendiente del paciente');
    await pat.goto(`${BASE}/app/cuestionario`);
    await pat.getByLabel('¿Por qué consultás?').fill('Quiero comer más ordenado (dato ficticio)');
    await pat.getByRole('button', { name: 'Agregar comida o bebida' }).click();
    await pat.getByLabel('Descripción').fill('Mate con dos medialunas');
    await pat.getByRole('button', { name: 'Enviar a mi nutricionista' }).click();
    await expectText(pat, 'Cuestionario enviado');
    await pro.reload();
    await expectText(pro, 'Quiero comer más ordenado');
    await expectText(pro, 'Mate con dos medialunas');
  });

  await step('La profesional arma el plan en el editor, con alerta de alérgenos', async () => {
    await pro.getByRole('tab', { name: 'Planes' }).click();
    await pro.getByRole('button', { name: 'Nuevo plan' }).click();
    await pro.getByLabel('Título').fill('Plan E2E');
    await pro.getByRole('button', { name: 'Crear y editar' }).click();
    await expectText(pro, 'Para tener en cuenta');
    const add = async (meal, query, name) => {
      await pro.locator('.meal-block', { hasText: meal }).getByRole('button', { name: '+ Agregar alimento' }).click();
      await pro.getByLabel('Buscar alimento').fill(query);
      // Nombre exacto: el catálogo tiene alimentos parecidos de distintas fuentes (SARA 2, USDA, Open Food Facts).
      await pro.locator('.food-result', { has: pro.locator('.name', { hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) }).first().click();
      await pro.locator('.meal-block', { hasText: meal }).getByText(name).first().waitFor();
    };
    await add('Desayuno', 'leche desc', 'Leche descremada');
    await add('Desayuno', 'pan de molde integral', 'Pan de molde integral');
    await expectText(pro, 'Coincidencias con alergias registradas');
    await add('Almuerzo', 'lentejas hervidas', 'Lentejas hervidas, sin sal');
    // Cantidad en medida casera documentada
    const row = pro.locator('.item-row', { hasText: 'Lentejas hervidas' });
    await row.getByLabel('Unidad').selectOption({ label: '1 taza medidora EE.UU. (198 g)' });
    await expectText(pro, 'Ener. 230');
    await pro.getByRole('button', { name: 'Copiar este día a…' }).click();
    await pro.getByRole('button', { name: 'Seleccionar todos' }).click();
    await pro.getByRole('button', { name: 'Copiar', exact: true }).click();
    await pro.getByRole('button', { name: 'Guardar borrador' }).click();
    await expectText(pro, 'Borrador guardado');
    await pro.screenshot({ path: `${SHOTS}/editor-plan.png`, fullPage: true });
  });

  await step('Publicar exige confirmar la coincidencia con alergias', async () => {
    await pro.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expectText(pro, 'Confirmar publicación');
    await pro.getByRole('button', { name: 'Publicar de todos modos' }).click();
    await expectText(pro, 'Plan publicado');
  });

  await step('El paciente ve su plan, la lista de compras y descarga el PDF', async () => {
    await pat.goto(`${BASE}/app/plan`);
    await expectText(pat, 'Plan E2E');
    await expectText(pat, 'de Leche descremada');
    await expectText(pat, '1 taza medidora EE.UU. (198 g)');
    await pat.screenshot({ path: `${SHOTS}/paciente-plan.png`, fullPage: true });
    await pat.goto(`${BASE}/app/compras`);
    await expectText(pat, 'Lentejas hervidas, sin sal');
    await expectText(pat, '1,39 kg'); // 7 × 198 g
    await pat.goto(`${BASE}/app/plan`);
    const [dl] = await Promise.all([pat.waitForEvent('download'), pat.getByRole('button', { name: 'Descargar PDF' }).click()]);
    const file = await dl.path();
    if (fs.readFileSync(file).subarray(0, 5).toString() !== '%PDF-') throw new Error('No es un PDF');
  });

  await step('El paciente registra una comida con foto', async () => {
    const photo = path.join(SHOTS, 'almuerzo.jpg');
    await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c97' } }).jpeg().withExif({ IFD0: { Artist: 'gps-secreto' } }).toFile(photo);
    await pat.goto(`${BASE}/app/registrar?comida=almuerzo`);
    await pat.getByRole('radio', { name: 'Parcial' }).click();
    await pat.getByLabel('Comentario').fill('Me sobró la mitad');
    await pat.locator('input[type=file]').setInputFiles(photo);
    await pat.getByRole('button', { name: 'Guardar registro' }).click();
    await expectText(pat, 'Registro guardado');
    await expectText(pat, 'Me sobró la mitad');
  });

  await step('Archivo inválido: error claro y el formulario conserva lo escrito', async () => {
    const bad = path.join(SHOTS, 'falsa.jpg');
    fs.writeFileSync(bad, 'esto no es una imagen');
    await pat.getByLabel('Comentario').fill('Texto que no debe perderse');
    await pat.locator('input[type=file]').setInputFiles(bad);
    await pat.getByRole('button', { name: 'Guardar registro' }).click();
    await expectText(pat, 'Formato no permitido');
    if ((await pat.getByLabel('Comentario').inputValue()) !== 'Texto que no debe perderse') throw new Error('Se perdió el texto');
  });

  await step('Mensajes en ambos sentidos con estado de lectura', async () => {
    await pat.goto(`${BASE}/app/mensajes`);
    await expectText(pat, 'No es un canal de urgencias');
    await pat.getByLabel('Escribí tu mensaje').fill('¿Puedo cambiar el pan por galletas de arroz?');
    await pat.getByRole('button', { name: 'Enviar' }).click();
    await expectText(pat, 'Enviado');
    await pro.goto(`${BASE}/pro`);
    await expectText(pro, 'Mensajes sin leer');
    await pro.locator('a', { hasText: 'Julia Ficticia E2E' }).first().click();
    await expectText(pro, '¿Puedo cambiar el pan');
    await pro.getByLabel('Escribí tu mensaje').fill('Sí, 2 unidades.');
    await pro.getByRole('button', { name: 'Enviar' }).click();
    await expectText(pro, 'Sí, 2 unidades.');
    await pat.reload();
    await expectText(pat, 'Sí, 2 unidades.');
    await expectText(pat, 'Leído');
  });

  await step('La profesional ve el registro con la foto', async () => {
    await pro.getByRole('tab', { name: 'Registros' }).click();
    await expectText(pro, 'Me sobró la mitad');
    const img = pro.locator('img.thumb').first();
    await img.waitFor();
    if (!(await img.evaluate((i) => i.complete && i.naturalWidth > 0))) throw new Error('La foto no cargó');
  });

  await step('Mediciones: carga, historial y gráfico', async () => {
    await pro.getByRole('tab', { name: 'Mediciones' }).click();
    for (const [kind, val] of [['Talla', '160'], ['Peso', '60,5']]) {
      await pro.getByLabel('Indicador').selectOption({ label: kind });
      await pro.locator('input[inputmode=decimal]').first().fill(val);
      await pro.getByRole('button', { name: 'Guardar medición' }).click();
      await expectText(pro, 'Medición registrada');
    }
    await expectText(pro, '60,5 kg');
    await pro.getByRole('checkbox', { name: 'Peso', exact: true }).check();
    await expectText(pro, 'Indicador compartido');
    await pro.getByRole('checkbox', { name: 'IMC (calculado)' }).check();
    await expectText(pro, 'Indicador compartido');
    await pro.locator('svg.chart').first().waitFor();
    await pat.goto(`${BASE}/app/avances`);
    await expectText(pat, 'IMC (calculado)');
    await pat.locator('svg.chart').first().waitFor();
  });

  await step('Turno: alta, superposición detectada y confirmación del paciente', async () => {
    await pro.goto(`${BASE}/pro/agenda`);
    const tomorrow = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    for (const time of ['11:00', '11:15']) {
      await pro.getByRole('button', { name: 'Nuevo turno' }).click();
      await pro.getByRole('dialog').getByRole('combobox', { name: /^Paciente/ }).selectOption({ label: 'Ficticia E2E, Julia' });
      await pro.locator('input[type=datetime-local]').fill(`${tomorrow}T${time}`);
      await pro.getByRole('button', { name: 'Guardar', exact: true }).click();
    }
    await expectText(pro, 'Este horario se superpone');
    await pro.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await pat.goto(`${BASE}/app/turnos`);
    await pat.getByRole('button', { name: 'Confirmar asistencia' }).click();
    await expectText(pat, 'Turno confirmado');
    await pro.goto(`${BASE}/pro`); // el inicio lista los turnos de los próximos 7 días
    await expectText(pro, 'Confirmado');
  });

  await step('Los datos persisten tras cerrar sesión y recargar', async () => {
    await pat.goto(`${BASE}/app/perfil`);
    await pat.getByRole('button', { name: 'Cerrar sesión' }).click();
    await pat.waitForURL('**/ingresar');
    await pat.goto(`${BASE}/app/plan`).catch(() => undefined); // redirige al ingreso: sin sesión no hay datos
    await pat.waitForURL('**/ingresar');
    await pat.getByLabel('Correo electrónico').fill('julia@test.local');
    await pat.getByLabel('Contraseña').fill('Clave-Paciente-123');
    await pat.getByRole('button', { name: 'Ingresar' }).click();
    await expectText(pat, 'Hola, Julia');
    await pat.goto(`${BASE}/app/plan`);
    await pat.reload();
    await expectText(pat, 'Plan E2E');
  });

  await step('Otra profesional no ve a la paciente (ni por URL directa)', async () => {
    const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const other = await otherCtx.newPage();
    await other.goto(`${BASE}/registro`);
    await other.getByLabel('Nombre y apellido').fill('Lic. Ajena');
    await other.getByLabel('Correo electrónico').fill('ajena@test.local');
    await other.getByLabel('Contraseña').fill('Clave-Ajena-12345');
    await other.getByRole('button', { name: 'Crear cuenta' }).click();
    await expectText(other, 'Hola, Lic. Ajena');
    await other.goto(patientUrl);
    await expectText(other, 'Paciente no encontrado');
    await otherCtx.close();
  });
} catch (e) {
  exitCode = 1;
  console.error(e);
} finally {
  await browser.close();
  server.kill();
}
console.log(steps.join('\n'));
if (problems.length) {
  console.log('Errores de consola del navegador:\n' + problems.join('\n'));
  exitCode = 1;
}
console.log(exitCode ? 'RESULTADO: FALLÓ' : `RESULTADO: OK (${steps.length} pasos). Capturas en ${SHOTS}`);
process.exit(exitCode);
