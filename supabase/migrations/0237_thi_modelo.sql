-- =============================================================================
-- PDI · 0237 · THE Impact · modelo de ciclos (prefijo thi_)
--
-- Requiere 0149 y 0150 (reporte por oficinas de THE Impact) y 0213 (usa sus ayudas
-- de fecha ugm_hoy, ugm_fecha_larga y ugm_dias_frase). Idempotente.
--
-- HALLAZGO. THE Impact no tenía un modelo de ciclos. `ranking_cycles` (0149) existía,
-- pero el único camino para crear un ciclo era importar el Excel de THE, y el código
-- (src/modules/rankings/reporte/datos.ts) traía fijos «edición 2026, datos 2024» para
-- ese caso y mostraba siempre el ciclo de año más alto. No había dónde elegir un
-- ciclo, abrirlo, cerrarlo, fijar fechas, ni preparar el de 2027 (la metodología
-- vigente, versión 1.1, pide datos del año académico 2025).
--
-- DECISIÓN. Se conserva el flujo ya construido (ranking_indicators, ranking_assignments,
-- ranking_responses, ranking_evidence y su disparador de estados) y se le añade la capa
-- de ciclo que tiene UI GreenMetric, con prefijo propio:
--   thi_config          configuración de un ciclo: fechas, recordatorios, avisos,
--                       carpeta de la edición en UDrive, ciclo anterior.
--   thi_requisitos      qué pide la metodología de cada indicador (0238 la siembra).
--   thi_carpetas        carpetas de UDrive por ODS e indicador (0239).
--   thi_evidencias      evidencias en UDrive (0239); NO reemplazan ranking_evidence.
--   thi_actividad       bitácora, solo inserción.
--   thi_notificaciones  cola de correos (0241).
--   thi_publicaciones   indicadores marcados «listos» para la entrega (0240).
-- Los indicadores y los ODS que ya existen alimentan el catálogo del ciclo: crear un
-- ciclo puede copiar el catálogo y las asignaciones del anterior. No se copian las
-- respuestas (son del año de los datos). Lo importado desde Excel sigue igual; ahora
-- el ciclo se crea antes (con thi_crear_ciclo) o, si el Excel lo crea, nace con su
-- configuración por el disparador de este archivo.
--
-- Todo DELETE y UPDATE lleva WHERE (ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ayudas
-- -----------------------------------------------------------------------------

create or replace function public.thi_ods_nombre(p_ods int)
returns text
language sql
immutable
set search_path = public
as $$
  select (array[
    'Fin de la pobreza', 'Hambre cero', 'Salud y bienestar', 'Educación de calidad', 'Igualdad de género',
    'Agua limpia y saneamiento', 'Energía asequible y no contaminante', 'Trabajo decente y crecimiento económico',
    'Industria, innovación e infraestructura', 'Reducción de las desigualdades', 'Ciudades y comunidades sostenibles',
    'Producción y consumo responsables', 'Acción por el clima', 'Vida submarina', 'Vida de ecosistemas terrestres',
    'Paz, justicia e instituciones sólidas', 'Alianzas para lograr los objetivos'
  ])[p_ods];
$$;

create or replace function public.thi_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_role_at_least('planeacion'), false);
$$;

create or replace function public.thi_exige_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.thi_es_admin() then
    raise exception 'Solo la administración del ranking (Planeación o más) puede hacerlo.' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.thi_config (
  ciclo_id            uuid primary key references public.ranking_cycles (id) on delete cascade,
  metodologia         text not null default 'the-2027',
  metodologia_version text not null default '1.1',
  anio_academico      int,
  universidad         text not null default 'Universidad de Santander (UDES)',
  pais                text not null default 'Colombia',
  web                 text not null default 'https://www.udes.edu.co',
  periodo_ref_desde   date,
  periodo_ref_hasta   date,
  envio_desde         date,
  envio_hasta         date,
  biblio_desde        int,
  biblio_hasta        int,
  recordatorio_dias   int[] not null default '{7,3,1,0}'::int[],
  resumen_semanal     boolean not null default true,
  resumen_dia         int not null default 1,
  avisos_activos      boolean not null default true,
  avisar_a            uuid[] not null default '{}'::uuid[],
  unidad_id           uuid references public.drive_unidades (id) on delete set null,
  carpeta_raiz        uuid references public.drive_carpetas (id) on delete set null,
  ciclo_anterior      uuid references public.ranking_cycles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint thi_config_textos check (
    char_length(btrim(universidad)) between 1 and 160 and char_length(btrim(pais)) between 1 and 80 and char_length(web) <= 300
  ),
  constraint thi_config_fechas check (
    (periodo_ref_desde is null or periodo_ref_hasta is null or periodo_ref_desde <= periodo_ref_hasta)
    and (envio_desde is null or envio_hasta is null or envio_desde <= envio_hasta)
    and (biblio_desde is null or biblio_hasta is null or biblio_desde <= biblio_hasta)
  ),
  constraint thi_config_recordatorios check (recordatorio_dias <@ array[0,1,2,3,4,5,6,7,8,9,10,14,21,30]::int[] and cardinality(recordatorio_dias) <= 8),
  constraint thi_config_resumen_dia check (resumen_dia between 1 and 7)
);
comment on table public.thi_config is
  'THE Impact · configuración de un ciclo (ranking_cycles con ranking = the-impact): fechas editables, recordatorios, avisos, carpeta de la edición en UDrive y metodología de referencia.';
comment on column public.thi_config.anio_academico is
  'Año en que termina el periodo de datos que pide THE. Metodología 2027 v1.1: año académico 2025 (un año natural, académico o fiscal que termine en 2025).';
comment on column public.thi_config.biblio_desde is
  'Quinquenio bibliométrico (Scopus) que calcula THE; para la edición 2027, 2021 a 2025. Solo informativo: lo calcula THE.';

-- Qué pide la metodología de cada indicador (se siembra en 0238).
create table if not exists public.thi_requisitos (
  metodologia    text not null,
  indicador      text not null,
  ods            smallint not null,
  titulo         text not null,
  tipo           text not null,
  evidencia      text not null,
  peso           numeric,
  maximo         numeric not null default 0,
  pregunta       text not null default '',
  regla          text not null default '',
  primary key (metodologia, indicador),
  constraint thi_requisitos_ods check (ods between 1 and 17),
  constraint thi_requisitos_tipo check (tipo in ('ev', 'doc', 'dato', 'inv')),
  -- obligatoria: sin evidencia no puntúa (si la universidad dice que lo hace); respaldo: se sube apoyo, no puntúa;
  -- no_aplica: lo calcula THE (investigación con Scopus).
  constraint thi_requisitos_evidencia check (evidencia in ('obligatoria', 'respaldo', 'no_aplica'))
);
create index if not exists thi_requisitos_ods_idx on public.thi_requisitos (metodologia, ods);

create table if not exists public.thi_carpetas (
  ciclo_id   uuid not null references public.ranking_cycles (id) on delete cascade,
  clave      text not null,
  carpeta_id uuid references public.drive_carpetas (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (ciclo_id, clave),
  constraint thi_carpetas_clave check (clave ~ '^(raiz|ods-[0-9]{1,2}|[0-9]{1,2}(\.[0-9]{1,2}){1,3})$')
);
comment on table public.thi_carpetas is
  'THE Impact · carpetas de UDrive del ciclo en la unidad «Datos de Sostenibilidad»: THE Impact › Edición <año> › ODS n › indicador. clave = raiz | ods-4 | 4.3.1.';

create table if not exists public.thi_evidencias (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ranking_responses (id) on delete cascade,
  archivo_id   uuid references public.drive_archivos (id) on delete cascade,
  url          text,
  nota         text,
  orden        int not null default 0,
  publica      boolean not null default false,
  creada_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint thi_evidencias_forma check ((archivo_id is not null) <> (url is not null)),
  constraint thi_evidencias_url check (url is null or (url ~ '^https://[^[:space:]]{3,490}$')),
  constraint thi_evidencias_nota check (nota is null or char_length(nota) <= 400)
);
create unique index if not exists thi_evidencias_archivo_uq on public.thi_evidencias (respuesta_id, archivo_id) where archivo_id is not null;
create index if not exists thi_evidencias_resp_idx on public.thi_evidencias (respuesta_id, orden);
comment on table public.thi_evidencias is
  'THE Impact · evidencias de una respuesta guardadas en UDrive (archivo por id) o como enlace https. Conviven con ranking_evidence (bucket ranking-evidencias, 0149): el reporte cuenta las dos.';

create table if not exists public.thi_evidencia_reservas (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ranking_responses (id) on delete cascade,
  usuario_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  carpeta_id   uuid not null references public.drive_carpetas (id) on delete cascade,
  unidad_id    uuid not null references public.drive_unidades (id) on delete cascade,
  nombre       text not null,
  ruta         text not null,
  mime         text,
  tamano       bigint,
  expira_at    timestamptz not null default (now() + interval '30 minutes'),
  usada        boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint thi_reservas_ruta unique (ruta),
  constraint thi_reservas_nombre check (nombre ~ '^[A-Za-z0-9._-]{1,150}$'),
  constraint thi_reservas_ruta_ok check (ruta ~ '^unidades/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,150}$')
);
create index if not exists thi_reservas_usuario_idx on public.thi_evidencia_reservas (usuario_id, expira_at);

create table if not exists public.thi_actividad (
  id           bigint generated always as identity primary key,
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  respuesta_id uuid references public.ranking_responses (id) on delete set null,
  indicador    text,
  actor        uuid,
  accion       text not null,
  de           text,
  a            text,
  detalle      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint thi_actividad_accion check (char_length(accion) between 1 and 60)
);
create index if not exists thi_actividad_resp_idx on public.thi_actividad (respuesta_id, created_at desc);
create index if not exists thi_actividad_ciclo_idx on public.thi_actividad (ciclo_id, created_at desc);
comment on table public.thi_actividad is 'THE Impact · bitácora del ciclo. Solo inserción (disparador).';

create table if not exists public.thi_notificaciones (
  id              uuid primary key default gen_random_uuid(),
  ciclo_id        uuid not null references public.ranking_cycles (id) on delete cascade,
  respuesta_id    uuid references public.ranking_responses (id) on delete cascade,
  destinatario    uuid not null references public.profiles (id) on delete cascade,
  plantilla       text not null,
  valores         jsonb not null default '{}'::jsonb,
  estado          text not null default 'en_cola',
  intentos        int not null default 0,
  programada_para timestamptz not null default now(),
  enviado_at      timestamptz,
  error           text,
  clave_unica     text,
  created_at      timestamptz not null default now(),
  constraint thi_notif_estado check (estado in ('en_cola', 'enviando', 'enviado', 'error', 'omitido')),
  constraint thi_notif_plantilla check (plantilla ~ '^c-thi-[a-z0-9-]{1,30}$'),
  constraint thi_notif_error check (error is null or char_length(error) <= 300)
);
create unique index if not exists thi_notif_unica_uq on public.thi_notificaciones (clave_unica) where clave_unica is not null;
create index if not exists thi_notif_cola_idx on public.thi_notificaciones (programada_para) where estado = 'en_cola';
comment on table public.thi_notificaciones is 'THE Impact · cola de correos. La vacía la función `correos` (acción thi_cola); ver 0241.';

create table if not exists public.thi_publicaciones (
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  indicador    text not null,
  unidad       uuid not null references public.units (id) on delete cascade,
  lista        boolean not null default false,
  nota         text,
  marcada_por  uuid references public.profiles (id) on delete set null,
  marcada_at   timestamptz,
  primary key (ciclo_id, indicador, unidad),
  constraint thi_publicaciones_nota check (nota is null or char_length(nota) <= 400)
);
comment on table public.thi_publicaciones is
  'THE Impact · cuáles respuestas aprobadas quedan marcadas «listas para la entrega» a THE. Las marca la administración con thi_marcar_lista (0240).';

-- -----------------------------------------------------------------------------
-- 3. Bitácora (solo inserción) y updated_at
-- -----------------------------------------------------------------------------

create or replace function public.thi_solo_agregar()
returns trigger
language plpgsql
as $$
begin
  -- Un borrado en cascada (se elimina el ciclo o la respuesta) corre dentro del disparador de integridad: profundidad > 1.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'La bitácora de THE Impact solo admite inserciones.' using errcode = '42501';
end;
$$;

drop trigger if exists thi_actividad_inmutable on public.thi_actividad;
create trigger thi_actividad_inmutable before update or delete on public.thi_actividad
  for each row execute function public.thi_solo_agregar();

drop trigger if exists thi_config_set_updated_at on public.thi_config;
create trigger thi_config_set_updated_at before update on public.thi_config
  for each row execute function public.set_updated_at();

create or replace function public.thi_bitacora(p_ciclo uuid, p_respuesta uuid, p_accion text, p_de text default null, p_a text default null, p_detalle jsonb default '{}'::jsonb, p_indicador text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.thi_actividad (ciclo_id, respuesta_id, indicador, actor, accion, de, a, detalle)
  values (p_ciclo, p_respuesta, coalesce(p_indicador, (select r.indicador from public.ranking_responses r where r.id = p_respuesta)),
          auth.uid(), left(p_accion, 60), p_de, p_a, coalesce(p_detalle, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- 4. Todo ciclo de THE Impact nace con su configuración (lo cree el Excel, thi_crear_ciclo o una migración)
-- -----------------------------------------------------------------------------

create or replace function public.thi_config_al_crear_ciclo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ranking = 'the-impact' then
    insert into public.thi_config (ciclo_id, anio_academico, biblio_desde, biblio_hasta)
    values (new.id, new.anio_datos, new.anio_datos - 4, new.anio_datos)
    on conflict (ciclo_id) do nothing;
  end if;
  return new;
exception when others then
  -- La configuración nunca debe impedir crear un ciclo: si falla, se crea después desde la pantalla.
  return new;
end;
$$;

drop trigger if exists thi_config_al_crear_ciclo_tg on public.ranking_cycles;
create trigger thi_config_al_crear_ciclo_tg after insert on public.ranking_cycles
  for each row execute function public.thi_config_al_crear_ciclo();

-- Los ciclos que ya existen (p. ej. la edición 2026 importada del Excel) reciben su configuración.
insert into public.thi_config (ciclo_id, anio_academico, biblio_desde, biblio_hasta)
select c.id, c.anio_datos, c.anio_datos - 4, c.anio_datos from public.ranking_cycles c where c.ranking = 'the-impact'
on conflict (ciclo_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Ciclo: crear, cambiar de estado, guardar la configuración
-- -----------------------------------------------------------------------------

/**
 * Crea el ciclo «edición p_anio, datos p_anio_datos» de THE Impact en preparación. Con p_copiar_de trae el catálogo
 * (ranking_indicators), las oficinas asignadas y los ODS priorizados de ese ciclo; las respuestas NO se copian (son del
 * año de los datos). Devuelve el id del ciclo.
 */
create or replace function public.thi_crear_ciclo(p_anio int, p_anio_datos int, p_fecha_limite date default null, p_copiar_de uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ods int[] := '{4,5,10,17}'::int[];
begin
  perform public.thi_exige_admin();
  if p_anio is null or p_anio not between 2020 and 2100 then
    raise exception 'La edición debe ser un año entre 2020 y 2100.' using errcode = 'check_violation';
  end if;
  if p_anio_datos is null or p_anio_datos not between 2015 and p_anio - 1 then
    raise exception 'El año de los datos debe ser anterior a la edición (la edición 2027 pide el año académico 2025).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ranking_cycles where ranking = 'the-impact' and anio = p_anio) then
    raise exception 'Ya existe el ciclo de la edición % de THE Impact.', p_anio using errcode = 'unique_violation';
  end if;
  if p_copiar_de is not null then
    select ods_priorizados into v_ods from public.ranking_cycles where id = p_copiar_de and ranking = 'the-impact';
    if not found then raise exception 'El ciclo anterior no es de THE Impact.' using errcode = 'check_violation'; end if;
  end if;

  insert into public.ranking_cycles (ranking, anio, anio_datos, ods_priorizados, fecha_limite, estado)
  values ('the-impact', p_anio, p_anio_datos, v_ods, p_fecha_limite, 'preparacion')
  returning id into v_id;

  insert into public.thi_config (ciclo_id, anio_academico, biblio_desde, biblio_hasta, ciclo_anterior, updated_by)
  values (v_id, p_anio_datos, p_anio_datos - 4, p_anio_datos, p_copiar_de, auth.uid())
  on conflict (ciclo_id) do update set anio_academico = excluded.anio_academico, biblio_desde = excluded.biblio_desde,
    biblio_hasta = excluded.biblio_hasta, ciclo_anterior = excluded.ciclo_anterior, updated_by = excluded.updated_by;

  if p_copiar_de is not null then
    insert into public.ranking_indicators (ciclo, id, ods, nivel, padre, tipo, texto_en, texto_es, peso, prioridad, tipo_requerimiento, orden)
    select v_id, i.id, i.ods, i.nivel, i.padre, i.tipo, i.texto_en, i.texto_es, i.peso, i.prioridad, i.tipo_requerimiento, i.orden
      from public.ranking_indicators i where i.ciclo = p_copiar_de
    on conflict (ciclo, id) do nothing;
    insert into public.ranking_assignments (ciclo, indicador, unidad, rol)
    select v_id, a.indicador, a.unidad, a.rol from public.ranking_assignments a where a.ciclo = p_copiar_de
    on conflict (ciclo, indicador, unidad) do nothing;
  end if;

  perform public.thi_bitacora(v_id, null, 'ciclo_creado', null, null,
    jsonb_build_object('anio', p_anio, 'anio_datos', p_anio_datos, 'copiado_de', p_copiar_de));
  return v_id;
end;
$$;

create or replace function public.thi_cambiar_estado_ciclo(p_ciclo uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text;
begin
  perform public.thi_exige_admin();
  if p_estado not in ('preparacion', 'abierto', 'cerrado') then
    raise exception 'Estado de ciclo desconocido.' using errcode = '22023';
  end if;
  select estado into v_de from public.ranking_cycles where id = p_ciclo and ranking = 'the-impact';
  if not found then raise exception 'Ese ciclo no es de THE Impact.' using errcode = 'P0002'; end if;
  if p_estado = 'abierto' and not exists (select 1 from public.ranking_indicators where ciclo = p_ciclo) then
    raise exception 'El ciclo no tiene catálogo: importe el Excel de THE o cree el ciclo copiando el anterior antes de abrirlo.' using errcode = 'check_violation';
  end if;
  update public.ranking_cycles set estado = p_estado where id = p_ciclo and ranking = 'the-impact';
  perform public.thi_bitacora(p_ciclo, null, 'ciclo_estado', v_de, p_estado);
end;
$$;

/**
 * Guarda fechas, avisos y encabezado del ciclo. p_cambios lleva las claves de thi_config que se quieran cambiar
 * (las no listadas se ignoran); p_fecha_limite y p_ods se aplican a ranking_cycles.
 */
create or replace function public.thi_guardar_config(p_ciclo uuid, p_cambios jsonb, p_fecha_limite date default null, p_ods int[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := coalesce(p_cambios, '{}'::jsonb);
  v_dias int[];
  v_avisar uuid[];
begin
  perform public.thi_exige_admin();
  if not exists (select 1 from public.ranking_cycles where id = p_ciclo and ranking = 'the-impact') then
    raise exception 'Ese ciclo no es de THE Impact.' using errcode = 'P0002';
  end if;
  insert into public.thi_config (ciclo_id) values (p_ciclo) on conflict (ciclo_id) do nothing;
  if c ? 'recordatorio_dias' then
    select coalesce(array_agg(x::int order by x::int desc), '{}'::int[]) into v_dias from jsonb_array_elements_text(c -> 'recordatorio_dias') x;
  end if;
  if c ? 'avisar_a' then
    select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_avisar from jsonb_array_elements_text(c -> 'avisar_a') x;
  end if;
  update public.thi_config set
    universidad       = coalesce(nullif(btrim(c ->> 'universidad'), ''), universidad),
    pais              = coalesce(nullif(btrim(c ->> 'pais'), ''), pais),
    web               = coalesce(c ->> 'web', web),
    anio_academico    = case when c ? 'anio_academico' then nullif(c ->> 'anio_academico', '')::int else anio_academico end,
    periodo_ref_desde = case when c ? 'periodo_ref_desde' then nullif(c ->> 'periodo_ref_desde', '')::date else periodo_ref_desde end,
    periodo_ref_hasta = case when c ? 'periodo_ref_hasta' then nullif(c ->> 'periodo_ref_hasta', '')::date else periodo_ref_hasta end,
    envio_desde       = case when c ? 'envio_desde' then nullif(c ->> 'envio_desde', '')::date else envio_desde end,
    envio_hasta       = case when c ? 'envio_hasta' then nullif(c ->> 'envio_hasta', '')::date else envio_hasta end,
    recordatorio_dias = coalesce(v_dias, recordatorio_dias),
    resumen_semanal   = coalesce((c ->> 'resumen_semanal')::boolean, resumen_semanal),
    resumen_dia       = coalesce((c ->> 'resumen_dia')::int, resumen_dia),
    avisos_activos    = coalesce((c ->> 'avisos_activos')::boolean, avisos_activos),
    avisar_a          = coalesce(v_avisar, avisar_a),
    updated_by        = auth.uid()
   where ciclo_id = p_ciclo;
  if p_fecha_limite is not null or p_ods is not null or c ? 'fecha_limite' then
    update public.ranking_cycles set
      fecha_limite    = case when c ? 'fecha_limite' then p_fecha_limite else coalesce(p_fecha_limite, fecha_limite) end,
      ods_priorizados = coalesce(p_ods, ods_priorizados)
     where id = p_ciclo and ranking = 'the-impact';
  end if;
  perform public.thi_bitacora(p_ciclo, null, 'config_guardada', null, null, jsonb_build_object('claves', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(c) k)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS y permisos
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['thi_config', 'thi_requisitos', 'thi_carpetas', 'thi_evidencias', 'thi_evidencia_reservas', 'thi_actividad', 'thi_notificaciones', 'thi_publicaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Quien puede leer el reporte (Planeación o miembro de una oficina) lee la configuración y los requisitos.
drop policy if exists thi_config_leer on public.thi_config;
create policy thi_config_leer on public.thi_config for select to authenticated using (public.ranking_puede_leer_ciclo());
drop policy if exists thi_requisitos_leer on public.thi_requisitos;
create policy thi_requisitos_leer on public.thi_requisitos for select to authenticated using (public.ranking_puede_leer_ciclo());
drop policy if exists thi_carpetas_leer on public.thi_carpetas;
create policy thi_carpetas_leer on public.thi_carpetas for select to authenticated using (public.ranking_puede_leer_ciclo());
drop policy if exists thi_evidencias_leer on public.thi_evidencias;
create policy thi_evidencias_leer on public.thi_evidencias for select to authenticated using (public.ranking_respuesta_visible(respuesta_id));
drop policy if exists thi_reservas_leer on public.thi_evidencia_reservas;
create policy thi_reservas_leer on public.thi_evidencia_reservas for select to authenticated using (usuario_id = auth.uid() or public.thi_es_admin());
drop policy if exists thi_actividad_leer on public.thi_actividad;
create policy thi_actividad_leer on public.thi_actividad for select to authenticated
  using (public.thi_es_admin() or (respuesta_id is not null and public.ranking_respuesta_visible(respuesta_id)));
drop policy if exists thi_notif_leer on public.thi_notificaciones;
create policy thi_notif_leer on public.thi_notificaciones for select to authenticated using (public.thi_es_admin() or destinatario = auth.uid());
drop policy if exists thi_publicaciones_leer on public.thi_publicaciones;
create policy thi_publicaciones_leer on public.thi_publicaciones for select to authenticated using (public.thi_es_admin() or public.unit_can_view(unidad));

do $$
declare
  f text;
begin
  foreach f in array array['thi_es_admin()', 'thi_exige_admin()', 'thi_ods_nombre(int)',
                           'thi_crear_ciclo(int, int, date, uuid)', 'thi_cambiar_estado_ciclo(uuid, text)', 'thi_guardar_config(uuid, jsonb, date, int[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['thi_bitacora(uuid, uuid, text, text, text, jsonb, text)', 'thi_config_al_crear_ciclo()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
