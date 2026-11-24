-- =============================================================================
-- 0164 · Programas en Cifras: cada programa trabaja sus archivos y emite el
--        Cuadro Maestro del CNA
--
-- Cada programa académico (en cada campus donde se ofrece) trabaja como en
-- OneDrive: carpetas con archivos que son Tablas o Listas con columnas
-- tipadas. Cada archivo «responde» a un cuadro del CNA o a una plantilla del
-- SNIES uniendo sus columnas (un mapa). Con eso se emite el Cuadro Maestro.
--
--   pc_miembros              quién trabaja en qué programa y campus: director
--                            o coordinador (una fila por programa y campus).
--   pc_dominios              listas cerradas (Menú de los cuadros del CNA y
--                            dominios del SNIES).
--   pc_destinos              los cuadros del CNA (01–09 de Programas, 10 de
--                            Salud) y las plantillas del SNIES a las que un
--                            archivo puede responder.
--   pc_destino_columnas      las columnas de cada destino (clave estable).
--   pc_carpetas              las tres fijas (CNA, SNIES, Trabajo) y las que
--                            cree un programa.
--   pc_archivos              tablas y listas de un programa × campus. Estado:
--                            borrador → listo («Listo para Planeación»).
--   pc_columnas              columnas del archivo (tipo, obligatorio, lista,
--                            solo lectura, fecha posterior a otra).
--   pc_filas                 las filas, datos jsonb {clave de columna: valor}.
--   pc_respuestas            archivo × destino: el mapa
--                            {clave del destino → clave de la columna}.
--   pc_ventanas              ventana de observación del programa × campus
--                            (5, 6, 8 o 10 años hasta un periodo AAAA-01/02).
--   pc_periodos_cerrados     periodos cerrados, siempre en orden.
--   pc_actividad             historial: quién hizo qué y cuándo.
--
-- Quién puede qué (lo hace cumplir la base, no la pantalla):
--   · Director y Coordinador de un programa editan lo de SU programa en SU
--     campus: archivos, columnas, filas, mapas, periodos.
--   · Planeación (profiles.role ≥ 'planeacion', y por tanto la administración
--     de la intranet) ve TODO y no edita nada. Si además es Director o
--     Coordinador de un programa, en ese programa edita como tal.
--   · Cualquier otra persona no ve nada. Anon, tampoco.
--   · Los cuadros estándar del CNA (estructura_bloqueada) no permiten cambiar
--     ni quitar columnas ni borrar el archivo; las columnas con origen de
--     sistema (solo_lectura, p. ej. Warehouse) no se editan.
--   · Editar un archivo listo lo devuelve a borrador. Solo se marca listo sin
--     errores de validación (pc_marcar_listo lo comprueba).
--   · Los periodos se cierran en orden estricto (AAAA-01 antes que AAAA-02,
--     cada año tras el anterior): pc_cerrar_periodo.
--
-- Un borrador conserva lo que la persona escribió aunque tenga errores de
-- tipo (se pintan en rojo y se corrigen); el disparador solo exige la FORMA
-- (pc_validar_forma). La validación completa (tipos, listas, obligatorios y
-- «fin ≥ inicio») corre en pc_errores_archivo y es la que impide marcar listo
-- y cerrar periodos. Espejo en TypeScript: src/modules/programas-en-cifras/lib
-- (validacion.ts, permisos.ts, periodos.ts, destinos.ts).
--
-- Requiere 0002 (current_role, has_role_at_least), 0017/0057/0063/0077
-- (campuses, units, program_campuses) y 0026 (set_updated_at). Idempotente.
-- Todo DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.pc_miembros (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  rol          text not null,
  programa_id  uuid not null references public.units (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint pc_miembros_rol check (rol in ('director', 'coordinador')),
  constraint pc_miembros_unico unique (user_id, programa_id, campus_id)
);

create index if not exists pc_miembros_programa_idx on public.pc_miembros (programa_id, campus_id);

comment on table public.pc_miembros is
  'Programas en Cifras (0164): quién es Director o Coordinador de un programa en un campus. Pertenecer abre el módulo; edita solo ese programa y campus. Planeación no necesita fila: lee todo por su rol global.';

create table if not exists public.pc_dominios (
  id        text primary key,
  nombre    text not null,
  opciones  text[] not null default '{}',
  -- El CNA numera sus listas («1. Doctorado»): al emitir se antepone la posición.
  numerado  boolean not null default false,
  constraint pc_dominios_id check (id ~ '^[a-z][a-z0-9_]{1,60}$')
);

comment on table public.pc_dominios is
  'Programas en Cifras (0164): listas cerradas de los cuadros del CNA (libro «Menú») y del SNIES (reportes/snies/dominios.ts). Espejo: lib/destinos.ts.';

create table if not exists public.pc_destinos (
  id                    text primary key,
  sistema               text not null,
  -- Id de la plantilla SNIES de Reportes («participante», «graduados»…); nulo en el CNA.
  plantilla             text,
  nombre                text not null,
  cuadro                text,
  orden                 integer not null default 0,
  -- Texto de «lo llena el sistema»: el cuadro no tiene archivo del programa.
  automatico            text,
  estructura_bloqueada  boolean not null default false,
  -- Solo programas del área de la salud (cuadro 10).
  solo_salud            boolean not null default false,
  tipo_archivo          text not null default 'tabla',
  carpeta               text not null default 'cna',
  constraint pc_destinos_id check (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint pc_destinos_sistema check (sistema in ('CNA', 'SNIES')),
  constraint pc_destinos_tipo check (tipo_archivo in ('tabla', 'lista')),
  constraint pc_destinos_carpeta check (carpeta in ('cna', 'snies'))
);

comment on table public.pc_destinos is
  'Programas en Cifras (0164): cuadros del CNA (01–09 Programas, 10 Salud) y plantillas del SNIES a las que un archivo puede responder. Espejo: lib/destinos.ts (la semilla se genera desde allí).';

create table if not exists public.pc_destino_columnas (
  id            uuid primary key default gen_random_uuid(),
  destino_id    text not null references public.pc_destinos (id) on delete cascade,
  clave         text not null,
  etiqueta      text not null,
  tipo          text not null default 'texto',
  obligatorio   boolean not null default false,
  dominio_id    text references public.pc_dominios (id) on update cascade on delete set null,
  -- Origen de sistema (p. ej. «Warehouse»): la columna no se edita.
  solo_lectura  text,
  -- Clave de la fecha que esta debe igualar o superar («fin ≥ inicio»).
  posterior_a   text,
  -- Dato personal (documento, nombres): lleva la autorización de datos al emitir.
  personal      boolean not null default false,
  orden         integer not null default 0,
  nota          text not null default '',
  constraint pc_destino_columnas_unica unique (destino_id, clave),
  constraint pc_destino_columnas_clave check (clave ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint pc_destino_columnas_tipo check (tipo in ('texto', 'numero', 'fecha', 'lista', 'porcentaje'))
);

create index if not exists pc_destino_columnas_idx on public.pc_destino_columnas (destino_id, orden);

create table if not exists public.pc_carpetas (
  id           uuid primary key default gen_random_uuid(),
  -- Las fijas llevan clave (cna, snies, trabajo) y ningún programa; las propias, programa y campus.
  clave        text,
  programa_id  uuid references public.units (id) on delete cascade,
  campus_id    uuid references public.campuses (id) on delete cascade,
  nombre       text not null,
  subtitulo    text not null default '',
  orden        integer not null default 0,
  fija         boolean not null default false,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint pc_carpetas_clave_unica unique (clave),
  constraint pc_carpetas_nombre check (char_length(btrim(nombre)) between 1 and 120),
  constraint pc_carpetas_fija check (fija = (programa_id is null) and (programa_id is null) = (campus_id is null) and (not fija or clave is not null))
);

create unique index if not exists pc_carpetas_nombre_unico
  on public.pc_carpetas (programa_id, campus_id, lower(btrim(nombre))) where not fija;

create table if not exists public.pc_archivos (
  id              uuid primary key default gen_random_uuid(),
  programa_id     uuid not null references public.units (id) on delete cascade,
  campus_id       uuid not null references public.campuses (id) on delete cascade,
  carpeta_id      uuid not null references public.pc_carpetas (id) on delete restrict,
  nombre          text not null,
  tipo            text not null default 'tabla',
  estado          text not null default 'borrador',
  -- Estructura fijada por el CNA: ni columnas nuevas, ni cambios, ni borrar el archivo.
  bloqueado       boolean not null default false,
  destino_origen  text references public.pc_destinos (id) on delete restrict,
  listo_en        timestamptz,
  listo_por       uuid references public.profiles (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pc_archivos_nombre check (char_length(btrim(nombre)) between 1 and 120),
  constraint pc_archivos_tipo check (tipo in ('tabla', 'lista')),
  constraint pc_archivos_estado check (estado in ('borrador', 'listo'))
);

create unique index if not exists pc_archivos_nombre_unico
  on public.pc_archivos (programa_id, campus_id, carpeta_id, lower(btrim(nombre)));
-- Un cuadro estándar del CNA tiene un solo archivo por programa y campus.
create unique index if not exists pc_archivos_cuadro_unico
  on public.pc_archivos (programa_id, campus_id, destino_origen) where bloqueado;
create index if not exists pc_archivos_programa_idx on public.pc_archivos (programa_id, campus_id, carpeta_id);

comment on table public.pc_archivos is
  'Programas en Cifras (0164): una tabla o lista de un programa en un campus. estado: borrador | listo. Se escribe con pc_crear_archivo / pc_marcar_listo; editar un archivo listo lo devuelve a borrador.';

create table if not exists public.pc_columnas (
  id            uuid primary key default gen_random_uuid(),
  archivo_id    uuid not null references public.pc_archivos (id) on delete cascade,
  clave         text not null,
  etiqueta      text not null,
  tipo          text not null default 'texto',
  obligatorio   boolean not null default false,
  opciones      text[] not null default '{}',
  solo_lectura  text,
  posterior_a   text,
  personal      boolean not null default false,
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint pc_columnas_clave_unica unique (archivo_id, clave),
  constraint pc_columnas_clave check (clave ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint pc_columnas_etiqueta check (char_length(btrim(etiqueta)) between 1 and 200),
  constraint pc_columnas_tipo check (tipo in ('texto', 'numero', 'fecha', 'lista', 'porcentaje'))
);

create index if not exists pc_columnas_archivo_idx on public.pc_columnas (archivo_id, orden);

create table if not exists public.pc_filas (
  id           uuid primary key default gen_random_uuid(),
  archivo_id   uuid not null references public.pc_archivos (id) on delete cascade,
  -- Copia del programa y campus del archivo (la fija el disparador): permite la RLS sin unir.
  programa_id  uuid not null references public.units (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  datos        jsonb not null default '{}'::jsonb,
  orden        integer not null default 0,
  origen       text not null default 'manual',
  created_by   uuid references public.profiles (id) on delete set null,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pc_filas_datos check (jsonb_typeof(datos) = 'object'),
  constraint pc_filas_origen check (origen in ('manual', 'excel', 'sistema'))
);

comment on table public.pc_filas is
  'Programas en Cifras (0164): filas de un archivo. datos = {clave de columna: valor}. PUEDE CONTENER DATOS PERSONALES (cédula, nombres): cada programa lee solo las suyas; nada para anon.';

create index if not exists pc_filas_archivo_idx on public.pc_filas (archivo_id, orden);
create index if not exists pc_filas_programa_idx on public.pc_filas (programa_id, campus_id);

create table if not exists public.pc_respuestas (
  id          uuid primary key default gen_random_uuid(),
  archivo_id  uuid not null references public.pc_archivos (id) on delete cascade,
  destino_id  text not null references public.pc_destinos (id) on delete cascade,
  -- {clave de la columna del destino: clave de la columna del archivo}
  mapa        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint pc_respuestas_unica unique (archivo_id, destino_id),
  constraint pc_respuestas_mapa check (jsonb_typeof(mapa) = 'object')
);

create index if not exists pc_respuestas_destino_idx on public.pc_respuestas (destino_id);

drop trigger if exists pc_respuestas_set_updated_at on public.pc_respuestas;
create trigger pc_respuestas_set_updated_at before update on public.pc_respuestas
  for each row execute function public.set_updated_at();

create table if not exists public.pc_ventanas (
  programa_id  uuid not null references public.units (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  anios        smallint not null,
  -- Último periodo de la ventana: AAAA-01 o AAAA-02.
  hasta        text not null,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (programa_id, campus_id),
  constraint pc_ventanas_anios check (anios in (5, 6, 8, 10)),
  constraint pc_ventanas_hasta check (hasta ~ '^[0-9]{4}-0[12]$')
);

comment on table public.pc_ventanas is
  'Programas en Cifras (0164): ventana de observación de un programa y campus. Se escribe con pc_definir_ventana().';

create table if not exists public.pc_periodos_cerrados (
  programa_id  uuid not null references public.units (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  codigo       text not null,
  cerrado_en   timestamptz not null default now(),
  cerrado_por  uuid references public.profiles (id) on delete set null,
  primary key (programa_id, campus_id, codigo),
  constraint pc_periodos_cerrados_codigo check (codigo ~ '^[0-9]{4}-0[12]$')
);

comment on table public.pc_periodos_cerrados is
  'Programas en Cifras (0164): periodos cerrados de la ventana. Se escribe con pc_cerrar_periodo() / pc_reabrir_periodo(); siempre en orden.';

create table if not exists public.pc_actividad (
  id           bigint generated always as identity primary key,
  programa_id  uuid not null references public.units (id) on delete cascade,
  campus_id    uuid not null references public.campuses (id) on delete cascade,
  -- Sin llave foránea: el historial sobrevive al archivo borrado (el detalle trae su nombre).
  archivo_id   uuid,
  accion       text not null,
  detalle      jsonb not null default '{}'::jsonb,
  actor        uuid references public.profiles (id) on delete set null,
  en           timestamptz not null default now()
);

create index if not exists pc_actividad_programa_idx on public.pc_actividad (programa_id, campus_id, en desc);
create index if not exists pc_actividad_archivo_idx on public.pc_actividad (archivo_id, en desc);

comment on table public.pc_actividad is
  'Programas en Cifras (0164): historial por programa y campus. Acciones: archivo_creado, archivo_eliminado, estado, estructura, filas, ventana, periodo_cerrado, periodo_reabierto, emision.';

-- -----------------------------------------------------------------------------
-- 2. Catálogo (semilla): dominios, destinos y columnas del CNA y del SNIES.
--    Se genera desde src/modules/programas-en-cifras/lib/destinos.ts.
-- -----------------------------------------------------------------------------

insert into public.pc_dominios (id, nombre, opciones, numerado) values
  ('si_no', 'Sí / No', array['Sí', 'No']::text[], false),
  ('nivel_formacion', 'Nivel de formación', array['Doctorado', 'Maestría', 'Especialización Univ.', 'Profesional Univ.', 'Tecnólogo', 'Técnico Profesional']::text[], true),
  ('reconocimiento_minciencias', 'Reconocimiento MinCiencias', array['Emérito', 'Senior', 'Asociado', 'Junior']::text[], true),
  ('categoria_minciencias', 'Categoría MinCiencias', array['A1', 'A', 'B', 'C', 'Reconocido', 'No aplica']::text[], false),
  ('tipo_contratacion', 'Tipo de contratación', array['Indefinido', 'Fijo >= 10 meses', 'Fijo < 10 meses']::text[], true),
  ('tipo_dedicacion', 'Tipo de dedicación contractual', array['Tiempo completo', 'Medio tiempo', 'Hora cátedra']::text[], true),
  ('tipo_institucion', 'Tipo de institución', array['Universidad', 'Centro de investigación', 'Empresa', 'Gobierno', 'ONG', 'Otros']::text[], true),
  ('ubicacion_institucion', 'Ubicación de la institución', array['Local', 'Regional', 'Nacional', 'Internacional']::text[], true),
  ('fuente_financiacion', 'Fuentes de financiación', array['Interna de la IES', 'Externa nacional', 'Externa internacional']::text[], true),
  ('tipo_movilidad', 'Tipo de movilidad asociada', array['Movilidad entrante presencial', 'Movilidad entrante virtual', 'Movilidad saliente presencial', 'Movilidad saliente virtual', 'No implicó movilidad']::text[], true),
  ('idioma_interaccion', 'Idioma de la interacción', array['Español', 'Inglés', 'Francés', 'Portugués', 'Otro idioma']::text[], true),
  ('resultados_profesores', 'Resultados cooperación (profesores)', array['Docencia / Clases espejo / COIL', 'Evaluación de tesis / proyecto', 'Participación en evento / encuentro', 'Desarrollo de proyecto', 'Actividad de proyección social', 'Otro', 'Ningúno']::text[], true),
  ('resultados_estudiantes', 'Resultados cooperación (estudiantes)', array['Participación en evento / encuentro', 'Participación en proyecto o trabajo de grado', 'Actividad de proyección social', 'Pasantías, intercambios y estancias', 'Práctica académica', 'Participación en clases espejo / COIL', 'Doble titulación', 'Otro', 'Ninguno']::text[], true),
  ('tipo_proyecto', 'Tipo de proyecto', array['Investigación', 'Creación', 'Innovación', 'Proyección social', 'Consultoría', 'Educación contínua']::text[], true),
  ('snies_tipo_documento', 'Tipo de documento', array['Cédula de ciudadanía', 'Documento de identidad extranjera', 'Cédula de extranjería', 'Tarjeta de identidad', 'Pasaporte', 'Certificado de cabildo', 'Permiso por protección temporal (PPT)']::text[], false),
  ('snies_sexo_biologico', 'Sexo biológico', array['Hombre', 'Mujer']::text[], false),
  ('snies_estado_civil', 'Estado civil', array['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Unión libre', 'Religioso(a)', 'Separado(a)']::text[], false),
  ('snies_zona_residencia', 'Zona de residencia', array['Urbana', 'Rural']::text[], false),
  ('snies_si_no', 'Sí / No', array['Sí', 'No']::text[], false),
  ('snies_semestre', 'Semestre', array['Primer semestre', 'Segundo semestre']::text[], false),
  ('snies_estrato', 'Estrato', array['No informa', 'Bajo-bajo (1)', 'Bajo (2)', 'Medio-bajo (3)', 'Medio (4)', 'Medio-alto (5)', 'Alto (6)', 'Sin estrato']::text[], false),
  ('snies_beneficiario_veteranos', 'Beneficiario Ley de Veteranos', array['Veterano', 'Cónyuge o compañero(a) permanente del veterano', 'Hijo(a) de veterano hasta los 25 años', 'Padre o madre del veterano', 'No aplica']::text[], false),
  ('snies_tipo_vinculacion', 'Tipo de vinculación', array['Nuevo', 'Transferencia interna', 'Transferencia externa', 'Transferencia entre seccionales', 'Doble programa', 'Ciclo propedéutico', 'Co-titulación, titulación conjunta o doble titulación', 'Estudiante de articulación', 'Estudiante SPP', 'Opción de grado', 'Semestre de intercambio académico', 'Requisito para convalidar título u homologación']::text[], false),
  ('snies_grupo_etnico', 'Grupo étnico', array['No informa', 'Pueblo indígena', 'Comunidad negra', 'Pueblo Rrom', 'No pertenece']::text[], false),
  ('snies_pueblo_indigena', 'Pueblo indígena', array['No aplica', 'Achagua', 'Amorúa', 'Andoque o andoke', 'Arhuaco (ijka)', 'Awa (cuaiker)', 'Barea', 'Barí (motilón)', 'Betoye', 'Bara', 'Cañamomo', 'Carapana', 'Carijona o karijona', 'Chimila (ette e''neka)', 'Chiricoa', 'Cocama', 'Coconuco', 'Coyaima-Natagaima', 'Pijaos', 'Cubeo o kubeo', 'Cuiba o kuiba', 'Curripaco o kurripaco', 'Desano', 'Dujos', 'Embera catio o katío', 'Embera chami', 'Eperara siapidara', 'Guambiano', 'Guanaca', 'Guane', 'Guyabero', 'Hitnú', 'Hupdu', 'Inga', 'Juhup', 'Kamsa o kamëntsá', 'Kankuamo', 'Kakua', 'Kogui', 'Koreguaje o coreguaje', 'Letuama', 'Macaguaje o makaguaje', 'Nukak (makú)', 'Macuna o makuna (sara)', 'Masiguare', 'Matapí', 'Miraña', 'Mokaná', 'Muinane', 'Muisca', 'Nonuya', 'Ocaina', 'Nasa (paéz)', 'Pastos', 'Piapoco (dzase)', 'Piaroa', 'Piratapuyo', 'Pisamira', 'Puinave', 'Sánha', 'Sikuani', 'Siona', 'Siriano', 'Siripu o tsiripu (mariposo)', 'Taiwano (tajuano)', 'Tanimuka', 'Tariano', 'Tatuyo', 'Tikuna', 'Tororó', 'Tucano (desea) o tukano', 'Tule (kuna)', 'Tuyuka (dojkapuara)', 'U''wa(tunebo)', 'Wanano', 'Wayuu', 'Witoto - huitoto', 'Wiwa (arzario)', 'Waunan (wuanana)', 'Yagua', 'Yanacona', 'Yauna', 'Yukuna', 'Yuko (yukpa)', 'Yurí (carabayo)', 'Yuruti', 'Zenú / senú', 'Quillacingas', 'No informa', 'Otro']::text[], false),
  ('snies_comunidad_negra', 'Comunidad negra', array['No aplica', 'Afrocolombianos', 'Raizales', 'Palenqueros', 'Otras comunidades negras']::text[], false),
  ('snies_persona_discapacidad', '¿Persona con discapacidad?', array['Sí', 'No', 'No informa']::text[], false),
  ('snies_tipo_discapacidad', 'Tipo de discapacidad', array['No aplica', 'Sensorial: sordera profunda', 'Sensorial: hipoacusia', 'Sensorial: ceguera', 'Sensorial: baja visión', 'Sensorial: sordoceguera', 'Intelectual', 'Psicosocial', 'Múltiple', 'Física', 'Sistémica']::text[], false),
  ('snies_capacidad_excepcional', 'Capacidad excepcional', array['No aplica', 'Talento excepcional general', 'Talento excepcional específico']::text[], false)
on conflict (id) do update set nombre = excluded.nombre, opciones = excluded.opciones, numerado = excluded.numerado;

insert into public.pc_destinos (id, sistema, plantilla, nombre, cuadro, orden, automatico, estructura_bloqueada, solo_salud, tipo_archivo, carpeta) values
  ('cna01', 'CNA', null, 'Cuadro 01 · General', '01', 1, null, true, false, 'lista', 'cna'),
  ('cna02', 'CNA', null, 'Cuadro 02 · Estudiantes', '02', 2, 'Lo llena el sistema con Reportes SNIES y el Warehouse; el programa solo confirma la deserción.', true, false, 'tabla', 'cna'),
  ('cna03', 'CNA', null, 'Cuadro 03 · Profesores resumen', '03', 3, 'Lo llena el sistema con la nómina docente del Warehouse.', true, false, 'tabla', 'cna'),
  ('cna04', 'CNA', null, 'Cuadro 04 · Profesores detallado', '04', 4, null, true, false, 'tabla', 'cna'),
  ('cna05', 'CNA', null, 'Cuadro 05 · Interacción de profesores', '05', 5, 'Viene de Internacionalización, ya aprobado por campus.', true, false, 'tabla', 'cna'),
  ('cna06', 'CNA', null, 'Cuadro 06 · Interacción de estudiantes', '06', 6, 'Viene de Internacionalización, ya aprobado por campus.', true, false, 'tabla', 'cna'),
  ('cna07', 'CNA', null, 'Cuadro 07 · Grupos y líneas', '07', 7, null, true, false, 'tabla', 'cna'),
  ('cna08', 'CNA', null, 'Cuadro 08 · Proyectos y productos', '08', 8, null, true, false, 'tabla', 'cna'),
  ('cna09', 'CNA', null, 'Cuadro 09 · Bienestar', '09', 9, null, true, false, 'tabla', 'cna'),
  ('cna10', 'CNA', null, 'Cuadro 10 · Escenarios de práctica clínica', '10', 10, null, true, true, 'tabla', 'cna'),
  ('snies_participante', 'SNIES', 'participante', 'Plantilla Participante', null, 101, null, false, false, 'tabla', 'snies'),
  ('snies_inscritos', 'SNIES', 'inscritos', 'Plantilla Inscritos – Relación de inscritos', null, 102, null, false, false, 'tabla', 'snies'),
  ('snies_inscritos_programa', 'SNIES', 'inscritos_programa', 'Plantilla Inscritos Programa', null, 103, null, false, false, 'tabla', 'snies'),
  ('snies_admitidos', 'SNIES', 'admitidos', 'Plantilla Admitidos', null, 104, null, false, false, 'tabla', 'snies'),
  ('snies_primer_curso', 'SNIES', 'primer_curso', 'Plantilla Estudiantes de primer curso', null, 105, null, false, false, 'tabla', 'snies'),
  ('snies_matriculados', 'SNIES', 'matriculados', 'Plantilla Matriculados', null, 106, null, false, false, 'tabla', 'snies'),
  ('snies_graduados', 'SNIES', 'graduados', 'Plantilla Graduados', null, 107, null, false, false, 'tabla', 'snies')
on conflict (id) do update set sistema = excluded.sistema, plantilla = excluded.plantilla, nombre = excluded.nombre, cuadro = excluded.cuadro, orden = excluded.orden,
  automatico = excluded.automatico, estructura_bloqueada = excluded.estructura_bloqueada, solo_salud = excluded.solo_salud, tipo_archivo = excluded.tipo_archivo, carpeta = excluded.carpeta;

insert into public.pc_destino_columnas (destino_id, clave, etiqueta, tipo, obligatorio, dominio_id, solo_lectura, posterior_a, personal, orden, nota) values
  ('cna01', 'denominacion', 'Denominación del programa', 'texto', true, null, null, null, false, 1, ''),
  ('cna01', 'unidad_academica', 'Unidad académica del programa', 'texto', false, null, null, null, false, 2, ''),
  ('cna01', 'snies_actual', 'Código SNIES actual vigente', 'texto', true, null, null, null, false, 3, ''),
  ('cna01', 'snies_anterior', 'Código SNIES anterior (últimos 8 años)', 'texto', false, null, null, null, false, 4, ''),
  ('cna01', 'registro_unico', '¿Es ofertado en Registro Único?', 'lista', false, 'si_no', null, null, false, 5, ''),
  ('cna01', 'codigo_registro_unico', 'Código Registro Único (si aplica)', 'texto', false, null, null, null, false, 6, ''),
  ('cna01', 'modalidades', '¿En qué modalidades se oferta?', 'texto', false, null, null, null, false, 7, ''),
  ('cna01', 'ciclos_propedeuticos', '¿Es ofertado por Ciclos Propedéuticos?', 'lista', false, 'si_no', null, null, false, 8, ''),
  ('cna01', 'programas_ciclo', 'Códigos SNIES y nombres de los programas vinculados en ciclo propedéutico', 'texto', false, null, null, null, false, 9, ''),
  ('cna01', 'creditos', 'Nº de créditos según plan de estudios vigente', 'numero', true, null, null, null, false, 10, ''),
  ('cna01', 'admitidos_primer_periodo', 'Nº de estudiantes admitidos en el primer periodo', 'numero', false, null, null, null, false, 11, ''),
  ('cna01', 'anio_primera_cohorte', 'Año de la primera cohorte', 'numero', false, null, null, null, false, 12, ''),
  ('cna01', 'duracion_total', 'Duración total del programa, según RC', 'texto', true, null, null, null, false, 13, ''),
  ('cna01', 'periodicidad_admision', 'Periodicidad de admisión', 'texto', false, null, null, null, false, 14, ''),
  ('cna01', 'resolucion_rc_numero', 'Resolución de Registro Calificado · número', 'texto', true, null, null, null, false, 15, ''),
  ('cna01', 'resolucion_rc_fecha', 'Resolución de Registro Calificado · fecha', 'fecha', true, null, null, null, false, 16, ''),
  ('cna01', 'resolucion_acreditacion_numero', 'Resolución de acreditación · número', 'texto', false, null, null, null, false, 17, ''),
  ('cna01', 'resolucion_acreditacion_fecha', 'Resolución de acreditación · fecha', 'fecha', false, null, null, null, false, 18, ''),
  ('cna01', 'resolucion_acreditacion_vigencia', 'Resolución de acreditación · vigencia', 'texto', false, null, null, null, false, 19, ''),
  ('cna01', 'resoluciones_modificacion_rc', 'Resoluciones de modificación del RC (ampliación de lugares de desarrollo)', 'texto', false, null, null, null, false, 20, ''),
  ('cna01', 'promociones_graduados', 'Nº de promociones de graduados', 'numero', false, null, null, null, false, 21, ''),
  ('cna01', 'promociones_ventana', 'Nº de promociones en la ventana de observación', 'numero', false, null, null, null, false, 22, ''),
  ('cna01', 'graduados_total', 'Nº total de graduados', 'numero', false, null, null, null, false, 23, ''),
  ('cna01', 'graduados_ventana', 'Nº de graduados en la ventana de observación', 'numero', false, null, null, null, false, 24, ''),
  ('cna01', 'modificacion_rc_proyectada', 'Modificación del RC proyectada o en trámite', 'texto', false, null, null, null, false, 25, ''),
  ('cna01', 'lugar_desarrollo', 'Lugar de desarrollo según RC', 'texto', false, null, null, null, false, 26, ''),
  ('cna01', 'lugar_fecha_creacion', 'Lugar de desarrollo · fecha de creación', 'fecha', false, null, null, null, false, 27, ''),
  ('cna01', 'lugar_resolucion', 'Lugar de desarrollo · resolución de modificación de RC (No. y fecha)', 'texto', false, null, null, null, false, 28, ''),
  ('cna01', 'fecha_diligenciamiento', 'Fecha de diligenciamiento', 'fecha', true, null, null, null, false, 29, ''),
  ('cna01', 'fecha_autoevaluacion', 'Fecha de autoevaluación', 'fecha', true, null, null, null, false, 30, ''),
  ('cna02', 'anio', 'Año', 'numero', false, null, null, null, false, 1, ''),
  ('cna02', 'periodo', 'Período académico', 'texto', false, null, null, null, false, 2, ''),
  ('cna02', 'inscritos', 'No. de inscritos', 'numero', false, null, null, null, false, 3, ''),
  ('cna02', 'admitidos', 'No. de admitidos', 'numero', false, null, null, null, false, 4, ''),
  ('cna02', 'tasa_selectividad', 'Tasa de selectividad', 'porcentaje', false, null, null, null, false, 5, ''),
  ('cna02', 'matriculados', 'No. de matriculados (totales)', 'numero', false, null, null, null, false, 6, ''),
  ('cna02', 'primer_curso', 'No. de matriculados de primer curso', 'numero', false, null, null, null, false, 7, ''),
  ('cna02', 'tasa_absorcion', 'Tasa de absorción', 'porcentaje', false, null, null, null, false, 8, ''),
  ('cna02', 'desercion', '% deserción al finalizar el programa según la duración en el RC', 'porcentaje', false, null, null, null, false, 9, ''),
  ('cna02', 'graduados', '# total de graduados', 'numero', false, null, null, null, false, 10, ''),
  ('cna02', 'graduados_duracion', '% de graduados al finalizar el programa según la duración en el RC', 'porcentaje', false, null, null, null, false, 11, ''),
  ('cna02', 'graduados_mas1', '% de graduados más un periodo del RC', 'porcentaje', false, null, null, null, false, 12, ''),
  ('cna02', 'graduados_mas2', '% de graduados más dos periodos del RC', 'porcentaje', false, null, null, null, false, 13, ''),
  ('cna02', 'graduados_mas3', '% de graduados más tres periodos del RC', 'porcentaje', false, null, null, null, false, 14, ''),
  ('cna03', 'anio', 'Año', 'numero', false, null, null, null, false, 1, ''),
  ('cna03', 'periodo', 'Período académico', 'texto', false, null, null, null, false, 2, ''),
  ('cna03', 'indef_doctorado_tc', 'Indefinido · Doctorado · TC', 'numero', false, null, null, null, false, 3, ''),
  ('cna03', 'indef_doctorado_mt', 'Indefinido · Doctorado · MT', 'numero', false, null, null, null, false, 4, ''),
  ('cna03', 'indef_maestria_tc', 'Indefinido · Maestría · TC', 'numero', false, null, null, null, false, 5, ''),
  ('cna03', 'indef_maestria_mt', 'Indefinido · Maestría · MT', 'numero', false, null, null, null, false, 6, ''),
  ('cna03', 'indef_especializacion_tc', 'Indefinido · Especialización Univ. · TC', 'numero', false, null, null, null, false, 7, ''),
  ('cna03', 'indef_especializacion_mt', 'Indefinido · Especialización Univ. · MT', 'numero', false, null, null, null, false, 8, ''),
  ('cna03', 'indef_profesional_tc', 'Indefinido · Profesional Univ. · TC', 'numero', false, null, null, null, false, 9, ''),
  ('cna03', 'indef_profesional_mt', 'Indefinido · Profesional Univ. · MT', 'numero', false, null, null, null, false, 10, ''),
  ('cna03', 'indef_tecnologico_tc', 'Indefinido · Tecnológico · TC', 'numero', false, null, null, null, false, 11, ''),
  ('cna03', 'indef_tecnologico_mt', 'Indefinido · Tecnológico · MT', 'numero', false, null, null, null, false, 12, ''),
  ('cna03', 'indef_tecnico_tc', 'Indefinido · Técnico Profesional · TC', 'numero', false, null, null, null, false, 13, ''),
  ('cna03', 'indef_tecnico_mt', 'Indefinido · Técnico Profesional · MT', 'numero', false, null, null, null, false, 14, ''),
  ('cna03', 'indef_total', 'Total con contrato indefinido', 'numero', false, null, null, null, false, 15, ''),
  ('cna03', 'fijo11_doctorado_tc', 'Fijo de 11 meses o más · Doctorado · TC', 'numero', false, null, null, null, false, 16, ''),
  ('cna03', 'fijo11_doctorado_mt', 'Fijo de 11 meses o más · Doctorado · MT', 'numero', false, null, null, null, false, 17, ''),
  ('cna03', 'fijo11_maestria_tc', 'Fijo de 11 meses o más · Maestría · TC', 'numero', false, null, null, null, false, 18, ''),
  ('cna03', 'fijo11_maestria_mt', 'Fijo de 11 meses o más · Maestría · MT', 'numero', false, null, null, null, false, 19, ''),
  ('cna03', 'fijo11_especializacion_tc', 'Fijo de 11 meses o más · Especialización Univ. · TC', 'numero', false, null, null, null, false, 20, ''),
  ('cna03', 'fijo11_especializacion_mt', 'Fijo de 11 meses o más · Especialización Univ. · MT', 'numero', false, null, null, null, false, 21, ''),
  ('cna03', 'fijo11_profesional_tc', 'Fijo de 11 meses o más · Profesional Univ. · TC', 'numero', false, null, null, null, false, 22, ''),
  ('cna03', 'fijo11_profesional_mt', 'Fijo de 11 meses o más · Profesional Univ. · MT', 'numero', false, null, null, null, false, 23, ''),
  ('cna03', 'fijo11_tecnologico_tc', 'Fijo de 11 meses o más · Tecnológico · TC', 'numero', false, null, null, null, false, 24, ''),
  ('cna03', 'fijo11_tecnologico_mt', 'Fijo de 11 meses o más · Tecnológico · MT', 'numero', false, null, null, null, false, 25, ''),
  ('cna03', 'fijo11_tecnico_tc', 'Fijo de 11 meses o más · Técnico Profesional · TC', 'numero', false, null, null, null, false, 26, ''),
  ('cna03', 'fijo11_tecnico_mt', 'Fijo de 11 meses o más · Técnico Profesional · MT', 'numero', false, null, null, null, false, 27, ''),
  ('cna03', 'fijo11_total', 'Total con contrato fijo de 11 meses o más', 'numero', false, null, null, null, false, 28, ''),
  ('cna03', 'posgrado_tc', 'Indefinidos o fijos de 11 meses o más con posgrado · TC', 'numero', false, null, null, null, false, 29, ''),
  ('cna03', 'posgrado_mt', 'Indefinidos o fijos de 11 meses o más con posgrado · MT', 'numero', false, null, null, null, false, 30, ''),
  ('cna03', 'posgrado_doctorado', 'Indefinidos o fijos de 11 meses o más · Doctorado', 'numero', false, null, null, null, false, 31, ''),
  ('cna03', 'posgrado_maestria', 'Indefinidos o fijos de 11 meses o más · Maestría', 'numero', false, null, null, null, false, 32, ''),
  ('cna03', 'fijo10', 'Contratos a término fijo de 10 meses o menos', 'numero', false, null, null, null, false, 33, ''),
  ('cna03', 'hora_catedra', 'Contratos de hora cátedra', 'numero', false, null, null, null, false, 34, ''),
  ('cna03', 'total_profesores', 'Total de profesores del programa', 'numero', false, null, null, null, false, 35, ''),
  ('cna04', 'cedula', 'Cédula / identificación', 'texto', true, null, 'Warehouse', null, true, 1, ''),
  ('cna04', 'nombres', 'Nombres y apellidos del profesor/a', 'texto', true, null, 'Warehouse', null, true, 2, ''),
  ('cna04', 'nivel_formacion', 'Nivel máximo de formación', 'lista', true, 'nivel_formacion', null, null, false, 3, ''),
  ('cna04', 'titulo_maximo', 'Título obtenido en nivel máximo de formación', 'texto', false, null, null, null, false, 4, ''),
  ('cna04', 'pais_titulo', 'País de obtención del título de máximo título', 'texto', false, null, null, null, false, 5, ''),
  ('cna04', 'titulo_pregrado', 'Título obtenido en la formación de pregrado', 'texto', false, null, null, null, false, 6, ''),
  ('cna04', 'categoria_escalafon', 'Categoría en el escalafón vigente de la IES', 'texto', false, null, null, null, false, 7, ''),
  ('cna04', 'enlace_cvlac', 'Enlace Web al CvLAC o, si no tiene, a su ORCID', 'texto', true, null, null, null, false, 8, ''),
  ('cna04', 'enlace_gruplac', 'Enlace al GrupLAC del grupo de investigación principal', 'texto', false, null, null, null, false, 9, ''),
  ('cna04', 'reconocimiento', 'Reconocimiento como investigador en MinCiencias', 'lista', false, 'reconocimiento_minciencias', null, null, false, 10, ''),
  ('cna04', 'unidad_academica', 'Facultad / departamento / unidad académica a la que pertenece', 'texto', false, null, null, null, false, 11, ''),
  ('cna04', 'tipo_contratacion', 'Tipo de contratación', 'lista', false, 'tipo_contratacion', 'Warehouse', null, false, 12, ''),
  ('cna04', 'tipo_dedicacion', 'Tipo de dedicación contractual', 'lista', false, 'tipo_dedicacion', 'Warehouse', null, false, 13, ''),
  ('cna04', 'horas_docencia', 'No. de horas de docencia', 'numero', false, null, 'Warehouse', null, false, 14, ''),
  ('cna04', 'horas_investigacion', 'No. de horas de investigación', 'numero', true, null, null, null, false, 15, ''),
  ('cna04', 'horas_extension', 'No. de horas de extensión / proyección social', 'numero', false, null, null, null, false, 16, ''),
  ('cna04', 'horas_gestion', 'No. de horas de gestión académica', 'numero', false, null, null, null, false, 17, ''),
  ('cna04', 'horas_total', 'No. total de horas / semana en el programa', 'numero', false, null, null, null, false, 18, ''),
  ('cna04', 'lugar_desarrollo', 'Lugar de desarrollo (marque «X»)', 'texto', false, null, null, null, false, 19, ''),
  ('cna04', 'modalidad_presencial', 'Modalidad · Presencial (marque «X»)', 'texto', false, null, null, null, false, 20, ''),
  ('cna04', 'modalidad_virtual', 'Modalidad · Virtual (marque «X»)', 'texto', false, null, null, null, false, 21, ''),
  ('cna04', 'modalidad_distancia', 'Modalidad · A distancia (marque «X»)', 'texto', false, null, null, null, false, 22, ''),
  ('cna04', 'modalidad_dual', 'Modalidad · Dual (marque «X»)', 'texto', false, null, null, null, false, 23, ''),
  ('cna04', 'ciclo_tecnica', 'Ciclo propedéutico · Técnica profesional (marque «X»)', 'texto', false, null, null, null, false, 24, ''),
  ('cna04', 'ciclo_tecnologico', 'Ciclo propedéutico · Tecnológico (marque «X»)', 'texto', false, null, null, null, false, 25, ''),
  ('cna04', 'ciclo_universitario', 'Ciclo propedéutico · Universitario (marque «X»)', 'texto', false, null, null, null, false, 26, ''),
  ('cna05', 'cedula', 'Cédula / identificación', 'texto', false, null, null, null, true, 1, ''),
  ('cna05', 'nombres', 'Nombres y apellidos del profesor/a', 'texto', false, null, null, null, true, 2, ''),
  ('cna05', 'institucion', 'Institución con la que se interactúa o coopera', 'texto', false, null, null, null, false, 3, ''),
  ('cna05', 'tipo_institucion', 'Tipo de institución', 'lista', false, 'tipo_institucion', null, null, false, 4, ''),
  ('cna05', 'ubicacion', 'Ubicación de la institución', 'lista', false, 'ubicacion_institucion', null, null, false, 5, ''),
  ('cna05', 'pais', 'País de la institución', 'texto', false, null, null, null, false, 6, ''),
  ('cna05', 'fecha_inicial', 'Fecha inicial', 'fecha', false, null, null, null, false, 7, ''),
  ('cna05', 'fecha_final', 'Fecha final', 'fecha', false, null, null, 'fecha_inicial', false, 8, ''),
  ('cna05', 'dias', '# de días', 'numero', false, null, null, null, false, 9, ''),
  ('cna05', 'encuentros', '# de encuentros durante el periodo de interacción', 'numero', false, null, null, null, false, 10, ''),
  ('cna05', 'tipo_movilidad', 'Tipo de movilidad asociada', 'lista', false, 'tipo_movilidad', null, null, false, 11, ''),
  ('cna05', 'idioma', 'Idioma de la interacción', 'lista', false, 'idioma_interaccion', null, null, false, 12, ''),
  ('cna05', 'resultados', 'Resultados específicos de la interacción / cooperación', 'lista', false, 'resultados_profesores', null, null, false, 13, ''),
  ('cna06', 'cedula', 'Cédula / identificación', 'texto', false, null, null, null, true, 1, ''),
  ('cna06', 'nombres', 'Nombres y apellidos del/la estudiante', 'texto', false, null, null, null, true, 2, ''),
  ('cna06', 'institucion', 'Institución con la que se interactúa o coopera', 'texto', false, null, null, null, false, 3, ''),
  ('cna06', 'tipo_institucion', 'Tipo de institución', 'lista', false, 'tipo_institucion', null, null, false, 4, ''),
  ('cna06', 'ubicacion', 'Ubicación de la institución', 'lista', false, 'ubicacion_institucion', null, null, false, 5, ''),
  ('cna06', 'pais', 'País de la institución', 'texto', false, null, null, null, false, 6, ''),
  ('cna06', 'fecha_inicial', 'Fecha inicial', 'fecha', false, null, null, null, false, 7, ''),
  ('cna06', 'fecha_final', 'Fecha final', 'fecha', false, null, null, 'fecha_inicial', false, 8, ''),
  ('cna06', 'dias', '# de días', 'numero', false, null, null, null, false, 9, ''),
  ('cna06', 'encuentros', '# de encuentros durante el periodo de interacción', 'numero', false, null, null, null, false, 10, ''),
  ('cna06', 'tipo_movilidad', 'Tipo de movilidad asociada', 'lista', false, 'tipo_movilidad', null, null, false, 11, ''),
  ('cna06', 'idioma', 'Idioma de la interacción', 'lista', false, 'idioma_interaccion', null, null, false, 12, ''),
  ('cna06', 'resultados', 'Resultados específicos de la interacción / cooperación', 'lista', false, 'resultados_estudiantes', null, null, false, 13, ''),
  ('cna07', 'grupo', 'Nombre del grupo de investigación o creación que apoya al programa', 'texto', true, null, null, null, false, 1, ''),
  ('cna07', 'codigo_grupo', 'Código del grupo en MinCiencias', 'texto', true, null, null, null, false, 2, ''),
  ('cna07', 'categoria_737_2015', 'Categoría 737_2015', 'lista', false, 'categoria_minciencias', null, null, false, 3, ''),
  ('cna07', 'categoria_781_2017', 'Categoría 781_2017', 'lista', false, 'categoria_minciencias', null, null, false, 4, ''),
  ('cna07', 'categoria_833_2018', 'Categoría 833_2018', 'lista', false, 'categoria_minciencias', null, null, false, 5, ''),
  ('cna07', 'categoria_894_2021', 'Categoría 894_2021', 'lista', false, 'categoria_minciencias', null, null, false, 6, ''),
  ('cna07', 'categoria_957_2024', 'Categoría 957_2024', 'lista', true, 'categoria_minciencias', null, null, false, 7, ''),
  ('cna07', 'lineas', 'Líneas de investigación', 'texto', false, null, null, null, false, 8, ''),
  ('cna08', 'proyecto', 'Nombre del proyecto de investigación, creación, innovación o proyección social', 'texto', true, null, null, null, false, 1, ''),
  ('cna08', 'tipo_proyecto', 'Tipo de proyecto o actividad', 'lista', true, 'tipo_proyecto', null, null, false, 2, ''),
  ('cna08', 'fuente_financiacion', 'Fuente de financiación principal', 'lista', false, 'fuente_financiacion', null, null, false, 3, ''),
  ('cna08', 'financiador', 'Nombre del financiador', 'texto', false, null, null, null, false, 4, ''),
  ('cna08', 'inicio', 'Inicio', 'fecha', true, null, null, null, false, 5, ''),
  ('cna08', 'fin', 'Fin', 'fecha', true, null, null, 'inicio', false, 6, ''),
  ('cna08', 'n_profesores', '# profesores del programa', 'numero', false, null, null, null, false, 7, ''),
  ('cna08', 'n_estudiantes', '# estudiantes del programa', 'numero', false, null, null, null, false, 8, ''),
  ('cna09', 'estrategia', 'Estrategia, programa o servicio', 'texto', true, null, null, null, false, 1, ''),
  ('cna09', 'anio', 'Año de realización de las actividades', 'numero', true, null, null, null, false, 2, ''),
  ('cna09', 'actividades', '# de actividades realizadas', 'numero', true, null, null, null, false, 3, ''),
  ('cna09', 'estudiantes', '# de estudiantes participantes', 'numero', false, null, null, null, false, 4, ''),
  ('cna09', 'profesores', '# de profesores participantes', 'numero', false, null, null, null, false, 5, ''),
  ('cna09', 'administrativos', '# de administrativos participantes', 'numero', false, null, null, null, false, 6, ''),
  ('cna09', 'lugar_desarrollo', 'Lugar de desarrollo (marque «X»)', 'texto', false, null, null, null, false, 7, ''),
  ('cna10', 'escenario', 'Nombre del escenario de práctica', 'texto', true, null, null, null, false, 1, ''),
  ('cna10', 'reps_prestador', 'Código de prestador en el REPS', 'texto', false, null, null, null, false, 2, ''),
  ('cna10', 'sede', 'Nombre de la sede', 'texto', false, null, null, null, false, 3, ''),
  ('cna10', 'reps_sede', 'Código de prestador (sede) en el REPS', 'texto', false, null, null, null, false, 4, ''),
  ('cna10', 'municipio', 'Municipio', 'texto', false, null, null, null, false, 5, ''),
  ('cna10', 'estudiantes_simultaneos', '# de estudiantes en práctica simultánea', 'numero', false, null, null, null, false, 6, ''),
  ('cna10', 'acreditado', '¿Acreditado?', 'lista', false, 'si_no', null, null, false, 7, ''),
  ('cna10', 'hospital_universitario', '¿Reconocido como hospital universitario?', 'lista', false, 'si_no', null, null, false, 8, ''),
  ('cna10', 'principal', '¿Escenario de práctica principal / base (si aplica)?', 'lista', false, 'si_no', null, null, false, 9, ''),
  ('cna10', 'visitado', '¿Escenario visitado?', 'lista', false, 'si_no', null, null, false, 10, ''),
  ('cna10', 'concepto_favorable_ciths', '¿Escenario con concepto favorable de la CITHS?', 'lista', false, 'si_no', null, null, false, 11, ''),
  ('cna10', 'acuerdo_ciths', 'Número del acuerdo CITHS', 'texto', false, null, null, null, false, 12, ''),
  ('cna10', 'fecha_acuerdo_ciths', 'Fecha del acuerdo CITHS', 'fecha', false, null, null, null, false, 13, ''),
  ('cna10', 'fecha_suscripcion_convenio', 'Fecha de suscripción de convenios', 'fecha', false, null, null, null, false, 14, ''),
  ('cna10', 'fecha_vencimiento_convenio', 'Fecha de vencimiento de convenios', 'fecha', false, null, null, 'fecha_suscripcion_convenio', false, 15, ''),
  ('snies_participante', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 1, ''),
  ('snies_participante', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 2, 'Sin puntos, comas ni apóstrofes.'),
  ('snies_participante', 'fecha_expedicion', 'Fecha de expedición', 'fecha', false, null, null, null, true, 3, 'Opcional. Solo para cédula de ciudadanía.'),
  ('snies_participante', 'primer_nombre', 'Primer nombre', 'texto', true, null, null, null, true, 4, ''),
  ('snies_participante', 'segundo_nombre', 'Segundo nombre', 'texto', false, null, null, null, true, 5, ''),
  ('snies_participante', 'primer_apellido', 'Primer apellido', 'texto', true, null, null, null, true, 6, ''),
  ('snies_participante', 'segundo_apellido', 'Segundo apellido', 'texto', false, null, null, null, true, 7, ''),
  ('snies_participante', 'id_sexo_biologico', 'Sexo biológico', 'lista', true, 'snies_sexo_biologico', null, null, false, 8, 'Como aparece en el documento de identidad.'),
  ('snies_participante', 'id_estado_civil', 'Estado civil', 'lista', true, 'snies_estado_civil', null, null, false, 9, ''),
  ('snies_participante', 'fecha_nacimiento', 'Fecha de nacimiento', 'fecha', true, null, null, null, true, 10, ''),
  ('snies_participante', 'id_pais', 'País de nacimiento', 'texto', true, null, null, null, false, 11, ''),
  ('snies_participante', 'id_municipio', 'Municipio de nacimiento', 'texto', false, null, null, null, false, 12, 'Obligatorio si nació en Colombia; vacío si no.'),
  ('snies_participante', 'telefono_contacto', 'Teléfono', 'texto', false, null, null, null, true, 13, 'Obligatorio para graduados.'),
  ('snies_participante', 'email_personal', 'Correo personal', 'texto', false, null, null, null, true, 14, 'Obligatorio para graduados.'),
  ('snies_participante', 'email_institucional', 'Correo institucional', 'texto', false, null, null, null, true, 15, 'Obligatorio para autoridades.'),
  ('snies_participante', 'direccion_institucional', 'Dirección institucional', 'texto', false, null, null, null, true, 16, 'Obligatoria para autoridades.'),
  ('snies_inscritos', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_inscritos', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_inscritos', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_inscritos', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. No se cruza con Participante.'),
  ('snies_inscritos', 'primer_nombre', 'Primer nombre', 'texto', true, null, null, null, true, 5, ''),
  ('snies_inscritos', 'segundo_nombre', 'Segundo nombre', 'texto', false, null, null, null, true, 6, ''),
  ('snies_inscritos', 'primer_apellido', 'Primer apellido', 'texto', true, null, null, null, true, 7, ''),
  ('snies_inscritos', 'segundo_apellido', 'Segundo apellido', 'texto', false, null, null, null, true, 8, ''),
  ('snies_inscritos', 'id_sexo_biologico', 'Sexo biológico', 'lista', true, 'snies_sexo_biologico', null, null, false, 9, 'Como aparece en el documento de identidad.'),
  ('snies_inscritos_programa', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_inscritos_programa', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_inscritos_programa', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_inscritos_programa', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. Debe estar en la Relación de inscritos.'),
  ('snies_inscritos_programa', 'pro_consecutivo', 'Programa', 'texto', true, null, null, null, false, 5, ''),
  ('snies_inscritos_programa', 'id_municipio', 'Sede', 'texto', true, null, null, null, false, 6, 'Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.'),
  ('snies_admitidos', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_admitidos', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_admitidos', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_admitidos', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. Debe estar inscrito al programa.'),
  ('snies_admitidos', 'pro_consecutivo', 'Programa', 'texto', true, null, null, null, false, 5, ''),
  ('snies_admitidos', 'id_municipio_programa', 'Sede', 'texto', true, null, null, null, false, 6, 'Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.'),
  ('snies_admitidos', 'telefono_contacto', 'Teléfono', 'texto', false, null, null, null, true, 7, 'Obligatorio solo para IES públicas de Generación E.'),
  ('snies_admitidos', 'email_personal', 'Correo personal', 'texto', false, null, null, null, true, 8, 'Obligatorio solo para IES públicas de Generación E.'),
  ('snies_admitidos', 'fecha_nacimiento', 'Fecha de nacimiento', 'fecha', false, null, null, null, true, 9, 'Obligatoria solo para IES públicas de Generación E.'),
  ('snies_admitidos', 'id_estrato', 'Estrato', 'lista', false, 'snies_estrato', null, null, false, 10, 'Obligatorio solo para IES públicas (Matrícula Cero).'),
  ('snies_admitidos', 'id_beneficiario_ley_veteranos', 'Beneficiario Ley de Veteranos', 'lista', true, 'snies_beneficiario_veteranos', null, null, false, 11, 'Ley 1979 de 2019. «No aplica» si no es veterano ni familiar de uno.'),
  ('snies_primer_curso', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_primer_curso', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_primer_curso', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_primer_curso', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. Debe estar en Participante.'),
  ('snies_primer_curso', 'pro_consecutivo', 'Programa', 'texto', true, null, null, null, false, 5, ''),
  ('snies_primer_curso', 'id_municipio_programa', 'Sede', 'texto', true, null, null, null, false, 6, 'Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.'),
  ('snies_primer_curso', 'id_tipo_vinculacion', 'Tipo de vinculación', 'lista', true, 'snies_tipo_vinculacion', null, null, false, 7, 'Nuevo, transferencia externa, articulación y SPP deben estar inscritos y admitidos.'),
  ('snies_primer_curso', 'id_grupo_etnico', 'Grupo étnico', 'lista', true, 'snies_grupo_etnico', null, null, false, 8, ''),
  ('snies_primer_curso', 'id_pueblo_indigena', 'Pueblo indígena', 'lista', true, 'snies_pueblo_indigena', null, null, false, 9, '«No aplica» si el grupo étnico no es «Pueblo indígena».'),
  ('snies_primer_curso', 'id_comunidad_negra', 'Comunidad negra', 'lista', true, 'snies_comunidad_negra', null, null, false, 10, '«No aplica» si el grupo étnico no es «Comunidad negra».'),
  ('snies_primer_curso', 'persona_con_discapacidad', '¿Persona con discapacidad?', 'lista', true, 'snies_persona_discapacidad', null, null, false, 11, ''),
  ('snies_primer_curso', 'id_tipo_discapacidad', 'Tipo de discapacidad', 'lista', true, 'snies_tipo_discapacidad', null, null, false, 12, '«No aplica» si no declaró discapacidad o no informa.'),
  ('snies_primer_curso', 'id_capacidad_excepcional', 'Capacidad excepcional', 'lista', true, 'snies_capacidad_excepcional', null, null, false, 13, ''),
  ('snies_primer_curso', 'cod_prueba_saber_11', 'Código Saber 11', 'texto', false, null, null, null, false, 14, 'Obligatorio solo en pregrado tecnológico y universitario.'),
  ('snies_matriculados', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_matriculados', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_matriculados', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_matriculados', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. Debe estar ya en Participante.'),
  ('snies_matriculados', 'codigo_estudiante', 'Código de estudiante', 'texto', true, null, null, null, false, 5, 'El código interno; si no hay, el mismo número de documento.'),
  ('snies_matriculados', 'pro_consecutivo', 'Programa', 'texto', true, null, null, null, false, 6, ''),
  ('snies_matriculados', 'id_municipio', 'Sede', 'texto', true, null, null, null, false, 7, 'Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.'),
  ('snies_matriculados', 'fecha_nacimiento', 'Fecha de nacimiento', 'fecha', false, null, null, null, true, 8, 'Opcional: si se llena, reemplaza la de Participante.'),
  ('snies_matriculados', 'id_pais_nacimiento', 'País de nacimiento', 'texto', false, null, null, null, true, 9, 'Opcional: si se llena, reemplaza el de Participante.'),
  ('snies_matriculados', 'id_municipio_nacimiento', 'Municipio de nacimiento', 'texto', false, null, null, null, true, 10, 'Solo para nacidos en Colombia. Opcional.'),
  ('snies_matriculados', 'id_zona_residencia', 'Zona de residencia', 'lista', true, 'snies_zona_residencia', null, null, false, 11, ''),
  ('snies_matriculados', 'es_reintegro_estudiante_antes_de_1998', '¿Reintegro de antes de 1998?', 'lista', true, 'snies_si_no', null, null, false, 12, '«Sí» solo si ingresó a la educación superior antes de 1998 y no tiene registro SNIES desde entonces.'),
  ('snies_matriculados', 'anio_primer_curso', 'Año de primer curso', 'numero', false, null, null, null, false, 13, 'Solo si es reintegro de antes de 1998.'),
  ('snies_matriculados', 'semestre_primer_curso', 'Semestre de primer curso', 'lista', false, 'snies_semestre', null, null, false, 14, 'Solo si es reintegro de antes de 1998.'),
  ('snies_matriculados', 'valor_derechos_matricula', 'Valor de la matrícula', 'numero', false, null, null, null, false, 15, 'Obligatorio solo para IES públicas; la UDES puede dejarlo vacío.'),
  ('snies_matriculados', 'telefono_contacto', 'Teléfono', 'texto', false, null, null, null, true, 16, 'Obligatorio solo para IES públicas.'),
  ('snies_matriculados', 'email_personal', 'Correo personal', 'texto', false, null, null, null, true, 17, 'Obligatorio solo para IES públicas.'),
  ('snies_graduados', 'anio', 'Año', 'numero', true, null, null, null, false, 1, ''),
  ('snies_graduados', 'semestre', 'Semestre', 'lista', true, 'snies_semestre', null, null, false, 2, ''),
  ('snies_graduados', 'id_tipo_documento', 'Tipo de documento', 'lista', true, 'snies_tipo_documento', null, null, true, 3, ''),
  ('snies_graduados', 'num_documento', 'Número de documento', 'texto', true, null, null, null, true, 4, 'Sin puntos, comas ni apóstrofes. Debe estar en Participante y en Matriculados.'),
  ('snies_graduados', 'pro_consecutivo', 'Programa', 'texto', true, null, null, null, false, 5, ''),
  ('snies_graduados', 'id_municipio', 'Sede', 'texto', true, null, null, null, false, 6, 'Municipio de la sede donde se ofrece el programa; al exportar sale su código DIVIPOLA.'),
  ('snies_graduados', 'email_personal', 'Correo personal', 'texto', false, null, null, null, true, 7, 'Obligatorio si no está registrado en Participante.'),
  ('snies_graduados', 'telefono_contacto', 'Teléfono', 'texto', false, null, null, null, true, 8, 'Mínimo 7 dígitos. Obligatorio si no está registrado en Participante.'),
  ('snies_graduados', 'spn_saber_pro', 'Código Saber Pro / T&T', 'texto', false, null, null, null, false, 9, 'El código de presentación que asigna el ICFES (Saber Pro o Saber T&T).'),
  ('snies_graduados', 'numero_acta_grado', 'Número del acta de grado', 'texto', true, null, null, null, false, 10, ''),
  ('snies_graduados', 'fecha_grado', 'Fecha de grado', 'fecha', true, null, null, null, false, 11, 'La del acta o el diploma; dentro del semestre que se reporta.'),
  ('snies_graduados', 'num_folio', 'Número de folio', 'texto', true, null, null, null, false, 12, '')
on conflict (destino_id, clave) do update set etiqueta = excluded.etiqueta, tipo = excluded.tipo, obligatorio = excluded.obligatorio, dominio_id = excluded.dominio_id,
  solo_lectura = excluded.solo_lectura, posterior_a = excluded.posterior_a, personal = excluded.personal, orden = excluded.orden, nota = excluded.nota;


-- Las tres carpetas fijas.
insert into public.pc_carpetas (clave, nombre, subtitulo, orden, fija) values
  ('cna', 'Cuadro Maestro CNA', 'Cuadros que pide el CNA', 1, true),
  ('snies', 'Reportes SNIES', 'Plantillas del Ministerio', 2, true),
  ('trabajo', 'Trabajo del programa', 'Tablas y listas propias', 3, true)
on conflict (clave) do update set nombre = excluded.nombre, subtitulo = excluded.subtitulo, orden = excluded.orden;

-- -----------------------------------------------------------------------------
-- 3. Funciones de permiso (security definer: leen sin pasar por RLS)
-- -----------------------------------------------------------------------------

/** ¿Es del rol de Planeación (o la administración)? Lee todo, no edita nada. */
create or replace function public.pc_es_planeacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null and public.has_role_at_least('planeacion');
$$;

/**
 * Papel frente a un programa y campus: director | coordinador (editan),
 * planeacion (solo lee) o nulo. Pertenecer gana sobre el rol global.
 */
create or replace function public.pc_rol_en(p_programa uuid, p_campus uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() is null then null
    when exists (select 1 from public.pc_miembros m
                  where m.user_id = auth.uid() and m.programa_id = p_programa and m.campus_id = p_campus
                    and m.rol = 'director') then 'director'
    when exists (select 1 from public.pc_miembros m
                  where m.user_id = auth.uid() and m.programa_id = p_programa and m.campus_id = p_campus
                    and m.rol = 'coordinador') then 'coordinador'
    when public.has_role_at_least('planeacion') then 'planeacion'
    else null
  end;
$$;

create or replace function public.pc_puede_ver(p_programa uuid, p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pc_rol_en(p_programa, p_campus) is not null;
$$;

create or replace function public.pc_puede_editar(p_programa uuid, p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.pc_rol_en(p_programa, p_campus) in ('director', 'coordinador'), false);
$$;

/** ¿Trabaja en el módulo (algún programa) o es de Planeación? Abre el catálogo y las carpetas fijas. */
create or replace function public.pc_es_participante()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() is not null
     and (public.has_role_at_least('planeacion')
          or exists (select 1 from public.pc_miembros m where m.user_id = auth.uid()));
$$;

/** Papel frente al programa y campus de un archivo. */
create or replace function public.pc_rol_en_archivo(p_archivo uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.pc_rol_en(a.programa_id, a.campus_id) from public.pc_archivos a where a.id = p_archivo;
$$;

/** ¿Una función interna está escribiendo (crear archivo, marcar listo…)? Permite lo que el cliente solo hace por RPC. */
create or replace function public.pc_interno()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('pc.interno', true), '') = 'si';
$$;

/**
 * Mis papeles, para la pantalla: {planeacion, programas: [{programa_id, campus_id,
 * rol, programa, programa_codigo, campus}]}. Quien es Director o Coordinador ve
 * sus parejas; Planeación ve todas las que ofrece program_campuses.
 */
create or replace function public.pc_yo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'planeacion', public.pc_es_planeacion(),
    'programas', coalesce((
      select jsonb_agg(t.x order by t.x ->> 'programa', t.x ->> 'campus')
        from (
          select jsonb_build_object(
                   'programa_id', u.id, 'campus_id', c.id, 'rol', coalesce(m.rol, 'planeacion'),
                   'programa', u.name, 'programa_codigo', u.code, 'campus', c.name) as x
            from public.units u
            cross join public.campuses c
            left join public.pc_miembros m
              on m.programa_id = u.id and m.campus_id = c.id and m.user_id = auth.uid()
           where u.kind = 'programa'
             and public.current_role() is not null
             and (m.id is not null
                  or (public.has_role_at_least('planeacion')
                      and exists (select 1 from public.program_campuses p
                                   where p.program_id = u.id and p.campus_id = c.id and p.active)))
        ) t), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Validación (espejo de lib/validacion.ts)
-- -----------------------------------------------------------------------------

/** Texto → fecha, o nulo si no es una fecha AAAA-MM-DD que exista. */
create or replace function public.pc_fecha(v text)
returns date
language plpgsql
immutable
as $$
begin
  if v is null or btrim(v) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return btrim(v)::date;
exception when others then
  return null;
end;
$$;

/**
 * Lo que está mal en un valor, o nulo si está bien. Mismos mensajes que
 * errorDeValor (lib/validacion.ts). Un número es 0 o más; un porcentaje, de 0 a 100.
 */
create or replace function public.pc_error_valor(p_tipo text, p_opciones text[], p_obligatorio boolean, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  n numeric;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    v := '';
  elsif jsonb_typeof(p_valor) in ('string', 'number') then
    v := btrim(p_valor #>> '{}');
  else
    return 'Valor no válido';
  end if;
  if v = '' then
    return case when p_obligatorio then 'Obligatorio' else null end;
  end if;
  if p_tipo = 'numero' then
    if v !~ '^[0-9]+([.,][0-9]+)?$' then
      return 'Escriba un número';
    end if;
  elsif p_tipo = 'porcentaje' then
    if v !~ '^[0-9]+([.,][0-9]+)?$' then
      return 'Entre 0 y 100';
    end if;
    n := replace(v, ',', '.')::numeric;
    if n > 100 then
      return 'Entre 0 y 100';
    end if;
  elsif p_tipo = 'fecha' then
    if public.pc_fecha(v) is null then
      return 'Use AAAA-MM-DD';
    end if;
  elsif p_tipo = 'lista' then
    if cardinality(p_opciones) > 0 and not (v = any (p_opciones)) then
      return 'Elija de la lista';
    end if;
  end if;
  return null;
end;
$$;

/**
 * La FORMA de los datos de una fila, que se exige siempre al guardar: objeto,
 * columnas que existen, valores de texto o número (o vacíos) y texto de hasta
 * 4000 caracteres. Nulo si está bien. Los tipos, las listas, los obligatorios y
 * «fin ≥ inicio» se revisan en pc_errores_archivo (no impiden guardar un borrador).
 */
create or replace function public.pc_validar_forma(p_archivo uuid, p_datos jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par record;
  v_col public.pc_columnas;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    return 'Los datos de la fila deben ser un objeto.';
  end if;
  for v_par in select key, value from jsonb_each(p_datos) loop
    select * into v_col from public.pc_columnas c where c.archivo_id = p_archivo and c.clave = v_par.key;
    if not found then
      return format('La columna «%s» no existe en este archivo.', v_par.key);
    end if;
    if jsonb_typeof(v_par.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_par.value) not in ('string', 'number') then
      return format('«%s»: el valor debe ser texto o número.', v_col.etiqueta);
    end if;
    if char_length(v_par.value #>> '{}') > 4000 then
      return format('«%s»: el texto es demasiado largo (máximo 4000 caracteres).', v_col.etiqueta);
    end if;
  end loop;
  return null;
end;
$$;

/** Interna, sin permisos: los errores de validación de un archivo (celda por celda). */
create or replace function public.pc_errores_internos(p_archivo uuid)
returns table (fila_id uuid, orden integer, clave text, mensaje text)
language sql
stable
security definer
set search_path = public
as $$
  select x.fila_id, x.orden, x.clave, x.mensaje
    from (
      select f.id as fila_id, f.orden, c.clave,
             coalesce(
               public.pc_error_valor(c.tipo, c.opciones, c.obligatorio, f.datos -> c.clave),
               case when c.tipo = 'fecha' and c.posterior_a is not null
                         and public.pc_fecha(f.datos ->> c.clave) is not null
                         and public.pc_fecha(f.datos ->> c.posterior_a) is not null
                         and public.pc_fecha(f.datos ->> c.clave) < public.pc_fecha(f.datos ->> c.posterior_a)
                    then 'Es anterior a «' || coalesce((select p.etiqueta from public.pc_columnas p
                                                          where p.archivo_id = c.archivo_id and p.clave = c.posterior_a), c.posterior_a) || '»'
               end) as mensaje
        from public.pc_filas f
        join public.pc_columnas c on c.archivo_id = f.archivo_id
       where f.archivo_id = p_archivo and c.solo_lectura is null
    ) x
   where x.mensaje is not null
   order by x.orden, x.clave;
$$;

/** Los errores de validación de un archivo, para pintar las celdas. Solo si se puede ver el archivo. */
create or replace function public.pc_errores_archivo(p_archivo uuid)
returns table (fila_id uuid, orden integer, clave text, mensaje text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.pc_archivos a where a.id = p_archivo and public.pc_puede_ver(a.programa_id, a.campus_id)) then
    raise exception 'No tiene acceso a este archivo.' using errcode = '42501';
  end if;
  return query select e.fila_id, e.orden, e.clave, e.mensaje from public.pc_errores_internos(p_archivo) e;
end;
$$;

/** Filas y celdas con error de cada archivo de un programa y campus (el explorador). */
create or replace function public.pc_resumen_archivos(p_programa uuid, p_campus uuid)
returns table (archivo_id uuid, filas bigint, errores bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.pc_puede_ver(p_programa, p_campus) then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  return query
    select a.id,
           (select count(*) from public.pc_filas f where f.archivo_id = a.id),
           (select count(*) from public.pc_errores_internos(a.id))
      from public.pc_archivos a
     where a.programa_id = p_programa and a.campus_id = p_campus;
end;
$$;

/** Conserva en `nuevo` los valores de las columnas de solo lectura que tenía `viejo` (el cliente no los escribe). */
create or replace function public.pc_conservar_ro(p_archivo uuid, p_viejo jsonb, p_nuevo jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select (p_nuevo - coalesce((select array_agg(c.clave) from public.pc_columnas c where c.archivo_id = p_archivo and c.solo_lectura is not null), '{}'::text[]))
         || coalesce((select jsonb_object_agg(c.clave, p_viejo -> c.clave)
                        from public.pc_columnas c
                       where c.archivo_id = p_archivo and c.solo_lectura is not null and p_viejo ? c.clave), '{}'::jsonb);
$$;

/** Interna: registra en el historial. */
create or replace function public.pc_registrar(p_programa uuid, p_campus uuid, p_archivo uuid, p_accion text, p_detalle jsonb default '{}')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pc_actividad (programa_id, campus_id, archivo_id, accion, detalle, actor)
  values (p_programa, p_campus, p_archivo, p_accion, coalesce(p_detalle, '{}'::jsonb), auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 5. Periodos (espejo de lib/periodos.ts)
-- -----------------------------------------------------------------------------

/** Los códigos de la ventana, del más antiguo al más reciente: 5 años hasta 2025-02 = 2021-01 … 2025-02. */
create or replace function public.pc_codigos_ventana(p_hasta text, p_anios integer)
returns text[]
language plpgsql
immutable
as $$
declare
  v_fin integer;
begin
  if p_hasta is null or p_hasta !~ '^[0-9]{4}-0[12]$' or p_anios is null or p_anios < 1 then
    return '{}'::text[];
  end if;
  v_fin := substr(p_hasta, 1, 4)::integer * 2 + (substr(p_hasta, 7, 1)::integer - 1);
  return array(
    select (i / 2)::text || '-0' || (i % 2 + 1)::text
      from generate_series(v_fin - p_anios * 2 + 1, v_fin) i
     order by i);
end;
$$;

/**
 * Estado de la ventana: {ventana: {anios, hasta} | null, periodos: [{codigo,
 * cerrado, cerrado_en}], siguiente, completa, cerrados, total}.
 */
create or replace function public.pc_estado_periodos(p_programa uuid, p_campus uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vent public.pc_ventanas;
  v_codigos text[];
  v_periodos jsonb;
  v_cerrados integer;
  v_sig text;
begin
  if not public.pc_puede_ver(p_programa, p_campus) then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  select * into v_vent from public.pc_ventanas v where v.programa_id = p_programa and v.campus_id = p_campus;
  if not found then
    return jsonb_build_object('ventana', null, 'periodos', '[]'::jsonb, 'siguiente', null, 'completa', false, 'cerrados', 0, 'total', 0);
  end if;
  v_codigos := public.pc_codigos_ventana(v_vent.hasta, v_vent.anios);
  select coalesce(jsonb_agg(jsonb_build_object('codigo', per.p, 'cerrado', z.codigo is not null, 'cerrado_en', z.cerrado_en) order by per.ord), '[]'::jsonb),
         count(z.codigo),
         (array_agg(per.p order by per.ord) filter (where z.codigo is null))[1]
    into v_periodos, v_cerrados, v_sig
    from unnest(v_codigos) with ordinality per(p, ord)
    left join public.pc_periodos_cerrados z
      on z.programa_id = p_programa and z.campus_id = p_campus and z.codigo = per.p;
  return jsonb_build_object(
    'ventana', jsonb_build_object('anios', v_vent.anios, 'hasta', v_vent.hasta),
    'periodos', v_periodos,
    'siguiente', v_sig,
    'completa', cardinality(v_codigos) > 0 and v_cerrados = cardinality(v_codigos),
    'cerrados', v_cerrados,
    'total', cardinality(v_codigos));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Disparadores
-- -----------------------------------------------------------------------------

/** Un miembro es de un programa que se ofrece en ese campus. */
create or replace function public.pc_miembros_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.programa_id and u.kind = 'programa') then
    raise exception 'Solo se nombra al Director o Coordinador de un programa.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.program_campuses p where p.program_id = new.programa_id and p.campus_id = new.campus_id) then
    raise exception 'Ese programa no se ofrece en ese campus.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists pc_miembros_guard_trg on public.pc_miembros;
create trigger pc_miembros_guard_trg before insert or update on public.pc_miembros
  for each row execute function public.pc_miembros_guard();

/**
 * Los archivos: solo el Director o Coordinador del programa y campus. El
 * estado solo cambia por pc_marcar_listo (o al editar el archivo); un cuadro
 * del CNA toma su estructura bloqueada del catálogo, no de lo que mande el cliente.
 * Las escrituras sin sesión (clave de servicio, migraciones) y los borrados en
 * cascada pasan.
 */
create or replace function public.pc_archivos_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.pc_archivos;
  v_rol text;
  v_destino public.pc_destinos;
  v_carpeta public.pc_carpetas;
begin
  if tg_op = 'DELETE' then
    v_a := old;
  else
    v_a := new;
  end if;
  if auth.uid() is null then
    return v_a;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  v_rol := public.pc_rol_en(v_a.programa_id, v_a.campus_id);
  if v_rol is null then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: los archivos los edita el programa.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if old.bloqueado and not public.pc_interno() then
      raise exception 'Los archivos de un cuadro del CNA no se eliminan.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if (new.programa_id, new.campus_id, new.destino_origen, new.bloqueado, new.tipo)
       is distinct from (old.programa_id, old.campus_id, old.destino_origen, old.bloqueado, old.tipo) then
      raise exception 'Un archivo no cambia de programa, campus, tipo ni de cuadro de origen.' using errcode = '42501';
    end if;
    if new.estado is distinct from old.estado and not public.pc_interno() then
      raise exception 'El estado cambia con «Marcar como listo», o al editar el archivo.' using errcode = '42501';
    end if;
    if new.carpeta_id is distinct from old.carpeta_id and old.bloqueado then
      raise exception 'Un archivo de un cuadro del CNA no cambia de carpeta.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.carpeta_id is distinct from old.carpeta_id then
    select * into v_carpeta from public.pc_carpetas c where c.id = new.carpeta_id;
    if not found then
      raise exception 'La carpeta no existe.' using errcode = 'P0002';
    end if;
    if not v_carpeta.fija and (v_carpeta.programa_id, v_carpeta.campus_id) is distinct from (new.programa_id, new.campus_id) then
      raise exception 'Esa carpeta es de otro programa o campus.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.destino_origen is not null then
      select * into v_destino from public.pc_destinos d where d.id = new.destino_origen;
      if not found then
        raise exception 'El cuadro o plantilla de origen no existe.' using errcode = 'P0002';
      end if;
      if v_destino.automatico is not null then
        raise exception '% lo llena el sistema: no lleva archivo.', v_destino.nombre using errcode = '23514';
      end if;
      new.bloqueado := v_destino.estructura_bloqueada;
      if new.bloqueado and v_carpeta.clave is distinct from v_destino.carpeta then
        raise exception 'El archivo de un cuadro del CNA va en la carpeta «Cuadro Maestro CNA».' using errcode = '23514';
      end if;
    else
      new.bloqueado := false;
    end if;
    new.estado := 'borrador';
    new.listo_en := null;
    new.listo_por := null;
    new.created_by := auth.uid();
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pc_archivos_guard_trg on public.pc_archivos;
create trigger pc_archivos_guard_trg before insert or update or delete on public.pc_archivos
  for each row execute function public.pc_archivos_guard();

/** Al borrar un archivo queda anotado (con su nombre: el historial sobrevive al archivo). */
create or replace function public.pc_archivos_borrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si el programa o el campus se borran, el historial se va con ellos: no se anota.
  if pg_trigger_depth() <= 1 and auth.uid() is not null
     and exists (select 1 from public.units u where u.id = old.programa_id)
     and exists (select 1 from public.campuses c where c.id = old.campus_id) then
    perform public.pc_registrar(old.programa_id, old.campus_id, null, 'archivo_eliminado',
      jsonb_build_object('archivo', old.id, 'nombre', old.nombre, 'estado', old.estado));
  end if;
  return null;
end;
$$;

drop trigger if exists pc_archivos_borrado_trg on public.pc_archivos;
create trigger pc_archivos_borrado_trg after delete on public.pc_archivos
  for each row execute function public.pc_archivos_borrado();

/** Devuelve archivos a borrador (editar uno listo lo hace) y anota que se tocaron. */
create or replace function public.pc_tocar_archivos(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('pc.interno', true), '');
begin
  perform set_config('pc.interno', 'si', true);
  update public.pc_archivos a
     set estado = 'borrador', listo_en = null, listo_por = null, updated_at = now()
   where a.id = any (p_ids);
  perform set_config('pc.interno', v_prev, true);
end;
$$;

/** Las columnas: solo quien edita el programa; en un cuadro del CNA no se cambian ni se quitan. */
create or replace function public.pc_columnas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.pc_columnas;
  v_a public.pc_archivos;
  v_rol text;
begin
  if tg_op = 'DELETE' then
    v_c := old;
  else
    v_c := new;
  end if;
  if auth.uid() is null then
    return v_c;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into v_a from public.pc_archivos a where a.id = v_c.archivo_id;
  if not found then
    raise exception 'El archivo no existe.' using errcode = 'P0002';
  end if;
  v_rol := public.pc_rol_en(v_a.programa_id, v_a.campus_id);
  if v_rol is null then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: los archivos los edita el programa.' using errcode = '42501';
  end if;
  if v_a.bloqueado and not public.pc_interno() then
    raise exception 'La estructura de este archivo la fija el CNA: no se pueden agregar, cambiar ni quitar columnas.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.archivo_id is distinct from old.archivo_id or new.clave is distinct from old.clave then
      raise exception 'Una columna no cambia de archivo ni de clave.' using errcode = '42501';
    end if;
    if new.solo_lectura is distinct from old.solo_lectura and not public.pc_interno() then
      raise exception 'Solo el sistema marca una columna como de solo lectura.' using errcode = '42501';
    end if;
  elsif new.solo_lectura is not null and not public.pc_interno() then
    raise exception 'Solo el sistema marca una columna como de solo lectura.' using errcode = '42501';
  end if;

  if new.tipo <> 'lista' then
    new.opciones := '{}'::text[];
  end if;
  return new;
end;
$$;

drop trigger if exists pc_columnas_guard_trg on public.pc_columnas;
create trigger pc_columnas_guard_trg before insert or update or delete on public.pc_columnas
  for each row execute function public.pc_columnas_guard();

/**
 * Tras tocar una columna: el archivo vuelve a borrador; y si se quitó una,
 * sus valores salen de las filas y de los mapas (nada queda apuntando a ella).
 */
create or replace function public.pc_columnas_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archivo uuid := case when tg_op = 'DELETE' then old.archivo_id else new.archivo_id end;
begin
  if pg_trigger_depth() > 1 and tg_op = 'DELETE' then
    return null;
  end if;
  -- El archivo ya no existe (se borró y arrastró sus columnas): nada que tocar.
  if not exists (select 1 from public.pc_archivos a where a.id = v_archivo) then
    return null;
  end if;
  perform public.pc_tocar_archivos(array[v_archivo]);
  if tg_op = 'DELETE' then
    update public.pc_filas f set datos = f.datos - old.clave where f.archivo_id = old.archivo_id and f.datos ? old.clave;
    update public.pc_respuestas r
       set mapa = coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(r.mapa) e where e.value #>> '{}' <> old.clave), '{}'::jsonb)
     where r.archivo_id = old.archivo_id and exists (select 1 from jsonb_each(r.mapa) e where e.value #>> '{}' = old.clave);
  end if;
  if not public.pc_interno() and auth.uid() is not null then
    perform public.pc_registrar(
      (select a.programa_id from public.pc_archivos a where a.id = v_archivo),
      (select a.campus_id from public.pc_archivos a where a.id = v_archivo),
      v_archivo, 'estructura',
      jsonb_build_object('operacion', lower(tg_op), 'clave', case when tg_op = 'DELETE' then old.clave else new.clave end));
  end if;
  return null;
end;
$$;

drop trigger if exists pc_columnas_despues_trg on public.pc_columnas;
create trigger pc_columnas_despues_trg after insert or update or delete on public.pc_columnas
  for each row execute function public.pc_columnas_despues();

/**
 * Las filas: solo quien edita el programa; la forma de los datos se revisa
 * en pc_validar_forma, y las columnas de solo lectura no se escriben.
 */
create or replace function public.pc_filas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.pc_filas;
  v_a public.pc_archivos;
  v_rol text;
  v_error text;
  v_ro record;
begin
  if tg_op = 'DELETE' then
    v_f := old;
  else
    v_f := new;
  end if;
  if auth.uid() is null then
    return v_f;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into v_a from public.pc_archivos a where a.id = v_f.archivo_id;
  if not found then
    raise exception 'El archivo no existe.' using errcode = 'P0002';
  end if;
  v_rol := public.pc_rol_en(v_a.programa_id, v_a.campus_id);
  if v_rol is null then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: los archivos los edita el programa.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.archivo_id is distinct from old.archivo_id then
    raise exception 'Una fila no cambia de archivo: bórrela y créela donde va.' using errcode = '42501';
  end if;

  new.programa_id := v_a.programa_id;
  new.campus_id := v_a.campus_id;

  v_error := public.pc_validar_forma(new.archivo_id, new.datos);
  if v_error is not null then
    raise exception '%', v_error using errcode = '23514';
  end if;

  if not public.pc_interno() then
    for v_ro in select c.clave, c.etiqueta, c.solo_lectura from public.pc_columnas c
                 where c.archivo_id = new.archivo_id and c.solo_lectura is not null loop
      if tg_op = 'INSERT' then
        if btrim(coalesce(new.datos ->> v_ro.clave, '')) <> '' then
          raise exception '«%» viene del % y no se edita aquí.', v_ro.etiqueta, v_ro.solo_lectura using errcode = '42501';
        end if;
      elsif (new.datos ->> v_ro.clave) is distinct from (old.datos ->> v_ro.clave) then
        raise exception '«%» viene del % y no se edita aquí.', v_ro.etiqueta, v_ro.solo_lectura using errcode = '42501';
      end if;
    end loop;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pc_filas_guard_trg on public.pc_filas;
create trigger pc_filas_guard_trg before insert or update or delete on public.pc_filas
  for each row execute function public.pc_filas_guard();

-- Tras escribir filas (una sola vez por sentencia): el archivo vuelve a borrador.
create or replace function public.pc_filas_despues_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pc_tocar_archivos(array(select distinct n.archivo_id from nuevas n));
  return null;
end;
$$;

create or replace function public.pc_filas_despues_upd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pc_tocar_archivos(array(select distinct n.archivo_id from nuevas n));
  return null;
end;
$$;

create or replace function public.pc_filas_despues_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pc_tocar_archivos(array(select distinct v.archivo_id from viejas v));
  return null;
end;
$$;

drop trigger if exists pc_filas_despues_ins_trg on public.pc_filas;
create trigger pc_filas_despues_ins_trg after insert on public.pc_filas
  referencing new table as nuevas for each statement execute function public.pc_filas_despues_ins();
drop trigger if exists pc_filas_despues_upd_trg on public.pc_filas;
create trigger pc_filas_despues_upd_trg after update on public.pc_filas
  referencing new table as nuevas for each statement execute function public.pc_filas_despues_upd();
drop trigger if exists pc_filas_despues_del_trg on public.pc_filas;
create trigger pc_filas_despues_del_trg after delete on public.pc_filas
  referencing old table as viejas for each statement execute function public.pc_filas_despues_del();

/**
 * Los mapas: solo quien edita el programa; las claves son columnas del destino
 * y los valores columnas del archivo; un cuadro automático no lleva archivo; no
 * se desconecta el cuadro de origen de un archivo del CNA.
 */
create or replace function public.pc_respuestas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.pc_respuestas;
  v_a public.pc_archivos;
  v_destino public.pc_destinos;
  v_rol text;
  v_par record;
begin
  if tg_op = 'DELETE' then
    v_r := old;
  else
    v_r := new;
  end if;
  if auth.uid() is null then
    return v_r;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select * into v_a from public.pc_archivos a where a.id = v_r.archivo_id;
  if not found then
    raise exception 'El archivo no existe.' using errcode = 'P0002';
  end if;
  v_rol := public.pc_rol_en(v_a.programa_id, v_a.campus_id);
  if v_rol is null then
    raise exception 'No tiene acceso a este programa.' using errcode = '42501';
  end if;
  if v_rol = 'planeacion' then
    raise exception 'Planeación solo observa: los archivos los edita el programa.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if v_a.bloqueado and v_a.destino_origen = old.destino_id and not public.pc_interno() then
      raise exception 'Un archivo de un cuadro del CNA no se desconecta de su cuadro.' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.archivo_id is distinct from old.archivo_id or new.destino_id is distinct from old.destino_id) then
    raise exception 'Un mapa no cambia de archivo ni de destino.' using errcode = '42501';
  end if;

  select * into v_destino from public.pc_destinos d where d.id = new.destino_id;
  if v_destino.automatico is not null then
    raise exception '% lo llena el sistema: ningún archivo lo responde.', v_destino.nombre using errcode = '23514';
  end if;
  for v_par in select key, value from jsonb_each(new.mapa) loop
    if jsonb_typeof(v_par.value) <> 'string' then
      raise exception 'El mapa une columnas por su clave (texto).' using errcode = '23514';
    end if;
    if not exists (select 1 from public.pc_destino_columnas c where c.destino_id = new.destino_id and c.clave = v_par.key) then
      raise exception 'La columna «%» no existe en %.', v_par.key, v_destino.nombre using errcode = '23514';
    end if;
    if not exists (select 1 from public.pc_columnas c where c.archivo_id = new.archivo_id and c.clave = v_par.value #>> '{}') then
      raise exception 'La columna «%» no existe en este archivo.', v_par.value #>> '{}' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists pc_respuestas_guard_trg on public.pc_respuestas;
create trigger pc_respuestas_guard_trg before insert or update or delete on public.pc_respuestas
  for each row execute function public.pc_respuestas_guard();

-- -----------------------------------------------------------------------------
-- 7. RPC
-- -----------------------------------------------------------------------------

/**
 * Crea un archivo con sus columnas, filas y mapas en una sola operación.
 * Con p_destino de un cuadro estándar del CNA (estructura bloqueada) las
 * columnas son las del cuadro y p_columnas se ignora; con una plantilla del
 * SNIES o sin destino, p_columnas = [{clave, etiqueta, tipo, obligatorio,
 * opciones, posterior_a, personal, orden}]. p_filas = [{datos, orden?}].
 * p_mapas = {destino: {clave del destino: clave de la columna}} (además del
 * mapa directo hacia p_destino, que une las columnas que comparten clave).
 */
create or replace function public.pc_crear_archivo(
  p_programa uuid, p_campus uuid, p_carpeta uuid, p_nombre text, p_tipo text default 'tabla',
  p_destino text default null, p_columnas jsonb default '[]', p_filas jsonb default '[]', p_mapas jsonb default '{}'
)
returns public.pc_archivos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('pc.interno', true), '');
  v_archivo public.pc_archivos;
  v_destino public.pc_destinos;
  v_mapa jsonb;
  v_par record;
begin
  if not public.pc_puede_editar(p_programa, p_campus) then
    raise exception 'Solo el Director o el Coordinador del programa crea archivos.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 20000 then
    raise exception 'Las filas deben llegar como una lista de hasta 20.000.' using errcode = '22023';
  end if;
  if p_destino is not null then
    select * into v_destino from public.pc_destinos d where d.id = p_destino;
    if not found then
      raise exception 'El cuadro o plantilla de origen no existe.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.pc_archivos (programa_id, campus_id, carpeta_id, nombre, tipo, destino_origen)
  values (p_programa, p_campus, p_carpeta, btrim(p_nombre),
          case when v_destino.id is not null then v_destino.tipo_archivo else coalesce(p_tipo, 'tabla') end, p_destino)
  returning * into v_archivo;

  -- Solo las columnas se crean con permiso interno (un cuadro del CNA tiene la estructura bloqueada
  -- y marca columnas de solo lectura); las filas pasan por los controles de siempre.
  perform set_config('pc.interno', 'si', true);
  if v_archivo.bloqueado then
    insert into public.pc_columnas (archivo_id, clave, etiqueta, tipo, obligatorio, opciones, solo_lectura, posterior_a, personal, orden)
    select v_archivo.id, dc.clave, dc.etiqueta, dc.tipo, dc.obligatorio,
           coalesce((select d.opciones from public.pc_dominios d where d.id = dc.dominio_id), '{}'::text[]),
           dc.solo_lectura, dc.posterior_a, dc.personal, dc.orden
      from public.pc_destino_columnas dc
     where dc.destino_id = p_destino
     order by dc.orden;
  else
    if p_columnas is null or jsonb_typeof(p_columnas) <> 'array' or jsonb_array_length(p_columnas) = 0 then
      raise exception 'Un archivo necesita al menos una columna.' using errcode = '22023';
    end if;
    insert into public.pc_columnas (archivo_id, clave, etiqueta, tipo, obligatorio, opciones, posterior_a, personal, orden)
    select v_archivo.id, x.clave, x.etiqueta, coalesce(x.tipo, 'texto'), coalesce(x.obligatorio, false), coalesce(x.opciones, '{}'::text[]),
           x.posterior_a, coalesce(x.personal, false), coalesce(x.orden, (row_number() over ())::integer)
      from jsonb_to_recordset(p_columnas) as x(clave text, etiqueta text, tipo text, obligatorio boolean, opciones text[], posterior_a text, personal boolean, orden integer);
  end if;
  perform set_config('pc.interno', v_prev, true);

  if jsonb_array_length(p_filas) > 0 then
    insert into public.pc_filas (archivo_id, programa_id, campus_id, datos, orden, origen)
    select v_archivo.id, p_programa, p_campus, coalesce(x.v -> 'datos', '{}'::jsonb), coalesce((x.v ->> 'orden')::integer, (x.n - 1)::integer), 'excel'
      from jsonb_array_elements(p_filas) with ordinality x(v, n);
  end if;

  -- El mapa directo hacia el destino de origen: las columnas que comparten clave.
  if p_destino is not null then
    select coalesce(jsonb_object_agg(dc.clave, dc.clave), '{}'::jsonb) into v_mapa
      from public.pc_destino_columnas dc
      join public.pc_columnas c on c.archivo_id = v_archivo.id and c.clave = dc.clave
     where dc.destino_id = p_destino;
    insert into public.pc_respuestas (archivo_id, destino_id, mapa) values (v_archivo.id, p_destino, v_mapa);
  end if;
  for v_par in select key, value from jsonb_each(coalesce(p_mapas, '{}'::jsonb)) where key is distinct from p_destino loop
    insert into public.pc_respuestas (archivo_id, destino_id, mapa) values (v_archivo.id, v_par.key, v_par.value);
  end loop;
  if p_destino is not null and p_mapas ? p_destino then
    update public.pc_respuestas r set mapa = r.mapa || (p_mapas -> p_destino) where r.archivo_id = v_archivo.id and r.destino_id = p_destino;
  end if;

  perform public.pc_registrar(p_programa, p_campus, v_archivo.id, 'archivo_creado',
    jsonb_build_object('nombre', v_archivo.nombre, 'destino', p_destino, 'filas', jsonb_array_length(p_filas)));
  select * into v_archivo from public.pc_archivos a where a.id = v_archivo.id;
  return v_archivo;
end;
$$;

/**
 * Guarda filas por lotes: p_filas = [{id?, datos, orden?}]. Con id actualiza
 * (conservando los valores de solo lectura); sin id inserta al final.
 * p_borrar: ids de filas a quitar. p_reemplazar: borra todas antes (recargar
 * un Excel). Devuelve {insertadas, actualizadas, borradas}.
 */
create or replace function public.pc_guardar_filas(
  p_archivo uuid, p_filas jsonb, p_borrar uuid[] default null, p_reemplazar boolean default false, p_origen text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.pc_archivos;
  v_borradas integer := 0;
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_base integer;
begin
  select * into v_a from public.pc_archivos a where a.id = p_archivo;
  if not found then
    raise exception 'El archivo no existe.' using errcode = 'P0002';
  end if;
  if not public.pc_puede_editar(v_a.programa_id, v_a.campus_id) then
    raise exception 'Solo el Director o el Coordinador del programa edita sus archivos.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas deben llegar como una lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 20000 then
    raise exception 'Son % filas: el máximo por carga es 20.000.', jsonb_array_length(p_filas) using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_filas) x(v) where jsonb_typeof(x.v) <> 'object') then
    raise exception 'Cada fila lleva su objeto datos.' using errcode = '22023';
  end if;

  if p_reemplazar then
    delete from public.pc_filas f where f.archivo_id = p_archivo;
    get diagnostics v_borradas = row_count;
  elsif p_borrar is not null and cardinality(p_borrar) > 0 then
    delete from public.pc_filas f where f.archivo_id = p_archivo and f.id = any (p_borrar);
    get diagnostics v_borradas = row_count;
  end if;

  update public.pc_filas f
     set datos = public.pc_conservar_ro(p_archivo, f.datos, coalesce(x.v -> 'datos', '{}'::jsonb)),
         orden = coalesce((x.v ->> 'orden')::integer, f.orden)
    from jsonb_array_elements(p_filas) x(v)
   where nullif(x.v ->> 'id', '') is not null
     and f.id = (x.v ->> 'id')::uuid
     and f.archivo_id = p_archivo;
  get diagnostics v_actualizadas = row_count;

  select coalesce(max(f.orden), -1) + 1 into v_base from public.pc_filas f where f.archivo_id = p_archivo;
  insert into public.pc_filas (archivo_id, programa_id, campus_id, datos, orden, origen)
  select p_archivo, v_a.programa_id, v_a.campus_id, coalesce(x.v -> 'datos', '{}'::jsonb),
         coalesce((x.v ->> 'orden')::integer, v_base + (x.n - 1)::integer),
         case when p_origen = 'excel' then 'excel' else 'manual' end
    from jsonb_array_elements(p_filas) with ordinality x(v, n)
   where nullif(x.v ->> 'id', '') is null;
  get diagnostics v_insertadas = row_count;

  if v_insertadas + v_actualizadas + v_borradas > 0 then
    perform public.pc_registrar(v_a.programa_id, v_a.campus_id, p_archivo, 'filas',
      jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas, 'origen', p_origen));
  end if;
  return jsonb_build_object('insertadas', v_insertadas, 'actualizadas', v_actualizadas, 'borradas', v_borradas);
end;
$$;

/**
 * Marca un archivo como listo («Listo para Planeación») o lo devuelve a
 * borrador. Para marcarlo no puede haber errores de validación: tipos,
 * listas, obligatorios y «fin ≥ inicio» (pc_errores_archivo).
 */
create or replace function public.pc_marcar_listo(p_archivo uuid, p_listo boolean)
returns public.pc_archivos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('pc.interno', true), '');
  v_a public.pc_archivos;
  v_errores integer;
begin
  select * into v_a from public.pc_archivos a where a.id = p_archivo;
  if not found then
    raise exception 'El archivo no existe.' using errcode = 'P0002';
  end if;
  if not public.pc_puede_editar(v_a.programa_id, v_a.campus_id) then
    raise exception 'Solo el Director o el Coordinador del programa marca sus archivos.' using errcode = '42501';
  end if;
  if p_listo then
    select count(*) into v_errores from public.pc_errores_internos(p_archivo);
    if v_errores > 0 then
      raise exception 'El archivo tiene % celda(s) con error: corríjalas antes de marcarlo como listo.', v_errores using errcode = '23514';
    end if;
  end if;
  if (v_a.estado = 'listo') = p_listo then
    return v_a;
  end if;

  perform set_config('pc.interno', 'si', true);
  update public.pc_archivos a
     set estado = case when p_listo then 'listo' else 'borrador' end,
         listo_en = case when p_listo then now() else null end,
         listo_por = case when p_listo then auth.uid() else null end
   where a.id = p_archivo
  returning * into v_a;
  perform set_config('pc.interno', v_prev, true);

  perform public.pc_registrar(v_a.programa_id, v_a.campus_id, p_archivo, 'estado',
    jsonb_build_object('a', v_a.estado, 'nombre', v_a.nombre));
  return v_a;
end;
$$;

/** Fija la ventana de observación (5, 6, 8 o 10 años hasta un periodo). Lo ya cerrado debe seguir siendo el comienzo de la ruta. */
create or replace function public.pc_definir_ventana(p_programa uuid, p_campus uuid, p_anios integer, p_hasta text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigos text[];
  v_cerrados text[];
begin
  if not public.pc_puede_editar(p_programa, p_campus) then
    raise exception 'Solo el Director o el Coordinador del programa define la ventana.' using errcode = '42501';
  end if;
  if p_anios is null or p_anios not in (5, 6, 8, 10) then
    raise exception 'La ventana de observación es de 5, 6, 8 o 10 años.' using errcode = '22023';
  end if;
  if p_hasta is null or p_hasta !~ '^[0-9]{4}-0[12]$' then
    raise exception 'El último periodo se escribe AAAA-01 o AAAA-02.' using errcode = '22023';
  end if;
  v_codigos := public.pc_codigos_ventana(p_hasta, p_anios);
  select coalesce(array_agg(z.codigo order by z.codigo), '{}'::text[]) into v_cerrados
    from public.pc_periodos_cerrados z where z.programa_id = p_programa and z.campus_id = p_campus;
  if v_cerrados <> v_codigos[1:cardinality(v_cerrados)] then
    raise exception 'Hay periodos cerrados que no encajan en la nueva ventana: reabra los últimos o elija otra.' using errcode = '23514';
  end if;

  insert into public.pc_ventanas (programa_id, campus_id, anios, hasta, updated_by)
  values (p_programa, p_campus, p_anios, p_hasta, auth.uid())
  on conflict (programa_id, campus_id) do update set anios = excluded.anios, hasta = excluded.hasta, updated_by = auth.uid(), updated_at = now();

  perform public.pc_registrar(p_programa, p_campus, null, 'ventana', jsonb_build_object('anios', p_anios, 'hasta', p_hasta));
  return public.pc_estado_periodos(p_programa, p_campus);
end;
$$;

/**
 * Cierra un periodo de la ventana. Solo el siguiente en el orden (nunca uno si
 * el anterior sigue abierto), y los archivos del Cuadro Maestro no pueden
 * tener errores de validación.
 */
create or replace function public.pc_cerrar_periodo(p_programa uuid, p_campus uuid, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado jsonb;
  v_errores bigint;
begin
  if not public.pc_puede_editar(p_programa, p_campus) then
    raise exception 'Solo el Director o el Coordinador del programa cierra periodos.' using errcode = '42501';
  end if;
  v_estado := public.pc_estado_periodos(p_programa, p_campus);
  if v_estado -> 'ventana' = 'null'::jsonb then
    raise exception 'Defina primero la ventana de observación.' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_estado -> 'periodos') x(v) where x.v ->> 'codigo' = p_codigo) then
    raise exception 'El periodo % no está en la ventana de observación.', p_codigo using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_estado -> 'periodos') x(v) where x.v ->> 'codigo' = p_codigo and (x.v ->> 'cerrado')::boolean) then
    raise exception 'El periodo % ya está cerrado.', p_codigo using errcode = '23505';
  end if;
  if v_estado ->> 'siguiente' is distinct from p_codigo then
    raise exception 'Hay que cerrar primero el periodo %: se cierran en orden.', v_estado ->> 'siguiente' using errcode = '23514';
  end if;
  select coalesce(sum((select count(*) from public.pc_errores_internos(a.id))), 0) into v_errores
    from public.pc_archivos a join public.pc_carpetas c on c.id = a.carpeta_id
   where a.programa_id = p_programa and a.campus_id = p_campus and c.clave = 'cna';
  if v_errores > 0 then
    raise exception 'Corrija los % errores de los archivos del Cuadro Maestro para cerrar el periodo.', v_errores using errcode = '23514';
  end if;

  insert into public.pc_periodos_cerrados (programa_id, campus_id, codigo, cerrado_por) values (p_programa, p_campus, p_codigo, auth.uid());
  perform public.pc_registrar(p_programa, p_campus, null, 'periodo_cerrado', jsonb_build_object('codigo', p_codigo));
  return public.pc_estado_periodos(p_programa, p_campus);
end;
$$;

/** Reabre el último periodo cerrado (por si se cerró por error). Solo el último, para que la ruta siga en orden. */
create or replace function public.pc_reabrir_periodo(p_programa uuid, p_campus uuid, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultimo text;
begin
  if not public.pc_puede_editar(p_programa, p_campus) then
    raise exception 'Solo el Director o el Coordinador del programa reabre periodos.' using errcode = '42501';
  end if;
  select max(z.codigo) into v_ultimo from public.pc_periodos_cerrados z where z.programa_id = p_programa and z.campus_id = p_campus;
  if v_ultimo is null or v_ultimo <> p_codigo then
    raise exception 'Solo se reabre el último periodo cerrado (%).', coalesce(v_ultimo, 'no hay ninguno') using errcode = '23514';
  end if;
  delete from public.pc_periodos_cerrados z where z.programa_id = p_programa and z.campus_id = p_campus and z.codigo = p_codigo;
  perform public.pc_registrar(p_programa, p_campus, null, 'periodo_reabierto', jsonb_build_object('codigo', p_codigo));
  return public.pc_estado_periodos(p_programa, p_campus);
end;
$$;

/**
 * Deja constancia de que se emitió el Cuadro Maestro. La base comprueba lo que
 * puede: ventana completa y todos los archivos de la carpeta del CNA listos.
 * El resto de las reglas (fecha única, cuadro 04 = cuadro 03, autorización de
 * datos) las valida el cliente al generar (lib/emision-checks.ts).
 */
create or replace function public.pc_registrar_emision(p_programa uuid, p_campus uuid, p_nombre text, p_detalle jsonb default '{}')
returns public.pc_actividad
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado jsonb;
  v_fila public.pc_actividad;
begin
  if not public.pc_puede_editar(p_programa, p_campus) then
    raise exception 'Solo el Director o el Coordinador del programa emite el Cuadro Maestro.' using errcode = '42501';
  end if;
  v_estado := public.pc_estado_periodos(p_programa, p_campus);
  if not coalesce((v_estado ->> 'completa')::boolean, false) then
    raise exception 'La ventana de observación no está completa: cierre todos sus periodos.' using errcode = '23514';
  end if;
  if exists (select 1 from public.pc_archivos a join public.pc_carpetas c on c.id = a.carpeta_id
              where a.programa_id = p_programa and a.campus_id = p_campus and c.clave = 'cna' and a.estado <> 'listo') then
    raise exception 'Hay archivos del Cuadro Maestro que no están listos.' using errcode = '23514';
  end if;
  insert into public.pc_actividad (programa_id, campus_id, accion, detalle, actor)
  values (p_programa, p_campus, 'emision',
          coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('nombre', p_nombre, 'hasta', v_estado -> 'ventana' ->> 'hasta'), auth.uid())
  returning * into v_fila;
  return v_fila;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RLS y permisos
-- -----------------------------------------------------------------------------

alter table public.pc_miembros          enable row level security;
alter table public.pc_dominios          enable row level security;
alter table public.pc_destinos          enable row level security;
alter table public.pc_destino_columnas  enable row level security;
alter table public.pc_carpetas          enable row level security;
alter table public.pc_archivos          enable row level security;
alter table public.pc_columnas          enable row level security;
alter table public.pc_filas             enable row level security;
alter table public.pc_respuestas        enable row level security;
alter table public.pc_ventanas          enable row level security;
alter table public.pc_periodos_cerrados enable row level security;
alter table public.pc_actividad         enable row level security;

-- Miembros: cada quien ve su pertenencia y la del programa que puede ver. La
-- administración nombra a cualquiera; el Director, a los Coordinadores de su programa.
drop policy if exists pc_miembros_read on public.pc_miembros;
create policy pc_miembros_read on public.pc_miembros for select to authenticated
  using (user_id = auth.uid() or public.pc_puede_ver(programa_id, campus_id));
drop policy if exists pc_miembros_write on public.pc_miembros;
create policy pc_miembros_write on public.pc_miembros for all to authenticated
  using (public.has_role_at_least('admin') or (rol = 'coordinador' and public.pc_rol_en(programa_id, campus_id) = 'director'))
  with check (public.has_role_at_least('admin') or (rol = 'coordinador' and public.pc_rol_en(programa_id, campus_id) = 'director'));

-- Catálogo (dominios, destinos y sus columnas): lo leen los participantes; lo escribe la administración.
do $$
declare
  t text;
begin
  foreach t in array array['pc_dominios', 'pc_destinos', 'pc_destino_columnas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pc_es_participante())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role_at_least(''admin'')) with check (public.has_role_at_least(''admin''))',
                   t || '_write', t);
  end loop;
end $$;

-- Carpetas: las fijas las leen los participantes; las propias, quien ve el programa. Las propias las crea quien edita.
drop policy if exists pc_carpetas_read on public.pc_carpetas;
create policy pc_carpetas_read on public.pc_carpetas for select to authenticated
  using ((fija and public.pc_es_participante()) or (not fija and public.pc_puede_ver(programa_id, campus_id)));
drop policy if exists pc_carpetas_insert on public.pc_carpetas;
create policy pc_carpetas_insert on public.pc_carpetas for insert to authenticated
  with check (not fija and public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_carpetas_update on public.pc_carpetas;
create policy pc_carpetas_update on public.pc_carpetas for update to authenticated
  using (not fija and public.pc_puede_editar(programa_id, campus_id))
  with check (not fija and public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_carpetas_delete on public.pc_carpetas;
create policy pc_carpetas_delete on public.pc_carpetas for delete to authenticated
  using (not fija and public.pc_puede_editar(programa_id, campus_id));

-- Archivos y filas: ven los del programa (y Planeación todos); escriben el Director y el Coordinador.
-- El detalle (estado, bloqueo, solo lectura, forma de los datos) lo deciden los disparadores.
drop policy if exists pc_archivos_read on public.pc_archivos;
create policy pc_archivos_read on public.pc_archivos for select to authenticated
  using (public.pc_puede_ver(programa_id, campus_id));
drop policy if exists pc_archivos_insert on public.pc_archivos;
create policy pc_archivos_insert on public.pc_archivos for insert to authenticated
  with check (public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_archivos_update on public.pc_archivos;
create policy pc_archivos_update on public.pc_archivos for update to authenticated
  using (public.pc_puede_editar(programa_id, campus_id))
  with check (public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_archivos_delete on public.pc_archivos;
create policy pc_archivos_delete on public.pc_archivos for delete to authenticated
  using (public.pc_puede_editar(programa_id, campus_id));

drop policy if exists pc_filas_read on public.pc_filas;
create policy pc_filas_read on public.pc_filas for select to authenticated
  using (public.pc_puede_ver(programa_id, campus_id));
drop policy if exists pc_filas_insert on public.pc_filas;
create policy pc_filas_insert on public.pc_filas for insert to authenticated
  with check (public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_filas_update on public.pc_filas;
create policy pc_filas_update on public.pc_filas for update to authenticated
  using (public.pc_puede_editar(programa_id, campus_id))
  with check (public.pc_puede_editar(programa_id, campus_id));
drop policy if exists pc_filas_delete on public.pc_filas;
create policy pc_filas_delete on public.pc_filas for delete to authenticated
  using (public.pc_puede_editar(programa_id, campus_id));

-- Columnas y mapas: por el programa del archivo.
do $$
declare
  t text;
begin
  foreach t in array array['pc_columnas', 'pc_respuestas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pc_rol_en_archivo(archivo_id) is not null)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pc_rol_en_archivo(archivo_id) in (''director'', ''coordinador'')) with check (public.pc_rol_en_archivo(archivo_id) in (''director'', ''coordinador''))',
                   t || '_write', t);
  end loop;
end $$;

-- Ventana, periodos cerrados y actividad: se leen por programa; se escriben solo con las RPC.
drop policy if exists pc_ventanas_read on public.pc_ventanas;
create policy pc_ventanas_read on public.pc_ventanas for select to authenticated
  using (public.pc_puede_ver(programa_id, campus_id));
drop policy if exists pc_periodos_cerrados_read on public.pc_periodos_cerrados;
create policy pc_periodos_cerrados_read on public.pc_periodos_cerrados for select to authenticated
  using (public.pc_puede_ver(programa_id, campus_id));
drop policy if exists pc_actividad_read on public.pc_actividad;
create policy pc_actividad_read on public.pc_actividad for select to authenticated
  using (public.pc_puede_ver(programa_id, campus_id));

revoke all on public.pc_miembros, public.pc_dominios, public.pc_destinos, public.pc_destino_columnas, public.pc_carpetas,
              public.pc_archivos, public.pc_columnas, public.pc_filas, public.pc_respuestas, public.pc_ventanas,
              public.pc_periodos_cerrados, public.pc_actividad
  from anon, public;
grant select, insert, update, delete on public.pc_miembros, public.pc_dominios, public.pc_destinos, public.pc_destino_columnas,
  public.pc_carpetas, public.pc_archivos, public.pc_columnas, public.pc_filas, public.pc_respuestas to authenticated;
grant select on public.pc_ventanas, public.pc_periodos_cerrados, public.pc_actividad to authenticated;

-- Funciones: la pantalla y las políticas llaman a las de permiso y a las RPC;
-- el resto son internas (las usan los disparadores y las RPC, que corren como dueño).
revoke all on function public.pc_es_planeacion() from public, anon;
revoke all on function public.pc_rol_en(uuid, uuid) from public, anon;
revoke all on function public.pc_puede_ver(uuid, uuid) from public, anon;
revoke all on function public.pc_puede_editar(uuid, uuid) from public, anon;
revoke all on function public.pc_es_participante() from public, anon;
revoke all on function public.pc_rol_en_archivo(uuid) from public, anon;
revoke all on function public.pc_yo() from public, anon;
revoke all on function public.pc_errores_archivo(uuid) from public, anon;
revoke all on function public.pc_resumen_archivos(uuid, uuid) from public, anon;
revoke all on function public.pc_estado_periodos(uuid, uuid) from public, anon;
revoke all on function public.pc_crear_archivo(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.pc_guardar_filas(uuid, jsonb, uuid[], boolean, text) from public, anon;
revoke all on function public.pc_marcar_listo(uuid, boolean) from public, anon;
revoke all on function public.pc_definir_ventana(uuid, uuid, integer, text) from public, anon;
revoke all on function public.pc_cerrar_periodo(uuid, uuid, text) from public, anon;
revoke all on function public.pc_reabrir_periodo(uuid, uuid, text) from public, anon;
revoke all on function public.pc_registrar_emision(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.pc_es_planeacion() to authenticated;
grant execute on function public.pc_rol_en(uuid, uuid) to authenticated;
grant execute on function public.pc_puede_ver(uuid, uuid) to authenticated;
grant execute on function public.pc_puede_editar(uuid, uuid) to authenticated;
grant execute on function public.pc_es_participante() to authenticated;
grant execute on function public.pc_rol_en_archivo(uuid) to authenticated;
grant execute on function public.pc_yo() to authenticated;
grant execute on function public.pc_errores_archivo(uuid) to authenticated;
grant execute on function public.pc_resumen_archivos(uuid, uuid) to authenticated;
grant execute on function public.pc_estado_periodos(uuid, uuid) to authenticated;
grant execute on function public.pc_crear_archivo(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.pc_guardar_filas(uuid, jsonb, uuid[], boolean, text) to authenticated;
grant execute on function public.pc_marcar_listo(uuid, boolean) to authenticated;
grant execute on function public.pc_definir_ventana(uuid, uuid, integer, text) to authenticated;
grant execute on function public.pc_cerrar_periodo(uuid, uuid, text) to authenticated;
grant execute on function public.pc_reabrir_periodo(uuid, uuid, text) to authenticated;
grant execute on function public.pc_registrar_emision(uuid, uuid, text, jsonb) to authenticated;
-- Internas: nadie las llama desde la pantalla.
revoke all on function public.pc_registrar(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.pc_errores_internos(uuid) from public, anon, authenticated;
revoke all on function public.pc_validar_forma(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pc_conservar_ro(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pc_tocar_archivos(uuid[]) from public, anon, authenticated;

notify pgrst, 'reload schema';

