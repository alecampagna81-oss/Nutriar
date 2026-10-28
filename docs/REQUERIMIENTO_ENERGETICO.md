# Requerimiento energético y reparto de macronutrientes

Pestaña **Requerimiento** en la ficha del paciente. La profesional elige la fórmula, el nivel de actividad y el ajuste por objetivo, o escribe su propio valor. El objetivo guardado aparece en el editor de planes junto al "Total del día", en verde si el plan está dentro del ±5 %. El paciente no ve esta pestaña.

Código: `shared/energy.ts` (cálculo), `server/routes/pro.ts` (`/patients/:id/energy`), `web/src/pages/pro/patient/Energy.tsx`, tabla `energy_requirements` (migración 005). Pruebas con casos calculados a mano: `tests/energy.test.ts`.

## Fórmulas incluidas

| Fórmula | Datos | Edades | Referencia |
|---|---|---|---|
| Mifflin-St Jeor | sexo, edad, peso, talla | adultos | Am J Clin Nutr 1990;51:241-7 |
| Harris-Benedict revisada | sexo, edad, peso, talla | adultos | Roza y Shizgal, Am J Clin Nutr 1984;40:168-82 |
| Harris-Benedict original | sexo, edad, peso, talla | adultos | Carnegie Institution of Washington, 1919 |
| FAO/OMS/UNU 1985 | sexo, edad, peso | todas (6 rangos) | Serie de Informes Técnicos 724, OMS 1985 |
| Schofield 1985 (peso) | sexo, edad, peso | todas (6 rangos) | Hum Nutr Clin Nutr 1985;39 Suppl 1:5-41 |
| Katch-McArdle | peso, % grasa | adultos | 370 + 21,6 × masa magra |
| Cunningham | peso, % grasa | adultos | Am J Clin Nutr 1980;33:2372-4 |
| IOM 2005 (EER) | sexo, edad, peso, talla, actividad IOM | todas, embarazo y lactancia | Dietary Reference Intakes for Energy…, 2005 |
| Valor propio | kcal | — | criterio de la profesional |

- Las fórmulas de metabolismo basal se multiplican por un **factor de actividad** de uso clínico habitual: sedentario 1,2; ligero 1,375; moderado 1,55; intenso 1,725; muy intenso 1,9.
- IOM 2005 ya incluye la actividad con sus propios coeficientes por edad y sexo. En menores de 3 años usa solo peso y edad en meses, más la energía de crecimiento.
- **Embarazo y lactancia:** se suman los adicionales de IOM 2005. Embarazo: +0 / +340 / +452 kcal por trimestre. Lactancia: +330 kcal de 0 a 6 meses y +400 kcal de 7 a 12 meses.
- Si se usa una fórmula de adultos en menores de 18 años, la app lo advierte.

## Verificación de coeficientes (28/10/2026)

Cotejados con fuentes independientes encontradas por búsqueda web:
- **IOM 2005:** adultos, niños de 3 a 18 años, coeficientes de actividad, lactantes, embarazo y lactancia.
- **Harris-Benedict:** la de 1984 y la de 1919.
- **FAO/OMS/UNU 1985:** rangos de 0 a 10 años, confirmados en un documento del Maastricht UMC+.
- **Schofield:** versión en MJ/día, que da los mismos valores que la versión en kcal multiplicando por 239.

No se pudieron abrir los documentos originales completos (OMS TRS 724, Schofield 1985), porque la red del entorno de desarrollo no tiene acceso. La validación final de los coeficientes queda a cargo de la nutricionista que revisa la app (ver `ESTADO_PROYECTO.md`).

## Reparto de macronutrientes

Porcentajes editables de proteínas, grasas y carbohidratos, que tienen que sumar 100 %. Por defecto: 20 / 30 / 50. Los gramos se calculan con 4 kcal/g para proteínas y carbohidratos y 9 kcal/g para grasas, y también se muestran los gramos de proteína por kilo de peso.
