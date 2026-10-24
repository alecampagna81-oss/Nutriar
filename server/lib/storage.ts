import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

// Almacenamiento privado en disco, fuera de cualquier carpeta pública.
// Los archivos se sirven solamente a través de rutas que verifican permisos.
// Para usar un bucket S3 compatible, reemplazar estas tres funciones.

function fullPath(key: string) {
  if (!/^[a-f0-9]{2}\/[a-f0-9]{48}$/.test(key)) throw new Error('Clave de archivo inválida');
  return path.join(config.storageDir, key);
}

export async function saveFile(buf: Buffer): Promise<string> {
  const id = crypto.randomBytes(24).toString('hex');
  const key = `${id.slice(0, 2)}/${id}`;
  await fsp.mkdir(path.dirname(fullPath(key)), { recursive: true, mode: 0o700 });
  await fsp.writeFile(fullPath(key), buf, { mode: 0o600 });
  return key;
}

export function readStream(key: string) {
  return fs.createReadStream(fullPath(key));
}

export async function readFile(key: string) {
  return fsp.readFile(fullPath(key));
}

export async function deleteFile(key: string) {
  await fsp.rm(fullPath(key), { force: true });
}
