/* =============================================================================
   UDES Sostenible · micrositio de un ranking y microportal de una de sus
   subcategorías.

   El micrositio trae el informe individual (edición y vista a elegir, PDF), las
   subcategorías como tarjetas con su puntaje y los indicadores que las mueven.
   El microportal de cada subcategoría explica un puntaje: anillo, evolución,
   indicadores de la UDES e iniciativas.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "../../components/ui/Icon";
import { LAST, YEARS, categoryById, fmt, nationalGain, rankingById, rankingIndicators } from "./data";
import type { Category, Ranking } from "./data";
import { rankingSheet } from "./SostenibleHome";
import { SostenibleLayout } from "./SostenibleLayout";
import { ODS_CURRENT, ODS_EDITIONS, ODS_LIST, ODS_ROUTES } from "./ods-data";
import "./ods.css";
import { IndicatorBoard, LineChart, Num, Ring, SheetDialog, reduced, useDrawLines } from "./widgets";
import type { SheetData } from "./widgets";

gsap.registerPlugin(ScrollTrigger);

type View = "medallas" | "tabla" | "evolucion" | "ods";
const VIEWS: [View, string][] = [
  ["medallas", "Medallas"],
  ["tabla", "Tabla"],
  ["evolucion", "Evolución"],
  ["ods", "Rueda de ODS"],
];

const catColor = (r: Ranking, c: Category) => c.color ?? r.accent;

function Crumbs({ items }: { items: { to?: string; text: string }[] }) {
  return (
    <nav className="sos-crumbs" aria-label="Ruta">
      {items.map((it, i) => (
        <span key={it.text}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          {it.to ? <Link to={it.to}>{it.text}</Link> : <span aria-current="page">{it.text}</span>}
        </span>
      ))}
    </nav>
  );
}

function ReportPanel({ ranking: r, onSheet }: { ranking: Ranking; onSheet: (yearIndex: number) => void }) {
  const [edition, setEdition] = useState(LAST);
  const [view, setView] = useState<View>("medallas");
  const body = useRef<HTMLDivElement>(null);
  useDrawLines(body, [view, edition]);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".sos-medal, .sos-catmini, .sos-tablewrap, .sos-chartwrap", { opacity: 0, y: 14, duration: 0.34, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" });
    },
    { scope: body, dependencies: [view, edition] },
  );

  const medals: [string, ReactNode, string][] = [
    ["Mundial", r.world[edition], `Edición ${YEARS[edition]} · ${r.unit}`],
    ["Colombia", <>#<Num value={r.national[edition]} /></>, "Entre universidades colombianas"],
    r.score ? ["Puntaje", <Num value={r.score[edition]} />, `de 10.000 · era ${fmt(r.score[0])} en ${YEARS[0]}`] : ["Cambio", <>▲ <Num value={nationalGain(r, edition)} /> puestos</>, `En Colombia desde ${YEARS[0]}`],
  ];

  return (
    <div className="sos-panel">
      <div className="sos-panel__head">
        <div className="sos-chips" role="group" aria-label="Edición">
          <span className="sos-chips__label">Edición</span>
          {YEARS.map((y, i) => (
            <button key={y} type="button" aria-pressed={edition === i} onClick={() => setEdition(i)}>
              {y}
            </button>
          ))}
        </div>
        <div className="sos-views" role="group" aria-label="Vista">
          {VIEWS.map(([id, text]) => {
            const off = id === "ods" && r.id !== "impact";
            return (
              <button key={id} type="button" aria-pressed={view === id} disabled={off} title={off ? "Solo en THE Impact" : undefined} onClick={() => setView(id)}>
                {text}
              </button>
            );
          })}
        </div>
      </div>
      <div ref={body} className="sos-panel__body">
        {view === "medallas" && (
          <div className="sos-medals">
            {medals.map(([label, value, note]) => (
              <div key={label} className="sos-medal">
                <span className="sos-medal__label">{label}</span>
                <span className="sos-medal__value">{value}</span>
                <span className="sos-medal__note">{note}</span>
              </div>
            ))}
          </div>
        )}
        {view === "tabla" && (
          <div className="sos-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Edición</th>
                  <th>Mundial</th>
                  <th>Colombia</th>
                  {r.score && <th>Puntaje</th>}
                </tr>
              </thead>
              <tbody>
                {YEARS.map((y, i) => (
                  <tr key={y} data-current={i === edition || undefined}>
                    <td>{y}</td>
                    <td>{r.world[i]}</td>
                    <td>{r.national[i]}</td>
                    {r.score && <td>{fmt(r.score[i])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view === "evolucion" && (
          <div className="sos-chartwrap">
            <LineChart values={r.mid} tags={r.world} min={0} max={Math.max(...r.mid) * 1.08} rank label={`Evolución de las posiciones de ${r.name}`} />
            <p className="sos-legend">Puesto mundial: más arriba en la gráfica es mejor posición.</p>
          </div>
        )}
        {view === "ods" && (
          <div className="sos-catminis">
            {r.categories.map((c) => (
              <Link key={c.id} className="sos-catmini" to={`/sostenible/${r.id}/${c.id}`} style={{ background: c.color }}>
                <b>ODS {c.sdg}</b>
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="sos-panel__foot">
        <p>Informe individual · edición {YEARS[edition]}</p>
        <div className="sos-panel__acts">
          <button type="button" className="sos-btn sos-btn--ghost sos-btn--sm" onClick={() => onSheet(edition)}>
            Ver informe
          </button>
          <button type="button" className="sos-btn sos-btn--sm" onClick={() => onSheet(edition)}>
            Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}


/** Entrada desde el micrositio de THE Impact Rankings a los informes por ODS y por edición. */
function OdsEntry() {
  return (
    <section className="sos-section sos-section--alt" aria-labelledby="sos-ods">
      <div className="sos-wrap">
        <div className="sos-head">
          <p className="sos-eyebrow">Informes por ODS</p>
          <h2 id="sos-ods">Un informe por cada ODS, edición por edición.</h2>
          <p>
            Los 17 informes de la UDES, la presentación del Rector y, cuando se publica, el boletín en PDF de cada edición.
          </p>
        </div>
        <div className="odsx-entry">
          <div className="odsx-entry__tiles" role="list" aria-label="Informes por ODS">
            {ODS_LIST.map((o) => (
              <Link key={o.n} role="listitem" to={ODS_ROUTES.report(o.n, ODS_CURRENT)} className="odsx-entry__tile" style={{ "--c": o.color } as CSSProperties} title={`ODS ${o.n} · ${o.name}`}>
                {o.n}
              </Link>
            ))}
          </div>
          <div className="odsx-entry__acts">
            <Link className="sos-btn" to={ODS_ROUTES.portal}>
              Ver los 17 informes
            </Link>
            <Link className="sos-btn sos-btn--ghost" to={ODS_ROUTES.rector}>
              Presentación rectoral
            </Link>
            <Link className="sos-btn sos-btn--ghost" to={ODS_ROUTES.bulletin}>
              Boletín PDF
            </Link>
            <span className="odsx-entry__ed">Ediciones: {ODS_EDITIONS.join(" · ")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SostenibleRanking() {
  const { ranking: id } = useParams();
  const r = rankingById(id);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".sos-mh .sos-wrap > *", { opacity: 0, y: 16, duration: 0.5, ease: "power3.out", stagger: 0.08, clearProps: "opacity,transform" });
      ScrollTrigger.batch(".sos-cat", { start: "top 92%", once: true, onEnter: (b) => gsap.from(b, { y: 20, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.06, clearProps: "opacity,transform" }) });
    },
    { scope: root, dependencies: [id] },
  );
  if (!r) return <Navigate to="/sostenible" replace />;

  return (
    <SostenibleLayout title={r.name}>
      <div ref={root} style={{ "--sos-accent": r.accent } as CSSProperties}>
        <div className="sos-mh">
          <div className="sos-wrap">
            <Crumbs items={[{ to: "/sostenible", text: "UDES Sostenible" }, { text: r.short }]} />
            <p className="sos-eyebrow sos-eyebrow--on-dark">Micrositio · {r.publisher}</p>
            <h1>{r.name}</h1>
            <p>{r.about}</p>
          </div>
        </div>

        <section className="sos-section sos-section--tight" aria-labelledby="sos-informe">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Informe individual</p>
              <h2 id="sos-informe">Resultados de la UDES en {r.short}.</h2>
            </div>
            <ReportPanel ranking={r} onSheet={(i) => setSheet(rankingSheet(r, i))} />
            <p className="sos-note">
              <i aria-hidden="true" />
              Dato ilustrativo: cifras de muestra.
            </p>
          </div>
        </section>

        {r.id === "impact" && <OdsEntry />}

        <section className="sos-section" aria-labelledby="sos-cats">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">{r.categoryLabel}</p>
              <h2 id="sos-cats">Cada subcategoría tiene su microportal.</h2>
              <p>Entra a una para ver su puntaje, su evolución y los indicadores de la UDES que la explican.</p>
            </div>
            <div className="sos-cats">
              {r.categories.map((c) => (
                <Link key={c.id} to={`/sostenible/${r.id}/${c.id}`} className="sos-cat" style={{ "--sos-accent": catColor(r, c) } as CSSProperties}>
                  <div className="sos-cat__top">
                    <span className="sos-cat__code">{c.sdg ?? c.code}</span>
                    <Ring value={c.scores[LAST]} color={catColor(r, c)} />
                  </div>
                  <h3>{c.name}</h3>
                  <span className="sos-cat__meta">
                    {c.weight ? `Peso ${c.weight}% · ` : ""}
                    {c.indicators.length === 1 ? "1 indicador UDES" : `${c.indicators.length} indicadores UDES`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="sos-section" aria-labelledby="sos-inds">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Indicadores</p>
              <h2 id="sos-inds">Lo que mueve a {r.short}.</h2>
            </div>
            <IndicatorBoard keys={rankingIndicators(r)} />
          </div>
        </section>
      </div>
      {sheet && <SheetDialog data={sheet} onClose={() => setSheet(null)} />}
    </SostenibleLayout>
  );
}

export function SostenibleCategory() {
  const { ranking: rid, categoria } = useParams();
  const r = rankingById(rid);
  const c = r ? categoryById(r, categoria) : undefined;
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useDrawLines(root, [rid, categoria]);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".sos-mh .sos-wrap > *", { opacity: 0, y: 16, duration: 0.5, ease: "power3.out", stagger: 0.08, clearProps: "opacity,transform" });
      gsap.from(".sos-box", { opacity: 0, y: 18, duration: 0.5, ease: "power3.out", stagger: 0.1, delay: 0.15, clearProps: "opacity,transform" });
    },
    { scope: root, dependencies: [rid, categoria] },
  );
  if (!r) return <Navigate to="/sostenible" replace />;
  if (!c) return <Navigate to={`/sostenible/${r.id}`} replace />;

  const color = catColor(r, c);
  const i = r.categories.indexOf(c);
  const prev = r.categories[i - 1];
  const next = r.categories[i + 1];
  const gain = c.scores[LAST] - c.scores[0];
  const openSheet = () =>
    setSheet({
      title: `${r.short} · ${c.code} ${c.name}`,
      publisher: r.publisher,
      stats: [
        [String(c.scores[LAST]), `Puntaje ${YEARS[LAST]}`],
        [`+${gain}`, `Puntos desde ${YEARS[0]}`],
        [String(c.indicators.length), "Indicadores UDES"],
      ],
      chart: <LineChart paper values={c.scores} min={0} max={100} width={520} height={230} label={`Evolución de ${c.name}`} color="#014898" />,
    });

  return (
    <SostenibleLayout title={`${c.name} · ${r.short}`}>
      <div ref={root} style={{ "--sos-accent": color } as CSSProperties}>
        <div className="sos-mh">
          <div className="sos-wrap">
            <Crumbs items={[{ to: "/sostenible", text: "UDES Sostenible" }, { to: `/sostenible/${r.id}`, text: r.short }, { text: c.code }]} />
            <p className="sos-eyebrow sos-eyebrow--on-dark">Microportal · {r.short}</p>
            <h1>
              {c.sdg ? `ODS ${c.sdg}: ` : ""}
              {c.name}
            </h1>
            <p>
              {c.en ? `${c.en} · ` : ""}
              {c.weight ? `Pesa ${c.weight}% del puntaje de ${r.short}. ` : ""}Así va la UDES en esta subcategoría y qué indicadores propios la explican.
            </p>
          </div>
        </div>

        <section className="sos-section sos-section--tight" aria-label="Puntaje y evolución">
          <div className="sos-wrap sos-twocol">
            <div className="sos-box sos-box--center">
              <Ring value={c.scores[LAST]} color={color} size="xl" />
              <div>
                <strong>Puntaje {YEARS[LAST]}</strong>
                <p className="sos-muted">+{gain} puntos desde {YEARS[0]}</p>
              </div>
              <button type="button" className="sos-btn" onClick={openSheet}>
                Exportar PDF
              </button>
            </div>
            <div className="sos-box">
              <p className="sos-eyebrow">Evolución por edición</p>
              <LineChart values={c.scores} min={0} max={100} height={260} label={`Evolución de ${c.name}`} />
            </div>
          </div>
        </section>

        <section className="sos-section sos-section--alt" aria-labelledby="sos-cind">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Indicadores de la UDES</p>
              <h2 id="sos-cind">Lo que explica este resultado.</h2>
            </div>
            {c.indicators.length ? (
              <IndicatorBoard keys={c.indicators} />
            ) : (
              <div className="sos-box">
                <p className="sos-muted">Los indicadores académicos de este pilar se publicarán cuando la oficina responsable los cargue. Mientras tanto se muestra el puntaje del ranking.</p>
              </div>
            )}
          </div>
        </section>

        <section className="sos-section" aria-labelledby="sos-inic">
          <div className="sos-wrap">
            <div className="sos-head">
              <p className="sos-eyebrow">Qué hace la UDES</p>
              <h2 id="sos-inic">Iniciativas ligadas a {c.name.toLowerCase()}.</h2>
            </div>
            <div className="sos-box">
              <ul className="sos-list">
                <li>Programa o proyecto institucional por registrar con su oficina responsable.</li>
                <li>Evidencia que se reporta al ranking: documento, enlace o cifra con corte.</li>
                <li>Meta propuesta para la próxima edición y responsable de seguirla.</li>
              </ul>
              <p className="sos-note">
                <i aria-hidden="true" />
                Texto de ejemplo por reemplazar con las iniciativas reales.
              </p>
            </div>
            <div className="sos-pn">
              {prev ? (
                <Link className="sos-btn sos-btn--ghost" to={`/sostenible/${r.id}/${prev.id}`}>
                  <Icon name="arrow-left" size={15} /> {prev.name}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link className="sos-btn sos-btn--ghost" to={`/sostenible/${r.id}/${next.id}`}>
                  {next.name} <Icon name="arrow-right" size={15} />
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
      {sheet && <SheetDialog data={sheet} onClose={() => setSheet(null)} />}
    </SostenibleLayout>
  );
}
