-- =============================================================================
-- 0177 · Correos: plantillas propias, modo HTML y su alcance.
--
-- Hasta aquí las plantillas eran las siete de fábrica (0137): la administración
-- cambiaba sus textos, pero no podía crear otras. Esta migración da tres cosas:
--
--   · Plantillas propias. La administración crea una plantilla (desde cero o
--     copiando otra) con clave que empieza por «c-», y la borra cuando ya no sirve.
--     Las siete de fábrica no se crean, no se borran y no cambian de clave ni de
--     identidad. Una plantilla propia no se envía sola: solo sale con «Enviar una
--     prueba», hasta que alguien la conecte a un evento.
--   · Qué lleva el correo (`tipo`): enlace personal, código para escribir o aviso.
--   · Modo HTML (`html`): el cuerpo se escribe en HTML en vez de por campos, con
--     alcance «solo el cuerpo» (la cabecera y el pie de la marca se mantienen) o
--     «el correo completo» (`html_scope`). Al enviar, la función quita scripts,
--     formularios y eventos antes de armar el correo.
--
-- Nada de esto cambia el texto de las plantillas de fábrica: las columnas nuevas
-- tienen valor por defecto (enlace, sin HTML, solo el cuerpo), y el correo sale
-- igual mientras nadie use el modo HTML.
--
-- correo_context no cambia: ya devuelve to_jsonb(t) de cada fila, así que las
-- columnas nuevas llegan a la función sin tocarla.
--
-- Todo UPDATE y DELETE de esta migración lleva WHERE (ver 0095). Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas nuevas. Las filas existentes quedan con los valores por defecto.
-- -----------------------------------------------------------------------------

alter table public.correo_templates add column if not exists tipo text not null default 'enlace';
alter table public.correo_templates add column if not exists html text;
alter table public.correo_templates add column if not exists html_scope text not null default 'cuerpo';

alter table public.correo_templates drop constraint if exists correo_templates_tipo;
alter table public.correo_templates add constraint correo_templates_tipo check (tipo in ('enlace', 'codigo', 'aviso'));

alter table public.correo_templates drop constraint if exists correo_templates_html_scope;
alter table public.correo_templates add constraint correo_templates_html_scope check (html_scope in ('cuerpo', 'completo'));

-- El HTML tiene tope de 100 000 caracteres: más que eso no es un correo.
alter table public.correo_templates drop constraint if exists correo_templates_html;
alter table public.correo_templates add constraint correo_templates_html check (html is null or length(html) <= 100000);

comment on column public.correo_templates.tipo is
  'Correos (0177): qué lleva el correo: enlace (botón personal), codigo (un código para escribir) o aviso (sin enlace obligatorio).';
comment on column public.correo_templates.html is
  'Correos (0177): el HTML que escribió la administración, o nulo si el correo se escribe por campos. La función lo sanea antes de enviarlo.';
comment on column public.correo_templates.html_scope is
  'Correos (0177): cuerpo = el HTML va dentro de la marca (cabecera y pie); completo = es el correo entero.';

-- -----------------------------------------------------------------------------
-- Quién crea y borra. Solo la administración, solo plantillas propias («c-…»).
-- Las de fábrica no tienen esas claves: ninguna política las deja borrarse.
-- -----------------------------------------------------------------------------

drop policy if exists correo_templates_admin_insert on public.correo_templates;
create policy correo_templates_admin_insert on public.correo_templates
  for insert to authenticated
  with check (public.has_role_at_least('admin') and key like 'c-%');

drop policy if exists correo_templates_admin_delete on public.correo_templates;
create policy correo_templates_admin_delete on public.correo_templates
  for delete to authenticated
  using (public.has_role_at_least('admin') and key like 'c-%');

-- Quién la creó y cuándo también al insertar, no solo al cambiarla.
drop trigger if exists correo_templates_touch on public.correo_templates;
create trigger correo_templates_touch before insert or update on public.correo_templates
  for each row execute function public.correo_touch();

-- -----------------------------------------------------------------------------
-- Permisos por columna: la clave, la identidad y el nombre de grupo no se cambian
-- desde el portal; el texto, el tipo y el HTML, sí. (Se amplía el grant de 0137.)
-- -----------------------------------------------------------------------------

grant insert (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, role_bodies, active, sort, tipo, html, html_scope)
  on public.correo_templates to authenticated;
grant delete on public.correo_templates to authenticated;
grant update (subject, preheader, title, greeting, body, button, note, role_bodies, active, tipo, html, html_scope)
  on public.correo_templates to authenticated;
