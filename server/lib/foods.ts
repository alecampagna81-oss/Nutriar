import { q } from '../db.js';
import type { FoodSnap, IngredientSnap, PlanItemBase } from '../../shared/nutrition.js';
import { computeRecipe, resolveAmount } from '../../shared/nutrition.js';
import { HttpError } from './http.js';

/** Condición SQL de visibilidad: catálogo común o alimentos propios. */
export const visibleTo = (alias = 'f', param = '$1') => `(${alias}.owner_id is null or ${alias}.owner_id = ${param})`;

function toSnap(f: any, measures: any[]): FoodSnap {
  return {
    id: f.id,
    kind: f.kind,
    name: f.name,
    brand: f.brand,
    state: f.state,
    basis_amount: f.basis_amount,
    basis_unit: f.basis_unit,
    energy_kcal: f.energy_kcal,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    density_g_per_ml: f.density_g_per_ml,
    edible_portion_pct: f.edible_portion_pct,
    allergens: f.allergens ?? [],
    measures: measures.filter((m) => m.food_id === f.id).map((m) => ({ id: m.id, name: m.name, amount: m.amount, unit: m.unit })),
    verification: f.verification,
    is_demo: f.is_demo,
  };
}

/** Instantáneas de alimentos visibles para la profesional. Lanza 400 si alguno no existe o no es visible. */
export async function getSnapshots(ids: string[], userId: string): Promise<Map<string, FoodSnap>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, FoodSnap>();
  if (!unique.length) return out;
  const foods = await q(`select * from foods f where f.id = any($2::uuid[]) and ${visibleTo('f', '$1')}`, [userId, unique]);
  if (foods.length !== unique.length) throw new HttpError(400, 'Hay alimentos inexistentes o que no tenés permiso para usar');
  const measures = await q('select * from food_measures where food_id = any($1::uuid[]) order by amount', [unique]);
  for (const f of foods) out.set(f.id, toSnap(f, measures));
  const recipes = foods.filter((f) => f.kind === 'receta').map((f) => f.id);
  if (recipes.length) {
    const details = await q('select * from recipe_details where food_id = any($1::uuid[])', [recipes]);
    const ings = await q(
      `select ri.*, f.name, f.basis_unit, f.density_g_per_ml, f.edible_portion_pct, f.kind as ing_kind, f.basis_amount
         from recipe_ingredients ri join foods f on f.id = ri.ingredient_id where ri.recipe_id = any($1::uuid[]) order by ri.position`,
      [recipes],
    );
    const ingMeasures = await q('select * from food_measures where food_id = any($1::uuid[])', [ings.map((i) => i.ingredient_id)]);
    for (const d of details) {
      const snap = out.get(d.food_id)!;
      const ingredients: IngredientSnap[] = [];
      for (const i of ings.filter((x) => x.recipe_id === d.food_id)) {
        const item = ingredientItem(i);
        const fake = { basis_unit: i.basis_unit, density_g_per_ml: i.density_g_per_ml, measures: ingMeasures.filter((m) => m.food_id === i.ingredient_id), edible_portion_pct: null, basis_amount: i.basis_amount } as unknown as FoodSnap;
        const r = resolveAmount(item, fake);
        ingredients.push({ food_id: i.ingredient_id, name: i.name, amount: r.ok ? r.rawAmount! : i.quantity, unit: r.ok ? r.dimension! : 'g', edible_portion_pct: i.edible_portion_pct });
      }
      snap.recipe = { servings: d.servings, yield_grams: d.yield_grams, preparation: d.preparation, ingredients };
    }
  }
  return out;
}

export function ingredientItem(i: { id?: string; ingredient_id: string; quantity: number; unit: string }): PlanItemBase {
  if (i.unit.startsWith('medida:')) return { id: i.id ?? '', food_id: i.ingredient_id, quantity: i.quantity, unit: 'medida', measure_id: i.unit.slice(7) };
  return { id: i.id ?? '', food_id: i.ingredient_id, quantity: i.quantity, unit: i.unit as 'g' | 'ml' };
}

/** Recalcula los valores de una receta a partir de sus ingredientes y su rendimiento declarado. */
export async function recomputeRecipe(recipeId: string, client?: any) {
  const [det] = await q('select * from recipe_details where food_id=$1', [recipeId], client);
  const ings = await q('select * from recipe_ingredients where recipe_id=$1 order by position', [recipeId], client);
  const snaps = new Map<string, FoodSnap>();
  if (ings.length) {
    const foods = await q('select * from foods where id = any($1::uuid[])', [ings.map((i) => i.ingredient_id)], client);
    const measures = await q('select * from food_measures where food_id = any($1::uuid[])', [ings.map((i) => i.ingredient_id)], client);
    for (const f of foods) snaps.set(f.id, toSnap(f, measures));
  }
  const parts = ings.map((i) => ({ item: ingredientItem(i), food: snaps.get(i.ingredient_id)! }));
  const errors = parts.map((p) => resolveAmount(p.item, p.food)).filter((r) => !r.ok);
  if (errors.length) throw new HttpError(400, `Ingrediente con cantidad no convertible: ${errors[0].error}`);
  const r = computeRecipe(parts, det.yield_grams, det.servings);
  const allergens = [...new Set(parts.flatMap((p) => p.food.allergens))];
  const anyDemo = parts.some((p) => p.food.is_demo);
  await q(
    `update foods set energy_kcal=$2, protein_g=$3, carbs_g=$4, fat_g=$5, basis_amount=100, basis_unit='g', allergens=$6,
       verification = case when $7 then 'demo' else 'calculado' end, is_demo = $7, updated_at=now() where id=$1`,
    [recipeId, r.per100.energy_kcal, r.per100.protein_g, r.per100.carbs_g, r.per100.fat_g, allergens, anyDemo],
    client,
  );
  await q("delete from food_measures where food_id=$1 and source='Rendimiento declarado de la receta'", [recipeId], client);
  await q("insert into food_measures(food_id, name, amount, unit, source) values ($1, '1 porción', $2, 'g', 'Rendimiento declarado de la receta')", [recipeId, r.gramsPerServing], client);
  return r;
}

export async function recomputeRecipesUsing(foodId: string) {
  const rows = await q('select distinct recipe_id from recipe_ingredients where ingredient_id=$1', [foodId]);
  for (const r of rows) await recomputeRecipe(r.recipe_id);
}
