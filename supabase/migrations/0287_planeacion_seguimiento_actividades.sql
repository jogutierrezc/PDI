-- =============================================================================
-- PDI · 0287 · Planeación y Seguimiento · FASE 2 (actividades, asignación y avisos)
--
-- Qué es. Cada OFICINA crea su planificación (actividades) y la asigna a su gente,
-- conforme a la construcción actual de usuarios del portal (0057 unidades, 0078
-- campus del miembro), más la cola de avisos por correo. Contrato completo:
-- docs/planeacion-seguimiento/CONTRATO-BD-F2.md. Requiere 0286 (fase 1).
--
-- MODELO DE USUARIOS (no se inventa un organigrama paralelo)
--   · Oficina = unidad (units, cualquier kind). Una unidad «participa» del plan si es
--     la oficina de una línea de la versión vigente o tiene actividades.
--   · Papel en la oficina = unit_role con la herencia por cercanía de unit_role_at
--     (ps_pertenencia lo calcula para CUALQUIER perfil, no solo para auth.uid()):
--       jefe → gestor · editor → colaborador · visor → lector.
--   · Combinado con el nivel del rol de acceso (ps_nivel, 0286): el poder efectivo en una
--     oficina es el MÍNIMO entre lo que da el nivel y lo que da el unit_role en ella
--     (ps_poder). admin (profiles.role = admin o ps_nivel admin) opera todo.
--     lector y aprobador ven todas las oficinas del plan en modo lectura.
--   · «De la oficina» (asignable) = pertenencia propia o heredada de un ancestro
--     (unit_chain) con papel editor o jefe, perfil activo y nivel de módulo ≥ colaborador.
--     La visora (visor) no es asignable.
--   · Campus: unit_members.campus_id NULL = todos. Si el miembro tiene campus y la actividad
--     otro distinto, la base NO asigna salvo que quien asigna confirme (p_confirmar_campus).
--
-- OBJETOS NUEVOS
--   tablas: ps_config, ps_actividades, ps_checklist, ps_asignaciones, ps_comentarios, ps_avisos
--   ps_eventos: columnas actividad_id y oficina_unit_id
--   internas: ps_nivel_de, ps_pertenencia, ps_rol_en, ps_asignable, ps_gestores_de, ps_hoy,
--     ps_estado_texto, ps_actividad_json, ps_evento_act, ps_aviso, ps_actividad_tiene_avances,
--     ps_conflictos_campus, ps_actividad_normalizar, ps_actividad_insertar, ps_asignar_interno, *_guard
--   cliente: ps_poder, ps_ver_oficina, ps_oficinas_visibles, ps_equipo_oficina, ps_carga_equipo,
--     ps_mis_actividades, ps_actividades_oficina, ps_actividad_detalle, ps_actividad_crear,
--     ps_actividad_editar, ps_actividad_eliminar, ps_actividad_mover, ps_actividad_asignar,
--     ps_actividad_desasignar, ps_actividades_asignar, ps_actividad_transferir, ps_checklist_*,
--     ps_comentar, ps_actividades_cargar, ps_bitacora_oficina, ps_config_leer, ps_config_guardar
--   servicio: ps_generar_avisos_vencimiento
--   plantillas c-ps-* en correo_templates
--
-- Idempotente. Todo DELETE y UPDATE lleva WHERE (safeupdate, 0095). Sin escritura directa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bitácora: a qué actividad y oficina se refiere cada evento
-- -----------------------------------------------------------------------------

alter table public.ps_eventos add column if not exists actividad_id uuid;
alter table public.ps_eventos add column if not exists oficina_unit_id uuid;
create index if not exists ps_eventos_actividad_idx on public.ps_eventos (actividad_id, creado_en);
create index if not exists ps_eventos_oficina_idx on public.ps_eventos (oficina_unit_id, creado_en);

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

create or replace function public.ps_dias_validos(p integer[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(d between 0 and 60), true) from unnest(p) as d;
$$;

/** Plazos de los avisos de vencimiento. Una sola fila. Valores POR DEFECTO, editables por el administrador del módulo. */
create table if not exists public.ps_config (
  id                   boolean primary key default true,
  dias_antes           integer[] not null default '{7,3,0}',
  vencida_max_avisos   smallint not null default 3,
  vencida_gestor_horas integer not null default 24,
  activo               boolean not null default true,
  actualizado_por      uuid references public.profiles (id) on delete set null,
  actualizado_en       timestamptz not null default now(),
  constraint ps_config_unica check (id),
  constraint ps_config_dias check (cardinality(dias_antes) <= 6 and public.ps_dias_validos(dias_antes)),
  constraint ps_config_max check (vencida_max_avisos between 0 and 10),
  constraint ps_config_horas check (vencida_gestor_horas between 0 and 720)
);

insert into public.ps_config (id) values (true) on conflict (id) do nothing;

comment on table public.ps_config is
  'Planeación y Seguimiento (0287): plazos de los avisos de vencimiento. Por defecto: avisar a 7 y 3 días y el día de la fecha; vencida: aviso diario hasta 3 veces y al gestor a las 24 h. El usuario debe confirmarlos.';

create table if not exists public.ps_actividades (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.ps_planes (id) on delete restrict,
  linea_id            uuid references public.ps_lineas (id) on delete restrict,
  oficina_unit_id     uuid not null references public.units (id) on delete restrict,
  campus_id           uuid references public.campuses (id) on delete restrict,
  titulo              text not null,
  descripcion         text not null default '',
  estado              text not null default 'por_iniciar',
  prioridad           text not null default 'Medio',
  inicio              date,
  fin                 date,
  es_hito             boolean not null default false,
  version_creacion_id uuid not null references public.ps_versiones (id) on delete restrict,
  creada_por          uuid references public.profiles (id) on delete set null,
  creada_en           timestamptz not null default now(),
  actualizada_en      timestamptz not null default now(),
  completada_en       timestamptz,
  orden               integer not null default 0,
  constraint ps_act_titulo check (char_length(btrim(titulo)) between 3 and 200),
  constraint ps_act_desc check (char_length(descripcion) <= 4000),
  constraint ps_act_estado check (estado in ('por_iniciar', 'en_curso', 'en_riesgo', 'en_revision', 'hecho')),
  constraint ps_act_prioridad check (prioridad in ('Crítico', 'Alto', 'Medio', 'Bajo')),
  constraint ps_act_fechas check (inicio is null or fin is null or fin >= inicio),
  constraint ps_act_hito check (not es_hito or fin is not null),
  constraint ps_act_hecho check ((estado = 'hecho') = (completada_en is not null))
);

create index if not exists ps_act_oficina_idx on public.ps_actividades (oficina_unit_id, estado);
create index if not exists ps_act_plan_idx on public.ps_actividades (plan_id);
create index if not exists ps_act_linea_idx on public.ps_actividades (linea_id);
create index if not exists ps_act_fin_idx on public.ps_actividades (fin) where estado <> 'hecho';

comment on table public.ps_actividades is
  'Planeación y Seguimiento (0287): tarea concreta de una oficina. linea_id NULL = actividad propia de la oficina. version_creacion_id guarda la versión del plan vigente al crearla y no cambia aunque cambie la versión.';

create table if not exists public.ps_checklist (
  id          uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.ps_actividades (id) on delete cascade,
  orden       integer not null default 0,
  texto       text not null,
  hecho       boolean not null default false,
  hecho_por   uuid references public.profiles (id) on delete set null,
  hecho_en    timestamptz,
  creado_en   timestamptz not null default now(),
  constraint ps_chk_texto check (char_length(btrim(texto)) between 1 and 200)
);
create index if not exists ps_chk_actividad_idx on public.ps_checklist (actividad_id, orden);

create table if not exists public.ps_asignaciones (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.ps_actividades (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  asignado_por uuid references public.profiles (id) on delete set null,
  asignado_en  timestamptz not null default now(),
  nota         text not null default '',
  quitado_en   timestamptz,
  quitado_por  uuid references public.profiles (id) on delete set null,
  motivo       text not null default '',
  constraint ps_asig_textos check (char_length(nota) <= 1000 and char_length(motivo) <= 1000),
  constraint ps_asig_quitado check (quitado_en is null or quitado_en >= asignado_en)
);

-- Una asignación ACTIVA por persona y actividad.
create unique index if not exists ps_asig_activa on public.ps_asignaciones (actividad_id, profile_id) where quitado_en is null;
create index if not exists ps_asig_perfil_idx on public.ps_asignaciones (profile_id) where quitado_en is null;
create index if not exists ps_asig_actividad_idx on public.ps_asignaciones (actividad_id, asignado_en);

comment on table public.ps_asignaciones is
  'Planeación y Seguimiento (0287): historial de asignaciones. Quitar o transferir cierra la fila (quitado_en, motivo); no se borra.';

create table if not exists public.ps_comentarios (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.ps_actividades (id) on delete cascade,
  autor_id     uuid references public.profiles (id) on delete set null,
  tipo         text not null default 'comentario',
  texto        text not null,
  creado_en    timestamptz not null default now(),
  constraint ps_com_tipo check (tipo in ('comentario', 'transferencia', 'devolucion', 'asignacion', 'cambio_estado')),
  constraint ps_com_texto check (char_length(btrim(texto)) between 1 and 2000)
);
create index if not exists ps_com_actividad_idx on public.ps_comentarios (actividad_id, creado_en);

/** La cola de correos (como gm_avisos). La llena ps_aviso(); la vacía la función de borde planeacion-seguimiento. */
create table if not exists public.ps_avisos (
  id              bigint generated always as identity primary key,
  plantilla       text not null,
  destinatario_id uuid not null references public.profiles (id) on delete cascade,
  actividad_id    uuid references public.ps_actividades (id) on delete set null,
  oficina_unit_id uuid references public.units (id) on delete set null,
  objeto_tipo     text not null default 'actividad',
  datos           jsonb not null default '{}'::jsonb,
  estado          text not null default 'pendiente',
  intentos        smallint not null default 0,
  error           text not null default '',
  dedupe          text,
  creado_en       timestamptz not null default now(),
  enviado_en      timestamptz,
  constraint ps_avisos_estado check (estado in ('pendiente', 'enviado', 'error', 'omitido')),
  constraint ps_avisos_plantilla check (plantilla ~ '^c-ps-[a-z0-9-]{1,30}$'),
  constraint ps_avisos_dedupe unique (dedupe)
);
create index if not exists ps_avisos_pendientes_idx on public.ps_avisos (creado_en) where estado = 'pendiente';

comment on table public.ps_avisos is
  'Planeación y Seguimiento (0287): cola de correos. dedupe (único) impide repetir el mismo aviso de vencimiento el mismo día.';

-- -----------------------------------------------------------------------------
-- 3. Seguridad de las tablas: solo lectura, por oficina
-- -----------------------------------------------------------------------------

alter table public.ps_config enable row level security;
alter table public.ps_actividades enable row level security;
alter table public.ps_checklist enable row level security;
alter table public.ps_asignaciones enable row level security;
alter table public.ps_comentarios enable row level security;
alter table public.ps_avisos enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Usuarios: nivel, pertenencia y poder efectivo
-- -----------------------------------------------------------------------------

/** El nivel de módulo de CUALQUIER perfil (ps_nivel_actual es solo el de quien pregunta). */
create or replace function public.ps_nivel_de(p_perfil uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when not pr.is_active then 'none'
      when pr.role = 'admin' then 'admin'
      when pr.access_role_id is null then 'none'
      else coalesce((
        select case when r.all_screens or 'planeacion_seguimiento' = any (r.screens) then r.ps_nivel else 'none' end
          from public.access_roles r where r.id = pr.access_role_id
      ), 'none')
    end
    from public.profiles pr where pr.id = p_perfil
  ), 'none');
$$;

/** La pertenencia que manda sobre una unidad para un perfil: la más cercana del árbol (igual que unit_role_at) y su campus. */
create or replace function public.ps_pertenencia(p_perfil uuid, p_unit uuid)
returns table (rol text, campus_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text, m.campus_id
    from public.unit_members m
    join public.unit_chain(p_unit) ch on ch.id = m.unit_id
   where m.profile_id = p_perfil
   order by ch.depth asc, case m.role when 'jefe' then 3 when 'editor' then 2 else 1 end desc
   limit 1;
$$;

create or replace function public.ps_rol_en(p_perfil uuid, p_unit uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select (public.ps_pertenencia(p_perfil, p_unit)).rol;
$$;

/**
 * El poder de quien pregunta en una oficina: 'admin' · 'gestor' · 'colaborador' · 'lector' · null (no la ve).
 * Mínimo entre el nivel (ps_nivel) y el unit_role (jefe→gestor, editor→colaborador, visor→lector).
 * lector y aprobador ven todas las oficinas, solo en lectura.
 */
create or replace function public.ps_poder(p_unit uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
  v_rol text;
  v_tope integer;
  v_unit integer;
begin
  if v_nivel = 'none' or p_unit is null then return null; end if;
  if v_nivel = 'admin' then
    return case when exists (select 1 from public.units where id = p_unit) then 'admin' else null end;
  end if;
  if not exists (select 1 from public.units where id = p_unit) then return null; end if;
  if v_nivel in ('lector', 'aprobador') then return 'lector'; end if;
  v_rol := public.ps_rol_en(auth.uid(), p_unit);
  if v_rol is null then return null; end if;
  v_tope := case v_nivel when 'gestor' then 3 else 2 end;
  v_unit := case v_rol when 'jefe' then 3 when 'editor' then 2 else 1 end;
  return case least(v_tope, v_unit) when 3 then 'gestor' when 2 then 'colaborador' else 'lector' end;
end;
$$;

comment on function public.ps_poder(uuid) is
  'Planeación y Seguimiento (0287): el poder de quien pregunta en una oficina = mínimo(nivel ps, unit_role). admin · gestor · colaborador · lector · null.';

create or replace function public.ps_ver_oficina(p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ps_poder(p_unit) is not null;
$$;

/** ¿Puede esta persona recibir actividades de la oficina? Papel editor/jefe heredado o propio y nivel de módulo ≥ colaborador. */
create or replace function public.ps_asignable(p_perfil uuid, p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.ps_rol_en(p_perfil, p_unit) in ('editor', 'jefe'), false)
     and public.ps_nivel_de(p_perfil) in ('colaborador', 'gestor', 'admin');
$$;

/** Los gestores de una oficina: jefe efectivo con nivel gestor o admin. */
create or replace function public.ps_gestores_de(p_unit uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.profile_id
    from public.unit_members m
    join public.unit_chain(p_unit) c on c.id = m.unit_id
   where public.ps_rol_en(m.profile_id, p_unit) = 'jefe'
     and public.ps_nivel_de(m.profile_id) in ('gestor', 'admin');
$$;

/** «Hoy» en Bogotá. */
create or replace function public.ps_hoy()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

create or replace function public.ps_estado_texto(p_estado text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_estado
    when 'por_iniciar' then 'Por iniciar' when 'en_curso' then 'En curso' when 'en_riesgo' then 'En riesgo'
    when 'en_revision' then 'En revisión del gestor' when 'hecho' then 'Hecho' else p_estado end;
$$;

-- Políticas de lectura (después de ps_poder).
drop policy if exists ps_actividades_lectura on public.ps_actividades;
create policy ps_actividades_lectura on public.ps_actividades for select to authenticated
  using (public.ps_ver_oficina(oficina_unit_id));

drop policy if exists ps_checklist_lectura on public.ps_checklist;
create policy ps_checklist_lectura on public.ps_checklist for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_asignaciones_lectura on public.ps_asignaciones;
create policy ps_asignaciones_lectura on public.ps_asignaciones for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_comentarios_lectura on public.ps_comentarios;
create policy ps_comentarios_lectura on public.ps_comentarios for select to authenticated
  using (exists (select 1 from public.ps_actividades a where a.id = actividad_id and public.ps_ver_oficina(a.oficina_unit_id)));

drop policy if exists ps_avisos_lectura on public.ps_avisos;
create policy ps_avisos_lectura on public.ps_avisos for select to authenticated using (public.ps_puede('gestionar'));

drop policy if exists ps_config_lectura on public.ps_config;
create policy ps_config_lectura on public.ps_config for select to authenticated using (public.ps_puede('gestionar'));

revoke all on public.ps_config, public.ps_actividades, public.ps_checklist, public.ps_asignaciones, public.ps_comentarios, public.ps_avisos
  from public, anon, authenticated;
grant select on public.ps_config, public.ps_actividades, public.ps_checklist, public.ps_asignaciones, public.ps_comentarios, public.ps_avisos
  to authenticated, service_role;
-- La cola de correos solo la toca la función de borde con el rol de servicio.
grant insert, update on public.ps_avisos to service_role;
grant usage on sequence public.ps_avisos_id_seq to service_role;

-- -----------------------------------------------------------------------------
-- 5. Disparadores de integridad
-- -----------------------------------------------------------------------------

create or replace function public.ps_actividades_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_id <> old.plan_id or new.oficina_unit_id <> old.oficina_unit_id
     or new.version_creacion_id <> old.version_creacion_id or new.creada_en <> old.creada_en
     or new.creada_por is distinct from old.creada_por and old.creada_por is not null and new.creada_por is not null then
    raise exception 'El plan, la oficina, la versión de creación y la autoría de una actividad no se pueden cambiar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ps_actividades_inmutables on public.ps_actividades;
create trigger ps_actividades_inmutables before update on public.ps_actividades
  for each row execute function public.ps_actividades_guard();

/** El asignado debe pertenecer a la oficina de la actividad (piso de integridad, vale hasta para la clave de servicio). */
create or replace function public.ps_asignaciones_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid;
begin
  if tg_op = 'INSERT' then
    select oficina_unit_id into v_unit from public.ps_actividades where id = new.actividad_id;
    if v_unit is null
       or coalesce(public.ps_rol_en(new.profile_id, v_unit) not in ('editor', 'jefe'), true)
       or not exists (select 1 from public.profiles where id = new.profile_id and is_active) then
      raise exception 'La persona no pertenece a la oficina de la actividad: no se le puede asignar.' using errcode = '23514';
    end if;
    return new;
  end if;
  -- UPDATE: solo se cierra una asignación abierta (quitado_en, quitado_por, motivo); lo demás no cambia.
  if old.quitado_en is not null then
    raise exception 'Una asignación cerrada no se modifica.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'quitado_en' - 'quitado_por' - 'motivo') <> (to_jsonb(old) - 'quitado_en' - 'quitado_por' - 'motivo') then
    raise exception 'De una asignación solo se puede cerrar (quitado_en, quitado_por, motivo).' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ps_asignaciones_integridad on public.ps_asignaciones;
create trigger ps_asignaciones_integridad before insert or update on public.ps_asignaciones
  for each row execute function public.ps_asignaciones_guard();

create or replace function public.ps_comentarios_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Un comentario no se modifica.' using errcode = '42501';
end;
$$;

drop trigger if exists ps_comentarios_inmutable on public.ps_comentarios;
create trigger ps_comentarios_inmutable before update on public.ps_comentarios
  for each row execute function public.ps_comentarios_guard();

-- -----------------------------------------------------------------------------
-- 6. Utilidades internas
-- -----------------------------------------------------------------------------

create or replace function public.ps_evento_act(p_tipo text, p_plan uuid, p_version uuid, p_clave text, p_actividad uuid, p_unit uuid, p_datos jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ps_eventos (tipo, actor_id, plan_id, version_id, linea_clave, actividad_id, oficina_unit_id, datos)
  values (p_tipo, auth.uid(), p_plan, p_version, p_clave, p_actividad, p_unit, coalesce(p_datos, '{}'::jsonb));
$$;

/** Hook de la fase 3: una actividad con avances no se elimina. Hoy (sin ps_avances) siempre es false. */
create or replace function public.ps_actividad_tiene_avances(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean := false;
begin
  if to_regclass('public.ps_avances') is not null then
    execute 'select exists (select 1 from public.ps_avances where actividad_id = $1)' into v using p_id;
  end if;
  return coalesce(v, false);
end;
$$;

/** La actividad como JSON para la interfaz. Sin correos de nadie. */
create or replace function public.ps_actividad_json(a public.ps_actividades)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id,
    'plan_id', a.plan_id,
    'linea_clave', (select l.clave from public.ps_lineas l where l.id = a.linea_id),
    'linea_nombre', (select vl.nombre from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id
                      where p.id = a.plan_id and vl.linea_id = a.linea_id),
    'oficina_unit_id', a.oficina_unit_id,
    'oficina', (select u.name from public.units u where u.id = a.oficina_unit_id),
    'oficina_codigo', (select u.code from public.units u where u.id = a.oficina_unit_id),
    'campus_id', a.campus_id,
    'campus', (select c.name from public.campuses c where c.id = a.campus_id),
    'titulo', a.titulo,
    'descripcion', a.descripcion,
    'estado', a.estado,
    'prioridad', a.prioridad,
    'inicio', a.inicio,
    'fin', a.fin,
    'es_hito', a.es_hito,
    'version_creacion_id', a.version_creacion_id,
    'creada_por', a.creada_por,
    'creada_en', a.creada_en,
    'completada_en', a.completada_en,
    'orden', a.orden,
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.profile_id, 'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), 'desde', s.asignado_en)
                       order by s.asignado_en)
        from public.ps_asignaciones s join public.profiles pr on pr.id = s.profile_id
       where s.actividad_id = a.id and s.quitado_en is null), '[]'::jsonb),
    'checklist', jsonb_build_object(
      'total', (select count(*) from public.ps_checklist k where k.actividad_id = a.id),
      'hechos', (select count(*) from public.ps_checklist k where k.actividad_id = a.id and k.hecho)),
    'vencida', (a.fin is not null and a.estado <> 'hecho' and a.fin < public.ps_hoy()),
    'dias_para_vencer', case when a.fin is null then null else a.fin - public.ps_hoy() end
  );
$$;

/**
 * Encola un aviso de correo. Devuelve true si lo encoló (false si p_dedupe ya existía o no hay destinatario).
 * datos lleva lo que la actividad sabe de sí misma más lo que pase p_extra; la función de borde lo redacta.
 */
create or replace function public.ps_aviso(p_plantilla text, p_destino uuid, p_actividad uuid, p_extra jsonb default '{}'::jsonb, p_dedupe text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_actor text;
  n integer;
begin
  if p_destino is null then return false; end if;
  select a1.titulo, a1.fin, a1.estado, a1.prioridad, a1.oficina_unit_id, a1.plan_id,
         u.name as oficina, l.clave as linea_clave,
         (select vl.nombre from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id
           where p.id = a1.plan_id and vl.linea_id = a1.linea_id) as linea_nombre,
         c.name as campus
    into v
    from public.ps_actividades a1
    left join public.units u on u.id = a1.oficina_unit_id
    left join public.ps_lineas l on l.id = a1.linea_id
    left join public.campuses c on c.id = a1.campus_id
   where a1.id = p_actividad;
  if not found then return false; end if;
  select coalesce(nullif(btrim(full_name), ''), '') into v_actor from public.profiles where id = auth.uid();
  insert into public.ps_avisos (plantilla, destinatario_id, actividad_id, oficina_unit_id, dedupe, datos)
  values (p_plantilla, p_destino, p_actividad, v.oficina_unit_id, p_dedupe, jsonb_build_object(
    'actividad', v.titulo,
    'oficina', coalesce(v.oficina, ''),
    'linea', case when v.linea_clave is null then '' else v.linea_clave || coalesce(' · ' || v.linea_nombre, '') end,
    'campus', coalesce(v.campus, 'Todos los campus'),
    'fin', coalesce(to_char(v.fin, 'DD/MM/YYYY'), ''),
    'fin_iso', v.fin,
    'estado', v.estado,
    'estado_texto', public.ps_estado_texto(v.estado),
    'prioridad', v.prioridad,
    'actor', coalesce(v_actor, '')) || coalesce(p_extra, '{}'::jsonb))
  on conflict (dedupe) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

/** Conflictos de campus: miembros con campus propio distinto del de la actividad (ambos con campus). */
create or replace function public.ps_conflictos_campus(p_perfiles uuid[], p_unit uuid, p_campus uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'perfil_id', pr.id,
    'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
    'campus_miembro_id', pt.campus_id,
    'campus_miembro', (select c.name from public.campuses c where c.id = pt.campus_id),
    'campus_actividad_id', p_campus,
    'campus_actividad', (select c.name from public.campuses c where c.id = p_campus))), '[]'::jsonb)
  from unnest(coalesce(p_perfiles, '{}'::uuid[])) as x (id)
  join public.profiles pr on pr.id = x.id
  cross join lateral public.ps_pertenencia(pr.id, p_unit) pt
  where p_campus is not null and pt.campus_id is not null and pt.campus_id <> p_campus;
$$;

/**
 * Valida y normaliza una actividad (de una pantalla o de una fila del Excel). Devuelve
 * {errores:[{fila,campo,mensaje}], datos:{…}, conflictos:[…]}. Acepta alias de columnas del Excel.
 * p_linea_actual: la clave que ya tiene (edición); si no cambia, no se vuelve a exigir en la versión vigente.
 */
create or replace function public.ps_actividad_normalizar(p_fila integer, p_obj jsonb, p_plan uuid, p_unit uuid, p_es_admin boolean, p_linea_actual text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  r jsonb;
  pl public.ps_planes%rowtype;
  lo date; hi date;
  o_titulo text; o_desc text := ''; o_prior text := 'Medio';
  o_ini date; o_fin date; o_hito boolean := false;
  o_linea uuid; o_clave text; o_campus uuid;
  o_resp uuid[] := '{}'::uuid[];
  v_of uuid; v_ok boolean;
  campo text; x text; pid uuid;
  lista text[];
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return jsonb_build_object('errores', jsonb_build_array(public.ps_err(p_fila, 'fila', 'La fila debe ser un objeto con los campos de la actividad.')), 'datos', null, 'conflictos', '[]'::jsonb);
  end if;
  select * into pl from public.ps_planes where id = p_plan;
  lo := make_date(pl.anio_ini, 1, 1);
  hi := make_date(pl.anio_fin, 12, 31);

  -- título
  v := public.ps_j(p_obj, array['titulo', 'actividad']);
  if v is null or not public.ps_j_escalar(v) or btrim(v #>> '{}') = '' then
    e := e || public.ps_err(p_fila, 'titulo', 'El título es obligatorio.');
  else
    o_titulo := btrim(v #>> '{}');
    if char_length(o_titulo) < 3 or char_length(o_titulo) > 200 then
      e := e || public.ps_err(p_fila, 'titulo', 'El título debe tener entre 3 y 200 caracteres.');
    end if;
  end if;

  -- descripción
  v := public.ps_j(p_obj, array['descripcion', 'desc']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción debe ser un texto.');
    else
      o_desc := btrim(v #>> '{}');
      if char_length(o_desc) > 4000 then e := e || public.ps_err(p_fila, 'descripcion', 'La descripción supera los 4000 caracteres.'); end if;
    end if;
  end if;

  -- prioridad
  v := public.ps_j(p_obj, array['prioridad', 'prior']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser un texto.');
    else
      t := public.ps_texto_norm(v #>> '{}');
      if t = '' then null;
      elsif t = 'critico' then o_prior := 'Crítico';
      elsif t = 'alto' then o_prior := 'Alto';
      elsif t = 'medio' then o_prior := 'Medio';
      elsif t = 'bajo' then o_prior := 'Bajo';
      else e := e || public.ps_err(p_fila, 'prioridad', 'La prioridad debe ser Crítico, Alto, Medio o Bajo.'); end if;
    end if;
  end if;

  -- fechas
  for campo in select unnest(array['inicio', 'fin']) loop
    v := public.ps_j(p_obj, array[campo]);
    if v is not null then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        e := e || public.ps_err(p_fila, campo, 'La fecha debe venir como AAAA-MM-DD.');
      else
        begin
          if campo = 'inicio' then o_ini := (v #>> '{}')::date; else o_fin := (v #>> '{}')::date; end if;
        exception when others then
          e := e || public.ps_err(p_fila, campo, 'La fecha no existe en el calendario.');
        end;
      end if;
    end if;
  end loop;
  if o_ini is not null and o_fin is not null and o_fin < o_ini then
    e := e || public.ps_err(p_fila, 'fin', 'La fecha de fin no puede ser anterior a la de inicio.');
  end if;
  if o_ini is not null and (o_ini < lo or o_ini > hi) then
    e := e || public.ps_err(p_fila, 'inicio', format('El inicio debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;
  if o_fin is not null and (o_fin < lo or o_fin > hi) then
    e := e || public.ps_err(p_fila, 'fin', format('El fin debe estar dentro de la vigencia del plan (%s a %s).', lo, hi));
  end if;

  -- hito
  v := public.ps_j(p_obj, array['es_hito', 'hito']);
  if v is not null then
    t := public.ps_texto_norm(v #>> '{}');
    if jsonb_typeof(v) = 'boolean' then o_hito := (v #>> '{}')::boolean;
    elsif t in ('si', 'true', '1', 'x') then o_hito := true;
    elsif t in ('no', 'false', '0', '') then o_hito := false;
    else e := e || public.ps_err(p_fila, 'es_hito', 'El hito debe ser Sí o No.'); end if;
  end if;
  if o_hito and o_fin is null then
    e := e || public.ps_err(p_fila, 'fin', 'Un hito necesita fecha de fin.');
  end if;
  if o_hito and o_ini is not null and o_fin is not null and o_ini <> o_fin then
    e := e || public.ps_err(p_fila, 'inicio', 'En un hito el inicio y el fin son el mismo día (o se deja el inicio vacío).');
  end if;

  -- línea (versión vigente; de la misma oficina salvo administración)
  v := public.ps_j(p_obj, array['linea_clave', 'linea', 'proyecto']);
  if v is not null then
    if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'linea', 'La línea debe ser su clave (texto o número).');
    else
      o_clave := btrim(v #>> '{}');
      if o_clave = '' then
        o_clave := null;
      else
        select l.id, vl.oficina_unit_id into o_linea, v_of
          from public.ps_lineas l
          join public.ps_planes p on p.id = l.plan_id
          join public.ps_version_lineas vl on vl.linea_id = l.id and vl.version_id = p.version_vigente_id
         where l.plan_id = p_plan and l.clave = o_clave;
        if o_linea is null then
          if p_linea_actual is not null and o_clave = p_linea_actual then
            select l.id into o_linea from public.ps_lineas l where l.plan_id = p_plan and l.clave = o_clave;
          else
            e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» no existe en la versión vigente del plan.', o_clave));
          end if;
        elsif not p_es_admin and p_linea_actual is distinct from o_clave and v_of is distinct from p_unit then
          e := e || public.ps_err(p_fila, 'linea', format('La línea «%s» es de otra oficina (o no tiene oficina asignada).', o_clave));
        end if;
      end if;
    end if;
  end if;

  -- campus: por id o por nombre; vacío = todos los campus
  v := public.ps_j(p_obj, array['campus_id']);
  if v is not null then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un identificador válido.');
    else
      o_campus := (v #>> '{}')::uuid;
      if not exists (select 1 from public.campuses where id = o_campus) then
        e := e || public.ps_err(p_fila, 'campus', 'El campus no existe en la lista de campus del portal.');
        o_campus := null;
      end if;
    end if;
  else
    v := public.ps_j(p_obj, array['campus']);
    if v is not null then
      if not public.ps_j_escalar(v) then e := e || public.ps_err(p_fila, 'campus', 'El campus debe ser un texto.');
      elsif btrim(v #>> '{}') <> '' then
        r := public.ps_resolver_campus(v #>> '{}');
        if (r ->> 'ok')::boolean then o_campus := nullif(r ->> 'id', '')::uuid;
        else e := e || public.ps_err(p_fila, 'campus', format('El campus «%s» no existe en la lista de campus del portal.', btrim(v #>> '{}'))); end if;
      end if;
    end if;
  end if;

  -- responsables: lista (o texto con ; o ,) de correos o ids de perfil; deben ser de la oficina
  v := public.ps_j(p_obj, array['responsables', 'responsable', 'correo']);
  if v is not null then
    if jsonb_typeof(v) = 'array' then
      select array_agg(btrim(x1)) into lista from jsonb_array_elements_text(v) as x1;
    elsif public.ps_j_escalar(v) then
      select array_agg(btrim(x1)) into lista from unnest(regexp_split_to_array(v #>> '{}', '\s*[;,]\s*')) as x1;
    else
      e := e || public.ps_err(p_fila, 'responsable', 'El responsable debe ser un correo o una lista de correos.');
    end if;
    if lista is not null then
      if cardinality(lista) > 10 then
        e := e || public.ps_err(p_fila, 'responsable', 'Una actividad admite hasta 10 responsables.');
      else
        foreach x in array lista loop
          continue when x = '';
          pid := null;
          if x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select id into pid from public.profiles where id = x::uuid;
          else
            select id into pid from public.profiles where lower(email) = lower(x) limit 1;
          end if;
          if pid is null then
            e := e || public.ps_err(p_fila, 'responsable', format('No hay una persona con «%s» en el portal.', x));
          elsif not public.ps_asignable(pid, p_unit) then
            e := e || public.ps_err(p_fila, 'responsable', format('«%s» no pertenece a la oficina (como editor o jefe) o no tiene acceso al módulo.', x));
          elsif not (pid = any (o_resp)) then
            o_resp := o_resp || pid;
          end if;
        end loop;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'errores', e,
    'conflictos', public.ps_conflictos_campus(o_resp, p_unit, o_campus),
    'datos', jsonb_build_object(
      'titulo', o_titulo, 'descripcion', o_desc, 'prioridad', o_prior, 'inicio', o_ini, 'fin', o_fin, 'es_hito', o_hito,
      'linea_id', o_linea, 'linea_clave', o_clave, 'campus_id', o_campus, 'responsables', to_jsonb(o_resp)));
end;
$$;

/** Inserta una actividad ya validada, sus asignaciones, los avisos y el evento. Devuelve su id. */
create or replace function public.ps_actividad_insertar(p_plan uuid, p_version uuid, p_unit uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_orden integer;
  r uuid;
  v_resp uuid[];
begin
  select coalesce(max(orden), 0) + 1 into v_orden from public.ps_actividades where oficina_unit_id = p_unit;
  insert into public.ps_actividades (plan_id, linea_id, oficina_unit_id, campus_id, titulo, descripcion, prioridad, inicio, fin, es_hito, version_creacion_id, creada_por, orden)
  values (p_plan, nullif(p_datos ->> 'linea_id', '')::uuid, p_unit, nullif(p_datos ->> 'campus_id', '')::uuid,
          p_datos ->> 'titulo', coalesce(p_datos ->> 'descripcion', ''), p_datos ->> 'prioridad',
          nullif(p_datos ->> 'inicio', '')::date, nullif(p_datos ->> 'fin', '')::date,
          coalesce((p_datos ->> 'es_hito')::boolean, false), p_version, auth.uid(), v_orden)
  returning id into v_id;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_resp from jsonb_array_elements_text(coalesce(p_datos -> 'responsables', '[]'::jsonb)) as x;
  foreach r in array v_resp loop
    insert into public.ps_asignaciones (actividad_id, profile_id, asignado_por, nota) values (v_id, r, auth.uid(), 'Asignada al crear la actividad.');
    perform public.ps_aviso('c-ps-asignacion', r, v_id);
  end loop;
  perform public.ps_evento_act('actividad.creada', p_plan, p_version, p_datos ->> 'linea_clave', v_id, p_unit,
    jsonb_build_object('titulo', p_datos ->> 'titulo', 'responsables', to_jsonb(v_resp), 'fin', p_datos ->> 'fin'));
  return v_id;
end;
$$;

/** Asigna una persona (validada por quien llama). Devuelve true si la asignación es nueva. */
create or replace function public.ps_asignar_interno(p_actividad uuid, p_perfil uuid, p_nota text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.ps_asignaciones where actividad_id = p_actividad and profile_id = p_perfil and quitado_en is null) then
    return false;
  end if;
  insert into public.ps_asignaciones (actividad_id, profile_id, asignado_por, nota) values (p_actividad, p_perfil, auth.uid(), coalesce(p_nota, ''));
  perform public.ps_aviso('c-ps-asignacion', p_perfil, p_actividad, jsonb_build_object('nota', coalesce(p_nota, '')));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Lecturas
-- -----------------------------------------------------------------------------

/**
 * Oficinas donde quien pregunta opera (o que ve en lectura), con su poder efectivo.
 * Globales (lector, aprobador, admin): las unidades que participan del plan; con p_todas el admin ve todas.
 * gestor y colaborador: donde tienen pertenencia propia, más las que participan y heredan.
 */
create or replace function public.ps_oficinas_visibles(p_todas boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text := public.ps_nivel_actual();
begin
  if v_nivel = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'nombre')
    from (
      select jsonb_build_object(
        'unit_id', u.id, 'codigo', u.code, 'nombre', u.name, 'kind', u.kind, 'parent_id', u.parent_id,
        'poder', public.ps_poder(u.id),
        'unit_role', public.ps_rol_en(auth.uid(), u.id),
        'lineas', (select count(*) from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id where vl.oficina_unit_id = u.id),
        'activas', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id and a.estado <> 'hecho'),
        'total', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id),
        'vencidas', (select count(*) from public.ps_actividades a where a.oficina_unit_id = u.id and a.estado <> 'hecho' and a.fin < public.ps_hoy())
      ) as x
      from public.units u
      where public.ps_poder(u.id) is not null
        and (
          (p_todas and v_nivel = 'admin')
          or exists (select 1 from public.ps_actividades a where a.oficina_unit_id = u.id)
          or exists (select 1 from public.ps_planes p join public.ps_version_lineas vl on vl.version_id = p.version_vigente_id where vl.oficina_unit_id = u.id)
          or exists (select 1 from public.unit_members m where m.unit_id = u.id and m.profile_id = auth.uid())
        )
    ) s
  ), '[]'::jsonb);
end;
$$;

/** Los miembros de la oficina: asignables o no, con su carga. El correo solo lo ve el gestor y el admin. */
create or replace function public.ps_equipo_oficina(p_unit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_intimo boolean;
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  v_intimo := v_poder in ('admin', 'gestor');
  return coalesce((
    select jsonb_agg(x order by x ->> 'nombre')
    from (
      select jsonb_build_object(
        'perfil_id', pr.id,
        'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
        'correo', case when v_intimo then to_jsonb(pr.email) else 'null'::jsonb end,
        'unit_role', pt.rol,
        'papel', case pt.rol when 'jefe' then 'gestor' when 'editor' then 'colaborador' else 'lector' end,
        'campus_id', pt.campus_id,
        'campus', (select c.name from public.campuses c where c.id = pt.campus_id),
        'nivel_modulo', case when v_intimo then to_jsonb(public.ps_nivel_de(pr.id)) else 'null'::jsonb end,
        'asignable', public.ps_asignable(pr.id, p_unit),
        'activas', (select count(*) from public.ps_asignaciones s join public.ps_actividades a on a.id = s.actividad_id
                     where s.profile_id = pr.id and s.quitado_en is null and a.oficina_unit_id = p_unit and a.estado <> 'hecho')
      ) as x
      from public.profiles pr
      cross join lateral public.ps_pertenencia(pr.id, p_unit) pt
      where pr.is_active
        and pr.id in (select m.profile_id from public.unit_members m join public.unit_chain(p_unit) c on c.id = m.unit_id)
    ) s
  ), '[]'::jsonb);
end;
$$;

/** La carga del equipo: activas por persona, más las sin responsable. Gestor y admin. */
create or replace function public.ps_carga_equipo(p_unit uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: la carga del equipo es del gestor de la oficina.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'oficina_unit_id', p_unit,
    'sin_asignar', (select count(*) from public.ps_actividades a
                     where a.oficina_unit_id = p_unit and a.estado <> 'hecho'
                       and not exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null)),
    'equipo', coalesce((
      select jsonb_agg(x order by (x ->> 'activas')::int desc, x ->> 'nombre')
      from (
        select jsonb_build_object(
          'perfil_id', pr.id,
          'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
          'papel', case pt.rol when 'jefe' then 'gestor' when 'editor' then 'colaborador' else 'lector' end,
          'campus_id', pt.campus_id,
          'asignable', public.ps_asignable(pr.id, p_unit),
          'activas', cg.activas, 'por_iniciar', cg.por_iniciar, 'en_curso', cg.en_curso, 'en_riesgo', cg.en_riesgo,
          'en_revision', cg.en_revision, 'vencidas', cg.vencidas
        ) as x
        from public.profiles pr
        cross join lateral public.ps_pertenencia(pr.id, p_unit) pt
        cross join lateral (
          select count(*) filter (where a.estado <> 'hecho') as activas,
                 count(*) filter (where a.estado = 'por_iniciar') as por_iniciar,
                 count(*) filter (where a.estado = 'en_curso') as en_curso,
                 count(*) filter (where a.estado = 'en_riesgo') as en_riesgo,
                 count(*) filter (where a.estado = 'en_revision') as en_revision,
                 count(*) filter (where a.estado <> 'hecho' and a.fin < public.ps_hoy()) as vencidas
            from public.ps_asignaciones s join public.ps_actividades a on a.id = s.actividad_id
           where s.profile_id = pr.id and s.quitado_en is null and a.oficina_unit_id = p_unit
        ) cg
        where pr.is_active
          and pr.id in (select m.profile_id from public.unit_members m join public.unit_chain(p_unit) ch on ch.id = m.unit_id)
          and (public.ps_asignable(pr.id, p_unit) or cg.activas > 0)
      ) s
    ), '[]'::jsonb));
end;
$$;

/** Mis actividades: las asignadas a quien pregunta. Por omisión, las no hechas. */
create or replace function public.ps_mis_actividades(p_incluir_hechas boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.ps_nivel_actual() = 'none' then
    raise exception 'Sin permiso: no tiene acceso a Planeación y Seguimiento.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hoy', public.ps_hoy(),
    'actividades', coalesce((
      select jsonb_agg(public.ps_actividad_json(a) order by a.fin nulls last, a.orden)
        from public.ps_actividades a
       where exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = auth.uid() and s.quitado_en is null)
         and (p_incluir_hechas or a.estado <> 'hecho')
    ), '[]'::jsonb));
end;
$$;

/**
 * Actividades de una oficina con filtros (jsonb, todos opcionales):
 *   estado (texto o lista), prioridad, perfil (uuid, responsable), sin_asignar (bool), linea_clave, campus_id,
 *   vencidas (bool), fin_desde, fin_hasta (AAAA-MM-DD), q (texto en el título), incluir_subunidades (bool), limite (≤ 1000).
 */
create or replace function public.ps_actividades_oficina(p_unit uuid, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_poder text := public.ps_poder(p_unit);
  v_estados text[];
  v_prior text[];
  v_perfil uuid;
  v_campus uuid;
  v_desde date; v_hasta date;
  v_q text := lower(btrim(coalesce(f ->> 'q', '')));
  v_lim integer := 500;
  v_sub boolean := coalesce(f ->> 'incluir_subunidades', 'false') = 'true';
  v_total integer;
  v_lista jsonb;
  v_ids uuid[];
begin
  if v_poder is null then
    raise exception 'Sin permiso: esa oficina no está a su alcance.' using errcode = '42501';
  end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception 'Los filtros deben ser un objeto.' using errcode = '22023';
  end if;
  begin
    v_estados := case jsonb_typeof(f -> 'estado') when 'string' then array[f ->> 'estado']
                 when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'estado') as x) end;
    v_prior := case jsonb_typeof(f -> 'prioridad') when 'string' then array[f ->> 'prioridad']
               when 'array' then (select array_agg(x) from jsonb_array_elements_text(f -> 'prioridad') as x) end;
    v_perfil := nullif(f ->> 'perfil', '')::uuid;
    v_campus := nullif(f ->> 'campus_id', '')::uuid;
    v_desde := nullif(f ->> 'fin_desde', '')::date;
    v_hasta := nullif(f ->> 'fin_hasta', '')::date;
    if f ? 'limite' then v_lim := least(greatest((f ->> 'limite')::integer, 1), 1000); end if;
  exception when others then
    raise exception 'Algún filtro tiene un valor inválido.' using errcode = '22023';
  end;

  select coalesce(array_agg(x.id order by x.fin nulls last, x.orden), '{}'::uuid[]) into v_ids
    from (
      select a.id, a.fin, a.orden
        from public.ps_actividades a
       where (a.oficina_unit_id = p_unit
              or (v_sub and a.oficina_unit_id in (
                    with recursive d as (select id from public.units where id = p_unit
                                         union all select u.id from public.units u join d on u.parent_id = d.id)
                    select id from d)))
         and public.ps_ver_oficina(a.oficina_unit_id)
         and (v_estados is null or a.estado = any (v_estados))
         and (v_prior is null or a.prioridad = any (v_prior))
         and (v_perfil is null or exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = v_perfil and s.quitado_en is null))
         and (coalesce(f ->> 'sin_asignar', 'false') <> 'true' or not exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null))
         and (nullif(f ->> 'linea_clave', '') is null or a.linea_id = (select l.id from public.ps_lineas l where l.plan_id = a.plan_id and l.clave = f ->> 'linea_clave'))
         and (v_campus is null or a.campus_id = v_campus)
         and (coalesce(f ->> 'vencidas', 'false') <> 'true' or (a.estado <> 'hecho' and a.fin < public.ps_hoy()))
         and (v_desde is null or a.fin >= v_desde)
         and (v_hasta is null or a.fin <= v_hasta)
         and (v_q = '' or position(v_q in lower(a.titulo)) > 0)
    ) x;
  v_total := cardinality(v_ids);
  v_ids := v_ids[1:v_lim];
  select coalesce(jsonb_agg(public.ps_actividad_json(a) order by array_position(v_ids, a.id)), '[]'::jsonb) into v_lista
    from public.ps_actividades a where a.id = any (v_ids);
  return jsonb_build_object(
    'oficina', (select jsonb_build_object('unit_id', u.id, 'nombre', u.name, 'codigo', u.code, 'poder', v_poder) from public.units u where u.id = p_unit),
    'total', v_total, 'actividades', v_lista);
end;
$$;

/** Una actividad con su checklist, su historial de asignaciones y sus comentarios. */
create or replace function public.ps_actividad_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
begin
  select * into a from public.ps_actividades where id = p_id;
  if not found or public.ps_poder(a.oficina_unit_id) is null then
    raise exception 'La actividad no existe o no está a su alcance.' using errcode = 'P0002';
  end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  return jsonb_build_object(
    'actividad', public.ps_actividad_json(a),
    'poder', v_poder,
    'checklist', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'orden', k.orden, 'texto', k.texto, 'hecho', k.hecho, 'hecho_en', k.hecho_en) order by k.orden, k.creado_en)
                             from public.ps_checklist k where k.actividad_id = a.id), '[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'perfil_id', s.profile_id, 'nombre', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
        'asignado_por', s.asignado_por, 'asignado_en', s.asignado_en, 'nota', s.nota,
        'quitado_en', s.quitado_en, 'motivo', s.motivo, 'activa', s.quitado_en is null) order by s.asignado_en)
        from public.ps_asignaciones s join public.profiles pr on pr.id = s.profile_id where s.actividad_id = a.id), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'autor_id', c.autor_id, 'autor', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), 'tipo', c.tipo, 'texto', c.texto, 'creado_en', c.creado_en) order by c.creado_en)
        from public.ps_comentarios c left join public.profiles pr on pr.id = c.autor_id where c.actividad_id = a.id), '[]'::jsonb));
end;
$$;

/** La bitácora de una oficina: gestor, admin y aprobador. */
create or replace function public.ps_bitacora_oficina(p_unit uuid, p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.ps_poder(p_unit) in ('admin', 'gestor'), false) or public.ps_nivel_actual() = 'aprobador') then
    raise exception 'Sin permiso: la bitácora de la oficina es del gestor, el aprobador y el administrador.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'actor_id', e.actor_id,
             'actor', coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), 'actividad_id', e.actividad_id,
             'linea_clave', e.linea_clave, 'datos', e.datos, 'creado_en', e.creado_en) order by e.id desc)
      from (select * from public.ps_eventos where oficina_unit_id = p_unit order by id desc limit least(greatest(coalesce(p_limite, 200), 1), 1000)) e
      left join public.profiles pr on pr.id = e.actor_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Escritura: actividades
-- -----------------------------------------------------------------------------

/**
 * Crea una actividad en una oficina. p_datos: titulo, descripcion, linea_clave, campus_id (o campus por nombre),
 * prioridad, inicio, fin, es_hito, responsables (lista de ids de perfil o correos). Solo gestor y admin.
 * Devuelve {ok:true, actividad} o, si algún responsable tiene otro campus y no se confirmó,
 * {ok:false, requiere_confirmacion:true, conflictos_campus:[…]} sin crear nada.
 */
create or replace function public.ps_actividad_crear(p_plan uuid, p_unit uuid, p_datos jsonb, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n jsonb;
  v_id uuid;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: crear actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  select * into v_plan from public.ps_planes where id = p_plan;
  if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
  if v_plan.version_vigente_id is null then
    raise exception 'El plan todavía no tiene una versión vigente: no se pueden crear actividades.' using errcode = '22023';
  end if;
  v_n := public.ps_actividad_normalizar(null, p_datos, p_plan, p_unit, v_poder = 'admin');
  if jsonb_array_length(v_n -> 'errores') > 0 then
    raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023';
  end if;
  if jsonb_array_length(v_n -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_n -> 'conflictos');
  end if;
  v_id := public.ps_actividad_insertar(p_plan, v_plan.version_vigente_id, p_unit, v_n -> 'datos');
  return jsonb_build_object('ok', true, 'conflictos_campus', v_n -> 'conflictos',
    'actividad', public.ps_actividad_json((select a from public.ps_actividades a where a.id = v_id)));
end;
$$;

/** Edita una actividad (gestor y admin). Campos: titulo, descripcion, linea_clave, campus_id o campus, prioridad, inicio, fin, es_hito. */
create or replace function public.ps_actividad_editar(p_id uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_clave text;
  v_mezcla jsonb;
  v_n jsonb;
  v_d jsonb;
  k text;
  v_dif jsonb := '{}'::jsonb;
  v_antes jsonb;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: editar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No hay cambios que guardar.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('titulo', 'descripcion', 'linea_clave', 'campus_id', 'campus', 'prioridad', 'inicio', 'fin', 'es_hito') then
      raise exception 'El campo «%» no se puede editar aquí.', k using errcode = '22023';
    end if;
  end loop;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  v_antes := jsonb_build_object('titulo', a.titulo, 'descripcion', a.descripcion, 'linea_clave', v_clave, 'campus_id', a.campus_id,
                                'prioridad', a.prioridad, 'inicio', a.inicio, 'fin', a.fin, 'es_hito', a.es_hito);
  v_mezcla := v_antes;
  if p_cambios ? 'campus' and not p_cambios ? 'campus_id' then v_mezcla := v_mezcla - 'campus_id'; end if;
  v_mezcla := v_mezcla || p_cambios;
  v_n := public.ps_actividad_normalizar(null, v_mezcla, a.plan_id, a.oficina_unit_id, v_poder = 'admin', v_clave);
  if jsonb_array_length(v_n -> 'errores') > 0 then
    raise exception '%', (v_n -> 'errores' -> 0 ->> 'mensaje') using errcode = '22023';
  end if;
  v_d := v_n -> 'datos';
  update public.ps_actividades set
    titulo = v_d ->> 'titulo', descripcion = coalesce(v_d ->> 'descripcion', ''), prioridad = v_d ->> 'prioridad',
    inicio = nullif(v_d ->> 'inicio', '')::date, fin = nullif(v_d ->> 'fin', '')::date,
    es_hito = coalesce((v_d ->> 'es_hito')::boolean, false), linea_id = nullif(v_d ->> 'linea_id', '')::uuid,
    campus_id = nullif(v_d ->> 'campus_id', '')::uuid, actualizada_en = now()
   where id = p_id;
  for k in select jsonb_object_keys(v_antes) loop
    if (v_antes -> k) is distinct from (v_d -> k) then
      v_dif := v_dif || jsonb_build_object(k, jsonb_build_object('antes', v_antes -> k, 'despues', coalesce(v_d -> k, 'null'::jsonb)));
    end if;
  end loop;
  perform public.ps_evento_act('actividad.editada', a.plan_id, a.version_creacion_id, v_d ->> 'linea_clave', p_id, a.oficina_unit_id, jsonb_build_object('cambios', v_dif));
  return public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id));
end;
$$;

/** Elimina una actividad (gestor y admin) mientras no tenga avances. Deja el evento con una copia de lo que había. */
create or replace function public.ps_actividad_eliminar(p_id uuid, p_motivo text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_clave text;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: eliminar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if char_length(v_motivo) > 1000 then raise exception 'El motivo supera los 1000 caracteres.' using errcode = '22023'; end if;
  if public.ps_actividad_tiene_avances(p_id) then
    raise exception 'La actividad ya tiene avances reportados: no se puede eliminar.' using errcode = '23503';
  end if;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  perform public.ps_evento_act('actividad.eliminada', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('copia', public.ps_actividad_json(a), 'motivo', v_motivo));
  delete from public.ps_actividades where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

/**
 * Mueve una actividad entre estados.
 *   colaborador: solo las suyas (asignadas) y solo entre por_iniciar, en_curso, en_riesgo y en_revision; no toca «hecho».
 *   gestor y admin: cualquiera de su oficina. Devolver de «en_revision» exige nota ≥ 20 caracteres.
 * TODO fase 3: nadie pasa a «hecho» una actividad cuyo avance reportó él mismo (la regla vive con ps_avances).
 */
create or replace function public.ps_actividad_mover(p_id uuid, p_estado text, p_nota text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_dev boolean;
  v_clave text;
  r uuid;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if p_estado is null or p_estado not in ('por_iniciar', 'en_curso', 'en_riesgo', 'en_revision', 'hecho') then
    raise exception 'El estado debe ser por_iniciar, en_curso, en_riesgo, en_revision o hecho.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then raise exception 'La nota supera los 1000 caracteres.' using errcode = '22023'; end if;
  if v_poder = 'lector' then
    raise exception 'Sin permiso: su acceso a esta oficina es de lectura.' using errcode = '42501';
  end if;
  if a.estado = p_estado then
    return jsonb_build_object('ok', true, 'cambio', false, 'actividad', public.ps_actividad_json(a));
  end if;
  if v_poder = 'colaborador' then
    if not exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_id and s.profile_id = auth.uid() and s.quitado_en is null) then
      raise exception 'Sin permiso: solo puede mover las actividades que tiene asignadas.' using errcode = '42501';
    end if;
    if p_estado = 'hecho' or a.estado = 'hecho' then
      raise exception 'Sin permiso: pasar a «Hecho» (o reabrir) es del gestor de la oficina; pida revisión con «En revisión».' using errcode = '42501';
    end if;
  end if;
  v_dev := a.estado = 'en_revision' and p_estado in ('por_iniciar', 'en_curso', 'en_riesgo') and v_poder in ('admin', 'gestor');
  if v_dev and char_length(v_nota) < 20 then
    raise exception 'Devolver una actividad en revisión exige una nota de al menos 20 caracteres.' using errcode = '22023';
  end if;
  update public.ps_actividades
     set estado = p_estado, completada_en = case when p_estado = 'hecho' then now() else null end, actualizada_en = now()
   where id = p_id;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  if v_nota <> '' then
    insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto)
    values (p_id, auth.uid(), case when v_dev then 'devolucion' else 'cambio_estado' end, v_nota);
  end if;
  perform public.ps_evento_act('actividad.movida', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('de', a.estado, 'a', p_estado, 'nota', v_nota, 'devuelta', v_dev));
  if v_dev then
    for r in select s.profile_id from public.ps_asignaciones s where s.actividad_id = p_id and s.quitado_en is null and s.profile_id is distinct from auth.uid() loop
      perform public.ps_aviso('c-ps-devuelto', r, p_id, jsonb_build_object('nota', v_nota));
    end loop;
  end if;
  if p_estado = 'hecho' then
    for r in select g from public.ps_gestores_de(a.oficina_unit_id) as g
             union select s.profile_id from public.ps_asignaciones s where s.actividad_id = p_id and s.quitado_en is null loop
      if r is distinct from auth.uid() then
        perform public.ps_aviso('c-ps-cumplida', r, p_id, jsonb_build_object('nota', v_nota));
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'cambio', true, 'actividad', public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id)));
end;
$$;

/**
 * Asigna personas a una actividad (se SUMAN a las que ya tiene). Solo gestor y admin; las personas deben ser de la oficina.
 * Devuelve {ok:true, asignados, ya_asignados, actividad} o {ok:false, requiere_confirmacion:true, conflictos_campus}.
 */
create or replace function public.ps_actividad_asignar(p_id uuid, p_perfiles uuid[], p_nota text default '', p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_lista uuid[];
  v_conf jsonb;
  r uuid;
  v_nuevos uuid[] := '{}'::uuid[];
  v_ya uuid[] := '{}'::uuid[];
  v_clave text;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: asignar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if char_length(v_nota) > 1000 then raise exception 'La nota supera los 1000 caracteres.' using errcode = '22023'; end if;
  if a.estado = 'hecho' then raise exception 'La actividad está hecha: no se asigna.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_lista from unnest(coalesce(p_perfiles, '{}'::uuid[])) as x where x is not null;
  if cardinality(v_lista) = 0 or cardinality(v_lista) > 20 then
    raise exception 'Indique de 1 a 20 personas.' using errcode = '22023';
  end if;
  foreach r in array v_lista loop
    if not public.ps_asignable(r, a.oficina_unit_id) then
      raise exception 'La persona % no pertenece a la oficina de la actividad (como editor o jefe) o no tiene acceso al módulo.', r using errcode = '22023';
    end if;
  end loop;
  v_conf := public.ps_conflictos_campus(v_lista, a.oficina_unit_id, a.campus_id);
  if jsonb_array_length(v_conf) > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_conf);
  end if;
  foreach r in array v_lista loop
    if public.ps_asignar_interno(p_id, r, v_nota) then v_nuevos := v_nuevos || r; else v_ya := v_ya || r; end if;
  end loop;
  if cardinality(v_nuevos) > 0 then
    select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
    perform public.ps_evento_act('actividad.asignada', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
      jsonb_build_object('perfiles', to_jsonb(v_nuevos), 'nota', v_nota, 'campus_confirmado', jsonb_array_length(v_conf) > 0));
  end if;
  return jsonb_build_object('ok', true, 'asignados', to_jsonb(v_nuevos), 'ya_asignados', to_jsonb(v_ya), 'conflictos_campus', v_conf,
    'actividad', public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id)));
end;
$$;

/** Quita a una persona de una actividad (gestor y admin), con motivo de al menos 20 caracteres. El historial se conserva. */
create or replace function public.ps_actividad_desasignar(p_id uuid, p_perfil uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_clave text;
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: quitar una asignación es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 20 or char_length(v_motivo) > 1000 then
    raise exception 'El motivo debe tener entre 20 y 1000 caracteres.' using errcode = '22023';
  end if;
  update public.ps_asignaciones set quitado_en = now(), quitado_por = auth.uid(), motivo = v_motivo
   where actividad_id = p_id and profile_id = p_perfil and quitado_en is null;
  if not found then raise exception 'Esa persona no tiene la actividad asignada.' using errcode = 'P0002'; end if;
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  perform public.ps_evento_act('actividad.desasignada', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('perfil', p_perfil, 'motivo', v_motivo));
  return jsonb_build_object('ok', true, 'actividad', public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id)));
end;
$$;

/**
 * Asignación masiva: una persona a varias actividades (todo o nada). Todas deben ser de oficinas donde quien llama es
 * gestor o admin, y la persona debe ser de cada una de esas oficinas. Devuelve {ok, asignadas, ya_asignadas} o
 * {ok:false, requiere_confirmacion:true, conflictos_campus:[{actividad_id,…}]}.
 */
create or replace function public.ps_actividades_asignar(p_ids uuid[], p_perfil uuid, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  a public.ps_actividades%rowtype;
  v_poder text;
  v_conf jsonb := '[]'::jsonb;
  c jsonb;
  v_ok integer := 0;
  v_ya integer := 0;
  v_clave text;
begin
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 100 then
    raise exception 'Indique de 1 a 100 actividades.' using errcode = '22023';
  end if;
  if p_perfil is null then raise exception 'Falta la persona.' using errcode = '22023'; end if;
  for a in select * from public.ps_actividades where id = any (v_ids) order by id for update loop
    v_poder := public.ps_poder(a.oficina_unit_id);
    if v_poder is null then raise exception 'La actividad % no existe.', a.id using errcode = 'P0002'; end if;
    if v_poder not in ('admin', 'gestor') then
      raise exception 'Sin permiso: no es gestor de la oficina de la actividad %.', a.id using errcode = '42501';
    end if;
    if a.estado = 'hecho' then raise exception 'La actividad % está hecha: no se asigna.', a.id using errcode = '22023'; end if;
    if not public.ps_asignable(p_perfil, a.oficina_unit_id) then
      raise exception 'La persona no pertenece a la oficina de la actividad % (como editor o jefe) o no tiene acceso al módulo.', a.id using errcode = '22023';
    end if;
    for c in select * from jsonb_array_elements(public.ps_conflictos_campus(array[p_perfil], a.oficina_unit_id, a.campus_id)) loop
      v_conf := v_conf || jsonb_build_array(c || jsonb_build_object('actividad_id', a.id));
    end loop;
    v_ok := v_ok + 1;
  end loop;
  if v_ok <> cardinality(v_ids) then raise exception 'Alguna actividad no existe.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v_conf) > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_conf);
  end if;
  v_ok := 0;
  for a in select * from public.ps_actividades where id = any (v_ids) order by id loop
    if public.ps_asignar_interno(a.id, p_perfil, 'Asignación masiva.') then
      v_ok := v_ok + 1;
      select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
      perform public.ps_evento_act('actividad.asignada', a.plan_id, a.version_creacion_id, v_clave, a.id, a.oficina_unit_id,
        jsonb_build_object('perfiles', jsonb_build_array(p_perfil), 'masiva', true));
    else
      v_ya := v_ya + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'asignadas', v_ok, 'ya_asignadas', v_ya, 'conflictos_campus', v_conf);
end;
$$;

/**
 * Transfiere la asignación de una persona a otra. Solo gestor de la oficina o admin; motivo ≥ 20 caracteres; la que recibe
 * debe ser de la oficina. Cierra la asignación de p_de (historial), abre la de p_a, deja un comentario y encola tres avisos
 * (quien recibe, quien la cede y los gestores de la oficina). Devuelve {ok, actividad} o la confirmación de campus.
 */
create or replace function public.ps_actividad_transferir(p_id uuid, p_de uuid, p_a uuid, p_motivo text, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_poder text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_conf jsonb;
  v_clave text;
  v_de text;
  v_a text;
  v_extra jsonb;
  r uuid;
  v_dest uuid[] := '{}'::uuid[];
begin
  select * into a from public.ps_actividades where id = p_id for update;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: transferir una asignación es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 20 or char_length(v_motivo) > 1000 then
    raise exception 'El motivo de la transferencia debe tener entre 20 y 1000 caracteres.' using errcode = '22023';
  end if;
  if p_de is null or p_a is null or p_de = p_a then
    raise exception 'Indique dos personas distintas: la que cede y la que recibe.' using errcode = '22023';
  end if;
  if a.estado = 'hecho' then raise exception 'La actividad está hecha: no se transfiere.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_id and s.profile_id = p_de and s.quitado_en is null) then
    raise exception 'La persona que cede no tiene la actividad asignada.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ps_asignaciones s where s.actividad_id = p_id and s.profile_id = p_a and s.quitado_en is null) then
    raise exception 'La persona que recibe ya tiene la actividad asignada.' using errcode = '22023';
  end if;
  if not public.ps_asignable(p_a, a.oficina_unit_id) then
    raise exception 'La persona que recibe no pertenece a la oficina de la actividad (como editor o jefe) o no tiene acceso al módulo.' using errcode = '22023';
  end if;
  v_conf := public.ps_conflictos_campus(array[p_a], a.oficina_unit_id, a.campus_id);
  if jsonb_array_length(v_conf) > 0 and not coalesce(p_confirmar_campus, false) then
    return jsonb_build_object('ok', false, 'requiere_confirmacion', true, 'conflictos_campus', v_conf);
  end if;

  update public.ps_asignaciones set quitado_en = now(), quitado_por = auth.uid(), motivo = 'Transferida: ' || v_motivo
   where actividad_id = p_id and profile_id = p_de and quitado_en is null;
  insert into public.ps_asignaciones (actividad_id, profile_id, asignado_por, nota)
  values (p_id, p_a, auth.uid(), 'Transferida: ' || v_motivo);
  insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto) values (p_id, auth.uid(), 'transferencia', v_motivo);
  select l.clave into v_clave from public.ps_lineas l where l.id = a.linea_id;
  perform public.ps_evento_act('actividad.transferida', a.plan_id, a.version_creacion_id, v_clave, p_id, a.oficina_unit_id,
    jsonb_build_object('de', p_de, 'a', p_a, 'motivo', v_motivo, 'campus_confirmado', jsonb_array_length(v_conf) > 0));

  select coalesce(nullif(btrim(full_name), ''), 'Sin nombre') into v_de from public.profiles where id = p_de;
  select coalesce(nullif(btrim(full_name), ''), 'Sin nombre') into v_a from public.profiles where id = p_a;
  v_extra := jsonb_build_object('de', v_de, 'a', v_a, 'nota', v_motivo);
  -- Tres destinos (sin repetir a nadie): quien recibe, quien cede, y los gestores de la oficina.
  perform public.ps_aviso('c-ps-transferencia', p_a, p_id, v_extra || jsonb_build_object('rol', 'recibe'));
  perform public.ps_aviso('c-ps-transferencia', p_de, p_id, v_extra || jsonb_build_object('rol', 'cede'));
  for r in select g from public.ps_gestores_de(a.oficina_unit_id) as g where g <> p_a and g <> p_de loop
    perform public.ps_aviso('c-ps-transferencia', r, p_id, v_extra || jsonb_build_object('rol', 'gestor'));
  end loop;
  return jsonb_build_object('ok', true, 'conflictos_campus', v_conf,
    'actividad', public.ps_actividad_json((select x from public.ps_actividades x where x.id = p_id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Escritura: checklist y comentarios
-- -----------------------------------------------------------------------------

/** ¿Puede quien llama tocar el checklist de la actividad? Gestor y admin; el colaborador solo en las suyas. */
create or replace function public.ps_puede_checklist(p_actividad uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case public.ps_poder(a.oficina_unit_id)
      when 'admin' then true when 'gestor' then true
      when 'colaborador' then exists (select 1 from public.ps_asignaciones s where s.actividad_id = a.id and s.profile_id = auth.uid() and s.quitado_en is null)
      else false end
    from public.ps_actividades a where a.id = p_actividad), false);
$$;

create or replace function public.ps_checklist_agregar(p_actividad uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_id uuid;
  v_orden integer;
begin
  select * into a from public.ps_actividades where id = p_actividad;
  if not found or public.ps_poder(a.oficina_unit_id) is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if not public.ps_puede_checklist(p_actividad) then
    raise exception 'Sin permiso: el checklist es del gestor, del administrador o de quien tiene la actividad asignada.' using errcode = '42501';
  end if;
  if char_length(v_texto) < 1 or char_length(v_texto) > 200 then raise exception 'El texto del paso debe tener entre 1 y 200 caracteres.' using errcode = '22023'; end if;
  if (select count(*) from public.ps_checklist where actividad_id = p_actividad) >= 50 then
    raise exception 'Una actividad admite hasta 50 pasos.' using errcode = '22023';
  end if;
  select coalesce(max(orden), 0) + 1 into v_orden from public.ps_checklist where actividad_id = p_actividad;
  insert into public.ps_checklist (actividad_id, orden, texto) values (p_actividad, v_orden, v_texto) returning id into v_id;
  perform public.ps_evento_act('checklist.agregado', a.plan_id, a.version_creacion_id, null, p_actividad, a.oficina_unit_id, jsonb_build_object('item', v_id, 'texto', v_texto));
  return jsonb_build_object('id', v_id, 'orden', v_orden, 'texto', v_texto, 'hecho', false);
end;
$$;

create or replace function public.ps_checklist_marcar(p_item uuid, p_hecho boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.ps_checklist%rowtype;
  a public.ps_actividades%rowtype;
begin
  select * into k from public.ps_checklist where id = p_item;
  if not found then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = k.actividad_id;
  if public.ps_poder(a.oficina_unit_id) is null then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  if not public.ps_puede_checklist(k.actividad_id) then
    raise exception 'Sin permiso: el checklist es del gestor, del administrador o de quien tiene la actividad asignada.' using errcode = '42501';
  end if;
  if p_hecho is null then raise exception 'Indique si el paso está hecho.' using errcode = '22023'; end if;
  update public.ps_checklist set hecho = p_hecho, hecho_por = case when p_hecho then auth.uid() end, hecho_en = case when p_hecho then now() end where id = p_item;
  perform public.ps_evento_act('checklist.marcado', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id, jsonb_build_object('item', p_item, 'hecho', p_hecho));
  return jsonb_build_object('id', p_item, 'hecho', p_hecho);
end;
$$;

create or replace function public.ps_checklist_editar(p_item uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.ps_checklist%rowtype;
  a public.ps_actividades%rowtype;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_poder text;
begin
  select * into k from public.ps_checklist where id = p_item;
  if not found then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = k.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then raise exception 'Sin permiso: editar pasos es del gestor o del administrador.' using errcode = '42501'; end if;
  if char_length(v_texto) < 1 or char_length(v_texto) > 200 then raise exception 'El texto del paso debe tener entre 1 y 200 caracteres.' using errcode = '22023'; end if;
  update public.ps_checklist set texto = v_texto where id = p_item;
  perform public.ps_evento_act('checklist.editado', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id, jsonb_build_object('item', p_item, 'texto', v_texto));
  return jsonb_build_object('id', p_item, 'texto', v_texto);
end;
$$;

create or replace function public.ps_checklist_quitar(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.ps_checklist%rowtype;
  a public.ps_actividades%rowtype;
  v_poder text;
begin
  select * into k from public.ps_checklist where id = p_item;
  if not found then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  select * into a from public.ps_actividades where id = k.actividad_id;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'El paso no existe.' using errcode = 'P0002'; end if;
  if v_poder not in ('admin', 'gestor') then raise exception 'Sin permiso: quitar pasos es del gestor o del administrador.' using errcode = '42501'; end if;
  delete from public.ps_checklist where id = p_item;
  perform public.ps_evento_act('checklist.quitado', a.plan_id, a.version_creacion_id, null, a.id, a.oficina_unit_id, jsonb_build_object('item', p_item, 'texto', k.texto));
  return jsonb_build_object('ok', true, 'id', p_item);
end;
$$;

/** Comenta una actividad: gestor, colaborador y admin de la oficina, y el aprobador. El lector no comenta. */
create or replace function public.ps_comentar(p_actividad uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.ps_actividades%rowtype;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_poder text;
  v_id uuid;
begin
  select * into a from public.ps_actividades where id = p_actividad;
  if not found then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  v_poder := public.ps_poder(a.oficina_unit_id);
  if v_poder is null then raise exception 'La actividad no existe.' using errcode = 'P0002'; end if;
  if not (v_poder in ('admin', 'gestor', 'colaborador') or public.ps_nivel_actual() = 'aprobador') then
    raise exception 'Sin permiso: su acceso a esta oficina es de lectura.' using errcode = '42501';
  end if;
  if char_length(v_texto) < 1 or char_length(v_texto) > 2000 then raise exception 'El comentario debe tener entre 1 y 2000 caracteres.' using errcode = '22023'; end if;
  insert into public.ps_comentarios (actividad_id, autor_id, tipo, texto) values (p_actividad, auth.uid(), 'comentario', v_texto) returning id into v_id;
  perform public.ps_evento_act('comentario.creado', a.plan_id, a.version_creacion_id, null, p_actividad, a.oficina_unit_id, jsonb_build_object('comentario', v_id));
  return jsonb_build_object('id', v_id, 'texto', v_texto);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Carga masiva de actividades (Excel)
-- -----------------------------------------------------------------------------

/**
 * Carga actividades de una oficina desde filas del Excel. TODO O NADA: con un solo error no se crea nada y se informan
 * todos los errores por fila y campo. Solo gestor de la oficina y admin. Columnas (con alias): titulo (actividad),
 * descripcion (desc), linea (linea_clave, proyecto), campus, prioridad (prior), inicio, fin, hito (es_hito),
 * responsable (responsables, correo: correos separados por ; o ,). Duplicados (mismo título, línea y fin) se rechazan.
 * Devuelve {creadas, recibidas, errores:[{fila, campo, mensaje}], ids}.
 */
create or replace function public.ps_actividades_cargar(p_unit uuid, p_filas jsonb, p_plan uuid default null, p_confirmar_campus boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poder text := public.ps_poder(p_unit);
  v_plan public.ps_planes%rowtype;
  v_n integer;
  i integer;
  v_err jsonb := '[]'::jsonb;
  v_datos jsonb := '[]'::jsonb;
  v_res jsonb;
  v_d jsonb;
  c jsonb;
  v_vistas jsonb := '{}'::jsonb;
  v_clave text;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_planes integer;
begin
  if v_poder is null or v_poder not in ('admin', 'gestor') then
    raise exception 'Sin permiso: cargar actividades es del gestor de la oficina o del administrador.' using errcode = '42501';
  end if;
  if p_plan is null then
    select count(*) into v_planes from public.ps_planes where version_vigente_id is not null;
    if v_planes = 0 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'No hay un plan con versión vigente.')));
    elsif v_planes > 1 then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'Hay varios planes vigentes: indique cuál.')));
    end if;
    select * into v_plan from public.ps_planes where version_vigente_id is not null;
  else
    select * into v_plan from public.ps_planes where id = p_plan;
    if not found then raise exception 'El plan no existe.' using errcode = 'P0002'; end if;
    if v_plan.version_vigente_id is null then
      return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
        'errores', jsonb_build_array(public.ps_err(null, 'plan', 'El plan todavía no tiene una versión vigente.')));
    end if;
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', 0, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'Se esperaba una lista con al menos una fila.')));
  end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 500 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', jsonb_build_array(public.ps_err(null, 'filas', 'La carga admite hasta 500 filas.')));
  end if;

  for i in 1 .. v_n loop
    v_res := public.ps_actividad_normalizar(i, p_filas -> (i - 1), v_plan.id, p_unit, v_poder = 'admin');
    v_err := v_err || (v_res -> 'errores');
    v_d := v_res -> 'datos';
    if jsonb_array_length(v_res -> 'errores') = 0 and v_d is not null then
      if jsonb_array_length(v_res -> 'conflictos') > 0 and not coalesce(p_confirmar_campus, false) then
        for c in select * from jsonb_array_elements(v_res -> 'conflictos') loop
          v_err := v_err || public.ps_err(i, 'responsable', format('%s tiene el campus %s y la actividad es de %s: confirme la asignación para continuar.',
            c ->> 'nombre', c ->> 'campus_miembro', c ->> 'campus_actividad'));
        end loop;
      end if;
      v_clave := public.ps_texto_norm(v_d ->> 'titulo') || '|' || coalesce(v_d ->> 'linea_clave', '') || '|' || coalesce(v_d ->> 'fin', '');
      if v_vistas ? v_clave then
        v_err := v_err || public.ps_err(i, 'titulo', format('Fila repetida: es igual a la fila %s.', v_vistas ->> v_clave));
      else
        v_vistas := v_vistas || jsonb_build_object(v_clave, i);
        if exists (select 1 from public.ps_actividades a
                    where a.oficina_unit_id = p_unit and public.ps_texto_norm(a.titulo) = public.ps_texto_norm(v_d ->> 'titulo')
                      and a.linea_id is not distinct from nullif(v_d ->> 'linea_id', '')::uuid and a.fin is not distinct from nullif(v_d ->> 'fin', '')::date) then
          v_err := v_err || public.ps_err(i, 'titulo', 'Ya existe una actividad igual en la oficina (mismo título, línea y fin).');
        end if;
      end if;
    end if;
    v_datos := v_datos || jsonb_build_array(coalesce(v_d, 'null'::jsonb));
  end loop;

  if jsonb_array_length(v_err) > 0 then
    return jsonb_build_object('creadas', 0, 'recibidas', v_n, 'ids', '[]'::jsonb,
      'errores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_err) as x limit 500) s));
  end if;

  for i in 0 .. v_n - 1 loop
    v_id := public.ps_actividad_insertar(v_plan.id, v_plan.version_vigente_id, p_unit, v_datos -> i);
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  perform public.ps_evento_act('actividades.cargadas', v_plan.id, v_plan.version_vigente_id, null, null, p_unit, jsonb_build_object('creadas', v_n));
  return jsonb_build_object('creadas', v_n, 'recibidas', v_n, 'errores', '[]'::jsonb, 'ids', v_ids);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Plazos de los avisos y vencimientos
-- -----------------------------------------------------------------------------

create or replace function public.ps_config_leer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.ps_puede('gestionar') then
    raise exception 'Sin permiso: los plazos de los avisos son del administrador del módulo.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('dias_antes', to_jsonb(dias_antes), 'vencida_max_avisos', vencida_max_avisos,
                                    'vencida_gestor_horas', vencida_gestor_horas, 'activo', activo, 'actualizado_en', actualizado_en)
            from public.ps_config where id);
end;
$$;

create or replace function public.ps_config_guardar(p_dias_antes integer[], p_vencida_max_avisos integer, p_vencida_gestor_horas integer, p_activo boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias integer[];
begin
  if not public.ps_puede('gestionar') then
    raise exception 'Sin permiso: los plazos de los avisos son del administrador del módulo.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct d order by d desc), '{}'::integer[]) into v_dias from unnest(coalesce(p_dias_antes, '{}'::integer[])) as d;
  if cardinality(v_dias) > 6 or not public.ps_dias_validos(v_dias) then
    raise exception 'Los días de aviso son hasta 6 valores entre 0 y 60.' using errcode = '22023';
  end if;
  if p_vencida_max_avisos is null or p_vencida_max_avisos not between 0 and 10 then
    raise exception 'Los avisos de vencida deben ser de 0 a 10.' using errcode = '22023';
  end if;
  if p_vencida_gestor_horas is null or p_vencida_gestor_horas not between 0 and 720 then
    raise exception 'Las horas para avisar al gestor deben ser de 0 a 720.' using errcode = '22023';
  end if;
  update public.ps_config
     set dias_antes = v_dias, vencida_max_avisos = p_vencida_max_avisos, vencida_gestor_horas = p_vencida_gestor_horas,
         activo = coalesce(p_activo, true), actualizado_por = auth.uid(), actualizado_en = now()
   where id;
  perform public.ps_evento_act('config.avisos', null, null, null, null, null,
    jsonb_build_object('dias_antes', to_jsonb(v_dias), 'vencida_max_avisos', p_vencida_max_avisos, 'vencida_gestor_horas', p_vencida_gestor_horas, 'activo', coalesce(p_activo, true)));
  return public.ps_config_leer();
end;
$$;

/**
 * Genera los avisos de vencimiento del día (idempotente: correrla dos veces el mismo día no duplica nada).
 * La llama la función de borde planeacion-seguimiento (acción vencimientos) o pg_cron; solo service_role.
 *   · por vencer: a los días de ps_config.dias_antes (7, 3 y 0 = el día de la fecha) → c-ps-por-vencer;
 *   · vencida (fin pasado, no hecha): aviso diario, hasta vencida_max_avisos veces por persona → c-ps-vencida;
 *   · a quien tiene la actividad; si no tiene a nadie, a los gestores de la oficina;
 *   · a los gestores, una vez, cuando la actividad lleva vencida_gestor_horas horas desde el primer día vencida.
 * p_hoy solo sirve para pruebas (reloj controlado); por omisión, hoy en Bogotá.
 */
create or replace function public.ps_generar_avisos_vencimiento(p_hoy date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.ps_config%rowtype;
  v_hoy date := coalesce(p_hoy, public.ps_hoy());
  a public.ps_actividades%rowtype;
  d uuid;
  g uuid;
  v_dias integer;
  v_pasados integer;
  v_resp uuid[];
  v_previos integer;
  v_por_vencer integer := 0;
  v_vencidas integer := 0;
  v_gestor integer := 0;
  v_nombres text;
begin
  select * into cfg from public.ps_config where id;
  if not found or not cfg.activo then
    return jsonb_build_object('hoy', v_hoy, 'activo', false, 'por_vencer', 0, 'vencidas', 0, 'gestor', 0);
  end if;

  -- Próximas a vencer (y el día de la fecha).
  for a in select * from public.ps_actividades where estado <> 'hecho' and fin is not null and fin >= v_hoy and (fin - v_hoy) = any (cfg.dias_antes) order by id loop
    v_dias := a.fin - v_hoy;
    select coalesce(array_agg(s.profile_id), '{}'::uuid[]) into v_resp from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null;
    if cardinality(v_resp) = 0 then select coalesce(array_agg(x), '{}'::uuid[]) into v_resp from public.ps_gestores_de(a.oficina_unit_id) as x; end if;
    foreach d in array v_resp loop
      if public.ps_aviso('c-ps-por-vencer', d, a.id, jsonb_build_object('dias', v_dias), format('pv:%s:%s:%s:%s', a.id, d, a.fin, v_dias)) then
        v_por_vencer := v_por_vencer + 1;
      end if;
    end loop;
  end loop;

  -- Vencidas.
  for a in select * from public.ps_actividades where estado <> 'hecho' and fin is not null and fin < v_hoy order by id loop
    v_pasados := v_hoy - a.fin;
    select coalesce(array_agg(s.profile_id), '{}'::uuid[]) into v_resp from public.ps_asignaciones s where s.actividad_id = a.id and s.quitado_en is null;
    if cardinality(v_resp) = 0 then
      -- Nadie la tiene: los gestores son los destinatarios principales.
      select coalesce(array_agg(x), '{}'::uuid[]) into v_resp from public.ps_gestores_de(a.oficina_unit_id) as x;
    else
      -- Con responsable: el gestor entra en copia al cumplirse vencida_gestor_horas desde el primer día vencida.
      if v_pasados >= 1 + cfg.vencida_gestor_horas / 24 then
        select string_agg(coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'), ', ') into v_nombres
          from public.profiles pr where pr.id = any (v_resp);
        for g in select x from public.ps_gestores_de(a.oficina_unit_id) as x loop
          if public.ps_aviso('c-ps-vencida', g, a.id, jsonb_build_object('dias', v_pasados, 'rol', 'gestor', 'responsables', coalesce(v_nombres, '')),
                             format('vg:%s:%s:%s', a.id, g, a.fin)) then
            v_gestor := v_gestor + 1;
          end if;
        end loop;
      end if;
    end if;
    foreach d in array v_resp loop
      select count(*) into v_previos from public.ps_avisos
       where plantilla = 'c-ps-vencida' and destinatario_id = d and actividad_id = a.id and dedupe like format('ve:%s:%s:%s:%%', a.id, d, a.fin);
      continue when v_previos >= cfg.vencida_max_avisos;
      if public.ps_aviso('c-ps-vencida', d, a.id, jsonb_build_object('dias', v_pasados, 'rol', 'responsable'), format('ve:%s:%s:%s:%s', a.id, d, a.fin, v_hoy)) then
        v_vencidas := v_vencidas + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('hoy', v_hoy, 'activo', true, 'por_vencer', v_por_vencer, 'vencidas', v_vencidas, 'gestor', v_gestor);
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Plantillas de correo (grupo «Planeación y Seguimiento»; se editan en Correos)
--
-- Tipo «aviso»: variables titulo_aviso, detalle, oficina, fecha_limite, dias, comentario y autor (las arma la
-- función de borde); más las de la persona. Volver a aplicar esta migración no pisa lo ya editado.
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo)
values
  ('c-ps-asignacion', 'plan', 'Planeación y Seguimiento', 'Le asignaron una actividad', 'Al asignarle una actividad de la planificación de su oficina', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Revise la fecha y su estado', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Le asignaron una actividad de la planificación de {{oficina}}.\n{{detalle}}', 'Ver mis actividades', 'Si cree que no le corresponde, hable con el gestor de su oficina.', true, 340, 'aviso'),
  ('c-ps-transferencia', 'plan', 'Planeación y Seguimiento', 'Una actividad cambió de responsable', 'Al transferir la asignación a otra persona: a quien recibe, a quien cede y al gestor', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'La asignación pasó a otra persona', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'La asignación de una actividad de {{oficina}} cambió de responsable.\n{{detalle}}', 'Ver la actividad', 'El gestor de la oficina deja el motivo de la transferencia.', true, 341, 'aviso'),
  ('c-ps-avance', 'plan', 'Planeación y Seguimiento', 'Avance reportado', 'Cuando un colaborador reporta un avance: al gestor (se activa en la fase 3)', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Hay un avance por revisar', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Se reportó un avance que espera su revisión.\n{{detalle}}', 'Revisar el avance', 'Validar o devolver un avance exige una nota de al menos 20 caracteres al devolver.', true, 342, 'aviso'),
  ('c-ps-validado', 'plan', 'Planeación y Seguimiento', 'Avance validado', 'Cuando el gestor valida un avance (se activa en la fase 3)', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Su avance quedó validado', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'El gestor validó su avance.\n{{detalle}}', 'Ver la actividad', '', true, 343, 'aviso'),
  ('c-ps-devuelto', 'plan', 'Planeación y Seguimiento', 'Actividad devuelta con nota', 'Cuando el gestor devuelve una actividad en revisión', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Lea la nota y corríjala', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'El gestor devolvió una actividad que usted tiene asignada. Lea la nota y vuelva a trabajarla.\n{{detalle}}', 'Abrir la actividad', '', true, 344, 'aviso'),
  ('c-ps-por-vencer', 'plan', 'Planeación y Seguimiento', 'Actividad próxima a vencer', 'A los 7 y 3 días de la fecha de fin y el día de la fecha (plazos editables)', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Revise el plazo', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Una actividad suya se acerca a su fecha de fin.\n{{detalle}}', 'Ver mis actividades', 'Si ya terminó, pase la actividad a «En revisión» para que el gestor la valide.', true, 345, 'aviso'),
  ('c-ps-vencida', 'plan', 'Planeación y Seguimiento', 'Actividad vencida', 'Pasada la fecha de fin: aviso diario hasta 3 veces y copia al gestor a las 24 horas (plazos editables)', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'La fecha de fin ya pasó', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'La fecha de fin de una actividad ya pasó y no está hecha.\n{{detalle}}', 'Ver la actividad', 'Si necesita más tiempo, hable con el gestor de su oficina.', true, 346, 'aviso'),
  ('c-ps-cumplida', 'plan', 'Planeación y Seguimiento', 'Actividad cumplida', 'Cuando una actividad pasa a «Hecho»: al gestor y a quien la tenía', 'ps',
   'Planeación y Seguimiento: {{titulo_aviso}}', 'Una actividad quedó hecha', '{{titulo_aviso}}', 'Hola, {{nombre}}:',
   E'Una actividad de {{oficina}} quedó en «Hecho».\n{{detalle}}', 'Ver la actividad', '', true, 347, 'aviso')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 13. Permisos de ejecución
-- -----------------------------------------------------------------------------

revoke all on function
  public.ps_dias_validos(integer[]), public.ps_nivel_de(uuid), public.ps_pertenencia(uuid, uuid), public.ps_rol_en(uuid, uuid),
  public.ps_poder(uuid), public.ps_ver_oficina(uuid), public.ps_asignable(uuid, uuid), public.ps_gestores_de(uuid), public.ps_hoy(),
  public.ps_estado_texto(text), public.ps_actividades_guard(), public.ps_asignaciones_guard(), public.ps_comentarios_guard(),
  public.ps_evento_act(text, uuid, uuid, text, uuid, uuid, jsonb), public.ps_actividad_tiene_avances(uuid),
  public.ps_actividad_json(public.ps_actividades), public.ps_aviso(text, uuid, uuid, jsonb, text),
  public.ps_conflictos_campus(uuid[], uuid, uuid), public.ps_actividad_normalizar(integer, jsonb, uuid, uuid, boolean, text),
  public.ps_actividad_insertar(uuid, uuid, uuid, jsonb), public.ps_asignar_interno(uuid, uuid, text), public.ps_puede_checklist(uuid),
  public.ps_oficinas_visibles(boolean), public.ps_equipo_oficina(uuid), public.ps_carga_equipo(uuid), public.ps_mis_actividades(boolean),
  public.ps_actividades_oficina(uuid, jsonb), public.ps_actividad_detalle(uuid), public.ps_bitacora_oficina(uuid, integer),
  public.ps_actividad_crear(uuid, uuid, jsonb, boolean), public.ps_actividad_editar(uuid, jsonb), public.ps_actividad_eliminar(uuid, text),
  public.ps_actividad_mover(uuid, text, text), public.ps_actividad_asignar(uuid, uuid[], text, boolean),
  public.ps_actividad_desasignar(uuid, uuid, text), public.ps_actividades_asignar(uuid[], uuid, boolean),
  public.ps_actividad_transferir(uuid, uuid, uuid, text, boolean), public.ps_checklist_agregar(uuid, text),
  public.ps_checklist_marcar(uuid, boolean), public.ps_checklist_editar(uuid, text), public.ps_checklist_quitar(uuid),
  public.ps_comentar(uuid, text), public.ps_actividades_cargar(uuid, jsonb, uuid, boolean),
  public.ps_config_leer(), public.ps_config_guardar(integer[], integer, integer, boolean), public.ps_generar_avisos_vencimiento(date)
  from public, anon, authenticated;

-- ps_poder y ps_ver_oficina las evalúan las políticas con el rol de quien consulta; ps_estado_texto y ps_hoy son inocuas.
grant execute on function public.ps_poder(uuid), public.ps_ver_oficina(uuid), public.ps_hoy(), public.ps_estado_texto(text) to authenticated;

grant execute on function
  public.ps_oficinas_visibles(boolean), public.ps_equipo_oficina(uuid), public.ps_carga_equipo(uuid), public.ps_mis_actividades(boolean),
  public.ps_actividades_oficina(uuid, jsonb), public.ps_actividad_detalle(uuid), public.ps_bitacora_oficina(uuid, integer),
  public.ps_actividad_crear(uuid, uuid, jsonb, boolean), public.ps_actividad_editar(uuid, jsonb), public.ps_actividad_eliminar(uuid, text),
  public.ps_actividad_mover(uuid, text, text), public.ps_actividad_asignar(uuid, uuid[], text, boolean),
  public.ps_actividad_desasignar(uuid, uuid, text), public.ps_actividades_asignar(uuid[], uuid, boolean),
  public.ps_actividad_transferir(uuid, uuid, uuid, text, boolean), public.ps_checklist_agregar(uuid, text),
  public.ps_checklist_marcar(uuid, boolean), public.ps_checklist_editar(uuid, text), public.ps_checklist_quitar(uuid),
  public.ps_comentar(uuid, text), public.ps_actividades_cargar(uuid, jsonb, uuid, boolean),
  public.ps_config_leer(), public.ps_config_guardar(integer[], integer, integer, boolean)
  to authenticated;

grant execute on function public.ps_generar_avisos_vencimiento(date) to service_role;

notify pgrst, 'reload schema';
