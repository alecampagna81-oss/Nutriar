import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { one } from '../server/db.js';

export const app = createApp();
export const PASSWORD = 'Prueba-Segura-123';
let n = 0;
export const uniq = () => `${Date.now().toString(36)}${n++}`;

/** Cliente con cookies persistentes y encabezado anti-CSRF. */
export function client() {
  const agent = request.agent(app);
  const h = { 'x-nutriar': '1' };
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set(h).send(body ?? {}),
    put: (url: string, body?: object) => agent.put(url).set(h).send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set(h).send(body ?? {}),
    del: (url: string, body?: object) => agent.delete(url).set(h).send(body ?? {}),
    upload: (url: string, field: string, buf: Buffer, filename: string, fields: Record<string, string> = {}) => {
      let r = agent.post(url).set(h);
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach(field, buf, filename);
    },
  };
}
export type Client = ReturnType<typeof client>;

export async function newProfessional(name = 'Lic. Prueba') {
  const c = client();
  const email = `pro-${uniq()}@test.local`;
  const r = await c.post('/api/auth/register-professional', { name, email, password: PASSWORD });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return { c, email, id: r.body.user.id as string };
}

/** Crea paciente, genera invitación y la acepta. Devuelve ambos clientes. */
export async function newPatientWithAccount(pro: Client, first = 'Ana', last = 'Ficticia') {
  const p = await pro.post('/api/pro/patients', { first_name: first, last_name: last, email: `pac-${uniq()}@test.local` });
  const inv = await pro.post(`/api/pro/patients/${p.body.id}/invitation`, {});
  const token = inv.body.link.split('/').pop();
  const pc = client();
  const email = `cuenta-${uniq()}@test.local`;
  const r = await pc.post('/api/auth/accept-invitation', { token, email, password: PASSWORD, accept_terms: true });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return { patientId: p.body.id as string, pc, email, token };
}

export async function foodId(name: string) {
  return (await one('select id from foods where name=$1 and owner_id is null', [name])).id as string;
}
export async function measureId(foodIdValue: string, prefix: string) {
  return (await one('select id from food_measures where food_id=$1 and name like $2', [foodIdValue, prefix + '%'])).id as string;
}

/** JPEG con metadatos EXIF (para verificar que se eliminan). */
export async function jpegWithExif() {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 50 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'DATO-PRIVADO-EXIF', Artist: 'Camara de prueba' } })
    .toBuffer();
}
