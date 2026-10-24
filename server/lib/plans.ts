import { z } from 'zod';
import { one, q } from '../db.js';
import type { FoodSnap, PlanContent, PlanItem } from '../../shared/nutrition.js';
import { ALLERGENS, allergenConflicts, buildDays, NUTRIENTS } from '../../shared/nutrition.js';
import { getSnapshots } from './foods.js';
import { HttpError } from './http.js';

const itemBase = {
  id: z.string().min(1).max(60),
  food_id: z.string().uuid(),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero').max(100000),
  unit: z.enum(['g', 'ml', 'medida', 'porcion']),
  measure_id: z.string().uuid().nullish(),
  gross: z.boolean().optional(),
  note: z.string().max(500).optional(),
};
const itemSchema = z.object({ ...itemBase, alternatives: z.array(z.object(itemBase)).max(10).optional() });

export const contentSchema = z.object({
  weeks: z.coerce.number().int().min(1).max(4),
  meals: z
    .array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), name: z.string().trim().min(1).max(60), time: z.string().regex(/^(\d{2}:\d{2})?$/) }))
    .min(1, 'El plan necesita al menos una comida')
    .max(10),
  days: z.array(z.object({ week: z.number().int().min(1).max(4), day: z.number().int().min(1).max(7), note: z.string().max(1000).optional(), meals: z.record(z.string(), z.array(itemSchema).max(40)) })),
  show_nutrients: z.boolean(),
  supplements: z
    .array(z.object({ name: z.string().trim().min(1).max(120), dose: z.string().max(120), frequency: z.string().max(120), timing: z.string().max(120), notes: z.string().max(500) }))
    .max(30),
  general_notes: z.string().max(5000),
});

/** Valida el contenido y agrega una instantánea de cada alimento (el plan no cambia si luego se edita el catálogo). */
export async function prepareContent(raw: unknown, userId: string): Promise<PlanContent> {
  const r = contentSchema.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'El plan tiene datos inválidos', r.error.issues.slice(0, 5).map((i) => ({ campo: i.path.join('.'), mensaje: i.message })));
  const c = r.data as PlanContent;
  const keys = new Set(c.meals.map((m) => m.key));
  if (keys.size !== c.meals.length) throw new HttpError(400, 'Hay comidas repetidas');
  c.days = buildDays(c.weeks, c.meals, c.days);
  const ids: string[] = [];
  forEachItem(c, (it) => {
    ids.push(it.food_id);
    it.alternatives?.forEach((a) => ids.push(a.food_id));
  });
  const snaps = await getSnapshots(ids, userId);
  forEachItem(c, (it) => {
    it.snapshot = snaps.get(it.food_id);
    it.alternatives?.forEach((a) => (a.snapshot = snaps.get(a.food_id)));
    for (const x of [it, ...(it.alternatives ?? [])]) {
      if (x.unit === 'medida' && !x.snapshot!.measures.some((m) => m.id === x.measure_id)) throw new HttpError(400, `La medida elegida para ${x.snapshot!.name} no existe`);
      if (x.unit === 'porcion' && !x.snapshot!.recipe) throw new HttpError(400, `${x.snapshot!.name} no es una receta: indicá gramos, mililitros o una medida`);
    }
  });
  return c;
}

export function forEachItem(c: PlanContent, fn: (it: PlanItem, mealKey: string, day: PlanContent['days'][number]) => void) {
  for (const d of c.days) for (const k of Object.keys(d.meals)) for (const it of d.meals[k]) fn(it, k, d);
}

/** Advertencias por alergias/restricciones registradas en la historia clínica. */
export async function planWarnings(c: PlanContent, patientId: string | null) {
  if (!patientId) return [];
  const rec = await one('select allergens from clinical_records where patient_id=$1', [patientId]);
  const allergens: string[] = rec?.allergens ?? [];
  const seen = new Map<string, string>();
  forEachItem(c, (it) => {
    for (const x of [it, ...(it.alternatives ?? [])]) {
      const conf = allergenConflicts(x.snapshot as FoodSnap, allergens);
      if (conf.length) seen.set(x.food_id, `${x.snapshot!.name}: contiene ${conf.map((a) => ALLERGENS[a] ?? a).join(', ')}`);
    }
  });
  return [...seen.values()];
}

/** Para el paciente: elimina los valores nutricionales si la profesional no los habilitó. */
export function stripNutrients(c: PlanContent): PlanContent {
  if (c.show_nutrients) return c;
  const copy = structuredClone(c);
  const strip = (s?: FoodSnap) => {
    if (!s) return;
    for (const k of NUTRIENTS) s[k] = null;
  };
  forEachItem(copy, (it) => {
    strip(it.snapshot);
    it.alternatives?.forEach((a) => strip(a.snapshot));
  });
  return copy;
}

/** Versión publicada vigente del paciente (como máximo una). */
export async function activeVersion(patientId: string) {
  return one(
    `select v.*, p.title, p.patient_id from plan_versions v join plans p on p.id=v.plan_id
      where p.patient_id=$1 and v.status='publicado' and p.archived_at is null
      order by v.published_at desc limit 1`,
    [patientId],
  );
}

export async function nextVersionNo(planId: string, client?: any) {
  const r = await one('select coalesce(max(version_no),0)+1 as n from plan_versions where plan_id=$1', [planId], client);
  return r.n as number;
}

export async function latestVersion(planId: string) {
  return one('select * from plan_versions where plan_id=$1 order by version_no desc limit 1', [planId]);
}

export async function listVersions(planId: string) {
  return q('select id, version_no, status, created_at, updated_at, published_at, start_date from plan_versions where plan_id=$1 order by version_no desc', [planId]);
}
