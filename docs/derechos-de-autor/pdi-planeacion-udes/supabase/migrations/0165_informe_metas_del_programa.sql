-- =============================================================================
-- PDI · 0165 · Informes: «Objetivos y metas» salen de los indicadores del programa
-- =============================================================================
-- En el informe de un programa (y, sumados, en el de su facultad) la sección de
-- metas se alimenta de lo que el programa seleccionó en Impacto:
--   · las fichas que adoptó (imp_adoptions activas, con su meta propia o la de
--     la ficha) y los indicadores que creó (imp_indicators con program_id),
--     en cada sede donde se ofrece y que no estén retirados;
--   · fuera quedan los que el programa solo consulta (program_reports = false)
--     y los medidos en pesos (el dinero sigue cerrado).
-- Cada uno es una fila de informe_cifras con clave «meta_<hash>», fuente `pdi`
-- y `meta` = la meta del año del ciclo (2026 → target_2026_num, 2028 o más →
-- target_2028_num, 2027 → sin meta numérica). Así reutiliza lo que ya hay: la
-- lectura en vivo (informe_vivas_de → informe_valor_pdi), el «visto» y la foto
-- al enviar. `consulta` guarda el programa, la sede y la dirección del indicador.
--
-- · informe_metas_sincronizar(p_instancia): con el informe abierto (borrador o
--   devuelto, editor o Planeación) pone al día esas filas; enviado o aprobado no
--   toca nada (manda la foto). Lo ve quien ve el informe: nadie lee indicadores
--   de un programa que no es de su informe.
-- · informe_valor_pdi: un indicador propio del programa (no retirado) también se
--   lee; antes solo los publicados.
--
-- Requiere 0084, 0153. Idempotente.
-- =============================================================================

create or replace function public.informe_valor_pdi(q jsonb, p_anio int, out valor numeric, out fuente text, out corte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ind      record;
  v_campus uuid;
  v_prog   uuid := nullif(q ->> 'programa', '')::uuid;
begin
  select i.id, i.code, i.name into ind
    from public.imp_indicators i
   where i.code = q ->> 'indicador'
     and (i.status = 'publicado' or (i.program_id is not null and i.status <> 'retirado'));
  if not found then
    fuente := 'PDI · sin dato publicado';
    return;
  end if;
  fuente := 'PDI · ' || ind.code || ' · ' || ind.name;
  corte := p_anio::text;
  if coalesce(q ->> 'sede', '') <> '' then
    select c.id into v_campus from public.campuses c where c.slug = q ->> 'sede';
    if v_campus is null then
      return;
    end if;
  end if;
  select case when v.not_applicable then null else v.value_num end into valor
    from public.imp_values v
   where v.indicator_id = ind.id and v.year = p_anio
     and v.program_id is not distinct from v_prog
     and v.campus_id is not distinct from v_campus;
end;
$$;

/** Los indicadores que el programa (o los programas de la facultad) seleccionó, con la meta del año. */
create or replace function public.informe_metas_deseadas(p_unit uuid, p_anio int)
returns table (clave text, etiqueta text, unidad text, meta numeric, consulta jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with progs as (
    select u.id, u.name from public.units u
     where u.kind = 'programa' and (u.id = p_unit or u.parent_id = p_unit)
  ),
  sel as (
    select p.id as prog, p.name as prog_name, c.id as camp, c.slug, c.name as camp_name,
           i.id as ind, i.code, i.name, i.unit_label, i.measure, i.direction, 'adopcion'::text as origen,
           case when p_anio <= 2026 then coalesce(a.target_2026_num, i.target_2026_num)
                when p_anio >= 2028 then coalesce(a.target_2028_num, i.target_2028_num) end as meta,
           case when p_anio <= 2026 then coalesce(nullif(a.target_2026, ''), i.target_2026)
                when p_anio >= 2028 then coalesce(nullif(a.target_2028, ''), i.target_2028) end as meta_texto
      from progs p
      join public.imp_adoptions a on a.program_id = p.id and a.active
      join public.program_campuses pc on pc.program_id = p.id and pc.campus_id = a.campus_id and pc.active
      join public.campuses c on c.id = a.campus_id
      join public.imp_indicators i on i.id = a.indicator_id and i.program_id is null and i.status = 'publicado' and i.program_reports
    union all
    select p.id, p.name, c.id, c.slug, c.name,
           i.id, i.code, i.name, i.unit_label, i.measure, i.direction, 'propio',
           case when p_anio <= 2026 then i.target_2026_num when p_anio >= 2028 then i.target_2028_num end,
           case when p_anio <= 2026 then i.target_2026 when p_anio >= 2028 then i.target_2028 end
      from progs p
      join public.imp_indicators i on i.program_id = p.id and i.status <> 'retirado' and i.program_reports
      join public.program_campuses pc on pc.program_id = p.id and pc.campus_id = i.campus_id and pc.active
      join public.campuses c on c.id = i.campus_id
  )
  select 'meta_' || substr(md5(s.prog::text || s.camp::text || s.ind::text), 1, 12),
         s.name,
         case when s.measure = 'porcentaje' then ' %' else '' end,
         s.meta,
         jsonb_build_object(
           'indicador', s.code, 'programa', s.prog, 'sede', s.slug, 'origen', s.origen,
           'programa_nombre', s.prog_name, 'sede_nombre', s.camp_name, 'baja', s.direction = 'baja',
           'meta_texto', coalesce(s.meta_texto, ''), 'unidad_label', s.unit_label)
    from sel s
   where s.measure <> 'pesos';
$$;

/** Pone al día las filas de metas del informe. Devuelve cuántas quedan. */
create or replace function public.informe_metas_sincronizar(p_instancia uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inst record;
  n    integer;
begin
  if not public.informe_instancia_visible(p_instancia) then
    raise exception 'Sin permiso para ver este informe' using errcode = '42501';
  end if;
  select i.unit_id, i.estado, ci.anio, u.kind::text as kind into inst
    from public.informe_instancias i
    join public.informe_ciclos ci on ci.id = i.ciclo_id
    join public.units u on u.id = i.unit_id
   where i.id = p_instancia;
  if inst.kind not in ('programa', 'facultad') then
    return 0;
  end if;

  if inst.estado in ('draft', 'back') and public.informe_instancia_abierta(p_instancia) then
    perform set_config('informe.sistema', 'si', true);
    insert into public.informe_cifras as x (instancia_id, clave, etiqueta, fuente_tipo, fuente_nombre, unidad, meta, consulta, updated_by)
    select p_instancia, d.clave, d.etiqueta, 'pdi', 'Indicador del programa', d.unidad, d.meta, d.consulta, auth.uid()
      from public.informe_metas_deseadas(inst.unit_id, inst.anio) d
    on conflict (instancia_id, clave) do update
       set etiqueta = excluded.etiqueta, unidad = excluded.unidad, meta = excluded.meta,
           consulta = excluded.consulta, fuente_tipo = 'pdi', valor = null;
    delete from public.informe_cifras x
     where x.instancia_id = p_instancia and x.clave like 'meta\_%'
       and x.clave not in (select d.clave from public.informe_metas_deseadas(inst.unit_id, inst.anio) d);
    perform set_config('informe.sistema', '', true);
  end if;

  select count(*) into n from public.informe_cifras x where x.instancia_id = p_instancia and x.clave like 'meta\_%';
  return n;
end;
$$;

revoke all on function public.informe_metas_deseadas(uuid, int) from public, anon, authenticated;
revoke all on function public.informe_metas_sincronizar(uuid) from public, anon;
grant execute on function public.informe_metas_sincronizar(uuid) to authenticated, service_role;
