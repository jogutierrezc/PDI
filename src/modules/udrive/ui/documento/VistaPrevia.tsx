/* =============================================================================
   UDrive · la vista previa paginada del PDF y la exportación.

   Muestra las páginas Carta tal como saldrán (paginado de dos pasadas,
   salida/PaginasPdf.tsx). «Exportar PDF» abre el diálogo de impresión del
   navegador con solo estas páginas (salida/imprimir.ts): ahí se elige «Guardar
   como PDF». Se dibuja en un contenedor directo de <body> para que la hoja de
   impresión pueda esconder todo lo demás.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../../components/ui/Icon";
import type { Documento } from "../../lib/documento";
import { PAPEL_PX } from "../../lib/estilo";
import { bloqueos, revisarAntesDeImprimir } from "../../lib/revision";
import { PanelRevision } from "../estilos/Revision";
import { paginaAImagen } from "../../salida/paginaAImagen";
import { PaginasPdf } from "../../salida/PaginasPdf";
import type { InfoPaginado } from "../../salida/PaginasPdf";
import { exportarWord } from "../../salida/aWord";
import { imprimirPdf } from "../../salida/imprimir";
import { useEntrada } from "../../salida/useEntrada";
import { Escalado } from "./Escalado";
import "./documento.css";

export function VistaPrevia({
  doc,
  titulo,
  nombreArchivo,
  aprobado,
  instantanea,
  rotulo,
  autoImprimir,
  autoWord,
  cifrasCambiadas = 0,
  alIrAlBloque,
  onCerrar,
}: {
  doc: Documento;
  titulo: string;
  nombreArchivo: string;
  aprobado: boolean;
  instantanea?: Record<string, unknown>;
  /** «Versión 3» cuando se mira una versión guardada. */
  rotulo?: string;
  autoImprimir?: boolean;
  /** Abre y baja el Word apenas estén cargados los datos. */
  autoWord?: boolean;
  /** Cuántas cifras vivas cambiaron desde su última revisión (para la revisión previa). */
  cifrasCambiadas?: number;
  /** Cierra la vista previa y lleva al bloque que hay que corregir. */
  alIrAlBloque?(id: string): void;
  onCerrar(): void;
}) {
  const entrada = useEntrada(doc, { aprobado, instantanea, titulo });
  const [info, setInfo] = useState<InfoPaginado | null>(null);
  // La hoja más ancha: la de pie, o la horizontal si el informe tiene secciones horizontales.
  const anchoMax = doc.bloques.some((b) => b.tipo === "salto" && b.orientacion === "horizontal") ? PAPEL_PX[entrada.papel].alto : PAPEL_PX[entrada.papel].ancho;
  const [zoom, setZoom] = useState(() => Math.max(0.4, Math.min(1, (window.innerWidth - 40) / anchoMax)));
  const [revisando, setRevisando] = useState<null | "pdf" | "word">(null);
  const [ignorados, setIgnorados] = useState<ReadonlySet<string>>(new Set());
  const [raiz] = useState(() => {
    const d = document.createElement("div");
    d.id = "ud-pdf-raiz";
    return d;
  });
  const cerrar = useRef<HTMLButtonElement>(null);
  const impreso = useRef(false);
  const [word, setWord] = useState<{ estado: "armando" | "listo" | "error"; texto: string; avisos: string[] } | null>(null);
  const bajado = useRef(false);

  const hallazgos = useMemo(
    () =>
      info
        ? revisarAntesDeImprimir({ doc, estilo: entrada.estilo, figuras: entrada.figuras, tablasAnchas: info.tablasAnchas, tamanos: entrada.recursos.tamanos, nombres: entrada.recursos.nombres, cifrasCambiadas })
        : [],
    [info, doc, entrada.estilo, entrada.figuras, entrada.recursos.tamanos, entrada.recursos.nombres, cifrasCambiadas],
  );
  const pendientes = hallazgos.filter((h) => h.nivel !== "info" && !ignorados.has(h.id));

  /** La portada y la contraportada, tal como están en la vista previa, como imágenes para el Word. */
  const capturarPortadas = async () => {
    if (entrada.estilo.portada.comp === 0) return {};
    const t = PAPEL_PX[entrada.papel];
    const buscar = (sel: string) => raiz.querySelector<HTMLElement>(sel);
    const portadaEl = buscar('[data-portada="true"]');
    const contraEl = buscar('[data-contraportada="true"]');
    const [portadaPng, contraportadaPng] = await Promise.all([portadaEl ? paginaAImagen(portadaEl, t.ancho, t.alto) : null, contraEl ? paginaAImagen(contraEl, t.ancho, t.alto) : null]);
    return { portadaPng, contraportadaPng };
  };

  /** Antes de imprimir o de bajar el Word: si hay algo que revisar, se muestra la lista primero. */
  const pedir = (a: "pdf" | "word") => {
    if (pendientes.length) setRevisando(a);
    else if (a === "pdf") imprimirPdf(nombreArchivo, entrada.papel);
    else bajarWord();
  };

  const bajarWord = () => {
    if (word?.estado === "armando") return;
    setWord({ estado: "armando", texto: "Armando el Word…", avisos: [] });
    void capturarPortadas()
      .then((png) => exportarWord(entrada, nombreArchivo, (texto) => setWord((w) => (w?.estado === "armando" ? { ...w, texto } : w)), png))
      .then((avisos) => setWord({ estado: "listo", texto: avisos.length ? "Word descargado, con avisos." : "Word descargado.", avisos }))
      .catch((e: unknown) => setWord({ estado: "error", texto: e instanceof Error ? e.message : "No se pudo armar el Word.", avisos: [] }));
  };

  useLayoutEffect(() => {
    document.body.appendChild(raiz);
    return () => void raiz.remove();
  }, [raiz]);

  useEffect(() => {
    cerrar.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);

  useEffect(() => {
    if (autoImprimir && info && !impreso.current) {
      impreso.current = true;
      window.setTimeout(() => (pendientes.length ? setRevisando("pdf") : imprimirPdf(nombreArchivo, entrada.papel)), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se decide una sola vez cuando termina el paginado
  }, [autoImprimir, info, nombreArchivo]);

  useEffect(() => {
    if (autoWord && entrada.recursos.listo && !entrada.cargandoCifras && !bajado.current) {
      bajado.current = true;
      bajarWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se baja una sola vez cuando los datos están listos
  }, [autoWord, entrada.recursos.listo, entrada.cargandoCifras]);

  return createPortal(
    <div className="ud-pv es ud" role="dialog" aria-modal="true" aria-label={`Vista previa del PDF${rotulo ? `, ${rotulo}` : ""}`}>
      <div className="ud-pv-barra ud-noprint">
        <button ref={cerrar} type="button" className="es-back" onClick={onCerrar}>
          <Icon name="arrow-left" size={16} />
          Volver al editor
        </button>
        <strong>Vista previa del PDF{rotulo ? ` · ${rotulo}` : ""}</strong>
        <span className="ud-pv-aviso" role="status">
          {!entrada.recursos.listo || !info
            ? "Armando las páginas…"
            : info.exacto
              ? `${info.paginas} ${info.paginas === 1 ? "página" : "páginas"} · los números de página son los del PDF`
              : `${info.paginas} páginas · Los números de página se calculan al exportar: faltaron fuentes o imágenes por cargar al medir`}
        </span>
        <span className="es-grow" />
        <div className="es-seg" role="group" aria-label="Zoom">
          <button type="button" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}>−</button>
          <button type="button" aria-label="Ajustar al ancho" onClick={() => setZoom(Math.max(0.4, Math.min(1, (window.innerWidth - 40) / anchoMax)))}>{Math.round(zoom * 100)} %</button>
          <button type="button" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}>+</button>
        </div>
        <button type="button" className="es-btn" disabled={!info || hallazgos.length === 0} onClick={() => setRevisando("pdf")} aria-label={`Revisar antes de imprimir: ${pendientes.length} por revisar`}>
          Revisar{pendientes.length ? ` (${pendientes.length})` : ""}
        </button>
        <button type="button" className="es-btn" disabled={!entrada.recursos.listo || word?.estado === "armando"} onClick={() => pedir("word")}>
          <Icon name="download" size={16} />
          Exportar Word
        </button>
        <button type="button" className="es-btn es-btn--pri" disabled={!info} onClick={() => pedir("pdf")}>
          <Icon name="download" size={16} />
          Exportar PDF
        </button>
      </div>
      {word ? (
        <div className="ud-pv-aviso ud-noprint" role={word.estado === "error" ? "alert" : "status"} style={{ padding: "6px 16px" }}>
          {word.texto}
          {word.avisos.length ? ` ${word.avisos.join(" ")}` : ""}
          {word.estado === "listo" ? " El contenido se rellena al abrirlo en Word: acepte «actualizar campos»." : ""}
        </div>
      ) : null}
      <div className="ud-pv-escena">
        <Escalado escala={zoom} ancho={anchoMax}>
          <PaginasPdf entrada={entrada} onPaginado={setInfo} />
        </Escalado>
      </div>
      {revisando ? (
        <PanelRevision
          hallazgos={hallazgos}
          ignorados={ignorados}
          verbo={revisando === "pdf" ? "Abrir la impresión" : "Bajar el Word"}
          alIgnorar={(id, ign) => setIgnorados((previo) => { const n = new Set(previo); if (ign) n.add(id); else n.delete(id); return n; })}
          alIrAlBloque={alIrAlBloque ? (id) => { setRevisando(null); onCerrar(); alIrAlBloque(id); } : undefined}
          alCerrar={() => setRevisando(null)}
          alImprimir={() => {
            const a = revisando;
            setRevisando(null);
            if (bloqueos(hallazgos, ignorados).length) return;
            if (a === "pdf") imprimirPdf(nombreArchivo, entrada.papel);
            else bajarWord();
          }}
        />
      ) : null}
    </div>,
    raiz,
  );
}
