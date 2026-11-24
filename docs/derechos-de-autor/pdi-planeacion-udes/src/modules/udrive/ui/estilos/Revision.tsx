/* =============================================================================
   UDrive · revisar antes de imprimir (0190).

   La lista de lo que conviene corregir antes de abrir la ventana de impresión,
   con el estado en forma y en palabra (nunca solo color). Lo que bloquea
   impide imprimir hasta que se corrija o se deje así a propósito, hallazgo por
   hallazgo; lo que avisa se puede dejar. También sirve, sin lo de imprimir,
   para mostrar los avisos de diseño en el editor de estilos.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { Hallazgo, NivelHallazgo } from "../../lib/estilo";
import type { HallazgoRevision } from "../../lib/revision";
import "../documento/documento.css";

const PALABRA: Record<NivelHallazgo | "ok", string> = { bloquea: "Bloquea", avisa: "Avisa", info: "Informa", ok: "Sin avisos" };

export function Estado({ n }: { n: NivelHallazgo | "ok" }) {
  return (
    <span className="ud-hz-e" data-n={n}>
      <i aria-hidden="true" />
      {PALABRA[n]}
    </span>
  );
}

/** Los avisos de diseño de un estilo (sin acciones). */
export function ListaAvisos({ items }: { items: readonly Hallazgo[] }) {
  return (
    <div className="ud-hz" role="status" aria-live="polite">
      {items.length ? (
        items.map((h, i) => (
          <div key={i}>
            <Estado n={h.nivel} />
            <p>
              {h.texto}
              {h.detalle ? <small>{h.detalle}</small> : null}
            </p>
            <span />
          </div>
        ))
      ) : (
        <div>
          <Estado n="ok" />
          <p>El estilo cumple los límites de diseño.</p>
          <span />
        </div>
      )}
    </div>
  );
}

export function PanelRevision({
  hallazgos,
  ignorados,
  alIgnorar,
  alIrAlBloque,
  alImprimir,
  alCerrar,
  verbo,
}: {
  hallazgos: readonly HallazgoRevision[];
  ignorados: ReadonlySet<string>;
  alIgnorar(id: string, ignorar: boolean): void;
  alIrAlBloque?(id: string): void;
  /** Abre la ventana de impresión (o baja el Word). Deshabilitado mientras algo bloquee. */
  alImprimir(): void;
  alCerrar(): void;
  verbo: string;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    boton.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      alCerrar();
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [alCerrar]);

  const abiertos = hallazgos.filter((h) => !ignorados.has(h.id));
  const bloquean = abiertos.filter((h) => h.nivel === "bloquea").length;
  const avisan = abiertos.filter((h) => h.nivel === "avisa").length;
  return (
    <div className="ud-rev ud-noprint" role="dialog" aria-modal="true" aria-label="Revisar antes de imprimir">
      <div className="ud-rev-caja">
        <h2>Revisar antes de imprimir</h2>
        <p className="es-note" role="status">
          {hallazgos.length === 0
            ? "No hay nada que corregir."
            : `${bloquean} ${bloquean === 1 ? "hallazgo bloquea" : "hallazgos bloquean"} y ${avisan} ${avisan === 1 ? "avisa" : "avisan"}. Lo que bloquea se corrige o se deja así a propósito.`}
        </p>
        <div className="ud-hz">
          {hallazgos.map((h) => {
            const ign = ignorados.has(h.id);
            return (
              <div key={h.id} data-ign={ign ? "true" : undefined}>
                <Estado n={h.nivel} />
                <p>
                  {h.texto}
                  <small>
                    {h.origen === "estilo" ? "En el estilo. " : "En el contenido. "}
                    {h.detalle ?? ""}
                  </small>
                </p>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {h.bloqueId && alIrAlBloque ? (
                    <button type="button" className="es-btn es-btn--sm" onClick={() => alIrAlBloque(h.bloqueId as string)}>Ir al bloque</button>
                  ) : null}
                  {h.nivel !== "info" ? (
                    <button type="button" className="es-btn es-btn--sm es-btn--ghost" aria-pressed={ign} onClick={() => alIgnorar(h.id, !ign)}>{ign ? "Volver a avisar" : "Dejar así"}</button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <div className="ud-rev-pie">
          <button type="button" className="es-btn" onClick={alCerrar}>Volver a la vista previa</button>
          <button ref={boton} type="button" className="es-btn es-btn--pri" disabled={bloquean > 0} onClick={alImprimir}>
            {avisan > 0 ? `${verbo} de todos modos` : verbo}
          </button>
        </div>
      </div>
    </div>
  );
}
