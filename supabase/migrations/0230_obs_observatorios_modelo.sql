-- =============================================================================
-- PDI · 0230 · Observatorio de Analítica: varios observatorios (el modelo)
--
-- Hasta ahora el Observatorio era uno solo y sus catorce temas salían de una
-- constante (src/modules/datos-abiertos/observatorio/data.ts). Esta migración
-- lleva eso a filas, SIN cambiar nada de lo que se ve hoy:
--
--   obs_observatorios   nombre, enlace (slug), descripción, color, icono,
--                       responsable, estado (borrador · publicado · archivado)
--                       y plantilla de origen. Se siembra «Observatorio de
--                       Analítica» como el observatorio PRINCIPAL (principal =
--                       true): es el que sirve /datos-abiertos/observatorio y
--                       /datos-abiertos/observatorio/:tema, como hasta hoy.
--   obs_lineas          las líneas de cada observatorio. Hoy «línea» era solo un
--                       número 1–11 que daba el color del tema; se siembran
--                       las once como «Línea N», editables (no se inventan
--                       nombres de contenido).
--   obs_responsables    las PERSONAS responsables de cada observatorio: quienes
--                       lo editan y quienes proponen dominios (0232). Ver 0231.
--
-- Y amplía, sin romper, las tablas que ya existen (0049):
--   obs_topics      + observatorio_id, linea_id, codigo, nombre, resumen,
--                     pregunta, fuente, orden, archivado. El slug sigue siendo
--                     la llave primaria (única en TODO el portal): las rutas
--                     /…/observatorio/:tema no cambian.
--   obs_datasets, obs_views, obs_bulletins  + observatorio_id.
-- Todo lo que ya había queda asignado al observatorio principal; un disparador
-- asigna ese mismo observatorio a lo que escriba el taller actual (que todavía
-- no envía observatorio_id), de modo que el taller viejo y el portal público
-- siguen funcionando igual antes y después de aplicar esta migración.
--
-- Seguridad: las tablas nuevas nacen con RLS activa y SIN políticas (nadie lee
-- ni escribe) hasta que se aplique 0231, que trae las políticas por panel y
-- nivel. Aplicar 0230 sola no abre nada. El portal público no depende de estas
-- tablas mientras no haya filas legibles: usa la constante.
--
-- Requiere 0049 y set_updated_at(). Idempotente.
-- =============================================================================

-- 1. Observatorios --------------------------------------------------------------

create table if not exists public.obs_observatorios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  slug              text not null,
  descripcion       text not null default '',
  color             text not null default 'var(--od-line-1)',
  icono             text not null default 'spark-chart',
  responsable       text not null default '',
  estado            text not null default 'borrador',
  plantilla_origen  uuid references public.obs_observatorios (id) on delete set null,
  principal         boolean not null default false,
  creado_por        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint obs_observatorios_slug unique (slug),
  constraint obs_observatorios_slug_forma check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  constraint obs_observatorios_nombre check (char_length(btrim(nombre)) between 3 and 120),
  constraint obs_observatorios_descripcion check (char_length(descripcion) <= 600),
  constraint obs_observatorios_responsable check (char_length(responsable) <= 120),
  -- El color y el icono se imprimen en estilos y atributos del portal: forma cerrada.
  constraint obs_observatorios_color check (color ~ '^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]{1,40}\))$'),
  constraint obs_observatorios_icono check (icono ~ '^[a-z0-9-]{1,40}$'),
  constraint obs_observatorios_estado check (estado in ('borrador', 'publicado', 'archivado'))
);

comment on table public.obs_observatorios is
  'Observatorio de Analítica (0230): cada observatorio con su identidad. El principal sirve las rutas públicas de siempre.';

-- Solo uno es el principal.
create unique index if not exists obs_observatorios_principal_unico
  on public.obs_observatorios (principal) where principal;

drop trigger if exists obs_observatorios_set_updated_at on public.obs_observatorios;
create trigger obs_observatorios_set_updated_at before update on public.obs_observatorios
  for each row execute function public.set_updated_at();

-- 2. Líneas ------------------------------------------------------------------------

create table if not exists public.obs_lineas (
  id               uuid primary key default gen_random_uuid(),
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  nombre           text not null,
  orden            smallint not null default 0,
  -- Número 1–11 del color de línea del portal (--od-line-N); null: color propio.
  numero           smallint,
  color            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint obs_lineas_nombre check (char_length(btrim(nombre)) between 1 and 80),
  constraint obs_lineas_numero check (numero is null or numero between 1 and 11),
  constraint obs_lineas_color check (color is null or color ~ '^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]{1,40}\))$')
);

comment on table public.obs_lineas is
  'Observatorio (0230): líneas que agrupan los temas de un observatorio. Hoy solo daban un color (1–11); ahora llevan nombre y orden.';

create unique index if not exists obs_lineas_numero_unico
  on public.obs_lineas (observatorio_id, numero) where numero is not null;
create index if not exists obs_lineas_obs_idx on public.obs_lineas (observatorio_id, orden);

drop trigger if exists obs_lineas_set_updated_at on public.obs_lineas;
create trigger obs_lineas_set_updated_at before update on public.obs_lineas
  for each row execute function public.set_updated_at();

-- 3. Personas responsables --------------------------------------------------------

create table if not exists public.obs_responsables (
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  persona_id       uuid not null references public.profiles (id) on delete cascade,
  -- Puede PROPONER dominios para los insertados de este observatorio (0232).
  propone_dominios boolean not null default true,
  asignado_por     uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  primary key (observatorio_id, persona_id)
);

comment on table public.obs_responsables is
  'Observatorio (0230): personas responsables de un observatorio. Cuentan para el alcance «solo los que le asignen» del rol (0231).';

create index if not exists obs_responsables_persona_idx on public.obs_responsables (persona_id);

-- 4. Ampliar las tablas de 0049 ---------------------------------------------------

alter table public.obs_topics
  add column if not exists observatorio_id uuid references public.obs_observatorios (id) on delete restrict,
  add column if not exists linea_id        uuid references public.obs_lineas (id) on delete set null,
  add column if not exists codigo          text,
  add column if not exists nombre          text,
  add column if not exists resumen         text,
  add column if not exists pregunta        text,
  add column if not exists fuente          text,
  add column if not exists orden           smallint not null default 0,
  add column if not exists archivado       boolean not null default false;

alter table public.obs_topics drop constraint if exists obs_topics_codigo;
alter table public.obs_topics add constraint obs_topics_codigo check (codigo is null or codigo ~ '^[A-Za-z0-9]{1,4}$');
alter table public.obs_topics drop constraint if exists obs_topics_slug_forma;
alter table public.obs_topics add constraint obs_topics_slug_forma check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
alter table public.obs_topics drop constraint if exists obs_topics_largos;
alter table public.obs_topics add constraint obs_topics_largos check (
  char_length(coalesce(nombre, '')) <= 120 and char_length(coalesce(resumen, '')) <= 400
  and char_length(coalesce(pregunta, '')) <= 300 and char_length(coalesce(fuente, '')) <= 200
) not valid;

create index if not exists obs_topics_obs_idx on public.obs_topics (observatorio_id, orden);

alter table public.obs_datasets  add column if not exists observatorio_id uuid references public.obs_observatorios (id) on delete restrict;
alter table public.obs_views     add column if not exists observatorio_id uuid references public.obs_observatorios (id) on delete restrict;
alter table public.obs_bulletins add column if not exists observatorio_id uuid references public.obs_observatorios (id) on delete restrict;

create index if not exists obs_datasets_obs_idx  on public.obs_datasets (observatorio_id);
create index if not exists obs_views_obs_idx     on public.obs_views (observatorio_id);
create index if not exists obs_bulletins_obs_idx on public.obs_bulletins (observatorio_id);

comment on column public.obs_topics.observatorio_id is 'Observatorio al que pertenece el tema (0230). El slug sigue siendo único en todo el portal.';

-- 5. Siembra: el observatorio principal, sus once líneas y los catorce temas -----

insert into public.obs_observatorios (nombre, slug, descripcion, color, icono, responsable, estado, principal)
values (
  'Observatorio de Analítica',
  'analitica',
  'Datos de la universidad, agregados y anonimizados, para explorar por temas.',
  'var(--od-line-1)',
  'spark-chart',
  'Planeación Institucional',
  'publicado',
  true
)
on conflict (slug) do nothing;

insert into public.obs_lineas (observatorio_id, nombre, orden, numero, color)
select o.id, 'Línea ' || n, n, n, 'var(--od-line-' || n || ')'
  from public.obs_observatorios o, generate_series(1, 11) as n
 where o.slug = 'analitica'
on conflict do nothing;

-- Los catorce temas de data.ts como filas. Si el taller ya había guardado el
-- tipo de informe, la introducción, las secciones o el estado de un tema, eso
-- NO se toca: solo se completan las columnas nuevas que sigan vacías.
insert into public.obs_topics (slug, observatorio_id, linea_id, codigo, nombre, resumen, pregunta, fuente, orden)
select v.slug, o.id, l.id, v.codigo, v.nombre, v.resumen, v.pregunta, v.fuente, v.orden
  from (values
    ('presentacion-institucional', 'PI', 1, 'Presentación Institucional', 'La universidad en cifras básicas: campus, facultades, programas y comunidad.', '¿Qué es la UDES, dónde está y cuántos la conforman?', 'Planeación Institucional', 1),
    ('oferta-academica', 'OA', 2, 'Oferta Académica', 'Programas vigentes por facultad, nivel, modalidad y campus.', '¿Qué se puede estudiar en la UDES, en qué modalidad y dónde?', 'Vicerrectoría Académica', 2),
    ('alertas-tempranas', 'AT', 6, 'Alertas Tempranas', 'Estudiantes con señales de riesgo académico, financiero o psicosocial, y su atención.', '¿Cuántos estudiantes muestran señales de riesgo y cuántos reciben atención a tiempo?', 'Bienestar Universitario · Vicerrectoría Académica', 3),
    ('poblacion-estudiantil', 'PB', 3, 'Población Estudiantil', 'Matrícula por campus, nivel, jornada y periodo.', '¿Cuántos estudiantes tiene la UDES y cómo se reparten?', 'Admisiones y Registro Académico', 4),
    ('profesores', 'PR', 4, 'Profesores', 'Planta docente por formación, dedicación, escalafón y campus.', '¿Quiénes enseñan en la UDES y con qué formación y dedicación?', 'Talento Humano', 5),
    ('diversidad-equidad-inclusion', 'DE', 10, 'Diversidad, Equidad e Inclusión', 'Estudiantes de grupos de protección constitucional y su trayectoria.', '¿Cómo avanzan en la universidad los estudiantes de grupos de protección constitucional?', 'Admisiones y Registro Académico', 6),
    ('valor-agregado', 'VA', 2, 'Valor Agregado Académico', 'Cuánto avanzan los estudiantes entre Saber 11 y Saber PRO o TyT.', '¿Cuánto aporta la universidad al desempeño de sus estudiantes?', 'Aseguramiento de la Calidad', 7),
    ('vinculacion-laboral', 'VL', 8, 'Vinculación Laboral de Egresados', 'Egresados con empleo formal, sector y tiempo hasta el primer empleo.', '¿Consiguen empleo los egresados de la UDES, dónde y en cuánto tiempo?', 'Oficina de Egresados', 8),
    ('desercion-academica', 'DA', 3, 'Deserción Académica', 'Deserción por periodo y por cohorte, con sus causas principales.', '¿Cuántos estudiantes dejan sus estudios, cuándo y por qué?', 'Planeación Institucional', 9),
    ('internacionalizacion', 'IX', 1, 'Internacionalización', 'Movilidad entrante y saliente, convenios y visibilidad internacional.', '¿Con qué países se conecta la UDES y cuántas personas se mueven?', 'Dirección de Relaciones Internacionales', 10),
    ('caracterizacion-estudiante', 'CE', 11, 'Caracterización del Estudiante', 'Quiénes son los estudiantes: edad, estrato, familia, trabajo y hábitos.', '¿Cómo son los estudiantes que llegan a la UDES?', 'Bienestar Universitario', 11),
    ('calidad-institucional', 'CC', 5, 'Cifras de Calidad Institucional', 'Acreditación, registros calificados y resultados de autoevaluación.', '¿Qué dicen los procesos de calidad sobre la universidad y sus programas?', 'Aseguramiento de la Calidad', 12),
    ('factores-rendimiento', 'FR', 9, 'Factores Asociados con el Rendimiento', 'Qué se asocia, al ingresar, con un mejor promedio en el primer semestre.', '¿Qué rasgos al ingresar acompañan un mejor rendimiento académico?', 'Planeación Institucional', 13),
    ('seguimiento-graduados', 'SG', 7, 'Seguimiento de Graduados', 'Graduados por año, programa y nivel, y su trayectoria después del grado.', '¿Cuántos se gradúan y qué pasa con ellos después?', 'Secretaría General · Oficina de Egresados', 14)
  ) as v (slug, codigo, linea, nombre, resumen, pregunta, fuente, orden)
  join public.obs_observatorios o on o.slug = 'analitica'
  left join public.obs_lineas l on l.observatorio_id = o.id and l.numero = v.linea
on conflict (slug) do update
  set observatorio_id = coalesce(obs_topics.observatorio_id, excluded.observatorio_id),
      linea_id        = coalesce(obs_topics.linea_id, excluded.linea_id),
      codigo          = coalesce(obs_topics.codigo, excluded.codigo),
      nombre          = coalesce(obs_topics.nombre, excluded.nombre),
      resumen         = coalesce(obs_topics.resumen, excluded.resumen),
      pregunta        = coalesce(obs_topics.pregunta, excluded.pregunta),
      fuente          = coalesce(obs_topics.fuente, excluded.fuente),
      orden           = case when obs_topics.orden = 0 then excluded.orden else obs_topics.orden end;

-- Lo que ya existía queda en el observatorio principal (sin perder nada).
update public.obs_topics    set observatorio_id = (select id from public.obs_observatorios where principal) where observatorio_id is null;
update public.obs_datasets  set observatorio_id = coalesce((select t.observatorio_id from public.obs_topics t where t.slug = obs_datasets.topic), (select id from public.obs_observatorios where principal)) where observatorio_id is null;
update public.obs_views     set observatorio_id = coalesce((select d.observatorio_id from public.obs_datasets d where d.id = obs_views.dataset_id), (select id from public.obs_observatorios where principal)) where observatorio_id is null;
update public.obs_bulletins set observatorio_id = (select id from public.obs_observatorios where principal) where observatorio_id is null;

-- 6. Disparadores: quien escribe sin observatorio_id queda en el que corresponde ---
-- El taller actual no envía observatorio_id. Un disparador BEFORE corre antes de
-- la verificación de RLS (WITH CHECK), así que la política ya ve el observatorio.

create or replace function public.obs_observatorio_principal()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.obs_observatorios where principal limit 1;
$$;

create or replace function public.obs_asignar_observatorio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.observatorio_id is not null then
    return new;
  end if;
  if tg_table_name = 'obs_datasets' then
    select t.observatorio_id into new.observatorio_id from public.obs_topics t where t.slug = new.topic;
  elsif tg_table_name = 'obs_views' then
    select d.observatorio_id into new.observatorio_id from public.obs_datasets d where d.id = new.dataset_id;
  end if;
  if new.observatorio_id is null then
    new.observatorio_id := public.obs_observatorio_principal();
  end if;
  return new;
end;
$$;

drop trigger if exists obs_topics_asignar_obs on public.obs_topics;
create trigger obs_topics_asignar_obs before insert or update on public.obs_topics
  for each row execute function public.obs_asignar_observatorio();
drop trigger if exists obs_datasets_asignar_obs on public.obs_datasets;
create trigger obs_datasets_asignar_obs before insert or update on public.obs_datasets
  for each row execute function public.obs_asignar_observatorio();
drop trigger if exists obs_views_asignar_obs on public.obs_views;
create trigger obs_views_asignar_obs before insert or update on public.obs_views
  for each row execute function public.obs_asignar_observatorio();
drop trigger if exists obs_bulletins_asignar_obs on public.obs_bulletins;
create trigger obs_bulletins_asignar_obs before insert or update on public.obs_bulletins
  for each row execute function public.obs_asignar_observatorio();

-- 7. RLS: nace cerrada; las políticas llegan en 0231 --------------------------------

alter table public.obs_observatorios enable row level security;
alter table public.obs_lineas        enable row level security;
alter table public.obs_responsables  enable row level security;
