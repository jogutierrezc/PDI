/* =============================================================================
   Firma de convenios · visor del PDF a firmar.

   Se baja el PDF con la URL firmada (vive 90 s, por eso se descarga de una vez) y se dibuja con
   pdf.js (import dinámico: no pesa en el resto del portal). Al llegar al final de la última página
   se avisa `onFin`: así «leído» sale de una lectura real. Si el navegador no deja bajar el archivo
   (permisos entre dominios) o pdf.js falla, se muestra el PDF en un marco del navegador y se
   pide una confirmación explícita «He leído el documento completo».
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { Ic } from "./comunes";
import type { Textos } from "./textos";

interface Props {
  /** Pide una URL firmada nueva (la anterior vence a los 90 s). */
  pedirUrl: () => Promise<string>;
  t: Textos;
  onFin: () => void;
  /** Avisa si se ve con el visor propio (true) o con el marco del navegador (false). */
  onModo?: (propio: boolean) => void;
}

type Estado = { fase: "cargando" } | { fase: "listo"; paginas: number } | { fase: "marco"; url: string } | { fase: "error" };

export function VisorPdf({ pedirUrl, t, onFin, onModo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [confirmado, setConfirmado] = useState(false);
  const finLlamado = useRef(false);
  const alFin = useRef(onFin);
  alFin.current = onFin;
  const modo = useRef(onModo);
  modo.current = onModo;
  const generacion = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++generacion.current;
    setEstado({ fase: "cargando" });
    let url: string;
    try {
      url = await pedirUrl();
    } catch {
      if (mia === generacion.current) setEstado({ fase: "error" });
      return;
    }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("descarga");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const pdfjs = await import("pdfjs-dist");
      const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      if (mia !== generacion.current) return;
      const caja = contenedor.current;
      if (!caja) return;
      caja.innerHTML = "";
      const ancho = Math.min(caja.clientWidth || 800, 1000);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      setEstado({ fase: "listo", paginas: doc.numPages });
      modo.current?.(true);
      for (let n = 1; n <= Math.min(doc.numPages, 80); n++) {
        const pagina = await doc.getPage(n);
        if (mia !== generacion.current) return;
        const base = pagina.getViewport({ scale: 1 });
        const escala = (ancho / base.width) * dpr;
        const vista = pagina.getViewport({ scale: escala });
        const hoja = document.createElement("div");
        hoja.className = "fm-hoja";
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.ceil(vista.width);
        lienzo.height = Math.ceil(vista.height);
        lienzo.setAttribute("role", "img");
        lienzo.setAttribute("aria-label", t.paginaDe(n, doc.numPages));
        const num = document.createElement("span");
        num.className = "fm-hoja__n";
        num.textContent = t.paginaDe(n, doc.numPages);
        hoja.append(lienzo, num);
        caja.appendChild(hoja);
        const ctx = lienzo.getContext("2d");
        if (!ctx) throw new Error("lienzo");
        await pagina.render({ canvasContext: ctx, canvas: lienzo, viewport: vista, background: "rgb(255,255,255)" }).promise;
        pagina.cleanup();
      }
    } catch {
      if (mia !== generacion.current) return;
      modo.current?.(false);
      setEstado({ fase: "marco", url });
    }
  }, [pedirUrl, t]);

  useEffect(() => {
    void cargar();
    return () => {
      generacion.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se carga una vez; cambiar de lengua no recarga
  }, []);

  // «Leído»: el final del documento entra a la vista.
  useEffect(() => {
    if (estado.fase !== "listo") return;
    const f = fin.current;
    if (!f) return;
    const o = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting) && !finLlamado.current) {
          finLlamado.current = true;
          alFin.current();
        }
      },
      { threshold: 0.1 },
    );
    o.observe(f);
    return () => o.disconnect();
  }, [estado.fase]);

  return (
    <div className="fm-hojas" aria-busy={estado.fase === "cargando"}>
      {estado.fase === "cargando" ? <div className="fm-visor-vacio" role="status">{t.cargandoPdf}</div> : null}
      {estado.fase === "error" ? (
        <div className="fm-visor-vacio" role="alert">
          <p>{t.pdfError}</p>
          <button type="button" className="fm-btn" onClick={() => void cargar()}>{t.pdfRenovar}</button>
        </div>
      ) : null}
      <div ref={contenedor} style={{ display: estado.fase === "listo" || estado.fase === "cargando" ? "grid" : "none", gap: 14 }} />
      {estado.fase === "listo" ? <div ref={fin} className="fm-fin-lectura" aria-hidden="true" /> : null}
      {estado.fase === "marco" ? (
        <>
          <p className="fm-nota"><Ic n="archivo" />{t.pdfIframeAviso}</p>
          <iframe className="fm-marco" src={estado.url} title="PDF" />
          <div className="fm-row">
            <button type="button" className="fm-btn fm-btn--sm" onClick={() => void cargar()}>{t.pdfRenovar}</button>
          </div>
          <label className="fm-leido-caja">
            <span className="fm-check">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => {
                  setConfirmado(e.target.checked);
                  if (e.target.checked && !finLlamado.current) {
                    finLlamado.current = true;
                    alFin.current();
                  }
                }}
              />
              {t.heLeido}
            </span>
          </label>
        </>
      ) : null}
    </div>
  );
}
