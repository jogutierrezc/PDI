/* =============================================================================
   Encuestas con Pilo · traer logros y retos desde Excel.

   Dos botones («Descargar plantilla de Excel» e «Importar desde Excel») y, al
   importar, un panel de revisión previa: cuántos aportes están listos y cuáles
   tienen problemas, con la fila exacta y cómo arreglarlos. Quien importa elige
   qué agregar; lo que ya escribió no se toca y nada se envía: los aportes
   quedan en el formulario como si los hubiera escrito a mano.

   El análisis es puro (importar-logros-retos.ts); aquí solo la pantalla. El
   archivo se lee en el navegador y no sale de él.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import gsap from "gsap";
import type { AporteEnvio } from "../tipos";
import { textoTipoAporte } from "../tipos";
import { LIMITES } from "../lib/validacion";
import { importarArchivo, planDeAgregado, TEXTO_OMITIDO } from "./importar-logros-retos";
import type { Plan, Problema, ResultadoImportacion } from "./importar-logros-retos";
import { descargarPlantillaLogrosRetos } from "./plantilla-logros-retos";
import { enterList, kill } from "../motion";
import { sinMovimiento } from "./habla";
import type { DecirGuia } from "./tipos-pub";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «Hoja «Cifras», fila 9, columna «Valor»»: dónde está el problema. */
export const dondeEsta = (p: Problema): string => [`Hoja «${p.hoja}»`, p.fila !== null ? `fila ${p.fila}` : "", p.columna ? `columna «${p.columna}»` : ""].filter(Boolean).join(", ");

function ListaProblemas({ problemas }: { problemas: Problema[] }) {
  if (!problemas.length) return null;
  return (
    <ul className="ep-xl__probs">
      {problemas.map((p, i) => (
        <li key={i} data-nivel={p.nivel}>
          <b>{p.nivel === "error" ? "Por corregir · " : "Aviso · "}</b>
          <span className="ep-xl__donde">{dondeEsta(p)}.</span> {p.mensaje}
        </li>
      ))}
    </ul>
  );
}

/** El panel de revisión (sin estado propio: lo maneja ImportarExcel). */
export function RevisionImportacion({
  resultado,
  yaHay,
  max,
  quitados,
  onQuitar,
  onAgregar,
  onCerrar,
  encabezado,
}: {
  resultado: ResultadoImportacion;
  yaHay: readonly AporteEnvio[];
  max: number;
  /** Filas (de «Logros y retos») que la persona quitó de la revisión. */
  quitados: ReadonlySet<number>;
  onQuitar: (fila: number) => void;
  onAgregar: (aportes: AporteEnvio[]) => void;
  onCerrar: () => void;
  encabezado?: React.Ref<HTMLHeadingElement>;
}) {
  const lista = useRef<HTMLOListElement>(null);
  const visibles = useMemo(() => ({ ...resultado, aportes: resultado.aportes.filter((a) => !quitados.has(a.fila)) }), [resultado, quitados]);
  const plan: Plan[] = useMemo(() => planDeAgregado(visibles, yaHay, max), [visibles, yaHay, max]);
  const listos = plan.filter((p) => p.leido.aporte).length;
  const incluidos = plan.filter((p) => p.incluir);
  const conProblemas = plan.length - listos;

  useEffect(() => {
    const items = lista.current ? Array.from(lista.current.children) : [];
    if (!sinMovimiento()) enterList(items);
    return () => kill(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por archivo importado
  }, [resultado]);

  if (resultado.error) {
    return (
      <div className="ep-xl__panel" role="alert">
        <h4 ref={encabezado} tabIndex={-1} className="ep-xl__h">
          No se pudo importar este archivo
        </h4>
        <p>{resultado.error}</p>
        <ListaProblemas problemas={resultado.generales} />
        <div className="ep-acciones">
          <button type="button" className="ep-btn" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
    }
  };

  return (
    <div className="ep-xl__panel" role="region" aria-label="Revisión de lo que se va a importar" onKeyDown={alTeclear}>
      <h4 ref={encabezado} tabIndex={-1} className="ep-xl__h">
        {plan.length === 0 ? "No queda nada por revisar" : `Se encontraron ${plural(plan.length, "aporte", "aportes")}: ${plural(listos, "listo", "listos")}, ${plural(conProblemas, "con problemas", "con problemas")}`}
      </h4>
      <p className="ep-fino">
        {resultado.origen === "descarga" ? "Libro bajado de «Mis envíos». " : ""}
        Aún no se envía nada. Se agregan al final de lo que ya escribió, y después puede editarlos o quitarlos como cualquier otro.
      </p>
      <ListaProblemas problemas={resultado.generales} />

      <ol className="ep-xl__lista" ref={lista} aria-label="Aportes encontrados">
        {plan.map(({ leido, incluir, motivo }) => (
          <li key={leido.fila} className="ep-xl__item" data-estado={incluir ? "ok" : motivo === "problemas" ? "error" : "omitido"}>
            <div className="ep-xl__cab">
              {leido.tipo ? <span className={`ep-tag ep-tag--${leido.tipo}`}>{textoTipoAporte(leido.tipo)}</span> : <span className="ep-tag">Sin tipo</span>}
              <div className="ep-xl__tit">
                <div className="ep-cola__t">{leido.titulo || "(sin título)"}</div>
                <div className="ep-cola__m">
                  Hoja «Logros y retos», fila {leido.fila} · {plural(leido.nCifras, "cifra", "cifras")}
                </div>
              </div>
              <button type="button" className="ep-quitar" aria-label={`Quitar de la revisión: ${leido.titulo || `fila ${leido.fila}`}`} onClick={() => onQuitar(leido.fila)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </div>
            <p className="ep-xl__estado-item">{incluir ? "Listo: se agregará." : motivo ? TEXTO_OMITIDO[motivo] : ""}</p>
            <ListaProblemas problemas={leido.problemas} />
          </li>
        ))}
      </ol>

      <div className="ep-acciones ep-xl__acc">
        <button type="button" className="ep-btn ep-btn--pri" disabled={incluidos.length === 0} onClick={() => onAgregar(incluidos.map((p) => p.leido.aporte as AporteEnvio))}>
          {incluidos.length === 0 ? "Nada para agregar" : `Agregar ${plural(incluidos.length, "aporte", "aportes")} al formulario`}
        </button>
        <button type="button" className="ep-btn ep-btn--suave" onClick={onCerrar}>
          Cancelar
        </button>
        <span className="ep-fino">{conProblemas > 0 ? "Los que tienen problemas no se agregan: corríjalos en el Excel e impórtelos de nuevo." : `Caben ${Math.max(0, max - yaHay.length)} más en este envío.`}</span>
      </div>
    </div>
  );
}

export function ImportarExcel({
  slug,
  titulo,
  yaHay,
  max = LIMITES.aportes,
  onAgregar,
  decir,
  deshabilitado,
}: {
  slug: string;
  /** El título de la encuesta (va en la plantilla). */
  titulo?: string;
  /** Lo que la persona ya tiene en el formulario: no se pisa. */
  yaHay: readonly AporteEnvio[];
  max?: number;
  onAgregar: (aportes: AporteEnvio[]) => void;
  decir?: DecirGuia;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [quitados, setQuitados] = useState<Set<number>>(() => new Set());
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState<"" | "bajando" | "leyendo">("");
  const entrada = useRef<HTMLInputElement>(null);
  const botonImportar = useRef<HTMLButtonElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resultado) return;
    encabezado.current?.focus({ preventScroll: false });
    if (panel.current && !sinMovimiento()) gsap.fromTo(panel.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: "power3.out", clearProps: "transform,opacity" });
    return () => kill(panel.current);
  }, [resultado]);

  const bajar = async () => {
    setOcupado("bajando");
    setAviso("");
    try {
      await descargarPlantillaLogrosRetos({ slug, titulo });
      setAviso("Descargué la plantilla. Ábrala en Excel, lea la hoja «Instrucciones», llénela y vuelva aquí a importarla.");
      decir?.("Ya descargó la plantilla. Llénela con calma, guárdela y súbala aquí: yo reviso cada fila. No se envía nada hasta que usted lo confirme.", "feliz");
    } catch {
      setAviso("No se pudo armar la plantilla. Intente de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  const alElegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setOcupado("leyendo");
    setAviso("Leyendo el archivo…");
    const r = await importarArchivo(archivo, { slug });
    setOcupado("");
    setQuitados(new Set());
    setResultado(r);
    const n = r.aportes.length;
    const listos = r.aportes.filter((a) => a.aporte).length;
    setAviso(r.error ? "No se pudo importar el archivo." : `Se encontraron ${plural(n, "aporte", "aportes")}: ${plural(listos, "listo", "listos")}.`);
    decir?.(r.error ? "No pude importar ese archivo. Le explico abajo qué pasó." : "Revisé el archivo. Mire lo que encontré antes de agregarlo.", r.error ? "neutral" : "atrevido");
  };

  const cerrar = () => {
    setResultado(null);
    setQuitados(new Set());
    window.setTimeout(() => botonImportar.current?.focus(), 0);
  };

  return (
    <section className="ep-xl" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>¿Prefiere llenarlo en Excel?</h3>
      <p className="ep-fino">Descargue la plantilla, que trae instrucciones y ejemplos, llénela con calma y súbala aquí. Yo reviso cada fila y le digo qué corregir. No se envía nada hasta que usted lo confirme.</p>
      <div className="ep-fila-botones">
        <button type="button" className="ep-btn" disabled={deshabilitado || ocupado !== ""} onClick={() => void bajar()}>
          {ocupado === "bajando" ? "Preparando…" : "Descargar plantilla de Excel"}
        </button>
        <button type="button" ref={botonImportar} className="ep-btn" disabled={deshabilitado || ocupado !== ""} onClick={() => entrada.current?.click()}>
          {ocupado === "leyendo" ? "Leyendo…" : "Importar desde Excel"}
        </button>
        <input ref={entrada} type="file" className="ep-sr" tabIndex={-1} aria-hidden="true" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void alElegir(e)} />
      </div>
      <div className="ep-xl__estado" role="status" aria-live="polite">
        {aviso}
      </div>
      {resultado && (
        <div ref={panel}>
          <RevisionImportacion
            resultado={resultado}
            yaHay={yaHay}
            max={max}
            quitados={quitados}
            encabezado={encabezado}
            onQuitar={(f) => {
              setQuitados((s) => new Set(s).add(f));
              setAviso("Quitó una fila de la revisión.");
            }}
            onAgregar={(a) => {
              onAgregar(a);
              setResultado(null);
              setQuitados(new Set());
              setAviso(`Agregué ${plural(a.length, "aporte", "aportes")}. Quedaron en «Lo que lleva registrado» para que los revise; todavía no se envió nada.`);
              decir?.("Listo, los agregué. Revíselos, edítelos si hace falta y envíe todo cuando esté seguro.", "emocionado");
            }}
            onCerrar={cerrar}
          />
        </div>
      )}
    </section>
  );
}
