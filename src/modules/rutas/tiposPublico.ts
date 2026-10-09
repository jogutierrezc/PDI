/* Ruta del bus UDES · los tipos de la página pública.
   Solo ruta, paradas, trazado y horario: nada de estudiantes, flujos ni demanda. */

import type { Horario } from "./horario";
import type { ParadaRuta } from "./tipos";

export interface RutaPublica {
  id: string;
  codigo: string;
  nombre: string;
  /** El trazado por carretera, [lon, lat] en orden. */
  coords: [number, number][];
  /** Metros de cada tramo entre paradas consecutivas. */
  legs: number[];
  /** Segundos que calcula el motor de rutas para un carro, sin paradas. */
  duracionS: number | null;
  stops: ParadaRuta[];
  horario: Horario;
  /** Cuándo se actualizó el horario por última vez (ISO), si se conoce. */
  actualizado: string | null;
}

export interface DatosPublicos {
  ruta: RutaPublica;
  /** Calles de OpenStreetMap codificadas por deltas (vias.json): el respaldo si las teselas no cargan. */
  vias: [number, number[]][];
}

export interface GsapLike {
  to(target: object, vars: Record<string, unknown>): unknown;
  timeline(vars?: Record<string, unknown>): {
    to(t: object, v: Record<string, unknown>, at?: number | string): unknown;
    fromTo(t: object, a: Record<string, unknown>, b: Record<string, unknown>, at?: number | string): unknown;
    progress(p?: number): unknown;
    kill(): unknown;
  };
  killTweensOf(t: object): void;
}

export interface OpcionesPublico {
  /** Pedir las teselas de OpenStreetMap. Falso dibuja solo las calles vectoriales. */
  teselas: boolean;
  /** Logo oficial a color (public/logo-udes.svg), para el tema claro. */
  logoSrc: string;
  /** Logo oficial en blanco (public/boletin/logo-udes-blanco.png), para el tema oscuro. */
  logoOscuroSrc: string;
  /** A dónde lleva el logo (la portada del portal). */
  inicioHref: string;
  /** Si se da, el clic en el logo la llama en vez de recargar la página. */
  alIr?: () => void;
  /** Aclaración del origen de los datos, para mostrar en el pie (por ejemplo, en un prototipo). */
  etiquetaDatos?: string;
  /** Librería de movimiento (GSAP). */
  gsap: GsapLike;
}

export type Modo = "hoja" | "panel" | "partido";
export type PuntoHoja = "asomada" | "media" | "abierta";

export interface EstadoPublico {
  parada: number | null;
  hoja: PuntoHoja;
  pestana: "paradas" | "horario";
  /** Segundos del día de la simulación. */
  hora: number;
  jugando: boolean;
  camara: { cx: number; cy: number; z: number };
  modo: Modo;
}

export interface ApiPublico {
  destruir(): void;
  /** Fuerza una composición (para pruebas y para el simulador de dispositivos); null vuelve a la automática. */
  forzarModo(m: Modo | null): void;
  /** Una foto del estado: lo que debe sobrevivir a plegar y desplegar. */
  estado(): EstadoPublico;
  /** Salta la secuencia de entrada. */
  saltarEntrada(): void;
  /** Elige una parada (índice del recorrido) o ninguna. */
  elegirParada(i: number | null): void;
}
