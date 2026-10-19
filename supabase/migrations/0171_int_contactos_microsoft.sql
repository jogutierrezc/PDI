-- =============================================================================
-- 0171 · Contactos: correo confirmado por Microsoft y dominios institucionales
--
-- El enlace público de Contactos (0167) ya identifica a quien aporta con nombre,
-- cargo y correo declarados. Aquí se suman dos cosas:
--
--   1. «Continuar con Microsoft»: la función int-contactos valida la cuenta
--      institucional de la persona y llama a int_contactos_identificar_microsoft,
--      que deja el aportante con `correo_verificado = true`. Quien se identifica a
--      mano sigue en falso (y si vuelve a entrar a mano con un correo que estaba
--      verificado, vuelve a falso: ya nadie lo confirmó).
--   2. Los cinco dominios institucionales de la UDES (udes.edu.co, valledupar.,
--      cucuta., bogota. y mail.udes.edu.co) se aceptan SIEMPRE, además de los de la
--      invitación. Una invitación sin dominios sigue sin restringir a nadie.
--
-- La identificación pasa a una sola función privada (int_contactos_identificar_base)
-- con dos puertas: la de siempre y la de Microsoft. Las dos las llama solo la
-- función int-contactos con la clave de servicio.
--
-- Requiere 0167. Idempotente. Sin DELETE.
-- =============================================================================

create or replace function public.int_contactos_identificar_base(p_token text, p_nombre text, p_cargo text, p_correo text, p_campus uuid, p_hash text, p_verificado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.int_invitaciones := public.int_contactos_activa(p_token);
  v_campus uuid := coalesce(i.campus_id, p_campus);
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_dominio text := split_part(lower(btrim(coalesce(p_correo, ''))), '@', 2);
  -- Los cinco dominios institucionales: se aceptan siempre (y sus subdominios).
  v_institucionales text[] := array['udes.edu.co', 'valledupar.udes.edu.co', 'cucuta.udes.edu.co', 'bogota.udes.edu.co', 'mail.udes.edu.co'];
  a public.int_aportantes;
begin
  if p_hash is null or length(p_hash) <> 64 then
    raise exception 'Sesión no válida.' using errcode = '22023';
  end if;
  if v_campus is null or not exists (select 1 from public.campuses c where c.id = v_campus) then
    raise exception 'Elija su campus.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 or length(btrim(coalesce(p_cargo, ''))) < 2 then
    raise exception 'Escriba su nombre completo y su cargo.' using errcode = '22023';
  end if;
  if v_correo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'El correo no tiene forma de correo.' using errcode = '22023';
  end if;
  if cardinality(i.dominios) > 0 and not exists (
    select 1 from unnest(i.dominios || v_institucionales) d where v_dominio = lower(d) or v_dominio like '%.' || lower(d)
  ) then
    raise exception 'Use su correo institucional.' using errcode = '22023';
  end if;
  if (select count(*) from public.int_aportantes x where x.invitacion_id = i.id and x.creado_en > now() - interval '1 hour') > 80 then
    raise exception 'Hay demasiados ingresos seguidos. Intente de nuevo en un rato.' using errcode = 'P0007';
  end if;

  insert into public.int_aportantes (invitacion_id, nombre, cargo, correo, campus_id, sesion_hash, correo_verificado)
  values (i.id, btrim(p_nombre), btrim(p_cargo), v_correo, v_campus, p_hash, coalesce(p_verificado, false))
  on conflict (invitacion_id, (lower(correo))) do update
    set nombre = excluded.nombre, cargo = excluded.cargo, campus_id = excluded.campus_id, sesion_hash = excluded.sesion_hash,
        correo_verificado = excluded.correo_verificado
  returning * into a;

  return jsonb_build_object(
    'aportante_id', a.id, 'nombre', a.nombre, 'cargo', a.cargo, 'correo', a.correo, 'campus_id', a.campus_id,
    'correo_verificado', a.correo_verificado,
    'enviados', (select count(*) from public.int_filas f where f.aportante_id = a.id and f.periodo_id = i.periodo_id)
  );
end;
$$;

/** Identifica a la persona a mano (la crea o la reconoce por su correo): el correo queda sin verificar. */
create or replace function public.int_contactos_identificar(p_token text, p_nombre text, p_cargo text, p_correo text, p_campus uuid, p_hash text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.int_contactos_identificar_base(p_token, p_nombre, p_cargo, p_correo, p_campus, p_hash, false);
$$;

/** La función ya validó la cuenta de Microsoft: el correo queda confirmado. Solo la llama int-contactos. */
create or replace function public.int_contactos_identificar_microsoft(p_token text, p_nombre text, p_cargo text, p_correo text, p_campus uuid, p_hash text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.int_contactos_identificar_base(p_token, p_nombre, p_cargo, p_correo, p_campus, p_hash, true);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'int_contactos_identificar_base(text, text, text, text, uuid, text, boolean)',
    'int_contactos_identificar(text, text, text, text, uuid, text)',
    'int_contactos_identificar_microsoft(text, text, text, text, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
