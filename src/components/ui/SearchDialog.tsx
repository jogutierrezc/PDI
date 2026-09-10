/* =============================================================================
   Buscador del portal.
   La cabecera tenía un botón "Buscar" que no hacía nada. Aquí está lo que
   prometía: un índice de páginas, pilares e indicadores con navegación por
   teclado, construido a partir de lo que hay en la base de datos.

   Sin animación de apertura: es un control de teclado que se usa muchas veces
   al día y cualquier retardo se siente como lentitud.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { useFeaturedActivities, usePillars } from "../../data/queries";

interface Entry {
  id: string;
  title: string;
  hint: string;
  group: string;
  to: string;
  icon: IconName;
  /** Texto adicional que se busca pero no se muestra. */
  keywords: string;
}

const pages: Entry[] = [
  { id: "page-home", title: "Inicio", hint: "Portada del PDI 2024-2028", group: "Páginas", to: "/", icon: "grid", keywords: "portada home principal" },
  { id: "page-impl", title: "Implementación del PDI", hint: "Avance de los pilares", group: "Páginas", to: "/implementacion", icon: "document", keywords: "pilares avance proyectos" },
  { id: "page-board", title: "Tablero PDI", hint: "Cumplimiento global y por pilar", group: "Páginas", to: "/tablero", icon: "grid", keywords: "dashboard indicadores seguimiento" },
  { id: "page-sdg", title: "PDI y los ODS", hint: "Aporte del plan a la Agenda 2030", group: "Páginas", to: "/ods", icon: "leaf", keywords: "ods objetivos desarrollo sostenible agenda 2030 naciones unidas sdg" },
  { id: "page-dev", title: "Desarrollo tecnológico", hint: "Aplicativos construidos por Planeación", group: "Páginas", to: "/desarrollo-tecnologico", icon: "code", keywords: "proyectos web github repositorio aplicativos software" },
  { id: "page-repo", title: "Repositorio documental", hint: "Documentos de soporte del plan", group: "Páginas", to: "/implementacion#repositorio", icon: "document", keywords: "documentos soportes descargas archivos" },
  { id: "page-login", title: "Acceso intranet", hint: "Ingreso para el equipo de Planeación", group: "Páginas", to: "/acceso-intranet", icon: "lock", keywords: "login sesion admin intranet" },
];

/** Normaliza para que "personalizacion" encuentre "Personalización". */
const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const listId = useId();

  // Las consultas ya están en caché por la página que hay debajo: abrir el
  // buscador no dispara peticiones nuevas.
  const pillars = usePillars();
  const activities = useFeaturedActivities();

  const entries = useMemo<Entry[]>(() => {
    const pillarEntries: Entry[] = (pillars.data ?? []).map((pillar) => ({
      id: `pillar-${pillar.id}`,
      title: pillar.name,
      hint: `${pillar.progress.progress} % de avance · ${pillar.management_owner}`,
      group: "Pilares",
      to: `/implementacion/pilar/${pillar.slug}`,
      icon: pillar.icon,
      keywords: `${pillar.focus} ${pillar.description} ${pillar.numeral}`,
    }));

    const activityEntries: Entry[] = (activities.data ?? []).map((activity) => ({
      id: `activity-${activity.id}`,
      title: activity.title,
      hint: `${activity.pillar?.name ?? ""} · ${activity.owner}`,
      group: "Indicadores",
      to: "/tablero#indicadores",
      icon: "check",
      keywords: activity.status,
    }));

    return [...pages, ...pillarEntries, ...activityEntries];
  }, [pillars.data, activities.data]);

  const results = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return entries.slice(0, 8);
    const terms = needle.split(/\s+/);
    return entries
      .filter((entry) => {
        const haystack = fold(`${entry.title} ${entry.hint} ${entry.group} ${entry.keywords}`);
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 10);
  }, [entries, query]);

  // Al abrir: recordar el foco, enfocar el campo, bloquear el scroll del fondo.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    setQuery("");
    setActiveIndex(0);

    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  // Mantener a la vista la opción resaltada al recorrer con el teclado.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const go = (entry: Entry) => {
    onClose();
    navigate(entry.to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex]);
    }
  };

  let lastGroup = "";

  return (
    <div
      className="search-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar en el portal">
        <div className="search-dialog__field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar pilares, indicadores o páginas…"
            aria-label="Buscar"
            aria-controls={listId}
            aria-activedescendant={results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar búsqueda">
            <Icon name="close" size={16} />
          </button>
        </div>

        {results.length === 0 ? (
          <p className="search-dialog__empty">
            Sin resultados para <strong>{query}</strong>.
          </p>
        ) : (
          <ul className="search-dialog__results" id={listId} ref={listRef} role="listbox">
            {results.map((entry, index) => {
              const showGroup = entry.group !== lastGroup;
              lastGroup = entry.group;
              return (
                <li
                  key={entry.id}
                  id={`${listId}-${entry.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`search-result${index === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(entry);
                  }}
                >
                  {showGroup && <span className="search-result__group">{entry.group}</span>}
                  <span className="search-result__body">
                    <Icon name={entry.icon} size={17} />
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{entry.hint}</small>
                    </span>
                    <Icon name="arrow-right" size={15} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="search-dialog__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>Esc</kbd> cerrar</span>
        </footer>
      </div>
    </div>
  );
}
