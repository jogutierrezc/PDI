/* =============================================================================
   Gestión Master · Actividades del periodo.

   Lo que el Master tiene en un periodo y una sede, según lo capturó el
   Warehouse: por actividad (cuántos profesores, horas y promedio), por programa
   o departamento y por docente. Cada fila dice de dónde viene el dato (el corte
   del Master) y si hay una solicitud abierta sobre ese código.

   Privacidad: el docente es un seudónimo (la política del Warehouse no guarda
   nombres). Los nombres se ven en el detalle de un código, en vivo, sin guardarlos.
   Horas por docente y horas planeadas no existen en ningún reporte del Master:
   aquí solo se muestra lo que se reporta.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useActividades, useCortes, useProfesores } from "./api";
import type { Contexto } from "./contexto";
import { sedeUnica } from "./contexto";
import { fechaCorta, horasTexto, nombrePeriodo, nombreSede } from "./modelo";
import { PanelCodigo } from "./PanelCodigo";
import { useBarras, useEntrada } from "./movimiento";
import { Cargando, ErrorCaja, Fuente, Vacio } from "./partes";

type Vista = "actividad" | "programa" | "docente";

export function Periodo({ ctx }: { ctx: Contexto }) {
  const sede = sedeUnica(ctx.sede);
  const [vista, setVista] = useState<Vista>("actividad");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const acts = useActividades(ctx.periodo, sede);
  const profs = useProfesores(ctx.periodo, sede, vista !== "actividad");
  const cortes = useCortes(ctx.periodo);
  const cuerpo = useRef<HTMLDivElement>(null);
  const corteAct = cortes.data?.find((c) => c.sede === sede && c.conjunto === "ms_actdir");
  const corteNom = cortes.data?.find((c) => c.sede === sede && c.conjunto === "ms_nom");

  const filas = acts.data ?? [];
  const t = busqueda.toLowerCase();
  const visibles = filas.filter((a) => !t || `${a.codigo} ${a.nombre ?? ""}`.toLowerCase().includes(t));
  const maxHoras = Math.max(1, ...filas.map((a) => a.horas ?? 0));

  const porPrograma = useMemo(() => {
    const m = new Map<string, { programa: string; docentes: number; horas: number; codigos: Set<string> }>();
    for (const p of profs.data ?? []) {
      const k = p.programa ?? "Sin programa";
      const o = m.get(k) ?? { programa: k, docentes: 0, horas: 0, codigos: new Set<string>() };
      o.docentes += 1;
      o.horas += Number(p.horas) || 0;
      (p.codigos ?? []).forEach((c) => o.codigos.add(c));
      m.set(k, o);
    }
    return Array.from(m.values()).sort((a, b) => b.horas - a.horas);
  }, [profs.data]);

  useEntrada(cuerpo, ".gm-fila-tabla", `${ctx.periodo}|${sede}|${vista}|${acts.isPending}|${profs.isPending}`, !acts.isPending);
  useBarras(cuerpo, `${ctx.periodo}|${sede}|${vista}|${acts.isPending}|${profs.isPending}`);

  const cargando = acts.isPending || (vista !== "actividad" && profs.isPending);
  const falla = acts.error ?? (vista !== "actividad" ? profs.error : null);

  return (
    <div className="gm-seccion-pagina" ref={cuerpo}>
      <Fuente>
        {nombreSede(sede)}, {nombrePeriodo(ctx.periodo)}. Catálogo (ms_actdir):{" "}
        <span className="gm-pill gm-pill--fuente">{corteAct ? `Master · corte ${fechaCorta(corteAct.terminada_en)}` : "sin captura"}</span> Nómina (ms_nom):{" "}
        <span className="gm-pill gm-pill--fuente">{corteNom ? `Master · corte ${fechaCorta(corteNom.terminada_en)}` : "sin captura"}</span> Una solicitud abierta se marca aparte: todavía no es parte del Master.
      </Fuente>

      <div className="gm-filtros">
        <div className="gm-vistas" role="group" aria-label="Vista">
          {([["actividad", "Por actividad"], ["programa", "Por programa o departamento"], ["docente", "Por docente"]] as [Vista, string][]).map(([v, n]) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
              {n}
            </button>
          ))}
        </div>
        {vista === "actividad" && (
          <label className="admin-field">
            <span>Buscar</span>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código o nombre" autoComplete="off" />
          </label>
        )}
      </div>

      {cargando ? (
        <Cargando />
      ) : falla ? (
        <ErrorCaja error={falla} onReintentar={() => { void acts.refetch(); void profs.refetch(); }} />
      ) : filas.length === 0 ? (
        <Vacio titulo={`Sin datos del Master para ${nombreSede(sede)}, ${nombrePeriodo(ctx.periodo)}`} texto="Falta la captura del catálogo (ms_actdir) en el Warehouse. Pídale a Planeación que la cargue." />
      ) : vista === "actividad" ? (
        <div className="gm-tabla-envoltura">
          <table className="gm-tabla">
            <caption className="sr-only">Actividades del periodo</caption>
            <thead>
              <tr>
                <th scope="col">Actividad</th>
                <th scope="col" className="gm-num">Profesores</th>
                <th scope="col" className="gm-num">Horas por semana</th>
                <th scope="col" className="gm-num">Promedio por profesor</th>
                <th scope="col">Origen</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <FilaActividad key={a.codigo} a={a} maxHoras={maxHoras} abierto={abierto === a.codigo} onAbrir={() => setAbierto(abierto === a.codigo ? null : a.codigo)} periodo={ctx.periodo} sede={sede} ir={ctx.ir} />
              ))}
            </tbody>
          </table>
        </div>
      ) : vista === "programa" ? (
        porPrograma.length === 0 ? (
          <Vacio titulo="Sin nómina para este periodo y sede" texto="Falta la captura de la nómina docente (ms_nom) en el Warehouse." />
        ) : (
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Actividades por programa o departamento</caption>
              <thead>
                <tr>
                  <th scope="col">Programa o departamento</th>
                  <th scope="col" className="gm-num">Docentes</th>
                  <th scope="col" className="gm-num">Actividades</th>
                  <th scope="col" className="gm-num">Horas por semana</th>
                  <th scope="col">Proporción</th>
                </tr>
              </thead>
              <tbody>
                {porPrograma.map((p) => (
                  <tr key={p.programa} className="gm-fila-tabla">
                    <td>{p.programa}</td>
                    <td className="gm-num">{p.docentes}</td>
                    <td className="gm-num">{p.codigos.size}</td>
                    <td className="gm-num">{horasTexto(p.horas)}</td>
                    <td>
                      <span className="gm-barra" role="img" aria-label={`${Math.round((p.horas / (porPrograma[0]?.horas || 1)) * 100)} % del programa con más horas`}>
                        <i style={{ transform: `scaleX(${p.horas / (porPrograma[0]?.horas || 1)})` }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (profs.data ?? []).length === 0 ? (
        <Vacio titulo="Sin nómina para este periodo y sede" texto="Falta la captura de la nómina docente (ms_nom) en el Warehouse." />
      ) : (
        <>
          <div className="gm-tabla-envoltura">
            <table className="gm-tabla">
              <caption className="sr-only">Actividades por docente (seudónimo)</caption>
              <thead>
                <tr>
                  <th scope="col">Docente (seudónimo)</th>
                  <th scope="col">Programa o departamento</th>
                  <th scope="col" className="gm-num">Actividades</th>
                  <th scope="col" className="gm-num">Horas por semana</th>
                  <th scope="col">Códigos</th>
                </tr>
              </thead>
              <tbody>
                {(profs.data ?? []).map((p) => (
                  <tr key={p.seudonimo} className="gm-fila-tabla">
                    <td className="gm-mono">{p.seudonimo}</td>
                    <td>{p.programa ?? "—"}</td>
                    <td className="gm-num">{p.actividades}</td>
                    <td className="gm-num">{horasTexto(p.horas)}</td>
                    <td className="gm-codigos">{(p.codigos ?? []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="gm-nota">Cada docente aparece como un seudónimo: el Warehouse no guarda nombres. Para ver los nombres de quienes tienen un código, abra ese código en «Por actividad».</p>
        </>
      )}
    </div>
  );
}

function FilaActividad({ a, maxHoras, abierto, onAbrir, periodo, sede, ir }: { a: import("./modelo").ActividadPeriodo; maxHoras: number; abierto: boolean; onAbrir: () => void; periodo: string; sede: string; ir: Contexto["ir"] }) {
  return (
    <>
      <tr className="gm-fila-tabla">
        <td>
          <button type="button" className="gm-grupo__boton" aria-expanded={abierto} onClick={onAbrir}>
            <span className="gm-mono">{a.codigo}</span> {a.nombre ?? ""}
          </button>
        </td>
        <td className="gm-num">{a.n_profesores ?? "—"}</td>
        <td className="gm-num">
          {horasTexto(a.horas)}
          <span className="gm-barra" aria-hidden="true">
            <i style={{ transform: `scaleX(${(a.horas ?? 0) / maxHoras})` }} />
          </span>
        </td>
        <td className="gm-num">{horasTexto(a.promedio_horas)}</td>
        <td>
          <span className="gm-pill gm-pill--fuente">Master</span>
          {a.solicitudes_abiertas > 0 && (
            <button type="button" className="gm-enlace" onClick={() => ir("bandeja")}>
              Solicitud abierta ({a.solicitudes_abiertas})
            </button>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={5}>
            <PanelCodigo periodo={periodo} sede={sede} codigo={a.codigo} />
          </td>
        </tr>
      )}
    </>
  );
}
