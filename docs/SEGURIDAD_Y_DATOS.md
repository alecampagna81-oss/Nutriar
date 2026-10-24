# Seguridad, privacidad y manejo de datos

> Estas medidas reducen riesgos pero **no garantizan seguridad ni cumplimiento legal**. Ver “Condiciones antes de usar datos reales” en `ESTADO_PROYECTO.md`.

## Medidas implementadas
- Contraseñas con Argon2id; mínimo 10 caracteres; mensajes de error que no revelan si un correo existe; tiempo de respuesta igualado.
- Sesiones en servidor (PostgreSQL), cookie `httpOnly` + `SameSite=Lax` + `Secure` en producción, regeneración al iniciar sesión, cierre de todas las sesiones al restablecer la contraseña o archivar al paciente. Vencen a las 12 h sin actividad.
- Límites: 20 intentos de autenticación/15 min por IP, 1500 solicitudes/15 min por IP, 60 archivos/hora por usuario, 10 MB por archivo, 1 MB por JSON.
- Protección CSRF por encabezado obligatorio en escrituras; cabeceras de seguridad con Helmet (CSP estricta, `frame-ancestors 'none'`).
- Aislamiento en el servidor: cada consulta filtra por profesional o por paciente; las pruebas automatizadas intentan accesos directos cruzados a 13 rutas de lectura, 6 de escritura y a los archivos.
- Archivos fuera de carpetas públicas, nombres aleatorios, permisos 600, servidos solo tras verificar permisos, `Cache-Control: private, no-store`, `nosniff`. Validación por contenido (no por extensión). Imágenes re-codificadas sin EXIF/GPS.
- Notas internas separadas de las compartidas; nunca se envían al paciente (verificado también en su exportación).
- Ocultamiento de calorías aplicado en el servidor (no solo en la interfaz).
- Auditoría (`audit_log`) de acciones relevantes con autor y fecha, sin contenido clínico.
- Logs mínimos sin cuerpos ni datos clínicos; errores internos registran solo el mensaje técnico.
- Sin envío de datos a servicios de IA ni a terceros (salvo el SMTP que se configure, que recibe solo invitaciones/recordatorios sin datos clínicos).
- Sin caché offline de información clínica (no hay service worker).

## Archivo, eliminación y conservación
- **Archivar paciente**: lo oculta, bloquea su acceso y anula invitaciones; conserva todo. Reversible.
- **Eliminar definitivamente**: solo pacientes archivados, escribiendo su nombre completo. Borra datos y archivos; la cuenta queda deshabilitada y anonimizada; la auditoría conserva el evento. Irreversible: exportar antes.
- Mediciones y documentos se “anulan/dan de baja” (baja lógica) y quedan registrados en la auditoría.
- Los planes nunca se sobrescriben: cada publicación crea una versión.
- Plazo de conservación: a definir con asesoría legal (la historia clínica tiene plazos mínimos legales).

## Exportación
- Profesional: ZIP con `datos.json` (todo, incluidas notas internas) + archivos.
- Paciente: ZIP con lo que puede ver (sin historia clínica interna ni notas internas).

## Respaldo y recuperación (procedimiento probado)
```bash
# Respaldo (base + archivos) — programarlo diario con cron
DATABASE_URL=postgres://... STORAGE_DIR=/ruta/storage BACKUP_DIR=/ruta/backups scripts/backup.sh
gpg --symmetric --cipher-algo AES256 /ruta/backups/nutriar-AAAAMMDD-HHMMSS.tar.gz   # cifrar
# copiar el .gpg a un almacenamiento externo (otro proveedor/cuenta) y borrar el .tar.gz sin cifrar

# Restauración en una base VACÍA y carpeta vacía
createdb nutriar_restaurada
DATABASE_URL=postgres://.../nutriar_restaurada STORAGE_DIR=/ruta/storage-nueva scripts/restore.sh nutriar-AAAAMMDD-HHMMSS.tar.gz
# apuntar la app a la base/carpeta restauradas y verificar /api/health e ingreso
```
Con Docker Compose: `docker compose exec db pg_dump -U nutriar -Fc nutriar > db.dump` y copiar el volumen `storage`.
Recomendado: conservar 7 diarios + 4 semanales + 6 mensuales y **probar una restauración al menos una vez por mes**.
