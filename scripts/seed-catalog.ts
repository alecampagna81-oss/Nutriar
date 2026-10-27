// Carga (o actualiza) el catálogo común: selección USDA SR28 + recetas base sin cocción.
// Idempotente: se puede ejecutar varias veces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, one, tx } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { recomputeRecipe } from '../server/lib/foods.js';
import crypto from 'node:crypto';
import { importTable } from '../server/importers/table.js';
import { importOff, readOffExport } from '../server/importers/off.js';

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
                           density_g_per_ml, allergens, label_data, source, source_ref, source_date, verification, owner_id, visibility, origin_country, dataset, carbs_basis)
         values ('generico',$1,$2,$3,$4,100,'g',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'2015-09-01','fuente_secundaria',null,'catalogo','US','USDA SR28','totales')
         on conflict (source, source_ref) where source_ref is not null and owner_id is null
         do update set name=excluded.name, category=excluded.category, state=excluded.state, edible_portion_pct=excluded.edible_portion_pct,
                       energy_kcal=excluded.energy_kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g, fiber_g=excluded.fiber_g,
                       sodium_mg=excluded.sodium_mg, density_g_per_ml=excluded.density_g_per_ml, allergens=excluded.allergens, label_data=excluded.label_data,
                       origin_country='US', dataset='USDA SR28', carbs_basis='totales', updated_at=now()
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
          "insert into foods(kind, name, category, state, basis_amount, basis_unit, source, source_ref, verification, owner_id, visibility, dataset) values ('receta',$1,'Preparaciones','listo_para_consumir',100,'g',$2,$3,'calculado',null,'catalogo','Recetas base NutriAR') returning id",
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
  // Importaciones versionadas: solo se rehacen si cambia el archivo de origen.
  const version = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  const already = async (name: string, v: string) => !!(await one('select 1 from catalog_imports where name=$1 and version=$2', [name, v]));
  const mark = (name: string, v: string, summary: unknown) =>
    q('insert into catalog_imports(name, version, summary) values ($1,$2,$3) on conflict (name) do update set version=excluded.version, summary=excluded.summary, imported_at=now()', [name, v, JSON.stringify(summary)]);

  // SARA 2 (Argentina). Licencia no comercial: se puede desactivar con CATALOG_SARA2=0.
  let sara = 'desactivado';
  if (process.env.CATALOG_SARA2 !== '0') {
    const dir = path.join(root, 'data/catalog/sara2');
    const file = path.join(dir, 'sara2_2022.csv');
    const v = version(file);
    if (await already('SARA 2', v)) sara = 'sin cambios';
    else {
      const r = await importTable(fs.readFileSync(file, 'utf8'), JSON.parse(fs.readFileSync(path.join(dir, 'ficha.json'), 'utf8')), true, { skipInvalid: true });
      await mark('SARA 2', v, { importados: r.inserted + r.updated, excluidos: r.errors });
      sara = `${r.inserted + r.updated} alimentos (${r.errors.length} excluidos por inconsistencias de la tabla original)`;
    }
  }
  // Open Food Facts (productos vendidos en Argentina, ODbL). Se puede desactivar con CATALOG_OFF=0.
  let off = 'desactivado';
  if (process.env.CATALOG_OFF !== '0') {
    const dir = path.join(root, 'data/catalog/off');
    const file = fs.readdirSync(dir).filter((f) => f.endsWith('.csv.gz')).sort().pop();
    if (file) {
      const v = version(path.join(dir, file));
      if (await already('Open Food Facts', v)) off = 'sin cambios';
      else {
        const r = await importOff(readOffExport(path.join(dir, file)), true);
        await mark('Open Food Facts', v, { archivo: file, leidos: r.read, aceptados: r.accepted, rechazados: r.rejected, motivos: r.reasons });
        off = `${r.accepted} productos aceptados de ${r.read}`;
      }
    }
  }
  if (log) console.log(`Catálogo: ${sr.items.length} alimentos USDA SR28, ${rec.recipes.length} recetas base; SARA 2: ${sara}; Open Food Facts: ${off}.`);
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
