/* =============================================================================
   Portal de Impacto · las facultades.

   /impacto/facultades: una piedra por facultad.
   /impacto/facultad/:slug: el mapa de conexión de sus programas (a qué
   función se conecta cada uno y qué eslabones le faltan), hacia dónde
   apuntan sus indicadores, los más elegidos y un indicador por sede.
   El filtro de sede vive en la dirección (?sede=bucaramanga).
   ========================================================================== */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE } from "../model";
import {
  adoptionsByFunction,
  campusFigures,
  chainCoverage,
  facultiesOf,
  mostAdopted,
  programChain,
  programsOf,
} from "./analysis";
import type { PiloNote } from "./analysis";
import type { PortalData } from "./data";
import { CampusBars, ChainDots } from "./charts";
import { PiloBanner, PortalGate, PortalLayout, SectionHead } from "./parts";
import { pebbleShape } from "./shape";

export function PortalFaculties() {
  return (
    <PortalGate title="Facultades">
      {(data) => {
        const programs = programsOf(data);
        const faculties = facultiesOf(data);
        return (
          <PortalLayout title="Facultades">
            <section className="ipo-unit-head">
              <div className="u-container">
                <span className="ipo-eyebrow">Facultades</span>
                <h1>Elija una facultad</h1>
                <p className="ipo-lede">Cada una muestra a qué función se conectan sus programas y si su cadena llega al impacto real.</p>
              </div>
            </section>
            <section className="ipo-section ipo-section--surface">
              <div className="u-container">
                {faculties.length === 0 ? (
                  <p className="ipo-muted">Aún no hay facultades en la estructura institucional.</p>
                ) : (
                  <ul className="ipo-stones">
                    {faculties.map((f) => {
                      const mine = programs.filter((p) => p.faculty?.id === f.id);
                      const connected = mine.filter((p) => data.adoptions.some((a) => a.programId === p.id)).length;
                      return (
                        <li key={f.id}>
                          <Link to={`/impacto/facultad/${f.slug}`} className="ipo-stone" style={{ "--shape": pebbleShape(f.id) } as CSSProperties}>
                            <span className="ipo-stone__detail">{f.code}</span>
                            <strong>{f.name}</strong>
                            <span className="ipo-stone__count">
                              {mine.length} {mine.length === 1 ? "programa" : "programas"} · {connected} con indicadores
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </PortalLayout>
        );
      }}
    </PortalGate>
  );
}

export function PortalFaculty() {
  const { slug } = useParams();
  return <PortalGate title="Facultad">{(data) => <FacultyView data={data} slug={slug ?? ""} />}</PortalGate>;
}

function FacultyView({ data, slug }: { data: PortalData; slug: string }) {
  const [params, setParams] = useSearchParams();
  const faculty = data.units.find((u) => u.kind === "facultad" && u.slug === slug);
  const sede = data.campuses.find((c) => c.slug === params.get("sede")) ?? null;

  const programs = useMemo(
    () => programsOf(data).filter((p) => p.faculty?.id === faculty?.id && (!sede || p.campusIds.includes(sede.id))),
    [data, faculty, sede],
  );
  const ids = useMemo(() => new Set(programs.map((p) => p.id)), [programs]);
  const rows = useMemo(() => programs.map((p) => ({ program: p, chain: programChain(data, p.id, sede?.id) })), [programs, data, sede]);
  const byFn = useMemo(() => adoptionsByFunction(data, ids), [data, ids]);
  const top = useMemo(() => mostAdopted(data, ids), [data, ids]);

  if (!faculty) {
    return (
      <PortalLayout title="Facultad">
        <div className="u-container ipo-state">
          <h1>No encontramos esa facultad</h1>
          <Link className="ipo-link" to="/impacto/facultades">
            Ver todas las facultades
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const campuses = data.campuses.filter((c) => programsOf(data).some((p) => p.faculty?.id === faculty.id && p.campusIds.includes(c.id)));
  const chosen = top.find((t) => t.indicator.code === params.get("indicador")) ?? top[0];
  const figures = chosen ? campusFigures(data, chosen.indicator.id, ids) : [];
  const totalFn = FUNCTIONS.reduce((t, f) => t + byFn[f], 0);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // La brecha que más se repite: la función con la que menos programas se conectan.
  const missingFn = FUNCTIONS.map((f) => ({ fn: f, n: rows.filter((r) => !chainCoverage(r.chain, f).connected).length })).sort((a, b) => b.n - a.n)[0];
  const note: PiloNote =
    rows.length === 0
      ? { mood: "duda", title: "Sin programas aquí", lines: ["Esta facultad no tiene programas en esa sede."] }
      : missingFn && missingFn.n > 0
        ? {
            mood: "cuidado",
            title: `${missingFn.n} de ${rows.length} programas no se conectan con ${FUNCTION_LABEL[missingFn.fn]}`,
            lines: [
              `Por ejemplo: ${rows
                .filter((r) => !chainCoverage(r.chain, missingFn.fn).connected)
                .slice(0, 3)
                .map((r) => r.program.name)
                .join(", ")}.`,
              "En la intranet, Mr. Pilo les propone el indicador que ya usan programas parecidos.",
            ],
          }
        : { mood: "excelente", title: "Todos conectados", lines: ["Cada programa tiene al menos un indicador en las tres funciones."] };

  return (
    <PortalLayout title={faculty.name}>
      <section className="ipo-unit-head">
        <div className="u-container ipo-unit-head__grid">
          <div>
            <Link className="ipo-back" to="/impacto/facultades">
              Facultades
            </Link>
            <h1>{faculty.name}</h1>
            <p className="ipo-lede">A qué función se conecta cada programa y si su cadena llega hasta el impacto real.</p>
          </div>
          <div className="ipo-pills ipo-pills--solid" role="group" aria-label="Sede" data-tour="ipo-fac-campus">
            <button type="button" aria-pressed={!sede} onClick={() => setParam("sede", null)}>
              Todas las sedes
            </button>
            {campuses.map((c) => (
              <button key={c.id} type="button" aria-pressed={sede?.id === c.id} onClick={() => setParam("sede", c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="ipo-section">
        <div className="u-container ipo-two ipo-two--map">
          <div className="ipo-card" data-tour="ipo-fac-map">
            <SectionHead
              title="Mapa de conexión de los programas"
              hint="Cuatro cuadros por función: insumos, procesos, productos e impacto real. Punteado en rojo: el eslabón que falta."
            />
            {rows.length === 0 ? (
              <p className="ipo-muted">No hay programas de esta facultad {sede ? `en ${sede.name}` : "en la estructura"}.</p>
            ) : (
              <div className="ipo-map" role="table" aria-label="Conexión de cada programa con las tres funciones">
                <div role="row" className="ipo-map__head">
                  <span role="columnheader">Programa</span>
                  {FUNCTIONS.map((f) => (
                    <span role="columnheader" key={f} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                      <i aria-hidden="true" />
                      {FUNCTION_LABEL[f]}
                    </span>
                  ))}
                  <span role="columnheader">Sedes</span>
                </div>
                {rows.map(({ program, chain }) => (
                  <div role="row" key={program.id} className="ipo-map__row">
                    <span role="rowheader">
                      <Link to={`/impacto/programas?programa=${program.slug}${sede ? `&sede=${sede.slug}` : ""}`}>{program.name}</Link>
                    </span>
                    {FUNCTIONS.map((f) => (
                      <span role="cell" key={f}>
                        <ChainDots chain={chain} fn={f} />
                      </span>
                    ))}
                    <span role="cell" className="ipo-map__sites">
                      {data.campuses
                        .filter((c) => program.campusIds.includes(c.id))
                        .map((c) => (
                          <span key={c.id}>{c.name}</span>
                        ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ipo-stack">
            <div className="ipo-card">
              <SectionHead title="Hacia dónde apuntan sus indicadores" />
              {totalFn === 0 ? (
                <p className="ipo-muted">Sus programas aún no han elegido indicadores.</p>
              ) : (
                <>
                  <div className="ipo-split" role="img" aria-label={FUNCTIONS.map((f) => `${FUNCTION_LABEL[f]} ${Math.round((byFn[f] / totalFn) * 100)}%`).join(", ")}>
                    {FUNCTIONS.map((f) => (byFn[f] ? <span key={f} style={{ flexGrow: byFn[f], background: FUNCTION_TONE[f] }} /> : null))}
                  </div>
                  <dl className="ipo-split__legend">
                    {FUNCTIONS.map((f) => (
                      <div key={f} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                        <dt>{FUNCTION_LABEL[f]}</dt>
                        <dd>{Math.round((byFn[f] / totalFn) * 100)}%</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
            <div className="ipo-card">
              <SectionHead title="Los más elegidos por sus programas" />
              {top.length === 0 ? (
                <p className="ipo-muted">Todavía ninguno.</p>
              ) : (
                <ol className="ipo-top">
                  {top.map((t) => (
                    <li key={t.indicator.id} style={{ "--tone": FUNCTION_TONE[t.indicator.fn] } as CSSProperties}>
                      <b>{t.indicator.code}</b>
                      <span>{t.indicator.name}</span>
                      <small>
                        {t.programs} {t.programs === 1 ? "programa" : "programas"}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </section>

      {chosen && (
        <section className="ipo-section ipo-section--surface">
          <div className="u-container">
            <div className="ipo-card">
              <div className="ipo-head">
                <div>
                  <h2>
                    {chosen.indicator.code} · {chosen.indicator.name}, por sede
                  </h2>
                  <p>La cifra de cada sede es el promedio simple de lo que reportan los programas de la facultad allí.</p>
                </div>
                <label className="ipo-select">
                  <span>Indicador</span>
                  <select value={chosen.indicator.code} onChange={(e) => setParam("indicador", e.target.value)}>
                    {top.map((t) => (
                      <option key={t.indicator.id} value={t.indicator.code}>
                        {t.indicator.code} · {t.indicator.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <CampusBars rows={figures} measure={chosen.indicator.measure} target={chosen.indicator.target2026Num} tone={FUNCTION_TONE[chosen.indicator.fn]} />
            </div>
          </div>
        </section>
      )}

      <section className="ipo-section">
        <div className="u-container">
          <PiloBanner note={note} />
        </div>
      </section>
    </PortalLayout>
  );
}
