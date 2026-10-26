/* =============================================================================
   Gestión Master · Conexión con el Warehouse.

   Qué lee el módulo (el último corte capturado del Master, por sede), qué
   queda por reflejar (cambios aprobados que Planeación debe aplicar a mano en
   el Master) y qué se escribe de vuelta (al cerrar el corte, las solicitudes y
   decisiones del periodo y la sede se cargan al Warehouse como el conjunto
   «gm_solicitudes»). El portal NO escribe en el Master: una solicitud pasa de
   «aprobada» a «reflejada» cuando la siguiente captura de ms_actdir ya trae el
   cambio (Conciliar).
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { cerrarCorte, useConciliar, useConsultasNombres, useCortes, useLista, useMarcarAplicada, type ResultadoCorte } from "./api";
import type { Contexto } from "./contexto";
import { sedeUnica } from "./contexto";
import { APLICACION, SEDES, fechaCorta, fechaHora, mensajeDe, nombrePeriodo, nombreSede, type Detalle, type FilaLista } from "./modelo";
import { useEntrada } from "./movimiento";
import { Cargando, ErrorCaja, PastillaAplicacion, Vacio } from "./partes";

const CONJUNTOS: [string, string][] = [
  ["ms_actdir", "Actividades directas y de apoyo (catálogo)"],
  ["ms_nom", "Nómina docente con estado (profesores y horas)"],
  ["ms_doc", "Docentes (catálogo; los nombres no se guardan)"],
];

function csv(filas: string[][]): string {
  return filas.map((f) => f.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function Conexion({ ctx }: { ctx: Contexto }) {
  const sede = sedeUnica(ctx.sede);
  const gestor = ctx.nivel === "gestor";
  const cortes = useCortes(ctx.periodo);
  const lista = useLista(ctx.periodo, "todas");
  const conciliar = useConciliar();
  const aplicar = useMarcarAplicada();
  const consultas = useConsultasNombres(gestor);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [nota, setNota] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [corte, setCorte] = useState<ResultadoCorte | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEntrada(raiz, ".gm-fila-tabla", `${ctx.periodo}|${cortes.isPending}|${lista.isPending}`, !cortes.isPending && !lista.isPending);

  const porReflejar = useMemo(() => (lista.data ?? []).filter((s) => s.estado === "aprobada" && s.aplicacion !== "reflejada"), [lista.data]);

  if (!gestor) return <Vacio titulo="Solo Planeación gestiona la conexión" texto="Aquí se concilia con el Warehouse, se marcan los cambios aplicados y se cierra el corte. Quien solicita o revisa ve el estado de cada solicitud en la bandeja." />;

  async function conciliarSede(s: string) {
    setMensaje("");
    setError("");
    try {
      const r = await conciliar.mutateAsync({ periodo: ctx.periodo, sede: s });
      setMensaje(r.length ? `Ya reflejadas en el Master: ${r.map((x) => x.folio).join(", ")}.` : `Ninguna solicitud cambió: la captura más reciente de ${nombreSede(s)} todavía no trae los cambios aprobados.`);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  async function marcar(s: FilaLista) {
    setError("");
    try {
      await aplicar.mutateAsync({ id: s.id, nota: (nota[s.id] ?? "").trim() });
      setNota((n) => ({ ...n, [s.id]: "" }));
      setMensaje(`${s.folio} quedó marcada como aplicada. La próxima captura de ms_actdir la confirma.`);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  /** El exportable para Planeación: qué cambiar en el Master, con lo vigente y lo aprobado. */
  async function descargar() {
    setError("");
    try {
      const filas: string[][] = [["folio", "periodo", "sede", "tipo", "codigo", "campo", "valor_vigente_en_master", "valor_aprobado", "aprobada_el"]];
      for (const s of porReflejar.filter((x) => x.aplicacion === "sin_aplicar")) {
        const r = await supabase.rpc("gm_detalle", { p_id: s.id });
        if (r.error) throw new Error(mensajeDe(r.error));
        const d = r.data as Detalle;
        for (const l of d.lineas) {
          const cat = l.antes?.ficha?.catalogo;
          const pares: [string, string, string][] =
            d.tipo === "eliminar"
              ? [["estado", cat?.activa === false ? "Inactiva" : "Activa", "Inactiva"]]
              : d.tipo === "nuevo"
                ? [["crear", "", `${l.nombre ?? ""} (${l.tipo_actividad ?? ""}; ${l.vinculacion ?? ""})`]]
                : [
                    ["nombre", cat?.nombre ?? "", l.nombre ?? ""],
                    ["tipo", cat?.directa === true ? "directa" : cat?.directa === false ? "apoyo" : "", l.tipo_actividad ?? ""],
                    ["vinculacion", cat?.vinculacion ?? "", l.vinculacion ?? ""],
                    ["instrucciones", cat?.instrucciones ?? "", l.instrucciones ?? ""],
                  ];
          for (const [campo, vigente, aprobado] of pares) if (vigente !== aprobado) filas.push([d.folio, d.periodo, d.sede, d.tipo, l.codigo ?? "", campo, vigente, aprobado, d.resuelta_en ?? ""]);
        }
      }
      if (filas.length === 1) {
        setMensaje("No hay cambios aprobados sin aplicar: no hay nada que exportar.");
        return;
      }
      const url = URL.createObjectURL(new Blob(["﻿" + csv(filas)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `gestion-master-por-aplicar-${ctx.periodo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMensaje(`Se descargaron ${filas.length - 1} cambios por aplicar en el Master.`);
    } catch (e) {
      setError(mensajeDe(e));
    }
  }

  async function cerrar() {
    setError("");
    setCerrando(true);
    try {
      setCorte(await cerrarCorte(ctx.periodo, sede, motivo.trim()));
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="gm-seccion-pagina" ref={raiz}>
      <section aria-labelledby="gm-lee">
        <h3 id="gm-lee">Lo que el módulo lee del Warehouse</h3>
        <p className="gm-nota">Último corte capturado del Master para {nombrePeriodo(ctx.periodo)}. Cada captura es una versión guardada por sede; el módulo siempre lee la vigente. Solo Bucaramanga está verificada contra el Master; las demás sedes usan las mismas rutas sin confirmar.</p>
        {cortes.isPending ? (
          <Cargando filas={3} />
        ) : cortes.error ? (
          <ErrorCaja error={cortes.error} onReintentar={() => void cortes.refetch()} />
        ) : (
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Capturas del Warehouse por sede</caption>
              <thead>
                <tr>
                  <th scope="col">Sede</th>
                  {CONJUNTOS.map(([id, nombre]) => (
                    <th key={id} scope="col">
                      {nombre}
                      <small className="gm-mono"> {id}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEDES.map((s) => (
                  <tr key={s.id} className="gm-fila-tabla">
                    <th scope="row">{s.nombre}</th>
                    {CONJUNTOS.map(([id]) => {
                      const c = cortes.data?.find((x) => x.sede === s.id && x.conjunto === id);
                      return (
                        <td key={id}>
                          {c ? (
                            <>
                              {fechaCorta(c.terminada_en)}
                              <small>
                                {" "}
                                · v{c.version} · {c.filas.toLocaleString("es-CO")} filas
                              </small>
                            </>
                          ) : (
                            <span className="gm-pill" data-tono="aviso">
                              Sin captura
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="gm-nota">La captura de cada conjunto se hace en Warehouse › Cargas. El catálogo (ms_actdir) solo se puede capturar mientras el periodo está abierto en el Master.</p>
      </section>

      <section aria-labelledby="gm-reflejar">
        <h3 id="gm-reflejar">Cambios aprobados por reflejar en el Master</h3>
        <p className="gm-nota">Planeación aplica cada cambio en el Master a mano y lo marca aquí. Cuando una captura nueva de ms_actdir ya trae el cambio, «Conciliar» la pasa a «reflejada» sola.</p>
        <div className="gm-botones">
          <button type="button" className="button-secondary" onClick={() => void descargar()}>
            Descargar los cambios por aplicar (CSV)
          </button>
          {SEDES.map((s) => (
            <button key={s.id} type="button" className="button-ghost" disabled={conciliar.isPending} onClick={() => void conciliarSede(s.id)}>
              Conciliar {s.nombre}
            </button>
          ))}
        </div>
        {mensaje && <p className="gm-nota" role="status">{mensaje}</p>}
        {error && <p className="gm-error" role="alert">{error}</p>}
        {lista.isPending ? (
          <Cargando filas={3} />
        ) : porReflejar.length === 0 ? (
          <Vacio titulo="Nada por reflejar" texto="Cuando se apruebe una solicitud de este periodo aparecerá aquí como tarea." />
        ) : (
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Solicitudes aprobadas por reflejar</caption>
              <thead>
                <tr>
                  <th scope="col">Solicitud</th>
                  <th scope="col">Sede</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {porReflejar.map((s) => (
                  <tr key={s.id} className="gm-fila-tabla">
                    <td>
                      <button type="button" className="gm-enlace" onClick={() => ctx.ir("bandeja", s.id)}>
                        <span className="gm-mono">{s.folio}</span>
                      </button>{" "}
                      {s.lineas.map((l) => l.codigo ?? l.nombre).slice(0, 2).join(", ")}
                    </td>
                    <td>{nombreSede(s.sede)}</td>
                    <td>
                      <PastillaAplicacion aplicacion={s.aplicacion} />
                    </td>
                    <td>
                      {s.aplicacion === "sin_aplicar" ? (
                        <div className="gm-en-linea">
                          <label className="sr-only" htmlFor={`gm-ap-${s.id}`}>
                            Qué se aplicó en {s.folio}
                          </label>
                          <input id={`gm-ap-${s.id}`} value={nota[s.id] ?? ""} onChange={(e) => setNota((n) => ({ ...n, [s.id]: e.target.value }))} placeholder="Qué se aplicó" />
                          <button type="button" className="button-secondary" disabled={(nota[s.id] ?? "").trim().length < 5 || aplicar.isPending} onClick={() => void marcar(s)}>
                            Marcar aplicada
                          </button>
                        </div>
                      ) : (
                        <span className="gm-muted">{APLICACION[s.aplicacion ?? "aplicada"]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="gm-escribe">
        <h3 id="gm-escribe">Cerrar el corte: lo que se escribe en el Warehouse</h3>
        <p className="gm-nota">
          Carga las solicitudes y decisiones de {nombrePeriodo(ctx.periodo)} en {nombreSede(sede)} como el conjunto <span className="gm-mono">gm_solicitudes</span> (una fila por evento y actividad), con su versión y huella, por el mismo camino que usan los demás reportes. Del solicitante queda solo un seudónimo: no hay nombres ni justificaciones. Pide acceso al Warehouse (Planeación).
        </p>
        <div className="gm-rejilla">
          <label className="admin-field gm-ancho">
            <span>Motivo (obligatorio solo si el periodo ya está cerrado en el Warehouse)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. cierre del corte de octubre" />
          </label>
          <button type="button" className="button-primary" disabled={cerrando} onClick={() => void cerrar()}>
            {cerrando ? "Cargando al Warehouse…" : `Cerrar el corte de ${nombreSede(sede)}`}
          </button>
        </div>
        {corte && (
          <p className="gm-nota" role="status">
            {corte.duplicada ? `Sin cambios: ese contenido ya estaba guardado (versión ${corte.version}).` : `Listo: ${corte.filas} filas guardadas como la versión ${corte.version} de gm_solicitudes.`}
          </p>
        )}
      </section>

      <section aria-labelledby="gm-nombres">
        <h3 id="gm-nombres">Quién vio los nombres de los docentes</h3>
        <p className="gm-nota">Los nombres no se guardan en el Warehouse ni en el portal: se leen del Master en el momento. Cada consulta queda anotada.</p>
        {consultas.isPending ? (
          <Cargando filas={2} />
        ) : consultas.error ? (
          <ErrorCaja error={consultas.error} />
        ) : (consultas.data ?? []).length === 0 ? (
          <p className="gm-muted">Todavía nadie ha consultado nombres.</p>
        ) : (
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Consultas de nombres de docentes</caption>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Código</th>
                  <th scope="col">Sede y periodo</th>
                  <th scope="col" className="gm-num">Docentes</th>
                </tr>
              </thead>
              <tbody>
                {(consultas.data ?? []).map((c, i) => (
                  <tr key={`${c.creada_en}-${i}`}>
                    <td>{fechaHora(c.creada_en)}</td>
                    <td>{c.usuario}</td>
                    <td className="gm-mono">{c.codigo}</td>
                    <td>
                      {nombreSede(c.sede)} · {nombrePeriodo(c.periodo)}
                    </td>
                    <td className="gm-num">{c.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
