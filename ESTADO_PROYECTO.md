# ESTADO DEL PROYECTO — NutriAR

Archivo de continuidad. Leelo primero al retomar el trabajo. Última actualización: 27/10/2026 (pedidos de permiso enviados; próximo paso: prueba gratuita en Render).

**Nombre provisorio:** "NutriAR" es un nombre de trabajo. El dueño no lo confirmó como definitivo (puede estar registrado o en uso); se decide más adelante. En los pedidos de permiso no se usó el nombre.

Repositorio privado: https://github.com/alecampagna81-oss/nutriar (rama `main`).

**Estado general:** versión integrada **para demostración** con datos ficticios. **No está lista para uso clínico real** (ver “Condiciones antes de usar datos reales”).

---

## 1. Objetivo y alcance

Plataforma web para nutricionistas independientes de Argentina y sus pacientes: la profesional gestiona su consulta (pacientes, historia clínica, planes, agenda, mensajes) y cada paciente accede desde el celular a su plan, registros, avances y comunicación.

- Varias profesionales independientes; cada paciente tiene **una** profesional responsable.
- Fuera de alcance (no implementado a propósito): IA (dietas, fotos, estudios), diagnósticos automáticos, cobros, WhatsApp, videollamadas, marketplace, páginas públicas, funciones sociales, colaboración entre profesionales, apps nativas.
- Nombre configurable con la variable `APP_NAME` (por defecto “NutriAR”).

## 2. Arquitectura y decisiones

| Pieza | Elección | Motivo |
|---|---|---|
| Servidor | Node.js 22 + Express 5 + TypeScript (ejecutado con `tsx`) | Convencional, un solo proceso, fácil de mantener |
| Base de datos | PostgreSQL 16 (SQL directo con `pg`, migraciones SQL en `migrations/`) | Estándar, respaldos con `pg_dump`, disponible gestionado en muchos proveedores |
| Frontend | React 19 + Vite + React Router, CSS propio | SPA servida por el mismo servidor (un solo despliegue) |
| Autenticación | Sesiones en servidor (`express-session` + tabla `user_sessions` en PostgreSQL), contraseñas con Argon2id (`@node-rs/argon2`) | Bibliotecas mantenidas; cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción |
| Archivos | Disco privado (`STORAGE_DIR`), nombres aleatorios, servidos solo por `/api/files/:id` con verificación de permisos | Sin enlaces públicos; reemplazable por S3 en `server/lib/storage.ts` |
| Imágenes | `sharp`: valida contenido real, re-codifica a JPEG, rota y **elimina EXIF/GPS** | Privacidad |
| PDF | `pdfkit` en el servidor | Exportación legible, verificable en pruebas |
| Cálculos | `shared/nutrition.ts` (mismo código en servidor y cliente) | Un único lugar para la lógica nutricional |
| Recordatorios | Tarea interna cada 1 min (`server/scheduler.ts`) | Avisos internos reales; correo solo si hay SMTP |

Decisiones clave:
- **Permisos en el servidor**: toda ruta de profesional valida `patients.professional_id = usuario`; toda ruta de paciente usa solo `patients.user_id = usuario`. Recursos ajenos responden 404 (no revelan existencia). Ver `server/lib/access.ts` y `server/routes/common.ts`.
- **Invitaciones**: token aleatorio de 256 bits, se guarda solo su hash SHA-256, vence a los 7 días, uso único; generar uno nuevo anula el anterior. Conocer un correo o un id no permite vincularse.
- **CSRF**: toda escritura exige el encabezado `x-nutriar: 1` (un formulario de otro sitio no puede enviarlo sin verificación CORS) + cookies `SameSite=Lax`.
- **Planes versionados**: `plans` + `plan_versions` (borrador → publicado → reemplazado). Las versiones publicadas no se editan; cada ítem guarda una **instantánea** del alimento, así editar el catálogo no altera planes ni historial. Los registros de comidas apuntan a la versión vigente al momento de registrarse.
- **Dato faltante ≠ cero**: `NULL` en la base = faltante. Los totales muestran “≥ X (faltan datos de N ítems)”. Una receta con un ingrediente sin dato deja ese nutriente como faltante.
- **Conversiones**: g ↔ ml solo con densidad documentada; medidas caseras solo si tienen equivalencia registrada con su origen; porción comestible (peso bruto/neto) según el % de desperdicio de la fuente.
- **Notas internas** en columnas separadas (`internal_notes`) que nunca se seleccionan en rutas del paciente; verificado en pruebas (incluida la exportación del paciente).
- **Sin service worker**: la app es instalable (manifest) pero no guarda información clínica para uso sin conexión. API con `Cache-Control: no-store`.
- **Registros (logs)**: solo método, ruta (con ids enmascarados), estado y tiempo. Nunca cuerpos, mensajes ni datos clínicos.

Estructura:
```
server/        API (app.ts, routes/, lib/), migrate.ts, scheduler.ts, index.ts
shared/        cálculo nutricional, mediciones, zonas horarias, cuestionario base
web/           frontend (src/pages/pro, src/pages/patient, src/components)
migrations/    SQL versionado
data/catalog/  catálogo inicial (USDA SR28 curado) y recetas base
scripts/       seed-catalog, seed-demo, create-professional, backup.sh, restore.sh, build_catalog.py
tests/         nutrition.test.ts, flows.test.ts (API), e2e/run.mjs (navegador)
docs/          CATALOGO.md, ALOJAMIENTO.md, SEGURIDAD_Y_DATOS.md, DESPLIEGUE.md
server/importers/  off.ts (Open Food Facts), table.ts (tablas oficiales normalizadas)
render.yaml    configuración de Render (aplicación + base + disco), sin claves
```

## 3. Cómo ejecutar (desarrollo)

Requisitos: Node 22, PostgreSQL 16.
```bash
npm install
createdb nutriar                       # o usar DATABASE_URL a otra base
npm run migrate                        # aplica migraciones
npm run seed:catalog                   # catálogo común (idempotente)
npm run seed:demo                      # SOLO demo: profesionales/pacientes ficticios (borra y recrea los datos @demo.nutriar.local)
npm run build                          # compila el frontend
DEMO_MODE=1 npm run dev                # http://localhost:3000
```
Frontend con recarga en caliente (opcional): `npm run dev:web` (puerto 5173, redirige /api a 3000).

**Cuentas de demostración** (todas ficticias, contraseña `Demo-NutriAR-2026`):
- Profesional: `nutri@demo.nutriar.local` — paciente con plan, mediciones, turnos, mensajes.
- Paciente: `paciente@demo.nutriar.local` (Lucía Ficticia Pérez).
- Otra profesional (para probar aislamiento): `otra.nutri@demo.nutriar.local`.

## 4. Variables de entorno (sin secretos; ver `.env.example`)

`DATABASE_URL`, `SESSION_SECRET` (≥32 caracteres, obligatorio en producción), `APP_URL`, `APP_NAME`, `PORT`, `STORAGE_DIR`, `MAX_UPLOAD_MB` (10), `TRUST_PROXY`, `SECURE_COOKIES`, `ALLOW_PROFESSIONAL_SIGNUP` (1 en desarrollo, 0 por defecto en producción), `DEMO_MODE`, `SMTP_URL`, `MAIL_FROM`, `STORAGE_BACKEND` (`disk` por defecto o `database` para guardar fotos y documentos en PostgreSQL, usado en la prueba gratuita), `SEED_CATALOG_ON_START` (1 por defecto: carga idempotente del catálogo al arrancar), `SEED_DEMO_IF_EMPTY` (con `DEMO_MODE=1`, crea la demo si no existe), `RENDER_EXTERNAL_URL` (la define Render; se usa si falta `APP_URL`).

## 5. Migraciones y base

- `npm run migrate` aplica en orden los `.sql` de `migrations/` no aplicados (tabla `schema_migrations`). El servidor también migra al arrancar.
- Para cambios de esquema: agregar `migrations/002_xxx.sql` (nunca editar una migración ya aplicada).

## 6. Funciones implementadas

**Profesional (computadora/tablet)**
- Inicio: próximos turnos (7 días), mensajes sin leer, seguimientos (cuestionarios enviados, pedidos de cambio de turno, registros nuevos).
- Pacientes: alta, búsqueda, edición, archivo/reactivación, eliminación definitiva (solo archivados, con confirmación escrita), exportación ZIP (JSON + archivos).
- Invitación con enlace seguro y estado (pendiente/aceptada/vencida/anulada); enlace de restablecimiento de contraseña para el paciente.
- Historia clínica (16 secciones + alergias/intolerancias estructuradas + restricciones). Contenido interno.
- Cuestionario previo: preguntas base + registro de 24 h + preguntas propias configurables; el paciente guarda borrador y envía; la profesional revisa.
- Consultas/evolución con notas internas vs. compartidas y registro de 24 h.
- Mediciones (13 tipos) con fecha, unidad, autor y origen (profesional/paciente); gráficos; IMC e índice cintura/talla **solo si hay talla** (marcados “calculado”); anulación con auditoría; la profesional elige qué indicadores comparte.
- Objetivos de hábitos/alimentación/medición, visibles o no.
- Fotos corporales privadas (sin metadatos), compartibles, comparación lado a lado por fecha.
- Documentos privados (PDF/imágenes), compartibles, baja lógica. Sin interpretación automática.
- Registros del paciente (comidas con foto, agua y hábitos).
- Mensajería privada con imágenes, estado de lectura, bandeja, horarios de respuesta configurables.
- Planes: editor de 1 a 4 semanas, comidas y horarios configurables, alimentos/productos/recetas, g/ml/medidas caseras/porciones, peso bruto/neto, totales por comida y día con faltantes explícitos, alternativas definidas por la profesional, alerta de alérgenos (y confirmación obligatoria al publicar), notas por día, indicaciones generales, suplementos como texto estructurado, copiar día, borrador/publicación/versiones, plantillas, duplicar, lista de compras, PDF, opción de mostrar u ocultar calorías al paciente (se aplica en el servidor).
- Alimentos: búsqueda (nombre/marca/categoría, sin tildes), genéricos/productos/recetas, alta y edición de propios (privados), datos de etiqueta, medidas caseras con origen, recetas con rendimiento declarado, importación CSV con validación previa, trazabilidad (fuente, referencia, fecha, verificación).
- Agenda semanal, alta/edición/cancelación/realizado, superposición detectada (se puede forzar a propósito), zona horaria configurable (Argentina por defecto), reprogramación pide nueva confirmación.
- Auditoría por paciente (quién y cuándo, sin contenido clínico).
- Configuración: perfil, matrícula, zona horaria, horarios de respuesta, preguntas del cuestionario, cambio de contraseña.

**Paciente (celular)**
- Aceptación de invitación, ingreso, cambio de contraseña, recuperación (por correo si hay SMTP; si no, enlace generado por la profesional).
- Hoy: plan del día, turno próximo, contador de agua/hábitos, aviso de cuestionario pendiente.
- Plan por día y comida, recetas (ingredientes escalados y preparación), alternativas autorizadas, suplementos, PDF, lista de compras con tildes.
- Registro de comidas (estado, comentario, dificultad, foto), hábitos, peso/medidas y fotos corporales (si la profesional lo habilita).
- Avances: indicadores compartidos, objetivos, indicaciones de consultas.
- Mensajes con aviso de que no es canal de urgencias (107 SAME) y horario de respuesta.
- Turnos: confirmar o pedir cambio.
- Exportación de sus datos visibles.

**Notificaciones internas**: mensajes, plan publicado, turnos (alta, reprogramación, cancelación, recordatorio 24 h), cuestionarios, mediciones/fotos del paciente, activación de cuenta. Se ven con la app abierta (se actualizan cada 30 s).

## 7. Pendiente / limitaciones conocidas

- **Notificaciones push**: no implementadas. Con la app cerrada solo llegan correos (si se configura SMTP). Recordatorios de comidas y agua: **no implementados** (requieren Web Push; ver próxima acción).
- **Correo**: integración lista (`SMTP_URL`, `MAIL_FROM`) pero **no probada contra un servidor SMTP real**; sin SMTP la app informa “no configurado” y no simula envíos.
- **Catálogo**: 905 genéricos argentinos (SARA 2, Ministerio de Salud 2022, **licencia no comercial**) + 2.064 productos de marca vendidos en Argentina (Open Food Facts, ODbL, colaborativos: validar antes de uso clínico) + 121 genéricos de EE.UU. (marcados). Sin ARGENFOODS (requiere autorización escrita). Detalle en `docs/CATALOGO.md`.
- Carbohidratos: cada alimento guarda su criterio (`totales` USDA / `disponibles` etiquetas argentinas); el editor avisa si un día mezcla ambos.
- Alérgenos de los alimentos: etiquetas orientativas cargadas manualmente; no reemplazan la revisión profesional.
- Recetas no pueden contener otras recetas.
- Metadatos internos de PDFs subidos no se eliminan (las imágenes sí).
- No hay verificación de correo del paciente ni segundo factor (2FA).
- Mensajería por consulta periódica (15 s), no en tiempo real.
- Calendario semanal simple (sin vista mensual ni disponibilidad/turnos online).
- Interfaz solo en modo claro.

## 8. Pruebas ejecutadas y resultados (24/10/2026)

- 27/10/2026: `npm test` **58/58 OK** y `npm run test:e2e` **17/17 OK** con el catálogo argentino cargado. Conversión de SARA 2 verificada (cotejo independiente de texto, conteo por grupo, coherencia energética). Simulación de arranque tipo Render y `render.yaml` validado contra la especificación oficial de Blueprints.
- `npm test` (Vitest, PostgreSQL real, base `nutriar_test` recreada en cada corrida): **57/57 OK** (incluye `tests/importers.test.ts`: importadores de Open Food Facts y de tablas oficiales con datos ficticios — validaciones, rechazos con motivo, vacío ≠ cero, conversión kJ→kcal y sodio, reimportación sin duplicar ni borrar).
  - `tests/nutrition.test.ts`: cálculos verificables a mano (USDA SR28), medidas, densidad, peso bruto, faltante ≠ cero, recetas por rendimiento, lista de compras, IMC, zonas horarias, ciclo de semanas.
  - `tests/flows.test.ts`: las 13 comprobaciones obligatorias vía API, incluidas solicitudes directas de otra profesional y otro paciente a recursos y archivos ajenos, eliminación de EXIF, PDF (texto extraído) vs. lista de compras, versiones e historial, persistencia tras cerrar sesión, errores (archivo inválido, tamaño, validaciones, plan vacío, CSRF, borrado con confirmación) y auditoría.
- `npm run test:e2e` (Chromium real, base `nutriar_e2e`): **17/17 pasos OK** — profesional en 1366×900 y paciente en celular 390×844: registro, alta con error de validación, invitación, historia clínica, aceptación en celular, cuestionario, editor de plan con medida casera y alerta de alérgeno, publicación con confirmación, plan/lista de compras/PDF del paciente, registro con foto, archivo inválido sin pérdida de texto, mensajes con “Leído”, foto visible para la profesional, mediciones y gráfico compartido, turnos con superposición y confirmación, persistencia tras cerrar sesión, aislamiento por URL directa. Sin errores de consola.
- Revisión visual por capturas: computadora, tablet (820 px) y celular (390 px) de las pantallas principales; sin desbordes horizontales.
- Respaldo/restauración: `scripts/backup.sh` + `scripts/restore.sh` probados sobre una base con archivos → mismos conteos y archivos idénticos.
- Imagen Docker: construida y ejecutada contra PostgreSQL (migra, sirve la app, registro abierto bloqueado en producción, alta de profesional por consola). En este entorno se construyó con una variante que solo agrega el proxy del sandbox.
- Arranque simulado como en Render (base vacía, modo producción, `RENDER_EXTERNAL_URL`): migra, carga el catálogo, crea la demo una sola vez y no la duplica al reiniciar. E2E repetido tras los cambios: 17/17 OK.
- **No verificado**: despliegue real en Render (no contratado); importación con datos reales de Open Food Facts o SARA 2 (fuentes bloqueadas); envío real de correos; HTTPS real; Safari/iOS y Firefox; lectores de pantalla.

## 9. Alojamiento y costos

Recomendación: **Render** (aplicación + PostgreSQL gestionado + disco privado) — detalle, fuentes y pasos en `docs/ALOJAMIENTO.md`. **No contratado.** `render.yaml` crea todo sin escribir claves.
- Costo de la prueba: **USD 13,55/mes, verificado en render.com/pricing el 27/10/2026** (web 0.5c-512mb 7 + disco 1 GB 0,25 + Postgres 0.1c-256mb 6 + 1 GB de base 0,30; recuperación de base de 3 días y copia diaria del disco incluidas; correo no necesario) **+ impuestos argentinos** (estimado USD 16–21/mes, a confirmar con el banco).
- Los planes gratuitos de Render no sirven (sin disco, la base gratuita se borra a los 30+14 días).
- Uso real estimado: USD 35–65/mes + dominio + correo (no verificado).
- Primera prueba sin correo: invitaciones y restablecimientos por enlace; `scripts/reset-link.ts` para la cuenta profesional.

## 10. Condiciones antes de usar datos reales

1. Revisión legal (Ley 25.326 de Protección de Datos Personales y normativa de historia clínica, Ley 26.529): consentimiento informado, términos y política de privacidad, inscripción de la base ante la autoridad (AAIP) si corresponde, plazos de conservación.
2. Despliegue con HTTPS, `SESSION_SECRET` fuerte, `ALLOW_PROFESSIONAL_SIGNUP=0`, `DEMO_MODE=0`, sin datos demo (`seed:demo` no debe ejecutarse).
3. Respaldos automáticos cifrados fuera del servidor + prueba periódica de restauración.
4. Cifrado en reposo del disco/volumen y de la base (según proveedor).
5. Revisión de seguridad independiente (pruebas de penetración, revisión de dependencias).
6. Configurar y probar SMTP con dominio propio (SPF/DKIM).
7. Que una nutricionista valide los nombres en español, categorías, alérgenos y medidas del catálogo, y cargue productos argentinos desde etiquetas.
8. Considerar 2FA para profesionales.

## 11. Bloqueos y siguiente acción concreta

Resuelto el 27/10/2026: acceso de red habilitado; SARA 2 y Open Food Facts incorporados; precios de Render verificados.

Plan acordado con el dueño (en este orden):
1. ✅ **Validación por nutricionista:** la hace una nutricionista del entorno del dueño, durante la prueba (lista en `docs/CATALOGO.md`, punto 6, incluida una muestra de productos de Open Food Facts).
2. ✅ **Pedidos de permiso enviados el 27/10/2026** (sin nombrar la app). Esperando respuesta:
   - SARA 2 (uso comercial): a consultas@dinami.gov.ar (Área de Nutrición, Dirección de Salud Perinatal, Niñez y Adolescencias), con copia a dspnya@msal.gov.ar e info@iecs.org.ar. **consultas@dinami.gov.ar rebotó** (el dominio dinami.gov.ar ya no existe): la carta llegó solo a las copias. dspnya@msal.gov.ar pasa a ser el contacto principal. Si no hay respuesta en unos 15 días: reenviar o llamar al (011) 4379-9179.
   - ARGENFOODS: a informes@unlu.edu.ar, con copia a msperanza@unlu.edu.ar (contacto probable, no confirmado). Si no hay respuesta: reenviar o llamar al (02323) 423979 / 423171.
   - Hasta tener respuesta, SARA 2 se usa solo en pruebas sin fines comerciales (licencia CC BY-NC-SA 2.5 AR) y ARGENFOODS no se importa.
3. ⏸️ **Prueba gratuita en Render** (sin tarjeta) con `render-prueba-gratis.yaml`: **es lo primero al retomar.** Guiar al dueño paso a paso (crear la cuenta con GitHub → New → Blueprint → repositorio → Blueprint Path `render-prueba-gratis.yaml` → Apply). Después probar desde el celular con la nutricionista y anotar cambios. El dueño pausó este paso por falta de tiempo.
4. **Pagar al final:** autorizar el gasto y publicar con `render.yaml` (pasos en `docs/ALOJAMIENTO.md`). Todavía no está autorizado.

Siguiente acción técnica: guiar la prueba gratuita en Render y aplicar los cambios que pida la nutricionista; publicar la versión paga solo cuando se autorice y verificar la app en el celular; después, Web Push para recordatorios con la app cerrada.
