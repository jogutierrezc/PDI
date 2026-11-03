/* =============================================================================
   Observatorio público · el tablero (rediseño).

   Todos los temas se dibujan igual: color sólido (o foto con degradado del
   color del tablero), código grande, icono como marca de agua y el nombre
   abajo a la izquierda. Sin recuadros, sin chips, sin resúmenes.

   Con foto, el color sube desde abajo y baja desde arriba y el centro deja ver
   la imagen: --g (intensidad), --reach (alcance) y --px/--py (encuadre).

   Este archivo también lo usa el panel de administración (vista previa en vivo
   del tablero), por eso no importa nada del portal más que los tipos del
   catálogo. El color de cada tablero viene de los datos (obs_topics.color):
   aquí solo está la paleta de respaldo cuando el tema no tiene uno.
   ========================================================================== */

import type { CSSProperties, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import type { TemaPublico } from "./catalogo";

/* --- Iconos y colores ----------------------------------------------------------------- */

export const ICONOS_TABLERO = ["spark-chart", "compass", "layers", "chart", "users", "library", "shield", "table", "leaf", "community", "columns-view", "tiles"] as const;
const CONJUNTO_ICONOS = new Set<string>(ICONOS_TABLERO);
export const obsIcono = (n: string) => (CONJUNTO_ICONOS.has(n) ? (n as IconName) : ("spark-chart" as IconName));

/** Los catorce colores de la paleta del rediseño (el administrador puede elegir otro libre). */
export const PALETA_TABLERO = ["#C5192D", "#E5243B", "#DDA63A", "#4C9F38", "#FF3A21", "#26BDE2", "#FCC30B", "#A21942", "#FD6925", "#DD1367", "#FD9D24", "#3F7E44", "#0A97D9", "#0B3FA8"] as const;

/** Colores de línea (tokens.css) para temas que aún guardan `var(--od-line-N)`. */
const LINEAS: Record<string, string> = {
  "1": "#1f5fbf", "2": "#0b7481", "3": "#a4471f", "4": "#6b3fa0", "5": "#7f6200", "6": "#ad2f58",
  "7": "#43536b", "8": "#2e6b2f", "9": "#8a3b8f", "10": "#1a6b5a", "11": "#7a4a2b",
};

/** Respaldo por tema: color (índice de la paleta) e icono, los del prototipo aprobado. */
const DEFECTOS: Record<string, [number, (typeof ICONOS_TABLERO)[number]]> = {
  "presentacion-institucional": [13, "library"],
  "oferta-academica": [2, "layers"],
  "alertas-tempranas": [4, "compass"],
  "poblacion-estudiantil": [5, "users"],
  profesores: [3, "community"],
  "diversidad-equidad-inclusion": [9, "columns-view"],
  "valor-agregado": [12, "chart"],
  "vinculacion-laboral": [10, "table"],
  "desercion-academica": [7, "shield"],
  internacionalizacion: [1, "leaf"],
  "caracterizacion-estudiante": [8, "tiles"],
  "calidad-institucional": [11, "spark-chart"],
  "factores-rendimiento": [0, "compass"],
  "seguimiento-graduados": [6, "chart"],
};

const hashSlug = (slug: string) => [...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function defectoDe(slug: string): { color: string; icono: IconName } {
  const d = DEFECTOS[slug];
  const i = d ? d[0] : hashSlug(slug) % PALETA_TABLERO.length;
  return { color: PALETA_TABLERO[i], icono: d ? d[1] : ICONOS_TABLERO[hashSlug(slug) % ICONOS_TABLERO.length] };
}

/** El color del tablero como hex: el del tema, el de su línea o el de respaldo. */
export function colorTablero(color: string | null | undefined, slug: string): string {
  const c = (color ?? "").trim();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) return c.slice(0, 7);
  const l = /^var\(--od-line-(\d+)\)$/.exec(c);
  if (l && LINEAS[l[1]]) return LINEAS[l[1]];
  return defectoDe(slug).color;
}

const lin = (v: number) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
/** Texto claro u oscuro según la luminancia del color. */
export function tintaSobre(hex: string): "dark" | "light" {
  const n = parseInt(hex.slice(1, 7), 16);
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? "dark" : "light";
}

/* --- Datos de un tablero ------------------------------------------------------------------ */

export interface DatosTablero {
  slug: string;
  code: string;
  name: string;
  /** Hex ya resuelto. */
  color: string;
  icono: IconName;
  imagenUrl: string | null;
  degradado: number;
  alcance: number;
  encuadreX: number;
  encuadreY: number;
}

export function datosTablero(t: Pick<TemaPublico, "slug" | "code" | "name" | "color" | "icono" | "imagenUrl" | "degradado" | "alcance" | "encuadreX" | "encuadreY">): DatosTablero {
  return {
    slug: t.slug,
    code: t.code,
    name: t.name,
    color: colorTablero(t.color, t.slug),
    icono: t.icono ? obsIcono(t.icono) : defectoDe(t.slug).icono,
    imagenUrl: t.imagenUrl,
    degradado: t.degradado,
    alcance: t.alcance,
    encuadreX: t.encuadreX,
    encuadreY: t.encuadreY,
  };
}

/** Las variables que el CSS lee de un tablero (tile, cartel y pie). */
export function varsTablero(d: DatosTablero): CSSProperties {
  return {
    "--c": d.color,
    "--g": d.degradado,
    "--reach": d.alcance,
    "--px": d.encuadreX,
    "--py": d.encuadreY,
  } as CSSProperties;
}

export const urlCss = (u: string) => `url(${JSON.stringify(u)})`;

/* --- El tablero ----------------------------------------------------------------------------- */

export interface TamanoTablero {
  w: number;
  h: number;
  /** En móvil (dos columnas). */
  wm: number;
  hm: number;
}

interface TableroProps {
  d: DatosTablero;
  /** Con destino, es un enlace; sin él (vista previa del panel), un bloque. */
  to?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  tamano?: TamanoTablero;
  /** Rótulo de acceso para lectores de pantalla (la pregunta del tema, por ejemplo). */
  descripcion?: string;
}

export function TableroVista({ d, to, onClick, tamano, descripcion }: TableroProps) {
  const style = { ...varsTablero(d), ...(tamano ? { "--w": tamano.w, "--h": tamano.h, "--wm": tamano.wm, "--hm": tamano.hm } : {}) } as CSSProperties;
  const contenido = (
    <>
      {d.imagenUrl && (
        <>
          <span className="obsr-pic" style={{ backgroundImage: urlCss(d.imagenUrl) }} aria-hidden="true" />
          <span className="obsr-shade" aria-hidden="true" />
        </>
      )}
      <span className="obsr-num" aria-hidden="true">{d.code}</span>
      <span className="obsr-water" aria-hidden="true"><Icon name={d.icono} size={240} /></span>
      <strong className="obsr-name">{d.name}</strong>
      {to && (
        <span className="obsr-go" aria-hidden="true">
          <Icon name="arrow-right" size={16} />
        </span>
      )}
    </>
  );
  const comunes = { className: "obsr-tile", style, "data-ink": tintaSobre(d.color), "data-photo": d.imagenUrl ? "1" : "0" } as const;
  return to ? (
    <Link {...comunes} to={to} onClick={onClick} aria-label={descripcion ? `${d.name}. ${descripcion}` : d.name}>
      {contenido}
    </Link>
  ) : (
    <div {...comunes} role="img" aria-label={`Vista previa del tablero ${d.name}`}>
      {contenido}
    </div>
  );
}

/* --- Titulares por palabras enmascaradas ----------------------------------------------------- */

/** Cada palabra en su máscara; el texto completo debe ir en el aria-label del titular. */
export function Palabras({ text }: { text: string }) {
  const palabras = text.split(" ");
  return (
    <>
      {palabras.map((w, i) => (
        <span key={i}>
          <span className="obsr-mask" aria-hidden="true">
            <span className="obsr-w">{w}</span>
          </span>
          {i < palabras.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/* --- Tamaños del mosaico: 12 columnas, sin huecos, para cualquier número de temas ---------- */

/**
 * Reglas: el primer tablero lleva la fila destacada (8 + 4 columnas, tres filas de alto) y el resto se
 * reparte en filas de 3 o 4 tableros del mismo alto (dos filas), repartidas parejo: 3 → 4/4/4 (cada
 * fila impar, 5/4/3), 4 → 3/3/3/3, 2 → 6/6 y 1 → 12. Cada fila suma 12, así que no quedan huecos.
 * En móvil (dos columnas) el primero ocupa el ancho; si sobra uno al final, también.
 */
export function tamanosMosaico(n: number): TamanoTablero[] {
  const out: TamanoTablero[] = [];
  if (n <= 0) return out;
  const movil = (i: number) => ({ wm: i === 0 || (i === n - 1 && (n - 1) % 2 === 1) ? 2 : 1, hm: i === 0 ? 2 : 1 });
  if (n === 1) return [{ w: 12, h: 3, wm: 2, hm: 2 }];
  out.push({ w: 8, h: 3, ...movil(0) }, { w: 4, h: 3, ...movil(1) });
  let resto = n - 2;
  const filas = Math.ceil(resto / 4);
  for (let f = 0; f < filas; f++) {
    const cuantos = Math.floor(resto / (filas - f)) + (resto % (filas - f) ? 1 : 0);
    const anchos = cuantos === 4 ? [3, 3, 3, 3] : cuantos === 3 ? (f % 2 ? [5, 4, 3] : [4, 4, 4]) : cuantos === 2 ? [6, 6] : [12];
    for (const w of anchos) out.push({ w, h: 2, ...movil(out.length) });
    resto -= cuantos;
  }
  return out;
}
