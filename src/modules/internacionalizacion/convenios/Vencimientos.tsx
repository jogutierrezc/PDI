/* =============================================================================
   Convenios · Vencimientos: los que terminan en los próximos 12 meses, agrupados
   por mes. «Renovar» abre el detalle con el formulario de renovación; «Avisar»
   lleva a Relaciones › Envío masivo con la plantilla «Renovación de convenio» y
   los contactos de esa institución. No se envía nada automáticamente.
   ========================================================================== */

import { useMemo } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ALERTA_DIAS, diasFaltantes, etapaDe, MESES, VENTANA_VENCIMIENTOS, vigenciaDe, fechaLarga } from "./logica";
import type { Convenio } from "./logica";

export function Vencimientos({ convenios, hoy, crea, vencidos, onRenovar, onAvisar, onVencidos }: { convenios: Convenio[]; hoy: string; crea: boolean; vencidos: number; onRenovar: (id: string) => void; onAvisar: (c: Convenio) => void; onVencidos: () => void }) {
  const { grupos, dentro } = useMemo(() => {
    const lista = convenios
      .filter((c) => {
        if (etapaDe(c) !== "Firmado" || c.indefinido || !c.fecha_terminacion) return false;
        const d = diasFaltantes(c, hoy);
        return d != null && d >= 0 && d <= VENTANA_VENCIMIENTOS;
      })
      .sort((a, b) => (diasFaltantes(a, hoy) ?? 0) - (diasFaltantes(b, hoy) ?? 0));
    const g = new Map<string, Convenio[]>();
    for (const c of lista) {
      const k = (c.fecha_terminacion as string).slice(0, 7);
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return { grupos: [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])), dentro: lista.filter((c) => vigenciaDe(c, hoy) === "Por vencer").length };
  }, [convenios, hoy]);

  return (
    <section className="conv-panel">
      <div className="conv-bar">
        <h2>Terminan en los próximos 12 meses</h2>
        <span className="conv-sub">
          {dentro} dentro de la alerta de {ALERTA_DIAS} días
        </span>
        <span className="conv-grow" />
        <button type="button" className="conv-btn" onClick={onVencidos}>
          Ver los {vencidos} vencidos
        </button>
      </div>
      {!grupos.length ? (
        <p className="conv-vacio">No hay convenios por vencer en los próximos 12 meses.</p>
      ) : (
        grupos.map(([clave, lista]) => (
          <div key={clave}>
            <h3 className="conv-mes">
              {MESES[Number(clave.slice(5)) - 1]} {clave.slice(0, 4)}
            </h3>
            {lista.map((c) => {
              const d = diasFaltantes(c, hoy) ?? 0;
              return (
                <div key={c.id} className="conv-venc">
                  <div className={`conv-venc-dias${d <= ALERTA_DIAS ? " is-warn" : ""}`}>
                    {d}
                    <small>días</small>
                  </div>
                  <div className="conv-venc-dato">
                    <b>{c.institucion}</b>
                    <div className="conv-sub">
                      {c.pais} · {c.tipo} · termina {fechaLarga(c.fecha_terminacion)} · renovación: {c.renovacion || "sin dato"}
                    </div>
                  </div>
                  {crea ? (
                    <div className="conv-venc-acc">
                      <button type="button" className="conv-btn conv-btn--sm" onClick={() => onAvisar(c)}>
                        <Icon name="mail" size={14} />
                        Avisar
                      </button>
                      <button type="button" className="conv-btn conv-btn--sm conv-btn--pri" onClick={() => onRenovar(c.id)}>
                        <Icon name="undo" size={14} />
                        Renovar
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
