/* =============================================================================
   Espacio de archivos · el marco del asistente de creación: una ventana con
   los pasos arriba, el paso que desliza al cambiar y Pilo al costado con la
   cara oficial y el ánimo que le toca al paso. El contenido de cada paso lo
   pone el módulo.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { PiloAvatar } from "../pilo/PiloAvatar";
import type { PiloMood } from "../pilo/PiloAvatar";
import { deslizarPaso } from "./movimiento";
import { Ventana } from "./Ventana";

export function MarcoAsistente({
  titulo,
  paso,
  pasos,
  pilo,
  onCerrar,
  pie,
  children,
}: {
  titulo: string;
  /** Paso actual, desde 0. */
  paso: number;
  pasos: number;
  pilo: { animo: PiloMood; titulo: string; texto: string };
  onCerrar: () => void;
  pie: ReactNode;
  children: ReactNode;
}) {
  const escena = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) primera.current = false;
    else deslizarPaso(escena.current, 1);
  }, [paso]);
  return (
    <Ventana
      titulo={titulo}
      onCerrar={onCerrar}
      pie={pie}
      cabecera={
        <div className="es-steps" aria-label={`Paso ${paso + 1} de ${pasos}`}>
          {Array.from({ length: pasos }, (_, i) => (
            <i key={i} data-on={i <= paso} />
          ))}
        </div>
      }
    >
      <div className="es-dbody">
        <div className="es-stage" ref={escena}>
          {children}
        </div>
        <aside className="es-pilo" aria-label="Pilo">
          <div className="es-pilo__h">Pilo</div>
          <div className="es-pilo__face">
            <PiloAvatar mood={pilo.animo} size={96} alive />
          </div>
          <b>{pilo.titulo}</b>
          <p>{pilo.texto}</p>
        </aside>
      </div>
    </Ventana>
  );
}
