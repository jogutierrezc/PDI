-- =============================================================================
-- PDI · 0060 · Un jefe manda en lo suyo y en nada más
--
-- LO QUE ESTABA MAL
--
-- La 0057 y la 0059 usaron `has_role_at_least('planeacion')` como si
-- significara «mantiene el organigrama». No significa eso. En la escalera
-- clásica (0001) `planeacion` quiere decir «edita cualquier pilar y decide qué
-- se publica», y lo tiene mucha gente: decanaturas, coordinaciones,
-- direcciones de área. Cualquiera de ellas, además puesta como jefe de su
-- unidad, se llevaba de regalo:
--
--   · crear, mover y borrar unidades de todo el organigrama;
--   · mandar en unidades ajenas, y con ello borrar sus tableros;
--   · leer los tableros de facultades con las que no tiene relación.
--
-- No era un descuido de una política suelta: era usar un rol de propósito
-- general como si fuera un rol de propiedad.
--
-- CÓMO QUEDA
--
--   Estructura del organigrama      solo `admin`. Crear, mover o borrar una
--   (units)                         unidad cambia a quién pertenece todo lo
--                                   que cuelga de ella; es un acto
--                                   institucional, no de gestión diaria.
--
--   Nombrar a la gente de una       `unit_can_staff`: `planeacion` o `admin`
--   unidad (unit_members)           en cualquiera —hace falta para nombrar al
--                                   primer jefe de una unidad recién creada—
--                                   y el jefe en la suya y en las que cuelgan.
--
--   Crear y borrar tableros         `unit_can_lead`: `admin`, o el jefe de esa
--   (boards)                        unidad o de una de la que cuelga. Ya no
--                                   basta con tener rol de Planeación: borrar
--                                   el tablero de otra facultad no es de nadie
--                                   más que de esa facultad.
--
--   Leer                            `unit_can_view` no cambia: Planeación lee
--   (unit_can_view)                 los datos de todas las unidades, que es lo
--                                   que se pidió y lo que necesita para
--                                   revisar lo que se manda publicar. Leer no
--                                   destruye.
--
-- Separar `staff` de `lead` es el fondo del arreglo: nombrar la dirección y
-- mandar en el contenido son dos cosas distintas, y antes estaban en la misma
-- función.
--
-- Requiere 0057. Sustituye lo que hizo la 0059. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mandar en una unidad: su jefe, y la administración
-- -----------------------------------------------------------------------------

create or replace function public.unit_can_lead(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('admin')
      or public.unit_role_at(target) = 'jefe';
$$;

comment on function public.unit_can_lead(uuid) is
  'Crea y borra los tableros de una unidad: su jefe —o el de una de la que cuelga— y la administración. Tener rol de Planeación no basta: el tablero de una facultad es de esa facultad.';

-- -----------------------------------------------------------------------------
-- 2. Nombrar a la gente: eso sí es de Planeación
--
-- Va aparte de `unit_can_lead` a propósito. Al crear una unidad todavía no hay
-- jefe, así que alguien de fuera tiene que nombrar al primero; pero poder
-- nombrarlo no es poder borrarle sus tableros.
-- -----------------------------------------------------------------------------

create or replace function public.unit_can_staff(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or public.unit_role_at(target) = 'jefe';
$$;

comment on function public.unit_can_staff(uuid) is
  'Reparte los papeles de una unidad: Planeación y administración en cualquiera —hace falta para nombrar al primer jefe— y el jefe en la suya y en las que cuelgan de ella.';

drop policy if exists unit_members_write on public.unit_members;
create policy unit_members_write on public.unit_members for all to authenticated
  using (public.unit_can_staff(unit_id))
  with check (public.unit_can_staff(unit_id));

-- -----------------------------------------------------------------------------
-- 3. El organigrama es institucional
--
-- Mover una unidad de sitio cambia de quién heredan sus programas y, con ello,
-- quién ve sus cifras. No es una corrección de forma.
-- -----------------------------------------------------------------------------

drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (public.has_role_at_least('admin'))
  with check (public.has_role_at_least('admin'));

-- -----------------------------------------------------------------------------
-- 4. Que quede dicho en el propio tablero
-- -----------------------------------------------------------------------------

comment on policy boards_write on public.boards is
  'Crear, corregir y borrar un tablero: el jefe de su unidad o de una de la que cuelga, y la administración.';

notify pgrst, 'reload schema';
