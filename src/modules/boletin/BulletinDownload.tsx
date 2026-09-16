/* =============================================================================
   Boletín · botón de descarga del portal.

   En la portada de Datos Abiertos descarga el boletín global; en la ficha de un
   informe, el de ese informe. Qué entrega:
   · la edición en PDF publicada más reciente del boletín, si la hay (el archivo
     congelado que emitió Planeación);
   · si no, el boletín en vivo, que se abre con el diálogo "Guardar como PDF".

   Un informe sin boletín propio publicado usa la plantilla del boletín global
   publicado, restringida a ese informe (ver resolvePublicBulletin). Sin ninguno
   de los dos publicados, el botón no aparece: no se ofrece un documento que
   Planeación no ha liberado.
   ========================================================================== */

import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import type { OdBulletinEditionRow, OdBulletinRow } from "../../types/database";
import type { OpenDataCatalog, Report } from "../datos-abiertos/data/types";
import { bulletinFileUrl, usePublicBulletins } from "./data";
import type { BulletinBundle } from "./data";
import { bulletinSlug } from "./model";

/**
 * Boletín publicado para un slug. "boletin-<informe>" sin fila propia se arma
 * con la plantilla del global publicado, limitada a ese informe.
 */
export function resolvePublicBulletin(
  bundle: BulletinBundle | undefined,
  catalog: OpenDataCatalog,
  slug: string | undefined,
): { row: OdBulletinRow; derived: boolean } | null {
  if (!bundle || !slug) return null;
  const own = bundle.bulletins.find((b) => b.slug === slug);
  if (own) return { row: own, derived: false };
  const report = catalog.reports.find((r) => bulletinSlug(r.slug) === slug);
  const global = bundle.bulletins.find((b) => !b.report_id);
  if (!report?.uuid || !global) return null;
  return {
    row: { ...global, id: `${global.id}:${report.slug}`, report_id: report.uuid, slug, title: `${global.title} · ${report.name}` },
    derived: true,
  };
}

/** Edición en PDF publicada más reciente de un boletín. */
function latestEdition(bundle: BulletinBundle, row: OdBulletinRow, derived: boolean): OdBulletinEditionRow | undefined {
  if (derived) return undefined;
  return bundle.editions
    .filter((e) => e.bulletin_id === row.id)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
}

export function BulletinDownload({
  catalog,
  report,
  className = "od-button od-button--ghost",
  label,
}: {
  catalog: OpenDataCatalog;
  /** Sin informe, el boletín global. */
  report?: Report | null;
  className?: string;
  label?: string;
}) {
  const bundle = usePublicBulletins(catalog.period?.uuid);
  const slug = bulletinSlug(report?.slug ?? null);
  const found = resolvePublicBulletin(bundle.data, catalog, slug);
  if (!found) return null;

  const edition = latestEdition(bundle.data!, found.row, found.derived);
  const text = label ?? (report ? "Boletín PDF" : "Descargar boletín global (PDF)");
  const title = report ? `Boletín de ${report.name} en PDF` : "Boletín global de UDES en Cifras en PDF";

  if (edition) {
    return (
      <a className={className} href={bulletinFileUrl(edition.file_path)} target="_blank" rel="noreferrer" title={`${title} · ${edition.label}`}>
        <Icon name="download" size={16} /> {text}
      </a>
    );
  }
  return (
    <Link className={className} to={`/datos-abiertos/boletines/${slug}?imprimir`} target="_blank" title={`${title}: se abre para guardarlo como PDF`}>
      <Icon name="download" size={16} /> {text}
    </Link>
  );
}
