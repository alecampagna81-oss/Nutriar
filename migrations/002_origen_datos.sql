-- Origen de los datos de cada alimento: país, conjunto de datos y criterio de carbohidratos.
alter table foods add column origin_country text;            -- 'AR', 'US', NULL = no informado
alter table foods add column dataset text;                   -- 'USDA SR28', 'SARA 2', 'Open Food Facts', 'Propio', 'Demo'…
alter table foods add column carbs_basis text check (carbs_basis in ('totales','disponibles'));
alter table foods drop constraint foods_verification_check;
alter table foods add constraint foods_verification_check check (verification in ('verificado','fuente_secundaria','sin_verificar','calculado','demo','colaborativo'));

update foods set origin_country = 'US', dataset = 'USDA SR28', carbs_basis = 'totales' where source like 'USDA National Nutrient Database%';
update foods set origin_country = 'US', dataset = 'Recetas base NutriAR', carbs_basis = 'totales' where source_ref like 'receta-base:%';
update foods set dataset = 'Demo' where is_demo;
update foods set dataset = 'Propio' where owner_id is not null and dataset is null;
create index foods_dataset_idx on foods(dataset);
