-- =============================================================================
-- 0149 · Reporte por oficinas del ranking THE Impact
--
-- Planeación abre un ciclo, importa el Excel de THE (catálogo de los 17 ODS),
-- asigna cada indicador a una oficina y cada oficina responde con un dato o
-- un sí/no, varias evidencias (archivo o URL pública, la pública primero) y un
-- comentario en español de máximo 1000 caracteres. Pilo lo traduce a inglés.
-- Planeación aprueba o devuelve.
--
--   ranking_cycles            un ciclo por ranking y año: año de la edición,
--                             año de los datos, ODS priorizados, fecha límite
--                             y estado (preparación | abierto | cerrado).
--   ranking_indicators        el catálogo del ciclo. Tres niveles: metric
--                             (4.2), indicator (4.3.1) y option (4.3.1/2, un
--                             campo o subopción del indicador de padre).
--                             Tipo: ev (evidencia), doc (documento), dato
--                             (cifra) o inv (investigación que calcula THE).
--   ranking_assignments       indicador × oficina: principal (la responsable)
--                             o apoyo.
--   ranking_responses         la respuesta de una oficina a un indicador: cifras
--                             por campo en `valores` (jsonb, numérico), sí/no,
--                             estado, comentario en español (≤ 1000) y en inglés,
--                             y la nota de revisión de Planeación.
--   ranking_evidence          cada evidencia: archivo del bucket privado
--                             «ranking-evidencias» o URL https; si es pública,
--                             su análisis (chequeos) y si ya se optimizó.
--   ranking_evidence_links    una evidencia puede servir a varios indicadores
--                             de la misma oficina.
--
-- Estados de la respuesta: none → draft → sent → ok | back, y back → draft.
-- Además, Planeación puede devolver una respuesta ya aprobada (ok → back).
-- Quién envía (draft → sent): el jefe de la oficina o Planeación. Quién aprueba
-- o devuelve (sent → ok | back, ok → back): solo Planeación. Una respuesta
-- enviada o aprobada no la cambia nadie más que Planeación. Lo hace cumplir el
-- disparador `ranking_responses_guard`, no solo la interfaz.
--
-- Quién puede qué (sin acceso anónimo; todo queda en RLS):
--   · Planeación y la administración leen y escriben todo.
--   · Visor de la oficina: lee sus respuestas y evidencias.
--   · Editor: diligencia (datos, comentario y evidencias) mientras la respuesta
--     esté abierta (none, draft o back).
--   · Jefe: lo mismo que el editor, y además envía.
--   · El catálogo y las asignaciones solo los escribe Planeación; los leen los
--     miembros de alguna oficina.
--
-- Bucket «ranking-evidencias» (privado): la ruta es
-- «<unidad>/<respuesta>/<archivo>». Leer, quien ve la oficina; escribir, quien
-- puede editar esa respuesta mientras esté abierta.
--
-- Requiere 0002 (has_role_at_least), 0026 (set_updated_at), 0057 (units,
-- unit_members, unit_role_at, unit_can_view, unit_can_edit). Idempotente.
-- Todo DELETE lleva WHERE (safeupdate, ver 0095). Esta migración no borra filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.ranking_cycles (
  id              uuid primary key default gen_random_uuid(),
  ranking         text not null default 'the-impact',
  anio            int not null,
  anio_datos      int not null,
  ods_priorizados int[] not null default '{4,5,10,17}'::int[],
  fecha_limite    date,
  estado          text not null default 'preparacion',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ranking_cycles_unico unique (ranking, anio),
  constraint ranking_cycles_anio check (anio between 2019 and 2100),
  constraint ranking_cycles_anio_datos check (anio_datos between 2019 and 2100),
  constraint ranking_cycles_ods check (ods_priorizados <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::int[]),
  constraint ranking_cycles_estado check (estado in ('preparacion', 'abierto', 'cerrado'))
);

comment on table public.ranking_cycles is
  'Un ciclo de reporte por ranking y año de edición. ods_priorizados son los ODS que la universidad responde este año.';

drop trigger if exists ranking_cycles_set_updated_at on public.ranking_cycles;
create trigger ranking_cycles_set_updated_at before update on public.ranking_cycles
  for each row execute function public.set_updated_at();

create table if not exists public.ranking_indicators (
  ciclo               uuid not null references public.ranking_cycles (id) on delete cascade,
  id                  text not null,
  ods                 smallint not null,
  nivel               text not null,
  padre               text,
  tipo                text,
  texto_en            text not null default '',
  texto_es            text not null default '',
  peso                numeric,
  prioridad           text,
  tipo_requerimiento  text not null default '',
  orden               int not null default 0,
  primary key (ciclo, id),
  constraint ranking_indicators_ods check (ods between 1 and 17),
  constraint ranking_indicators_nivel check (nivel in ('metric', 'indicator', 'option')),
  constraint ranking_indicators_tipo check (tipo is null or tipo in ('ev', 'doc', 'dato', 'inv')),
  -- Solo las métricas van sin tipo; los indicadores y las opciones lo llevan.
  constraint ranking_indicators_tipo_nivel check (
    (nivel = 'metric' and tipo is null) or (nivel <> 'metric' and tipo is not null)
  ),
  constraint ranking_indicators_prioridad check (prioridad is null or prioridad in ('alta', 'media', 'baja')),
  constraint ranking_indicators_peso check (peso is null or peso between 0 and 1)
);

comment on table public.ranking_indicators is
  'Catálogo del ciclo, importado del Excel de THE. id = numeración de THE («4.3.1»); las opciones suman «/n» («4.3.1/2»).';

create index if not exists ranking_indicators_ods_idx on public.ranking_indicators (ciclo, ods, orden);

create table if not exists public.ranking_assignments (
  ciclo      uuid not null,
  indicador  text not null,
  unidad     uuid not null references public.units (id) on delete cascade,
  rol        text not null default 'principal',
  created_at timestamptz not null default now(),
  primary key (ciclo, indicador, unidad),
  constraint ranking_assignments_indicador foreign key (ciclo, indicador)
    references public.ranking_indicators (ciclo, id) on delete cascade,
  constraint ranking_assignments_rol check (rol in ('principal', 'apoyo'))
);

-- Cada indicador tiene una sola oficina principal.
create unique index if not exists ranking_assignments_principal_unica
  on public.ranking_assignments (ciclo, indicador) where rol = 'principal';
create index if not exists ranking_assignments_unidad_idx on public.ranking_assignments (unidad);

-- Valores numéricos por campo: todas las claves de `valores` llevan número o nulo.
create or replace function public.ranking_valores_numericos(v jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    (select bool_and(jsonb_typeof(kv.val) in ('number', 'null')) from jsonb_each(v) as kv(key, val)),
    true
  ) and jsonb_typeof(v) = 'object';
$$;

create table if not exists public.ranking_responses (
  id             uuid primary key default gen_random_uuid(),
  ciclo          uuid not null,
  indicador      text not null,
  unidad         uuid not null references public.units (id) on delete cascade,
  valores        jsonb not null default '{}'::jsonb,
  si_no          boolean,
  estado         text not null default 'none',
  comentario_es  text not null default '',
  comentario_en  text not null default '',
  nota_revision  text not null default '',
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ranking_responses_unica unique (ciclo, indicador, unidad),
  constraint ranking_responses_indicador foreign key (ciclo, indicador)
    references public.ranking_indicators (ciclo, id) on delete cascade,
  constraint ranking_responses_estado check (estado in ('none', 'draft', 'sent', 'back', 'ok')),
  constraint ranking_responses_valores check (public.ranking_valores_numericos(valores)),
  constraint ranking_responses_comentario_es check (char_length(comentario_es) <= 1000),
  constraint ranking_responses_nota check (char_length(nota_revision) <= 2000)
);

comment on table public.ranking_responses is
  'La respuesta de una oficina a un indicador. comentario_es tiene tope de 1000 caracteres (lo que THE acepta); lo traduce Pilo a comentario_en.';

create index if not exists ranking_responses_unidad_idx on public.ranking_responses (unidad, estado);

create table if not exists public.ranking_evidence (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references public.ranking_responses (id) on delete cascade,
  kind         text not null,
  url          text,
  storage_path text,
  nombre       text not null default '',
  mime         text,
  tamano       bigint,
  publica      boolean not null default false,
  analisis     jsonb not null default '[]'::jsonb,
  optimizada   boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ranking_evidence_kind check (kind in ('file', 'url')),
  constraint ranking_evidence_origen check (
    (kind = 'url' and url is not null and storage_path is null)
    or (kind = 'file' and storage_path is not null and url is null)
  ),
  constraint ranking_evidence_url check (url is null or url ~* '^https://'),
  -- 15 MB como máximo por archivo.
  constraint ranking_evidence_tamano check (tamano is null or tamano between 0 and 15728640),
  constraint ranking_evidence_analisis check (jsonb_typeof(analisis) = 'array')
);

comment on table public.ranking_evidence is
  'Evidencias de una respuesta: archivo (bucket ranking-evidencias) o URL https. analisis guarda los chequeos del momento de subirla.';

create index if not exists ranking_evidence_response_idx on public.ranking_evidence (response_id);

create table if not exists public.ranking_evidence_links (
  evidence_id uuid not null references public.ranking_evidence (id) on delete cascade,
  response_id uuid not null references public.ranking_responses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (evidence_id, response_id)
);

comment on table public.ranking_evidence_links is
  'Una evidencia que sirve también a otros indicadores de la misma oficina. El disparador exige que sean de la misma oficina.';

create index if not exists ranking_evidence_links_response_idx on public.ranking_evidence_links (response_id);

-- -----------------------------------------------------------------------------
-- 2. Funciones de permiso (security definer: leen las tablas sin pasar por RLS)
-- -----------------------------------------------------------------------------

/** ¿Puede leer el ciclo y su catálogo? Planeación, o miembro de alguna oficina. */
create or replace function public.ranking_puede_leer_ciclo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (select 1 from public.unit_members m where m.profile_id = auth.uid());
$$;

/**
 * Papel de quien pregunta frente a una oficina: 'planeacion' (gana siempre),
 * o 'jefe' / 'editor' / 'visor' según su pertenencia más cercana. Nulo si no tiene.
 */
create or replace function public.ranking_actor(unidad uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.has_role_at_least('planeacion') then 'planeacion'
           else public.unit_role_at(unidad)
         end;
$$;

/** ¿Está abierta la respuesta a cambios de la oficina? Solo none, draft y back; Planeación siempre. */
create or replace function public.ranking_respuesta_abierta(resp uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or exists (
           select 1 from public.ranking_responses r
            where r.id = resp
              and r.estado in ('none', 'draft', 'back')
              and public.unit_can_edit(r.unidad)
         );
$$;

/** ¿Puede ver la respuesta quien pregunta? Lo mismo que ver la oficina. */
create or replace function public.ranking_respuesta_visible(resp uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ranking_responses r
     where r.id = resp
       and public.unit_can_view(r.unidad)
  );
$$;

/**
 * Transiciones del estado de una respuesta, y quién las puede hacer. Es el
 * mismo cuadro que src/modules/rankings/reporte/estados.ts; si cambia uno, cambia el otro.
 */
create or replace function public.ranking_transicion_permitida(de text, a text, actor text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      when de = 'none'  and a = 'draft' then actor in ('planeacion', 'jefe', 'editor')
      when de = 'back'  and a = 'draft' then actor in ('planeacion', 'jefe', 'editor')
      when de = 'draft' and a = 'sent'  then actor in ('planeacion', 'jefe')
      when de = 'sent'  and a in ('ok', 'back') then actor = 'planeacion'
      when de = 'ok'    and a = 'back'  then actor = 'planeacion'
      else false
    end,
    false
  );
$$;

/** Ruta del bucket → id de la oficina (primer segmento). Nulo si la ruta no es válida. */
create or replace function public.ranking_unidad_de_ruta(ruta text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(ruta, '/'))[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

/** Ruta del bucket → id de la respuesta (segundo segmento). Nulo si la ruta no es válida. */
create or replace function public.ranking_respuesta_de_ruta(ruta text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(ruta, '/'))[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Disparadores
-- -----------------------------------------------------------------------------

/**
 * Hace cumplir el flujo de estados y el bloqueo de respuestas enviadas. Las
 * escrituras sin sesión (clave de servicio, migraciones) pasan: son del servidor.
 */
create or replace function public.ranking_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  new.updated_at := now();

  if auth.uid() is null then
    return new;
  end if;

  actor := public.ranking_actor(new.unidad);
  if actor is null or actor = 'visor' then
    raise exception 'Sin permiso para cambiar esta respuesta' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.estado not in ('none', 'draft') and actor <> 'planeacion' then
      raise exception 'Una respuesta nueva empieza en borrador' using errcode = '42501';
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if old.estado in ('sent', 'ok') and actor <> 'planeacion' then
    raise exception 'La respuesta ya se envió: solo Planeación la puede cambiar' using errcode = '42501';
  end if;

  if new.estado is distinct from old.estado
     and not public.ranking_transicion_permitida(old.estado, new.estado, actor) then
    raise exception 'Cambio de estado no permitido: % → % (%)', old.estado, new.estado, actor
      using errcode = '42501';
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists ranking_responses_guard_trg on public.ranking_responses;
create trigger ranking_responses_guard_trg before insert or update on public.ranking_responses
  for each row execute function public.ranking_responses_guard();

/** Una evidencia enlazada sirve a indicadores de su misma oficina, no de otra. */
create or replace function public.ranking_links_misma_unidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.ranking_evidence e
      join public.ranking_responses propia on propia.id = e.response_id
      join public.ranking_responses destino on destino.id = new.response_id
     where e.id = new.evidence_id
       and propia.unidad = destino.unidad
  ) then
    raise exception 'La evidencia y el indicador deben ser de la misma oficina' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ranking_evidence_links_mismo_trg on public.ranking_evidence_links;
create trigger ranking_evidence_links_mismo_trg before insert or update on public.ranking_evidence_links
  for each row execute function public.ranking_links_misma_unidad();

-- -----------------------------------------------------------------------------
-- 4. RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.ranking_cycles          enable row level security;
alter table public.ranking_indicators      enable row level security;
alter table public.ranking_assignments     enable row level security;
alter table public.ranking_responses       enable row level security;
alter table public.ranking_evidence        enable row level security;
alter table public.ranking_evidence_links  enable row level security;

-- Ciclos e indicadores: los leen Planeación y las oficinas; los escribe Planeación.
drop policy if exists ranking_cycles_read on public.ranking_cycles;
create policy ranking_cycles_read on public.ranking_cycles for select to authenticated
  using (public.ranking_puede_leer_ciclo());
drop policy if exists ranking_cycles_write on public.ranking_cycles;
create policy ranking_cycles_write on public.ranking_cycles for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

drop policy if exists ranking_indicators_read on public.ranking_indicators;
create policy ranking_indicators_read on public.ranking_indicators for select to authenticated
  using (public.ranking_puede_leer_ciclo());
drop policy if exists ranking_indicators_write on public.ranking_indicators;
create policy ranking_indicators_write on public.ranking_indicators for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- Asignaciones: cada oficina ve las suyas; Planeación las escribe.
drop policy if exists ranking_assignments_read on public.ranking_assignments;
create policy ranking_assignments_read on public.ranking_assignments for select to authenticated
  using (public.unit_can_view(unidad));
drop policy if exists ranking_assignments_write on public.ranking_assignments;
create policy ranking_assignments_write on public.ranking_assignments for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

-- Respuestas: la oficina las ve y las diligencia (editor o jefe); Planeación todo.
-- Enviar, aprobar y devolver los controla el disparador, no esta política.
drop policy if exists ranking_responses_read on public.ranking_responses;
create policy ranking_responses_read on public.ranking_responses for select to authenticated
  using (public.unit_can_view(unidad));
drop policy if exists ranking_responses_insert on public.ranking_responses;
create policy ranking_responses_insert on public.ranking_responses for insert to authenticated
  with check (public.has_role_at_least('planeacion') or public.unit_can_edit(unidad));
drop policy if exists ranking_responses_update on public.ranking_responses;
create policy ranking_responses_update on public.ranking_responses for update to authenticated
  using (public.has_role_at_least('planeacion') or public.unit_can_edit(unidad))
  with check (public.has_role_at_least('planeacion') or public.unit_can_edit(unidad));
drop policy if exists ranking_responses_delete on public.ranking_responses;
create policy ranking_responses_delete on public.ranking_responses for delete to authenticated
  using (public.has_role_at_least('planeacion'));

-- Evidencias y enlaces: se ven con la respuesta; se tocan mientras la respuesta esté abierta.
drop policy if exists ranking_evidence_read on public.ranking_evidence;
create policy ranking_evidence_read on public.ranking_evidence for select to authenticated
  using (public.ranking_respuesta_visible(response_id));
drop policy if exists ranking_evidence_write on public.ranking_evidence;
create policy ranking_evidence_write on public.ranking_evidence for all to authenticated
  using (public.ranking_respuesta_abierta(response_id))
  with check (public.ranking_respuesta_abierta(response_id));

drop policy if exists ranking_evidence_links_read on public.ranking_evidence_links;
create policy ranking_evidence_links_read on public.ranking_evidence_links for select to authenticated
  using (public.ranking_respuesta_visible(response_id));
drop policy if exists ranking_evidence_links_write on public.ranking_evidence_links;
create policy ranking_evidence_links_write on public.ranking_evidence_links for all to authenticated
  using (public.ranking_respuesta_abierta(response_id))
  with check (public.ranking_respuesta_abierta(response_id));

-- Sin acceso anónimo: ni siquiera lectura.
revoke all on public.ranking_cycles, public.ranking_indicators, public.ranking_assignments,
              public.ranking_responses, public.ranking_evidence, public.ranking_evidence_links
  from anon;
grant select, insert, update, delete on public.ranking_cycles, public.ranking_indicators,
  public.ranking_assignments, public.ranking_responses, public.ranking_evidence,
  public.ranking_evidence_links to authenticated;

-- -----------------------------------------------------------------------------
-- 5. El bucket de evidencias (privado)
--
-- Mismo patrón que «documentos» (0051): si quien aplica la migración no es
-- dueño de storage.objects, el resto queda aplicado y el aviso dice qué hacer.
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('ranking-evidencias', 'ranking-evidencias', false, 15728640)   -- 15 MB, privado
  on conflict (id) do update set public = false, file_size_limit = 15728640;

  execute 'drop policy if exists ranking_evidencias_lectura on storage.objects';
  execute $pol$
    create policy ranking_evidencias_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'ranking-evidencias'
             and public.unit_can_view(public.ranking_unidad_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists ranking_evidencias_escritura on storage.objects';
  execute $pol$
    create policy ranking_evidencias_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'ranking-evidencias'
                  and (public.has_role_at_least('planeacion')
                       or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.ranking_respuesta_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists ranking_evidencias_reemplazo on storage.objects';
  execute $pol$
    create policy ranking_evidencias_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'ranking-evidencias'
             and (public.has_role_at_least('planeacion')
                  or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.ranking_respuesta_abierta(public.ranking_respuesta_de_ruta(name)))
      with check (bucket_id = 'ranking-evidencias'
                  and (public.has_role_at_least('planeacion')
                       or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
                  and public.ranking_respuesta_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;

  execute 'drop policy if exists ranking_evidencias_borrado on storage.objects';
  execute $pol$
    create policy ranking_evidencias_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'ranking-evidencias'
             and (public.has_role_at_least('planeacion')
                  or public.unit_can_edit(public.ranking_unidad_de_ruta(name)))
             and public.ranking_respuesta_abierta(public.ranking_respuesta_de_ruta(name)))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "ranking-evidencias" (%). Créalo a mano desde Storage: privado, 15 MB por archivo.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
