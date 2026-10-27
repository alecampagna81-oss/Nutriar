# SARA 2 (conversión a planilla)

- **Fuente:** Ministerio de Salud de la Nación (2022). *SARA 2: Tabla de composición química de alimentos para Argentina. Compilación para ENNyS 2*. ISBN 978-950-38-0313-4. PDF: https://iah.msal.gov.ar/doc/720.pdf (md5 `8c49d6081ca228095c9b58e865df2176`, 142 páginas).
- **Licencia:** CC BY-NC-SA 2.5 Argentina (registro CONICET hdl.handle.net/11336/258411). Esta planilla es una obra derivada y se comparte bajo la misma licencia. **No usar con fines comerciales sin autorización del Ministerio de Salud.**
- **Conversión:** `scripts/convert_sara2.py` (lee texto y color de cada celda; el color indica la fuente del valor según la leyenda de la tabla). Valores sin modificar; celda vacía = dato faltante; los “ceros asumidos” por la tabla se conservan y se identifican.
- **Contenido:** energía, proteínas, carbohidratos disponibles, lípidos, fibra y sodio por 100 g de porción comestible, más (en `fuente_original`) carbohidratos totales, agua, alcohol, fuente por nutriente, ceros asumidos, páginas y notas al pie. Se excluye el grupo 26 (suplementos, expresados cada 100 unidades).
- **Verificación:** ver `informe_conversion.json` y `docs/CATALOGO.md`.
