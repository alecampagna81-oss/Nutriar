// Carga (o actualiza) el catálogo común: selección USDA SR28 + recetas base sin cocción.
// Idempotente: se puede ejecutar varias veces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, one, tx } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { recomputeRecipe } from '../server/lib/foods.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'USDA SR28';

export async function seedCatalog(log = true) {
  const sr = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog/usda_sr28_seleccion.json'), 'utf8'));
  const sourceText = `${sr.source}. ${sr.license}`;
  const ids = new Map<string, string>();
  await tx(async (c) => {
    for (const it of sr.items) {
      const row = await one(
        `insert into foods(kind, name, category, state, edible_portion_pct, basis_amount, basis_unit, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
                           density_g_per_ml, allergens, label_data, source, source_ref, source_date, verification, owner_id, visibility)
         values ('generico',$1,$2,$3,$4,100,'g',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'2015-09-01','fuente_secundaria',null,'catalogo')
         on conflict (source, source_ref) where source_ref is not null and owner_id is null
         do update set name=excluded.name, category=excluded.category, state=excluded.state, edible_portion_pct=excluded.edible_portion_pct,
                       energy_kcal=excluded.energy_kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g, fiber_g=excluded.fiber_g,
                       sodium_mg=excluded.sodium_mg, density_g_per_ml=excluded.density_g_per_ml, allergens=excluded.allergens, label_data=excluded.label_data, updated_at=now()
         returning id`,
        [it.name, it.category, it.state, it.edible_portion_pct, it.energy_kcal, it.protein_g, it.carbs_g, it.fat_g, it.fiber_g, it.sodium_mg, it.density_g_per_ml, it.allergens,
         { usda_description: it.usda_description, carbs_note: 'Carbohidratos totales por diferencia (incluyen fibra)', density_from: it.density_from ? `Densidad derivada de la medida USDA "${it.density_from}"` : undefined },
         SOURCE === 'USDA SR28' ? sourceText : SOURCE, `NDB ${it.ndb}`],
        c,
      );
      ids.set(it.ndb, row.id);
      await q("delete from food_measures where food_id=$1 and source like 'USDA SR28%'", [row.id], c);
      for (const m of it.measures) {
        await q('insert into food_measures(food_id, name, amount, unit, source) values ($1,$2,$3,$4,$5)', [row.id, m.name, m.amount, m.unit, `USDA SR28, medida "${m.usda_desc}"`], c);
      }
    }
  });

  const rec = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog/recetas_base.json'), 'utf8'));
  for (const r of rec.recipes) {
    const ref = `receta-base:${r.name}`;
    await tx(async (c) => {
      let f = await one('select id from foods where source_ref=$1 and owner_id is null', [ref], c);
      const yieldG = r.ingredients.reduce((s: number, [, g]: [string, number]) => s + g, 0);
      if (!f) {
        f = await one(
          "insert into foods(kind, name, category, state, basis_amount, basis_unit, source, source_ref, verification, owner_id, visibility) values ('receta',$1,'Preparaciones','listo_para_consumir',100,'g',$2,$3,'calculado',null,'catalogo') returning id",
          [r.name, `Receta base NutriAR. ${rec.note}`, ref],
          c,
        );
        await q('insert into recipe_details(food_id, servings, yield_grams, preparation, minutes) values ($1,$2,$3,$4,$5)', [f.id, r.servings, yieldG, r.preparation, r.minutes], c);
      } else {
        await q('update recipe_details set servings=$2, yield_grams=$3, preparation=$4, minutes=$5 where food_id=$1', [f.id, r.servings, yieldG, r.preparation, r.minutes], c);
        await q('delete from recipe_ingredients where recipe_id=$1', [f.id], c);
      }
      let pos = 0;
      for (const [ndb, g] of r.ingredients) {
        const ing = ids.get(ndb);
        if (!ing) throw new Error(`Ingrediente ${ndb} no está en el catálogo`);
        await q("insert into recipe_ingredients(recipe_id, ingredient_id, quantity, unit, position) values ($1,$2,$3,'g',$4)", [f.id, ing, g, pos++], c);
      }
      await recomputeRecipe(f.id, c);
    });
  }
  if (log) console.log(`Catálogo: ${sr.items.length} alimentos USDA SR28, ${rec.recipes.length} recetas base.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate(false)
    .then(() => seedCatalog())
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
