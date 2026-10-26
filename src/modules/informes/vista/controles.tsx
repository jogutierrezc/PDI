/* Controles pequeños que comparten los dos editores de la vista. */

import { useId } from "react";
import type { ReactNode } from "react";

/** Grupo de opciones excluyentes con aspecto de botones unidos (radios nativos: teclado y lector de pantalla gratis). */
export function Segmentado<T extends string | number>({
  etiqueta,
  valor,
  opciones,
  onChange,
  deshabilitado,
}: {
  etiqueta: string;
  valor: T;
  opciones: { id: T; texto: string; off?: boolean }[];
  onChange: (v: T) => void;
  deshabilitado?: boolean;
}) {
  const nombre = useId();
  const rotulo = useId();
  return (
    <div className="vi-grupo">
      <span id={rotulo} className="vi-lab">
        {etiqueta}
      </span>
      <div className="vi-seg" role="radiogroup" aria-labelledby={rotulo}>
        {opciones.map((o) => (
          <label key={String(o.id)}>
            <input type="radio" name={nombre} checked={valor === o.id} disabled={deshabilitado || o.off} onChange={() => onChange(o.id)} />
            <span>{o.texto}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Texto de una línea o de varias, con su contador «n / máximo». */
export function CampoTexto({
  etiqueta,
  valor,
  max,
  onChange,
  filas,
  placeholder,
  deshabilitado,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  max: number;
  onChange: (v: string) => void;
  filas?: number;
  placeholder?: string;
  deshabilitado?: boolean;
  ayuda?: ReactNode;
}) {
  const id = useId();
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label className="vi-lab" htmlFor={id}>
        {etiqueta}
      </label>
      {filas ? (
        <textarea id={id} className="inf-in" rows={filas} value={valor} maxLength={max} placeholder={placeholder} disabled={deshabilitado} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="inf-in" value={valor} maxLength={max} placeholder={placeholder} disabled={deshabilitado} onChange={(e) => onChange(e.target.value)} />
      )}
      <span className="vi-cnt">
        {valor.length} / {max}
      </span>
      {ayuda ? <span className="vi-hint">{ayuda}</span> : null}
    </div>
  );
}
