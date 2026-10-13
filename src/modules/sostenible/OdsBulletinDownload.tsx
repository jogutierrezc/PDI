/* =============================================================================
   UDES Sostenible · descarga pública del boletín de informes ODS.

   Solo aparece cuando Planeación ya emitió una edición en PDF y está publicada.
   ========================================================================== */

import { useOdsBulletinEditions } from "./ods-bulletin-data";

export function formatEditionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export function OdsBulletinDownload({ className = "odsx-btn odsx-btn--pri", text = "Descargar boletín (PDF)" }: { className?: string; text?: string }) {
  const { edition, url } = useOdsBulletinEditions();
  if (!edition || !url) return null;
  const date = formatEditionDate(edition.published_at);
  return (
    <a className={className} href={url} target="_blank" rel="noopener" title={`${edition.label}${date ? ` · ${date}` : ""}`}>
      {text}
      <small>
        {" "}
        · {edition.label}
        {date ? ` · ${date}` : ""}
      </small>
    </a>
  );
}

/** Enlace corto, sin fecha, para pies de sección o tarjetas. */
export function OdsBulletinDownloadLink({ className = "odsx-btn", text = "Boletín (PDF)" }: { className?: string; text?: string }) {
  const { edition, url } = useOdsBulletinEditions();
  if (!edition || !url) return null;
  return (
    <a className={className} href={url} target="_blank" rel="noopener" title={edition.label}>
      {text}
    </a>
  );
}
