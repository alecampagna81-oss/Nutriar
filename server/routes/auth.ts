import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, parse, user } from '../lib/http.js';
import { mailConfigured, sendMail } from '../lib/mail.js';
import { notify } from '../lib/notify.js';
import { dummyVerify, hashPassword, hashToken, newToken, passwordRule, verifyPassword } from '../lib/security.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.disableRateLimit,
  message: { error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' },
});

const email = z.string().trim().toLowerCase().email('Correo electrónico inválido').max(200);
const password = z.string().min(10, passwordRule).max(200);

function publicUser(u: any) {
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

async function startSession(req: any, userId: string) {
  await new Promise<void>((res, rej) => req.session.regenerate((e: any) => (e ? rej(e) : res())));
  req.session.userId = userId;
  await new Promise<void>((res, rej) => req.session.save((e: any) => (e ? rej(e) : res())));
}

authRouter.get('/me', async (req, res) => {
  const demoMode = process.env.DEMO_MODE === '1';
  if (!req.user) return res.json({ user: null, appName: config.appName, signupEnabled: signupEnabled(), emailConfigured: mailConfigured(), demoMode });
  const extra: any = {};
  if (req.user.role === 'professional') {
    Object.assign(extra, await one('select license_number, timezone, response_hours, default_appointment_minutes from professionals where user_id=$1', [req.user.id]));
  } else {
    const p = await one('select p.id as patient_id, p.first_name, p.show_nutrients, p.allow_self_measurements, p.allow_body_photos, p.habits, pr.timezone, pr.response_hours, u.name as professional_name from patients p join professionals pr on pr.user_id=p.professional_id join users u on u.id=p.professional_id where p.user_id=$1', [req.user.id]);
    Object.assign(extra, p);
  }
  res.json({ user: { ...req.user, ...extra }, appName: config.appName, emailConfigured: mailConfigured(), demoMode });
});

const signupEnabled = () => (process.env.ALLOW_PROFESSIONAL_SIGNUP ?? (config.isProd ? '0' : '1')) === '1';

authRouter.post('/register-professional', authLimiter, async (req, res) => {
  if (!signupEnabled()) throw new HttpError(403, 'El registro de profesionales está deshabilitado en este servidor');
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email, password, license_number: z.string().trim().max(60).optional() }), req.body);
  const exists = await one('select 1 from users where email=$1', [b.email]);
  if (exists) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  const hash = await hashPassword(b.password);
  const u = await tx(async (c) => {
    const u = await one('insert into users(email,password_hash,role,name) values ($1,$2,$3,$4) returning *', [b.email, hash, 'professional', b.name], c);
    await q('insert into professionals(user_id, license_number) values ($1,$2)', [u.id, b.license_number || null], c);
    return u;
  });
  await audit(u.id, 'registro', 'usuario', u.id);
  await startSession(req, u.id);
  res.status(201).json({ user: publicUser(u) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const b = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
  const u = await one('select * from users where email=$1', [b.email]);
  const ok = u ? await verifyPassword(u.password_hash, b.password) : await dummyVerify(b.password);
  if (!u || !ok || u.disabled_at) throw new HttpError(401, 'Correo o contraseña incorrectos');
  if (u.role === 'patient') {
    const p = await one('select archived_at from patients where user_id=$1', [u.id]);
    if (!p || p.archived_at) throw new HttpError(403, 'Tu acceso está desactivado. Consultá con tu profesional.');
  }
  await startSession(req, u.id);
  await audit(u.id, 'inicio_sesion', 'usuario', u.id);
  res.json({ user: publicUser(u) });
});

authRouter.post('/logout', async (req, res) => {
  await new Promise<void>((r) => req.session.destroy(() => r()));
  res.clearCookie('nutriar.sid');
  res.json({ ok: true });
});

async function findInvitation(token: string) {
  return one(
    `select i.*, p.first_name, p.last_name, p.user_id as linked_user, p.archived_at, u.name as professional_name
       from invitations i join patients p on p.id=i.patient_id join users u on u.id=p.professional_id
      where i.token_hash=$1`,
    [hashToken(token)],
  );
}

function invitationProblem(inv: any): string | null {
  if (!inv) return 'La invitación no existe o el enlace es incorrecto';
  if (inv.revoked_at) return 'La invitación fue anulada por tu profesional';
  if (inv.accepted_at || inv.linked_user) return 'La invitación ya fue utilizada. Iniciá sesión con tu cuenta.';
  if (new Date(inv.expires_at) < new Date()) return 'La invitación venció. Pedile una nueva a tu profesional.';
  if (inv.archived_at) return 'La invitación no está disponible';
  return null;
}

authRouter.get('/invitation/:token', authLimiter, async (req, res) => {
  const inv = await findInvitation(String(req.params.token));
  const problem = invitationProblem(inv);
  if (problem) return res.status(410).json({ error: problem });
  res.json({ first_name: inv.first_name, professional_name: inv.professional_name, email: inv.email, expires_at: inv.expires_at });
});

authRouter.post('/accept-invitation', authLimiter, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(100), email, password, accept_terms: z.literal(true, { message: 'Tenés que aceptar las condiciones de uso' }) }), req.body);
  const hash = await hashPassword(b.password);
  const u = await tx(async (c) => {
    const inv = await one(
      `select i.*, p.user_id as linked_user, p.archived_at, p.first_name, p.last_name, p.professional_id from invitations i join patients p on p.id=i.patient_id where i.token_hash=$1 for update of i, p`,
      [hashToken(b.token)],
      c,
    );
    const problem = invitationProblem(inv);
    if (problem) throw new HttpError(410, problem);
    if (await one('select 1 from users where email=$1', [b.email], c)) throw new HttpError(409, 'Ya existe una cuenta con ese correo. Usá otro correo o iniciá sesión.');
    const u = await one('insert into users(email,password_hash,role,name) values ($1,$2,$3,$4) returning *', [b.email, hash, 'patient', `${inv.first_name} ${inv.last_name}`], c);
    await q('update patients set user_id=$1 where id=$2', [u.id, inv.patient_id], c);
    await q('update invitations set accepted_at=now() where id=$1', [inv.id], c);
    await q('update invitations set revoked_at=now() where patient_id=$1 and id<>$2 and accepted_at is null and revoked_at is null', [inv.patient_id, inv.id], c);
    await audit(u.id, 'invitacion_aceptada', 'paciente', inv.patient_id, inv.patient_id, null, c);
    await notify(inv.professional_id, 'invitacion', `${inv.first_name} ${inv.last_name} activó su cuenta`, `/pro/pacientes/${inv.patient_id}`);
    return u;
  });
  await startSession(req, u.id);
  res.status(201).json({ user: publicUser(u) });
});

authRouter.post('/forgot', authLimiter, async (req, res) => {
  const b = parse(z.object({ email }), req.body);
  const configured = mailConfigured();
  if (configured) {
    const u = await one('select id, name from users where email=$1 and disabled_at is null', [b.email]);
    if (u) {
      const token = newToken();
      await q("insert into password_resets(user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')", [u.id, hashToken(token)]);
      await sendMail(b.email, `${config.appName}: restablecer contraseña`, `Hola ${u.name}:\n\nPara elegir una nueva contraseña ingresá a:\n${config.appUrl}/restablecer/${token}\n\nEl enlace vence en 1 hora. Si no lo pediste, ignorá este mensaje.`);
    }
  }
  // Respuesta idéntica exista o no la cuenta.
  res.json({ ok: true, emailConfigured: configured });
});

authRouter.post('/reset', authLimiter, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(100), password }), req.body);
  const hash = await hashPassword(b.password);
  const userId = await tx(async (c) => {
    const r = await one('select * from password_resets where token_hash=$1 for update', [hashToken(b.token)], c);
    if (!r || r.used_at || new Date(r.expires_at) < new Date()) throw new HttpError(410, 'El enlace no es válido o venció');
    await q('update users set password_hash=$1 where id=$2', [hash, r.user_id], c);
    await q('update password_resets set used_at=now() where user_id=$1 and used_at is null', [r.user_id], c);
    // Cierra las sesiones abiertas del usuario
    await q("delete from user_sessions where sess->>'userId' = $1", [r.user_id], c);
    return r.user_id;
  });
  await audit(userId, 'contrasena_restablecida', 'usuario', userId);
  res.json({ ok: true });
});

authRouter.post('/change-password', authLimiter, async (req, res) => {
  const u = user(req);
  const b = parse(z.object({ current: z.string().min(1), password }), req.body);
  const row = await one('select password_hash from users where id=$1', [u.id]);
  if (!(await verifyPassword(row.password_hash, b.current))) throw new HttpError(400, 'La contraseña actual no es correcta');
  await q('update users set password_hash=$1 where id=$2', [await hashPassword(b.password), u.id]);
  await audit(u.id, 'contrasena_cambiada', 'usuario', u.id);
  res.json({ ok: true });
});
