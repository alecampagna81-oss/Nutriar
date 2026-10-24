import { one, q } from '../db.js';
import { notify } from './notify.js';
import { fileUrl } from './files.js';

export async function listMessages(patientId: string, viewerId: string, before?: string) {
  await q('update messages set read_at=now() where patient_id=$1 and sender_id<>$2 and read_at is null', [patientId, viewerId]);
  const rows = await q(
    `select m.id, m.sender_id, m.body, m.file_id, m.created_at, m.read_at, u.name as sender_name, u.role as sender_role
       from messages m join users u on u.id=m.sender_id
      where m.patient_id=$1 ${before ? 'and m.created_at < $2' : ''}
      order by m.created_at desc limit 200`,
    before ? [patientId, before] : [patientId],
  );
  return rows.reverse().map((r) => ({ ...r, file_url: fileUrl(r.file_id), mine: r.sender_id === viewerId }));
}

export async function sendMessage(patientId: string, senderId: string, body: string, fileId: string | null) {
  const m = await one('insert into messages(patient_id, sender_id, body, file_id) values ($1,$2,$3,$4) returning *', [patientId, senderId, body, fileId]);
  const p = await one('select professional_id, user_id, first_name, last_name from patients where id=$1', [patientId]);
  if (senderId === p.professional_id) {
    await notify(p.user_id, 'mensaje', 'Tenés un mensaje nuevo de tu nutricionista', '/app/mensajes');
  } else {
    await notify(p.professional_id, 'mensaje', `Mensaje nuevo de ${p.first_name} ${p.last_name}`, `/pro/pacientes/${patientId}/mensajes`);
  }
  return { ...m, file_url: fileUrl(m.file_id), mine: true };
}
