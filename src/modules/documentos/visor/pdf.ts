/* =============================================================================
   Visor · PDF con pdf.js, dibujado en un <canvas>.

   Solo se importa por `import()` dinámico (pdf.js pesa): las páginas públicas
   que no abren un PDF no lo descargan. El worker lo emite Vite como archivo
   propio, igual que en la lectura de PDF de Pilo Enseñanza.
   ========================================================================== */

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export interface PdfHandle {
  numPages: number;
  /** Dibuja la página (1-based) en el lienzo, a `width` píxeles CSS de ancho. Devuelve cuando termina. */
  render(page: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  destroy(): Promise<void>;
}

async function load(source: { url?: string; data?: Uint8Array }): Promise<PdfHandle> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument(source.url ? { url: source.url } : { data: source.data as Uint8Array });
  const doc: PDFDocumentProxy = await task.promise;
  const running = new WeakMap<HTMLCanvasElement, RenderTask>();

  return {
    numPages: doc.numPages,
    async render(pageNumber, canvas, width) {
      // Un dibujo anterior en el mismo lienzo (cambio rápido de página) se cancela.
      running.get(canvas)?.cancel();
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (width / base.width) * ratio;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      const render = page.render({ canvasContext: context, canvas, viewport });
      running.set(canvas, render);
      try {
        await render.promise;
      } catch (error) {
        // Cancelar un dibujo lanza; no es un fallo.
        if ((error as { name?: string }).name !== "RenderingCancelledException") throw error;
      } finally {
        page.cleanup();
      }
    },
    destroy: () => task.destroy(),
  };
}

export const openPdfUrl = (url: string) => load({ url });
export const openPdfBytes = (data: Uint8Array) => load({ data });
