-- =============================================================================
-- Pilo Astra · sin tope de tokens (0285)
--
-- El razonamiento de Astra gasta tokens antes de responder; con un tope de 4000
-- las presentaciones (y las respuestas largas) se cortaban. 0 = sin tope: la
-- función no manda `max_tokens` y el servidor propio decide. Se mantiene el
-- máximo anterior como techo opcional (hasta 64000).
--
-- Idempotente. Todo UPDATE lleva WHERE (ver 0095).
-- =============================================================================

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pw_config'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%astra_max_tokens%'
  loop
    execute format('alter table public.pw_config drop constraint %I', c);
  end loop;
end $$;

alter table public.pw_config
  add constraint pw_config_astra_max_tokens_check check (astra_max_tokens between 0 and 64000);

alter table public.pw_config alter column astra_max_tokens set default 0;

-- Quien nunca lo tocó (sigue en el valor de fábrica) queda sin tope.
update public.pw_config set astra_max_tokens = 0 where astra_max_tokens = 4000;
