-- =============================================================================
-- 0099 · Boletín «Análisis de los datos»: las indicaciones guardadas.
--
-- El análisis vive en od_bulletins.settings (format = 'analisis', con su
-- encargo y lo que escribió Mr. Pilo): no necesita tabla propia. Lo que sí se
-- guarda aparte son las indicaciones que Planeación quiere reutilizar
-- («Informe al Consejo Superior», «Seguimiento semestral»…), con el encargo
-- que las acompaña (formato, público, tono, longitud).
-- Las ve y las edita quien puede editar el periodo de UDES en Cifras.
-- Requiere 0024 (od_can_edit_period). Idempotente.
-- =============================================================================

create table if not exists public.od_analysis_prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 1200),
  brief jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.od_analysis_prompts is 'Indicaciones guardadas para el boletín «Análisis de los datos» (0099).';

alter table public.od_analysis_prompts enable row level security;

drop policy if exists od_analysis_prompts_read on public.od_analysis_prompts;
create policy od_analysis_prompts_read on public.od_analysis_prompts for select to authenticated
  using (public.od_can_edit_period());

drop policy if exists od_analysis_prompts_insert on public.od_analysis_prompts;
create policy od_analysis_prompts_insert on public.od_analysis_prompts for insert to authenticated
  with check (public.od_can_edit_period());

drop policy if exists od_analysis_prompts_delete on public.od_analysis_prompts;
create policy od_analysis_prompts_delete on public.od_analysis_prompts for delete to authenticated
  using (public.od_can_edit_period());

revoke all on public.od_analysis_prompts from anon, public;
grant select, insert, delete on public.od_analysis_prompts to authenticated;

notify pgrst, 'reload schema';
