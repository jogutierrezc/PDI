/* =============================================================================
   Portal de Impacto · los programas, por sede o por facultad.

   Filtros de sede y facultad, y la vista agrupada por una u otra. Al elegir
   un programa se abre su cadena en las tres funciones (en una sede o en
   todas) y un indicador comparado entre sus sedes. Todo el estado vive en
   la dirección: ?sede=&facultad=&por=sede|facultad&programa=&indicador=.
   ========================================================================== */

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FUNCTIONS, FUNCTION_TONE } from "../model";
import { campusFigures, chainCoverage, facultiesOf, programChain, programNote, programsOf } from "./analysis";
import type { PortalProgram } from "./analysis";
import type { PortalData } from "./data";
import { CampusBars, ChainGrid, FnChip } from "./charts";
import { PiloBanner, PortalGate, PortalLayout, SectionHead } from "./parts";

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
  const detail = useRef<HTMLElement>(null);

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const visible = all.filter((p) => (!faculty || p.faculty?.id === faculty.id) && (!sede || p.campusIds.includes(sede.id)));
  const selected = all.find((p) => p.slug === params.get("programa")) ?? null;

  useEffect(() => {
    if (params.get("programa")) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Solo al llegar con un programa en la dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <h1>¿A qué función se conecta cada programa?</h1>
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
                      <ProgramCard data={data} program={p} campusId={by === "sede" && g.key !== "sin" ? g.key : sede?.id ?? null}
                        active={selected?.id === p.id}
                        onPick={() => {
                          set({ programa: p.slug });
                          window.setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ipo-section ipo-section--surface" ref={detail} aria-live="polite">
        <div className="u-container">
          {selected ? (
            <ProgramDetail data={data} program={selected} campusId={sede && selected.campusIds.includes(sede.id) ? sede.id : null} params={params} set={set} />
          ) : (
            <p className="ipo-muted ipo-pick">Elija un programa para ver su cadena y sus cifras por sede.</p>
          )}
        </div>
      </section>
    </PortalLayout>
  );
}

function ProgramCard({ data, program, campusId, active, onPick }: { data: PortalData; program: PortalProgram; campusId: string | null; active: boolean; onPick: () => void }) {
  const chain = programChain(data, program.id, campusId);
  return (
    <button type="button" className="ipo-pcard" aria-pressed={active} onClick={onPick}>
      <strong>{program.name}</strong>
      <span>
        {program.faculty?.name ?? "Sin facultad"} · {program.campusIds.length} {program.campusIds.length === 1 ? "sede" : "sedes"}
      </span>
      <span className="ipo-pcard__fns">
        {FUNCTIONS.map((f) => (
          <FnChip key={f} fn={f} text={`${chainCoverage(chain, f).covered}/4`} />
        ))}
      </span>
    </button>
  );
}

function ProgramDetail({
  data,
  program,
  campusId,
  params,
  set,
}: {
  data: PortalData;
  program: PortalProgram;
  campusId: string | null;
  params: URLSearchParams;
  set: (changes: Record<string, string | null>) => void;
}) {
  const chain = programChain(data, program.id, campusId);
  const adopted = [...new Set(data.adoptions.filter((a) => a.programId === program.id).map((a) => a.indicatorId))]
    .map((id) => data.indicators.find((i) => i.id === id)!)
    .filter(Boolean)
    .sort((a, b) => a.code.localeCompare(b.code));
  const chosen = adopted.find((i) => i.code === params.get("indicador")) ?? adopted[0];
  const figures = chosen ? campusFigures(data, chosen.id, new Set([program.id])).filter((f) => program.campusIds.includes(f.campus.id)) : [];
  const campusName = data.campuses.find((c) => c.id === campusId)?.name;

  return (
    <div className="ipo-detail" data-tour="ipo-prog-detail">
      <div className="ipo-card">
        <div className="ipo-head">
          <div>
            <span className="ipo-eyebrow">{program.faculty?.name ?? "Sin facultad"}</span>
            <h2>{program.name}</h2>
            <p>{campusName ? `Su cadena en ${campusName}.` : "Su cadena sumando todas sus sedes."}</p>
          </div>
          <div className="ipo-pills ipo-pills--solid" role="group" aria-label="Sede del programa">
            <button type="button" aria-pressed={!campusId} onClick={() => set({ sede: null })}>
              Todas
            </button>
            {data.campuses
              .filter((c) => program.campusIds.includes(c.id))
              .map((c) => (
                <button key={c.id} type="button" aria-pressed={campusId === c.id} onClick={() => set({ sede: c.slug })}>
                  {c.name}
                </button>
              ))}
          </div>
        </div>
        <ChainGrid chain={chain} />
      </div>

      <div className="ipo-card">
        <SectionHead title="Por sede" hint="La última cifra que el programa reportó en cada sede." />
        {chosen ? (
          <>
            <label className="ipo-select">
              <span>Indicador</span>
              <select value={chosen.code} onChange={(e) => set({ indicador: e.target.value })}>
                {adopted.map((i) => (
                  <option key={i.id} value={i.code}>
                    {i.code} · {i.name}
                  </option>
                ))}
              </select>
            </label>
            <CampusBars rows={figures} measure={chosen.measure} target={chosen.target2026Num} tone={FUNCTION_TONE[chosen.fn]} />
          </>
        ) : (
          <p className="ipo-muted">Este programa aún no ha elegido indicadores de la matriz.</p>
        )}
        <PiloBanner note={programNote(program.name, chain)} />
      </div>
    </div>
  );
}
