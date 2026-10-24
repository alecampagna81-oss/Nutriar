-- NutriAR: esquema inicial
create extension if not exists pgcrypto;

-- Usuarios y sesiones ---------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,           -- siempre en minúsculas
  password_hash text not null,
  role text not null check (role in ('professional','patient')),
  name text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table professionals (
  user_id uuid primary key references users(id) on delete cascade,
  license_number text,                  -- matrícula
  timezone text not null default 'America/Argentina/Buenos_Aires',
  response_hours text not null default 'Lunes a viernes de 9 a 18 h. Respondo dentro de las 48 h hábiles.',
  default_appointment_minutes int not null default 45
);

-- Tabla usada por connect-pg-simple
create table user_sessions (
  sid varchar not null primary key,
  sess json not null,
  expire timestamp(6) not null
);
create index user_sessions_expire_idx on user_sessions (expire);

-- Pacientes -------------------------------------------------------------------
create table patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references users(id),
  user_id uuid unique references users(id),          -- se completa al aceptar la invitación
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  birth_date date,
  sex text check (sex in ('femenino','masculino','otro')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  -- configuración de lo que ve y puede hacer el paciente
  show_nutrients boolean not null default false,
  allow_self_measurements boolean not null default true,
  allow_body_photos boolean not null default false,
  shared_indicators text[] not null default '{}',
  habits jsonb not null default '[]'             -- [{key,name,unit,target}]
);
create index patients_prof_idx on patients(professional_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  token_hash text not null unique,
  email text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  email_status text not null default 'no_enviado'  -- no_enviado | enviado | error | sin_configurar
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Historia clínica ------------------------------------------------------------
create table clinical_records (
  patient_id uuid primary key references patients(id) on delete cascade,
  data jsonb not null default '{}',
  allergens text[] not null default '{}',   -- etiquetas normalizadas (gluten, lactosa…)
  restriction_notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create table questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references users(id),
  text text not null,
  kind text not null check (kind in ('texto','si_no','numero','opciones')),
  options jsonb not null default '[]',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente','enviado','revisado')),
  questions jsonb not null default '[]',    -- copia de preguntas adicionales al momento de solicitarlo
  answers jsonb not null default '{}',
  requested_at timestamptz not null default now(),
  requested_by uuid references users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  review_note text
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  date date not null,
  title text not null default 'Consulta',
  internal_notes text not null default '',  -- NUNCA visibles para el paciente
  shared_notes text not null default '',    -- visibles para el paciente
  recall_24h jsonb not null default '[]',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Archivos privados -------------------------------------------------------------
create table files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  kind text not null check (kind in ('documento','foto_corporal','foto_comida','imagen_mensaje')),
  storage_key text not null unique,
  mime text not null,
  size_bytes int not null,
  original_name text,
  title text,
  taken_on date,
  uploaded_by uuid not null references users(id),
  shared_with_patient boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_patient_idx on files(patient_id);

-- Mediciones y objetivos ------------------------------------------------------
create table measurements (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  measured_on date not null,
  kind text not null,
  value numeric not null,
  unit text not null,
  source text not null check (source in ('profesional','paciente')),
  method text,
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index measurements_patient_idx on measurements(patient_id, kind, measured_on);

create table goals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  description text not null,
  category text not null default 'habito' check (category in ('habito','medicion','alimentacion','otro')),
  target text,
  status text not null default 'activo' check (status in ('activo','logrado','pausado')),
  shared boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Alimentos, productos y recetas ---------------------------------------------
create table foods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('generico','producto','receta')),
  name text not null,
  brand text,
  category text not null default 'Otros',
  presentation text,                        -- productos: "Paquete 500 g"
  state text check (state in ('crudo','cocido','listo_para_consumir')),
  edible_portion_pct numeric check (edible_portion_pct > 0 and edible_portion_pct <= 100),
  basis_amount numeric not null default 100,
  basis_unit text not null default 'g' check (basis_unit in ('g','ml')),
  -- valores por basis_amount de basis_unit; NULL = dato faltante (distinto de 0)
  energy_kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  density_g_per_ml numeric,
  allergens text[] not null default '{}',
  label_data jsonb,                         -- productos: porción de etiqueta, etc.
  source text not null,                     -- fuente
  source_ref text,                          -- identificador en la fuente
  source_date date,
  verification text not null check (verification in ('verificado','fuente_secundaria','sin_verificar','calculado','demo')),
  is_demo boolean not null default false,
  owner_id uuid references users(id),       -- NULL = catálogo común NutriAR
  visibility text not null default 'privado' check (visibility in ('privado','catalogo')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  search text generated always as (lower(name || ' ' || coalesce(brand,'') || ' ' || category)) stored
);
create index foods_owner_idx on foods(owner_id);
create unique index foods_source_ref_idx on foods(source, source_ref) where source_ref is not null and owner_id is null;

create table food_measures (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references foods(id) on delete cascade,
  name text not null,                  -- "1 taza", "1 unidad mediana"
  amount numeric not null check (amount > 0),
  unit text not null default 'g' check (unit in ('g','ml')),
  source text not null
);

create table recipe_details (
  food_id uuid primary key references foods(id) on delete cascade,
  servings numeric not null check (servings > 0),
  yield_grams numeric not null check (yield_grams > 0),   -- peso final declarado de la preparación
  preparation text not null default '',
  minutes int
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references foods(id) on delete cascade,
  ingredient_id uuid not null references foods(id),
  quantity numeric not null check (quantity > 0),
  unit text not null,                  -- g | ml | measure:<id>
  position int not null default 0
);

-- Planes alimentarios ----------------------------------------------------------
create table plans (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references users(id),
  patient_id uuid references patients(id) on delete cascade,  -- NULL = plantilla
  is_template boolean not null default false,
  title text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version_no int not null,
  status text not null check (status in ('borrador','publicado','reemplazado')),
  content jsonb not null,
  start_date date,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (plan_id, version_no)
);

-- Registros del paciente ----------------------------------------------------------
create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  plan_version_id uuid references plan_versions(id),
  log_date date not null,
  meal_key text,
  meal_name text not null,
  status text not null check (status in ('cumplida','parcial','no_cumplida','fuera_del_plan')),
  description text,
  comment text,
  difficulty text,
  photo_file_id uuid references files(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  seen_by_professional_at timestamptz
);
create index meal_logs_patient_idx on meal_logs(patient_id, log_date);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  log_date date not null,
  habit_key text not null,
  value numeric not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Mensajería y notificaciones ---------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null default '',
  file_id uuid references files(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_patient_idx on messages(patient_id, created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,                 -- sin contenido clínico
  link text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Agenda ---------------------------------------------------------------------------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references users(id),
  patient_id uuid not null references patients(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  modality text not null default 'presencial' check (modality in ('presencial','virtual','telefonica')),
  location text,
  status text not null default 'programado' check (status in ('programado','confirmado','cambio_solicitado','cancelado','realizado')),
  internal_notes text not null default '',
  patient_note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminder_sent_at timestamptz
);
create index appointments_prof_idx on appointments(professional_id, starts_at);

-- Auditoría (sin contenido clínico) -------------------------------------------------
create table audit_log (
  id bigserial primary key,
  actor_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  patient_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_patient_idx on audit_log(patient_id, created_at);
