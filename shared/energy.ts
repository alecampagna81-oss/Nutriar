/**
 * Requerimiento energético: fórmulas publicadas, sin valores inventados.
 * Coeficientes cotejados el 28/10/2026 con al menos dos fuentes independientes
 * (ver docs/REQUERIMIENTO_ENERGETICO.md). Pesos en kg, tallas en cm (IOM usa metros), edad en años.
 * La profesional siempre puede reemplazar el resultado por un valor propio.
 */

export type EnergySex = 'femenino' | 'masculino';

export interface EnergyInputs {
  sex: EnergySex | null;
  age_years: number | null; // admite decimales (0,5 = 6 meses)
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
}

export type FormulaKey = 'mifflin' | 'hb1984' | 'hb1919' | 'fao1985' | 'schofield' | 'katch' | 'cunningham' | 'iom2005' | 'manual';
type Need = 'sex' | 'age' | 'weight' | 'height' | 'body_fat';

export interface FormulaInfo {
  key: FormulaKey;
  label: string;
  /** basal: metabolismo basal o de reposo, se multiplica por el factor de actividad. total: ya incluye la actividad. */
  kind: 'basal' | 'total' | 'manual';
  needs: Need[];
  ages: string;
  adultsOnly: boolean;
  ref: string;
}

export const FORMULAS: FormulaInfo[] = [
  { key: 'mifflin', label: 'Mifflin-St Jeor (1990)', kind: 'basal', needs: ['sex', 'age', 'weight', 'height'], ages: 'Adultos', adultsOnly: true, ref: 'Mifflin MD, St Jeor ST y col. Am J Clin Nutr 1990;51:241-7.' },
  { key: 'hb1984', label: 'Harris-Benedict revisada (Roza y Shizgal, 1984)', kind: 'basal', needs: ['sex', 'age', 'weight', 'height'], ages: 'Adultos', adultsOnly: true, ref: 'Roza AM, Shizgal HM. Am J Clin Nutr 1984;40:168-82.' },
  { key: 'hb1919', label: 'Harris-Benedict original (1919)', kind: 'basal', needs: ['sex', 'age', 'weight', 'height'], ages: 'Adultos', adultsOnly: true, ref: 'Harris JA, Benedict FG. A biometric study of basal metabolism in man. Carnegie Institution of Washington, 1919.' },
  { key: 'fao1985', label: 'FAO/OMS/UNU (1985)', kind: 'basal', needs: ['sex', 'age', 'weight'], ages: 'Todas las edades (por rangos)', adultsOnly: false, ref: 'FAO/OMS/UNU. Necesidades de energía y de proteínas. Serie de Informes Técnicos 724. OMS, 1985.' },
  { key: 'schofield', label: 'Schofield (1985), según peso', kind: 'basal', needs: ['sex', 'age', 'weight'], ages: 'Todas las edades (por rangos)', adultsOnly: false, ref: 'Schofield WN. Hum Nutr Clin Nutr 1985;39 Suppl 1:5-41.' },
  { key: 'katch', label: 'Katch-McArdle (masa magra)', kind: 'basal', needs: ['weight', 'body_fat'], ages: 'Adultos', adultsOnly: true, ref: 'Katch FI, McArdle WD. Fórmula basada en masa libre de grasa: 370 + 21,6 × masa magra.' },
  { key: 'cunningham', label: 'Cunningham (1980, masa magra)', kind: 'basal', needs: ['weight', 'body_fat'], ages: 'Adultos', adultsOnly: true, ref: 'Cunningham JJ. Am J Clin Nutr 1980;33:2372-4.' },
  { key: 'iom2005', label: 'IOM 2005 – Requerimiento energético estimado (EER)', kind: 'total', needs: ['sex', 'age', 'weight', 'height'], ages: 'Todas las edades, embarazo y lactancia', adultsOnly: false, ref: 'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids. 2005.' },
  { key: 'manual', label: 'Valor indicado por la profesional', kind: 'manual', needs: [], ages: '—', adultsOnly: false, ref: '' },
];
export const formulaByKey = (k: string) => FORMULAS.find((f) => f.key === k);

/** Factores de actividad de uso clínico habitual: multiplican el metabolismo basal. */
export const ACTIVITY_FACTORS = [
  { key: 'sedentario', label: 'Sedentario', factor: 1.2 },
  { key: 'ligero', label: 'Ligero', factor: 1.375 },
  { key: 'moderado', label: 'Moderado', factor: 1.55 },
  { key: 'intenso', label: 'Intenso', factor: 1.725 },
  { key: 'muy_intenso', label: 'Muy intenso', factor: 1.9 },
] as const;
export type ActivityKey = (typeof ACTIVITY_FACTORS)[number]['key'];

/** Niveles de actividad física de IOM 2005 (el coeficiente depende de edad y sexo). */
export const IOM_LEVELS = [
  { key: 'sedentario', label: 'Sedentario' },
  { key: 'poco_activo', label: 'Poco activo' },
  { key: 'activo', label: 'Activo' },
  { key: 'muy_activo', label: 'Muy activo' },
] as const;
export type IomLevel = (typeof IOM_LEVELS)[number]['key'];
const IOM_PA: Record<'nino' | 'nina' | 'hombre' | 'mujer', number[]> = {
  nino: [1.0, 1.13, 1.26, 1.42],
  nina: [1.0, 1.16, 1.31, 1.56],
  hombre: [1.0, 1.11, 1.25, 1.48],
  mujer: [1.0, 1.12, 1.27, 1.45],
};

/** Adicionales de IOM 2005 por embarazo y lactancia (kcal/día). */
export const PHYSIO = [
  { key: 'ninguna', label: 'Ninguna', add: 0 },
  { key: 'embarazo_1', label: 'Embarazo, 1.er trimestre', add: 0 },
  { key: 'embarazo_2', label: 'Embarazo, 2.º trimestre', add: 340 },
  { key: 'embarazo_3', label: 'Embarazo, 3.er trimestre', add: 452 },
  { key: 'lactancia_1', label: 'Lactancia, 0 a 6 meses', add: 330 },
  { key: 'lactancia_2', label: 'Lactancia, 7 a 12 meses', add: 400 },
] as const;
export type PhysioKey = (typeof PHYSIO)[number]['key'];

export interface EnergyConfig {
  formula: FormulaKey;
  activity: ActivityKey;
  iom_level: IomLevel;
  physio: PhysioKey;
  adjustment_kcal: number;
  manual_kcal: number | null;
  protein_pct: number;
  fat_pct: number;
  carbs_pct: number;
  inputs: EnergyInputs;
}

export const DEFAULT_MACROS = { protein_pct: 20, fat_pct: 30, carbs_pct: 50 };

export interface EnergyResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
  steps: string[];
  basal: number | null;
  factor: number | null;
  calculated: number | null;
  total: number | null;
  macros: { protein_g: number; fat_g: number; carbs_g: number } | null;
}

const NEED_LABEL: Record<Need, string> = { sex: 'sexo (femenino o masculino)', age: 'edad', weight: 'peso', height: 'talla', body_fat: 'porcentaje de grasa corporal' };
const r0 = (n: number) => Math.round(n);
const fmt = (n: number, d = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

// Tablas por rango de edad [edad máxima exclusiva, pendiente, constante] en kcal/día.
type Band = [number, number, number];
const FAO_1985: Record<EnergySex, Band[]> = {
  masculino: [[3, 60.9, -54], [10, 22.7, 495], [18, 17.5, 651], [30, 15.3, 679], [60, 11.6, 879], [Infinity, 13.5, 487]],
  femenino: [[3, 61.0, -51], [10, 22.5, 499], [18, 12.2, 746], [30, 14.7, 496], [60, 8.7, 829], [Infinity, 10.5, 596]],
};
const SCHOFIELD_W: Record<EnergySex, Band[]> = {
  masculino: [[3, 59.512, -30.4], [10, 22.706, 504.3], [18, 17.686, 658.2], [30, 15.057, 692.2], [60, 11.472, 873.1], [Infinity, 11.711, 587.7]],
  femenino: [[3, 58.317, -31.1], [10, 20.315, 485.9], [18, 13.384, 692.6], [30, 14.818, 486.6], [60, 8.126, 845.6], [Infinity, 9.082, 658.5]],
};
const BAND_LABEL = ['menos de 3 años', '3 a 9 años', '10 a 17 años', '18 a 29 años', '30 a 59 años', '60 años o más'];

function band(table: Band[], age: number) {
  const i = table.findIndex(([max]) => age < max);
  return { b: table[i], label: BAND_LABEL[i] };
}

export function computeEnergy(c: EnergyConfig): EnergyResult {
  const f = formulaByKey(c.formula);
  const res: EnergyResult = { ok: false, missing: [], warnings: [], steps: [], basal: null, factor: null, calculated: null, total: null, macros: null };
  if (!f) {
    res.missing.push('fórmula');
    return res;
  }
  const { sex, age_years: A, weight_kg: W, height_cm: H, body_fat_pct: BF } = c.inputs;
  const has: Record<Need, boolean> = { sex: sex === 'femenino' || sex === 'masculino', age: A != null && A >= 0, weight: W != null && W > 0, height: H != null && H > 0, body_fat: BF != null && BF > 0 && BF < 100 };
  let needs = f.needs;
  if (f.key === 'iom2005' && has.age && (A as number) < 3) needs = ['age', 'weight']; // lactantes y niños pequeños: solo peso y edad
  res.missing = needs.filter((n) => !has[n]).map((n) => NEED_LABEL[n]);
  if (f.kind === 'manual') {
    if (!(c.manual_kcal && c.manual_kcal > 0)) res.missing.push('valor de kcal/día');
  }
  if (res.missing.length) return finish(res, c);
  if (f.adultsOnly && A != null && A < 18) res.warnings.push(`${f.label} fue desarrollada en adultos; para menores de 18 años conviene FAO/OMS/UNU, Schofield o IOM 2005.`);

  const male = sex === 'masculino';
  const a = A as number, w = W as number, h = H as number;
  let basal: number | null = null;
  let total: number | null = null;

  switch (f.key) {
    case 'mifflin':
      basal = 10 * w + 6.25 * h - 5 * a + (male ? 5 : -161);
      res.steps.push(`Basal = 10 × ${fmt(w, 1)} kg + 6,25 × ${fmt(h, 1)} cm − 5 × ${fmt(a, 1)} años ${male ? '+ 5' : '− 161'} = ${fmt(basal)} kcal`);
      break;
    case 'hb1984':
      basal = male ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * a : 447.593 + 9.247 * w + 3.098 * h - 4.33 * a;
      res.steps.push(male ? `Basal = 88,362 + 13,397 × peso + 4,799 × talla − 5,677 × edad = ${fmt(basal)} kcal` : `Basal = 447,593 + 9,247 × peso + 3,098 × talla − 4,330 × edad = ${fmt(basal)} kcal`);
      break;
    case 'hb1919':
      basal = male ? 66.473 + 13.7516 * w + 5.0033 * h - 6.755 * a : 655.0955 + 9.5634 * w + 1.8496 * h - 4.6756 * a;
      res.steps.push(male ? `Basal = 66,473 + 13,7516 × peso + 5,0033 × talla − 6,755 × edad = ${fmt(basal)} kcal` : `Basal = 655,0955 + 9,5634 × peso + 1,8496 × talla − 4,6756 × edad = ${fmt(basal)} kcal`);
      break;
    case 'fao1985':
    case 'schofield': {
      const { b, label } = band((f.key === 'fao1985' ? FAO_1985 : SCHOFIELD_W)[sex as EnergySex], a);
      basal = b[1] * w + b[2];
      res.steps.push(`Basal (${male ? 'varones' : 'mujeres'}, ${label}) = ${fmt(b[1], 3)} × ${fmt(w, 1)} kg ${b[2] < 0 ? '−' : '+'} ${fmt(Math.abs(b[2]), 1)} = ${fmt(basal)} kcal`);
      break;
    }
    case 'katch':
    case 'cunningham': {
      const ffm = w * (1 - (BF as number) / 100);
      res.steps.push(`Masa magra = ${fmt(w, 1)} kg × (1 − ${fmt(BF as number, 1)} %) = ${fmt(ffm, 1)} kg`);
      basal = f.key === 'katch' ? 370 + 21.6 * ffm : 500 + 22 * ffm;
      res.steps.push(f.key === 'katch' ? `Basal = 370 + 21,6 × ${fmt(ffm, 1)} = ${fmt(basal)} kcal` : `Basal = 500 + 22 × ${fmt(ffm, 1)} = ${fmt(basal)} kcal`);
      break;
    }
    case 'iom2005': {
      if (a < 3) {
        const months = Math.floor(Math.round(a * 1200) / 100);
        const dep = months <= 3 ? 175 : months <= 6 ? 56 : months <= 12 ? 22 : 20;
        total = 89 * w - 100 + dep;
        res.steps.push(`EER (${months} meses) = 89 × ${fmt(w, 1)} kg − 100 + ${dep} (crecimiento) = ${fmt(total)} kcal`);
        res.steps.push('En menores de 3 años la fórmula no usa nivel de actividad.');
        break;
      }
      const hm = h / 100;
      const li = IOM_LEVELS.findIndex((l) => l.key === c.iom_level);
      const lvl = IOM_LEVELS[li < 0 ? 0 : li];
      if (a < 19) {
        const pa = IOM_PA[male ? 'nino' : 'nina'][li < 0 ? 0 : li];
        const growth = a < 9 ? 20 : 25;
        total = male ? 88.5 - 61.9 * a + pa * (26.7 * w + 903 * hm) + growth : 135.3 - 30.8 * a + pa * (10 * w + 934 * hm) + growth;
        res.steps.push(male
          ? `EER = 88,5 − 61,9 × edad + ${fmt(pa, 2)} × (26,7 × peso + 903 × talla en m) + ${growth} = ${fmt(total)} kcal`
          : `EER = 135,3 − 30,8 × edad + ${fmt(pa, 2)} × (10 × peso + 934 × talla en m) + ${growth} = ${fmt(total)} kcal`);
      } else {
        const pa = IOM_PA[male ? 'hombre' : 'mujer'][li < 0 ? 0 : li];
        total = male ? 662 - 9.53 * a + pa * (15.91 * w + 539.6 * hm) : 354 - 6.91 * a + pa * (9.36 * w + 726 * hm);
        res.steps.push(male
          ? `EER = 662 − 9,53 × edad + ${fmt(pa, 2)} × (15,91 × peso + 539,6 × talla en m) = ${fmt(total)} kcal`
          : `EER = 354 − 6,91 × edad + ${fmt(pa, 2)} × (9,36 × peso + 726 × talla en m) = ${fmt(total)} kcal`);
      }
      res.steps.push(`Nivel de actividad IOM: ${lvl.label}.`);
      break;
    }
    case 'manual':
      total = c.manual_kcal as number;
      res.steps.push(`Valor indicado: ${fmt(total)} kcal`);
      break;
  }

  if (basal != null) {
    res.basal = r0(basal);
    const act = ACTIVITY_FACTORS.find((x) => x.key === c.activity) ?? ACTIVITY_FACTORS[0];
    res.factor = act.factor;
    total = basal * act.factor;
    res.steps.push(`Con actividad (${act.label}, × ${fmt(act.factor, 3)}) = ${fmt(total)} kcal`);
  }
  if (f.kind !== 'manual' && total != null) {
    const ph = PHYSIO.find((p) => p.key === c.physio);
    if (ph && ph.key !== 'ninguna') {
      if (sex !== 'femenino') res.warnings.push('Embarazo o lactancia solo se suman con sexo femenino: no se aplicó.');
      else if (ph.add) {
        total += ph.add;
        res.steps.push(`${ph.label}: + ${ph.add} kcal (adicional IOM 2005)`);
      } else res.steps.push(`${ph.label}: sin adicional (IOM 2005)`);
    }
    if (c.adjustment_kcal) {
      total += c.adjustment_kcal;
      res.steps.push(`Ajuste por objetivo: ${c.adjustment_kcal > 0 ? '+' : '−'} ${fmt(Math.abs(c.adjustment_kcal))} kcal`);
    }
  }
  res.calculated = total != null ? r0(total) : null;
  if (res.calculated != null && res.calculated <= 0) {
    res.warnings.push('El cálculo dio un valor no válido: revisá los datos.');
    res.calculated = null;
  }
  return finish(res, c);
}

function finish(res: EnergyResult, c: EnergyConfig): EnergyResult {
  const override = c.formula !== 'manual' && c.manual_kcal && c.manual_kcal > 0 ? c.manual_kcal : null;
  res.total = override ?? res.calculated;
  if (override != null && res.calculated != null) res.steps.push(`Valor final elegido por la profesional: ${fmt(override)} kcal (el cálculo daba ${fmt(res.calculated)} kcal)`);
  else if (override != null) res.steps.push(`Valor final elegido por la profesional: ${fmt(override)} kcal`);
  res.ok = res.total != null;
  if (res.ok) res.missing = [];
  const sum = c.protein_pct + c.fat_pct + c.carbs_pct;
  if (Math.abs(sum - 100) > 0.01) res.warnings.push(`El reparto de macronutrientes suma ${fmt(sum, 1)} %: tiene que sumar 100 %.`);
  else if (res.total != null) res.macros = macroGrams(res.total, c);
  return res;
}

/** Gramos objetivo: proteínas y carbohidratos 4 kcal/g, grasas 9 kcal/g. */
export function macroGrams(kcal: number, p: { protein_pct: number; fat_pct: number; carbs_pct: number }) {
  return {
    protein_g: Math.round((kcal * p.protein_pct) / 100 / 4),
    fat_g: Math.round((kcal * p.fat_pct) / 100 / 9),
    carbs_g: Math.round((kcal * p.carbs_pct) / 100 / 4),
  };
}

/** Edad en años con decimales a partir de la fecha de nacimiento (cuenta meses cumplidos). */
export function ageFromBirth(birth: string | null | undefined, today = new Date()): number | null {
  if (!birth) return null;
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  if (months < 0) return null;
  // Desde los 3 años se usan años cumplidos; antes, la fracción de año da los meses cumplidos.
  return months >= 36 ? Math.floor(months / 12) : Math.round((months / 12) * 10000) / 10000;
}
