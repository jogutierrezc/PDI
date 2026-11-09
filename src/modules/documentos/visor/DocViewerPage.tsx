/* =============================================================================
   Portal Documentos · el documento a pantalla completa.

   Una página propia por documento (/documentos/ver/:id): sin la barra del sitio,
   con todo el alto para leer. Arriba, «Volver» regresa a donde estaba la
   persona (la colección con sus filtros, la búsqueda, la portada); si entró
   directo por un enlace compartido y no hay historia, lleva a la colección del
   documento. Esc hace lo mismo.
   ========================================================================== */

import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { formatBytes } from "../../../data/storage";
import { NotFound } from "../../../routes/NotFound";
import { documentHref, useDocLibrary } from "../data";
import type { DocCollection, DocItem, DocLibrary } from "../data";
import { TipoDoc } from "../TipoDoc";
import { FORMAT_LABEL, formatOf, isPreviewableFormat } from "../tipos";
import { DocViewer } from "./DocViewer";
import "../doc-visor.css";

interface Where {
  item: DocItem;
  root: DocCollection;
  section: DocCollection | null;
}

/** En qué colección y sección vive un documento. */
function locate(library: DocLibrary, id: string): Where | null {
  for (const [nodeId, items] of library.byCollection) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) continue;
    const root = library.collections.find((collection) => collection.id === nodeId);
    if (root) return { item, root, section: null };
    for (const [rootId, sections] of library.sections) {
      const section = sections.find((candidate) => candidate.id === nodeId);
      const parent = library.collections.find((collection) => collection.id === rootId);
      if (section && parent) return { item, root: parent, section };
    }
  }
  return null;
}

export function DocViewerPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const library = useDocLibrary();
  const found = useMemo(() => (library.data ? locate(library.data, id) : null), [library.data, id]);

  const home = found ? `/documentos/${found.root.slug}${found.section ? `/${found.section.slug}` : ""}` : "/documentos";
  const back = useCallback(() => {
    // `idx` lo escribe el router: mayor que 0 = hay una página anterior dentro del sitio.
    const index = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof index === "number" && index > 0) navigate(-1);
    else navigate(home, { replace: true });
  }, [navigate, home]);

  useEffect(() => {
    if (found) document.title = `${found.item.title} · Repositorio documental`;
  }, [found]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  if (library.isPending) {
    return (
      <div className="dv-page dv-page--wait">
        <LoadingBlock rows={3} label="Abriendo el documento" />
      </div>
    );
  }
  if (library.isError) {
    return (
      <div className="dv-page dv-page--wait">
        <ErrorBlock error={library.error} onRetry={() => void library.refetch()} />
      </div>
    );
  }
  if (!found) return <NotFound />;

  const { item, root, section } = found;
  const format = formatOf(item);
  const href = documentHref(item);
  const canDownload = item.kind === "archivo" && href;

  return (
    <div className="dv-page">
      <header className="dv-page__bar">
        <button type="button" className="dv-back" onClick={back}>
          <Icon name="arrow-left" size={16} />
          Volver
        </button>
        <div className="dv-page__title">
          <span className="dv-page__crumb">
            {root.title}
            {section ? ` · ${section.title}` : ""}
          </span>
          <h1>{item.title}</h1>
        </div>
        <div className="dv-page__meta">
          <TipoDoc format={format} />
          {item.year !== null && <span>{item.yearTo !== null && item.yearTo !== item.year ? `${item.year}-${item.yearTo}` : item.year}</span>}
          {item.version && <span>{item.version}</span>}
          {item.sizeBytes !== null && <span>{formatBytes(item.sizeBytes)}</span>}
          {item.visibility === "intranet" && <span className="dv-chip">Solo intranet</span>}
        </div>
        {href && (
          <div className="dv-page__acts">
            {canDownload ? (
              <a className="dv-btn dv-btn--text" href={href} download={item.fileName || undefined}>
                <Icon name="download" size={15} />
                Descargar
              </a>
            ) : (
              <a className="dv-btn dv-btn--text" href={href} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={15} />
                Abrir
              </a>
            )}
          </div>
        )}
      </header>

      <div className="dv-page__body">
        {isPreviewableFormat(format) ? (
          <DocViewer item={item} />
        ) : (
          <div className="dv-state dv-state--center">
            <p>
              {format === "repo" || format === "link"
                ? `Este documento vive en otro sitio (${FORMAT_LABEL[format]}): se abre en una pestaña nueva.`
                : "Este tipo de archivo no tiene vista previa."}
            </p>
            {href && (
              <a className="dv-btn dv-btn--solid" href={href} target={item.kind === "enlace" ? "_blank" : undefined} rel="noopener noreferrer">
                {item.kind === "enlace" ? "Abrir enlace" : "Descargar"}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
