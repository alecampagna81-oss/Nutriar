import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

// Verificación contra un hash descartable para igualar tiempos cuando el usuario no existe.
let dummy: Promise<string> | null = null;
export async function dummyVerify(pw: string) {
  dummy ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(await dummy, pw);
  return false;
}

export const passwordRule = 'La contraseña debe tener al menos 10 caracteres';
