/* =============================================================================
   Monitor de alertas tempranas · la pantalla de la intranet.

   Una sola ruta: /admin/monitor-alertas, con el recorrido en la dirección
   (?f=facultad&p=programa&m=materia&g=grupo&e=estudiante&corte=2&periodo=2026b):
   Institución → Facultad → Programa → Grupo → Estudiante. Quién ve qué lo
   deciden los roles y las unidades (migración 0160), no una clave: una
   decanatura ve su facultad; una dirección, su programa; Planeación, todo.

   Cada nivel tiene UNA idea principal («dónde hay que actuar»); el detalle se despliega a petición.
   Al bajar de nivel, el nombre elegido viaja hasta el título del siguiente (GSAP).
   Pilo va AL FINAL de cada vista: el resto no depende de él.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  buscarCodigos,
  claveGrupo,
  clasificar,
  cortesConNotas,
  criticas,
  nivelDeNota,
  nodosDeGrupos,
  pareceSeudonimo,
  porFacultad,
  resumenParaPilo,
  type Corte,
  type FilaMonitor,
  type Nivel,
  type NodoGrupo,
  type Nodo,
  type Programa,
  type Umbrales,
} from "./logica";
import { MapaRiesgo } from "./MapaRiesgo";
import { Aletas, BarraNiveles, Cuenta, Escala, Evolucion, Forma, Semaforo, Tendencia, prepararVuelo, useEntrada, useFlip, type Sentido } from "./piezas";
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
        <select value={periodo} onChange={(e) => fijar({ periodo: e.target.value === periodos[0] ? null : e.target.value, f: null, p: null, c: null, m: null, g: null, e: null })}>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="wh-campo">
        <span className="sr-only">Sede</span>
        <select value={sede} onChange={(e) => fijar({ sede: e.target.value === SEDES[0].id ? null : e.target.value, f: null, p: null, c: null, m: null, g: null, e: null })}>
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
    <AdminShell section="monitor" kicker="Monitor de alertas tempranas" title="Cómo van las notas" description="Por facultad, programa, curso, grupo y estudiante: el semáforo NE · ED · RS y el mapa de riesgo de reprobación" actions={permisos.ver ? selectores : undefined}>
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

type NivelVista = "institucion" | "facultad" | "programa" | "grupo" | "estudiante";
const PROFUNDIDAD: Record<NivelVista, number> = { institucion: 0, facultad: 1, programa: 2, grupo: 3, estudiante: 4 };

/** Dos miradas al mismo periodo: cómo van los estudiantes (NE · ED · RS) y dónde se reprueba (mapa de riesgo). */
export function Recorrido(props: PropsRecorrido) {
  const riesgo = props.params.get("vista") === "riesgo";
  const nombreSede = SEDES.find((s) => s.id === props.sede)?.nombre ?? props.sede;
  return (
    <>
      <div className="mo-vistas" role="group" aria-label="Qué mirar">
        <button type="button" aria-pressed={!riesgo} onClick={() => props.fijar({ vista: null, c: null, alc: null })}>
          <b>Estudiantes</b>
          <small>NE · ED · RS por corte</small>
        </button>
        <button type="button" aria-pressed={riesgo} onClick={() => props.fijar({ vista: "riesgo", e: null, g: null, m: null })}>
          <b>Mapa de riesgo</b>
          <small>dónde se reprueba</small>
        </button>
      </div>
      {riesgo ? <MapaRiesgo periodo={props.periodo} sede={props.sede} nombreSede={nombreSede} programas={props.programas} params={props.params} fijar={props.fijar} /> : <RecorridoEstudiantes {...props} />}
    </>
  );
}

function RecorridoEstudiantes({ filas, gruposData, programas, periodo, sede, params, fijar, umbrales, setUmbrales, asignar }: PropsRecorrido) {
  const cortes = useMemo(() => cortesConNotas(filas), [filas]);
  const pedido = Number(params.get("corte")) as Corte;
  const corte: Corte = cortes.includes(pedido) ? pedido : (cortes[cortes.length - 1] ?? 1);
  const f = params.get("f");
  const p = params.get("p");
  // El grupo es código de materia + letra («SIS101~A»): una sola llave en la URL (?g=). El par antiguo ?m=&g= se sigue leyendo.
  const m = params.get("m");
  const gRaw = params.get("g");
  const g = gRaw && m && !gRaw.includes("~") ? claveGrupo(m, gRaw) : gRaw;
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
  const nodosGrupo = useMemo(() => nodosDeGrupos(gruposAlcance, corte), [gruposAlcance, corte]);

  const nivel: NivelVista = e ? "estudiante" : g ? "grupo" : programaCod ? "programa" : facultad ? "facultad" : "institucion";
  const seudonimos = filas.length > 0 && filas.filter((x) => pareceSeudonimo(x.estudiante)).length / filas.length > 0.5;

  // La dirección del movimiento: bajar un nivel entra desde abajo; subir, desde arriba. El corte no lo repite todo:
  // las barras, la lista y la evolución se transforman.
  const antes = useRef(PROFUNDIDAD[nivel]);
  const sentido: Sentido = PROFUNDIDAD[nivel] > antes.current ? "abajo" : PROFUNDIDAD[nivel] < antes.current ? "arriba" : "lado";
  const ref = useEntrada<HTMLDivElement>(`${nivel}|${f}|${p}|${g}|${e}`, sentido);
  useLayoutEffect(() => {
    antes.current = PROFUNDIDAD[nivel];
  });

  const pilo = nivel === "estudiante" ? null : resumenParaPilo(nodo, hijos, materiasCrit, { periodo, sede, corte, alcance: { nivel: programaCod ? "programa" : facultad ? "facultad" : "institucion", nombre: programaCod || facultad ? alcanceNombre : undefined }, umbrales });

  // «Empiece por aquí»: lo más urgente del nivel, dicho en una frase.
  const foco = useMemo(() => {
    if (nivel === "programa") {
      const x = nodosGrupo.find((y) => y.nivel === "RS");
      return x ? `Empiece por ${x.materia}, grupo ${x.grupo}: ${coma(x.pctBajo)} % de quienes ya tienen nota va por debajo de la de aprobar.` : null;
    }
    const base = hijos.filter((x) => x.estudiantes >= 20);
    const x = [...(base.length ? base : hijos)].sort((a, b) => b.pctRS - a.pctRS)[0];
    return x && x.pctRS > 0 ? `Empiece por ${x.nombre}: ${coma(x.pctRS)} % de sus estudiantes requiere seguimiento.` : null;
  }, [nivel, nodosGrupo, hijos]);

  const migas = (
    <nav className="mo-migas" aria-label="Dónde está">
      <button type="button" onClick={() => fijar({ f: null, p: null, m: null, g: null, e: null })} disabled={nivel === "institucion"}>
        Institución
      </button>
      {facultad && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => fijar({ p: null, m: null, g: null, e: null })} disabled={nivel === "facultad"}>
            {facultad.nombre}
          </button>
        </>
      )}
      {programaCod && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => fijar({ m: null, g: null, e: null })} disabled={nivel === "programa"}>
            {nombreProg(programaCod)}
          </button>
        </>
      )}
      {g && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => fijar({ e: null })} disabled={nivel === "grupo"}>
            {gruposData.find((x) => (x.grupo_clave ?? claveGrupo(x.codigo_materia, x.grupo)) === g)?.materia ?? g.split("~")[0]} · {g.split("~")[1] ?? ""}
          </button>
        </>
      )}
      {e && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <span className="mo-migas__aqui mo-codigo">{e}</span>
        </>
      )}
    </nav>
  );

  const sinAsignar = programas.filter((x) => !x.unit_id);
  const elegirEstudiante = (r: FilaMonitor) => fijar({ f: programas.find((x) => x.codigo_programa === r.codigo_programa)?.facultad_id ?? "sin-facultad", p: r.codigo_programa, m: null, g: null, e: r.estudiante });

  return (
    <>
      <div className="mo-barra-superior">
        {migas}
        <Buscador filas={filas} nombreProg={nombreProg} onElegir={elegirEstudiante} />
      </div>

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
          {nombreSede} · {periodo}
        </p>
      </div>

      {seudonimos && (
        <p className="mo-aviso mo-aviso--ambar" role="note">
          Estos códigos todavía son seudónimos: las notas se cargaron antes de que el Monitor guardara el código real. Sirven para seguir un caso, pero no dicen quién es el estudiante. Planeación debe volver a cargar el «Reporte global de notas» para verlos reales.
        </p>
      )}

      <div ref={ref} className="mo-cuerpo">
        {nivel === "estudiante" && <VistaEstudiante periodo={periodo} sede={sede} estudiante={e as string} filas={filas} corte={corte} umbrales={umbrales} nombreProg={nombreProg} />}
        {nivel === "grupo" && <VistaGrupo periodo={periodo} sede={sede} clave={g as string} corte={corte} fijar={fijar} gruposData={gruposData} nombreProg={nombreProg} />}
        {(nivel === "institucion" || nivel === "facultad" || nivel === "programa") && (
          <>
            <Portada nodo={nodo} nivel={nivel} nombre={alcanceNombre} corte={corte} foco={foco} />
            {nivel !== "programa" && <Prioridad nivel={nivel} hijos={hijos} corte={corte} onAbrir={(h, el) => (prepararVuelo(el), nivel === "institucion" ? fijar({ f: h.clave, p: null }) : fijar({ p: h.clave }))} />}
            {nivel === "programa" && <Grupos nodos={nodosGrupo} corte={corte} onAbrir={(clave, el) => (prepararVuelo(el), fijar({ m: null, g: clave }))} />}
            <Analisis nodo={nodo} materias={materiasCrit} />
            <div className="mo-detalles" data-in>
              <ComoSeClasifica umbrales={umbrales} setUmbrales={setUmbrales} />
              <ComoLeer />
            </div>
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

/* --- Buscar un estudiante por su código ------------------------------------------------------------ */

/** Busca solo entre lo que la persona ya puede ver: el permiso lo pone la base, no esta caja. */
function Buscador({ filas, nombreProg, onElegir }: { filas: FilaMonitor[]; nombreProg: (c: string) => string; onElegir: (f: FilaMonitor) => void }) {
  const [q, setQ] = useState("");
  const res = useMemo(() => buscarCodigos(filas, q), [filas, q]);
  const activo = q.trim().length >= 2;
  return (
    <div className="mo-busca" role="search">
      <label className="sr-only" htmlFor="mo-busca-q">
        Buscar estudiante por código
      </label>
      <input id="mo-busca-q" type="search" autoComplete="off" spellCheck={false} placeholder="Buscar código de estudiante" value={q} onChange={(ev) => setQ(ev.target.value)} onKeyDown={(ev) => ev.key === "Escape" && setQ("")} aria-describedby="mo-busca-n" />
      <span id="mo-busca-n" className="sr-only" aria-live="polite">
        {activo ? `${res.length} ${res.length === 1 ? "resultado" : "resultados"}` : ""}
      </span>
      {activo && (
        <ul className="mo-busca__res">
          {res.length === 0 && <li className="mo-muted mo-busca__vacio">Ningún código coincide entre los que usted puede ver.</li>}
          {res.map((r) => (
            <li key={`${r.estudiante}|${r.codigo_programa}`}>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  onElegir(r);
                }}
              >
                <b className="mo-codigo">{r.estudiante}</b>
                <small>{nombreProg(r.codigo_programa)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --- Portada: la idea principal del nivel ---------------------------------------------------------- */

function Portada({ nodo, nivel, nombre, corte, foco }: { nodo: Nodo; nivel: string; nombre: string; corte: Corte; foco: string | null }) {
  const total = nodo.estudiantes;
  const pct = (n: number) => (total ? `${coma((100 * n) / total)} % de ${total.toLocaleString("es-CO")}` : "—");
  return (
    <section className="mo-portada" data-in>
      <div className="mo-portada__texto">
        <h2>
          <span>{nivel === "institucion" ? `En el corte P${corte}` : `Corte P${corte}`}</span>
          <strong data-destino>{nivel === "institucion" ? "Cómo van los estudiantes" : nombre}</strong>
        </h2>
        {total === 0 ? (
          <p>Aún no hay estudiantes con notas suficientes en este corte.</p>
        ) : (
          <>
            {foco && (
              <p className="mo-foco">
                <Forma nivel="RS" size={16} />
                <span>{foco}</span>
              </p>
            )}
            <dl className="mo-cifras">
              <div>
                <dt>Clasificados</dt>
                <dd>
                  <Cuenta valor={total} />
                </dd>
              </div>
              <div>
                <dt>En seguimiento</dt>
                <dd>
                  <Cuenta valor={nodo.pctRS} decimales={1} sufijo=" %" />
                </dd>
              </div>
              <div>
                <dt>Promedio</dt>
                <dd>
                  <Cuenta valor={nodo.promedio} decimales={2} />
                </dd>
              </div>
            </dl>
          </>
        )}
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
  );
}

/* --- Una fila de la lista de prioridades ------------------------------------------------------------ */

interface PropsFila {
  k: string;
  nombre: string;
  sub?: React.ReactNode;
  barra: { NE: number; ED: number; RS: number };
  cifra: number;
  etiqueta: string;
  nivel: Nivel;
  marca?: string;
  extra?: React.ReactNode;
  onAbrir: (el: HTMLElement) => void;
}

function Fila({ k, nombre, sub, barra, cifra, etiqueta, nivel, marca, extra, onAbrir }: PropsFila) {
  return (
    <li data-k={k} className="mo-fila" data-n={nivel}>
      <button type="button" onClick={(ev) => onAbrir(ev.currentTarget)}>
        <span className="mo-fila__nombre">
          {marca && <em className="mo-fila__marca">{marca}</em>}
          <b data-ghost>{nombre}</b>
          {sub && <small>{sub}</small>}
        </span>
        <span className="mo-fila__barra">
          <BarraNiveles NE={barra.NE} ED={barra.ED} RS={barra.RS} alto={12} />
        </span>
        <span className="mo-fila__cifra">
          <b>{coma(cifra)} %</b>
          <small>{etiqueta}</small>
        </span>
        <span className="mo-fila__nivel">
          <Semaforo nivel={nivel} palabra={false} />
        </span>
        {extra && <span className="mo-fila__extra">{extra}</span>}
        <span className="mo-fila__ir" aria-hidden="true">
          →
        </span>
      </button>
    </li>
  );
}

const VISIBLES = 6;

/** Una lista que muestra primero lo más urgente y deja el resto a un clic. */
function ListaPrioridad({ clave, children, total, visibles, abierto, setAbierto, que }: { clave: string; children: React.ReactNode; total: number; visibles: number; abierto: boolean; setAbierto: (b: boolean) => void; que: string }) {
  const ref = useFlip<HTMLUListElement>(clave);
  return (
    <>
      <ul ref={ref} className="mo-lista">
        {children}
      </ul>
      {total > visibles && (
        <button type="button" className="mo-mas" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          {abierto ? `Ver solo ${que} más urgentes` : `Ver las ${total - visibles} restantes`}
        </button>
      )}
    </>
  );
}

/* --- Dónde hay que actuar: facultades o programas ---------------------------------------------------- */

function Prioridad({ nivel, hijos, corte, onAbrir }: { nivel: string; hijos: Nodo[]; corte: Corte; onAbrir: (n: Nodo, el: HTMLElement) => void }) {
  const [orden, setOrden] = useState<"rs" | "n" | "prom">("rs");
  const [todo, setTodo] = useState(false);
  const lista = useMemo(() => [...hijos].sort((a, b) => (orden === "rs" ? b.pctRS - a.pctRS : orden === "n" ? b.estudiantes - a.estudiantes : (a.promedio ?? 9) - (b.promedio ?? 9))), [hijos, orden]);
  const vista = todo ? lista : lista.slice(0, VISIBLES);
  const que = nivel === "institucion" ? "facultades" : "programas";
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-hijos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-hijos">Dónde hay que actuar</h3>
          <p>{nivel === "institucion" ? "Las facultades, de más a menos estudiantes en seguimiento." : "Los programas de la facultad, de más a menos estudiantes en seguimiento."} Abra una para bajar un nivel.</p>
        </div>
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
      {lista.length === 0 ? (
        <p className="mo-muted">No hay {que} con estudiantes clasificados en este corte.</p>
      ) : (
        <ListaPrioridad clave={`${orden}|${corte}|${vista.map((h) => h.clave).join(",")}`} total={lista.length} visibles={VISIBLES} abierto={todo} setAbierto={setTodo} que={`las ${VISIBLES}`}>
          {vista.map((h, i) => {
            const dom: Nivel = h.pctRS >= 25 ? "RS" : h.pctRS >= 12 ? "ED" : "NE";
            const s = h.serie;
            return (
              <Fila
                key={h.clave}
                k={h.clave}
                nombre={h.nombre}
                marca={i === 0 && orden === "rs" && h.pctRS > 0 ? "Empiece por aquí" : undefined}
                sub={
                  <>
                    {h.estudiantes.toLocaleString("es-CO")} estudiantes · promedio {coma(h.promedio, 2)}
                    {s.length > 1 && ` · P${s[0].corte} → P${s[s.length - 1].corte}: ${coma(s[0].pctRS)} % → ${coma(s[s.length - 1].pctRS)} %`}
                  </>
                }
                barra={{ NE: h.NE, ED: h.ED, RS: h.RS }}
                cifra={h.pctRS}
                etiqueta="en seguimiento"
                nivel={dom}
                onAbrir={(el) => onAbrir(h, el)}
              />
            );
          })}
        </ListaPrioridad>
      )}
    </section>
  );
}

/* --- Grupos de un programa ------------------------------------------------------------------------------- */

function Grupos({ nodos, corte, onAbrir }: { nodos: NodoGrupo[]; corte: Corte; onAbrir: (clave: string, el: HTMLElement) => void }) {
  const [nivel, setNivel] = useState<"todos" | Nivel>("todos");
  const [q, setQ] = useState("");
  const [todo, setTodo] = useState(false);
  const lista = useMemo(() => nodos.filter((x) => (nivel === "todos" || x.nivel === nivel) && (!q.trim() || `${x.materia} ${x.grupo}`.toLowerCase().includes(q.trim().toLowerCase()))), [nodos, nivel, q]);
  const vista = (todo || q.trim() ? lista : lista.slice(0, VISIBLES)).slice(0, 200);
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-grupos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-grupos">Dónde hay que actuar: los grupos</h3>
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
      {lista.length === 0 ? (
        <p className="mo-muted">Ningún grupo cumple el filtro.</p>
      ) : (
        <ListaPrioridad clave={`${nivel}|${q}|${corte}|${vista.map((x) => x.clave).join(",")}`} total={lista.length} visibles={q.trim() ? lista.length : VISIBLES} abierto={todo} setAbierto={setTodo} que={`los ${VISIBLES}`}>
          {vista.map((x, i) => (
            <Fila
              key={x.clave}
              k={x.clave}
              nombre={x.materia}
              marca={i === 0 && x.nivel === "RS" && !q.trim() && nivel === "todos" ? "Empiece por aquí" : undefined}
              sub={`Grupo ${x.grupo} · ${x.estudiantes} con nota · promedio ${coma(x.promedio, 2)}`}
              barra={{ NE: 100 - x.pctBajo, ED: 0, RS: x.pctBajo }}
              cifra={x.pctBajo}
              etiqueta="bajo la de aprobar"
              nivel={x.nivel}
              extra={<Tendencia valores={x.tendencia} />}
              onAbrir={(el) => onAbrir(x.clave, el)}
            />
          ))}
        </ListaPrioridad>
      )}
    </section>
  );
}

/* --- Análisis: evolución o cursos críticos, uno a la vez ------------------------------------------------ */

function Analisis({ nodo, materias }: { nodo: Nodo; materias: import("../warehouse/estudio").MateriaCritica[] }) {
  const [tab, setTab] = useState<"evo" | "crit">("evo");
  const pestanas: ["evo" | "crit", string][] = [
    ["evo", "Cómo evoluciona"],
    ["crit", `Cursos con alta reprobación (${materias.length})`],
  ];
  const mover = (ev: React.KeyboardEvent) => {
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      const otro = tab === "evo" ? "crit" : "evo";
      setTab(otro);
      requestAnimationFrame(() => document.getElementById(`mo-tab-${otro}`)?.focus());
    }
  };
  return (
    <section className="mo-seccion mo-analisis" data-in aria-label="Análisis del alcance">
      <div className="mo-pestanas" role="tablist" aria-label="Qué mirar" onKeyDown={mover}>
        {pestanas.map(([id, nombre]) => (
          <button key={id} id={`mo-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`mo-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
            {nombre}
          </button>
        ))}
      </div>
      <div key={tab} id={`mo-panel-${tab}`} role="tabpanel" aria-labelledby={`mo-tab-${tab}`} className="mo-panel">
        {tab === "evo" ? <Evolucion_ nodo={nodo} /> : <Criticas materias={materias} />}
      </div>
    </section>
  );
}

function Evolucion_({ nodo }: { nodo: Nodo }) {
  if (nodo.serie.length < 2) {
    return <p className="mo-muted">Con dos cortes con notas se ve cómo cambian los niveles. Hoy hay {nodo.serie.length}.</p>;
  }
  return (
    <>
      <p className="mo-panel__nota">Cada corte es una estación y su columna suma el 100 % de los estudiantes. Las cintas unen cada nivel con el del corte siguiente.</p>
      <Evolucion serie={nodo.serie} titulo="Composición NE, ED y RS en cada corte" />
    </>
  );
}

/* --- Un grupo: sus estudiantes por código ----------------------------------------------------------------- */

function VistaGrupo({ periodo, sede, clave, corte, fijar, gruposData, nombreProg }: { periodo: string; sede: string; clave: string; corte: Corte; fijar: (c: Record<string, string | null>) => void; gruposData: import("./logica").GrupoMonitor[]; nombreProg: (c: string) => string }) {
  const lista = useGrupoEstudiantes(periodo, sede, clave);
  const [q, setQ] = useState("");
  const [materia, grupo] = [clave.split("~")[0], clave.split("~")[1] ?? ""];
  const g = gruposData.find((x) => (x.grupo_clave ?? claveGrupo(x.codigo_materia, x.grupo)) === clave);
  const nota = (r: { p1: number | null; p2: number | null; p3: number | null }) => (corte === 1 ? r.p1 : corte === 2 ? r.p2 : r.p3);
  const filas = useMemo(() => (lista.data ?? []).map((r) => ({ ...r, nota: nota(r), nivel: nivelDeNota(nota(r)) })), [lista.data, corte]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = { NE: 0, ED: 0, RS: 0 };
  for (const r of filas) if (r.nivel) n[r.nivel] += 1;
  const bajo = g ? (corte === 1 ? g.bajo_p1 : corte === 2 ? g.bajo_p2 : g.bajo_p3) : 0;
  const con = g ? (corte === 1 ? g.con_p1 : corte === 2 ? g.con_p2 : g.con_p3) : 0;
  const visibles = [...filas].filter((r) => !q.trim() || r.estudiante.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (a.nota ?? 9) - (b.nota ?? 9));
  return (
    <>
      <section className="mo-portada" data-in>
        <div className="mo-portada__texto">
          <h2>
            <span>Grupo {grupo}</span>
            <strong data-destino>{g?.materia ?? materia}</strong>
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
          <div>
            <h3 id="mo-est">Los estudiantes, por código</h3>
            <p>NE: nota de 3,5 o más. ED: de 3,0 a 3,49. RS: menor a 3,0. Sin nombres: el código es el del estudiante y es un dato personal; úselo solo para su seguimiento académico.</p>
          </div>
          <div className="mo-filtros">
            <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar código…" aria-label="Buscar código en el grupo" spellCheck={false} />
          </div>
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
                {visibles.map((r) => (
                  <tr
                    key={r.estudiante}
                    data-n={r.nivel ?? undefined}
                    tabIndex={0}
                    onClick={(ev) => (prepararVuelo(ev.currentTarget.querySelector("[data-ghost]")), fijar({ e: r.estudiante }))}
                    onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), prepararVuelo(ev.currentTarget.querySelector("[data-ghost]")), fijar({ e: r.estudiante }))}
                  >
                    <td className="mo-codigo">
                      <b data-ghost>{r.estudiante}</b>
                      {pareceSeudonimo(r.estudiante) && <small className="mo-muted"> seudónimo</small>}
                    </td>
                    <td>{nombreProg(r.codigo_programa)}</td>
                    <td className="num">{coma(r.p1)}</td>
                    <td className="num">{coma(r.p2)}</td>
                    <td className="num">{coma(r.p3)}</td>
                    <td>{r.nivel ? <Semaforo nivel={r.nivel} palabra={false} /> : <span className="mo-muted">sin nota</span>}</td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="mo-muted">
                      Ningún código coincide.
                    </td>
                  </tr>
                )}
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
  const seud = pareceSeudonimo(estudiante);
  return (
    <>
      <section className="mo-portada" data-in>
        <div className="mo-portada__texto">
          <h2>
            <span>Estudiante</span>
            <strong data-destino className="mo-codigo" style={{ fontWeight: 600, fontSize: "0.6em" }}>
              {estudiante}
            </strong>
          </h2>
          <p>
            {fila ? `${nombreProg(fila.codigo_programa)}. ` : ""}
            {seud
              ? "Este código es un seudónimo: la carga es anterior a que el Monitor guardara el código real. Sirve para seguir el caso, pero no dice quién es; Planeación debe volver a cargar las notas."
              : "Es el código del estudiante, sin nombre ni documento. Es un dato personal: úselo solo para su seguimiento académico y no lo comparta."}
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
    <>
      <p className="mo-panel__nota">La «Alerta Temprana 4» del estudio de la UDES: materias donde 30 % o más de quienes ya tienen nota va por debajo de la de aprobar, con al menos 15 estudiantes con nota.</p>
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
    </>
  );
}

/* --- Cómo se clasifica y cómo leer (plegados: se abren cuando se necesitan) -------------------------------- */

function ComoSeClasifica({ umbrales, setUmbrales }: { umbrales: Umbrales; setUmbrales: (u: Umbrales) => void }) {
  const campo = (k: keyof Umbrales, nombre: string, ayuda: string, paso: number) => (
    <div className="mo-umbral">
      <label htmlFor={`u-${k}`}>{nombre}</label>
      <input id={`u-${k}`} type="number" step={paso} min={0} value={umbrales[k]} onChange={(ev) => Number.isFinite(ev.target.valueAsNumber) && setUmbrales({ ...umbrales, [k]: ev.target.valueAsNumber })} />
      <small>{ayuda}</small>
    </div>
  );
  return (
    <details className="mo-detalle" aria-labelledby="mo-clasifica">
      <summary id="mo-clasifica">Cómo se clasifica</summary>
      <div className="mo-detalle__cuerpo">
        <p>
          <b>NE</b>: promedio de {coma(umbrales.ne)} o más y ninguna materia perdida. <b>ED</b>: entre {coma(umbrales.rs)} y {coma(umbrales.ne)}, o una materia perdida. <b>RS</b>: promedio menor a {coma(umbrales.rs)}, {umbrales.perdidas} o más materias perdidas, o una caída de {coma(umbrales.caida)} frente al corte anterior. Cambie un valor y todo se recalcula.
        </p>
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
      </div>
    </details>
  );
}

function ComoLeer() {
  return (
    <details className="mo-detalle">
      <summary>Cómo leer este monitor</summary>
      <div className="mo-detalle__cuerpo">
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
          <div>
            <h4>Los códigos de estudiante</h4>
            <p>Se muestra el código real, sin nombre, documento, correo ni teléfono. Solo lo ve quien ya puede ver ese programa. Úselo para el seguimiento académico; las cargas anteriores muestran un seudónimo hasta volver a cargarlas.</p>
          </div>
        </div>
      </div>
    </details>
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
