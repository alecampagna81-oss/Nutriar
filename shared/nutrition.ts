// Cálculos nutricionales compartidos entre servidor y cliente.
// Regla central: un valor NULL significa "dato faltante" y nunca se trata como 0.

export const NUTRIENTS = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const;
export type NutrientKey = (typeof NUTRIENTS)[number];

export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  energy_kcal: { label: 'Energía', unit: 'kcal' },
  protein_g: { label: 'Proteínas', unit: 'g' },
  carbs_g: { label: 'Carbohidratos', unit: 'g' },
  fat_g: { label: 'Grasas', unit: 'g' },
};

export type Unit = 'g' | 'ml' | 'medida' | 'porcion';

export interface MeasureSnap {
  id: string;
  name: string;
  amount: number;
  unit: 'g' | 'ml';
}

export interface IngredientSnap {
  food_id: string;
  name: string;
  amount: number; // cantidad total en la receta
  unit: 'g' | 'ml';
  edible_portion_pct: number | null;
}

export interface FoodSnap {
  id: string;
  kind: 'generico' | 'producto' | 'receta';
  name: string;
  brand: string | null;
  state: string | null;
  basis_amount: number;
  basis_unit: 'g' | 'ml';
  energy_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  density_g_per_ml: number | null;
  edible_portion_pct: number | null;
  allergens: string[];
  measures: MeasureSnap[];
  verification: string;
  is_demo: boolean;
  recipe?: { servings: number; yield_grams: number; preparation: string; ingredients: IngredientSnap[] };
}

export interface PlanItemBase {
  id: string;
  food_id: string;
  quantity: number;
  unit: Unit;
  measure_id?: string | null;
  gross?: boolean; // la cantidad indicada incluye partes no comestibles
  note?: string;
}

export interface PlanItem extends PlanItemBase {
  alternatives?: (PlanItemBase & { snapshot?: FoodSnap })[];
  snapshot?: FoodSnap;
}

export interface Resolved {
  ok: boolean;
  error?: string;
  amount?: number; // en la unidad base del alimento, ya ajustada a porción comestible
  dimension?: 'g' | 'ml';
  rawAmount?: number; // cantidad en g/ml tal como se indicó (antes de porción comestible)
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Convierte la cantidad del ítem a la unidad base del alimento. */
export function resolveAmount(item: PlanItemBase, food: FoodSnap): Resolved {
  let amount = Number(item.quantity);
  if (!(amount > 0)) return { ok: false, error: 'Cantidad inválida' };
  let unit: 'g' | 'ml';
  if (item.unit === 'g' || item.unit === 'ml') {
    unit = item.unit;
  } else if (item.unit === 'medida') {
    const m = food.measures.find((x) => x.id === item.measure_id);
    if (!m) return { ok: false, error: 'Medida casera sin conversión documentada' };
    amount = amount * m.amount;
    unit = m.unit;
  } else if (item.unit === 'porcion') {
    if (!food.recipe) return { ok: false, error: 'Solo las recetas se indican en porciones' };
    amount = amount * (food.recipe.yield_grams / food.recipe.servings);
    unit = 'g';
  } else {
    return { ok: false, error: 'Unidad desconocida' };
  }
  const rawAmount = amount;
  if (unit !== food.basis_unit) {
    if (!food.density_g_per_ml) return { ok: false, error: `No hay densidad documentada para convertir ${unit} a ${food.basis_unit}` };
    amount = unit === 'ml' ? amount * food.density_g_per_ml : amount / food.density_g_per_ml;
  }
  if (item.gross && food.edible_portion_pct && food.edible_portion_pct < 100) {
    amount = (amount * food.edible_portion_pct) / 100;
  }
  return { ok: true, amount, dimension: unit, rawAmount };
}

export interface NutrientTotal {
  value: number; // suma de los valores conocidos
  missing: number; // cantidad de ítems sin dato para este nutriente
}
export type Totals = Record<NutrientKey, NutrientTotal> & { items: number; errors: string[] };

export function emptyTotals(): Totals {
  return {
    energy_kcal: { value: 0, missing: 0 },
    protein_g: { value: 0, missing: 0 },
    carbs_g: { value: 0, missing: 0 },
    fat_g: { value: 0, missing: 0 },
    items: 0,
    errors: [],
  };
}

/** Nutrientes de un ítem; null = dato faltante o conversión imposible. */
export function itemNutrients(item: PlanItemBase, food: FoodSnap): Record<NutrientKey, number | null> & { error?: string } {
  const r = resolveAmount(item, food);
  const out = {} as Record<NutrientKey, number | null> & { error?: string };
  for (const k of NUTRIENTS) {
    const v = food[k];
    out[k] = r.ok && v !== null && v !== undefined ? (Number(v) * r.amount!) / food.basis_amount : null;
  }
  if (!r.ok) out.error = r.error;
  return out;
}

export function addTotals(t: Totals, item: PlanItemBase, food: FoodSnap | undefined) {
  t.items++;
  if (!food) {
    for (const k of NUTRIENTS) t[k].missing++;
    t.errors.push('Alimento no encontrado');
    return t;
  }
  const n = itemNutrients(item, food);
  for (const k of NUTRIENTS) {
    if (n[k] === null) t[k].missing++;
    else t[k].value += n[k]!;
  }
  if (n.error) t.errors.push(`${food.name}: ${n.error}`);
  return t;
}

export function mergeTotals(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  for (const k of NUTRIENTS) {
    out[k].value = a[k].value + b[k].value;
    out[k].missing = a[k].missing + b[k].missing;
  }
  out.items = a.items + b.items;
  out.errors = [...a.errors, ...b.errors];
  return out;
}

export function formatTotal(t: NutrientTotal, unit: string, decimals = 0): string {
  if (t.missing > 0 && t.value === 0) return 'sin datos';
  const v = `${round(t.value, decimals).toLocaleString('es-AR')} ${unit}`;
  return t.missing > 0 ? `≥ ${v} (faltan datos de ${t.missing} ítem${t.missing > 1 ? 's' : ''})` : v;
}

/** Texto legible de la cantidad: "1 taza (158 g)", "150 g", "2 porciones (360 g)". */
export function describeQuantity(item: PlanItemBase, food: FoodSnap): string {
  const q = Number(item.quantity).toLocaleString('es-AR');
  if (item.unit === 'g' || item.unit === 'ml') return `${q} ${item.unit}`;
  if (item.unit === 'medida') {
    const m = food.measures.find((x) => x.id === item.measure_id);
    if (!m) return `${q} (medida no disponible)`;
    const total = `${round(Number(item.quantity) * m.amount, 0).toLocaleString('es-AR')} ${m.unit}`;
    if (Number(item.quantity) === 1) return m.name.includes('(') ? m.name : `${m.name} (${total})`;
    return `${q} × ${m.name} = ${total}`;
  }
  if (item.unit === 'porcion' && food.recipe) {
    const g = (Number(item.quantity) * food.recipe.yield_grams) / food.recipe.servings;
    return `${q} porci${Number(item.quantity) === 1 ? 'ón' : 'ones'} (${round(g, 0).toLocaleString('es-AR')} g)`;
  }
  return q;
}

/** Valores nutricionales de una receta a partir de sus ingredientes y su rendimiento declarado. */
export function computeRecipe(
  ingredients: { item: PlanItemBase; food: FoodSnap }[],
  yieldGrams: number,
  servings: number,
) {
  const totals = emptyTotals();
  for (const { item, food } of ingredients) addTotals(totals, item, food);
  const per100: Record<NutrientKey, number | null> = {} as never;
  const perServing: Record<NutrientKey, number | null> = {} as never;
  for (const k of NUTRIENTS) {
    // Si falta el dato de algún ingrediente, el valor de la receta queda como faltante:
    // no se informa un valor parcial como si fuera completo.
    const complete = totals[k].missing === 0;
    per100[k] = complete ? (totals[k].value / yieldGrams) * 100 : null;
    perServing[k] = complete ? totals[k].value / servings : null;
  }
  return { totals, per100, perServing, gramsPerServing: yieldGrams / servings };
}

// ---------------------------------------------------------------------------
// Lista de compras

export interface ShoppingLine {
  food_id: string;
  name: string;
  unit: 'g' | 'ml';
  amount: number; // cantidad comestible / indicada
  purchase_amount: number | null; // con desperdicio, si corresponde
  edible_portion_pct: number | null;
  from_recipes: string[];
}

export interface ShoppingIssue {
  name: string;
  reason: string;
}

/**
 * Consolida cantidades. Solo suma cantidades de la misma dimensión (g con g, ml con ml);
 * si un alimento aparece en g y en ml se informan en líneas separadas.
 * Las recetas se expanden en sus ingredientes en proporción a las porciones indicadas.
 */
export function buildShoppingList(items: PlanItem[]): { lines: ShoppingLine[]; issues: ShoppingIssue[] } {
  const map = new Map<string, ShoppingLine>();
  const issues: ShoppingIssue[] = [];
  const add = (food_id: string, name: string, unit: 'g' | 'ml', amount: number, gross: boolean, edible: number | null, recipe?: string) => {
    const key = `${food_id}|${unit}`;
    let line = map.get(key);
    if (!line) {
      line = { food_id, name, unit, amount: 0, purchase_amount: null, edible_portion_pct: edible, from_recipes: [] };
      map.set(key, line);
    }
    // amount = porción comestible; purchase = peso a comprar con desperdicio
    const edibleAmount = gross && edible ? (amount * edible) / 100 : amount;
    const purchase = edible && edible < 100 ? (gross ? amount : (amount * 100) / edible) : null;
    line.amount += edibleAmount;
    if (purchase !== null) line.purchase_amount = (line.purchase_amount ?? 0) + purchase;
    if (recipe && !line.from_recipes.includes(recipe)) line.from_recipes.push(recipe);
  };
  for (const item of items) {
    const food = item.snapshot;
    if (!food) {
      issues.push({ name: 'Alimento desconocido', reason: 'Sin datos del alimento' });
      continue;
    }
    if (food.recipe) {
      const r = resolveAmount({ ...item, gross: false }, food);
      if (!r.ok || r.dimension !== 'g') {
        issues.push({ name: food.name, reason: r.error ?? 'No se pudo expandir la receta' });
        continue;
      }
      const factor = r.rawAmount! / food.recipe.yield_grams;
      for (const ing of food.recipe.ingredients) {
        add(ing.food_id, ing.name, ing.unit, ing.amount * factor, false, ing.edible_portion_pct, food.name);
      }
      continue;
    }
    const r = resolveAmount({ ...item, gross: false }, food);
    if (!r.ok) {
      issues.push({ name: food.name, reason: r.error! });
      continue;
    }
    add(food.id, food.name, r.dimension!, r.rawAmount!, !!item.gross, food.edible_portion_pct);
  }
  const lines = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { lines, issues };
}

export function formatAmount(n: number, unit: string) {
  if (unit === 'g' && n >= 1000) return `${round(n / 1000, 2).toLocaleString('es-AR')} kg`;
  if (unit === 'ml' && n >= 1000) return `${round(n / 1000, 2).toLocaleString('es-AR')} l`;
  return `${round(n, 0).toLocaleString('es-AR')} ${unit}`;
}

// ---------------------------------------------------------------------------
// Estructura de planes

export interface PlanMeal {
  key: string;
  name: string;
  time: string;
}
export interface PlanDay {
  week: number;
  day: number; // 1 = lunes … 7 = domingo
  meals: Record<string, PlanItem[]>;
  note?: string;
}
export interface Supplement {
  name: string;
  dose: string;
  frequency: string;
  timing: string;
  notes: string;
}
export interface PlanContent {
  weeks: number;
  meals: PlanMeal[];
  days: PlanDay[];
  show_nutrients: boolean;
  supplements: Supplement[];
  general_notes: string;
}

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function dayLabel(d: PlanDay, weeks: number) {
  return weeks > 1 ? `Semana ${d.week} · ${WEEKDAYS[d.day - 1]}` : WEEKDAYS[d.day - 1];
}

export function defaultPlanContent(weeks = 1): PlanContent {
  const meals: PlanMeal[] = [
    { key: 'desayuno', name: 'Desayuno', time: '08:00' },
    { key: 'almuerzo', name: 'Almuerzo', time: '13:00' },
    { key: 'merienda', name: 'Merienda', time: '17:00' },
    { key: 'cena', name: 'Cena', time: '21:00' },
  ];
  return {
    weeks,
    meals,
    days: buildDays(weeks, meals),
    show_nutrients: false,
    supplements: [],
    general_notes: '',
  };
}

export function buildDays(weeks: number, meals: PlanMeal[], prev: PlanDay[] = []): PlanDay[] {
  const days: PlanDay[] = [];
  for (let w = 1; w <= weeks; w++)
    for (let d = 1; d <= 7; d++) {
      const old = prev.find((x) => x.week === w && x.day === d);
      const m: Record<string, PlanItem[]> = {};
      for (const meal of meals) m[meal.key] = old?.meals[meal.key] ?? [];
      days.push({ week: w, day: d, meals: m, note: old?.note });
    }
  return days;
}

export function dayTotals(day: PlanDay, mealKeys: string[]) {
  const perMeal: Record<string, Totals> = {};
  let total = emptyTotals();
  for (const k of mealKeys) {
    const t = emptyTotals();
    for (const it of day.meals[k] ?? []) addTotals(t, it, it.snapshot);
    perMeal[k] = t;
    total = mergeTotals(total, t);
  }
  return { perMeal, total };
}

/** Día del plan que corresponde a una fecha (ciclo semanal a partir de la fecha de inicio). */
export function planDayForDate(content: PlanContent, startDate: string | null, date: string): PlanDay | undefined {
  const d = new Date(date + 'T12:00:00Z');
  const weekday = ((d.getUTCDay() + 6) % 7) + 1;
  let week = 1;
  if (startDate && content.weeks > 1) {
    const s = new Date(startDate + 'T12:00:00Z');
    const sMonday = new Date(s);
    sMonday.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7));
    const diffWeeks = Math.floor((d.getTime() - sMonday.getTime()) / (7 * 86400000));
    week = (((diffWeeks % content.weeks) + content.weeks) % content.weeks) + 1;
  }
  return content.days.find((x) => x.week === week && x.day === weekday);
}

export const ALLERGENS: Record<string, string> = {
  gluten: 'Gluten (TACC)',
  lactosa: 'Lactosa',
  leche: 'Proteína de leche',
  huevo: 'Huevo',
  mani: 'Maní',
  frutos_secos: 'Frutos secos',
  soja: 'Soja',
  pescado: 'Pescado',
  mariscos: 'Mariscos',
  sesamo: 'Sésamo',
};

export function allergenConflicts(food: FoodSnap | undefined, patientAllergens: string[]): string[] {
  if (!food) return [];
  return food.allergens.filter((a) => patientAllergens.includes(a));
}
