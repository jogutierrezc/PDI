-- =============================================================================
-- PDI · 0232 · Observatorio de Analítica: insertados, dominios y métricas
--
-- Un «insertado» es un pedazo del Observatorio (la portada, un tema, una
-- sección o un visor) que se pega en OTRA página con una línea de código
-- (public/obs.js → un marco hacia /obs-embed). Este archivo guarda lo que hay
-- que saber de cada uno; la lectura pública y las funciones de administración
-- están en 0233.
--
--   obs_insertados  qué se inserta, sus opciones (jsonb VERSIONADO y validado),
--                   estado (activo · pausado · revocado), clave opcional (solo
--                   su HASH), vencimiento y versión.
--   obs_dominios    la lista de dominios autorizados por observatorio:
--                   propuesto · aprobado · rechazado. Lo que termina en
--                   udes.edu.co se aprueba solo; lo externo lo aprueba quien
--                   administra el módulo.
--   obs_metricas    vistas por insertado, dominio y DÍA. Sin cookies, sin IP,
--                   sin identificador de persona: es un contador.
--   obs_limite      contador por insertado y minuto, solo para frenar abusos.
--
-- Decisiones de seguridad
--   · Nada se escribe directo desde la aplicación: obs_insertados,
--     obs_dominios, obs_metricas y obs_limite no tienen políticas de
--     INSERT/UPDATE/DELETE. Todo cambio pasa por las funciones de 0233, que
--     comprueban panel, nivel y alcance (0231) y validan las opciones.
--   · La clave se guarda como hash SHA-256 con sal (el código del insertado).
--     Aun así NO es un secreto: viaja en el código que se pega en la página
--     anfitriona (data-clave) y cualquiera que la lea puede usarla. Sirve para
--     que un insertado no se vea por casualidad en una página no prevista,
--     no para proteger información sensible. Por eso solo se insertan datos
--     ya publicados y agregados.
--   · El hash no se puede leer desde la aplicación: se retira del SELECT por
--     columnas (la tabla expone «con_clave», un booleano).
--   · obs_limite no tiene políticas: solo la función pública la toca.
--
-- Requiere 0230 y 0231. Idempotente.
-- =============================================================================

-- 1. Dominios -------------------------------------------------------------------------

create table if not exists public.obs_dominios (
  id               uuid primary key default gen_random_uuid(),
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  host             text not null,
  estado           text not null default 'propuesto',
  -- true: se aprobó solo por terminar en udes.edu.co.
  automatico       boolean not null default false,
  nota             text not null default '',
  propuesto_por    uuid default auth.uid(),
  propuesto_en     timestamptz not null default now(),
  decidido_por     uuid,
  decidido_en      timestamptz,
  constraint obs_dominios_unico unique (observatorio_id, host),
  constraint obs_dominios_estado check (estado in ('propuesto', 'aprobado', 'rechazado')),
  -- Un nombre de dominio, con comodín solo al comienzo (*.ejemplo.org) o localhost. Sin esquema, puerto ni ruta.
  constraint obs_dominios_host check (
    char_length(host) <= 253
    and host ~ '^(localhost|(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$'
  ),
  constraint obs_dominios_nota check (char_length(nota) <= 300)
);

comment on table public.obs_dominios is
  'Observatorio (0232): dominios autorizados a mostrar insertados de un observatorio. El gestor propone; la administración aprueba lo externo; *.udes.edu.co es automático.';

create index if not exists obs_dominios_obs_idx on public.obs_dominios (observatorio_id, estado);

-- 2. Insertados -----------------------------------------------------------------------

create table if not exists public.obs_insertados (
  id               uuid primary key default gen_random_uuid(),
  -- Lo que va en data-obs="…": corto, no adivinable por casualidad (40 bits).
  codigo           text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  nombre           text not null,
  tipo             text not null,
  tema_slug        text references public.obs_topics (slug) on delete set null,
  seccion          text,
  visor_id         uuid references public.obs_views (id) on delete set null,
  -- Versión del esquema de las opciones (hoy 1) dentro del propio jsonb: opciones.v.
  opciones         jsonb not null default '{"v":1}'::jsonb,
  -- Sube en cada cambio: sirve al registro y para invalidar copias (caché de 1 hora).
  version          integer not null default 1,
  estado           text not null default 'activo',
  clave_hash       text,
  con_clave        boolean generated always as (clave_hash is not null) stored,
  vence_en         timestamptz,
  creado_por       uuid default auth.uid(),
  revocado_por     uuid,
  revocado_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint obs_insertados_codigo unique (codigo),
  constraint obs_insertados_codigo_forma check (codigo ~ '^[a-z0-9]{6,32}$'),
  constraint obs_insertados_nombre check (char_length(btrim(nombre)) between 3 and 120),
  constraint obs_insertados_tipo check (tipo in ('portada', 'tema', 'seccion', 'visor')),
  constraint obs_insertados_seccion check (seccion is null or seccion in ('panorama', 'tendencia', 'composicion', 'territorio', 'detalle')),
  constraint obs_insertados_estado check (estado in ('activo', 'pausado', 'revocado')),
  constraint obs_insertados_opciones check (jsonb_typeof(opciones) = 'object' and (opciones ->> 'v') = '1' and pg_column_size(opciones) <= 4096),
  -- Cada tipo apunta a lo que necesita; la portada no apunta a nada.
  constraint obs_insertados_destino check (
    case tipo
      when 'portada' then tema_slug is null and seccion is null and visor_id is null
      when 'tema'    then tema_slug is not null and seccion is null and visor_id is null
      when 'seccion' then tema_slug is not null and seccion is not null and visor_id is null
      else true  -- visor: visor_id puede quedar nulo si el visor se borró (el insertado dirá «sin publicar»)
    end
  )
);

comment on table public.obs_insertados is
  'Observatorio (0232): contenido del Observatorio insertado en otras páginas. Se escribe solo por las funciones de 0233.';
comment on column public.obs_insertados.clave_hash is
  'SHA-256 con sal (el código) de la clave opcional. No es un secreto: viaja en el código pegado en la página anfitriona.';

create index if not exists obs_insertados_obs_idx on public.obs_insertados (observatorio_id, estado);
create index if not exists obs_insertados_tema_idx on public.obs_insertados (tema_slug);

drop trigger if exists obs_insertados_set_updated_at on public.obs_insertados;
create trigger obs_insertados_set_updated_at before update on public.obs_insertados
  for each row execute function public.set_updated_at();

-- 3. Métricas y límite ----------------------------------------------------------------

create table if not exists public.obs_metricas (
  insertado_id     uuid not null references public.obs_insertados (id) on delete cascade,
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  -- El host que declaró el marco (y que la lista de dominios aceptó). Nunca una IP.
  dominio          text not null,
  dia              date not null default current_date,
  vistas           integer not null default 0,
  primary key (insertado_id, dominio, dia)
);

comment on table public.obs_metricas is
  'Observatorio (0232): conteo diario de vistas por insertado y dominio. Sin cookies, sin IP, sin personas.';

create index if not exists obs_metricas_obs_dia_idx on public.obs_metricas (observatorio_id, dia);

create table if not exists public.obs_limite (
  insertado_id  uuid not null references public.obs_insertados (id) on delete cascade,
  minuto        timestamptz not null,
  n             integer not null default 0,
  primary key (insertado_id, minuto)
);

comment on table public.obs_limite is
  'Observatorio (0232): peticiones por insertado y minuto, para frenar abusos de la lectura pública. Sin políticas: solo la función pública la toca.';

-- 4. RLS -------------------------------------------------------------------------------

alter table public.obs_dominios   enable row level security;
alter table public.obs_insertados enable row level security;
alter table public.obs_metricas   enable row level security;
alter table public.obs_limite     enable row level security;

-- Solo lectura desde la aplicación, por panel «Insertar y publicar» y alcance.
drop policy if exists obs_dominios_read on public.obs_dominios;
create policy obs_dominios_read on public.obs_dominios for select to authenticated
  using (public.obs_puede('obs_insertar', observatorio_id, 'ver'));

drop policy if exists obs_insertados_read on public.obs_insertados;
create policy obs_insertados_read on public.obs_insertados for select to authenticated
  using (public.obs_puede('obs_insertar', observatorio_id, 'ver'));

drop policy if exists obs_metricas_read on public.obs_metricas;
create policy obs_metricas_read on public.obs_metricas for select to authenticated
  using (public.obs_puede('obs_insertar', observatorio_id, 'ver'));

-- Sin acceso a obs_limite para nadie fuera de las funciones definer.
revoke all on public.obs_dominios, public.obs_insertados, public.obs_metricas, public.obs_limite from anon, authenticated;
grant select on public.obs_dominios, public.obs_metricas to authenticated;
-- obs_insertados: todo menos el hash de la clave.
grant select (id, codigo, observatorio_id, nombre, tipo, tema_slug, seccion, visor_id, opciones, version, estado, con_clave,
              vence_en, creado_por, revocado_por, revocado_en, created_at, updated_at)
  on public.obs_insertados to authenticated;
