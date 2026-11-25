-- Warehouse · crear periodos nuevos por adelantado (2027a, 2027b…).
--
-- Hasta ahora un periodo nacía solo al cargar su primer reporte (wh_abrir_carga) o al
-- cerrarlo (wh_cerrar_periodo). Para preparar un periodo que la plataforma aún no
-- tiene, Planeación lo crea aquí: queda «abierto», sin cargas, y aparece en el selector.
-- Se puede quitar mientras siga vacío (sin cargas) y abierto.
--
-- Mismo permiso que el resto del almacén (wh_autorizado). Idempotente.

create or replace function public.wh_crear_periodo(p_periodo text, p_nota text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p text := lower(btrim(coalesce(p_periodo, '')));
  anio int;
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  if p !~ '^[0-9]{4}[ab]$' then
    raise exception 'periodo_invalido: use el año y la letra a o b, por ejemplo 2027a' using errcode = 'P0001';
  end if;
  anio := substr(p, 1, 4)::int;
  if anio < 2018 or anio > extract(year from now())::int + 5 then
    raise exception 'periodo_invalido: el año debe estar entre 2018 y %', extract(year from now())::int + 5 using errcode = 'P0001';
  end if;
  if exists (select 1 from public.wh_periodos where periodo = p) then
    raise exception 'periodo_existe: el periodo % ya existe', p using errcode = 'P0001';
  end if;
  insert into public.wh_periodos (periodo, estado, nota) values (p, 'abierto', coalesce(p_nota, ''));
end;
$$;

create or replace function public.wh_eliminar_periodo(p_periodo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wh_autorizado() then
    raise exception 'warehouse: sin permiso' using errcode = '42501';
  end if;
  if exists (select 1 from public.wh_cargas where periodo = p_periodo) then
    raise exception 'periodo_con_cargas: el periodo % ya tiene cargas y no se puede quitar', p_periodo using errcode = 'P0001';
  end if;
  delete from public.wh_periodos where periodo = p_periodo and estado = 'abierto' and periodo <> 'permanente';
  if not found then
    raise exception 'periodo_no_quitable: solo se quitan periodos abiertos y vacíos' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.wh_crear_periodo(text, text) from public, anon;
revoke all on function public.wh_eliminar_periodo(text) from public, anon;
grant execute on function public.wh_crear_periodo(text, text) to authenticated;
grant execute on function public.wh_eliminar_periodo(text) to authenticated;
