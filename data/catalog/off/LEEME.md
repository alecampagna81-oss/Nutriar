# Open Food Facts — productos comercializados en Argentina

- **Fuente:** exportación diaria de Open Food Facts (`en.openfoodfacts.org.products.csv.gz`, publicada el 27/10/2026), filtrada por `countries_tags = en:argentina`: 4.029 productos de 2.117.569. Se conservan solo las columnas necesarias.
- **Licencia:** Open Database License (ODbL) 1.0; contenidos bajo Database Contents License (DbCL) 1.0. © colaboradores de Open Food Facts — https://world.openfoodfacts.org. Este archivo es una base derivada y se ofrece bajo ODbL. Las imágenes no se incluyen.
- **Calidad:** datos cargados por voluntarios. Al importar (`server/importers/off.ts`) se aceptan solo productos con código de barras válido, nombre, marca y energía, sin errores marcados por Open Food Facts, con valores en rango y energía coherente con los macronutrientes (resultado 27/10/2026: 2.064 aceptados, 1.965 rechazados con motivo).
- **Uso en la aplicación:** verificación “Colaborativo”, enlace a la ficha original, fecha de última modificación. Las correcciones se hacen como productos propios, sin editar estos registros.
