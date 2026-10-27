-- Registro de importaciones del catálogo común (evita reimportar en cada arranque).
create table catalog_imports (
  name text primary key,
  version text not null,
  summary jsonb,
  imported_at timestamptz not null default now()
);
