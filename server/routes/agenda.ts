import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, notFound, param, parse, user } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { formatDateTime, zonedToUtc } from '../../shared/time.js';

export const agendaRouter = Router();

const apptSchema = z.object({
  patient_id: z.string().uuid('Elegí un paciente'),
  start_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora inválidas'),
  minutes: z.coerce.number().int().min(5).max(480),
  modality: z.enum(['presencial', 'virtual', 'telefonica']),
  location: z.string().trim().max(300).optional().nullable(),
  internal_notes: z.string().max(2000).default(''),
  allow_overlap: z.boolean().default(false),
});

async function tzOf(userId: string) {
  return (await one('select timezone from professionals where user_id=$1', [userId])).timezone as string;
}

async function checkOverlap(c: any, proId: string, start: Date, end: Date, excludeId: string | null) {
  // Bloqueo por profesional para evitar dos altas simultáneas superpuestas.
  await q('select pg_advisory_xact_lock(hashtext($1))', [proId], c);
  return q(
    `select a.id, a.starts_at, p.first_name, p.last_name from appointments a join patients p on p.id=a.patient_id
      where a.professional_id=$1 and a.status not in ('cancelado') and a.starts_at < $3 and a.ends_at > $2 and ($4::uuid is null or a.id <> $4)`,
    [proId, start, end, excludeId],
    c,
  );
}

agendaRouter.get('/appointments', async (req, res) => {
  const u = user(req);
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86400000).toISOString());
  const to = String(req.query.to ?? new Date(Date.now() + 60 * 86400000).toISOString());
  const patient = req.query.patient_id ? String(req.query.patient_id) : null;
  res.json(
    await q(
      `select a.*, p.first_name, p.last_name from appointments a join patients p on p.id=a.patient_id
        where a.professional_id=$1 and a.starts_at >= $2 and a.starts_at < $3 and ($4::uuid is null or a.patient_id=$4)
        order by a.starts_at`,
      [u.id, from, to, patient],
    ),
  );
});

agendaRouter.post('/appointments', async (req, res) => {
  const u = user(req);
  const b = parse(apptSchema, req.body);
  const p = await one('select id, user_id, archived_at from patients where id=$1 and professional_id=$2', [b.patient_id, u.id]);
  if (!p) throw notFound('Paciente');
  if (p.archived_at) throw new HttpError(409, 'El paciente está archivado');
  const tz = await tzOf(u.id);
  const start = zonedToUtc(b.start_local, tz);
  const end = new Date(start.getTime() + b.minutes * 60000);
  const row = await tx(async (c) => {
    const overlaps = await checkOverlap(c, u.id, start, end, null);
    if (overlaps.length && !b.allow_overlap) {
      throw new HttpError(409, 'El horario se superpone con otro turno', { overlaps: overlaps.map((o) => ({ ...o, label: `${o.first_name} ${o.last_name} · ${formatDateTime(o.starts_at, tz, { dateStyle: 'short', timeStyle: 'short' })}` })) });
    }
    return one(
      'insert into appointments(professional_id, patient_id, starts_at, ends_at, modality, location, internal_notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$1) returning *',
      [u.id, p.id, start, end, b.modality, b.location ?? null, b.internal_notes],
      c,
    );
  });
  await notify(p.user_id, 'turno', `Nuevo turno: ${formatDateTime(start, tz, { dateStyle: 'medium', timeStyle: 'short' })}`, '/app/turnos');
  await audit(u.id, 'turno_creado', 'turno', row.id, p.id);
  res.status(201).json(row);
});

agendaRouter.put('/appointments/:id', async (req, res) => {
  const u = user(req);
  const id = param(req, 'id');
  const b = parse(apptSchema.omit({ patient_id: true }), req.body);
  const current = await one('select a.*, p.user_id from appointments a join patients p on p.id=a.patient_id where a.id=$1 and a.professional_id=$2', [id, u.id]);
  if (!current) throw notFound('Turno');
  if (current.status === 'cancelado') throw new HttpError(409, 'El turno está cancelado');
  const tz = await tzOf(u.id);
  const start = zonedToUtc(b.start_local, tz);
  const end = new Date(start.getTime() + b.minutes * 60000);
  const moved = start.getTime() !== new Date(current.starts_at).getTime();
  const row = await tx(async (c) => {
    const overlaps = await checkOverlap(c, u.id, start, end, id);
    if (overlaps.length && !b.allow_overlap) throw new HttpError(409, 'El horario se superpone con otro turno', { overlaps: overlaps.map((o) => ({ ...o, label: `${o.first_name} ${o.last_name}` })) });
    // Si se reprograma, el paciente debe volver a confirmar.
    return one(
      `update appointments set starts_at=$2, ends_at=$3, modality=$4, location=$5, internal_notes=$6, updated_at=now(),
              status = case when $7 then 'programado' else status end, reminder_sent_at = case when $7 then null else reminder_sent_at end
        where id=$1 returning *`,
      [id, start, end, b.modality, b.location ?? null, b.internal_notes, moved],
      c,
    );
  });
  if (moved) await notify(current.user_id, 'turno', `Tu turno fue reprogramado: ${formatDateTime(start, tz, { dateStyle: 'medium', timeStyle: 'short' })}`, '/app/turnos');
  await audit(u.id, 'turno_editado', 'turno', id, current.patient_id);
  res.json(row);
});

agendaRouter.post('/appointments/:id/status', async (req, res) => {
  const u = user(req);
  const id = param(req, 'id');
  const b = parse(z.object({ status: z.enum(['cancelado', 'realizado', 'programado']) }), req.body);
  const row = await one('update appointments a set status=$3, updated_at=now() from patients p where p.id=a.patient_id and a.id=$1 and a.professional_id=$2 returning a.*, p.user_id', [id, u.id, b.status]);
  if (!row) throw notFound('Turno');
  if (b.status === 'cancelado') {
    const tz = await tzOf(u.id);
    await notify(row.user_id, 'turno', `Tu turno del ${formatDateTime(row.starts_at, tz, { dateStyle: 'medium', timeStyle: 'short' })} fue cancelado`, '/app/turnos');
  }
  await audit(u.id, `turno_${b.status}`, 'turno', id, row.patient_id);
  res.json(row);
});
