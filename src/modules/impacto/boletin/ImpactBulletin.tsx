/* =============================================================================
   Boletín de Seguimiento · Impacto Institucional UDES 2024-2028 (PDF).

   /impacto/boletin/vicerrectoria/:fn   el de una vicerrectoría
   /impacto/boletin/programa/:slug      el de un programa (?sede=)

   Páginas carta, primero las tablas y luego las gráficas, con la lectura de
   Mr. Pilo con IA (la función `pilo-ia`, acción «sintetizar», que revisa que
   cada número esté en los datos) y, en el del programa, su mapa de red.
   «Descargar PDF» abre el diálogo de impresión: con la página fijada en
   carta y sin márgenes, «Guardar como PDF» deja un PDF vectorial con el
   texto seleccionable. El boletín se ve siempre en tema claro.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { askPilo } from "../../../components/pilo/ai/client";
import type { PiloResult } from "../../../components/pilo/ai/client";
import { usePiloAiHere } from "../../../components/pilo/ai/config";
import type { Section } from "../../../components/pilo/ai/logic";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, STAGES, STAGE_LABEL, formatFigure } from "../model";
import type { SubstantiveFunction } from "../model";
import { FN_SLUG, isFunction, programsOf } from "../portal/analysis";
import type { PiloNote } from "../portal/analysis";
import type { PortalData } from "../portal/data";
import { PortalGate } from "../portal/parts";
import { edgePath } from "../portal/network";
import { LAGGING_BELOW, STANDINGS, STANDING_GLYPH, STANDING_LABEL, metShare, standingOf, totalOf, withTarget } from "../portal/standing";
import type { GridCell, IndicatorStanding, Standing, StandingCounts } from "../portal/standing";
import { BULLETIN_OFFICE, BULLETIN_TITLE, programBulletin, today, vicerrectoriaBulletin } from "./content";
import type { ProgramBulletin, VicerrectoriaBulletin } from "./content";
import { PagedDocument } from "./PagedDocument";
import type { DocItem } from "./PagedDocument";
import "../portal/portal.css";
import "./bulletin.css";

/* --- Entradas --------------------------------------------------------------------------- */

export function VicerrectoriaBulletinPage() {
  const { fn } = useParams();
  if (!isFunction(fn)) return <Navigate to="/impacto/boletin/vicerrectoria/investigacion" replace />;
  return <PortalGate title="Boletín">{(data) => <VicerrectoriaDoc data={data} fn={fn} />}</PortalGate>;
}

export function ProgramBulletinPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  return (
    <PortalGate title="Boletín">
      {(data) => {
        const program = programsOf(data).find((p) => p.slug === slug);
        if (!program) return <Navigate to="/impacto/programas" replace />;
        const sede = data.campuses.find((c) => c.slug === params.get("sede") && program.campusIds.includes(c.id)) ?? null;
        return <ProgramDoc data={data} programId={program.id} campusId={sede?.id ?? null} />;
      }}
    </PortalGate>
  );
}

/* --- El marco: barra (no se imprime), tema claro y título del archivo ---------------------------- */

function useLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);
}

export function Shell({ title, back, status, children }: { title: string; back: { to: string; label: string }; status: ReactNode; children: (onReady: (n: number) => void) => ReactNode }) {
  const [pages, setPages] = useState(0);
  useLightTheme();
  useEffect(() => {
    const previous = document.title;
    // El título de la pestaña es el nombre que propone «Guardar como PDF».
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="ibol">
      <header className="ibol-toolbar ibol-noprint">
        <Link className="ibol-toolbar__back" to={back.to}>
          <Icon name="arrow-left" size={16} />
          {back.label}
        </Link>
        <div className="ibol-toolbar__title">
          <strong>{title}</strong>
          <span>
            {pages ? `${pages} ${pages === 1 ? "página" : "páginas"} carta` : "Armando las páginas…"} · {status}
          </span>
        </div>
        <button type="button" className="button-primary" disabled={!pages} onClick={() => window.print()}>
          <Icon name="download" size={16} />
          Descargar PDF
        </button>
      </header>
      <p className="ibol-hint ibol-noprint">
        En el diálogo de impresión elija <b>Guardar como PDF</b>. El tamaño carta y los márgenes ya vienen fijados por el boletín; active «Gráficos de fondo» si su
        navegador lo pregunta.
      </p>
      <div className="ibol-canvas">{children(setPages)}</div>
    </div>
  );
}

/* --- La lectura de Mr. Pilo ------------------------------------------------------------------ */

type Reading =
  | { kind: "cargando" }
  | { kind: "ia"; result: PiloResult; at: Date }
  | { kind: "reglas"; note: PiloNote; reason: string };

function usePiloReading(title: string, sections: Section[], fallback: PiloNote): Reading {
  const here = usePiloAiHere();
  const allowed = here.actions.sintetizar;
  const withText = sections.filter((s) => s.text.trim());
  const query = useQuery({
    queryKey: ["impacto", "boletin", "ia", title, withText],
    enabled: allowed && withText.length > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => ({ result: await askPilo("sintetizar", "impacto", title, withText), at: new Date() }),
  });
  if (!here.config) return { kind: "cargando" };
  if (!allowed) return { kind: "reglas", note: fallback, reason: "Mr. Pilo con IA no está activo para esta cuenta en el Portal de Impacto" };
  if (query.isPending) return { kind: "cargando" };
  if (query.isError || !query.data) return { kind: "reglas", note: fallback, reason: (query.error as Error | null)?.message ?? "la IA no respondió" };
  return { kind: "ia", result: query.data.result, at: query.data.at };
}

const readingStatus = (r: Reading) =>
  r.kind === "cargando" ? "Mr. Pilo está leyendo las cifras…" : r.kind === "ia" ? "Lectura de Mr. Pilo con IA lista" : "Lectura de Mr. Pilo sin IA";

function PiloReading({ reading, number }: { reading: Reading; number: number }) {
  const stamp = (d: Date) => `${d.toLocaleDateString("es-CO")} ${d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  if (reading.kind === "cargando") {
    return (
      <section className="ibol-pilo" data-state="cargando">
        <PiloAvatar mood="piensa" size={64} />
        <p>Mr. Pilo está leyendo las cifras de este boletín…</p>
      </section>
    );
  }
  if (reading.kind === "reglas") {
    return (
      <section className="ibol-pilo">
        <div className="ibol-pilo__head">
          <PiloAvatar mood={reading.note.mood === "cuidado" ? "cuidado" : "idea"} size={72} />
          <div>
            <span className="ibol-kicker">
              <b>{number}</b> · La lectura de Mr. Pilo
            </span>
            <h2>{reading.note.title}</h2>
          </div>
          <span className="ibol-pilo__tag" data-tone="reglas">
            Lectura sin IA
          </span>
        </div>
        {reading.note.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="ibol-pilo__source">
          Calculada con las mismas cuentas del Portal de Impacto. La lectura con IA no se generó: {reading.reason}.
        </p>
      </section>
    );
  }
  const a = reading.result.answer;
  return (
    <section className="ibol-pilo">
      <div className="ibol-pilo__head">
        <PiloAvatar mood="idea" size={72} />
        <div>
          <span className="ibol-kicker">
            <b>{number}</b> · La lectura de Mr. Pilo
          </span>
          <h2>{a.principal ?? "Lo que dicen las cifras"}</h2>
        </div>
        <span className="ibol-pilo__tag">Resumen con IA</span>
      </div>
      {(a.hallazgos ?? []).map((h) => (
        <p key={h}>{h}</p>
      ))}
      {(a.preguntas ?? []).length > 0 && (
        <div className="ibol-pilo__recs">
          <strong>Para decidir</strong>
          <ol>
            {a.preguntas!.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="ibol-pilo__source" data-ok={reading.result.verified || undefined}>
        <Icon name={reading.result.verified ? "check" : "alert"} size={14} />
        <span>
          Generado por Mr. Pilo con IA a partir de las cifras de este boletín ·{" "}
          {reading.result.verified ? (
            <strong>números verificados contra los datos</strong>
          ) : (
            <strong>revise: {reading.result.unknown.join(", ")} no aparecen en los datos</strong>
          )}{" "}
          · {stamp(reading.at)}
        </span>
      </p>
    </section>
  );
}

/* --- Piezas comunes ----------------------------------------------------------------------- */

function Cover({ scope, cut, tone }: { scope: ReactNode; cut: number | null; tone: string }) {
  return (
    <header className="ibol-cover" style={{ "--tone": tone } as CSSProperties}>
      <div className="ibol-cover__top">
        <img src="/logo-udes.svg" alt="Universidad de Santander UDES" />
        <span className="ibol-kicker">{cut ? `Corte ${cut}` : "Sin cifras aún"}</span>
      </div>
      <h1>{BULLETIN_TITLE}</h1>
      <p className="ibol-cover__scope">{scope}</p>
      <Rule />
    </header>
  );
}

function Running({ label, cut }: { label: string; cut: number | null }) {
  return (
    <header className="ibol-running">
      <img src="/logo-udes.svg" alt="" />
      <span>
        Boletín de Seguimiento · {label}
        <small>
          {cut ? `Corte ${cut} · ` : ""}
          {today()}
        </small>
      </span>
    </header>
  );
}

export const Rule = () => (
  <div className="ibol-rule" aria-hidden="true">
    {FUNCTIONS.map((f) => (
      <span key={f} style={{ background: FUNCTION_TONE[f] }} />
    ))}
  </div>
);

export function Footer({ page, total }: { page: number; total: number }) {
  return (
    <footer className="ibol-footer">
      <Rule />
      <div>
        <span>
          <i aria-hidden="true" />
          <strong>{BULLETIN_OFFICE}</strong>
          <span>Universidad de Santander · UDES</span>
        </span>
        <span className="ibol-footer__sign">Impacto Institucional 2024-2028</span>
        <strong>
          Pág. {page} / {total}
        </strong>
      </div>
    </footer>
  );
}

function H2({ n, children, hint, tone }: { n: number; children: ReactNode; hint?: string; tone: string }) {
  return (
    <div className="ibol-h2" style={{ "--tone": tone } as CSSProperties}>
      <h2>
        <b>{n}</b> · {children}
      </h2>
      {hint && <span>{hint}</span>}
    </div>
  );
}

function Kpis({ items }: { items: { label: string; value: ReactNode; of?: string; note?: string; good?: boolean }[] }) {
  return (
    <div className="ibol-kpis">
      {items.map((k) => (
        <div key={k.label} data-good={k.good || undefined}>
          <span>{k.label}</span>
          <strong>
            {k.value}
            {k.of && <small> {k.of}</small>}
          </strong>
          {k.note && <em>{k.note}</em>}
        </div>
      ))}
    </div>
  );
}

function Chip({ standing }: { standing: Standing }) {
  return (
    <span className="ibol-chip" data-standing={standing}>
      {STANDING_GLYPH[standing]} {STANDING_LABEL[standing]}
    </span>
  );
}

function Bar({ counts, compact = false }: { counts: StandingCounts; compact?: boolean }) {
  if (!totalOf(counts)) return <div className="ibol-bar" data-empty />;
  return (
    <div className="ibol-bar" data-compact={compact || undefined} role="img" aria-label={STANDINGS.filter((s) => counts[s]).map((s) => `${counts[s]} ${STANDING_LABEL[s].toLowerCase()}`).join(", ")}>
      {STANDINGS.map((s) =>
        counts[s] ? (
          <span key={s} data-standing={s} style={{ flexGrow: counts[s] }}>
            {STANDING_GLYPH[s]} {counts[s]}
          </span>
        ) : null,
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="ibol-legend">
      {STANDINGS.map((s) => (
        <li key={s}>
          <span className="ibol-glyph" data-standing={s}>
            {STANDING_GLYPH[s]}
          </span>
          {s === "rezagada" ? `${STANDING_LABEL[s]} (< ${LAGGING_BELOW} %)` : STANDING_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)} %`);
const fig = (v: number | null, measure: Parameters<typeof formatFigure>[1]) => (v === null ? "—" : formatFigure(Math.round(v * 100) / 100, measure));
const shortCode = (code: string) => (code.startsWith("P-") ? `P-${code.split("-").pop()}` : code);

function HowToRead() {
  return (
    <div className="ibol-howto">
      <div>
        <strong>Avance</strong>
        <span>Cifra más reciente ÷ meta 2026. En lo que debe bajar (deserción) se invierte.</span>
      </div>
      <div>
        <strong>Estados</strong>
        <span>✓ cumplida ≥ 100 % · ◐ en camino ≥ {LAGGING_BELOW} % · ▲ rezagada &lt; {LAGGING_BELOW} % · ○ sin cifra · – meta sin número. Un vacío no es un cero.</span>
      </div>
      <div>
        <strong>Fuente</strong>
        <span>Intranet de Impacto UDES: fichas publicadas y cifras reportadas por programas y vicerrectorías.</span>
      </div>
    </div>
  );
}

function HeatCell({ cell }: { cell: GridCell }) {
  if (!cell.adopted) return <span className="ibol-heat" data-cell="none">·</span>;
  const s = standingOf(cell.pct, true);
  return (
    <span className="ibol-heat" data-standing={s}>
      {STANDING_GLYPH[s]} {cell.pct === null ? "sin cifra" : `${cell.pct} %`}
    </span>
  );
}

/* --- Boletín de una vicerrectoría ------------------------------------------------------------ */

const BOX_MAX = 160;
const on = (v: number, max: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`;

function VicerrectoriaDoc({ data, fn }: { data: PortalData; fn: SubstantiveFunction }) {
  const b: VicerrectoriaBulletin = useMemo(() => vicerrectoriaBulletin(data, fn), [data, fn]);
  const tone = FUNCTION_TONE[fn];
  const title = `Boletín Impacto · ${b.unitName} · ${today()}`;
  const reading = usePiloReading(`Boletín de ${b.unitName}`, b.sections, b.note);
  const k = b.kpis;
  const share = metShare(k.counts);

  const items: DocItem[] = [
    {
      key: "kpis",
      kind: "block",
      node: (
        <>
          <H2 n={1} tone={tone}>
            Resumen en cifras
          </H2>
          <Kpis
            items={[
              { label: "Indicadores de la función", value: k.indicators, note: `${k.chosen} elegidos por programas` },
              { label: "Programas que reportan", value: k.reporting, of: `de ${k.adopting}`, note: `${k.pending} cifras pendientes` },
              { label: "Metas de programa cumplidas", value: share === null ? "—" : `${share} %`, note: `${k.counts.cumplida} de ${withTarget(k.counts)} con meta`, good: true },
              { label: "Cifra UDES en meta", value: k.udesMet.length, of: `de ${k.udesMeasured}`, note: k.udesMet.slice(0, 2).join(" · ") || "Ninguna todavía" },
            ]}
          />
        </>
      ),
    },
    {
      key: "tabla",
      kind: "rows",
      cols: "56px minmax(0, 1fr) 70px 70px 52px 40px 56px 100px",
      head: (continued) => (
        <>
          <H2 n={2} tone={tone} hint="Cifra más reciente de la UDES frente a la meta 2026">
            Indicadores de la función{continued ? " (continuación)" : ""}
          </H2>
          <div className="ibol-tr ibol-tr--head">
            <span>Cód.</span>
            <span>Indicador</span>
            <span className="ibol-num">Cifra UDES</span>
            <span className="ibol-num">Meta 2026</span>
            <span className="ibol-num">Avance</span>
            <span className="ibol-num">Prog.</span>
            <span className="ibol-num">Cumplen</span>
            <span>Estado UDES</span>
          </div>
        </>
      ),
      rows: b.table.map((r) => (
        <div key={r.indicator.id} className="ibol-tr">
          <span className="ibol-code" style={{ color: tone }}>
            {r.indicator.code}
          </span>
          <span>
            <b>{r.indicator.name}</b>
            <small>{STAGE_LABEL[r.indicator.stage]}</small>
          </span>
          <span className="ibol-num ibol-strong">{fig(r.value, r.indicator.measure)}</span>
          <span className="ibol-num ibol-soft">{r.indicator.target2026 || "—"}</span>
          <span className="ibol-num ibol-pct" data-standing={r.standing}>
            {pct(r.pct)}
          </span>
          <span className="ibol-num">{r.spread?.adopters ?? 0}</span>
          <span className="ibol-num">{pct(r.share)}</span>
          <span>
            <Chip standing={r.standing} />
          </span>
        </div>
      )),
      foot: (
        <p className="ibol-note">
          Avance = cifra UDES ÷ meta 2026 (se invierte en lo que debe bajar). «Cumplen» = % de los programas con meta que ya la alcanzan. Un indicador sin cifra no cuenta
          como cero.
        </p>
      ),
    },
    {
      key: "facultades",
      kind: "rows",
      cols: "200px 40px minmax(0, 1fr) 56px",
      head: (continued) => (
        <>
          <H2 n={3} tone={tone} hint={`Cada barra = 100 % de los indicadores de ${FUNCTION_LABEL[fn].toLowerCase()} de sus programas`}>
            Cumplimiento por facultad{continued ? " (continuación)" : ""}
          </H2>
          <div className="ibol-tr ibol-tr--head">
            <span>Facultad</span>
            <span className="ibol-num">Prog.</span>
            <span>Estados</span>
            <span className="ibol-num">Cumplen</span>
          </div>
        </>
      ),
      rows: b.faculties.map((f) => (
        <div key={f.key} className="ibol-tr" data-total={f.total || undefined}>
          <span className="ibol-strong">{f.name}</span>
          <span className="ibol-num">{f.programs}</span>
          <Bar counts={f.counts} compact />
          <span className="ibol-num ibol-share" data-level={level(metShare(f.counts))}>
            {pct(metShare(f.counts))}
          </span>
        </div>
      )),
      foot: <Legend />,
    },
    {
      key: "cajas",
      kind: "rows",
      cols: "230px minmax(0, 1fr) 52px",
      head: (continued) => (
        <>
          <H2 n={4} tone={tone} hint="La caja es la mitad central; la raya, la mediana; los bigotes, el más bajo y el más alto; la punteada, la meta">
            Cada indicador entre sus programas{continued ? " (continuación)" : ""}
          </H2>
          <div className="ibol-tr ibol-tr--head">
            <span>Indicador</span>
            <span className="ibol-scale">
              <i style={{ left: "0%" }}>0 %</i>
              <i style={{ left: on(50, BOX_MAX) }}>50 %</i>
              <i style={{ left: on(100, BOX_MAX) }}>meta</i>
              <i style={{ left: "100%" }}>{BOX_MAX} %+</i>
            </span>
            <span className="ibol-num">Med.</span>
          </div>
        </>
      ),
      rows: b.boxes.map((s) => (
        <div key={s.indicator.id} className="ibol-tr">
          <span>
            <b className="ibol-code" style={{ color: tone }}>
              {s.indicator.code}
            </b>{" "}
            {s.indicator.name}
          </span>
          <span className="ibol-box" style={{ "--tone": tone } as CSSProperties}>
            <i className="ibol-box__goal" style={{ left: on(100, BOX_MAX) }} />
            {s.box && s.reported >= 2 ? (
              <>
                <i className="ibol-box__whisker" style={{ left: on(s.box.min, BOX_MAX), right: `calc(100% - ${on(s.box.max, BOX_MAX)})` }} />
                <i className="ibol-box__box" style={{ left: on(s.box.q1, BOX_MAX), right: `calc(100% - ${on(s.box.q3, BOX_MAX)})` }} />
                <i className="ibol-box__median" style={{ left: on(s.box.median, BOX_MAX) }} />
              </>
            ) : (
              <em>
                ○ {s.reported} de {s.adopters} programas con cifra: sin reparto
              </em>
            )}
          </span>
          <span className="ibol-num ibol-pct" data-standing={s.box ? standingOf(s.box.median, true) : "sin_cifra"}>
            {s.box ? pct(s.box.median) : "—"}
          </span>
        </div>
      )),
    },
    ...(b.callouts.even || b.callouts.wide || b.callouts.unreported
      ? [
          {
            key: "llamados",
            kind: "block" as const,
            node: (
              <div className="ibol-callouts">
                {b.callouts.even?.box && (
                  <div data-tone="parejo">
                    <strong>Más parejo</strong>
                    <span>
                      {b.callouts.even.indicator.name}: la mitad central de sus {b.callouts.even.reported} programas va entre {pct(b.callouts.even.box.q1)} y{" "}
                      {pct(b.callouts.even.box.q3)}.
                    </span>
                  </div>
                )}
                {b.callouts.wide?.box && (
                  <div data-tone="disperso">
                    <strong>▲ Más disperso</strong>
                    <span>
                      {b.callouts.wide.indicator.name}: de {pct(b.callouts.wide.box.min)} a {pct(b.callouts.wide.box.max)} entre programas.
                    </span>
                  </div>
                )}
                {b.callouts.unreported && (
                  <div data-tone="sin">
                    <strong>○ Sin reparto</strong>
                    <span>
                      {b.callouts.unreported.indicator.name}: faltan {b.callouts.unreported.adopters - b.callouts.unreported.reported} de {b.callouts.unreported.adopters}{" "}
                      programas por reportar.
                    </span>
                  </div>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      key: "calor",
      kind: "rows",
      cols: `200px repeat(${Math.max(1, b.heat.cols.length)}, minmax(0, 1fr))`,
      head: (continued) => (
        <>
          <H2 n={5} tone={tone} hint="Avance mediano de sus programas · «·» ninguno lo eligió · «○» sin cifra">
            Indicador por facultad{continued ? " (continuación)" : ""}
          </H2>
          <div className="ibol-tr ibol-tr--head ibol-tr--heat">
            <span>Indicador</span>
            {b.heat.cols.map((c) => (
              <span key={c} className="ibol-center">
                {c.replace(/^Facultad de /, "")}
              </span>
            ))}
          </div>
        </>
      ),
      rows: b.heat.rows.map((r) => (
        <div key={r.indicator.id} className="ibol-tr ibol-tr--heat">
          <span>
            <b className="ibol-code" style={{ color: tone }}>
              {r.indicator.code}
            </b>{" "}
            {r.indicator.name}
          </span>
          {r.cells.map((cell, i) => (
            <HeatCell key={i} cell={cell} />
          ))}
        </div>
      )),
    },
    { key: "pilo", kind: "block", node: <PiloReading reading={reading} number={6} /> },
    { key: "leer", kind: "block", node: <HowToRead /> },
  ];

  return (
    <Shell title={title} back={{ to: `/impacto/vicerrectoria/${FN_SLUG[fn]}`, label: FUNCTION_LABEL[fn] }} status={readingStatus(reading)}>
      {(onReady) => (
        <PagedDocument
          cover={
            <Cover
              tone={tone}
              cut={b.cut}
              scope={
                <>
                  {b.unitName} · Generado por la {BULLETIN_OFFICE} · {today()}
                </>
              }
            />
          }
          running={<Running label={b.unitName} cut={b.cut} />}
          footer={(page, total) => <Footer page={page} total={total} />}
          items={items}
          version={`${fn}:${reading.kind}:${b.table.length}`}
          onReady={onReady}
        />
      )}
    </Shell>
  );
}

const level = (share: number | null) => (share === null ? undefined : share >= 40 ? "alto" : share >= 25 ? "medio" : "bajo");

/* --- Boletín de un programa --------------------------------------------------------------- */

function ProgramDoc({ data, programId, campusId }: { data: PortalData; programId: string; campusId: string | null }) {
  const program = programsOf(data).find((p) => p.id === programId)!;
  const b: ProgramBulletin = useMemo(() => programBulletin(data, program, campusId), [data, program, campusId]);
  const tone = FUNCTION_TONE.ensenanza;
  const where = b.campusName ? `Sede ${b.campusName}` : b.campusNames.length ? `Sedes ${b.campusNames.join(", ").replace(/, ([^,]*)$/, " y $1")}` : "Sin sedes";
  const title = `Boletín Impacto · ${program.name}${b.campusName ? ` · ${b.campusName}` : ""} · ${today()}`;
  const reading = usePiloReading(`Boletín del programa ${program.name}`, b.sections, b.note);
  const all = [...b.institutional, ...b.own];
  const missing = all.filter((r) => r.standing === "sin_cifra");
  let n = 0;
  const next = () => ++n;

  const indicatorRows = (rows: IndicatorStanding[]) =>
    rows.map((r) => (
      <div key={r.indicator.id} className="ibol-tr">
        <span className="ibol-code" style={{ color: FUNCTION_TONE[r.indicator.fn] }}>
          {shortCode(r.indicator.code)}
        </span>
        <span className="ibol-strong">{r.indicator.name}</span>
        <span className="ibol-soft">
          <i className="ibol-dot" style={{ background: FUNCTION_TONE[r.indicator.fn] }} /> {FUNCTION_LABEL[r.indicator.fn]} · {STAGE_LABEL[r.indicator.stage]}
        </span>
        <span className="ibol-num ibol-strong">{fig(r.value, r.indicator.measure)}</span>
        <span className="ibol-num ibol-soft">{r.target === null ? r.indicator.target2026 || "—" : fig(r.target, r.indicator.measure)}</span>
        <span className="ibol-num ibol-pct" data-standing={r.standing}>
          {pct(r.pct)}
        </span>
        <span>
          <Chip standing={r.standing} />
        </span>
      </div>
    ));
  const tableHead = (label: string, hint: string, number: number) => (continued: boolean) => (
    <>
      <H2 n={number} tone={tone} hint={hint}>
        {label}
        {continued ? " (continuación)" : ""}
      </H2>
      <div className="ibol-tr ibol-tr--head">
        <span>Cód.</span>
        <span>Indicador</span>
        <span>Función · eslabón</span>
        <span className="ibol-num">Cifra</span>
        <span className="ibol-num">Meta 2026</span>
        <span className="ibol-num">Avance</span>
        <span>Estado</span>
      </div>
    </>
  );
  const TABLE_COLS = "70px minmax(0, 1fr) 128px 62px 62px 50px 104px";

  const nKpi = next();
  const nInst = next();
  const nOwn = b.own.length ? next() : 0;
  const nState = next();
  const nChain = next();
  const nBullets = next();
  const nNet = next();
  const nPilo = next();

  const items: DocItem[] = [
    {
      key: "kpis",
      kind: "block",
      node: (
        <>
          <H2 n={nKpi} tone={tone}>
            Resumen en cifras
          </H2>
          <Kpis
            items={[
              { label: "Indicadores que sigue", value: all.length, note: `${b.institutional.length} institucionales · ${b.own.length} propios` },
              {
                label: b.cut ? `Con cifra en ${b.cut}` : "Con cifra",
                value: all.filter((r) => r.value !== null).length,
                of: `de ${all.length}`,
                note: missing.length ? `Faltan: ${missing.slice(0, 2).map((r) => r.indicator.name.toLowerCase()).join(" · ")}` : "Todos tienen cifra",
              },
              {
                label: "Cumplen la meta 2026",
                value: b.allCounts.cumplida,
                of: `de ${withTarget(b.allCounts)}`,
                note: b.allCounts.rezagada ? `${b.allCounts.rezagada} rezagados (< ${LAGGING_BELOW} %)` : "Ninguno rezagado",
                good: true,
              },
              { label: "Avance mediano", value: pct(b.median), note: `Su facultad: ${pct(b.facultyMedian)}` },
            ]}
          />
        </>
      ),
    },
    {
      key: "inst",
      kind: "rows",
      cols: TABLE_COLS,
      head: tableHead("Fichas institucionales que sigue", b.campusName ? `En ${b.campusName} · meta del programa` : "Promedio de sus sedes · meta del programa", nInst),
      rows: indicatorRows(b.institutional),
      foot: (
        <p className="ibol-note">
          {b.institutional.length ? "Primero lo que necesita atención. " : "El programa aún no ha elegido fichas institucionales. "}
          Avance = cifra ÷ meta 2026 del programa (se invierte en lo que debe bajar).{b.own.length ? " Los indicadores propios del programa van aparte." : ""}
        </p>
      ),
    },
    ...(b.own.length
      ? [
          {
            key: "own",
            kind: "rows" as const,
            cols: TABLE_COLS,
            head: tableHead("Indicadores propios del programa", "Aparte de las fichas institucionales", nOwn),
            rows: indicatorRows(b.own),
          },
        ]
      : []),
    {
      key: "estado",
      kind: "block",
      node: (
        <>
          <H2 n={nState} tone={tone} hint="Cifra más reciente frente a la meta 2026">
            Estado de sus {all.length} indicadores
          </H2>
          <Bar counts={b.allCounts} />
          <Legend />
        </>
      ),
    },
    {
      key: "cadena",
      kind: "block",
      node: (
        <div className="ibol-two">
          <div>
            <H2 n={nChain} tone={tone}>
              Su cadena de valor
            </H2>
            <div className="ibol-stages">
              <span />
              {STAGES.map((s) => (
                <span key={s} className="ibol-stages__head">
                  {STAGE_LABEL[s]}
                </span>
              ))}
              {FUNCTIONS.map((f) => [
                <span key={`${f}-l`} className="ibol-stages__fn" style={{ color: FUNCTION_TONE[f] }}>
                  {FUNCTION_LABEL[f]}
                </span>,
                ...STAGES.map((s) => (
                  <span key={`${f}-${s}`} className="ibol-stages__cell" data-empty={!b.stages[f][s] || undefined} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
                    {b.stages[f][s] || "falta"}
                  </span>
                )),
              ])}
            </div>
          </div>
          <div>
            <h3 className="ibol-h3">Cumplimiento por función</h3>
            <ul className="ibol-fnbars">
              {b.byFn.map((f) => (
                <li key={f.fn}>
                  <span>
                    <b style={{ color: FUNCTION_TONE[f.fn] }}>● {FUNCTION_LABEL[f.fn]}</b>
                    <small>{f.total ? `${f.counts.cumplida} de ${withTarget(f.counts)} cumplen` : "Sin indicadores"}</small>
                  </span>
                  <Bar counts={f.counts} compact />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ),
    },
    {
      key: "avance",
      kind: "rows",
      cols: "minmax(0, 1fr) 210px 116px 48px",
      head: (continued) => (
        <>
          <H2 n={nBullets} tone={tone} hint="La raya es el 100 % · escala hasta 125 %">
            Avance hacia la meta, indicador por indicador{continued ? " (continuación)" : ""}
          </H2>
        </>
      ),
      rows: all
        .filter((r) => r.standing !== "sin_meta")
        .map((r) => (
          <div key={r.indicator.id} className="ibol-tr" data-standing={r.standing}>
            <span>
              <b className="ibol-code" style={{ color: FUNCTION_TONE[r.indicator.fn] }}>
                {shortCode(r.indicator.code)}
              </b>{" "}
              {r.indicator.name}
            </span>
            <span className="ibol-bullet">{r.pct !== null ? <span style={{ width: on(r.pct, 125) }} /> : <span data-hatch />}<i /></span>
            <span className="ibol-soft ibol-num">
              {fig(r.value, r.indicator.measure)} / {r.target === null ? "—" : fig(r.target, r.indicator.measure)}
            </span>
            <span className="ibol-num ibol-pct" data-standing={r.standing}>
              {pct(r.pct)}
            </span>
          </div>
        )),
    },
    { key: "red", kind: "block", node: <NetworkFigure b={b} number={nNet} tone={tone} /> },
    { key: "pilo", kind: "block", node: <PiloReading reading={reading} number={nPilo} /> },
    { key: "leer", kind: "block", node: <HowToRead /> },
  ];

  return (
    <Shell title={title} back={{ to: `/impacto/programa/${program.slug}${b.campusName ? `?sede=${data.campuses.find((c) => c.id === campusId)?.slug}` : ""}`, label: program.name }} status={readingStatus(reading)}>
      {(onReady) => (
        <PagedDocument
          cover={
            <Cover
              tone={tone}
              cut={b.cut}
              scope={
                <>
                  Programa de {program.name} · {program.faculty?.name ?? "Sin facultad"} · {where}
                  <br />
                  Generado por la {BULLETIN_OFFICE} · {today()}
                </>
              }
            />
          }
          running={<Running label={`${program.name}${b.campusName ? ` · ${b.campusName}` : ""}`} cut={b.cut} />}
          footer={(page, total) => <Footer page={page} total={total} />}
          items={items}
          version={`${programId}:${campusId}:${reading.kind}:${all.length}`}
          onReady={onReady}
        />
      )}
    </Shell>
  );
}

/* --- El mapa de red, quieto, para el papel -------------------------------------------------- */

const themeTone = (i: number) => `var(--od-line-${(i % 11) + 1})`;

function NetworkFigure({ b, number, tone }: { b: ProgramBulletin; number: number; tone: string }) {
  const { network: net, layout } = b;
  const vb = layout.viewBox;
  const toneOf = new Map(net.themes.map((t, i) => [t.key, themeTone(i)]));
  return (
    <div className="ibol-net">
      <H2 n={number} tone={tone} hint="Sus indicadores unidos por los pilares del PDI y los ODS que comparten; en el centro, el programa">
        Mapa de red del programa
      </H2>
      {net.nodes.length === 0 ? (
        <p className="ibol-note">El programa aún no tiene indicadores: sin ellos no hay red que dibujar.</p>
      ) : (
        <>
          <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={`Mapa de red: ${net.nodes.length} indicadores y ${net.edges.length} conexiones.`}>
            {net.nodes.map((n) => {
              const p = layout.nodes.get(n.id)!;
              return <line key={`h-${n.id}`} className="ibol-net__hub-edge" x1={p.x} y1={p.y} x2={layout.hub.x} y2={layout.hub.y} />;
            })}
            {net.edges.map((e) => (
              <path
                key={`${e.a}-${e.b}`}
                d={edgePath(layout.nodes.get(e.a)!, layout.nodes.get(e.b)!, e.cross, layout.hub)}
                className="ibol-net__edge"
                data-kind={e.kind}
                data-cross={e.cross || undefined}
                style={{ "--edge": e.kind === "ficha" ? "var(--brand-navy)" : toneOf.get(e.keys[0]) } as CSSProperties}
              />
            ))}
            {FUNCTIONS.map((f) => (
              <text key={f} className="ibol-net__fn" x={layout.titles[f].x} y={layout.titles[f].y} textAnchor={layout.titles[f].anchor} fill={FUNCTION_TONE[f]}>
                {FUNCTION_LABEL[f]}
              </text>
            ))}
            <circle className="ibol-net__hub" cx={layout.hub.x} cy={layout.hub.y} r={13} />
            <text className="ibol-net__hub-label" x={layout.hub.x} y={layout.hub.y - 20} textAnchor="middle">
              {b.program.name.length > 30 ? `${b.program.name.slice(0, 29)}…` : b.program.name}
            </text>
            {net.nodes.map((n) => {
              const p = layout.nodes.get(n.id)!;
              return (
                <g key={n.id} className="ibol-net__node" data-own={n.own || undefined} style={{ "--tone": FUNCTION_TONE[n.fn] } as CSSProperties}>
                  <circle cx={p.x} cy={p.y} r={7.2} />
                  <text x={p.lx} y={p.ly} textAnchor={p.anchor}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="ibol-net__legend">
            <span className="ibol-swatch" data-own>
              <i /> Propio del programa
            </span>
            <span className="ibol-swatch" data-hub>
              <i /> El programa
            </span>
            {net.themes.slice(0, 10).map((t, i) => (
              <span key={t.key} className="ibol-swatch" data-line style={{ "--edge": themeTone(i) } as CSSProperties} title={t.hint}>
                <i /> {t.label}
                {t.hint ? ` · ${t.hint}` : ""}
              </span>
            ))}
            {net.themes.length === 0 && <span className="ibol-soft">Sus indicadores aún no comparten pilares ni ODS confirmados.</span>}
          </div>
        </>
      )}
    </div>
  );
}
