/* =============================================================================
   THE Impact · publicación: la lista de entrega a THE. La administración marca
   «lista» una respuesta aprobada cuando está completa para subirla al portal de THE
   (migración 0240). Marcar exige respuesta aprobada y, si la metodología pide
   evidencia, al menos una. Si la respuesta se devuelve o se reabre, la marca se
   retira sola. Todavía no existe una página pública de indicadores de THE Impact:
   la entrega al portal de THE se hace a mano, con lo que esta lista deja ordenado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { odsNombre, odsVars } from "../../ods";
import { Alerta, Cargando, ErrorConsulta, Vacio, entrar } from "../../uigreen/ui/comunes";
import { requisitoDe, useEntregaThi, useMarcarListaThi } from "../datos";
import { METODOLOGIA } from "../lib/metodologia";
import { useThi } from "./contexto";
import { EstadoThi } from "./piezas";

type Filtro = "aprobadas" | "listas" | "todas";

export function Entrega() {
  const t = useThi();
  const entrega = useEntregaThi(t.ciclo.id, t.esAdmin);
  const marcar = useMarcarListaThi();
  const [filtro, setFiltro] = useState<Filtro>("aprobadas");
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => entrar(raiz.current, ":scope > section"), [filtro]);

  const filas = useMemo(() => {
    const todas = entrega.data ?? [];
    return todas
      .filter((f) => (filtro === "aprobadas" ? f.estado === "ok" : filtro === "listas" ? f.lista : true))
      .sort((a, b) => Number(a.indicador.split(".")[0]) - Number(b.indicador.split(".")[0]) || a.indicador.localeCompare(b.indicador, "es", { numeric: true }));
  }, [entrega.data, filtro]);

  const cobertura = useMemo(() => {
    const listas = (entrega.data ?? []).filter((f) => f.lista);
    const ods = [...new Set(listas.map((f) => Number(f.indicador.split(".")[0])))].sort((a, b) => a - b);
    return ods;
  }, [entrega.data]);

  if (!t.esAdmin) return <Vacio>La lista de entrega la gestiona la administración del ranking (Planeación o más).</Vacio>;
  if (entrega.isLoading) return <Cargando texto="Leyendo la lista de entrega…" />;
  if (entrega.error) return <ErrorConsulta error={entrega.error} reintentar={() => void entrega.refetch()} />;

  const listas = (entrega.data ?? []).filter((f) => f.lista).length;
  const aprobadas = (entrega.data ?? []).filter((f) => f.estado === "ok").length;
  const faltaSiete = !cobertura.includes(METODOLOGIA.odsObligatorio);

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec">
        <h2>Lista de entrega a THE</h2>
        <ul className="ugm-contadores">
          <li>
            <b className="ugm-num">{aprobadas}</b> aprobadas
          </li>
          <li>
            <b className="ugm-num">{listas}</b> listas para la entrega
          </li>
          <li>
            <b className="ugm-num">{cobertura.length}</b> ODS con algo listo{cobertura.length ? ` (${cobertura.join(", ")})` : ""}
          </li>
        </ul>
        {(cobertura.length < METODOLOGIA.minimoOds || faltaSiete) && listas > 0 && (
          <Alerta tipo="aviso">
            Para la clasificación general THE pide al menos {METODOLOGIA.minimoOds} ODS y el ODS {METODOLOGIA.odsObligatorio}.{faltaSiete ? ` Todavía no hay nada listo del ODS ${METODOLOGIA.odsObligatorio}.` : ""}
          </Alerta>
        )}
        <Alerta>
          Marcar «lista» no envía nada a THE: deja constancia de que la respuesta está aprobada y con su evidencia para subirla al portal de THE. Las publicaciones del portal público de informes ODS siguen su propio flujo.
        </Alerta>
        <div className="ugm-chips" role="group" aria-label="Qué mostrar">
          {(["aprobadas", "listas", "todas"] as Filtro[]).map((f) => (
            <button key={f} type="button" className="ugm-chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === "aprobadas" ? "Aprobadas" : f === "listas" ? "Marcadas listas" : "Todas las respuestas"}
            </button>
          ))}
        </div>
      </section>

      <section className="ugm-sec ugm-sec--tabla" aria-live="polite">
        {filas.length === 0 ? (
          <Vacio>{filtro === "aprobadas" ? "Todavía no hay respuestas aprobadas." : filtro === "listas" ? "Todavía no hay respuestas marcadas listas." : "No hay respuestas en este ciclo."}</Vacio>
        ) : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Oficina</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Evidencia</th>
                  <th scope="col">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const ods = Number(f.indicador.split(".")[0]);
                  const rq = requisitoDe(t.requisitos, f.indicador);
                  const bloqueada = f.motivo !== "" && !f.lista;
                  return (
                    <tr key={f.respuesta_id}>
                      <th scope="row" data-et="Indicador">
                        <b className="rk-odsmark thi-ods" style={odsVars(ods)} title={odsNombre(ods)}>
                          {ods}
                        </b>{" "}
                        <span className="ugm-cod ugm-num">{f.indicador}</span> {rq?.titulo ?? ""}
                      </th>
                      <td data-et="Oficina">{t.oficina(f.unidad)}</td>
                      <td data-et="Estado">
                        <EstadoThi estado={f.estado as "none" | "draft" | "sent" | "back" | "ok"} />
                      </td>
                      <td data-et="Evidencia">
                        <span className="ugm-num">{f.n_evidencias}</span>
                        {f.exigida && f.n_evidencias === 0 ? <span className="ugm-falta"> · falta</span> : null}
                        {f.publicas > 0 ? <small>{f.publicas} pública{f.publicas === 1 ? "" : "s"}</small> : f.n_evidencias > 0 ? <small>Ninguna cuenta como pública</small> : null}
                      </td>
                      <td data-et="Entrega">
                        <button
                          type="button"
                          className={`ugm-btn ugm-btn--sm${f.lista ? " ugm-btn--ok" : ""}`}
                          aria-pressed={f.lista}
                          disabled={marcar.isPending || bloqueada}
                          title={bloqueada ? f.motivo : undefined}
                          onClick={() =>
                            void t.hacer(
                              () => marcar.mutateAsync({ ciclo: t.ciclo.id, indicador: f.indicador, unidad: f.unidad, lista: !f.lista }),
                              f.lista ? "Retirada de la lista de entrega." : "Marcada lista para la entrega.",
                            )
                          }
                        >
                          {f.lista ? (
                            <>
                              <Icon name="check" size={14} /> Lista
                            </>
                          ) : (
                            "Marcar lista"
                          )}
                        </button>
                        {bloqueada && <small>{f.motivo}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
