/* =============================================================================
   Encuestas con Pilo · la papelera.

   Las respuestas borradas siguen 30 días aquí, con quién las borró, cuándo y por
   qué. Se pueden restaurar; pasado el plazo se purgan. Solo edita quien puede
   editar la encuesta.
   ========================================================================== */

import { useLayoutEffect, useRef } from "react";
import { enterList } from "../motion";
import { diasParaPurga, fechaCorta } from "../lib/tabla";
import { textoTipoAporte } from "../tipos";
import type { Aporte } from "../tipos";

export function Papelera({ aportes, puedeEditar, onRestaurar }: { aportes: readonly Aporte[]; puedeEditar: boolean; onRestaurar: (id: string) => void }) {
  const lista = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (lista.current) enterList(Array.from(lista.current.children));
  }, [aportes.length]);

  return (
    <div role="tabpanel" id="en-panel-pap" aria-labelledby="en-tab-pap" className="en-papelera">
      <p className="en-hint">Las respuestas borradas se conservan 30 días. Después se eliminan para siempre.</p>
      {aportes.length === 0 ? (
        <p className="en-vacio-simple">La papelera está vacía.</p>
      ) : (
        <ul ref={lista} className="en-pap-lista">
          {aportes.map((a) => {
            const dias = diasParaPurga(a.borrado_en ?? "");
            return (
              <li key={a.id}>
                <span className={`en-tag en-tag--${a.tipo}`}>{textoTipoAporte(a.tipo)}</span>
                <div>
                  <b>{a.titulo}</b>
                  <span>
                    {a.dependencia} · borrada {a.borrado_en ? fechaCorta(a.borrado_en) : ""}
                    {a.borrado_motivo ? ` · «${a.borrado_motivo}»` : ""}
                  </span>
                  <span>{dias === 0 ? "Se elimina hoy" : dias === 1 ? "Se elimina mañana" : `Se elimina en ${dias} días`}</span>
                </div>
                {puedeEditar && (
                  <button type="button" className="en-btn" onClick={() => onRestaurar(a.id)}>
                    Restaurar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
