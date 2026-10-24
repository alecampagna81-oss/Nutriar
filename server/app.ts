import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from './config.js';
import { one, pool } from './db.js';
import { HttpError } from './lib/http.js';
import { requireRole } from './lib/access.js';
import { authRouter } from './routes/auth.js';
import { proRouter } from './routes/pro.js';
import { patientRouter } from './routes/patient.js';
import { foodsRouter } from './routes/foods.js';
import { commonRouter } from './routes/common.js';

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.secureCookies ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Registro mínimo de solicitudes: método, ruta y estado. Nunca cuerpos ni datos clínicos.
  if (!config.isTest) {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on('finish', () => {
        if (req.path.startsWith('/api')) console.log(`${req.method} ${req.path.replace(/[0-9a-f-]{36}|[A-Za-z0-9_-]{40,}/g, ':id')} ${res.statusCode} ${Date.now() - t}ms`);
      });
      next();
    });
  }

  const PgStore = connectPg(session);
  app.use(
    session({
      name: 'nutriar.sid',
      store: new PgStore({ pool, tableName: 'user_sessions', pruneSessionInterval: config.isTest ? false : 60 * 15 }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: 12 * 60 * 60 * 1000 },
    }),
  );

  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Protección CSRF: toda operación que modifica datos debe incluir este encabezado,
  // que un formulario de otro sitio no puede enviar sin una verificación previa CORS.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-nutriar') !== '1') {
      return next(new HttpError(403, 'Solicitud rechazada'));
    }
    next();
  });

  app.use(
    '/api',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 1500, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.disableRateLimit, message: { error: 'Demasiadas solicitudes. Esperá unos minutos.' } }),
  );

  // Usuario de la sesión
  app.use('/api', async (req, _res, next) => {
    try {
      const id = req.session.userId;
      if (id) {
        const u = await one('select id, role, name, email, disabled_at from users where id=$1', [id]);
        if (u && !u.disabled_at) req.user = { id: u.id, role: u.role, name: u.name, email: u.email };
        else delete req.session.userId;
      }
      next();
    } catch (e) {
      next(e);
    }
  });

  // Límite de cargas de archivos por usuario (fotos, documentos, imágenes de mensajes).
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => config.disableRateLimit || !(req.headers['content-type'] ?? '').startsWith('multipart/'),
    keyGenerator: (req) => req.user?.id ?? 'anon',
    message: { error: 'Alcanzaste el máximo de 60 archivos por hora. Volvé a intentar más tarde.' },
  });
  app.use('/api', uploadLimiter);

  app.get('/api/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api', commonRouter);
  app.use('/api/foods', requireRole('professional'), foodsRouter);
  app.use('/api/pro', requireRole('professional'), proRouter);
  app.use('/api/me', requireRole('patient'), patientRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta inexistente')));

  // Frontend compilado
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `El archivo supera el máximo de ${config.maxUploadMb} MB` : 'No se pudo procesar el archivo';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos inválido' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Los datos enviados son demasiado grandes' });
    // Se registra solo el mensaje técnico, sin datos de la solicitud.
    console.error('Error interno:', err?.code ?? '', err?.message ?? err);
    res.status(500).json({ error: 'Ocurrió un error inesperado. No se guardaron los cambios; volvé a intentar.' });
  });
  return app;
}
