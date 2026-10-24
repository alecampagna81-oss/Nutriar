// Datos de DEMOSTRACIÓN: profesionales, pacientes y productos ficticios.
// Nunca usar en un entorno con datos reales. Uso: npx tsx scripts/seed-demo.ts [--reset]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, one } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { hashPassword, hashToken } from '../server/lib/security.js';
import { prepareContent } from '../server/lib/plans.js';
import { seedCatalog } from './seed-catalog.js';
import { defaultPlanContent, type PlanItem } from '../shared/nutrition.js';
import { localDate } from '../shared/time.js';

export const DEMO_PASSWORD = 'Demo-NutriAR-2026';
export const DEMO = {
  pro: 'nutri@demo.nutriar.local',
  pro2: 'otra.nutri@demo.nutriar.local',
  patient: 'paciente@demo.nutriar.local',
  patient2: 'otro.paciente@demo.nutriar.local',
};

async function food(name: string) {
  const f = await one('select id from foods where name=$1 and owner_id is null', [name]);
  if (!f) throw new Error(`Falta el alimento ${name}`);
  return f.id as string;
}
async function measure(foodId: string, startsWith: string) {
  const m = await one('select id from food_measures where food_id=$1 and name like $2', [foodId, startsWith + '%']);
  return m.id as string;
}

export async function resetDemo() {
  const users = await q("select id from users where email like '%@demo.nutriar.local'");
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const files = await q('select f.storage_key from files f join patients p on p.id=f.patient_id where p.professional_id = any($1)', [ids]);
  const { deleteFile } = await import('../server/lib/storage.js');
  for (const f of files) await deleteFile(f.storage_key);
  await q('delete from appointments where professional_id = any($1)', [ids]);
  await q('delete from patients where professional_id = any($1)', [ids]);
  await q('delete from plans where professional_id = any($1)', [ids]);
  await q('delete from questionnaire_questions where professional_id = any($1)', [ids]);
  await q('delete from recipe_ingredients where recipe_id in (select id from foods where owner_id = any($1))', [ids]);
  await q('delete from foods where owner_id = any($1)', [ids]);
  await q("delete from user_sessions where sess->>'userId' = any($1)", [ids]);
  await q('delete from audit_log where actor_id = any($1)', [ids]);
  await q('delete from users where id = any($1)', [ids]);
}

async function user(email: string, name: string, role: 'professional' | 'patient') {
  const u = await one('insert into users(email, password_hash, role, name) values ($1,$2,$3,$4) returning id', [email, await hashPassword(DEMO_PASSWORD), role, name]);
  if (role === 'professional') await q('insert into professionals(user_id, license_number) values ($1, $2)', [u.id, 'M.N. 0000 (ficticia)']);
  return u.id as string;
}

export async function seedDemo() {
  await resetDemo();
  await seedCatalog(false);
  // Productos de marca FICTICIOS, solo para demostrar la carga de etiquetas.
  await q("delete from foods where is_demo and owner_id is null and kind='producto' and not exists (select 1 from recipe_ingredients ri where ri.ingredient_id=foods.id)");
  for (const p of [
    ['[DEMO] Galletas de arroz', 'Marca Demo (ficticia)', 'Panificados', 'Paquete 100 g', 100, 380, 7.5, 82, 2.8],
    ['[DEMO] Yogur bebible descremado frutilla', 'Marca Demo (ficticia)', 'Lácteos y huevos', 'Botella 1 l', 100, 45, 3, 7.4, null],
  ] as const) {
    await q(
      `insert into foods(kind, name, brand, category, presentation, state, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, source, verification, is_demo, owner_id, visibility, label_data, dataset)
       select 'producto',$1,$2,$3,$4,'listo_para_consumir',$5,'g',$6,$7,$8,$9,'Datos FICTICIOS para demostración. No usar clínicamente.','demo',true,null,'catalogo','{"serving_size":"ficticio"}','Demo'
       where not exists (select 1 from foods where name=$1 and is_demo)`,
      [...p],
    );
  }

  const pro = await user(DEMO.pro, 'Lic. Valeria Demo', 'professional');
  const pro2 = await user(DEMO.pro2, 'Lic. Otra Profesional Demo', 'professional');
  const patUser = await user(DEMO.patient, 'Lucía Ficticia Pérez', 'patient');
  const pat2User = await user(DEMO.patient2, 'Paciente De Otra Profesional', 'patient');
  await q("update professionals set response_hours='Lunes a viernes de 9 a 17 h. Respondo dentro de las 48 h hábiles.' where user_id=$1", [pro]);

  const lucia = await one(
    `insert into patients(professional_id, user_id, first_name, last_name, email, phone, birth_date, sex, show_nutrients, allow_self_measurements, allow_body_photos, shared_indicators, habits)
     values ($1,$2,'Lucía','Ficticia Pérez',$3,'11 0000-0000','1990-05-12','femenino',true,true,true,'{peso,cintura,imc}',$4) returning id`,
    [pro, patUser, DEMO.patient, JSON.stringify([{ key: 'agua', name: 'Agua', unit: 'vasos', target: 8 }, { key: 'caminata', name: 'Caminata', unit: 'minutos', target: 30 }])],
  );
  const martin = await one("insert into patients(professional_id, first_name, last_name, email, sex) values ($1,'Martín','Ejemplo Gómez','martin@demo.nutriar.local','masculino') returning id", [pro]);
  const other = await one("insert into patients(professional_id, user_id, first_name, last_name, email) values ($1,$2,'Paciente','De Otra Profesional',$3) returning id", [pro2, pat2User, DEMO.patient2]);
  for (const p of [lucia, martin, other]) await q('insert into clinical_records(patient_id) values ($1)', [p.id]);
  await q(
    `update clinical_records set allergens='{frutos_secos}', restriction_notes='Alergia a frutos secos referida por la paciente (dato ficticio).',
       data=$2, updated_by=$3 where patient_id=$1`,
    [lucia.id, { motivo: 'Quiere ordenar sus comidas y mejorar su energía durante el día (caso ficticio).', objetivos: 'Incorporar verduras en almuerzo y cena; desayunar todos los días.', alimentos_rechazados: 'Hígado', actividad_fisica: 'Camina 3 veces por semana.', horarios: 'Trabaja de 9 a 18 h.' }, pro],
  );
  // Invitación pendiente para Martín (el enlace real no se conoce: solo su hash)
  await q("insert into invitations(patient_id, token_hash, email, created_by, expires_at) values ($1,$2,$3,$4, now() + interval '7 days')", [martin.id, hashToken('demo-invitacion-no-utilizable-' + Date.now()), 'martin@demo.nutriar.local', pro]);

  // Plan publicado para Lucía
  const ids = {
    leche: await food('Leche descremada'),
    avena: await food('Avena arrollada (tradicional o instantánea), cruda'),
    banana: await food('Banana'),
    pan: await food('Pan de molde integral'),
    queso: await food('Queso crema'),
    pollo: await food('Pechuga de pollo sin piel, asada'),
    arroz: await food('Arroz blanco largo fino, hervido'),
    lentejas: await food('Lentejas hervidas, sin sal'),
    tomate: await food('Tomate rojo crudo'),
    lechuga: await food('Lechuga de hoja verde'),
    aceite: await food('Aceite de oliva'),
    yogur: await food('Yogur natural descremado (sin azúcar)'),
    manzana: await food('Manzana con cáscara'),
    huevo: await food('Huevo duro'),
    calabaza: await food('Calabaza (anco / butternut) cruda'),
    ensalada: await food('Ensalada de garbanzos, tomate y cebolla'),
    licuado: await food('Licuado de banana con leche'),
  };
  const it = (id: string, food_id: string, quantity: number, unit: PlanItem['unit'], extra: Partial<PlanItem> = {}): PlanItem => ({ id, food_id, quantity, unit, ...extra });
  const content = defaultPlanContent(1);
  content.show_nutrients = true;
  content.general_notes = 'Plan de DEMOSTRACIÓN con paciente ficticia. Tomá agua a lo largo del día.';
  content.supplements = [{ name: 'Vitamina D (ejemplo ficticio)', dose: 'según indicación', frequency: 'semanal', timing: 'con el almuerzo', notes: 'Indicación registrada por la profesional' }];
  const aceiteCda = await measure(ids.aceite, '1 cucharada');
  for (const d of content.days) {
    d.meals.desayuno = [
      it(`d${d.day}a`, ids.leche, 250, 'ml'),
      it(`d${d.day}b`, ids.avena, 30, 'g', { alternatives: [{ id: `d${d.day}b1`, food_id: ids.pan, quantity: 2, unit: 'medida', measure_id: await measure(ids.pan, '1 rebanada'), note: 'con queso crema' }] }),
      it(`d${d.day}c`, ids.banana, 1, 'medida', { measure_id: await measure(ids.banana, '1 taza') }),
    ];
    d.meals.almuerzo = d.day % 2
      ? [it(`a${d.day}a`, ids.pollo, 150, 'g'), it(`a${d.day}b`, ids.arroz, 1, 'medida', { measure_id: await measure(ids.arroz, '1 taza') }), it(`a${d.day}c`, ids.lechuga, 50, 'g'), it(`a${d.day}d`, ids.tomate, 100, 'g'), it(`a${d.day}e`, ids.aceite, 1, 'medida', { measure_id: aceiteCda })]
      : [it(`a${d.day}a`, ids.ensalada, 1, 'porcion'), it(`a${d.day}b`, ids.huevo, 50, 'g')];
    d.meals.merienda = [it(`m${d.day}a`, ids.yogur, 170, 'g'), it(`m${d.day}b`, ids.manzana, 150, 'g', { gross: true, alternatives: [{ id: `m${d.day}b1`, food_id: ids.banana, quantity: 100, unit: 'g' }] })];
    d.meals.cena = [it(`c${d.day}a`, ids.lentejas, 200, 'g'), it(`c${d.day}b`, ids.calabaza, 200, 'g'), it(`c${d.day}c`, ids.aceite, 1, 'medida', { measure_id: aceiteCda })];
  }
  const prepared = await prepareContent(content, pro);
  const plan = await one("insert into plans(professional_id, patient_id, title) values ($1,$2,'Plan semanal - octubre') returning id", [pro, lucia.id]);
  const today = localDate(new Date(), 'America/Argentina/Buenos_Aires');
  const v = await one("insert into plan_versions(plan_id, version_no, status, content, start_date, created_by, published_at) values ($1,1,'publicado',$2,$3,$4, now()) returning id", [plan.id, JSON.stringify(prepared), today, pro]);
  // Plantilla
  const tpl = await one("insert into plans(professional_id, is_template, title) values ($1,true,'Plantilla base 4 comidas') returning id", [pro]);
  await q("insert into plan_versions(plan_id, version_no, status, content, created_by) values ($1,1,'borrador',$2,$3)", [tpl.id, JSON.stringify(prepared), pro]);

  // Mediciones (profesional) y una informada por la paciente
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  for (const [d, kind, value, unit] of [[60, 'talla', 164, 'cm'], [60, 'peso', 71.2, 'kg'], [30, 'peso', 70.1, 'kg'], [2, 'peso', 69.4, 'kg'], [60, 'cintura', 86, 'cm'], [2, 'cintura', 83.5, 'cm']] as const) {
    await q("insert into measurements(patient_id, measured_on, kind, value, unit, source, method, created_by) values ($1,$2,$3,$4,$5,'profesional','Balanza y cinta del consultorio',$6)", [lucia.id, daysAgo(d), kind, value, unit, pro]);
  }
  await q("insert into measurements(patient_id, measured_on, kind, value, unit, source, method, created_by) values ($1,$2,'peso',69.8,'kg','paciente','Informada por el paciente',$3)", [lucia.id, daysAgo(15), patUser]);
  await q("insert into goals(patient_id, description, category, target, created_by) values ($1,'Incluir verduras en almuerzo y cena','habito','5 días por semana',$2), ($1,'Desayunar antes de salir de casa','habito','Todos los días',$2)", [lucia.id, pro]);
  await q("insert into consultations(patient_id, date, title, internal_notes, shared_notes, created_by) values ($1,$2,'Primera consulta','NOTA INTERNA DEMO: no debe verla la paciente.','Indicaciones: sumar una porción de verduras en la cena.',$3)", [lucia.id, daysAgo(30), pro]);

  // Turnos (mañana a las 10 y en 8 días)
  const { zonedToUtc } = await import('../shared/time.js');
  const tz = 'America/Argentina/Buenos_Aires';
  const tomorrow = localDate(new Date(Date.now() + 86400000), tz);
  const next = localDate(new Date(Date.now() + 8 * 86400000), tz);
  for (const d of [tomorrow, next]) {
    const s = zonedToUtc(`${d}T10:00`, tz);
    await q("insert into appointments(professional_id, patient_id, starts_at, ends_at, modality, location, created_by) values ($1,$2,$3,$4,'presencial','Consultorio (dirección ficticia)',$1)", [pro, lucia.id, s, new Date(s.getTime() + 45 * 60000)]);
  }
  await q("insert into messages(patient_id, sender_id, body, created_at, read_at) values ($1,$2,'Hola Lucía, ya tenés publicado tu plan. Cualquier duda escribime.', now() - interval '2 days', now() - interval '1 day')", [lucia.id, pro]);
  await q("insert into messages(patient_id, sender_id, body, created_at) values ($1,$2,'¡Gracias! ¿Puedo cambiar la avena por pan?', now() - interval '3 hours')", [lucia.id, patUser]);
  await q("insert into questionnaire_questions(professional_id, text, kind, options, position) values ($1,'¿Cuántas veces por semana comés fuera de casa?','opciones','[\"Nunca\",\"1 a 2\",\"3 o más\"]',1), ($1,'¿Tenés horarios rotativos?','si_no','[]',2)", [pro]);
  const qs = await q('select id, text, kind, options from questionnaire_questions where professional_id=$1 order by position', [pro]);
  await q('insert into questionnaires(patient_id, questions, requested_by) values ($1,$2,$3)', [lucia.id, JSON.stringify(qs), pro]);
  await q("insert into meal_logs(patient_id, plan_version_id, log_date, meal_key, meal_name, status, comment, created_by) values ($1,$2,$3,'desayuno','Desayuno','cumplida','Muy rico',$4)", [lucia.id, v.id, daysAgo(1), patUser]);
  return { pro, pro2, lucia: lucia.id, martin: martin.id, other: other.id };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate(false)
    .then(() => seedDemo())
    .then(() => {
      console.log('Datos de demostración cargados.');
      console.log(`Profesional: ${DEMO.pro} / ${DEMO_PASSWORD}`);
      console.log(`Paciente:    ${DEMO.patient} / ${DEMO_PASSWORD}`);
      console.log(`Otra profesional (aislamiento): ${DEMO.pro2} / ${DEMO_PASSWORD}`);
      return pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
