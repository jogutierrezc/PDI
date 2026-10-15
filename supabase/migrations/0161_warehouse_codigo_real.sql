-- =============================================================================
-- 0161 · Warehouse UDES · el código real del estudiante
--
-- Decisión de Planeación: «el programa debe poder saber quién es su estudiante,
-- pero sin nombre». Hasta 0160 el código de estudiante se guardaba como
-- seudónimo irreversible (HMAC con sal, 0155): servía para contar, no para
-- acompañar a una persona. Desde esta migración el CÓDIGO REAL se conserva en
-- los conjuntos que lo traen:
--
--   dv_notas   (Reporte global de notas)       codigo_estudiante
--   dv_matric  (Estudiantes matriculados)      codigo
--   dv_grad    (Graduados)                     codigo
--   dv_homol   (Homologaciones)                codigo
--   dv_global  (Reporte global de matrículas)  codigo   (id_docente sigue seudonimizado)
--
-- Lo que NO cambia ni se negocia:
--   · NUNCA se guardan nombres, documento de identidad, fecha de nacimiento,
--     dirección, salud, contraseñas, correos ni teléfonos. La lista «permitir»
--     de cada conjunto sigue siendo la única puerta, y ahora un CHECK impide
--     poner en una lista «permitir» una columna con esos nombres.
--   · El código real es un DATO PERSONAL: queda marcado en wh_politicas
--     (datos_personales + finalidad). Finalidad: seguimiento académico de
--     estudiantes (alertas tempranas). Acceso restringido por unidad.
--   · Quién lo ve se decide en la base, no en la interfaz:
--       - wh_filas solo la lee wh_autorizado() (Planeación con la pantalla
--         «warehouse»); no hay escritura directa para nadie.
--       - El Monitor entrega el código solo por las funciones security definer
--         wh_monitor_*, que exigen wh_monitor_puede() y filtran por
--         wh_monitor_codigos() (unit_can_view): una decanatura ve los códigos de
--         sus programas; una dirección, los del suyo; el resto, nada.
--   · La sal y el HMAC siguen siendo la OPCIÓN de la política (columna
--     «seudonimizar») para cualquier conjunto o columna que lo necesite: los
--     docentes (id_docente, cédula, identificación) siguen como seudónimo.
--
-- Las cargas que ya están guardadas conservan su seudónimo (no se puede ni se
-- intenta revertir): para ver códigos reales hay que volver a cargar el reporte
-- (una versión nueva). El Monitor avisa cuando un código parece seudónimo.
--
-- Requiere 0155–0160. Idempotente. La parte 2 (plan, clave de grupo, mapa de riesgo) va al final.
-- =============================================================================

-- 1. La política dice qué datos personales conserva y para qué.
alter table public.wh_politicas add column if not exists datos_personales text[] not null default '{}';
alter table public.wh_politicas add column if not exists finalidad text not null default '';

comment on column public.wh_politicas.datos_personales is
  'Warehouse: columnas que se conservan tal cual y son dato personal (p. ej. el código real del estudiante). Acceso restringido por unidad.';
comment on column public.wh_politicas.finalidad is
  'Warehouse: para qué se conservan los datos personales de este conjunto.';

-- 2. Lo que nunca puede estar en una lista «permitir» (nombres de columna ya normalizados).
alter table public.wh_politicas drop constraint if exists wh_politicas_sin_identidad;
alter table public.wh_politicas
  add constraint wh_politicas_sin_identidad check (
    modo <> 'permitir'
    or not (lista && array[
      'nombre', 'nombres', 'apellido', 'apellidos', 'nombre_completo', 'nombre_de_estudiante', 'nombre_estudiante',
      'documento', 'numero_documento', 'tipo_id', 'identificacion_estudiante', 'id_estudiante', 'cedula_estudiante',
      'fecha_nac', 'fecha_nacimiento', 'nacimiento', 'direccion', 'barrio', 'salud', 'eps',
      'contrasena', 'password', 'clave', 'correo', 'email', 'correo_institucional', 'telefono', 'celular'
    ]::text[])
  );

-- 3. Las políticas: el código del estudiante se conserva, marcado como dato personal.
insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('dv_notas', 'permitir',
   '{codigo_estudiante,codigo_programa,nombre_programa,codigo_materia,nombre_materia,grupo,p1,p2,p3,nota_acumulada}',
   '{}', '{codigo_estudiante}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descarta el nombre del estudiante; su código real se conserva (dato personal) para el seguimiento académico y solo lo ve quien ya puede ver ese programa.'),
  ('dv_matric', 'permitir',
   '{codigo,estado,cod,programa,pensum,jornada,ubicacion,promedio_acumulado,cred_aprobados,cred_segun_ubicacion,cred_segun_matricula_financiera,cred_adicionales,creditos_matriculados,creditos_no_matriculados,materias_matriculadas,fecha_matricula,paz_y_salvo,ultimo_poligrafo,promedio_semestre_ultimo_poligrafo,grupo_etario,origen}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan documento, nombres, género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos, correos, colegio, salud y responsable de matrícula; el código real se conserva (dato personal). Se derivan, sin identificar a nadie, el grupo etario y si viene de Santander.'),
  ('dv_grad', 'permitir',
   '{codigo,programa,fecha_de_grado,ceremonia,modalidad,nota,cum_laude,suma_cum_laude,prueba_saber_pro}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan documento, nombres, apellidos, acta, folio, diploma, libro y proyecto; el código real se conserva (dato personal).'),
  ('dv_homol', 'permitir',
   '{codigo,programa,fecha_fin_registro,fecha_aprobacion,tipo,institucion_de_procedencia,homologaciones}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descarta el nombre del estudiante; el código real se conserva (dato personal).'),
  ('dv_global', 'permitir',
   '{codigo,cod_materia,grupo,materia,cod_departamento,departamento,id_docente}',
   '{id_docente}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan nombres, apellidos, correos, la identificación del estudiante y el nombre del docente; el código del estudiante se conserva (dato personal) y la identificación del docente queda como seudónimo.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- Una columna conservada como dato personal debe estar en la lista «permitir»; y si alguien re-aplica una
-- migración antigua que la ponía en «seudonimizar», gana lo conservado (se quita de «seudonimizar»).
create or replace function public.wh_politica_normalizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.seudonimizar := coalesce((select array_agg(x) from unnest(new.seudonimizar) x where not (x = any (new.datos_personales))), '{}');
  return new;
end;
$$;

drop trigger if exists wh_politica_normalizar on public.wh_politicas;
create trigger wh_politica_normalizar before insert or update on public.wh_politicas
  for each row execute function public.wh_politica_normalizar();

alter table public.wh_politicas drop constraint if exists wh_politicas_personales_coherentes;
alter table public.wh_politicas
  add constraint wh_politicas_personales_coherentes check (modo <> 'permitir' or datos_personales <@ lista);

-- 4. El Monitor entrega el código real, solo dentro del alcance de quien pregunta (sin cambiar sus reglas).
comment on function public.wh_monitor_resumen(text, text, numeric, numeric) is
  'Monitor: un renglón por estudiante con su CÓDIGO REAL (dato personal, sin nombre). Solo lo de los programas que la persona puede ver (wh_monitor_codigos / unit_can_view).';
comment on function public.wh_monitor_estudiante(text, text, text) is
  'Monitor: las notas de un estudiante por su código real; vacío si el programa no es de quien pregunta.';
comment on function public.wh_monitor_grupo_estudiantes(text, text, text, text) is
  'Monitor: los estudiantes de un grupo por su código real; solo los de programas que la persona puede ver.';

-- 5. Lo mismo que antes, vuelto a afirmar: nada de esto lo leen anon ni la lectura directa de las unidades.
revoke all on public.wh_filas from anon;
revoke insert, update, delete on public.wh_filas, public.wh_politicas from authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- PARTE 2 · plan del grupo, clave de grupo (código + letra) y mapa de riesgo
--
-- PLAN. Un grupo se publica por «tres cortes», «única» (nota final) o «formación
-- permanente». El campo «plan» llega en el reporte de Master «Rendimiento por
-- grupo» (ma_rendimiento: una fila por grupo con código, letra, nombre, plan…).
-- El «Reporte global de notas» de Davinci (dv_notas) NO lo trae en los HAR que
-- hay: por eso el plan de cada grupo se toma de ma_rendimiento (por código de
-- materia + letra) y, si un día dv_notas trae su propia columna «plan», de ella
-- (queda permitida en su política). Sin plan = «tres cortes» (degradación segura).
--   · Vistas por CORTE (P1, P2, P3, alertas tempranas, evolución): SOLO planes
--     «tres cortes», los únicos que reportan los tres cortes.
--   · NOTA FINAL (corte 4, la nota acumulada): todos los planes.
--
-- CLAVE DE GRUPO. El grupo es código de materia + letra («SIS101» + «A»). La
-- clave «SIS101~A» une estudiante y grupo en SQL y en la URL (?g=). Índices
-- por expresión sobre wh_filas para que la unión sea rápida.
-- =============================================================================

-- La política de dv_notas deja pasar «plan» si algún día llega (no es dato personal).
update public.wh_politicas
   set lista = (select array_agg(distinct x) from unnest(lista || array['plan']) x)
 where conjunto = 'dv_notas' and not ('plan' = any (lista));

update public.wh_politicas
   set nota = 'Una fila por grupo y corte: matriculados, aprobados, reprobados, no presenta y promedio. Conserva el «plan» del grupo (tres cortes, única, formación permanente), que no es dato personal; el docente queda como seudónimo y no hay datos de estudiantes.'
 where conjunto = 'ma_rendimiento';

create index if not exists wh_filas_grupo_idx on public.wh_filas (carga_id, (datos->>'codigo_materia'), (upper(btrim(datos->>'grupo'))))
  where datos->>'codigo_materia' is not null;
create index if not exists wh_filas_estudiante_idx on public.wh_filas (carga_id, (datos->>'codigo_estudiante'))
  where datos->>'codigo_estudiante' is not null;
create index if not exists wh_filas_plan_idx on public.wh_filas (carga_id, (datos->>'codigo'), (upper(btrim(datos->>'letra'))))
  where datos->>'letra' is not null;

-- El plan, normalizado: tres_cortes | unica | permanente. Vacío o desconocido = tres_cortes.
create or replace function public.wh_plan_norm(p text)
returns text
language sql
immutable
as $$
  select case
           when public.wh_norm_nombre(p) like '%UNICA%' then 'unica'
           when public.wh_norm_nombre(p) like '%PERMANENTE%' then 'permanente'
           else 'tres_cortes'
         end;
$$;

-- La clave de un grupo: código de materia + letra.
create or replace function public.wh_grupo_clave(p_materia text, p_grupo text)
returns text
language sql
immutable
as $$
  select btrim(coalesce(p_materia, '')) || '~' || upper(btrim(coalesce(p_grupo, '')));
$$;

-- El plan de cada grupo de un periodo y sede, según el reporte de Master. Solo lo usan las funciones del Monitor.
create or replace function public.wh_monitor_planes(p_periodo text, p_sede text)
returns table (codigo_materia text, grupo text, plan text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (f.datos->>'codigo', upper(btrim(f.datos->>'letra')))
         btrim(f.datos->>'codigo'), upper(btrim(f.datos->>'letra')), public.wh_plan_norm(f.datos->>'plan')
    from public.wh_cargas c
    join public.wh_filas f on f.carga_id = c.id
   where c.conjunto = 'ma_rendimiento' and c.periodo = p_periodo and c.sede = p_sede and c.estado = 'guardada'
     and f.datos->>'letra' is not null
   order by f.datos->>'codigo', upper(btrim(f.datos->>'letra')), c.version desc;
$$;

revoke all on function public.wh_monitor_planes(text, text) from public, anon, authenticated;
revoke all on function public.wh_plan_norm(text) from public, anon;
revoke all on function public.wh_grupo_clave(text, text) from public, anon;
grant execute on function public.wh_plan_norm(text), public.wh_grupo_clave(text, text) to authenticated;

-- Resumen por estudiante: SOLO grupos de plan «tres cortes».
create or replace function public.wh_monitor_resumen(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  estudiante text,
  codigo_programa text,
  programa text,
  materias int,
  con_p1 int, con_p2 int, con_p3 int,
  prom_p1 numeric, prom_p2 numeric, prom_p3 numeric,
  riesgo_p1 int, riesgo_p2 int, riesgo_p3 int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede)),
    n as (
      select f.datos->>'codigo_estudiante' as est,
             f.datos->>'codigo_programa'   as cod,
             f.datos->>'nombre_programa'   as prog,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
        left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
       where f.carga_id = carga
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
         and coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')) = 'tres_cortes'
    )
    select n.est, n.cod, min(n.prog), count(*)::int,
           count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
           round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
           (count(*) filter (where n.p1 < n.apr))::int,
           (count(*) filter (where n.p2 < n.apr))::int,
           (count(*) filter (where n.p3 < n.apr))::int
      from n
     group by n.est, n.cod;
end;
$$;

-- Grupos: solo «tres cortes», con su clave código + letra.
drop function if exists public.wh_monitor_grupos(text, text, numeric, numeric);
create function public.wh_monitor_grupos(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  codigo_programa text,
  codigo_materia text,
  materia text,
  grupo text,
  grupo_clave text,
  estudiantes int,
  con_p1 int, con_p2 int, con_p3 int,
  prom_p1 numeric, prom_p2 numeric, prom_p3 numeric,
  bajo_p1 int, bajo_p2 int, bajo_p3 int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede)),
    n as (
      select f.datos->>'codigo_programa' as cod,
             btrim(f.datos->>'codigo_materia') as cm,
             f.datos->>'nombre_materia'  as mat,
             upper(btrim(f.datos->>'grupo')) as gr,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
        left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
       where f.carga_id = carga
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
         and coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')) = 'tres_cortes'
    )
    select n.cod, n.cm, min(n.mat), n.gr, public.wh_grupo_clave(n.cm, n.gr), count(*)::int,
           count(n.p1)::int, count(n.p2)::int, count(n.p3)::int,
           round(avg(n.p1), 2), round(avg(n.p2), 2), round(avg(n.p3), 2),
           (count(*) filter (where n.p1 < n.apr))::int,
           (count(*) filter (where n.p2 < n.apr))::int,
           (count(*) filter (where n.p3 < n.apr))::int
      from n
     group by n.cod, n.cm, n.gr;
end;
$$;

-- Un estudiante: sus materias de grupos «tres cortes», con la clave del grupo.
drop function if exists public.wh_monitor_estudiante(text, text, text);
create function public.wh_monitor_estudiante(p_periodo text, p_sede text, p_estudiante text)
returns table (codigo_programa text, programa text, codigo_materia text, materia text, grupo text, grupo_clave text, p1 numeric, p2 numeric, p3 numeric, nota_acumulada numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede))
    select f.datos->>'codigo_programa', f.datos->>'nombre_programa', btrim(f.datos->>'codigo_materia'), f.datos->>'nombre_materia', upper(btrim(f.datos->>'grupo')),
           public.wh_grupo_clave(f.datos->>'codigo_materia', f.datos->>'grupo'),
           public.wh_num(f.datos->>'p1'), public.wh_num(f.datos->>'p2'), public.wh_num(f.datos->>'p3'), public.wh_num(f.datos->>'nota_acumulada')
      from public.wh_filas f
      left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
     where f.carga_id = carga
       and f.datos->>'codigo_estudiante' = p_estudiante
       and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
       and coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')) = 'tres_cortes'
     order by f.datos->>'nombre_materia';
end;
$$;

-- Los estudiantes de un grupo por su clave código + letra («SIS101~A»).
create or replace function public.wh_monitor_grupo_estudiantes(p_periodo text, p_sede text, p_clave text)
returns table (estudiante text, codigo_programa text, programa text, p1 numeric, p2 numeric, p3 numeric, nota_acumulada numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
  pos int := position('~' in reverse(coalesce(p_clave, '')));
  cm text;
  gr text;
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  if pos = 0 then
    return;
  end if;
  cm := left(p_clave, length(p_clave) - pos);
  gr := upper(btrim(right(p_clave, pos - 1)));
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    select f.datos->>'codigo_estudiante', f.datos->>'codigo_programa', f.datos->>'nombre_programa',
           public.wh_num(f.datos->>'p1'), public.wh_num(f.datos->>'p2'), public.wh_num(f.datos->>'p3'), public.wh_num(f.datos->>'nota_acumulada')
      from public.wh_filas f
     where f.carga_id = carga
       and f.datos->>'codigo_materia' = cm
       and upper(btrim(f.datos->>'grupo')) = gr
       and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
     order by f.datos->>'codigo_estudiante';
end;
$$;

-- -----------------------------------------------------------------------------
-- Mapa de riesgo: reprobación por programa, curso, grupo y corte (ya agregada; ninguna nota individual sale).
-- Una fila por programa × materia × grupo × corte. Cortes 1 a 3: SOLO plan «tres cortes».
-- Corte 4 = nota final (nota acumulada mayor a 0): todos los planes, con su plan para filtrar en pantalla.
-- «Reprobada» = nota menor a la de aprobar (3,0; Medicina 3,5).
-- -----------------------------------------------------------------------------

create or replace function public.wh_monitor_riesgo(p_periodo text, p_sede text, p_aprueba numeric default 3.0, p_aprueba_medicina numeric default 3.5)
returns table (
  codigo_programa text,
  programa text,
  codigo_materia text,
  materia text,
  grupo text,
  grupo_clave text,
  plan text,
  corte int,
  con int,
  bajo int,
  promedio numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede)),
    n as (
      select f.datos->>'codigo_programa' as cod,
             f.datos->>'nombre_programa' as prog,
             btrim(f.datos->>'codigo_materia') as cm,
             f.datos->>'nombre_materia' as mat,
             upper(btrim(f.datos->>'grupo')) as gr,
             coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')) as pln,
             public.wh_num(f.datos->>'p1') as p1,
             public.wh_num(f.datos->>'p2') as p2,
             public.wh_num(f.datos->>'p3') as p3,
             public.wh_num(f.datos->>'nota_acumulada') as fin,
             public.wh_nota_aprueba(f.datos->>'nombre_programa', p_aprueba, p_aprueba_medicina) as apr
        from public.wh_filas f
        left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
       where f.carga_id = carga
         and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
    )
    select n.cod, min(n.prog), n.cm, min(n.mat), n.gr, public.wh_grupo_clave(n.cm, n.gr), n.pln, v.corte,
           count(v.nota)::int,
           (count(*) filter (where v.nota < n.apr))::int,
           round(avg(v.nota), 2)
      from n
     cross join lateral (values (1, n.p1), (2, n.p2), (3, n.p3), (4, case when n.fin > 0 then n.fin end)) v(corte, nota)
     where v.nota is not null
       and (v.corte = 4 or n.pln = 'tres_cortes')
     group by n.cod, n.cm, n.gr, n.pln, v.corte;
end;
$$;

-- Cuántos grupos y matrículas hay de cada plan (para decirlo en pantalla) y si el plan viene de Master.
create or replace function public.wh_monitor_planes_resumen(p_periodo text, p_sede text)
returns table (plan text, grupos int, matriculas int, plan_conocido boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  carga uuid;
  visibles text[];
  hay boolean;
begin
  if not public.wh_monitor_puede() then
    raise exception 'monitor: sin permiso' using errcode = '42501';
  end if;
  carga := public.wh_monitor_carga(p_periodo, p_sede);
  visibles := public.wh_monitor_codigos();
  select exists (select 1 from public.wh_monitor_planes(p_periodo, p_sede)) into hay;
  return query
    with planes as (select * from public.wh_monitor_planes(p_periodo, p_sede))
    select coalesce(pl.plan, public.wh_plan_norm(f.datos->>'plan')),
           count(distinct public.wh_grupo_clave(f.datos->>'codigo_materia', f.datos->>'grupo'))::int,
           count(*)::int,
           hay
      from public.wh_filas f
      left join planes pl on pl.codigo_materia = btrim(f.datos->>'codigo_materia') and pl.grupo = upper(btrim(f.datos->>'grupo'))
     where f.carga_id = carga
       and (visibles is null or f.datos->>'codigo_programa' = any (visibles))
     group by 1;
end;
$$;

revoke all on function public.wh_monitor_grupos(text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_estudiante(text, text, text) from public, anon;
revoke all on function public.wh_monitor_grupo_estudiantes(text, text, text) from public, anon;
revoke all on function public.wh_monitor_riesgo(text, text, numeric, numeric) from public, anon;
revoke all on function public.wh_monitor_planes_resumen(text, text) from public, anon;
grant execute on function public.wh_monitor_grupos(text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_estudiante(text, text, text) to authenticated;
grant execute on function public.wh_monitor_grupo_estudiantes(text, text, text) to authenticated;
grant execute on function public.wh_monitor_riesgo(text, text, numeric, numeric) to authenticated;
grant execute on function public.wh_monitor_planes_resumen(text, text) to authenticated;

notify pgrst, 'reload schema';
