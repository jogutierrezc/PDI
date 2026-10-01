/* =============================================================================
   Marco de gráfica.

   Cada gráfica se presenta como un panel del tablero: una franja con el
   rótulo en letra de señalética, los controles propios a la derecha y, abajo,
   el cuerpo sobre la superficie de lectura. Debajo del cuerpo, siempre, la
   fuente: una gráfica sin procedencia no se publica.

   Cada panel se descarga como imagen (PNG o JPG) tal como se ve, con un sello
   de procedencia que solo aparece en la imagen (chart-export.ts).
   ========================================================================== */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { exportChart } from "./chart-export";
import type { ImageFormat } from "./chart-export";
import { CsvAction } from "./CsvAction";
import type { CsvSource } from "./CsvAction";
import "./chart-export.css";

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  source?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Nombre del archivo al descargar la imagen. Por defecto, el título. */
  exportName?: string;
  /** false para paneles que no son una gráfica. */
  exportable?: boolean;
  /**
   * Quién firma la imagen descargada. Por defecto el portal estadístico; un
   * tablero de unidad pone el suyo, porque una gráfica que sale de aquí tiene
   * que decir de qué oficina viene y no de cuál se parece.
   */
  stamp?: string;
  /** Datos del conjunto en CSV: pone la acción «CSV» en el pie, junto a la fuente. */
  csv?: Omit<CsvSource, "name"> & { name?: string };
}

const stampDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export function ChartFrame({ title, subtitle, source, actions, children, className = "", id, exportName, exportable = true, stamp, csv }: ChartFrameProps) {
  const figure = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<ImageFormat | null>(null);
  const [failed, setFailed] = useState(false);

  const download = async (format: ImageFormat) => {
    if (!figure.current || busy) return;
    setBusy(format);
    setFailed(false);
    try {
      await exportChart(figure.current, `udes-en-cifras-${exportName ?? title}`, format);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <figure ref={figure} className={`od-frame ${className}`.trim()} id={id}>
      <figcaption className="od-frame__head">
        <span className="od-frame__titles">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </span>
        {(actions || exportable) && (
          <span className="od-frame__actions" data-export-ignore>
            {actions}
            {exportable && (
              <span className="od-export" role="group" aria-label={`Descargar la gráfica ${title} como imagen`}>
                <span className="od-export__icon" aria-hidden="true">
                  <Icon name="download" size={15} />
                </span>
                {(["png", "jpg"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className="od-export__option"
                    disabled={busy !== null}
                    aria-label={`Descargar ${title} en ${format.toUpperCase()}`}
                    onClick={() => void download(format)}
                  >
                    {busy === format ? "…" : format.toUpperCase()}
                  </button>
                ))}
                {failed && <span className="od-export__status" role="status">No se pudo generar la imagen</span>}
              </span>
            )}
          </span>
        )}
      </figcaption>
      <div className="od-frame__body">{children}</div>
      {csv ? (
        <div className="od-frame__foot" data-export-ignore={source ? undefined : ""}>
          {source && <p className="od-frame__source">Reporta: {source}</p>}
          <CsvAction {...csv} name={csv.name ?? title} />
        </div>
      ) : (
        source && <p className="od-frame__source">Reporta: {source}</p>
      )}
      <p className="od-frame__stamp" aria-hidden="true">
        <span>{stamp ?? "UDES en Cifras"} · Universidad de Santander</span>
        <span>Descargada el {stampDate.format(new Date())}</span>
      </p>
    </figure>
  );
}

interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

/** Conmutador pequeño de vista (Líneas / Barras, Circular / Barras…). */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <span className="od-switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="od-switch__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/** Globo de ayuda posicionado en píxeles dentro de un contenedor relativo. */
export function ChartTooltip({
  x,
  y,
  children,
  align = "center",
}: {
  x: number;
  y: number;
  children: ReactNode;
  align?: "center" | "start" | "end";
}) {
  return (
    <span className="od-tip" data-align={align} style={{ left: x, top: y }} role="presentation">
      {children}
    </span>
  );
}

/** Siguiente múltiplo "redondo" por encima de un máximo. */
export function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(max));
  const fraction = max / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

export function niceFloor(min: number): number {
  if (min <= 0) return 0;
  const exponent = 10 ** Math.floor(Math.log10(min));
  return Math.floor(min / exponent) * exponent;
}
