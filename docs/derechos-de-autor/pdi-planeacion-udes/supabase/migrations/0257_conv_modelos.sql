-- =============================================================================
-- 0257 · Internacionalización › Gestión de convenios, parte 1: modelos de convenio
--
-- Se apoya en 0255 (Convenios) y 0256. Idempotente. Todo DELETE lleva WHERE (safeupdate, 0095).
--
--   conv_modelos     un modelo: nombre, tipo de documento, idioma (es | en | bi), versión, estado
--                    (borrador | vigente) y UNA de dos fuentes de contenido:
--                      · editor  contenido_html (HTML saneado) escrito en la hoja del navegador.
--                      · word    archivo .docx ORIGINAL guardado tal cual en Storage (archivo_ruta);
--                                al generar se sustituyen los campos dentro de su XML.
--                    Guarda además los campos detectados/usados (campos, marcadores), los campos
--                    personalizados, los logos y —para la segunda parte, la firma electrónica— la
--                    definición de firmantes (orden, rol, métodos permitidos) y las posiciones de
--                    las cajas de firma (cajas_firma).
--   conv_generados   cada convenio generado a partir de un modelo: referencia al convenio, modelo y
--                    versión, idioma, formato, ruta del archivo, huella SHA-256 del archivo
--                    generado, valores usados, autor y fecha. Estado «listo_firma»: la segunda
--                    parte añade el envío a firma. Nadie borra ni edita desde la pantalla.
--   Storage          bucket PRIVADO «conv-modelos» (decisión: bucket propio y no la carpeta UDrive
--                    del convenio, porque UDrive exige cuotas, carpetas y registro en drive_archivos
--                    y el riesgo de dejar archivos a medias es mayor que su beneficio; el generado se
--                    ve y se descarga desde Gestión › Modelos y deja una línea en el historial).
--                    Rutas:  modelos/<modelo>/original.docx · modelos/<modelo>/logo-udes.<ext>
--                            generados/<convenio>/<generado>.<docx|html> · generados/<convenio>/logo-institucion.<ext>
--                    Lectura: int_ve_modulo(); escritura: int_puede_crear(). Imágenes: png, jpg o svg, 2 MB.
--
-- PARA LA SEGUNDA PARTE (firma electrónica): LA FIRMA EXIGE UN PDF.
--   · Modelos del editor propio: el PDF puede producirse en el cliente desde el HTML (impresión del
--     navegador o una librería pequeña) y firmarse sobre el hash del PDF.
--   · Plantillas Word: convertir .docx → PDF NO es fiable en el navegador. La opción realista es un
--     servicio en el servidor (LibreOffice headless o Gotenberg en Coolify) que reciba el .docx
--     generado y devuelva el PDF; esa huella es la que se firma. Decisión pendiente del usuario.
-- =============================================================================

create table if not exists public.conv_modelos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  tipo_documento    text not null default 'Convenio',
  idioma            text not null default 'es',
  version           integer not null default 1,
  estado            text not null default 'borrador',
  fuente            text not null default 'editor',
  -- fuente = editor
  contenido_html    text not null default '',
  -- fuente = word
  archivo_ruta      text,
  archivo_nombre    text,
  archivo_hash      text,
  archivo_tamano    integer,
  -- Claves de campo halladas en el Word ({{campo}}, [campo] o <<campo>>, normalizadas).
  marcadores        jsonb not null default '[]'::jsonb,
  -- Campos propios del modelo: [{k, etiqueta}] (se piden al generar).
  campos_personalizados jsonb not null default '[]'::jsonb,
  -- Logos: nulo = el oficial de la UDES.
  logo_udes_ruta    text,
  -- Para la segunda parte: [{orden, rol, metodos[]}] y [{firmante, ancla}].
  firmantes         jsonb not null default '[{"orden":1,"rol":"Rector UDES","metodos":["simple","avanzada","certificado"]},{"orden":2,"rol":"Representante de la contraparte","metodos":["simple","avanzada","certificado"]}]'::jsonb,
  cajas_firma       jsonb not null default '[]'::jsonb,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint conv_modelos_nombre check (char_length(btrim(nombre)) between 1 and 160),
  constraint conv_modelos_idioma check (idioma in ('es', 'en', 'bi')),
  constraint conv_modelos_estado check (estado in ('borrador', 'vigente')),
  constraint conv_modelos_fuente check (fuente in ('editor', 'word')),
  constraint conv_modelos_version check (version >= 1),
  constraint conv_modelos_html check (char_length(contenido_html) <= 400000),
  constraint conv_modelos_marcadores check (jsonb_typeof(marcadores) = 'array'),
  constraint conv_modelos_personalizados check (jsonb_typeof(campos_personalizados) = 'array'),
  constraint conv_modelos_firmantes check (jsonb_typeof(firmantes) = 'array' and jsonb_typeof(cajas_firma) = 'array')
);

create index if not exists conv_modelos_estado_idx on public.conv_modelos (estado, nombre);

drop trigger if exists conv_modelos_set_updated_at on public.conv_modelos;
create trigger conv_modelos_set_updated_at before update on public.conv_modelos
  for each row execute function public.set_updated_at();

create table if not exists public.conv_generados (
  id              uuid primary key default gen_random_uuid(),
  convenio_id     uuid not null references public.conv_convenios (id) on delete cascade,
  modelo_id       uuid references public.conv_modelos (id) on delete set null,
  modelo_nombre   text not null default '',
  modelo_version  integer not null default 1,
  idioma          text not null default 'es',
  formato         text not null default 'docx',
  nombre          text not null,
  ruta            text not null,
  tamano          integer not null default 0,
  -- SHA-256 (hex) de los bytes del archivo generado: es lo que la firma electrónica sellará.
  hash_sha256     text not null,
  -- Valores usados al generar (sin imágenes).
  valores         jsonb not null default '{}'::jsonb,
  -- Para la segunda parte: listo_firma → en_firma → firmado.
  estado          text not null default 'listo_firma',
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint conv_generados_idioma check (idioma in ('es', 'en')),
  constraint conv_generados_formato check (formato in ('docx', 'html')),
  constraint conv_generados_estado check (estado in ('listo_firma', 'en_firma', 'firmado')),
  constraint conv_generados_hash check (hash_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists conv_generados_convenio_idx on public.conv_generados (convenio_id, created_at desc);
create index if not exists conv_generados_modelo_idx on public.conv_generados (modelo_id);

alter table public.conv_modelos enable row level security;
alter table public.conv_generados enable row level security;

drop policy if exists conv_modelos_read on public.conv_modelos;
create policy conv_modelos_read on public.conv_modelos for select to authenticated using (public.int_ve_modulo());
drop policy if exists conv_modelos_insert on public.conv_modelos;
create policy conv_modelos_insert on public.conv_modelos for insert to authenticated with check (public.int_puede_crear());
drop policy if exists conv_modelos_update on public.conv_modelos;
create policy conv_modelos_update on public.conv_modelos for update to authenticated
  using (public.int_puede_crear()) with check (public.int_puede_crear());
drop policy if exists conv_modelos_delete on public.conv_modelos;
create policy conv_modelos_delete on public.conv_modelos for delete to authenticated
  using (public.int_puede_crear() and estado = 'borrador');

drop policy if exists conv_generados_read on public.conv_generados;
create policy conv_generados_read on public.conv_generados for select to authenticated using (public.int_ve_modulo());
drop policy if exists conv_generados_insert on public.conv_generados;
create policy conv_generados_insert on public.conv_generados for insert to authenticated
  with check (public.int_puede_crear() and (created_by is null or created_by = auth.uid()));

-- -----------------------------------------------------------------------------
-- Bucket y políticas. Si quien aplica la migración no es dueño de storage.objects, lo demás queda
-- aplicado y el aviso dice qué hacer a mano (mismo patrón que 0251).
-- -----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('conv-modelos', 'conv-modelos', false, 15728640, array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html', 'image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'
  ])
  on conflict (id) do update
    set public = false,
        file_size_limit = 15728640,
        allowed_mime_types = array[
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/html', 'image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'
        ];

  execute 'drop policy if exists conv_modelos_lectura on storage.objects';
  execute $pol$
    create policy conv_modelos_lectura on storage.objects
      for select to authenticated
      using (bucket_id = 'conv-modelos' and public.int_ve_modulo())
  $pol$;

  execute 'drop policy if exists conv_modelos_escritura on storage.objects';
  execute $pol$
    create policy conv_modelos_escritura on storage.objects
      for insert to authenticated
      with check (bucket_id = 'conv-modelos' and public.int_puede_crear())
  $pol$;

  execute 'drop policy if exists conv_modelos_reemplazo on storage.objects';
  execute $pol$
    create policy conv_modelos_reemplazo on storage.objects
      for update to authenticated
      using (bucket_id = 'conv-modelos' and public.int_puede_crear())
      with check (bucket_id = 'conv-modelos' and public.int_puede_crear())
  $pol$;

  execute 'drop policy if exists conv_modelos_borrado on storage.objects';
  execute $pol$
    create policy conv_modelos_borrado on storage.objects
      for delete to authenticated
      using (bucket_id = 'conv-modelos' and public.int_puede_crear())
  $pol$;
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'No se pudo preparar el bucket "conv-modelos" (%). Créelo a mano desde Storage: privado, 15 MB por archivo, con políticas de lectura para int_ve_modulo() y de escritura para int_puede_crear().',
      sqlerrm;
end $$;
