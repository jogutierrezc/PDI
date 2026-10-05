-- =============================================================================
-- 0131 · Mr. Pilo: «Mis notas», la conexión de solo lectura con Génesis.
--
-- Un estudiante con cuenta de Pilo conecta Génesis (el portal del estudiante)
-- con su propio código y contraseña, y la función pilo-genesis le muestra su
-- histórico de notas. La función es un puente sin estado: no guarda la
-- contraseña, el permiso ni las notas. Lo único que necesita de la base es
-- saber A DÓNDE llamar, y eso lo decide la administración, nunca el navegador.
--
--   pilo_spaces               suma genesis_on y genesis_url, en la ficha de
--                             «ensenanza» (igual que moodle_on y moodle_url,
--                             0116). Nace apagada y sin dirección: mientras
--                             siga así, la app dice que Mis notas aún no está
--                             disponible. No salen en la configuración pública.
--
-- La dirección solo puede ser https, sin usuario, consulta ni ancla, y —a
-- diferencia de la de Moodle— puede llevar un puerto: Génesis atiende en uno
-- propio. La función revisa además que sea un dominio público y que no
-- resuelva a una red interna.
--
-- Aquí no hay ningún secreto: Génesis no usa un token de la universidad, cada
-- estudiante entra con lo suyo. La firma del permiso usa un secreto de la
-- función (PILO_GENESIS_SECRET), que no vive en la base.
--
-- Quién la cambia: la política de pilo_spaces (0113) ya deja la ficha solo a
-- la administración; para las personas del portal esta migración no abre
-- ningún permiso nuevo. La función del servidor (rol de servicio) la lee, y
-- eso se deja dicho aquí en vez de fiarse de los permisos de partida del
-- proyecto. No la cambia.
--
-- Sin UPDATE ni DELETE. Requiere 0113. Idempotente. No toca ninguna fila.
-- =============================================================================

alter table public.pilo_spaces add column if not exists genesis_on boolean not null default false;
alter table public.pilo_spaces add column if not exists genesis_url text not null default '';

alter table public.pilo_spaces drop constraint if exists pilo_spaces_genesis_url;
alter table public.pilo_spaces add constraint pilo_spaces_genesis_url
  check (
    genesis_url = ''
    or (genesis_url ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$' and length(genesis_url) <= 300)
  );

-- Encendida, tiene que haber a dónde llamar.
alter table public.pilo_spaces drop constraint if exists pilo_spaces_genesis_on;
alter table public.pilo_spaces add constraint pilo_spaces_genesis_on check (not genesis_on or genesis_url <> '');

-- La función pilo-genesis (y pilo-clases, para lo de Moodle) lee la ficha con el rol de servicio.
grant select on public.pilo_spaces to service_role;

comment on column public.pilo_spaces.genesis_on is 'Mis notas (0131): si los estudiantes pueden conectar Génesis desde la app. Apagada de partida.';
comment on column public.pilo_spaces.genesis_url is 'La dirección de entrada de Génesis (solo https; puede llevar puerto). La lee la función pilo-genesis; nunca viene del navegador.';

notify pgrst, 'reload schema';
