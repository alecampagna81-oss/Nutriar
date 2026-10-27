# Alojamiento recomendado: Render

Actualizado: 24/10/2026. **Ningún servicio fue contratado.** Todo está preparado para activarse cuando se autorice el gasto.

## Recomendación

**Render** (render.com), con todo en un solo proveedor: aplicación, base de datos PostgreSQL gestionada y disco privado para fotos y documentos.

Por qué:
- **Mantenimiento mínimo.** Render actualiza servidores y base de datos, renueva el certificado HTTPS y publica solo cada cambio que se sube a GitHub.
- **Una sola cuenta y una sola factura.** El archivo `render.yaml` del repositorio crea todo con un clic, sin escribir claves: la clave de sesiones la genera Render.
- **Respaldos incluidos.** La base tiene recuperación a un momento dado de los últimos 3 días en el plan Hobby (7 días en Pro), y el disco tiene una copia automática diaria que se conserva al menos 7 días.
- **Costo fijo y previsible.**
- No la elegí por ser la más barata. Un servidor propio (VPS) cuesta menos, pero exige mantener el sistema operativo, la seguridad y los respaldos.

## Prueba gratuita antes de pagar (recomendada como primer paso)

Render permite probar **sin tarjeta**: según su documentación, si se supera el uso gratuito y no hay medio de pago, suspende el servicio en lugar de cobrar.
- **Configuración:** `render-prueba-gratis.yaml`. En Render: *New* → *Blueprint* → repositorio `nutriar` → en **Blueprint Path** escribir `render-prueba-gratis.yaml` → *Apply*.
- Las fotos y documentos se guardan **dentro de la base** (`STORAGE_BACKEND=database`), porque el plan gratuito no tiene disco y borra los archivos sueltos en cada reinicio. Probado: una foto subida sigue disponible después de reiniciar la app desde cero.
- **Límites** (render.com/docs/free, 27/10/2026):
  - la app se apaga tras 15 minutos sin uso y tarda alrededor de 1 minuto en volver a encender;
  - 750 horas por mes;
  - la base gratuita (1 GB) **vence a los 30 días** y se borra 14 días después si no se pasa a un plan pago.
- Archivos de hasta 5 MB, para no llenar la base.
- **Solo datos ficticios.**
- **Para pasar al plan pago:** crear otra vez con `render.yaml` (base nueva y disco). Los datos de la prueba no se migran: son ficticios.

## Servicios y cuentas

| Servicio | Para qué | ¿Hace falta ahora? |
|---|---|---|
| GitHub | Código (repositorio privado `alecampagna81-oss/nutriar`) | Ya está |
| Render (workspace Hobby) | Aplicación + base de datos + disco | Sí, cuando se autorice |
| Correo (Brevo o Resend) | Invitaciones, recuperación de contraseña y recordatorios por correo | No para la primera prueba |
| Dominio propio | Necesario para enviar correo con buena entrega | No por ahora |

## Costo mensual de la prueba

Precios **verificados directamente en render.com/pricing el 27/10/2026**.

| Concepto | Plan | USD/mes |
|---|---|---|
| Aplicación web | `0.5c-512mb` (0,5 CPU, 512 MB, siempre encendida) | 7,00 |
| Disco para fotos y documentos | 1 GB × 0,25 | 0,25 |
| Base de datos PostgreSQL | `0.1c-256mb` (256 MB) | 6,00 |
| Almacenamiento de la base | 1 GB × 0,30 | 0,30 |
| Workspace | Hobby | 0,00 |
| Respaldos | Incluidos (recuperación de 3 días + copia diaria del disco) | 0,00 |
| Correo | No se usa en la primera prueba | 0,00 |
| Transferencia | 5 GB incluidos por mes | 0,00 |
| **Total** | | **≈ 13,55 + impuestos** |

**Impuestos al pagar desde Argentina (estimación, no verificada en ARCA):** si no sos responsable inscripto, el banco puede percibir IVA del 21 % sobre servicios digitales del exterior. También puede haber una percepción del 30 % (recuperable) e Ingresos Brutos según la provincia. Rango orientativo: **USD 16 a 21 por mes**. Confirmalo con tu banco o tu contador.

## Qué es gratuito y con qué límites

- **Workspace Hobby:** USD 0. Una persona, hasta 25 servicios, 5 GB de transferencia y 500 minutos de compilación por mes.
- **Planes gratuitos de aplicación y base: no sirven para esta prueba.**
  - La aplicación gratuita se apaga a los 15 minutos sin uso y no admite disco: las fotos se perderían.
  - La base gratuita vence a los 30 días y se borra 14 días después si no se pasa a pago.
- **Correo:** hay planes gratuitos.
  - Brevo: 300 correos por día, con la cuenta aprobada y el dominio autenticado.
  - Resend: 100 por día y 3.000 por mes, con dominio verificado obligatorio.
  - Por eso conviene dejar el correo para cuando haya dominio propio.

## Tarjeta, cargos variables y cómo limitarlos

- **Medio de pago:** hace falta uno para los planes pagos.
- **Cargos fijos:** la aplicación, la base y el disco tienen precio fijo según el tamaño elegido. Si no se agranda nada, no suben.
- **Cargos variables posibles:**
  - **Transferencia** por encima de 5 GB/mes: USD 0,15 por GB. Una prueba con pocas pacientes está muy lejos de ese límite.
  - **Minutos de compilación** por encima de 500/mes. Se limita fijando en Render un tope de gasto de compilación en USD 0.
- **Control:** revisar la sección *Billing* de Render una vez por mes. Si la prueba se pausa, se puede **suspender** la aplicación para que deje de cobrarse; la base sigue cobrándose mientras exista.

## Mantenimiento a tu cargo

- Activar la verificación en dos pasos en Render y en GitHub.
- Mirar la factura una vez por mes.
- Nada técnico de rutina: los cambios que subo a GitHub se publican solos y Render se ocupa de servidores, certificados y respaldos.

## Correo en la primera prueba

**Se puede probar sin correo:**
- **Invitar pacientes:** la nutricionista genera el enlace en la ficha del paciente y lo comparte por WhatsApp u otro medio.
- **Contraseña de un paciente:** la nutricionista genera un enlace de restablecimiento desde la ficha.
- **Contraseña de la nutricionista:** se genera un enlace con `node --import tsx scripts/reset-link.ts correo` en la pestaña *Shell* de Render. Lo hago yo o te guío.

**Queda pendiente hasta configurar correo:**
- "Olvidé mi contraseña" sin ayuda de la nutricionista.
- Envío automático de invitaciones.
- Recordatorios de turno por correo. Los avisos dentro de la app sí funcionan.

**Configurar el correo de forma segura (más adelante):**
1. Crear la cuenta en el proveedor y autenticar el dominio.
2. En Render → servicio `nutriar` → *Environment*, cargar `SMTP_URL` y `MAIL_FROM`.

Las claves se cargan **solo en Render**. Nunca se pegan en el chat ni se suben a GitHub.

## Pasar de la prueba al uso real

| Cambio | Configuración | Costo estimado (no verificado) |
|---|---|---|
| Quitar el modo demo | `DEMO_MODE=0`, `SEED_DEMO_IF_EMPTY=0`, base nueva sin datos ficticios | — |
| Dominio propio | Comprar dominio y conectarlo en Render | USD 10–20 por año |
| Correo | Proveedor con dominio autenticado (SPF/DKIM) | 0 a USD 15–20/mes según volumen |
| Base más grande y más días de recuperación | Plan de base mayor; workspace Pro (USD 25/mes) para 7 días de recuperación | +USD 15–40/mes |
| Respaldo fuera de Render | `scripts/backup.sh` programado, cifrado, en otro proveedor | USD 1–5/mes |
| Requisitos legales | Ver "Condiciones antes de usar datos reales" en `ESTADO_PROYECTO.md` | Asesoría |

Estimación para un uso real pequeño: **USD 35 a 65 por mes** más impuestos.

## Cómo se activa (cuando lo autorices)

1. Entrar en render.com → *Sign up with GitHub*.
2. Activar la verificación en dos pasos.
3. Agregar un medio de pago.
4. *New* → *Blueprint* → elegir el repositorio `nutriar` → *Apply*. Render crea la aplicación, la base y el disco según `render.yaml`.
5. Esperar unos 5–10 minutos. La dirección queda del tipo `https://nutriar-xxxx.onrender.com`, con las cuentas ficticias ya creadas.
6. En *Billing*, poner en 0 el tope de gasto de compilación.
