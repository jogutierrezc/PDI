/* =============================================================================
   Indicadores de Impacto · un informe con Mr. Pilo, en páginas carta (PDF).

   /admin/impacto-informe/:id

   Lee el informe guardado (imp_ai_reports: su autor o la administración) y lo
   reparte en páginas carta con el mismo marco del Boletín de Seguimiento
   (Shell, PagedDocument, pie de la oficina). «Descargar PDF» abre el diálogo
   de impresión: «Guardar como PDF» deja un PDF con el texto seleccionable.
   No vuelve a llamar a la IA.
   ========================================================================== */

import { useParams } from "react-router-dom";
import { Footer, Rule, Shell } from "../boletin/ImpactBulletin";
import { PagedDocument } from "../boletin/PagedDocument";
import { today } from "../boletin/content";
import { PAPER_STYLE, reportBlocks } from "./ReportSheets";
import type { ReportDoc } from "./report";
import { useReport } from "./store";
import "../portal/portal.css";
import "../boletin/bulletin.css";
import "./informe.css";

export function ReportPrintPage() {
  const { id } = useParams();
  const report = useReport(id);
  const back = { to: "/admin/impacto", label: "Volver a Impacto" };

  if (report.isPending) return <Notice text="Cargando el informe…" />;
  if (report.error) return <Notice text={report.error.message} />;
  if (!report.data) return <Notice text="Este informe no existe o no es suyo. Los informes los ve quien los escribió y la administración." />;

  const { doc, createdAt } = report.data;
  return (
    <Shell title={doc.title} back={back} status={`Escrito el ${today(new Date(createdAt))}`}>
      {(onReady) => <ReportPages doc={doc} onReady={onReady} />}
    </Shell>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <main className="imp-rep-notice">
      <p>{text}</p>
    </main>
  );
}

function ReportPages({ doc, onReady }: { doc: ReportDoc; onReady: (pages: number) => void }) {
  const blocks = reportBlocks(doc);
  const cover = (
    <header className="ibol-cover imp-rep-cover">
      <div className="ibol-cover__top">
        <img src="/logo-udes.svg" alt="Universidad de Santander UDES" />
        <span className="ibol-kicker">{doc.cut ? `Corte ${doc.cut}` : "Sin cifras aún"}</span>
      </div>
      <h1>{doc.title}</h1>
      <p className="ibol-cover__scope">{doc.subtitle}</p>
      <Rule />
    </header>
  );
  const running = (
    <header className="ibol-running">
      <img src="/logo-udes.svg" alt="" />
      <span>
        Informe de impacto · {doc.unitName}
        <small>
          {doc.cut ? `Corte ${doc.cut} · ` : ""}
          {today(new Date(doc.createdAt || Date.now()))}
        </small>
      </span>
    </header>
  );
  // Cada bloque lleva el papel del análisis; la portada, el encabezado y el pie son los del boletín.
  return (
    <PagedDocument
      cover={cover}
      running={running}
      footer={(page, total) => <Footer page={page} total={total} />}
      items={blocks.map((b) => ({
        key: b.key,
        kind: "block" as const,
        node: (
          <div className="bol-doc imp-rep-block" style={PAPER_STYLE}>
            {b.node}
          </div>
        ),
      }))}
      version={`${doc.createdAt}-${blocks.length}`}
      onReady={onReady}
    />
  );
}
