-- =============================================================================
-- 0152 · Biblioteca de evidencias del ranking THE y reporte directo de Planeación
--
-- Planeación (y la administración) sube un ZIP con carpetas de evidencias; el
-- navegador lo descomprime, guarda cada archivo en el bucket privado
-- «ranking-biblioteca», lee su texto y Pilo lo apunta, sin IA, a sus ODS e
-- indicadores de THE. Planeación acepta, corrige o descarta cada propuesta;
-- aceptar liga el archivo como evidencia de una respuesta (ranking_evidence).
--
--   ranking_biblioteca   un archivo de la biblioteca: de qué ZIP y ruta salió,
--                        su SHA-256 (único: el mismo contenido no se guarda dos
--                        veces), el texto leído (acotado, para reclasificar sin
--                        volver a leer el archivo), los ODS y las propuestas
--                        [{indicador, ods, puntaje, razones[]}] y su estado:
--                        sin_clasificar | propuesta | aceptada | descartada.
--
--   ranking_evidence     + columna `biblioteca`: la evidencia es un archivo de
--                        la biblioteca (su storage_path es del bucket
--                        «ranking-biblioteca», no de «ranking-evidencias»).
--                        + clase «nota»: una evidencia que el Excel de THE traía
--                        como texto y no como enlace. No cuenta como evidencia
--                        para enviar ni para los puntos; recuerda lo que falta.
--
-- Decisión de permisos (corrección aditiva de 0149): desde 0061,
-- unit_can_view() solo deja ver lo de otra unidad a la administración, así que
-- una persona con rol planeacion que no es admin no veía las respuestas, las
-- evidencias, los enlaces ni las asignaciones de las oficinas, aunque 0149 dice
-- que «Planeación lee y escribe todo» y sí podía escribirlas. Se agregan
-- políticas de lectura con has_role_at_least('planeacion'); las de 0149 no se
-- tocan.
--
-- Sin acceso anónimo. Todo DELETE lleva WHERE (safeupdate, ver 0095). Esta
-- migración no borra filas. Requiere 0149 y 0150. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La biblioteca
-- -----------------------------------------------------------------------------

create table if not exists public.ranking_biblioteca (
  id                 uuid primary key default gen_random_uuid(),
  ciclo              uuid references public.ranking_cycles (id) on delete set null,
  zip_nombre         text not null default '',
  ruta_zip           text not null,
  nombre             text not null,
  carpeta            text not null default '',
  ext                text not null default '',
  tamano             bigint not null,
  mime               text,
  sha256             text not null,
  storage_path       text not null,
  anio_detectado     int,
  texto              text not null default '',
  estado_texto       text not null default 'no_aplica',
  nota_texto         text,
  ods_propuestos     int[] not null default '{}'::int[],
  propuestas         jsonb not null default '[]'::jsonb,
  estado             text not null default 'sin_clasificar',
  indicador_aceptado text,
  respuesta_aceptada uuid references public.ranking_responses (id) on delete set null,
  evidencia          uuid,
  subido_por         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ranking_biblioteca_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint ranking_biblioteca_tamano check (tamano between 1 and 104857600),
  constraint ranking_biblioteca_texto check (char_length(texto) <= 20000),
  constraint ranking_biblioteca_estado check (estado in ('sin_clasificar', 'propuesta', 'aceptada', 'descartada')),
  constraint ranking_biblioteca_estado_texto check (estado_texto in ('ok', 'sin_texto', 'no_aplica', 'error')),
  constraint ranking_biblioteca_propuestas check (jsonb_typeof(propuestas) = 'array'),
  constraint ranking_biblioteca_ods check (ods_propuestos <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::int[]),
  constraint ranking_biblioteca_anio check (anio_detectado is null or anio_detectado between 1990 and 2100),
  -- La ruta del bucket no puede subir ni ser absoluta.
  constraint ranking_biblioteca_ruta check (storage_path !~ '(^/|\.\./|^\.\.$)')
);

comment on table public.ranking_biblioteca is
  'Archivos de evidencia que Planeación sube en ZIP (bucket ranking-biblioteca). Pilo propone ODS e indicadores sin IA; Planeación acepta, corrige o descarta.';
comment on column public.ranking_biblioteca.propuestas is
  'Hasta tres candidatos [{indicador, ods, puntaje 0-100, razones[]}], del más al menos probable.';

create unique index if not exists ranking_biblioteca_sha_unico on public.ranking_biblioteca (sha256);
create unique index if not exists ranking_biblioteca_ruta_unica on public.ranking_biblioteca (storage_path);
create index if not exists ranking_biblioteca_estado_idx on public.ranking_biblioteca (estado, created_at desc);

drop trigger if exists ranking_biblioteca_set_updated_at on public.ranking_biblioteca;
create trigger ranking_biblioteca_set_updated_at before update on public.ranking_biblioteca
  for each row execute function public.set_updated_at();

alter table public.ranking_biblioteca enable row level security;

drop policy if exists ranking_biblioteca_planeacion on public.ranking_biblioteca;
create policy ranking_biblioteca_planeacion on public.ranking_biblioteca for all to authenticated
  using (public.has_role_at_least('planeacion'))
  with check (public.has_role_at_least('planeacion'));

revoke all on public.ranking_biblioteca from anon;
grant select, insert, update, delete on public.ranking_biblioteca to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Evidencias: de la biblioteca, y notas
-- -----------------------------------------------------------------------------

alter table public.ranking_evidence
  add column if not exists biblioteca uuid references public.ranking_biblioteca (id) on delete set null;

comment on column public.ranking_evidence.biblioteca is
  'Si la evidencia es un archivo de la biblioteca: su fila. Entonces storage_path es del bucket ranking-biblioteca.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ranking_biblioteca_evidencia_fk') then
    alter table public.ranking_biblioteca
      add constraint ranking_biblioteca_evidencia_fk foreign key (evidencia)
      references public.ranking_evidence (id) on delete set null;
  end if;
end $$;

-- Las restricciones de 0149, ampliadas con la clase «nota» (solo admiten más, no menos).
alter table public.ranking_evidence drop constraint if exists ranking_evidence_kind;
alter table public.ranking_evidence add constraint ranking_evidence_kind check (kind in ('file', 'url', 'nota'));
alter table public.ranking_evidence drop constraint if exists ranking_evidence_origen;
alter table public.ranking_evidence add constraint ranking_evidence_origen check (
  (kind = 'url' and url is not null and storage_path is null)
  or (kind = 'file' and storage_path is not null and url is null)
  or (kind = 'nota' and url is null and storage_path is null and char_length(nombre) between 1 and 1000)
);

-- Un archivo de la biblioteca se liga una sola vez a la misma respuesta.
create unique index if not exists ranking_evidence_biblioteca_unica
  on public.ranking_evidence (response_id, biblioteca) where biblioteca is not null;

-- -----------------------------------------------------------------------------
-- 3. Lectura para Planeación (corrección aditiva de 0149, ver la cabecera)
-- -----------------------------------------------------------------------------

drop policy if exists ranking_responses_read_planeacion on public.ranking_responses;
create policy ranking_responses_read_planeacion on public.ranking_responses for select to authenticated
  using (public.has_role_at_least('planeacion'));

drop policy if exists ranking_evidence_read_planeacion on public.ranking_evidence;
create policy ranking_evidence_read_planeacion on public.ranking_evidence for select to authenticated
  using (public.has_role_at_least('planeacion'));

drop policy if exists ranking_evidence_links_read_planeacion on public.ranking_evidence_links;
create policy ranking_evidence_links_read_planeacion on public.ranking_evidence_links for select to authenticated
  using (public.has_role_at_least('planeacion'));

drop policy if exists ranking_assignments_read_planeacion on public.ranking_assignments;
create policy ranking_assignments_read_planeacion on public.ranking_assignments for select to authenticated
  using (public.has_role_at_least('planeacion'));

-- -----------------------------------------------------------------------------
-- 4. Bucket «ranking-biblioteca» (privado) y lectura de evidencias para Planeación
--
-- 50 MB por archivo: es también el límite global por defecto de Supabase
-- Storage. Si el límite global del proyecto es menor, manda el global (se
-- cambia en la configuración del servidor, no aquí).
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('ranking-biblioteca', 'ranking-biblioteca', false, 52428800)   -- 50 MB, privado
  on conflict (id) do update set public = false, file_size_limit = 52428800;

  -- Planeación lee y escribe toda la biblioteca.
  execute 'drop policy if exists ranking_biblioteca_lectura on storage.objects';
  execute $pol$
    create policy ranking_biblioteca_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'ranking-biblioteca'
             and (public.has_role_at_least('planeacion')
                  -- Una oficina ve el archivo que quedó como evidencia de una respuesta suya.
                  or exists (select 1 from public.ranking_evidence e
                              where e.biblioteca is not null
                                and e.storage_path = storage.objects.name
                                and public.ranking_respuesta_visible(e.response_id))))
  $pol$;

  execute 'drop policy if exists ranking_biblioteca_escritura on storage.objects';
  execute $pol$
    create policy ranking_biblioteca_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'ranking-biblioteca' and public.has_role_at_least('planeacion'))
  $pol$;

  execute 'drop policy if exists ranking_biblioteca_reemplazo on storage.objects';
  execute $pol$
    create policy ranking_biblioteca_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'ranking-biblioteca' and public.has_role_at_least('planeacion'))
      with check (bucket_id = 'ranking-biblioteca' and public.has_role_at_least('planeacion'))
  $pol$;

  execute 'drop policy if exists ranking_biblioteca_borrado on storage.objects';
  execute $pol$
    create policy ranking_biblioteca_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'ranking-biblioteca' and public.has_role_at_least('planeacion'))
  $pol$;

  -- Planeación (sin ser admin) también lee los archivos de evidencia de las oficinas.
  execute 'drop policy if exists ranking_evidencias_lectura_planeacion on storage.objects';
  execute $pol$
    create policy ranking_evidencias_lectura_planeacion on storage.objects
      for select to authenticated
      using (bucket_id = 'ranking-evidencias' and public.has_role_at_least('planeacion'))
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "ranking-biblioteca" (%). Créelo a mano desde Storage: privado, 50 MB por archivo, solo Planeación.',
      sqlerrm;
end $$;

notify pgrst, 'reload schema';
