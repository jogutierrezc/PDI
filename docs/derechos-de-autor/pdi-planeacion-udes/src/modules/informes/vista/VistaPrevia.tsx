/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · la previsualización.

   Mismo patrón de UDrive y del boletín: una ventana con las hojas tal como
   saldrán y un botón que abre el diálogo de impresión del navegador, donde se
   elige «Guardar como PDF». Se dibuja en un contenedor directo de <body> para
   que la hoja de impresión pueda esconder todo lo demás (vista.css).
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import { Escalado } from "./Escalado";
import { Libro } from "./Libro";
import type { PropsLibro } from "./Libro";
import { imprimirInforme } from "./imprimir";
import { PAPELES } from "./perfil";

export function VistaPrevia({
  libro,
  nombreArchivo,
  paginas,
  exacto,
  onCerrar,
}: {
  libro: PropsLibro;
  nombreArchivo: string;
  /** Número total de hojas del libro. */
  paginas: number;
  /** Las fuentes y las imágenes estaban cargadas al medir. */
  exacto: boolean;
  onCerrar: () => void;
}) {
  const papel = libro.diseno.papel;
  const medidas = PAPELES[papel];
  const [raiz] = useState(() => {
    const d = document.createElement("div");
    d.id = "vi-raiz";
    return d;
  });
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const cerrar = useRef<HTMLButtonElement>(null);

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

  const cambiar = (d: number) => setZoom((z) => Math.min(1.6, Math.max(0.3, Math.round(((z ?? 0.8) + d) * 10) / 10)));

  return createPortal(
    <div className="vi vi-pv" role="dialog" aria-modal="true" aria-label="Previsualización del PDF">
      <div className="vi-pv-barra vi-noprint">
        <button ref={cerrar} type="button" className="vi-pv-btn" onClick={onCerrar}>
          <Icon name="arrow-left" size={16} /> Volver a la vista
        </button>
        <strong>Previsualización del PDF</strong>
        <span role="status">
          {paginas} {paginas === 1 ? "hoja" : "hojas"} {medidas.nombre}
          {exacto ? "" : " · los números de página se afinan al imprimir: faltaban fuentes o imágenes por cargar"}
        </span>
        <span className="vi-grow" />
        <button type="button" className="vi-pv-btn" aria-label="Alejar" onClick={() => cambiar(-0.1)}>
          −
        </button>
        <button type="button" className="vi-pv-btn" aria-label="Ajustar al ancho" onClick={() => setZoom(undefined)}>
          {zoom ? `${Math.round(zoom * 100)} %` : "Ajustar"}
        </button>
        <button type="button" className="vi-pv-btn" aria-label="Acercar" onClick={() => cambiar(0.1)}>
          +
        </button>
        <button type="button" className="vi-pv-btn vi-pv-btn--pri" onClick={() => imprimirInforme(nombreArchivo, papel)}>
          <Icon name="download" size={16} /> Descargar PDF
        </button>
      </div>
      <div className="vi-pv-escena">
        <p className="vi-noprint" style={{ margin: "0 0 12px", fontSize: 13, textAlign: "center" }}>
          En el diálogo de impresión elija <b>Guardar como PDF</b>. El tamaño {medidas.nombre} y los márgenes ya vienen fijados.
        </p>
        <Escalado anchoMm={medidas.ancho} zoom={zoom}>
          <Libro {...libro} />
        </Escalado>
      </div>
    </div>,
    raiz,
  );
}
