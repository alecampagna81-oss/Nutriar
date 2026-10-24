# Despliegue

## Opción A — un servidor (VPS) con Docker Compose (recomendada por costo)
1. Servidor Linux con Docker. Copiar el repositorio.
2. `cp .env.example .env` y completar (`SESSION_SECRET=$(openssl rand -hex 32)`, `POSTGRES_PASSWORD`, `APP_URL=https://tu-dominio`, `ALLOW_PROFESSIONAL_SIGNUP=0`, `DEMO_MODE=0`).
3. `docker compose up -d --build` (la app queda en 127.0.0.1:3000; migra sola al iniciar).
4. HTTPS con Caddy delante, por ejemplo `/etc/caddy/Caddyfile`:
   ```
   tu-dominio.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```
5. Cargar el catálogo: `docker compose exec app node --import tsx scripts/seed-catalog.ts`.
6. Crear profesionales: `docker compose exec app node --import tsx scripts/create-professional.ts "Nombre" correo@dominio "contraseña"`.
7. Programar respaldos (ver `docs/SEGURIDAD_Y_DATOS.md`).

Para un **entorno de demostración**: `DEMO_MODE=1` y `docker compose exec app node --import tsx scripts/seed-demo.ts`. No mezclar con datos reales.

## Opción B — PaaS (Render, Railway, Fly.io…)
- Web service con `npm ci && npm run build` y `npm start`; PostgreSQL gestionado (`DATABASE_URL`).
- **Importante**: el disco de estas plataformas suele ser efímero. Montar un disco persistente en `STORAGE_DIR` o adaptar `server/lib/storage.ts` a un bucket S3 privado (las fotos y documentos se perderían en cada despliegue si no).
- `TRUST_PROXY=1`, `SECURE_COOKIES=1`.

## Verificación posterior
- `GET /api/health` → `{"ok":true}`.
- Ingresar como profesional, crear un paciente ficticio, invitarlo desde otro navegador y borrar la prueba.
