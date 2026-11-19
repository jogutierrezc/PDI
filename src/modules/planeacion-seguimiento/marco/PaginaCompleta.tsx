/* =============================================================================
   Planeación y Seguimiento · PaginaCompleta (el marco de toda pantalla que antes
   habría sido una ventana emergente).

   Regla del módulo: NO hay modales, cajones laterales ni diálogos. Un detalle, un
   formulario, un asistente o una confirmación importante es una PÁGINA con ruta
   propia: se abre a pantalla completa, tiene botón «Regresar» (el historial del
   navegador también sirve), el foco va al título al entrar y, al volver, la lista
   conserva sus filtros y su posición.

   Estructura: barra superior fija (Regresar + migas) · título y subtítulo ·
   acciones · contenido · pie de acciones (fijo al borde inferior en móvil).
   ========================================================================== */

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";

/** Dentro de la cabecera de la intranet (que ya lleva el h1) el título de la página es un h2. */
export const TituloComoH2 = createContext(false);

export interface Miga {
  texto: string;
  /** Ruta; sin ella es la página actual. */
  a?: string;
}

/**
 * «Regresar»: vuelve a la pantalla anterior del propio módulo si el historial la tiene (conserva filtros y posición);
 * si la persona llegó directo a esta dirección, va a `alternativa`.
 */
export function useRegresar(alternativa: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0 && (location.state as { desdeModulo?: boolean } | null)?.desdeModulo) navigate(-1);
    else navigate(alternativa, { replace: true });
  };
}

/** Estado que se pasa al navegar entre pantallas del módulo para que «Regresar» use el historial. */
export const DESDE_MODULO = { desdeModulo: true } as const;

/** Recuerda el desplazamiento de cada ruta: al volver con «Regresar» la lista queda donde estaba; al entrar a otra, arriba. */
export function useScrollPorRuta() {
  const location = useLocation();
  const tipo = useNavigationType();
  useEffect(() => {
    // Se guarda mientras la persona se desplaza (al salir ya sería tarde: la pantalla nueva sube al inicio).
    let pendiente = 0;
    const guardar = () => {
      pendiente = 0;
      try {
        sessionStorage.setItem(`ps:scroll:${location.key}`, String(window.scrollY));
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
    };
    const alDesplazar = () => {
      if (!pendiente) pendiente = window.requestAnimationFrame(guardar);
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      window.removeEventListener("scroll", alDesplazar);
      window.cancelAnimationFrame(pendiente);
    };
  }, [location.key]);
  useLayoutEffect(() => {
    let y = 0;
    if (tipo === "POP") {
      try {
        y = Number(sessionStorage.getItem(`ps:scroll:${location.key}`)) || 0;
      } catch {
        y = 0;
      }
    }
    if (y === 0) {
      window.scrollTo(0, 0);
      return;
    }
    // Los datos pueden llegar después: se reintenta mientras la página no alcance esa altura.
    const intentos = [0, 80, 200, 450, 900];
    const ids = intentos.map((ms) => window.setTimeout(() => window.scrollTo(0, y), ms));
    return () => ids.forEach(window.clearTimeout);
  }, [location.key, tipo]);
}

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  /** Migas de pan: la última es la página actual. */
  migas: Miga[];
  /** A dónde va «Regresar» si no hay historial del módulo. */
  regresarA: string;
  /** Texto del botón; por omisión «Regresar». */
  regresarTexto?: string;
  acciones?: ReactNode;
  /** Pie de acciones (fijo al borde inferior en móvil). */
  pie?: ReactNode;
  /** Cambia cuando hay que devolver el foco al título (por ejemplo, otro paso). */
  claveFoco?: string | number;
  ancho?: "normal" | "angosto";
  children: ReactNode;
}

export function PaginaCompleta({ titulo, subtitulo, migas, regresarA, regresarTexto = "Regresar", acciones, pie, claveFoco, ancho = "normal", children }: Props) {
  const regresar = useRegresar(regresarA);
  const h1 = useRef<HTMLHeadingElement>(null);
  const H = (useContext(TituloComoH2) ? "h2" : "h1") as "h1";
  useEffect(() => {
    // El foco va al título al entrar (sin mover el desplazamiento: eso lo decide useScrollPorRuta).
    h1.current?.focus({ preventScroll: true });
  }, [titulo, claveFoco]);
  return (
    <div className={`ps-pagina ps-pagina--${ancho}`} data-pagina-completa>
      <div className="ps-barra">
        <button type="button" className="ps-regresar" onClick={regresar}>
          <Icon name="arrow-left" size={16} />
          <span>{regresarTexto}</span>
        </button>
        <nav className="ps-migas" aria-label="Dónde está">
          <ol>
            {migas.map((m, i) => (
              <li key={i}>
                {m.a && i < migas.length - 1 ? (
                  <Link to={m.a} state={DESDE_MODULO}>
                    {m.texto}
                  </Link>
                ) : (
                  <span aria-current={i === migas.length - 1 ? "page" : undefined}>{m.texto}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
      <header className="ps-encabezado">
        <div>
          <H ref={h1} tabIndex={-1}>
            {titulo}
          </H>
          {subtitulo ? <p className="ps-sub">{subtitulo}</p> : null}
        </div>
        {acciones ? <div className="ps-acciones-pagina">{acciones}</div> : null}
      </header>
      <div className="ps-contenido">{children}</div>
      {pie ? <div className="ps-pie">{pie}</div> : null}
    </div>
  );
}
