-- =============================================================================
-- 0255 · Internacionalización: Convenios (registro propio, ruta de firma e historial)
--
-- Reemplaza el Excel institucional «Relación de convenios» por un registro con
-- tablas propias (prefijo conv_). NO toca las tablas Multicampus de 0166/0167
-- (int_libros / int_hojas / int_filas): esas siguen como están.
--
--   conv_convenios    un convenio. La vigencia (Vigente / Por vencer / Vencido / Sin fecha)
--                     NO se guarda: se calcula con las fechas. Se guardan a mano la ruta de
--                     firma (pasos, 0 a 5) y el cierre anticipado (cerrado).
--   conv_historial    todo cambio relevante (creación, importación, pasos, renovación,
--                     carpeta, cierre), con fecha y autor.
--   conv_documentos   esqueleto para la etapa de gestión (carga de archivos): vacía, sin lógica.
--
-- Quién puede qué: ven el módulo quienes ya ven Internacionalización (int_ve_modulo);
-- crean y editan Director, Planeación y Coordinadores (int_puede_crear, 0166). Nadie borra
-- convenios desde la pantalla (no hay política de borrado).
--
-- También deja la plantilla «Renovación de convenio» en rel_plantillas (0254) para el
-- botón «Avisar». No envía nada: el envío masivo sigue siendo manual, en Relaciones.
--
-- Requiere 0166 y 0254. Idempotente. Todo DELETE lleva WHERE (safeupdate, 0095).
-- =============================================================================

create table if not exists public.conv_convenios (
  id                    uuid primary key default gen_random_uuid(),
  -- ci-01-### (internacional) o cn-01-### (nacional), siempre en minúsculas.
  codigo                text not null,
  documento             text not null default 'Convenio',
  naturaleza            text not null default 'Internacional',
  institucion           text not null,
  -- Nombre del país como en el mapa de UDES en cifras; «Varios países» o «Sin país» si no aplica.
  pais                  text not null default 'Sin país',
  -- ISO 3166-1 alfa-3 si el país se ubica en el mapa.
  pais_cod              text,
  objeto                text not null default '',
  tipo                  text not null default 'Sin tipo',
  -- Lo que decía el Excel cuando se escribió de otra manera.
  tipo_excel            text not null default '',
  modalidad             text not null default '',
  fecha_firma           date,
  fecha_terminacion     date,
  indefinido            boolean not null default false,
  renovacion            text not null default '',
  campus                text not null default 'Todos',
  facultad              text not null default '',
  programas             text not null default '',
  observaciones         text not null default '',
  -- enlace | udrive_solicitada | sin
  carpeta_estado        text not null default 'sin',
  carpeta_url           text,
  carpeta_solicitada_en timestamptz,
  -- Pasos hechos de la ruta de firma (0 a 5) y la fecha en que se hizo cada uno ([null|'AAAA-MM-DD' × 5]).
  pasos                 smallint not null default 1,
  pasos_fechas          jsonb not null default '[null,null,null,null,null]'::jsonb,
  cerrado               boolean not null default false,
  cerrado_en            date,
  -- Estado que traía el Excel (normalizado), para avisar si ya no coincide con las fechas.
  estado_excel          text,
  origen                text not null default 'manual',
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint conv_codigo_formato check (codigo ~ '^c[in]-[0-9]{2}-[0-9]{3}$'),
  constraint conv_codigo_unico unique (codigo),
  constraint conv_naturaleza check (naturaleza in ('Internacional', 'Nacional')),
  constraint conv_institucion check (char_length(btrim(institucion)) between 1 and 300),
  constraint conv_tipo check (tipo in ('Marco', 'Específico', 'Otro', 'Sin tipo')),
  constraint conv_carpeta check (carpeta_estado in ('enlace', 'udrive_solicitada', 'sin')),
  constraint conv_carpeta_url check (carpeta_url is null or carpeta_url ~ '^https://[^[:space:]]+$'),
  constraint conv_pasos check (pasos between 0 and 5),
  constraint conv_pasos_fechas check (jsonb_typeof(pasos_fechas) = 'array'),
  constraint conv_indefinido check (not (indefinido and fecha_terminacion is not null)),
  constraint conv_origen check (origen in ('manual', 'excel'))
);

comment on table public.conv_convenios is
  'Convenios (0255): registro de Internacionalización. La vigencia se calcula con fecha_terminacion; pasos y cerrado se guardan a mano.';

create index if not exists conv_convenios_pais_idx on public.conv_convenios (pais);
create index if not exists conv_convenios_termina_idx on public.conv_convenios (fecha_terminacion);

drop trigger if exists conv_convenios_set_updated_at on public.conv_convenios;
create trigger conv_convenios_set_updated_at before update on public.conv_convenios
  for each row execute function public.set_updated_at();

create table if not exists public.conv_historial (
  id           uuid primary key default gen_random_uuid(),
  convenio_id  uuid not null references public.conv_convenios (id) on delete cascade,
  fecha        date not null default current_date,
  texto        text not null,
  autor        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint conv_historial_texto check (char_length(btrim(texto)) between 1 and 1000)
);

create index if not exists conv_historial_convenio_idx on public.conv_historial (convenio_id, fecha desc, created_at desc);

-- Esqueleto para la etapa de gestión: los espacios de documentos de cada convenio. Sin lógica de subida.
create table if not exists public.conv_documentos (
  id           uuid primary key default gen_random_uuid(),
  convenio_id  uuid not null references public.conv_convenios (id) on delete cascade,
  espacio      text not null,
  nombre       text not null default '',
  ruta         text,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint conv_documentos_espacio check (espacio in ('firmado', 'borrador', 'adendas', 'acta', 'informes'))
);

create index if not exists conv_documentos_convenio_idx on public.conv_documentos (convenio_id);

alter table public.conv_convenios enable row level security;
alter table public.conv_historial enable row level security;
alter table public.conv_documentos enable row level security;

drop policy if exists conv_convenios_read on public.conv_convenios;
create policy conv_convenios_read on public.conv_convenios for select to authenticated
  using (public.int_ve_modulo());
drop policy if exists conv_convenios_insert on public.conv_convenios;
create policy conv_convenios_insert on public.conv_convenios for insert to authenticated
  with check (public.int_puede_crear());
drop policy if exists conv_convenios_update on public.conv_convenios;
create policy conv_convenios_update on public.conv_convenios for update to authenticated
  using (public.int_puede_crear()) with check (public.int_puede_crear());

drop policy if exists conv_historial_read on public.conv_historial;
create policy conv_historial_read on public.conv_historial for select to authenticated
  using (public.int_ve_modulo());
drop policy if exists conv_historial_insert on public.conv_historial;
create policy conv_historial_insert on public.conv_historial for insert to authenticated
  with check (public.int_puede_crear() and (autor is null or autor = auth.uid()));

drop policy if exists conv_documentos_read on public.conv_documentos;
create policy conv_documentos_read on public.conv_documentos for select to authenticated
  using (public.int_ve_modulo());

-- -----------------------------------------------------------------------------
-- Plantilla de correo para «Avisar» (una sola vez: por nombre)
-- -----------------------------------------------------------------------------

insert into public.rel_plantillas (nombre, asunto, cuerpo, usa_actividad, actividad)
select 'Renovación de convenio',
       'Renovación del convenio con la Universidad de Santander',
       E'Estimado(a) {{nombre}}:\n\nDesde la Oficina de Relaciones Internacionales de la Universidad de Santander le escribimos porque el convenio que nos une con {{institucion}} se acerca a su fecha de terminación.\n\nQueremos conversar con usted sobre su renovación y revisar qué actividades de movilidad y cooperación convendría mantener o ampliar.\n\nQuedamos atentos a su respuesta para acordar los pasos siguientes.\n\nCordialmente,\nRelaciones Internacionales · UDES',
       false, '{}'::jsonb
where not exists (select 1 from public.rel_plantillas p where p.nombre = 'Renovación de convenio');
