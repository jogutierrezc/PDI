/* =============================================================================
   Firma de convenios · piezas compartidas de las páginas públicas: barra blanca del portal,
   ventana de diálogo accesible, código QR, iconos y formatos de fecha.
   ========================================================================== */

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { drawQr } from "../../pilo-app/carnet/qr";
import type { Lengua, Textos } from "./textos";

/* ---------- iconos (SVG propios, trazo de 1.7) ---------- */

const RUTAS: Record<string, ReactNode> = {
  candado: (<><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" /></>),
  pluma: <path d="M13 3.2c-4 .3-7 3-8 7.3L3 13l2.6-1.9C10 10 12.6 7.2 13 3.2zM6 10l4-3.5" />,
  ok: <path d="M3 8.5l3.2 3L13 4.5" />,
  x: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  escudo: (<><path d="M8 2l5 1.8V8c0 2.8-2 4.7-5 6-3-1.3-5-3.2-5-6V3.8z" /><path d="M5.8 8l1.6 1.6L10.3 6.5" /></>),
  movil: (<><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7 12.5h2" /></>),
  flecha: <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />,
  alerta: (<><path d="M8 2.2l6 10.6H2z" /><path d="M8 6.6v3M8 11.4v.1" /></>),
  reloj: (<><circle cx="8" cy="8" r="6" /><path d="M8 4.6V8l2.4 1.4" /></>),
  archivo: (<><path d="M4 1.8h5l3 3V14H4z" /><path d="M9 1.8v3h3" /></>),
  correo: (<><rect x="2" y="3.5" width="12" height="9" rx="1.2" /><path d="M2.4 4.4L8 9l5.6-4.6" /></>),
};

export function Ic({ n, className }: { n: keyof typeof RUTAS | string; className?: string }) {
  return (
    <svg className={`fm-ic${className ? ` ${className}` : ""}`} viewBox="0 0 16 16" aria-hidden="true">
      {RUTAS[n]}
    </svg>
  );
}

/* ---------- formatos ---------- */

export function fechaHora(iso: string | Date | null | undefined, l: Lengua, utc = false): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(l === "es" ? "es-CO" : "en-GB", { dateStyle: "medium", timeStyle: "medium", ...(utc ? { timeZone: "UTC" } : {}) }).format(d) + (utc ? " UTC" : "");
}

export function fechaCorta(iso: string | Date | null | undefined, l: Lengua): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(l === "es" ? "es-CO" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;

export const iniciales = (n: string) =>
  n
    .split(/[\s,.-]+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "··";

/* ---------- lengua guardada ---------- */

export function lenguaInicial(porDefecto: Lengua): Lengua {
  try {
    const g = window.localStorage.getItem("conv-firma-lengua");
    if (g === "es" || g === "en") return g;
  } catch {
    /* sin almacenamiento */
  }
  return porDefecto;
}
export function guardarLengua(l: Lengua) {
  try {
    window.localStorage.setItem("conv-firma-lengua", l);
  } catch {
    /* sin almacenamiento */
  }
}

/* ---------- QR ---------- */

export function Qr({ texto, etiqueta, className }: { texto: string; etiqueta: string; className?: string }) {
  const q = useMemo(() => drawQr(texto), [texto]);
  if (!q.size) return null;
  return (
    <svg className={className} viewBox={`0 0 ${q.size} ${q.size}`} role="img" aria-label={etiqueta} shapeRendering="crispEdges">
      <rect width={q.size} height={q.size} fill="#fff" />
      <path d={q.path} fill="#12253A" />
    </svg>
  );
}

/* ---------- barra blanca del portal ---------- */

export function BarraPortal({ l, t, onLengua, contraparte, vence, children }: { l: Lengua; t: Textos; onLengua: (l: Lengua) => void; contraparte?: string; vence?: string | null; children?: ReactNode }) {
  return (
    <header className="fm-sh">
      <img className="fm-sh__logo" src="/logo-udes.svg" alt="Universidad de Santander" width={140} height={40} />
      <div className="fm-marca">
        <b>{t.servicio}</b>
        <span>{t.universidad}</span>
      </div>
      {contraparte ? (
        <div className="fm-contra" title={t.institucion}>
          <span className="fm-contra__x" aria-hidden="true">×</span>
          <span className="fm-contra__logo" aria-hidden="true">{iniciales(contraparte)}</span>
          <div className="fm-marca fm-marca--sola">
            <b>{contraparte}</b>
            <span>{t.institucion}</span>
          </div>
        </div>
      ) : null}
      <span className="fm-grow" />
      {vence ? (
        <span className="fm-seguro">
          <Ic n="escudo" />
          {t.enlaceSeguro} · {t.vence} {fechaCorta(vence, l)}
        </span>
      ) : null}
      {children}
      <div className="fm-seg" role="group" aria-label={t.idioma}>
        <button type="button" aria-pressed={l === "es"} onClick={() => onLengua("es")}>ES</button>
        <button type="button" aria-pressed={l === "en"} onClick={() => onLengua("en")}>EN</button>
      </div>
    </header>
  );
}

/* ---------- ventana de diálogo ---------- */

const FOCOS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Ventana({ titulo, onCerrar, ancho, pie, children, cerrable = true, etiquetaCerrar }: { titulo: string; onCerrar: () => void; ancho?: boolean; pie?: ReactNode; children: ReactNode; cerrable?: boolean; etiquetaCerrar: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);
  useEffect(() => {
    previo.current = document.activeElement;
    const c = caja.current;
    const primero = c?.querySelector<HTMLElement>("[data-foco]") ?? c?.querySelector<HTMLElement>(FOCOS);
    primero?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cerrable) {
        e.stopPropagation();
        onCerrar();
      }
      if (e.key === "Tab" && c) {
        const f = [...c.querySelectorAll<HTMLElement>(FOCOS)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      if (previo.current instanceof HTMLElement) previo.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);
  return (
    <div className="fm-vel" onMouseDown={(e) => { if (e.target === e.currentTarget && cerrable) onCerrar(); }}>
      <div ref={caja} className={`fm-dlg${ancho ? " fm-dlg--ancho" : ""}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="fm-dh">
          <h2>{titulo}</h2>
          {cerrable ? (
            <button type="button" className="fm-x" aria-label={etiquetaCerrar} onClick={onCerrar}>
              <Ic n="x" />
            </button>
          ) : null}
        </div>
        <div className="fm-db">{children}</div>
        {pie ? <div className="fm-dp">{pie}</div> : null}
      </div>
    </div>
  );
}

/** Pone el título de la pestaña y pide que no se indexe (son páginas con enlaces personales). */
export function usePaginaPrivada(titulo: string) {
  useEffect(() => {
    const previo = document.title;
    document.title = titulo;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previo;
      meta.remove();
    };
  }, [titulo]);
}

export const movimientoReducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function sha256Hex(datos: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
