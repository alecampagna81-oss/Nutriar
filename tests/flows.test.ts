// Comprobaciones obligatorias 1-3 y 5-13 contra la API real y PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import { one, pool, q } from '../server/db.js';
import { readFile } from '../server/lib/storage.js';
import { client, foodId, jpegWithExif, measureId, newPatientWithAccount, newProfessional, PASSWORD, type Client } from './helpers.js';
import { localDate } from '../shared/time.js';

let pro: Client, proId: string;
let pc: Client, patientId: string, patientEmail: string;
let pro2: Client;
let pc2: Client, patient2Id: string;
let planId: string, versionId: string;
let photoFileId: string, docFileId: string;
const ids: Record<string, string> = {};

async function pdfText(buf: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const r = await parser.getText();
  await parser.destroy();
  return r.text as string;
}

beforeAll(async () => {
  ({ c: pro, id: proId } = await newProfessional('Lic. Prueba Uno'));
  ({ c: pro2 } = await newProfessional('Lic. Prueba Dos'));
  ids.leche = await foodId('Leche descremada');
  ids.banana = await foodId('Banana');
  ids.avena = await foodId('Avena arrollada (tradicional o instantánea), cruda');
  ids.pollo = await foodId('Pechuga de pollo sin piel, asada');
  ids.arroz = await foodId('Arroz blanco largo fino, hervido');
  ids.nueces = await foodId('Nueces (mariposa)');
  ids.manzana = await foodId('Manzana con cáscara');
  ids.licuado = await foodId('Licuado de banana con leche');
  ids.tazaArroz = await measureId(ids.arroz, '1 taza');
});

afterAll(async () => {
  await pool.end();
});

describe('1. alta de paciente e invitación', () => {
  it('la profesional crea un paciente y este acepta la invitación', async () => {
    const p = await pro.post('/api/pro/patients', { first_name: 'Carla', last_name: 'Ficticia', email: 'carla@test.local' });
    expect(p.status).toBe(201);
    patientId = p.body.id;
    const inv = await pro.post(`/api/pro/patients/${patientId}/invitation`, { send_email: true });
    expect(inv.status).toBe(201);
    expect(inv.body.email_status).toBe('sin_configurar'); // sin SMTP no se simula un envío
    const token = inv.body.link.split('/').pop();
    // En la base solo queda el hash del token
    const raw = await one('select count(*)::int as n from invitations where token_hash=$1', [token]);
    expect(raw.n).toBe(0);

    const anon = client();
    const info = await anon.get(`/api/auth/invitation/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.first_name).toBe('Carla');

    pc = client();
    patientEmail = 'carla.cuenta@test.local';
    const acc = await pc.post('/api/auth/accept-invitation', { token, email: patientEmail, password: PASSWORD, accept_terms: true });
    expect(acc.status).toBe(201);
    expect(acc.body.user.role).toBe('patient');

    const me = await pc.get('/api/auth/me');
    expect(me.body.user.patient_id).toBe(patientId);
    const detail = await pro.get(`/api/pro/patients/${patientId}`);
    expect(detail.body.invitation.status).toBe('aceptada');
    expect(detail.body.user_id).toBeTruthy();
  });

  it('el token no se puede reutilizar ni adivinar', async () => {
    const other = client();
    const bad = await other.post('/api/auth/accept-invitation', { token: 'x'.repeat(43), email: 'intruso@test.local', password: PASSWORD, accept_terms: true });
    expect(bad.status).toBe(410);
  });

  it('conocer el correo o el id del paciente no permite vincularse', async () => {
    const intruso = await newProfessional('Lic. Intrusa');
    // La otra profesional no puede ver ni invitar a ese paciente
    expect((await intruso.c.get(`/api/pro/patients/${patientId}`)).status).toBe(404);
    expect((await intruso.c.post(`/api/pro/patients/${patientId}/invitation`, {})).status).toBe(404);
    // Crear un paciente con el mismo correo no da acceso a los datos del original
    const dup = await intruso.c.post('/api/pro/patients', { first_name: 'Carla', last_name: 'Ficticia', email: 'carla@test.local' });
    expect(dup.status).toBe(201);
    expect(dup.body.id).not.toBe(patientId);
  });

  it('un segundo paciente con otra profesional (para pruebas de aislamiento)', async () => {
    const r = await newPatientWithAccount(pro2, 'Bruno', 'DeOtra');
    pc2 = r.pc;
    patient2Id = r.patientId;
  });
});

describe('2. cuestionario previo', () => {
  it('el paciente lo completa y la profesional lo recibe', async () => {
    const qn = await pro.post('/api/pro/questions', { text: '¿Comés fuera de casa?', kind: 'opciones', options: ['Nunca', 'A veces', 'Seguido'] });
    expect(qn.status).toBe(201);
    const req = await pro.post(`/api/pro/patients/${patientId}/questionnaires`, {});
    expect(req.status).toBe(201);
    expect(req.body.questions).toHaveLength(1);

    const mine = await pc.get('/api/me/questionnaires');
    const qid = mine.body[0].id;
    // Guardado parcial (no se pierde lo escrito)
    const draft = await pc.put(`/api/me/questionnaires/${qid}`, { answers: { motivo: 'Quiero ordenar mis comidas' }, submit: false });
    expect(draft.body.status).toBe('pendiente');
    const sent = await pc.put(`/api/me/questionnaires/${qid}`, {
      answers: { motivo: 'Quiero ordenar mis comidas', alergias: 'Ninguna', [qn.body.id]: 'A veces', recordatorio_24h: [{ time: '08:00', meal: 'Desayuno', description: 'Café con leche y tostadas' }] },
      submit: true,
    });
    expect(sent.body.status).toBe('enviado');
    // Ya no se puede modificar
    expect((await pc.put(`/api/me/questionnaires/${qid}`, { answers: {}, submit: true })).status).toBe(409);

    const dash = await pro.get('/api/pro/dashboard');
    expect(dash.body.questionnaires.some((x: any) => x.id === qid)).toBe(true);
    const list = await pro.get(`/api/pro/patients/${patientId}/questionnaires`);
    expect(list.body[0].answers.motivo).toBe('Quiero ordenar mis comidas');
    expect(list.body[0].answers.recordatorio_24h[0].description).toMatch(/tostadas/);
    const rev = await pro.post(`/api/pro/patients/${patientId}/questionnaires/${qid}/review`, { note: 'Revisado' });
    expect(rev.body.status).toBe('revisado');
  });
});

function sampleContent(withNuts = false) {
  const days = [];
  for (let d = 1; d <= 7; d++) {
    days.push({
      week: 1,
      day: d,
      meals: {
        desayuno: [
          { id: `a${d}`, food_id: ids.leche, quantity: 250, unit: 'ml' },
          { id: `b${d}`, food_id: ids.avena, quantity: 30, unit: 'g', alternatives: [{ id: `b${d}x`, food_id: ids.banana, quantity: 100, unit: 'g' }] },
        ],
        almuerzo: [
          { id: `c${d}`, food_id: ids.pollo, quantity: 150, unit: 'g' },
          { id: `e${d}`, food_id: ids.arroz, quantity: 1, unit: 'medida', measure_id: ids.tazaArroz },
        ],
        merienda: d === 1 ? [{ id: 'l1', food_id: ids.licuado, quantity: 1, unit: 'porcion' }, ...(withNuts ? [{ id: 'n1', food_id: ids.nueces, quantity: 15, unit: 'g' }] : [])] : [{ id: `m${d}`, food_id: ids.manzana, quantity: 150, unit: 'g', gross: true }],
        cena: [],
      },
    });
  }
  return {
    weeks: 1,
    meals: [
      { key: 'desayuno', name: 'Desayuno', time: '08:00' },
      { key: 'almuerzo', name: 'Almuerzo', time: '13:00' },
      { key: 'merienda', name: 'Merienda', time: '17:00' },
      { key: 'cena', name: 'Cena', time: '21:00' },
    ],
    days,
    show_nutrients: false,
    supplements: [{ name: 'Hierro (ejemplo)', dose: '1 comprimido', frequency: 'diaria', timing: 'en ayunas', notes: '' }],
    general_notes: 'Plan de prueba',
  };
}

describe('3. plan alimentario', () => {
  it('se crea, se guarda como borrador y el paciente no lo ve hasta publicarlo', async () => {
    await pro.put(`/api/pro/patients/${patientId}/clinical`, { data: { motivo: 'Prueba' }, allergens: ['frutos_secos'], restriction_notes: 'Alergia ficticia' });
    const plan = await pro.post('/api/pro/plans', { title: 'Plan de prueba', weeks: 1, patient_id: patientId });
    expect(plan.status).toBe(201);
    planId = plan.body.id;
    const detail = await pro.get(`/api/pro/plans/${planId}`);
    versionId = detail.body.version.id;
    const save = await pro.put(`/api/pro/plans/${planId}/draft`, { title: 'Plan de prueba', content: sampleContent(true), version_id: versionId, start_date: null });
    expect(save.status).toBe(200);
    expect(save.body.warnings.join(' ')).toMatch(/Nueces.*Frutos secos/);
    expect((await pc.get('/api/me/plan')).body).toBeNull();
  });

  it('publicar con alérgenos registrados exige confirmación explícita', async () => {
    const r = await pro.post(`/api/pro/plans/${planId}/publish`, {});
    expect(r.status).toBe(409);
    expect(r.body.details.warnings.length).toBe(1);
    // Se corrige el plan quitando las nueces
    const save = await pro.put(`/api/pro/plans/${planId}/draft`, { title: 'Plan de prueba', content: sampleContent(false), version_id: versionId, start_date: null });
    expect(save.body.warnings).toHaveLength(0);
    const pub = await pro.post(`/api/pro/plans/${planId}/publish`, {});
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('publicado');
  });

  it('el paciente correcto ve el plan publicado, sin calorías si no están habilitadas', async () => {
    const r = await pc.get('/api/me/plan');
    expect(r.body.title).toBe('Plan de prueba');
    const it0 = r.body.content.days[0].meals.desayuno[0];
    expect(it0.snapshot.name).toBe('Leche descremada');
    expect(it0.snapshot.energy_kcal).toBeNull(); // ocultas por decisión profesional
    expect(r.body.content.supplements[0].name).toBe('Hierro (ejemplo)');
    // Otro paciente no lo ve
    expect((await pc2.get('/api/me/plan')).body).toBeNull();
  });
});

describe('5. lista de compras y PDF', () => {
  it('la lista consolida las cantidades del plan', async () => {
    const s = await pc.get('/api/me/plan/shopping?week=1');
    const line = (name: string) => s.body.lines.find((l: any) => l.name === name);
    expect(line('Leche descremada').unit).toBe('ml');
    expect(line('Leche descremada').amount).toBe(250 * 7);
    expect(line('Pechuga de pollo sin piel, asada').amount).toBe(150 * 7);
    expect(line('Arroz blanco largo fino, hervido').amount).toBe(158 * 7); // 1 taza USDA = 158 g
    // Banana del licuado (receta expandida: 120 g por porción); la alternativa no se suma
    expect(line('Banana').amount).toBe(120);
    expect(line('Banana').from_recipes).toEqual(['Licuado de banana con leche']);
    // Leche del licuado (250 g) va en otra línea porque está en gramos
    expect(s.body.lines.filter((l: any) => l.name === 'Leche descremada')).toHaveLength(2);
    // Manzana en peso bruto: 6 días × 150 g con cáscara
    expect(line('Manzana con cáscara').purchase_amount).toBeCloseTo(900, 5);
  });

  it('el PDF contiene el plan y la misma lista de compras', async () => {
    const r = await pc.get('/api/me/plan/pdf').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const text = await pdfText(r.body as Buffer);
    expect(text).toContain('Plan de prueba');
    expect(text).toContain('250 ml de Leche descremada');
    expect(text).toContain('o bien: 100 g de Banana');
    expect(text).toContain('1 porción (370 g) de Licuado de banana con leche');
    expect(text).toContain('Hierro (ejemplo)');
    expect(text).toContain('Lista de compras');
    expect(text).toContain('Leche descremada: 1,75 l');
    expect(text).toContain('Pechuga de pollo sin piel, asada: 1,05 kg');
    expect(text).toContain('Arroz blanco largo fino, hervido: 1,11 kg');
    expect(text).not.toMatch(/kcal/); // calorías ocultas para este paciente
  });
});

describe('6-7. registros, fotos y mensajes', () => {
  it('el paciente registra una comida con foto y se eliminan los metadatos', async () => {
    const today = localDate(new Date(), 'America/Argentina/Buenos_Aires');
    const jpg = await jpegWithExif();
    expect((await sharp(jpg).metadata()).exif).toBeDefined();
    const r = await pc.upload('/api/me/meal-logs', 'photo', jpg, 'IMG_0001.jpg', { log_date: today, meal_key: 'almuerzo', meal_name: 'Almuerzo', status: 'parcial', comment: 'Comí la mitad del arroz', difficulty: 'Poco tiempo' });
    expect(r.status).toBe(201);
    photoFileId = r.body.photo_file_id;
    const f = await one('select storage_key from files where id=$1', [photoFileId]);
    const stored = await readFile(f.storage_key);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from('DATO-PRIVADO-EXIF'))).toBe(false);
    expect(r.body.plan_version_id).toBeTruthy();
  });

  it('el paciente manda un mensaje con imagen', async () => {
    const r = await pc.post('/api/me/messages', { body: '¿Puedo cambiar el arroz por fideos?' });
    expect(r.status).toBe(201);
    const img = await pc.upload('/api/me/messages', 'file', await jpegWithExif(), 'foto.jpg', { body: 'Así quedó' });
    expect(img.status).toBe(201);
    expect(img.body.file_url).toMatch(/^\/api\/files\//);
  });

  it('la profesional ve los registros, la foto y los mensajes, y responde', async () => {
    const dash = await pro.get('/api/pro/dashboard');
    expect(dash.body.unread.find((u: any) => u.patient_id === patientId).count).toBe(2);
    expect(dash.body.newLogs.find((u: any) => u.patient_id === patientId).count).toBe(1);
    const logs = await pro.get(`/api/pro/patients/${patientId}/logs`);
    expect(logs.body.meals[0].comment).toBe('Comí la mitad del arroz');
    expect(logs.body.meals[0].plan_title).toBe('Plan de prueba');
    const photo = await pro.get(logs.body.meals[0].photo_url);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.headers['cache-control']).toContain('no-store');

    const msgs = await pro.get(`/api/pro/patients/${patientId}/messages`);
    expect(msgs.body.map((m: any) => m.body)).toContain('¿Puedo cambiar el arroz por fideos?');
    const reply = await pro.post(`/api/pro/patients/${patientId}/messages`, { body: 'Sí, 1 taza de fideos cocidos.' });
    expect(reply.status).toBe(201);
    const mine = await pc.get('/api/me/messages');
    expect(mine.body.messages.at(-1).body).toBe('Sí, 1 taza de fideos cocidos.');
    // Estado de lectura: los mensajes del paciente quedaron leídos por la profesional
    expect(mine.body.messages.filter((m: any) => m.mine).every((m: any) => m.read_at)).toBe(true);
    const notif = await pc.get('/api/notifications');
    expect(notif.body.items.some((n: any) => n.kind === 'mensaje')).toBe(true);
  });

  it('agua y hábitos definidos por la profesional', async () => {
    const today = localDate(new Date(), 'America/Argentina/Buenos_Aires');
    const r = await pc.post('/api/me/habit-logs', { log_date: today, habit_key: 'agua', value: 2 });
    expect(r.status).toBe(201);
    expect(r.body.total).toBe(2);
    expect((await pc.post('/api/me/habit-logs', { log_date: today, habit_key: 'inventado', value: 1 })).status).toBe(400);
  });
});

describe('8. mediciones, historial y gráficos', () => {
  it('registra mediciones de ambos orígenes y las muestra según lo compartido', async () => {
    for (const [kind, value, d] of [['talla', 165, '2026-01-10'], ['peso', 70, '2026-01-10'], ['peso', 68.5, '2026-02-10'], ['cintura', 85, '2026-02-10']] as const) {
      const r = await pro.post(`/api/pro/patients/${patientId}/measurements`, { measured_on: d, kind, value });
      expect(r.status).toBe(201);
    }
    expect((await pro.post(`/api/pro/patients/${patientId}/measurements`, { measured_on: '2026-02-10', kind: 'peso', value: 900 })).status).toBe(400);
    // El paciente informa su peso
    const self = await pc.post('/api/me/measurements', { measured_on: '2026-02-20', kind: 'peso', value: 68.1 });
    expect(self.status).toBe(201);
    expect(self.body.source).toBe('paciente');
    // La talla la registra la profesional
    expect((await pc.post('/api/me/measurements', { measured_on: '2026-02-20', kind: 'talla', value: 170 })).status).toBe(400);

    const hist = await pro.get(`/api/pro/patients/${patientId}/measurements`);
    const pesos = hist.body.rows.filter((r: any) => r.kind === 'peso');
    expect(pesos.map((r: any) => r.value)).toEqual([70, 68.5, 68.1]);
    expect(pesos.map((r: any) => r.source)).toEqual(['profesional', 'profesional', 'paciente']);
    expect(pesos[0].author).toBe('Lic. Prueba Uno');

    // Sin indicadores compartidos el paciente solo ve lo que cargó
    let prog = await pc.get('/api/me/progress');
    expect(prog.body.rows.map((r: any) => r.value)).toEqual([68.1]);
    expect(prog.body.derived.imc).toBeUndefined();

    const settings = { show_nutrients: true, allow_self_measurements: true, allow_body_photos: true, shared_indicators: ['peso', 'imc'], habits: [{ key: 'agua', name: 'Agua', unit: 'vasos', target: 8 }] };
    expect((await pro.patch(`/api/pro/patients/${patientId}`, { settings })).status).toBe(200);
    prog = await pc.get('/api/me/progress');
    expect(prog.body.rows.filter((r: any) => r.kind === 'peso')).toHaveLength(3);
    expect(prog.body.rows.some((r: any) => r.kind === 'cintura')).toBe(false); // no compartida
    expect(prog.body.derived.imc).toHaveLength(3);
    expect(prog.body.derived.imc[0].value).toBeCloseTo(25.7, 1);
  });

  it('fotos corporales privadas, comparables por fecha', async () => {
    const r1 = await pc.upload('/api/me/body-photos', 'file', await jpegWithExif(), 'frente.jpg', { taken_on: '2026-01-10' });
    const r2 = await pc.upload('/api/me/body-photos', 'file', await jpegWithExif(), 'frente2.jpg', { taken_on: '2026-02-10' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const list = await pro.get(`/api/pro/patients/${patientId}/files?kind=foto_corporal`);
    expect(list.body.map((f: any) => f.taken_on)).toEqual(['2026-02-10', '2026-01-10']);
  });
});

describe('9. agenda', () => {
  it('crea un turno, evita superposiciones y el paciente lo confirma', async () => {
    const day = localDate(new Date(Date.now() + 3 * 86400000), 'America/Argentina/Buenos_Aires');
    const a = await pro.post('/api/pro/appointments', { patient_id: patientId, start_local: `${day}T10:00`, minutes: 45, modality: 'presencial', location: 'Consultorio' });
    expect(a.status).toBe(201);
    expect(new Date(a.body.starts_at).toISOString()).toBe(`${day}T13:00:00.000Z`);
    const overlap = await pro.post('/api/pro/appointments', { patient_id: patientId, start_local: `${day}T10:30`, minutes: 30, modality: 'virtual' });
    expect(overlap.status).toBe(409);
    expect(overlap.body.details.overlaps).toHaveLength(1);
    const forced = await pro.post('/api/pro/appointments', { patient_id: patientId, start_local: `${day}T10:30`, minutes: 30, modality: 'virtual', allow_overlap: true });
    expect(forced.status).toBe(201);
    await pro.post(`/api/pro/appointments/${forced.body.id}/status`, { status: 'cancelado' });

    const mine = await pc.get('/api/me/appointments');
    expect(mine.body.appointments.some((x: any) => x.id === a.body.id)).toBe(true);
    expect(mine.body.appointments[0].internal_notes).toBeUndefined();
    const conf = await pc.post(`/api/me/appointments/${a.body.id}/confirm`, {});
    expect(conf.body.status).toBe('confirmado');
    const change = await pc.post(`/api/me/appointments/${a.body.id}/request-change`, { note: 'Prefiero por la tarde' });
    expect(change.body.status).toBe('cambio_solicitado');
    const dash = await pro.get('/api/pro/dashboard');
    expect(dash.body.changeRequests[0].patient_note).toBe('Prefiero por la tarde');
    // Otro paciente no puede confirmarlo
    expect((await pc2.post(`/api/me/appointments/${a.body.id}/confirm`, {})).status).toBe(409);
  });

  it('el recordatorio 24 h antes genera una notificación interna real', async () => {
    const soon = await pro.post('/api/pro/appointments', { patient_id: patientId, start_local: localDateTimeIn(5), minutes: 30, modality: 'telefonica' });
    expect(soon.status).toBe(201);
    const { runReminders } = await import('../server/scheduler.js');
    expect(await runReminders()).toBeGreaterThanOrEqual(1);
    const n = await pc.get('/api/notifications');
    expect(n.body.items.some((x: any) => x.kind === 'recordatorio')).toBe(true);
    expect(await runReminders()).toBe(0); // no duplica
  });
});

function localDateTimeIn(hours: number) {
  const d = new Date(Date.now() + hours * 3600000);
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return s.replace(' ', 'T');
}

describe('10. cambiar el plan conserva el historial', () => {
  it('una nueva versión reemplaza a la anterior sin borrar registros', async () => {
    const nv = await pro.post(`/api/pro/plans/${planId}/new-version`, {});
    expect(nv.status).toBe(201);
    expect(nv.body.version_no).toBe(2);
    // La versión publicada no se puede editar directamente
    const content = sampleContent(false);
    content.general_notes = 'Versión 2';
    content.show_nutrients = true;
    const stale = await pro.put(`/api/pro/plans/${planId}/draft`, { title: 'Plan de prueba', content, version_id: versionId });
    expect(stale.status).toBe(409);
    const save = await pro.put(`/api/pro/plans/${planId}/draft`, { title: 'Plan de prueba', content, version_id: nv.body.id });
    expect(save.status).toBe(200);
    // Mientras tanto el paciente sigue viendo la versión 1
    expect((await pc.get('/api/me/plan')).body.version_no).toBe(1);
    expect((await pro.post(`/api/pro/plans/${planId}/publish`, {})).status).toBe(200);
    const now = await pc.get('/api/me/plan');
    expect(now.body.version_no).toBe(2);
    expect(now.body.content.general_notes).toBe('Versión 2');
    expect(now.body.content.days[0].meals.desayuno[0].snapshot.energy_kcal).toBe(34);

    const versions = await q('select version_no, status from plan_versions where plan_id=$1 order by version_no', [planId]);
    expect(versions).toEqual([{ version_no: 1, status: 'reemplazado' }, { version_no: 2, status: 'publicado' }]);
    const logs = await q('select l.plan_version_id from meal_logs l where l.patient_id=$1', [patientId]);
    expect(logs).toHaveLength(1);
    expect(logs[0].plan_version_id).toBe(versionId); // sigue apuntando a la versión 1
    const v1 = await one('select content from plan_versions where id=$1', [versionId]);
    expect(v1.content.general_notes).toBe('Plan de prueba');
  });

  it('un segundo plan publicado reemplaza al anterior (solo uno vigente)', async () => {
    const p2 = await pro.post('/api/pro/plans', { title: 'Plan nuevo copiado', patient_id: patientId, from_plan_id: planId });
    expect(p2.status).toBe(201);
    await pro.post(`/api/pro/plans/${p2.body.id}/publish`, {});
    expect((await pc.get('/api/me/plan')).body.title).toBe('Plan nuevo copiado');
    const old = await q("select status from plan_versions where plan_id=$1 and version_no=2", [planId]);
    expect(old[0].status).toBe('reemplazado');
  });
});

describe('11. aislamiento entre profesionales y pacientes', () => {
  beforeAll(async () => {
    const doc = await pro.upload(`/api/pro/patients/${patientId}/files`, 'file', Buffer.from('%PDF-1.4\n% documento de prueba\n'), 'estudio.pdf', { kind: 'documento', title: 'Análisis', shared: 'false' });
    expect(doc.status).toBe(201);
    docFileId = doc.body.id;
    await pro.post(`/api/pro/patients/${patientId}/consultations`, { date: '2026-02-10', title: 'Control', internal_notes: 'NOTA-INTERNA-SECRETA', shared_notes: 'Indicaciones compartidas' });
  });

  it('otra profesional no accede a pacientes, planes, archivos ni mensajes ajenos', async () => {
    const urls = [
      `/api/pro/patients/${patientId}`,
      `/api/pro/patients/${patientId}/clinical`,
      `/api/pro/patients/${patientId}/consultations`,
      `/api/pro/patients/${patientId}/measurements`,
      `/api/pro/patients/${patientId}/messages`,
      `/api/pro/patients/${patientId}/logs`,
      `/api/pro/patients/${patientId}/files`,
      `/api/pro/patients/${patientId}/export`,
      `/api/pro/patients/${patientId}/plans`,
      `/api/pro/plans/${planId}`,
      `/api/pro/plans/${planId}/pdf`,
      `/api/files/${photoFileId}`,
      `/api/files/${docFileId}`,
    ];
    for (const u of urls) {
      const r = await pro2.get(u);
      expect([403, 404], u).toContain(r.status);
    }
    const writes = [
      pro2.post(`/api/pro/patients/${patientId}/messages`, { body: 'intruso' }),
      pro2.put(`/api/pro/patients/${patientId}/clinical`, { data: {}, allergens: [], restriction_notes: '' }),
      pro2.post(`/api/pro/plans/${planId}/publish`, {}),
      pro2.post('/api/pro/appointments', { patient_id: patientId, start_local: '2027-01-01T10:00', minutes: 30, modality: 'virtual' }),
      pro2.post('/api/pro/plans', { title: 'x', patient_id: patientId }),
      pro2.post('/api/pro/plans', { title: 'x', from_plan_id: planId }),
    ];
    for (const w of await Promise.all(writes)) expect(w.status).toBe(404);
    const list = await pro2.get('/api/pro/patients');
    expect(list.body.some((p: any) => p.id === patientId)).toBe(false);
  });

  it('otro paciente no accede a archivos ni datos del primero', async () => {
    expect((await pc2.get(`/api/files/${photoFileId}`)).status).toBe(404);
    expect((await pc2.get(`/api/files/${docFileId}`)).status).toBe(404);
    expect((await pc2.get('/api/me/messages')).body.messages).toHaveLength(0);
    expect((await pc2.get(`/api/pro/patients/${patientId}`)).status).toBe(403);
    expect((await pc2.get('/api/pro/dashboard')).status).toBe(403);
  });

  it('el paciente no ve notas internas ni documentos no compartidos', async () => {
    expect((await pc.get(`/api/files/${docFileId}`)).status).toBe(404);
    const prog = await pc.get('/api/me/progress');
    expect(JSON.stringify(prog.body)).not.toContain('NOTA-INTERNA-SECRETA');
    expect(prog.body.notes[0].shared_notes).toBe('Indicaciones compartidas');
    expect((await pc.get('/api/me/documents')).body).toHaveLength(0);
    await pro.patch(`/api/pro/patients/${patientId}/files/${docFileId}`, { shared_with_patient: true });
    expect((await pc.get(`/api/files/${docFileId}`)).status).toBe(200);
    // La exportación del paciente tampoco incluye notas internas
    const exp = await pc.get('/api/me/export').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(exp.status).toBe(200);
    const { execFileSync } = await import('node:child_process');
    const fs = await import('node:fs');
    fs.mkdirSync('storage-test', { recursive: true });
    fs.writeFileSync('storage-test/exp.zip', exp.body as Buffer);
    const json = execFileSync('unzip', ['-p', 'storage-test/exp.zip', 'datos.json']).toString();
    expect(json).toContain('Indicaciones compartidas');
    expect(json).not.toContain('NOTA-INTERNA-SECRETA');
  });

  it('alimentos privados de otra profesional no se pueden usar', async () => {
    const own = await pro.post('/api/foods', { kind: 'generico', name: 'Alimento privado de prueba', category: 'Otros', basis_amount: 100, basis_unit: 'g', energy_kcal: 100, protein_g: null, carbs_g: 10, fat_g: 0, source: 'Carga manual de prueba' });
    expect(own.status).toBe(201);
    expect((await pro2.get(`/api/foods/${own.body.id}`)).status).toBe(404);
    const search = await pro2.get('/api/foods?search=privado de prueba');
    expect(search.body).toHaveLength(0);
    const p = await pro2.post('/api/pro/plans', { title: 'Plantilla', weeks: 1 });
    const det = await pro2.get(`/api/pro/plans/${p.body.id}`);
    const content = sampleContent(false);
    content.days[0].meals.cena = [{ id: 'z', food_id: own.body.id, quantity: 100, unit: 'g' }] as any;
    const r = await pro2.put(`/api/pro/plans/${p.body.id}/draft`, { title: 'x', content, version_id: det.body.version.id });
    expect(r.status).toBe(400);
  });

  it('un paciente archivado pierde el acceso', async () => {
    const extra = await newPatientWithAccount(pro, 'Temporal', 'Archivable');
    expect((await extra.pc.get('/api/me/home')).status).toBe(200);
    await pro.post(`/api/pro/patients/${extra.patientId}/archive`, {});
    expect((await extra.pc.get('/api/me/home')).status).toBe(401);
    const relog = client();
    expect((await relog.post('/api/auth/login', { email: extra.email, password: PASSWORD })).status).toBe(403);
  });
});

describe('12. persistencia tras cerrar sesión', () => {
  it('los datos siguen disponibles al volver a iniciar sesión', async () => {
    expect((await pc.post('/api/auth/logout', {})).status).toBe(200);
    expect((await pc.get('/api/me/plan')).status).toBe(401);
    const again = client();
    const login = await again.post('/api/auth/login', { email: patientEmail, password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await again.get('/api/me/plan')).body.title).toBe('Plan nuevo copiado');
    expect((await again.get('/api/me/meal-logs')).body).toHaveLength(1);
    expect((await again.get('/api/me/messages')).body.messages.length).toBeGreaterThanOrEqual(3);
    pc = again;
  });

  it('contraseña incorrecta no inicia sesión y el mensaje no revela si el correo existe', async () => {
    const c = client();
    const a = await c.post('/api/auth/login', { email: patientEmail, password: 'incorrecta-123' });
    const b = await c.post('/api/auth/login', { email: 'no-existe@test.local', password: 'incorrecta-123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('restablecimiento de contraseña con enlace generado por la profesional', async () => {
    const r = await pro.post(`/api/pro/patients/${patientId}/reset-link`, {});
    const token = r.body.link.split('/').pop();
    const anon = client();
    expect((await anon.post('/api/auth/reset', { token, password: 'Nueva-Clave-456' })).status).toBe(200);
    expect((await anon.post('/api/auth/reset', { token, password: 'Otra-Clave-789' })).status).toBe(410);
    // La sesión previa se cierra
    expect((await pc.get('/api/me/plan')).status).toBe(401);
    const c = client();
    expect((await c.post('/api/auth/login', { email: patientEmail, password: 'Nueva-Clave-456' })).status).toBe(200);
    pc = c;
  });
});

describe('13. errores habituales sin pérdida de datos ni éxito falso', () => {
  it('archivo no permitido: se rechaza y no se crea el registro', async () => {
    const before = await one('select count(*)::int as n from meal_logs where patient_id=$1', [patientId]);
    const today = localDate(new Date(), 'America/Argentina/Buenos_Aires');
    const r = await pc.upload('/api/me/meal-logs', 'photo', Buffer.from('<script>alert(1)</script>'), 'foto.jpg', { log_date: today, meal_name: 'Cena', status: 'cumplida' });
    expect(r.status).toBe(415);
    expect(r.body.error).toMatch(/Formato no permitido/);
    const after = await one('select count(*)::int as n from meal_logs where patient_id=$1', [patientId]);
    expect(after.n).toBe(before.n);
    // Un PDF no se acepta como foto
    const pdf = await pc.upload('/api/me/messages', 'file', Buffer.from('%PDF-1.4 x'), 'a.pdf', {});
    expect(pdf.status).toBe(415);
  });

  it('archivo demasiado grande', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const r = await pc.upload('/api/me/messages', 'file', big, 'grande.jpg', {});
    expect(r.status).toBe(413);
  });

  it('validaciones con mensajes claros', async () => {
    const r = await pro.post('/api/pro/patients', { first_name: '', last_name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.details[0].mensaje).toBe('Ingresá el nombre');
    const f = await pro.post('/api/foods', { kind: 'producto', name: 'Sin marca', category: 'Otros', basis_amount: 100, basis_unit: 'g', energy_kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, source: 'Etiqueta' });
    expect(f.status).toBe(400);
    expect(f.body.error).toMatch(/marca/);
    const future = await pc.post('/api/me/meal-logs', { log_date: '2099-01-01', meal_name: 'Cena', status: 'cumplida' });
    expect(future.status).toBe(400);
  });

  it('plan vacío no se publica', async () => {
    const p = await pro.post('/api/pro/plans', { title: 'Vacío', patient_id: patientId });
    const r = await pro.post(`/api/pro/plans/${p.body.id}/publish`, {});
    expect(r.status).toBe(400);
    expect((await pc.get('/api/me/plan')).body.title).toBe('Plan nuevo copiado');
  });

  it('solicitudes sin encabezado anti-CSRF se rechazan', async () => {
    const r = await pro.agent.post('/api/pro/patients').send({ first_name: 'A', last_name: 'B' });
    expect(r.status).toBe(403);
  });

  it('eliminar un paciente exige archivarlo y confirmar el nombre', async () => {
    const extra = await newPatientWithAccount(pro, 'Borrable', 'Prueba');
    expect((await pro.del(`/api/pro/patients/${extra.patientId}`, { confirm_name: 'Borrable Prueba' })).status).toBe(409);
    await pro.post(`/api/pro/patients/${extra.patientId}/archive`, {});
    expect((await pro.del(`/api/pro/patients/${extra.patientId}`, { confirm_name: 'Otro nombre' })).status).toBe(400);
    expect((await pro.del(`/api/pro/patients/${extra.patientId}`, { confirm_name: 'borrable prueba' })).status).toBe(200);
    expect((await pro.get(`/api/pro/patients/${extra.patientId}`)).status).toBe(404);
  });

  it('auditoría registra autor y fecha sin contenido clínico', async () => {
    const a = await pro.get(`/api/pro/patients/${patientId}/audit`);
    const actions = a.body.map((x: any) => x.action);
    expect(actions).toContain('plan_publicado');
    expect(actions).toContain('historia_clinica_editada');
    expect(a.body[0].actor).toBeTruthy();
    const all = await q('select meta::text from audit_log where meta is not null');
    expect(all.map((x) => x.meta).join(' ')).not.toContain('NOTA-INTERNA');
  });
});

describe('alimentos, recetas e importación', () => {
  it('receta propia: valores por porción con rendimiento declarado', async () => {
    const r = await pro.post('/api/foods/recipes', {
      name: 'Avena con leche (prueba)',
      servings: 2,
      yield_grams: 500, // la avena absorbe la leche; peso declarado tras cocción
      preparation: 'Cocinar la avena en la leche 5 minutos.',
      ingredients: [{ ingredient_id: ids.avena, quantity: 80, unit: 'g' }, { ingredient_id: ids.leche, quantity: 400, unit: 'ml' }],
    });
    expect(r.status).toBe(201);
    const kcalTotal = 379 * 0.8 + 0.34 * 400 * 1.0356; // densidad almacenada (245 g / 236,588 ml, 4 decimales)
    expect(r.body.computed.perServing.energy_kcal).toBeCloseTo(kcalTotal / 2, 3);
    const f = await pro.get(`/api/foods/${r.body.id}`);
    expect(f.body.energy_kcal).toBeCloseTo((kcalTotal / 500) * 100, 3);
    expect(f.body.measures.find((m: any) => m.name === '1 porción').amount).toBe(250);
    expect(f.body.allergens).toContain('gluten');
  });

  it('importación CSV valida antes de guardar y distingue vacío de cero', async () => {
    const csv = [
      'tipo;nombre;marca;categoria;presentacion;estado;cantidad_referencia;unidad_referencia;energia_kcal;proteinas_g;carbohidratos_g;grasas_g;fibra_g;sodio_mg;alergenos;fuente;fecha_fuente',
      'producto;Galletitas de prueba;Marca X;Panificados;Paquete 200 g;listo_para_consumir;30;g;135;2,1;20;5;;95;gluten;Etiqueta del envase;2026-10-01',
      'generico;Fila con error;;Categoría inexistente;;;100;g;abc;1;1;1;;;;Fuente;',
    ].join('\n');
    const dry = await pro.post('/api/foods/import', { csv, dry_run: true });
    expect(dry.body.valid).toBe(1);
    expect(dry.body.errors[0].fila).toBe(3);
    expect((await pro.post('/api/foods/import', { csv, dry_run: false })).status).toBe(400);
    const ok = await pro.post('/api/foods/import', { csv: csv.split('\n').slice(0, 2).join('\n'), dry_run: false });
    expect(ok.body.imported).toBe(1);
    const found = await pro.get('/api/foods?search=galletitas de prueba');
    expect(found.body[0].brand).toBe('Marca X');
    expect(found.body[0].verification).toBe('sin_verificar');
    const full = await one('select fiber_g, fat_g, protein_g from foods where id=$1', [found.body[0].id]);
    expect(full.fiber_g).toBeNull(); // vacío = faltante
    expect(full.protein_g).toBe(2.1); // coma decimal
  });

  it('búsqueda por nombre sin tildes, marca y categoría', async () => {
    const r = await pro.get('/api/foods?search=zzzinexistente');
    expect(r.body).toHaveLength(0);
    const r2 = await pro.get('/api/foods?search=limon');
    expect(r2.body[0].name).toMatch(/Limón/);
    const r3 = await pro.get('/api/foods?category=Legumbres');
    expect(r3.body.length).toBeGreaterThanOrEqual(10);
    expect(r3.body.every((f: any) => f.category === 'Legumbres')).toBe(true);
  });
});
