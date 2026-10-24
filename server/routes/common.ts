import { Router } from 'express';
import { one, q } from '../db.js';
import { HttpError, notFound, param, user } from '../lib/http.js';
import { readStream } from '../lib/storage.js';

export const commonRouter = Router();

/**
 * Descarga de archivos privados. Cada solicitud verifica permisos:
 * - profesional: solo archivos de sus pacientes;
 * - paciente: solo sus propios archivos, y de los subidos por la profesional, únicamente los compartidos.
 */
commonRouter.get('/files/:id', async (req, res) => {
  const u = user(req);
  const f = await one(
    `select f.*, p.professional_id, p.user_id as patient_user_id from files f join patients p on p.id=f.patient_id where f.id=$1 and f.deleted_at is null`,
    [param(req, 'id')],
  );
  const allowed = f && (u.role === 'professional' ? f.professional_id === u.id : f.patient_user_id === u.id && (f.uploaded_by === u.id || f.shared_with_patient));
  if (!allowed) throw notFound('Archivo');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const disposition = req.query.download === '1' || f.mime === 'application/pdf' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(f.original_name ?? 'archivo')}"`);
  const s = readStream(f.storage_key);
  s.on('error', () => {
    if (!res.headersSent) res.status(404).json({ error: 'Archivo no disponible' });
    else res.end();
  });
  s.pipe(res);
});

commonRouter.get('/notifications', async (req, res) => {
  const u = user(req);
  const rows = await q('select id, kind, title, link, created_at, read_at from notifications where user_id=$1 order by created_at desc limit 50', [u.id]);
  const unreadMessages =
    u.role === 'professional'
      ? await one('select count(*)::int as n from messages m join patients p on p.id=m.patient_id where p.professional_id=$1 and m.sender_id<>$1 and m.read_at is null', [u.id])
      : await one('select count(*)::int as n from messages m join patients p on p.id=m.patient_id where p.user_id=$1 and m.sender_id<>$1 and m.read_at is null', [u.id]);
  res.json({ items: rows, unread: rows.filter((r) => !r.read_at).length, unread_messages: unreadMessages.n });
});

commonRouter.post('/notifications/read', async (req, res) => {
  const u = user(req);
  const id = req.body?.id;
  if (id && typeof id !== 'string') throw new HttpError(400, 'Identificador inválido');
  if (id) await q('update notifications set read_at=now() where id=$1 and user_id=$2', [id, u.id]);
  else await q('update notifications set read_at=now() where user_id=$1 and read_at is null', [u.id]);
  res.json({ ok: true });
});
