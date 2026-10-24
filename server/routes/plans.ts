import { Router, type Request } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { dateStr, HttpError, notFound, param, parse, user } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { planPdf } from '../lib/pdf.js';
import { latestVersion, listVersions, nextVersionNo, planWarnings, prepareContent } from '../lib/plans.js';
import { buildShoppingList, defaultPlanContent, type PlanContent } from '../../shared/nutrition.js';

export const plansRouter = Router();

/** Plan de la profesional (de un paciente suyo o plantilla propia). */
async function ownPlan(req: Request, name = 'planId') {
  const plan = await one(
    `select pl.*, p.first_name, p.last_name, p.user_id as patient_user_id from plans pl left join patients p on p.id=pl.patient_id
      where pl.id=$1 and pl.professional_id=$2`,
    [param(req, name), user(req).id],
  );
  if (!plan) throw notFound('Plan');
  return plan;
}

async function ownPatientId(req: Request, id: string | null | undefined) {
  if (!id) return null;
  const p = await one('select id from patients where id=$1 and professional_id=$2', [id, user(req).id]);
  if (!p) throw notFound('Paciente');
  return p.id as string;
}

plansRouter.get('/patients/:patientId/plans', async (req, res) => {
  const pid = await ownPatientId(req, param(req, 'patientId'));
  res.json(
    await q(
      `select pl.id, pl.title, pl.created_at, pl.archived_at,
              (select json_agg(json_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status, 'published_at', v.published_at, 'updated_at', v.updated_at) order by v.version_no desc) from plan_versions v where v.plan_id=pl.id) as versions
         from plans pl where pl.patient_id=$1 order by pl.created_at desc`,
      [pid],
    ),
  );
});

plansRouter.get('/templates', async (req, res) => {
  res.json(
    await q(
      `select pl.id, pl.title, pl.created_at, v.updated_at, v.content->'weeks' as weeks from plans pl join plan_versions v on v.plan_id=pl.id
        where pl.professional_id=$1 and pl.is_template and pl.archived_at is null order by pl.title`,
      [user(req).id],
    ),
  );
});

const createSchema = z.object({
  title: z.string().trim().min(1, 'Ingresá un título').max(120),
  weeks: z.coerce.number().int().min(1).max(4).default(1),
  patient_id: z.string().uuid().nullable().optional(),
  from_plan_id: z.string().uuid().nullable().optional(), // plantilla o plan a copiar
});

/** Crea un plan (o una plantilla si no hay paciente), opcionalmente copiando otro plan/plantilla. */
plansRouter.post('/plans', async (req, res) => {
  const u = user(req);
  const b = parse(createSchema, req.body);
  const patientId = await ownPatientId(req, b.patient_id);
  let content: PlanContent = defaultPlanContent(b.weeks);
  if (b.from_plan_id) {
    const src = await one('select v.content from plans pl join plan_versions v on v.plan_id=pl.id where pl.id=$1 and pl.professional_id=$2 order by v.version_no desc limit 1', [b.from_plan_id, u.id]);
    if (!src) throw notFound('Plan de origen');
    content = src.content;
  }
  // Re-valida contra el catálogo actual (puede haber alimentos archivados o ajenos).
  content = await prepareContent(content, u.id);
  const plan = await tx(async (c) => {
    const plan = await one('insert into plans(professional_id, patient_id, is_template, title) values ($1,$2,$3,$4) returning *', [u.id, patientId, !patientId, b.title], c);
    await q("insert into plan_versions(plan_id, version_no, status, content, created_by) values ($1,1,'borrador',$2,$3)", [plan.id, JSON.stringify(content), u.id], c);
    return plan;
  });
  await audit(u.id, patientId ? 'plan_creado' : 'plantilla_creada', 'plan', plan.id, patientId);
  res.status(201).json(plan);
});

plansRouter.get('/plans/:planId', async (req, res) => {
  const plan = await ownPlan(req);
  const versions = await listVersions(plan.id);
  const vid = req.query.version ? String(req.query.version) : null;
  const version = vid ? await one('select * from plan_versions where id=$1 and plan_id=$2', [vid, plan.id]) : await latestVersion(plan.id);
  if (!version) throw notFound('Versión');
  const clinical = plan.patient_id ? await one('select allergens, restriction_notes, data->>\'alimentos_rechazados\' as rejected, data->>\'intolerancias\' as intolerances, data->>\'restricciones\' as restrictions from clinical_records where patient_id=$1', [plan.patient_id]) : null;
  res.json({ plan, versions, version, clinical, warnings: await planWarnings(version.content, plan.patient_id) });
});

/** Guarda el borrador vigente. Las versiones publicadas no se modifican. */
plansRouter.put('/plans/:planId/draft', async (req, res) => {
  const plan = await ownPlan(req);
  const u = user(req);
  const b = parse(z.object({ title: z.string().trim().min(1).max(120), start_date: dateStr.nullable().optional(), content: z.unknown(), version_id: z.string().uuid() }), req.body);
  const latest = await latestVersion(plan.id);
  if (latest.id !== b.version_id) throw new HttpError(409, 'El plan cambió desde que lo abriste (otra pestaña o versión nueva). Recargá antes de guardar.');
  if (latest.status !== 'borrador') throw new HttpError(409, 'La versión publicada no se puede editar. Creá una nueva versión.');
  const content = await prepareContent(b.content, u.id);
  await q('update plans set title=$2 where id=$1', [plan.id, b.title]);
  const v = await one('update plan_versions set content=$2, start_date=$3, updated_at=now() where id=$1 returning *', [latest.id, JSON.stringify(content), b.start_date ?? null]);
  await audit(u.id, 'plan_borrador_guardado', 'plan', plan.id, plan.patient_id, { version: v.version_no });
  res.json({ version: v, warnings: await planWarnings(content, plan.patient_id) });
});

/** Nueva versión en borrador a partir de la última. */
plansRouter.post('/plans/:planId/new-version', async (req, res) => {
  const plan = await ownPlan(req);
  const u = user(req);
  const latest = await latestVersion(plan.id);
  if (latest.status === 'borrador') return res.json(latest);
  const v = await tx(async (c) => {
    const n = await nextVersionNo(plan.id, c);
    return one("insert into plan_versions(plan_id, version_no, status, content, start_date, created_by) values ($1,$2,'borrador',$3,$4,$5) returning *", [plan.id, n, JSON.stringify(latest.content), latest.start_date, u.id], c);
  });
  await audit(u.id, 'plan_version_creada', 'plan', plan.id, plan.patient_id, { version: v.version_no });
  res.status(201).json(v);
});

plansRouter.post('/plans/:planId/publish', async (req, res) => {
  const plan = await ownPlan(req);
  const u = user(req);
  if (plan.is_template) throw new HttpError(400, 'Las plantillas no se publican. Creá un plan para un paciente a partir de la plantilla.');
  const b = parse(z.object({ acknowledge_warnings: z.boolean().default(false) }), req.body ?? {});
  const latest = await latestVersion(plan.id);
  if (latest.status !== 'borrador') throw new HttpError(409, 'No hay un borrador para publicar');
  const content = await prepareContent(latest.content, u.id); // revalida antes de publicar
  const hasItems = content.days.some((d) => Object.values(d.meals).some((items) => items.length));
  if (!hasItems) throw new HttpError(400, 'El plan está vacío: agregá al menos un alimento antes de publicarlo');
  const warnings = await planWarnings(content, plan.patient_id);
  if (warnings.length && !b.acknowledge_warnings) throw new HttpError(409, 'El plan incluye alimentos que coinciden con alergias o intolerancias registradas. Revisalos y confirmá la publicación.', { warnings });
  const v = await tx(async (c) => {
    // Solo una versión vigente por paciente: las anteriores quedan como "reemplazado" (no se borran).
    await q("update plan_versions v set status='reemplazado' from plans pl where pl.id=v.plan_id and pl.patient_id=$1 and v.status='publicado'", [plan.patient_id], c);
    return one("update plan_versions set status='publicado', published_at=now(), content=$2, updated_at=now() where id=$1 returning *", [latest.id, JSON.stringify(content)], c);
  });
  await notify(plan.patient_user_id, 'plan', 'Tu nutricionista publicó tu plan alimentario', '/app/plan');
  await audit(u.id, 'plan_publicado', 'plan', plan.id, plan.patient_id, { version: v.version_no, advertencias_confirmadas: warnings.length });
  res.json(v);
});

/** Desactiva el plan publicado: el paciente deja de verlo. Se conserva el historial. */
plansRouter.post('/plans/:planId/archive', async (req, res) => {
  const plan = await ownPlan(req);
  await q('update plans set archived_at=now() where id=$1', [plan.id]);
  await q("update plan_versions set status='reemplazado' where plan_id=$1 and status='publicado'", [plan.id]);
  await audit(user(req).id, 'plan_archivado', 'plan', plan.id, plan.patient_id);
  res.json({ ok: true });
});

plansRouter.get('/plans/:planId/shopping', async (req, res) => {
  const plan = await ownPlan(req);
  const vid = req.query.version ? String(req.query.version) : null;
  const v = vid ? await one('select * from plan_versions where id=$1 and plan_id=$2', [vid, plan.id]) : await latestVersion(plan.id);
  if (!v) throw notFound('Versión');
  res.json(shoppingForWeek(v.content, Number(req.query.week ?? 1)));
});

export function shoppingForWeek(content: PlanContent, week: number) {
  const w = Math.min(Math.max(1, week || 1), content.weeks);
  const keys = content.meals.map((m) => m.key);
  const items = content.days.filter((d) => d.week === w).flatMap((d) => keys.flatMap((k) => d.meals[k] ?? []));
  return { week: w, weeks: content.weeks, ...buildShoppingList(items) };
}

plansRouter.get('/plans/:planId/pdf', async (req, res) => {
  const plan = await ownPlan(req);
  const vid = req.query.version ? String(req.query.version) : null;
  const v = vid ? await one('select * from plan_versions where id=$1 and plan_id=$2', [vid, plan.id]) : await latestVersion(plan.id);
  if (!v) throw notFound('Versión');
  const pdf = await planPdf({
    title: plan.title,
    patientName: plan.patient_id ? `${plan.first_name} ${plan.last_name}` : 'Plantilla',
    professionalName: user(req).name,
    versionNo: v.version_no,
    publishedAt: v.published_at,
    content: v.content,
    showNutrients: req.query.nutrients === '0' ? false : true,
    compress: req.query.raw !== '1',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="plan-v${v.version_no}.pdf"`);
  res.send(pdf);
});
