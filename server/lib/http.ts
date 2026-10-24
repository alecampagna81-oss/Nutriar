import type { Request } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} no encontrado`);
export const forbidden = () => new HttpError(403, 'No tenés permiso para realizar esta acción');

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
    throw new HttpError(400, 'Revisá los datos ingresados', issues);
  }
  return r.data;
}

export const uuid = z.string().uuid('Identificador inválido');
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

export function param(req: Request, name: string): string {
  const v = req.params[name];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !/^[0-9a-f-]{36}$/i.test(s)) throw notFound();
  return s;
}

export function user(req: Request) {
  const u = req.user;
  if (!u) throw new HttpError(401, 'Iniciá sesión para continuar');
  return u;
}
