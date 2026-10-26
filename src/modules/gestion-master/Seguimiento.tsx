/* =============================================================================
   Gestión Master · Seguimiento.

   Tres cosas: los vencimientos (qué solicitudes van tarde respecto del plazo
   indicativo de 15 días hábiles de Rua), la línea de tiempo de una solicitud y
   dónde se demora el flujo (días hábiles promedio por función). El plazo no
   corta nada: avisa. Los avisos por correo salen en cada paso.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useDetalle, useLista, useTiempos } from "./api";
import type { Contexto } from "./contexto";
import { PLAZO_INDICADOR, fechaHora, nombreSede, resumenLinea, textoPlazo, type FilaLista } from "./modelo";
import { useBarras, useEntrada } from "./movimiento";
import { Cargando, ErrorCaja, PastillaEstado, Vacio } from "./partes";

const esperan = (s: FilaLista) => s.estado === "pendiente" || s.estado === "revision";

const EVENTO: Record<string, string> = {
  borrador: "guardó un borrador",
  enviada: "envió la solicitud",
  paso_aprobado: "aprobó un paso",
  devuelta: "devolvió la solicitud",
  rechazada: "rechazó la solicitud",
  cancelada: "canceló la solicitud",
  aprobada: "dejó aprobada la solicitud",
  aplicada: "marcó el cambio como aplicado en el Master",
  reflejada: "confirmó que el Master ya refleja el cambio",
  comentario: "comentó",
};

export function Seguimiento({ ctx }: { ctx: Contexto }) {
  const lista = useLista(ctx.periodo, ctx.sede);
  const veTiempos = ctx.nivel === "revisor" || ctx.nivel === "gestor";
  const tiempos = useTiempos(ctx.periodo, ctx.sede, veTiempos);
  const [elegida, setElegida] = useState("");
  const todas = lista.data ?? [];
  const abiertas = useMemo(() => todas.filter(esperan), [todas]);
  const id = elegida || todas[0]?.id || null;
  const detalle = useDetalle(id);
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, ".gm-historial li", `${id}|${detalle.dataUpdatedAt}`, !detalle.isPending);
  useBarras(raiz, `${tiempos.dataUpdatedAt}`);
  useEffect(() => {
    if (elegida && !todas.some((s) => s.id === elegida)) setElegida("");
  }, [todas, elegida]);

  const grupos: [string, FilaLista[], string][] = [
    ["Vencidas", abiertas.filter((s) => (s.dias_restantes ?? 99) < 0), "mal"],
    ["Vencen hoy o mañana", abiertas.filter((s) => (s.dias_restantes ?? 99) >= 0 && (s.dias_restantes ?? 99) <= 1), "aviso"],
    ["En plazo", abiertas.filter((s) => (s.dias_restantes ?? 99) > 1), "ok"],
  ];
  const maxDias = Math.max(PLAZO_INDICADOR / 3, ...(tiempos.data ?? []).map((t) => Number(t.promedio_dias ?? 0)), 1);

  if (lista.isPending) return <Cargando />;
  if (lista.error) return <ErrorCaja error={lista.error} onReintentar={() => void lista.refetch()} />;

  return (
    <div className="gm-seccion-pagina" ref={raiz}>
      <section aria-labelledby="gm-venc">
        <h3 id="gm-venc">Vencimientos</h3>
        <p className="gm-nota">El plazo indicativo es de {PLAZO_INDICADOR} días hábiles desde que se envía (el de Rua). No hay plazos por paso definidos: si Planeación los fija en el flujo, se mostrarán aquí.</p>
        {abiertas.length === 0 ? (
          <Vacio titulo="Nada esperando decisión" texto="Todas las solicitudes de este periodo y sede están resueltas o en borrador." />
        ) : (
          <div className="gm-grupos">
            {grupos.map(([titulo, filas, tono]) => (
              <div key={titulo} className="gm-grupo-venc" data-tono={tono}>
                <h4>
                  {titulo} ({filas.length})
                </h4>
                {filas.length === 0 ? (
                  <p className="gm-muted">Nada en este grupo.</p>
                ) : (
                  <ul>
                    {filas.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setElegida(s.id)}>
                          <b className="gm-mono">{s.folio}</b> {s.lineas.map(resumenLinea).slice(0, 1)}
                          <small>
                            {s.paso_nombre} · {textoPlazo(s.dias_restantes).texto}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="gm-linea">
        <h3 id="gm-linea">Línea de tiempo de una solicitud</h3>
        {todas.length === 0 ? (
          <Vacio titulo="Sin solicitudes en este periodo y sede" />
        ) : (
          <>
            <label className="admin-field gm-selector">
              <span>Solicitud</span>
              <select value={id ?? ""} onChange={(e) => setElegida(e.target.value)}>
                {todas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.folio} · {s.lineas.map(resumenLinea).slice(0, 1)} · {nombreSede(s.sede)}
                  </option>
                ))}
              </select>
            </label>
            {detalle.isPending ? (
              <Cargando filas={3} />
            ) : detalle.error ? (
              <ErrorCaja error={detalle.error} />
            ) : (
              <>
                <p>
                  <PastillaEstado estado={detalle.data.estado} />
                </p>
                <ol className="gm-historial">
                  {detalle.data.eventos.map((e) => (
                    <li key={e.id}>
                      <time dateTime={e.creado_en}>{fechaHora(e.creado_en)}</time>
                      <span>
                        <b>{e.actor ?? "Sistema"}</b> {EVENTO[e.tipo] ?? e.tipo}
                        {typeof e.datos?.paso === "string" && e.datos.paso ? ` «${e.datos.paso}»` : ""}
                        {typeof e.datos?.nota === "string" && e.datos.nota ? <em> «{e.datos.nota}»</em> : null}
                        {typeof e.datos?.texto === "string" && e.datos.texto ? <em> «{e.datos.texto}»</em> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="gm-cuellos">
        <h3 id="gm-cuellos">Dónde se demora el flujo</h3>
        {!veTiempos ? (
          <p className="gm-nota">Los tiempos por paso los ve quien revisa o gestiona.</p>
        ) : tiempos.isPending ? (
          <Cargando filas={3} />
        ) : tiempos.error ? (
          <ErrorCaja error={tiempos.error} />
        ) : (tiempos.data ?? []).length === 0 ? (
          <Vacio titulo="Todavía no hay pasos para medir" texto="Cuando se decidan pasos en este periodo aparecerá aquí cuánto tarda cada función." />
        ) : (
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Tiempo por paso, en días hábiles</caption>
              <thead>
                <tr>
                  <th scope="col">Paso o función</th>
                  <th scope="col" className="gm-num">Decididas</th>
                  <th scope="col" className="gm-num">Promedio (días hábiles)</th>
                  <th scope="col">Frente al plazo total de {PLAZO_INDICADOR} días</th>
                  <th scope="col" className="gm-num">Esperando hoy</th>
                  <th scope="col" className="gm-num">Mayor espera</th>
                </tr>
              </thead>
              <tbody>
                {(tiempos.data ?? []).map((t) => {
                  const dias = Number(t.promedio_dias ?? 0);
                  return (
                    <tr key={t.funcion}>
                      <th scope="row">{t.nombre}</th>
                      <td className="gm-num">{t.decididas}</td>
                      <td className="gm-num">{t.promedio_dias === null ? "—" : String(t.promedio_dias).replace(".", ",")}</td>
                      <td>
                        <span className="gm-barra gm-barra--plazo" role="img" aria-label={`${dias} días de un plazo total de ${PLAZO_INDICADOR}`}>
                          <i style={{ transform: `scaleX(${Math.min(dias / maxDias, 1)})` }} />
                        </span>
                      </td>
                      <td className="gm-num">{t.pendientes}</td>
                      <td className="gm-num">{t.mayor_espera_dias === null ? "—" : `${t.mayor_espera_dias} d`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="gm-avisos">
        <h3 id="gm-avisos">Avisos por correo</h3>
        <ul className="gm-lista-simple">
          <li>Al enviar: acuse a quien solicita y aviso a quienes firman el primer paso.</li>
          <li>Al aprobar un paso: aviso a quienes firman el siguiente y a quien solicita.</li>
          <li>Al devolver con nota o rechazar: aviso a quien solicita, con la nota.</li>
          <li>Decisión final y, después, cuando el Master ya refleja el cambio.</li>
        </ul>
        <p className="gm-nota">Los textos se editan en la pantalla de Correos (plantillas «Gestión Master») y cada envío queda en su bitácora. No hay recordatorios por vencimiento: no hay plazos por paso definidos.</p>
      </section>
    </div>
  );
}
