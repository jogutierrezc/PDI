/* =============================================================================
   UDrive · la vista previa paginada del PDF y la exportación.

   Muestra las páginas Carta tal como saldrán (paginado de dos pasadas,
   salida/PaginasPdf.tsx). «Exportar PDF» abre el diálogo de impresión del
   navegador con solo estas páginas (salida/imprimir.ts): ahí se elige «Guardar
   como PDF». Se dibuja en un contenedor directo de <body> para que la hoja de
   impresión pueda esconder todo lo demás.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../../components/ui/Icon";
import type { Documento } from "../../lib/documento";
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
  onCerrar(): void;
}) {
  const entrada = useEntrada(doc, { aprobado, instantanea, titulo });
  const [info, setInfo] = useState<InfoPaginado | null>(null);
  const [zoom, setZoom] = useState(() => Math.max(0.4, Math.min(1, (window.innerWidth - 40) / 816)));
  const [raiz] = useState(() => {
    const d = document.createElement("div");
    d.id = "ud-pdf-raiz";
    return d;
  });
  const cerrar = useRef<HTMLButtonElement>(null);
  const impreso = useRef(false);
  const [word, setWord] = useState<{ estado: "armando" | "listo" | "error"; texto: string; avisos: string[] } | null>(null);
  const bajado = useRef(false);

  const bajarWord = () => {
    if (word?.estado === "armando") return;
    setWord({ estado: "armando", texto: "Armando el Word…", avisos: [] });
    exportarWord(entrada, nombreArchivo, (texto) => setWord((w) => (w?.estado === "armando" ? { ...w, texto } : w)))
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
      window.setTimeout(() => imprimirPdf(nombreArchivo), 300);
    }
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
          <button type="button" aria-label="Ajustar al ancho" onClick={() => setZoom(Math.max(0.4, Math.min(1, (window.innerWidth - 40) / 816)))}>{Math.round(zoom * 100)} %</button>
          <button type="button" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}>+</button>
        </div>
        <button type="button" className="es-btn" disabled={!entrada.recursos.listo || word?.estado === "armando"} onClick={bajarWord}>
          <Icon name="download" size={16} />
          Exportar Word
        </button>
        <button type="button" className="es-btn es-btn--pri" disabled={!info} onClick={() => imprimirPdf(nombreArchivo)}>
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
        <Escalado escala={zoom}>
          <PaginasPdf entrada={entrada} onPaginado={setInfo} />
        </Escalado>
      </div>
    </div>,
    raiz,
  );
}
