/* =============================================================================
   Acción «CSV» de un conjunto de datos.

   Vive en el pie del marco, junto a quien reporta la cifra, como el talón del
   mismo boleto de origen. No compite con la gráfica: rótulo de señalética en
   mayúsculas, sin relleno ámbar (ese es de la acción principal de la página).
   Baja el conjunto completo, todos los cortes y campus, listo para Excel: un
   archivo .csv, o un .zip si el conjunto tiene varios.

   Una por conjunto: si varios marcos leen los mismos datos, la lleva el
   primero. Nunca sale en las imágenes exportadas (data-export-ignore).

   El botón reserva el ancho de su rótulo más largo («Descargado») con una
   copia invisible apilada debajo: al confirmar, el pie no salta ni la acción
   baja de línea.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { downloadCsvFiles } from "../data/download";
import type { CsvFile } from "../data/csv-export";
import { slugify } from "../data/slug";
import { cancelarMovimiento, voltearRotulo } from "./csv-motion";
import "./chart-export.css";

export interface CsvSource {
  /** Archivos de este conjunto. Uno: un .csv; varios: un .zip llamado zipName. */
  files: CsvFile[];
  zipName?: string;
  /** Título del conjunto, para el nombre accesible. */
  name: string;
}

type Phase = "idle" | "busy" | "done" | "error";

const DONE_MS = 2000;

const DONE_LABEL = "Descargado";

const fallbackZipName = (name: string) => `udes-en-cifras-${slugify(name, "datos")}.zip`;

/** «de el tablero» es «del tablero»: el nombre accesible se lee en voz alta. */
const ofName = (name: string) => (/^el\s/i.test(name) ? `del ${name.replace(/^el\s+/i, "")}` : `de ${name}`);

export function CsvAction({ files, zipName, name, className = "" }: CsvSource & { className?: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const label = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const flipped = useRef<HTMLElement | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Si el marco se desmonta a medio volteo, el rótulo no queda animándose.
      cancelarMovimiento(flipped.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "done") {
      flipped.current = label.current;
      voltearRotulo(label.current);
      timer.current = window.setTimeout(() => setPhase("idle"), DONE_MS);
    }
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [phase]);

  if (files.length === 0) return null;

  const download = async () => {
    if (phase === "busy") return;
    setPhase("busy");
    try {
      await downloadCsvFiles(files, zipName ?? fallbackZipName(name));
      if (alive.current) setPhase("done");
    } catch {
      if (alive.current) setPhase("error");
    }
  };

  const text = phase === "busy" ? "…" : phase === "done" ? DONE_LABEL : "CSV";
  const status = phase === "done" ? DONE_LABEL : phase === "error" ? "No se pudo generar el archivo" : "";

  return (
    <span className={`od-csv ${className}`.trim()} data-export-ignore>
      <button
        type="button"
        className="od-csv__button"
        disabled={phase === "busy"}
        aria-label={`Descargar los datos ${ofName(name)} en CSV`}
        title="Todos los cortes y campus de este conjunto, listo para Excel"
        onClick={() => void download()}
      >
        <span className="od-csv__face">
          <Icon name="download" size={14} aria-hidden="true" />
          <span ref={label} className="od-csv__label">{text}</span>
        </span>
        {/* Copia invisible del rótulo más largo: reserva el ancho del botón. */}
        <span className="od-csv__face od-csv__face--ghost" aria-hidden="true">
          <Icon name="download" size={14} aria-hidden="true" />
          <span className="od-csv__label">{DONE_LABEL}</span>
        </span>
      </button>
      <span className="od-csv__status" role="status" data-state={phase === "error" ? "error" : "quiet"}>
        {status}
      </span>
    </span>
  );
}
