import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db.js';
import { selfPatient } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { streamExportZip } from '../lib/export.js';
import { fileUrl, storeUpload } from '../lib/files.js';
import { dateStr, HttpError, notFound, param, parse, user } from '../lib/http.js';
import { listMessages, sendMessage } from '../lib/messages.js';
import { notify } from '../lib/notify.js';
import { planPdf } from '../lib/pdf.js';
import { activeVersion, stripNutrients } from '../lib/plans.js';
import { upload } from '../lib/uploads.js';
import { validateMeasurement } from './pro.js';
import { shoppingForWeek } from './plans.js';
import { derivedSeries, kindByKey, MEASURE_KINDS } from '../../shared/measures.js';
import { localDate } from '../../shared/time.js';

export const patientRouter = Router();

async function tzFor(professionalId: string) {
  return (await one('select timezone from professionals where user_id=$1', [professionalId])).timezone as string;
}

// Inicio ---------------------------------------------------------------------------

patientRouter.get('/home', async (req, res) => {
  const p = await selfPatient(req);
  const tz = await tzFor(p.professional_id);
  const today = localDate(new Date(), tz);
  const v = await activeVersion(p.id);
  const next = await one("select id, starts_at, ends_at, status, modality, location from appointments where patient_id=$1 and starts_at > now() and status <> 'cancelado' order by starts_at limit 1", [p.id]);
  const unread = await one('select count(*)::int as n from messages where patient_id=$1 and sender_id<>$2 and read_at is null', [p.id, user(req).id]);
  const questionnaire = await one("select id from questionnaires where patient_id=$1 and status='pendiente' limit 1", [p.id]);
  const logs = await q('select meal_key, status from meal_logs where patient_id=$1 and log_date=$2', [p.id, today]);
  const habits = await q('select habit_key, sum(value)::float as total from habit_logs where patient_id=$1 and log_date=$2 group by habit_key', [p.id, today]);
  res.json({
    today,
    timezone: tz,
    plan: v ? { id: v.id, title: v.title, start_date: v.start_date, content: stripNutrients(v.content) } : null,
    next_appointment: next ?? null,
    unread: unread.n,
    pending_questionnaire: questionnaire?.id ?? null,
    logs_today: logs,
    habits_today: habits,
    habit_defs: p.habits,
  });
});

// Plan vigente ------------------------------------------------------------------------

patientRouter.get('/plan', async (req, res) => {
  const p = await selfPatient(req);
  const v = await activeVersion(p.id);
  if (!v) return res.json(null);
  res.json({ id: v.id, title: v.title, version_no: v.version_no, published_at: v.published_at, start_date: v.start_date, content: stripNutrients(v.content) });
});

patientRouter.get('/plan/shopping', async (req, res) => {
  const p = await selfPatient(req);
  const v = await activeVersion(p.id);
  if (!v) throw notFound('Plan');
  res.json(shoppingForWeek(v.content, Number(req.query.week ?? 1)));
});

patientRouter.get('/plan/pdf', async (req, res) => {
  const p = await selfPatient(req);
  const v = await activeVersion(p.id);
  if (!v) throw notFound('Plan');
  const pro = await one('select name from users where id=$1', [p.professional_id]);
  const pdf = await planPdf({
    title: v.title,
    patientName: `${p.first_name} ${p.last_name}`,
    professionalName: pro.name,
    versionNo: v.version_no,
    publishedAt: v.published_at,
    content: v.content,
    showNutrients: Boolean(v.content.show_nutrients),
    compress: req.query.raw !== '1',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="mi-plan.pdf"');
  res.send(pdf);
});

// Registro de comidas y hábitos ---------------------------------------------------------

patientRouter.get('/meal-logs', async (req, res) => {
  const p = await selfPatient(req);
  const rows = await q('select id, log_date, meal_key, meal_name, status, description, comment, difficulty, photo_file_id, created_at from meal_logs where patient_id=$1 order by log_date desc, created_at desc limit 200', [p.id]);
  res.json(rows.map((r) => ({ ...r, photo_url: fileUrl(r.photo_file_id) })));
});

patientRouter.post('/meal-logs', upload.single('photo'), async (req, res) => {
  const p = await selfPatient(req);
  const u = user(req);
  const b = parse(
    z.object({
      log_date: dateStr,
      meal_key: z.string().max(40).optional().nullable(),
      meal_name: z.string().trim().min(1, 'Indicá la comida').max(60),
      status: z.enum(['cumplida', 'parcial', 'no_cumplida', 'fuera_del_plan']),
      description: z.string().max(1000).optional().nullable(),
      comment: z.string().max(1000).optional().nullable(),
      difficulty: z.string().max(1000).optional().nullable(),
    }),
    req.body,
  );
  const tz = await tzFor(p.professional_id);
  if (b.log_date > localDate(new Date(), tz)) throw new HttpError(400, 'No podés registrar comidas de fechas futuras');
  const v = await activeVersion(p.id);
  // Primero se valida y guarda la foto; si falla, no se crea el registro.
  const photo = req.file ? await storeUpload(req, p.id, 'foto_comida', { shared: true }) : null;
  const row = await one(
    'insert into meal_logs(patient_id, plan_version_id, log_date, meal_key, meal_name, status, description, comment, difficulty, photo_file_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *',
    [p.id, v?.id ?? null, b.log_date, b.meal_key ?? null, b.meal_name, b.status, b.description ?? null, b.comment ?? null, b.difficulty ?? null, photo?.id ?? null, u.id],
  );
  await audit(u.id, 'registro_comida', 'registro', row.id, p.id);
  res.status(201).json({ ...row, photo_url: fileUrl(row.photo_file_id) });
});

patientRouter.post('/habit-logs', async (req, res) => {
  const p = await selfPatient(req);
  const b = parse(z.object({ log_date: dateStr, habit_key: z.string().max(40), value: z.coerce.number().min(-50).max(100) }), req.body);
  if (!p.habits.some((h) => h.key === b.habit_key)) throw new HttpError(400, 'Hábito no habilitado por tu profesional');
  const row = await one('insert into habit_logs(patient_id, log_date, habit_key, value, created_by) values ($1,$2,$3,$4,$5) returning *', [p.id, b.log_date, b.habit_key, b.value, user(req).id]);
  const total = await one('select sum(value)::float as total from habit_logs where patient_id=$1 and log_date=$2 and habit_key=$3', [p.id, b.log_date, b.habit_key]);
  if (total.total < 0) {
    await q('delete from habit_logs where id=$1', [row.id]);
    throw new HttpError(400, 'El total del día no puede ser negativo');
  }
  res.status(201).json({ ...row, total: total.total });
});

patientRouter.get('/habit-logs', async (req, res) => {
  const p = await selfPatient(req);
  res.json(await q('select log_date, habit_key, sum(value)::float as total from habit_logs where patient_id=$1 group by log_date, habit_key order by log_date desc limit 120', [p.id]));
});

// Mediciones, avances y fotos corporales ---------------------------------------------

patientRouter.get('/progress', async (req, res) => {
  const p = await selfPatient(req);
  const shared = new Set(p.shared_indicators);
  // El paciente ve sus propias cargas y los indicadores que la profesional compartió.
  const rows = await q(
    "select id, measured_on, kind, value, unit, source, created_at from measurements where patient_id=$1 and deleted_at is null and (source='paciente' or kind = any($2::text[])) order by measured_on, created_at",
    [p.id, [...shared]],
  );
  const derived: Record<string, unknown> = {};
  if (shared.has('imc')) {
    const all = await q("select measured_on, kind, value from measurements where patient_id=$1 and deleted_at is null and kind in ('peso','talla')", [p.id]);
    derived.imc = derivedSeries(all, 'imc');
  }
  const goals = await q('select id, description, category, target, status, created_at from goals where patient_id=$1 and shared order by created_at', [p.id]);
  const notes = await q("select id, date, title, shared_notes from consultations where patient_id=$1 and shared_notes <> '' order by date desc", [p.id]);
  res.json({
    kinds: MEASURE_KINDS.filter((k) => shared.has(k.key) || (p.allow_self_measurements && k.patientCanReport)),
    shared_indicators: [...shared],
    allow_self_measurements: p.allow_self_measurements,
    allow_body_photos: p.allow_body_photos,
    rows,
    derived,
    goals,
    notes,
  });
});

patientRouter.post('/measurements', async (req, res) => {
  const p = await selfPatient(req);
  if (!p.allow_self_measurements) throw new HttpError(403, 'Tu profesional no habilitó la carga de mediciones');
  const b = parse(z.object({ measured_on: dateStr, kind: z.string(), value: z.coerce.number(), note: z.string().max(500).optional().nullable() }), req.body);
  const k = validateMeasurement(b);
  if (!kindByKey(b.kind)?.patientCanReport) throw new HttpError(400, 'Esta medición la registra tu profesional');
  const row = await one("insert into measurements(patient_id, measured_on, kind, value, unit, source, method, note, created_by) values ($1,$2,$3,$4,$5,'paciente','Informada por el paciente',$6,$7) returning *", [p.id, b.measured_on, b.kind, b.value, k.unit, b.note ?? null, user(req).id]);
  await audit(user(req).id, 'medicion_informada', 'medicion', row.id, p.id, { kind: b.kind });
  await notify(p.professional_id, 'medicion', `${p.first_name} ${p.last_name} cargó una medición`, `/pro/pacientes/${p.id}/mediciones`);
  res.status(201).json(row);
});

patientRouter.get('/body-photos', async (req, res) => {
  const p = await selfPatient(req);
  const rows = await q("select id, taken_on, title, created_at, uploaded_by = $2 as mine from files where patient_id=$1 and kind='foto_corporal' and deleted_at is null and (uploaded_by=$2 or shared_with_patient) order by taken_on desc nulls last, created_at desc", [p.id, user(req).id]);
  res.json({ allowed: p.allow_body_photos, photos: rows.map((r) => ({ ...r, url: fileUrl(r.id) })) });
});

patientRouter.post('/body-photos', upload.single('file'), async (req, res) => {
  const p = await selfPatient(req);
  if (!p.allow_body_photos) throw new HttpError(403, 'Tu profesional no habilitó la carga de fotos corporales');
  const b = parse(z.object({ taken_on: dateStr, title: z.string().max(80).optional() }), req.body);
  const row = await storeUpload(req, p.id, 'foto_corporal', { taken_on: b.taken_on, title: b.title ?? null, shared: true });
  await notify(p.professional_id, 'foto', `${p.first_name} ${p.last_name} subió una foto de seguimiento`, `/pro/pacientes/${p.id}/fotos`);
  res.status(201).json({ ...row, url: fileUrl(row.id) });
});

patientRouter.get('/documents', async (req, res) => {
  const p = await selfPatient(req);
  const rows = await q("select id, title, original_name, mime, created_at from files where patient_id=$1 and kind='documento' and shared_with_patient and deleted_at is null order by created_at desc", [p.id]);
  res.json(rows.map((r) => ({ ...r, url: fileUrl(r.id) })));
});

// Cuestionario ---------------------------------------------------------------------------

patientRouter.get('/questionnaires', async (req, res) => {
  const p = await selfPatient(req);
  res.json(await q('select id, status, questions, answers, requested_at, submitted_at from questionnaires where patient_id=$1 order by requested_at desc', [p.id]));
});

const answersSchema = z.record(z.string().max(80), z.union([z.string().max(5000), z.number(), z.boolean(), z.null(), z.array(z.object({ time: z.string().max(10), meal: z.string().max(60), description: z.string().max(1000) })).max(30)]));

patientRouter.put('/questionnaires/:id', async (req, res) => {
  const p = await selfPatient(req);
  const b = parse(z.object({ answers: answersSchema, submit: z.boolean().default(false) }), req.body);
  const row = await one(
    `update questionnaires set answers=$3, status = case when $4 then 'enviado' else status end, submitted_at = case when $4 then now() else submitted_at end
      where id=$1 and patient_id=$2 and status='pendiente' returning *`,
    [param(req, 'id'), p.id, JSON.stringify(b.answers), b.submit],
  );
  if (!row) throw new HttpError(409, 'El cuestionario ya fue enviado o no existe');
  if (b.submit) {
    await notify(p.professional_id, 'cuestionario', `${p.first_name} ${p.last_name} envió su cuestionario`, `/pro/pacientes/${p.id}/cuestionarios`);
    await audit(user(req).id, 'cuestionario_enviado', 'cuestionario', row.id, p.id);
  }
  res.json(row);
});

// Mensajes -------------------------------------------------------------------------------

patientRouter.get('/messages', async (req, res) => {
  const p = await selfPatient(req);
  const pro = await one('select u.name, pr.response_hours from users u join professionals pr on pr.user_id=u.id where u.id=$1', [p.professional_id]);
  res.json({ professional: pro, messages: await listMessages(p.id, user(req).id) });
});

patientRouter.post('/messages', upload.single('file'), async (req, res) => {
  const p = await selfPatient(req);
  const body = String(req.body?.body ?? '').trim().slice(0, 4000);
  if (!body && !req.file) throw new HttpError(400, 'Escribí un mensaje o adjuntá una imagen');
  const file = req.file ? await storeUpload(req, p.id, 'imagen_mensaje', { shared: true }) : null;
  res.status(201).json(await sendMessage(p.id, user(req).id, body, file?.id ?? null));
});

// Turnos -----------------------------------------------------------------------------------

patientRouter.get('/appointments', async (req, res) => {
  const p = await selfPatient(req);
  const tz = await tzFor(p.professional_id);
  const rows = await q("select id, starts_at, ends_at, modality, location, status, patient_note from appointments where patient_id=$1 and starts_at > now() - interval '60 days' order by starts_at", [p.id]);
  res.json({ timezone: tz, appointments: rows });
});

patientRouter.post('/appointments/:id/confirm', async (req, res) => {
  const p = await selfPatient(req);
  const row = await one("update appointments set status='confirmado', updated_at=now() where id=$1 and patient_id=$2 and status in ('programado','cambio_solicitado') and starts_at > now() returning *", [param(req, 'id'), p.id]);
  if (!row) throw new HttpError(409, 'El turno no se puede confirmar (ya pasó, fue cancelado o ya está confirmado)');
  await notify(p.professional_id, 'turno', `${p.first_name} ${p.last_name} confirmó su turno`, '/pro/agenda');
  await audit(user(req).id, 'turno_confirmado', 'turno', row.id, p.id);
  res.json(row);
});

patientRouter.post('/appointments/:id/request-change', async (req, res) => {
  const p = await selfPatient(req);
  const b = parse(z.object({ note: z.string().trim().min(3, 'Contale a tu profesional qué cambio necesitás').max(500) }), req.body);
  const row = await one("update appointments set status='cambio_solicitado', patient_note=$3, updated_at=now() where id=$1 and patient_id=$2 and status in ('programado','confirmado') and starts_at > now() returning *", [param(req, 'id'), p.id, b.note]);
  if (!row) throw new HttpError(409, 'No se puede pedir un cambio para este turno');
  await notify(p.professional_id, 'turno', `${p.first_name} ${p.last_name} pidió cambiar un turno`, '/pro/agenda');
  await audit(user(req).id, 'turno_cambio_solicitado', 'turno', row.id, p.id);
  res.json(row);
});

patientRouter.get('/export', async (req, res) => {
  const p = await selfPatient(req);
  await audit(user(req).id, 'exportacion_paciente', 'paciente', p.id, p.id);
  await streamExportZip(res, p.id, false, `mis-datos-${new Date().toISOString().slice(0, 10)}.zip`);
});
