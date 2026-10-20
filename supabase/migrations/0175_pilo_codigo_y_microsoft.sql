-- =============================================================================
-- 0175 · Pilo: código de verificación al crear la cuenta, ingreso con Microsoft
--        y los administrativos de Bogotá.
--
-- Hasta aquí una cuenta de Pilo nacía confirmada sin comprobar que el correo
-- fuera de quien se registra. Desde aquí, antes de pedir el resto de los datos,
-- Pilo envía un código de 6 cifras al correo de la UDES y la cuenta solo se crea
-- con ese código verificado. Quien entra con «Continuar con Microsoft» no lo
-- necesita: Microsoft ya comprobó el correo.
--
--   correo_codigos           los códigos de un solo uso. NO guarda el código ni
--                            el correo: solo huellas con sal (las calcula la
--                            función de cuentas). Cada fila lleva su vigencia,
--                            sus intentos y, ya verificado, la huella del
--                            «tiquete» que autoriza crear la cuenta.
--   correo_codigo_emitir     guarda un código nuevo e invalida el anterior;
--                            respeta la espera entre envíos y un tope por hora.
--   correo_codigo_verificar  compara el código; con intentos limitados. Si
--                            coincide, deja la huella del tiquete (30 minutos).
--   correo_codigo_ticket     comprueba, y con p_consume gasta, ese tiquete.
--
-- Solo el rol de servicio llega a estas funciones; nadie del portal.
--
-- Además:
--   · pilo_email_rule acepta @bogota.udes.edu.co (administrativo o profesor,
--     sede Bogotá), igual que ya hacía con Cúcuta y Valledupar.
--   · correo_log admite el tipo «codigo» en la bitácora de Correos.
--
-- Vuelta atrás: quitar el código del registro es dejar de pedirlo en la función
-- `pilo-cuentas` (PILO_CODIGO_REGISTRO=no). Las tablas pueden quedarse.
--
-- Todo DELETE y UPDATE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Qué correo acepta Pilo (agrega Bogotá).
-- -----------------------------------------------------------------------------

create or replace function public.pilo_email_rule(p_email text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_email, '')) !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+$' then null
    else case split_part(lower(p_email), '@', 2)
      when 'mail.udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('estudiante', 'profesor'), 'campus', '')
      when 'udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('administrativo', 'profesor'), 'campus', '')
      when 'bucaramanga.udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('administrativo', 'profesor'), 'campus', 'bucaramanga')
      when 'bogota.udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('administrativo', 'profesor'), 'campus', 'bogota')
      when 'cucuta.udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('administrativo', 'profesor'), 'campus', 'cucuta')
      when 'valledupar.udes.edu.co' then jsonb_build_object('roles', jsonb_build_array('administrativo', 'profesor'), 'campus', 'valledupar')
      else null
    end
  end;
$$;

revoke all on function public.pilo_email_rule(text) from public;
grant execute on function public.pilo_email_rule(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- La bitácora de Correos reconoce los códigos.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.correo_log') is not null then
    alter table public.correo_log drop constraint if exists correo_log_kind;
    alter table public.correo_log add constraint correo_log_kind check (kind in ('cuenta', 'prueba', 'aviso', 'codigo'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Los códigos.
-- -----------------------------------------------------------------------------

create table if not exists public.correo_codigos (
  id            bigint generated always as identity primary key,
  -- Para qué se pidió: hoy solo 'pilo_registro'.
  purpose       text not null,
  -- Huella con sal del correo y del código: nunca el correo ni el código.
  email_hash    text not null,
  code_hash     text not null,
  -- La huella del tiquete que se entrega al verificar; vacía hasta entonces.
  ticket_hash   text not null default '',
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  verified_at   timestamptz,
  used_at       timestamptz,
  constraint correo_codigos_purpose check (purpose ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint correo_codigos_hashes check (email_hash ~ '^[0-9a-f]{16,64}$' and code_hash ~ '^[0-9a-f]{16,64}$' and ticket_hash ~ '^[0-9a-f]{0,64}$'),
  constraint correo_codigos_tries check (attempts >= 0 and max_attempts between 1 and 20)
);

comment on table public.correo_codigos is
  'Correos (0175): códigos de un solo uso. Solo huellas con sal, nunca el correo ni el código. Solo el rol de servicio, por las funciones correo_codigo_*.';

create index if not exists correo_codigos_lookup_idx on public.correo_codigos (purpose, email_hash, created_at desc);

alter table public.correo_codigos enable row level security;
revoke all on public.correo_codigos from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Emitir.
-- -----------------------------------------------------------------------------

create or replace function public.correo_codigo_emitir(
  p_purpose text,
  p_email text,
  p_code text,
  p_ttl integer default 600,
  p_wait integer default 60,
  p_tries integer default 5,
  p_hourly integer default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_recent integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de cuentas emite códigos.' using errcode = '42501';
  end if;
  -- Dos pedidos a la vez para el mismo correo no emiten dos códigos.
  perform pg_advisory_xact_lock(hashtext(p_purpose || p_email));

  select max(c.created_at) into v_last
    from public.correo_codigos c
   where c.purpose = p_purpose and c.email_hash = p_email and c.used_at is null;
  if v_last is not null and v_last > now() - make_interval(secs => p_wait) then
    return jsonb_build_object('ok', false, 'reason', 'espera',
      'wait', greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => p_wait) - now())))::integer));
  end if;

  select count(*) into v_recent
    from public.correo_codigos c
   where c.purpose = p_purpose and c.email_hash = p_email and c.created_at > now() - interval '1 hour';
  if v_recent >= p_hourly then
    return jsonb_build_object('ok', false, 'reason', 'limite', 'wait', 3600);
  end if;

  -- El anterior deja de servir.
  update public.correo_codigos set used_at = now()
   where purpose = p_purpose and email_hash = p_email and used_at is null;
  delete from public.correo_codigos where created_at < now() - interval '1 day';

  insert into public.correo_codigos (purpose, email_hash, code_hash, max_attempts, expires_at)
  values (p_purpose, p_email, p_code, p_tries, now() + make_interval(secs => p_ttl));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.correo_codigo_emitir(text, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.correo_codigo_emitir(text, text, text, integer, integer, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Verificar.
-- -----------------------------------------------------------------------------

create or replace function public.correo_codigo_verificar(p_purpose text, p_email text, p_code text, p_ticket text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.correo_codigos;
  v_left integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de cuentas verifica códigos.' using errcode = '42501';
  end if;
  select * into r
    from public.correo_codigos c
   where c.purpose = p_purpose and c.email_hash = p_email and c.used_at is null and c.verified_at is null
   order by c.created_at desc
   limit 1
   for update;
  if not found or r.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'vencido');
  end if;
  if r.attempts >= r.max_attempts then
    return jsonb_build_object('ok', false, 'reason', 'bloqueado');
  end if;
  if r.code_hash = p_code then
    update public.correo_codigos
       set verified_at = now(), ticket_hash = p_ticket, expires_at = now() + interval '30 minutes'
     where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  v_left := r.max_attempts - r.attempts - 1;
  update public.correo_codigos set attempts = attempts + 1 where id = r.id;
  return jsonb_build_object('ok', false, 'reason', case when v_left <= 0 then 'bloqueado' else 'incorrecto' end, 'left', greatest(v_left, 0));
end;
$$;

revoke all on function public.correo_codigo_verificar(text, text, text, text) from public, anon, authenticated;
grant execute on function public.correo_codigo_verificar(text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- El tiquete: comprobarlo, o gastarlo.
-- -----------------------------------------------------------------------------

create or replace function public.correo_codigo_ticket(p_purpose text, p_email text, p_ticket text, p_consume boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de cuentas comprueba tiquetes.' using errcode = '42501';
  end if;
  if coalesce(p_ticket, '') = '' then
    return false;
  end if;
  if p_consume then
    update public.correo_codigos set used_at = now()
     where purpose = p_purpose and email_hash = p_email and ticket_hash = p_ticket
       and verified_at is not null and used_at is null and expires_at > now();
    return found;
  end if;
  return exists (
    select 1 from public.correo_codigos c
     where c.purpose = p_purpose and c.email_hash = p_email and c.ticket_hash = p_ticket
       and c.verified_at is not null and c.used_at is null and c.expires_at > now()
  );
end;
$$;

revoke all on function public.correo_codigo_ticket(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.correo_codigo_ticket(text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
