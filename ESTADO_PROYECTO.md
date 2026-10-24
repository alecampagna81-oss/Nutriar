# ESTADO DEL PROYECTO — NutriAR

Archivo de continuidad. Leelo primero al retomar el trabajo. Última actualización: 24/10/2026.

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
docs/          CATALOGO.md, SEGURIDAD_Y_DATOS.md, DESPLIEGUE.md
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

`DATABASE_URL`, `SESSION_SECRET` (≥32 caracteres, obligatorio en producción), `APP_URL`, `APP_NAME`, `PORT`, `STORAGE_DIR`, `MAX_UPLOAD_MB` (10), `TRUST_PROXY`, `SECURE_COOKIES`, `ALLOW_PROFESSIONAL_SIGNUP` (1 en desarrollo, 0 por defecto en producción), `DEMO_MODE`, `SMTP_URL`, `MAIL_FROM`.

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
- **Catálogo**: 121 genéricos (USDA SR28) + 6 recetas base. **No hay productos de marca argentinos verificados** ni alimentos típicos ausentes en SR28 (yerba mate/mate cebado, harinas y panificados locales, cortes argentinos exactos, merluza). Detalle en `docs/CATALOGO.md`.
- Carbohidratos de USDA = totales por diferencia (incluyen fibra); en etiquetas argentinas se informan carbohidratos disponibles. Se advierte en la interfaz; mezclar ambas fuentes introduce diferencias del orden de la fibra.
- Alérgenos de los alimentos: etiquetas orientativas cargadas manualmente; no reemplazan la revisión profesional.
- Recetas no pueden contener otras recetas.
- Metadatos internos de PDFs subidos no se eliminan (las imágenes sí).
- No hay verificación de correo del paciente ni segundo factor (2FA).
- Mensajería por consulta periódica (15 s), no en tiempo real.
- Calendario semanal simple (sin vista mensual ni disponibilidad/turnos online).
- Interfaz solo en modo claro.

## 8. Pruebas ejecutadas y resultados (24/10/2026)

- `npm test` (Vitest, PostgreSQL real, base `nutriar_test` recreada en cada corrida): **52/52 OK**.
  - `tests/nutrition.test.ts`: cálculos verificables a mano (USDA SR28), medidas, densidad, peso bruto, faltante ≠ cero, recetas por rendimiento, lista de compras, IMC, zonas horarias, ciclo de semanas.
  - `tests/flows.test.ts`: las 13 comprobaciones obligatorias vía API, incluidas solicitudes directas de otra profesional y otro paciente a recursos y archivos ajenos, eliminación de EXIF, PDF (texto extraído) vs. lista de compras, versiones e historial, persistencia tras cerrar sesión, errores (archivo inválido, tamaño, validaciones, plan vacío, CSRF, borrado con confirmación) y auditoría.
- `npm run test:e2e` (Chromium real, base `nutriar_e2e`): **17/17 pasos OK** — profesional en 1366×900 y paciente en celular 390×844: registro, alta con error de validación, invitación, historia clínica, aceptación en celular, cuestionario, editor de plan con medida casera y alerta de alérgeno, publicación con confirmación, plan/lista de compras/PDF del paciente, registro con foto, archivo inválido sin pérdida de texto, mensajes con “Leído”, foto visible para la profesional, mediciones y gráfico compartido, turnos con superposición y confirmación, persistencia tras cerrar sesión, aislamiento por URL directa. Sin errores de consola.
- Revisión visual por capturas: computadora, tablet (820 px) y celular (390 px) de las pantallas principales; sin desbordes horizontales.
- Respaldo/restauración: `scripts/backup.sh` + `scripts/restore.sh` probados sobre una base con archivos → mismos conteos y archivos idénticos.
- Imagen Docker: construida y ejecutada contra PostgreSQL (migra, sirve la app, registro abierto bloqueado en producción, alta de profesional por consola). En este entorno se construyó con una variante que solo agrega el proxy del sandbox.
- **No verificado**: envío real de correos; despliegue en un proveedor; HTTPS real; navegadores Safari/iOS y Firefox (solo Chromium); lectores de pantalla.

## 9. Despliegue y costos

Ver `docs/DESPLIEGUE.md`. Resumen (estimaciones, **precios no verificados en las páginas oficiales** — verificar antes de contratar):
- Opción A, un VPS con Docker Compose (app + PostgreSQL + Caddy para HTTPS): del orden de **4–10 € / mes** (fuentes secundarias de 2026 citan ~4 €/mes para el VPS más chico de Hetzner tras su aumento de abril 2026) + dominio (~USD 10–20/año) + espacio de respaldo externo (pocos USD/mes).
- Opción B, PaaS (p. ej. Render): servicio web Starter ~USD 7/mes + PostgreSQL Basic-256mb ~USD 6/mes según su página de precios, **más un disco persistente** para los archivos (o adaptar el almacenamiento a S3), ≈ USD 15–20/mes.
- Correo transaccional: hay planes gratuitos con límites diarios (p. ej. Brevo cita 300/día); suficiente para invitaciones y recordatorios de una consulta.
- Sin costos de IA ni licencias: todas las bibliotecas son de código abierto; USDA SR28 es de dominio público.

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

Bloqueos externos (requieren al dueño):
- Autorización y cuenta para **publicar** un entorno de prueba accesible (proveedor, dominio, costo).
- Credenciales SMTP si se quiere correo.
- Repositorio remoto (GitHub) para subir el código; hoy está en un repositorio git local.

Siguiente acción técnica sugerida: desplegar en el proveedor elegido con `docker-compose.yml` + Caddy, configurar respaldo diario (`scripts/backup.sh` vía cron) y luego implementar Web Push (VAPID) para recordatorios de comidas/agua/turnos con la app cerrada.
