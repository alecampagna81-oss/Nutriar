-- Contenido de archivos privados cuando STORAGE_BACKEND=database (alojamientos sin disco persistente).
create table file_blobs (
  storage_key text primary key,
  data bytea not null,
  created_at timestamptz not null default now()
);
