import type { Request } from 'express';
import { one } from '../db.js';
import { audit } from './audit.js';
import { user } from './http.js';
import { saveFile } from './storage.js';
import { processUpload } from './uploads.js';

export type FileKind = 'documento' | 'foto_corporal' | 'foto_comida' | 'imagen_mensaje';

export async function storeUpload(req: Request, patientId: string, kind: FileKind, opts: { title?: string | null; taken_on?: string | null; shared?: boolean } = {}, client?: any) {
  const u = user(req);
  const processed = await processUpload(req.file, kind === 'documento');
  const key = await saveFile(processed.buffer);
  const row = await one(
    `insert into files(patient_id, kind, storage_key, mime, size_bytes, original_name, title, taken_on, uploaded_by, shared_with_patient)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, kind, mime, size_bytes, original_name, title, taken_on, shared_with_patient, created_at, uploaded_by`,
    [patientId, kind, key, processed.mime, processed.size, processed.originalName, opts.title ?? null, opts.taken_on ?? null, u.id, opts.shared ?? false],
    client,
  );
  await audit(u.id, 'archivo_subido', 'archivo', row.id, patientId, { kind });
  return row;
}

export const fileUrl = (id: string | null | undefined) => (id ? `/api/files/${id}` : null);
