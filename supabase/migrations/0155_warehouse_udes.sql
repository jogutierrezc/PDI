-- =============================================================================
-- 0155 · Warehouse UDES
--
-- El almacén donde se guardan, por periodo, los reportes de las plataformas
-- institucionales Master, Galileo y Davinci, para consultarlos sin volver a
-- pedirlos. Diseño aprobado en la maqueta «Warehouse UDES»; contrato en
-- src/modules/warehouse/README.md.
--
--   wh_periodos    el periodo y si está abierto o cerrado. Un periodo cerrado
--                  protege lo ya guardado: recargarlo exige un motivo.
--   wh_cargas      una carga = un conjunto, un periodo, una sede y (si el
--                  reporte es por corte) un corte. Cada recarga es una versión
--                  nueva; la anterior queda «reemplazada», no se borra.
--   wh_filas       las filas de cada carga, en jsonb: las columnas del Excel con
--                  su nombre normalizado (sin tildes, en minúscula y con _).
--   wh_politicas   QUÉ de cada reporte se guarda. Los reportes traen datos
--                  personales (documento, dirección, salud, contraseñas); la
--                  política va en la base, no en la pantalla: la función que
--                  guarda las filas descarta lo que no se permite y reemplaza
--                  por un seudónimo lo que se debe poder cruzar (el código).
--                  Un conjunto SIN política no se puede guardar.
--   wh_secretos    la sal del seudónimo. Sin políticas: solo la leen funciones
--                  security definer. Con ella el mismo código da el mismo
--                  seudónimo en todas las cargas, y no se puede deshacer.
--
-- Vistas de consulta (security invoker, así rige la RLS de quien pregunta):
--   wh_vigentes        la última versión guardada de cada carga.
--   v_wh_cobertura     qué hay guardado por conjunto, periodo, sede y corte.
--   v_wh_rendimiento   «Rendimiento académico» de Master (por grupo y corte)
--                      con sus columnas ya tipadas.
--
-- Quién puede qué: todo exige la pantalla «warehouse» del rol de acceso y el
-- rol Planeación o superior. Nadie escribe las tablas directamente: se
-- guarda por wh_abrir_carga → wh_agregar_filas → wh_cerrar_carga. Cerrar un
-- periodo lo hace Planeación; reabrirlo, la administración.
--
-- Los archivos originales NO se guardan: los Excel de Davinci y Master traen
-- datos personales y el almacén conserva solo lo que la política permite. Del
-- original queda el manifiesto (nombre, huella SHA-256, columnas, tamaño).
--
-- Requiere 0002 (has_role_at_least), 0024 (has_screen) y pgcrypto (0001).
-- Idempotente. Todo DELETE lleva WHERE (safeupdate, ver 0095).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.wh_periodos (
  periodo     text primary key check (periodo ~ '^[0-9]{4}[ab]$' or periodo = 'permanente'),
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  nota        text not null default '',
  cerrado_en  timestamptz,
  cerrado_por uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.wh_periodos is
  'Warehouse: el periodo y si está abierto o cerrado. «permanente» es para catálogos sin periodo.';

create table if not exists public.wh_cargas (
  id             uuid primary key default gen_random_uuid(),
  conjunto       text not null,
  periodo        text not null references public.wh_periodos (periodo),
  sede           text not null check (sede ~ '^[a-z]{3}$'),
  corte          text not null default '' check (corte in ('', '1', '2', '3', 'f')),
  version        int  not null check (version >= 1),
  estado         text not null default 'en_curso' check (estado in ('en_curso', 'guardada', 'error', 'reemplazada')),
  origen         text not null check (origen in ('servidor', 'archivo')),
  filas          int  not null default 0,
  huella         text not null,
  archivo_nombre text not null default '',
  columnas       jsonb not null default '[]'::jsonb,
  motivo         text not null default '',
  error          text not null default '',
  creada_por     uuid references auth.users (id) on delete set null,
  creada_en      timestamptz not null default now(),
  terminada_en   timestamptz,
  unique (conjunto, periodo, sede, corte, version)
);

comment on table public.wh_cargas is
  'Warehouse: una versión de un conjunto en un periodo, sede y corte. La recarga crea otra versión.';
comment on column public.wh_cargas.huella is 'SHA-256 del archivo recibido: la misma huella no se guarda dos veces.';
comment on column public.wh_cargas.corte is '«» sin corte; 1, 2, 3 o f (definitiva).';

create index if not exists wh_cargas_clave_idx on public.wh_cargas (conjunto, periodo, sede, corte, version desc);

create table if not exists public.wh_filas (
  carga_id uuid not null references public.wh_cargas (id) on delete cascade,
  n        int  not null,
  datos    jsonb not null,
  primary key (carga_id, n)
);

comment on table public.wh_filas is 'Warehouse: las filas de una carga, ya limpiadas por la política de su conjunto.';

create table if not exists public.wh_politicas (
  conjunto      text primary key,
  modo          text not null check (modo in ('permitir', 'excluir')),
  lista         text[] not null default '{}',
  seudonimizar  text[] not null default '{}',
  nota          text not null default ''
);

comment on table public.wh_politicas is
  'Warehouse: qué se guarda de cada conjunto. permitir = solo las columnas de «lista»; excluir = todas menos las de «lista». Lo de «seudonimizar» se guarda como seudónimo.';

create table if not exists public.wh_secretos (
  clave text primary key,
  valor bytea not null
);

comment on table public.wh_secretos is 'Warehouse: la sal de los seudónimos. Sin políticas: solo security definer.';

insert into public.wh_secretos (clave, valor)
values ('sal_seudonimo', gen_random_bytes(32))
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Permiso: pantalla «warehouse» y rol Planeación o superior
-- -----------------------------------------------------------------------------

create or replace function public.wh_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_screen('warehouse') and public.has_role_at_least('planeacion');
$$;

comment on function public.wh_autorizado() is 'Warehouse: ¿puede quien pregunta ver y cargar el almacén?';

alter table public.wh_periodos  enable row level security;
alter table public.wh_cargas    enable row level security;
alter table public.wh_filas     enable row level security;
alter table public.wh_politicas enable row level security;
alter table public.wh_secretos  enable row level security;

drop policy if exists wh_periodos_lectura on public.wh_periodos;
create policy wh_periodos_lectura on public.wh_periodos for select to authenticated using (public.wh_autorizado());

drop policy if exists wh_cargas_lectura on public.wh_cargas;
create policy wh_cargas_lectura on public.wh_cargas for select to authenticated using (public.wh_autorizado());

drop policy if exists wh_filas_lectura on public.wh_filas;
create policy wh_filas_lectura on public.wh_filas for select to authenticated using (public.wh_autorizado());

drop policy if exists wh_politicas_lectura on public.wh_politicas;
create policy wh_politicas_lectura on public.wh_politicas for select to authenticated using (public.wh_autorizado());

-- Sin escritura directa: ni siquiera para Planeación. Se escribe por las funciones.
revoke all on public.wh_periodos, public.wh_cargas, public.wh_filas, public.wh_politicas, public.wh_secretos from anon, authenticated;
grant select on public.wh_periodos, public.wh_cargas, public.wh_filas, public.wh_politicas to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Políticas de privacidad de los conjuntos con columnas conocidas
--
-- Los nombres de columna son los del Excel normalizado: sin tildes, en
-- minúscula, % → pct y todo lo que no sea letra o número → «_». Un conjunto
-- que no está aquí (por ejemplo «dv_global», cuyo encabezado no se capturó, o
-- «ms_doc», que trae contraseñas) no se puede guardar hasta tener su política.
-- -----------------------------------------------------------------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, nota) values
  ('ma_rendimiento', 'excluir', '{}', '{docente}',
   'Grupos por corte: sin datos de estudiantes. El docente se guarda como seudónimo.'),
  ('dv_matric', 'permitir',
   '{codigo,estado,cod,programa,pensum,jornada,ubicacion,promedio_acumulado,cred_aprobados,cred_segun_ubicacion,cred_segun_matricula_financiera,cred_adicionales,creditos_matriculados,creditos_no_matriculados,materias_matriculadas,fecha_matricula,paz_y_salvo,ultimo_poligrafo,promedio_semestre_ultimo_poligrafo}',
   '{codigo}',
   'Se descartan documento, nombres, género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos, correos, colegio, salud y responsable de matrícula.'),
  ('dv_grad', 'permitir',
   '{codigo,programa,fecha_de_grado,ceremonia,modalidad,nota,cum_laude,suma_cum_laude,prueba_saber_pro}',
   '{codigo}',
   'Se descartan documento, nombres, apellidos, acta, folio, diploma, libro y proyecto.'),
  ('dv_homol', 'permitir',
   '{codigo,programa,fecha_fin_registro,fecha_aprobacion,tipo,institucion_de_procedencia,homologaciones}',
   '{codigo}',
   'Se descarta el nombre del estudiante.'),
  ('ms_hordep', 'excluir', '{nombre_docente}', '{id_docente}', 'Se descarta el nombre del docente; su identificación queda como seudónimo.'),
  ('ms_hor', 'excluir', '{}', '{docente}', 'El docente se guarda como seudónimo.'),
  ('ms_audit', 'excluir', '{}', '{docente}', 'El docente se guarda como seudónimo.'),
  ('ms_posg', 'excluir', '{}', '{docente}', 'El docente se guarda como seudónimo.'),
  ('ms_eval', 'permitir',
   '{identificacion,departamento,evaluaciones_aplicadas,resultado_de_evaluacion_de_estudiantes,resultado_de_autoevaluacion,resultado_de_evaluacion_de_pares,resultado_de_evaluacion_de_jefe,promedio_de_los_resultados,clasificacion_del_resultado}',
   '{identificacion}',
   'Se descarta el nombre del docente; su identificación queda como seudónimo.'),
  ('ms_comp', 'excluir', '{docente}', '{identificacion}', 'Se descarta el nombre del docente; su identificación queda como seudónimo.'),
  ('dm_prog', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_dep', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_aula', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_edi', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_cur', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_act', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_con', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_grp', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('dm_per', 'excluir', '{}', '{}', 'Catálogo sin datos personales.'),
  ('gl_eq',  'excluir', '{}', '{}', 'Inventario de equipos, sin datos personales.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar, nota = excluded.nota;

-- -----------------------------------------------------------------------------
-- 4. Limpiar una fila según la política
-- -----------------------------------------------------------------------------

create or replace function public.wh_limpiar_fila(p_fila jsonb, p_modo text, p_lista text[], p_seud text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  salida jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  sal bytea;
begin
  select valor into sal from public.wh_secretos where clave = 'sal_seudonimo';
  for k, v in select * from jsonb_each(coalesce(p_fila, '{}'::jsonb)) loop
    if p_modo = 'permitir' and not (k = any (p_lista)) then
      continue;
    end if;
    if p_modo = 'excluir' and k = any (p_lista) then
      continue;
    end if;
    if k = any (p_seud) and jsonb_typeof(v) <> 'null' and btrim(v #>> '{}') <> '' then
      v := to_jsonb('x-' || substr(encode(hmac(convert_to(btrim(v #>> '{}'), 'UTF8'), sal, 'sha256'), 'hex'), 1, 10));
    end if;
    salida := salida || jsonb_build_object(k, v);
  end loop;
  return salida;
end;
$$;

revoke all on function public.wh_limpiar_fila(jsonb, text, text[], text[]) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Cargar: abrir → agregar filas → cerrar
-- -----------------------------------------------------------------------------

create or replace function public.wh_abrir_carga(
  p_conjunto text,
  p_periodo  text,
  p_sede     text,
  p_corte    text,
  p_huella   text,
  p_origen   text,
  p_archivo  text,
  p_motivo   text
)
returns table (id uuid, version int, duplicada boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte text := coalesce(p_corte, '');
  vigente public.wh_cargas;
  nueva uuid;
  cerrado boolean;
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wh_politicas where conjunto = p_conjunto) then
    raise exception 'sin_politica: el conjunto % no tiene política de privacidad y no se puede guardar', p_conjunto using errcode = 'P0001';
  end if;
  if p_periodo !~ '^[0-9]{4}[ab]$' and p_periodo <> 'permanente' then
    raise exception 'periodo_invalido: %', p_periodo using errcode = 'P0001';
  end if;
  if coalesce(p_huella, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'huella_invalida: se espera el SHA-256 en hexadecimal' using errcode = 'P0001';
  end if;

  insert into public.wh_periodos (periodo) values (p_periodo) on conflict (periodo) do nothing;
  select (estado = 'cerrado') into cerrado from public.wh_periodos where periodo = p_periodo;

  -- Una carga abandonada (más de 30 minutos en curso) se da por fallida.
  update public.wh_cargas c
     set estado = 'error', error = 'abandonada', terminada_en = now()
   where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.corte = v_corte
     and c.estado = 'en_curso' and c.creada_en < now() - interval '30 minutes';
  if exists (select 1 from public.wh_cargas c
              where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.corte = v_corte and c.estado = 'en_curso') then
    raise exception 'carga_en_curso: ya hay una carga de este conjunto en marcha' using errcode = 'P0001';
  end if;

  select * into vigente from public.wh_cargas c
   where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.corte = v_corte and c.estado = 'guardada'
   order by c.version desc limit 1;

  if found and vigente.huella = p_huella then
    return query select vigente.id, vigente.version, true;
    return;
  end if;
  if found and cerrado and length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'periodo_cerrado: el periodo % está cerrado; recargarlo exige un motivo', p_periodo using errcode = 'P0001';
  end if;

  insert into public.wh_cargas (conjunto, periodo, sede, corte, version, origen, huella, archivo_nombre, motivo, creada_por)
  values (
    p_conjunto, p_periodo, p_sede, v_corte,
    coalesce((select max(c.version) from public.wh_cargas c
               where c.conjunto = p_conjunto and c.periodo = p_periodo and c.sede = p_sede and c.corte = v_corte), 0) + 1,
    p_origen, p_huella, coalesce(p_archivo, ''), coalesce(btrim(p_motivo), ''), auth.uid())
  returning wh_cargas.id into nueva;

  return query select c.id, c.version, false from public.wh_cargas c where c.id = nueva;
end;
$$;

create or replace function public.wh_agregar_filas(p_carga uuid, p_inicio int, p_filas jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  carga public.wh_cargas;
  pol public.wh_politicas;
  total int;
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  select * into carga from public.wh_cargas where id = p_carga;
  if not found or carga.estado <> 'en_curso' or carga.creada_por is distinct from auth.uid() then
    raise exception 'carga_no_disponible: la carga no existe, ya terminó o es de otra persona' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'filas_invalidas: se espera una lista' using errcode = 'P0001';
  end if;
  total := jsonb_array_length(p_filas);
  if total > 2000 then
    raise exception 'filas_demasiadas: máximo 2000 por llamada' using errcode = 'P0001';
  end if;
  select * into pol from public.wh_politicas where conjunto = carga.conjunto;

  insert into public.wh_filas (carga_id, n, datos)
  select p_carga, p_inicio + t.ord - 1, public.wh_limpiar_fila(t.fila, pol.modo, pol.lista, pol.seudonimizar)
    from jsonb_array_elements(p_filas) with ordinality as t(fila, ord);
  return total;
end;
$$;

create or replace function public.wh_cerrar_carga(p_carga uuid, p_ok boolean, p_error text, p_columnas jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  carga public.wh_cargas;
  total int;
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  select * into carga from public.wh_cargas where id = p_carga;
  if not found or carga.estado <> 'en_curso' or carga.creada_por is distinct from auth.uid() then
    raise exception 'carga_no_disponible: la carga no existe, ya terminó o es de otra persona' using errcode = 'P0001';
  end if;
  select count(*) into total from public.wh_filas where carga_id = p_carga;

  if p_ok and total = 0 then
    p_ok := false;
    p_error := 'El archivo no trae filas.';
  end if;

  if not p_ok then
    delete from public.wh_filas where carga_id = p_carga;
    update public.wh_cargas
       set estado = 'error', error = left(coalesce(p_error, 'error'), 500), filas = 0, terminada_en = now()
     where id = p_carga;
    return 0;
  end if;

  update public.wh_cargas c
     set estado = 'reemplazada'
   where c.conjunto = carga.conjunto and c.periodo = carga.periodo and c.sede = carga.sede and c.corte = carga.corte
     and c.estado = 'guardada' and c.id <> p_carga;
  update public.wh_cargas
     set estado = 'guardada', filas = total, columnas = coalesce(p_columnas, '[]'::jsonb), terminada_en = now()
   where id = p_carga;
  return total;
end;
$$;

create or replace function public.wh_cerrar_periodo(p_periodo text, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  insert into public.wh_periodos (periodo, estado, nota, cerrado_en, cerrado_por)
  values (p_periodo, 'cerrado', coalesce(p_nota, ''), now(), auth.uid())
  on conflict (periodo) do update
    set estado = 'cerrado', nota = coalesce(p_nota, ''), cerrado_en = now(), cerrado_por = auth.uid();
end;
$$;

create or replace function public.wh_reabrir_periodo(p_periodo text, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.wh_autorizado() and public.has_role_at_least('admin')) then
    raise exception 'warehouse: reabrir un periodo es de la administración' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nota, ''))) < 5 then
    raise exception 'motivo_requerido: indique por qué se reabre' using errcode = 'P0001';
  end if;
  update public.wh_periodos
     set estado = 'abierto', nota = p_nota, cerrado_en = null, cerrado_por = null
   where periodo = p_periodo;
end;
$$;

revoke all on function public.wh_abrir_carga(text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.wh_agregar_filas(uuid, int, jsonb) from public, anon;
revoke all on function public.wh_cerrar_carga(uuid, boolean, text, jsonb) from public, anon;
revoke all on function public.wh_cerrar_periodo(text, text) from public, anon;
revoke all on function public.wh_reabrir_periodo(text, text) from public, anon;
revoke all on function public.wh_autorizado() from public, anon;
grant execute on function public.wh_abrir_carga(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.wh_agregar_filas(uuid, int, jsonb) to authenticated;
grant execute on function public.wh_cerrar_carga(uuid, boolean, text, jsonb) to authenticated;
grant execute on function public.wh_cerrar_periodo(text, text) to authenticated;
grant execute on function public.wh_reabrir_periodo(text, text) to authenticated;
grant execute on function public.wh_autorizado() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Vistas de consulta
-- -----------------------------------------------------------------------------

create or replace view public.wh_vigentes with (security_invoker = true) as
  select distinct on (c.conjunto, c.periodo, c.sede, c.corte)
         c.id, c.conjunto, c.periodo, c.sede, c.corte, c.version, c.origen, c.filas,
         c.huella, c.archivo_nombre, c.columnas, c.motivo, c.creada_en, c.terminada_en
    from public.wh_cargas c
   where c.estado = 'guardada'
   order by c.conjunto, c.periodo, c.sede, c.corte, c.version desc;

comment on view public.wh_vigentes is 'Warehouse: la última versión guardada de cada conjunto, periodo, sede y corte.';

create or replace view public.v_wh_cobertura with (security_invoker = true) as
  select v.conjunto, v.periodo, v.sede, v.corte, v.version, v.filas, v.origen, v.terminada_en,
         coalesce(p.estado, 'abierto') as periodo_estado,
         (select count(*) from public.wh_cargas c
           where c.conjunto = v.conjunto and c.periodo = v.periodo and c.sede = v.sede and c.corte = v.corte
             and c.estado in ('guardada', 'reemplazada')) as versiones,
         v.id
    from public.wh_vigentes v
    left join public.wh_periodos p on p.periodo = v.periodo;

comment on view public.v_wh_cobertura is 'Warehouse: qué hay guardado, con su versión, filas y si el periodo está cerrado.';

create or replace function public.wh_num(p_texto text)
returns numeric
language sql
immutable
as $$
  select case when btrim(coalesce(p_texto, '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
              then replace(btrim(p_texto), ',', '.')::numeric end;
$$;

create or replace view public.v_wh_rendimiento with (security_invoker = true) as
  select v.periodo, v.sede, v.corte, v.version,
         f.datos->>'codigo'                       as codigo,
         f.datos->>'letra'                        as letra,
         f.datos->>'nombre'                       as nombre,
         f.datos->>'plan'                         as plan,
         f.datos->>'programa'                     as departamento,
         f.datos->>'docente'                      as docente,
         public.wh_num(f.datos->>'matriculados')   as matriculados,
         public.wh_num(f.datos->>'reprobados')     as reprobados,
         public.wh_num(f.datos->>'pct_reprobados') as pct_reprobados,
         public.wh_num(f.datos->>'aprobados')      as aprobados,
         public.wh_num(f.datos->>'pct_aprobados')  as pct_aprobados,
         public.wh_num(f.datos->>'no_presenta')    as no_presenta,
         public.wh_num(f.datos->>'pct_no_presenta') as pct_no_presenta,
         public.wh_num(f.datos->>'promedio')       as promedio
    from public.wh_vigentes v
    join public.wh_filas f on f.carga_id = v.id
   where v.conjunto = 'ma_rendimiento';

comment on view public.v_wh_rendimiento is
  'Warehouse: rendimiento académico de Master por grupo y corte. «departamento» es la columna «Programa» del reporte, que en realidad nombra al departamento.';

grant select on public.wh_vigentes, public.v_wh_cobertura, public.v_wh_rendimiento to authenticated;
revoke all on public.wh_vigentes, public.v_wh_cobertura, public.v_wh_rendimiento from anon;

notify pgrst, 'reload schema';
