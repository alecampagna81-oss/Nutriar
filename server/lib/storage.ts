import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from '../config.js';
import { one, q } from '../db.js';

// Almacenamiento privado de fotos y documentos. Los archivos se sirven solamente a través de rutas que verifican permisos.
// - "disk" (por defecto): carpeta privada STORAGE_DIR, fuera de cualquier carpeta pública.
// - "database": dentro de PostgreSQL (tabla file_blobs). Para alojamientos sin disco persistente,
//   como el plan gratuito de Render, donde los archivos sueltos se borran en cada reinicio.
// Para usar un bucket S3 compatible, agregar otra variante de estas cuatro funciones.

const useDb = () => config.storageBackend === 'database';

function fullPath(key: string) {
  if (!/^[a-f0-9]{2}\/[a-f0-9]{48}$/.test(key)) throw new Error('Clave de archivo inválida');
  return path.join(config.storageDir, key);
}

export async function saveFile(buf: Buffer): Promise<string> {
  const id = crypto.randomBytes(24).toString('hex');
  const key = `${id.slice(0, 2)}/${id}`;
  if (useDb()) {
    await q('insert into file_blobs(storage_key, data) values ($1,$2)', [key, buf]);
    return key;
  }
  await fsp.mkdir(path.dirname(fullPath(key)), { recursive: true, mode: 0o700 });
  await fsp.writeFile(fullPath(key), buf, { mode: 0o600 });
  return key;
}

export async function openStream(key: string): Promise<Readable> {
  if (useDb()) return Readable.from([await readFile(key)]);
  fullPath(key);
  await fsp.access(fullPath(key));
  return fs.createReadStream(fullPath(key));
}

export async function readFile(key: string): Promise<Buffer> {
  if (useDb()) {
    const r = await one('select data from file_blobs where storage_key=$1', [key]);
    if (!r) throw new Error('Archivo no disponible');
    return r.data as Buffer;
  }
  return fsp.readFile(fullPath(key));
}

export async function deleteFile(key: string) {
  if (useDb()) {
    await q('delete from file_blobs where storage_key=$1', [key]);
    return;
  }
  await fsp.rm(fullPath(key), { force: true });
}
