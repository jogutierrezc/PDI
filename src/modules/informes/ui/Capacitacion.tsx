/* =============================================================================
   Capacitación de Pilo (Planeación). Se suben los informes de 2025 en Word o
   PDF; el texto se extrae aquí, en el navegador (lectores de Pilo Enseñanza:
   el de Word de UDES en Cifras y pdf.js), se divide por títulos y se muestra
   lo que entra y lo que se descarta antes de enviarlo a pilo-informes
   (`ingerir`). Abajo, «lo que Pilo aprendió» (`corpus`).
   ========================================================================== */

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useAuth } from "../../../lib/auth";
import { importFresh } from "../../../lib/stale-chunk";
import { useEntrada } from "../../rankings/movimiento";
import { dividirPorTitulos, plantillaDesdeNombre, unidadDesdeNombre } from "../capacitacion";
import type { Descarte, SeccionExtraida } from "../capacitacion";
import { piloIngerir, useCorpus } from "../datos";
import type { ArchivoParaPilo, RespuestaIngesta } from "../datos";
import { LETRAS, PLANTILLAS } from "../plantillas";
import type { Plantilla } from "../types";
import { Vacio, mensajeDe } from "./comunes";

interface Leido {
  id: string;
  nombre: string;
  unidad: string;
  plantilla: Plantilla | null;
  estado: "leyendo" | "listo" | "error";
  error?: string;
  avisos: string[];
  secciones: (SeccionExtraida & { incluir: boolean })[];
  descartes: Descarte[];
}

const ACEPTA = /\.(docx|pdf)$/i;

/** Defensa en profundidad (0192): quien no gestiona los informes no ve la capacitación ni consulta el corpus; la función y la base también lo niegan. */
export function Capacitacion() {
  const { puedeGestionarInformes } = useAuth();
  if (!puedeGestionarInformes) return <Vacio>La capacitación de Pilo es de quien gestiona los informes.</Vacio>;
  return <CapacitacionGestion />;
}

function CapacitacionGestion() {
  const [anio, setAnio] = useState(2025);
  const [archivos, setArchivos] = useState<Leido[]>([]);
  const [encima, setEncima] = useState(false);
  const [envio, setEnvio] = useState<{ ocupado: boolean; resultado: RespuestaIngesta[]; error: string }>({ ocupado: false, resultado: [], error: "" });
  const corpus = useCorpus(true);
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, ".inf-arch", archivos.length);

  const fijar = (id: string, x: Partial<Leido>) => setArchivos((as) => as.map((a) => (a.id === id ? { ...a, ...x } : a)));

  const leer = async (lista: FileList | null) => {
    const nuevos = [...(lista ?? [])].filter((f) => ACEPTA.test(f.name));
    if (!nuevos.length) return;
    const { readDocument } = await importFresh(() => import("../../admin/pilo-ensenanza/ingest"));
    for (const f of nuevos) {
      const id = `${f.name}-${f.size}-${Date.now()}`;
      setArchivos((as) => [
        ...as,
        { id, nombre: f.name, unidad: unidadDesdeNombre(f.name), plantilla: plantillaDesdeNombre(f.name), estado: "leyendo", avisos: [], secciones: [], descartes: [] },
      ]);
      try {
        const doc = await readDocument(f);
        const d = dividirPorTitulos(doc.blocks);
        fijar(id, { estado: "listo", avisos: doc.warnings, secciones: d.secciones.map((s) => ({ ...s, incluir: true })), descartes: d.descartes });
      } catch (e) {
        fijar(id, { estado: "error", error: mensajeDe(e) });
      }
    }
  };

  const soltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setEncima(false);
    void leer(e.dataTransfer.files);
  };

  const listos = archivos.filter((a) => a.estado === "listo" && a.secciones.some((s) => s.incluir));
  const totalSecciones = listos.reduce((n, a) => n + a.secciones.filter((s) => s.incluir).length, 0);

  const enviar = async () => {
    setEnvio({ ocupado: true, resultado: [], error: "" });
    // ingerir lleva una plantilla para todo el lote: se envía un lote por plantilla.
    const grupos = new Map<Plantilla | null, ArchivoParaPilo[]>();
    for (const a of listos) {
      const g = grupos.get(a.plantilla) ?? [];
      g.push({ nombre: a.nombre, ...(a.unidad.trim() ? { unidad: a.unidad.trim() } : {}), secciones: a.secciones.filter((s) => s.incluir).map(({ titulo, texto }) => ({ titulo, texto })) });
      grupos.set(a.plantilla, g);
    }
    const resultado: RespuestaIngesta[] = [];
    try {
      for (const [plantilla, lote] of grupos) resultado.push(await piloIngerir(anio, lote, plantilla));
      setEnvio({ ocupado: false, resultado, error: "" });
      setArchivos([]);
      void corpus.refetch();
    } catch (e) {
      setEnvio({ ocupado: false, resultado, error: mensajeDe(e) });
    }
  };

  return (
    <div className="inf-stack" ref={raiz}>
      <section className="inf-card inf-pad" aria-labelledby="inf-cap">
        <h3 id="inf-cap" className="inf-t">
          Enseñarle a Pilo con los informes ya escritos
        </h3>
        <p className="inf-sub">
          Suba los informes de gestión en Word o PDF. El texto se lee en este computador, se divide por sus títulos y usted decide qué entra. Pilo guarda los
          textos sin cifras: aprende la forma de escribir, no los datos de un año.
        </p>
        <div className="inf-form" style={{ marginBottom: "var(--space-3)" }}>
          <label className="inf-lab">
            Año de los informes
            <input className="inf-in inf-num" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </label>
        </div>
        <label
          className={`inf-drop${encima ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
        >
          <b>Suelte los informes o haga clic</b>
          <span>Word (.docx) o PDF con texto. Un PDF escaneado no se puede leer.</span>
          <input type="file" multiple accept=".docx,.pdf" className="inf-sr" onChange={(e) => void leer(e.target.files).then(() => (e.target.value = ""))} />
        </label>
      </section>

      {archivos.map((a) => (
        <section key={a.id} className="inf-card inf-arch" aria-label={a.nombre}>
          <div className="inf-row" style={{ justifyContent: "space-between" }}>
            <b>{a.nombre}</b>
            <button type="button" className="inf-link" onClick={() => setArchivos((as) => as.filter((x) => x.id !== a.id))}>
              Quitar
            </button>
          </div>
          {a.estado === "leyendo" && (
            <p className="inf-muted" role="status">
              Leyendo el archivo…
            </p>
          )}
          {a.estado === "error" && (
            <p className="inf-error" role="alert">
              {a.error}
            </p>
          )}
          {a.estado === "listo" && (
            <>
              <div className="inf-form">
                <label className="inf-lab">
                  Unidad
                  <input className="inf-in" value={a.unidad} onChange={(e) => fijar(a.id, { unidad: e.target.value })} />
                </label>
                <label className="inf-lab">
                  Plantilla
                  <select className="inf-in" value={a.plantilla ?? ""} onChange={(e) => fijar(a.id, { plantilla: (e.target.value || null) as Plantilla | null })}>
                    <option value="">Que Pilo la deduzca</option>
                    {LETRAS.map((l) => (
                      <option key={l} value={l}>
                        {l} · {PLANTILLAS[l].quien}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {a.avisos.map((x) => (
                <p key={x} className="inf-hint">
                  {x}
                </p>
              ))}
              <details open>
                <summary>
                  {a.secciones.filter((s) => s.incluir).length} de {a.secciones.length} secciones entran
                </summary>
                <ul className="inf-secx">
                  {a.secciones.map((s, i) => (
                    <li key={i}>
                      <input
                        type="checkbox"
                        checked={s.incluir}
                        aria-label={`Incluir «${s.titulo}»`}
                        onChange={(e) => fijar(a.id, { secciones: a.secciones.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)) })}
                      />
                      <div>
                        <b>{s.titulo}</b>
                        <p>{s.texto.slice(0, 220)}{s.texto.length > 220 ? "…" : ""}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
              {a.descartes.length > 0 && (
                <details>
                  <summary>{a.descartes.length} descartadas</summary>
                  <ul className="inf-secx">
                    {a.descartes.map((d, i) => (
                      <li key={i}>
                        <span className="inf-pill">{d.motivo}</span>
                        <span>{d.titulo}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      ))}

      {listos.length > 0 && (
        <div className="inf-row">
          <button type="button" className="inf-btn inf-btn--pri" onClick={() => void enviar()} disabled={envio.ocupado}>
            {envio.ocupado ? "Enviando a Pilo…" : `Enviar a Pilo · ${totalSecciones} secciones de ${listos.length} ${listos.length === 1 ? "informe" : "informes"}`}
          </button>
        </div>
      )}
      {envio.error && (
        <p className="inf-error" role="alert">
          {envio.error}
        </p>
      )}
      {envio.resultado.length > 0 && (
        <div className="inf-nota" role="status">
          <b>Pilo recibió los informes</b>
          {envio.resultado.map((r, i) => (
            <span key={i}>{resumen(r)}</span>
          ))}
        </div>
      )}

      <LoQueAprendio corpus={corpus} />
    </div>
  );
}

/** Lo que contestó `ingerir`, en una línea. */
function resumen(r: RespuestaIngesta): string {
  const descartes = r.descartados?.length ?? 0;
  return `${r.nuevos ?? 0} secciones nuevas en el corpus de ${r.secciones ?? 0} enviadas · ${r.duplicados ?? 0} ya estaban · ${descartes} descartadas por Pilo`;
}

const TIPO: Record<string, string> = {
  resumen: "Resumen ejecutivo",
  alineacion: "Alineación con el PDI",
  metas: "Objetivos y metas",
  resultados: "Resultados",
  retos: "Retos y oportunidades",
  logros: "Logros",
  conclusiones: "Conclusiones",
  presentacion: "Presentación",
  otra: "Otras secciones",
};

function LoQueAprendio({ corpus }: { corpus: ReturnType<typeof useCorpus> }) {
  const c = corpus.data;
  const perfiles = c?.perfiles ?? [];
  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-aprendio">
      <h3 id="inf-aprendio" className="inf-t">
        Lo que Pilo aprendió
      </h3>
      <p className="inf-sub">Textos en su corpus y cómo escribe cada tipo de sección. Crece con cada informe que Planeación aprueba.</p>
      {corpus.isPending && <p className="inf-muted">Consultando a Pilo…</p>}
      {corpus.error && <p className="inf-error">{mensajeDe(corpus.error)}</p>}
      {c && c.total > 0 && (
        <div className="inf-facts" style={{ marginBottom: "var(--space-4)" }}>
          <div>
            <b className="inf-num">{c.total.toLocaleString("es-CO")}</b>
            <span>textos en el corpus</span>
          </div>
          <div>
            <b className="inf-num">{(c.por_origen?.informe2025 ?? 0).toLocaleString("es-CO")}</b>
            <span>de los informes ya escritos</span>
          </div>
          <div>
            <b className="inf-num">{(c.por_origen?.aprobado ?? 0).toLocaleString("es-CO")}</b>
            <span>aprobados en el portal</span>
          </div>
          <div>
            <b className="inf-num">{perfiles.length}</b>
            <span>tipos de sección con estilo propio</span>
          </div>
        </div>
      )}
      {perfiles.length > 0 && (
        <div className="inf-perfiles">
          {perfiles.map((p) => (
            <div key={p.tipo} className="inf-perfil">
              <b>{TIPO[p.tipo] ?? p.tipo}</b>
              <span className="inf-num">
                {p.textos} textos · mediana de {p.mediana_palabras} palabras
              </span>
              {p.aperturas.length > 0 && <span>Suele empezar: «{p.aperturas.slice(0, 2).map((a) => a.texto).join("», «")}»</span>}
              {p.conectores.length > 0 && <span>Conectores: {p.conectores.slice(0, 4).map((x) => x.texto).join(", ")}</span>}
            </div>
          ))}
        </div>
      )}
      {c && !c.total && <p className="inf-muted">Pilo todavía no tiene textos en su corpus.</p>}
    </section>
  );
}
