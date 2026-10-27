// Importación de tablas de composición (p. ej. SARA 2) a partir de un CSV normalizado + ficha de metadatos.
// Los valores se copian tal cual: celda vacía = dato faltante. Nunca borra alimentos existentes.
import { q, tx } from '../db.js';
import { parseCsv } from '../routes/foods.js';
import { CATEGORIES } from '../routes/foods.js';

export interface TableMeta {
  dataset: string; // nombre corto, p. ej. "SARA 2"
  source: string; // cita completa
  license: string; // texto de la licencia o permiso
  source_date: string; // AAAA-MM-DD
  origin_country: string; // 'AR'
  carbs_basis: 'totales' | 'disponibles';
  verification: 'fuente_secundaria' | 'verificado';
  basis_amount?: number;
}

export const TABLE_COLUMNS = ['codigo', 'nombre', 'categoria', 'estado', 'energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'sodio_mg', 'porcion_comestible_pct', 'fuente_original'];

const num = (s: string | undefined): number | null | 'error' => {
  const t = (s ?? '').trim();
  if (t === '' || t === '-' || t.toLowerCase() === 'nd' || t.toLowerCase() === 's/d') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : 'error';
};

/** La columna fuente_original puede traer texto o un objeto JSON con el detalle por nutriente. */
function parseDetail(s: string | null) {
  if (!s) return null;
  if (s.startsWith('{')) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

export function validateMeta(m: any): TableMeta {
  const missing = ['dataset', 'source', 'license', 'source_date', 'origin_country', 'carbs_basis', 'verification'].filter((k) => !m?.[k]);
  if (missing.length) throw new Error(`Faltan datos en la ficha de la fuente: ${missing.join(', ')}`);
  if (!['totales', 'disponibles'].includes(m.carbs_basis)) throw new Error('carbs_basis debe ser "totales" o "disponibles"');
  return m;
}

/** skipInvalid: importa las filas válidas y deja afuera las inválidas (quedan en el informe). Por defecto, todo o nada. */
export async function importTable(csv: string, metaRaw: unknown, apply: boolean, opts: { skipInvalid?: boolean } = {}) {
  const meta = validateMeta(metaRaw);
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = TABLE_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Faltan columnas: ${missing.join(', ')}`);
  const at = (r: string[], c: string) => (r[header.indexOf(c)] ?? '').trim();
  const valid: any[] = [];
  const errors: { fila: number; codigo: string; errores: string[] }[] = [];
  const codes = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const errs: string[] = [];
    const code = at(r, 'codigo');
    if (!code) errs.push('sin código');
    if (codes.has(code)) errs.push('código repetido');
    codes.add(code);
    const name = at(r, 'nombre');
    if (name.length < 2) errs.push('sin nombre');
    const cat = at(r, 'categoria');
    if (!CATEGORIES.includes(cat)) errs.push(`categoría desconocida "${cat}"`);
    const vals: Record<string, number | null> = {};
    for (const c of ['energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'sodio_mg', 'porcion_comestible_pct']) {
      const v = num(at(r, c));
      if (v === 'error') errs.push(`${c} no es un número`);
      else vals[c] = v;
    }
    for (const c of ['proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g']) if (vals[c] !== null && vals[c]! > 100) errs.push(`${c} mayor a 100`);
    if (vals.energia_kcal !== null && vals.energia_kcal! > 900) errs.push('energía mayor a 900 kcal/100 g');
    if ((vals.proteinas_g ?? 0) + (vals.carbohidratos_g ?? 0) + (vals.grasas_g ?? 0) > 102) errs.push('macronutrientes suman más de 100 g');
    if (vals.porcion_comestible_pct !== null && !(vals.porcion_comestible_pct! > 0 && vals.porcion_comestible_pct! <= 100)) errs.push('porción comestible fuera de rango');
    if ([vals.energia_kcal, vals.proteinas_g, vals.carbohidratos_g, vals.grasas_g].every((v) => v === null)) errs.push('sin valores nutricionales');
    const estado = at(r, 'estado').toLowerCase().replace(/ /g, '_');
    if (estado && !['crudo', 'cocido', 'listo_para_consumir'].includes(estado)) errs.push(`estado desconocido "${estado}"`);
    if (errs.length) errors.push({ fila: i + 2, codigo: code, errores: errs });
    else valid.push({ code, name, cat, estado: estado || null, vals, original: at(r, 'fuente_original') || null });
  });
  let inserted = 0;
  let updated = 0;
  if (apply) {
    if (errors.length && !opts.skipInvalid) throw new Error(`Hay ${errors.length} filas con errores: no se importó nada`);
    await tx(async (c) => {
      for (const v of valid) {
        const r = await q(
          `insert into foods(kind, name, category, state, edible_portion_pct, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
                             label_data, source, source_ref, source_date, verification, owner_id, visibility, origin_country, dataset, carbs_basis)
           values ('generico',$1,$2,$3,$4,$5,'g',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,null,'catalogo',$17,$18,$19)
           on conflict (source, source_ref) where source_ref is not null and owner_id is null
           do update set name=excluded.name, category=excluded.category, state=excluded.state, edible_portion_pct=excluded.edible_portion_pct,
                         energy_kcal=excluded.energy_kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g, fiber_g=excluded.fiber_g,
                         sodium_mg=excluded.sodium_mg, label_data=excluded.label_data, source_date=excluded.source_date, updated_at=now()
           returning (xmax = 0) as inserted`,
          [
            v.name, v.cat, v.estado, v.vals.porcion_comestible_pct, meta.basis_amount ?? 100, v.vals.energia_kcal, v.vals.proteinas_g, v.vals.carbohidratos_g, v.vals.grasas_g, v.vals.fibra_g, v.vals.sodio_mg,
            { license: meta.license, original_source: parseDetail(v.original), carbs_note: meta.carbs_basis === 'disponibles' ? 'Carbohidratos disponibles (sin fibra)' : 'Carbohidratos totales (incluyen fibra)' },
            meta.source, `${meta.dataset} ${v.code}`, meta.source_date, meta.verification, meta.origin_country, meta.dataset, meta.carbs_basis,
          ],
          c,
        );
        if (r[0].inserted) inserted++;
        else updated++;
      }
    });
  }
  return { valid: valid.length, errors, inserted, updated };
}
