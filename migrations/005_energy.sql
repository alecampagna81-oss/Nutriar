-- Requerimiento energético y reparto de macronutrientes por paciente (uno vigente por paciente).
create table energy_requirements (
  patient_id uuid primary key references patients(id) on delete cascade,
  config jsonb not null,
  result jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
