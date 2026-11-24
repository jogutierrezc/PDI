-- =============================================================================
-- PDI · 0206 · Conectar un indicador a una tabla, con errores que se entienden
--
-- Guardar el vínculo indicador → tabla se hacía con un upsert directo a
-- sos_vinculos (INSERT ... ON CONFLICT DO UPDATE). Cuando una política de
-- seguridad por fila lo rechaza, PostgreSQL responde solo
--   new row violates row-level security policy (USING expression)
-- sin decir qué condición falló (papel sobre la tabla, indicador ya publicado,
-- tabla fuera de la unidad…).
--
-- sos_guardar_vinculo() hace las mismas comprobaciones que las políticas de
-- 0202 (sos_puede_vincular), una por una y con su propio mensaje, y después
-- escribe con un UPDATE o un INSERT explícitos. No se debilita nada:
--   · exige sos_entra() y el papel Crear sobre la tabla (sos_rango_archivo >= 3);
--   · si el indicador ya está publicado, exige Administra la unidad;
--   · la tabla y las columnas se validan con sos_validar_vinculo, el mismo
--     chequeo (columnas numéricas, nada sensible) que el disparador de 0202;
--   · SECURITY DEFINER solo para saltar la política de la tabla después de
--     haber comprobado lo mismo aquí; la identidad (auth.uid()) sigue siendo la
--     de la persona que llama.
-- Las políticas de sos_vinculos siguen vigentes para quien escriba directo.
-- Idempotente.
-- =============================================================================

create or replace function public.sos_guardar_vinculo(
  p_indicador    text,
  p_archivo      uuid,
  p_valor        text,
  p_periodo      text,
  p_campus       text default null,
  p_filtro_col   text default null,
  p_filtro_valor text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publicado boolean;
  v_rango     int;
  v_error     text;
  v_id        uuid;
begin
  if not public.sos_entra() then
    raise exception 'No tiene acceso a Datos de Sostenibilidad.' using errcode = '42501';
  end if;

  select i.publicado into v_publicado from public.ds_indicadores i where i.id = p_indicador;
  if not found then
    raise exception 'El indicador «%» no existe.', p_indicador using errcode = 'P0002';
  end if;

  v_rango := public.sos_rango_archivo(p_archivo);
  if v_rango = 0 then
    raise exception 'La tabla elegida no está en la unidad Datos de Sostenibilidad, o ya no existe. Elija una tabla de esa unidad.' using errcode = '42501';
  end if;
  if v_rango < 3 then
    raise exception 'Necesita el papel Crear sobre esa tabla para conectarla a un indicador. Pida a quien Administra la unidad que se lo asigne.' using errcode = '42501';
  end if;

  if coalesce(v_publicado, false) and not public.sos_es_admin_unidad() then
    raise exception 'El indicador ya está publicado: solo quien Administra la unidad puede cambiar de dónde sale.' using errcode = '42501';
  end if;

  v_error := public.sos_validar_vinculo(p_archivo, p_valor, p_periodo, p_campus, p_filtro_col);
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;

  update public.sos_vinculos v
     set archivo_id = p_archivo, col_valor = p_valor, col_periodo = p_periodo,
         col_campus = p_campus, filtro_col = p_filtro_col, filtro_valor = p_filtro_valor
   where v.indicador_id = p_indicador
   returning v.id into v_id;

  if v_id is null then
    insert into public.sos_vinculos (indicador_id, archivo_id, col_valor, col_periodo, col_campus, filtro_col, filtro_valor)
    values (p_indicador, p_archivo, p_valor, p_periodo, p_campus, p_filtro_col, p_filtro_valor)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.sos_guardar_vinculo(text, uuid, text, text, text, text, text) is
  'Datos de Sostenibilidad · crea o cambia el vínculo indicador → tabla con mensajes claros (papel, unidad, publicado, columnas).';

revoke all on function public.sos_guardar_vinculo(text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.sos_guardar_vinculo(text, uuid, text, text, text, text, text) to authenticated, service_role;
