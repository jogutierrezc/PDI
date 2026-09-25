/* =============================================================================
   Portal de Impacto · los programas, por sede o por facultad.

   Filtros de sede y facultad, y la vista agrupada por una u otra. Cada
   tarjeta dice cómo van los indicadores del programa frente a su meta y abre
   su detalle (/impacto/programa/:slug). El estado vive en la dirección:
   ?sede=&facultad=&por=sede|facultad. Los enlaces viejos con ?programa=
   llevan al detalle.
   ========================================================================== */

import { useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { facultiesOf, programsOf } from "./analysis";
import type { PortalProgram } from "./analysis";
import type { PortalData } from "./data";
import { PortalGate, PortalLayout } from "./parts";
import { countStandings, metShare, programStandings, withTarget } from "./standing";
import { StandingBar, StandingLegend } from "./standingCharts";

export function PortalPrograms() {
  return <PortalGate title="Programas">{(data) => <Programs data={data} />}</PortalGate>;
}

function Programs({ data }: { data: PortalData }) {
  const [params, setParams] = useSearchParams();
  const all = useMemo(() => programsOf(data), [data]);
  const faculties = useMemo(() => facultiesOf(data), [data]);
  const sede = data.campuses.find((c) => c.slug === params.get("sede")) ?? null;
  const faculty = faculties.find((f) => f.slug === params.get("facultad")) ?? null;
  const by = params.get("por") === "facultad" ? "facultad" : "sede";

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const visible = all.filter((p) => (!faculty || p.faculty?.id === faculty.id) && (!sede || p.campusIds.includes(sede.id)));
  const legacy = all.find((p) => p.slug === params.get("programa"));
  if (legacy) return <Navigate to={`/impacto/programa/${legacy.slug}${sede ? `?sede=${sede.slug}` : ""}`} replace />;

  const groups =
    by === "sede"
      ? (sede ? [sede] : data.campuses)
          .map((c) => ({ key: c.id, title: `Sede ${c.name}`, items: visible.filter((p) => p.campusIds.includes(c.id)) }))
          .filter((g) => g.items.length)
      : (faculty ? [faculty] : faculties)
          .map((f) => ({ key: f.id, title: f.name, items: visible.filter((p) => p.faculty?.id === f.id) }))
          .concat(faculty ? [] : [{ key: "sin", title: "Sin facultad", items: visible.filter((p) => !p.faculty) }])
          .filter((g) => g.items.length);

  return (
    <PortalLayout title="Programas">
      <section className="ipo-unit-head">
        <div className="u-container ipo-unit-head__grid">
          <div>
            <span className="ipo-eyebrow">Programas · por sede y por facultad</span>
            <h1>¿Cómo van los indicadores de cada programa?</h1>
            <p className="ipo-lede">Cada tarjeta resume sus indicadores frente a la meta 2026. Ábrala para ver el detalle.</p>
          </div>
          <div className="ipo-pills ipo-pills--solid" role="group" aria-label="Agrupar por" data-tour="ipo-prog-group">
            <button type="button" aria-pressed={by === "sede"} onClick={() => set({ por: null })}>
              Por sede
            </button>
            <button type="button" aria-pressed={by === "facultad"} onClick={() => set({ por: "facultad" })}>
              Por facultad
            </button>
          </div>
        </div>
      </section>

      <section className="ipo-section">
        <div className="u-container ipo-programs">
          <aside className="ipo-card ipo-filters" aria-label="Filtros" data-tour="ipo-prog-filters">
            <fieldset>
              <legend>Sede</legend>
              <div className="ipo-chipset">
                <button type="button" aria-pressed={!sede} onClick={() => set({ sede: null })}>
                  Todas
                </button>
                {data.campuses.map((c) => (
                  <button key={c.id} type="button" aria-pressed={sede?.id === c.id} onClick={() => set({ sede: c.slug })}>
                    {c.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Facultad</legend>
              <div className="ipo-rowset">
                <button type="button" aria-pressed={!faculty} onClick={() => set({ facultad: null })}>
                  Todas las facultades
                </button>
                {faculties.map((f) => (
                  <button key={f.id} type="button" aria-pressed={faculty?.id === f.id} onClick={() => set({ facultad: f.slug })}>
                    {f.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Estados</legend>
              <StandingLegend />
            </fieldset>
            <p className="ipo-count" role="status">
              {visible.length} {visible.length === 1 ? "programa coincide" : "programas coinciden"} con el filtro
            </p>
          </aside>

          <div className="ipo-groups">
            {groups.length === 0 && <p className="ipo-muted">Ningún programa coincide. Pruebe con otra sede o facultad.</p>}
            {groups.map((g) => (
              <div key={g.key} className="ipo-group">
                <h2>
                  {g.title} <span>{g.items.length}</span>
                </h2>
                <ul>
                  {g.items.map((p) => (
                    <li key={p.id}>
                      <ProgramCard data={data} program={p} campusId={by === "sede" && g.key !== "sin" ? g.key : sede?.id ?? null} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

    </PortalLayout>
  );
}

function ProgramCard({ data, program, campusId }: { data: PortalData; program: PortalProgram; campusId: string | null }) {
  const rows = programStandings(data, program.id, campusId);
  const counts = countStandings(rows);
  const share = metShare(counts);
  const campus = data.campuses.find((c) => c.id === campusId);
  return (
    <Link className="ipo-pcard" to={`/impacto/programa/${program.slug}${campus ? `?sede=${campus.slug}` : ""}`}>
      <strong>{program.name}</strong>
      <span>
        {program.faculty?.name ?? "Sin facultad"} · {program.campusIds.length} {program.campusIds.length === 1 ? "sede" : "sedes"}
      </span>
      {rows.length ? (
        <>
          <StandingBar counts={counts} size="sm" />
          <span className="ipo-pcard__meta">
            {counts.cumplida} de {withTarget(counts)} metas cumplidas{share !== null ? ` · ${share} %` : ""}
          </span>
        </>
      ) : (
        <span className="ipo-pcard__meta">Aún sin indicadores elegidos</span>
      )}
    </Link>
  );
}
