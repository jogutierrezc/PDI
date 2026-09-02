/* =============================================================================
   Desarrollo tecnológico · página pública

   Los desarrollos web de la Oficina de Planeación, en tarjetas cuadradas.

   La tarjeta no es un enlace envolvente: lleva dos destinos —el aplicativo y su
   repositorio— y anidar un enlace dentro de otro no es HTML válido ni se puede
   anunciar bien con un lector de pantalla. Por eso los dos van explícitos abajo,
   con el aplicativo como acción principal.

   Los autores no caben en el pie sin apretar los botones, así que viven detrás
   de "Ver autores": el panel se abre encima de la tarjeta y no altera su altura,
   que es lo que mantiene la rejilla cuadrada.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import { PublicLayout } from "../components/layout/PublicLayout";
import { Icon } from "../components/ui/Icon";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../components/ui/QueryState";
import { useWebProjects } from "../data/queries";
import type { WebProject } from "../types/database";

const repoLabels: Record<WebProject["repo_kind"], string> = {
  github: "GitHub",
  udes: "Repositorio UDES",
};

export function TechDevelopment() {
  const projects = useWebProjects();

  return (
    <PublicLayout className="tech-page">
      <section className="u-container tech-intro" id="desarrollo">
        <span className="eyebrow">Desarrollo tecnológico</span>
        <h1>Lo que construimos en Planeación</h1>
        <p className="lede">
          Aplicativos y portales desarrollados por la Oficina de Planeación Institucional. Cada uno
          enlaza a su versión en funcionamiento y a su código.
        </p>
      </section>

      <section className="u-container tech-section" aria-label="Proyectos web">
        {projects.isPending ? (
          <CardSkeleton count={3} />
        ) : projects.isError ? (
          <ErrorBlock error={projects.error} onRetry={() => void projects.refetch()} />
        ) : projects.data.length === 0 ? (
          <EmptyBlock
            title="Todavía no hay desarrollos publicados"
            hint="Se registran desde la intranet, en Desarrollo tecnológico."
          />
        ) : (
          <ul className="tech-grid stagger">
            {projects.data.map((project) => (
              <ProjectCard project={project} key={project.id} />
            ))}
          </ul>
        )}
      </section>
    </PublicLayout>
  );
}

function ProjectCard({ project }: { project: WebProject }) {
  const [showAuthors, setShowAuthors] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Solo se ofrece ampliar cuando la descripción está realmente recortada: un
  // botón que no cambia nada es peor que no tenerlo.
  const [clipped, setClipped] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const headingId = useId();

  const authors = project.authors ?? [];

  // Se mide con el recorte puesto; ampliada, el alto real y el visible
  // coinciden y la medición dejaría de tener sentido.
  useEffect(() => {
    if (expanded) return;
    const node = descriptionRef.current;
    if (!node) return;

    const check = () => setClipped(node.scrollHeight - node.clientHeight > 2);
    check();

    // El texto cambia de alto al cargar la tipografía y al redimensionar.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [project.description, expanded]);

  // Escape cierra el panel y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!showAuthors) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAuthors(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAuthors]);

  // Al abrirlo, el foco entra en el panel: si no, seguir con el teclado llevaría
  // al siguiente enlace de la tarjeta, que está tapado.
  useEffect(() => {
    if (showAuthors) panelRef.current?.focus();
  }, [showAuthors]);

  return (
    <li className={`tech-card${expanded ? " is-expanded" : ""}`}>
      <header className="tech-card__top">
        <span className="tech-card__mark" aria-hidden="true">
          <Icon name="code" size={20} />
        </span>
        <span className={`tech-card__repo tech-card__repo--${project.repo_kind}`}>
          {repoLabels[project.repo_kind]}
        </span>
      </header>

      <div className="tech-card__body">
        <h2>{project.name}</h2>
        <p ref={descriptionRef}>{project.description}</p>

        {(clipped || expanded) && (
          <button
            className="tech-card__more"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Ver menos" : "Ver más"}
            <Icon name="chevron-down" size={13} />
          </button>
        )}
      </div>

      <footer className="tech-card__foot">
        {project.public_url ? (
          <a
            className="button-primary tech-card__primary"
            href={project.public_url}
            target="_blank"
            // noopener impide que la página destino manipule esta pestaña a
            // través de window.opener.
            rel="noopener noreferrer"
          >
            Abrir aplicativo
            <Icon name="external" size={15} />
            <span className="sr-only">, {project.name}, se abre en una pestaña nueva</span>
          </a>
        ) : (
          <span className="tech-card__pending">Aún sin enlace público</span>
        )}

        <div className="tech-card__secondary">
          {project.repo_url && (
            <a className="button-ghost" href={project.repo_url} target="_blank" rel="noopener noreferrer">
              <Icon name="code" size={14} />
              Repositorio
              <span className="sr-only">
                {" "}
                de {project.name} en {repoLabels[project.repo_kind]}, se abre en una pestaña nueva
              </span>
            </a>
          )}

          {authors.length > 0 && (
            <button
              ref={toggleRef}
              className="button-ghost"
              type="button"
              aria-expanded={showAuthors}
              onClick={() => setShowAuthors((open) => !open)}
            >
              <Icon name="user" size={14} />
              Ver {authors.length === 1 ? "autor" : "autores"}
              <span className="tech-card__count">{authors.length}</span>
            </button>
          )}
        </div>
      </footer>

      {showAuthors && (
        <div
          ref={panelRef}
          className="tech-authors"
          role="group"
          aria-labelledby={headingId}
          tabIndex={-1}
        >
          <header>
            <h3 id={headingId}>{authors.length === 1 ? "Autor" : "Autores"}</h3>
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                setShowAuthors(false);
                toggleRef.current?.focus();
              }}
              aria-label="Cerrar la lista de autores"
            >
              <Icon name="close" size={15} />
            </button>
          </header>

          <ul>
            {authors.map((author, index) => (
              <li key={`${author.full_name}-${index}`}>
                <strong>{author.full_name}</strong>
                {author.role && <small>{author.role}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
