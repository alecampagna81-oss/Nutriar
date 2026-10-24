# Catálogo de alimentos — cobertura real y trazabilidad

## Qué contiene hoy

| Origen | Cantidad | Verificación en la app |
|---|---|---|
| USDA National Nutrient Database for Standard Reference, Release 28 (2015) — selección curada | 121 alimentos genéricos | “Fuente pública” (`fuente_secundaria`) |
| Recetas base NutriAR sin cocción (calculadas desde los ingredientes anteriores) | 6 recetas | “Calculado” |
| Productos de marca ficticios para demostración (prefijo `[DEMO]`, marca “Marca Demo (ficticia)”) | 2 | “DEMO ficticio”, ocultos por defecto en las búsquedas |

Cobertura por categoría (USDA): Verduras 24 · Lácteos y huevos 18 · Frutas 16 · Carnes 12 · Cereales y derivados 11 · Legumbres 10 · Frutos secos y semillas 7 · Aceites y grasas 5 · Azúcares y dulces 5 · Condimentos 4 · Pescados 3 · Panificados 2 · Bebidas 2 · Infusiones 2.
83 tienen medidas caseras USDA documentadas, 51 tienen porción comestible (desperdicio), 11 líquidos/aceites tienen densidad derivada.

**No incluye**: productos de marca argentinos reales; yerba mate / mate cebado; harinas, panes, galletitas y facturas típicos; cortes vacunos argentinos exactos (se usan equivalentes de EE.UU. con el nombre del corte original indicado); merluza y otros pescados locales; quesos argentinos específicos (cremoso, port salut, etc.); dulces regionales (salvo dulce de leche, que sí está en SR28). Estos deben cargarse desde etiquetas o desde una tabla argentina con licencia adecuada.

## Fuente y licencia

- USDA SR28 es una obra del Gobierno de EE.UU., de **dominio público**. Cita: *US Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference, Release 28. Version Current: September 2015.*
- Los archivos `ABBREV.txt` y `FOOD_DES.txt` se obtuvieron del paquete npm `fda-nutrient-database@1.0.2`, que los redistribuye sin cambios de formato (md5 de ABBREV.txt: `30fd99e3fb88f919b199e7684e58aa96`). Los sitios oficiales del USDA y de la tabla argentina ARGENFOODS (UNLu) no eran accesibles desde el entorno de desarrollo. Por eso el estado es “fuente pública, sin cotejo independiente”: **pendiente cotejar con FoodData Central** (los valores de SR Legacy en FoodData Central son los mismos de SR28).
- No se copió ningún dato de Avena ni de fuentes privadas. No se inventaron valores: un campo vacío en USDA queda como “sin dato”.

## Cómo se generó (reproducible)

`scripts/build_catalog.py` toma cada entrada curada (código NDB, texto de control, nombre en español, categoría, estado, alérgenos orientativos, medidas a conservar) y:
1. verifica que la descripción original contenga el texto de control (evita errores de código);
2. copia sin modificar energía, proteínas, grasas, carbohidratos (totales por diferencia, incluyen fibra), fibra y sodio por 100 g;
3. convierte el % de desperdicio (“Refuse”) en porción comestible;
4. conserva solo las medidas caseras USDA elegidas, rotuladas como “taza medidora EE.UU.”/“cucharada (medida USDA)” para no confundirlas con medidas argentinas no estandarizadas;
5. deriva la densidad de líquidos de la medida USDA “1 cup” (236,588 ml) o “1 fl oz” (29,5735 ml).

`npm run seed:catalog` carga el JSON resultante (`data/catalog/usda_sr28_seleccion.json`) y las recetas base de forma idempotente.

## Recetas base

Son preparaciones **sin cocción** (ensaladas, licuado, yogur con avena y frutas, tostada): el rendimiento declarado es la suma de los pesos de los ingredientes, porque no hay pérdida de agua. Las recetas con cocción que cargue la profesional requieren declarar el peso final real.

## Cómo ampliar el catálogo

- **Carga manual** (Alimentos → Nuevo alimento o producto): exige fuente; los valores vacíos quedan como faltantes; los productos exigen marca; se puede registrar presentación, porción de etiqueta y EAN. Quedan privados y “sin verificar”.
- **Importación CSV** con validación previa fila por fila (no importa nada si hay errores).
- **Catálogo común** (visible para todas las profesionales): solo por script (`seed-catalog`), pensado para contenido revisado. Para agregar otra fuente pública, sumar un JSON y su carga en `scripts/seed-catalog.ts` con `source`/`source_ref` propios.
- Antes de incorporar la tabla argentina ARGENFOODS u otras, **confirmar por escrito las condiciones de reutilización**.
