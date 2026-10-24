import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, q, tx } from '../db.js';
import { proPatient } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { streamExportZip } from '../lib/export.js';
import { fileUrl, storeUpload } from '../lib/files.js';
import { dateStr, HttpError, notFound, param, parse, user } from '../lib/http.js';
import { mailConfigured, sendMail } from '../lib/mail.js';
import { listMessages, sendMessage } from '../lib/messages.js';
import { notify } from '../lib/notify.js';
import { hashToken, newToken } from '../lib/security.js';
import { deleteFile } from '../lib/storage.js';
import { upload } from '../lib/uploads.js';
import { MEASURE_KINDS, kindByKey } from '../../shared/measures.js';
import { ALLERGENS } from '../../shared/nutrition.js';
import { agendaRouter } from './agenda.js';
import { plansRouter } from './plans.js';

export const proRouter = Router();
proRouter.use(plansRouter);
proRouter.use(agendaRouter);

const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Inicio

proRouter.get('/dashboard', async (req, res) => {
  const u = user(req);
  const pro = await one('select timezone from professionals where user_id=$1', [u.id]);
  const appointments = await q(
    `select a.id, a.starts_at, a.ends_at, a.status, a.modality, p.id as patient_id, p.first_name, p.last_name
       from appointments a join patients p on p.id=a.patient_id
      where a.professional_id=$1 and a.starts_at >= now() - interval '1 hour' and a.starts_at < now() + interval '7 days' and a.status <> 'cancelado'
      order by a.starts_at limit 20`,
    [u.id],
  );
  const unread = await q(
    `select p.id as patient_id, p.first_name, p.last_name, count(*)::int as count, max(m.created_at) as last_at
       from messages m join patients p on p.id=m.patient_id
      where p.professional_id=$1 and m.sender_id<>$1 and m.read_at is null group by p.id order by last_at desc`,
    [u.id],
  );
  const questionnaires = await q(
    `select qn.id, qn.submitted_at, p.id as patient_id, p.first_name, p.last_name from questionnaires qn join patients p on p.id=qn.patient_id
      where p.professional_id=$1 and qn.status='enviado' order by qn.submitted_at`,
    [u.id],
  );
  const changeRequests = await q(
    `select a.id, a.starts_at, a.patient_note, p.id as patient_id, p.first_name, p.last_name from appointments a join patients p on p.id=a.patient_id
      where a.professional_id=$1 and a.status='cambio_solicitado' order by a.starts_at`,
    [u.id],
  );
  const newLogs = await q(
    `select p.id as patient_id, p.first_name, p.last_name, count(*)::int as count from meal_logs l join patients p on p.id=l.patient_id
      where p.professional_id=$1 and l.seen_by_professional_at is null group by p.id order by count desc`,
    [u.id],
  );
  const counts = await one(
    `select count(*) filter (where archived_at is null)::int as active, count(*) filter (where archived_at is null and user_id is null)::int as without_access from patients where professional_id=$1`,
    [u.id],
  );
  res.json({ timezone: pro.timezone, appointments, unread, questionnaires, changeRequests, newLogs, counts });
});

// ---------------------------------------------------------------------------
// Pacientes

const patientSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresá el nombre').max(80),
  last_name: z.string().trim().min(1, 'Ingresá el apellido').max(80),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(200).optional().nullable().or(z.literal('').transform(() => null)),
  phone: optText(40),
  birth_date: dateStr.optional().nullable().or(z.literal('').transform(() => null)),
  sex: z.enum(['femenino', 'masculino', 'otro']).optional().nullable().or(z.literal('').transform(() => null)),
});

const settingsSchema = z.object({
  show_nutrients: z.boolean(),
  allow_self_measurements: z.boolean(),
  allow_body_photos: z.boolean(),
  shared_indicators: z.array(z.string().max(40)).max(30),
  habits: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), name: z.string().trim().min(1).max(80), unit: z.string().trim().max(20), target: z.number().positive().nullable() })).max(10),
});

proRouter.get('/patients', async (req, res) => {
  const u = user(req);
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const archived = req.query.archived === '1';
  const rows = await q(
    `select p.id, p.first_name, p.last_name, p.email, p.phone, p.created_at, p.archived_at, p.user_id is not null as has_account,
            (select case when i.accepted_at is not null then 'aceptada' when i.revoked_at is not null then 'anulada' when i.expires_at < now() then 'vencida' else 'pendiente' end
               from invitations i where i.patient_id=p.id order by i.created_at desc limit 1) as invitation_status,
            (select count(*)::int from messages m where m.patient_id=p.id and m.sender_id<>$1 and m.read_at is null) as unread,
            (select min(a.starts_at) from appointments a where a.patient_id=p.id and a.starts_at > now() and a.status <> 'cancelado') as next_appointment,
            exists(select 1 from plans pl join plan_versions v on v.plan_id=pl.id where pl.patient_id=p.id and v.status='publicado') as has_plan
       from patients p
      where p.professional_id=$1 and (p.archived_at is not null) = $2
        and ($3 = '' or lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(p.email,'')) like '%' || $3 || '%')
      order by p.last_name, p.first_name`,
    [u.id, archived, search],
  );
  res.json(rows);
});

proRouter.post('/patients', async (req, res) => {
  const u = user(req);
  const b = parse(patientSchema, req.body);
  const p = await tx(async (c) => {
    const p = await one(
      `insert into patients(professional_id, first_name, last_name, email, phone, birth_date, sex, habits)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [u.id, b.first_name, b.last_name, b.email ?? null, b.phone, b.birth_date ?? null, b.sex ?? null, JSON.stringify([{ key: 'agua', name: 'Agua', unit: 'vasos', target: 8 }])],
      c,
    );
    await q('insert into clinical_records(patient_id, updated_by) values ($1,$2)', [p.id, u.id], c);
    await audit(u.id, 'paciente_creado', 'paciente', p.id, p.id, null, c);
    return p;
  });
  res.status(201).json(p);
});

proRouter.get('/patients/:patientId', async (req, res) => {
  const p = await proPatient(req);
  const invitation = await one(
    `select id, email, created_at, expires_at, accepted_at, revoked_at, email_status,
            case when accepted_at is not null then 'aceptada' when revoked_at is not null then 'anulada' when expires_at < now() then 'vencida' else 'pendiente' end as status
       from invitations where patient_id=$1 order by created_at desc limit 1`,
    [p.id],
  );
  const clinical = await one('select allergens, restriction_notes from clinical_records where patient_id=$1', [p.id]);
  const account = p.user_id ? await one('select email, created_at from users where id=$1', [p.user_id]) : null;
  res.json({ ...p, invitation, account, allergens: clinical?.allergens ?? [], restriction_notes: clinical?.restriction_notes ?? '' });
});

proRouter.patch('/patients/:patientId', async (req, res) => {
  const p = await proPatient(req);
  const u = user(req);
  const b = parse(patientSchema.partial().extend({ settings: settingsSchema.optional() }), req.body);
  const fields: Record<string, unknown> = {};
  for (const k of ['first_name', 'last_name', 'email', 'phone', 'birth_date', 'sex'] as const) if (k in b) fields[k] = (b as any)[k] ?? null;
  if (b.settings) {
    Object.assign(fields, { ...b.settings, habits: JSON.stringify(b.settings.habits) });
  }
  const keys = Object.keys(fields);
  if (!keys.length) return res.json(p);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const row = await one(`update patients set ${sets} where id=$1 returning *`, [p.id, ...keys.map((k) => fields[k])]);
  await audit(u.id, 'paciente_editado', 'paciente', p.id, p.id, { campos: keys });
  res.json(row);
});

proRouter.post('/patients/:patientId/archive', async (req, res) => {
  const p = await proPatient(req);
  await q('update patients set archived_at=now() where id=$1', [p.id]);
  await q("update invitations set revoked_at=now() where patient_id=$1 and accepted_at is null and revoked_at is null", [p.id]);
  if (p.user_id) await q("delete from user_sessions where sess->>'userId' = $1", [p.user_id]);
  await audit(user(req).id, 'paciente_archivado', 'paciente', p.id, p.id);
  res.json({ ok: true });
});

proRouter.post('/patients/:patientId/unarchive', async (req, res) => {
  const p = await proPatient(req);
  await q('update patients set archived_at=null where id=$1', [p.id]);
  await audit(user(req).id, 'paciente_reactivado', 'paciente', p.id, p.id);
  res.json({ ok: true });
});

/** Eliminación definitiva: solo pacientes archivados y con confirmación escrita del nombre completo. */
proRouter.delete('/patients/:patientId', async (req, res) => {
  const p = await proPatient(req);
  const u = user(req);
  const b = parse(z.object({ confirm_name: z.string() }), req.body);
  if (!p.archived_at) throw new HttpError(409, 'Primero archivá al paciente. La eliminación definitiva solo está disponible para pacientes archivados.');
  if (b.confirm_name.trim().toLowerCase() !== `${p.first_name} ${p.last_name}`.toLowerCase()) throw new HttpError(400, 'El nombre escrito no coincide');
  const files = await q('select storage_key from files where patient_id=$1', [p.id]);
  await tx(async (c) => {
    await q('delete from patients where id=$1', [p.id], c);
    if (p.user_id) {
      await q("delete from user_sessions where sess->>'userId' = $1", [p.user_id], c);
      await q('delete from notifications where user_id=$1', [p.user_id], c);
      await q('update users set disabled_at=now(), email = id::text || \'@eliminado.invalid\', name=\'Paciente eliminado\' where id=$1', [p.user_id], c);
    }
    await audit(u.id, 'paciente_eliminado', 'paciente', p.id, p.id, null, c);
  });
  for (const f of files) await deleteFile(f.storage_key);
  res.json({ ok: true });
});

proRouter.get('/patients/:patientId/export', async (req, res) => {
  const p = await proPatient(req);
  await audit(user(req).id, 'exportacion', 'paciente', p.id, p.id);
  await streamExportZip(res, p.id, true, `paciente-${p.last_name}-${new Date().toISOString().slice(0, 10)}.zip`.replace(/[^\w.-]/g, '_'));
});

proRouter.get('/patients/:patientId/audit', async (req, res) => {
  const p = await proPatient(req);
  res.json(await q('select a.action, a.entity, a.created_at, u.name as actor from audit_log a left join users u on u.id=a.actor_id where a.patient_id=$1 order by a.created_at desc limit 200', [p.id]));
});

// Invitación ----------------------------------------------------------------

proRouter.post('/patients/:patientId/invitation', async (req, res) => {
  const p = await proPatient(req);
  const u = user(req);
  if (p.user_id) throw new HttpError(409, 'El paciente ya tiene una cuenta activa');
  if (p.archived_at) throw new HttpError(409, 'El paciente está archivado');
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email('Correo inválido').optional().nullable(), send_email: z.boolean().default(false) }), req.body ?? {});
  const email = b.email ?? p.email;
  const token = newToken();
  const link = `${config.appUrl}/invitacion/${token}`;
  const inv = await tx(async (c) => {
    await q('update invitations set revoked_at=now() where patient_id=$1 and accepted_at is null and revoked_at is null', [p.id], c);
    return one("insert into invitations(patient_id, token_hash, email, created_by, expires_at) values ($1,$2,$3,$4, now() + interval '7 days') returning *", [p.id, hashToken(token), email, u.id], c);
  });
  let emailStatus = 'no_enviado';
  if (b.send_email) {
    if (!email) throw new HttpError(400, 'El paciente no tiene correo registrado');
    emailStatus = await sendMail(email, `${u.name} te invitó a ${config.appName}`, `Hola ${p.first_name}:\n\n${u.name} te invitó a usar ${config.appName} para ver tu plan alimentario y comunicarte con tu consulta.\n\nCreá tu acceso en: ${link}\n\nEl enlace vence en 7 días y solo puede usarse una vez.`);
    await q('update invitations set email_status=$2 where id=$1', [inv.id, emailStatus]);
  }
  await audit(u.id, 'invitacion_creada', 'paciente', p.id, p.id, { email_status: emailStatus });
  // El enlace se muestra una sola vez: en la base solo queda su hash.
  res.status(201).json({ link, expires_at: inv.expires_at, email_status: emailStatus, email_configured: mailConfigured() });
});

proRouter.delete('/patients/:patientId/invitation', async (req, res) => {
  const p = await proPatient(req);
  await q('update invitations set revoked_at=now() where patient_id=$1 and accepted_at is null and revoked_at is null', [p.id]);
  await audit(user(req).id, 'invitacion_anulada', 'paciente', p.id, p.id);
  res.json({ ok: true });
});

proRouter.post('/patients/:patientId/reset-link', async (req, res) => {
  const p = await proPatient(req);
  if (!p.user_id) throw new HttpError(409, 'El paciente todavía no creó su cuenta');
  const token = newToken();
  await q("insert into password_resets(user_id, token_hash, created_by, expires_at) values ($1,$2,$3, now() + interval '24 hours')", [p.user_id, hashToken(token), user(req).id]);
  await audit(user(req).id, 'enlace_restablecimiento', 'paciente', p.id, p.id);
  res.status(201).json({ link: `${config.appUrl}/restablecer/${token}` });
});

// ---------------------------------------------------------------------------
// Historia clínica

const clinicalFields = [
  'motivo', 'objetivos', 'antecedentes_personales', 'antecedentes_familiares', 'alergias_detalle', 'intolerancias', 'restricciones',
  'medicacion', 'suplementos', 'preferencias', 'alimentos_rechazados', 'habitos', 'horarios', 'actividad_fisica', 'contexto', 'otros',
] as const;

proRouter.get('/patients/:patientId/clinical', async (req, res) => {
  const p = await proPatient(req);
  const r = await one('select c.*, u.name as updated_by_name from clinical_records c left join users u on u.id=c.updated_by where patient_id=$1', [p.id]);
  res.json(r ?? { data: {}, allergens: [], restriction_notes: '' });
});

proRouter.put('/patients/:patientId/clinical', async (req, res) => {
  const p = await proPatient(req);
  const u = user(req);
  const b = parse(
    z.object({
      data: z.object(Object.fromEntries(clinicalFields.map((f) => [f, z.string().max(5000).optional()]))),
      allergens: z.array(z.enum(Object.keys(ALLERGENS) as [string, ...string[]])).max(20),
      restriction_notes: z.string().max(2000),
    }),
    req.body,
  );
  const r = await one(
    `insert into clinical_records(patient_id, data, allergens, restriction_notes, updated_at, updated_by) values ($1,$2,$3,$4,now(),$5)
     on conflict (patient_id) do update set data=excluded.data, allergens=excluded.allergens, restriction_notes=excluded.restriction_notes, updated_at=now(), updated_by=excluded.updated_by returning *`,
    [p.id, b.data, b.allergens, b.restriction_notes, u.id],
  );
  await audit(u.id, 'historia_clinica_editada', 'historia_clinica', p.id, p.id);
  res.json(r);
});

// Preguntas adicionales del cuestionario --------------------------------------

const questionSchema = z.object({
  text: z.string().trim().min(3).max(300),
  kind: z.enum(['texto', 'si_no', 'numero', 'opciones']),
  options: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
  active: z.boolean().default(true),
});

proRouter.get('/questions', async (req, res) => {
  res.json(await q('select * from questionnaire_questions where professional_id=$1 order by position, created_at', [user(req).id]));
});
proRouter.post('/questions', async (req, res) => {
  const b = parse(questionSchema, req.body);
  if (b.kind === 'opciones' && b.options.length < 2) throw new HttpError(400, 'Agregá al menos dos opciones');
  const pos = await one('select coalesce(max(position),0)+1 as n from questionnaire_questions where professional_id=$1', [user(req).id]);
  res.status(201).json(await one('insert into questionnaire_questions(professional_id, text, kind, options, position, active) values ($1,$2,$3,$4,$5,$6) returning *', [user(req).id, b.text, b.kind, JSON.stringify(b.options), pos.n, b.active]));
});
proRouter.patch('/questions/:id', async (req, res) => {
  const b = parse(questionSchema.partial(), req.body);
  const row = await one(
    `update questionnaire_questions set text=coalesce($3,text), kind=coalesce($4,kind), options=coalesce($5,options), active=coalesce($6,active) where id=$1 and professional_id=$2 returning *`,
    [param(req, 'id'), user(req).id, b.text ?? null, b.kind ?? null, b.options ? JSON.stringify(b.options) : null, b.active ?? null],
  );
  if (!row) throw notFound('Pregunta');
  res.json(row);
});

// Cuestionarios ------------------------------------------------------------------

proRouter.get('/patients/:patientId/questionnaires', async (req, res) => {
  const p = await proPatient(req);
  res.json(await q('select * from questionnaires where patient_id=$1 order by requested_at desc', [p.id]));
});

proRouter.post('/patients/:patientId/questionnaires', async (req, res) => {
  const p = await proPatient(req);
  const u = user(req);
  const open = await one("select id from questionnaires where patient_id=$1 and status='pendiente'", [p.id]);
  if (open) throw new HttpError(409, 'El paciente ya tiene un cuestionario pendiente');
  const questions = await q('select id, text, kind, options from questionnaire_questions where professional_id=$1 and active order by position', [u.id]);
  const row = await one('insert into questionnaires(patient_id, questions, requested_by) values ($1,$2,$3) returning *', [p.id, JSON.stringify(questions), u.id]);
  await notify(p.user_id, 'cuestionario', 'Tu nutricionista te pidió completar el cuestionario previo', '/app/cuestionario');
  await audit(u.id, 'cuestionario_solicitado', 'cuestionario', row.id, p.id);
  res.status(201).json(row);
});

proRouter.post('/patients/:patientId/questionnaires/:qid/review', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(z.object({ note: z.string().max(2000).default('') }), req.body ?? {});
  const row = await one("update questionnaires set status='revisado', reviewed_at=now(), reviewed_by=$3, review_note=$4 where id=$1 and patient_id=$2 and status='enviado' returning *", [param(req, 'qid'), p.id, user(req).id, b.note]);
  if (!row) throw new HttpError(409, 'El cuestionario no está enviado o no existe');
  await audit(user(req).id, 'cuestionario_revisado', 'cuestionario', row.id, p.id);
  res.json(row);
});

// Consultas y notas de evolución ------------------------------------------------

const recallSchema = z.array(z.object({ time: z.string().max(10), meal: z.string().max(60), description: z.string().max(1000) })).max(30);
const consultationSchema = z.object({
  date: dateStr,
  title: z.string().trim().min(1).max(120).default('Consulta'),
  internal_notes: z.string().max(20000).default(''),
  shared_notes: z.string().max(20000).default(''),
  recall_24h: recallSchema.default([]),
});

proRouter.get('/patients/:patientId/consultations', async (req, res) => {
  const p = await proPatient(req);
  res.json(await q('select c.*, u.name as author from consultations c join users u on u.id=c.created_by where patient_id=$1 order by date desc, created_at desc', [p.id]));
});
proRouter.post('/patients/:patientId/consultations', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(consultationSchema, req.body);
  const row = await one('insert into consultations(patient_id, date, title, internal_notes, shared_notes, recall_24h, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *', [p.id, b.date, b.title, b.internal_notes, b.shared_notes, JSON.stringify(b.recall_24h), user(req).id]);
  await audit(user(req).id, 'consulta_creada', 'consulta', row.id, p.id);
  if (b.shared_notes) await notify(p.user_id, 'consulta', 'Tu nutricionista compartió indicaciones de la consulta', '/app/avances');
  res.status(201).json(row);
});
proRouter.put('/patients/:patientId/consultations/:cid', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(consultationSchema, req.body);
  const row = await one('update consultations set date=$3, title=$4, internal_notes=$5, shared_notes=$6, recall_24h=$7, updated_at=now() where id=$1 and patient_id=$2 returning *', [param(req, 'cid'), p.id, b.date, b.title, b.internal_notes, b.shared_notes, JSON.stringify(b.recall_24h)]);
  if (!row) throw notFound('Consulta');
  await audit(user(req).id, 'consulta_editada', 'consulta', row.id, p.id);
  res.json(row);
});

// Mediciones y objetivos --------------------------------------------------------

const measurementSchema = z.object({
  measured_on: dateStr,
  kind: z.string(),
  value: z.coerce.number(),
  method: optText(120),
  note: optText(500),
});

export function validateMeasurement(b: { kind: string; value: number }) {
  const k = kindByKey(b.kind);
  if (!k) throw new HttpError(400, 'Tipo de medición desconocido');
  if (!(b.value >= k.min && b.value <= k.max)) throw new HttpError(400, `${k.label}: el valor debe estar entre ${k.min} y ${k.max} ${k.unit}`);
  return k;
}

proRouter.get('/patients/:patientId/measurements', async (req, res) => {
  const p = await proPatient(req);
  const rows = await q('select m.*, u.name as author from measurements m join users u on u.id=m.created_by where patient_id=$1 and deleted_at is null order by measured_on, created_at', [p.id]);
  res.json({ kinds: MEASURE_KINDS, rows, shared_indicators: p.shared_indicators });
});
proRouter.post('/patients/:patientId/measurements', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(measurementSchema, req.body);
  const k = validateMeasurement(b);
  const row = await one("insert into measurements(patient_id, measured_on, kind, value, unit, source, method, note, created_by) values ($1,$2,$3,$4,$5,'profesional',$6,$7,$8) returning *", [p.id, b.measured_on, b.kind, b.value, k.unit, b.method, b.note, user(req).id]);
  await audit(user(req).id, 'medicion_creada', 'medicion', row.id, p.id, { kind: b.kind });
  res.status(201).json(row);
});
proRouter.delete('/patients/:patientId/measurements/:mid', async (req, res) => {
  const p = await proPatient(req);
  const row = await one('update measurements set deleted_at=now() where id=$1 and patient_id=$2 and deleted_at is null returning id', [param(req, 'mid'), p.id]);
  if (!row) throw notFound('Medición');
  await audit(user(req).id, 'medicion_anulada', 'medicion', row.id, p.id);
  res.json({ ok: true });
});

const goalSchema = z.object({
  description: z.string().trim().min(3).max(300),
  category: z.enum(['habito', 'medicion', 'alimentacion', 'otro']),
  target: optText(200),
  status: z.enum(['activo', 'logrado', 'pausado']).default('activo'),
  shared: z.boolean().default(true),
});
proRouter.get('/patients/:patientId/goals', async (req, res) => {
  const p = await proPatient(req);
  res.json(await q('select * from goals where patient_id=$1 order by created_at', [p.id]));
});
proRouter.post('/patients/:patientId/goals', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(goalSchema, req.body);
  const row = await one('insert into goals(patient_id, description, category, target, status, shared, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning *', [p.id, b.description, b.category, b.target, b.status, b.shared, user(req).id]);
  await audit(user(req).id, 'objetivo_creado', 'objetivo', row.id, p.id);
  res.status(201).json(row);
});
proRouter.put('/patients/:patientId/goals/:gid', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(goalSchema, req.body);
  const row = await one('update goals set description=$3, category=$4, target=$5, status=$6, shared=$7 where id=$1 and patient_id=$2 returning *', [param(req, 'gid'), p.id, b.description, b.category, b.target, b.status, b.shared]);
  if (!row) throw notFound('Objetivo');
  await audit(user(req).id, 'objetivo_editado', 'objetivo', row.id, p.id);
  res.json(row);
});

// Archivos (documentos y fotos corporales) ------------------------------------

proRouter.get('/patients/:patientId/files', async (req, res) => {
  const p = await proPatient(req);
  const kind = String(req.query.kind ?? '');
  const rows = await q(
    `select f.id, f.kind, f.mime, f.size_bytes, f.original_name, f.title, f.taken_on, f.shared_with_patient, f.created_at, u.name as uploaded_by_name, u.role as uploaded_by_role
       from files f join users u on u.id=f.uploaded_by where f.patient_id=$1 and f.deleted_at is null and ($2='' or f.kind=$2) order by coalesce(f.taken_on, f.created_at::date) desc, f.created_at desc`,
    [p.id, kind],
  );
  res.json(rows.map((r) => ({ ...r, url: fileUrl(r.id) })));
});

proRouter.post('/patients/:patientId/files', upload.single('file'), async (req, res) => {
  const p = await proPatient(req);
  const b = parse(z.object({ kind: z.enum(['documento', 'foto_corporal']), title: optText(120), taken_on: dateStr.optional().nullable().or(z.literal('').transform(() => null)), shared: z.enum(['true', 'false']).default('false') }), req.body);
  const row = await storeUpload(req, p.id, b.kind, { title: b.title, taken_on: b.taken_on ?? null, shared: b.shared === 'true' });
  res.status(201).json({ ...row, url: fileUrl(row.id) });
});

proRouter.patch('/patients/:patientId/files/:fid', async (req, res) => {
  const p = await proPatient(req);
  const b = parse(z.object({ shared_with_patient: z.boolean().optional(), title: optText(120) }), req.body);
  const row = await one('update files set shared_with_patient=coalesce($3, shared_with_patient), title=coalesce($4, title) where id=$1 and patient_id=$2 and deleted_at is null returning id, shared_with_patient, title', [param(req, 'fid'), p.id, b.shared_with_patient ?? null, b.title ?? null]);
  if (!row) throw notFound('Archivo');
  await audit(user(req).id, 'archivo_editado', 'archivo', row.id, p.id, { shared: row.shared_with_patient });
  res.json(row);
});

/** Baja lógica: el archivo deja de estar accesible pero se conserva hasta la eliminación definitiva del paciente. */
proRouter.delete('/patients/:patientId/files/:fid', async (req, res) => {
  const p = await proPatient(req);
  const row = await one('update files set deleted_at=now() where id=$1 and patient_id=$2 and deleted_at is null returning id', [param(req, 'fid'), p.id]);
  if (!row) throw notFound('Archivo');
  await audit(user(req).id, 'archivo_dado_de_baja', 'archivo', row.id, p.id);
  res.json({ ok: true });
});

// Registros del paciente ----------------------------------------------------------

proRouter.get('/patients/:patientId/logs', async (req, res) => {
  const p = await proPatient(req);
  const meals = await q(
    `select l.*, v.version_no, pl.title as plan_title from meal_logs l left join plan_versions v on v.id=l.plan_version_id left join plans pl on pl.id=v.plan_id
      where l.patient_id=$1 order by l.log_date desc, l.created_at desc limit 300`,
    [p.id],
  );
  const habits = await q('select * from habit_logs where patient_id=$1 order by log_date desc, created_at desc limit 300', [p.id]);
  await q('update meal_logs set seen_by_professional_at=now() where patient_id=$1 and seen_by_professional_at is null', [p.id]);
  res.json({ meals: meals.map((m) => ({ ...m, photo_url: fileUrl(m.photo_file_id) })), habits, habit_defs: p.habits });
});

// Mensajes -------------------------------------------------------------------------

proRouter.get('/messages', async (req, res) => {
  const u = user(req);
  res.json(
    await q(
      `select p.id as patient_id, p.first_name, p.last_name, p.user_id is not null as has_account,
              lm.body as last_body, lm.created_at as last_at, lm.sender_id = $1 as last_mine, lm.file_id is not null as last_has_file,
              (select count(*)::int from messages m where m.patient_id=p.id and m.sender_id<>$1 and m.read_at is null) as unread
         from patients p
         join lateral (select * from messages m where m.patient_id=p.id order by created_at desc limit 1) lm on true
        where p.professional_id=$1 order by lm.created_at desc`,
      [u.id],
    ),
  );
});

proRouter.get('/patients/:patientId/messages', async (req, res) => {
  const p = await proPatient(req);
  res.json(await listMessages(p.id, user(req).id));
});

proRouter.post('/patients/:patientId/messages', upload.single('file'), async (req, res) => {
  const p = await proPatient(req);
  const body = String(req.body?.body ?? '').trim().slice(0, 4000);
  if (!body && !req.file) throw new HttpError(400, 'Escribí un mensaje o adjuntá una imagen');
  const file = req.file ? await storeUpload(req, p.id, 'imagen_mensaje', { shared: true }) : null;
  res.status(201).json(await sendMessage(p.id, user(req).id, body, file?.id ?? null));
});

// Configuración de la profesional ---------------------------------------------------

proRouter.get('/settings', async (req, res) => {
  const u = user(req);
  res.json({ ...(await one('select * from professionals where user_id=$1', [u.id])), name: u.name, email: u.email, email_configured: mailConfigured() });
});

proRouter.put('/settings', async (req, res) => {
  const u = user(req);
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      license_number: optText(60),
      timezone: z.string().refine((tz) => {
        try {
          new Intl.DateTimeFormat('es-AR', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'Zona horaria inválida'),
      response_hours: z.string().trim().min(3).max(500),
      default_appointment_minutes: z.coerce.number().int().min(10).max(240),
    }),
    req.body,
  );
  await q('update users set name=$2 where id=$1', [u.id, b.name]);
  await q('update professionals set license_number=$2, timezone=$3, response_hours=$4, default_appointment_minutes=$5 where user_id=$1', [u.id, b.license_number, b.timezone, b.response_hours, b.default_appointment_minutes]);
  await audit(u.id, 'configuracion_editada', 'profesional', u.id);
  res.json({ ok: true });
});
