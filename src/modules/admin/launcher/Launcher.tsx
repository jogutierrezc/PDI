/* =============================================================================
   Intranet · el lanzador (/admin): el muro de módulos.

   Lo primero al entrar: un saludo, dónde puede trabajar la persona y lo que
   tiene pendiente. Cada módulo es un cartel de color plano (el lenguaje del
   portal de informes ODS): nombre en Open Sans condensada, un número enorme
   detrás —lo pendiente de hoy si hay dato vivo; si no, cuántas pantallas
   tiene— y accesos directos. Los módulos salen del menú de la intranet con
   sus mismas reglas (rol mínimo y canSee).

   Un módulo con dos o más pantallas se abre como microportal (portales.ts):
   el cartel se expande desde su caja hasta ocupar el muro, conservando su
   color, y muestra sus portales internos agrupados. La dirección lleva el
   ancla (#rankings), así que se abre directo por enlace y se cierra con Atrás,
   con «← Intranet» o con Esc. Con una sola pantalla, el cartel va directo.

   Con pocos módulos (vicerrectoría, programa) los carteles son grandes y
   llevan su descripción; con muchos (administración), el muro es compacto y
   aparece el buscador (atajo «/», flechas y Enter).

   La primera vez que la persona entra, Mr. Pilo arranca solo el recorrido de
   su rol; después queda el botón «Recorrido guiado».

   Movimiento (GSAP): entrada en cascada de 40 ms; la expansión del portal
   (450 ms, power4.inOut) y su repliegue (320 ms). Elegir un módulo desde un
   acceso directo no se anima: se hace muchas veces al día. Con movimiento
   reducido, solo opacidad.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { useTour } from "../../../components/tour/TourProvider";
import { intranetTourFor, tourById } from "../../../components/tour/tours";
import { gmNivelDe, useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { navigation, type NavGroup } from "../components/AdminShell";
import { pendientesDe } from "../../internacionalizacion/ui/logica";
import type { Yo } from "../../internacionalizacion/tipos";
import { MODULES, cardCount, portalFor, type ModuleId, type PortalCard, type PortalSection } from "./portales";
import "./launcher.css";

interface QuickLink {
  label: string;
  to: string;
}

interface WallModule extends NavGroup {
  text: string;
  color: string;
  rank: number;
  sections: PortalSection[];
  cards: PortalCard[];
  live?: Pending;
}

const DATE = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const REDUCED = "(prefers-reduced-motion: reduce)";
const reducedMotion = () => window.matchMedia?.(REDUCED).matches ?? false;
const finePointer = () => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;

/**
 * Tamaños del muro (12 columnas): el primero, grande (8×2) con dos pequeños a
 * su lado; el resto en filas completas, las de dos primero. `md` es la
 * tableta (6 columnas por cartel, el primero a lo ancho y el último si queda
 * solo). Así no quedan huecos en ningún ancho.
 */
export function wallSpans(n: number): { col: number; rows: number; md: number }[] {
  if (n <= 0) return [];
  if (n === 1) return [{ col: 12, rows: 1, md: 12 }];
  if (n === 2) return [{ col: 6, rows: 1, md: 6 }, { col: 6, rows: 1, md: 6 }];
  const out = [{ col: 8, rows: 2, md: 12 }, { col: 4, rows: 1, md: 6 }, { col: 4, rows: 1, md: 6 }];
  const rest = n - 3;
  const sixes = rest === 1 ? 0 : rest % 3 === 1 ? 4 : rest % 3 === 2 ? 2 : 0;
  for (let i = 0; i < rest; i++) out.push({ col: rest === 1 ? 12 : i < sixes ? 6 : 4, rows: 1, md: 6 });
  if ((n - 1) % 2 === 1) out[n - 1].md = 12;
  return out;
}

export function Launcher() {
  const { profile, access, hasRole, canSee, canSeeReport, impactoSide, signOut, puedeGestionarInformes } = useAuth();
  const { start, isDone, active } = useTour();
  const navigate = useNavigate();
  const location = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const motion = useRef<gsap.Context | null>(null);
  const expandFrom = useRef<string | null>(null);
  const closing = useRef(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [tourOffer, setTourOffer] = useState(true);

  const admin = hasRole("admin");
  const tourId = intranetTourFor({ admin, impactoSide });
  const tour = tourId ? tourById(tourId) : null;
  const firstTime = tourId ? isDone(tourId) === false : false;

  // Los módulos que la persona puede usar, con las reglas del menú.
  const groups = useMemo(
    () =>
      navigation
        .map((g) => ({ ...g, items: g.items.filter((item) => hasRole(item.minimum) && canSee(item.id)) }))
        .filter((g) => g.items.length > 0),
    [hasRole, canSee],
  );
  const visible = (id: ModuleId) => groups.some((g) => g.id === id);
  const intl = useIntl(visible("internacionalizacion"));
  const basePending = usePending(impactoSide, visible("rankings"));
  const pending = useMemo(() => (intl.pending ? [...basePending, intl.pending] : basePending), [basePending, intl.pending]);
  const reports = useCifrasReports(visible("cifras"), canSeeReport);

  // Cada módulo con su portal; los que tienen algo pendiente hoy van primero.
  const modules = useMemo<WallModule[]>(() => {
    const ctx = { hasRole, canSee, impactoSide, reports, intDirector: intl.director, puedeGestionarInformes, gmNivel: gmNivelDe(profile, access) };
    return groups
      .map((g) => {
        let sections = portalFor(g.id, ctx);
        if (cardCount(sections) === 0) {
          sections = [{ title: g.label, cards: g.items.map((i) => ({ key: i.id, title: i.label, text: "", to: i.to })) }];
        }
        const meta = MODULES[g.id];
        return {
          ...g,
          // Un grupo del menú sin entrada en MODULES no rompe el muro: color neutro y sin descripción.
          text: meta?.text ?? "",
          color: meta?.color ?? "var(--wall-sistema)",
          rank: meta?.rank ?? 99,
          sections,
          cards: sections.flatMap((s) => s.cards),
          live: pending.find((p) => p.module === g.id && p.count),
        };
      })
      .sort((a, b) => Number(!a.live) - Number(!b.live) || a.rank - b.rank);
  }, [groups, hasRole, canSee, impactoSide, reports, pending, intl.director, puedeGestionarInformes]);

  const compact = groups.length > 3;
  const spans = wallSpans(modules.length);

  // El portal abierto lo dice la dirección: /admin#rankings.
  const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
  const open = modules.find((m) => m.id === hashId && m.cards.length > 1) ?? null;
  const openId = open?.id ?? null;

  // Primer ingreso: el recorrido arranca solo, una vez.
  const started = useRef(false);
  useEffect(() => {
    if (!tourId || !firstTime || started.current || active) return;
    started.current = true;
    const timer = window.setTimeout(() => start(tourId), 900);
    return () => window.clearTimeout(timer);
  }, [tourId, firstTime, active, start]);

  // La entrada en cascada; el contexto guarda también lo que anima el portal.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const reduce = reducedMotion();
    motion.current = gsap.context(() => {
      gsap.fromTo(
        "[data-anim]",
        reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.28, stagger: 0.04, ease: "expo.out", clearProps: "opacity,transform" },
      );
    }, node);
    return () => {
      gsap.killTweensOf(node.querySelectorAll(".ln-tile__big"));
      motion.current?.revert();
      motion.current = null;
    };
  }, []);

  // Con el portal abierto, el muro de debajo no se recorre con el teclado.
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    wall.inert = Boolean(openId);
  }, [openId]);

  // Abrir: desde el cartel se expande con clip-path; por enlace o con Atrás, sin animación.
  const lastOpen = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = portalRef.current;
    const previous = lastOpen.current;
    lastOpen.current = openId;
    closing.current = false;
    if (!openId) {
      // Al cerrar, el foco vuelve al cartel (salvo que la persona esté escribiendo en el buscador).
      if (previous && document.activeElement !== searchRef.current) triggers.current.get(previous)?.focus({ preventScroll: true });
      return;
    }
    if (!el) return;
    const tile = expandFrom.current === openId ? tiles.current.get(openId) : undefined;
    expandFrom.current = null;
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    if (!tile) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 12, behavior: reducedMotion() ? "auto" : "smooth" });
    motion.current?.add(() => {
      if (reducedMotion()) {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out", clearProps: "opacity" });
        return;
      }
      const kids = Array.from(el.querySelectorAll<HTMLElement>("[data-pv]")).slice(0, 14);
      gsap.fromTo(
        el,
        { clipPath: clipFor(el, tile) },
        { clipPath: "inset(0px 0px 0px 0px round 12px)", duration: 0.45, ease: "power4.inOut", clearProps: "clipPath" },
      );
      gsap.fromTo(kids, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", stagger: 0.04, delay: 0.24, clearProps: "opacity,transform" });
      gsap.fromTo(el.querySelector(".ln-portal__big"), { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out", delay: 0.2, clearProps: "opacity,transform" });
    });
  }, [openId]);

  const openPortal = (id: string) => {
    expandFrom.current = id;
    navigate({ hash: `#${id}` }, { state: { portal: true } });
  };

  /** Cerrar: repliegue hacia el cartel y la dirección vuelve a /admin (Atrás si lo abrió desde aquí). */
  const closePortal = (instant = false) => {
    if (!openId || closing.current) return;
    closing.current = true;
    const done = () => {
      if ((location.state as { portal?: boolean } | null)?.portal) navigate(-1);
      else navigate({ hash: "" }, { replace: true });
    };
    const el = portalRef.current;
    const tile = tiles.current.get(openId);
    if (instant || !el || !tile || !motion.current) return done();
    motion.current.add(() => {
      if (reducedMotion()) {
        gsap.to(el, { opacity: 0, duration: 0.15, ease: "power1.out", onComplete: done });
        return;
      }
      gsap.to(el.querySelectorAll("[data-pv], .ln-portal__big"), { opacity: 0, duration: 0.1, ease: "power2.out" });
      gsap.to(el, { clipPath: clipFor(el, tile), duration: 0.32, ease: "power3.inOut", delay: 0.06, onComplete: done });
    });
  };

  // Esc cierra el portal; «/» lleva al buscador.
  const closeRef = useRef(closePortal);
  closeRef.current = closePortal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape" && openId && !typing) {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // Buscar entre todas las pantallas que puede abrir, incluidas las de cada portal.
  const allScreens = useMemo(() => {
    const seen = new Set<string>();
    return modules.flatMap((m) =>
      m.cards.filter((c) => !seen.has(c.to) && seen.add(c.to)).map((c) => ({ ...c, module: m })),
    );
  }, [modules]);
  const q = query.trim().toLowerCase();
  const matches = q ? allScreens.filter((s) => `${s.title} ${s.module.label} ${s.text}`.toLowerCase().includes(q)) : [];
  const current = Math.min(hit, Math.max(0, matches.length - 1));

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      setHit(Math.min(matches.length - 1, current + 1));
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      setHit(Math.max(0, current - 1));
    } else if (e.key === "Enter" && matches[current]) {
      e.preventDefault();
      navigate(matches[current].to);
    } else if (e.key === "Escape") {
      setQuery("");
      e.currentTarget.blur();
    }
  };

  const quick = (m: WallModule): QuickLink[] => {
    if (m.id === "impacto") {
      if (impactoSide === "programa") {
        return [
          { label: "Registrar cifras", to: "/admin/impacto/programa" },
          { label: "Mi catálogo", to: "/admin/impacto/mi-catalogo" },
          { label: "Elegir indicadores", to: "/admin/impacto/elegir" },
        ];
      }
      if (impactoSide === "funcion" || impactoSide === "ambos") {
        return [
          { label: "Nuevo indicador", to: "/admin/impacto/catalogo?nuevo=1" },
          { label: "Mi catálogo", to: "/admin/impacto/catalogo" },
          { label: "Captura", to: "/admin/impacto/captura" },
          { label: "Importar", to: "/admin/impacto/importar" },
          { label: "De los programas", to: "/admin/impacto/programas" },
        ];
      }
    }
    return m.cards.map((c) => ({ label: c.title, to: c.to }));
  };

  // El número de detrás sigue un poco al puntero (solo con ratón y con movimiento).
  const drift = (e: ReactPointerEvent<HTMLElement>, leave = false) => {
    if (e.pointerType !== "mouse" || !finePointer() || reducedMotion()) return;
    const big = e.currentTarget.querySelector(".ln-tile__big");
    if (!big) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = leave ? 0 : ((e.clientX - r.left) / r.width) * -18 + 9;
    const y = leave ? 0 : ((e.clientY - r.top) / r.height) * -12 + 6;
    gsap.to(big, { x, y, duration: 0.5, ease: "power3.out", overwrite: "auto" });
  };

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const chips = compact ? 3 : 4;
  const pendingLive = (to: string) => pending.find((p) => p.to === to && p.count);

  return (
    <div ref={root} className="ln">
      <header className="ln__top" data-anim>
        <Link to="/" className="ln__brand">
          <img src="/logo-udes.svg" alt="UDES" width={86} height={31} />
          <span>Intranet</span>
        </Link>
        <span className="ln__spacer" />
        {tour && (
          <button type="button" className="ln__pill ln__tour" data-tour="launcher-tour" onClick={() => start(tour.id)}>
            <PiloAvatar mood="feliz" size={24} />
            <span>Recorrido guiado</span>
          </button>
        )}
        <span className="ln__who">
          <span aria-hidden="true">{(profile?.full_name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
          <span className="ln__who-name">{profile?.full_name || profile?.email}</span>
        </span>
        <button type="button" className="ln__pill" onClick={() => void signOut().then(() => navigate("/acceso-intranet"))}>
          Salir
        </button>
      </header>

      <section className="ln__hello" data-compact={compact || undefined} aria-label="Saludo">
        <div data-anim>
          <p className="ln__date">{DATE.format(new Date()).replace(/^./, (c) => c.toUpperCase())}</p>
          <h1>Hola{firstName ? `, ${firstName}` : ""}</h1>
          <p className="ln__ask">¿Dónde quiere trabajar hoy?</p>
        </div>
        {compact && (
          <label className="ln__search" data-anim data-tour="launcher-search">
            <Icon name="search" size={18} />
            <span className="sr-only">Buscar dónde trabajar</span>
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-expanded={Boolean(q)}
              aria-controls="ln-hits"
              aria-autocomplete="list"
              aria-activedescendant={matches.length ? `ln-hit-${current}` : undefined}
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHit(0);
                if (openId) closePortal(true);
              }}
              onKeyDown={onSearchKey}
              placeholder="¿Qué quiere hacer? Ej. usuarios, cargar cifras…"
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
        )}
      </section>

      <main className="ln__main">
        <div className="ln__work">
          {q ? (
            matches.length ? (
              <ul id="ln-hits" className="ln__hits" role="listbox" aria-label="Resultados">
                {matches.map((s, i) => (
                  <li key={s.to} id={`ln-hit-${i}`} role="option" aria-selected={i === current}>
                    <Link to={s.to} tabIndex={-1} style={{ "--k": s.module.color } as CSSProperties} onMouseEnter={() => setHit(i)}>
                      <i aria-hidden="true">
                        <Icon name={s.module.icon} size={17} />
                      </i>
                      <span>{s.title}</span>
                      <small>{s.module.label}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p id="ln-hits" className="ln__none" role="status">
                Nada con «{query}». Pruebe con otra palabra.
              </p>
            )
          ) : modules.length === 0 ? (
            <p className="ln__none" data-anim>
              Todavía no tiene módulos asignados. Pida a la administración de la intranet que le dé acceso o que lo ubique en su
              unidad.
            </p>
          ) : (
            <div className="ln__area">
              <div ref={wallRef} className="ln-wall" data-compact={compact || undefined} data-tour="launcher-modules" aria-hidden={openId ? true : undefined}>
                {modules.map((m, i) => {
                  const portal = m.cards.length > 1;
                  const links = quick(m);
                  const big = m.live?.count ?? m.cards.length;
                  const span = spans[i];
                  const name = portal ? `Abrir el portal de ${m.label}, ${m.cards.length} pantallas` : `Ir a ${m.label}`;
                  return (
                    <article
                      key={m.id}
                      ref={(el) => void (el ? tiles.current.set(m.id, el) : tiles.current.delete(m.id))}
                      className="ln-tile"
                      data-anim
                      data-rows={span.rows}
                      data-lead={i === 0 && modules.length > 2 ? true : undefined}
                      style={{ "--k": m.color, "--span": span.col, "--span-md": span.md } as CSSProperties}
                      onPointerMove={(e) => drift(e)}
                      onPointerLeave={(e) => drift(e, true)}
                    >
                      {portal ? (
                        <button
                          type="button"
                          className="ln-tile__go"
                          aria-label={name}
                          aria-expanded={openId === m.id}
                          ref={(el) => void (el ? triggers.current.set(m.id, el) : triggers.current.delete(m.id))}
                          onClick={() => openPortal(m.id)}
                        />
                      ) : (
                        <Link className="ln-tile__go" to={m.cards[0].to} aria-label={name} />
                      )}
                      {portal && (
                        <span className="ln-tile__open" aria-hidden="true">
                          Abrir portal <Icon name="arrow-right" size={14} />
                        </span>
                      )}
                      <span className="ln-tile__big" aria-hidden="true">
                        {big}
                      </span>
                      <span className="ln-tile__tag">
                        {m.live ? "Hoy" : `${m.cards.length} ${m.cards.length === 1 ? "pantalla" : "pantallas"}`}
                      </span>
                      <h2>{m.label}</h2>
                      {m.live && (
                        <p className="ln-tile__stat">
                          <b>{m.live.count}</b> <span>{m.live.unit}</span>
                        </p>
                      )}
                      <p className="ln-tile__text">{m.text}</p>
                      <div className="ln-tile__links">
                        {links.slice(0, chips).map((l, k) => (
                          <Link key={l.to} to={l.to} className={k === 0 ? "is-main" : undefined}>
                            {l.label}
                          </Link>
                        ))}
                        {portal && links.length > chips && (
                          <button type="button" onClick={() => openPortal(m.id)} aria-label={`Ver las ${links.length} pantallas de ${m.label}`}>
                            +{links.length - chips} más
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {open && (
                <section
                  ref={portalRef}
                  className="ln-portal"
                  role="region"
                  aria-labelledby="ln-portal-title"
                  style={{ "--k": open.color } as CSSProperties}
                >
                  <div className="ln-portal__top" data-pv>
                    <button type="button" className="ln-portal__back" onClick={() => closePortal()}>
                      <Icon name="arrow-left" size={16} />
                      Intranet
                    </button>
                    <nav className="ln-portal__crumb" aria-label="Ruta">
                      <span>Intranet</span>
                      <span aria-hidden="true">›</span>
                      <b aria-current="page">{open.label}</b>
                    </nav>
                  </div>
                  <header className="ln-portal__head">
                    <span className="ln-portal__tag" data-pv>
                      {open.cards.length} pantallas
                    </span>
                    <h2 id="ln-portal-title" tabIndex={-1} data-pv>
                      {open.label}
                    </h2>
                    <p data-pv>{open.text}</p>
                    <span className="ln-portal__big" aria-hidden="true">
                      {open.cards.length}
                    </span>
                  </header>
                  {open.sections.map((s) => (
                    <section key={s.title} className="ln-portal__sec" aria-label={s.title}>
                      <h3 data-pv>{s.title}</h3>
                      <div className="ln-portal__grid">
                        {s.cards.map((c) => {
                          const live = pendingLive(c.to);
                          return (
                            <Link key={c.key} to={c.to} className="ln-portal__card" data-pv>
                              <Icon name="arrow-right" size={16} />
                              <strong>{c.title}</strong>
                              {c.text && <span>{c.text}</span>}
                              {live && (
                                <small>
                                  <b>{live.count}</b> {live.unit}
                                </small>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>

        <aside className="ln__side" aria-label="Pendientes y accesos">
          {/* El Portal de Impacto lo ve toda persona con sesión. */}
          <Link to="/impacto" className="ln__portal" data-tour="launcher-portal" data-anim>
            <PiloAvatar mood="idea" size={48} />
            <span>
              <strong>Portal de Impacto</strong>
              <small>La matriz de indicadores, sus vínculos y resultados, por vicerrectoría, facultad y programa.</small>
            </span>
            <Icon name="arrow-right" size={16} />
          </Link>
          {/* Pilo At Work: la entrada la ve toda persona con sesión; en /work se pide el rol si aún no lo tiene. */}
          <Link to="/work" className="ln__portal" data-tour="launcher-work" data-anim>
            <PiloAvatar mood="excelente" size={48} />
            <span>
              <strong>
                Pilo At Work <em className="ln__nuevo">Nuevo</em>
              </strong>
              <small>El agente de IA para el trabajo de su oficina: redactar, ordenar el correo y preparar reuniones.</small>
            </span>
            <Icon name="arrow-right" size={16} />
          </Link>
          {pending.length > 0 && (
            <section className="ln__pending" aria-labelledby="ln-pending-title" data-anim>
              <h2 id="ln-pending-title">
                <span>Pendientes</span>
                <span className="ln__count">{pending.length}</span>
              </h2>
              <ul>
                {pending.map((p) => (
                  <li key={p.label}>
                    <i aria-hidden="true" />
                    <span>{p.label}</span>
                    <Link to={p.to} aria-label={`Ir: ${p.label}`}>
                      Ir
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tour && tourOffer && isDone(tour.id) === false && !active && (
            <section className="ln__pilo" aria-label="Mr. Pilo" data-anim>
              <PiloAvatar mood="feliz" size={52} alive />
              <div>
                <strong>Es su primera vez aquí. ¿Le muestro cómo funciona?</strong>
                <span>Un recorrido corto por lo que usted usa. Lo puede repetir cuando quiera.</span>
              </div>
              <button type="button" className="ln__pilo-go" onClick={() => start(tour.id)}>
                Empezar el recorrido
              </button>
              <button type="button" className="ln__pilo-no" onClick={() => setTourOffer(false)}>
                Ahora no
              </button>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}

/** El recorte que deja ver solo la caja del cartel, en coordenadas del portal. */
function clipFor(el: HTMLElement, tile: HTMLElement): string {
  const p = el.getBoundingClientRect();
  const t = tile.getBoundingClientRect();
  const px = (v: number) => `${Math.max(0, Math.round(v))}px`;
  return `inset(${px(t.top - p.top)} ${px(p.right - t.right)} ${px(p.bottom - t.bottom)} ${px(t.left - p.left)} round 6px)`;
}

/* --- Lo pendiente: Impacto y el recolector de noticias -------------------------------- */

export interface Pending {
  label: string;
  to: string;
  module: ModuleId;
  /** La cifra viva del cartel, si la hay. */
  count?: number;
  unit?: string;
}

/**
 * Pocas consultas y livianas, con los permisos de quien mira (RLS). Si una
 * parte falla (una migración sin aplicar), esa parte simplemente no aparece.
 */
function usePending(side: ReturnType<typeof useAuth>["impactoSide"], news: boolean) {
  const lastYear = Math.min(new Date().getFullYear() - 1, 2028);
  const query = useQuery({
    queryKey: ["lanzador", "pendientes", side, news, lastYear],
    enabled: Boolean(side) || news,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Pending[]> => {
      const out: Pending[] = [];
      const part = async (fn: () => Promise<void>) => {
        try {
          await fn();
        } catch {
          /* sin esta parte */
        }
      };
      if (side === "programa" || side === "ambos") {
        await part(async () => {
          const { data } = await supabase.from("imp_adoptions").select("id,baseline_text,target_2026").eq("active", true);
          const rows = (data ?? []) as { baseline_text: string; target_2026: string }[];
          const noTargets = rows.filter((r) => !r.baseline_text || !r.target_2026).length;
          if (!rows.length) out.push({ label: "Todavía no sigue indicadores: Mr. Pilo le ayuda a elegir", to: "/admin/impacto/mi-catalogo", module: "impacto" });
          else if (noTargets)
            out.push({ label: `Línea base o meta 2026 de ${noTargets} indicadores`, to: "/admin/impacto/programa", module: "impacto", count: noTargets, unit: "indicadores sin línea base o meta" });
        });
      }
      if (side === "funcion" || side === "ambos") {
        await part(async () => {
          const [{ data: fichas }, { data: values }] = await Promise.all([
            supabase.from("imp_indicators").select("id").is("program_id", null).eq("status", "publicado"),
            supabase.from("imp_values").select("indicator_id").eq("year", lastYear).is("program_id", null),
          ]);
          const withValue = new Set(((values ?? []) as { indicator_id: string }[]).map((v) => v.indicator_id));
          const missing = ((fichas ?? []) as { id: string }[]).filter((f) => !withValue.has(f.id)).length;
          if (missing)
            out.push({ label: `${missing} fichas sin cifra global de ${lastYear}`, to: "/admin/impacto/captura", module: "impacto", count: missing, unit: `fichas sin cifra de ${lastYear}` });
          const { data: drafts } = await supabase.from("imp_indicators").select("id").is("program_id", null).eq("status", "borrador");
          const n = (drafts ?? []).length;
          if (n) out.push({ label: `${n} fichas en borrador sin publicar`, to: "/admin/impacto/catalogo", module: "impacto", count: n, unit: "fichas en borrador" });
        });
      }
      if (news) {
        await part(async () => {
          const { count, error } = await supabase.from("news_items" as never).select("id", { count: "exact", head: true }).eq("state", "pending");
          if (!error && count)
            out.push({ label: `${count} noticias por revisar en el recolector`, to: "/admin/rankings/noticias", module: "rankings", count, unit: "noticias por revisar" });
        });
      }
      return out;
    },
  });
  return query.data ?? NONE;
}
const NONE: Pending[] = [];

/**
 * Internacionalización: si la persona es Director (int_yo) y lo que la espera
 * en el periodo abierto más reciente (validado → aprobar; enviado → validar su
 * campus). Sin la migración 0151, nada.
 */
function useIntl(enabled: boolean): { director: boolean; pending: Pending | null } {
  const query = useQuery({
    queryKey: ["lanzador", "internacionalizacion"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ director: boolean; pending: Pending | null }> => {
      try {
        const { data: yo, error } = await supabase.rpc("int_yo" as never);
        if (error || !yo) return { director: false, pending: null };
        const me = yo as unknown as Yo;
        const { data: periodos } = await supabase.from("int_periodos" as never).select("id,codigo,estado");
        const rows = ((periodos ?? []) as { id: string; codigo: string; estado: string }[]).sort((a, b) => b.codigo.localeCompare(a.codigo));
        const periodo = rows.find((p) => p.estado === "abierto") ?? rows[0];
        if (!periodo) return { director: me.director, pending: null };
        const { data: envios } = await supabase.from("int_envios" as never).select("campus_id,estado").eq("periodo_id", periodo.id);
        const p = pendientesDe(me, (envios ?? []) as { campus_id: string; estado: "borrador" | "enviado" | "validado" | "aprobado" }[]);
        // Sin ?periodo: Tablas abre el mismo periodo, y así la tarjeta del portal lleva la cifra.
        const to = "/admin/internacionalizacion/tablas";
        return {
          director: me.director,
          pending: p.total ? { label: `${p.total} ${p.unidad} en Internacionalización (${periodo.codigo})`, to, module: "internacionalizacion", count: p.total, unit: p.unidad } : null,
        };
      } catch {
        return { director: false, pending: null };
      }
    },
  });
  return query.data ?? NO_INTL;
}
const NO_INTL = { director: false, pending: null };

/** Los informes del periodo vigente de UDES en Cifras que esta persona alcanza. */
function useCifrasReports(enabled: boolean, canSeeReport: (slug: string) => boolean) {
  const query = useQuery({
    queryKey: ["lanzador", "informes"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ slug: string; name: string }[]> => {
      try {
        const { data: period } = await supabase.from("od_periods").select("id").eq("is_current", true).maybeSingle();
        const id = (period as { id: string } | null)?.id;
        if (!id) return [];
        const { data } = await supabase.from("od_reports").select("slug,name,position").eq("period_id", id).order("position");
        return ((data ?? []) as { slug: string; name: string }[]).map(({ slug, name }) => ({ slug, name }));
      } catch {
        return [];
      }
    },
  });
  return useMemo(() => (query.data ?? []).filter((r) => canSeeReport(r.slug)), [query.data, canSeeReport]);
}
