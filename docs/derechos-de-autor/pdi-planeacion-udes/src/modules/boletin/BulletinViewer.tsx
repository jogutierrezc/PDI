/* =============================================================================
   Boletín · visor e impresión.

   Página sola, sin el marco del portal ni el de la intranet: lo que se ve es
   lo que se imprime. La barra de arriba (que no se imprime) lleva la vuelta,
   el título, cuántas páginas tiene y "Descargar PDF", que abre el diálogo de
   impresión del navegador: con @page A4 sin márgenes, "Guardar como PDF" deja
   un PDF vectorial con el texto seleccionable, página por página.

   Tres entradas:
   · /admin/boletin/:id          intranet, con borradores
   · /datos-abiertos/boletines   portal: boletines en vivo y ediciones en PDF
   · /datos-abiertos/boletines/:slug   portal, un boletín en vivo
   Con ?imprimir, el diálogo se abre solo en cuanto termina la paginación.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useOdAdminData } from "../admin/udes-en-cifras/od-data";
import { useOpenDataCatalog, withPeriodView } from "../datos-abiertos/data/open-data";
import { ALL_YEARS, cutLabel } from "../datos-abiertos/data/terms";
import type { OpenDataCatalog } from "../datos-abiertos/data/types";
import { useWidth } from "../datos-abiertos/components/motion";
import { EmptyPeriod, OpenDataLayout } from "../datos-abiertos/components/OpenDataLayout";
import { formatBytes } from "../../data/storage";
import type { OdBulletinRow } from "../../types/database";
import { BulletinDocument } from "./BulletinDocument";
import { bulletinFileUrl, useBulletin, usePublicBulletins } from "./data";
import { normalizeSettings } from "./model";
import { resolvePublicBulletin } from "./BulletinDownload";
import "./boletin.css";

interface ViewerProps {
  catalog: OpenDataCatalog;
  row: OdBulletinRow;
  back: { to: string; label: string };
  autoPrint?: boolean;
  draft?: boolean;
}

export function BulletinViewer({ catalog, row, back, autoPrint = false, draft = false }: ViewerProps) {
  const report = row.report_id ? catalog.reports.find((r) => r.uuid === row.report_id) ?? null : null;
  const settings = useMemo(() => normalizeSettings(row.settings, catalog, report?.slug ?? null), [row.settings, catalog, report?.slug]);
  const canvas = useRef<HTMLDivElement>(null);
  const width = useWidth(canvas, 900);
  const [pages, setPages] = useState(0);
  const printed = useRef(false);

  useEffect(() => {
    const previous = document.title;
    // El título de la pestaña es el nombre que propone "Guardar como PDF".
    document.title = row.title;
    return () => {
      document.title = previous;
    };
  }, [row.title]);

  const onReady = useCallback(
    (count: number) => {
      setPages(count);
      if (autoPrint && !printed.current) {
        printed.current = true;
        // Deja pintar las imágenes antes de abrir el diálogo.
        window.setTimeout(() => window.print(), 600);
      }
    },
    [autoPrint],
  );

  const cut = settings.cut === ALL_YEARS ? `Periodo ${cutLabel(ALL_YEARS, null)}` : `Corte ${settings.cut}`;

  return (
    <div className="bol-viewer">
      <header className="bol-viewer__bar bol-noprint">
        <Link className="bol-viewer__back" to={back.to}>
          <Icon name="arrow-left" size={16} />
          {back.label}
        </Link>
        <div className="bol-viewer__title">
          <strong>{row.title}</strong>
          <span>
            {cut} · {pages ? `${pages} páginas A4` : "Paginando…"}
            {draft && row.status !== "publicado" ? " · borrador" : ""}
          </span>
        </div>
        <button type="button" className="button-primary" disabled={!pages} onClick={() => window.print()}>
          <Icon name="download" size={16} />
          Descargar PDF
        </button>
      </header>
      <p className="bol-viewer__hint bol-noprint">
        En el diálogo de impresión elige <b>Guardar como PDF</b>. El tamaño A4 y los márgenes ya vienen fijados por el boletín.
      </p>
      <div className="bol-viewer__canvas">
        {/* Se mide el contenido, sin el relleno del lienzo: es el ancho real donde cabe la página. */}
        <div ref={canvas}>
          <BulletinDocument catalog={catalog} settings={settings} report={report} fitWidth={width} onReady={onReady} />
        </div>
      </div>
    </div>
  );
}

/* --- Intranet: un boletín con borradores ----------------------------------- */

export function IntranetBulletinPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const bulletin = useBulletin(id);
  const admin = useOdAdminData(bulletin.data?.period_id);
  const catalog = useMemo(() => (admin.data ? withPeriodView(admin.data.catalog) : null), [admin.data]);

  if (bulletin.isLoading || (bulletin.data && admin.isLoading)) return <div className="bol-viewer__state"><LoadingBlock rows={4} label="Cargando el boletín" /></div>;
  if (bulletin.error || admin.error) return <div className="bol-viewer__state"><ErrorBlock error={bulletin.error ?? admin.error} /></div>;
  if (!bulletin.data || !catalog) {
    return (
      <div className="bol-viewer__state">
        <p>Ese boletín no existe o no tienes acceso a él.</p>
        <Link to="/admin/udes-en-cifras/boletin">Volver a los boletines</Link>
      </div>
    );
  }
  return (
    <BulletinViewer
      catalog={catalog}
      row={bulletin.data}
      draft
      autoPrint={params.has("imprimir")}
      back={{ to: `/admin/udes-en-cifras/boletin?periodo=${bulletin.data.period_id}`, label: "Intranet" }}
    />
  );
}

/* --- Portal: un boletín en vivo --------------------------------------------- */

export function PublicBulletinPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const catalog = useOpenDataCatalog();
  const bundle = usePublicBulletins(catalog.data?.period?.uuid);
  // Un informe sin boletín propio usa la plantilla del global publicado.
  const row = catalog.data ? resolvePublicBulletin(bundle.data, catalog.data, slug)?.row : undefined;

  if (catalog.isLoading || bundle.isLoading) return <div className="bol-viewer__state"><LoadingBlock rows={4} label="Cargando el boletín" /></div>;
  if (catalog.error || bundle.error) return <div className="bol-viewer__state"><ErrorBlock error={catalog.error ?? bundle.error} /></div>;
  if (!catalog.data || !row) {
    return (
      <div className="bol-viewer__state">
        <p>Este boletín no está publicado.</p>
        <Link to="/datos-abiertos/boletines">Ver los boletines publicados</Link>
      </div>
    );
  }
  return (
    <BulletinViewer
      catalog={catalog.data}
      row={row}
      autoPrint={params.has("imprimir")}
      back={{ to: "/datos-abiertos/boletines", label: "Boletines" }}
    />
  );
}

/* --- Portal: lista de boletines y ediciones ------------------------------------ */

const dateFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export function PublicBulletinList() {
  const catalog = useOpenDataCatalog();
  const bundle = usePublicBulletins(catalog.data?.period?.uuid);

  return (
    <OpenDataLayout title="Boletines | UDES en Cifras" className="od-bulletins-page">
      {catalog.isLoading || bundle.isLoading ? (
        <div className="u-container"><LoadingBlock rows={4} label="Cargando los boletines" /></div>
      ) : catalog.error || bundle.error ? (
        <div className="u-container"><ErrorBlock error={catalog.error ?? bundle.error} /></div>
      ) : !catalog.data ? (
        <EmptyPeriod />
      ) : (
        <section className="od-bulletins" aria-labelledby="od-boletines">
          <div className="u-container">
            <header className="od-bulletins__head">
              <h1 id="od-boletines">Boletín UDES en Cifras</h1>
              <p>
                Las cifras de cada informe en un documento A4 para leer, imprimir o guardar en PDF. El boletín en vivo se arma con las cifras
                publicadas hoy; una edición es el PDF emitido en su fecha y no cambia.
              </p>
            </header>

            <h2>En vivo · periodo {catalog.data.period?.label}</h2>
            {bundle.data?.bulletins.length ? (
              <ul className="od-bulletins__live">
                {bundle.data.bulletins.map((b) => {
                  const report = b.report_id ? catalog.data!.reports.find((r) => r.uuid === b.report_id) : null;
                  return (
                    <li key={b.id}>
                      <Link to={`/datos-abiertos/boletines/${b.slug}`}>
                        <strong>{b.title}</strong>
                        <span>{report ? `Informe ${report.name}` : "Todos los informes con cifras"}</span>
                        <Icon name="arrow-right" size={18} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="od-bulletins__empty">Todavía no hay un boletín en vivo para este periodo.</p>
            )}

            <h2>Ediciones en PDF</h2>
            {bundle.data?.editions.length ? (
              <ul className="od-bulletins__editions">
                {bundle.data.editions.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.title}</strong>
                      <span>
                        {e.label}
                        {e.period_label ? ` · periodo ${e.period_label}` : ""}
                        {e.cut_label ? ` · ${e.cut_label}` : ""}
                      </span>
                      <small>Emitida el {dateFormat.format(new Date(e.published_at))}</small>
                    </div>
                    <a className="od-button od-button--line" href={bulletinFileUrl(e.file_path)} target="_blank" rel="noreferrer">
                      <Icon name="download" size={16} /> PDF · {formatBytes(e.file_size)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="od-bulletins__empty">Aún no se ha emitido ninguna edición en PDF.</p>
            )}
          </div>
        </section>
      )}
    </OpenDataLayout>
  );
}
