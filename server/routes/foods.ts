import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { getSnapshots, recomputeRecipe, recomputeRecipesUsing, visibleTo } from '../lib/foods.js';
import { dateStr, HttpError, notFound, param, parse, user } from '../lib/http.js';
import { ALLERGENS } from '../../shared/nutrition.js';

export const foodsRouter = Router();

export const CATEGORIES = [
  'Lácteos y huevos', 'Carnes', 'Pescados y mariscos', 'Legumbres', 'Cereales y derivados', 'Panificados', 'Verduras', 'Frutas',
  'Frutos secos y semillas', 'Aceites y grasas', 'Azúcares y dulces', 'Bebidas', 'Infusiones', 'Condimentos y salsas', 'Preparaciones', 'Otros',
];

const nutrient = z.union([z.number().min(0).max(5000), z.null()]);
const allergenEnum = z.enum(Object.keys(ALLERGENS) as [string, ...string[]]);

const foodSchema = z.object({
  kind: z.enum(['generico', 'producto']),
  name: z.string().trim().min(2, 'Ingresá el nombre').max(160),
  brand: z.string().trim().max(100).nullable().optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  presentation: z.string().trim().max(120).nullable().optional(),
  state: z.enum(['crudo', 'cocido', 'listo_para_consumir']).nullable().optional(),
  edible_portion_pct: z.number().gt(0).max(100).nullable().optional(),
  basis_amount: z.number().positive().max(1000),
  basis_unit: z.enum(['g', 'ml']),
  energy_kcal: nutrient,
  protein_g: nutrient,
  carbs_g: nutrient,
  fat_g: nutrient,
  fiber_g: nutrient.optional(),
  sodium_mg: z.union([z.number().min(0).max(50000), z.null()]).optional(),
  density_g_per_ml: z.number().gt(0.2).max(3).nullable().optional(),
  allergens: z.array(allergenEnum).max(10).default([]),
  label_data: z.object({ serving_size: z.string().max(60).optional(), ean: z.string().regex(/^\d{8,14}$/, 'Código de barras inválido').optional().or(z.literal('')), notes: z.string().max(500).optional() }).nullable().optional(),
  source: z.string().trim().min(3, 'Indicá la fuente de los datos (p. ej. "Etiqueta del envase")').max(300),
  source_ref: z.string().trim().max(120).nullable().optional(),
  source_date: dateStr.nullable().optional(),
  origin_country: z.string().regex(/^[A-Z]{2}$/, 'País inválido (código de 2 letras, ej. AR)').nullable().optional(),
  carbs_basis: z.enum(['totales', 'disponibles']).nullable().optional(),
});

function checkFood(b: z.infer<typeof foodSchema>) {
  if (b.kind === 'producto' && !b.brand) throw new HttpError(400, 'Los productos comerciales requieren la marca');
  const vals = [b.energy_kcal, b.protein_g, b.carbs_g, b.fat_g];
  if (vals.every((v) => v === null)) throw new HttpError(400, 'Cargá al menos un valor nutricional (los que no tengas, dejalos vacíos: no se toman como cero)');
  const macroGrams = (b.protein_g ?? 0) + (b.carbs_g ?? 0) + (b.fat_g ?? 0);
  if (b.basis_unit === 'g' && macroGrams > b.basis_amount * 1.02) throw new HttpError(400, 'La suma de proteínas, carbohidratos y grasas supera la cantidad de referencia');
}

foodsRouter.get('/meta', (_req, res) => {
  res.json({ categories: CATEGORIES, allergens: ALLERGENS });
});

foodsRouter.get('/', async (req, res) => {
  const u = user(req);
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const kind = String(req.query.kind ?? '');
  const category = String(req.query.category ?? '');
  const includeDemo = req.query.include_demo === '1';
  const mine = req.query.mine === '1';
  const origin = String(req.query.origin ?? '');
  const originCond = origin === 'AR' || origin === 'US' ? `and f.origin_country = '${origin}'` : origin === 'sin' ? 'and f.origin_country is null' : '';
  const words = search.split(/\s+/).filter(Boolean).slice(0, 5);
  const conds = words.map((_, i) => `translate(f.search, 'áéíóúü', 'aeiouu') like '%' || translate($${i + 5}, 'áéíóúü', 'aeiouu') || '%'`);
  const rows = await q(
    `select f.id, f.kind, f.name, f.brand, f.category, f.presentation, f.state, f.basis_amount, f.basis_unit, f.energy_kcal, f.protein_g, f.carbs_g, f.fat_g,
            f.verification, f.is_demo, f.source, f.owner_id is not null as own, f.allergens, f.edible_portion_pct, f.origin_country, f.dataset, f.carbs_basis,
            (select json_agg(json_build_object('id', m.id, 'name', m.name, 'amount', m.amount, 'unit', m.unit) order by m.amount) from food_measures m where m.food_id=f.id) as measures
       from foods f
      where ${visibleTo('f', '$1')} and f.archived_at is null
        and ($2 = '' or f.kind = $2) and ($3 = '' or f.category = $3) and ($4 or not f.is_demo)
        ${mine ? 'and f.owner_id = $1' : ''}
        ${originCond}
        ${conds.length ? 'and ' + conds.join(' and ') : ''}
      order by (f.owner_id is not null) desc, f.is_demo, (f.origin_country = 'AR') desc nulls last, (f.kind = 'producto'), ${words.length ? 'length(f.name),' : ''} f.name limit 60`,
    [u.id, kind, category, includeDemo, ...words],
  );
  res.json(rows);
});

foodsRouter.post('/snapshots', async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string().uuid()).max(500) }), req.body);
  const map = await getSnapshots(b.ids, user(req).id);
  res.json(Object.fromEntries(map));
});

foodsRouter.get('/:id', async (req, res) => {
  const u = user(req);
  const f = await one(`select f.*, f.owner_id = $2 as own from foods f where f.id=$1 and ${visibleTo('f', '$2')}`, [param(req, 'id'), u.id]);
  if (!f) throw notFound('Alimento');
  const measures = await q('select * from food_measures where food_id=$1 order by amount', [f.id]);
  let recipe = null;
  if (f.kind === 'receta') {
    recipe = await one('select * from recipe_details where food_id=$1', [f.id]);
    recipe.ingredients = await q('select ri.*, i.name, i.brand, i.kind as ingredient_kind from recipe_ingredients ri join foods i on i.id=ri.ingredient_id where recipe_id=$1 order by position', [f.id]);
  }
  const usedIn = await q('select f.id, f.name from recipe_ingredients ri join foods f on f.id=ri.recipe_id where ri.ingredient_id=$1 and (f.owner_id is null or f.owner_id=$2) limit 20', [f.id, u.id]);
  res.json({ ...f, measures, recipe, used_in: usedIn });
});

async function ownFood(req: any) {
  const f = await one('select * from foods where id=$1 and owner_id=$2', [param(req, 'id'), user(req).id]);
  if (!f) throw new HttpError(403, 'Solo podés modificar alimentos creados por vos. Los del catálogo común se editan desde la carga del catálogo.');
  return f;
}

foodsRouter.post('/', async (req, res) => {
  const u = user(req);
  const b = parse(foodSchema, req.body);
  checkFood(b);
  const row = await one(
    `insert into foods(kind, name, brand, category, presentation, state, edible_portion_pct, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
                       density_g_per_ml, allergens, label_data, source, source_ref, source_date, verification, owner_id, visibility, created_by, dataset, origin_country, carbs_basis)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'sin_verificar',$22,'privado',$22,'Propio',$23,$24) returning *`,
    [b.kind, b.name, b.brand ?? null, b.category, b.presentation ?? null, b.state ?? null, b.edible_portion_pct ?? null, b.basis_amount, b.basis_unit, b.energy_kcal, b.protein_g, b.carbs_g, b.fat_g, b.fiber_g ?? null, b.sodium_mg ?? null, b.density_g_per_ml ?? null, b.allergens, b.label_data ?? null, b.source, b.source_ref ?? null, b.source_date ?? null, u.id, b.origin_country ?? null, b.carbs_basis ?? null],
  );
  await audit(u.id, 'alimento_creado', 'alimento', row.id);
  res.status(201).json(row);
});

foodsRouter.put('/:id', async (req, res) => {
  const f = await ownFood(req);
  if (f.kind === 'receta') throw new HttpError(400, 'Las recetas se editan desde el editor de recetas');
  const b = parse(foodSchema, req.body);
  checkFood(b);
  const row = await one(
    `update foods set kind=$2, name=$3, brand=$4, category=$5, presentation=$6, state=$7, edible_portion_pct=$8, basis_amount=$9, basis_unit=$10, energy_kcal=$11, protein_g=$12,
            carbs_g=$13, fat_g=$14, fiber_g=$15, sodium_mg=$16, density_g_per_ml=$17, allergens=$18, label_data=$19, source=$20, source_ref=$21, source_date=$22,
            origin_country=$23, carbs_basis=$24, updated_at=now()
      where id=$1 returning *`,
    [f.id, b.kind, b.name, b.brand ?? null, b.category, b.presentation ?? null, b.state ?? null, b.edible_portion_pct ?? null, b.basis_amount, b.basis_unit, b.energy_kcal, b.protein_g, b.carbs_g, b.fat_g, b.fiber_g ?? null, b.sodium_mg ?? null, b.density_g_per_ml ?? null, b.allergens, b.label_data ?? null, b.source, b.source_ref ?? null, b.source_date ?? null, b.origin_country ?? null, b.carbs_basis ?? null],
  );
  await recomputeRecipesUsing(f.id);
  await audit(user(req).id, 'alimento_editado', 'alimento', f.id);
  res.json(row);
});

foodsRouter.post('/:id/archive', async (req, res) => {
  const f = await ownFood(req);
  await q('update foods set archived_at=now() where id=$1', [f.id]);
  await audit(user(req).id, 'alimento_archivado', 'alimento', f.id);
  res.json({ ok: true });
});

const measureSchema = z.object({ name: z.string().trim().min(2).max(80), amount: z.number().positive().max(5000), unit: z.enum(['g', 'ml']), source: z.string().trim().min(3, 'Indicá de dónde surge la equivalencia').max(200) });

foodsRouter.post('/:id/measures', async (req, res) => {
  const f = await ownFood(req);
  const b = parse(measureSchema, req.body);
  const row = await one('insert into food_measures(food_id, name, amount, unit, source) values ($1,$2,$3,$4,$5) returning *', [f.id, b.name, b.amount, b.unit, b.source]);
  await recomputeRecipesUsing(f.id);
  res.status(201).json(row);
});

foodsRouter.delete('/:id/measures/:mid', async (req, res) => {
  const f = await ownFood(req);
  const used = await one("select 1 from recipe_ingredients where unit = 'medida:' || $1", [param(req, 'mid')]);
  if (used) throw new HttpError(409, 'La medida se usa en una receta');
  await q('delete from food_measures where id=$1 and food_id=$2', [param(req, 'mid'), f.id]);
  res.json({ ok: true });
});

// Recetas -------------------------------------------------------------------------

const recipeSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.enum(CATEGORIES as [string, ...string[]]).default('Preparaciones'),
  servings: z.number().positive('Indicá la cantidad de porciones').max(200),
  yield_grams: z.number().positive('Indicá el peso final de la preparación (rendimiento)').max(100000),
  preparation: z.string().max(10000).default(''),
  minutes: z.number().int().min(0).max(2000).nullable().optional(),
  ingredients: z
    .array(z.object({ ingredient_id: z.string().uuid(), quantity: z.number().positive().max(100000), unit: z.string().regex(/^(g|ml|medida:[0-9a-f-]{36})$/) }))
    .min(1, 'Agregá al menos un ingrediente')
    .max(60),
});

async function saveRecipe(req: any, id: string | null) {
  const u = user(req);
  const b = parse(recipeSchema, req.body);
  const ids = b.ingredients.map((i) => i.ingredient_id);
  const visible = await q(`select id, kind from foods f where id = any($2::uuid[]) and ${visibleTo('f', '$1')} and archived_at is null`, [u.id, ids]);
  if (new Set(visible.map((v) => v.id)).size !== new Set(ids).size) throw new HttpError(400, 'Hay ingredientes inexistentes o no disponibles');
  if (visible.some((v) => v.kind === 'receta')) throw new HttpError(400, 'Por ahora una receta no puede usar otra receta como ingrediente');
  return tx(async (c) => {
    let rid = id;
    if (!rid) {
      const f = await one(
        "insert into foods(kind, name, category, state, basis_amount, basis_unit, source, verification, owner_id, visibility, created_by, dataset) values ('receta',$1,$2,'listo_para_consumir',100,'g','Calculado a partir de los ingredientes y el rendimiento declarado','calculado',$3,'privado',$3,'Propio') returning id",
        [b.name, b.category, u.id],
        c,
      );
      rid = f.id as string;
      await q('insert into recipe_details(food_id, servings, yield_grams, preparation, minutes) values ($1,$2,$3,$4,$5)', [rid, b.servings, b.yield_grams, b.preparation, b.minutes ?? null], c);
    } else {
      await q('update foods set name=$2, category=$3, updated_at=now() where id=$1', [rid, b.name, b.category], c);
      await q('update recipe_details set servings=$2, yield_grams=$3, preparation=$4, minutes=$5 where food_id=$1', [rid, b.servings, b.yield_grams, b.preparation, b.minutes ?? null], c);
      await q('delete from recipe_ingredients where recipe_id=$1', [rid], c);
    }
    let pos = 0;
    for (const i of b.ingredients) {
      if (i.unit.startsWith('medida:')) {
        const m = await one('select 1 from food_measures where id=$1 and food_id=$2', [i.unit.slice(7), i.ingredient_id], c);
        if (!m) throw new HttpError(400, 'Medida casera inválida para un ingrediente');
      }
      await q('insert into recipe_ingredients(recipe_id, ingredient_id, quantity, unit, position) values ($1,$2,$3,$4,$5)', [rid, i.ingredient_id, i.quantity, i.unit, pos++], c);
    }
    const r = await recomputeRecipe(rid!, c);
    await audit(u.id, id ? 'receta_editada' : 'receta_creada', 'alimento', rid, null, null, c);
    return { id: rid, computed: r };
  });
}

foodsRouter.post('/recipes', async (req, res) => {
  res.status(201).json(await saveRecipe(req, null));
});

foodsRouter.put('/recipes/:id', async (req, res) => {
  const f = await ownFood(req);
  if (f.kind !== 'receta') throw new HttpError(400, 'No es una receta');
  res.json(await saveRecipe(req, f.id));
});

// Importación CSV (alimentos propios) ---------------------------------------------

const CSV_COLUMNS = ['tipo', 'nombre', 'marca', 'categoria', 'presentacion', 'estado', 'cantidad_referencia', 'unidad_referencia', 'energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'sodio_mg', 'alergenos', 'fuente', 'fecha_fuente'];

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const sep = text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** "" -> null (faltante); "0" -> 0. Acepta coma decimal. */
function num(v: string | undefined): number | null | 'error' {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 'error';
}

foodsRouter.post('/import', async (req, res) => {
  const u = user(req);
  const b = parse(z.object({ csv: z.string().min(1).max(2_000_000), dry_run: z.boolean().default(true) }), req.body);
  const rows = parseCsv(b.csv.replace(/^﻿/, ''));
  if (rows.length < 2) throw new HttpError(400, 'El archivo no tiene filas de datos');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missingCols = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length) throw new HttpError(400, `Faltan columnas: ${missingCols.join(', ')}`);
  const idx = (c: string) => header.indexOf(c);
  const valid: z.infer<typeof foodSchema>[] = [];
  const errors: { fila: number; errores: string[] }[] = [];
  rows.slice(1).forEach((r, i) => {
    const g = (c: string) => (r[idx(c)] ?? '').trim();
    const errs: string[] = [];
    const nums: Record<string, number | null> = {};
    for (const c of ['cantidad_referencia', 'energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'sodio_mg']) {
      const n = num(g(c));
      if (n === 'error') errs.push(`${c}: no es un número`);
      else nums[c] = n;
    }
    const tipo = g('tipo').toLowerCase();
    const candidate = {
      kind: tipo === 'producto' ? 'producto' : tipo === 'generico' || tipo === 'genérico' ? 'generico' : tipo,
      name: g('nombre'),
      brand: g('marca') || null,
      category: g('categoria'),
      presentation: g('presentacion') || null,
      state: g('estado') ? g('estado').toLowerCase().replace(/ /g, '_') : null,
      basis_amount: nums.cantidad_referencia ?? 100,
      basis_unit: g('unidad_referencia') || 'g',
      energy_kcal: nums.energia_kcal,
      protein_g: nums.proteinas_g,
      carbs_g: nums.carbohidratos_g,
      fat_g: nums.grasas_g,
      fiber_g: nums.fibra_g,
      sodium_mg: nums.sodio_mg,
      allergens: g('alergenos') ? g('alergenos').split(/[|/]/).map((a) => a.trim().toLowerCase()).filter(Boolean) : [],
      source: g('fuente'),
      source_date: g('fecha_fuente') || null,
      origin_country: idx('pais_origen') >= 0 && g('pais_origen') ? g('pais_origen').toUpperCase() : null,
      carbs_basis: idx('criterio_carbohidratos') >= 0 && g('criterio_carbohidratos') ? g('criterio_carbohidratos').toLowerCase() : null,
    };
    const r2 = foodSchema.safeParse(candidate);
    if (!r2.success) errs.push(...r2.error.issues.map((x) => `${x.path.join('.') || 'fila'}: ${x.message}`));
    else {
      try {
        checkFood(r2.data);
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    if (errs.length) errors.push({ fila: i + 2, errores: errs });
    else valid.push(r2.data!);
  });
  if (!b.dry_run && errors.length) throw new HttpError(400, 'Corregí los errores antes de importar', { errors });
  if (!b.dry_run) {
    await tx(async (c) => {
      for (const f of valid) {
        await q(
          `insert into foods(kind, name, brand, category, presentation, state, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, allergens, source, source_date, verification, owner_id, visibility, created_by, dataset, origin_country, carbs_basis)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'sin_verificar',$18,'privado',$18,'Propio',$19,$20)`,
          [f.kind, f.name, f.brand, f.category, f.presentation, f.state, f.basis_amount, f.basis_unit, f.energy_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g ?? null, f.sodium_mg ?? null, f.allergens, f.source, f.source_date ?? null, u.id, f.origin_country ?? null, f.carbs_basis ?? null],
          c,
        );
      }
    });
    await audit(u.id, 'alimentos_importados', 'alimento', null, null, { cantidad: valid.length });
  }
  res.json({ valid: valid.length, errors, imported: b.dry_run ? 0 : valid.length, columns: CSV_COLUMNS });
});
