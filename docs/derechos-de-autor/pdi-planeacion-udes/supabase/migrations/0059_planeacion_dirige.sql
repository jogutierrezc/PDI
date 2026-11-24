-- =============================================================================
-- PDI · 0059 · Planeación nombra la dirección de cada unidad
--
-- La 0057 dejó `unit_can_lead` en «el jefe de la unidad, o un administrador».
-- Eso tiene un agujero de arranque: al crear una unidad nueva todavía no hay
-- jefe, así que no hay quien nombre al primero. Planeación creaba la facultad
-- y se quedaba mirándola, sin poder darle a nadie el mando.
--
-- Quien reparte la dirección es quien mantiene el organigrama, y eso es
-- Planeación. Así que dirigir una unidad pasa a ser:
--
--   · quien tiene rol de Planeación o de administración, en cualquier unidad;
--   · el jefe de esa unidad, o de una de la que cuelga.
--
-- Qué NO cambia, y es a propósito:
--
--   `unit_can_edit` sigue siendo de la unidad. Planeación nombra a quien
--   dirige, crea tableros y los reparte, pero no escribe las cifras de una
--   facultad ajena. Mandar y redactar son cosas distintas, y mezclarlas
--   convertiría a Planeación en responsable de datos que no reporta.
--
-- Como `unit_can_lead` gobierna también `boards_write` (0058), esto da a
-- Planeación lo que faltaba: crear un tablero y decidir a qué oficina cuelga.
--
-- Requiere 0057. Idempotente: solo reemplaza la función.
-- =============================================================================

create or replace function public.unit_can_lead(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role_at_least('planeacion')
      or public.unit_role_at(target) = 'jefe';
$$;

comment on function public.unit_can_lead(uuid) is
  'Reparte accesos, crea tableros y los cuelga de una unidad: Planeación y administración en cualquiera, y el jefe en la suya. Escribir las cifras sigue siendo de la unidad (unit_can_edit).';

notify pgrst, 'reload schema';
