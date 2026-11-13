-- =============================================================================
-- 0280 · Informes de gestión: un informe por unidad (las facultades son multicampus)
--
-- 0272 partió el informe de una unidad por sede (informe_instancias.campus_id). Las
-- facultades y demás unidades son multicampus: su informe es uno solo. Esta migración
-- deja sin sede (campus_id nulo) el informe de cada unidad en cada ciclo cuando hay
-- uno solo, y avisa de las unidades que tienen varios en el mismo ciclo (uno por sede):
-- esos no se funden solos porque cada uno tiene su texto. La pantalla ya muestra uno
-- por unidad (el más avanzado); Planeación debe dejar uno y pasar a mano lo útil de los
-- demás. Idempotente. No cambia informe_abrir ni la columna: abrir sin sede ya vale.
-- =============================================================================

-- 1. Un solo informe en el ciclo: queda sin sede.
update public.informe_instancias i
   set campus_id = null
 where i.campus_id is not null
   and (select count(*) from public.informe_instancias o
         where o.ciclo_id = i.ciclo_id and o.unit_id = i.unit_id) = 1;

-- 2. Varios en el mismo ciclo (uno por sede): se avisa cuáles son.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select i.ciclo_id, i.unit_id, count(*) as informes
      from public.informe_instancias i
     group by i.ciclo_id, i.unit_id
    having count(*) > 1
  loop
    n := n + 1;
    raise notice 'Informes por sede sin reunir: ciclo %, unidad % (% informes). Deje uno y pase lo útil de los demás.', r.ciclo_id, r.unit_id, r.informes;
  end loop;
  if n = 0 then
    raise notice 'Todas las unidades quedaron con un solo informe por ciclo.';
  end if;
end $$;
