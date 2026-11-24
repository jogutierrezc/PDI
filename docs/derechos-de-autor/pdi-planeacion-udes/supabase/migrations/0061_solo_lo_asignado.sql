-- =============================================================================
-- PDI · 0061 · Sin asignación no se ve
--
-- Se retira la lectura general de Planeación. Hasta aquí, quien tuviera el rol
-- clásico `planeacion` leía los datos de todas las unidades; y como ese rol lo
-- tiene mucha gente —decanaturas, coordinaciones, direcciones de área—, en la
-- práctica media universidad veía los tableros de la otra media.
--
-- Un tablero se ve por una de tres razones, y por ninguna más:
--
--   1. Se pertenece a su unidad, o a una de la que cuelga.
--   2. Está compartido: «toda la universidad» lo abre quien tenga sesión,
--      «público» lo abre cualquiera.
--   3. Su unidad pidió publicarlo y la solicitud está abierta. Entonces, y
--      solo entonces, Planeación entra a revisarlo.
--
-- La tercera es la que mantiene vivo el flujo de publicación sin devolver el
-- privilegio: Planeación entra cuando la llaman, no antes, y deja de entrar
-- cuando resuelve. Que alguien tenga que decidir si una cifra sale al portal
-- no le da derecho a leer las que nunca se le mandaron.
--
-- La administración conserva la lectura. No es un olvido: alguien tiene que
-- poder arreglar un desastre, y quitarle el acceso al administrador no
-- protege nada —puede dárselo a sí mismo en dos clics— pero sí deja el
-- sistema sin quien lo repare.
--
-- Requiere 0057, 0058 y 0060. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ver una unidad: los suyos, y la administración
-- -----------------------------------------------------------------------------

create or replace function public.unit_can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin')
      or public.unit_role_at(target) is not null;
$$;

comment on function public.unit_can_view(uuid) is
  'Lee lo de la unidad: quien pertenece a ella o a una de la que cuelga, y la administración. Tener rol de Planeación ya no basta.';

-- -----------------------------------------------------------------------------
-- 2. La puerta de la revisión
--
-- `security definer` porque la usa la política de `boards`, y mirar
-- `board_reviews` desde ahí con RLS puesta se muerde la cola: leer una
-- solicitud depende de poder leer su tablero, y ahora leer el tablero
-- dependería de la solicitud.
-- -----------------------------------------------------------------------------

create or replace function public.board_under_review(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- `board_under_review.target` y no `target` a secas: board_reviews tiene
    -- una columna con ese nombre (la visibilidad pedida) y en una función SQL
    -- la columna gana al parámetro.
    select 1 from public.board_reviews r
     where r.board_id = board_under_review.target and r.state = 'pendiente'
  );
$$;

comment on function public.board_under_review(uuid) is
  'Hay una solicitud de publicación abierta sobre este tablero. Es lo que deja entrar a Planeación a revisarlo, y solo mientras dure.';

-- -----------------------------------------------------------------------------
-- 3. Quién ve un tablero
--
-- La comprobación de la revisión va la última a propósito: se evalúa por fila
-- y llama a una función, mientras que las tres anteriores se resuelven con lo
-- que ya está en la fila o con una consulta que el planificador hace una vez.
-- Con decenas de tableros por unidad el coste es despreciable; si algún día
-- fueran miles, esta es la línea que habría que mirar.
-- -----------------------------------------------------------------------------

drop policy if exists boards_read on public.boards;
create policy boards_read on public.boards for select to anon, authenticated
  using (
    visibility = 'publico'
    or (visibility = 'universidad' and auth.uid() is not null)
    or public.unit_can_view(unit_id)
    or (public.has_role_at_least('planeacion') and public.board_under_review(id))
  );

comment on policy boards_read on public.boards is
  'Lo ve quien pertenece a su unidad, quien tenga sesión si está compartido con la universidad, cualquiera si es público, y Planeación mientras haya una solicitud de publicación abierta.';

-- -----------------------------------------------------------------------------
-- 4. La cola de solicitudes
--
-- Planeación tiene que poder leer las solicitudes aunque no vea la unidad: la
-- solicitud va dirigida a ella, y sin esto la cola saldría vacía. Leer la
-- solicitud no es leer el tablero; lo segundo lo concede la política de
-- arriba, y solo mientras esté abierta.
-- -----------------------------------------------------------------------------

drop policy if exists board_reviews_read on public.board_reviews;
create policy board_reviews_read on public.board_reviews for select to authenticated
  using (
    public.has_role_at_least('planeacion')
    or board_id in (select b.id from public.boards b where public.unit_can_view(b.unit_id))
  );

notify pgrst, 'reload schema';
