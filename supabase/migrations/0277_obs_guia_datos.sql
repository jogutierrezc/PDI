-- =============================================================================
-- PDI · 0277 · Observatorio: guía de datos, origen de cada indicador y ajustes del tablero
--
-- El taller del Observatorio trabajaba con tablas sueltas. El Observatorio de
-- Indicadores de Gestión Académica necesita, además, saber QUÉ indicadores
-- existen, DE DÓNDE sale cada uno y CÓMO se ve el tablero que los muestra:
--
--   obs_indicadores            la guía de datos: un indicador por fila, de un tema
--                              (la dimensión) de un observatorio, con su fuente, su
--                              corte, su estado y su ORIGEN:
--                                foto   nada conectado: la cifra es una foto fija
--                                tabla  una tabla del taller (obs_datasets)
--                                libro  un libro de UDrive (drive_archivos)
--                                viva   una cifra viva del UDES Warehouse
--   obs_indicador_versiones    el historial de cada conexión.
--   obs_tablero_ajustes        por observatorio, vista y pestaña: secciones apagadas
--                              y su orden.
--   obs_tablero_filtros        por observatorio: qué filtros se ofrecen (vicerrectoría,
--                              facultad, programa, sede), responsable y publicación.
--
-- PERMISOS (los de 0231, sin tocar el rol):
--   Ver     lee la guía y los ajustes (obs_ve_taller) y puede interactuar con el
--           tablero, pero no escribe nada.
--   Editar  conecta orígenes (panel Captura) y ajusta el tablero (panel Tableros),
--           lo que exige capacidad de Planeación (obs_puede ya lo comprueba).
--   Un observatorio publicado deja leer su guía y sus ajustes al público; nunca
--   deja escribir.
--
-- Incluye el observatorio «Indicadores de Gestión Académica» (borrador), con sus
-- cuatro líneas (las vicerrectorías), ocho temas (las dimensiones) y 46
-- indicadores. Idempotente. Requiere 0049, 0230, 0231 y set_updated_at().
-- =============================================================================

-- 1. La guía de datos ---------------------------------------------------------------

create table if not exists public.obs_indicadores (
  id               uuid primary key default gen_random_uuid(),
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  tema_slug        text not null references public.obs_topics (slug) on update cascade on delete cascade,
  -- Llave estable para el contrato con el tablero: «<dimensión>.<n>».
  clave            text not null,
  orden            smallint not null default 0,
  nombre           text not null,
  fuente           text not null default '',
  cobertura        text not null default '',
  nivel            text not null default 'programa',
  -- ok: ya se muestra · dato: hay archivo por adaptar · falta: no hay archivo.
  estado           text not null default 'dato',
  hojas            text[] not null default '{}',
  -- Conjunto del Warehouse y libro de UDrive que ya existen para este indicador.
  conjunto_vivo    text,
  libro_existente  text,
  -- Dónde se ve en el tablero (vista y pestaña).
  vista            text,
  vista_pestana    text,
  origen_tipo      text not null default 'foto',
  origen_ref       text,
  origen_version   integer not null default 0,
  origen_nota      text,
  origen_por       uuid,
  origen_en        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint obs_indicadores_clave unique (observatorio_id, clave),
  constraint obs_indicadores_nivel check (nivel in ('programa', 'facultad', 'institucional')),
  constraint obs_indicadores_estado check (estado in ('ok', 'dato', 'falta')),
  constraint obs_indicadores_origen check (origen_tipo in ('foto', 'tabla', 'libro', 'viva')),
  constraint obs_indicadores_origen_ref check ((origen_tipo = 'foto') = (origen_ref is null)),
  constraint obs_indicadores_largos check (
    char_length(btrim(nombre)) between 2 and 200 and char_length(fuente) <= 200 and char_length(cobertura) <= 80
    and char_length(coalesce(origen_nota, '')) <= 300 and char_length(coalesce(origen_ref, '')) <= 200
  )
);

comment on table public.obs_indicadores is
  'Observatorio (0277): la guía de datos. Un indicador por fila, con su fuente, su estado y su origen (foto, tabla, libro o cifra viva).';

create index if not exists obs_indicadores_tema_idx on public.obs_indicadores (observatorio_id, tema_slug, orden);

drop trigger if exists obs_indicadores_set_updated_at on public.obs_indicadores;
create trigger obs_indicadores_set_updated_at before update on public.obs_indicadores
  for each row execute function public.set_updated_at();

create table if not exists public.obs_indicador_versiones (
  id             uuid primary key default gen_random_uuid(),
  indicador_id   uuid not null references public.obs_indicadores (id) on delete cascade,
  version        integer not null,
  texto          text not null,
  por            uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint obs_indicador_versiones_texto check (char_length(texto) between 1 and 300)
);

create index if not exists obs_indicador_versiones_idx on public.obs_indicador_versiones (indicador_id, version desc);

-- 2. Ajustes del tablero ------------------------------------------------------------

create table if not exists public.obs_tablero_ajustes (
  observatorio_id  uuid not null references public.obs_observatorios (id) on delete cascade,
  vista            text not null,
  pestana          text not null default '-',
  apagadas         text[] not null default '{}',
  orden            text[] not null default '{}',
  updated_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  primary key (observatorio_id, vista, pestana),
  constraint obs_tablero_ajustes_forma check (
    vista ~ '^[a-z0-9-]{1,40}$' and pestana ~ '^[a-z0-9-]{1,40}$'
    and coalesce(array_length(apagadas, 1), 0) <= 80 and coalesce(array_length(orden, 1), 0) <= 80
  )
);

create table if not exists public.obs_tablero_filtros (
  observatorio_id  uuid primary key references public.obs_observatorios (id) on delete cascade,
  vicerrectoria    boolean not null default true,
  facultad         boolean not null default true,
  programa         boolean not null default true,
  sede             boolean not null default true,
  responsable      text not null default '',
  publicado_en     timestamptz,
  updated_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  constraint obs_tablero_filtros_responsable check (char_length(responsable) <= 120)
);

comment on table public.obs_tablero_ajustes is 'Observatorio (0277): secciones apagadas y orden por vista y pestaña del tablero.';
comment on table public.obs_tablero_filtros is 'Observatorio (0277): filtros que ofrece el tablero, responsable y fecha de publicación.';

-- 3. Seguridad -----------------------------------------------------------------------

alter table public.obs_indicadores         enable row level security;
alter table public.obs_indicador_versiones enable row level security;
alter table public.obs_tablero_ajustes     enable row level security;
alter table public.obs_tablero_filtros     enable row level security;

-- Leer: quien tiene algún panel del taller en ese observatorio (Ver incluido), o el público si está publicado.
drop policy if exists obs_indicadores_read on public.obs_indicadores;
create policy obs_indicadores_read on public.obs_indicadores for select to anon, authenticated
  using (public.obs_publicado(observatorio_id) or public.obs_ve_taller(observatorio_id));

-- Escribir: Editar en Captura. Ver nunca escribe.
drop policy if exists obs_indicadores_write on public.obs_indicadores;
create policy obs_indicadores_write on public.obs_indicadores for all to authenticated
  using (public.obs_puede('obs_captura', observatorio_id, 'editar'))
  with check (public.obs_puede('obs_captura', observatorio_id, 'editar'));

drop policy if exists obs_indicador_versiones_read on public.obs_indicador_versiones;
create policy obs_indicador_versiones_read on public.obs_indicador_versiones for select to authenticated
  using (exists (select 1 from public.obs_indicadores i where i.id = indicador_id and public.obs_ve_taller(i.observatorio_id)));

-- El historial solo lo escribe obs_indicador_conectar (security definer): ninguna política de escritura.

drop policy if exists obs_tablero_ajustes_read on public.obs_tablero_ajustes;
create policy obs_tablero_ajustes_read on public.obs_tablero_ajustes for select to anon, authenticated
  using (public.obs_publicado(observatorio_id) or public.obs_ve_taller(observatorio_id));

drop policy if exists obs_tablero_ajustes_write on public.obs_tablero_ajustes;
create policy obs_tablero_ajustes_write on public.obs_tablero_ajustes for all to authenticated
  using (public.obs_puede('obs_tableros', observatorio_id, 'editar'))
  with check (public.obs_puede('obs_tableros', observatorio_id, 'editar'));

drop policy if exists obs_tablero_filtros_read on public.obs_tablero_filtros;
create policy obs_tablero_filtros_read on public.obs_tablero_filtros for select to anon, authenticated
  using (public.obs_publicado(observatorio_id) or public.obs_ve_taller(observatorio_id));

drop policy if exists obs_tablero_filtros_write on public.obs_tablero_filtros;
create policy obs_tablero_filtros_write on public.obs_tablero_filtros for all to authenticated
  using (public.obs_puede('obs_tableros', observatorio_id, 'editar'))
  with check (public.obs_puede('obs_tableros', observatorio_id, 'editar'));

grant select on public.obs_indicadores, public.obs_tablero_ajustes, public.obs_tablero_filtros to anon;
grant select, insert, update, delete on public.obs_indicadores, public.obs_tablero_ajustes, public.obs_tablero_filtros to authenticated;
grant select on public.obs_indicador_versiones to authenticated;

-- 4. Conectar y desconectar un origen --------------------------------------------------
-- Una sola puerta, con historial. Comprueba el permiso aquí mismo (Editar en
-- Captura) porque escribe en dos tablas y en una de ellas el cliente no puede.

create or replace function public.obs_indicador_conectar(p_indicador uuid, p_tipo text, p_ref text, p_nota text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obs   uuid;
  v_ver   integer;
  v_texto text;
begin
  select observatorio_id, origen_version into v_obs, v_ver from public.obs_indicadores where id = p_indicador;
  if v_obs is null then
    raise exception 'No existe ese indicador' using errcode = 'P0002';
  end if;
  if not public.obs_puede('obs_captura', v_obs, 'editar') then
    raise exception 'Tu rol no puede conectar datos en este observatorio' using errcode = '42501';
  end if;
  if p_tipo not in ('foto', 'tabla', 'libro', 'viva') then
    raise exception 'Origen no válido' using errcode = '22023';
  end if;
  if p_tipo = 'foto' then
    update public.obs_indicadores
       set origen_tipo = 'foto', origen_ref = null, origen_nota = null, origen_por = auth.uid(), origen_en = now()
     where id = p_indicador;
    insert into public.obs_indicador_versiones (indicador_id, version, texto) values (p_indicador, v_ver, 'Se desconectó el origen: vuelve a ser una foto estática');
    return v_ver;
  end if;
  if p_ref is null or btrim(p_ref) = '' then
    raise exception 'Falta indicar el origen' using errcode = '22023';
  end if;
  v_ver := v_ver + 1;
  v_texto := case p_tipo
    when 'tabla' then 'Conectado a una tabla del taller'
    when 'libro' then 'Conectado a un libro de UDrive'
    else 'Conectado a una cifra viva del Warehouse' end
    || coalesce(': ' || nullif(left(btrim(p_nota), 200), ''), '');
  update public.obs_indicadores
     set origen_tipo = p_tipo, origen_ref = left(btrim(p_ref), 200), origen_nota = nullif(left(btrim(coalesce(p_nota, '')), 300), ''),
         origen_version = v_ver, origen_por = auth.uid(), origen_en = now()
   where id = p_indicador;
  insert into public.obs_indicador_versiones (indicador_id, version, texto) values (p_indicador, v_ver, v_texto);
  return v_ver;
end;
$$;

comment on function public.obs_indicador_conectar(uuid, text, text, text) is
  'Observatorio (0277): conecta (tabla, libro, viva) o desconecta (foto) el origen de un indicador, con historial. Exige Editar en Captura.';

revoke all on function public.obs_indicador_conectar(uuid, text, text, text) from public, anon;
grant execute on function public.obs_indicador_conectar(uuid, text, text, text) to authenticated;

-- 5. El observatorio de Indicadores de Gestión Académica ----------------------------------

-- Seed: el observatorio «Indicadores de Gestión Académica» con sus líneas, temas y guía de datos.
insert into public.obs_observatorios (nombre, slug, descripcion, color, icono, responsable, estado)
select 'Indicadores de Gestión Académica', 'gestion-academica', 'Herramienta de mejoramiento continuo para la toma de decisiones, de la UDES al programa.', 'var(--od-line-1)', 'spark-chart', 'Planeación', 'borrador'
 where not exists (select 1 from public.obs_observatorios where slug = 'gestion-academica');

insert into public.obs_lineas (observatorio_id, nombre, orden, numero)
select o.id, v.nombre, v.orden, v.numero from public.obs_observatorios o,
 (values ('Vicerrectoría de Enseñanza', 0, 1), ('Vicerrectoría Administrativa y Financiera', 1, 2), ('Vicerrectoría de Extensión', 2, 3), ('Vicerrectoría de Investigaciones', 3, 4)) as v(nombre, orden, numero)
 where o.slug = 'gestion-academica'
   and not exists (select 1 from public.obs_lineas l where l.observatorio_id = o.id and l.nombre = v.nombre);

insert into public.obs_topics (slug, template, intro, status, observatorio_id, linea_id, codigo, nombre, resumen, pregunta, fuente, orden)
select v.slug, 'tablero', '', 'borrador', o.id, l.id, v.codigo, v.nombre, v.resumen, v.pregunta, v.fuente, v.orden
  from public.obs_observatorios o
  join (values
   ('iga-calidad', 'CAL', 'Calidad y oferta', 'Programas activos, acreditación y registros calificados', 'Cuántos programas hay, dónde se ofrecen y qué calidad acreditan', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Enseñanza', 0),
   ('iga-estudiantes', 'EST', 'Estudiantes', 'Deserción, Saber Pro, graduados y biblioteca', 'Cómo permanecen, aprenden y se gradúan los estudiantes', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Enseñanza', 1),
   ('iga-profesores', 'PRO', 'Profesores', 'Núcleo profesoral, tipología, evaluación docente e inglés', 'Quién enseña y cómo cumple la tipología profesoral', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Enseñanza', 2),
   ('iga-gestion', 'GES', 'Gestión administrativa', 'Notas por corte y uso de aulas Moodle', 'Qué tan al día está el registro académico', 'Archivos de la Vicerrectoría', 'Vicerrectoría Administrativa y Financiera', 3),
   ('iga-extension', 'EXT', 'Extensión', 'Educación continua y servicios de extensión', 'Qué ofrece la universidad a su entorno', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Extensión', 4),
   ('iga-internacional', 'INT', 'Internacionalización', 'Aulas internacionalizadas y movilidad', 'Con quién se conecta la universidad en el mundo', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Enseñanza', 5),
   ('iga-investigacion', 'INV', 'Investigación', 'Grupos, investigadores, publicaciones y semilleros', 'Qué investiga y publica la universidad', 'Archivos de la Vicerrectoría', 'Vicerrectoría de Investigaciones', 6),
   ('iga-financiero', 'FIN', 'Financiero', 'Punto de equilibrio, viabilidad, ingresos y costos', 'Si los programas se sostienen', 'Archivos de la Vicerrectoría', 'Vicerrectoría Administrativa y Financiera', 7)
  ) as v(slug, codigo, nombre, resumen, pregunta, fuente, linea, orden) on true
  join public.obs_lineas l on l.observatorio_id = o.id and l.nombre = v.linea
 where o.slug = 'gestion-academica'
   and not exists (select 1 from public.obs_topics t where t.slug = v.slug);

insert into public.obs_indicadores (observatorio_id, tema_slug, clave, orden, nombre, fuente, cobertura, nivel, estado, hojas, conjunto_vivo, libro_existente, vista, vista_pestana)
select o.id, v.tema, v.clave, v.orden, v.nombre, v.fuente, v.cobertura, v.nivel, v.estado, v.hojas, nullif(v.vivo, ''), nullif(v.libro, ''), nullif(v.vista, ''), nullif(v.pestana, '')
  from public.obs_observatorios o
  join (values
   ('iga-calidad', 'calidad.0', 0, 'Programas por facultad, nivel y sede', 'Programas activos (6 ago 2026)', 'corte 2026-08', 'programa', 'ok', array['Programas_NIvel']::text[], '', '', 'calidad', ''),
   ('iga-calidad', 'calidad.1', 1, 'Programas con acreditación vigente', 'Programas activos (6 ago 2026)', 'corte 2026-08', 'programa', 'ok', array['Acreditado']::text[], '', '', 'calidad', ''),
   ('iga-calidad', 'calidad.2', 2, 'Vencimiento del registro calificado', 'Programas activos (6 ago 2026)', 'corte 2026-08', 'programa', 'ok', array['Hoja nueva']::text[], '', '', 'calidad', ''),
   ('iga-calidad', 'calidad.3', 3, 'Condiciones iniciales para acreditar', 'Programas activos (6 ago 2026)', 'corte 2026-08', 'programa', 'ok', array['Hoja nueva']::text[], '', '', 'calidad', ''),
   ('iga-calidad', 'calidad.4', 4, 'Estudiantes de primer curso', 'Primer curso (SNIES)', '2007-1 a 2025-1', 'programa', 'ok', array['Cupos']::text[], '', '', 'calidad', ''),
   ('iga-calidad', 'calidad.5', 5, 'Antigüedad y micrositio del programa', 'Programas activos (versión anterior)', 'sin fecha', 'programa', 'dato', array['Micrositio']::text[], '', '', '', ''),
   ('iga-calidad', 'calidad.6', 6, 'Cupos de primer curso proyectados', 'Cupos RC', 'sin fecha', 'programa', 'dato', array['Hoja 3', 'Hoja 4']::text[], '', '', '', ''),
   ('iga-estudiantes', 'estudiantes.0', 0, 'Deserción por periodo', 'Deserción por periodo', '2015-1 a 2024-2', 'programa', 'ok', array['Desercion']::text[], '', '', 'estudiantes', 'permanencia'),
   ('iga-estudiantes', 'estudiantes.1', 1, 'Saber Pro', 'Saber pro', '2016 a 2025', 'programa', 'ok', array['Saber pro']::text[], '', '', 'estudiantes', 'resultados'),
   ('iga-estudiantes', 'estudiantes.2', 2, 'Valor agregado', 'Valor agregado 2019-2021', '2019 a 2021', 'programa', 'ok', array['Valor agregado']::text[], '', '', 'estudiantes', 'resultados'),
   ('iga-estudiantes', 'estudiantes.3', 3, 'Graduados y tiempo de graduación', 'Reporte de graduados UDES', 'hasta 2026', 'programa', 'ok', array['Graduados', 'TG']::text[], 'Graduados (dv_grad)', '', 'estudiantes', 'graduacion'),
   ('iga-estudiantes', 'estudiantes.4', 4, 'Préstamos y usuarios de biblioteca', 'Préstamos biblioteca', '2023-1 a 2026-1', 'programa', 'ok', array['Biblioteca', 'N°_Biblioteca']::text[], '', '', 'estudiantes', 'biblioteca'),
   ('iga-estudiantes', 'estudiantes.5', 5, 'Matriculados', 'Matriculados (tabla dinámica)', 'sin fecha', 'programa', 'dato', array['Matriculados']::text[], 'Estudiantes matriculados (dv_matric)', '', '', ''),
   ('iga-estudiantes', 'estudiantes.6', 6, 'Actualización de recursos bibliográficos', 'Inventario de biblioteca', 'sin fecha', 'programa', 'dato', array['Hoja 1']::text[], '', '', '', ''),
   ('iga-profesores', 'profesores.0', 0, 'Núcleo profesoral por modalidad y nivel', 'Profesores', '2016-1 a 2026-1', 'programa', 'ok', array['Profesores1']::text[], '', '', 'profesores', ''),
   ('iga-profesores', 'profesores.1', 1, 'Cumplimiento de la tipología', 'Tipología', '2024-1 a 2026-2', 'programa', 'ok', array['Tipologia']::text[], 'Cumplimiento de Tipología (nómina en el Warehouse)', '', 'profesores', ''),
   ('iga-profesores', 'profesores.2', 2, 'Evaluación docente', 'Evaluación docente 2025', '2023-1 en adelante', 'programa', 'ok', array['EvalDocente']::text[], '', '', 'profesores', ''),
   ('iga-profesores', 'profesores.3', 3, 'Nivel de inglés del profesorado', 'Bilingüismo profesoral', 'último registro', 'programa', 'ok', array['Bilinguismo']::text[], '', '', 'profesores', ''),
   ('iga-profesores', 'profesores.4', 4, 'Categoría del escalafón', 'Profesores', '2016-1 a 2026-1', 'programa', 'dato', array['Categoria']::text[], '', '', '', ''),
   ('iga-profesores', 'profesores.5', 5, 'Evolución del núcleo profesoral', 'Profesores', '2016-1 a 2026-1', 'programa', 'dato', array['Evolucion profesoral']::text[], '', '', '', ''),
   ('iga-gestion', 'gestion.0', 0, 'Registro de notas en el sistema', 'Cumplimiento notas RC', '2023-1 a 2026-1', 'programa', 'ok', array['Registro_NotasRC']::text[], 'Notas por estudiante, agregadas (dv_notas)', '', 'gestion', 'notas'),
   ('iga-gestion', 'gestion.1', 1, 'Uso de aulas Moodle', 'Usabilidad aula moodle', '2025-1 a 2026-1', 'programa', 'ok', array['Moodle']::text[], '', '', 'gestion', 'resumen'),
   ('iga-gestion', 'gestion.2', 2, 'Resultados de aprendizaje', 'Diagnóstico de resultados de aprendizaje', '2024 y 2025', 'programa', 'dato', array['ResultadoAprend']::text[], '', '', '', ''),
   ('iga-gestion', 'gestion.3', 3, 'Auditoría de profesores', 'Listados de auditoría', '2023-2 a 2025-1', 'programa', 'dato', array['Auditoria2']::text[], '', '', '', ''),
   ('iga-gestion', 'gestion.4', 4, 'Carga académica completa en el Master', 'Sin archivo ubicado', 'sin fecha', 'programa', 'falta', array['Hoja nueva']::text[], '', '', '', ''),
   ('iga-gestion', 'gestion.5', 5, 'Novedades a Talento Humano', 'Sin archivo ubicado', 'sin fecha', 'programa', 'falta', array['Hoja nueva']::text[], '', '', '', ''),
   ('iga-extension', 'extension.0', 0, 'Educación continua', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'ok', array['EDUCON', 'EDUCON_Ingresos']::text[], '', '', 'extension', 'resumen'),
   ('iga-extension', 'extension.1', 1, 'Creación artística y cultural', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'dato', array['Artistica1']::text[], '', '', '', ''),
   ('iga-extension', 'extension.2', 2, 'Desarrollo tecnológico', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'dato', array['Desarrollo tecnologico1']::text[], '', '', '', ''),
   ('iga-extension', 'extension.3', 3, 'Proyección social', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'dato', array['PS', 'PS_Benef']::text[], '', '', '', ''),
   ('iga-extension', 'extension.4', 4, 'Servicios de extensión', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'dato', array['Servicios']::text[], '', '', '', ''),
   ('iga-extension', 'extension.5', 5, 'Graduados y emprendimiento', 'Reporte de graduados', 'sin fecha', 'programa', 'dato', array['Graduados']::text[], '', '', '', ''),
   ('iga-internacional', 'internacional.0', 0, 'Aulas internacionalizadas e intercambios virtuales', 'Reporte de cifras de intercambios virtuales', '2025-1 y 2025-2', 'programa', 'ok', array['Intercambios_Periodo', 'Pais']::text[], '', '', 'internacional', ''),
   ('iga-internacional', 'internacional.1', 1, 'Movilidad internacional, salen y llegan', 'Libro de Internacionalización / Movilidad', '2026-A', 'programa', 'dato', array['Movilidad']::text[], '', 'Internacionalización / Movilidad', '', ''),
   ('iga-internacional', 'internacional.2', 2, 'Movilidad nacional, origen y destino', 'Libro de Internacionalización / Movilidad nacional', '2026-A', 'programa', 'dato', array['Movilidad nacional']::text[], '', 'Internacionalización / Movilidad nacional', '', ''),
   ('iga-investigacion', 'investigacion.0', 0, 'Grupos por categoría', 'Grupos de investigación', 'vigente', 'facultad', 'ok', array['Grupos_invest']::text[], '', '', 'investigacion', ''),
   ('iga-investigacion', 'investigacion.1', 1, 'Investigadores categorizados', 'Investigadores categorizados', 'vigente', 'facultad', 'ok', array['Investigadores']::text[], '', '', 'investigacion', ''),
   ('iga-investigacion', 'investigacion.2', 2, 'Publicaciones por cuartil Scopus', 'Publicaciones consolidado', 'vigente', 'facultad', 'ok', array['Publicaciones']::text[], '', '', 'investigacion', ''),
   ('iga-investigacion', 'investigacion.3', 3, 'Semilleros', 'Semilleros', '2025-1 y 2025-2', 'facultad', 'ok', array['Semilleros']::text[], '', '', 'investigacion', ''),
   ('iga-investigacion', 'investigacion.4', 4, 'Proyectos', 'Proyectos', 'vigente', 'facultad', 'ok', array['Proyectos_invest']::text[], '', '', 'investigacion', ''),
   ('iga-financiero', 'financiero.0', 0, 'Punto de equilibrio por programa', 'Punto de equilibrio', '2025-1', 'programa', 'ok', array['Punto de equilibrio', 'Déficit']::text[], '', '', 'financiero', 'equilibrio'),
   ('iga-financiero', 'financiero.1', 1, 'Viabilidad de programas (porcentajes)', 'Reporte de viabilidad de programas', '2024-1 a 2025-2', 'programa', 'ok', array['Consolidado campus']::text[], '', '', 'financiero', 'viabilidad'),
   ('iga-financiero', 'financiero.2', 2, 'Ingresos, costos y excedentes en pesos', 'Viabilidad por sede', '2024-B y 2025-A', 'programa', 'ok', array['Déficit']::text[], '', '', 'financiero', 'ingresos'),
   ('iga-financiero', 'financiero.3', 3, 'Ingresos por origen (matrícula y otras fuentes)', 'Viabilidad por sede', '2024-B', 'programa', 'dato', array['Hoja nueva']::text[], '', '', '', ''),
   ('iga-financiero', 'financiero.4', 4, 'Rendimientos financieros', 'Sin archivo ubicado', 'sin fecha', 'programa', 'falta', array['Hoja nueva']::text[], '', '', '', ''),
   ('iga-financiero', 'financiero.5', 5, 'Ingresos por educación continua', 'Inventario de cifras de extensión', '2023 y 2024', 'programa', 'ok', array['EDUCON_Ingresos']::text[], '', '', 'extension', 'resumen')
  ) as v(tema, clave, orden, nombre, fuente, cobertura, nivel, estado, hojas, vivo, libro, vista, pestana) on true
 where o.slug = 'gestion-academica'
   and exists (select 1 from public.obs_topics t where t.slug = v.tema)
   and not exists (select 1 from public.obs_indicadores x where x.observatorio_id = o.id and x.clave = v.clave);
