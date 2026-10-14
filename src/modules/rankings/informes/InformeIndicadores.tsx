/* =============================================================================
   Informes ODS con Pilo · 2. Evidencia por indicador (THE).

   THE no hace clic en enlaces y rechaza páginas con muchos: cada indicador
   lleva UNA sola nota y una página de evidencia limpia. Pilo propone las
   candidatas con sus alertas; la persona elige, responde lo que solo ella sabe
   («¿los actos son gratuitos?»), completa la ficha de hechos, ve cómo lo
   evaluaría THE (una simulación de Pilo) y la página tal como la verá THE:
   en inglés primero, con el español a un clic. Aprobar es siempre de una persona.

   Composición: la tabla de indicadores (tipo, evidencia elegida, puntos) a la
   izquierda y, a la derecha, las propuestas de Pilo del indicador elegido. En
   tableta y teléfono van una debajo de la otra; en el teléfono la tabla se
   vuelve tarjetas.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useFundido } from "../movimiento";
import { useQueryClient } from "@tanstack/react-query";
import { paginaDeEleccion, piloIndicador, resumenCobertura, useGuardarEleccion, useNoticiasDeOds } from "./datos";
import type { EvidenciaPublica, NoticiaOds } from "./datos";
import { indicadoresDe } from "./the-indicadores";
import { puntosEvidencia } from "./tipos";
import type { Candidata, EleccionIndicador, Foto, IndicadorTHE, InformeCompleto } from "./tipos";
import { EvidenciaHoja } from "../../sostenible/OdsEvidence";
import "../../sostenible/ods-evidence.css";
import { Evaluador, FichaEditor } from "./InformeFicha";

const f1 = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
const TIPO: Record<IndicadorTHE["tipo"], string> = { ev: "Evidencia", doc: "Documento", dato: "Dato", inv: "Scopus" };
const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** La existencia que cuenta: la respuesta de la persona si el indicador la pide; si no, 1. */
export function existenciaDe(ind: IndicadorTHE, el?: Pick<EleccionIndicador, "ask"> | null): number {
  const p = ind.pregunta_persona;
  if (!p) return 1;
  const v = parseFloat(el?.ask?.[p.clave] ?? p.por_defecto);
  return Number.isFinite(v) ? v : 1;
}

export function puntosDe(ind: IndicadorTHE, el: EleccionIndicador | undefined, c: Candidata) {
  return puntosEvidencia(existenciaDe(ind, el), c.rel);
}

/** El estado corto de un indicador para la lista. */
export function estadoIndicador(ind: IndicadorTHE, el?: EleccionIndicador): { texto: string; tono: "ok" | "warn" | "bad" | "mute" } {
  if (ind.tipo === "dato") return { texto: "Necesita un dato", tono: "warn" };
  if (ind.tipo === "inv") return { texto: "Lo calcula THE", tono: "mute" };
  const c = el?.candidates.find((x) => x.news_id === el.news_id);
  if (el?.news_id && c) {
    const p = puntosDe(ind, el, c);
    return { texto: `${f1(p.total)} de ${ind.maximo}${el.approved ? " · aprobada" : ""}`, tono: el.approved ? "ok" : "warn" };
  }
  if (ind.tipo === "doc") return { texto: "Necesita la política", tono: "warn" };
  if (!el?.candidates.length) return { texto: "Sin evidencia", tono: "bad" };
  return { texto: "Pilo propone", tono: "warn" };
}

/** La página de evidencia tal como la armaría el portal, a partir de la elección. */
export function evidenciaDesde(ods: number, ind: string, el: EleccionIndicador, n: NoticiaOds, foto?: Pick<Foto, "kind" | "minors">): EvidenciaPublica {
  const conFoto = Boolean(n.image_url && foto && foto.kind === "foto" && !foto.minors);
  return {
    indicator: ind,
    ods,
    title: n.title,
    title_en: n.title_en ?? "",
    date: n.published_on,
    section: n.section,
    campus: n.campus,
    image_url: conFoto ? n.image_url : null,
    url: n.url,
    page_es: el.page_es,
    page_en: el.page_en,
    ficha: el.ficha && Object.keys(el.ficha).length ? { indicator: ind, question: "", answer: "", who: "", what: "", when: "", where: "", how_many: "", beneficiaries: "", partners: "", evidence_type: "", period: "", ...el.ficha } : null,
  };
}

export function InformeIndicadores({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const inds = useMemo(() => indicadoresDe(inf.ods), [inf.ods]);
  const notasQ = useNoticiasDeOds(inf.ods, inf.edition);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const eleccion = (id: string) => completo.elecciones.find((e) => e.indicator === id);
  /* Abre el primer indicador de noticias con algo que revisar; si no hay, el primero de noticias. */
  const primero = inds.find((i) => i.tipo === "ev" && eleccion(i.id)?.news_id && !eleccion(i.id)?.approved) ?? inds.find((i) => i.tipo === "ev") ?? inds[0];
  const [sel, setSel] = useState<string | null>(null);
  const ind = inds.find((i) => i.id === sel) ?? primero;
  const detalle = useRef<HTMLDivElement>(null);
  useFundido(detalle, ind?.id, { desplazamiento: 6 });

  const cov = resumenCobertura(completo, inds);
  /* Cobertura: puntos de los indicadores de evidencia que ya tienen nota elegida. */
  let tot = 0;
  let max = 0;
  for (const x of inds) {
    if (x.tipo !== "ev") continue;
    max += x.maximo;
    const el = eleccion(x.id);
    const c = el?.candidates.find((k) => k.news_id === el.news_id);
    if (el && c) tot += puntosDe(x, el, c).total;
  }

  if (!inds.length)
    return (
      <p className="ri-lead">
        La metodología de THE no pide evidencia de noticias para el ODS {inf.ods}. Este informe se arma con el relato, las cifras y las fotografías.
      </p>
    );

  return (
    <div className="ri-ig">
      <div className="ri-ilist">
        <div className="ri-etabla-marco">
          <table className="ri-etabla">
            <caption className="sr-only">Indicadores del ODS {inf.ods}: evidencia elegida y puntos</caption>
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Tipo</th>
                <th scope="col">Evidencia elegida</th>
                <th scope="col">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {inds.map((x) => {
                const el = eleccion(x.id);
                const st = estadoIndicador(x, el);
                const nota = el?.news_id ? notas.get(el.news_id) : undefined;
                const actual = ind?.id === x.id;
                return (
                  <tr key={x.id} aria-current={actual ? "true" : undefined} onClick={() => setSel(x.id)}>
                    <td data-label="Indicador">
                      <button type="button" className="ri-ind" aria-current={actual ? "true" : undefined} onClick={() => setSel(x.id)}>
                        <span className="ri-ind__id">{x.id}</span>
                        <b>{x.titulo}</b>
                      </button>
                    </td>
                    <td data-label="Tipo">
                      <span className="ri-tag" data-tono={x.tipo === "ev" || x.tipo === "doc" ? "pilo" : "mute"}>
                        {TIPO[x.tipo]}
                      </span>
                    </td>
                    <td data-label="Evidencia elegida" className="ri-etabla__ev">
                      {x.tipo === "dato" || x.tipo === "inv" ? (
                        <span className="ri-mute">{x.tipo === "dato" ? "Cifra institucional" : "Lo calcula THE"}</span>
                      ) : nota ? (
                        <span className="ri-etabla__nota">{nota.title}</span>
                      ) : (
                        <span className="ri-mute">{el?.candidates.length ? "Sin elegir" : "Sin candidatas"}</span>
                      )}
                    </td>
                    <td data-label="Puntos">
                      <span className="ri-tag" data-tono={st.tono}>
                        {st.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ri-cov">
          <h3 className="ri-k">Cobertura de evidencia</h3>
          <p>
            <b>{f1(tot)}</b> de {max} puntos
          </p>
          <p className="ri-mute">
            {cov.aprobadas} aprobadas y {cov.propuestas} con nota de {cov.conNoticias} indicadores de noticias
            {cov.faltan.length ? ` · sin evidencia: ${cov.faltan.join(", ")}` : ""}. No incluye los datos ni Scopus.
          </p>
        </div>
      </div>
      <div className="ri-idet" ref={detalle}>
        {ind && <Indicador key={ind.id} completo={completo} ind={ind} el={eleccion(ind.id)} notas={notas} />}
      </div>
    </div>
  );
}

function Indicador({ completo, ind, el, notas }: { completo: InformeCompleto; ind: IndicadorTHE; el?: EleccionIndicador; notas: Map<string, NoticiaOds> }) {
  const inf = completo.informe;
  const guardar = useGuardarEleccion();
  const cliente = useQueryClient();
  const [pilo, setPilo] = useState(false);
  const [error, setError] = useState("");
  const [idiomaHoja, setIdiomaHoja] = useState<"en" | "es">("en");
  const base: EleccionIndicador = el ?? { report_id: inf.id, indicator: ind.id, news_id: null, candidates: [], ask: {}, page_es: [], page_en: "", approved: false };
  const escribir = (c: Partial<EleccionIndicador>) => {
    setError("");
    guardar.mutate({ ...base, ...c }, { onError: (e) => setError(`No se guardó: ${errorTexto(e)}`) });
  };
  const proponer = async () => {
    setPilo(true);
    setError("");
    try {
      const r = await piloIndicador({ report_id: inf.id, indicator: ind.id });
      if (!r.news_id && r.motivo) setError(`Pilo no encontró evidencia: ${r.motivo}`);
      void cliente.invalidateQueries({ queryKey: ["informe"] });
    } catch (e) {
      setError(`Pilo no pudo proponer: ${errorTexto(e)}`);
    } finally {
      setPilo(false);
    }
  };

  const cands = base.candidates
    .filter((c) => c.rel !== "n")
    .slice()
    .sort((a, b) => puntosDe(ind, base, b).total - puntosDe(ind, base, a).total);
  const elegida = cands.find((c) => c.news_id === base.news_id);
  const notaElegida = base.news_id ? notas.get(base.news_id) : undefined;
  const p = elegida ? puntosDe(ind, base, elegida) : null;
  const pp = ind.pregunta_persona;
  const ruta = `/sostenible/impact/evidencia/${inf.ods}/${ind.id}`;

  return (
    <div className="ri-icenter">
      <section className="ri-card">
        <div className="ri-ihead">
          <span className="ri-ihead__id">{ind.id}</span>
          <h3>{ind.titulo}</h3>
          {ind.peso !== null && <span className="ri-mute">{String(ind.peso).replace(".", ",")} % del ODS</span>}
        </div>
        <p className="ri-rule">
          <b>THE pregunta:</b> {ind.pregunta}
        </p>
        <p className="ri-rule">
          <b>Puntúa:</b> {ind.regla}
        </p>
      </section>

      {ind.tipo === "dato" || ind.tipo === "inv" ? (
        <section className="ri-card">
          <p className="ri-gap">
            <b>No lleva una noticia.</b> {ind.tipo === "dato" ? "Es una cifra: se carga con los datos institucionales del periodo." : "Lo calcula THE con la producción en Scopus."}
          </p>
        </section>
      ) : (
        <>
          {pp && (
            <section className="ri-card">
              <label className="ri-field">
                {pp.texto}
                <select value={base.ask[pp.clave] ?? pp.por_defecto} disabled={guardar.isPending} onChange={(e) => escribir({ ask: { ...base.ask, [pp.clave]: e.target.value }, approved: false })}>
                  {pp.opciones.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
                <span className="ri-mute">Solo una persona lo sabe: Pilo no lo deduce de la nota. Cambiarlo pide aprobar otra vez.</span>
              </label>
            </section>
          )}

          <section className="ri-card">
            <div className="ri-edhead">
              <h3 className="ri-h4">Una sola evidencia por indicador{cands.length ? ". Pilo propone:" : ""}</h3>
              <button type="button" className="button-ghost rk-sm ri-pilo-btn" disabled={pilo} onClick={() => void proponer()}>
                {pilo ? "Pilo está leyendo…" : cands.length ? "Que Pilo vuelva a proponer" : "Que Pilo proponga"}
              </button>
            </div>
            {!cands.length && <p className="ri-gap">{ind.tipo === "doc" ? "Este indicador pide el documento institucional (acuerdo, resolución o reglamento) con su fecha. Una noticia solo lo respalda." : "Ninguna nota aprobada responde todavía a este indicador."}</p>}
            <div role="radiogroup" aria-label={`Evidencia del indicador ${ind.id}`}>
              {cands.map((c, k) => {
                const n = notas.get(c.news_id);
                const pc = puntosDe(ind, base, c);
                return (
                  <label key={c.news_id} className="ri-alt" data-on={base.news_id === c.news_id ? "" : undefined}>
                    <input type="radio" name={`ev-${ind.id}`} checked={base.news_id === c.news_id} disabled={guardar.isPending} onChange={() => escribir({ news_id: c.news_id, approved: false })} />
                    <span>
                      <b>{n?.title ?? "Nota no disponible"}</b>
                      <small>
                        {[n?.published_on, n?.section].filter(Boolean).join(" · ")}
                        {k === 0 && " · "}
                        {k === 0 && (
                          <span className="ri-tag" data-tono="ok">
                            La mejor
                          </span>
                        )}
                      </small>
                      <ul className="ri-checks">
                        <li data-k={c.rel === "s" ? "y" : "w"}>
                          Relevancia <b>{c.rel === "s" ? "específica" : "general"}</b> ({f1(pc.relevancia)} punto{pc.relevancia === 1 ? "" : "s"}). {c.why}
                        </li>
                        {c.flags.map((f) => (
                          <li key={f} data-k="w">
                            {f}
                          </li>
                        ))}
                      </ul>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {elegida && p && (
            <section className="ri-card">
              <div className="ri-score">
                <div>
                  <small>Existe</small>
                  <b>{f1(p.existencia)}</b>
                </div>
                <div>
                  <small>Evidencia</small>
                  <b>{f1(p.relevancia)}</b>
                </div>
                <div>
                  <small>Pública</small>
                  <b>{f1(p.publica)}</b>
                </div>
                <div>
                  <small>Total</small>
                  <b>
                    {f1(p.total)} / {ind.maximo}
                  </b>
                </div>
              </div>
              <div className="ri-row ri-approve">
                {base.approved ? (
                  <>
                    <span className="ri-tag" data-tono="ok">
                      Aprobada
                    </span>
                    <button type="button" className="button-ghost rk-sm" disabled={guardar.isPending} onClick={() => escribir({ approved: false })}>
                      Quitar la aprobación
                    </button>
                  </>
                ) : (
                  <button type="button" className="button-primary rk-sm" disabled={guardar.isPending || !base.page_es.length} onClick={() => escribir({ approved: true })}>
                    Aprobar esta evidencia
                  </button>
                )}
                {!base.page_es.length && <span className="ri-mute">Pilo aún no armó la página: pídele que proponga.</span>}
              </div>
            </section>
          )}

          {elegida && (
            <FichaEditor
              ficha={base.ficha}
              textoPagina={paginaDeEleccion(base, ind, "en").texto}
              anio={inf.edition}
              guardando={guardar.isPending}
              onGuardar={(ficha) => escribir({ ficha, approved: false })}
            />
          )}

          <Evaluador report_id={inf.id} indicator={ind.id} ev={base.eval} listo={Boolean(elegida)} />

          {elegida && notaElegida && (
            <section className="ri-card">
              <div className="ri-edhead">
                <h3 className="ri-h4">Página de evidencia</h3>
                <div className="ri-seg" role="group" aria-label="Idioma de la página">
                  <button type="button" lang="en" aria-pressed={idiomaHoja === "en"} onClick={() => setIdiomaHoja("en")}>
                    English
                  </button>
                  <button type="button" aria-pressed={idiomaHoja === "es"} onClick={() => setIdiomaHoja("es")}>
                    Español
                  </button>
                </div>
              </div>
              <p className="ri-mute">En el orden de THE: indicador y pregunta, respuesta, ficha y frases de la nota. Sin menú, sin enlaces y sin adjuntos.</p>
              <div className="ri-evprev">
                <EvidenciaHoja ev={evidenciaDesde(inf.ods, ind.id, base, notaElegida, completo.fotos.find((f) => f.news_id === notaElegida.id))} lang={idiomaHoja} />
              </div>
              <p className="ri-mute">
                Dirección pública: <code>planeacion.udes.edu.co{ruta}</code>. Se ve cuando la evidencia está aprobada y el informe publicado.
              </p>
            </section>
          )}
        </>
      )}
      {error && (
        <p className="ri-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
