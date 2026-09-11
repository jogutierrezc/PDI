-- =============================================================================
-- PDI · 0017 · PDI por campus: lo que cada sede reportó contra el plan.
--
-- El portal sabía qué promete el plan (implementación), cómo va (tablero) y de
-- dónde vienen las iniciativas (facultades, 0016). Lo que no sabía es qué hizo
-- **cada sede** y contra qué parte del plan lo hizo.
--
-- El problema real no es de base de datos, es de reporte: los campus no
-- reportan contra los pilares. Cúcuta y Valledupar reportan por ejes y procesos
-- (investigación, educación continua, desarrollo profesoral), y el informe
-- institucional de Bucaramanga reporta por pilar pero con denominaciones
-- propias —quince variantes distintas— y sin metas programadas. Cada informe es
-- cierto y ninguno es comparable con los otros.
--
-- El libro `Indicadores_Campus_Pilares_UDES_2025.xlsx` hace esa traducción a
-- mano, una fila a la vez, y esta migración le da sitio en la base.
--
-- -----------------------------------------------------------------------------
-- 1. Primero, la estructura de verdad
--
-- La base tenía 13 áreas de ejemplo (AE-01…) con líneas LA-1.1. La estructura
-- real del PDI son **21 áreas y 62 líneas**, con códigos jerárquicos (6.1.1 y
-- 6.1.1.a). Sin ellas no hay dónde anclar lo que reportan los campus.
--
-- Se **añaden**, no se reemplazan. Borrar las viejas habría arrastrado por
-- cascada lo que ya cuelga de ellas: proyectos, indicadores y —desde la 0016—
-- las propuestas de facultad, cuya regla es que nada se publica sin línea
-- anclada. Una propuesta anclada a una línea borrada no da error: se despublica
-- en silencio, que es peor. Al final de esta sección hay una comprobación que
-- avisa de qué sigue colgando de la estructura vieja, para decidirlo mirando
-- datos y no a ciegas.
--
-- -----------------------------------------------------------------------------
-- 2. Un hecho reportado no es un indicador del plan
--
-- `activities` son los indicadores que el plan se comprometió a mover, con su
-- meta por año y su cascada de avance. Lo que reporta un campus es otra cosa:
-- es lo que esa sede dice que hizo en una vigencia, traducido a una línea de
-- acción por alguien que leyó el informe.
--
-- Meterlo en `activities` habría contaminado el avance del plan con 126 filas
-- que no son indicadores y que en un caso —Bucaramanga— ni siquiera tienen meta
-- contra la que medirse. Por eso es tabla propia.
--
-- -----------------------------------------------------------------------------
-- 3. Sin meta no es cero
--
-- Bucaramanga no declara metas programadas: reporta logros. Su cumplimiento no
-- es bajo, es **no calculable**, y son cosas distintas. `target_value` nulo, y
-- todos los promedios de estas vistas filtran por `record_kind = 'meta'`.
--
-- Un cero en esa casilla habría dicho que la sede no cumplió nada, que es
-- exactamente lo contrario de lo que dice su informe.
--
-- -----------------------------------------------------------------------------
-- 4. Lo inferido se publica, pero dicho
--
-- 31 de las 126 filas tienen `confidence = 'media'`: el informe no nombra la
-- línea y alguien la dedujo por afinidad temática. Se publican —esconderlas
-- daría una cobertura del plan más pobre que la real— pero la fila viaja con su
-- nivel de confianza para que la pantalla lo marque y se pueda filtrar.
--
-- -----------------------------------------------------------------------------
-- 5. El dinero no sale, y aquí no basta con permisos por columna
--
-- Once filas traen cifras financieras institucionales: patrimonio, activo
-- total, ingresos ordinarios, costo de ventas. Son justo las que la 0015 cerró
-- a `anon`.
--
-- La técnica de la 0015 —quitar la columna a `anon`— no sirve en esta tabla: el
-- importe vive en la misma columna que "3 cursos" y "27 semilleros", así que
-- quitarla escondería todos los valores y dejaría el módulo sin contenido. Aquí
-- el secreto depende de la fila, no de la columna.
--
-- Por eso `anon` **no recibe la tabla en absoluto**: lee solo la vista pública,
-- que anula el valor cuando la unidad es monetaria y deja el resto intacto. La
-- fila sigue publicándose con su línea, su estado y su semáforo; lo único que
-- no sale es la cifra.
--
-- Es idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Códigos únicos: la llave de toda importación
--
-- Las cargas buscan el área y la línea por su código. Sin unicidad, un código
-- repetido haría que la misma fila del Excel entrara dos veces o cayera en la
-- línea equivocada, en silencio. Parcial porque las filas antiguas pueden no
-- tener código, y varios nulos no chocan entre sí.
-- -----------------------------------------------------------------------------

create unique index if not exists strategic_areas_code_unique
  on public.strategic_areas (code) where code is not null;
create unique index if not exists action_lines_code_unique
  on public.action_lines (code) where code is not null;

-- Y las de nombre, sobre las que van los `on conflict` de la sección siguiente.
-- Vienen de la 0001, pero una base creada con una versión anterior de aquel
-- archivo puede no tenerlas, y entonces el `on conflict` falla con "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification", que
-- no dice cuál falta. Se crean si hacen falta, y se avisa si los datos ya
-- existentes impiden crearlas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'strategic_areas_name_unique'
  ) then
    begin
      alter table public.strategic_areas
        add constraint strategic_areas_name_unique unique (pillar_id, name);
    exception when unique_violation then
      raise exception
        'Hay áreas estratégicas con el mismo nombre dentro de un pilar. Únelas antes de aplicar esta migración: sin ese UNIQUE la carga no puede saber cuál actualizar.';
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'action_lines_name_unique'
  ) then
    begin
      alter table public.action_lines
        add constraint action_lines_name_unique unique (area_id, name);
    exception when unique_violation then
      raise exception
        'Hay líneas de acción con el mismo nombre dentro de un área. Únelas antes de aplicar esta migración.';
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. La estructura real del PDI: 21 áreas y 62 líneas
--
-- Generado desde las hojas 02_Dim_Area_Estrategica y 03_Dim_Linea_Accion del
-- libro de indicadores por campus, no escrito a mano. Los `on conflict` van
-- contra los UNIQUE de nombre que ya existían, así que volver a ejecutar la
-- migración actualiza el código y la posición sin duplicar nada.
-- -----------------------------------------------------------------------------

-- 21 áreas estratégicas. Generado desde 02_Dim_Area_Estrategica.
insert into public.strategic_areas (pillar_id, code, name, description, position)
select p.id, v.code, v.name, v.description, v.position
from public.pillars p
join (values
  ('personalizacion', '6.1.1', 'Apropiación de los problemas del sector productivo', 'Código de origen en el archivo de estructura: PER01.', 1),
  ('personalizacion', '6.1.2', 'Flexibilidad administrativa', 'Código de origen en el archivo de estructura: PER02.', 2),
  ('personalizacion', '6.1.3', 'Flexibilidad curricular - académica', 'Código de origen en el archivo de estructura: PER05.', 3),
  ('personalizacion', '6.1.4', 'Gestión del aprendizaje a lo largo de la vida', 'Código de origen en el archivo de estructura: PER07.', 4),
  ('ambiente-tecnologico', '6.2.1', 'Experiencia en el aula', 'Código de origen en el archivo de estructura: TEC01.', 1),
  ('ambiente-tecnologico', '6.2.2', 'Experiencia en el campus', 'Código de origen en el archivo de estructura: TEC02.', 2),
  ('ambiente-tecnologico', '6.2.3', 'Tecnología para la investigación y extensión', 'Código de origen en el archivo de estructura: TEC03.', 3),
  ('ambiente-tecnologico', '6.2.4', 'Virtualidad', 'Código de origen en el archivo de estructura: TEC04.', 4),
  ('entorno-emprendedor', '6.3.1', 'Apropiación del ecosistema emprendedor', 'Código de origen en el archivo de estructura: EMP01.', 1),
  ('entorno-emprendedor', '6.3.2', 'Investigación hacia el emprendimiento', 'Código de origen en el archivo de estructura: EMP02.', 2),
  ('entorno-emprendedor', '6.3.3', 'Generación de cultura emprendedora institucional', 'Código de origen en el archivo de estructura: EMP03.', 3),
  ('entorno-emprendedor', '6.3.4', 'Gestión de recursos', 'Código de origen en el archivo de estructura: EMP04.', 4),
  ('gobernanza', '6.4.1', 'Fortalecimiento institucional', 'Código de origen en el archivo de estructura: GOB01.', 1),
  ('sostenibilidad', '6.5.1', 'Prácticas sostenibles UDES', '', 1),
  ('sostenibilidad', '6.5.2', 'Conciencia y compromiso sostenible', '', 2),
  ('sostenibilidad', '6.5.3', 'Sostenibilidad financiera', '', 3),
  ('sostenibilidad', '6.5.4', 'Colaboración sostenible', '', 4),
  ('apropiacion-social', '6.6.1', 'Impacto de la investigación', '', 1),
  ('apropiacion-social', '6.6.2', 'Impacto de la extensión', '', 2),
  ('apropiacion-social', '6.6.3', 'Impacto de la Enseñanza', '', 3),
  ('apropiacion-social', '6.6.4', 'Mecanismos de articulación', '', 4)
) as v(slug, code, name, description, position) on v.slug = p.slug
on conflict (pillar_id, name) do update
  set code = excluded.code, position = excluded.position;

-- 62 líneas de acción. Generado desde 03_Dim_Linea_Accion.
insert into public.action_lines (area_id, code, name, position)
select a.id, v.code, v.name, v.position
from public.strategic_areas a
join (values
  ('6.1.1', '6.1.1.a', 'a. Mecanismos de escucha sector productivo', 1),
  ('6.1.2', '6.1.2.a', 'a. Modernización administrativa', 1),
  ('6.1.2', '6.1.2.b', 'b. Arquitectura institucional', 2),
  ('6.1.2', '6.1.2.c', 'c. Mecanismos de retención', 3),
  ('6.1.3', '6.1.3.a', 'a. Apropiación de Reforma curricular', 1),
  ('6.1.3', '6.1.3.b', 'b. Modernización académica', 2),
  ('6.1.4', '6.1.4.a', 'a. Desarrollo de programas técnicos y tecnológicos', 1),
  ('6.1.4', '6.1.4.b', 'b. Ciclos secuenciales y complementarios', 2),
  ('6.1.4', '6.1.4.c', 'c. Educación continua', 3),
  ('6.1.4', '6.1.4.d', 'd. Fortalecimiento centro de posgrados', 4),
  ('6.2.1', '6.2.1.a', 'a. Incorporación de tecnología en la enseñanza', 1),
  ('6.2.1', '6.2.1.b', 'b. Resultados de aprendizaje', 2),
  ('6.2.2', '6.2.2.a', 'a. Solución de Experiencia en Campus', 1),
  ('6.2.2', '6.2.2.b', 'b. Impacto de la Tecnología en el Campus', 2),
  ('6.2.3', '6.2.3.a', 'a. Apropiación de la tecnología', 1),
  ('6.2.3', '6.2.3.b', 'b. Colaboración interinstitucional', 2),
  ('6.2.4', '6.2.4.a', 'a. Desarrollo de plataformas Tecnológicas Educativas', 1),
  ('6.2.4', '6.2.4.b', 'b. Virtualización de la enseñanza', 2),
  ('6.2.4', '6.2.4.c', 'c. Virtualización administrativa', 3),
  ('6.3.1', '6.3.1.a', 'a. Generación de cultura de uso', 1),
  ('6.3.1', '6.3.1.b', 'b. Vinculación con mejores prácticas', 2),
  ('6.3.1', '6.3.1.c', 'c. Resultados de emprendimiento', 3),
  ('6.3.2', '6.3.2.a', 'a. Desarrollar soluciones para el emprendimiento', 1),
  ('6.3.2', '6.3.2.b', 'b. Generar estrategias de escucha al sector productivo', 2),
  ('6.3.2', '6.3.2.c', 'c. Incentivar la transferencia tecnológica', 3),
  ('6.3.3', '6.3.3.a', 'a. Generación de Capacidades', 1),
  ('6.3.3', '6.3.3.b', 'b. Centro de Emprendimiento', 2),
  ('6.3.3', '6.3.3.c', 'c. Programa Emprendedor', 3),
  ('6.3.4', '6.3.4.a', 'a. Fomento de la inversión en emprendimiento', 1),
  ('6.3.4', '6.3.4.b', 'b. Creación de fondos de capital semilla', 2),
  ('6.3.4', '6.3.4.c', 'c. Desarrollo de programas de apoyo financiero', 3),
  ('6.3.4', '6.3.4.d', 'd. Promoción de la innovación abierta', 4),
  ('6.4.1', '6.4.1.a', 'a. Apropiación de cultura de transparencia (rendición de cuentas)', 1),
  ('6.4.1', '6.4.1.b', 'b. Apropiación de marco normativo (políticas, reglamentos, resoluciones, etc.)', 2),
  ('6.4.1', '6.4.1.c', 'c. Fortalecimiento de la participación y representatividad en los órganos de gobierno', 3),
  ('6.4.1', '6.4.1.d', 'd. Fortalecimiento de comunicación efectiva y participativa', 4),
  ('6.5.1', '6.5.1.a', 'a. Recursos naturales y cambio climático', 1),
  ('6.5.1', '6.5.1.b', 'b. Gestión de residuos', 2),
  ('6.5.2', '6.5.2.a', 'a. Sostenibilidad en la academia', 1),
  ('6.5.2', '6.5.2.b', 'b. Cultura sostenible', 2),
  ('6.5.2', '6.5.2.c', 'c. Integración de investigación', 3),
  ('6.5.3', '6.5.3.a', 'a. Diversificación de fuentes de ingresos', 1),
  ('6.5.3', '6.5.3.b', 'b. Optimización de recursos existentes', 2),
  ('6.5.3', '6.5.3.c', 'c. Fomento de la captación de recursos externos', 3),
  ('6.5.3', '6.5.3.d', 'd. Implementación de políticas de ahorro y gestión financiera responsable', 4),
  ('6.5.4', '6.5.4.a', 'a. Convenios enfocados en sostenibilidad', 1),
  ('6.5.4', '6.5.4.b', 'b. Redes de investigación sostenibles', 2),
  ('6.5.4', '6.5.4.c', 'c. Colaboración de la comunidad para proyectos', 3),
  ('6.6.1', '6.6.1.a', 'a. Desarrollo de capacidades investigativas', 1),
  ('6.6.1', '6.6.1.b', 'b. Gestión de la investigación', 2),
  ('6.6.1', '6.6.1.c', 'c. Participación en redes de investigación', 3),
  ('6.6.1', '6.6.1.d', 'd. Evaluación del impacto', 4),
  ('6.6.2', '6.6.2.a', 'a. Gestión de la extensión universitaria', 1),
  ('6.6.2', '6.6.2.b', 'b. Integración con la comunidad', 2),
  ('6.6.2', '6.6.2.c', 'c. Desarrollo de proyectos de impacto social', 3),
  ('6.6.3', '6.6.3.a', 'a. Desarrollar sistema de seguimiento y monitoreo de la enseñanza', 1),
  ('6.6.3', '6.6.3.b', 'b. Implementar mecanismos de retroalimentación con la comunidad (sociedad, empresa, comunidades, entre otros)', 2),
  ('6.6.3', '6.6.3.c', 'c. Fortalecer el seguimiento a graduados', 3),
  ('6.6.4', '6.6.4.a', 'a. Fortalecimiento de alianzas estratégicas', 1),
  ('6.6.4', '6.6.4.b', 'b. Vinculación con el sector productivo', 2),
  ('6.6.4', '6.6.4.c', 'c. Promoción del desarrollo regional', 3),
  ('6.6.4', '6.6.4.d', 'd. Integración con la comunidad', 4)
) as v(area_code, code, name, position) on v.area_code = a.code
on conflict (area_id, name) do update
  set code = excluded.code, position = excluded.position;

-- --- Qué queda colgando de la estructura vieja -------------------------------
--
-- Un aviso al aplicar, no un borrado. Si esto no dice nada, las áreas AE-* ya
-- no sostienen nada y se pueden retirar con seguridad en una migración aparte.

do $$
declare
  proyectos integer;
  indicadores integer;
  propuestas integer;
  vinculos integer;
begin
  -- Un proyecto no guarda su área: cuelga de una línea de acción, y el área es
  -- la de esa línea. `projects` solo tiene `pillar_id` y `action_line_id`.
  select count(*) into proyectos
  from public.projects p
  join public.action_lines l on l.id = p.action_line_id
  join public.strategic_areas a on a.id = l.area_id
  where a.code like 'AE-%';

  select count(*) into indicadores
  from public.activities ac
  join public.action_lines l on l.id = ac.action_line_id
  join public.strategic_areas a on a.id = l.area_id
  where a.code like 'AE-%';

  -- El módulo de facultades guarda sus acciones en `faculty_actions` desde que
  -- la 0016 se alineó con la forma que sirve la aplicación de origen. El área
  -- sigue siendo un refinamiento opcional del anclaje, así que la cuenta es la
  -- misma pregunta sobre la tabla nueva.
  select count(*) into propuestas
  from public.faculty_actions fa
  join public.strategic_areas a on a.id = fa.area_id
  where a.code like 'AE-%';

  select count(*) into vinculos
  from public.project_links pl
  join public.strategic_areas a on a.id = pl.area_id
  where a.code like 'AE-%';

  if proyectos + indicadores + propuestas + vinculos > 0 then
    raise warning
      'La estructura antigua (AE-*) todavía sostiene datos: % proyectos, % indicadores, % acciones de facultad y % vínculos. No la borres sin remapearlos primero: las acciones de facultad ancladas a mano perderían su anclaje y volverían al pilar que declararon.',
      proyectos, indicadores, propuestas, vinculos;
  else
    raise notice
      'La estructura antigua (AE-*) no sostiene ningún dato. Se puede retirar en una migración aparte.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Cómo reporta cada campus
--
-- Esta tabla no es una lista de sedes: es la explicación de por qué los campus
-- no son comparables entre sí. `declares_targets` es el campo que gobierna todo
-- el módulo — de él depende que el cumplimiento de una sede sea calculable.
-- -----------------------------------------------------------------------------

create table if not exists public.campuses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  code        text not null,
  name        text not null,
  -- Cómo se llama el documento del que sale el reporte y cómo está organizado.
  -- Es lo que hay que leer antes de comparar dos sedes.
  report_kind text not null default '',
  report_structure text not null default '',
  -- Falso en Bucaramanga: su informe reporta logros sin meta programada, y por
  -- eso su cumplimiento no es calculable. No es un detalle de captura, es la
  -- razón de que su columna aparezca vacía en todo el módulo.
  declares_targets boolean not null default true,
  owner       text not null default '',
  description text not null default '',
  status      public.publication_status not null default 'borrador',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint campuses_slug_unique unique (slug),
  constraint campuses_code_unique unique (code),
  constraint campuses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.campuses is
  'Las sedes de la Universidad y, sobre todo, cómo reporta cada una: es lo que explica que no sean comparables sin advertencia.';
comment on column public.campuses.declares_targets is
  'Falso si el informe de la sede no trae metas programadas. Cuando es falso, el cumplimiento no es calculable y no debe mostrarse como cero.';

drop trigger if exists campuses_set_updated_at on public.campuses;
create trigger campuses_set_updated_at
  before update on public.campuses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Cada carga de Excel deja rastro
--
-- Sin esto, "de dónde salió esta cifra" solo se puede responder abriendo el
-- archivo que alguien subió hace cuatro meses. El lote guarda el archivo, la
-- vigencia y quién lo subió, y las filas cuelgan de él: volver a cargar el
-- mismo campus y año reemplaza su lote entero y no deja mitades mezcladas.
-- -----------------------------------------------------------------------------

create table if not exists public.campus_report_batches (
  id          uuid primary key default gen_random_uuid(),
  campus_id   uuid not null references public.campuses (id) on delete cascade,
  year        smallint not null,
  file_name   text not null default '',
  -- El documento del que se extrajo el informe original (el PDF de la sede),
  -- no el Excel: es la fuente que alguien puede ir a verificar.
  source_document text not null default '',
  note        text not null default '',
  fact_count       integer not null default 0,
  indicator_count  integer not null default 0,
  status      public.publication_status not null default 'borrador',
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id) on delete set null,

  constraint campus_report_batches_unique unique (campus_id, year),
  constraint campus_report_batches_year_range check (year between 2000 and 2100)
);

comment on table public.campus_report_batches is
  'Una fila por archivo cargado: campus y vigencia. Publicar o despublicar el lote publica o esconde todas sus filas a la vez.';

-- -----------------------------------------------------------------------------
-- 5. Los hechos: acciones, metas y logros
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'campus_record_kind') then
    create type public.campus_record_kind as enum ('meta', 'logro');
  end if;
  if not exists (select 1 from pg_type where typname = 'campus_state') then
    create type public.campus_state as enum
      ('superada', 'cumplida', 'parcial', 'no_cumplida', 'sin_meta');
  end if;
  if not exists (select 1 from pg_type where typname = 'mapping_confidence') then
    create type public.mapping_confidence as enum ('alta', 'media', 'baja');
  end if;
end $$;

comment on type public.campus_record_kind is
  'Meta con valor programado, o logro sin meta. Solo las metas entran en los promedios de cumplimiento.';
comment on type public.mapping_confidence is
  'Certeza de la conexión entre lo que dice el informe y la línea del plan. Media y baja son asignaciones inferidas y se marcan en pantalla.';

create table if not exists public.campus_facts (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.campus_report_batches (id) on delete cascade,
  campus_id   uuid not null references public.campuses (id) on delete cascade,
  year        smallint not null,

  -- --- Anclaje al plan -------------------------------------------------------
  -- La línea manda; área y pilar los rellena el disparador. Igual que en la
  -- 0016, para que no exista una fila anclada a 6.1.1.a que diga ser del pilar
  -- de Sostenibilidad.
  pillar_id      uuid references public.pillars (id) on delete set null,
  area_id        uuid references public.strategic_areas (id) on delete set null,
  -- `restrict` y no `set null`: la fila exige linea (ver el CHECK de abajo), asi
  -- que un SET NULL en cascada violaria ese CHECK y el borrado fallaria con un
  -- error incomprensible. Asi falla donde se entiende: no se borra una linea que
  -- sostiene lo que reporto una sede.
  action_line_id uuid not null references public.action_lines (id) on delete restrict,

  -- --- Lo que dice el informe, sin traducir ----------------------------------
  -- Se conserva para poder auditar el anclaje contra el documento original.
  source_code       text,
  reported_pillar   text not null default '',
  reported_axis     text not null default '',
  reported_function text not null default '',
  reported_state    text not null default '',

  -- --- Lo que se publica -----------------------------------------------------
  objective   text not null default '',
  action      text not null,
  unit        text not null default '',
  target_value numeric(16, 2),
  actual_value numeric(16, 2),
  compliance  numeric(7, 2),
  record_kind public.campus_record_kind not null default 'meta',
  state       public.campus_state not null default 'sin_meta',
  confidence  public.mapping_confidence not null default 'alta',
  note        text not null default '',
  evidence    text not null default '',
  source_document text not null default '',
  source_page smallint,
  position    integer not null default 0,

  -- Verdadero cuando la unidad es monetaria. Calculado y no escrito a mano
  -- porque de él depende que una cifra financiera no salga a lo público: si
  -- dependiera de que quien importa se acuerde de marcarlo, algún día no se
  -- acordaría.
  is_monetary boolean generated always as (unit like 'Moneda%') stored,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un logro no tiene meta contra la que medirse: si la tuviera, sería meta.
  constraint campus_facts_logro_sin_meta
    check (record_kind <> 'logro' or target_value is null),
  -- Y un logro nunca puede llevar un estado de cumplimiento.
  constraint campus_facts_logro_sin_estado
    check (record_kind <> 'logro' or state = 'sin_meta'),

  -- Aquí iba un CHECK que exigía que los valores no fueran negativos. Se
  -- retiró: lo que reporta una sede puede serlo con toda legitimidad —una
  -- reducción de deserción, una variación a la baja, un resultado financiero
  -- en rojo— y un solo valor negativo tumbaba la carga del informe entero.
  --
  -- Un valor reportado no tiene suelo natural, así que no hay nada sensato que
  -- comprobar aquí. La propia migración ya lo daba por hecho en otro sitio: la
  -- variación del indicador se calcula con `abs(base_value)` justamente para
  -- soportar bases negativas.
  constraint campus_facts_year_range check (year between 2000 and 2100)
);

-- En una base donde esta migración ya se aplicó, el CREATE TABLE de arriba se
-- salta y la restricción retirada seguiría ahí. Se quita a mano para que volver
-- a aplicar el archivo deje el esquema como dice el archivo.
alter table public.campus_facts drop constraint if exists campus_facts_values_positive;

comment on table public.campus_facts is
  'Lo que cada sede reportó en una vigencia, traducido a una línea de acción del PDI. Nunca la lee anon directamente: solo a través de v_campus_facts.';
comment on column public.campus_facts.is_monetary is
  'Calculado desde la unidad. La vista pública anula el valor cuando es cierto: las cifras financieras de la universidad no se publican.';
comment on column public.campus_facts.action_line_id is
  'La regla del módulo: sin línea de acción la fila no dice nada sobre el plan, así que es obligatoria. Mismo criterio que las propuestas de facultad en la 0016.';

create index if not exists campus_facts_batch_idx   on public.campus_facts (batch_id);
create index if not exists campus_facts_campus_idx  on public.campus_facts (campus_id, year);
create index if not exists campus_facts_pillar_idx  on public.campus_facts (pillar_id);
create index if not exists campus_facts_line_idx    on public.campus_facts (action_line_id);

drop trigger if exists campus_facts_set_updated_at on public.campus_facts;
create trigger campus_facts_set_updated_at
  before update on public.campus_facts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Los indicadores con serie 2024-2025
--
-- Tabla aparte y no una columna más en los hechos: un indicador comparativo no
-- tiene meta ni estado, tiene dos valores y una tendencia. Meterlo en la misma
-- tabla habría dejado la mitad de las columnas vacías en las dos direcciones.
-- -----------------------------------------------------------------------------

create table if not exists public.campus_indicators (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.campus_report_batches (id) on delete cascade,
  campus_id   uuid not null references public.campuses (id) on delete cascade,

  pillar_id      uuid references public.pillars (id) on delete set null,
  area_id        uuid references public.strategic_areas (id) on delete set null,
  action_line_id uuid not null references public.action_lines (id) on delete restrict,

  source_code text,
  name        text not null,
  unit        text not null default '',
  base_year   smallint not null,
  base_value  numeric(16, 2),
  last_year   smallint not null,
  last_value  numeric(16, 2),
  -- La variación se recalcula al importar porque varias de las reportadas en
  -- los informes no coinciden con los valores de su propia tabla. Nula cuando
  -- el valor base es cero: un porcentaje sobre cero no es cero, es una pregunta
  -- sin respuesta.
  variation   numeric(9, 2),
  reported_variation text not null default '',
  evidence    text not null default '',
  source_document text not null default '',
  confidence  public.mapping_confidence not null default 'alta',
  note        text not null default '',
  position    integer not null default 0,

  is_monetary boolean generated always as (unit like 'Moneda%') stored,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint campus_indicators_years_order check (last_year >= base_year)
);

comment on table public.campus_indicators is
  'Indicadores que la sede reporta con línea base y valor del año. La variación es la recalculada, no la que trae el informe.';

create index if not exists campus_indicators_batch_idx  on public.campus_indicators (batch_id);
create index if not exists campus_indicators_campus_idx on public.campus_indicators (campus_id);
create index if not exists campus_indicators_pillar_idx on public.campus_indicators (pillar_id);

drop trigger if exists campus_indicators_set_updated_at on public.campus_indicators;
create trigger campus_indicators_set_updated_at
  before update on public.campus_indicators
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Lo que la fila se rellena sola
--
-- El mismo criterio de la 0016: quien elige la línea no repite el área ni el
-- pilar, y no pueden quedar en desacuerdo. Aquí además el estado se deduce del
-- cumplimiento con la regla del diccionario del libro, para que los tres campus
-- se midan con la misma vara aunque sus informes usen etiquetas distintas
-- ("Cumplida", "LOGRADO", "Falta", "Meta Superada").
-- -----------------------------------------------------------------------------

create or replace function public.campus_fact_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action_line_id is not null then
    select l.area_id, a.pillar_id
      into new.area_id, new.pillar_id
    from public.action_lines l
    join public.strategic_areas a on a.id = l.area_id
    where l.id = new.action_line_id;
  end if;

  -- El campus y el año salen del lote: una fila no puede decir que es de otra
  -- sede que el archivo del que vino.
  select b.campus_id, b.year into new.campus_id, new.year
  from public.campus_report_batches b
  where b.id = new.batch_id;

  -- Sin valor programado es un logro, no una meta incumplida.
  --
  -- El cero cuenta como "sin programar", y por eso hay que **borrarlo** además
  -- de reclasificar la fila. Si se dejara puesto, esta regla y la restricción
  -- `campus_facts_logro_sin_meta` —que exige que un logro no tenga meta— se
  -- contradirían, y cargar un archivo con una sola meta en cero tumbaría el
  -- lote entero con un error que no menciona el cero por ninguna parte.
  if new.target_value is null or new.target_value = 0 then
    new.record_kind  := 'logro';
    new.target_value := null;
    new.compliance   := null;
    new.state        := 'sin_meta';
  else
    new.record_kind := 'meta';
    if new.actual_value is not null then
      new.compliance := round(new.actual_value * 100 / new.target_value, 2);
      -- Regla del diccionario (hoja 12), en un solo sitio.
      new.state := case
        when new.compliance > 105 then 'superada'::public.campus_state
        when new.compliance >= 95 then 'cumplida'::public.campus_state
        when new.compliance >= 50 then 'parcial'::public.campus_state
        else 'no_cumplida'::public.campus_state
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists campus_facts_fill on public.campus_facts;
create trigger campus_facts_fill
  before insert or update on public.campus_facts
  for each row execute function public.campus_fact_fill();

create or replace function public.campus_indicator_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action_line_id is not null then
    select l.area_id, a.pillar_id
      into new.area_id, new.pillar_id
    from public.action_lines l
    join public.strategic_areas a on a.id = l.area_id
    where l.id = new.action_line_id;
  end if;

  select b.campus_id into new.campus_id
  from public.campus_report_batches b
  where b.id = new.batch_id;

  if new.base_value is null or new.base_value = 0 or new.last_value is null then
    new.variation := null;
  else
    new.variation := round((new.last_value - new.base_value) * 100 / abs(new.base_value), 2);
  end if;

  return new;
end;
$$;

drop trigger if exists campus_indicators_fill on public.campus_indicators;
create trigger campus_indicators_fill
  before insert or update on public.campus_indicators
  for each row execute function public.campus_indicator_fill();

-- -----------------------------------------------------------------------------
-- 8. Seguridad
--
-- Público: solo lotes publicados de campus publicados, y solo por la vista.
-- Intranet: cualquier perfil activo lee todo.
-- Edición: planeación y administración.
-- -----------------------------------------------------------------------------

alter table public.campuses              enable row level security;
alter table public.campus_report_batches enable row level security;
alter table public.campus_facts          enable row level security;
alter table public.campus_indicators     enable row level security;

drop policy if exists campuses_read_public on public.campuses;
create policy campuses_read_public on public.campuses
  for select to anon using (status = 'publicado');

drop policy if exists campuses_read_intranet on public.campuses;
create policy campuses_read_intranet on public.campuses
  for select to authenticated
  using (public.has_role_at_least('consulta') or status = 'publicado');

drop policy if exists campuses_write on public.campuses;
create policy campuses_write on public.campuses
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists campus_batches_read on public.campus_report_batches;
create policy campus_batches_read on public.campus_report_batches
  for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists campus_batches_write on public.campus_report_batches;
create policy campus_batches_write on public.campus_report_batches
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists campus_facts_read on public.campus_facts;
create policy campus_facts_read on public.campus_facts
  for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists campus_facts_write on public.campus_facts;
create policy campus_facts_write on public.campus_facts
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists campus_indicators_read on public.campus_indicators;
create policy campus_indicators_read on public.campus_indicators
  for select to authenticated
  using (public.has_role_at_least('consulta'));

drop policy if exists campus_indicators_write on public.campus_indicators;
create policy campus_indicators_write on public.campus_indicators
  for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- --- `anon` no toca estas tablas ---------------------------------------------
--
-- Ni siquiera columna a columna, que es lo que hicieron la 0015 y la 0016. Aquí
-- el secreto depende de la fila —el importe convive en la misma columna que un
-- conteo de cursos— y un permiso de columna no distingue filas. `anon` lee solo
-- la vista, que es la que enmascara.

grant select on public.campuses to anon, authenticated;
grant insert, update, delete on public.campuses to authenticated;

revoke all on public.campus_report_batches from anon;
revoke all on public.campus_facts          from anon;
revoke all on public.campus_indicators     from anon;

grant select, insert, update, delete on public.campus_report_batches to authenticated;
grant select, insert, update, delete on public.campus_facts          to authenticated;
grant select, insert, update, delete on public.campus_indicators     to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Las vistas
-- -----------------------------------------------------------------------------

-- --- Hechos publicados, con el dinero fuera ----------------------------------
--
-- `security_invoker` está a propósito **apagado** en esta vista, al revés que en
-- el resto del portal: es la única forma de que `anon` lea filas de una tabla
-- que no puede tocar. La vista es entonces la frontera, y por eso lleva dentro
-- todos los filtros que la política llevaría —lote publicado y campus
-- publicado— y enmascara el importe antes de devolverlo.

drop view if exists public.v_campus_facts cascade;

create view public.v_campus_facts as
select
  f.id,
  f.campus_id,
  f.year,
  f.pillar_id,
  f.area_id,
  f.action_line_id,
  f.objective,
  f.action,
  f.unit,
  -- Las cifras financieras de la universidad no se publican. La fila sí: su
  -- línea, su estado y su semáforo siguen contando para la cobertura del plan.
  case when f.is_monetary then null else f.target_value end as target_value,
  case when f.is_monetary then null else f.actual_value end as actual_value,
  f.compliance,
  f.is_monetary,
  f.record_kind,
  f.state,
  f.confidence,
  f.note,
  f.evidence,
  f.source_document,
  f.source_page,
  f.reported_pillar,
  f.position,
  c.slug         as campus_slug,
  c.code         as campus_code,
  c.name         as campus_name,
  pl.slug        as pillar_slug,
  pl.numeral     as pillar_numeral,
  pl.name        as pillar_name,
  pl.accent_slot as pillar_accent,
  a.code         as area_code,
  a.name         as area_name,
  l.code         as line_code,
  l.name         as line_name
from public.campus_facts f
join public.campus_report_batches b on b.id = f.batch_id
join public.campuses c              on c.id = f.campus_id
left join public.pillars pl         on pl.id = f.pillar_id
left join public.strategic_areas a  on a.id  = f.area_id
left join public.action_lines l     on l.id  = f.action_line_id
where b.status = 'publicado' and c.status = 'publicado';

comment on view public.v_campus_facts is
  'Lo que cada sede reportó, publicado y sin cifras financieras. Es la única puerta de anon a campus_facts.';

-- La misma con todo, y solo para sesiones con rol. El filtro va dentro porque
-- `authenticated` alcanza también a una sesión sin perfil.
drop view if exists public.v_campus_facts_admin cascade;

create view public.v_campus_facts_admin
with (security_invoker = on) as
select
  f.*,
  c.slug as campus_slug, c.name as campus_name,
  b.status as batch_status, b.file_name,
  pl.slug as pillar_slug, pl.numeral as pillar_numeral, pl.name as pillar_name,
  pl.accent_slot as pillar_accent,
  a.code as area_code, a.name as area_name,
  l.code as line_code, l.name as line_name
from public.campus_facts f
join public.campus_report_batches b on b.id = f.batch_id
join public.campuses c              on c.id = f.campus_id
left join public.pillars pl         on pl.id = f.pillar_id
left join public.strategic_areas a  on a.id  = f.area_id
left join public.action_lines l     on l.id  = f.action_line_id
where public.has_role_at_least('consulta');

comment on view public.v_campus_facts_admin is
  'Todos los hechos, publicados o no y con las cifras financieras. Nunca se concede a anon.';

-- --- Indicadores comparativos publicados -------------------------------------

drop view if exists public.v_campus_indicators cascade;

create view public.v_campus_indicators as
select
  i.id,
  i.campus_id,
  i.pillar_id,
  i.area_id,
  i.action_line_id,
  i.name,
  i.unit,
  i.base_year,
  case when i.is_monetary then null else i.base_value end as base_value,
  i.last_year,
  case when i.is_monetary then null else i.last_value end as last_value,
  -- La variación sí se publica aunque el valor sea monetario: un porcentaje no
  -- revela la cifra, y es lo que hace legible la serie.
  i.variation,
  i.is_monetary,
  i.evidence,
  i.source_document,
  i.confidence,
  i.position,
  c.slug as campus_slug, c.name as campus_name,
  pl.slug as pillar_slug, pl.numeral as pillar_numeral, pl.name as pillar_name,
  pl.accent_slot as pillar_accent,
  l.code as line_code, l.name as line_name
from public.campus_indicators i
join public.campus_report_batches b on b.id = i.batch_id
join public.campuses c              on c.id = i.campus_id
left join public.pillars pl         on pl.id = i.pillar_id
left join public.action_lines l     on l.id  = i.action_line_id
where b.status = 'publicado' and c.status = 'publicado';

comment on view public.v_campus_indicators is
  'Series 2024-2025 publicadas. El valor monetario se retira; la variación porcentual se conserva porque no revela la cifra.';

-- --- Campus × pilar (equivale a la hoja 08) ----------------------------------
--
-- Producto cruzado con los pilares, como la matriz de facultades: un pilar que
-- una sede no reportó es justamente lo que hay que poder ver.
--
-- `compliance_avg` trunca cada meta a 100 antes de promediar. Sin truncar, una
-- meta al 230% taparía dos incumplidas y el promedio diría que todo va bien.
-- Es nulo —no cero— cuando la sede no declara metas.

drop view if exists public.v_campus_pillar cascade;

create view public.v_campus_pillar as
select
  c.id           as campus_id,
  c.slug         as campus_slug,
  c.name         as campus_name,
  c.declares_targets,
  pl.id          as pillar_id,
  pl.slug        as pillar_slug,
  pl.numeral     as pillar_numeral,
  pl.name        as pillar_name,
  pl.accent_slot as pillar_accent,
  pl.position    as pillar_position,
  b.year,
  count(f.id)::integer                                              as records,
  count(f.id) filter (where f.record_kind = 'meta')::integer         as targets,
  count(f.id) filter (where f.record_kind = 'logro')::integer        as achievements,
  count(f.id) filter (where f.state = 'superada')::integer           as exceeded,
  count(f.id) filter (where f.state = 'cumplida')::integer           as met,
  count(f.id) filter (where f.state = 'parcial')::integer            as partial,
  count(f.id) filter (where f.state = 'no_cumplida')::integer        as unmet,
  round(avg(least(f.compliance, 100)) filter (where f.record_kind = 'meta'), 2) as compliance_avg,
  count(distinct f.action_line_id)::integer                          as lines_covered,
  (select count(*) from public.action_lines l2
   join public.strategic_areas a2 on a2.id = l2.area_id
   where a2.pillar_id = pl.id)::integer                              as lines_total
from public.campuses c
cross join public.pillars pl
left join public.campus_report_batches b
  on b.campus_id = c.id and b.status = 'publicado'
left join public.campus_facts f
  on f.batch_id = b.id and f.pillar_id = pl.id
where c.status = 'publicado' and pl.status = 'publicado'
group by c.id, pl.id, b.year;

comment on view public.v_campus_pillar is
  'Cumplimiento y cobertura de cada sede en cada pilar. compliance_avg trunca cada meta a 100 y es nulo cuando la sede no declara metas.';

-- --- Resumen por campus (equivale a la hoja 09) ------------------------------

drop view if exists public.v_campus_summary cascade;

create view public.v_campus_summary as
select
  c.id      as campus_id,
  c.slug    as campus_slug,
  c.code    as campus_code,
  c.name    as campus_name,
  c.report_kind,
  c.report_structure,
  c.declares_targets,
  c.owner,
  c.position,
  b.year,
  b.source_document,
  count(f.id)::integer                                       as records,
  count(f.id) filter (where f.record_kind = 'meta')::integer  as targets,
  count(f.id) filter (where f.record_kind = 'logro')::integer as achievements,
  count(f.id) filter (where f.state = 'superada')::integer    as exceeded,
  count(f.id) filter (where f.state = 'cumplida')::integer    as met,
  count(f.id) filter (where f.state = 'parcial')::integer     as partial,
  count(f.id) filter (where f.state = 'no_cumplida')::integer as unmet,
  count(f.id) filter (where f.confidence <> 'alta')::integer  as inferred,
  round(avg(least(f.compliance, 100)) filter (where f.record_kind = 'meta'), 2) as compliance_avg,
  count(distinct f.pillar_id)::integer                       as pillars_covered,
  count(distinct f.action_line_id)::integer                  as lines_covered,
  (select count(*) from public.action_lines)::integer        as lines_total,
  (select count(*) from public.campus_indicators i
   where i.batch_id = b.id)::integer                         as indicators
from public.campuses c
left join public.campus_report_batches b
  on b.campus_id = c.id and b.status = 'publicado'
left join public.campus_facts f on f.batch_id = b.id
where c.status = 'publicado'
group by c.id, b.id;

comment on view public.v_campus_summary is
  'Una fila por sede y vigencia publicada, con lo que reportó y cuánto del plan cubre.';

-- --- Cobertura de la estructura (equivale a la hoja 11) ----------------------
--
-- Las 62 líneas siempre, reporte o no. Las que ninguna sede tocó son el dato
-- más útil de la página: dicen qué parte del plan no está siendo reportada.

drop view if exists public.v_campus_line_coverage cascade;

create view public.v_campus_line_coverage as
select
  pl.id          as pillar_id,
  pl.slug        as pillar_slug,
  pl.numeral     as pillar_numeral,
  pl.name        as pillar_name,
  pl.accent_slot as pillar_accent,
  pl.position    as pillar_position,
  a.id           as area_id,
  a.code         as area_code,
  a.name         as area_name,
  a.position     as area_position,
  l.id           as line_id,
  l.code         as line_code,
  l.name         as line_name,
  l.position     as line_position,
  coalesce(t.records, 0)             as records,
  coalesce(t.campuses_reporting, 0)  as campuses_reporting,
  coalesce(t.by_campus, '{}'::jsonb) as by_campus
from public.action_lines l
join public.strategic_areas a on a.id = l.area_id
join public.pillars pl        on pl.id = a.pillar_id
-- Un lateral que ya viene agregado por linea. La version anterior agrupaba la
-- vista entera y armaba `by_campus` con jsonb_object_agg sobre filas repetidas:
-- funcionaba por accidente —las claves duplicadas se pisan— y se habria roto en
-- cuanto una sede reportase dos veces la misma linea.
left join lateral (
  select
    count(*)::integer                     as records,
    count(distinct g.campus_id)::integer  as campuses_reporting,
    jsonb_object_agg(g.slug, g.n)         as by_campus
  from (
    select c2.slug, f2.campus_id, count(*) as n
    from public.campus_facts f2
    join public.campus_report_batches b2
      on b2.id = f2.batch_id and b2.status = 'publicado'
    join public.campuses c2
      on c2.id = f2.campus_id and c2.status = 'publicado'
    where f2.action_line_id = l.id
    group by c2.slug, f2.campus_id
  ) g
) t on true
where pl.status = 'publicado';

comment on view public.v_campus_line_coverage is
  'Las 62 líneas del plan con cuántos registros aporta cada sede. Las líneas en cero son las que nadie está reportando.';

grant select on public.v_campus_facts          to anon, authenticated;
grant select on public.v_campus_indicators     to anon, authenticated;
grant select on public.v_campus_pillar         to anon, authenticated;
grant select on public.v_campus_summary        to anon, authenticated;
grant select on public.v_campus_line_coverage  to anon, authenticated;

revoke all on public.v_campus_facts_admin from anon;
grant select on public.v_campus_facts_admin to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Las sedes
--
-- Los datos de cómo reporta cada una salen de la hoja 04_Dim_Campus del libro.
-- -----------------------------------------------------------------------------

-- Si la tabla venía de una corrida anterior que no llegó a terminar, puede
-- existir sin sus restricciones y el `on conflict` de abajo no encontraría a qué
-- agarrarse.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campuses_slug_unique') then
    alter table public.campuses add constraint campuses_slug_unique unique (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campuses_code_unique') then
    alter table public.campuses add constraint campuses_code_unique unique (code);
  end if;
end $$;

insert into public.campuses
  (slug, code, name, report_kind, report_structure, declares_targets, owner, status, position)
values
  ('bucaramanga', 'BUC', 'Bucaramanga',
   'Informe de Gestión Institucional (Rectoría General)',
   'Por función sustantiva y dentro de cada una por pilar',
   false, 'Rectoría General', 'publicado', 1),
  ('cucuta', 'CUC', 'Cúcuta',
   'Informe de gestión de campus',
   'Por objetivos y metas anuales, con matriz de resultados 2024-2025',
   true, 'Rectoría Campus Cúcuta', 'publicado', 2),
  ('valledupar', 'VAL', 'Valledupar',
   'Informe de gestión de campus',
   'Por objetivos y metas anuales, con matriz de resultados 2024-2025',
   true, 'Rectoría Campus Valledupar', 'publicado', 3)
on conflict (slug) do update
  set code = excluded.code,
      report_kind = excluded.report_kind,
      report_structure = excluded.report_structure,
      declares_targets = excluded.declares_targets,
      owner = excluded.owner,
      position = excluded.position;

-- --- Comprobación ------------------------------------------------------------
--
-- Mejor un aviso al aplicar que una cifra financiera publicada sin que nadie se
-- dé cuenta. Si alguien vuelve a ejecutar la 0007 después de esta, `anon`
-- recuperaría la tabla entera y con ella los importes.

do $$
begin
  if has_table_privilege('anon', 'public.campus_facts', 'SELECT') then
    raise warning
      'anon puede leer public.campus_facts directamente: las cifras financieras quedarían publicadas. Revisa si se volvió a aplicar la migración 0007 después de esta.';
  end if;
  if has_table_privilege('anon', 'public.campus_indicators', 'SELECT') then
    raise warning
      'anon puede leer public.campus_indicators directamente. Mismo motivo.';
  end if;
end $$;

notify pgrst, 'reload schema';
