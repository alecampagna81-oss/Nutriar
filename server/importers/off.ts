// Importación de productos comercializados en Argentina desde exportaciones de Open Food Facts.
// Licencia de la base: ODbL; contenidos: DbCL. Exige atribución y compartir mejoras de la base derivada.
// Los productos se guardan sin modificar en un conjunto separado ("Open Food Facts"): las correcciones
// de una profesional se hacen creando un alimento propio, no editando el registro importado.
import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { q, tx } from '../db.js';

export const OFF_DATASET = 'Open Food Facts';
export const OFF_SOURCE = 'Open Food Facts (base colaborativa: datos de etiqueta cargados por voluntarios). Licencia ODbL 1.0 / DbCL 1.0 — https://world.openfoodfacts.org';

export interface OffFood {
  code: string;
  name: string;
  brand: string;
  category: string;
  presentation: string | null;
  basis_unit: 'g' | 'ml';
  energy_kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  allergens: string[];
  serving_size: string | null;
  last_modified: string | null; // AAAA-MM-DD
  energy_from_kj: boolean;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/en:(yerba-mate|teas|herbal-teas|coffees|infusions)/, 'Infusiones'],
  [/en:(beverages|waters|sodas|juices|drinks)/, 'Bebidas'],
  [/en:(dairies|milks|yogurts|cheeses|eggs|dulce-de-leche)/, 'Lácteos y huevos'],
  [/en:(breads|crackers|biscuits|cookies|pastries|viennoiseries)/, 'Panificados'],
  [/en:(pastas|cereals|rices|flours|breakfast-cereals|cereal-grains)/, 'Cereales y derivados'],
  [/en:(legumes|pulses|beans|lentils|chickpeas)/, 'Legumbres'],
  [/en:(meats|sausages|hams|poultry)/, 'Carnes'],
  [/en:(fishes|seafood|canned-fishes|tunas)/, 'Pescados y mariscos'],
  [/en:(fruits|fruit-based)/, 'Frutas'],
  [/en:(vegetables|vegetable-based)/, 'Verduras'],
  [/en:(nuts|seeds|peanuts)/, 'Frutos secos y semillas'],
  [/en:(fats|oils|butters|margarines)/, 'Aceites y grasas'],
  [/en:(sweet-spreads|jams|honeys|confectioneries|chocolates|candies|sugars|desserts)/, 'Azúcares y dulces'],
  [/en:(condiments|sauces|salts|spices|dressings|mayonnaises)/, 'Condimentos y salsas'],
];
const ALLERGEN_MAP: Record<string, string> = {
  'en:gluten': 'gluten', 'en:milk': 'leche', 'en:eggs': 'huevo', 'en:peanuts': 'mani', 'en:nuts': 'frutos_secos', 'en:soybeans': 'soja',
  'en:fish': 'pescado', 'en:crustaceans': 'mariscos', 'en:molluscs': 'mariscos', 'en:sesame-seeds': 'sesamo',
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const tags = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/** Normaliza y valida un registro de Open Food Facts. Devuelve el alimento o los motivos de rechazo. */
export function normalizeOff(r: Record<string, any>): { food?: OffFood; reasons: string[] } {
  const reasons: string[] = [];
  const n = r.nutriments ?? {};
  const get = (k: string) => (r[k] !== undefined ? r[k] : n[k]);
  const code = String(r.code ?? '').trim();
  if (!/^\d{8,14}$/.test(code)) reasons.push('código de barras inválido');
  const countries = tags(r.countries_tags);
  if (!countries.includes('en:argentina')) reasons.push('no figura como comercializado en Argentina');
  const name = String(r.product_name_es || r.product_name || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  if (name.length < 2) reasons.push('sin nombre');
  const brand = String(r.brands ?? '').split(',')[0].trim().slice(0, 100);
  if (!brand) reasons.push('sin marca');
  if (tags(r.data_quality_errors_tags).length) reasons.push('Open Food Facts marca errores de calidad en el producto');
  let kcal = num(get('energy-kcal_100g'));
  let fromKj = false;
  if (kcal === null) {
    const kj = num(get('energy-kj_100g')) ?? num(get('energy_100g'));
    if (kj !== null) {
      kcal = kj / 4.184; // 1 kcal = 4,184 kJ
      fromKj = true;
    }
  }
  if (kcal === null) reasons.push('sin energía declarada');
  const p = num(get('proteins_100g'));
  const c = num(get('carbohydrates_100g'));
  const f = num(get('fat_100g'));
  const fiber = num(get('fiber_100g'));
  const sodiumG = num(get('sodium_100g'));
  for (const [label, v] of [['proteínas', p], ['carbohidratos', c], ['grasas', f], ['fibra', fiber]] as const) {
    if (v !== null && (v < 0 || v > 100)) reasons.push(`${label} fuera de rango (${v} g/100)`);
  }
  if (kcal !== null && (kcal < 0 || kcal > 900)) reasons.push(`energía fuera de rango (${Math.round(kcal)} kcal/100)`);
  if ((p ?? 0) + (c ?? 0) + (f ?? 0) > 102) reasons.push('la suma de macronutrientes supera 100 g');
  if (sodiumG !== null && (sodiumG < 0 || sodiumG > 40)) reasons.push('sodio fuera de rango');
  // Coherencia energía-macronutrientes (factores de Atwater 4/4/9 y 2 para fibra), tolerancia 25 %.
  if (kcal !== null && p !== null && c !== null && f !== null) {
    const est = 4 * p + 4 * c + 9 * f + 2 * (fiber ?? 0);
    const ref = Math.max(est, kcal);
    if (ref > 20 && Math.abs(est - kcal) / ref > 0.25) reasons.push(`energía inconsistente con los macronutrientes (declara ${Math.round(kcal)} kcal, se esperan ~${Math.round(est)})`);
  }
  if (reasons.length) return { reasons };
  const cats = tags(r.categories_tags).join(' ');
  const category = CATEGORY_RULES.find(([re]) => re.test(cats))?.[1] ?? 'Otros';
  const allergens = [...new Set(tags(r.allergens_tags ?? r.allergens).map((a) => ALLERGEN_MAP[a]).filter(Boolean))];
  const lm = num(r.last_modified_t);
  const per = String(r.nutrition_data_per ?? '').toLowerCase();
  return {
    reasons,
    food: {
      code, name, brand, category,
      presentation: String(r.quantity ?? '').trim().slice(0, 120) || null,
      basis_unit: per === '100ml' ? 'ml' : 'g',
      energy_kcal: Math.round(kcal! * 10) / 10,
      protein_g: p, carbs_g: c, fat_g: f, fiber_g: fiber,
      sodium_mg: sodiumG === null ? null : Math.round(sodiumG * 1000 * 10) / 10,
      allergens,
      serving_size: String(r.serving_size ?? '').trim().slice(0, 60) || null,
      last_modified: lm ? new Date(lm * 1000).toISOString().slice(0, 10) : null,
      energy_from_kj: fromKj,
    },
  };
}

/** Lee una exportación de Open Food Facts: CSV separado por tabulaciones (con encabezado) o JSONL; admite .gz. */
export async function* readOffExport(file: string): AsyncGenerator<Record<string, any>> {
  let stream: NodeJS.ReadableStream = fs.createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  const jsonl = /\.jsonl(\.gz)?$/.test(file);
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (jsonl) {
      try {
        yield JSON.parse(line);
      } catch {
        yield { __invalid: true };
      }
      continue;
    }
    const cells = line.split('\t');
    if (!header) {
      header = cells.map((h) => h.trim().replace(/^﻿/, ''));
      for (const col of ['code', 'product_name', 'brands', 'countries_tags']) {
        if (!header.includes(col)) throw new Error(`El archivo no tiene la columna "${col}". ¿Es una exportación CSV (tabulada) de Open Food Facts?`);
      }
      continue;
    }
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = cells[i] ?? ''));
    yield rec;
  }
}

export interface ImportReport {
  read: number;
  accepted: number;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  reasons: Record<string, number>;
  examples: { code: string; name: string; reasons: string[] }[];
}

/** Valida e importa. Con apply=false solo informa. Nunca borra productos existentes. */
export async function importOff(records: AsyncIterable<Record<string, any>> | Iterable<Record<string, any>>, apply: boolean): Promise<ImportReport> {
  const report: ImportReport = { read: 0, accepted: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0, reasons: {}, examples: [] };
  const seen = new Set<string>();
  const batch: OffFood[] = [];
  for await (const r of records as AsyncIterable<Record<string, any>>) {
    report.read++;
    const { food, reasons } = r.__invalid ? { food: undefined, reasons: ['línea JSON inválida'] } : normalizeOff(r);
    if (!food) {
      report.rejected++;
      for (const x of reasons) {
        const key = x.replace(/\(.*\)/, '').trim();
        report.reasons[key] = (report.reasons[key] ?? 0) + 1;
      }
      if (report.examples.length < 15 && countriesOk(r)) report.examples.push({ code: String(r.code ?? ''), name: String(r.product_name ?? ''), reasons });
      continue;
    }
    if (seen.has(food.code)) {
      report.duplicates++;
      continue;
    }
    seen.add(food.code);
    report.accepted++;
    batch.push(food);
  }
  if (apply && batch.length) {
    await tx(async (c) => {
      for (const f of batch) {
        const r = await q(
          `insert into foods(kind, name, brand, category, presentation, state, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
                             allergens, label_data, source, source_ref, source_date, verification, owner_id, visibility, origin_country, dataset, carbs_basis)
           values ('producto',$1,$2,$3,$4,'listo_para_consumir',100,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'colaborativo',null,'catalogo','AR',$17,'disponibles')
           on conflict (source, source_ref) where source_ref is not null and owner_id is null
           do update set name=excluded.name, brand=excluded.brand, category=excluded.category, presentation=excluded.presentation, basis_unit=excluded.basis_unit,
                         energy_kcal=excluded.energy_kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g, fiber_g=excluded.fiber_g,
                         sodium_mg=excluded.sodium_mg, allergens=excluded.allergens, label_data=excluded.label_data, source_date=excluded.source_date, updated_at=now()
           returning (xmax = 0) as inserted`,
          [
            f.name, f.brand, f.category, f.presentation, f.basis_unit, f.energy_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, f.sodium_mg, f.allergens,
            { ean: f.code, url: `https://world.openfoodfacts.org/product/${f.code}`, serving_size: f.serving_size ?? undefined, energy_note: f.energy_from_kj ? 'Energía convertida desde kJ (1 kcal = 4,184 kJ)' : undefined, allergens_note: 'Alérgenos según Open Food Facts; no incluye trazas' },
            OFF_SOURCE, `EAN ${f.code}`, f.last_modified, OFF_DATASET,
          ],
          c,
        );
        if (r[0].inserted) report.inserted++;
        else report.updated++;
      }
    });
  }
  return report;
}

function countriesOk(r: Record<string, any>) {
  return tags(r.countries_tags).includes('en:argentina');
}
