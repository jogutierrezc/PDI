/* =============================================================================
   UDrive · piezas pequeñas: íconos y miniaturas por tipo de archivo, y los
   rótulos con que se nombra cada cosa.
   ========================================================================== */

import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { haceCuanto, textoFilas } from "../../../components/espacio/logica";
import { textoTamano } from "../lib/nombres";
import type { ArchivoRow, TipoItem } from "../tipos";

export type TipoVisual = TipoItem | "carpeta";

const ICONOS: Record<TipoVisual, IconName> = {
  carpeta: "folder",
  tabla: "table",
  grafica: "chart",
  cruce: "link",
  documento: "document",
  archivo: "document",
};

export const NOMBRE_TIPO: Record<TipoVisual, string> = {
  carpeta: "Carpeta",
  tabla: "Tabla",
  grafica: "Gráfica",
  cruce: "Cruce de tablas",
  documento: "Documento",
  archivo: "Archivo",
};

export function IconoItem({ tipo, className = "es-kico" }: { tipo: TipoVisual; className?: string }) {
  return (
    <span className={className} data-k={tipo} style={{ display: "inline-flex" }} aria-hidden="true">
      <Icon name={ICONOS[tipo]} size={18} />
    </span>
  );
}

/** La extensión en mayúsculas para la miniatura de un archivo: «informe.pdf» → «PDF». */
export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nombre);
  return m ? m[1].toUpperCase() : "ARCH";
}

export function Miniatura({ tipo, nombre }: { tipo: Exclude<TipoVisual, "carpeta">; nombre: string }) {
  if (tipo === "archivo") return <span className="ud-ext" aria-hidden="true">{extensionDe(nombre)}</span>;
  if (tipo === "documento") {
    return (
      <svg className="ud-glifo" viewBox="0 0 120 70" aria-hidden="true">
        <rect x="38" y="4" width="44" height="62" rx="3" fill="var(--es-panel)" className="tr" />
        <rect x="44" y="12" width="32" height="6" fill="#2b6cc4" opacity="0.85" />
        {[26, 32, 38, 44].map((y) => <path key={y} d={`M44 ${y}H76`} className="tr" />)}
        <rect x="44" y="50" width="32" height="10" fill="#cde6a8" />
      </svg>
    );
  }
  if (tipo === "tabla") {
    return (
      <svg className="ud-glifo" viewBox="0 0 120 70" aria-hidden="true">
        <rect x="4" y="4" width="112" height="62" rx="4" fill="var(--es-panel)" className="tr" />
        <rect x="4" y="4" width="112" height="14" rx="4" fill="var(--es-panel-3)" className="tr" />
        {[40, 76].map((x) => <path key={x} d={`M${x} 4V66`} className="tr" />)}
        {[32, 46, 58].map((y) => <path key={y} d={`M4 ${y}H116`} className="tr" />)}
        <rect x="46" y="34" width="24" height="9" fill="#cde6a8" />
        <rect x="82" y="20" width="26" height="9" fill="#f9dba6" />
      </svg>
    );
  }
  if (tipo === "grafica") {
    return (
      <svg className="ud-glifo" viewBox="0 0 120 70" aria-hidden="true">
        <path d="M10 62H112M10 8V62" className="tr" />
        {[[18, 30], [38, 20], [58, 36], [78, 14], [98, 26]].map(([x, h], i) => <rect key={i} x={x} y={62 - (70 - h) * 0.7} width="14" height={(70 - h) * 0.7} rx="1.5" fill="#1f5fbf" opacity={0.85} />)}
        <path d="M12 44L36 34L62 40L84 20L106 28" fill="none" stroke="#b67a0c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="ud-glifo" viewBox="0 0 120 70" aria-hidden="true">
      <rect x="8" y="10" width="40" height="50" rx="4" fill="var(--es-panel)" className="tr" />
      <rect x="72" y="10" width="40" height="50" rx="4" fill="var(--es-panel)" className="tr" />
      <path d="M48 35H72" stroke="#1f5fbf" strokeWidth="2.4" />
      <path d="M14 22H42M14 32H42M14 42H42M78 22H106M78 32H106M78 42H106" className="tr" />
    </svg>
  );
}

/** «Tabla · 12 filas · hace 5 min», «PDF · 1,2 MB · hace 2 d». */
export function subtituloDe(a: ArchivoRow, ahora: number = Date.now()): string {
  const partes: string[] = [];
  if (a.tipo === "tabla") partes.push(typeof a.resumen.filas === "number" ? textoFilas(a.resumen.filas) : "Tabla");
  else if (a.tipo === "archivo") partes.push(textoTamano(a.tamano) || "Archivo");
  else partes.push(NOMBRE_TIPO[a.tipo]);
  const cuando = haceCuanto(a.updated_at, ahora);
  if (cuando) partes.push(cuando);
  return partes.join(" · ");
}

export function Estado({ estado }: { estado: ArchivoRow["estado"] }) {
  return (
    <span className="es-est" data-e={estado}>
      <Icon name={estado === "listo" ? "check" : "pen"} size={12} />
      {estado === "listo" ? "Lista" : "Borrador"}
    </span>
  );
}

/** Fecha corta en español: «22 oct 2026, 2:14 p. m.». */
export function fechaLarga(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(t);
}
