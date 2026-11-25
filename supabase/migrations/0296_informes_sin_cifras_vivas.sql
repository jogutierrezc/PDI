-- =============================================================================
-- Informes de gestión · 0296 · El envío ya no exige nada de las cifras vivas.
--
-- Las cifras conectadas a UDES en Cifras y al PDI no estaban funcionando (el
-- almacén de datos está en revisión), y la sección «Conectar indicadores de UDES
-- en Cifras o del PDI» se oculta en la pantalla del Gestor. Los programas
-- reportan sus cifras a mano, en «Lo que pide Planeación» y en las tablas de la
-- sección.
--
-- Por eso informe_validar_envio deja de exigir, sobre public.informe_cifras:
--   · el nombre de la fuente de los datos propios (config «exigir_fuente»),
--   · el pilar del PDI de los datos propios (config «exigir_pilar»),
--   · justificar —y dejar incluidas— las cifras marcadas «Justificar»
--     en informe_requisitos.
-- Sin la pantalla que las llena, esos tres controles dejarían al Gestor sin
-- poder enviar. Todo lo demás queda igual: ciclo abierto, secciones listas y
-- al menos una evidencia.
--
-- Las tablas y columnas no se tocan: nada se borra, y si las cifras vivas
-- vuelven basta con restituir los tres bloques de la 0279 (sección 5).
-- =============================================================================

create or replace function public.informe_validar_envio(p_instancia uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inst    record;
  faltan  text;
begin
  select i.plantilla, i.ciclo_id, c.estado as ciclo_estado into inst
    from public.informe_instancias i
    join public.informe_ciclos c on c.id = i.ciclo_id
   where i.id = p_instancia;

  if inst.ciclo_estado <> 'abierto' then
    raise exception 'El ciclo no está abierto: no se puede enviar' using errcode = '23514';
  end if;
  if not exists (select 1 from public.informe_secciones s where s.instancia_id = p_instancia) then
    raise exception 'El informe no tiene secciones' using errcode = '23514';
  end if;
  select string_agg(s.clave, ', ' order by s.orden) into faltan
    from public.informe_secciones s
   where s.instancia_id = p_instancia and not s.listo
     and not exists (
       select 1 from public.informe_secciones_config k
        where k.ciclo_id = inst.ciclo_id and k.plantilla = inst.plantilla and k.clave = s.clave and not k.activa
     );
  if faltan is not null then
    raise exception 'Faltan secciones por terminar: %', faltan using errcode = '23514';
  end if;

  -- Evidencias y fuentes de verificación: esenciales y obligatorias en toda estructura.
  if not exists (select 1 from public.informe_anexos a where a.instancia_id = p_instancia) then
    raise exception 'Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace antes de enviar' using errcode = '23514';
  end if;
end;
$$;
