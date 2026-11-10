/* =============================================================================
   Visor · el contenido de un documento, según su tipo.

     · PDF       → páginas dibujadas con pdf.js, con miniaturas y flechas.
     · Word      → páginas convertidas en el navegador (docx-preview).
     · HTML, Quarto y R → el .html en un marco aislado (`sandbox="allow-scripts"`,
                   sin acceso a la sesión del portal) y, si se subió, el código
                   fuente aparte, con colores y en solo lectura.
     · Markdown  → texto con formato.

   El portal NO ejecuta Quarto ni R: muestra el resultado que el autor ya
   renderizó. Ocupa todo el alto de su contenedor: lo usan la página a pantalla
   completa del portal y la vista previa del panel.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { documentFileUrl, documentHref } from "../data";
import type { DocItem } from "../data";
import { formatOf, FORMAT_LABEL } from "../tipos";
import { highlightLines, markdownToHtml } from "./resaltar";
import type { PdfHandle } from "./pdf";
import "../doc-visor.css";

/* --- Lectura de archivos del bucket ---------------------------------------------------- */

function useFetched<T>(url: string | null, read: (response: Response) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: Boolean(url) });
  useEffect(() => {
    if (!url) {
      setState({ data: null, error: "Este documento no tiene archivo.", loading: false });
      return;
    }
    let live = true;
    setState({ data: null, error: null, loading: true });
    fetch(url, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo leer el archivo (${response.status}).`);
        return read(response);
      })
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => live && setState({ data: null, error: error instanceof Error ? error.message : "No se pudo leer el archivo.", loading: false }));
    return () => {
      live = false;
    };
    // `read` es estable por llamada: solo cambia la dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}

const asText = (response: Response) => response.text();
const asBuffer = (response: Response) => response.arrayBuffer();

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="dv-state">{children}</div>;
}

/* --- PDF ------------------------------------------------------------------------------- */

function PdfThumb({ pdf, page, active, onPick }: { pdf: PdfHandle; page: number; active: boolean; onPick: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = holder.current;
    if (!node || !canvas.current) return;
    let drawn = false;
    const observer = new IntersectionObserver((entries) => {
      if (drawn || !entries.some((entry) => entry.isIntersecting)) return;
      drawn = true;
      if (canvas.current) void pdf.render(page, canvas.current, 84).catch(() => undefined);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pdf, page]);
  return (
    <button type="button" ref={holder} className="dv-pdf__thumb" aria-current={active ? "page" : undefined} aria-label={`Página ${page}`} onClick={onPick}>
      <canvas ref={canvas} />
      <span>{page}</span>
    </button>
  );
}

function PdfView({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PdfHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState(true);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    let handle: PdfHandle | null = null;
    void import("./pdf")
      .then((module) => module.openPdfUrl(url))
      .then((opened) => {
        handle = opened;
        if (live) setPdf(opened);
        else void opened.destroy();
      })
      .catch((reason: unknown) => live && setError(reason instanceof Error ? reason.message : "No se pudo abrir el PDF."));
    return () => {
      live = false;
      if (handle) void handle.destroy();
    };
  }, [url]);

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    if (!pdf || !canvas.current || width < 120) return;
    const target = fit ? Math.min(width - 32, 980) : Math.min(1400, Math.max(width - 32, 980));
    void pdf.render(page, canvas.current, target).catch(() => setError("No se pudo dibujar la página."));
  }, [pdf, page, width, fit]);

  useEffect(() => {
    if (!pdf) return;
    const onKey = (event: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") setPage((current) => Math.min(pdf.numPages, current + 1));
      if (event.key === "ArrowLeft" || event.key === "PageUp") setPage((current) => Math.max(1, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdf]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!pdf) return <Aviso>Abriendo el PDF…</Aviso>;
  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  return (
    <div className="dv-pdf">
      <div className="dv-pdf__thumbs" role="list" aria-label="Páginas">
        {pages.slice(0, 200).map((number) => (
          <PdfThumb key={number} pdf={pdf} page={number} active={number === page} onPick={() => setPage(number)} />
        ))}
      </div>
      <div className="dv-pdf__main">
        <div className="dv-pdf__bar">
          <button type="button" className="dv-btn" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Página anterior">
            ‹
          </button>
          <label className="dv-pdf__num">
            <input
              type="number"
              min={1}
              max={pdf.numPages}
              value={page}
              onChange={(event) => setPage(Math.min(pdf.numPages, Math.max(1, Number(event.target.value) || 1)))}
              aria-label="Número de página"
            />
            <span>/ {pdf.numPages}</span>
          </label>
          <button type="button" className="dv-btn" onClick={() => setPage((current) => Math.min(pdf.numPages, current + 1))} disabled={page >= pdf.numPages} aria-label="Página siguiente">
            ›
          </button>
          <button type="button" className="dv-btn dv-btn--text" aria-pressed={!fit} onClick={() => setFit((value) => !value)}>
            {fit ? "Ampliar" : "Ajustar al ancho"}
          </button>
          <span className="dv-pdf__hint">Flechas del teclado para cambiar de página</span>
        </div>
        <div className="dv-pdf__scroll" ref={area}>
          <canvas ref={canvas} className="dv-pdf__page" />
        </div>
      </div>
    </div>
  );
}

/* --- Word ------------------------------------------------------------------------------ */

function DocxView({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const file = useFetched(url, asBuffer);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || !file.data) return;
    let live = true;
    node.replaceChildren();
    void import("docx-preview")
      .then((module) => module.renderAsync(file.data as ArrayBuffer, node, undefined, { className: "dv-docx", inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true }))
      .catch(() => live && setError("No se pudo convertir el Word. Descárgalo para abrirlo."));
    return () => {
      live = false;
      node.replaceChildren();
    };
  }, [file.data]);

  if (file.error || error) return <Aviso>{file.error ?? error}</Aviso>;
  return (
    <div className="dv-docx-host">
      {file.loading && <Aviso>Convirtiendo el documento…</Aviso>}
      <div ref={host} />
    </div>
  );
}

/* --- HTML, Quarto y R ------------------------------------------------------------------ */

const CSP =
  "default-src 'none'; img-src data: blob: https:; media-src data: blob: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' 'unsafe-eval' https:; font-src data: https:; connect-src 'none'";

/** El HTML con una política que le impide hablar con la red: puede dibujar, no enviar datos a ningún lado. */
function withPolicy(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`) : `<!doctype html><html><head><meta charset="utf-8">${meta}</head><body>${html}</body></html>`;
}

function HtmlView({ url, mobile }: { url: string; mobile: boolean }) {
  const file = useFetched(url, asText);
  const doc = useMemo(() => (file.data ? withPolicy(file.data) : ""), [file.data]);
  if (file.error) return <Aviso>{file.error}</Aviso>;
  if (file.loading) return <Aviso>Abriendo el documento…</Aviso>;
  return (
    <div className="dv-frame" data-mobile={mobile}>
      <iframe title="Documento" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={doc} />
    </div>
  );
}

/**
 * Un microportal: un sitio entero con sus páginas, estilos y datos. Se abre por su
 * dirección (no con srcDoc) para que sus enlaces relativos funcionen. Sin
 * `allow-same-origin` queda en un origen aparte: no ve la sesión del portal. Sus
 * archivos vienen del bucket «documentos», que responde con CORS abierto.
 */
function PortalView({ url, mobile }: { url: string; mobile: boolean }) {
  return (
    <div className="dv-frame" data-mobile={mobile}>
      <iframe
        title="Microportal"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-forms"
        referrerPolicy="no-referrer"
        src={url}
      />
    </div>
  );
}

function CodeView({ url, name }: { url: string; name: string }) {
  const file = useFetched(url, asText);
  const lines = useMemo(() => (file.data ? highlightLines(file.data) : []), [file.data]);
  if (file.error) return <Aviso>{file.error}</Aviso>;
  if (file.loading) return <Aviso>Abriendo el código…</Aviso>;
  return (
    <div className="dv-code" role="region" aria-label={`Código fuente ${name}`} tabIndex={0}>
      <pre>
        {lines.map((html, index) => (
          <span key={index} className="dv-code__ln" dangerouslySetInnerHTML={{ __html: html || " " }} />
        ))}
      </pre>
    </div>
  );
}

function MarkdownView({ url }: { url: string }) {
  const file = useFetched(url, asText);
  const html = useMemo(() => (file.data ? markdownToHtml(file.data) : ""), [file.data]);
  if (file.error) return <Aviso>{file.error}</Aviso>;
  if (file.loading) return <Aviso>Abriendo el documento…</Aviso>;
  return <article className="dv-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* --- El visor -------------------------------------------------------------------------- */

export function DocViewer({ item }: { item: DocItem }) {
  const format = formatOf(item);
  const url = documentHref(item);
  const sourceUrl = documentFileUrl(item.sourcePath);
  const [tab, setTab] = useState<"doc" | "code">("doc");
  const [mobile, setMobile] = useState(false);
  const isPortal = format === "portal";
  const isWeb = format === "html" || format === "qmd" || format === "r" || isPortal;
  const sourceLabel = format === "qmd" ? "Código (.qmd)" : "Código (.R)";

  useEffect(() => setTab("doc"), [item.id]);

  return (
    <div className="dv">
      {isWeb && (
        <div className="dv-tabs">
          {sourceUrl && !isPortal ? (
            <div className="dv-seg" role="tablist" aria-label="Qué ver">
              <button type="button" role="tab" aria-selected={tab === "doc"} onClick={() => setTab("doc")}>
                {format === "r" ? "Resultado" : "Documento"}
              </button>
              <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>
                {sourceLabel}
              </button>
            </div>
          ) : null}
          {tab === "doc" && (
            <div className="dv-seg" role="group" aria-label="Tamaño de pantalla">
              <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>
                Escritorio
              </button>
              <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>
                Móvil
              </button>
            </div>
          )}
          <span className="dv-tabs__note">{isPortal ? "Sitio completo" : FORMAT_LABEL[format]} mostrado en un marco aislado, sin acceso a tu sesión.</span>
        </div>
      )}
      <div className="dv-body">
        {!url ? (
          <Aviso>Este documento no tiene archivo.</Aviso>
        ) : format === "pdf" ? (
          <PdfView url={url} />
        ) : format === "doc" ? (
          <DocxView url={url} />
        ) : isWeb ? (
          isPortal ? (
            <PortalView url={url} mobile={mobile} />
          ) : tab === "code" && sourceUrl ? (
            <CodeView url={sourceUrl} name={item.sourceName} />
          ) : (
            <HtmlView url={url} mobile={mobile} />
          )
        ) : format === "md" ? (
          <MarkdownView url={url} />
        ) : (
          <Aviso>Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.</Aviso>
        )}
      </div>
    </div>
  );
}
