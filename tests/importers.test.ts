// Importadores de catálogo con datos FICTICIOS (no se cargan en el catálogo real).
import { afterAll, describe, expect, it } from 'vitest';
import { importOff, normalizeOff, readOffExport } from '../server/importers/off.js';
import { importTable } from '../server/importers/table.js';
import { one, pool, q } from '../server/db.js';

afterAll(async () => {
  await pool.end();
});

const meta = { dataset: 'Tabla ficticia', source: 'Tabla ficticia de prueba', license: 'Solo pruebas', source_date: '2022-01-01', origin_country: 'AR', carbs_basis: 'disponibles', verification: 'fuente_secundaria' };

describe('Open Food Facts', () => {
  it('valida, rechaza con motivos y no duplica', async () => {
    const r = await importOff(readOffExport('tests/fixtures/off-ficticio.csv'), false);
    expect(r.read).toBe(9);
    expect(r.accepted).toBe(3); // galletitas, gaseosa, solo kJ
    expect(r.duplicates).toBe(1);
    expect(r.reasons['no figura como comercializado en Argentina']).toBe(1);
    expect(r.reasons['sin marca']).toBe(1);
    expect(Object.keys(r.reasons).some((k) => k.startsWith('energía inconsistente'))).toBe(true);
    expect(r.reasons['Open Food Facts marca errores de calidad en el producto']).toBe(1);
    expect(r.reasons['código de barras inválido']).toBe(1);
    expect(r.inserted).toBe(0); // solo validación
  });

  it('cuenta la energía del alcohol e infiere 100 ml en líquidos', () => {
    const beer = normalizeOff({ code: '7790000000109', product_name: 'Cerveza de prueba', brands: 'Marca', countries_tags: 'en:argentina', quantity: '473 ml', 'energy-kcal_100g': '43', proteins_100g: '0.4', carbohydrates_100g: '3.6', fat_100g: '0', alcohol_100g: '5' });
    expect(beer.reasons).toEqual([]);
    expect(beer.food!.basis_unit).toBe('ml');
    const dry = normalizeOff({ code: '7790000000116', product_name: 'Fideos de prueba', brands: 'Marca', countries_tags: 'en:argentina', quantity: '500 g', 'energy-kcal_100g': '350', proteins_100g: '12', carbohydrates_100g: '72', fat_100g: '1.5' });
    expect(dry.food!.basis_unit).toBe('g');
  });

  it('convierte unidades de forma documentada', () => {
    const { food } = normalizeOff({ code: '7790000000062', product_name: 'Producto', brands: 'Marca', countries_tags: 'en:argentina', 'energy-kj_100g': '1500', proteins_100g: '12', carbohydrates_100g: '72', fat_100g: '1.5', fiber_100g: '3', sodium_100g: '0.25' });
    expect(food!.energy_kcal).toBeCloseTo(1500 / 4.184, 1);
    expect(food!.energy_from_kj).toBe(true);
    expect(food!.sodium_mg).toBe(250);
    const missing = normalizeOff({ code: '7790000000093', product_name: 'Producto', brands: 'Marca', countries_tags: 'en:argentina', 'energy-kcal_100g': '100', carbohydrates_100g: '25' });
    expect(missing.food!.protein_g).toBeNull(); // faltante, no cero
  });

  it('importa al catálogo como colaborativo, con atribución, y reimportar no duplica ni borra', async () => {
    const r = await importOff(readOffExport('tests/fixtures/off-ficticio.csv'), true);
    expect(r.inserted).toBe(3);
    const g = await one("select * from foods where source_ref = 'EAN 7790000000017'");
    expect(g.name).toBe('Galletitas de prueba integrales');
    expect(g.brand).toBe('MarcaPrueba');
    expect(g.verification).toBe('colaborativo');
    expect(g.dataset).toBe('Open Food Facts');
    expect(g.origin_country).toBe('AR');
    expect(g.carbs_basis).toBe('disponibles');
    expect(g.allergens.sort()).toEqual(['gluten', 'leche']);
    expect(g.label_data.url).toBe('https://world.openfoodfacts.org/product/7790000000017');
    expect(g.sodium_mg).toBe(600);
    const soda = await one("select basis_unit, category from foods where source_ref = 'EAN 7790000000024'");
    expect(soda).toEqual({ basis_unit: 'ml', category: 'Bebidas' });
    const again = await importOff(readOffExport('tests/fixtures/off-ficticio.csv'), true);
    expect(again.inserted).toBe(0);
    expect(again.updated).toBe(3);
    const j = await importOff(readOffExport('tests/fixtures/off-ficticio.jsonl'), true);
    expect(j.inserted).toBe(1);
    expect(j.rejected).toBe(1); // línea no JSON
    const fixture = "source_ref in ('EAN 7790000000017','EAN 7790000000024','EAN 7790000000062','EAN 7790000000086')";
    const count = await one(`select count(*)::int as n from foods where dataset='Open Food Facts' and ${fixture}`);
    expect(count.n).toBe(4);
    await q(`delete from foods where ${fixture}`);
  });

  it('rechaza un archivo que no es una exportación de Open Food Facts', async () => {
    await expect(importOff(readOffExport('tests/fixtures/tabla-ficticia.csv'), false)).rejects.toThrow(/columna "code"/);
  });
});

describe('tabla oficial normalizada (p. ej. SARA 2)', () => {
  it('no importa nada si hay errores y distingue vacío de cero', async () => {
    const csv = (await import('node:fs')).readFileSync('tests/fixtures/tabla-ficticia.csv', 'utf8');
    const dry = await importTable(csv, meta, false);
    expect(dry.valid).toBe(2);
    expect(dry.errors[0].codigo).toBe('T003');
    await expect(importTable(csv, meta, true)).rejects.toThrow(/no se importó nada/);
    const ok = csv.split('\n').slice(0, 3).join('\n');
    const r = await importTable(ok, meta, true);
    expect(r.inserted).toBe(2);
    const a = await one("select * from foods where source_ref = 'Tabla ficticia T001'");
    expect(a.fiber_g).toBeNull();
    expect(a.fat_g).toBe(2);
    expect(a.protein_g).toBe(10.5);
    expect(a.dataset).toBe('Tabla ficticia');
    expect(a.carbs_basis).toBe('disponibles');
    expect(a.label_data.license).toBe('Solo pruebas');
    const b = await one("select edible_portion_pct from foods where source_ref = 'Tabla ficticia T002'");
    expect(b.edible_portion_pct).toBe(85);
    expect((await importTable(ok, meta, true)).updated).toBe(2);
    await expect(importTable(ok, { ...meta, license: '' }, false)).rejects.toThrow(/license/);
    await q("delete from foods where dataset='Tabla ficticia'");
  });
});
