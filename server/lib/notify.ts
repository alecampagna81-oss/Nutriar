import { q } from '../db.js';

/** Notificación interna. El título no debe incluir contenido clínico. */
export async function notify(userId: string | null | undefined, kind: string, title: string, link: string | null, dedupeKey?: string) {
  if (!userId) return;
  await q('insert into notifications(user_id, kind, title, link, dedupe_key) values ($1,$2,$3,$4,$5) on conflict (dedupe_key) do nothing', [userId, kind, title, link, dedupeKey ?? null]);
}
