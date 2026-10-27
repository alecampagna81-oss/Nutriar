import crypto from 'node:crypto';
import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function sessionSecret() {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  if (isProd) throw new Error('SESSION_SECRET (mínimo 32 caracteres) es obligatorio en producción');
  return crypto.randomBytes(32).toString('hex'); // desarrollo: las sesiones no sobreviven reinicios
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  appName: env.APP_NAME || 'NutriAR',
  // En Render, RENDER_EXTERNAL_URL es la dirección pública asignada (https://<servicio>.onrender.com).
  appUrl: (env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/nutriar',
  sessionSecret: sessionSecret(),
  storageDir: path.resolve(env.STORAGE_DIR || './storage'),
  storageBackend: env.STORAGE_BACKEND === 'database' ? 'database' : 'disk',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 10),
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || '',
  trustProxy: env.TRUST_PROXY === '1',
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === '1' : isProd,
  disableRateLimit: env.DISABLE_RATE_LIMIT === '1' && !isProd,
};
