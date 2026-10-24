// Comprobación 4: cálculos nutricionales y conversiones con casos verificables a mano.
import { describe, expect, it } from 'vitest';
import {
  addTotals, buildShoppingList, computeRecipe, describeQuantity, emptyTotals, formatTotal, itemNutrients, planDayForDate, defaultPlanContent,
  type FoodSnap, type PlanItem,
} from '../shared/nutrition.js';
import { derivedSeries } from '../shared/measures.js';
import { zonedToUtc } from '../shared/time.js';

const base = { brand: null, state: null, basis_amount: 100, basis_unit: 'g' as const, density_g_per_ml: null, edible_portion_pct: null, allergens: [], measures: [], verification: 'fuente_secundaria', is_demo: false };
// Valores USDA SR28 por 100 g
const leche: FoodSnap = { ...base, id: 'leche', kind: 'generico', name: 'Leche descremada', energy_kcal: 34, protein_g: 3.37, carbs_g: 4.96, fat_g: 0.08, density_g_per_ml: 245 / 236.588, measures: [{ id: 'taza', name: '1 taza', amount: 245, unit: 'g' }] };
const banana: FoodSnap = { ...base, id: 'banana', kind: 'generico', name: 'Banana', energy_kcal: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33, edible_portion_pct: 64, measures: [{ id: 'rodajas', name: '1 taza en rodajas', amount: 150, unit: 'g' }] };
const manzana: FoodSnap = { ...base, id: 'manzana', kind: 'generico', name: 'Manzana', energy_kcal: 52, protein_g: 0.26, carbs_g: 13.81, fat_g: 0.17, edible_portion_pct: 90 };
const sinProteina: FoodSnap = { ...base, id: 'x', kind: 'producto', name: 'Producto sin dato de proteínas', energy_kcal: 200, protein_g: null, carbs_g: 30, fat_g: 0 };

const item = (food: FoodSnap, quantity: number, unit: PlanItem['unit'], extra: Partial<PlanItem> = {}): PlanItem => ({ id: Math.random().toString(), food_id: food.id, quantity, unit, snapshot: food, ...extra });

describe('cálculos nutricionales', () => {
  it('gramos directos: 150 g de banana = 133,5 kcal', () => {
    const n = itemNutrients(item(banana, 150, 'g'), banana);
    expect(n.energy_kcal).toBeCloseTo(133.5, 5);
    expect(n.carbs_g).toBeCloseTo(34.26, 5);
  });

  it('medida casera documentada: 1 taza en rodajas (150 g) = 133,5 kcal', () => {
    const it1 = item(banana, 1, 'medida', { measure_id: 'rodajas' });
    expect(itemNutrients(it1, banana).energy_kcal).toBeCloseTo(133.5, 5);
    expect(describeQuantity(it1, banana)).toBe('1 × 1 taza en rodajas (150 g)');
  });

  it('mililitros con densidad documentada: 250 ml de leche = 258,9 g = 88,0 kcal', () => {
    const n = itemNutrients(item(leche, 250, 'ml'), leche);
    expect(n.energy_kcal).toBeCloseTo(0.34 * 250 * (245 / 236.588), 5);
    expect(n.energy_kcal).toBeCloseTo(88.02, 1);
  });

  it('sin densidad documentada no convierte ml a g y lo informa', () => {
    const n = itemNutrients(item(banana, 100, 'ml'), banana);
    expect(n.energy_kcal).toBeNull();
    expect(n.error).toMatch(/densidad/);
  });

  it('peso bruto con desperdicio: 150 g de manzana entera (90 % comestible) = 135 g = 70,2 kcal', () => {
    expect(itemNutrients(item(manzana, 150, 'g', { gross: true }), manzana).energy_kcal).toBeCloseTo(70.2, 5);
    expect(itemNutrients(item(manzana, 150, 'g'), manzana).energy_kcal).toBeCloseTo(78, 5);
  });

  it('dato faltante ≠ cero: se informa como faltante y no se suma como 0', () => {
    const t = emptyTotals();
    addTotals(t, item(sinProteina, 100, 'g'), sinProteina);
    addTotals(t, item(banana, 100, 'g'), banana);
    expect(t.protein_g.value).toBeCloseTo(1.09, 5);
    expect(t.protein_g.missing).toBe(1);
    expect(t.fat_g.missing).toBe(0); // grasa = 0 es un dato, no un faltante
    expect(t.fat_g.value).toBeCloseTo(0.33, 5);
    expect(formatTotal(t.protein_g, 'g', 1)).toBe('≥ 1,1 g (faltan datos de 1 ítem)');
    expect(formatTotal(t.fat_g, 'g', 2)).toBe('0,33 g');
  });

  it('receta: valores por porción según rendimiento declarado', () => {
    // Licuado: 120 g banana + 250 g leche, rinde 370 g, 1 porción
    const r = computeRecipe([{ item: item(banana, 120, 'g'), food: banana }, { item: item(leche, 250, 'g'), food: leche }], 370, 1);
    expect(r.perServing.energy_kcal).toBeCloseTo(89 * 1.2 + 34 * 2.5, 5); // 191,8
    expect(r.per100.energy_kcal).toBeCloseTo(191.8 / 3.7, 5);
    // Si el rendimiento declarado fuese 300 g (evaporación), la porción mantiene la energía total y cambia el valor por 100 g
    const r2 = computeRecipe([{ item: item(banana, 120, 'g'), food: banana }, { item: item(leche, 250, 'g'), food: leche }], 300, 2);
    expect(r2.perServing.energy_kcal).toBeCloseTo(191.8 / 2, 5);
    expect(r2.gramsPerServing).toBe(150);
  });

  it('receta con un ingrediente sin dato: el nutriente de la receta queda faltante', () => {
    const r = computeRecipe([{ item: item(sinProteina, 100, 'g'), food: sinProteina }, { item: item(banana, 100, 'g'), food: banana }], 200, 2);
    expect(r.per100.protein_g).toBeNull();
    expect(r.per100.energy_kcal).toBeCloseTo((200 + 89) / 2, 5);
  });
});

describe('lista de compras', () => {
  it('suma solo cantidades compatibles y separa g de ml', () => {
    const l = buildShoppingList([item(leche, 250, 'ml'), item(leche, 250, 'ml'), item(leche, 100, 'g'), item(banana, 1, 'medida', { measure_id: 'rodajas' }), item(banana, 50, 'g')]);
    const ml = l.lines.find((x) => x.food_id === 'leche' && x.unit === 'ml')!;
    const g = l.lines.find((x) => x.food_id === 'leche' && x.unit === 'g')!;
    expect(ml.amount).toBe(500);
    expect(g.amount).toBe(100);
    const b = l.lines.find((x) => x.food_id === 'banana')!;
    expect(b.amount).toBe(200);
    expect(b.purchase_amount).toBeCloseTo(200 / 0.64, 5); // con cáscara
  });

  it('expande recetas en ingredientes según porciones', () => {
    const licuado: FoodSnap = {
      ...base, id: 'lic', kind: 'receta', name: 'Licuado', energy_kcal: 51.8, protein_g: 2.6, carbs_g: 10.8, fat_g: 0.2,
      recipe: { servings: 1, yield_grams: 370, preparation: '', ingredients: [{ food_id: 'banana', name: 'Banana', amount: 120, unit: 'g', edible_portion_pct: 64 }, { food_id: 'leche', name: 'Leche descremada', amount: 250, unit: 'g', edible_portion_pct: null }] },
    };
    const l = buildShoppingList([item(licuado, 2, 'porcion'), item(banana, 30, 'g')]);
    expect(l.lines.find((x) => x.food_id === 'banana')!.amount).toBe(270);
    expect(l.lines.find((x) => x.food_id === 'leche')!.amount).toBe(500);
    expect(l.lines.find((x) => x.food_id === 'leche')!.from_recipes).toEqual(['Licuado']);
  });

  it('informa los ítems que no puede convertir', () => {
    const l = buildShoppingList([item(banana, 100, 'medida', { measure_id: 'inexistente' })]);
    expect(l.lines).toHaveLength(0);
    expect(l.issues[0].reason).toMatch(/Medida/);
  });
});

describe('indicadores y fechas', () => {
  it('IMC solo con talla disponible (no se estima)', () => {
    const rows = [
      { measured_on: '2026-01-01', kind: 'peso', value: 70 },
      { measured_on: '2026-02-01', kind: 'talla', value: 165 },
      { measured_on: '2026-03-01', kind: 'peso', value: 68 },
    ];
    const s = derivedSeries(rows, 'imc');
    expect(s).toHaveLength(1); // el peso de enero no tiene talla previa
    expect(s[0].value).toBeCloseTo(68 / (1.65 * 1.65), 1);
  });

  it('zona horaria: 10:00 en Buenos Aires = 13:00 UTC', () => {
    expect(zonedToUtc('2026-10-25T10:00', 'America/Argentina/Buenos_Aires').toISOString()).toBe('2026-10-25T13:00:00.000Z');
    expect(zonedToUtc('2026-01-15T10:00', 'Europe/Madrid').toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('día del plan según fecha (ciclo de 2 semanas)', () => {
    const c = defaultPlanContent(2);
    expect(planDayForDate(c, '2026-10-19', '2026-10-21')).toMatchObject({ week: 1, day: 3 }); // miércoles semana 1
    expect(planDayForDate(c, '2026-10-19', '2026-10-28')).toMatchObject({ week: 2, day: 3 });
    expect(planDayForDate(c, '2026-10-19', '2026-11-04')).toMatchObject({ week: 1, day: 3 });
  });
});
