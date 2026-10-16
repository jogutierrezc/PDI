/* =============================================================================
   Internacionalización · la barra de envío de una hoja.

   Un chip por campus visible (estado y ventana) y, para el campus elegido, las
   acciones que su papel permite (enviar, validar, aprobar, devolver, reabrir).
   Devolver y reabrir piden nota. Debajo, el historial de estados. El flujo no
   cambió: lo hace cumplir la base (int_cambiar_estado) y lib/permisos.
   ========================================================================== */

import { useState } from "react";
import { useCambiarEstado, useHistorial, useNombres } from "../datos";
import { ETIQUETA_ROL, ventanaVigente } from "../lib/permisos";
import { EstadoPill, fmt, nombreCampus } from "./comunes";
import type { Ctx, useAviso } from "./comunes";
import { accionesEnvio, diasHasta, escrituraPorCampus, fechaCorta, momento, transicion } from "./logica";
import type { AccionEnvio } from "./logica";

/**
 * La barra de envío: un chip por campus visible (estado y ventana), y para el
 * campus elegido las acciones que su papel permite. Devolver y reabrir piden
 * nota. Debajo, el historial de estados de la hoja.
 */
export function BarraEnvio({
  ctx,
  hojaId,
  escritura,
  campusSel,
  ventanas,
  onCampus,
  aviso,
}: {
  ctx: Ctx;
  hojaId: string;
  escritura: ReturnType<typeof escrituraPorCampus>;
  campusSel: string;
  ventanas: Parameters<typeof ventanaVigente>[0];
  onCampus: (id: string) => void;
  aviso: ReturnType<typeof useAviso>;
}) {
  const [nota, setNota] = useState<{ accion: AccionEnvio; texto: string } | null>(null);
  const cambiar = useCambiarEstado();
  const historial = useHistorial(ctx.periodo?.id);
  const deHoja = (historial.data ?? []).filter((x) => x.hoja_id === hojaId && (!campusSel || x.campus_id === campusSel));
  const nombres = useNombres(deHoja.map((x) => x.actor));
  const sel = escritura.find((e) => e.campus_id === campusSel);
  const acciones = sel ? accionesEnvio(sel.estado, sel.rol) : [];
  const ventana = sel && ctx.periodo ? ventanaVigente(ventanas, ctx.periodo.id, hojaId, sel.campus_id) : null;
  const dias = diasHasta(ventana?.cierra);

  const ejecutar = (a: AccionEnvio, texto?: string) => {
    if (!ctx.periodo || !sel) return;
    cambiar.mutate(
      { periodo: ctx.periodo.id, hoja: hojaId, campus: sel.campus_id, estado: a.a, nota: texto },
      {
        onSuccess: () => {
          aviso.ok(`${nombreCampus(ctx.campus, sel.campus_id)}: ${transicion(sel.estado, a.a)}.`);
          setNota(null);
        },
        onError: (e) => aviso.mal(e),
      },
    );
  };

  return (
    <section className="it-envio" aria-label="Envío y validación">
      <div className="it-campus-sel" role="group" aria-label="Campus">
        {ctx.visibles.length > 1 && (
          <button type="button" aria-pressed={!campusSel} onClick={() => onCampus("")}>
            <b>Todos</b>
            <small>ver todas las filas</small>
          </button>
        )}
        {escritura.map((e) => {
          const v = ctx.periodo ? ventanaVigente(ventanas, ctx.periodo.id, hojaId, e.campus_id) : null;
          return (
            <button key={e.campus_id} type="button" aria-pressed={campusSel === e.campus_id} onClick={() => onCampus(e.campus_id)}>
              <b>{nombreCampus(ctx.campus, e.campus_id)}</b>
              <EstadoPill estado={e.estado} />
              <small className={e.abierta ? "is-abierta" : undefined}>{v ? (e.abierta ? `abierta hasta ${fechaCorta(v.cierra)}` : `cerrada · ${fechaCorta(v.abre)}–${fechaCorta(v.cierra)}`) : "sin ventana"}</small>
            </button>
          );
        })}
      </div>

      {!sel ? (
        <p className="it-envio__ayuda">Elija un campus para enviar, validar o aprobar su hoja.</p>
      ) : (
        <div className="it-envio__barra">
          <div className="it-envio__dice">
            <EstadoPill estado={sel.estado} />
            <span>
              {sel.rol ? `Usted: ${ETIQUETA_ROL[sel.rol]}` : "Solo lectura"} ·{" "}
              {ventana
                ? sel.abierta
                  ? `ventana abierta hasta el ${fechaCorta(ventana.cierra)}${dias !== null && dias <= 7 ? ` (${dias === 0 ? "cierra hoy" : dias === 1 ? "queda 1 día" : `quedan ${dias} días`})` : ""}`
                  : `ventana cerrada (${fechaCorta(ventana.abre)} a ${fechaCorta(ventana.cierra)})`
                : "sin ventana de captura: el Director la define en Periodos"}
            </span>
            {sel.bloqueo && <small className="it-tenue">{sel.bloqueo}</small>}
          </div>
          <div className="it-fila">
            {acciones.map((a) => (
              <button
                key={a.a}
                type="button"
                className={a.principal ? "button-primary it-btn" : "button-secondary it-btn"}
                disabled={cambiar.isPending}
                onClick={() => (a.nota ? setNota({ accion: a, texto: "" }) : ejecutar(a))}
              >
                {a.rotulo}
              </button>
            ))}
            {acciones.length === 0 && <span className="it-tenue">{sel.estado === "aprobado" ? "Aprobada: ya cuenta en Cifras." : "Ninguna acción para su papel en este estado."}</span>}
          </div>
        </div>
      )}

      {nota && sel && (
        <form
          className="it-nota-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (nota.texto.trim().length >= 3) ejecutar(nota.accion, nota.texto.trim());
          }}
        >
          <label className="it-campo">
            <span>{nota.accion.rotulo === "Reabrir" ? "Motivo de la reapertura (queda en el historial)" : "Nota para el campus: qué debe corregir"}</span>
            <textarea autoFocus rows={2} value={nota.texto} onChange={(e) => setNota({ ...nota, texto: e.target.value })} />
          </label>
          <div className="it-fila">
            <button type="button" className="button-secondary it-btn" onClick={() => setNota(null)}>
              Cancelar
            </button>
            <button type="submit" className="button-primary it-btn" disabled={nota.texto.trim().length < 3 || cambiar.isPending}>
              {nota.accion.rotulo}
            </button>
          </div>
        </form>
      )}

      <details className="it-historial">
        <summary>
          Historial de estados {deHoja.length > 0 && <span className="it-num">({fmt(deHoja.length)})</span>}
        </summary>
        {deHoja.length === 0 ? (
          <p className="it-tenue">Sin movimientos todavía en este periodo.</p>
        ) : (
          <ol>
            {deHoja.map((x) => (
              <li key={x.id}>
                <span className="it-num it-tenue">{momento(x.en)}</span>
                <b>{transicion(x.de, x.a)}</b>
                <span>{nombreCampus(ctx.campus, x.campus_id)}</span>
                <span className="it-tenue">
                  {x.actor ? (nombres.data?.[x.actor] ?? "Persona") : "Sistema"}
                  {x.actor_rol && ` · ${ETIQUETA_ROL[x.actor_rol]}`}
                </span>
                {x.nota && <q>{x.nota}</q>}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
