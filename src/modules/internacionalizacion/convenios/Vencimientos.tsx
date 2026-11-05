/* =============================================================================
   Convenios · Vencimientos: los que terminan en los próximos 12 meses, agrupados
   por mes. «Renovar» abre el detalle con el formulario de renovación; «Avisar» envía
   de verdad el aviso de vencimiento (función conv-avisos, con confirmación y resultado
   en la bitácora de Gestión › Avisos); «Relaciones» conserva el camino anterior al envío masivo.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Confirmar, useAviso } from "../ui/comunes";
import { useEnviarAviso } from "../gestion/datos";
import { ALERTA_DIAS, diasFaltantes, etapaDe, MESES, VENTANA_VENCIMIENTOS, vigenciaDe, fechaLarga } from "./logica";
import type { Convenio } from "./logica";

export function Vencimientos({ convenios, hoy, crea, vencidos, onRenovar, onAvisar, onVencidos }: { convenios: Convenio[]; hoy: string; crea: boolean; vencidos: number; onRenovar: (id: string) => void; onAvisar: (c: Convenio) => void; onVencidos: () => void }) {
  const enviar = useEnviarAviso();
  const aviso = useAviso();
  const [pendiente, setPendiente] = useState<Convenio | null>(null);
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
      {aviso.nodo}
      {pendiente ? (
        <Confirmar
          pregunta={`¿Enviar el aviso de vencimiento a ${pendiente.institucion}?`}
          detalle={`Sale la plantilla que corresponde a los ${diasFaltantes(pendiente, hoy) ?? 0} días que faltan (${pendiente.codigo.toUpperCase()}). Según el modo de Gestión › Avisos llega a su propia dirección con [PRUEBA] o a los destinatarios reales, siempre por Sistema › Correos. Queda anotado en la bitácora y en el historial del convenio.`}
          si="Enviar el aviso"
          ocupado={enviar.isPending}
          onNo={() => setPendiente(null)}
          onSi={() => {
            const c = pendiente;
            enviar.mutate(
              { convenio_id: c.id },
              {
                onSuccess: (r) => aviso.ok(`Aviso enviado a ${r.resultado.enviados} ${r.resultado.enviados === 1 ? "destinatario" : "destinatarios"} de ${c.institucion}${r.modo === "prueba" ? " (modo de prueba: llegó a su propia dirección)" : ""}. Quedó en la bitácora de Gestión › Avisos.`),
                onError: aviso.mal,
                onSettled: () => setPendiente(null),
              },
            );
          }}
        />
      ) : null}
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
                      <button type="button" className="conv-btn conv-btn--sm" disabled={enviar.isPending} onClick={() => setPendiente(c)}>
                        <Icon name="mail" size={14} />
                        Avisar
                      </button>
                      <button type="button" className="conv-btn conv-btn--sm" onClick={() => onAvisar(c)} title="Abrir Relaciones › Envío masivo con los contactos de esta institución">
                        <Icon name="share" size={14} />
                        Relaciones
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
