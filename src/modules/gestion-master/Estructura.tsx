/* =============================================================================
   Gestión Master · Estructura de actividades.

   El catálogo del Master para un periodo y una sede, tal como lo capturó el
   Warehouse (ms_actdir): agrupado por tipo (directas y de apoyo), con cuántos
   profesores tiene cada código. Aquí no se edita el Master (el portal solo lo
   lee): «Proponer cambio» abre una solicitud de Mejorar o Eliminar con el código
   ya elegido. Se puede comparar con otro periodo: qué es nuevo, qué se retiró y
   qué cambió.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useActividades, useCortes } from "./api";
import type { Contexto } from "./contexto";
import { sedeUnica } from "./contexto";
import { horasTexto, nombrePeriodo, nombreSede, fechaCorta, type ActividadPeriodo } from "./modelo";
import { useEntrada } from "./movimiento";
import { Cargando, ErrorCaja, Fuente, Vacio } from "./partes";

const GRUPOS: [string, string][] = [
  ["directa", "Actividades directas"],
  ["apoyo", "Actividades de apoyo"],
  ["", "Sin clasificar"],
];

type Cambio = "nueva" | "retirada" | "modificada" | "";

function cambioDe(a: ActividadPeriodo, otra: Map<string, ActividadPeriodo>): Cambio {
  const o = otra.get(a.codigo);
  if (!o) return "nueva";
  return (o.nombre ?? "") !== (a.nombre ?? "") || o.tipo_actividad !== a.tipo_actividad || (o.vinculacion ?? "") !== (a.vinculacion ?? "") || o.activa !== a.activa ? "modificada" : "";
}

export function Estructura({ ctx }: { ctx: Contexto }) {
  const sede = sedeUnica(ctx.sede);
  const [comparar, setComparar] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const actual = useActividades(ctx.periodo, sede);
  const otro = useActividades(comparar || ctx.periodo, sede, Boolean(comparar));
  const cortes = useCortes(ctx.periodo);
  const cuerpo = useRef<HTMLDivElement>(null);
  useEntrada(cuerpo, ".gm-fila-tabla", `${ctx.periodo}|${sede}|${actual.isPending}`, !actual.isPending);

  const corte = cortes.data?.find((c) => c.sede === sede && c.conjunto === "ms_actdir");
  const filas = actual.data ?? [];
  const mapaOtro = useMemo(() => new Map((otro.data ?? []).map((a) => [a.codigo, a])), [otro.data]);
  const retiradas = comparar && otro.data ? otro.data.filter((a) => !filas.some((f) => f.codigo === a.codigo)) : [];

  const visibles = filas.filter((a) => {
    if (soloActivas && a.activa === false) return false;
    if (!busqueda) return true;
    const t = busqueda.toLowerCase();
    return `${a.codigo} ${a.nombre ?? ""}`.toLowerCase().includes(t);
  });

  return (
    <div className="gm-seccion-pagina" ref={cuerpo}>
      <Fuente>
        Catálogo del Master (ms_actdir) de {nombreSede(sede)}, {nombrePeriodo(ctx.periodo)}.{" "}
        {corte ? `Último corte capturado: ${fechaCorta(corte.terminada_en)}, versión ${corte.version}.` : "Todavía no hay captura de este periodo y sede."} El portal solo lee del Master; los cambios se piden con «Proponer cambio».
      </Fuente>
      <div className="gm-filtros">
        <label className="admin-field">
          <span>Comparar con</span>
          <select value={comparar} onChange={(e) => setComparar(e.target.value)}>
            <option value="">Sin comparar</option>
            {ctx.periodos.filter((p) => p !== ctx.periodo).slice(0, 12).map((p) => (
              <option key={p} value={p}>
                {nombrePeriodo(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código o nombre" autoComplete="off" />
        </label>
        <label className="gm-marcar gm-marcar--solo">
          <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
          Solo las activas
        </label>
      </div>

      {actual.isPending ? (
        <Cargando />
      ) : actual.error ? (
        <ErrorCaja error={actual.error} onReintentar={() => void actual.refetch()} titulo="No se pudo leer el catálogo" />
      ) : filas.length === 0 ? (
        <Vacio
          titulo={`Sin catálogo del Master para ${nombreSede(sede)}, ${nombrePeriodo(ctx.periodo)}`}
          texto="El Warehouse no tiene guardado el reporte «Actividades directas y de apoyo» (ms_actdir) de este periodo y sede. El Master solo entrega el periodo abierto: hay que capturarlo mientras lo está."
        />
      ) : (
        <>
          {comparar && otro.error && <p className="gm-aviso">No se pudo leer {nombrePeriodo(comparar)}: {otro.error.message}</p>}
          {comparar && otro.data?.length === 0 && <p className="gm-aviso">No hay captura de {nombrePeriodo(comparar)} para {nombreSede(sede)}: no hay con qué comparar.</p>}
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla gm-arbol">
              <caption className="sr-only">Estructura de actividades del Master</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Actividad</th>
                  <th scope="col">Vinculación</th>
                  <th scope="col" className="gm-num">Profesores</th>
                  <th scope="col" className="gm-num">Horas</th>
                  <th scope="col">Estado</th>
                  {comparar && otro.data && otro.data.length > 0 && <th scope="col">Frente a {nombrePeriodo(comparar)}</th>}
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {GRUPOS.map(([clave, nombre]) => {
                  const del = visibles.filter((a) => (clave === "" ? a.tipo_actividad !== "directa" && a.tipo_actividad !== "apoyo" : a.tipo_actividad === clave));
                  if (del.length === 0) return null;
                  const abierto = !cerrados.has(clave);
                  return (
                    <GrupoFilas key={clave} nombre={nombre} total={del.length} abierto={abierto} onAlternar={() => setCerrados((p) => { const n = new Set(p); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; })} columnas={comparar && otro.data && otro.data.length > 0 ? 8 : 7}>
                      {del.map((a) => {
                        const c = comparar && otro.data && otro.data.length > 0 ? cambioDe(a, mapaOtro) : "";
                        return (
                          <tr key={a.codigo} className="gm-fila-tabla">
                            <td className="gm-mono">{a.codigo}</td>
                            <td>{a.nombre ?? "—"}</td>
                            <td>{a.vinculacion ?? "—"}</td>
                            <td className="gm-num">{a.n_profesores ?? "—"}</td>
                            <td className="gm-num">{horasTexto(a.horas)}</td>
                            <td>
                              <span className="gm-pill" data-tono={a.activa === false ? "neutro" : "ok"}>
                                {a.activa === false ? "Inactiva" : "Activa"}
                              </span>
                              {a.solicitudes_abiertas > 0 && (
                                <button type="button" className="gm-enlace" onClick={() => ctx.ir("bandeja")}>
                                  {a.solicitudes_abiertas} {a.solicitudes_abiertas === 1 ? "solicitud abierta" : "solicitudes abiertas"}
                                </button>
                              )}
                            </td>
                            {comparar && otro.data && otro.data.length > 0 && (
                              <td>{c ? <span className="gm-pill" data-tono={c === "nueva" ? "ok" : "aviso"}>{c === "nueva" ? "Nueva" : "Modificada"}</span> : <span className="gm-muted">Igual</span>}</td>
                            )}
                            <td className="gm-acciones-fila">
                              <button type="button" className="button-ghost" onClick={() => ctx.ir("nueva", undefined, { tipo: "mejorar", codigo: a.codigo })}>
                                Proponer cambio
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </GrupoFilas>
                  );
                })}
              </tbody>
            </table>
          </div>
          {retiradas.length > 0 && (
            <p className="gm-nota">
              <b>Retiradas desde {nombrePeriodo(comparar)}:</b> {retiradas.map((r) => `${r.codigo} ${r.nombre ?? ""}`.trim()).join(" · ")}.
            </p>
          )}
          <p className="gm-nota">
            Las horas son la suma semanal de lo asignado a ese código en la nómina (ms_nom). Ni el catálogo ni la nómina traen horas tope por actividad: el Master no las reporta.
          </p>
        </>
      )}
    </div>
  );
}

function GrupoFilas({ nombre, total, abierto, onAlternar, columnas, children }: { nombre: string; total: number; abierto: boolean; onAlternar: () => void; columnas: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="gm-grupo">
        <td colSpan={columnas}>
          <button type="button" className="gm-grupo__boton" aria-expanded={abierto} onClick={onAlternar}>
            {nombre} ({total})
          </button>
        </td>
      </tr>
      {abierto && children}
    </>
  );
}
