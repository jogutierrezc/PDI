/* =============================================================================
   THE Impact · avisos por correo (la cola que vacía la función correos) y la
   bitácora del ciclo (solo se agrega, nunca se borra). Mismo diseño que en UI GreenMetric.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { Alerta, Cargando, ErrorConsulta, Vacio, fechaCorta, hace } from "../../uigreen/ui/comunes";
import { usePerfiles } from "../../uigreen/ui/lectura";
import { useBitacoraThi, useColaEstadoThi, useEnviarAvisosThi, useNotificacionesThi, useReintentarAvisoThi, useTareasDiariasThi } from "../datos";
import type { EstadoNotificacion } from "../datos";
import { useThi } from "./contexto";
import { ACCION_BITACORA } from "./piezas";
import { PLANTILLAS_THI } from "../lib/correo-html";

const PLANTILLA: Record<string, string> = Object.fromEntries(PLANTILLAS_THI.map((p) => [p.clave, p.nombre]));
const ESTADO: Record<EstadoNotificacion, string> = { en_cola: "En cola", enviando: "Enviando", enviado: "Enviado", error: "Con error", omitido: "Omitido" };

export function Avisos() {
  const t = useThi();
  const cola = useColaEstadoThi(t.esAdmin ? t.ciclo.id : undefined);
  const notifs = useNotificacionesThi(t.ciclo.id);
  const bitacora = useBitacoraThi(t.ciclo.id);
  const enviar = useEnviarAvisosThi();
  const tareas = useTareasDiariasThi();
  const reintentar = useReintentarAvisoThi();
  const [filtro, setFiltro] = useState("");

  const ids = useMemo(() => [...(notifs.data ?? []).map((n) => n.destinatario), ...(bitacora.data ?? []).map((a) => a.actor ?? "")].filter(Boolean), [notifs.data, bitacora.data]);
  const perfiles = usePerfiles(ids);
  const nom = (id: string | null) => (id ? (perfiles.data?.get(id)?.nombre ?? "Persona") : "Sistema");
  const indicadorDe = (rid: string | null) => t.respuestas.find((r) => r.id === rid)?.indicador ?? "";

  if (!t.esAdmin) return <Vacio>Los avisos y la bitácora los gestiona la administración del ranking.</Vacio>;
  const c = cola.data?.conteo ?? {};
  const bit = (bitacora.data ?? []).filter((a) => !filtro || `${a.accion} ${a.indicador ?? ""} ${nom(a.actor)}`.toLowerCase().includes(filtro.toLowerCase()));
  const avisosOff = t.cfg?.avisos_activos === false;

  return (
    <div className="ugm-pila">
      <section className="ugm-sec">
        <h2>Cola de correos</h2>
        {t.ciclo.estado !== "abierto" && <Alerta tipo="aviso">Con el ciclo {t.ciclo.estado === "preparacion" ? "en preparación" : "cerrado"} no se encolan avisos nuevos.</Alerta>}
        {avisosOff && <Alerta tipo="aviso">Los avisos de este ciclo están apagados en «Fechas y avisos».</Alerta>}
        {cola.isLoading ? (
          <Cargando />
        ) : cola.error ? (
          <ErrorConsulta error={cola.error} reintentar={() => void cola.refetch()} />
        ) : (
          <>
            <ul className="ugm-contadores">
              {(Object.keys(ESTADO) as EstadoNotificacion[]).map((k) => (
                <li key={k}>
                  <b className="ugm-num">{c[k] ?? 0}</b> {ESTADO[k].toLowerCase()}
                </li>
              ))}
            </ul>
            <p className="ugm-muted ugm-peq">{cola.data?.ultimo_envio ? `Último envío ${hace(cola.data.ultimo_envio)}.` : "Todavía no se ha enviado ningún aviso."}</p>
            <div className="ugm-acciones">
              <button
                type="button"
                className="ugm-btn ugm-btn--pri"
                disabled={enviar.isPending || (c.en_cola ?? 0) === 0}
                onClick={() =>
                  void t.hacer(async () => {
                    const r = await enviar.mutateAsync(undefined);
                    t.avisar(`Enviados ${r.enviados ?? 0}${r.fallidos ? `, con error ${r.fallidos}` : ""}.`);
                  })
                }
              >
                <Icon name="mail" size={16} /> {enviar.isPending ? "Enviando…" : "Enviar avisos pendientes"}
              </button>
              <button
                type="button"
                className="ugm-btn"
                disabled={tareas.isPending}
                onClick={() =>
                  void t.hacer(async () => {
                    const r = await tareas.mutateAsync(undefined);
                    t.avisar(`Preparados ${r.recordatorios} recordatorios y ${r.resumen} resúmenes.`);
                  })
                }
              >
                Preparar recordatorios ahora
              </button>
            </div>
            <Alerta>
              La cola se vacía sola solo si Coolify o pg_cron la programan (instrucciones al final de la migración 0241). Mientras no estén programados, use «Enviar avisos pendientes».
            </Alerta>
            {(cola.data?.errores ?? []).length > 0 && (
              <ul className="ugm-lista">
                {cola.data!.errores.map((e) => (
                  <li key={e.id} className="ugm-fila-simple">
                    <span>
                      <b>{PLANTILLA[e.plantilla] ?? e.plantilla}</b>
                      <small>
                        {e.error ?? "Error sin detalle"} · {e.intentos} intentos
                      </small>
                    </span>
                    <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => void t.hacer(() => reintentar.mutateAsync(e.id), "Aviso devuelto a la cola.")}>
                      Reintentar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="ugm-sec">
        <h2>Notificaciones del ciclo</h2>
        {notifs.isLoading ? (
          <Cargando />
        ) : notifs.error ? (
          <ErrorConsulta error={notifs.error} />
        ) : (notifs.data ?? []).length === 0 ? (
          <Vacio>Todavía no hay notificaciones.</Vacio>
        ) : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Para</th>
                  <th scope="col">Aviso</th>
                  <th scope="col">Indicador</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {notifs.data!.slice(0, 60).map((n) => (
                  <tr key={n.id}>
                    <td data-et="Cuándo">{hace(n.created_at)}</td>
                    <td data-et="Para">{nom(n.destinatario)}</td>
                    <td data-et="Aviso">{PLANTILLA[n.plantilla] ?? n.plantilla}</td>
                    <td data-et="Indicador" className="ugm-num">
                      {indicadorDe(n.respuesta_id) || n.valores?.indicador?.split(" · ")[0] || "—"}
                    </td>
                    <td data-et="Estado">
                      <span className={`ugm-etq ${n.estado === "enviado" ? "ugm-etq--ok" : n.estado === "error" ? "ugm-etq--no" : ""}`}>{ESTADO[n.estado]}</span>
                      {n.error && <small className="ugm-falta"> {n.error}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ugm-sec">
        <h2>Bitácora</h2>
        <div className="ugm-buscar">
          <Icon name="search" size={16} />
          <label className="ugm-sr" htmlFor="thi-bt-f">
            Filtrar la bitácora
          </label>
          <input id="thi-bt-f" className="ugm-input" type="search" placeholder="Filtrar por persona, indicador o acción" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        {bitacora.isLoading ? (
          <Cargando />
        ) : bitacora.error ? (
          <ErrorConsulta error={bitacora.error} />
        ) : bit.length === 0 ? (
          <Vacio>Sin movimientos.</Vacio>
        ) : (
          <ul className="ugm-bitacora">
            {bit.slice(0, 100).map((a) => (
              <li key={a.id}>
                <time dateTime={a.created_at} className="ugm-num ugm-muted">
                  {fechaCorta(a.created_at)}
                </time>
                <span>
                  <b>{nom(a.actor)}</b> {ACCION_BITACORA[a.accion] ?? a.accion.replace(/_/g, " ")} {a.indicador && <span className="ugm-cod">{a.indicador}</span>}
                  {a.de && a.a ? (
                    <small>
                      {" "}
                      {a.de} → {a.a}
                    </small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
