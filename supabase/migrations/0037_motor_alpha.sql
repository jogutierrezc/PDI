-- =============================================================================
-- PDI · 0037 · Motor Alpha: el plano de valor agregado
--
-- Segunda forma de leer el mismo conjunto Saber 11 → Saber TyT (0035). Donde
-- el Motor Beta compara posiciones (percentiles), el Motor Alpha estima lo que
-- se esperaba de cada estudiante y mide la distancia con lo que de verdad
-- obtuvo.
--
-- Viene de una investigación publicada, y así se cita en la ficha:
--   León FJ., Tobar Sánchez JA., González Calderón W., Suárez Arias RE.
--   "Analysis of generic competencies using a Linear Regression Model: A case
--   study in short-cycle programs". Innovaciencia 2025; 13(1): e4589.
--   http://dx.doi.org/10.15649/2346075X.4589 · CC BY-NC 4.0
--   (Universidad Autónoma de Bucaramanga)
--
-- EL MODELO
--   Y = β0 + β1·Matemáticas + β2·Lectura crítica + β3·Ciencias naturales
--         + β4·Sociales y ciudadanas + β5·Inglés + ε
--   Y es el puntaje real en una competencia del Saber TyT; los predictores son
--   los puntajes del Saber 11 del mismo estudiante. Los coeficientes salen por
--   mínimos cuadrados sobre quienes tienen las dos pruebas completas.
--   El valor esperado Ŷ se contrasta con el real Y: VA = Y − Ŷ. Positivo, la
--   universidad aportó por encima de lo esperado; negativo, por debajo.
--
-- Dos ajustes por competencia, porque las ciencias naturales solo están en una
-- parte de los registros:
--   "completo"  los cinco predictores del artículo
--   "ampliado"  sin ciencias naturales, que cubre a muchos más estudiantes
--
--   alpha (od_saber_tyt)   {"nacional": {"saber11": {...}, "tyt": {...}},
--                           "modelos": {"<competencia>": {"completo": {...},
--                                        "ampliado": {...}}}}
--     cada modelo: {"coef": {"intercepto": n, "m": n, "lc": n, "cn": n,
--                            "sc": n, "ing": n}, "r2": n, "n": n, "rmse": n}
--
--   plane      {"95|110": 3, …}  esperado|real en celdas de 5 puntos
--   quadrants  {"1": n, "2": n, "3": n, "4": n}  frente a los promedios
--              nacionales: 1 alto en las dos pruebas, 2 alto solo en TyT,
--              3 bajo en las dos, 4 alto solo en Saber 11
--
-- Requiere 0035. Idempotente.
-- =============================================================================

alter table public.od_saber_tyt
  add column if not exists alpha jsonb not null default '{}'::jsonb;

alter table public.od_saber_tyt drop constraint if exists od_saber_tyt_alpha;
alter table public.od_saber_tyt
  add constraint od_saber_tyt_alpha check (jsonb_typeof(alpha) = 'object');

comment on column public.od_saber_tyt.alpha is
  'Motor Alpha: coeficientes de la regresión por competencia y los promedios nacionales de referencia.';

alter table public.od_saber_tyt_results
  add column if not exists alpha_n integer,
  add column if not exists alpha_expected numeric(6, 2),
  add column if not exists alpha_actual numeric(6, 2),
  add column if not exists alpha_va numeric(6, 2),
  add column if not exists alpha_positive integer,
  add column if not exists plane jsonb not null default '{}'::jsonb,
  add column if not exists quadrants jsonb not null default '{}'::jsonb;

alter table public.od_saber_tyt_results drop constraint if exists od_saber_tyt_results_alpha;
alter table public.od_saber_tyt_results
  add constraint od_saber_tyt_results_alpha check (
    jsonb_typeof(plane) = 'object' and jsonb_typeof(quadrants) = 'object'
    and (alpha_n is null or alpha_n >= 0) and (alpha_positive is null or alpha_positive >= 0)
  );

comment on column public.od_saber_tyt_results.alpha_expected is
  'Puntaje esperado medio en la escala de la prueba de salida, según la regresión del Motor Alpha.';
comment on column public.od_saber_tyt_results.alpha_va is
  'Valor agregado del Motor Alpha: puntaje real menos esperado, en puntos de la prueba de salida.';
comment on column public.od_saber_tyt_results.plane is
  'Plano de valor agregado: esperado|real en celdas de 5 puntos.';
comment on column public.od_saber_tyt_results.quadrants is
  'Cuadrantes frente a los promedios nacionales de las dos pruebas.';

-- La copia de periodo ya lleva las columnas nuevas: od_copy_saber_tyt copia con
-- lista explícita, así que se redefine con ellas.
create or replace function public.od_copy_saber_tyt(source_report uuid, target_report uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t record;
  new_tyt uuid;
begin
  for t in select * from public.od_saber_tyt where report_id = source_report loop
    insert into public.od_saber_tyt (report_id, key, title, description, note, benchmarks, alpha, office_id, position)
    values (target_report, t.key, t.title, t.description, t.note, t.benchmarks, t.alpha, t.office_id, t.position)
    returning id into new_tyt;

    insert into public.od_saber_tyt_results
      (tyt_id, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved,
       raw_entry, raw_exit, transitions, histogram, scatter,
       alpha_n, alpha_expected, alpha_actual, alpha_va, alpha_positive, plane, quadrants)
    select new_tyt, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved,
       raw_entry, raw_exit, transitions, histogram, scatter,
       alpha_n, alpha_expected, alpha_actual, alpha_va, alpha_positive, plane, quadrants
    from public.od_saber_tyt_results where tyt_id = t.id;
  end loop;
end;
$$;

grant execute on function public.od_copy_saber_tyt(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
