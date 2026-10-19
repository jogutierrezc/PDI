-- =============================================================================
-- PDI · 0170 · Correos: servidor sin cifrado (Mailpit)
--
-- La conexión SMTP de «Sistema › Correos» solo admitía STARTTLS o SSL/TLS.
-- Mailpit (y otros servidores de pruebas) habla SMTP plano, sin cifrado y
-- sin usuario, en el puerto 1025. Se admite el valor 'none' en
-- correo_settings.smtp_security. Nada más cambia. Requiere 0137. Idempotente.
-- =============================================================================

alter table public.correo_settings drop constraint if exists correo_settings_security;
alter table public.correo_settings
  add constraint correo_settings_security check (smtp_security in ('starttls', 'ssl', 'none'));

comment on column public.correo_settings.smtp_security is
  'starttls (587), ssl (465) o none (sin cifrado, para Mailpit en 1025: solo servidores de pruebas o de la red interna).';

notify pgrst, 'reload schema';
