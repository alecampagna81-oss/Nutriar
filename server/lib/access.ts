import type { Request, Response, NextFunction } from 'express';
import { one } from '../db.js';
import { HttpError, notFound, param, user } from './http.js';

export interface SessionUser {
  id: string;
  role: 'professional' | 'patient';
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export function requireRole(role: SessionUser['role']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(new HttpError(401, 'Iniciá sesión para continuar'));
    if (u.role !== role) return next(new HttpError(403, 'No tenés permiso para acceder a esta sección'));
    next();
  };
}

export interface PatientRow {
  id: string;
  professional_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  archived_at: string | null;
  show_nutrients: boolean;
  allow_self_measurements: boolean;
  allow_body_photos: boolean;
  shared_indicators: string[];
  habits: { key: string; name: string; unit: string; target: number | null }[];
  [k: string]: unknown;
}

/**
 * Paciente de la profesional que hace la solicitud. Si el paciente pertenece a otra
 * profesional se responde 404 (no se revela su existencia).
 */
export async function proPatient(req: Request, name = 'patientId'): Promise<PatientRow> {
  const u = user(req);
  if (u.role !== 'professional') throw new HttpError(403, 'No tenés permiso');
  const id = param(req, name);
  const p = await one<PatientRow>('select * from patients where id = $1 and professional_id = $2', [id, u.id]);
  if (!p) throw notFound('Paciente');
  return p;
}

/** Ficha del paciente que tiene la sesión iniciada. */
export async function selfPatient(req: Request): Promise<PatientRow> {
  const u = user(req);
  if (u.role !== 'patient') throw new HttpError(403, 'No tenés permiso');
  const p = await one<PatientRow>('select * from patients where user_id = $1', [u.id]);
  if (!p) throw notFound('Paciente');
  if (p.archived_at) throw new HttpError(403, 'Tu acceso fue desactivado por tu profesional');
  return p;
}
