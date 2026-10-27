# Catálogo de alimentos: fuentes, cobertura y trazabilidad

Actualizado: 24/10/2026.

## 1. Qué contiene hoy la aplicación (actualizado 27/10/2026)

| Conjunto (`dataset`) | Origen | Cantidad | Verificación | Licencia |
|---|---|---|---|---|
| **SARA 2** (Ministerio de Salud, 2022) | Argentina | **905 genéricos** | Fuente pública | CC BY-NC-SA 2.5 AR (no comercial) |
| **Open Food Facts** | Productos vendidos en Argentina | **2.064 productos de marca** | Colaborativo | ODbL 1.0 |
| USDA SR28 | EE.UU. | 121 genéricos | Fuente pública | Dominio público |
| Recetas base NutriAR | Ingredientes USDA | 6 recetas | Calculado | — |
| Demo | Ficticio | 2 productos | DEMO | — |

En la búsqueda aparecen primero los datos argentinos, y dentro de ellos los genéricos antes que las marcas. El plan de demostración usa alimentos de SARA 2.

### SARA 2: cómo se incorporó y verificó
- PDF oficial descargado de la biblioteca del Ministerio (`iah.msal.gov.ar/doc/720.pdf`, md5 `8c49d6081ca228095c9b58e865df2176`). Lo convierte `scripts/convert_sara2.py`, que lee el texto y el **color de cada celda**. Con eso conserva para cada valor su fuente según la leyenda de la propia tabla (Argenfoods, USDA, tabla inglesa, FNDDS, rótulos u otras) y marca los “ceros asumidos”.
- Particularidades del PDF que el conversor resuelve:
  - copias ocultas fuera del área de la hoja;
  - dos tablas en una misma página;
  - una tabla sin título (pág. 99);
  - títulos con número equivocado (16.B por 12.B; “5A” en la página de minerales);
  - nombres de hasta cuatro renglones;
  - notas al pie con asteriscos.
- **Verificación:**
  - todos los renglones de una sola línea coinciden con una lectura independiente del texto (pdftotext);
  - la cantidad de alimentos coincide en los 25 grupos;
  - la energía es coherente con 4P + 4C + 9G + 7 alcohol (±10 %) en todos menos 3 productos “light”, tal como figuran en la tabla.
- **Excluidos:**
  - grupo 26, suplementos: 24 renglones expresados cada 100 unidades;
  - “Medallón de menta y chocolate”: sus macronutrientes suman 106 g por 100 g en el original.
  - “Salmón blanco, crudo” no tiene sodio en el PDF; queda como dato faltante.
- **Licencia:** el registro oficial de CONICET indica CC BY-NC-SA 2.5 Argentina. El catálogo se puede desactivar con `CATALOG_SARA2=0`. **Antes de cualquier uso comercial hace falta autorización del Ministerio de Salud.**

### Open Food Facts: cómo se incorporó
- Exportación diaria oficial del 27/10/2026: 2.117.569 productos. Filtrada por `countries_tags = en:argentina`, quedan 4.029.
- El subconjunto se guarda en `data/catalog/off/` (ODbL).
- **Aceptados: 2.064.** Rechazados con motivo:
  - sin energía declarada: 1.604;
  - sin marca: 809;
  - sin nombre: 310;
  - errores marcados por la propia base: 177;
  - energía incoherente: 89;
  - otros fuera de rango: 45.
- Un mismo producto puede tener varios motivos de rechazo.
- Los valores son por 100 g o por 100 ml. Se toma 100 ml cuando la presentación está en ml, cl o l.
- Se puede desactivar con `CATALOG_OFF=0`.

### El catálogo estadounidense
- **Fuente:** USDA National Nutrient Database for Standard Reference, Release 28 (2015), archivos `ABBREV.txt` y `FOOD_DES.txt`.
- **Licencia:** dominio público (obra del Gobierno de EE.UU.).
- **De dónde se obtuvo:** el paquete npm `fda-nutrient-database@1.0.2`, que los redistribuye (md5 de `ABBREV.txt`: `30fd99e3fb88f919b199e7684e58aa96`).
- **Selección:** 121 alimentos, con nombre en español, categoría, estado, alérgenos orientativos y medidas caseras USDA rotuladas como tales.
- **Carbohidratos:** son **totales por diferencia (incluyen fibra)**. En las etiquetas argentinas se informan carbohidratos disponibles.
- **Separación de lo argentino:** cada alimento guarda `origin_country = 'US'`, `dataset = 'USDA SR28'` y `carbs_basis = 'totales'`. Se muestra con la insignia “Datos de EE.UU.” y se puede filtrar por origen. Nunca se presenta como argentino.
- **Plan de reemplazo:**
  - Cuando se carguen datos argentinos, los equivalentes USDA se podrán **archivar**: dejan de aparecer en la búsqueda, pero no se borran.
  - Los planes existentes no se afectan, porque cada plan guarda una copia de los datos del alimento usado.
  - Ningún registro se elimina.

## 2. Alimentos genéricos usados en Argentina

### SARA 2 — Ministerio de Salud de la Nación (2022)
- **Qué es:** la tabla de composición química compilada para la 2.ª Encuesta Nacional de Nutrición y Salud (ENNyS 2). ISBN 978-950-38-0313-4, 142 páginas.
- **Contenido:** alimentos, bebidas y suplementos con **39 componentes**, entre ellos energía, proteínas, lípidos, **carbohidratos disponibles**, fibra y sodio.
- **Compilación:** prioriza datos argentinos, sobre todo de alimentos procesados, y se basa en ARGENFOODS y USDA SR Legacy. Algunos valores pueden venir de EE.UU. aunque la tabla sea argentina; el importador conserva la fuente original de cada fila si la tabla la indica.
- **Formato:** **PDF**. No encontré versión en Excel ni CSV.
  - Ministerio: `https://bancos.salud.gob.ar/sites/default/files/2022-09/tabla-composicion-quimica-alimentos-argentina_ennys2.pdf`
  - Biblioteca: `https://iah.msal.gov.ar/doc/720.pdf`
- **Fecha de los datos:** 2022 (encuesta realizada en 2018–2019).
- **Licencia:** el registro del repositorio de CONICET (`hdl.handle.net/11336/258411`) indica **CC BY-NC-SA 2.5 Argentina**:
  - permite usarla **sin fines comerciales**, citando la fuente y compartiendo bajo la misma licencia lo que se derive de ella;
  - **no autoriza uso comercial sin permiso** del Ministerio de Salud;
  - **no pude confirmar** esa licencia en la página del Ministerio.
- **Acceso:** bloqueo técnico. Mi entorno no llega a `iah.msal.gov.ar`, `bancos.salud.gob.ar` ni `ri.conicet.gov.ar` (el proxy del entorno responde 403).
- **Qué falta:**
  1. El PDF, para construir y verificar la conversión a la planilla normalizada (`scripts/import-table.ts`).
  2. Confirmar la licencia y pedir permiso para uso comercial.

### ARGENFOODS — Universidad Nacional de Luján
- **Qué es:** la base de composición de alimentos argentinos, del proyecto INFOODS (FAO / Universidad de las Naciones Unidas).
- **Formato:** tablas en PDF por grupo de alimentos (carnes, cereales, etc.) en `argenfood.unlu.edu.ar` y `unlu.edu.ar/~argenfoods`. FAO menciona una compilación de 2010 en PDF y Excel.
- **Fecha:** compilación de 2010; el sitio declara una actualización en 2024.
- **Licencia: falta de permiso, no solo un bloqueo técnico.** El aviso dice: “©2010 Universidad Nacional de Luján… la reproducción total o parcial, su incorporación a sistemas informáticos o su transmisión” está restringida. **Hace falta autorización escrita** para incorporarla.
- **Acceso:** además, el nombre del sitio no se resuelve desde mi entorno.
- **Conclusión:** no se incorpora hasta tener el permiso. El borrador del correo a la universidad ya está entregado.

### ENNyS 2 — Portal de Datos Abiertos del Ministerio de Salud
- **Licencia:** CC BY 4.0, que **permite uso comercial citando la fuente**.
- **Contenido:** códigos y nombres de los alimentos que efectivamente consume la población argentina, más bases de consumo por persona.
- **No incluye la composición de cada alimento:** los nutrientes están sumados por persona y por día, no por alimento.
- **Uso posible:** priorizar qué alimentos cargar primero. No sirve como fuente de valores nutricionales.

## 3. Productos comerciales que se venden en Argentina

### Open Food Facts
- **Qué es:** una base colaborativa global de productos, cargada por voluntarios a partir de las etiquetas.
- **Licencia:**
  - La base se rige por **ODbL 1.0**, los contenidos por **DbCL 1.0** y las imágenes por CC BY-SA.
  - **Permite uso comercial** con dos condiciones: citar a Open Food Facts con un enlace, y ofrecer bajo ODbL la versión mejorada de la base si se usa públicamente.
  - Las imágenes no se importan, porque pueden involucrar derechos de marca.
- **Calidad:** variable. Puede haber productos desactualizados o con errores de tipeo. La cobertura argentina no se pudo medir desde acá.
- **Importador implementado** (`scripts/import-off.ts`). Solo acepta productos que cumplen todo esto:
  - figuran como comercializados en Argentina (`countries_tags = en:argentina`);
  - tienen código de barras válido, nombre, marca y energía;
  - no tienen errores de calidad marcados por Open Food Facts;
  - sus valores están dentro de rangos posibles, los macronutrientes suman como máximo 100 g;
  - la energía es coherente con los macronutrientes (factores 4/4/9, tolerancia del 25 %).
- **Cómo guarda los productos:**
  - quedan como `producto`, con la verificación **“Colaborativo”**, el conjunto “Open Food Facts”, el código de barras, el enlace a la ficha original y la fecha de última modificación;
  - un dato vacío queda como faltante;
  - reimportar actualiza sin duplicar y **nunca borra**;
  - una corrección se hace creando un producto propio, no editando el importado. Así la base derivada no se mezcla con datos privados.
- **Acceso:** bloqueo técnico. El proxy del entorno responde 403 a `world.openfoodfacts.org` y a `static.openfoodfacts.org`.
- **Lo más práctico** es habilitar esos dominios en la red del entorno, para que yo descargue los productos argentinos. La exportación mundial pesa varios GB y no es práctico bajarla desde el celular.

### Información oficial de fabricantes
- No encontré ninguna base de datos de fabricantes reutilizable: la información está dispersa en cada sitio, sin formato de datos ni licencia de reutilización.
- **No la copio en forma automática.**
- El camino previsto es que la nutricionista cargue el producto desde la etiqueta: formulario con marca, presentación, porción, código de barras y fuente, o importación de una planilla.
- A futuro, se podrían hacer acuerdos con marcas.

## 4. Bloqueos: técnicos y de permiso

| Fuente | Acceso (27/10/2026) | Permiso de reutilización |
|---|---|---|
| SARA 2 | Resuelto (red habilitada) | **No comercial** (CC BY-NC-SA 2.5 AR, confirmado en CONICET); uso comercial requiere permiso |
| ARGENFOODS | El dominio no se resuelve | **Falta de permiso**: restringido sin autorización escrita |
| ENNyS 2 (datos abiertos) | `datos.salud.gob.ar` no responde | CC BY 4.0 (sin composición por alimento) |
| Open Food Facts | Resuelto (exportación oficial) | ODbL: comercial permitido con atribución y compartir mejoras |
| Fabricantes | — | Sin licencia de datos; no se automatiza |

## 5. Cómo se incorpora cada fuente (ya construido y probado con datos ficticios)

- **Tablas oficiales** (SARA 2 u otra con permiso):
  - `node --import tsx scripts/import-table.ts tabla.csv ficha.json [--aplicar]`
  - Lleva una planilla normalizada más una ficha con la cita, la licencia, la fecha, el país y el criterio de carbohidratos (ejemplo: `data/catalog/sara2.meta.example.json`).
  - Sin `--aplicar`, solo valida.
  - Si una sola fila tiene un error, no importa nada.
- **Open Food Facts:**
  - `node --import tsx scripts/import-off.ts exportacion.csv|.jsonl[.gz] [--aplicar]`
  - Entrega un informe con lo aceptado, lo rechazado y los motivos.
- **Carga manual o planilla de la nutricionista:** desde la app (Alimentos → Importar CSV). Admite columnas opcionales `pais_origen` y `criterio_carbohidratos`.

## 6. Qué requiere validación de una nutricionista

- Nombres en español y categorías de los 121 alimentos USDA. Y si conviene mantenerlos visibles cuando haya equivalentes argentinos.
- Etiquetas de alérgenos, que son orientativas, en todo el catálogo.
- Las equivalencias de medidas caseras USDA (taza o cucharada de EE.UU.) frente a las medidas habituales en Argentina.
- Una muestra de los productos de Open Food Facts importados, antes de usarlos en planes reales. Están marcados “Colaborativo”.
- La conversión de SARA 2 a planilla, comparando una muestra contra el PDF.
- Elegir los 50 a 100 alimentos y productos de mayor uso, para verificarlos primero.

## 7. Cómo se generó el catálogo USDA (reproducible)

`scripts/build_catalog.py` hace lo siguiente:
1. Verifica que cada código coincida con la descripción original.
2. Copia los valores sin modificarlos.
3. Convierte el porcentaje de desperdicio en porción comestible.
4. Conserva solo las medidas elegidas.
5. Deriva la densidad de los líquidos desde la medida USDA “1 cup” (236,588 ml) o “1 fl oz”.

`npm run seed:catalog` lo carga sin duplicar. La aplicación también lo hace al arrancar.
