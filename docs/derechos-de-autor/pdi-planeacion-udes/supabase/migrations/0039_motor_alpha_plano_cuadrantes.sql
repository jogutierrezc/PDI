-- =============================================================================
-- Motor Alpha · el plano de cuadrantes (0039)
--
-- Hasta 0037 se guardaban los cuatro conteos de `quadrants`: cuántos evaluados
-- caen en cada cuadrante frente a los promedios nacionales. Con eso se puede
-- decir la cifra, pero no dibujar el plano del artículo, que coloca a cada
-- evaluado por su Saber 11 y su Saber TyT y deja que los dos promedios del país
-- lo partan en cuatro.
--
-- `quad_plane` guarda esa nube en celdas de 5 puntos ("30|110"), igual que
-- `plane` guarda la de esperado × real. Es agregada: una celda reúne evaluados,
-- nunca identifica a una persona.
--
-- Las filas ya importadas se quedan con la nube vacía hasta la próxima
-- importación del cruce del ICFES; mientras tanto la ficha dibuja los cuatro
-- cuadrantes con sus conteos y lo dice.
-- =============================================================================

alter table public.od_saber_tyt_results
  add column if not exists quad_plane jsonb not null default '{}'::jsonb;

alter table public.od_saber_tyt_results drop constraint if exists od_saber_tyt_results_alpha;
alter table public.od_saber_tyt_results
  add constraint od_saber_tyt_results_alpha check (
    jsonb_typeof(plane) = 'object' and jsonb_typeof(quadrants) = 'object' and jsonb_typeof(quad_plane) = 'object'
    and (alpha_n is null or alpha_n >= 0) and (alpha_positive is null or alpha_positive >= 0)
  );

comment on column public.od_saber_tyt_results.quad_plane is
  'Plano de cuadrantes: Saber 11|Saber TyT en celdas de 5 puntos.';

-- La copia de periodo inserta con lista explícita de columnas: se redefine con
-- la nueva para que un periodo copiado no pierda su plano.
create or replace function public.od_copy_saber_tyt(source_report uuid, target_report uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t record;
  new_tyt uuid;
begin
  for t in select * from public.od_saber_tyt where report_id = source_report loop
    insert into public.od_saber_tyt (report_id, key, title, description, note, benchmarks, alpha, office_id, position)
    values (target_report, t.key, t.title, t.description, t.note, t.benchmarks, t.alpha, t.office_id, t.position)
    returning id into new_tyt;

    insert into public.od_saber_tyt_results
      (tyt_id, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved,
       raw_entry, raw_exit, transitions, histogram, scatter,
       alpha_n, alpha_expected, alpha_actual, alpha_va, alpha_positive, plane, quadrants, quad_plane)
    select new_tyt, year, level, program, competency, evaluated, mean_exit, paired, mean_entry, mean_delta, improved,
       raw_entry, raw_exit, transitions, histogram, scatter,
       alpha_n, alpha_expected, alpha_actual, alpha_va, alpha_positive, plane, quadrants, quad_plane
    from public.od_saber_tyt_results where tyt_id = t.id;
  end loop;
end;
$$;

grant execute on function public.od_copy_saber_tyt(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
