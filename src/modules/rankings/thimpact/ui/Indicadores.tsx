/* =============================================================================
   THE Impact · catálogo del ciclo con lo que pide la metodología de cada indicador
   (tipo, evidencia exigida, puntos), el estado de las respuestas y su ficha.
   La ficha reúne la pregunta de THE, quién responde, las evidencias en UDrive y la
   bitácora del indicador. Al final, la importación del Excel de THE (catálogo y
   diligenciado), que ya existía y no cambia.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { estadoIndicador } from "../../reporte/resumen";
import { ETIQUETA_ESTADO } from "../../reporte/estados";
import { ImportarCatalogo } from "../../reporte/ui/ImportarCatalogo";
import { ImportarDiligenciado } from "../../reporte/ui/ImportarDiligenciado";
import { odsNombre, odsVars } from "../../ods";
import { Alerta, Vacio, entrar, fechaCorta, hace } from "../../uigreen/ui/comunes";
import { usePerfiles } from "../../uigreen/ui/lectura";
import { useBitacoraThi, requisitoDe } from "../datos";
import type { RequisitoThi } from "../datos";
import { TEXTO_EVIDENCIA, TEXTO_TIPO } from "../lib/metodologia";
import { useThi } from "./contexto";
import { EvidenciasThi } from "./Evidencias";
import { EstadoThi, ACCION_BITACORA } from "./piezas";

type FiltroEvidencia = "todas" | "obligatoria" | "respaldo" | "no_aplica";

export function Indicadores({ q, odsInicial }: { q: string | null; odsInicial: number | null }) {
  if (q) return <Ficha id={q} />;
  return <Lista odsInicial={odsInicial} />;
}

function Lista({ odsInicial }: { odsInicial: number | null }) {
  const t = useThi();
  const [ods, setOds] = useState<number | "todos">(odsInicial ?? "todos");
  const [evid, setEvid] = useState<FiltroEvidencia>("todas");
  const [estado, setEstado] = useState<string>("todos");
  const [texto, setTexto] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => entrar(raiz.current, ":scope > section"), []);

  const filas = useMemo(() => {
    const ind = t.indicadores.filter((i) => i.nivel === "indicator");
    const pri = t.ciclo.ods_priorizados;
    return ind
      .filter((i) => (ods === "todos" ? true : i.ods === ods))
      .map((i) => ({ i, rq: requisitoDe(t.requisitos, i.id), est: estadoIndicador(i.id, t.respuestas) }))
      .filter((f) => evid === "todas" || (f.rq?.evidencia ?? "respaldo") === evid)
      .filter((f) => estado === "todos" || f.est === estado)
      .filter((f) => !texto || `${f.i.id} ${f.i.texto_es} ${f.i.texto_en} ${f.rq?.titulo ?? ""}`.toLowerCase().includes(texto.toLowerCase()))
      .sort((a, b) => Number(pri.includes(b.i.ods)) - Number(pri.includes(a.i.ods)) || a.i.ods - b.i.ods || a.i.orden - b.i.orden);
  }, [t.indicadores, t.requisitos, t.respuestas, t.ciclo.ods_priorizados, ods, evid, estado, texto]);

  const odsDelCatalogo = useMemo(() => [...new Set(t.indicadores.map((i) => i.ods))].sort((a, b) => a - b), [t.indicadores]);
  const oficinaDe = (id: string) => t.asignaciones.find((a) => a.indicador === id && a.rol === "principal")?.unidad;

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec ugm-filtros" aria-label="Filtros del catálogo">
        <div className="ugm-chips" role="group" aria-label="ODS">
          <button type="button" className="ugm-chip" aria-pressed={ods === "todos"} onClick={() => setOds("todos")}>
            Todos
          </button>
          {odsDelCatalogo.map((o) => (
            <button key={o} type="button" className="ugm-chip ugm-chip--num" aria-pressed={ods === o} aria-label={`ODS ${o}: ${odsNombre(o)}`} onClick={() => setOds(ods === o ? "todos" : o)}>
              {o}
            </button>
          ))}
        </div>
        <div className="ugm-fila-form">
          <div className="ugm-campo">
            <label className="ugm-sr" htmlFor="thi-f-evid">
              Evidencia que exige la metodología
            </label>
            <select id="thi-f-evid" className="ugm-input ugm-input--sel ugm-input--sm" value={evid} onChange={(e) => setEvid(e.target.value as FiltroEvidencia)}>
              <option value="todas">Cualquier evidencia</option>
              <option value="obligatoria">Evidencia obligatoria</option>
              <option value="respaldo">Evidencia de respaldo</option>
              <option value="no_aplica">No pide evidencia</option>
            </select>
          </div>
          <div className="ugm-campo">
            <label className="ugm-sr" htmlFor="thi-f-estado">
              Estado
            </label>
            <select id="thi-f-estado" className="ugm-input ugm-input--sel ugm-input--sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="todos">Cualquier estado</option>
              {(Object.keys(ETIQUETA_ESTADO) as (keyof typeof ETIQUETA_ESTADO)[]).map((k) => (
                <option key={k} value={k}>
                  {ETIQUETA_ESTADO[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="ugm-buscar ugm-campo">
            <Icon name="search" size={16} />
            <label className="ugm-sr" htmlFor="thi-f-texto">
              Buscar un indicador
            </label>
            <input id="thi-f-texto" className="ugm-input" type="search" placeholder="Buscar por código o texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="ugm-sec ugm-sec--tabla" aria-live="polite">
        {t.indicadores.length === 0 ? (
          <Vacio>El ciclo no tiene catálogo. Importe el Excel de THE aquí abajo o cree un ciclo copiando el anterior.</Vacio>
        ) : filas.length === 0 ? (
          <Vacio>Ningún indicador cumple esos filtros.</Vacio>
        ) : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Qué pide THE</th>
                  <th scope="col">Evidencia</th>
                  <th scope="col">Oficina sugerida</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 250).map(({ i, rq, est }) => (
                  <tr key={i.id}>
                    <th scope="row" data-et="Indicador">
                      <Link className="ugm-link" to={`?v=indicadores&q=${encodeURIComponent(i.id)}${t.ciclo.id ? `&ciclo=${t.ciclo.id}` : ""}`}>
                        <b className="rk-odsmark thi-ods" style={odsVars(i.ods)}>
                          {i.ods}
                        </b>{" "}
                        <span className="ugm-cod ugm-num">{i.id}</span> {rq?.titulo ?? i.texto_es}
                      </Link>
                    </th>
                    <td data-et="Qué pide THE">{rq ? TEXTO_TIPO[rq.tipo] : i.tipo ? TEXTO_TIPO[i.tipo] : "—"}</td>
                    <td data-et="Evidencia">
                      <ChipEvidencia rq={rq} />
                    </td>
                    <td data-et="Oficina sugerida">{oficinaDe(i.id) ? t.oficina(oficinaDe(i.id)) : <span className="ugm-falta">Sin oficina</span>}</td>
                    <td data-et="Estado">
                      <EstadoThi estado={est} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filas.length > 250 && <p className="ugm-muted ugm-peq">Se muestran los primeros 250 de {filas.length}. Afine los filtros.</p>}
        <p className="ugm-muted ugm-peq">
          Lo que pide cada indicador sale de la {t.cfg?.metodologia === "the-2027" ? "metodología 2027, versión 1.1" : "metodología de referencia"} (migración 0238). El catálogo, los pesos y los textos salen del Excel de THE.
        </p>
      </section>

      {t.esAdmin && (
        <section className="ugm-sec">
          <details className="thi-reglas" open={t.indicadores.length === 0}>
            <summary>Importar el Excel de THE (catálogo y diligenciado)</summary>
            <div className="thi-importar">
              <ImportarCatalogo ciclo={t.ciclo} />
              <ImportarDiligenciado ciclo={t.ciclo} indicadores={t.indicadores} respuestas={t.respuestas} unidades={t.unidades} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

export function ChipEvidencia({ rq }: { rq: RequisitoThi | undefined }) {
  if (!rq) return <span className="ugm-etq">Sin dato de la metodología</span>;
  const cls = rq.evidencia === "obligatoria" ? "ugm-etq--aviso" : rq.evidencia === "respaldo" ? "ugm-etq--tabla" : "";
  return <span className={`ugm-etq ${cls}`.trim()}>{TEXTO_EVIDENCIA[rq.evidencia].etiqueta}</span>;
}

function Ficha({ id }: { id: string }) {
  const t = useThi();
  const i = t.indicadores.find((x) => x.id === id);
  const rq = requisitoDe(t.requisitos, id);
  const respuestas = t.respuestas.filter((r) => r.indicador === id);
  const bit = useBitacoraThi(t.ciclo.id);
  const eventos = (bit.data ?? []).filter((a) => a.indicador === id);
  const actores = usePerfiles(eventos.map((a) => a.actor ?? "").filter(Boolean));
  const opciones = t.indicadores.filter((x) => x.padre === id && x.nivel === "option");
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => entrar(raiz.current, ":scope > section"), [id]);

  if (!i) {
    return (
      <div className="ugm-pila">
        <Vacio>El indicador {id} no está en el catálogo de este ciclo.</Vacio>
        <button type="button" className="ugm-btn" onClick={() => t.abrir(null)}>
          Volver a la lista
        </button>
      </div>
    );
  }
  const principal = t.asignaciones.find((a) => a.indicador === id && a.rol === "principal");
  const apoyo = t.asignaciones.filter((a) => a.indicador === id && a.rol === "apoyo");

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec">
        <button type="button" className="ugm-link" onClick={() => t.abrir(null)}>
          ← Volver a la lista
        </button>
        <h2>
          <b className="rk-odsmark thi-ods" style={odsVars(i.ods)}>
            {i.ods}
          </b>{" "}
          <span className="ugm-cod ugm-num">{i.id}</span> {rq?.titulo ?? i.texto_es}
        </h2>
        <p className="ugm-lead">{rq?.pregunta || i.texto_es}</p>
        {i.texto_en && <p className="ugm-muted ugm-peq" lang="en">{i.texto_en}</p>}
        <div className="ugm-acciones">
          <ChipEvidencia rq={rq} />
          {rq && <span className="ugm-etq">{TEXTO_TIPO[rq.tipo]}</span>}
          {rq && rq.maximo > 0 && <span className="ugm-etq">Hasta {rq.maximo} puntos</span>}
          {rq?.peso != null && <span className="ugm-etq">{String(rq.peso).replace(".", ",")} % del ODS</span>}
        </div>
        {rq?.regla && <p className="ugm-muted">{rq.regla}</p>}
        {rq && <p className="ugm-muted ugm-peq">{TEXTO_EVIDENCIA[rq.evidencia].detalle}</p>}
        {!rq && <Alerta tipo="aviso">La metodología 2027 no trae este indicador (puede ser nuevo o de otra edición). Lo que pide se lee en el Excel de THE.</Alerta>}
        {opciones.length > 0 && (
          <p className="ugm-muted ugm-peq">
            Campos del indicador: {opciones.map((o) => o.id.split("/")[1] ?? o.id).join(", ")}. Se diligencian en el formulario de la oficina.
          </p>
        )}
      </section>

      <section className="ugm-sec">
        <h2>Quién responde</h2>
        <p>
          Oficina sugerida: <b>{principal ? t.oficina(principal.unidad) : "sin asignar"}</b>
          {apoyo.length > 0 && <> · apoyo: {apoyo.map((a) => t.oficina(a.unidad)).join(", ")}</>}
        </p>
        {respuestas.length === 0 ? (
          <p className="ugm-muted">Ninguna oficina ha empezado.</p>
        ) : (
          <ul className="ugm-lista">
            {respuestas.map((r) => (
              <li key={r.id} className="ugm-fila-simple">
                <span>
                  <b>{t.oficina(r.unidad)}</b>
                  <small>
                    {r.si_no === true ? "Sí lo hace" : r.si_no === false ? "No lo hace" : "Sin sí/no"} · actualizado {hace(r.updated_at)}
                    {r.oficial ? " · la que va a THE" : ""}
                  </small>
                </span>
                <span className="ugm-acciones">
                  <EstadoThi estado={r.estado} />
                  <Link className="ugm-btn ugm-btn--sm" to={`/admin/reporte-rankings?oficina=${r.unidad}&indicador=${encodeURIComponent(id)}&ciclo=${t.ciclo.id}`}>
                    Abrir el formulario
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {respuestas.map((r) => (
        <section key={r.id} className="ugm-sec" aria-label={`Evidencias de ${t.oficina(r.unidad)}`}>
          <h2>Evidencias · {t.oficina(r.unidad)}</h2>
          <EvidenciasThi
            respuesta={r.id}
            ciclo={{ id: t.ciclo.id, anio: t.ciclo.anio }}
            indicador={id}
            requisito={rq}
            editable={t.esAdmin || r.estado === "none" || r.estado === "draft" || r.estado === "back"}
            esAdmin={t.esAdmin}
            avisar={t.avisar}
          />
        </section>
      ))}

      <section className="ugm-sec">
        <h2>Bitácora del indicador</h2>
        {eventos.length === 0 ? (
          <p className="ugm-muted">Sin movimientos todavía.</p>
        ) : (
          <ul className="ugm-bitacora">
            {eventos.slice(0, 40).map((a) => (
              <li key={a.id}>
                <time dateTime={a.created_at} className="ugm-num ugm-muted">
                  {fechaCorta(a.created_at)}
                </time>
                <span>
                  <b>{a.actor ? (actores.data?.get(a.actor)?.nombre ?? "Persona") : "Sistema"}</b> {ACCION_BITACORA[a.accion] ?? a.accion.replace(/_/g, " ")}
                  {a.de && a.a ? <small> {a.de} → {a.a}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
