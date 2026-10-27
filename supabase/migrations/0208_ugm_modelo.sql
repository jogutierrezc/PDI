-- =============================================================================
-- PDI · 0208 · UI GreenMetric · modelo de datos, permisos y reglas de estado
--
-- Sección «UI GreenMetric» del módulo Rankings. Todo lo de esta sección lleva el
-- prefijo `ugm_` (tablas, funciones, políticas). Del resto del sistema solo se
-- toca, y de forma aditiva, lo imprescindible:
--   · `ranking_cycles` se REUTILIZA tal cual con ranking = 'ui-greenmetric'
--     (edición = anio, año de los datos = anio_datos). No se cambia ninguna de
--     sus columnas ni políticas; THE Impact y los demás rankings quedan igual.
--   · UDrive, correos y Datos de Sostenibilidad solo se LEEN o se llaman desde
--     funciones propias (0211 y 0213); aquí no se altera ninguno.
--
-- Requiere 0002 (has_role_at_least), 0026 (set_updated_at), 0057 (units),
-- 0149 (ranking_cycles), 0187/0191 (UDrive) y 0202 (Datos de Sostenibilidad).
-- Orden: 0208 (esta) → 0209 (catálogo) → 0210 (funciones) → 0211 (evidencias en
-- UDrive) → 0212 (lecturas públicas) → 0213 (cola de correos y recordatorios).
--
-- MODELO
--   ugm_categorias_base / ugm_catalogo_base   la guía (por año de guía); solo se escribe por migración.
--   ugm_config                                ciclo: encabezado de las plantillas, fechas, recordatorios, carpeta en UDrive.
--   ugm_categorias / ugm_preguntas            copia del catálogo por ciclo (se puede ajustar sin tocar la base).
--   ugm_asignaciones                          PERSONAS por pregunta (responsable, apoyo) y revisor por categoría.
--   ugm_respuestas                            una fila por (ciclo, pregunta): valores, textos ES/EN, estado, publicación.
--   ugm_versiones, ugm_comentarios, ugm_actividad (bitácora, solo inserción)
--   ugm_traducciones                          estado de la traducción por campo (borrador/revisada, huellas).
--   ugm_evidencias (+ ugm_evidencia_reservas) archivos de UDrive por id, o enlaces públicos.
--   ugm_datos_vinculos / ugm_datos_graficas   campos conectados a tablas/gráficas de Datos de Sostenibilidad.
--   ugm_notificaciones                        cola de correos (la procesa la función `correos`, 0213).
--   ugm_exportaciones / ugm_importaciones     historial del motor de plantillas .docx.
--   ugm_glosario                              términos fijos para la traducción con Pilo.
--   ugm_publico_version                       contador que sube cuando algo se publica o se retira.
--
-- PORQUÉ DE CADA DECISIÓN DE SEGURIDAD
--  1. Papeles (función ugm_rol_en): 'admin' = Planeación o más (misma capacidad
--     que ya exige la pantalla «rankings»); 'revisor' = asignación vigente por
--     categoría; 'responsable'/'apoyo' = asignación vigente a esa pregunta;
--     'jefe' = jefe de la oficina de quien responde (solo lee y reasigna).
--     Las asignaciones son a PERSONAS; la oficina es un dato visible.
--  2. Lectura de cada fila por papel; nadie lee filas de preguntas ajenas.
--     El rol `anon` NO tiene acceso a ninguna tabla `ugm_*` (REVOKE explícito);
--     la web pública usa solo las funciones `ugm_publico_*` de 0212.
--  3. Escritura: el responsable/apoyo solo puede actualizar las columnas de
--     captura (valores, tablas, textos, opción, cálculo) y solo mientras la
--     respuesta esté abierta (asignado, en captura o devuelto). El resto (estado,
--     publicación, revisión) cambia únicamente por funciones SECURITY DEFINER
--     (0210) que comprueban el papel. Aun así, el disparador
--     `ugm_respuestas_guardia` vuelve a comprobar cada cambio: quien salte la
--     interfaz o use la API directa se topa con las mismas reglas.
--  4. Transiciones de estado válidas en la base (ugm_transicion_permitida), con
--     el mismo cuadro que src/modules/rankings/uigreen/lib/estados.ts.
--  5. Publicación: solo se enciende si la respuesta está aprobada, no es
--     sensible, la traducción está revisada (y vigente: huella del español y
--     del inglés), hay evidencia si la pregunta la exige y las tablas conectadas
--     de Datos de Sostenibilidad están publicadas. Si algo de eso deja de
--     cumplirse (se devuelve, se reabre, cambia el español o la traducción, se
--     quita la evidencia, se despublica la tabla) el disparador la RETIRA solo y
--     lo anota en la bitácora; no vuelve a encenderse sola.
--  6. La bitácora y las versiones solo admiten inserción (disparadores).
--  7. Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095).
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo base (la guía)
-- -----------------------------------------------------------------------------

create table if not exists public.ugm_categorias_base (
  guia           text not null,
  categoria      text not null,
  numero         int  not null,
  nombre_es      text not null,
  nombre_en      text not null,
  peso_pct       int  not null,
  puntos_max     int  not null,
  carpeta_nombre text not null,
  primary key (guia, categoria),
  constraint ugm_categorias_base_cat check (categoria in ('SI', 'EC', 'WS', 'WR', 'TR', 'ED', 'GD')),
  constraint ugm_categorias_base_peso check (peso_pct between 0 and 100 and puntos_max >= 0)
);
comment on table public.ugm_categorias_base is
  'UI GreenMetric · las siete categorías de la guía con su peso y puntos máximos (USO INTERNO: no se publican).';

create table if not exists public.ugm_catalogo_base (
  guia               text not null,
  q                  text not null,
  categoria          text not null,
  numero             int  not null,
  orden              int  not null,
  indicador          text,
  puntos             int,
  nombre_es          text not null,
  nombre_en          text not null,
  tipo               text not null,
  unidad             text,
  periodo            text not null default 'ninguno',
  requiere_evidencia boolean not null default false,
  pagina_guia        int,
  calculada          boolean not null default false,
  sin_guia           boolean not null default false,
  plantilla          text,
  carpeta_nombre     text,
  opciones           jsonb,
  bandas             jsonb,
  factores           jsonb,
  esquema            jsonb not null default '{"campos":[],"tablas":[]}'::jsonb,
  primary key (guia, q),
  constraint ugm_catalogo_base_q check (q ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  constraint ugm_catalogo_base_cat check (categoria in ('SI', 'EC', 'WS', 'WR', 'TR', 'ED', 'GD')),
  constraint ugm_catalogo_base_tipo check (tipo in ('seleccion', 'numero', 'razon', 'area_banda', 'escala', 'impacto_ods', 'url')),
  constraint ugm_catalogo_base_periodo check (periodo in ('ninguno', 'actual', 'anterior', 'tres_anios', 'serie')),
  constraint ugm_catalogo_base_json check (
    (opciones is null or jsonb_typeof(opciones) = 'array')
    and (bandas is null or jsonb_typeof(bandas) = 'object')
    and (factores is null or jsonb_typeof(factores) = 'array')
    and jsonb_typeof(esquema) = 'object'
    and jsonb_typeof(esquema -> 'campos') = 'array' and jsonb_typeof(esquema -> 'tablas') = 'array'
  )
);
comment on table public.ugm_catalogo_base is
  'UI GreenMetric · las preguntas de la guía (2026: 117 + la plantilla 3.18). ugm_crear_ciclo las copia a cada ciclo.';

-- -----------------------------------------------------------------------------
-- 2. Ciclo: configuración, categorías y preguntas
-- -----------------------------------------------------------------------------

create table if not exists public.ugm_config (
  ciclo_id          uuid primary key references public.ranking_cycles (id) on delete cascade,
  guia              text not null default '2026',
  universidad       text not null default 'Universidad de Santander (UDES)',
  pais              text not null default 'Colombia',
  web               text not null default 'https://www.udes.edu.co',
  periodo_ref_desde date,
  periodo_ref_hasta date,
  envio_desde       date,
  envio_hasta       date,
  recordatorio_dias int[] not null default '{7,3,1,0}'::int[],
  resumen_semanal   boolean not null default true,
  resumen_dia       int not null default 1,
  unidad_id         uuid references public.drive_unidades (id) on delete set null,
  carpeta_raiz      uuid references public.drive_carpetas (id) on delete set null,
  ciclo_anterior    uuid references public.ranking_cycles (id) on delete set null,
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint ugm_config_textos check (
    char_length(btrim(universidad)) between 1 and 160 and char_length(btrim(pais)) between 1 and 80 and char_length(web) <= 300
  ),
  constraint ugm_config_fechas check (
    (periodo_ref_desde is null or periodo_ref_hasta is null or periodo_ref_desde <= periodo_ref_hasta)
    and (envio_desde is null or envio_hasta is null or envio_desde <= envio_hasta)
  ),
  constraint ugm_config_recordatorios check (recordatorio_dias <@ array[0,1,2,3,4,5,6,7,8,9,10,14,21,30]::int[] and cardinality(recordatorio_dias) <= 8),
  constraint ugm_config_resumen_dia check (resumen_dia between 1 and 7)
);
comment on table public.ugm_config is
  'UI GreenMetric · configuración de un ciclo: encabezado de las plantillas, fechas (editables, nunca fijas en código), recordatorios y carpeta de la edición en UDrive.';

create table if not exists public.ugm_categorias (
  ciclo_id       uuid not null references public.ranking_cycles (id) on delete cascade,
  categoria      text not null,
  numero         int  not null,
  nombre_es      text not null,
  nombre_en      text not null,
  peso_pct       int  not null,
  puntos_max     int  not null,
  carpeta_nombre text not null,
  carpeta_id     uuid references public.drive_carpetas (id) on delete set null,
  primary key (ciclo_id, categoria),
  constraint ugm_categorias_cat check (categoria in ('SI', 'EC', 'WS', 'WR', 'TR', 'ED', 'GD'))
);
comment on table public.ugm_categorias is 'UI GreenMetric · categorías del ciclo (peso y puntos: USO INTERNO).';

create table if not exists public.ugm_preguntas (
  ciclo_id           uuid not null references public.ranking_cycles (id) on delete cascade,
  q                  text not null,
  categoria          text not null,
  numero             int  not null,
  orden              int  not null,
  indicador          text,
  puntos             int,
  nombre_es          text not null,
  nombre_en          text not null,
  tipo               text not null,
  unidad             text,
  periodo            text not null default 'ninguno',
  requiere_evidencia boolean not null default false,
  pagina_guia        int,
  calculada          boolean not null default false,
  sin_guia           boolean not null default false,
  plantilla          text,
  carpeta_nombre     text,
  opciones           jsonb,
  bandas             jsonb,
  factores           jsonb,
  esquema            jsonb not null default '{"campos":[],"tablas":[]}'::jsonb,
  carpeta_id         uuid references public.drive_carpetas (id) on delete set null,
  primary key (ciclo_id, q),
  foreign key (ciclo_id, categoria) references public.ugm_categorias (ciclo_id, categoria) on delete cascade,
  constraint ugm_preguntas_q check (q ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  constraint ugm_preguntas_tipo check (tipo in ('seleccion', 'numero', 'razon', 'area_banda', 'escala', 'impacto_ods', 'url')),
  constraint ugm_preguntas_periodo check (periodo in ('ninguno', 'actual', 'anterior', 'tres_anios', 'serie')),
  constraint ugm_preguntas_json check (
    (opciones is null or jsonb_typeof(opciones) = 'array')
    and (bandas is null or jsonb_typeof(bandas) = 'object')
    and (factores is null or jsonb_typeof(factores) = 'array')
    and jsonb_typeof(esquema) = 'object'
    and jsonb_typeof(esquema -> 'campos') = 'array' and jsonb_typeof(esquema -> 'tablas') = 'array'
  )
);
comment on table public.ugm_preguntas is
  'UI GreenMetric · preguntas del ciclo. puntos, factores y bandas son de USO INTERNO (estimar avance); ninguna lectura pública los devuelve.';
create index if not exists ugm_preguntas_cat_idx on public.ugm_preguntas (ciclo_id, categoria, orden);

-- -----------------------------------------------------------------------------
-- 3. Asignaciones (a personas)
-- -----------------------------------------------------------------------------

create table if not exists public.ugm_asignaciones (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  q            text,
  categoria    text,
  usuario_id   uuid not null references public.profiles (id) on delete cascade,
  unidad_id    uuid references public.units (id) on delete set null,
  rol          text not null,
  fecha_limite date,
  asignado_por uuid default auth.uid() references public.profiles (id) on delete set null,
  vigente      boolean not null default true,
  retirado_at  timestamptz,
  created_at   timestamptz not null default now(),
  foreign key (ciclo_id, q) references public.ugm_preguntas (ciclo_id, q) on delete cascade,
  foreign key (ciclo_id, categoria) references public.ugm_categorias (ciclo_id, categoria) on delete cascade,
  constraint ugm_asignaciones_rol check (rol in ('responsable', 'apoyo', 'revisor')),
  constraint ugm_asignaciones_forma check (
    (rol = 'revisor' and ((q is null) <> (categoria is null)))
    or (rol <> 'revisor' and q is not null and categoria is null)
  )
);
comment on table public.ugm_asignaciones is
  'UI GreenMetric · quién responde (responsable, apoyo) cada pregunta y quién revisa cada categoría. A PERSONAS; la oficina (unidad_id) es un dato visible. Se maneja con ugm_asignar/ugm_reasignar/ugm_retirar_asignacion.';
-- Un responsable vigente por pregunta; un revisor vigente por categoría (el administrador es el respaldo).
create unique index if not exists ugm_asig_responsable_uq on public.ugm_asignaciones (ciclo_id, q) where rol = 'responsable' and vigente;
create unique index if not exists ugm_asig_apoyo_uq on public.ugm_asignaciones (ciclo_id, q, usuario_id) where rol = 'apoyo' and vigente;
create unique index if not exists ugm_asig_revisor_cat_uq on public.ugm_asignaciones (ciclo_id, categoria) where rol = 'revisor' and q is null and vigente;
create unique index if not exists ugm_asig_revisor_q_uq on public.ugm_asignaciones (ciclo_id, q) where rol = 'revisor' and q is not null and vigente;
create index if not exists ugm_asig_usuario_idx on public.ugm_asignaciones (usuario_id) where vigente;
create index if not exists ugm_asig_ciclo_idx on public.ugm_asignaciones (ciclo_id, vigente);

-- -----------------------------------------------------------------------------
-- 4. Respuestas
-- -----------------------------------------------------------------------------

create table if not exists public.ugm_respuestas (
  id                 uuid primary key default gen_random_uuid(),
  ciclo_id           uuid not null references public.ranking_cycles (id) on delete cascade,
  q                  text not null,
  estado             text not null default 'sin_asignar',
  -- Captura. Convención: números, URL, fechas y ODS (lista) en `valores`; textos en
  -- `textos_es`/`textos_en`; filas de tabla en `tablas` (ES) y `tablas_en` (EN, solo columnas de texto).
  valores            jsonb not null default '{}'::jsonb,
  tablas             jsonb not null default '{}'::jsonb,
  tablas_en          jsonb not null default '{}'::jsonb,
  textos_es          jsonb not null default '{}'::jsonb,
  textos_en          jsonb not null default '{}'::jsonb,
  opcion             smallint,
  opcion_calculada   boolean not null default false,
  calculo            jsonb not null default '{}'::jsonb,
  para_actualizar    boolean not null default false,
  arrastrada_de      uuid references public.ugm_respuestas (id) on delete set null,
  -- Estado de revisión y publicación (solo por funciones definer).
  version            int not null default 0,
  completitud        smallint not null default 0,
  nota_revision      text,
  revisor_id         uuid references public.profiles (id) on delete set null,
  enviado_at         timestamptz,
  aprobado_at        timestamptz,
  aprobado_por       uuid references public.profiles (id) on delete set null,
  sensible           boolean not null default false,
  publicar_web       boolean not null default false,
  publicado_at       timestamptz,
  publicado_por      uuid references public.profiles (id) on delete set null,
  retirado_at        timestamptz,
  retiro_motivo      text,
  version_publicada  int,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (ciclo_id, q) references public.ugm_preguntas (ciclo_id, q) on delete cascade,
  constraint ugm_respuestas_uq unique (ciclo_id, q),
  constraint ugm_respuestas_estado check (estado in ('sin_asignar', 'asignado', 'en_captura', 'enviado', 'en_revision', 'devuelto', 'aprobado')),
  constraint ugm_respuestas_opcion check (opcion is null or opcion between 1 and 9),
  constraint ugm_respuestas_json check (
    jsonb_typeof(valores) = 'object' and jsonb_typeof(tablas) = 'object' and jsonb_typeof(tablas_en) = 'object'
    and jsonb_typeof(textos_es) = 'object' and jsonb_typeof(textos_en) = 'object' and jsonb_typeof(calculo) = 'object'
  ),
  constraint ugm_respuestas_tamano check (
    octet_length(valores::text) <= 400000 and octet_length(tablas::text) <= 800000 and octet_length(tablas_en::text) <= 800000
    and octet_length(textos_es::text) <= 200000 and octet_length(textos_en::text) <= 200000 and octet_length(calculo::text) <= 20000
  ),
  constraint ugm_respuestas_nota check (nota_revision is null or char_length(nota_revision) <= 4000),
  constraint ugm_respuestas_publicada check (not publicar_web or estado = 'aprobado')
);
comment on table public.ugm_respuestas is
  'UI GreenMetric · una fila por (ciclo, pregunta). Se crean al abrir el ciclo (ugm_crear_ciclo). La captura la escribe el responsable; estado y publicación solo las funciones definer; el disparador ugm_respuestas_guardia hace cumplir todo.';
create index if not exists ugm_respuestas_estado_idx on public.ugm_respuestas (ciclo_id, estado);
create index if not exists ugm_respuestas_pub_idx on public.ugm_respuestas (ciclo_id) where publicar_web;

-- Si una versión anterior de esta migración ya creó la tabla, estas columnas se aseguran aquí (idempotente).
alter table public.ugm_respuestas add column if not exists tablas_en jsonb not null default '{}'::jsonb;
alter table public.ugm_respuestas add column if not exists para_actualizar boolean not null default false;
alter table public.ugm_respuestas add column if not exists arrastrada_de uuid references public.ugm_respuestas (id) on delete set null;
alter table public.ugm_respuestas add column if not exists version_publicada int;
alter table public.ugm_respuestas add column if not exists sensible boolean not null default false;

create table if not exists public.ugm_versiones (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  version      int not null,
  snapshot     jsonb not null,
  autor        uuid default auth.uid() references public.profiles (id) on delete set null,
  motivo       text not null,
  created_at   timestamptz not null default now(),
  constraint ugm_versiones_motivo check (motivo in ('envio', 'devolucion', 'aprobacion', 'reapertura', 'importacion', 'arrastre'))
);
create index if not exists ugm_versiones_resp_idx on public.ugm_versiones (respuesta_id, created_at desc);
comment on table public.ugm_versiones is 'UI GreenMetric · instantáneas por envío, devolución, aprobación, reapertura e importación. Solo inserción.';

create table if not exists public.ugm_comentarios (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  autor        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tipo         text not null default 'comentario',
  campo        text,
  texto        text not null,
  resuelto     boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint ugm_comentarios_tipo check (tipo in ('comentario', 'devolucion', 'aprobacion')),
  constraint ugm_comentarios_texto check (char_length(btrim(texto)) between 1 and 4000),
  constraint ugm_comentarios_campo check (campo is null or char_length(campo) <= 80)
);
create index if not exists ugm_comentarios_resp_idx on public.ugm_comentarios (respuesta_id, created_at);

create table if not exists public.ugm_traducciones (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  campo        text not null,
  origen       text not null default 'pilo',
  modelo       text,
  estado       text not null default 'borrador',
  hash_es      text not null default '',
  hash_en      text not null default '',
  revisor      uuid references public.profiles (id) on delete set null,
  revisado_at  timestamptz,
  updated_at   timestamptz not null default now(),
  constraint ugm_traducciones_uq unique (respuesta_id, campo),
  constraint ugm_traducciones_origen check (origen in ('pilo', 'humano', 'importacion')),
  constraint ugm_traducciones_estado check (estado in ('borrador', 'revisada')),
  constraint ugm_traducciones_campo check (campo ~ '^(tabla:)?[a-z][a-z0-9_]{0,39}$')
);
comment on table public.ugm_traducciones is
  'UI GreenMetric · estado de la traducción por campo («tabla:<clave>» para una tabla). Revisada solo vale mientras coincidan las huellas del español y del inglés actuales.';

create table if not exists public.ugm_glosario (
  id         uuid primary key default gen_random_uuid(),
  termino_es text not null,
  termino_en text not null,
  nota       text,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint ugm_glosario_texto check (char_length(btrim(termino_es)) between 1 and 120 and char_length(btrim(termino_en)) between 1 and 120)
);
create unique index if not exists ugm_glosario_uq on public.ugm_glosario (lower(termino_es));
comment on table public.ugm_glosario is 'UI GreenMetric · términos fijos del ranking para la traducción con Pilo. Lo edita la administración del ranking.';

insert into public.ugm_glosario (termino_es, termino_en, nota) values
  ('sedes', 'campus sites', null), ('vinculación', 'community engagement', null),
  ('empleos verdes', 'green jobs', null), ('semillero', 'research seedbed', 'grupo estudiantil de investigación'),
  ('espacio abierto', 'open space', null), ('edificio inteligente', 'smart building', null),
  ('edificio verde', 'green building', null), ('huella de carbono', 'carbon footprint', null),
  ('vehículos de cero emisiones', 'zero-emission vehicles (ZEV)', null), ('población del campus', 'campus population', null),
  ('plan maestro', 'campus master plan', null), ('residuos', 'waste', null),
  ('aguas residuales', 'wastewater', null), ('estacionamiento', 'parking', null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 5. Evidencias, vínculos con Datos de Sostenibilidad, bitácora, correos
-- -----------------------------------------------------------------------------

create table if not exists public.ugm_evidencias (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  archivo_id   uuid references public.drive_archivos (id) on delete cascade,
  url          text,
  figura       int,
  pie_es       text,
  pie_en       text,
  orden        int not null default 0,
  es_mapa      boolean not null default false,
  idioma       text not null default 'en',
  publica      boolean not null default false,
  creada_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ugm_evidencias_forma check ((archivo_id is not null) <> (url is not null)),
  constraint ugm_evidencias_url check (url is null or (url ~ '^https://[^[:space:]]{3,490}$')),
  constraint ugm_evidencias_idioma check (idioma in ('en', 'es')),
  constraint ugm_evidencias_pies check (coalesce(char_length(pie_es), 0) <= 400 and coalesce(char_length(pie_en), 0) <= 400),
  constraint ugm_evidencias_figura check (figura is null or figura between 1 and 99)
);
-- Un archivo de UDrive se liga una sola vez a la misma respuesta (no hay copia: el vínculo es por id).
create unique index if not exists ugm_evidencias_archivo_uq on public.ugm_evidencias (respuesta_id, archivo_id) where archivo_id is not null;
create index if not exists ugm_evidencias_resp_idx on public.ugm_evidencias (respuesta_id, orden);
comment on table public.ugm_evidencias is
  'UI GreenMetric · evidencias de una respuesta: archivo de UDrive por id (carpeta de la pregunta en Datos de Sostenibilidad) o enlace https público. NO usa ranking_evidence ni su bucket.';

-- Reserva de una subida (ver 0211): quien tiene asignación vigente reserva una ruta exacta y la política de Storage solo deja subir ahí.
create table if not exists public.ugm_evidencia_reservas (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
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
  constraint ugm_reservas_ruta unique (ruta),
  constraint ugm_reservas_nombre check (nombre ~ '^[A-Za-z0-9._-]{1,150}$'),
  constraint ugm_reservas_ruta_ok check (ruta ~ '^unidades/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,150}$')
);
create index if not exists ugm_reservas_usuario_idx on public.ugm_evidencia_reservas (usuario_id, expira_at);

create table if not exists public.ugm_datos_vinculos (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  campo        text not null,
  archivo_id   uuid not null references public.drive_archivos (id) on delete cascade,
  columna      text not null,
  col_periodo  text,
  agregacion   text not null default 'suma',
  anio_modo    text not null default 'ultimo',
  anio         int,
  modo         text not null default 'conectado',
  creado_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint ugm_vinculos_uq unique (respuesta_id, campo),
  constraint ugm_vinculos_agregacion check (agregacion in ('suma', 'promedio', 'ultimo')),
  constraint ugm_vinculos_anio_modo check (anio_modo in ('ultimo', 'anterior', 'dos_atras', 'fijo')),
  constraint ugm_vinculos_modo check (modo in ('conectado', 'manual')),
  constraint ugm_vinculos_fijo check ((anio_modo = 'fijo') = (anio is not null)),
  constraint ugm_vinculos_claves check (char_length(columna) between 1 and 80 and (col_periodo is null or char_length(col_periodo) between 1 and 80) and char_length(campo) between 1 and 40)
);
comment on table public.ugm_datos_vinculos is
  'UI GreenMetric · campos de un indicador conectados a una tabla de Datos de Sostenibilidad. modo conectado = manda la tabla (campo de solo lectura); manual = manda lo escrito a mano.';
create index if not exists ugm_vinculos_archivo_idx on public.ugm_datos_vinculos (archivo_id);

create table if not exists public.ugm_datos_graficas (
  id           uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.ugm_respuestas (id) on delete cascade,
  archivo_id   uuid not null references public.drive_archivos (id) on delete cascade,
  orden        int not null default 0,
  creado_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ugm_graficas_uq unique (respuesta_id, archivo_id)
);
comment on table public.ugm_datos_graficas is 'UI GreenMetric · gráficas de Datos de Sostenibilidad que acompañan a un indicador. Si no están publicadas, el indicador sale sin ellas y el panel avisa.';

create table if not exists public.ugm_actividad (
  id           bigint generated always as identity primary key,
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  respuesta_id uuid references public.ugm_respuestas (id) on delete set null,
  actor        uuid,
  accion       text not null,
  de           text,
  a            text,
  detalle      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint ugm_actividad_accion check (char_length(accion) between 1 and 60)
);
create index if not exists ugm_actividad_resp_idx on public.ugm_actividad (respuesta_id, created_at desc);
create index if not exists ugm_actividad_ciclo_idx on public.ugm_actividad (ciclo_id, created_at desc);
comment on table public.ugm_actividad is 'UI GreenMetric · bitácora. Solo inserción (disparador).';

create table if not exists public.ugm_notificaciones (
  id             uuid primary key default gen_random_uuid(),
  ciclo_id       uuid not null references public.ranking_cycles (id) on delete cascade,
  respuesta_id   uuid references public.ugm_respuestas (id) on delete cascade,
  destinatario   uuid not null references public.profiles (id) on delete cascade,
  plantilla      text not null,
  valores        jsonb not null default '{}'::jsonb,
  estado         text not null default 'en_cola',
  intentos       int not null default 0,
  programada_para timestamptz not null default now(),
  enviado_at     timestamptz,
  error          text,
  clave_unica    text,
  created_at     timestamptz not null default now(),
  constraint ugm_notif_estado check (estado in ('en_cola', 'enviando', 'enviado', 'error', 'omitido')),
  constraint ugm_notif_plantilla check (plantilla ~ '^c-ugm-[a-z0-9-]{1,30}$'),
  constraint ugm_notif_error check (error is null or char_length(error) <= 300)
);
create unique index if not exists ugm_notif_unica_uq on public.ugm_notificaciones (clave_unica) where clave_unica is not null;
create index if not exists ugm_notif_cola_idx on public.ugm_notificaciones (programada_para) where estado = 'en_cola';
comment on table public.ugm_notificaciones is 'UI GreenMetric · cola de correos. La vacía la función `correos` (acción ugm_cola); ver 0213.';

create table if not exists public.ugm_exportaciones (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  alcance      text not null,
  q            text,
  categoria    text,
  hash         text,
  manifiesto   jsonb not null default '{}'::jsonb,
  generado_por uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ugm_export_alcance check (alcance in ('indicador', 'categoria', 'todo')),
  constraint ugm_export_tamano check (octet_length(manifiesto::text) <= 400000)
);
create index if not exists ugm_export_ciclo_idx on public.ugm_exportaciones (ciclo_id, created_at desc);

create table if not exists public.ugm_importaciones (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references public.ranking_cycles (id) on delete cascade,
  respuesta_id uuid references public.ugm_respuestas (id) on delete set null,
  archivo      text not null,
  hash         text,
  q_detectada  text,
  resultado    jsonb not null default '{}'::jsonb,
  estado       text not null default 'analizado',
  aplicado_por uuid references public.profiles (id) on delete set null,
  creado_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ugm_import_estado check (estado in ('analizado', 'aplicado', 'descartado')),
  constraint ugm_import_archivo check (char_length(archivo) between 1 and 200),
  constraint ugm_import_tamano check (octet_length(resultado::text) <= 400000)
);
create index if not exists ugm_import_ciclo_idx on public.ugm_importaciones (ciclo_id, created_at desc);

create table if not exists public.ugm_publico_version (
  ciclo_id   uuid primary key references public.ranking_cycles (id) on delete cascade,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.ugm_publico_version is 'UI GreenMetric · sube cuando algo se publica o se retira; la web pública la lee con ugm_publico_resumen (0212).';

-- -----------------------------------------------------------------------------
-- 6. Funciones de papel y de regla (SECURITY DEFINER, search_path fijo)
-- -----------------------------------------------------------------------------

/** ¿Administra el ranking? Planeación o más: la misma capacidad que exige la pantalla «rankings». */
create or replace function public.ugm_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_role_at_least('planeacion'), false);
$$;

/**
 * Papel de quien pregunta frente a una pregunta del ciclo, el más fuerte:
 * 'admin' · 'revisor' · 'responsable' · 'apoyo' · 'jefe' (jefe de la oficina de quien responde) · nulo.
 */
create or replace function public.ugm_rol_en(p_ciclo uuid, p_q text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.ugm_es_admin() then 'admin'
    when auth.uid() is null then null
    when exists (
      select 1 from public.ugm_asignaciones a
        join public.ugm_preguntas p on p.ciclo_id = a.ciclo_id and p.q = p_q
       where a.ciclo_id = p_ciclo and a.vigente and a.rol = 'revisor' and a.usuario_id = auth.uid()
         and (a.categoria = p.categoria or a.q = p_q)
    ) then 'revisor'
    when exists (select 1 from public.ugm_asignaciones a where a.ciclo_id = p_ciclo and a.q = p_q and a.vigente and a.rol = 'responsable' and a.usuario_id = auth.uid()) then 'responsable'
    when exists (select 1 from public.ugm_asignaciones a where a.ciclo_id = p_ciclo and a.q = p_q and a.vigente and a.rol = 'apoyo' and a.usuario_id = auth.uid()) then 'apoyo'
    when exists (
      select 1 from public.ugm_asignaciones a
       where a.ciclo_id = p_ciclo and a.q = p_q and a.vigente and a.rol = 'responsable' and a.unidad_id is not null
         and public.unit_role_at(a.unidad_id) = 'jefe'
    ) then 'jefe'
    else null
  end;
$$;

/** ¿Participa en el ciclo? Administración, o con alguna asignación vigente (o jefe de la oficina de alguna). */
create or replace function public.ugm_participa(p_ciclo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ugm_es_admin()
      or (auth.uid() is not null and exists (
           select 1 from public.ugm_asignaciones a
            where a.ciclo_id = p_ciclo and a.vigente
              and (a.usuario_id = auth.uid() or (a.unidad_id is not null and public.unit_role_at(a.unidad_id) = 'jefe'))
         ));
$$;

create or replace function public.ugm_rol_en_respuesta(p_respuesta uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.ugm_rol_en(r.ciclo_id, r.q) from public.ugm_respuestas r where r.id = p_respuesta;
$$;

/** Huella de un texto para comparar la traducción con el español de entonces. */
create or replace function public.ugm_huella(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(regexp_replace(btrim(coalesce(p_texto, '')), '\s+', ' ', 'g'));
$$;

/** Cuadro de transiciones. Mismo cuadro que src/modules/rankings/uigreen/lib/estados.ts. */
create or replace function public.ugm_transicion_permitida(de text, a text, actor text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(case
    when de = 'sin_asignar' and a = 'asignado' then actor in ('admin', 'sistema')
    when de = 'asignado' and a = 'sin_asignar' then actor in ('admin', 'sistema')
    when de = 'asignado' and a = 'en_captura' then actor in ('admin', 'responsable', 'apoyo', 'sistema')
    when de = 'devuelto' and a = 'en_captura' then actor in ('admin', 'responsable', 'apoyo', 'sistema')
    when de = 'en_captura' and a = 'enviado' then actor in ('admin', 'responsable', 'sistema')
    when de = 'devuelto' and a = 'enviado' then actor in ('admin', 'responsable', 'sistema')
    when de = 'enviado' and a in ('en_revision', 'devuelto', 'aprobado') then actor in ('admin', 'revisor', 'sistema')
    when de = 'en_revision' and a in ('devuelto', 'aprobado') then actor in ('admin', 'revisor', 'sistema')
    when de = 'aprobado' and a in ('devuelto', 'en_revision') then actor in ('admin', 'sistema')
    else false
  end, false);
$$;

/** Texto en español de un campo de traducción: «k» = textos_es->k; «tabla:k» = celdas de texto de esa tabla, en orden. */
create or replace function public.ugm_texto_es(r public.ugm_respuestas, p_campo text, p_esquema jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_k text;
  v_cols text[];
  v_txt text := '';
  f jsonb;
  c text;
begin
  if p_campo like 'tabla:%' then
    v_k := substr(p_campo, 7);
    select coalesce(array_agg(col ->> 'k'), '{}'::text[]) into v_cols
      from jsonb_array_elements(coalesce((select t -> 'columnas' from jsonb_array_elements(p_esquema -> 'tablas') t where t ->> 'k' = v_k limit 1), '[]'::jsonb)) col
     where coalesce(col ->> 'tipo', 'texto') = 'texto';
    if jsonb_typeof(r.tablas -> v_k) = 'array' then
      for f in select * from jsonb_array_elements(r.tablas -> v_k) loop
        foreach c in array v_cols loop
          v_txt := v_txt || coalesce(f ->> c, '') || E'\n';
        end loop;
      end loop;
    end if;
    return btrim(v_txt);
  end if;
  return btrim(coalesce(r.textos_es ->> p_campo, ''));
end;
$$;

create or replace function public.ugm_texto_en(r public.ugm_respuestas, p_campo text, p_esquema jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_k text;
  v_cols text[];
  v_txt text := '';
  f jsonb;
  c text;
begin
  if p_campo like 'tabla:%' then
    v_k := substr(p_campo, 7);
    select coalesce(array_agg(col ->> 'k'), '{}'::text[]) into v_cols
      from jsonb_array_elements(coalesce((select t -> 'columnas' from jsonb_array_elements(p_esquema -> 'tablas') t where t ->> 'k' = v_k limit 1), '[]'::jsonb)) col
     where coalesce(col ->> 'tipo', 'texto') = 'texto';
    if jsonb_typeof(r.tablas_en -> v_k) = 'array' then
      for f in select * from jsonb_array_elements(r.tablas_en -> v_k) loop
        foreach c in array v_cols loop
          v_txt := v_txt || coalesce(f ->> c, '') || E'\n';
        end loop;
      end loop;
    end if;
    return btrim(v_txt);
  end if;
  return btrim(coalesce(r.textos_en ->> p_campo, ''));
end;
$$;

/** Claves de campos que se traducen: los campos «traducible» y las tablas con columnas de texto. */
create or replace function public.ugm_campos_traducibles(p_esquema jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(k), '{}'::text[]) from (
    select c ->> 'k' as k from jsonb_array_elements(coalesce(p_esquema -> 'campos', '[]'::jsonb)) c where (c ->> 'traducible') = 'true'
    union all
    select 'tabla:' || (t ->> 'k') from jsonb_array_elements(coalesce(p_esquema -> 'tablas', '[]'::jsonb)) t
     where exists (select 1 from jsonb_array_elements(t -> 'columnas') col where coalesce(col ->> 'tipo', 'texto') = 'texto' and coalesce(col ->> 'sin_traduccion', 'false') <> 'true')
  ) x;
$$;

/**
 * Campos de traducción que NO están al día: tienen texto en español y no hay una traducción
 * revisada cuyas huellas coincidan con el español y el inglés de ahora. La versión «_fila» recibe la
 * fila (también la NEW de un disparador); la de uuid lee la guardada.
 */
create or replace function public.ugm_traducciones_pendientes_fila(r public.ugm_respuestas)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_esq jsonb;
  k text;
  es text;
  en text;
  v_out text[] := '{}';
begin
  select p.esquema into v_esq from public.ugm_preguntas p where p.ciclo_id = r.ciclo_id and p.q = r.q;
  foreach k in array public.ugm_campos_traducibles(v_esq) loop
    es := public.ugm_texto_es(r, k, v_esq);
    if es = '' then continue; end if;
    en := public.ugm_texto_en(r, k, v_esq);
    if en = '' or not exists (
      select 1 from public.ugm_traducciones t
       where t.respuesta_id = r.id and t.campo = k and t.estado = 'revisada'
         and t.hash_es = public.ugm_huella(es) and t.hash_en = public.ugm_huella(en)
    ) then
      v_out := v_out || k;
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.ugm_traducciones_pendientes(p_respuesta uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
begin
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found then return '{}'::text[]; end if;
  return public.ugm_traducciones_pendientes_fila(r);
end;
$$;

/** Evidencias vigentes de una respuesta: enlaces, y archivos de UDrive que no están en la papelera. */
create or replace function public.ugm_n_evidencias(p_respuesta uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.ugm_evidencias e
   where e.respuesta_id = p_respuesta
     and (e.url is not null or exists (select 1 from public.drive_archivos a where a.id = e.archivo_id and a.borrado_en is null));
$$;

/**
 * ¿Es pública (publicada) la tabla? Datos de Sostenibilidad no tiene un interruptor por tabla:
 * una tabla es PÚBLICA cuando alimenta un indicador publicado de UDES Sostenible o la gráfica
 * publicada de una tabla (las dos pasan sus propias validaciones: columnas no sensibles, etc.).
 */
create or replace function public.ugm_tabla_publicada(p_archivo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (
      exists (
        select 1 from public.sos_vinculos v join public.ds_indicadores i on i.id = v.indicador_id
         where v.archivo_id = a.id and i.publicado and not coalesce(i.archivado, false)
           and public.sos_validar_vinculo(v.archivo_id, v.col_valor, v.col_periodo, v.col_campus, v.filtro_col) is null
      )
      or exists (
        select 1 from public.sos_publicaciones pu join public.drive_archivos g on g.id = pu.archivo_id
         where pu.publicado and public.sos_uuid(g.contenido ->> 'tabla_id') = a.id
           and public.sos_validar_grafica(pu.archivo_id) is null
      )
    )
    from public.drive_archivos a
   where a.id = p_archivo and a.tipo = 'tabla' and a.borrado_en is null and public.sos_unidad_abierta(a.unidad_id)
  ), false);
$$;

create or replace function public.ugm_grafica_publicada(p_archivo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sos_publicaciones pu
     where pu.archivo_id = p_archivo and pu.publicado and public.sos_validar_grafica(pu.archivo_id) is null
  );
$$;

/**
 * Valor de un campo conectado a una tabla: {valor, anio, filas} o nulo. Solo columnas numéricas y no sensibles.
 * El año se mide contra el más reciente de la columna de periodo (último, anterior = −1, dos atrás = −2) o es fijo.
 */
create or replace function public.ugm_valor_vinculo(p_vinculo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.ugm_datos_vinculos;
  a record;
  v_col jsonb;
  v_max int;
  v_obj int;
  v_val numeric;
  v_n int;
begin
  select * into v from public.ugm_datos_vinculos where id = p_vinculo;
  if not found then return null; end if;
  select tipo, borrado_en, contenido, unidad_id into a from public.drive_archivos where id = v.archivo_id;
  if not found or a.tipo <> 'tabla' or a.borrado_en is not null or not public.sos_unidad_abierta(a.unidad_id) then return null; end if;
  v_col := public.sos_col(a.contenido -> 'columnas', v.columna);
  if v_col is null or public.sos_columna_sensible(v_col) or coalesce(v_col ->> 'tipo', '') not in ('numero', 'porcentaje') then return null; end if;
  if v.col_periodo is not null then
    v_col := public.sos_col(a.contenido -> 'columnas', v.col_periodo);
    if v_col is null or public.sos_columna_sensible(v_col) then return null; end if;
  end if;
  with filas as (
    select f.n,
           case when jsonb_typeof(f.d -> 'datos' -> v.columna) = 'number' then (f.d -> 'datos' ->> v.columna)::numeric end as val,
           case when v.col_periodo is null then null
                else (regexp_match(f.d -> 'datos' ->> v.col_periodo, '\m(\d{4})\M'))[1]::int end as anio
      from jsonb_array_elements(case when jsonb_typeof(a.contenido -> 'filas') = 'array' then a.contenido -> 'filas' else '[]'::jsonb end) with ordinality as f(d, n)
  )
  select max(anio) into v_max from filas where val is not null;
  if v.col_periodo is null then
    v_obj := null;
  elsif v.anio_modo = 'fijo' then
    v_obj := v.anio;
  elsif v_max is null then
    return null;
  else
    v_obj := v_max - case v.anio_modo when 'anterior' then 1 when 'dos_atras' then 2 else 0 end;
  end if;
  with filas as (
    select f.n,
           case when jsonb_typeof(f.d -> 'datos' -> v.columna) = 'number' then (f.d -> 'datos' ->> v.columna)::numeric end as val,
           case when v.col_periodo is null then null
                else (regexp_match(f.d -> 'datos' ->> v.col_periodo, '\m(\d{4})\M'))[1]::int end as anio
      from jsonb_array_elements(case when jsonb_typeof(a.contenido -> 'filas') = 'array' then a.contenido -> 'filas' else '[]'::jsonb end) with ordinality as f(d, n)
  )
  select case v.agregacion when 'suma' then sum(val) when 'ultimo' then (array_agg(val order by n desc))[1] else avg(val) end, count(*)::int
    into v_val, v_n
    from filas where val is not null and (v_obj is null or anio = v_obj);
  if v_n is null or v_n = 0 then return null; end if;
  return jsonb_build_object('valor', round(v_val, 4), 'anio', v_obj, 'filas', v_n);
end;
$$;

/** Los valores de la respuesta con los campos CONECTADOS a tablas sustituidos por lo que dice hoy la tabla. */
create or replace function public.ugm_valores_efectivos_fila(r public.ugm_respuestas)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_val jsonb := r.valores;
  x record;
  y jsonb;
begin
  for x in select id, campo from public.ugm_datos_vinculos where respuesta_id = r.id and modo = 'conectado' loop
    y := public.ugm_valor_vinculo(x.id);
    if y is not null then v_val := jsonb_set(v_val, array[x.campo], y -> 'valor', true); end if;
  end loop;
  return v_val;
end;
$$;

create or replace function public.ugm_valores_efectivos(p_respuesta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
begin
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found then return '{}'::jsonb; end if;
  return public.ugm_valores_efectivos_fila(r);
end;
$$;

/**
 * Qué falta para enviar: {faltan: [texto...], total, cumplidos}. Revisa campos obligatorios, filas mínimas de
 * tablas, evidencia y traducción. Un campo conectado a una tabla cuenta con el valor de la tabla.
 */
create or replace function public.ugm_evaluar_fila(r public.ugm_respuestas)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ugm_preguntas;
  v_val jsonb;
  c jsonb;
  t jsonb;
  k text;
  v_falta text[] := '{}';
  v_total int := 0;
  v_ok int := 0;
  v_hay boolean;
  v_pend text[];
begin
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  v_val := public.ugm_valores_efectivos_fila(r);
  for c in select * from jsonb_array_elements(p.esquema -> 'campos') loop
    if (c ->> 'obligatorio') is distinct from 'true' then continue; end if;
    k := c ->> 'k';
    v_total := v_total + 1;
    v_hay := case c ->> 'tipo'
      when 'opcion' then r.opcion is not null
      when 'ods' then jsonb_typeof(v_val -> k) = 'array' and jsonb_array_length(v_val -> k) > 0
      when 'numero' then jsonb_typeof(v_val -> k) = 'number'
      when 'texto_largo' then btrim(coalesce(r.textos_es ->> k, '')) <> ''
      when 'texto' then btrim(coalesce(r.textos_es ->> k, '')) <> ''
      else btrim(coalesce(v_val ->> k, '')) <> ''
    end;
    if v_hay then v_ok := v_ok + 1; else v_falta := v_falta || ('Falta: ' || coalesce(c ->> 'es', k)); end if;
  end loop;
  for t in select * from jsonb_array_elements(p.esquema -> 'tablas') loop
    if (t ->> 'min') is null then continue; end if;
    v_total := v_total + 1;
    if jsonb_typeof(r.tablas -> (t ->> 'k')) = 'array' and jsonb_array_length(r.tablas -> (t ->> 'k')) >= (t ->> 'min')::int then
      v_ok := v_ok + 1;
    else
      v_falta := v_falta || ('Falta al menos una fila en: ' || coalesce(t ->> 'es', t ->> 'k'));
    end if;
  end loop;
  if p.requiere_evidencia then
    v_total := v_total + 1;
    if public.ugm_n_evidencias(r.id) > 0 then v_ok := v_ok + 1; else v_falta := v_falta || 'Falta al menos una evidencia'; end if;
  end if;
  v_pend := public.ugm_traducciones_pendientes_fila(r);
  if cardinality(public.ugm_campos_traducibles(p.esquema)) > 0 then
    v_total := v_total + 1;
    if cardinality(v_pend) = 0 then v_ok := v_ok + 1; else v_falta := v_falta || 'Falta revisar la traducción al inglés'; end if;
  end if;
  return jsonb_build_object('faltan', to_jsonb(v_falta), 'total', v_total, 'cumplidos', v_ok);
end;
$$;

create or replace function public.ugm_evaluar(p_respuesta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
begin
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found then return jsonb_build_object('faltan', '[]'::jsonb, 'total', 0, 'cumplidos', 0); end if;
  return public.ugm_evaluar_fila(r);
end;
$$;

/**
 * Estado de publicación de una respuesta: {puede, bloqueos[], avisos[]}.
 * Bloquea: no aprobada, sensible, pregunta calculada, traducción sin revisar, falta evidencia exigida,
 * tabla conectada sin publicar. Solo avisa: gráfica sin publicar, sin evidencias públicas.
 */
create or replace function public.ugm_publicacion_estado_fila(r public.ugm_respuestas)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.ugm_preguntas;
  x record;
  v_bl text[] := '{}';
  v_av text[] := '{}';
  p_respuesta uuid := r.id;
begin
  select * into p from public.ugm_preguntas where ciclo_id = r.ciclo_id and q = r.q;
  if r.estado <> 'aprobado' then v_bl := v_bl || 'La respuesta no está aprobada'; end if;
  if r.sensible then v_bl := v_bl || 'Está marcada como dato sensible'; end if;
  if p.calculada then v_bl := v_bl || 'Es un indicador calculado: sale solo cuando todos sus datos de entrada están publicados'; end if;
  if cardinality(public.ugm_traducciones_pendientes_fila(r)) > 0 then v_bl := v_bl || 'La traducción al inglés no está revisada o quedó desactualizada'; end if;
  if p.requiere_evidencia and public.ugm_n_evidencias(p_respuesta) = 0 then v_bl := v_bl || 'Falta la evidencia'; end if;
  for x in select archivo_id from public.ugm_datos_vinculos where respuesta_id = p_respuesta and modo = 'conectado' loop
    if not public.ugm_tabla_publicada(x.archivo_id) then v_bl := v_bl || 'Tabla sin publicar en Datos de Sostenibilidad'; exit; end if;
  end loop;
  for x in select archivo_id from public.ugm_datos_graficas where respuesta_id = p_respuesta loop
    if not public.ugm_grafica_publicada(x.archivo_id) then v_av := v_av || 'Una gráfica conectada no está publicada: sale sin ella'; exit; end if;
  end loop;
  if not exists (select 1 from public.ugm_evidencias e where e.respuesta_id = p_respuesta and e.publica) then
    v_av := v_av || 'Ninguna evidencia está marcada como pública';
  end if;
  return jsonb_build_object('puede', cardinality(v_bl) = 0, 'bloqueos', to_jsonb(v_bl), 'avisos', to_jsonb(v_av));
end;
$$;

create or replace function public.ugm_publicacion_estado(p_respuesta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.ugm_respuestas;
begin
  select * into r from public.ugm_respuestas where id = p_respuesta;
  if not found then return jsonb_build_object('puede', false, 'bloqueos', '["No existe la respuesta"]'::jsonb, 'avisos', '[]'::jsonb); end if;
  return public.ugm_publicacion_estado_fila(r);
end;
$$;

create or replace function public.ugm_bitacora(p_ciclo uuid, p_respuesta uuid, p_accion text, p_de text default null, p_a text default null, p_detalle jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ugm_actividad (ciclo_id, respuesta_id, actor, accion, de, a, detalle)
  values (p_ciclo, p_respuesta, auth.uid(), left(p_accion, 60), p_de, p_a, coalesce(p_detalle, '{}'::jsonb));
$$;

create or replace function public.ugm_subir_version_publica(p_ciclo uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ugm_publico_version (ciclo_id, version, updated_at) values (p_ciclo, 1, now())
  on conflict (ciclo_id) do update set version = public.ugm_publico_version.version + 1, updated_at = now();
$$;

/** Hook de notificaciones: en 0213 se reemplaza por la versión que encola correos. Aquí no hace nada. */
create or replace function public.ugm_encolar_estado(p_antes public.ugm_respuestas, p_despues public.ugm_respuestas)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

/** Retira la publicación si ya no se cumplen las condiciones. Lo llaman los disparadores de evidencias, traducciones y vínculos. */
create or replace function public.ugm_revalidar_publicacion(p_respuesta uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est jsonb;
begin
  if p_respuesta is null then return; end if;
  if not exists (select 1 from public.ugm_respuestas where id = p_respuesta and publicar_web) then return; end if;
  v_est := public.ugm_publicacion_estado(p_respuesta);
  if (v_est ->> 'puede')::boolean then return; end if;
  update public.ugm_respuestas
     set publicar_web = false, retirado_at = now(),
         retiro_motivo = left(coalesce(p_motivo, v_est -> 'bloqueos' ->> 0, 'Ya no cumple las condiciones'), 300)
   where id = p_respuesta and publicar_web;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Disparadores
-- -----------------------------------------------------------------------------

create or replace function public.ugm_respuestas_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_captura boolean;
  v_ev jsonb;
  v_pub jsonb;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;
  -- Quién cambia: sin sesión (migración, servicio) es 'sistema'.
  v_actor := case when auth.uid() is null then 'sistema' else coalesce(public.ugm_rol_en(old.ciclo_id, old.q), 'ninguno') end;
  new.ciclo_id := old.ciclo_id;
  new.q := old.q;
  new.created_at := old.created_at;
  if v_actor in ('ninguno', 'jefe') then
    raise exception 'No tiene permiso para cambiar esta respuesta.' using errcode = '42501';
  end if;

  v_captura := (new.valores, new.tablas, new.tablas_en, new.textos_es, new.textos_en, new.opcion, new.opcion_calculada, new.calculo)
               is distinct from (old.valores, old.tablas, old.tablas_en, old.textos_es, old.textos_en, old.opcion, old.opcion_calculada, old.calculo);

  if new.estado is distinct from old.estado then
    -- Cambio de estado: solo las transiciones del cuadro y solo quien puede.
    if not public.ugm_transicion_permitida(old.estado, new.estado, v_actor) then
      raise exception 'No se puede pasar de «%» a «%» con su papel.', old.estado, new.estado using errcode = '42501';
    end if;
  elsif v_captura then
    -- Editar el contenido: la respuesta debe estar abierta (responsable, apoyo) o la edita la administración.
    if v_actor in ('responsable', 'apoyo') then
      if old.estado not in ('asignado', 'en_captura', 'devuelto') then
        raise exception 'La respuesta está enviada, en revisión o aprobada: ya no se edita. Pida que la devuelvan.' using errcode = '42501';
      end if;
      new.estado := 'en_captura';
    elsif v_actor = 'revisor' then
      raise exception 'Quien revisa comenta, aprueba o devuelve; no edita el contenido.' using errcode = '42501';
    elsif old.estado = 'aprobado' then
      -- La administración corrige una respuesta aprobada: vuelve a revisión (y sale de la web, abajo).
      new.estado := 'en_revision';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'enviado' then
      -- Con el contenido NUEVO, no el guardado.
      v_ev := public.ugm_evaluar_fila(new);
      if jsonb_array_length(v_ev -> 'faltan') > 0 then
        raise exception 'No se puede enviar: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v_ev -> 'faltan') x) using errcode = 'check_violation';
      end if;
      new.version := old.version + 1;
      new.enviado_at := now();
    elsif new.estado = 'aprobado' then
      new.aprobado_at := now();
      new.aprobado_por := auth.uid();
    end if;
    if old.estado = 'aprobado' and new.estado <> 'aprobado' then
      new.aprobado_at := null;
      new.aprobado_por := null;
    end if;
  end if;

  -- Publicación. Encendida: solo si se cumplen las condiciones. Publicada: cualquier cambio de contenido o de estado la retira.
  if old.publicar_web then
    if new.publicar_web and (v_captura or new.estado is distinct from old.estado or new.sensible) then
      new.publicar_web := false;
      new.retirado_at := now();
      new.retiro_motivo := case
        when new.sensible and not old.sensible then 'Se marcó como dato sensible'
        when new.estado is distinct from old.estado then 'Cambió el estado de la respuesta'
        else 'Cambió el contenido de la respuesta' end;
    end if;
  elsif new.publicar_web then
    v_pub := public.ugm_publicacion_estado_fila(new);
    if (v_pub ->> 'puede')::boolean is not true then
      raise exception 'No se puede publicar: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v_pub -> 'bloqueos') x) using errcode = 'check_violation';
    end if;
    new.publicado_at := now();
    new.publicado_por := auth.uid();
    new.retirado_at := null;
    new.retiro_motivo := null;
    new.version_publicada := new.version;
  end if;

  if v_captura then
    v_ev := public.ugm_evaluar_fila(new);
    new.completitud := coalesce(round(100.0 * (v_ev ->> 'cumplidos')::int / nullif((v_ev ->> 'total')::int, 0))::smallint, 0);
  end if;
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ugm_respuestas_guardia_tg on public.ugm_respuestas;
create trigger ugm_respuestas_guardia_tg
  before update on public.ugm_respuestas
  for each row execute function public.ugm_respuestas_guardia();

create or replace function public.ugm_respuestas_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text;
begin
  if new.estado is distinct from old.estado then
    perform public.ugm_bitacora(new.ciclo_id, new.id, 'estado', old.estado, new.estado, jsonb_build_object('q', new.q));
    v_motivo := case new.estado when 'enviado' then 'envio' when 'devuelto' then 'devolucion' when 'aprobado' then 'aprobacion' else null end;
    if old.estado = 'aprobado' and new.estado in ('devuelto', 'en_revision') then v_motivo := 'reapertura'; end if;
    if v_motivo is not null then
      insert into public.ugm_versiones (respuesta_id, version, snapshot, autor, motivo)
      values (new.id, new.version,
              jsonb_build_object('estado', new.estado, 'valores', new.valores, 'tablas', new.tablas, 'tablas_en', new.tablas_en,
                                 'textos_es', new.textos_es, 'textos_en', new.textos_en, 'opcion', new.opcion, 'calculo', new.calculo),
              auth.uid(), v_motivo);
    end if;
    perform public.ugm_encolar_estado(old, new);
  end if;
  if old.publicar_web and not new.publicar_web then
    perform public.ugm_bitacora(new.ciclo_id, new.id, 'retiro_web', null, null, jsonb_build_object('q', new.q, 'motivo', new.retiro_motivo));
    perform public.ugm_subir_version_publica(new.ciclo_id);
  elsif new.publicar_web and not old.publicar_web then
    perform public.ugm_bitacora(new.ciclo_id, new.id, 'publicar_web', null, null, jsonb_build_object('q', new.q));
    perform public.ugm_subir_version_publica(new.ciclo_id);
  end if;
  return null;
end;
$$;

drop trigger if exists ugm_respuestas_despues_tg on public.ugm_respuestas;
create trigger ugm_respuestas_despues_tg
  after update on public.ugm_respuestas
  for each row execute function public.ugm_respuestas_despues();

-- Evidencias, traducciones, vínculos y gráficas: si cambian, se revisa que la publicación siga siendo válida.
create or replace function public.ugm_revalidar_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.ugm_revalidar_publicacion(old.respuesta_id);
    return old;
  end if;
  perform public.ugm_revalidar_publicacion(new.respuesta_id);
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ugm_evidencias', 'ugm_traducciones', 'ugm_datos_vinculos', 'ugm_datos_graficas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_revalidar_tg', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.ugm_revalidar_tg()', t || '_revalidar_tg', t);
  end loop;
end $$;

-- Evidencias públicas: cada cambio sube la versión pública (la página la relee).
create or replace function public.ugm_evidencias_publica_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciclo uuid;
begin
  select r.ciclo_id into v_ciclo from public.ugm_respuestas r where r.id = coalesce(new.respuesta_id, old.respuesta_id);
  if v_ciclo is not null and (coalesce(new.publica, false) or coalesce(old.publica, false)) then
    perform public.ugm_subir_version_publica(v_ciclo);
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists ugm_evidencias_publica_tg on public.ugm_evidencias;
create trigger ugm_evidencias_publica_tg after insert or update or delete on public.ugm_evidencias
  for each row execute function public.ugm_evidencias_publica_tg();

-- Bitácora y versiones: solo inserción.
create or replace function public.ugm_solo_agregar()
returns trigger
language plpgsql
as $$
begin
  -- Un borrado en cascada (se elimina el ciclo o la respuesta) corre dentro del disparador de integridad: profundidad > 1.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'La bitácora y las versiones de UI GreenMetric solo admiten inserciones.' using errcode = '42501';
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['ugm_actividad', 'ugm_versiones'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_inmutable', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.ugm_solo_agregar()', t || '_inmutable', t);
  end loop;
end $$;

drop trigger if exists ugm_config_set_updated_at on public.ugm_config;
create trigger ugm_config_set_updated_at before update on public.ugm_config for each row execute function public.set_updated_at();
drop trigger if exists ugm_glosario_set_updated_at on public.ugm_glosario;
create trigger ugm_glosario_set_updated_at before update on public.ugm_glosario for each row execute function public.set_updated_at();
drop trigger if exists ugm_traducciones_set_updated_at on public.ugm_traducciones;
create trigger ugm_traducciones_set_updated_at before update on public.ugm_traducciones for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. RLS y permisos
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ugm_categorias_base', 'ugm_catalogo_base', 'ugm_config', 'ugm_categorias', 'ugm_preguntas', 'ugm_asignaciones', 'ugm_respuestas',
    'ugm_versiones', 'ugm_comentarios', 'ugm_traducciones', 'ugm_glosario', 'ugm_evidencias', 'ugm_evidencia_reservas',
    'ugm_datos_vinculos', 'ugm_datos_graficas', 'ugm_actividad', 'ugm_notificaciones', 'ugm_exportaciones', 'ugm_importaciones', 'ugm_publico_version'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Catálogo base: lo lee quien participa en algún ciclo; solo se escribe por migración.
drop policy if exists ugm_cat_base_leer on public.ugm_catalogo_base;
create policy ugm_cat_base_leer on public.ugm_catalogo_base for select to authenticated using (public.ugm_es_admin());
drop policy if exists ugm_cats_base_leer on public.ugm_categorias_base;
create policy ugm_cats_base_leer on public.ugm_categorias_base for select to authenticated using (public.ugm_es_admin());

-- Configuración, categorías y preguntas del ciclo: las lee quien participa; las escribe la administración.
drop policy if exists ugm_config_leer on public.ugm_config;
create policy ugm_config_leer on public.ugm_config for select to authenticated using (public.ugm_participa(ciclo_id));
drop policy if exists ugm_config_escribir on public.ugm_config;
create policy ugm_config_escribir on public.ugm_config for update to authenticated using (public.ugm_es_admin()) with check (public.ugm_es_admin());
grant update (universidad, pais, web, periodo_ref_desde, periodo_ref_hasta, envio_desde, envio_hasta, recordatorio_dias, resumen_semanal, resumen_dia) on public.ugm_config to authenticated;

drop policy if exists ugm_categorias_leer on public.ugm_categorias;
create policy ugm_categorias_leer on public.ugm_categorias for select to authenticated using (public.ugm_participa(ciclo_id));

drop policy if exists ugm_preguntas_leer on public.ugm_preguntas;
create policy ugm_preguntas_leer on public.ugm_preguntas for select to authenticated using (public.ugm_participa(ciclo_id));
drop policy if exists ugm_preguntas_escribir on public.ugm_preguntas;
create policy ugm_preguntas_escribir on public.ugm_preguntas for update to authenticated using (public.ugm_es_admin()) with check (public.ugm_es_admin());
-- La administración ajusta textos y reglas de una pregunta del ciclo; la clave, la categoría y las carpetas no.
grant update (nombre_es, nombre_en, puntos, requiere_evidencia, opciones, bandas, factores, esquema, unidad) on public.ugm_preguntas to authenticated;

-- Asignaciones: las ve la administración, la propia persona y quien tiene papel en esa pregunta.
drop policy if exists ugm_asig_leer on public.ugm_asignaciones;
create policy ugm_asig_leer on public.ugm_asignaciones for select to authenticated
  using (
    public.ugm_es_admin() or usuario_id = auth.uid()
    or (q is not null and public.ugm_rol_en(ciclo_id, q) is not null)
  );

-- Respuestas: cada quien ve las de su papel. La captura se escribe con columnas acotadas.
drop policy if exists ugm_resp_leer on public.ugm_respuestas;
create policy ugm_resp_leer on public.ugm_respuestas for select to authenticated using (public.ugm_rol_en(ciclo_id, q) is not null);
drop policy if exists ugm_resp_capturar on public.ugm_respuestas;
create policy ugm_resp_capturar on public.ugm_respuestas for update to authenticated
  using (public.ugm_rol_en(ciclo_id, q) in ('admin', 'responsable', 'apoyo'))
  with check (public.ugm_rol_en(ciclo_id, q) in ('admin', 'responsable', 'apoyo'));
grant update (valores, tablas, tablas_en, textos_es, textos_en, opcion, opcion_calculada, calculo) on public.ugm_respuestas to authenticated;

-- Lo que cuelga de una respuesta lo ve quien ve la respuesta; se escribe por funciones.
drop policy if exists ugm_versiones_leer on public.ugm_versiones;
create policy ugm_versiones_leer on public.ugm_versiones for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_comentarios_leer on public.ugm_comentarios;
create policy ugm_comentarios_leer on public.ugm_comentarios for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_traducciones_leer on public.ugm_traducciones;
create policy ugm_traducciones_leer on public.ugm_traducciones for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_evidencias_leer on public.ugm_evidencias;
create policy ugm_evidencias_leer on public.ugm_evidencias for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_vinculos_leer on public.ugm_datos_vinculos;
create policy ugm_vinculos_leer on public.ugm_datos_vinculos for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_graficas_leer on public.ugm_datos_graficas;
create policy ugm_graficas_leer on public.ugm_datos_graficas for select to authenticated using (public.ugm_rol_en_respuesta(respuesta_id) is not null);
drop policy if exists ugm_actividad_leer on public.ugm_actividad;
create policy ugm_actividad_leer on public.ugm_actividad for select to authenticated
  using (public.ugm_es_admin() or (respuesta_id is not null and public.ugm_rol_en_respuesta(respuesta_id) is not null));
drop policy if exists ugm_reservas_leer on public.ugm_evidencia_reservas;
create policy ugm_reservas_leer on public.ugm_evidencia_reservas for select to authenticated using (usuario_id = auth.uid() or public.ugm_es_admin());
drop policy if exists ugm_notif_leer on public.ugm_notificaciones;
create policy ugm_notif_leer on public.ugm_notificaciones for select to authenticated using (public.ugm_es_admin() or destinatario = auth.uid());
drop policy if exists ugm_export_leer on public.ugm_exportaciones;
create policy ugm_export_leer on public.ugm_exportaciones for select to authenticated using (public.ugm_es_admin());
drop policy if exists ugm_import_leer on public.ugm_importaciones;
create policy ugm_import_leer on public.ugm_importaciones for select to authenticated
  using (public.ugm_es_admin() or creado_por = auth.uid());

-- Glosario: lo lee quien participa en algún ciclo (el traductor lo necesita) y lo edita la administración.
drop policy if exists ugm_glosario_leer on public.ugm_glosario;
create policy ugm_glosario_leer on public.ugm_glosario for select to authenticated
  using (public.ugm_es_admin() or exists (select 1 from public.ugm_asignaciones a where a.usuario_id = auth.uid() and a.vigente));
drop policy if exists ugm_glosario_escribir on public.ugm_glosario;
create policy ugm_glosario_escribir on public.ugm_glosario for all to authenticated using (public.ugm_es_admin()) with check (public.ugm_es_admin());
grant insert, update, delete on public.ugm_glosario to authenticated;

-- ugm_publico_version: ninguna política. Solo la leen las funciones públicas (definer).

-- Las funciones de papel y de regla las usan las políticas y las funciones: sin acceso anónimo.
do $$
declare
  f text;
begin
  foreach f in array array[
    'ugm_es_admin()', 'ugm_rol_en(uuid, text)', 'ugm_participa(uuid)', 'ugm_rol_en_respuesta(uuid)', 'ugm_huella(text)',
    'ugm_transicion_permitida(text, text, text)', 'ugm_campos_traducibles(jsonb)', 'ugm_traducciones_pendientes(uuid)',
    'ugm_n_evidencias(uuid)', 'ugm_tabla_publicada(uuid)', 'ugm_grafica_publicada(uuid)', 'ugm_valor_vinculo(uuid)',
    'ugm_valores_efectivos(uuid)', 'ugm_evaluar(uuid)', 'ugm_publicacion_estado(uuid)', 'ugm_revalidar_publicacion(uuid, text)',
    'ugm_traducciones_pendientes_fila(public.ugm_respuestas)', 'ugm_valores_efectivos_fila(public.ugm_respuestas)',
    'ugm_evaluar_fila(public.ugm_respuestas)', 'ugm_publicacion_estado_fila(public.ugm_respuestas)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: nadie las llama desde la API.
  foreach f in array array[
    'ugm_bitacora(uuid, uuid, text, text, text, jsonb)', 'ugm_subir_version_publica(uuid)',
    'ugm_encolar_estado(public.ugm_respuestas, public.ugm_respuestas)',
    'ugm_texto_es(public.ugm_respuestas, text, jsonb)', 'ugm_texto_en(public.ugm_respuestas, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
