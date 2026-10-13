/* =============================================================================
   Recolector de noticias · la carga desde udes.edu.co, como servicio de la
   pantalla.

   Vive en RankingsAdmin (no en la lista) para que siga corriendo y no se pierda
   al pasar del tablero a un ranking o al recolector. La función noticias-ods
   procesa una página del listado por llamada (10 notas, ~5 s) y dice dónde
   seguir; aquí se repite la llamada por cada fuente hasta `fin`.
   El `next` de cada fuente y año se guarda en el navegador para «Continuar
   donde quedó».
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NEWS_SOURCES, cargarNoticias } from "./noticias";
import { claveProgreso } from "./recolector-logica";
import type { Progreso } from "./recolector-logica";

/** Tope de seguridad: páginas por fuente (250 × 10 = 2.500 notas del listado). */
export const MAX_VUELTAS = 250;
/** Cada cuántas páginas con notas nuevas se refresca la lista. */
const REFRESCO = 3;
const LLAVE = "rk-noticias-progreso";

export const etiquetaFuente = (clave: string) => NEWS_SOURCES.find((f) => f.key === clave)?.label ?? clave;

export interface EstadoCarga {
  fase: "quieta" | "corriendo" | "deteniendo" | "detenida" | "error" | "terminada";
  year: number;
  fuentes: string[];
  fuente: string | null;
  start: number;
  /** Índice de la fuente actual dentro de `fuentes`. */
  indice: number;
  paginas: number;
  seen: number;
  saved: number;
  skipped: number;
  error: string | null;
  bitacora: string[];
}

const INICIAL: EstadoCarga = {
  fase: "quieta",
  year: 2025,
  fuentes: [],
  fuente: null,
  start: 0,
  indice: 0,
  paginas: 0,
  seen: 0,
  saved: 0,
  skipped: 0,
  error: null,
  bitacora: [],
};

interface ApiCarga {
  estado: EstadoCarga;
  progreso: Progreso;
  /** Empieza: la primera fuente en `start`, las demás en 0. */
  iniciar: (year: number, fuentes: string[], start: number) => void;
  /** Sigue cada fuente desde su `next` guardado; salta las terminadas. */
  continuar: (year: number, fuentes: string[]) => void;
  /** Repite desde donde falló. */
  reintentar: () => void;
  detener: () => void;
  cerrar: () => void;
}

const Contexto = createContext<ApiCarga | null>(null);

function leerProgreso(): Progreso {
  try {
    const v = JSON.parse(localStorage.getItem(LLAVE) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Progreso) : {};
  } catch {
    return {};
  }
}

function guardarProgreso(p: Progreso) {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: solo se pierde «Continuar donde quedó» */
  }
}

const hora = () => new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function CargaProvider({ children }: { children: ReactNode }) {
  const cliente = useQueryClient();
  const [estado, setEstado] = useState<EstadoCarga>(INICIAL);
  const [progreso, setProgreso] = useState<Progreso>(() => (typeof window === "undefined" ? {} : leerProgreso()));
  const detenerRef = useRef(false);
  const corriendoRef = useRef(false);
  const montado = useRef(true);
  /** Dónde retomar tras un error: fuentes y desde dónde sigue cada una. */
  const retomar = useRef<{ year: number; fuentes: string[]; starts: Record<string, number> } | null>(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      detenerRef.current = true;
    };
  }, []);

  const set = useCallback((f: (e: EstadoCarga) => EstadoCarga) => {
    if (montado.current) setEstado(f);
  }, []);
  const anotar = useCallback(
    (linea: string) => set((e) => ({ ...e, bitacora: [...e.bitacora.slice(-149), `${hora()}  ${linea}`] })),
    [set],
  );
  const marcar = useCallback((fuente: string, year: number, next: number) => {
    setProgreso((p) => {
      const n = { ...p, [claveProgreso(fuente, year)]: next };
      guardarProgreso(n);
      return n;
    });
  }, []);

  const recorrer = useCallback(
    async (year: number, fuentes: string[], starts: Record<string, number>) => {
      if (corriendoRef.current || !fuentes.length) return;
      corriendoRef.current = true;
      detenerRef.current = false;
      retomar.current = null;
      set((e) => ({ ...INICIAL, bitacora: e.bitacora, fase: "corriendo", year, fuentes }));
      anotar(`Empieza la búsqueda de ${year}: ${fuentes.map(etiquetaFuente).join(", ")}.`);

      let i = 0;
      let start = 0;
      let conNuevas = 0;
      try {
        for (i = 0; i < fuentes.length; i++) {
          const fuente = fuentes[i];
          start = starts[fuente] ?? 0;
          set((e) => ({ ...e, fuente, start, indice: i }));
          let vueltas = 0;
          for (;;) {
            if (detenerRef.current) {
              anotar(`Detenida en ${etiquetaFuente(fuente)}, posición ${start}.`);
              retomar.current = { year, fuentes: fuentes.slice(i), starts: { ...starts, [fuente]: start } };
              set((e) => ({ ...e, fase: "detenida" }));
              return;
            }
            if (vueltas >= MAX_VUELTAS) {
              anotar(`${etiquetaFuente(fuente)}: tope de ${MAX_VUELTAS} páginas; sigue con la siguiente fuente.`);
              break;
            }
            set((e) => ({ ...e, start }));
            const r = await cargarNoticias(fuente, start, year);
            if (r.ok === false) throw new Error(r.error ?? "La función no pudo leer esta página.");
            vueltas++;
            set((e) => ({ ...e, paginas: e.paginas + 1, seen: e.seen + r.seen, saved: e.saved + r.saved, skipped: e.skipped + r.skipped }));
            anotar(
              `${etiquetaFuente(fuente)} · ${start}: ${r.seen} vistas, ${r.saved} guardadas, ${r.skipped} descartadas por el sistema.`,
            );
            if (r.saved > 0 && ++conNuevas % REFRESCO === 0) void cliente.invalidateQueries({ queryKey: ["noticias", "intranet"] });
            if (r.fin) {
              marcar(fuente, year, -1);
              anotar(`${etiquetaFuente(fuente)}: terminó.`);
              break;
            }
            start = r.next > start ? r.next : start + 10;
            marcar(fuente, year, start);
          }
        }
        anotar("Búsqueda terminada.");
        set((e) => ({ ...e, fase: "terminada", fuente: null }));
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        const fuente = fuentes[i];
        anotar(`Error en ${etiquetaFuente(fuente)}, posición ${start}: ${mensaje}`);
        retomar.current = { year, fuentes: fuentes.slice(i), starts: { ...starts, [fuente]: start } };
        set((e) => ({ ...e, fase: "error", error: mensaje }));
      } finally {
        corriendoRef.current = false;
        void cliente.invalidateQueries({ queryKey: ["noticias"] });
      }
    },
    [anotar, cliente, marcar, set],
  );

  const api = useMemo<ApiCarga>(
    () => ({
      estado,
      progreso,
      iniciar: (year, fuentes, start) =>
        void recorrer(year, fuentes, fuentes.length ? { [fuentes[0]]: Math.max(0, Math.floor(start) || 0) } : {}),
      continuar: (year, fuentes) => {
        const quedan = fuentes.filter((f) => progreso[claveProgreso(f, year)] !== -1);
        const starts: Record<string, number> = {};
        for (const f of quedan) starts[f] = Math.max(0, progreso[claveProgreso(f, year)] ?? 0);
        void recorrer(year, quedan, starts);
      },
      reintentar: () => {
        const r = retomar.current;
        if (r) void recorrer(r.year, r.fuentes, r.starts);
      },
      detener: () => {
        if (!corriendoRef.current) return;
        detenerRef.current = true;
        setEstado((e) => ({ ...e, fase: "deteniendo" }));
      },
      cerrar: () => setEstado((e) => ({ ...INICIAL, bitacora: e.bitacora })),
    }),
    [estado, progreso, recorrer],
  );

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useCarga(): ApiCarga {
  const c = useContext(Contexto);
  if (!c) throw new Error("useCarga debe usarse dentro de <CargaProvider>");
  return c;
}

/** La barra compacta de progreso: fija bajo la franja mientras hay algo que contar. */
export function BarraCarga() {
  const { estado, detener, reintentar, cerrar } = useCarga();
  if (estado.fase === "quieta") return null;
  const corriendo = estado.fase === "corriendo" || estado.fase === "deteniendo";
  const fuente = estado.fuente ? etiquetaFuente(estado.fuente) : "";
  return (
    <div className={`rk-progress rk-progress--${estado.fase}`} role="status" aria-live="polite">
      <span className="rk-progress__what">
        {estado.fase === "corriendo" && (
          <>
            Buscando en <b>{fuente}</b> ({estado.indice + 1}/{estado.fuentes.length}) · posición{" "}
            <span className="rk-num">{estado.start}</span>
          </>
        )}
        {estado.fase === "deteniendo" && <>Deteniendo: termina la página en curso…</>}
        {estado.fase === "detenida" && <>Búsqueda detenida en {fuente}.</>}
        {estado.fase === "terminada" && <>Búsqueda terminada.</>}
        {estado.fase === "error" && (
          <>
            <b>Error en {fuente}:</b> {estado.error}
          </>
        )}
      </span>
      <span className="rk-progress__nums rk-num">
        {estado.paginas} {estado.paginas === 1 ? "página" : "páginas"} · {estado.saved} guardadas · {estado.skipped} descartadas por el
        sistema
      </span>
      <span className="rk-progress__acts">
        {corriendo ? (
          <button type="button" className="button-secondary rk-sm" onClick={detener} disabled={estado.fase === "deteniendo"}>
            Detener
          </button>
        ) : (
          <>
            {(estado.fase === "error" || estado.fase === "detenida") && (
              <button type="button" className="button-secondary rk-sm" onClick={reintentar}>
                {estado.fase === "error" ? "Reintentar" : "Continuar"}
              </button>
            )}
            <button type="button" className="button-ghost rk-sm" onClick={cerrar}>
              Cerrar
            </button>
          </>
        )}
      </span>
    </div>
  );
}
