/* =============================================================================
   Buscador transversal de la portada.

   Un combobox de verdad: el foco se queda en el campo y las flechas recorren
   los resultados (aria-activedescendant), Enter abre, Escape cierra. Los
   resultados salen agrupados por portal con su cuenta; si el resultado es una
   cifra, la cifra simplificada viene en la misma fila —valor, unidad, año y
   alcance— para no tener que abrir el informe si solo se quería el número.

   El campo es siempre el mismo elemento (cambiarlo perdería lo que se está
   escribiendo); lo que se monta al primer foco es el panel con el índice, así
   la portada no paga las consultas de proyectos, documentos y boletines hasta
   que alguien vaya a buscar.
   ========================================================================== */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MutableRefObject, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PORTALS, fold, searchEntries, useSiteIndex } from "./search-index";
import type { Portal, SearchEntry } from "./search-index";

const POPULAR = ["matrícula", "deserción", "graduados", "pilares", "boletín"];
const PER_GROUP = 4;

type Scope = Portal | "todo";

/** Lo que el panel le deja al campo para manejar el teclado. */
interface PanelApi {
  openAt: (index: number) => void;
}

export function SiteSearch({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement> }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("todo");
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(0);
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  const root = useRef<HTMLDivElement>(null);
  const api = useRef<PanelApi | null>(null);
  const listId = useId();

  const show = open && query.trim().length > 0;

  useEffect(() => setActive(0), [query, scope]);

  // Clic fuera cierra el panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (show) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!count) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    } else if (event.key === "Enter" && show) {
      event.preventDefault();
      api.current?.openAt(active);
    }
  };

  const scopes: { id: Scope; label: string }[] = [{ id: "todo", label: "Todo" }, ...PORTALS];
  const arm = () => {
    setArmed(true);
    setOpen(true);
  };

  return (
    <div className="pl-search" ref={root}>
      <form
        role="search"
        className="pl-search__form"
        onSubmit={(event) => {
          event.preventDefault();
          arm();
          input.current?.focus();
        }}
      >
        <label className="sr-only" htmlFor="pl-buscar">
          Buscar en los portales de Planeación
        </label>
        <div className="pl-search__field" data-open={show || undefined}>
          <Icon name="search" size={22} />
          <input
            ref={input}
            id="pl-buscar"
            type="search"
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && count ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Busca una cifra, un proyecto, un tema o un boletín"
            value={query}
            onFocus={arm}
            onChange={(e) => {
              setQuery(e.target.value);
              arm();
            }}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className="pl-search__submit">
            Buscar
          </button>
        </div>
        {armed && show && (
          <ResultsPanel
            api={api}
            listId={listId}
            query={query}
            scope={scope}
            setScope={setScope}
            active={active}
            setActive={setActive}
            onCount={setCount}
            onClose={() => setOpen(false)}
          />
        )}
      </form>

      <div className="pl-search__scopes" role="group" aria-label="Buscar en">
        <span>Buscar en</span>
        {scopes.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={scope === s.id}
            onClick={() => {
              setScope(s.id);
              input.current?.focus();
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="pl-search__popular">
        Lo más buscado:{" "}
        {POPULAR.map((term, i) => (
          <span key={term}>
            {i > 0 && " · "}
            <button
              type="button"
              onClick={() => {
                setQuery(term);
                input.current?.focus();
                arm();
              }}
            >
              {term}
            </button>
          </span>
        ))}
      </p>
    </div>
  );
}

/* --- Panel de resultados ------------------------------------------------------------------- */

function ResultsPanel({
  api,
  listId,
  query,
  scope,
  setScope,
  active,
  setActive,
  onCount,
  onClose,
}: {
  api: MutableRefObject<PanelApi | null>;
  listId: string;
  query: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  active: number;
  setActive: (i: number) => void;
  onCount: (n: number) => void;
  onClose: () => void;
}) {
  const { entries, loading } = useSiteIndex();
  const navigate = useNavigate();

  const all = useMemo(() => searchEntries(entries, query), [entries, query]);
  const counts = useMemo(() => {
    const map = new Map<Portal, number>();
    for (const e of all) map.set(e.portal, (map.get(e.portal) ?? 0) + 1);
    return map;
  }, [all]);
  const groups = useMemo(() => {
    const inScope = scope === "todo" ? all : all.filter((e) => e.portal === scope);
    return PORTALS.map((p) => ({ portal: p, items: inScope.filter((e) => e.portal === p.id).slice(0, scope === "todo" ? PER_GROUP : 30) })).filter((g) => g.items.length);
  }, [all, scope]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const terms = useMemo(() => fold(query.trim()).split(/\s+/).filter(Boolean), [query]);

  const openEntry = (entry: SearchEntry) => {
    onClose();
    if (entry.external) window.open(entry.to, "_blank", "noopener");
    else navigate(entry.to);
  };

  useEffect(() => onCount(flat.length), [flat.length, onCount]);
  useEffect(() => () => onCount(0), [onCount]);
  api.current = { openAt: (i) => flat[i] && openEntry(flat[i]) };

  // Mantener a la vista la opción activa.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let index = -1;
  return (
    <div className="pl-results">
      <nav className="pl-results__scopes" aria-label="Filtrar por portal">
        <button type="button" aria-pressed={scope === "todo"} onClick={() => setScope("todo")}>
          <span>Todo</span>
          <b>{all.length}</b>
        </button>
        {PORTALS.map((p) => (
          <button key={p.id} type="button" aria-pressed={scope === p.id} disabled={!counts.get(p.id)} onClick={() => setScope(p.id)}>
            <span>{p.label}</span>
            <b>{counts.get(p.id) ?? 0}</b>
          </button>
        ))}
      </nav>
      <div className="pl-results__body">
        <div id={listId} role="listbox" aria-label="Resultados">
          {groups.map((group) => (
            <div key={group.portal.id} role="group" aria-labelledby={`${listId}-g-${group.portal.id}`} className="pl-results__group">
              <div className="pl-results__group-head">
                <span id={`${listId}-g-${group.portal.id}`} data-portal={group.portal.id}>
                  {group.portal.label}
                </span>
                {scope === "todo" && (counts.get(group.portal.id) ?? 0) > group.items.length && (
                  <button type="button" onClick={() => setScope(group.portal.id)}>
                    Ver los {counts.get(group.portal.id)}
                  </button>
                )}
              </div>
              {group.items.map((entry) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={entry.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="pl-result"
                    onPointerMove={() => setActive(i)}
                    onClick={() => openEntry(entry)}
                  >
                    <span className="pl-result__code" style={entry.tone ? ({ "--tone": entry.tone } as CSSProperties) : undefined} data-plain={!entry.code || undefined}>
                      {entry.code ?? <Icon name={entry.portal === "documentos" || entry.portal === "boletines" ? "document" : "arrow-right"} size={15} />}
                    </span>
                    <span className="pl-result__text">
                      <b>{highlight(entry.title, terms)}</b>
                      <small>{entry.hint}</small>
                    </span>
                    {entry.figure ? (
                      <span className="pl-result__figure">
                        <b>
                          {entry.figure.value}
                          {entry.figure.unit && <small> {entry.figure.unit}</small>}
                        </b>
                        <small>{entry.figure.when}</small>
                      </span>
                    ) : (
                      <span className="pl-result__go">{entry.external ? "Abrir" : "Ver"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {!flat.length && (
          <div className="pl-results__empty" role="status">
            {loading ? (
              "Buscando en los portales…"
            ) : (
              <>
                <strong>Nada coincide con «{query.trim()}»</strong>
                <span>
                  Prueba con otra palabra o escribe a <a href="mailto:planeacion@udes.edu.co?subject=Solicitud%20de%20informaci%C3%B3n">planeacion@udes.edu.co</a> si buscas un dato que
                  no está publicado.
                </span>
              </>
            )}
          </div>
        )}
        <footer className="pl-results__foot">
          <span>Flechas para moverte · Enter para abrir · Esc para cerrar</span>
          {loading && flat.length > 0 ? <span>Cargando más resultados…</span> : <Link to="/datos-abiertos">Ir a UDES en Cifras</Link>}
        </footer>
      </div>
    </div>
  );
}

/** Resalta cada término dentro del título (sin tildes: el pliegue conserva el largo). */
function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const folded = fold(text);
  if (folded.length !== text.length) return text;
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (let at = folded.indexOf(term, from); at !== -1; at = folded.indexOf(term, from)) {
      for (let k = at; k < at + term.length; k += 1) marks[k] = true;
      from = at + term.length;
    }
  }
  const out: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || marks[i] !== marks[start]) {
      const piece = text.slice(start, i);
      out.push(marks[start] ? <mark key={start}>{piece}</mark> : piece);
      start = i;
    }
  }
  return out;
}
