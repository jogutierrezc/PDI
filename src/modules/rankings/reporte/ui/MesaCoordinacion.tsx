/* Mesa de coordinación: cada indicador con sus aportaciones de varias oficinas. Planeación aprueba, devuelve y marca la oficial. */

import { Fragment, useMemo, useRef, useState } from "react";
import type { RankingCycleRow, RankingResponseRow } from "../../../../types/database";
import { aportesDe, asignacionDe, catalogoOrdenado, estadoIndicador, oficialMarcada, respuestaOficial } from "../resumen";
import { ETIQUETA_ESTADO, ESTADOS, transicionPermitida } from "../estados";
import { useAsignarIndicador, useMarcarOficial, useRevisarRespuesta } from "../datos";
import type { UnidadRef } from "../datos";
import type { Asignacion, EstadoRespuesta, Indicador } from "../tipos";
import { EstadoPill, OdsChip, fmtNumero } from "./comunes";
import { useEntrada } from "../../movimiento";

interface Props {
  ciclo: RankingCycleRow;
  indicadores: Indicador[];
  asignaciones: Asignacion[];
  respuestas: RankingResponseRow[];
  unidades: UnidadRef[];
  odsInicial: number | null;
}

type Modo = "aportes" | "asignar";

export function MesaCoordinacion({ ciclo, indicadores, asignaciones, respuestas, unidades, odsInicial }: Props) {
  const [ods, setOds] = useState<number | "todos">(odsInicial ?? "todos");
  const [estadoF, setEstadoF] = useState<EstadoRespuesta | "todos">("todos");
  const [unidadF, setUnidadF] = useState<string>("");
  const [abierto, setAbierto] = useState<{ id: string; modo: Modo } | null>(null);

  const nombre = useMemo(() => new Map(unidades.map((u) => [u.id, u.name])), [unidades]);
  const nombreDe = (id: string) => nombre.get(id) ?? "Oficina";

  const todas = useMemo(
    () =>
      catalogoOrdenado(indicadores, ciclo.ods_priorizados).map((i) => {
        const sugerida = asignacionDe(i.id, asignaciones);
        const aportes = aportesDe(i.id, respuestas);
        return {
          ind: i,
          ...sugerida,
          aportes,
          porRevisar: aportes.filter((r) => r.estado === "sent").length,
          oficial: respuestaOficial(i.id, respuestas),
          marcada: oficialMarcada(i.id, respuestas),
          estado: estadoIndicador(i.id, respuestas),
        };
      }),
    [indicadores, asignaciones, respuestas, ciclo.ods_priorizados],
  );

  const odsPresentes = useMemo(() => [...new Set(todas.map((f) => f.ind.ods))].sort((a, b) => a - b), [todas]);

  const filas = todas
    .filter((f) => ods === "todos" || f.ind.ods === ods)
    .filter((f) => estadoF === "todos" || f.estado === estadoF)
    .filter((f) => !unidadF || f.principal === unidadF || f.apoyo.includes(unidadF) || f.aportes.some((r) => r.unidad === unidadF));

  const conRevision = filas.filter((f) => f.porRevisar > 0).length;

  return (
    <div className="rk-rep-stack">
      <div className="rk-rep-filtros" role="group" aria-label="Filtros de la mesa">
        <label className="rk-rep-field-inline">
          <span>ODS</span>
          <select className="rk-rep-select" value={ods} onChange={(e) => setOds(e.target.value === "todos" ? "todos" : Number(e.target.value))}>
            <option value="todos">Todos los ODS</option>
            {odsPresentes.map((n) => (
              <option key={n} value={n}>
                ODS {n}
                {ciclo.ods_priorizados.includes(n) ? " (priorizado)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="rk-rep-field-inline">
          <span>Oficina</span>
          <select className="rk-rep-select" value={unidadF} onChange={(e) => setUnidadF(e.target.value)}>
            <option value="">Cualquiera</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rk-rep-chips" role="group" aria-label="Estado oficial">
          <button type="button" className="rk-rep-fchip" aria-pressed={estadoF === "todos"} onClick={() => setEstadoF("todos")}>
            Cualquier estado
          </button>
          {ESTADOS.map((e) => (
            <button key={e} type="button" className="rk-rep-fchip" aria-pressed={estadoF === e} onClick={() => setEstadoF(e)}>
              {ETIQUETA_ESTADO[e]}
            </button>
          ))}
        </div>
      </div>

      <p className="rk-rep-small rk-rep-muted" aria-live="polite">
        {fmtNumero(filas.length, 0)} {filas.length === 1 ? "indicador" : "indicadores"} con esos filtros
        {conRevision > 0 && (
          <>
            {" "}
            · <b className="rk-rep-num">{fmtNumero(conRevision, 0)}</b> con envíos por revisar
          </>
        )}
        . Los ODS priorizados van al frente.
      </p>

      <div className="rk-rep-tabla-wrap">
        <table className="rk-rep-tabla">
          <thead>
            <tr>
              <th scope="col">ODS</th>
              <th scope="col">Indicador</th>
              <th scope="col">Responsable sugerido</th>
              <th scope="col">Peso</th>
              <th scope="col">Aportes</th>
              <th scope="col">Oficial</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="rk-rep-sr">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="rk-rep-muted">
                  Ningún indicador con esos filtros.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const abiertoAqui = abierto?.id === f.ind.id ? abierto.modo : null;
              return (
                <Fragment key={f.ind.id}>
                  <tr className="rk-rep-fila">
                    <td data-label="ODS">
                      <OdsChip ods={f.ind.ods} />
                    </td>
                    <td data-label="Indicador" className="rk-rep-texto">
                      <span className="rk-rep-code">{f.ind.id}</span>{" "}
                      <span className="rk-rep-corta" title={f.ind.texto_es || f.ind.texto_en}>
                        {f.ind.texto_es || f.ind.texto_en}
                      </span>
                    </td>
                    <td data-label="Responsable sugerido">
                      {f.principal ? <span className="rk-rep-corta">{nombreDe(f.principal)}</span> : <span className="rk-rep-muted">Sin sugerir</span>}
                    </td>
                    <td data-label="Peso" className="rk-rep-num">
                      {f.ind.peso === null ? "—" : `${fmtNumero(f.ind.peso * 100, 1)} %`}
                    </td>
                    <td data-label="Aportes">
                      <Aportes aportes={f.aportes} nombreDe={nombreDe} porRevisar={f.porRevisar} />
                    </td>
                    <td data-label="Oficial">
                      {f.oficial ? (
                        <span className="rk-rep-oficial">
                          <span className="rk-rep-corta">{nombreDe(f.oficial.unidad)}</span>
                          <small>{f.marcada ? "marcada" : "la más reciente"}</small>
                        </span>
                      ) : (
                        <span className="rk-rep-muted">Ninguna aprobada</span>
                      )}
                    </td>
                    <td data-label="Estado">
                      <EstadoPill estado={f.estado} />
                    </td>
                    <td data-label="Acciones" className="rk-rep-acc">
                      <div className="rk-rep-row">
                        <button
                          type="button"
                          className="rk-rep-btn is-sm"
                          aria-expanded={abiertoAqui === "aportes"}
                          onClick={() => setAbierto(abiertoAqui === "aportes" ? null : { id: f.ind.id, modo: "aportes" })}
                        >
                          Aportes
                        </button>
                        <button
                          type="button"
                          className="rk-rep-btn is-sm"
                          aria-expanded={abiertoAqui === "asignar"}
                          onClick={() => setAbierto(abiertoAqui === "asignar" ? null : { id: f.ind.id, modo: "asignar" })}
                        >
                          Responsable
                        </button>
                      </div>
                    </td>
                  </tr>
                  {abiertoAqui && (
                    <tr className="rk-rep-fila-panel">
                      <td colSpan={8}>
                        {abiertoAqui === "aportes" ? (
                          <PanelAportes
                            key={`p-${f.ind.id}`}
                            indicador={f.ind}
                            aportes={f.aportes}
                            oficialId={f.oficial?.id}
                            marcada={f.marcada}
                            nombreDe={nombreDe}
                            onListo={() => setAbierto(null)}
                          />
                        ) : (
                          <PanelAsignar
                            key={`a-${f.ind.id}`}
                            ciclo={ciclo.id}
                            indicador={f.ind.id}
                            principalActual={f.principal}
                            apoyoActual={f.apoyo}
                            unidades={unidades}
                            onListo={() => setAbierto(null)}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Las oficinas que aportaron, legibles en la fila: las dos primeras por nombre y el resto como «+n». */
function Aportes({ aportes, nombreDe, porRevisar }: { aportes: RankingResponseRow[]; nombreDe: (id: string) => string; porRevisar: number }) {
  if (aportes.length === 0) return <span className="rk-rep-muted">Sin aportes</span>;
  const vistos = aportes.slice(0, 2);
  const resto = aportes.length - vistos.length;
  return (
    <span className="rk-rep-aportes" title={aportes.map((r) => `${nombreDe(r.unidad)}: ${ETIQUETA_ESTADO[r.estado]}`).join(" · ")}>
      {vistos.map((r) => (
        <span key={r.id} className="rk-rep-aporte-chip" data-estado={r.estado}>
          <span aria-hidden="true">{GLIFO[r.estado]}</span>
          <span className="rk-rep-corta">{nombreDe(r.unidad)}</span>
          <span className="rk-rep-sr">: {ETIQUETA_ESTADO[r.estado]}</span>
        </span>
      ))}
      {resto > 0 && <span className="rk-rep-muted rk-rep-num">+{resto}</span>}
      {porRevisar > 0 && <span className="rk-rep-pill is-sent rk-rep-num">{porRevisar} por revisar</span>}
    </span>
  );
}

const GLIFO: Record<EstadoRespuesta, string> = { none: "○", draft: "◐", sent: "◉", back: "↺", ok: "●" };

/** Todas las aportaciones de un indicador, con aprobar, devolver y marcar la oficial (solo Planeación). */
function PanelAportes({
  indicador,
  aportes,
  oficialId,
  marcada,
  nombreDe,
  onListo,
}: {
  indicador: Indicador;
  aportes: RankingResponseRow[];
  oficialId: string | undefined;
  marcada: boolean;
  nombreDe: (id: string) => string;
  onListo: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEntrada(ref, ".rk-rep-panel-item", indicador.id);

  return (
    <div className="rk-rep-panel" ref={ref}>
      <p className="rk-rep-small rk-rep-panel-item">
        <b>Qué pide THE:</b> {indicador.tipo_requerimiento || indicador.texto_en || "Sin texto de requerimiento en el catálogo."}
      </p>
      <p className="rk-rep-small rk-rep-muted rk-rep-panel-item">
        {marcada
          ? "La oficial la marcó Planeación. Para cambiarla, marque otra aprobada."
          : "Sin marca, la oficial es la aprobada más reciente. Marque la que va a THE para fijarla."}{" "}
        Aprobar, devolver o marcar no borra ninguna aportación.
      </p>
      {aportes.length === 0 ? (
        <p className="rk-rep-vacio rk-rep-panel-item">Ninguna oficina ha aportado a este indicador todavía.</p>
      ) : (
        <ul className="rk-rep-lista-ev rk-rep-panel-item">
          {aportes.map((r) => (
            <AporteFila key={r.id} respuesta={r} nombre={nombreDe(r.unidad)} esOficial={r.id === oficialId} marcada={marcada && r.id === oficialId} />
          ))}
        </ul>
      )}
      <div className="rk-rep-row rk-rep-panel-item">
        <button type="button" className="rk-rep-btn" onClick={onListo}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function AporteFila({ respuesta, nombre, esOficial, marcada }: { respuesta: RankingResponseRow; nombre: string; esOficial: boolean; marcada: boolean }) {
  const [nota, setNota] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisar = useRevisarRespuesta();
  const marcar = useMarcarOficial();
  const ocupado = revisar.isPending || marcar.isPending;
  const puedeAprobar = transicionPermitida(respuesta.estado, "ok", "planeacion");
  const puedeDevolver = transicionPermitida(respuesta.estado, "back", "planeacion");

  async function decidir(a: "ok" | "back") {
    setError(null);
    try {
      await revisar.mutateAsync({ respuesta, a, nota, actor: "planeacion" });
      setDevolviendo(false);
      setNota("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la decisión.");
    }
  }

  async function marcarOficial() {
    setError(null);
    try {
      await marcar.mutateAsync({ respuesta, actor: "planeacion" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como oficial.");
    }
  }

  return (
    <li className={`rk-rep-aporte ${esOficial ? "is-oficial" : ""}`}>
      <div className="rk-rep-ev-cuerpo">
        <div className="rk-rep-row">
          <b className="rk-rep-wrap">{nombre}</b>
          <EstadoPill estado={respuesta.estado} />
          {esOficial && <span className="rk-rep-pill is-ok">{marcada ? "Oficial" : "Oficial por ser la más reciente"}</span>}
        </div>
        {respuesta.comentario_es && <p className="rk-rep-small rk-rep-clamp">{respuesta.comentario_es}</p>}
        {respuesta.estado === "back" && respuesta.nota_revision && <p className="rk-rep-small rk-rep-muted">Nota enviada: {respuesta.nota_revision}</p>}
        {devolviendo && (
          <label className="rk-rep-field">
            <span className="rk-rep-lbl">Nota para {nombre} (obligatoria)</span>
            <textarea className="rk-rep-textarea" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
          </label>
        )}
        {error && (
          <p className="rk-rep-aviso-linea is-risk" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="rk-rep-row rk-rep-aporte-acc">
        {respuesta.estado === "ok" && !marcada && (
          <button type="button" className="rk-rep-btn is-sm is-primary" onClick={() => void marcarOficial()} disabled={ocupado}>
            {marcar.isPending ? "Marcando…" : "Marcar como oficial"}
          </button>
        )}
        {puedeAprobar && (
          <button type="button" className="rk-rep-btn is-sm is-primary" onClick={() => void decidir("ok")} disabled={ocupado}>
            Aprobar
          </button>
        )}
        {puedeDevolver &&
          (devolviendo ? (
            <button type="button" className="rk-rep-btn is-sm is-danger" onClick={() => void decidir("back")} disabled={ocupado || !nota.trim()}>
              Confirmar devolución
            </button>
          ) : (
            <button type="button" className="rk-rep-btn is-sm is-danger" onClick={() => setDevolviendo(true)} disabled={ocupado}>
              Devolver con nota
            </button>
          ))}
      </div>
    </li>
  );
}

function PanelAsignar({
  ciclo,
  indicador,
  principalActual,
  apoyoActual,
  unidades,
  onListo,
}: {
  ciclo: string;
  indicador: string;
  principalActual: string | null;
  apoyoActual: string[];
  unidades: UnidadRef[];
  onListo: () => void;
}) {
  const [principal, setPrincipal] = useState<string | null>(principalActual);
  const [apoyo, setApoyo] = useState<string[]>(apoyoActual);
  const [aAgregar, setAAgregar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guardar = useAsignarIndicador();
  const ref = useRef<HTMLDivElement>(null);
  useEntrada(ref, ".rk-rep-panel-item", indicador);

  const opciones = unidades.filter((u) => u.id !== principal && !apoyo.includes(u.id));

  async function enviar() {
    setError(null);
    try {
      await guardar.mutateAsync({ ciclo, indicador, principal, apoyo });
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el responsable sugerido.");
    }
  }

  return (
    <div className="rk-rep-panel" ref={ref}>
      <p className="rk-rep-small rk-rep-muted rk-rep-panel-item">
        El responsable sugerido orienta a la oficina; no le impide aportar. Cualquier oficina con función de Gestor o Contribuyente puede aportar a este indicador.
      </p>
      <div className="rk-rep-grid-2 rk-rep-panel-item">
        <label className="rk-rep-field">
          <span className="rk-rep-lbl">Responsable sugerido</span>
          <select className="rk-rep-select" value={principal ?? ""} onChange={(e) => setPrincipal(e.target.value || null)}>
            <option value="">Sin sugerir</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rk-rep-field">
          <label className="rk-rep-lbl" htmlFor={`ap-${indicador}`}>
            Apoyo sugerido
          </label>
          <div className="rk-rep-row">
            <select id={`ap-${indicador}`} className="rk-rep-select" value={aAgregar} onChange={(e) => setAAgregar(e.target.value)}>
              <option value="">Elija una oficina…</option>
              {opciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rk-rep-btn is-sm"
              disabled={!aAgregar}
              onClick={() => {
                setApoyo([...apoyo, aAgregar]);
                setAAgregar("");
              }}
            >
              Agregar
            </button>
          </div>
          <ul className="rk-rep-chips" aria-label="Apoyo sugerido elegido">
            {apoyo.map((id) => (
              <li key={id}>
                <button type="button" className="rk-rep-fchip" onClick={() => setApoyo(apoyo.filter((x) => x !== id))}>
                  {unidades.find((u) => u.id === id)?.name ?? "Oficina"} <span aria-hidden="true">×</span>
                  <span className="rk-rep-sr">quitar</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {error && (
        <p className="rk-rep-aviso-linea is-risk" role="alert">
          {error}
        </p>
      )}
      <div className="rk-rep-row rk-rep-panel-item">
        <button type="button" className="rk-rep-btn is-primary" onClick={() => void enviar()} disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar sugerencia"}
        </button>
        <button type="button" className="rk-rep-btn" onClick={onListo}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
