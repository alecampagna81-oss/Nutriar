import { q } from '../db.js';

/** Registra quién hizo qué. Nunca guardar contenido clínico ni mensajes en `meta`. */
export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, patientId: string | null = null, meta: Record<string, unknown> | null = null, client?: any) {
  await q('insert into audit_log(actor_id, action, entity, entity_id, patient_id, meta) values ($1,$2,$3,$4,$5,$6)', [actorId, action, entity, entityId, patientId, meta], client);
}
