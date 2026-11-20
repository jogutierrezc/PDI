/* Planeación y Seguimiento · proyectos · piezas compartidas: estado del proyecto, sí/no accesible y barras comparativas solicitado vs aprobado. */

import { Icon } from "../../../components/ui/Icon";
import { millones1 } from "../modelo";
import { ROTULO_ESTADO_PROYECTO, type EstadoProyecto, type GrupoAprobacion } from "./modeloProy";

const TONO: Record<EstadoProyecto, string> = { sin_evaluar: "pend", aprobado: "ok", rechazado: "riesgo" };
const ICONO: Record<EstadoProyecto, "clock" | "check" | "alert"> = { sin_evaluar: "clock", aprobado: "check", rechazado: "alert" };

/** El estado del proyecto con glifo y texto (nunca solo color). */
export const ChipEstadoProyecto = ({ estado }: { estado: EstadoProyecto }) => (
  <span className="ps-est" data-tono={TONO[estado]}><Icon name={ICONO[estado]} size={13} />{ROTULO_ESTADO_PROYECTO[estado]}</span>
);

/** Pregunta sí/no con radios (se maneja con flechas y Tab; la etiqueta va en la leyenda). */
export function PreguntaSiNo({ id, etiqueta, valor, onCambio, onBlur }: { id: string; etiqueta: string; valor: boolean | null; onCambio: (v: boolean) => void; onBlur?: () => void }) {
  return (
    <fieldset className="ps-sino-fila" id={id}>
      <legend>{etiqueta}</legend>
      <label className="ps-sino-op"><input type="radio" name={id} checked={valor === true} onChange={() => onCambio(true)} onBlur={onBlur} /><span>Sí</span></label>
      <label className="ps-sino-op"><input type="radio" name={id} checked={valor === false} onChange={() => onCambio(false)} onBlur={onBlur} /><span>No</span></label>
    </fieldset>
  );
}

/** Barras comparativas: por cada grupo, lo solicitado (claro) y lo aprobado (azul), con los valores escritos. */
export function BarrasComparativas({ filas, titulo }: { filas: GrupoAprobacion[]; titulo: string }) {
  const max = Math.max(1, ...filas.flatMap((f) => [f.solicitado, f.aprobado]));
  const w = (n: number) => `${Math.max(n ? 1.5 : 0, (n / max) * 100)}%`;
  if (!filas.length) return <p className="ps-nota">Sin datos para mostrar.</p>;
  return (
    <ul className="ps-comp" aria-label={titulo}>
      {filas.map((f) => (
        <li key={f.clave}>
          <span className="ps-comp__l">{f.nombre} <em>· {f.n}</em></span>
          <span className="ps-comp__b" aria-hidden="true"><i data-tipo="sol" style={{ width: w(f.solicitado) }} /><i data-tipo="apr" style={{ width: w(f.aprobado) }} /></span>
          <span className="ps-comp__v"><span>Solicitado <b>{millones1(f.solicitado)}</b></span><span>Aprobado <b>{millones1(f.aprobado)}</b></span></span>
        </li>
      ))}
    </ul>
  );
}

export const LeyendaComparativa = () => (
  <p className="ps-comp__leyenda" aria-hidden="true"><span data-tipo="sol" /> Solicitado <span data-tipo="apr" /> Aprobado</p>
);
