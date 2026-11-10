-- =============================================================================
-- PDI · 0272 · Informes de gestión · un informe por unidad y por sede
--
-- Requiere 0017 (campuses), 0063/0077 (program_campuses), 0078 (unit_members.campus_id),
-- 0153, 0169 y 0192. Idempotente.
--
-- Hasta ahora había UN informe por unidad y ciclo. Ahora hay uno por unidad, ciclo y sede
-- (Bucaramanga, Cúcuta, Valledupar, Bogotá): Medicina Bucaramanga y Medicina Cúcuta son
-- informes distintos. La sede que cuenta es la de «Dónde trabaja» (unit_members.campus_id).
--
--   informe_instancias.campus_id   la sede del informe; nulo = informe sin sede (oficinas,
--                                  vicerrectorías y todo lo que no se ofrece en sedes).
--   unicidad                       (ciclo_id, unit_id, campus_id), con el nulo como un valor más.
--   informe_sede_ok(unidad, sede)  ¿puede esta persona diligenciar el informe de esa sede?
--   informe_abrir(..., p_campus)   recibe la sede. Se reemplaza la firma de 4 parámetros: dejar
--                                  las dos causaría «más de una función candidata» al llamarla.
--   informe_instancias_guard       rechaza una sede fuera de la pertenencia y no deja cambiarla.
--
-- QUÉ PASA CON LOS INFORMES YA ABIERTOS
--   · Los de unidades que se ofrecen en UNA sola sede (ella, o los programas que cuelgan de
--     ella) quedan con esa sede.
--   · Los de unidades que se ofrecen en varias, o en ninguna, quedan SIN sede. La pantalla
--     trata un informe sin sede como el de la primera sede donde se ofrece la unidad, así que
--     sigue apareciendo donde estaba; las demás sedes se abren aparte desde el Tablero del ciclo.
--   · Nada se borra ni se mueve de unidad. Las secciones, cifras y anexos cuelgan de la
--     instancia, no de la sede.
-- =============================================================================

alter table public.informe_instancias
  add column if not exists campus_id uuid references public.campuses (id) on delete restrict;

comment on column public.informe_instancias.campus_id is
  'Sede del informe (0272). Nulo: informe sin sede, o anterior a las sedes.';

create index if not exists informe_instancias_campus_idx on public.informe_instancias (campus_id);

-- 1. Unicidad por unidad y sede (el nulo cuenta como un valor).
alter table public.informe_instancias drop constraint if exists informe_instancias_unica;
create unique index if not exists informe_instancias_unica_sede
  on public.informe_instancias (ciclo_id, unit_id, (coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- 2. Los informes ya abiertos de unidades que se ofrecen en una sola sede toman esa sede.
with recursive abajo (raiz, id) as (
  select u.id, u.id from public.units u
  union all
  select a.raiz, h.id from abajo a join public.units h on h.parent_id = a.id
),
sedes as (
  select a.raiz as unit_id, pc.campus_id
    from abajo a
    join public.program_campuses pc on pc.program_id = a.id and coalesce(pc.active, true)
   group by a.raiz, pc.campus_id
),
una as (
  select unit_id, (array_agg(campus_id))[1] as campus_id
    from sedes
   group by unit_id
  having count(*) = 1
)
update public.informe_instancias i
   set campus_id = una.campus_id
  from una
 where una.unit_id = i.unit_id
   and i.campus_id is null;

-- 3. ¿Puede esta persona diligenciar el informe de esa sede?
--    Quien gestiona, sí. Sin sede (nulo), sí. Una pertenencia sin sede o con esa sede, sí (la
--    de una unidad de arriba también cuenta). Quien recibe la unidad por su rol de acceso,
--    sí: ese rol no limita por sede.
create or replace function public.informe_sede_ok(unidad uuid, sede uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.informe_gestiona()
      or sede is null
      or exists (select 1 from public.informe_mis_unidades() s where s.unit_id = unidad)
      or exists (
           select 1
             from public.unit_members m
             join public.unit_chain(unidad) c on c.id = m.unit_id
            where m.profile_id = auth.uid()
              and (m.campus_id is null or m.campus_id = sede)
         );
$$;

revoke all on function public.informe_sede_ok(uuid, uuid) from public, anon;
grant execute on function public.informe_sede_ok(uuid, uuid) to authenticated, service_role;

-- 4. Abrir el informe de una unidad en una sede.
drop function if exists public.informe_abrir(uuid, uuid, text, uuid);

create or replace function public.informe_abrir(
  p_ciclo uuid, p_unit uuid, p_plantilla text, p_destino uuid default null, p_campus uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select i.id into v_id
    from public.informe_instancias i
   where i.ciclo_id = p_ciclo and i.unit_id = p_unit and i.campus_id is not distinct from p_campus;
  if v_id is not null then
    return v_id;
  end if;
  if not (public.informe_gestiona() or public.informe_can_edit(p_unit)) then
    raise exception 'Sin permiso para abrir el informe de esta unidad' using errcode = '42501';
  end if;
  if not public.informe_sede_ok(p_unit, p_campus) then
    raise exception 'Su pertenencia no incluye esa sede' using errcode = '42501';
  end if;
  insert into public.informe_instancias (ciclo_id, unit_id, campus_id, plantilla, destino)
  values (p_ciclo, p_unit, p_campus, upper(btrim(p_plantilla)),
          coalesce(p_destino, (select coalesce(u.reports_to, u.parent_id) from public.units u where u.id = p_unit)))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select i.id into v_id
      from public.informe_instancias i
     where i.ciclo_id = p_ciclo and i.unit_id = p_unit and i.campus_id is not distinct from p_campus;
  end if;
  return v_id;
end;
$$;

revoke all on function public.informe_abrir(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.informe_abrir(uuid, uuid, text, uuid, uuid) to authenticated, service_role;

-- 5. El guardián: la sede debe ser de la pertenencia y no se cambia después.
create or replace function public.informe_instancias_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'sent' then
      new.enviado_en := now();
      new.enviado_por := auth.uid();
      new.aprobado_en := null;
      new.aprobado_por := null;
    elsif new.estado = 'ok' then
      new.aprobado_en := now();
      new.aprobado_por := auth.uid();
    else
      new.aprobado_en := null;
      new.aprobado_por := null;
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor := public.informe_actor(new.unit_id);
  if actor is null or actor = 'visor' then
    raise exception 'Sin permiso para cambiar este informe' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if actor <> 'planeacion' then
      if new.estado <> 'draft' then
        raise exception 'Un informe nuevo empieza en borrador' using errcode = '42501';
      end if;
      if not exists (select 1 from public.informe_ciclos c where c.id = new.ciclo_id and c.estado = 'abierto') then
        raise exception 'El ciclo no está abierto' using errcode = '42501';
      end if;
      if not public.informe_sede_ok(new.unit_id, new.campus_id) then
        raise exception 'Su pertenencia no incluye esa sede' using errcode = '42501';
      end if;
    end if;
    new.updated_by := auth.uid();
    return new;
  end if;

  if actor <> 'planeacion' then
    if old.estado in ('sent', 'ok') then
      raise exception 'El informe ya se envió: solo Planeación lo puede cambiar' using errcode = '42501';
    end if;
    if (new.ciclo_id, new.unit_id, new.campus_id, new.plantilla, new.destino, new.nota_revision)
       is distinct from (old.ciclo_id, old.unit_id, old.campus_id, old.plantilla, old.destino, old.nota_revision) then
      raise exception 'Solo Planeación cambia la sede, la plantilla, el destino o la nota de revisión' using errcode = '42501';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    if not public.informe_transicion_permitida(old.estado, new.estado, actor) then
      raise exception 'Cambio de estado no permitido: % → % (%)', old.estado, new.estado, actor
        using errcode = '42501';
    end if;
    if new.estado = 'sent' then
      perform public.informe_validar_envio(new.id);
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

notify pgrst, 'reload schema';
