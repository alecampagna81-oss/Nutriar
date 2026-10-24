import { q } from './db.js';
import { config } from './config.js';
import { mailConfigured, sendMail } from './lib/mail.js';
import { notify } from './lib/notify.js';
import { formatDateTime } from '../shared/time.js';

/**
 * Recordatorios de turnos: 24 h antes se crea una notificación interna para el paciente
 * (visible al abrir la aplicación) y, si hay SMTP configurado, se envía un correo.
 * No hay notificaciones push: con la aplicación cerrada el aviso solo llega por correo.
 */
export async function runReminders() {
  const rows = await q(
    `select a.id, a.starts_at, a.modality, a.location, p.user_id, u.email, p.first_name, pr.timezone
       from appointments a join patients p on p.id=a.patient_id join professionals pr on pr.user_id=a.professional_id left join users u on u.id=p.user_id
      where a.status in ('programado','confirmado') and a.reminder_sent_at is null
        and a.starts_at > now() and a.starts_at <= now() + interval '24 hours' and p.archived_at is null`,
  );
  for (const r of rows) {
    const when = formatDateTime(r.starts_at, r.timezone, { dateStyle: 'full', timeStyle: 'short' });
    await notify(r.user_id, 'recordatorio', `Recordatorio: tenés turno el ${when}`, '/app/turnos', `reminder:${r.id}:${new Date(r.starts_at).toISOString()}`);
    if (r.email && mailConfigured()) {
      await sendMail(r.email, `${config.appName}: recordatorio de turno`, `Hola ${r.first_name}:\n\nTe recordamos tu turno el ${when} (${r.modality}${r.location ? `, ${r.location}` : ''}).\n\nPodés confirmarlo o pedir un cambio desde ${config.appUrl}/app/turnos`);
    }
    await q('update appointments set reminder_sent_at=now() where id=$1', [r.id]);
  }
  return rows.length;
}

export function startScheduler() {
  const tick = () => runReminders().catch((e) => console.error('Error en recordatorios:', e.message));
  setTimeout(tick, 5000);
  setInterval(tick, 60_000);
}
