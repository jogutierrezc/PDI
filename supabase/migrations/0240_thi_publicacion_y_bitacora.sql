-- =============================================================================
-- PDI · 0240 · THE Impact · bitácora del flujo y publicación («lista para la entrega»)
--
-- Requiere 0237 y 0239. Idempotente.
--
-- QUÉ AGREGA, SIN TOCAR EL FLUJO DE 0149
--  · Dos disparadores AFTER (no cambian ni bloquean nada del flujo existente):
--      ranking_responses  → escribe en thi_actividad cada cambio de estado (enviado,
--                           aprobado, devuelto…) y retira la marca «lista» si la
--                           respuesta deja de estar aprobada.
--      ranking_assignments → escribe «asignado» cuando el ciclo está abierto.
--    Ambos corren dentro de un bloque que atrapa cualquier error: la bitácora o los
--    avisos nunca pueden hacer fallar un envío, una aprobación o una importación.
--  · Ganchos de avisos `thi_encolar_estado` y `thi_encolar_asignacion`: aquí no hacen
--    nada; 0241 los reemplaza por los que encolan correos (mismo orden que 0208 → 0213).
--  · Publicación. THE Impact no tiene todavía una página pública de indicadores como
--    UI GreenMetric (los informes ODS públicos salen de otro módulo). «Publicación»
--    es, por ahora, la LISTA DE ENTREGA A THE: la administración marca «lista» una
--    respuesta aprobada cuando está completa para subirla al portal de THE. Marcar
--    «lista» exige:
--      1. respuesta aprobada (estado ok);
--      2. evidencia si la metodología la exige (thi_evidencia_exigida) y hay al menos una.
--    Si después la respuesta se devuelve o se reabre, la marca se retira sola y queda
--    en la bitácora. La entrega a THE sigue siendo manual (portal de THE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ganchos de avisos (los reemplaza 0241)
-- -----------------------------------------------------------------------------

create or replace function public.thi_encolar_estado(p_antes public.ranking_responses, p_despues public.ranking_responses)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

create or replace function public.thi_encolar_asignacion(p_ciclo uuid, p_indicador text, p_unidad uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Disparadores de la bitácora
-- -----------------------------------------------------------------------------

create or replace function public.thi_respuestas_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_the boolean;
  v_accion text;
  v_antes text := null;
begin
  if tg_op = 'UPDATE' then
    v_antes := old.estado;
    if new.estado is not distinct from v_antes then return new; end if;
  end if;
  begin
    select exists (select 1 from public.ranking_cycles c where c.id = new.ciclo and c.ranking = 'the-impact') into v_the;
    if not v_the then return new; end if;
    if tg_op = 'INSERT' and new.estado in ('none', 'draft') then return new; end if;
    v_accion := case new.estado
      when 'sent' then 'enviado'
      when 'ok' then 'aprobado'
      when 'back' then 'devuelto'
      when 'draft' then case when v_antes = 'back' then 'retomado' else 'borrador' end
      else 'estado' end;
    insert into public.thi_actividad (ciclo_id, respuesta_id, indicador, actor, accion, de, a, detalle)
    values (new.ciclo, new.id, new.indicador, auth.uid(), v_accion, v_antes, new.estado,
            jsonb_build_object('unidad', new.unidad, 'nota', left(coalesce(new.nota_revision, ''), 300)));
    if v_antes = 'ok' and new.estado <> 'ok' then
      update public.thi_publicaciones set lista = false, marcada_por = auth.uid(), marcada_at = now()
       where ciclo_id = new.ciclo and indicador = new.indicador and unidad = new.unidad and lista;
      if found then
        insert into public.thi_actividad (ciclo_id, respuesta_id, indicador, actor, accion, de, a, detalle)
        values (new.ciclo, new.id, new.indicador, auth.uid(), 'retirada_de_entrega', 'lista', 'no lista', jsonb_build_object('motivo', 'La respuesta dejó de estar aprobada.'));
      end if;
    end if;
    if tg_op = 'UPDATE' then
      perform public.thi_encolar_estado(old, new);
    end if;
  exception when others then
    -- Nada de lo anterior puede impedir el cambio de estado.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists thi_respuestas_tg on public.ranking_responses;
create trigger thi_respuestas_tg after insert or update of estado on public.ranking_responses
  for each row execute function public.thi_respuestas_tg();

create or replace function public.thi_asignaciones_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if exists (select 1 from public.ranking_cycles c where c.id = new.ciclo and c.ranking = 'the-impact' and c.estado = 'abierto') then
      insert into public.thi_actividad (ciclo_id, respuesta_id, indicador, actor, accion, a, detalle)
      values (new.ciclo, null, new.indicador, auth.uid(), 'asignado', new.rol, jsonb_build_object('unidad', new.unidad));
      perform public.thi_encolar_asignacion(new.ciclo, new.indicador, new.unidad, new.rol);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists thi_asignaciones_tg on public.ranking_assignments;
create trigger thi_asignaciones_tg after insert on public.ranking_assignments
  for each row execute function public.thi_asignaciones_tg();

-- -----------------------------------------------------------------------------
-- 3. Publicación: la lista de entrega
-- -----------------------------------------------------------------------------

/**
 * Estado de entrega de todas las respuestas del ciclo, para la pantalla de Publicación (solo la administración).
 * `motivo` dice por qué no se puede marcar «lista»; vacío si se puede.
 */
create or replace function public.thi_publicacion_estado(p_ciclo uuid)
returns table (respuesta_id uuid, indicador text, unidad uuid, estado text, lista boolean, exigida boolean, n_evidencias int, publicas int, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.thi_exige_admin();
  return query
  select r.id, r.indicador, r.unidad, r.estado, coalesce(p.lista, false),
         public.thi_evidencia_exigida(r.id),
         public.thi_n_evidencias(r.id),
         ((select count(*) from public.thi_evidencias e where e.respuesta_id = r.id and e.publica)
          + (select count(*) from public.ranking_evidence e where e.response_id = r.id and e.kind <> 'nota' and e.publica))::int,
         case
           when r.estado <> 'ok' then 'La respuesta no está aprobada.'
           when public.thi_evidencia_exigida(r.id) and public.thi_n_evidencias(r.id) = 0 then 'La metodología exige evidencia y no tiene ninguna.'
           else '' end
    from public.ranking_responses r
    left join public.thi_publicaciones p on p.ciclo_id = r.ciclo and p.indicador = r.indicador and p.unidad = r.unidad
   where r.ciclo = p_ciclo and r.estado <> 'none'
   order by r.indicador;
end;
$$;

/** Marca o desmarca una respuesta aprobada como «lista para la entrega a THE». Solo la administración. */
create or replace function public.thi_marcar_lista(p_ciclo uuid, p_indicador text, p_unidad uuid, p_lista boolean, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.ranking_responses;
begin
  perform public.thi_exige_admin();
  select * into r from public.ranking_responses where ciclo = p_ciclo and indicador = p_indicador and unidad = p_unidad;
  if not found then raise exception 'No hay respuesta de esa oficina para ese indicador.' using errcode = 'check_violation'; end if;
  if coalesce(p_lista, false) then
    if r.estado <> 'ok' then
      raise exception 'Solo se marca como lista una respuesta aprobada.' using errcode = 'check_violation';
    end if;
    if public.thi_evidencia_exigida(r.id) and public.thi_n_evidencias(r.id) = 0 then
      raise exception 'La metodología de THE exige evidencia para este indicador y todavía no tiene ninguna.' using errcode = 'check_violation';
    end if;
  end if;
  insert into public.thi_publicaciones (ciclo_id, indicador, unidad, lista, nota, marcada_por, marcada_at)
  values (p_ciclo, p_indicador, p_unidad, coalesce(p_lista, false), nullif(btrim(left(coalesce(p_nota, ''), 400)), ''), auth.uid(), now())
  on conflict (ciclo_id, indicador, unidad) do update
    set lista = excluded.lista, nota = excluded.nota, marcada_por = excluded.marcada_por, marcada_at = excluded.marcada_at;
  perform public.thi_bitacora(p_ciclo, r.id, case when coalesce(p_lista, false) then 'lista_para_entrega' else 'retirada_de_entrega' end,
                              null, null, jsonb_build_object('indicador', p_indicador), p_indicador);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['thi_publicacion_estado(uuid)', 'thi_marcar_lista(uuid, text, uuid, boolean, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['thi_encolar_estado(public.ranking_responses, public.ranking_responses)', 'thi_encolar_asignacion(uuid, text, uuid, text)',
                           'thi_respuestas_tg()', 'thi_asignaciones_tg()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
