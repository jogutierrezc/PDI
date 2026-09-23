-- =============================================================================
-- PDI · 0071 · Impacto: el flujo de tres niveles y las bandejas de revisión
--
--   borrador ──► enviado ──► aprobado_decanatura ──► validado
--                  │  ▲              │
--                  ▼  │              ▼
--          devuelto_programa ◄── devuelto_decanatura
--
--   imp_my_review_scope   qué revisa quien pregunta: los programas donde
--                         aprueba (decanatura, heredado desde la facultad) y
--                         las funciones que valida (vicerrectoría).
--   imp_review            aprobar, devolver o validar uno o varios registros.
--                         Una transición por registro; todo o nada.
--
-- QUIÉN PUEDE QUÉ
--   · Decanatura (impacto.aprobar en el programa o en una unidad superior):
--     desde «enviado» o «devuelto_decanatura», aprueba o devuelve al programa.
--   · Vicerrectoría (impacto.validar en la vicerrectoría de la función del
--     indicador): desde «aprobado_decanatura», valida o devuelve a la
--     decanatura. Nunca al programa directamente.
--   · Devolver exige un motivo de la lista cerrada y un comentario.
--   · Un registro validado no se mueve: imp_transition_allowed (0064) no
--     tiene ninguna salida desde «validado» y el RLS de 0064 no deja editarlo.
--
-- SEPARACIÓN DE FUNCIONES
--   Nadie aprueba ni valida un registro que capturó: quien lo capturó
--   (captured_by), quien lo guardó por última vez (updated_by) y quien lo
--   envió (actor de una transición a «enviado») quedan fuera.
--
-- Requiere 0069 (captured_by, imp_capture_rows). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qué revisa quien pregunta
-- -----------------------------------------------------------------------------

create or replace function public.imp_my_review_scope()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deanPrograms', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'faculty', f.name) order by f.name, u.name)
        from public.units u
        left join public.units f on f.id = u.parent_id
       where u.kind = 'programa'
         and public.imp_can('impacto.aprobar', u.id, true)
    ), '[]'::jsonb),
    'functions', to_jsonb(public.imp_validator_functions())
  );
$$;

comment on function public.imp_my_review_scope() is
  'Programas donde quien pregunta aprueba (decanatura) y funciones que valida (vicerrectoría).';

-- ¿Participó quien pregunta en el registro? Capturarlo, guardarlo o enviarlo.
create or replace function public.imp_is_own_record(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.imp_records r
       where r.id = target and auth.uid() in (r.captured_by, r.updated_by))
    or exists (
      select 1 from public.imp_transitions t
       where t.record_id = target and t.to_state = 'enviado' and t.actor_id = auth.uid());
$$;

comment on function public.imp_is_own_record(uuid) is
  'Verdadero si quien pregunta capturó, guardó o envió el registro: entonces no puede aprobarlo ni validarlo.';

-- -----------------------------------------------------------------------------
-- 2. Aprobar, devolver, validar
-- -----------------------------------------------------------------------------

create or replace function public.imp_review(record_ids uuid[], action text, reason text default null, comment text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  target_state text;
  n integer := 0;
begin
  if action not in ('aprobar', 'devolver', 'validar') then
    raise exception 'Acción desconocida: %.', action using errcode = '22023';
  end if;
  if coalesce(array_length(record_ids, 1), 0) = 0 then
    raise exception 'No hay registros que revisar.' using errcode = '22023';
  end if;
  if action = 'devolver' and (reason is null or length(trim(coalesce(comment, ''))) = 0) then
    raise exception 'Para devolver hay que elegir un motivo de la lista y escribir un comentario.' using errcode = '23514';
  end if;

  for rec in
    select r.id, r.state, a.program_id, i.function_id, i.code, c.name as campus_name
      from public.imp_records r
      join public.imp_assignments a on a.id = r.assignment_id
      join public.imp_indicators i on i.id = a.indicator_id
      left join public.campuses c on c.id = a.campus_id
     where r.id = any (record_ids)
     order by i.code
     for update of r
  loop
    -- Qué papel ejerce quien pregunta sobre este registro, según su estado.
    if rec.state in ('enviado', 'devuelto_decanatura') then
      if not public.imp_can('impacto.aprobar', rec.program_id, true) then
        raise exception '%: solo la decanatura del programa decide sobre este registro.', rec.code using errcode = '42501';
      end if;
      if action = 'validar' then
        raise exception '%: la decanatura aprueba o devuelve; validar es de la vicerrectoría.', rec.code using errcode = '23514';
      end if;
      target_state := case action when 'aprobar' then 'aprobado_decanatura' else 'devuelto_programa' end;
    elsif rec.state = 'aprobado_decanatura' then
      if not (rec.function_id = any (public.imp_validator_functions())) then
        raise exception '%: solo la vicerrectoría de su función lo valida.', rec.code using errcode = '42501';
      end if;
      if action = 'aprobar' then
        raise exception '%: ya está aprobado por la decanatura; la vicerrectoría valida o devuelve.', rec.code using errcode = '23514';
      end if;
      -- La vicerrectoría siempre devuelve a la decanatura.
      target_state := case action when 'validar' then 'validado' else 'devuelto_decanatura' end;
    elsif rec.state = 'validado' then
      raise exception '%: está validado y ya no cambia.', rec.code using errcode = '55000';
    else
      raise exception '%: está en «%» y todavía es del programa.', rec.code, rec.state using errcode = '55000';
    end if;

    if public.imp_is_own_record(rec.id) then
      raise exception '%', format('%s%s: usted lo capturó o lo envió; otra persona debe revisarlo.',
        rec.code, coalesce(' (' || rec.campus_name || ')', '')) using errcode = '42501';
    end if;

    insert into public.imp_transitions (record_id, from_state, to_state, actor_id, reason, comment)
    values (rec.id, rec.state, target_state, auth.uid(),
            case when action = 'devolver' then reason end,
            coalesce(trim(comment), ''));
    update public.imp_records set state = target_state where id = rec.id;
    n := n + 1;
  end loop;

  if n <> array_length(record_ids, 1) then
    raise exception 'Algún registro no existe o no es visible.' using errcode = 'P0002';
  end if;
  return n;
end;
$$;

comment on function public.imp_review(uuid[], text, text, text) is
  'Aprueba, devuelve o valida registros según su estado y el papel de quien pregunta. Una transición por registro; todo o nada.';

do $$
declare
  fn text;
begin
  foreach fn in array array['imp_my_review_scope()', 'imp_is_own_record(uuid)', 'imp_review(uuid[], text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
