/* =============================================================================
   Barra superior unificada de los portales de Planeación.

   Una sola barra para el portal de Planeación, el PDI, UDES en Cifras y el
   Observatorio. Plan de Desarrollo, UDES en Cifras y Observatorio abren el
   menú ampliado (MegaPanel): con el cursor (con una pequeña espera, para no
   abrirse al cruzar la barra), con clic o con teclado (Enter/Espacio). Escape
   lo cierra y devuelve el foco al botón; cambiar de página también.

   El último sitio de la barra es una puerta o una persona: sin sesión lleva a
   la intranet, con sesión abre lo que solo esa persona puede abrir.

   En móvil (< 1180 px) todo va en un cajón con acordeón.
   ========================================================================== */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { SessionMenu } from "./SessionMenu";
import { useIntranetLinks } from "./intranet-links";
import type { PortalId } from "./MegaPanel";
import "./site-header.css";

const MegaPanel = lazy(() => import("./MegaPanel"));

const PORTALS: { id: PortalId; label: string; match: (path: string) => boolean }[] = [
  { id: "pdi", label: "Plan de Desarrollo", match: (p) => /^\/(pdi|implementacion|tablero|facultades|campus|ods|desarrollo-tecnologico)/.test(p) },
  { id: "cifras", label: "UDES en Cifras", match: (p) => p.startsWith("/datos-abiertos") && !p.startsWith("/datos-abiertos/observatorio") && !p.startsWith("/datos-abiertos/boletines") },
  { id: "observatorio", label: "Observatorio", match: (p) => p.startsWith("/datos-abiertos/observatorio") },
];

/* Abrir al pasar el cursor pide intención, no un roce. Cruzar la barra para
   llegar al buscador pasa por encima de tres botones; con la espera corta de
   antes, los tres panales se asomaban y se iban, y eso es lo que se veía feo.
   260 ms es más que un barrido y menos que una duda. */
const OPEN_DELAY = 260;
/* Cambiar de portal con uno ya abierto tampoco es instantáneo: si lo fuera,
   recorrer la barra encendería todos los paneles de camino. */
const SWITCH_DELAY = 90;
const CLOSE_DELAY = 220;

export function SiteHeader({ onSearch }: { onSearch?: () => void }) {
  const [open, setOpen] = useState<PortalId | null>(null);
  const [mobile, setMobile] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const { resolved, toggle } = useTheme();
  const { profile } = useAuth();
  const intranet = useIntranetLinks();
  const location = useLocation();
  const navigate = useNavigate();
  const header = useRef<HTMLElement>(null);
  const buttons = useRef<Partial<Record<PortalId, HTMLButtonElement | null>>>({});
  const timer = useRef<number>();
  /** Qué portal está esperando para abrirse. Sirve para cancelarlo al salir. */
  const pending = useRef<PortalId | null>(null);
  const finePointer = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const show = (id: PortalId | null) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    if (id) setEverOpened(true);
    setOpen(id);
  };
  const later = (id: PortalId | null, delay: number) => {
    window.clearTimeout(timer.current);
    pending.current = id;
    timer.current = window.setTimeout(() => show(id), delay);
  };
  /** Salir del botón antes de que se cumpla la espera cancela la apertura. */
  const abandon = (id: PortalId) => {
    if (pending.current !== id) return;
    window.clearTimeout(timer.current);
    pending.current = null;
  };

  // Cambiar de página cierra todo.
  useEffect(() => {
    show(null);
    setMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.hash]);

  // Escape y clic fuera.
  useEffect(() => {
    if (!open && !mobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (open) {
        const back = buttons.current[open];
        show(null);
        back?.focus();
      }
      if (mobile) setMobile(false);
    };
    const onDown = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        show(null);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mobile]);

  // Ctrl/Cmd + K: al buscador de la portada.
  const search = () => {
    show(null);
    setMobile(false);
    if (onSearch) onSearch();
    else navigate("/#buscar");
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const close = () => {
    show(null);
    setMobile(false);
  };

  return (
    <header ref={header} className="sh" data-open={open ?? undefined} onPointerLeave={() => finePointer && open && later(null, CLOSE_DELAY)} onPointerEnter={() => window.clearTimeout(timer.current)}>
      <div className="sh-bar">
        <Link className="sh-brand" to="/" aria-label="Planeación Institucional, inicio">
          <img src="/logo-udes.svg" alt="" width={95} height={34} decoding="async" />
          <span>
            <strong>Planeación Institucional</strong>
            <small>Universidad de Santander</small>
          </span>
        </Link>

        <nav className="sh-nav" aria-label="Principal">
          <NavLink to="/equipo" className="sh-nav__link">
            La oficina
          </NavLink>
          {PORTALS.map((p) => {
            const current = p.match(location.pathname);
            return (
              <button
                key={p.id}
                ref={(el) => {
                  buttons.current[p.id] = el;
                }}
                type="button"
                className="sh-nav__link sh-nav__menu"
                aria-expanded={open === p.id}
                aria-controls="sh-panel"
                data-current={current || undefined}
                onPointerEnter={() => finePointer && later(p.id, open ? SWITCH_DELAY : OPEN_DELAY)}
                onPointerLeave={() => finePointer && abandon(p.id)}
                onClick={() => show(open === p.id ? null : p.id)}
              >
                {p.label}
                <Icon name="chevron-down" size={14} />
              </button>
            );
          })}
          <NavLink to="/datos-abiertos/boletines" className="sh-nav__link">
            Boletines
          </NavLink>
          <NavLink to="/documentos" className="sh-nav__link">
            Documentos
          </NavLink>
          {/* Impacto Institucional pide sesión: sin ella, la entrada no existe. */}
          {profile && (
            <NavLink to="/impacto" className="sh-nav__link">
              Impacto
            </NavLink>
          )}
        </nav>

        <div className="sh-tools">
          <button type="button" className="sh-icon" onClick={search} aria-label="Buscar (Ctrl + K)" title="Buscar (Ctrl + K)">
            <Icon name="search" size={18} />
          </button>
          <button type="button" className="sh-icon" onClick={toggle} aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}>
            <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
          </button>
          <SessionMenu />
          <button
            type="button"
            className="sh-icon sh-menu-toggle"
            aria-expanded={mobile}
            aria-controls="sh-mobile"
            aria-label={mobile ? "Cerrar el menú" : "Abrir el menú"}
            onClick={() => {
              setMobile((m) => !m);
              setEverOpened(true);
            }}
          >
            <Icon name={mobile ? "close" : "menu"} size={18} />
          </button>
        </div>
      </div>

      {open && (
        <div id="sh-panel" className="sh-panel" role="region" aria-label={`Menú de ${PORTALS.find((p) => p.id === open)?.label}`}>
          <Suspense fallback={<div className="sh-panel__loading">Cargando el menú…</div>}>
            <MegaPanel portal={open} setPortal={(p) => show(p)} onNavigate={close} mode="desktop" />
          </Suspense>
        </div>
      )}
      {/* El velo está dentro de la barra: salir del panel hacia él también lo cierra. */}
      {open && <div className="sh-scrim" aria-hidden="true" onPointerDown={() => show(null)} onPointerEnter={() => finePointer && later(null, CLOSE_DELAY)} />}

      {mobile && (
        <div id="sh-mobile" className="sh-mobile">
          <Suspense fallback={<div className="sh-panel__loading">Cargando el menú…</div>}>
            {everOpened && <MegaPanel portal="cifras" setPortal={() => undefined} onNavigate={close} mode="mobile" />}
          </Suspense>
          <nav className="sh-mobile__links" aria-label="Más">
            <Link to="/" onClick={close}>
              Inicio · Planeación Institucional
            </Link>
            <Link to="/equipo" onClick={close}>
              La oficina
            </Link>
            <Link to="/datos-abiertos/boletines" onClick={close}>
              Boletines
            </Link>
            <Link to="/documentos" onClick={close}>
              Documentos
            </Link>
            {profile ? (
              <>
                <Link to="/impacto" onClick={close}>
                  Impacto Institucional
                </Link>
                {intranet.links.some((l) => l.screen === "tableros") && (
                  <Link to="/admin/tableros" onClick={close}>
                    Mis Tableros
                  </Link>
                )}
                {intranet.home && (
                  <Link to={intranet.home} onClick={close}>
                    Intranet · {profile.full_name?.trim() || profile.email}
                  </Link>
                )}
              </>
            ) : (
              <Link to="/acceso-intranet" onClick={close}>
                Intranet
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
