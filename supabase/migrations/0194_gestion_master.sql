-- =============================================================================
-- PDI · 0194 · Gestión Master (carpeta «Gestión Master» › «Gestión de Actividades»)
--
-- Qué es. Las solicitudes de actividades del Master (nuevas, para mejorar o
-- mantener, y para eliminar) con su flujo de aprobación, que Rua llevaba en su
-- segmento de Actividades. Rua se apaga: aquí se recrea, y se puede consultar
-- su histórico (gm_rua_solicitudes).
--
-- Quién solicita y quién aprueba. Solicita el directivo o el vicerrector (el
-- nivel «solicitante»). El flujo por defecto es: Vicerrectoría Administrativa y
-- Financiera aprueba primero, después Planeación revisa, aprueba y aplica el
-- cambio A MANO en el Master. El portal solo LEE del Master (por el Warehouse):
-- nunca escribe allí. El flujo es configurable (gm_flujos): se puede añadir la
-- Vicerrectoría Académica sin tocar código. Los 15 días hábiles de Rua son el
-- indicador de plazo de toda solicitud; no hay plazos por paso definidos.
--
-- ACCESO (la lección de Informes, 0192). Todo sale del permiso EXPLÍCITO del rol
-- de acceso: access_roles.gm_nivel (none · solicitante · revisor · gestor) y la
-- pantalla «gestion_master». Ninguna función ni política usa
-- has_role_at_least('planeacion') ni la capacidad del rol: un rol con capacidad
-- de Planeación por otro módulo NO entra aquí. Solo la administración general
-- (profiles.role = admin) entra sin rol. Quien aprueba lo hace por la FUNCIÓN de
-- su rol (access_roles.gm_funcion: vaf, planeacion, academica…), que es lo que
-- cada paso del flujo pide.
--
--   solicitante  crea y ve sus solicitudes y las de las unidades donde trabaja
--   revisor      además decide el paso que le toca por su función
--   gestor       además configura flujos y funciones, aplica en el Master,
--                concilia con el Warehouse, cierra el corte e importa Rua
--
-- OBJETOS NUEVOS
--   access_roles.gm_nivel, access_roles.gm_funcion
--   gm_funciones, gm_flujos, gm_flujo_pasos
--   gm_solicitudes, gm_solicitud_lineas, gm_solicitud_pasos
--   gm_eventos (solo anexar), gm_avisos (cola de correos), gm_consultas_nombres
--   gm_rua_solicitudes (histórico de Rua, solo lectura)
--   funciones gm_nivel_actual, gm_funcion_actual, gm_puede, gm_solicitud_visible
--   lectura del Warehouse sin wh_autorizado(): gm_cortes, gm_buscar_codigos,
--     gm_ficha_codigo, gm_actividades_periodo, gm_profesores_periodo
--   escritura: gm_guardar_solicitud, gm_decidir, gm_decidir_lote, gm_cancelar,
--     gm_comentar, gm_marcar_aplicada, gm_conciliar, gm_guardar_funcion,
--     gm_guardar_flujo, gm_importar_rua, gm_corte_filas
--   conjunto gm_solicitudes en wh_politicas (el Warehouse lo carga con
--     wh_abrir_carga → wh_agregar_filas → wh_cerrar_carga)
--   plantillas de correo c-gm-* en correo_templates (se editan en Correos)
--
-- NO cambia ninguna política existente. Requiere 0002, 0024, 0057, 0137, 0155,
-- 0177 y 0193. Idempotente. Todo DELETE y UPDATE lleva WHERE (safeupdate, 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funciones de aprobación (catálogo editable) y columnas del rol
-- -----------------------------------------------------------------------------

create table if not exists public.gm_funciones (
  codigo text primary key,
  nombre text not null,
  activa boolean not null default true,
  orden  smallint not null default 0,
  constraint gm_funciones_codigo check (codigo ~ '^[a-z][a-z0-9_-]{1,29}$'),
  constraint gm_funciones_nombre check (char_length(btrim(nombre)) between 3 and 80)
);

comment on table public.gm_funciones is
  'Gestión Master (0194): las funciones que firman pasos del flujo (vaf, planeacion, academica…). Un rol de acceso lleva una (access_roles.gm_funcion).';

insert into public.gm_funciones (codigo, nombre, orden) values
  ('vaf', 'Vicerrectoría Administrativa y Financiera', 1),
  ('planeacion', 'Planeación', 2),
  ('academica', 'Vicerrectoría Académica', 3)
on conflict (codigo) do nothing;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'access_roles' and column_name = 'gm_nivel'
  ) then
    alter table public.access_roles add column gm_nivel text not null default 'none';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'access_roles' and column_name = 'gm_funcion'
  ) then
    alter table public.access_roles add column gm_funcion text references public.gm_funciones (codigo) on delete set null;
  end if;
end $$;

alter table public.access_roles drop constraint if exists access_roles_gm_nivel;
alter table public.access_roles
  add constraint access_roles_gm_nivel check (gm_nivel in ('none', 'solicitante', 'revisor', 'gestor'));
alter table public.access_roles drop constraint if exists access_roles_gm_revisor_funcion;
alter table public.access_roles
  add constraint access_roles_gm_revisor_funcion check (gm_nivel <> 'revisor' or gm_funcion is not null);

comment on column public.access_roles.gm_nivel is
  'Gestión Master (0194): none · solicitante (crea y ve) · revisor (además decide su paso) · gestor (además configura, aplica y cierra el corte). Exige la pantalla «gestion_master». Nace en none: ningún rol existente entra.';
comment on column public.access_roles.gm_funcion is
  'Gestión Master (0194): la función de aprobación del rol (gm_funciones). Un paso del flujo lo firma quien tiene esa función.';

-- -----------------------------------------------------------------------------
-- 2. La regla de acceso
-- -----------------------------------------------------------------------------

/** El nivel de quien pregunta. Administración general: gestor. Sin rol de acceso: nada. */
create or replace function public.gm_nivel_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then 'none'
    when public.has_role_at_least('admin') then 'gestor'
    when not public.has_access_role() then 'none'
    else coalesce((
      select case when r.all_screens or 'gestion_master' = any (r.screens) then r.gm_nivel else 'none' end
        from public.profiles p
        join public.access_roles r on r.id = p.access_role_id
       where p.id = auth.uid() and p.is_active
    ), 'none')
  end;
$$;

/** La función de aprobación del rol de quien pregunta (nula para la administración sin rol). */
create or replace function public.gm_funcion_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.gm_funcion
    from public.profiles p
    join public.access_roles r on r.id = p.access_role_id
   where p.id = auth.uid() and p.is_active
     and public.gm_nivel_actual() in ('revisor', 'gestor');
$$;

/** ¿Puede esta acción? ver (cualquier nivel) · solicitar · revisar · gestionar · nombres. */
create or replace function public.gm_puede(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_accion
    when 'ver'       then public.gm_nivel_actual() <> 'none'
    when 'solicitar' then public.gm_nivel_actual() in ('solicitante', 'revisor', 'gestor')
    when 'nombres'   then public.gm_nivel_actual() in ('solicitante', 'revisor', 'gestor')
    when 'revisar'   then public.gm_nivel_actual() in ('revisor', 'gestor')
    when 'gestionar' then public.gm_nivel_actual() = 'gestor'
    else false
  end;
$$;

comment on function public.gm_puede(text) is
  'Gestión Master (0194): el permiso sale del rol de acceso (gm_nivel y la pantalla), nunca de la capacidad global.';

-- -----------------------------------------------------------------------------
-- 3. Fechas hábiles (sin festivos: el indicador de 15 días de Rua es orientativo)
-- -----------------------------------------------------------------------------

create or replace function public.gm_dias_habiles(p_desde timestamptz, p_hasta timestamptz)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p_desde is null or p_hasta is null or p_hasta <= p_desde then 0
    else (
      select count(*)::int
        from generate_series((p_desde at time zone 'America/Bogota')::date + 1, (p_hasta at time zone 'America/Bogota')::date, interval '1 day') d
       where extract(isodow from d) < 6
    ) end;
$$;

create or replace function public.gm_sumar_dias_habiles(p_desde timestamptz, p_n integer)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  d date := (p_desde at time zone 'America/Bogota')::date;
  n integer := 0;
begin
  while n < greatest(coalesce(p_n, 0), 0) loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return (d::timestamp + (p_desde at time zone 'America/Bogota')::time) at time zone 'America/Bogota';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Flujos
-- -----------------------------------------------------------------------------

create table if not exists public.gm_flujos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique,
  descripcion    text not null default '',
  plazo_dias     smallint not null default 15,
  por_defecto    boolean not null default false,
  activo         boolean not null default true,
  creado_por     uuid references public.profiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint gm_flujos_nombre check (char_length(btrim(nombre)) between 3 and 80),
  constraint gm_flujos_plazo check (plazo_dias between 1 and 120)
);

create unique index if not exists gm_flujos_uno_por_defecto on public.gm_flujos ((por_defecto)) where por_defecto;

comment on table public.gm_flujos is
  'Gestión Master (0194): los flujos de aprobación. plazo_dias es el indicador (15 días hábiles, como Rua), no un corte automático.';

create table if not exists public.gm_flujo_pasos (
  id               uuid primary key default gen_random_uuid(),
  flujo_id         uuid not null references public.gm_flujos (id) on delete cascade,
  orden            smallint not null,
  nombre           text not null,
  funcion          text not null references public.gm_funciones (codigo) on delete restrict,
  suplente_funcion text references public.gm_funciones (codigo) on delete restrict,
  plazo_dias       smallint,
  unique (flujo_id, orden),
  constraint gm_flujo_pasos_orden check (orden >= 1),
  constraint gm_flujo_pasos_nombre check (char_length(btrim(nombre)) between 3 and 80),
  constraint gm_flujo_pasos_plazo check (plazo_dias is null or plazo_dias between 1 and 120)
);

do $$
declare f uuid;
begin
  if not exists (select 1 from public.gm_flujos) then
    insert into public.gm_flujos (nombre, descripcion, por_defecto)
    values ('Flujo estándar', 'La Vicerrectoría Administrativa y Financiera aprueba primero; luego Planeación revisa, aprueba y aplica el cambio en el Master.', true)
    returning id into f;
    insert into public.gm_flujo_pasos (flujo_id, orden, nombre, funcion) values
      (f, 1, 'Vicerrectoría Administrativa y Financiera', 'vaf'),
      (f, 2, 'Planeación: revisión y creación en el Master', 'planeacion');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Solicitudes
-- -----------------------------------------------------------------------------

create sequence if not exists public.gm_folio_seq;

create table if not exists public.gm_solicitudes (
  id             uuid primary key default gen_random_uuid(),
  folio          text not null unique,
  tipo           text not null,
  estado         text not null default 'borrador',
  aplicacion     text,
  prioridad      text not null default 'normal',
  solicitante_id uuid not null references public.profiles (id) on delete restrict,
  unidad_id      uuid references public.units (id) on delete set null,
  periodo        text not null,
  sede           text not null,
  justificacion  text not null default '',
  flujo_id       uuid references public.gm_flujos (id) on delete set null,
  ronda          smallint not null default 1,
  enviada_en     timestamptz,
  limite_en      timestamptz,
  resuelta_en    timestamptz,
  resuelta_por   uuid references public.profiles (id) on delete set null,
  aplicada_en    timestamptz,
  aplicada_por   uuid references public.profiles (id) on delete set null,
  reflejada_en   timestamptz,
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  constraint gm_sol_tipo check (tipo in ('nuevo', 'mejorar', 'eliminar')),
  constraint gm_sol_estado check (estado in ('borrador', 'pendiente', 'revision', 'devuelta', 'aprobada', 'rechazada', 'cancelada')),
  constraint gm_sol_aplicacion check (aplicacion is null or aplicacion in ('sin_aplicar', 'aplicada', 'reflejada')),
  constraint gm_sol_aplicacion_coherente check ((estado = 'aprobada') = (aplicacion is not null)),
  constraint gm_sol_prioridad check (prioridad in ('normal', 'alta', 'urgente')),
  constraint gm_sol_periodo check (periodo ~ '^[0-9]{4}[ab]$'),
  constraint gm_sol_sede check (sede in ('buc', 'cuc', 'val', 'bog')),
  constraint gm_sol_just_max check (char_length(justificacion) <= 2000),
  constraint gm_sol_just_min check (estado in ('borrador', 'cancelada') or char_length(btrim(justificacion)) >= 150)
);

create index if not exists gm_sol_periodo_sede_idx on public.gm_solicitudes (periodo, sede, estado);
create index if not exists gm_sol_solicitante_idx on public.gm_solicitudes (solicitante_id, creada_en desc);
create index if not exists gm_sol_unidad_idx on public.gm_solicitudes (unidad_id);

comment on table public.gm_solicitudes is
  'Gestión Master (0194): pedidos de actividades del Master. Nada se escribe directo: solo por las funciones gm_*.';

create or replace function public.gm_solicitud_folio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.folio is null or btrim(new.folio) = '' then
    new.folio := 'GM-' || to_char(now() at time zone 'America/Bogota', 'YYYY') || '-' || lpad(nextval('public.gm_folio_seq')::text, 4, '0');
  end if;
  new.actualizada_en := now();
  return new;
end;
$$;

drop trigger if exists gm_solicitud_folio on public.gm_solicitudes;
create trigger gm_solicitud_folio before insert or update on public.gm_solicitudes
  for each row execute function public.gm_solicitud_folio();

create table if not exists public.gm_solicitud_lineas (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.gm_solicitudes (id) on delete cascade,
  orden          smallint not null default 0,
  codigo         text,
  -- Mejorar o mantener: el código del que se tomaron los datos, y de qué periodo y sede.
  origen_codigo  text,
  origen_periodo text,
  origen_sede    text,
  nombre         text,
  tipo_actividad text,
  instrucciones  text,
  vinculacion    text,
  activa         boolean not null default true,
  -- Lo que el Warehouse decía al pedir (la ficha del código y su carga) y lo que se pide.
  antes          jsonb not null default '{}'::jsonb,
  despues        jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  unique (solicitud_id, orden),
  constraint gm_lin_codigo check (codigo is null or codigo ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint gm_lin_tipo_act check (tipo_actividad is null or tipo_actividad in ('directa', 'apoyo')),
  constraint gm_lin_origen_sede check (origen_sede is null or origen_sede in ('buc', 'cuc', 'val', 'bog')),
  constraint gm_lin_largos check (char_length(coalesce(nombre, '')) <= 300 and char_length(coalesce(instrucciones, '')) <= 2000 and char_length(coalesce(vinculacion, '')) <= 300)
);

create unique index if not exists gm_lin_codigo_unico on public.gm_solicitud_lineas (solicitud_id, upper(codigo)) where codigo is not null;

create table if not exists public.gm_solicitud_pasos (
  id               uuid primary key default gen_random_uuid(),
  solicitud_id     uuid not null references public.gm_solicitudes (id) on delete cascade,
  ronda            smallint not null default 1,
  orden            smallint not null,
  nombre           text not null,
  funcion          text not null,
  suplente_funcion text,
  plazo_dias       smallint,
  estado           text not null default 'bloqueado',
  inicio_en        timestamptz,
  decidido_por     uuid references public.profiles (id) on delete set null,
  decidido_en      timestamptz,
  nota             text,
  por_admin        boolean not null default false,
  unique (solicitud_id, ronda, orden),
  constraint gm_pas_estado check (estado in ('bloqueado', 'pendiente', 'aprobado', 'devuelto', 'rechazado', 'omitido')),
  -- Decidir sin motivo escrito deja un expediente que nadie puede auditar (como en Rua).
  constraint gm_pas_nota check (estado not in ('aprobado', 'devuelto', 'rechazado') or char_length(btrim(coalesce(nota, ''))) >= 20),
  constraint gm_pas_sellado check (estado not in ('aprobado', 'devuelto', 'rechazado') or (decidido_en is not null))
);

create index if not exists gm_pas_pendientes_idx on public.gm_solicitud_pasos (funcion) where estado = 'pendiente';

-- Registro de solo anexar: lo que pasó, quién y cuándo. Lo que se carga al Warehouse al cerrar el corte.
create table if not exists public.gm_eventos (
  id           bigint generated always as identity primary key,
  solicitud_id uuid references public.gm_solicitudes (id) on delete restrict,
  tipo         text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  periodo      text,
  sede         text,
  datos        jsonb not null default '{}'::jsonb,
  creado_en    timestamptz not null default now(),
  constraint gm_eventos_tipo check (char_length(tipo) between 2 and 40)
);

create index if not exists gm_eventos_corte_idx on public.gm_eventos (periodo, sede, creado_en);
create index if not exists gm_eventos_solicitud_idx on public.gm_eventos (solicitud_id, creado_en);

create or replace function public.gm_eventos_solo_anexar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Lo único que se permite: que al borrar a una persona su rastro quede sin actor.
  if tg_op = 'UPDATE' and old.actor_id is not null and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'gm_eventos solo admite INSERT: es el registro de lo que pasó.' using errcode = '42501';
end;
$$;

drop trigger if exists gm_eventos_inmutable on public.gm_eventos;
create trigger gm_eventos_inmutable before update or delete on public.gm_eventos
  for each row execute function public.gm_eventos_solo_anexar();

create table if not exists public.gm_avisos (
  id             bigint generated always as identity primary key,
  solicitud_id   uuid references public.gm_solicitudes (id) on delete set null,
  plantilla      text not null,
  destinatario_id uuid not null references public.profiles (id) on delete cascade,
  datos          jsonb not null default '{}'::jsonb,
  estado         text not null default 'pendiente',
  intentos       smallint not null default 0,
  error          text not null default '',
  creado_en      timestamptz not null default now(),
  enviado_en     timestamptz,
  constraint gm_avisos_estado check (estado in ('pendiente', 'enviado', 'error', 'omitido'))
);

create index if not exists gm_avisos_pendientes_idx on public.gm_avisos (creado_en) where estado = 'pendiente';

-- Quién vio los nombres de los docentes, de qué código y cuándo (decisión 11: los nombres no se guardan).
create table if not exists public.gm_consultas_nombres (
  id        bigint generated always as identity primary key,
  usuario_id uuid references public.profiles (id) on delete set null,
  periodo   text not null,
  sede      text not null,
  codigo    text not null,
  cantidad  integer not null default 0,
  creada_en timestamptz not null default now()
);

create index if not exists gm_consultas_nombres_idx on public.gm_consultas_nombres (creada_en desc);

-- El histórico de Rua (solo lectura). Se importa una vez desde un export de Rua.
create table if not exists public.gm_rua_solicitudes (
  id           uuid primary key default gen_random_uuid(),
  folio        text not null unique,
  tipo         text not null default '',
  estado       text not null default '',
  prioridad    text not null default '',
  solicitante  text not null default '',
  unidad       text not null default '',
  concepto     text not null default '',
  creada_en    timestamptz,
  resuelta_en  timestamptz,
  lineas       jsonb not null default '[]'::jsonb,
  etapas       jsonb not null default '[]'::jsonb,
  importada_en timestamptz not null default now(),
  importada_por uuid references public.profiles (id) on delete set null
);

comment on table public.gm_rua_solicitudes is
  'Gestión Master (0194): solicitudes históricas de Rua, importadas una vez. Solo lectura desde el módulo.';

-- -----------------------------------------------------------------------------
-- 6. Visibilidad y RLS (todo se lee; nada se escribe directo)
-- -----------------------------------------------------------------------------

/** ¿Ve quien pregunta esta solicitud? Propias, de sus unidades, o la que su función debe firmar; el gestor, todas. */
create or replace function public.gm_solicitud_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.gm_puede('ver') and exists (
    select 1 from public.gm_solicitudes s
     where s.id = p_id
       and (
         s.solicitante_id = auth.uid()
         or (s.estado <> 'borrador' and (
              public.gm_nivel_actual() = 'gestor'
              or (s.unidad_id is not null and public.unit_role_at(s.unidad_id) is not null)
              or (public.gm_nivel_actual() = 'revisor' and exists (
                    select 1 from public.gm_solicitud_pasos p
                     where p.solicitud_id = s.id
                       and (p.funcion = public.gm_funcion_actual() or p.suplente_funcion = public.gm_funcion_actual())))
            ))
       )
  );
$$;

alter table public.gm_funciones enable row level security;
alter table public.gm_flujos enable row level security;
alter table public.gm_flujo_pasos enable row level security;
alter table public.gm_solicitudes enable row level security;
alter table public.gm_solicitud_lineas enable row level security;
alter table public.gm_solicitud_pasos enable row level security;
alter table public.gm_eventos enable row level security;
alter table public.gm_avisos enable row level security;
alter table public.gm_consultas_nombres enable row level security;
alter table public.gm_rua_solicitudes enable row level security;

drop policy if exists gm_funciones_lectura on public.gm_funciones;
create policy gm_funciones_lectura on public.gm_funciones for select to authenticated
  using (public.gm_puede('ver') or public.has_role_at_least('admin'));

drop policy if exists gm_flujos_lectura on public.gm_flujos;
create policy gm_flujos_lectura on public.gm_flujos for select to authenticated using (public.gm_puede('ver'));

drop policy if exists gm_flujo_pasos_lectura on public.gm_flujo_pasos;
create policy gm_flujo_pasos_lectura on public.gm_flujo_pasos for select to authenticated using (public.gm_puede('ver'));

drop policy if exists gm_solicitudes_lectura on public.gm_solicitudes;
create policy gm_solicitudes_lectura on public.gm_solicitudes for select to authenticated using (public.gm_solicitud_visible(id));

drop policy if exists gm_lineas_lectura on public.gm_solicitud_lineas;
create policy gm_lineas_lectura on public.gm_solicitud_lineas for select to authenticated using (public.gm_solicitud_visible(solicitud_id));

drop policy if exists gm_pasos_lectura on public.gm_solicitud_pasos;
create policy gm_pasos_lectura on public.gm_solicitud_pasos for select to authenticated using (public.gm_solicitud_visible(solicitud_id));

drop policy if exists gm_eventos_lectura on public.gm_eventos;
create policy gm_eventos_lectura on public.gm_eventos for select to authenticated
  using (solicitud_id is not null and public.gm_solicitud_visible(solicitud_id));

drop policy if exists gm_consultas_nombres_lectura on public.gm_consultas_nombres;
create policy gm_consultas_nombres_lectura on public.gm_consultas_nombres for select to authenticated
  using (public.gm_puede('gestionar'));

drop policy if exists gm_rua_lectura on public.gm_rua_solicitudes;
create policy gm_rua_lectura on public.gm_rua_solicitudes for select to authenticated using (public.gm_puede('ver'));

revoke all on public.gm_funciones, public.gm_flujos, public.gm_flujo_pasos, public.gm_solicitudes, public.gm_solicitud_lineas,
  public.gm_solicitud_pasos, public.gm_eventos, public.gm_avisos, public.gm_consultas_nombres, public.gm_rua_solicitudes
  from public, anon, authenticated;
grant select on public.gm_funciones, public.gm_flujos, public.gm_flujo_pasos, public.gm_solicitudes, public.gm_solicitud_lineas,
  public.gm_solicitud_pasos, public.gm_eventos, public.gm_consultas_nombres, public.gm_rua_solicitudes to authenticated;
-- La cola de correos solo la toca la función con el rol de servicio.
grant select, insert, update on public.gm_avisos to service_role;
grant select on public.gm_funciones, public.gm_flujos, public.gm_flujo_pasos, public.gm_solicitudes, public.gm_solicitud_lineas,
  public.gm_solicitud_pasos, public.gm_eventos, public.gm_consultas_nombres, public.gm_rua_solicitudes to service_role;
grant usage on sequence public.gm_avisos_id_seq to service_role;
revoke all on sequence public.gm_folio_seq from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Leer el Warehouse sin ser de Planeación
--
-- El Warehouse solo deja leer wh_filas a wh_autorizado() (Planeación con la
-- pantalla). Estas funciones entregan solo lo que el módulo necesita, con
-- security definer, a quien pasa gm_puede('ver'). No se amplía wh_autorizado().
-- Los nombres de los docentes NO están en wh_filas (la política los descarta):
-- la cédula llega como seudónimo y los nombres se leen en vivo del Master
-- (función warehouse, acción «docentes»), sin guardarlos.
-- -----------------------------------------------------------------------------

/** Busca en una fila el primer campo cuyo nombre cumple el patrón (las columnas se normalizan al cargar). */
create or replace function public.gm_buscar(p_datos jsonb, p_patron text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(e.value #>> '{}'), '')
    from jsonb_each(coalesce(p_datos, '{}'::jsonb)) e
   where e.key ~* p_patron and jsonb_typeof(e.value) <> 'null'
   limit 1;
$$;

create or replace function public.gm_verdadero(p_texto text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case when p_texto is null then null
    else lower(btrim(p_texto)) in ('true', 't', '1', 'si', 'sí', 'x', 'yes', 'activo', 'activa', 'directa', 'directo') end;
$$;

/** La carga vigente de un conjunto en un periodo y sede. */
create or replace function public.gm_carga(p_conjunto text, p_periodo text, p_sede text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.wh_cargas c
   where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'guardada' and c.corte = ''
   order by c.version desc limit 1;
$$;

create or replace function public.gm_actdir_filas(p_periodo text, p_sede text)
returns table (carga_id uuid, corte timestamptz, codigo text, nombre text, tipo text, instrucciones text, activa boolean, directa boolean, vinculacion text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.terminada_en,
         upper(public.gm_buscar(f.datos, '^(codigo|code|cod)$')),
         public.gm_buscar(f.datos, '^(nombre|name)$'),
         public.gm_buscar(f.datos, '^(tipo|type)$'),
         public.gm_buscar(f.datos, 'instruc'),
         public.gm_verdadero(public.gm_buscar(f.datos, '^(es_)?activ')),
         public.gm_verdadero(public.gm_buscar(f.datos, '^(es_)?direct')),
         public.gm_buscar(f.datos, 'vincul|contrat')
    from public.wh_cargas c
    join public.wh_filas f on f.carga_id = c.id
   where c.id = public.gm_carga('ms_actdir', p_periodo, p_sede);
$$;

create or replace function public.gm_nomina_filas(p_periodo text, p_sede text)
returns table (carga_id uuid, corte timestamptz, codigo text, actividad text, tipo text, seudonimo text, programa text, horas numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.terminada_en,
         upper(btrim(f.datos ->> 'codigo')),
         nullif(btrim(f.datos ->> 'asignatura_actividad'), ''),
         nullif(btrim(f.datos ->> 'tipo_de_actividad'), ''),
         nullif(btrim(f.datos ->> 'cedula'), ''),
         coalesce(nullif(btrim(f.datos ->> 'programa_departamento'), ''), nullif(btrim(f.datos ->> 'dpto_carrera'), '')),
         coalesce(public.wh_num(f.datos ->> 'horas_semanales'), public.wh_num(f.datos ->> 'horas'))
    from public.wh_cargas c
    join public.wh_filas f on f.carga_id = c.id
   where c.id = public.gm_carga('ms_nom', p_periodo, p_sede);
$$;

revoke all on function public.gm_buscar(jsonb, text), public.gm_verdadero(text), public.gm_carga(text, text, text),
  public.gm_actdir_filas(text, text), public.gm_nomina_filas(text, text) from public, anon, authenticated;

/** Qué hay capturado: por sede, la última captura de la estructura, la nómina y los docentes. */
create or replace function public.gm_cortes(p_periodo text)
returns table (sede text, conjunto text, version int, filas int, terminada_en timestamptz, periodo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;
  return query
    select distinct on (c.sede, c.conjunto) c.sede, c.conjunto, c.version, c.filas, c.terminada_en, c.periodo
      from public.wh_cargas c
     where c.estado = 'guardada' and c.corte = '' and c.conjunto in ('ms_actdir', 'ms_nom', 'ms_doc')
       and (c.periodo = p_periodo or (c.conjunto = 'ms_doc' and c.periodo = 'permanente'))
     order by c.sede, c.conjunto, c.version desc;
end;
$$;

/** Los códigos del catálogo de un periodo y sede que contienen un texto (código o nombre), para elegir uno. */
create or replace function public.gm_buscar_codigos(p_periodo text, p_sede text, p_texto text)
returns table (codigo text, nombre text, tipo_actividad text, activa boolean, vinculacion text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare t text := lower(btrim(coalesce(p_texto, '')));
begin
  if not public.gm_puede('solicitar') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;
  return query
    select a.codigo, a.nombre,
           case when a.directa is true then 'directa' when a.directa is false then 'apoyo' else coalesce(lower(a.tipo), '') end,
           a.activa, a.vinculacion
      from public.gm_actdir_filas(p_periodo, p_sede) a
     where a.codigo is not null
       and (t = '' or lower(a.codigo) like '%' || t || '%' or lower(coalesce(a.nombre, '')) like '%' || t || '%')
     order by (lower(a.codigo) = t) desc, a.codigo
     limit 40;
end;
$$;

/**
 * Los datos reales de un código: su ficha del catálogo (ms_actdir) y, de la nómina
 * (ms_nom), cuántos profesores lo tienen en el periodo, las horas asignadas y el
 * promedio, con los seudónimos y el programa de cada uno. Sin nombres.
 */
create or replace function public.gm_ficha_codigo(p_periodo text, p_sede text, p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cod text := upper(btrim(coalesce(p_codigo, '')));
  cat jsonb;
  cat_nombre text;
  actdir uuid := public.gm_carga('ms_actdir', p_periodo, p_sede);
  nom uuid := public.gm_carga('ms_nom', p_periodo, p_sede);
  v_profs jsonb := '[]'::jsonb;
  v_n int := null;
  v_horas numeric := null;
  v_prom numeric := null;
  v_por text := 'codigo';
begin
  if not public.gm_puede('solicitar') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;

  select to_jsonb(x) - 'carga_id' - 'corte', x.nombre into cat, cat_nombre
    from (select * from public.gm_actdir_filas(p_periodo, p_sede) a where a.codigo = cod limit 1) x;

  if nom is not null then
    with filas as (select * from public.gm_nomina_filas(p_periodo, p_sede) n where n.codigo = cod),
         filas2 as (
           select * from filas
           union all
           select n.* from public.gm_nomina_filas(p_periodo, p_sede) n
            where not exists (select 1 from filas) and cat_nombre is not null
              and lower(btrim(coalesce(n.actividad, ''))) = lower(btrim(cat_nombre))
         ),
         por_prof as (
           select coalesce(seudonimo, '—') as seudonimo, max(programa) as programa, count(*) as asignaciones, sum(coalesce(horas, 0)) as horas
             from filas2 group by 1
         )
    select coalesce(jsonb_agg(jsonb_build_object('seudonimo', seudonimo, 'programa', programa, 'asignaciones', asignaciones, 'horas', horas) order by horas desc, seudonimo), '[]'::jsonb),
           count(*)::int, coalesce(sum(horas), 0)
      into v_profs, v_n, v_horas
      from por_prof;
    if v_n > 0 then
      v_prom := round(v_horas / v_n, 2);
      if not exists (select 1 from public.gm_nomina_filas(p_periodo, p_sede) n where n.codigo = cod) then v_por := 'nombre'; end if;
    end if;
  end if;

  return jsonb_build_object(
    'codigo', cod,
    'catalogo', cat,
    'sin_captura_catalogo', actdir is null,
    'sin_captura_nomina', nom is null,
    'n_profesores', v_n,
    'horas', v_horas,
    'promedio_horas', v_prom,
    'coincidencia', v_por,
    'profesores', v_profs,
    'carga_actdir', (select jsonb_build_object('id', c.id, 'version', c.version, 'corte', c.terminada_en) from public.wh_cargas c where c.id = actdir),
    'carga_nomina', (select jsonb_build_object('id', c.id, 'version', c.version, 'corte', c.terminada_en) from public.wh_cargas c where c.id = nom)
  );
end;
$$;

/** El catálogo de un periodo y sede con sus profesores y horas (alimenta Estructura y Actividades del periodo). */
create or replace function public.gm_actividades_periodo(p_periodo text, p_sede text)
returns table (codigo text, nombre text, tipo_actividad text, activa boolean, vinculacion text, n_profesores int, horas numeric, promedio_horas numeric, solicitudes_abiertas int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;
  return query
    with nom as (
      select n.codigo, count(distinct n.seudonimo)::int as np, sum(coalesce(n.horas, 0)) as h
        from public.gm_nomina_filas(p_periodo, p_sede) n
       where n.codigo is not null group by n.codigo
    ), abiertas as (
      select upper(l.codigo) as codigo, count(distinct s.id)::int as n
        from public.gm_solicitud_lineas l
        join public.gm_solicitudes s on s.id = l.solicitud_id
       where s.periodo = p_periodo and s.sede = p_sede and s.estado in ('pendiente', 'revision', 'devuelta')
         and public.gm_solicitud_visible(s.id) and l.codigo is not null
       group by upper(l.codigo)
    )
    select a.codigo, a.nombre,
           case when a.directa is true then 'directa' when a.directa is false then 'apoyo' else coalesce(lower(a.tipo), '') end,
           a.activa, a.vinculacion,
           nom.np, nom.h, case when coalesce(nom.np, 0) > 0 then round(nom.h / nom.np, 2) end,
           coalesce(ab.n, 0)
      from public.gm_actdir_filas(p_periodo, p_sede) a
      left join nom on nom.codigo = a.codigo
      left join abiertas ab on ab.codigo = a.codigo
     where a.codigo is not null
     order by a.codigo;
end;
$$;

/** Por profesor (seudónimo): programa, en cuántas actividades y cuántas horas en el periodo. */
create or replace function public.gm_profesores_periodo(p_periodo text, p_sede text)
returns table (seudonimo text, programa text, actividades int, horas numeric, codigos text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then
    raise exception 'Gestión Master: sin permiso.' using errcode = '42501';
  end if;
  return query
    select n.seudonimo, max(n.programa), count(distinct n.codigo)::int, sum(coalesce(n.horas, 0)), array_agg(distinct n.codigo) filter (where n.codigo is not null)
      from public.gm_nomina_filas(p_periodo, p_sede) n
     where n.seudonimo is not null and n.codigo in (select a.codigo from public.gm_actdir_filas(p_periodo, p_sede) a)
     group by n.seudonimo
     order by sum(coalesce(n.horas, 0)) desc
     limit 1500;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Avisos (cola de correos) y eventos
-- -----------------------------------------------------------------------------

/** Quiénes firman una función: los roles con esa gm_funcion y nivel revisor o gestor, con la pantalla marcada. */
create or replace function public.gm_aprobadores(p_funcion text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
    join public.access_roles r on r.id = p.access_role_id
   where p.is_active and r.gm_funcion = p_funcion and r.gm_nivel in ('revisor', 'gestor')
     and (r.all_screens or 'gestion_master' = any (r.screens));
$$;

create or replace function public.gm_evento(p_solicitud uuid, p_tipo text, p_datos jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select periodo, sede into s from public.gm_solicitudes where id = p_solicitud;
  insert into public.gm_eventos (solicitud_id, tipo, actor_id, periodo, sede, datos)
  values (p_solicitud, p_tipo, auth.uid(), s.periodo, s.sede, coalesce(p_datos, '{}'::jsonb));
end;
$$;

/** Encola un aviso para una persona con las variables de la solicitud. El envío lo hace la función gestion-master. */
create or replace function public.gm_aviso(p_solicitud uuid, p_plantilla text, p_destino uuid, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  acts text;
begin
  if p_destino is null then return; end if;
  select s1.folio, s1.tipo, s1.estado, s1.periodo, s1.sede, u.name as unidad, p.full_name as solicitante
    into s
    from public.gm_solicitudes s1
    left join public.units u on u.id = s1.unidad_id
    left join public.profiles p on p.id = s1.solicitante_id
   where s1.id = p_solicitud;
  select string_agg(coalesce(l.codigo, '(sin código)') || ' ' || coalesce(l.nombre, ''), ', ' order by l.orden) into acts
    from (select * from public.gm_solicitud_lineas where solicitud_id = p_solicitud order by orden limit 3) l;
  insert into public.gm_avisos (solicitud_id, plantilla, destinatario_id, datos)
  values (p_solicitud, p_plantilla, p_destino, jsonb_build_object(
    'folio', s.folio,
    'tipo', case s.tipo when 'nuevo' then 'actividad nueva' when 'mejorar' then 'mejorar o mantener una actividad' else 'eliminar una actividad' end,
    'estado', s.estado, 'periodo', s.periodo, 'sede', s.sede,
    'unidad', coalesce(s.unidad, 'sin unidad'), 'solicitante', coalesce(s.solicitante, ''),
    'actividades', coalesce(acts, '')) || coalesce(p_extra, '{}'::jsonb));
end;
$$;

revoke all on function public.gm_aprobadores(text), public.gm_evento(uuid, text, jsonb), public.gm_aviso(uuid, text, uuid, jsonb)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Guardar, enviar, decidir
-- -----------------------------------------------------------------------------

/** Las unidades donde puede solicitar: las suyas (editor o jefe); el gestor, todas. */
create or replace function public.gm_mis_unidades()
returns table (id uuid, nombre text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.kind::text
    from public.units u
   where public.gm_puede('solicitar')
     and (public.gm_nivel_actual() = 'gestor' or public.unit_can_edit(u.id))
   order by u.name;
$$;

/** Arma la fila `antes` y `despues` de una línea con lo que dice el Warehouse. */
create or replace function public.gm_snapshot_linea(p_tipo text, p_linea jsonb, p_periodo text, p_sede text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cod text := upper(nullif(btrim(coalesce(p_linea ->> 'origen_codigo', p_linea ->> 'codigo', '')), ''));
  per text := coalesce(nullif(p_linea ->> 'origen_periodo', ''), p_periodo);
  sd text := coalesce(nullif(p_linea ->> 'origen_sede', ''), p_sede);
  ficha jsonb;
begin
  if p_tipo = 'nuevo' or cod is null then return '{}'::jsonb; end if;
  ficha := public.gm_ficha_codigo(per, sd, cod);
  if p_tipo = 'eliminar' and jsonb_typeof(ficha -> 'catalogo') is distinct from 'object' and not coalesce((ficha ->> 'sin_captura_catalogo')::boolean, false) then
    raise exception 'El código % no está en el catálogo de actividades del Master (%, %). Revise el código o el periodo.', cod, per, sd using errcode = 'check_violation';
  end if;
  if p_tipo = 'mejorar' and jsonb_typeof(ficha -> 'catalogo') is distinct from 'object' and not coalesce((ficha ->> 'sin_captura_catalogo')::boolean, false) then
    raise exception 'El código % no está en el catálogo de actividades del Master (%, %). Para algo que no existe, use «Nuevo».', cod, per, sd using errcode = 'check_violation';
  end if;
  return jsonb_build_object('ficha', ficha, 'periodo', per, 'sede', sd);
end;
$$;

revoke all on function public.gm_snapshot_linea(text, jsonb, text, text) from public, anon, authenticated;

/**
 * Crea o actualiza una solicitud y la envía. Solo el autor, y solo en borrador o devuelta.
 * Cada línea trae el código, y la propuesta (nombre, tipo, instrucciones, vinculación, activa).
 */
create or replace function public.gm_guardar_solicitud(
  p_id uuid, p_tipo text, p_prioridad text, p_unidad uuid, p_periodo text, p_sede text,
  p_justificacion text, p_lineas jsonb, p_enviar boolean
)
returns table (id uuid, folio text, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_estado text;
  v_ronda smallint;
  v_flujo uuid;
  v_plazo smallint;
  v_l jsonb;
  v_i int := 0;
  v_cod text;
  v_nom text;
  v_snap jsonb;
  v_antes jsonb;
  v_despues jsonb;
  v_tipo_act text;
  v_paso record;
begin
  if not public.gm_puede('solicitar') then
    raise exception 'No tienes permiso para crear solicitudes en Gestión Master.' using errcode = '42501';
  end if;
  if p_tipo not in ('nuevo', 'mejorar', 'eliminar') then raise exception 'El tipo de solicitud no es válido.' using errcode = 'check_violation'; end if;
  if coalesce(p_prioridad, 'normal') not in ('normal', 'alta', 'urgente') then raise exception 'La prioridad no es válida.' using errcode = 'check_violation'; end if;
  if p_periodo !~ '^[0-9]{4}[ab]$' or p_sede not in ('buc', 'cuc', 'val', 'bog') then raise exception 'Elija el periodo y la sede.' using errcode = 'check_violation'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Una solicitud tiene que afectar al menos a una actividad.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_lineas) > 30 then raise exception 'Una solicitud admite hasta 30 actividades.' using errcode = 'invalid_parameter_value'; end if;
  if p_unidad is not null and not (public.gm_nivel_actual() = 'gestor' or public.unit_can_edit(p_unidad)) then
    raise exception 'Solo puedes solicitar a nombre de una unidad donde eres Gestor o Contribuyente.' using errcode = '42501';
  end if;
  if p_enviar and char_length(btrim(coalesce(p_justificacion, ''))) < 150 then
    raise exception 'La justificación debe tener al menos 150 caracteres para enviarse a revisión.' using errcode = 'check_violation';
  end if;

  -- Se valida TODA la lista antes de escribir nada, para señalar qué línea está mal.
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_cod := upper(nullif(btrim(coalesce(v_l ->> 'codigo', '')), ''));
    v_nom := nullif(btrim(coalesce(v_l ->> 'nombre', '')), '');
    if v_cod is not null and v_cod !~ '^[A-Z0-9._-]{1,32}$' then
      raise exception 'Línea %: el código solo admite letras, números, punto, guion y guion bajo (hasta 32).', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'nuevo' and (v_nom is null or coalesce(v_l ->> 'tipo_actividad', '') not in ('directa', 'apoyo')) then
      raise exception 'Línea %: una actividad nueva necesita nombre y tipo (directa o de apoyo).', v_i using errcode = 'check_violation';
    end if;
    if p_tipo <> 'nuevo' and v_cod is null and nullif(btrim(coalesce(v_l ->> 'origen_codigo', '')), '') is null then
      raise exception 'Línea %: elija el código de la actividad.', v_i using errcode = 'check_violation';
    end if;
    if p_tipo = 'mejorar' and v_nom is null then
      raise exception 'Línea %: escriba cómo debe quedar el nombre de la actividad.', v_i using errcode = 'check_violation';
    end if;
  end loop;

  if v_id is null then
    insert into public.gm_solicitudes (folio, tipo, estado, prioridad, solicitante_id, unidad_id, periodo, sede, justificacion)
    values ('', p_tipo, 'borrador', coalesce(p_prioridad, 'normal'), auth.uid(), p_unidad, p_periodo, p_sede, btrim(coalesce(p_justificacion, '')))
    returning gm_solicitudes.id into v_id;
  else
    select s.estado, s.ronda into v_estado, v_ronda from public.gm_solicitudes s where s.id = v_id and s.solicitante_id = auth.uid();
    if v_estado is null or v_estado not in ('borrador', 'devuelta') then
      raise exception 'Solo puedes editar tus propias solicitudes mientras estén en borrador o devueltas.' using errcode = '42501';
    end if;
    delete from public.gm_solicitud_lineas where solicitud_id = v_id;
    update public.gm_solicitudes
       set tipo = p_tipo, prioridad = coalesce(p_prioridad, 'normal'), unidad_id = p_unidad, periodo = p_periodo, sede = p_sede,
           justificacion = btrim(coalesce(p_justificacion, ''))
     where gm_solicitudes.id = v_id;
  end if;

  v_i := 0;
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    v_cod := upper(nullif(btrim(coalesce(v_l ->> 'codigo', '')), ''));
    v_snap := public.gm_snapshot_linea(p_tipo, v_l, p_periodo, p_sede);
    v_antes := coalesce(v_snap, '{}'::jsonb);
    v_tipo_act := nullif(v_l ->> 'tipo_actividad', '');
    v_despues := jsonb_strip_nulls(jsonb_build_object(
      'nombre', nullif(btrim(coalesce(v_l ->> 'nombre', '')), ''),
      'tipo_actividad', v_tipo_act,
      'instrucciones', nullif(btrim(coalesce(v_l ->> 'instrucciones', '')), ''),
      'vinculacion', nullif(btrim(coalesce(v_l ->> 'vinculacion', '')), ''),
      'activa', case when p_tipo = 'eliminar' then false else coalesce((v_l ->> 'activa')::boolean, true) end));
    insert into public.gm_solicitud_lineas (solicitud_id, orden, codigo, origen_codigo, origen_periodo, origen_sede, nombre, tipo_actividad, instrucciones, vinculacion, activa, antes, despues)
    values (v_id, v_i, v_cod, upper(nullif(btrim(coalesce(v_l ->> 'origen_codigo', '')), '')),
            nullif(v_l ->> 'origen_periodo', ''), nullif(v_l ->> 'origen_sede', ''),
            nullif(btrim(coalesce(v_l ->> 'nombre', '')), ''), v_tipo_act,
            nullif(btrim(coalesce(v_l ->> 'instrucciones', '')), ''), nullif(btrim(coalesce(v_l ->> 'vinculacion', '')), ''),
            case when p_tipo = 'eliminar' then false else coalesce((v_l ->> 'activa')::boolean, true) end,
            v_antes, v_despues);
  end loop;

  if not p_enviar then
    perform public.gm_evento(v_id, 'borrador', '{}'::jsonb);
    return query select s.id, s.folio, s.estado from public.gm_solicitudes s where s.id = v_id;
    return;
  end if;

  -- Enviar: se copian los pasos del flujo por defecto (los cambios posteriores del flujo no tocan lo que está en curso).
  select f.id, f.plazo_dias into v_flujo, v_plazo from public.gm_flujos f where f.por_defecto and f.activo limit 1;
  if v_flujo is null then raise exception 'No hay un flujo de aprobación por defecto. Pídale a Planeación que lo configure.' using errcode = 'P0001'; end if;
  select coalesce(max(ronda), 0) + 1 into v_ronda from public.gm_solicitud_pasos where solicitud_id = v_id;
  insert into public.gm_solicitud_pasos (solicitud_id, ronda, orden, nombre, funcion, suplente_funcion, plazo_dias, estado, inicio_en)
  select v_id, v_ronda, fp.orden, fp.nombre, fp.funcion, fp.suplente_funcion, fp.plazo_dias,
         case when fp.orden = (select min(orden) from public.gm_flujo_pasos where flujo_id = v_flujo) then 'pendiente' else 'bloqueado' end,
         case when fp.orden = (select min(orden) from public.gm_flujo_pasos where flujo_id = v_flujo) then now() end
    from public.gm_flujo_pasos fp where fp.flujo_id = v_flujo;
  update public.gm_solicitudes
     set estado = 'pendiente', flujo_id = v_flujo, ronda = v_ronda, enviada_en = now(),
         limite_en = public.gm_sumar_dias_habiles(now(), v_plazo)
   where gm_solicitudes.id = v_id;
  perform public.gm_evento(v_id, 'enviada', jsonb_build_object('ronda', v_ronda));

  perform public.gm_aviso(v_id, 'c-gm-acuse', auth.uid());
  for v_paso in select p.funcion, p.suplente_funcion from public.gm_solicitud_pasos p where p.solicitud_id = v_id and p.ronda = v_ronda and p.estado = 'pendiente' loop
    perform public.gm_aviso(v_id, 'c-gm-turno', a, '{}'::jsonb)
      from (select distinct x as a from (select public.gm_aprobadores(v_paso.funcion) x union all select public.gm_aprobadores(v_paso.suplente_funcion)) y where x is not null and x <> auth.uid()) z;
  end loop;

  return query select s.id, s.folio, s.estado from public.gm_solicitudes s where s.id = v_id;
end;
$$;

/** ¿Puede quien pregunta decidir el paso en turno de esta solicitud? Devuelve el paso, o nada. */
create or replace function public.gm_paso_para_mi(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.gm_solicitudes s
    join public.gm_solicitud_pasos p on p.solicitud_id = s.id and p.ronda = s.ronda and p.estado = 'pendiente'
   where s.id = p_id and s.estado in ('pendiente', 'revision')
     and s.solicitante_id <> auth.uid()
     and public.gm_nivel_actual() in ('revisor', 'gestor')
     and (public.has_role_at_least('admin') or p.funcion = public.gm_funcion_actual() or p.suplente_funcion = public.gm_funcion_actual())
   limit 1;
$$;

revoke all on function public.gm_paso_para_mi(uuid) from public, anon, authenticated;

/** Aprobar, devolver o rechazar el paso en turno. La nota es obligatoria (20 caracteres), también al aprobar. */
create or replace function public.gm_decidir(p_id uuid, p_decision text, p_nota text, p_lote boolean default false)
returns table (id uuid, estado text, paso_siguiente text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paso uuid;
  p record;
  s record;
  v_sig record;
  v_estado text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_admin boolean := false;
  a uuid;
begin
  if p_decision not in ('aprobar', 'devolver', 'rechazar') then raise exception 'La decisión no es válida.' using errcode = 'invalid_parameter_value'; end if;
  if char_length(v_nota) < 20 then raise exception 'La nota de la decisión debe tener al menos 20 caracteres.' using errcode = 'check_violation'; end if;
  if p_lote and p_decision = 'rechazar' then raise exception 'Rechazar se hace una por una.' using errcode = 'invalid_parameter_value'; end if;
  select * into s from public.gm_solicitudes where gm_solicitudes.id = p_id for update;
  if not found then raise exception 'La solicitud no existe.' using errcode = 'no_data_found'; end if;
  if s.solicitante_id = auth.uid() then raise exception 'Nadie decide sobre su propia solicitud.' using errcode = '42501'; end if;
  v_paso := public.gm_paso_para_mi(p_id);
  if v_paso is null then
    raise exception 'Esta solicitud no espera tu decisión (estado %).', s.estado using errcode = '42501';
  end if;
  select * into p from public.gm_solicitud_pasos where gm_solicitud_pasos.id = v_paso;
  v_admin := not (p.funcion = public.gm_funcion_actual() or p.suplente_funcion = public.gm_funcion_actual());

  update public.gm_solicitud_pasos
     set estado = case p_decision when 'aprobar' then 'aprobado' when 'devolver' then 'devuelto' else 'rechazado' end,
         decidido_por = auth.uid(), decidido_en = now(), nota = v_nota, por_admin = v_admin
   where gm_solicitud_pasos.id = v_paso;

  if p_decision = 'aprobar' then
    select * into v_sig from public.gm_solicitud_pasos x
     where x.solicitud_id = p_id and x.ronda = s.ronda and x.estado = 'bloqueado' order by x.orden limit 1;
    if found then
      update public.gm_solicitud_pasos set estado = 'pendiente', inicio_en = now() where gm_solicitud_pasos.id = v_sig.id;
      v_estado := 'revision';
      for a in select distinct x from (select public.gm_aprobadores(v_sig.funcion) x union all select public.gm_aprobadores(v_sig.suplente_funcion)) y where x is not null loop
        perform public.gm_aviso(p_id, 'c-gm-turno', a);
      end loop;
      perform public.gm_aviso(p_id, 'c-gm-avance', s.solicitante_id, jsonb_build_object('paso', p.nombre, 'nota', v_nota));
    else
      v_estado := 'aprobada';
      perform public.gm_aviso(p_id, 'c-gm-final', s.solicitante_id, jsonb_build_object('paso', p.nombre, 'nota', v_nota));
    end if;
  elsif p_decision = 'devolver' then
    v_estado := 'devuelta';
    update public.gm_solicitud_pasos set estado = 'omitido' where solicitud_id = p_id and ronda = s.ronda and estado = 'bloqueado';
    perform public.gm_aviso(p_id, 'c-gm-devuelta', s.solicitante_id, jsonb_build_object('paso', p.nombre, 'nota', v_nota));
  else
    v_estado := 'rechazada';
    update public.gm_solicitud_pasos set estado = 'omitido' where solicitud_id = p_id and ronda = s.ronda and estado = 'bloqueado';
    perform public.gm_aviso(p_id, 'c-gm-final', s.solicitante_id, jsonb_build_object('paso', p.nombre, 'nota', v_nota));
  end if;

  update public.gm_solicitudes
     set estado = v_estado,
         aplicacion = case when v_estado = 'aprobada' then 'sin_aplicar' else null end,
         resuelta_en = case when v_estado in ('aprobada', 'rechazada') then now() end,
         resuelta_por = case when v_estado in ('aprobada', 'rechazada') then auth.uid() end
   where gm_solicitudes.id = p_id;

  perform public.gm_evento(p_id, case p_decision when 'aprobar' then 'paso_aprobado' when 'devolver' then 'devuelta' else 'rechazada' end,
    jsonb_build_object('paso', p.nombre, 'orden', p.orden, 'nota', v_nota, 'por_admin', v_admin, 'lote', p_lote));
  if v_estado = 'aprobada' then perform public.gm_evento(p_id, 'aprobada', '{}'::jsonb); end if;

  return query select p_id, v_estado, (select x.nombre from public.gm_solicitud_pasos x where x.solicitud_id = p_id and x.ronda = s.ronda and x.estado = 'pendiente' limit 1);
end;
$$;

/** Aprobar o devolver varias, cada una en su propia transacción: una que falla no tumba a las demás. */
create or replace function public.gm_decidir_lote(p_ids uuid[], p_decision text, p_nota text)
returns table (id uuid, ok boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare x uuid;
begin
  if p_decision not in ('aprobar', 'devolver') then raise exception 'En bloque solo se aprueba o se devuelve.' using errcode = 'invalid_parameter_value'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No hay solicitudes elegidas.' using errcode = 'invalid_parameter_value'; end if;
  if array_length(p_ids, 1) > 50 then raise exception 'En bloque se admiten hasta 50 solicitudes.' using errcode = 'invalid_parameter_value'; end if;
  foreach x in array p_ids loop
    begin
      perform public.gm_decidir(x, p_decision, p_nota, true);
      return query select x, true, ''::text;
    exception when others then
      return query select x, false, sqlerrm;
    end;
  end loop;
end;
$$;

create or replace function public.gm_cancelar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.gm_solicitudes where gm_solicitudes.id = p_id for update;
  if not found or not public.gm_solicitud_visible(p_id) then raise exception 'La solicitud no existe.' using errcode = 'no_data_found'; end if;
  if not (s.solicitante_id = auth.uid() or public.gm_puede('gestionar')) then raise exception 'Solo quien la creó, o Planeación, la cancela.' using errcode = '42501'; end if;
  if s.estado not in ('borrador', 'pendiente', 'devuelta') then raise exception 'Una solicitud en revisión o ya resuelta no se cancela.' using errcode = 'check_violation'; end if;
  update public.gm_solicitudes set estado = 'cancelada' where gm_solicitudes.id = p_id;
  update public.gm_solicitud_pasos set estado = 'omitido' where solicitud_id = p_id and ronda = s.ronda and estado in ('bloqueado', 'pendiente');
  perform public.gm_evento(p_id, 'cancelada', '{}'::jsonb);
end;
$$;

create or replace function public.gm_comentar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gm_solicitud_visible(p_id) then raise exception 'La solicitud no existe.' using errcode = 'no_data_found'; end if;
  if char_length(btrim(coalesce(p_texto, ''))) < 2 or char_length(p_texto) > 1000 then raise exception 'El comentario debe tener entre 2 y 1000 caracteres.' using errcode = 'check_violation'; end if;
  perform public.gm_evento(p_id, 'comentario', jsonb_build_object('texto', btrim(p_texto)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Lo que Planeación hace al final: aplicar en el Master y conciliar
-- -----------------------------------------------------------------------------

create or replace function public.gm_marcar_aplicada(p_id uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación marca un cambio como aplicado en el Master.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_nota, ''))) < 5 then raise exception 'Escriba una nota corta de lo que se aplicó.' using errcode = 'check_violation'; end if;
  update public.gm_solicitudes
     set aplicacion = 'aplicada', aplicada_en = now(), aplicada_por = auth.uid()
   where gm_solicitudes.id = p_id and estado = 'aprobada' and aplicacion = 'sin_aplicar';
  if not found then raise exception 'La solicitud no está aprobada y pendiente de aplicar.' using errcode = 'check_violation'; end if;
  perform public.gm_evento(p_id, 'aplicada', jsonb_build_object('nota', btrim(p_nota)));
end;
$$;

/**
 * Compara lo aprobado con la captura vigente del Master: si todas las líneas ya están como se pidió,
 * la solicitud pasa a «reflejada». Devuelve las que cambió.
 */
create or replace function public.gm_conciliar(p_periodo text, p_sede text)
returns table (id uuid, folio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  l record;
  fila record;
  ok boolean;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación concilia con el Master.' using errcode = '42501'; end if;
  if public.gm_carga('ms_actdir', p_periodo, p_sede) is null then return; end if;
  for s in select * from public.gm_solicitudes x where x.periodo = p_periodo and x.sede = p_sede and x.estado = 'aprobada' and x.aplicacion in ('sin_aplicar', 'aplicada') loop
    ok := true;
    for l in select * from public.gm_solicitud_lineas where solicitud_id = s.id loop
      select * into fila from public.gm_actdir_filas(p_periodo, p_sede) a
       where (l.codigo is not null and a.codigo = l.codigo)
          or (l.codigo is null and lower(btrim(coalesce(a.nombre, ''))) = lower(btrim(coalesce(l.nombre, '')))) limit 1;
      if s.tipo = 'eliminar' then
        ok := ok and (not found or fila.activa is false);
      elsif s.tipo = 'nuevo' then
        ok := ok and found and fila.activa is not false;
      else
        ok := ok and found and lower(btrim(coalesce(fila.nombre, ''))) = lower(btrim(coalesce(l.nombre, fila.nombre, '')))
              and (l.tipo_actividad is null or (case when fila.directa is true then 'directa' when fila.directa is false then 'apoyo' end) is not distinct from l.tipo_actividad);
      end if;
      exit when not ok;
    end loop;
    if ok then
      update public.gm_solicitudes set aplicacion = 'reflejada', reflejada_en = now() where gm_solicitudes.id = s.id;
      insert into public.gm_eventos (solicitud_id, tipo, actor_id, periodo, sede, datos) values (s.id, 'reflejada', auth.uid(), s.periodo, s.sede, '{"por":"captura del Master"}'::jsonb);
      perform public.gm_aviso(s.id, 'c-gm-final', s.solicitante_id, jsonb_build_object('paso', 'Reflejada en el Master', 'nota', 'La captura más reciente del Master ya trae el cambio.'));
      return query select s.id, s.folio;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Leer solicitudes: la lista y el detalle
-- -----------------------------------------------------------------------------

create or replace function public.gm_listar(p_periodo text default null, p_sede text default null)
returns table (
  id uuid, folio text, tipo text, estado text, aplicacion text, prioridad text,
  solicitante_id uuid, solicitante text, unidad_id uuid, unidad text, periodo text, sede text,
  paso_orden smallint, paso_nombre text, paso_funcion text, total_pasos smallint,
  enviada_en timestamptz, limite_en timestamptz, dias_restantes integer, actualizada_en timestamptz,
  lineas jsonb, es_mia boolean, puedo_decidir boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('ver') then raise exception 'Gestión Master: sin permiso.' using errcode = '42501'; end if;
  return query
    select s.id, s.folio, s.tipo, s.estado, s.aplicacion, s.prioridad,
           s.solicitante_id, pr.full_name, s.unidad_id, u.name, s.periodo, s.sede,
           cur.orden, cur.nombre, cur.funcion,
           (select count(*)::smallint from public.gm_solicitud_pasos x where x.solicitud_id = s.id and x.ronda = s.ronda),
           s.enviada_en, s.limite_en,
           case when s.estado in ('pendiente', 'revision') and s.limite_en is not null
                then case when s.limite_en >= now() then public.gm_dias_habiles(now(), s.limite_en) else - public.gm_dias_habiles(s.limite_en, now()) end end,
           s.actualizada_en,
           coalesce((select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'nombre', l.nombre, 'origen_codigo', l.origen_codigo) order by l.orden) from public.gm_solicitud_lineas l where l.solicitud_id = s.id), '[]'::jsonb),
           s.solicitante_id = auth.uid(),
           public.gm_paso_para_mi(s.id) is not null
      from public.gm_solicitudes s
      left join public.profiles pr on pr.id = s.solicitante_id
      left join public.units u on u.id = s.unidad_id
      left join lateral (select x.orden, x.nombre, x.funcion from public.gm_solicitud_pasos x where x.solicitud_id = s.id and x.ronda = s.ronda and x.estado = 'pendiente' limit 1) cur on true
     where public.gm_solicitud_visible(s.id)
       and (p_periodo is null or p_periodo = '' or s.periodo = p_periodo)
       and (p_sede is null or p_sede = '' or s.sede = p_sede)
     order by (s.estado in ('pendiente', 'revision')) desc, s.actualizada_en desc
     limit 500;
end;
$$;

create or replace function public.gm_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.gm_solicitud_visible(p_id) then raise exception 'La solicitud no existe o no puedes verla.' using errcode = 'no_data_found'; end if;
  select jsonb_build_object(
    'id', s.id, 'folio', s.folio, 'tipo', s.tipo, 'estado', s.estado, 'aplicacion', s.aplicacion, 'prioridad', s.prioridad,
    'solicitante_id', s.solicitante_id, 'solicitante', pr.full_name, 'unidad_id', s.unidad_id, 'unidad', u.name,
    'periodo', s.periodo, 'sede', s.sede, 'justificacion', s.justificacion, 'ronda', s.ronda,
    'enviada_en', s.enviada_en, 'limite_en', s.limite_en, 'resuelta_en', s.resuelta_en, 'aplicada_en', s.aplicada_en, 'reflejada_en', s.reflejada_en, 'creada_en', s.creada_en,
    'es_mia', s.solicitante_id = auth.uid(),
    'puedo_editar', s.solicitante_id = auth.uid() and s.estado in ('borrador', 'devuelta'),
    'puedo_cancelar', (s.solicitante_id = auth.uid() or public.gm_puede('gestionar')) and s.estado in ('borrador', 'pendiente', 'devuelta'),
    'puedo_decidir', public.gm_paso_para_mi(s.id) is not null,
    'lineas', coalesce((select jsonb_agg(to_jsonb(l) - 'solicitud_id' order by l.orden) from public.gm_solicitud_lineas l where l.solicitud_id = s.id), '[]'::jsonb),
    'pasos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'ronda', p.ronda, 'orden', p.orden, 'nombre', p.nombre, 'funcion', p.funcion, 'estado', p.estado, 'inicio_en', p.inicio_en,
        'decidido_en', p.decidido_en, 'decidido_por', dp.full_name, 'nota', p.nota, 'por_admin', p.por_admin, 'plazo_dias', p.plazo_dias) order by p.ronda, p.orden)
        from public.gm_solicitud_pasos p left join public.profiles dp on dp.id = p.decidido_por where p.solicitud_id = s.id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'actor', ap.full_name, 'datos', e.datos, 'creado_en', e.creado_en) order by e.creado_en, e.id)
        from public.gm_eventos e left join public.profiles ap on ap.id = e.actor_id where e.solicitud_id = s.id), '[]'::jsonb)
  ) into r
  from public.gm_solicitudes s
  left join public.profiles pr on pr.id = s.solicitante_id
  left join public.units u on u.id = s.unidad_id
  where s.id = p_id;
  return r;
end;
$$;

/** Seguimiento: cuánto tarda cada paso (promedio en días hábiles) y cuántos esperan hoy. */
create or replace function public.gm_tiempos_por_paso(p_periodo text default null, p_sede text default null)
returns table (funcion text, nombre text, decididas integer, promedio_dias numeric, pendientes integer, mayor_espera_dias integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('revisar') then raise exception 'Solo quien revisa ve los tiempos por paso.' using errcode = '42501'; end if;
  return query
    select p.funcion, max(p.nombre),
           count(*) filter (where p.decidido_en is not null)::int,
           round(avg(public.gm_dias_habiles(p.inicio_en, p.decidido_en)) filter (where p.decidido_en is not null and p.inicio_en is not null), 1),
           count(*) filter (where p.estado = 'pendiente')::int,
           max(public.gm_dias_habiles(p.inicio_en, now())) filter (where p.estado = 'pendiente')::int
      from public.gm_solicitud_pasos p
      join public.gm_solicitudes s on s.id = p.solicitud_id
     where public.gm_solicitud_visible(s.id)
       and (p_periodo is null or p_periodo = '' or s.periodo = p_periodo)
       and (p_sede is null or p_sede = '' or s.sede = p_sede)
     group by p.funcion
     order by p.funcion;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Configurar: funciones y flujos (gestor)
-- -----------------------------------------------------------------------------

create or replace function public.gm_guardar_funcion(p_codigo text, p_nombre text, p_activa boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación configura las funciones de aprobación.' using errcode = '42501'; end if;
  insert into public.gm_funciones (codigo, nombre, activa, orden)
  values (lower(btrim(p_codigo)), btrim(p_nombre), coalesce(p_activa, true), coalesce((select max(orden) from public.gm_funciones), 0) + 1)
  on conflict (codigo) do update set nombre = excluded.nombre, activa = excluded.activa;
end;
$$;

/** Guarda un flujo con sus pasos. Un flujo en uso no se toca: lo que está en curso conserva su copia de los pasos. */
create or replace function public.gm_guardar_flujo(p_id uuid, p_nombre text, p_descripcion text, p_plazo_dias integer, p_pasos jsonb, p_por_defecto boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_p jsonb;
  v_i int := 0;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación configura los flujos.' using errcode = '42501'; end if;
  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then raise exception 'Un flujo necesita al menos un paso.' using errcode = 'check_violation'; end if;
  if jsonb_array_length(p_pasos) > 8 then raise exception 'Un flujo admite hasta 8 pasos.' using errcode = 'check_violation'; end if;
  for v_p in select * from jsonb_array_elements(p_pasos) loop
    if not exists (select 1 from public.gm_funciones f where f.codigo = v_p ->> 'funcion' and f.activa) then
      raise exception 'La función «%» no existe o está apagada.', v_p ->> 'funcion' using errcode = 'check_violation';
    end if;
  end loop;
  if coalesce(p_por_defecto, false) then
    update public.gm_flujos set por_defecto = false where por_defecto and (v_id is null or gm_flujos.id <> v_id);
  end if;
  if v_id is null then
    insert into public.gm_flujos (nombre, descripcion, plazo_dias, por_defecto, creado_por)
    values (btrim(p_nombre), coalesce(p_descripcion, ''), coalesce(p_plazo_dias, 15), coalesce(p_por_defecto, false), auth.uid())
    returning gm_flujos.id into v_id;
  else
    update public.gm_flujos set nombre = btrim(p_nombre), descripcion = coalesce(p_descripcion, ''), plazo_dias = coalesce(p_plazo_dias, 15),
           por_defecto = coalesce(p_por_defecto, false), actualizado_en = now()
     where gm_flujos.id = v_id;
    if not found then raise exception 'El flujo no existe.' using errcode = 'no_data_found'; end if;
    delete from public.gm_flujo_pasos where flujo_id = v_id;
  end if;
  for v_p in select * from jsonb_array_elements(p_pasos) loop
    v_i := v_i + 1;
    insert into public.gm_flujo_pasos (flujo_id, orden, nombre, funcion, suplente_funcion, plazo_dias)
    values (v_id, v_i, btrim(v_p ->> 'nombre'), v_p ->> 'funcion', nullif(v_p ->> 'suplente_funcion', ''), nullif(v_p ->> 'plazo_dias', '')::smallint);
  end loop;
  if not exists (select 1 from public.gm_flujos where por_defecto and activo) then
    update public.gm_flujos set por_defecto = true where gm_flujos.id = v_id;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Rua, el corte hacia el Warehouse y los nombres
-- -----------------------------------------------------------------------------

/** Importa el histórico de Rua (una vez, o las veces que haga falta: el folio de Rua es la llave). */
create or replace function public.gm_importar_rua(p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación importa el histórico de Rua.' using errcode = '42501'; end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then raise exception 'Se espera una lista de solicitudes.' using errcode = 'invalid_parameter_value'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Máximo 5000 solicitudes por importación.' using errcode = 'invalid_parameter_value'; end if;
  with datos as (select * from jsonb_to_recordset(p_filas) as x(folio text, tipo text, estado text, prioridad text, solicitante text, unidad text, concepto text, creada_en timestamptz, resuelta_en timestamptz, lineas jsonb, etapas jsonb) where nullif(btrim(coalesce(x.folio, '')), '') is not null),
       ins as (
         insert into public.gm_rua_solicitudes (folio, tipo, estado, prioridad, solicitante, unidad, concepto, creada_en, resuelta_en, lineas, etapas, importada_por)
         select left(btrim(folio), 40), left(coalesce(tipo, ''), 40), left(coalesce(estado, ''), 40), left(coalesce(prioridad, ''), 40), left(coalesce(solicitante, ''), 200), left(coalesce(unidad, ''), 200),
                left(coalesce(concepto, ''), 4000), creada_en, resuelta_en, coalesce(lineas, '[]'::jsonb), coalesce(etapas, '[]'::jsonb), auth.uid()
           from datos
         on conflict (folio) do update
           set tipo = excluded.tipo, estado = excluded.estado, prioridad = excluded.prioridad, solicitante = excluded.solicitante, unidad = excluded.unidad,
               concepto = excluded.concepto, creada_en = excluded.creada_en, resuelta_en = excluded.resuelta_en, lineas = excluded.lineas, etapas = excluded.etapas,
               importada_en = now(), importada_por = auth.uid()
         returning 1)
  select count(*) into n from ins;
  return n;
end;
$$;

/**
 * Las filas que se cargan al Warehouse al cerrar el corte (conjunto gm_solicitudes): un renglón por
 * evento y línea. El solicitante va como su id y la política del conjunto lo guarda como seudónimo.
 */
create or replace function public.gm_corte_filas(p_periodo text, p_sede text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación cierra el corte.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'folio', s.folio, 'tipo', s.tipo, 'evento', e.tipo, 'estado', s.estado,
           'paso', coalesce(e.datos ->> 'paso', ''), 'codigo', coalesce(l.codigo, ''), 'actividad', coalesce(l.nombre, ''),
           'unidad', coalesce(u.name, ''), 'solicitante', s.solicitante_id::text,
           'fecha', to_char(e.creado_en at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI')) order by e.creado_en, e.id, l.orden), '[]'::jsonb)
    into r
    from public.gm_eventos e
    join public.gm_solicitudes s on s.id = e.solicitud_id
    left join public.units u on u.id = s.unidad_id
    left join lateral (select * from public.gm_solicitud_lineas x where x.solicitud_id = s.id) l on true
   where e.periodo = p_periodo and e.sede = p_sede
     and e.tipo in ('enviada', 'paso_aprobado', 'devuelta', 'rechazada', 'cancelada', 'aprobada', 'aplicada', 'reflejada');
  return r;
end;
$$;

/** Anota que alguien vio los nombres de los docentes de un código (la llama la función warehouse antes de leer del Master). */
create or replace function public.gm_registrar_consulta_nombres(p_periodo text, p_sede text, p_codigo text, p_cantidad integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('nombres') then return false; end if;
  insert into public.gm_consultas_nombres (usuario_id, periodo, sede, codigo, cantidad)
  values (auth.uid(), left(coalesce(p_periodo, ''), 10), left(coalesce(p_sede, ''), 3), left(upper(coalesce(p_codigo, '')), 32), greatest(coalesce(p_cantidad, 0), 0));
  return true;
end;
$$;

/** Quién vio los nombres de los docentes (las últimas 50 consultas), con el nombre de quien consultó. Solo el gestor. */
create or replace function public.gm_consultas_nombres_listar()
returns table (usuario text, periodo text, sede text, codigo text, cantidad integer, creada_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gm_puede('gestionar') then raise exception 'Solo Planeación ve quién consultó los nombres.' using errcode = '42501'; end if;
  return query
    select coalesce(p.full_name, 'Persona retirada'), c.periodo, c.sede, c.codigo, c.cantidad, c.creada_en
      from public.gm_consultas_nombres c left join public.profiles p on p.id = c.usuario_id
     order by c.creada_en desc limit 50;
end;
$$;

/** El seudónimo que el Warehouse daría a cada identificación (misma sal y misma fórmula que wh_limpiar_fila). Solo el rol de servicio. */
create or replace function public.gm_seudonimos_de(p_ids text[])
returns table (id text, seudonimo text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare sal bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función warehouse calcula seudónimos.' using errcode = '42501';
  end if;
  select valor into sal from public.wh_secretos where clave = 'sal_seudonimo';
  return query select x, 'x-' || substr(encode(hmac(convert_to(btrim(x), 'UTF8'), sal, 'sha256'), 'hex'), 1, 10)
                 from unnest(p_ids) x where btrim(coalesce(x, '')) <> '';
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.gm_nivel_actual(), public.gm_funcion_actual(), public.gm_puede(text), public.gm_solicitud_visible(uuid),
  public.gm_dias_habiles(timestamptz, timestamptz), public.gm_sumar_dias_habiles(timestamptz, integer),
  public.gm_cortes(text), public.gm_buscar_codigos(text, text, text), public.gm_ficha_codigo(text, text, text),
  public.gm_actividades_periodo(text, text), public.gm_profesores_periodo(text, text), public.gm_mis_unidades(),
  public.gm_guardar_solicitud(uuid, text, text, uuid, text, text, text, jsonb, boolean),
  public.gm_decidir(uuid, text, text, boolean), public.gm_decidir_lote(uuid[], text, text), public.gm_cancelar(uuid), public.gm_comentar(uuid, text),
  public.gm_marcar_aplicada(uuid, text), public.gm_conciliar(text, text), public.gm_listar(text, text), public.gm_detalle(uuid),
  public.gm_tiempos_por_paso(text, text), public.gm_guardar_funcion(text, text, boolean),
  public.gm_guardar_flujo(uuid, text, text, integer, jsonb, boolean), public.gm_importar_rua(jsonb), public.gm_corte_filas(text, text),
  public.gm_registrar_consulta_nombres(text, text, text, integer), public.gm_seudonimos_de(text[]), public.gm_consultas_nombres_listar()
  from public, anon;

grant execute on function
  public.gm_nivel_actual(), public.gm_funcion_actual(), public.gm_puede(text), public.gm_solicitud_visible(uuid),
  public.gm_cortes(text), public.gm_buscar_codigos(text, text, text), public.gm_ficha_codigo(text, text, text),
  public.gm_actividades_periodo(text, text), public.gm_profesores_periodo(text, text), public.gm_mis_unidades(),
  public.gm_guardar_solicitud(uuid, text, text, uuid, text, text, text, jsonb, boolean),
  public.gm_decidir(uuid, text, text, boolean), public.gm_decidir_lote(uuid[], text, text), public.gm_cancelar(uuid), public.gm_comentar(uuid, text),
  public.gm_marcar_aplicada(uuid, text), public.gm_conciliar(text, text), public.gm_listar(text, text), public.gm_detalle(uuid),
  public.gm_tiempos_por_paso(text, text), public.gm_guardar_funcion(text, text, boolean),
  public.gm_guardar_flujo(uuid, text, text, integer, jsonb, boolean), public.gm_importar_rua(jsonb), public.gm_corte_filas(text, text),
  public.gm_registrar_consulta_nombres(text, text, text, integer), public.gm_consultas_nombres_listar()
  to authenticated;
grant execute on function public.gm_seudonimos_de(text[]), public.gm_puede(text), public.gm_nivel_actual() to service_role;

-- -----------------------------------------------------------------------------
-- 15. El conjunto gm_solicitudes del Warehouse (política de privacidad)
--
-- Al cerrar el corte, los eventos del periodo y la sede se cargan como un
-- conjunto más. Sin nombres de personas: el solicitante entra como seudónimo.
-- -----------------------------------------------------------------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('gm_solicitudes', 'permitir',
   '{folio,tipo,evento,estado,paso,codigo,actividad,unidad,solicitante,fecha}',
   '{solicitante}', '{}', '',
   'Solicitudes de Gestión Master (eventos por línea). Del solicitante solo queda un seudónimo; no hay nombres ni justificaciones.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- -----------------------------------------------------------------------------
-- 16. Plantillas de correo (se editan en la pantalla «Correos»; se envían con la función `correos`)
--
-- Tipo «aviso»: llevan {{titulo_aviso}} y {{detalle}} (y {{enlace}} para el botón).
-- Volver a aplicar esta migración no pisa lo que ya se escribió.
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-gm-acuse', 'plan', 'Gestión Master', 'Solicitud recibida', 'Al enviar una solicitud: acuse al solicitante', 'gm',
   'Solicitud {{folio}} recibida', 'Quedó registrada y espera la primera aprobación', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Su solicitud quedó registrada y siguió al primer paso de aprobación.\n{{detalle}}', 'Ver la solicitud', 'Puede seguirla en Gestión Master. Este aviso lo envía el portal de Planeación.', true, 300, 'aviso'),
  ('c-gm-turno', 'plan', 'Gestión Master', 'Una solicitud espera su decisión', 'Cuando un paso queda en su turno', 'gm',
   'Solicitud {{folio}}: espera su decisión', 'Revísela y decida con una nota', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Una solicitud de actividades del Master espera su decisión.\n{{detalle}}', 'Abrir la solicitud', 'Aprobar, devolver o rechazar exige una nota de al menos 20 caracteres.', true, 301, 'aviso'),
  ('c-gm-avance', 'plan', 'Gestión Master', 'Un paso aprobó su solicitud', 'Al aprobar un paso que no es el último', 'gm',
   'Solicitud {{folio}}: un paso la aprobó', 'Sigue el próximo paso del flujo', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Un paso del flujo aprobó su solicitud y pasó al siguiente.\n{{detalle}}', 'Ver la solicitud', '', true, 302, 'aviso'),
  ('c-gm-devuelta', 'plan', 'Gestión Master', 'Solicitud devuelta con nota', 'Cuando un paso la devuelve', 'gm',
   'Solicitud {{folio}}: devuelta con una nota', 'Corríjala y envíela de nuevo', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Su solicitud fue devuelta. Lea la nota, corríjala y envíela otra vez; el flujo empieza de nuevo.\n{{detalle}}', 'Corregir la solicitud', '', true, 303, 'aviso'),
  ('c-gm-final', 'plan', 'Gestión Master', 'Decisión final de la solicitud', 'Al aprobarla del todo, rechazarla o reflejarse en el Master', 'gm',
   'Solicitud {{folio}}: decisión final', 'Ya hay una decisión final', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Hay una decisión final sobre su solicitud.\n{{detalle}}', 'Ver la solicitud', 'Si la aprobaron, Planeación aplica el cambio en el Master y la solicitud pasa a «reflejada» cuando la captura del Master lo confirma.', true, 304, 'aviso')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
