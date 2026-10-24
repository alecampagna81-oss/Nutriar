import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { HttpError } from './http.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 20 },
});

export interface ProcessedFile {
  buffer: Buffer;
  mime: string;
  size: number;
  originalName: string;
}

/**
 * Valida el contenido real del archivo (no solo la extensión).
 * Imágenes: se decodifican y se re-codifican a JPEG, lo que elimina metadatos (EXIF, GPS)
 * y aplica la rotación indicada por la cámara.
 * PDF: se verifica la firma del archivo; los metadatos internos del PDF no se modifican.
 */
export async function processUpload(file: Express.Multer.File | undefined, allowPdf: boolean): Promise<ProcessedFile> {
  if (!file) throw new HttpError(400, 'No se recibió ningún archivo');
  const name = (file.originalname || 'archivo').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
  const head = file.buffer.subarray(0, 5).toString('latin1');
  if (head === '%PDF-') {
    if (!allowPdf) throw new HttpError(415, 'Solo se permiten imágenes (JPG, PNG o WebP)');
    return { buffer: file.buffer, mime: 'application/pdf', size: file.buffer.length, originalName: name };
  }
  let meta;
  try {
    meta = await sharp(file.buffer).metadata();
  } catch {
    throw new HttpError(415, allowPdf ? 'Formato no permitido. Usá PDF, JPG, PNG o WebP' : 'Formato no permitido. Usá JPG, PNG o WebP');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new HttpError(415, allowPdf ? 'Formato no permitido. Usá PDF, JPG, PNG o WebP' : 'Formato no permitido. Usá JPG, PNG o WebP');
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > 60_000_000) throw new HttpError(413, 'La imagen es demasiado grande');
  const out = await sharp(file.buffer).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { buffer: out, mime: 'image/jpeg', size: out.length, originalName: name.replace(/\.[^.]+$/, '') + '.jpg' };
}
