# NutriAR

Plataforma web para nutricionistas de Argentina y sus pacientes: historia clínica, planes alimentarios con cálculo nutricional trazable, seguimiento, mensajes y agenda. Panel profesional para computadora/tablet y acceso del paciente pensado para celular.

> Estado: **versión de demostración** con datos ficticios. No usar con datos reales sin cumplir las condiciones de `ESTADO_PROYECTO.md`.

- Estado, decisiones y próximos pasos: [`ESTADO_PROYECTO.md`](ESTADO_PROYECTO.md)
- Catálogo de alimentos y fuentes: [`docs/CATALOGO.md`](docs/CATALOGO.md)
- Seguridad, datos, respaldo: [`docs/SEGURIDAD_Y_DATOS.md`](docs/SEGURIDAD_Y_DATOS.md)
- Despliegue: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)

## Inicio rápido (desarrollo)
```bash
npm install
createdb nutriar
npm run seed:demo        # migra, carga el catálogo y datos FICTICIOS de demostración
npm run build
DEMO_MODE=1 npm run dev  # http://localhost:3000
```
Cuentas demo (contraseña `Demo-NutriAR-2026`): `nutri@demo.nutriar.local` (profesional), `paciente@demo.nutriar.local` (paciente).

## Pruebas
```bash
createdb nutriar_test && npm test          # API + cálculos (PostgreSQL real)
createdb nutriar_e2e && npm run build && npm run test:e2e   # navegador real (Playwright/Chromium)
```
