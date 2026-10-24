import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { one, q } from '../db.js';
import { readStream } from './storage.js';

/**
 * Exportación de los datos de un paciente.
 * full = true: todo lo registrado (para la profesional), incluidas notas internas.
 * full = false: solo lo que el paciente puede ver.
 */
export async function buildExport(patientId: string, full: boolean) {
  const p = await one('select * from patients where id=$1', [patientId]);
  const filesCond = full ? '' : 'and (shared_with_patient or uploaded_by = $2)';
  const params = full ? [patientId] : [patientId, p.user_id];
  const data: Record<string, unknown> = {
    generado: new Date().toISOString(),
    alcance: full ? 'completo (incluye notas internas de la profesional)' : 'datos visibles para el paciente',
    paciente: { nombre: p.first_name, apellido: p.last_name, email: p.email, telefono: p.phone, fecha_nacimiento: p.birth_date, sexo: p.sex, alta: p.created_at, archivado: p.archived_at },
    historia_clinica: full ? await one('select data, allergens, restriction_notes, updated_at from clinical_records where patient_id=$1', [patientId]) : undefined,
    cuestionarios: await q('select status, questions, answers, requested_at, submitted_at, reviewed_at' + (full ? ', review_note' : '') + ' from questionnaires where patient_id=$1 order by requested_at', [patientId]),
    consultas: await q(`select date, title, shared_notes${full ? ', internal_notes, recall_24h' : ''}, created_at from consultations where patient_id=$1 order by date`, [patientId]),
    mediciones: await q(`select measured_on, kind, value, unit, source, method, note, created_at from measurements where patient_id=$1 and deleted_at is null ${full ? '' : "and (source='paciente' or kind = any($2::text[]))"} order by measured_on`, full ? [patientId] : [patientId, p.shared_indicators]),
    objetivos: await q(`select description, category, target, status, created_at from goals where patient_id=$1 ${full ? '' : 'and shared'}`, [patientId]),
    planes: await q(
      `select p.title, v.version_no, v.status, v.content, v.published_at from plans p join plan_versions v on v.plan_id=p.id where p.patient_id=$1 ${full ? '' : "and v.status in ('publicado','reemplazado')"} order by p.created_at, v.version_no`,
      [patientId],
    ),
    registros_comidas: await q('select log_date, meal_name, status, description, comment, difficulty, photo_file_id, created_at from meal_logs where patient_id=$1 order by log_date', [patientId]),
    registros_habitos: await q('select log_date, habit_key, value, created_at from habit_logs where patient_id=$1 order by log_date', [patientId]),
    mensajes: await q('select m.created_at, u.name as remitente, m.body, m.file_id, m.read_at from messages m join users u on u.id=m.sender_id where m.patient_id=$1 order by m.created_at', [patientId]),
    turnos: await q(`select starts_at, ends_at, modality, location, status, patient_note${full ? ', internal_notes' : ''} from appointments where patient_id=$1 order by starts_at`, [patientId]),
    archivos: await q(`select id, kind, original_name, title, taken_on, mime, size_bytes, created_at, shared_with_patient from files where patient_id=$1 and deleted_at is null ${filesCond} order by created_at`, params),
  };
  return data;
}

export async function streamExportZip(res: Response, patientId: string, full: boolean, filename: string) {
  const data = await buildExport(patientId, full);
  const files = await q(`select id, storage_key, mime from files where id = any($1::uuid[])`, [(data.archivos as any[]).map((f) => f.id)]);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.pipe(res);
  zip.append(JSON.stringify(data, null, 2), { name: 'datos.json' });
  for (const f of files) zip.append(readStream(f.storage_key), { name: `archivos/${f.id}.${f.mime === 'application/pdf' ? 'pdf' : 'jpg'}` });
  await zip.finalize();
}
