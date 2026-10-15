/* =============================================================================
   Monitor de alertas tempranas · la pantalla de la intranet.

   Una sola ruta: /admin/monitor-alertas, con el recorrido en la dirección
   (?f=facultad&p=programa&m=materia&g=grupo&e=estudiante&corte=2&periodo=2026b):
   Institución → Facultad → Programa → Grupo → Estudiante. Quién ve qué lo
   deciden los roles y las unidades (migración 0160), no una clave: una
   decanatura ve su facultad; una dirección, su programa; Planeación, todo.

   Pilo va AL FINAL de cada vista: el resto no depende de él.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AdminShell } from "../admin/components/AdminShell";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { periodosDisponibles, SEDES } from "../warehouse/conjuntos";
import { PanelPilo } from "../warehouse/PanelPilo";
import { ESTUDIO_UDES, NOMBRE_BANDA, bandaDe, riesgoRelativoDe } from "../warehouse/estudio";
import {
  useAsignarPrograma,
  useAutoasignar,
  useEstudianteMonitor,
  useGrupoEstudiantes,
  useGruposMonitor,
  useMapaMonitor,
  usePermisosMonitor,
  useProgramasDelOrganigrama,
  useResumenMonitor,
} from "./datos";
import {
  CORTES_MONITOR,
  NOMBRE_NIVEL,
  NIVELES,
  UMBRALES_MONITOR,
  agregar,
  clasificar,
  cortesConNotas,
  criticas,
  nivelDeNota,
  nodosDeGrupos,
  porFacultad,
  resumenParaPilo,
  type Corte,
  type FilaMonitor,
  type Nivel,
  type Nodo,
  type Programa,
  type Umbrales,
} from "./logica";
import { Aletas, BarraNiveles, Escala, Evolucion, Forma, Semaforo, Tendencia, useEntrada } from "./piezas";
import "../warehouse/warehouse.css";
import "./monitor.css";

const coma = (n: number | null, d = 1) => (n === null ? "—" : n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
const BASE = "/admin/monitor-alertas";

export function MonitorAlertas() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const permisos = usePermisosMonitor();
  const periodos = useMemo(() => periodosDisponibles(), []);
  const periodo = periodos.includes(params.get("periodo") ?? "") ? (params.get("periodo") as string) : periodos[0];
  const sede = SEDES.some((s) => s.id === params.get("sede")) ? (params.get("sede") as string) : SEDES[0].id;
  const [umbrales, setUmbrales] = useState<Umbrales>(UMBRALES_MONITOR);

  const resumen = useResumenMonitor(periodo, sede);
  const grupos = useGruposMonitor(periodo, sede);
  const mapa = useMapaMonitor(periodo, sede);

  const fijar = (cambios: Record<string, string | null>) => {
    const siguiente = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") siguiente.delete(k);
      else siguiente.set(k, v);
    }
    navigate({ pathname: BASE, search: siguiente.toString() });
  };

  const selectores = (
    <div className="wh-fila">
      <label className="wh-campo">
        <span className="sr-only">Periodo</span>
        <select value={periodo} onChange={(e) => fijar({ periodo: e.target.value === periodos[0] ? null : e.target.value, f: null, p: null, m: null, g: null, e: null })}>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="wh-campo">
        <span className="sr-only">Sede</span>
        <select value={sede} onChange={(e) => fijar({ sede: e.target.value === SEDES[0].id ? null : e.target.value, f: null, p: null, m: null, g: null, e: null })}>
          {SEDES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  let cuerpo;
  if (!permisos.ver) {
    cuerpo = <EmptyBlock title="Sin acceso al Monitor" hint="El Monitor es para quien pertenece a una facultad o a un programa, y para Planeación. Pida a la administración que lo agregue a su unidad." />;
  } else if (resumen.isPending || mapa.isPending) {
    cuerpo = <LoadingBlock rows={6} label="Leyendo las notas" />;
  } else if (resumen.error || mapa.error) {
    const e = (resumen.error ?? mapa.error) as Error;
    const falta = /wh_monitor|does not exist|schema cache/i.test(e.message);
    const sinPermiso = /sin permiso/i.test(e.message);
    cuerpo = (
      <ErrorBlock
        error={falta ? new Error("Falta aplicar la migración 0160 (Monitor de alertas tempranas).") : sinPermiso ? new Error("Su usuario no tiene programas asignados todavía: Planeación debe asociar su unidad con los programas.") : e}
        title="No se pudo abrir el Monitor"
        onRetry={() => void resumen.refetch()}
      />
    );
  } else if (resumen.data.length === 0) {
    cuerpo = (
      <EmptyBlock
        title={`Aún no hay notas de ${periodo} para ver`}
        hint="Las notas salen del «Reporte global de notas» de Davinci, que Planeación carga en el Warehouse. Si ya se cargó, quizá sus programas aún no están asignados a su unidad."
      />
    );
  } else {
    cuerpo = (
      <Recorrido
        filas={resumen.data}
        gruposData={grupos.data ?? []}
        programas={mapa.data}
        periodo={periodo}
        sede={sede}
        params={params}
        fijar={fijar}
        umbrales={umbrales}
        setUmbrales={setUmbrales}
        asignar={permisos.asignar}
      />
    );
  }

  return (
    <AdminShell section="monitor" kicker="Monitor de alertas tempranas" title="Cómo van las notas" description="Por facultad, programa, grupo y estudiante, con el semáforo NE · ED · RS" actions={permisos.ver ? selectores : undefined}>
      <div className="mo">{cuerpo}</div>
    </AdminShell>
  );
}

/* --- El recorrido ------------------------------------------------------------------------------ */

export interface PropsRecorrido {
  filas: FilaMonitor[];
  gruposData: import("./logica").GrupoMonitor[];
  programas: Programa[];
  periodo: string;
  sede: string;
  params: URLSearchParams;
  fijar: (c: Record<string, string | null>) => void;
  umbrales: Umbrales;
  setUmbrales: (u: Umbrales) => void;
  asignar: boolean;
}

export function Recorrido({ filas, gruposData, programas, periodo, sede, params, fijar, umbrales, setUmbrales, asignar }: PropsRecorrido) {
  const cortes = useMemo(() => cortesConNotas(filas), [filas]);
  const pedido = Number(params.get("corte")) as Corte;
  const corte: Corte = cortes.includes(pedido) ? pedido : (cortes[cortes.length - 1] ?? 1);
  const f = params.get("f");
  const p = params.get("p");
  const m = params.get("m");
  const g = params.get("g");
  const e = params.get("e");
  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre ?? sede;

  const facultades = useMemo(() => porFacultad(filas, programas, corte, umbrales), [filas, programas, corte, umbrales]);
  const facultad = facultades.find((x) => x.clave === f) ?? null;
  const programaCod = p;
  const filasDe = useMemo(() => {
    if (programaCod) return filas.filter((x) => x.codigo_programa === programaCod);
    if (facultad) {
      const cods = new Set(programas.filter((x) => (x.facultad_id ?? "sin-facultad") === facultad.clave).map((x) => x.codigo_programa));
      return filas.filter((x) => cods.has(x.codigo_programa) || (facultad.clave === "sin-facultad" && !programas.find((y) => y.codigo_programa === x.codigo_programa)?.facultad_id));
    }
    return filas;
  }, [filas, programas, programaCod, facultad]);

  const nombreProg = (cod: string) => programas.find((x) => x.codigo_programa === cod)?.nombre || filas.find((x) => x.codigo_programa === cod)?.programa || cod;
  const alcanceNombre = programaCod ? nombreProg(programaCod) : facultad ? facultad.nombre : "Institución";
  const nodo = useMemo(() => agregar(programaCod ?? f ?? "todo", alcanceNombre, filasDe, corte, umbrales), [filasDe, programaCod, f, alcanceNombre, corte, umbrales]);
  const hijos = useMemo<Nodo[]>(() => (programaCod ? [] : facultad ? facultad.programas : facultades), [programaCod, facultad, facultades]);
  const gruposAlcance = useMemo(() => gruposData.filter((x) => (!programaCod || x.codigo_programa === programaCod) && (!facultad || filasDe.some((y) => y.codigo_programa === x.codigo_programa))), [gruposData, programaCod, facultad, filasDe]);
  const materiasCrit = useMemo(() => criticas(gruposAlcance, programas), [gruposAlcance, programas]);

  const nivel: "institucion" | "facultad" | "programa" | "grupo" | "estudiante" = e ? "estudiante" : m && g ? "grupo" : programaCod ? "programa" : facultad ? "facultad" : "institucion";
  const clave = `${nivel}|${f}|${p}|${m}|${g}|${e}|${corte}`;
  const ref = useEntrada<HTMLDivElement>(clave);

  const pilo = nivel === "estudiante" ? null : resumenParaPilo(nodo, hijos, materiasCrit, { periodo, sede, corte, alcance: { nivel: programaCod ? "programa" : facultad ? "facultad" : "institucion", nombre: programaCod || facultad ? alcanceNombre : undefined }, umbrales });

  const migas = (
    <nav className="mo-migas" aria-label="Dónde está">
      <button type="button" onClick={() => fijar({ f: null, p: null, m: null, g: null, e: null })} disabled={nivel === "institucion"}>
        Institución
      </button>
      {facultad && (
        <>
          <span className="mo-migas__sep">/</span>
          <button type="button" onClick={() => fijar({ p: null, m: null, g: null, e: null })} disabled={nivel === "facultad"}>
            {facultad.nombre}
          </button>
        </>
      )}
      {programaCod && (
        <>
          <span className="mo-migas__sep">/</span>
          <button type="button" onClick={() => fijar({ m: null, g: null, e: null })} disabled={nivel === "programa"}>
            {nombreProg(programaCod)}
          </button>
        </>
      )}
      {m && g && (
        <>
          <span className="mo-migas__sep">/</span>
          <button type="button" onClick={() => fijar({ e: null })} disabled={nivel === "grupo"}>
            {gruposData.find((x) => x.codigo_materia === m && x.grupo === g)?.materia ?? m} · {g}
          </button>
        </>
      )}
      {e && (
        <>
          <span className="mo-migas__sep">/</span>
          <span className="mo-migas__aqui mo-codigo">{e}</span>
        </>
      )}
    </nav>
  );

  const sinAsignar = programas.filter((x) => !x.unit_id);

  return (
    <>
      {migas}

      <div className="mo-controles">
        <div className="mo-tren" role="radiogroup" aria-label="Corte">
          {CORTES_MONITOR.map((c, i) => (
            <span key={c} style={{ display: "contents" }}>
              {i > 0 && <span className="mo-riel" aria-hidden="true" />}
              <button type="button" role="radio" aria-checked={corte === c} disabled={!cortes.includes(c)} className="mo-estacion-b" onClick={() => fijar({ corte: c === cortes[cortes.length - 1] ? null : String(c) })}>
                <i />P{c}
                <small>{cortes.includes(c) ? (c === cortes[cortes.length - 1] ? "último con notas" : "con notas") : "aún sin notas"}</small>
              </button>
            </span>
          ))}
        </div>
        <p className="mo-muted">
          {nombreSede} · {periodo}. Se clasifica a quien ya tiene nota en la mitad o más de sus materias.
        </p>
      </div>


      <div ref={ref} style={{ display: "grid", gap: "var(--space-8)" }}>
        {nivel === "estudiante" && <VistaEstudiante periodo={periodo} sede={sede} estudiante={e as string} filas={filas} corte={corte} umbrales={umbrales} nombreProg={nombreProg} />}
        {nivel === "grupo" && <VistaGrupo periodo={periodo} sede={sede} materia={m as string} grupo={g as string} corte={corte} fijar={fijar} gruposData={gruposData} nombreProg={nombreProg} />}
        {(nivel === "institucion" || nivel === "facultad" || nivel === "programa") && (
          <>
            <Portada nodo={nodo} nivel={nivel} nombre={alcanceNombre} corte={corte} />
            <Evolucion_ nodo={nodo} />
            {nivel !== "programa" && <Hijos nivel={nivel} hijos={hijos} onAbrir={(h) => (nivel === "institucion" ? fijar({ f: h.clave, p: null }) : fijar({ p: h.clave }))} />}
            {nivel === "programa" && <Grupos gruposData={gruposAlcance} corte={corte} onAbrir={(a, b) => fijar({ m: a, g: b })} />}
            <Criticas materias={materiasCrit} />
            <ComoSeClasifica umbrales={umbrales} setUmbrales={setUmbrales} />
            <ComoLeer />
          </>
        )}
      </div>

      {pilo && (
        <section className="mo-pilo" aria-label="Análisis de Pilo">
          <div className="wh">
            <PanelPilo datos={pilo} etiqueta={nivel === "institucion" ? `la sede ${nombreSede}` : alcanceNombre} />
          </div>
        </section>
      )}

      {asignar && sinAsignar.length > 0 && <AdministrarProgramas sinAsignar={sinAsignar} periodo={periodo} sede={sede} />}
    </>
  );
}

/* --- Portada: las cifras como tablero de llegadas ---------------------------------------------------- */

function Portada({ nodo, nivel, nombre, corte }: { nodo: Nodo; nivel: string; nombre: string; corte: Corte }) {
  const total = nodo.estudiantes;
  const titulo = nivel === "institucion" ? "Cómo van los estudiantes" : nombre;
  const pct = (n: number) => (total ? `${coma((100 * n) / total)} % de ${total.toLocaleString("es-CO")}` : "—");
  return (
    <>
      <section className="mo-portada" data-in>
        <div>
          <h2>
            <span>{nivel === "institucion" ? `En el corte P${corte}` : `Corte P${corte}`}</span>
            {titulo}
          </h2>
          <p>
            {total === 0 ? (
              "Aún no hay estudiantes con notas suficientes en este corte."
            ) : (
              <>
                De <b>{total.toLocaleString("es-CO")} estudiantes</b> con notas, <b>{nodo.RS.toLocaleString("es-CO")}</b> requieren seguimiento ({coma(nodo.pctRS)} %). El promedio es <b>{coma(nodo.promedio, 2)}</b>; aprobar es 3,0.
              </>
            )}
          </p>
        </div>
        <div className="mo-tablero" role="group" aria-label="Estudiantes por nivel de desempeño">
          {NIVELES.map((n) => (
            <div key={n} className="mo-tablero__fila">
              <div>
                <Semaforo nivel={n} />
                <small>{pct(nodo[n])}</small>
              </div>
              <Aletas valor={nodo[n]} etiqueta={NOMBRE_NIVEL[n]} />
            </div>
          ))}
          <div className="mo-tablero__pie">
            <span>Corte P{corte}</span>
            <span>{total.toLocaleString("es-CO")} clasificados</span>
          </div>
        </div>
      </section>
      <div className="mo-kpis" data-in>
        <div className="mo-kpi">
          <span>Promedio del corte</span>
          <b>{coma(nodo.promedio, 2)}</b>
        </div>
        <div className="mo-kpi">
          <span>Requieren seguimiento</span>
          <b>{coma(nodo.pctRS)} %</b>
        </div>
        <div className="mo-kpi">
          <span>En Nivel Esperado</span>
          <b>{total ? coma((100 * nodo.NE) / total) : "—"} %</b>
        </div>
        <div className="mo-kpi">
          <span>Estudiantes clasificados</span>
          <b>{total.toLocaleString("es-CO")}</b>
        </div>
      </div>
    </>
  );
}

function Evolucion_({ nodo }: { nodo: Nodo }) {
  if (nodo.serie.length < 2) {
    return (
      <section className="mo-seccion" data-in>
        <div className="mo-seccion__cabeza">
          <h3>Cómo evoluciona</h3>
          <p>Con dos cortes con notas se ve cómo cambian los niveles. Hoy hay {nodo.serie.length}.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-evo">
      <div className="mo-seccion__cabeza">
        <h3 id="mo-evo">Cómo evoluciona entre cortes</h3>
        <p>Cada corte es una estación y su columna suma el 100 % de los estudiantes. Las cintas unen cada nivel con el del corte siguiente.</p>
      </div>
      <Evolucion serie={nodo.serie} titulo="Composición NE, ED y RS en cada corte" />
    </section>
  );
}

/* --- Las unidades de abajo: facultades o programas --------------------------------------------------- */

function Hijos({ nivel, hijos, onAbrir }: { nivel: string; hijos: Nodo[]; onAbrir: (n: Nodo) => void }) {
  const [orden, setOrden] = useState<"rs" | "n" | "prom">("rs");
  const lista = useMemo(() => [...hijos].sort((a, b) => (orden === "rs" ? b.pctRS - a.pctRS : orden === "n" ? b.estudiantes - a.estudiantes : (a.promedio ?? 9) - (b.promedio ?? 9))), [hijos, orden]);
  const que = nivel === "institucion" ? "facultades" : "programas";
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-hijos">
      <div className="mo-seccion__cabeza">
        <h3 id="mo-hijos">{nivel === "institucion" ? "Las facultades" : "Los programas de la facultad"}</h3>
        <div className="mo-filtros">
          <label>
            <span className="sr-only">Ordenar</span>
            <select value={orden} onChange={(ev) => setOrden(ev.target.value as typeof orden)}>
              <option value="rs">Más en seguimiento primero</option>
              <option value="n">Más estudiantes primero</option>
              <option value="prom">Menor promedio primero</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mo-tabla-envuelta">
        <table className="mo-tabla">
          <thead>
            <tr>
              <th scope="col">{nivel === "institucion" ? "Facultad" : "Programa"}</th>
              <th scope="col" className="num">
                Estudiantes
              </th>
              <th scope="col" style={{ width: "34%" }}>
                NE · ED · RS
              </th>
              <th scope="col" className="num">
                En RS
              </th>
              <th scope="col" className="num">
                Promedio
              </th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {lista.map((h) => {
              const dom: Nivel = h.pctRS >= 25 ? "RS" : h.pctRS >= 12 ? "ED" : "NE";
              return (
                <tr key={h.clave} data-n={dom} tabIndex={0} onClick={() => onAbrir(h)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onAbrir(h))}>
                  <td>
                    <span className="mo-nombre">
                      <b>{h.nombre}</b>
                      {h.serie.length > 1 && <small>P{h.serie[0].corte} → P{h.serie[h.serie.length - 1].corte}: {coma(h.serie[0].pctRS)} % → {coma(h.serie[h.serie.length - 1].pctRS)} % en RS</small>}
                    </span>
                  </td>
                  <td className="num">{h.estudiantes.toLocaleString("es-CO")}</td>
                  <td>
                    <BarraNiveles NE={h.NE} ED={h.ED} RS={h.RS} />
                  </td>
                  <td className="num">
                    <b>{coma(h.pctRS)} %</b>
                  </td>
                  <td className="num">{coma(h.promedio, 2)}</td>
                  <td className="mo-ir">Abrir →</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lista.length === 0 && <p className="mo-muted">No hay {que} con estudiantes clasificados en este corte.</p>}
    </section>
  );
}

/* --- Grupos de un programa ------------------------------------------------------------------------------- */

function Grupos({ gruposData, corte, onAbrir }: { gruposData: import("./logica").GrupoMonitor[]; corte: Corte; onAbrir: (materia: string, grupo: string) => void }) {
  const [nivel, setNivel] = useState<"todos" | Nivel>("todos");
  const [q, setQ] = useState("");
  const nodos = useMemo(() => nodosDeGrupos(gruposData, corte), [gruposData, corte]);
  const lista = nodos.filter((x) => (nivel === "todos" || x.nivel === nivel) && (!q.trim() || `${x.materia} ${x.grupo}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 200);
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-grupos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-grupos">Los grupos</h3>
          <p>Un grupo requiere seguimiento si 30 % o más de quienes ya tienen nota va por debajo de la de aprobar; en desarrollo desde 15 %.</p>
        </div>
        <div className="mo-filtros">
          <select value={nivel} onChange={(ev) => setNivel(ev.target.value as typeof nivel)} aria-label="Nivel">
            <option value="todos">Todos los niveles</option>
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n} · {NOMBRE_NIVEL[n]}
              </option>
            ))}
          </select>
          <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar materia…" aria-label="Buscar materia" />
        </div>
      </div>
      <div className="mo-tabla-envuelta">
        <table className="mo-tabla">
          <thead>
            <tr>
              <th scope="col">Materia y grupo</th>
              <th scope="col" className="num">
                Con nota
              </th>
              <th scope="col" className="num">
                Bajo la de aprobar
              </th>
              <th scope="col" className="num">
                Promedio
              </th>
              <th scope="col">Tendencia</th>
              <th scope="col">Nivel</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.clave} data-n={x.nivel} tabIndex={0} onClick={() => onAbrir(x.codigo_materia, x.grupo)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onAbrir(x.codigo_materia, x.grupo))}>
                <td>
                  <span className="mo-nombre">
                    <b>{x.materia}</b>
                    <small>Grupo {x.grupo}</small>
                  </span>
                </td>
                <td className="num">{x.estudiantes}</td>
                <td className="num">
                  <b>{coma(x.pctBajo)} %</b>
                </td>
                <td className="num">{coma(x.promedio, 2)}</td>
                <td>
                  <Tendencia valores={x.tendencia} />
                </td>
                <td>
                  <Semaforo nivel={x.nivel} palabra={false} />
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="mo-muted">
                  Ningún grupo cumple el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --- Un grupo: sus estudiantes por código ----------------------------------------------------------------- */

function VistaGrupo({ periodo, sede, materia, grupo, corte, fijar, gruposData, nombreProg }: { periodo: string; sede: string; materia: string; grupo: string; corte: Corte; fijar: (c: Record<string, string | null>) => void; gruposData: import("./logica").GrupoMonitor[]; nombreProg: (c: string) => string }) {
  const lista = useGrupoEstudiantes(periodo, sede, materia, grupo);
  const g = gruposData.find((x) => x.codigo_materia === materia && x.grupo === grupo);
  const nota = (r: { p1: number | null; p2: number | null; p3: number | null }) => (corte === 1 ? r.p1 : corte === 2 ? r.p2 : r.p3);
  const filas = useMemo(() => (lista.data ?? []).map((r) => ({ ...r, nota: nota(r), nivel: nivelDeNota(nota(r)) })), [lista.data, corte]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = { NE: 0, ED: 0, RS: 0 };
  for (const r of filas) if (r.nivel) n[r.nivel] += 1;
  const bajo = g ? (corte === 1 ? g.bajo_p1 : corte === 2 ? g.bajo_p2 : g.bajo_p3) : 0;
  const con = g ? (corte === 1 ? g.con_p1 : corte === 2 ? g.con_p2 : g.con_p3) : 0;
  return (
    <>
      <section className="mo-portada" data-in>
        <div>
          <h2>
            <span>Grupo {grupo}</span>
            {g?.materia ?? materia}
          </h2>
          <p>
            {g ? (
              <>
                <b>{con} estudiantes</b> con nota en P{corte}; <b>{bajo}</b> van por debajo de la de aprobar ({con ? coma((100 * bajo) / con) : "—"} %). Promedio del grupo: <b>{coma(corte === 1 ? g.prom_p1 : corte === 2 ? g.prom_p2 : g.prom_p3, 2)}</b>.
              </>
            ) : (
              "Estudiantes del grupo."
            )}
          </p>
        </div>
        <div className="mo-tablero">
          {NIVELES.map((x) => (
            <div key={x} className="mo-tablero__fila">
              <Semaforo nivel={x} />
              <Aletas valor={n[x]} etiqueta={NOMBRE_NIVEL[x]} />
            </div>
          ))}
          <div className="mo-tablero__pie">
            <span>Nota de esta materia en P{corte}</span>
          </div>
        </div>
      </section>
      <section className="mo-seccion" data-in aria-labelledby="mo-est">
        <div className="mo-seccion__cabeza">
          <h3 id="mo-est">Los estudiantes, por código</h3>
          <p>NE: nota de 3,5 o más. ED: de 3,0 a 3,49. RS: menor a 3,0. El código es un seudónimo: no hay nombres.</p>
        </div>
        {lista.isPending ? (
          <LoadingBlock rows={4} label="Leyendo el grupo" />
        ) : lista.error ? (
          <ErrorBlock error={lista.error} onRetry={() => void lista.refetch()} />
        ) : (
          <div className="mo-tabla-envuelta">
            <table className="mo-tabla">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Programa</th>
                  <th scope="col" className="num">
                    P1
                  </th>
                  <th scope="col" className="num">
                    P2
                  </th>
                  <th scope="col" className="num">
                    P3
                  </th>
                  <th scope="col">En P{corte}</th>
                </tr>
              </thead>
              <tbody>
                {[...filas]
                  .sort((a, b) => (a.nota ?? 9) - (b.nota ?? 9))
                  .map((r) => (
                    <tr key={r.estudiante} data-n={r.nivel ?? undefined} tabIndex={0} onClick={() => fijar({ e: r.estudiante })} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), fijar({ e: r.estudiante }))}>
                      <td className="mo-codigo">{r.estudiante}</td>
                      <td>{nombreProg(r.codigo_programa)}</td>
                      <td className="num">{coma(r.p1)}</td>
                      <td className="num">{coma(r.p2)}</td>
                      <td className="num">{coma(r.p3)}</td>
                      <td>{r.nivel ? <Semaforo nivel={r.nivel} palabra={false} /> : <span className="mo-muted">sin nota</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* --- Un estudiante ------------------------------------------------------------------------------------------ */

function VistaEstudiante({ periodo, sede, estudiante, filas, corte, umbrales, nombreProg }: { periodo: string; sede: string; estudiante: string; filas: FilaMonitor[]; corte: Corte; umbrales: Umbrales; nombreProg: (c: string) => string }) {
  const notas = useEstudianteMonitor(periodo, sede, estudiante);
  const fila = filas.find((x) => x.estudiante === estudiante);
  const c = fila ? clasificar(fila, corte, umbrales) : null;
  const banda = bandaDe(c?.promedio ?? null);
  const rr = riesgoRelativoDe(c?.promedio ?? null);
  return (
    <>
      <section className="mo-portada" data-in>
        <div>
          <h2>
            <span>Estudiante</span>
            <span className="mo-codigo" style={{ fontWeight: 600, fontSize: "0.6em" }}>
              {estudiante}
            </span>
          </h2>
          <p>
            {fila ? `${nombreProg(fila.codigo_programa)}. ` : ""}
            El código es un seudónimo irreversible: sirve para seguir el caso, no para saber quién es. Planeación puede decir a quién corresponde con Davinci.
          </p>
        </div>
        <div className="mo-ficha" data-n={c?.nivel}>
          {c ? (
            <>
              <Semaforo nivel={c.nivel} />
              <p>
                Promedio de P{corte}: <b>{coma(c.promedio, 2)}</b> · materias por debajo de la de aprobar: <b>{c.perdidas}</b>
                {c.caida !== null ? ` · cambio frente al corte anterior: ${c.caida > 0 ? "−" : "+"}${coma(Math.abs(c.caida), 2)}` : ""}
              </p>
              <Escala nota={c.promedio} />
            </>
          ) : (
            <p className="mo-muted">Aún no tiene notas suficientes en P{corte}.</p>
          )}
        </div>
      </section>
      {banda && rr !== null && (
        <section className="mo-seccion" data-in>
          <p className="mo-aviso">
            Según el estudio de la UDES (Pérez et al., 2023), con un <b>{NOMBRE_BANDA[banda].toLowerCase()}</b> es{" "}
            {rr === 1 ? "el caso de referencia" : <b>{coma(rr, 1)} veces más probable desertar</b>}
            {rr === 1 ? "" : " que con un promedio alto"}. Es una asociación entre cohortes, no una predicción de esta persona; un promedio bajo es una razón para acompañar, no para sancionar. Éxito: promedio sobre {coma(ESTUDIO_UDES.exito, 1)}.
          </p>
        </section>
      )}
      <section className="mo-seccion" data-in aria-labelledby="mo-mat">
        <div className="mo-seccion__cabeza">
          <h3 id="mo-mat">Sus materias</h3>
          <p>Nota de cada corte. Aprobar es 3,0 (en Medicina, 3,5).</p>
        </div>
        {notas.isPending ? (
          <LoadingBlock rows={3} label="Leyendo sus notas" />
        ) : notas.error ? (
          <ErrorBlock error={notas.error} onRetry={() => void notas.refetch()} />
        ) : (
          <div className="mo-tabla-envuelta">
            <table className="mo-tabla">
              <thead>
                <tr>
                  <th scope="col">Materia</th>
                  <th scope="col">Grupo</th>
                  <th scope="col" className="num">
                    P1
                  </th>
                  <th scope="col" className="num">
                    P2
                  </th>
                  <th scope="col" className="num">
                    P3
                  </th>
                  <th scope="col">Tendencia</th>
                  <th scope="col">En P{corte}</th>
                </tr>
              </thead>
              <tbody>
                {(notas.data ?? []).map((r) => {
                  const nv = nivelDeNota(corte === 1 ? r.p1 : corte === 2 ? r.p2 : r.p3, /^MEDICINA$/i.test(r.programa.trim()) ? 3.5 : 3.0);
                  return (
                    <tr key={`${r.codigo_materia}|${r.grupo}`} data-n={nv ?? undefined}>
                      <td>{r.materia}</td>
                      <td>{r.grupo}</td>
                      <td className="num">{coma(r.p1)}</td>
                      <td className="num">{coma(r.p2)}</td>
                      <td className="num">{coma(r.p3)}</td>
                      <td>
                        <Tendencia valores={[r.p1, r.p2, r.p3]} />
                      </td>
                      <td>{nv ? <Semaforo nivel={nv} palabra={false} /> : <span className="mo-muted">sin nota</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* --- Cursos con alta reprobación ---------------------------------------------------------------------------- */

function Criticas({ materias }: { materias: import("../warehouse/estudio").MateriaCritica[] }) {
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-crit">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-crit">Cursos con alta reprobación</h3>
          <p>La «Alerta Temprana 4» del estudio de la UDES: materias donde 30 % o más de quienes ya tienen nota va por debajo de la de aprobar, con al menos 15 estudiantes con nota.</p>
        </div>
        <span className="wh-etiqueta">{materias.length} cursos</span>
      </div>
      {materias.length === 0 ? (
        <p className="mo-muted">Ninguna materia de este alcance llega al 30 %.</p>
      ) : (
        <div className="mo-tabla-envuelta">
          <table className="mo-tabla">
            <thead>
              <tr>
                <th scope="col">Materia</th>
                <th scope="col" className="num">
                  Con nota
                </th>
                <th scope="col" style={{ width: "32%" }}>
                  Bajo la de aprobar
                </th>
                <th scope="col" className="num">
                  Promedio
                </th>
              </tr>
            </thead>
            <tbody>
              {materias.slice(0, 10).map((x) => (
                <tr key={x.codigo} data-n={x.pctBajo >= 45 ? "RS" : "ED"}>
                  <td>
                    <span className="mo-nombre">
                      <b>{x.materia}</b>
                      <small>
                        P{x.corte} · {x.grupos} {x.grupos === 1 ? "grupo" : "grupos"}
                      </small>
                    </span>
                  </td>
                  <td className="num">{x.estudiantes}</td>
                  <td>
                    <BarraNiveles NE={100 - x.pctBajo} ED={0} RS={x.pctBajo} />
                    <small className="mo-muted">{coma(x.pctBajo)} %</small>
                  </td>
                  <td className="num">{coma(x.promedio, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* --- Cómo se clasifica y cómo leer ---------------------------------------------------------------------------- */

function ComoSeClasifica({ umbrales, setUmbrales }: { umbrales: Umbrales; setUmbrales: (u: Umbrales) => void }) {
  const campo = (k: keyof Umbrales, nombre: string, ayuda: string, paso: number) => (
    <div className="mo-umbral">
      <label htmlFor={`u-${k}`}>{nombre}</label>
      <input id={`u-${k}`} type="number" step={paso} min={0} value={umbrales[k]} onChange={(ev) => Number.isFinite(ev.target.valueAsNumber) && setUmbrales({ ...umbrales, [k]: ev.target.valueAsNumber })} />
      <small>{ayuda}</small>
    </div>
  );
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-clasifica">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-clasifica">Cómo se clasifica</h3>
          <p>
            <b>NE</b>: promedio de {coma(umbrales.ne)} o más y ninguna materia perdida. <b>ED</b>: entre {coma(umbrales.rs)} y {coma(umbrales.ne)}, o una materia perdida. <b>RS</b>: promedio menor a {coma(umbrales.rs)}, {umbrales.perdidas} o más materias perdidas, o una caída de {coma(umbrales.caida)} frente al corte anterior. Cambie un valor y todo se recalcula.
          </p>
        </div>
      </div>
      <Escala />
      <div className="mo-umbrales">
        {campo("ne", "Promedio para Nivel Esperado", "Desde aquí, sin materias perdidas.", 0.1)}
        {campo("rs", "Promedio para Requiere Seguimiento", "Por debajo de aquí. Aprobar es 3,0.", 0.1)}
        {campo("perdidas", "Materias perdidas para RS", "Cuántas materias bajo la de aprobar bastan.", 1)}
        {campo("caida", "Caída entre cortes para RS", "Cuánto baja el promedio frente al corte anterior.", 0.1)}
      </div>
      <p className="mo-muted">
        Son valores de partida del Monitor, apoyados en el estudio de la UDES (aprobar 3,0 —3,5 en Medicina—, periodo de prueba bajo 3,2, éxito sobre 3,8); no una norma de la Universidad. Ajústelos con las facultades.
      </p>
    </section>
  );
}

function ComoLeer() {
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-leer">
      <div className="mo-seccion__cabeza">
        <h3 id="mo-leer">Cómo leer este monitor</h3>
      </div>
      <div className="mo-explica">
        <div>
          <h4>Qué es un corte</h4>
          <p>El semestre se evalúa en tres cortes: P1, P2 y P3. El Monitor clasifica con el último corte en que la mayoría de las materias ya tiene nota; los cortes siguientes aparecen cuando se cargan.</p>
        </div>
        <div>
          <h4>Qué significan NE, ED y RS</h4>
          <p>Son señales para acompañar, no una calificación ni una sanción. «Requiere Seguimiento» quiere decir que conviene hablar con el estudiante, ofrecer tutoría o revisar el curso.</p>
        </div>
        <div>
          <h4>De dónde salen las reglas</h4>
          <p>
            De las notas del «Reporte global de notas» de Davinci y del estudio de la UDES sobre alertas tempranas (Pérez, Mejía, Serrano, Suescún y León, 2023). El estudio también usa Saber 11, tutorías, estrato y trabajo: aquí no los tenemos, y por eso este monitor no predice, solo ordena.
          </p>
        </div>
      </div>
    </section>
  );
}

/* --- Asignar programas a unidades (Planeación) ------------------------------------------------------------------ */

/** Solo Planeación, y escondido al pie: las facultades y los programas no ven nada de esto. */
function AdministrarProgramas({ sinAsignar, periodo, sede }: { sinAsignar: Programa[]; periodo: string; sede: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <button type="button" className="mo-ir" style={{ justifySelf: "start", background: "none", border: 0, cursor: "pointer", font: "inherit", padding: 0 }} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {abierto ? "Ocultar" : "Planeación:"} asignación de programas a unidades ({sinAsignar.length} sin unidad)
      </button>
      {abierto && <AsignarProgramas sinAsignar={sinAsignar} periodo={periodo} sede={sede} />}
    </div>
  );
}

function AsignarProgramas({ sinAsignar, periodo, sede }: { sinAsignar: Programa[]; periodo: string; sede: string }) {
  const unidades = useProgramasDelOrganigrama(true);
  const asignar = useAsignarPrograma();
  const auto = useAutoasignar(periodo, sede);
  const [mensaje, setMensaje] = useState<string | null>(null);
  return (
    <section className="mo-seccion" aria-labelledby="mo-asig">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-asig">{sinAsignar.length} {sinAsignar.length === 1 ? "programa sin unidad" : "programas sin unidad"}</h3>
          <p>
            Davinci conoce los programas por un código interno. Asígnelos a su unidad del organigrama: de ahí sale la facultad y quién los ve (la decanatura y la dirección de cada uno). Mientras tanto solo Planeación los ve.
          </p>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={auto.isPending}
          onClick={() => auto.mutate(undefined, { onSuccess: (n) => setMensaje(n ? `Se asignaron ${n} por su nombre.` : "Ninguno coincide por nombre: asígnelos a mano."), onError: (e) => setMensaje((e as Error).message) })}
        >
          Sugerir por nombre
        </button>
      </div>
      {mensaje && <p className="mo-aviso">{mensaje}</p>}
      <div className="mo-tabla-envuelta">
        <table className="mo-tabla">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Programa en Davinci</th>
              <th scope="col">Unidad del organigrama</th>
            </tr>
          </thead>
          <tbody>
            {sinAsignar.map((p) => (
              <tr key={p.codigo_programa}>
                <td className="mo-codigo">{p.codigo_programa}</td>
                <td>{p.nombre}</td>
                <td>
                  <select
                    className="wh-select"
                    aria-label={`Unidad de ${p.nombre}`}
                    defaultValue=""
                    disabled={unidades.isPending || asignar.isPending}
                    onChange={(ev) => ev.target.value && asignar.mutate({ codigo: p.codigo_programa, nombre: p.nombre, unit: ev.target.value }, { onError: (e) => setMensaje((e as Error).message) })}
                  >
                    <option value="">Elegir…</option>
                    {(unidades.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
