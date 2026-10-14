-- =============================================================================
-- 0151 · Internacionalización: un repositorio único por campus
--
-- La Oficina de Internacionalización guarda sus datos UNA vez (movilidad,
-- convenios, visitantes…) y de ahí salen muchas plantillas (SNIES, CNA,
-- rankings). Cada campus (Valledupar, Bucaramanga, Cúcuta, Bogotá: la tabla
-- public.campuses de 0017/0063, la misma de program_campuses y ri_sedes)
-- captura solo sus filas.
--
--   int_miembros            quién trabaja en el módulo: director (global),
--                           coordinador o gestor de un campus (una fila por
--                           campus; se puede tener varios).
--   int_conceptos           catálogo compartido: una columna con el mismo
--                           concepto significa lo mismo en todas las tablas.
--                           periodo y campus son implícitos (van en la fila).
--   int_libros → int_hojas → int_columnas
--                           las tablas que diseña el Director (o que sube en
--                           Excel). La clave de una columna con concepto ES el
--                           id del concepto; un campo propio empieza por
--                           «propio_». Así int_filas.datos se lee igual en
--                           todas las hojas (datos->>'pais_contraparte').
--   int_filas               hoja × periodo × campus, datos jsonb por clave.
--   int_periodos            2026-2…: abierto | cerrado.
--   int_ventanas            periodo × hoja (× campus opcional): abre, cierra.
--   int_envios (+historial) el estado de (hoja, periodo, campus):
--                           borrador → enviado → validado → aprobado.
--   int_reaperturas         toda reapertura (envío aprobado, ventana vencida,
--                           periodo cerrado): quién, cuándo y por qué.
--   int_plantillas (+_columnas)
--                           plantillas CNA / rankings / otras cargadas por el
--                           Director, con el emparejamiento columna ↔ concepto.
--   int_envios_snies (+_filas)
--                           lo que el puente mandó a Reportes Institucionales.
--
-- Quién puede qué (lo hace cumplir la base, no la pantalla):
--   · Director (o administración de la intranet): todo. Estructura, catálogo,
--     plantillas, periodos y ventanas, aprobar, reabrir con motivo, puente
--     SNIES, y los accesos del módulo (un director solo lo nombra la
--     administración).
--   · Coordinador de un campus: ve y corrige las filas de su campus (dentro de
--     la ventana y antes de validar), valida o devuelve con nota.
--   · Gestor de un campus: captura y carga filas de su campus dentro de la
--     ventana y mientras la hoja esté en borrador; la envía.
--   · Una tabla marcada captura = 'oficina' la escribe solo el Director.
--   · Una hoja aprobada no la cambia nadie: primero se reabre (con motivo).
--   · Solo lo APROBADO cuenta en cifras (int_cifras) y en el puente SNIES.
--
-- Sin acceso anónimo. No se guarda el Excel original (se lee en el
-- navegador): no hay bucket. Requiere 0002 (current_role, has_role_at_least),
-- 0017/0063 (campuses), 0026 (set_updated_at) y 0103/0104 (ri_*).
-- Idempotente. Todo DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.int_miembros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  rol         text not null,
  campus_id   uuid references public.campuses (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint int_miembros_rol check (rol in ('director', 'coordinador', 'gestor')),
  -- El director es global; coordinador y gestor van siempre con su campus.
  constraint int_miembros_campus check ((rol = 'director') = (campus_id is null))
);

create unique index if not exists int_miembros_unico
  on public.int_miembros (user_id, rol, coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists int_miembros_campus_idx on public.int_miembros (campus_id, rol);

comment on table public.int_miembros is
  'Internacionalización (0151): quién trabaja en el módulo. director (global), coordinador o gestor de un campus (una fila por campus). Pertenecer abre el módulo en el menú.';

create table if not exists public.int_conceptos (
  id           text primary key,
  nombre       text not null,
  tipo         text not null,
  opciones     text[] not null default '{}',
  sinonimos    text[] not null default '{}',
  descripcion  text not null default '',
  -- periodo y campus: van en la fila, no en una columna.
  implicito    boolean not null default false,
  -- Dato personal (documento, nombres, nacimiento): las pantallas lo enmascaran.
  personal     boolean not null default false,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint int_conceptos_id check (id ~ '^[a-z][a-z0-9_]{1,40}$' and id !~ '^propio_'),
  constraint int_conceptos_tipo check (tipo in ('texto', 'numero', 'fecha', 'lista', 'calculado')),
  constraint int_conceptos_nombre check (char_length(btrim(nombre)) between 1 and 120)
);

comment on table public.int_conceptos is
  'Internacionalización (0151): catálogo compartido de conceptos. Una columna con el mismo concepto significa lo mismo en todas las tablas y plantillas.';

drop trigger if exists int_conceptos_set_updated_at on public.int_conceptos;
create trigger int_conceptos_set_updated_at before update on public.int_conceptos
  for each row execute function public.set_updated_at();

create table if not exists public.int_libros (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text not null default '',
  -- campus: cada campus captura sus filas; oficina: solo el Director.
  captura      text not null default 'campus',
  orden        integer not null default 0,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint int_libros_nombre_unico unique (nombre),
  constraint int_libros_nombre check (char_length(btrim(nombre)) between 1 and 120),
  constraint int_libros_captura check (captura in ('campus', 'oficina'))
);

drop trigger if exists int_libros_set_updated_at on public.int_libros;
create trigger int_libros_set_updated_at before update on public.int_libros
  for each row execute function public.set_updated_at();

create table if not exists public.int_hojas (
  id          uuid primary key default gen_random_uuid(),
  libro_id    uuid not null references public.int_libros (id) on delete cascade,
  nombre      text not null,
  -- Para las cifras: qué cuenta esta hoja.
  clase       text not null default 'general',
  -- Movilidad sin columna «Sentido»: el sentido es el de la hoja.
  sentido     text,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint int_hojas_nombre_unico unique (libro_id, nombre),
  constraint int_hojas_nombre check (char_length(btrim(nombre)) between 1 and 80),
  constraint int_hojas_clase check (clase in ('movilidad', 'convenio', 'general')),
  constraint int_hojas_sentido check (sentido is null or sentido in ('saliente', 'entrante'))
);

create index if not exists int_hojas_libro_idx on public.int_hojas (libro_id, orden);

drop trigger if exists int_hojas_set_updated_at on public.int_hojas;
create trigger int_hojas_set_updated_at before update on public.int_hojas
  for each row execute function public.set_updated_at();

create table if not exists public.int_columnas (
  id           uuid primary key default gen_random_uuid(),
  hoja_id      uuid not null references public.int_hojas (id) on delete cascade,
  clave        text not null,
  etiqueta     text not null,
  tipo         text not null default 'texto',
  concepto_id  text references public.int_conceptos (id) on update cascade on delete restrict,
  obligatorio  boolean not null default false,
  opciones     text[] not null default '{}',
  -- Solo calculadas: {"tipo": "dias_entre", "desde": "fecha_inicio", "hasta": "fecha_fin"}.
  calculo      jsonb,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint int_columnas_clave_unica unique (hoja_id, clave),
  constraint int_columnas_clave check (clave ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- Con concepto, la clave es el concepto; sin él, un campo propio.
  constraint int_columnas_clave_concepto check (
    (concepto_id is not null and clave = concepto_id) or (concepto_id is null and clave like 'propio\_%')
  ),
  constraint int_columnas_no_implicito check (concepto_id is null or concepto_id not in ('periodo', 'campus')),
  constraint int_columnas_tipo check (tipo in ('texto', 'numero', 'fecha', 'lista', 'calculado')),
  constraint int_columnas_etiqueta check (char_length(btrim(etiqueta)) between 1 and 120),
  constraint int_columnas_calculo check (
    (tipo = 'calculado') = (calculo is not null) and (calculo is null or jsonb_typeof(calculo) = 'object')
  )
);

create index if not exists int_columnas_hoja_idx on public.int_columnas (hoja_id, orden);

create table if not exists public.int_periodos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  nombre      text not null default '',
  abre        date,
  cierra      date,
  estado      text not null default 'abierto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint int_periodos_codigo_unico unique (codigo),
  constraint int_periodos_codigo check (codigo ~ '^[0-9]{4}-[12]$'),
  constraint int_periodos_estado check (estado in ('abierto', 'cerrado')),
  constraint int_periodos_fechas check (abre is null or cierra is null or cierra >= abre)
);

drop trigger if exists int_periodos_set_updated_at on public.int_periodos;
create trigger int_periodos_set_updated_at before update on public.int_periodos
  for each row execute function public.set_updated_at();

create table if not exists public.int_ventanas (
  id          uuid primary key default gen_random_uuid(),
  periodo_id  uuid not null references public.int_periodos (id) on delete cascade,
  hoja_id     uuid not null references public.int_hojas (id) on delete cascade,
  -- Nulo: todos los campus. Una ventana de un campus manda sobre la general.
  campus_id   uuid references public.campuses (id) on delete cascade,
  abre        date not null,
  cierra      date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint int_ventanas_fechas check (cierra >= abre)
);

create unique index if not exists int_ventanas_unica
  on public.int_ventanas (periodo_id, hoja_id, coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists int_ventanas_set_updated_at on public.int_ventanas;
create trigger int_ventanas_set_updated_at before update on public.int_ventanas
  for each row execute function public.set_updated_at();

create table if not exists public.int_filas (
  id          uuid primary key default gen_random_uuid(),
  hoja_id     uuid not null references public.int_hojas (id) on delete cascade,
  periodo_id  uuid not null references public.int_periodos (id) on delete cascade,
  campus_id   uuid not null references public.campuses (id) on delete restrict,
  datos       jsonb not null default '{}'::jsonb,
  orden       integer not null default 0,
  origen      text not null default 'manual',
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint int_filas_datos check (jsonb_typeof(datos) = 'object'),
  constraint int_filas_origen check (origen in ('manual', 'excel'))
);

comment on table public.int_filas is
  'Internacionalización (0151): las filas, por hoja × periodo × campus. datos = {clave de columna: valor}. PUEDE CONTENER DATOS PERSONALES (documento, nombres): cada campus lee solo las suyas; nada para anon.';

create index if not exists int_filas_hpc_idx on public.int_filas (hoja_id, periodo_id, campus_id, orden);
create index if not exists int_filas_periodo_idx on public.int_filas (periodo_id, campus_id);

create table if not exists public.int_envios (
  periodo_id   uuid not null references public.int_periodos (id) on delete cascade,
  hoja_id      uuid not null references public.int_hojas (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  estado       text not null default 'borrador',
  nota         text not null default '',
  enviado_en   timestamptz,
  enviado_por  uuid references public.profiles (id) on delete set null,
  validado_en  timestamptz,
  validado_por uuid references public.profiles (id) on delete set null,
  aprobado_en  timestamptz,
  aprobado_por uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (periodo_id, hoja_id, campus_id),
  constraint int_envios_estado check (estado in ('borrador', 'enviado', 'validado', 'aprobado')),
  constraint int_envios_nota check (char_length(nota) <= 2000)
);

comment on table public.int_envios is
  'Internacionalización (0151): estado de una hoja de un campus en un periodo. Sin fila = borrador. Se escribe solo con int_cambiar_estado().';

create table if not exists public.int_envios_historial (
  id          bigint generated always as identity primary key,
  periodo_id  uuid not null references public.int_periodos (id) on delete cascade,
  hoja_id     uuid not null references public.int_hojas (id) on delete cascade,
  campus_id   uuid not null references public.campuses (id) on delete cascade,
  de          text not null,
  a           text not null,
  nota        text not null default '',
  actor       uuid references public.profiles (id) on delete set null,
  actor_rol   text,
  en          timestamptz not null default now()
);

create index if not exists int_envios_historial_idx on public.int_envios_historial (periodo_id, hoja_id, campus_id, en);

create table if not exists public.int_reaperturas (
  id          bigint generated always as identity primary key,
  tipo        text not null,
  periodo_id  uuid not null references public.int_periodos (id) on delete cascade,
  hoja_id     uuid references public.int_hojas (id) on delete cascade,
  campus_id   uuid references public.campuses (id) on delete cascade,
  motivo      text not null,
  detalle     jsonb not null default '{}'::jsonb,
  actor       uuid references public.profiles (id) on delete set null,
  en          timestamptz not null default now(),
  constraint int_reaperturas_tipo check (tipo in ('envio', 'ventana', 'periodo')),
  constraint int_reaperturas_motivo check (char_length(btrim(motivo)) between 3 and 2000)
);

create index if not exists int_reaperturas_periodo_idx on public.int_reaperturas (periodo_id, en);

create table if not exists public.int_plantillas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo             text not null default 'otra',
  descripcion      text not null default '',
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint int_plantillas_nombre_unico unique (nombre),
  constraint int_plantillas_tipo check (tipo in ('cna', 'ranking', 'otra')),
  constraint int_plantillas_nombre check (char_length(btrim(nombre)) between 1 and 160)
);

comment on table public.int_plantillas is
  'Internacionalización (0151): plantillas CNA, rankings u otras que carga el Director (CSV/Excel). Las SNIES no van aquí: se leen del catálogo del módulo Reportes.';

drop trigger if exists int_plantillas_set_updated_at on public.int_plantillas;
create trigger int_plantillas_set_updated_at before update on public.int_plantillas
  for each row execute function public.set_updated_at();

create table if not exists public.int_plantilla_columnas (
  id            uuid primary key default gen_random_uuid(),
  plantilla_id  uuid not null references public.int_plantillas (id) on delete cascade,
  orden         integer not null default 0,
  etiqueta      text not null,
  concepto_id   text references public.int_conceptos (id) on update cascade on delete set null,
  -- directo: el concepto responde la columna; derivado: se calcula de él
  -- (conteo, código desde el nombre…); falta: no hay campo que la responda.
  modo          text not null default 'falta',
  nota          text not null default '',
  constraint int_plantilla_columnas_modo check (modo in ('directo', 'derivado', 'falta')),
  constraint int_plantilla_columnas_concepto check ((modo = 'falta') = (concepto_id is null)),
  constraint int_plantilla_columnas_etiqueta check (char_length(btrim(etiqueta)) between 1 and 200)
);

create index if not exists int_plantilla_columnas_idx on public.int_plantilla_columnas (plantilla_id, orden);

create table if not exists public.int_envios_snies (
  id          uuid primary key default gen_random_uuid(),
  periodo_id  uuid not null references public.int_periodos (id) on delete cascade,
  plantilla   text not null,
  ri_periodo  text not null,
  entrega_id  uuid references public.ri_entregas (id) on delete set null,
  insertadas  integer not null default 0,
  omitidas    integer not null default 0,
  actor       uuid references public.profiles (id) on delete set null,
  en          timestamptz not null default now()
);

comment on table public.int_envios_snies is
  'Internacionalización (0151): cada envío del puente a Reportes Institucionales (ri_filas): cuántas filas entraron y cuántas ya estaban.';

create table if not exists public.int_envios_snies_filas (
  id         bigint generated always as identity primary key,
  envio_id   uuid not null references public.int_envios_snies (id) on delete cascade,
  fila_id    uuid references public.int_filas (id) on delete set null,
  clave      text not null,
  insertada  boolean not null
);

create index if not exists int_envios_snies_filas_idx on public.int_envios_snies_filas (envio_id);

-- -----------------------------------------------------------------------------
-- 2. Catálogo de conceptos (semilla). Las listas de tipo de documento, sexo y
--    estado civil son las del manual SNIES (src/modules/reportes/snies/dominios.ts).
--    El espejo en TypeScript es src/modules/internacionalizacion/lib/conceptos.ts.
-- -----------------------------------------------------------------------------

insert into public.int_conceptos (id, nombre, tipo, opciones, sinonimos, implicito, personal, orden) values
  ('periodo', 'Periodo', 'texto', '{}', '{semestre,"periodo academico"}', true, false, 1),
  ('campus', 'Campus', 'lista', '{}', '{sede,seccional}', true, false, 2),
  ('programa', 'Programa académico', 'texto', '{}', '{programa,"programa academico","carrera"}', false, false, 10),
  ('tipo_persona', 'Tipo de participante', 'lista', '{Estudiante,Docente,Administrativo,Egresado,Investigador}', '{"tipo de persona",rol,estamento,participante}', false, false, 11),
  ('tipo_documento', 'Tipo de documento', 'lista',
     '{"Cédula de ciudadanía","Documento de identidad extranjera","Cédula de extranjería","Tarjeta de identidad",Pasaporte,"Certificado de cabildo","Permiso por protección temporal (PPT)"}',
     '{"tipo doc","tipo de identificacion","tipo identificacion"}', false, true, 12),
  ('numero_documento', 'Número de documento', 'texto', '{}', '{documento,"numero de identificacion",identificacion,cedula,"no documento","num documento","nro documento"}', false, true, 13),
  ('primer_nombre', 'Primer nombre', 'texto', '{}', '{nombre,nombres}', false, true, 14),
  ('segundo_nombre', 'Segundo nombre', 'texto', '{}', '{}', false, true, 15),
  ('primer_apellido', 'Primer apellido', 'texto', '{}', '{apellido,apellidos}', false, true, 16),
  ('segundo_apellido', 'Segundo apellido', 'texto', '{}', '{}', false, true, 17),
  ('nombre_completo', 'Nombre completo', 'texto', '{}', '{"nombres y apellidos","nombre y apellido","nombre del participante"}', false, true, 18),
  ('sexo_biologico', 'Sexo biológico', 'lista', '{Hombre,Mujer}', '{sexo,genero}', false, true, 19),
  ('estado_civil', 'Estado civil', 'lista', '{"Soltero(a)","Casado(a)","Divorciado(a)","Viudo(a)","Unión libre","Religioso(a)","Separado(a)"}', '{}', false, true, 20),
  ('fecha_nacimiento', 'Fecha de nacimiento', 'fecha', '{}', '{nacimiento}', false, true, 21),
  ('pais_nacimiento', 'País de nacimiento', 'texto', '{}', '{"pais de origen"}', false, true, 22),
  ('nacionalidad', 'Nacionalidad', 'texto', '{}', '{"pais de nacionalidad"}', false, false, 23),
  ('correo', 'Correo electrónico', 'texto', '{}', '{email,"correo electronico","e mail",mail}', false, true, 24),
  ('telefono', 'Teléfono', 'texto', '{}', '{celular,"telefono de contacto",movil}', false, true, 25),
  ('sentido_movilidad', 'Sentido de la movilidad', 'lista', '{Saliente,Entrante}', '{sentido,"tipo de movilidad saliente entrante",direccion,"entrante saliente"}', false, false, 30),
  ('tipo_movilidad', 'Tipo de movilidad', 'lista',
     '{"Semestre académico",Pasantía,"Curso corto","Evento académico","Doble titulación","Estancia de investigación","Rotación clínica","Misión académica",Otra}',
     '{"modalidad de intercambio","actividad","tipo de actividad"}', false, false, 31),
  ('modalidad', 'Modalidad', 'lista', '{Presencial,Virtual,Mixta}', '{"presencial o virtual"}', false, false, 32),
  ('pais_contraparte', 'País de la contraparte', 'texto', '{}', '{pais,"pais destino","pais de destino","pais de procedencia","pais origen"}', false, false, 33),
  ('ciudad_contraparte', 'Ciudad de la contraparte', 'texto', '{}', '{ciudad,"ciudad destino","ciudad de destino"}', false, false, 34),
  ('institucion_contraparte', 'Institución de la contraparte', 'texto', '{}', '{institucion,universidad,"institucion destino","institucion de destino","universidad destino","institucion de origen","entidad","institucion aliada","contraparte"}', false, false, 35),
  ('fecha_inicio', 'Fecha de inicio', 'fecha', '{}', '{inicio,desde,"fecha inicial","fecha de suscripcion","fecha suscripcion"}', false, false, 36),
  ('fecha_fin', 'Fecha de fin', 'fecha', '{}', '{fin,hasta,"fecha final","fecha de terminacion","fecha terminacion","fecha de finalizacion"}', false, false, 37),
  ('duracion_dias', 'Duración (días)', 'calculado', '{}', '{duracion,dias,"numero de dias"}', false, false, 38),
  ('financiacion', 'Financiación', 'lista', '{Propia,"Beca UDES",Convenio,Externa}', '{"fuente de financiacion",financiamiento,"apoyo economico"}', false, false, 39),
  ('valor_financiacion', 'Valor de la financiación', 'numero', '{}', '{valor,monto,"valor apoyo"}', false, false, 40),
  ('nombre_convenio', 'Nombre del convenio', 'texto', '{}', '{convenio,"objeto del convenio",objeto}', false, false, 50),
  ('tipo_convenio', 'Tipo de convenio', 'lista', '{Marco,Específico,"Doble titulación",Movilidad,Investigación,Otro}', '{"clase de convenio"}', false, false, 51),
  ('vigencia_anios', 'Vigencia del convenio (años)', 'numero', '{}', '{vigencia,"vigencia anos","duracion del convenio","anos de vigencia"}', false, false, 52),
  ('ods', 'ODS asociado', 'texto', '{}', '{"objetivo de desarrollo sostenible",ods}', false, false, 60)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Funciones de permiso (security definer: leen sin pasar por RLS)
-- -----------------------------------------------------------------------------

/** Hoy en Colombia: las ventanas se cuentan por días de Bogotá. */
create or replace function public.int_hoy()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

/** ¿Director del módulo? La administración de la intranet cuenta como Director. */
create or replace function public.int_es_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null
     and (public.has_role_at_least('admin')
          or exists (select 1 from public.int_miembros m where m.user_id = auth.uid() and m.rol = 'director'));
$$;

/** ¿Trabaja en el módulo (cualquier rol) o es de la administración? */
create or replace function public.int_es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null
     and (public.has_role_at_least('admin')
          or exists (select 1 from public.int_miembros m where m.user_id = auth.uid()));
$$;

/** Papel frente a un campus: director | coordinador | gestor, o nulo. */
create or replace function public.int_rol_en(p_campus uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.int_es_director() then 'director'
    when public.current_role() is null then null
    when exists (select 1 from public.int_miembros m
                  where m.user_id = auth.uid() and m.rol = 'coordinador' and m.campus_id = p_campus) then 'coordinador'
    when exists (select 1 from public.int_miembros m
                  where m.user_id = auth.uid() and m.rol = 'gestor' and m.campus_id = p_campus) then 'gestor'
    else null
  end;
$$;

/** ¿Ve las filas y los estados de este campus? */
create or replace function public.int_puede_ver_campus(p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.int_rol_en(p_campus) is not null;
$$;

/** Mis papeles, para la pantalla: {director, coordinador: [campus], gestor: [campus]}. */
create or replace function public.int_yo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'director', public.int_es_director(),
    'coordinador', coalesce((select jsonb_agg(m.campus_id order by m.campus_id) from public.int_miembros m
                              where m.user_id = auth.uid() and m.rol = 'coordinador' and public.current_role() is not null), '[]'::jsonb),
    'gestor', coalesce((select jsonb_agg(m.campus_id order by m.campus_id) from public.int_miembros m
                         where m.user_id = auth.uid() and m.rol = 'gestor' and public.current_role() is not null), '[]'::jsonb)
  );
$$;

/** Estado de (periodo, hoja, campus); sin fila es borrador. */
create or replace function public.int_estado_envio(p_periodo uuid, p_hoja uuid, p_campus uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.estado from public.int_envios e
      where e.periodo_id = p_periodo and e.hoja_id = p_hoja and e.campus_id = p_campus),
    'borrador');
$$;

/**
 * ¿Está abierta la captura de esta hoja para este campus hoy? El periodo
 * abierto y una ventana vigente: la del campus si la hay, si no la general.
 */
create or replace function public.int_ventana_abierta(p_periodo uuid, p_hoja uuid, p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.int_periodos p where p.id = p_periodo and p.estado = 'abierto')
     and coalesce((
       select public.int_hoy() between v.abre and v.cierra
         from public.int_ventanas v
        where v.periodo_id = p_periodo and v.hoja_id = p_hoja
          and (v.campus_id = p_campus or v.campus_id is null)
        order by (v.campus_id is null)
        limit 1
     ), false);
$$;

/**
 * Por qué no puede escribir filas de (periodo, hoja, campus), o nulo si
 * puede. Es el cuadro de lib/permisos.ts (motivoBloqueoFilas); si cambia uno,
 * cambia el otro.
 */
create or replace function public.int_motivo_bloqueo(p_periodo uuid, p_hoja uuid, p_campus uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text := public.int_rol_en(p_campus);
  v_estado text := public.int_estado_envio(p_periodo, p_hoja, p_campus);
  v_captura text;
begin
  if v_rol is null then
    return 'No tiene permiso en este campus.';
  end if;
  if v_estado = 'aprobado' then
    return 'La hoja de este campus ya está aprobada: solo el Director la reabre, con motivo.';
  end if;
  if v_rol = 'director' then
    return null;
  end if;
  select l.captura into v_captura
    from public.int_hojas h join public.int_libros l on l.id = h.libro_id
   where h.id = p_hoja;
  if v_captura = 'oficina' then
    return 'Esta tabla la captura solo la oficina principal.';
  end if;
  if not public.int_ventana_abierta(p_periodo, p_hoja, p_campus) then
    return 'La ventana de captura de esta hoja está cerrada para este campus.';
  end if;
  if v_rol = 'gestor' and v_estado <> 'borrador' then
    return 'La hoja ya se envió: solo se corrige si la devuelven.';
  end if;
  if v_rol = 'coordinador' and v_estado = 'validado' then
    return 'La hoja ya está validada: devuélvala para corregirla.';
  end if;
  return null;
end;
$$;

/**
 * Transiciones del envío y quién las hace. Mismo cuadro que
 * lib/estados.ts (TRANSICIONES); si cambia uno, cambia el otro.
 */
create or replace function public.int_transicion_permitida(de text, a text, rol text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      when de = 'borrador'  and a = 'enviado'  then rol in ('gestor', 'coordinador', 'director')
      when de = 'enviado'   and a = 'validado' then rol in ('coordinador', 'director')
      when de = 'validado'  and a = 'aprobado' then rol = 'director'
      when de = 'enviado'   and a = 'borrador' then rol in ('coordinador', 'director')
      when de = 'validado'  and a = 'borrador' then rol in ('coordinador', 'director')
      when de = 'aprobado'  and a = 'borrador' then rol = 'director'
      else false
    end,
    false);
$$;

/** Texto → fecha, o nulo si no es una fecha. */
create or replace function public.int_fecha(v text)
returns date
language plpgsql
immutable
as $$
begin
  if v is null or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return v::date;
exception when others then
  return null;
end;
$$;

/** Texto → número, o nulo. */
create or replace function public.int_numero(v text)
returns numeric
language plpgsql
immutable
as $$
begin
  if v is null or btrim(v) = '' then
    return null;
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

/**
 * Revisa los datos de una fila contra las columnas de su hoja: claves que
 * existen, número, fecha AAAA-MM-DD y valores de lista. Nulo si está bien.
 * Los obligatorios se exigen al enviar, no al guardar un borrador.
 */
create or replace function public.int_validar_datos(p_hoja uuid, p_datos jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par record;
  v_col public.int_columnas;
  v_texto text;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    return 'Los datos de la fila deben ser un objeto.';
  end if;
  for v_par in select key, value from jsonb_each(p_datos) loop
    select * into v_col from public.int_columnas c where c.hoja_id = p_hoja and c.clave = v_par.key;
    if not found then
      return format('La columna «%s» no existe en esta hoja.', v_par.key);
    end if;
    if jsonb_typeof(v_par.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_par.value) not in ('string', 'number') then
      return format('«%s»: el valor debe ser texto o número.', v_col.etiqueta);
    end if;
    v_texto := v_par.value #>> '{}';
    if btrim(v_texto) = '' then
      continue;
    end if;
    if v_col.tipo in ('numero', 'calculado') and jsonb_typeof(v_par.value) <> 'number' then
      return format('«%s» debe ser un número («%s» no lo es).', v_col.etiqueta, v_texto);
    elsif v_col.tipo = 'fecha' and public.int_fecha(v_texto) is null then
      return format('«%s» debe ser una fecha AAAA-MM-DD («%s» no lo es).', v_col.etiqueta, v_texto);
    elsif v_col.tipo = 'lista' and cardinality(v_col.opciones) > 0 and not (v_texto = any (v_col.opciones)) then
      return format('«%s» no es una opción de «%s».', v_texto, v_col.etiqueta);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.int_es_director() from public, anon;
revoke all on function public.int_es_miembro() from public, anon;
revoke all on function public.int_rol_en(uuid) from public, anon;
revoke all on function public.int_puede_ver_campus(uuid) from public, anon;
revoke all on function public.int_yo() from public, anon;
revoke all on function public.int_estado_envio(uuid, uuid, uuid) from public, anon;
revoke all on function public.int_ventana_abierta(uuid, uuid, uuid) from public, anon;
revoke all on function public.int_motivo_bloqueo(uuid, uuid, uuid) from public, anon;
revoke all on function public.int_validar_datos(uuid, jsonb) from public, anon;
grant execute on function public.int_es_director() to authenticated;
grant execute on function public.int_es_miembro() to authenticated;
grant execute on function public.int_rol_en(uuid) to authenticated;
grant execute on function public.int_puede_ver_campus(uuid) to authenticated;
grant execute on function public.int_yo() to authenticated;
grant execute on function public.int_ventana_abierta(uuid, uuid, uuid) to authenticated;
grant execute on function public.int_motivo_bloqueo(uuid, uuid, uuid) to authenticated;
-- int_estado_envio e int_validar_datos son internas (las usan el disparador y las
-- RPC, que corren como dueño): no se exponen, para no revelar hojas ni estados ajenos.
revoke execute on function public.int_estado_envio(uuid, uuid, uuid) from authenticated;
revoke execute on function public.int_validar_datos(uuid, jsonb) from authenticated;

-- -----------------------------------------------------------------------------
-- 4. Disparadores
-- -----------------------------------------------------------------------------

/**
 * Las filas: permiso del campus, estado del envío, ventana y forma de los
 * datos. Las escrituras sin sesión (clave de servicio, migraciones) pasan, y
 * también los borrados en cascada (borrar una hoja borra sus filas).
 */
create or replace function public.int_filas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.int_filas;
  v_motivo text;
  v_error text;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
  else
    v_fila := new;
  end if;

  if auth.uid() is null then
    return v_fila;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (new.hoja_id, new.periodo_id, new.campus_id) is distinct from (old.hoja_id, old.periodo_id, old.campus_id) then
    raise exception 'Una fila no cambia de hoja, periodo ni campus: bórrela y créela donde va.' using errcode = '42501';
  end if;

  v_motivo := public.int_motivo_bloqueo(v_fila.periodo_id, v_fila.hoja_id, v_fila.campus_id);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  v_error := public.int_validar_datos(new.hoja_id, new.datos);
  if v_error is not null then
    raise exception '%', v_error using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists int_filas_guard_trg on public.int_filas;
create trigger int_filas_guard_trg before insert or update or delete on public.int_filas
  for each row execute function public.int_filas_guard();

/**
 * Reabrir un periodo cerrado o una ventana vencida pide motivo: solo se puede
 * con int_reabrir(), que lo deja escrito. Cambiar fechas a futuro o cerrar, sí
 * se hace directo.
 */
create or replace function public.int_reapertura_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(current_setting('int.reabriendo', true), '') = 'si' then
    return new;
  end if;
  if tg_table_name = 'int_periodos' then
    if old.estado = 'cerrado' and new.estado = 'abierto' then
      raise exception 'Reabrir un periodo cerrado pide un motivo: use «Reabrir».' using errcode = '42501';
    end if;
  elsif old.cierra < public.int_hoy() and new.cierra >= public.int_hoy() then
    raise exception 'Reabrir una ventana vencida pide un motivo: use «Reabrir».' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists int_periodos_reapertura_trg on public.int_periodos;
create trigger int_periodos_reapertura_trg before update on public.int_periodos
  for each row execute function public.int_reapertura_guard();
drop trigger if exists int_ventanas_reapertura_trg on public.int_ventanas;
create trigger int_ventanas_reapertura_trg before update on public.int_ventanas
  for each row execute function public.int_reapertura_guard();

-- -----------------------------------------------------------------------------
-- 5. RPC: estados, reaperturas y carga masiva
-- -----------------------------------------------------------------------------

/**
 * Mueve (periodo, hoja, campus) de estado: enviar, validar, aprobar, devolver
 * (con nota) o reabrir una aprobada (solo Director, con motivo, queda en
 * int_reaperturas). Devuelve el envío.
 */
create or replace function public.int_cambiar_estado(
  p_periodo uuid, p_hoja uuid, p_campus uuid, p_estado text, p_nota text default null
)
returns public.int_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.int_rol_en(p_campus);
  v_envio public.int_envios;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_captura text;
  v_faltan integer;
  v_periodo_abierto boolean;
begin
  if auth.uid() is null or v_rol is null then
    raise exception 'No tiene permiso en este campus.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.int_hojas h where h.id = p_hoja) then
    raise exception 'La hoja no existe.' using errcode = 'P0002';
  end if;
  select p.estado = 'abierto' into v_periodo_abierto from public.int_periodos p where p.id = p_periodo;
  if v_periodo_abierto is null then
    raise exception 'El periodo no existe.' using errcode = 'P0002';
  end if;
  if not v_periodo_abierto and v_rol <> 'director' then
    raise exception 'El periodo está cerrado.' using errcode = '42501';
  end if;
  select l.captura into v_captura from public.int_hojas h join public.int_libros l on l.id = h.libro_id where h.id = p_hoja;
  if v_captura = 'oficina' and v_rol <> 'director' then
    raise exception 'Esta tabla la maneja solo la oficina principal.' using errcode = '42501';
  end if;

  insert into public.int_envios (periodo_id, hoja_id, campus_id, updated_by)
  values (p_periodo, p_hoja, p_campus, auth.uid())
  on conflict do nothing;
  select * into v_envio from public.int_envios e
   where e.periodo_id = p_periodo and e.hoja_id = p_hoja and e.campus_id = p_campus
   for update;

  if not public.int_transicion_permitida(v_envio.estado, p_estado, v_rol) then
    raise exception 'Cambio no permitido: % → % (%).', v_envio.estado, coalesce(p_estado, ''), v_rol using errcode = '42501';
  end if;
  if p_estado = 'borrador' and char_length(v_nota) < 3 then
    raise exception 'Para devolver o reabrir escriba el motivo.' using errcode = '22023';
  end if;
  if p_estado = 'enviado' then
    if v_rol = 'gestor' and not public.int_ventana_abierta(p_periodo, p_hoja, p_campus) then
      raise exception 'La ventana de captura está cerrada: ya no se puede enviar.' using errcode = '42501';
    end if;
    select count(*) into v_faltan
      from public.int_filas f
     where f.periodo_id = p_periodo and f.hoja_id = p_hoja and f.campus_id = p_campus
       and exists (select 1 from public.int_columnas c
                    where c.hoja_id = p_hoja and c.obligatorio and c.tipo <> 'calculado'
                      and btrim(coalesce(f.datos ->> c.clave, '')) = '');
    if v_faltan > 0 then
      raise exception 'Hay % fila(s) con datos obligatorios vacíos: complételas antes de enviar.', v_faltan using errcode = '23514';
    end if;
  end if;

  insert into public.int_envios_historial (periodo_id, hoja_id, campus_id, de, a, nota, actor, actor_rol)
  values (p_periodo, p_hoja, p_campus, v_envio.estado, p_estado, v_nota, auth.uid(), v_rol);

  if v_envio.estado = 'aprobado' and p_estado = 'borrador' then
    insert into public.int_reaperturas (tipo, periodo_id, hoja_id, campus_id, motivo, actor)
    values ('envio', p_periodo, p_hoja, p_campus, v_nota, auth.uid());
  end if;

  update public.int_envios e
     set estado = p_estado,
         nota = v_nota,
         enviado_en = case when p_estado = 'enviado' then now() when p_estado = 'borrador' then null else e.enviado_en end,
         enviado_por = case when p_estado = 'enviado' then auth.uid() when p_estado = 'borrador' then null else e.enviado_por end,
         validado_en = case when p_estado = 'validado' then now() when p_estado = 'borrador' then null else e.validado_en end,
         validado_por = case when p_estado = 'validado' then auth.uid() when p_estado = 'borrador' then null else e.validado_por end,
         aprobado_en = case when p_estado = 'aprobado' then now() when p_estado = 'borrador' then null else e.aprobado_en end,
         aprobado_por = case when p_estado = 'aprobado' then auth.uid() when p_estado = 'borrador' then null else e.aprobado_por end,
         updated_by = auth.uid(),
         updated_at = now()
   where e.periodo_id = p_periodo and e.hoja_id = p_hoja and e.campus_id = p_campus
  returning * into v_envio;

  return v_envio;
end;
$$;

comment on function public.int_cambiar_estado(uuid, uuid, uuid, text, text) is
  'Internacionalización: enviar (gestor), validar (coordinador), aprobar (director), devolver con nota o reabrir una aprobada con motivo (director).';

/**
 * Reabre un periodo cerrado (p_hoja nulo) o la ventana de una hoja (con
 * p_cierra, la nueva fecha de cierre; p_campus para la de un solo campus).
 * Solo el Director, con motivo; queda en int_reaperturas.
 */
create or replace function public.int_reabrir(
  p_periodo uuid, p_motivo text, p_hoja uuid default null, p_campus uuid default null, p_cierra date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_ventana public.int_ventanas;
begin
  if not public.int_es_director() then
    raise exception 'Solo el Director de Internacionalización reabre.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'Escriba el motivo de la reapertura.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.int_periodos p where p.id = p_periodo) then
    raise exception 'El periodo no existe.' using errcode = 'P0002';
  end if;

  perform set_config('int.reabriendo', 'si', true);

  if p_hoja is null then
    update public.int_periodos set estado = 'abierto' where id = p_periodo;
    insert into public.int_reaperturas (tipo, periodo_id, motivo, actor)
    values ('periodo', p_periodo, v_motivo, auth.uid());
  else
    if p_cierra is null or p_cierra < public.int_hoy() then
      raise exception 'La nueva fecha de cierre debe ser hoy o después.' using errcode = '22023';
    end if;
    select * into v_ventana from public.int_ventanas v
     where v.periodo_id = p_periodo and v.hoja_id = p_hoja
       and v.campus_id is not distinct from p_campus;
    if found then
      update public.int_ventanas set cierra = p_cierra, abre = least(abre, public.int_hoy()) where id = v_ventana.id;
    else
      insert into public.int_ventanas (periodo_id, hoja_id, campus_id, abre, cierra)
      values (p_periodo, p_hoja, p_campus, public.int_hoy(), p_cierra);
    end if;
    insert into public.int_reaperturas (tipo, periodo_id, hoja_id, campus_id, motivo, detalle, actor)
    values ('ventana', p_periodo, p_hoja, p_campus, v_motivo,
            jsonb_build_object('cierra_antes', v_ventana.cierra, 'cierra', p_cierra), auth.uid());
  end if;

  perform set_config('int.reabriendo', '', true);
end;
$$;

/**
 * Escritura masiva (una carga de Excel o un pegado). SECURITY INVOKER: corre
 * con los permisos de quien llama, así que RLS y el disparador de filas deciden
 * fila por fila. p_filas: [{id?, campus_id, datos, orden?}]. Con id actualiza;
 * sin id inserta. p_reemplazar: campus cuyas filas de esa hoja y periodo se
 * borran antes (recargar un Excel). Devuelve {insertadas, actualizadas, borradas}.
 */
create or replace function public.int_guardar_filas(
  p_hoja uuid, p_periodo uuid, p_filas jsonb, p_reemplazar uuid[] default null, p_origen text default 'excel'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_borradas integer := 0;
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 20000 then
    raise exception 'Son % filas: el máximo por carga es 20.000.', jsonb_array_length(p_filas) using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) x(v)
              where jsonb_typeof(x.v) <> 'object' or nullif(x.v ->> 'campus_id', '') is null) then
    raise exception 'Cada fila lleva su campus_id y sus datos.' using errcode = '22023';
  end if;

  if p_reemplazar is not null and cardinality(p_reemplazar) > 0 then
    delete from public.int_filas f
     where f.hoja_id = p_hoja and f.periodo_id = p_periodo and f.campus_id = any (p_reemplazar);
    get diagnostics v_borradas = row_count;
  end if;

  update public.int_filas f
     set datos = coalesce(x.v -> 'datos', '{}'::jsonb),
         orden = coalesce((x.v ->> 'orden')::integer, f.orden)
    from jsonb_array_elements(p_filas) x(v)
   where nullif(x.v ->> 'id', '') is not null
     and f.id = (x.v ->> 'id')::uuid
     and f.hoja_id = p_hoja and f.periodo_id = p_periodo
     and f.campus_id = (x.v ->> 'campus_id')::uuid;
  get diagnostics v_actualizadas = row_count;

  insert into public.int_filas (hoja_id, periodo_id, campus_id, datos, orden, origen)
  select p_hoja, p_periodo, (x.v ->> 'campus_id')::uuid, coalesce(x.v -> 'datos', '{}'::jsonb),
         coalesce((x.v ->> 'orden')::integer, (x.n - 1)::integer),
         case when p_origen = 'manual' then 'manual' else 'excel' end
    from jsonb_array_elements(p_filas) with ordinality x(v, n)
   where nullif(x.v ->> 'id', '') is null;
  get diagnostics v_insertadas = row_count;

  return jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas);
end;
$$;

revoke all on function public.int_cambiar_estado(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.int_reabrir(uuid, text, uuid, uuid, date) from public, anon;
revoke all on function public.int_guardar_filas(uuid, uuid, jsonb, uuid[], text) from public, anon;
grant execute on function public.int_cambiar_estado(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.int_reabrir(uuid, text, uuid, uuid, date) to authenticated;
grant execute on function public.int_guardar_filas(uuid, uuid, jsonb, uuid[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Cifras: agregados de lo aprobado (o, para el Director, desde enviado o
--    validado). Respeta el campus de quien pregunta.
-- -----------------------------------------------------------------------------

/**
 * p_incluir: 'aprobado' (por defecto), 'validado' (validado + aprobado) o
 * 'enviado' (enviado + validado + aprobado). Solo el Director ve más que lo
 * aprobado; para los demás se ignora. Mismo cálculo que lib/cifras.ts.
 */
create or replace function public.int_cifras(p_periodo uuid, p_incluir text default 'aprobado')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estados text[];
  v_ref date;
  v_codigo text;
  v_resultado jsonb;
begin
  if not public.int_es_miembro() then
    raise exception 'Sin permiso para ver las cifras de Internacionalización.' using errcode = '42501';
  end if;
  select coalesce(p.cierra, public.int_hoy()), p.codigo into v_ref, v_codigo from public.int_periodos p where p.id = p_periodo;
  if v_codigo is null then
    raise exception 'El periodo no existe.' using errcode = 'P0002';
  end if;

  v_estados := case
    when not public.int_es_director() or coalesce(p_incluir, 'aprobado') = 'aprobado' then array['aprobado']
    when p_incluir = 'validado' then array['validado', 'aprobado']
    when p_incluir = 'enviado' then array['enviado', 'validado', 'aprobado']
    else array['aprobado']
  end;

  with visibles as (
    select c.id, c.name from public.campuses c where public.int_puede_ver_campus(c.id)
  ),
  base as (
    select f.campus_id, f.hoja_id, f.datos, h.clase, h.sentido as hoja_sentido,
           public.int_estado_envio(f.periodo_id, f.hoja_id, f.campus_id) as estado
      from public.int_filas f
      join public.int_hojas h on h.id = f.hoja_id
     where f.periodo_id = p_periodo and f.campus_id in (select id from visibles)
  ),
  cuenta as (select * from base where estado = any (v_estados)),
  mov as (
    select campus_id,
           lower(coalesce(nullif(btrim(datos ->> 'sentido_movilidad'), ''), hoja_sentido, 'sin sentido')) as sentido,
           coalesce(nullif(btrim(datos ->> 'pais_contraparte'), ''), nullif(btrim(datos ->> 'nacionalidad'), ''), 'Sin país') as pais,
           nullif(regexp_replace(coalesce(datos ->> 'numero_documento', ''), '[.,''’´`[:space:]]', '', 'g'), '') as doc
      from cuenta where clase = 'movilidad'
  ),
  conv as (
    select campus_id,
           public.int_fecha(datos ->> 'fecha_inicio') as ini,
           public.int_fecha(datos ->> 'fecha_fin') as fin,
           public.int_numero(datos ->> 'vigencia_anios') as anios
      from cuenta where clase = 'convenio'
  ),
  hojas as (
    select h.id, h.nombre, l.nombre as libro from public.int_hojas h join public.int_libros l on l.id = h.libro_id
  )
  select jsonb_build_object(
    'periodo', v_codigo,
    'incluye', to_jsonb(v_estados),
    'referencia', v_ref,
    'avance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'campus_id', v.id, 'hoja_id', h.id,
               'estado', public.int_estado_envio(p_periodo, h.id, v.id),
               'filas', (select count(*) from base b where b.campus_id = v.id and b.hoja_id = h.id))
             order by h.libro, h.nombre, v.name)
        from visibles v cross join hojas h), '[]'::jsonb),
    'por_hoja', coalesce((
      select jsonb_agg(jsonb_build_object('hoja_id', x.hoja_id, 'campus_id', x.campus_id, 'filas', x.n))
        from (select hoja_id, campus_id, count(*) as n from cuenta group by hoja_id, campus_id) x), '[]'::jsonb),
    'movilidad', coalesce((
      select jsonb_agg(jsonb_build_object('campus_id', x.campus_id, 'sentido', x.sentido, 'total', x.n) order by x.campus_id, x.sentido)
        from (select campus_id, sentido, count(*) as n from mov group by campus_id, sentido) x), '[]'::jsonb),
    'por_pais', coalesce((
      select jsonb_agg(jsonb_build_object('pais', x.pais, 'sentido', x.sentido, 'total', x.n) order by x.n desc, x.pais)
        from (select pais, sentido, count(*) as n from mov group by pais, sentido) x), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object('campus_id', x.campus_id, 'total', x.n))
        from (select campus_id, count(distinct doc) as n from mov where doc is not null group by campus_id) x), '[]'::jsonb),
    'convenios_vigentes', coalesce((
      select jsonb_agg(jsonb_build_object('campus_id', x.campus_id, 'total', x.n))
        from (select campus_id, count(*) as n from conv
               where (ini is null or ini <= v_ref)
                 and (fin is null or fin >= v_ref)
                 and (ini is null or anios is null or (ini + make_interval(months => trunc(anios * 12)::int))::date >= v_ref)
               group by campus_id) x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.int_cifras(uuid, text) from public, anon;
grant execute on function public.int_cifras(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Puente a Reportes Institucionales (SNIES)
--
-- El navegador arma las filas de la plantilla (lib/puente-snies.ts, con el
-- motor de Reportes: nombres canónicos y validación) a partir de filas
-- APROBADAS; esta función comprueba que cada fila de origen esté aprobada en
-- ese periodo y AGREGA a ri_filas solo las que no estaban (por la clave de la
-- plantilla, p. ej. el documento en Participante). No borra ni pisa nada de lo
-- que ya cargó Reportes: llamarla dos veces no duplica. Si la entrega ya se
-- envió a HECAA, se niega. Al agregar, la entrega vuelve a «cargada» (hay que
-- validarla otra vez en Reportes), igual que ri_guardar_filas.
--
-- p_filas: [{origen: <id de int_filas>, datos: {CAMPO: valor…}}]
-- p_clave: campos que identifican la fila en la plantilla (['NUM_DOCUMENTO']).
-- -----------------------------------------------------------------------------

create or replace function public.int_enviar_snies(p_periodo uuid, p_plantilla text, p_filas jsonb, p_clave text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_entrega public.ri_entregas;
  v_envio uuid;
  v_insertadas integer := 0;
  v_omitidas integer := 0;
  v_total integer;
  v_orden integer;
begin
  if not public.int_es_director() then
    raise exception 'Solo el Director de Internacionalización envía a SNIES.' using errcode = '42501';
  end if;
  select p.codigo into v_codigo from public.int_periodos p where p.id = p_periodo;
  if v_codigo is null then
    raise exception 'El periodo no existe.' using errcode = 'P0002';
  end if;
  perform public.ri_exigir_plantilla(p_plantilla, v_codigo);
  if p_clave is null or cardinality(p_clave) = 0 then
    raise exception 'Falta la clave de la plantilla.' using errcode = '22023';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) x(v)
              where jsonb_typeof(x.v -> 'datos') is distinct from 'object') then
    raise exception 'Cada fila lleva sus datos.' using errcode = '22023';
  end if;
  -- Solo lo aprobado: cada fila de origen debe existir, ser del periodo y estar aprobada.
  if exists (
    select 1 from jsonb_array_elements(p_filas) x(v)
     where not exists (
       select 1 from public.int_filas f
        where f.id::text = x.v ->> 'origen'
          and f.periodo_id = p_periodo
          and public.int_estado_envio(f.periodo_id, f.hoja_id, f.campus_id) = 'aprobado')
  ) then
    raise exception 'Solo se envían a SNIES filas aprobadas de este periodo.' using errcode = '42501';
  end if;

  insert into public.ri_entregas (reporte, plantilla, periodo, updated_by)
  values ('snies', p_plantilla, v_codigo, auth.uid())
  on conflict (reporte, plantilla, periodo) do nothing;
  select * into v_entrega from public.ri_entregas
   where reporte = 'snies' and plantilla = p_plantilla and periodo = v_codigo
   for update;
  if v_entrega.estado = 'enviada' then
    raise exception 'La plantilla % del periodo % ya se envió a HECAA: pida en Reportes que la reabran.', p_plantilla, v_codigo
      using errcode = '42501';
  end if;

  insert into public.int_envios_snies (periodo_id, plantilla, ri_periodo, entrega_id, actor)
  values (p_periodo, p_plantilla, v_codigo, v_entrega.id, auth.uid())
  returning id into v_envio;

  select coalesce(max(orden) + 1, 0) into v_orden from public.ri_filas where entrega_id = v_entrega.id;

  with entrantes as (
    select x.n, x.v,
           (select string_agg(upper(regexp_replace(coalesce(x.v -> 'datos' ->> k, ''), '[.,''’´`[:space:]]', '', 'g')), '|' order by i)
              from unnest(p_clave) with ordinality u(k, i)) as clave
      from jsonb_array_elements(p_filas) with ordinality x(v, n)
  ),
  existentes as (
    select (select string_agg(upper(regexp_replace(coalesce(r.datos ->> k, ''), '[.,''’´`[:space:]]', '', 'g')), '|' order by i)
              from unnest(p_clave) with ordinality u(k, i)) as clave
      from public.ri_filas r where r.entrega_id = v_entrega.id
  ),
  marcadas as (
    select e.*,
           not exists (select 1 from existentes x where x.clave = e.clave)
           and e.n = min(e.n) over (partition by e.clave)
           and replace(e.clave, '|', '') <> '' as nueva
      from entrantes e
  ),
  bitacora as (
    insert into public.int_envios_snies_filas (envio_id, fila_id, clave, insertada)
    select v_envio, f.id, m.clave, m.nueva
      from marcadas m left join public.int_filas f on f.id::text = m.v ->> 'origen'
    returning insertada
  ),
  nuevas as (
    insert into public.ri_filas (entrega_id, orden, datos)
    select v_entrega.id, v_orden + (row_number() over (order by m.n))::integer - 1, m.v -> 'datos'
      from marcadas m where m.nueva
    returning 1
  )
  select (select count(*) from nuevas), (select count(*) from bitacora where not insertada)
    into v_insertadas, v_omitidas;

  if v_insertadas > 0 then
    select count(*) into v_total from public.ri_filas where entrega_id = v_entrega.id;
    update public.ri_entregas
       set estado = 'cargada', filas = v_total, errores = 0, validada_en = null, validada_por = null,
           updated_at = now(), updated_by = auth.uid()
     where id = v_entrega.id;
  end if;

  update public.int_envios_snies set insertadas = v_insertadas, omitidas = v_omitidas where id = v_envio;

  return jsonb_build_object('envio_id', v_envio, 'entrega_id', v_entrega.id, 'periodo', v_codigo,
                            'insertadas', v_insertadas, 'omitidas', v_omitidas);
end;
$$;

comment on function public.int_enviar_snies(uuid, text, jsonb, text[]) is
  'Internacionalización → Reportes Institucionales: agrega a ri_filas las filas aprobadas que la plantilla aún no tiene (por su clave). Idempotente; no pisa lo cargado por otros medios.';

revoke all on function public.int_enviar_snies(uuid, text, jsonb, text[]) from public, anon;
grant execute on function public.int_enviar_snies(uuid, text, jsonb, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.int_miembros            enable row level security;
alter table public.int_conceptos           enable row level security;
alter table public.int_libros              enable row level security;
alter table public.int_hojas               enable row level security;
alter table public.int_columnas            enable row level security;
alter table public.int_periodos            enable row level security;
alter table public.int_ventanas            enable row level security;
alter table public.int_filas               enable row level security;
alter table public.int_envios              enable row level security;
alter table public.int_envios_historial    enable row level security;
alter table public.int_reaperturas         enable row level security;
alter table public.int_plantillas          enable row level security;
alter table public.int_plantilla_columnas  enable row level security;
alter table public.int_envios_snies        enable row level security;
alter table public.int_envios_snies_filas  enable row level security;

-- Miembros: cada quien ve su pertenencia y la de sus campus; el Director, todas.
-- El Director nombra coordinadores y gestores; a un Director lo nombra la administración.
drop policy if exists int_miembros_read on public.int_miembros;
create policy int_miembros_read on public.int_miembros for select to authenticated
  using (user_id = auth.uid() or public.int_es_director()
         or (campus_id is not null and public.int_puede_ver_campus(campus_id)));
drop policy if exists int_miembros_write on public.int_miembros;
create policy int_miembros_write on public.int_miembros for all to authenticated
  using (public.has_role_at_least('admin') or (public.int_es_director() and rol <> 'director'))
  with check (public.has_role_at_least('admin') or (public.int_es_director() and rol <> 'director'));

-- Estructura, catálogo, periodos, ventanas y plantillas: los leen los miembros; los escribe el Director.
do $$
declare
  t text;
begin
  foreach t in array array['int_conceptos', 'int_libros', 'int_hojas', 'int_columnas', 'int_periodos',
                           'int_ventanas', 'int_plantillas', 'int_plantilla_columnas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.int_es_miembro())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.int_es_director()) with check (public.int_es_director())',
                   t || '_write', t);
  end loop;
end $$;

-- Filas: cada campus las suyas (gestor, coordinador); el Director todas. El
-- estado, la ventana y la forma de los datos los decide int_filas_guard.
drop policy if exists int_filas_read on public.int_filas;
create policy int_filas_read on public.int_filas for select to authenticated
  using (public.int_puede_ver_campus(campus_id));
drop policy if exists int_filas_insert on public.int_filas;
create policy int_filas_insert on public.int_filas for insert to authenticated
  with check (public.int_puede_ver_campus(campus_id));
drop policy if exists int_filas_update on public.int_filas;
create policy int_filas_update on public.int_filas for update to authenticated
  using (public.int_puede_ver_campus(campus_id))
  with check (public.int_puede_ver_campus(campus_id));
drop policy if exists int_filas_delete on public.int_filas;
create policy int_filas_delete on public.int_filas for delete to authenticated
  using (public.int_puede_ver_campus(campus_id));

-- Estados e historial: se leen por campus; se escriben solo con int_cambiar_estado.
drop policy if exists int_envios_read on public.int_envios;
create policy int_envios_read on public.int_envios for select to authenticated
  using (public.int_puede_ver_campus(campus_id));
drop policy if exists int_envios_historial_read on public.int_envios_historial;
create policy int_envios_historial_read on public.int_envios_historial for select to authenticated
  using (public.int_puede_ver_campus(campus_id));
drop policy if exists int_reaperturas_read on public.int_reaperturas;
create policy int_reaperturas_read on public.int_reaperturas for select to authenticated
  using (public.int_es_director()
         or (campus_id is null and public.int_es_miembro())
         or (campus_id is not null and public.int_puede_ver_campus(campus_id)));

-- Puente SNIES: solo el Director lee la bitácora (lleva claves de personas).
drop policy if exists int_envios_snies_read on public.int_envios_snies;
create policy int_envios_snies_read on public.int_envios_snies for select to authenticated
  using (public.int_es_director());
drop policy if exists int_envios_snies_filas_read on public.int_envios_snies_filas;
create policy int_envios_snies_filas_read on public.int_envios_snies_filas for select to authenticated
  using (public.int_es_director());

revoke all on public.int_miembros, public.int_conceptos, public.int_libros, public.int_hojas, public.int_columnas,
              public.int_periodos, public.int_ventanas, public.int_filas, public.int_envios, public.int_envios_historial,
              public.int_reaperturas, public.int_plantillas, public.int_plantilla_columnas, public.int_envios_snies,
              public.int_envios_snies_filas
  from anon, public;
grant select, insert, update, delete on public.int_miembros, public.int_conceptos, public.int_libros, public.int_hojas,
  public.int_columnas, public.int_periodos, public.int_ventanas, public.int_filas, public.int_plantillas,
  public.int_plantilla_columnas to authenticated;
grant select on public.int_envios, public.int_envios_historial, public.int_reaperturas, public.int_envios_snies,
  public.int_envios_snies_filas to authenticated;

notify pgrst, 'reload schema';
