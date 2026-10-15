/* =============================================================================
   Monitor · Mapa de riesgo (reprobación).

   Campus (sede) → Facultad → Programa → Curso, con el mismo recorrido por la URL
   (?vista=riesgo&f=&p=&c=&corte=&alc=). Todo sale de wh_monitor_riesgo: ya agregado por
   programa × curso × grupo × corte en la base, con el alcance de cada quien; al
   navegador no llega ninguna nota individual.

   Reglas del plan del grupo:
   · P1, P2 y P3 usan SOLO grupos de plan «tres cortes» (los únicos que reportan los tres).
   · La nota final puede incluir además «única» y «formación permanente»; el selector de
     alcance lo dice y las etiquetas muestran cuántos grupos hay de cada plan.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useRiesgoMonitor, usePlanesMonitor } from "./datos";
import { Barras, Dispersion, Ranking, type ItemBarra } from "./graficas";
import {
  MIN_DETALLE,
  NOMBRE_CORTE_RIESGO,
  NOMBRE_PLAN,
  cursosDe,
  filasDelCorte,
  gruposDeRiesgo,
  histogramaDe,
  indicadoresDe,
  nivelDeTasa,
  tasa,
  tasaPorCorte,
  TASA_CRITICA,
  type AlcancePlan,
  type CorteRiesgo,
  type FilaRiesgo,
  type Nivel,
  type Plan,
  type Programa,
} from "./logica";
import { Cuenta, Forma, prepararVuelo, useEntrada, useFlip, BarraNiveles, Semaforo, type Sentido } from "./piezas";

const coma = (n: number, d = 1) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const CORTES: CorteRiesgo[] = [1, 2, 3, 4];
const NIVEL_RUTA = ["campus", "facultad", "programa", "curso"] as const;

interface Props {
  periodo: string;
  sede: string;
  nombreSede: string;
  programas: Programa[];
  params: URLSearchParams;
  fijar: (c: Record<string, string | null>) => void;
}

export function MapaRiesgo({ periodo, sede, nombreSede, programas, params, fijar }: Props) {
  const riesgo = useRiesgoMonitor(periodo, sede);
  const planes = usePlanesMonitor(periodo, sede);
  if (riesgo.isPending) return <LoadingBlock rows={5} label="Leyendo la reprobación" />;
  if (riesgo.error) {
    const e = riesgo.error as Error;
    const falta = /wh_monitor_riesgo|does not exist|schema cache/i.test(e.message);
    return <ErrorBlock error={falta ? new Error("Falta aplicar la migración 0161 (mapa de riesgo y plan del grupo).") : e} title="No se pudo abrir el mapa de riesgo" onRetry={() => void riesgo.refetch()} />;
  }
  if (riesgo.data.length === 0) return <EmptyBlock title={`Aún no hay notas de ${periodo} para ver`} hint="Las notas salen del «Reporte global de notas» de Davinci, que Planeación carga en el Warehouse." />;
  return <Cuerpo filas={riesgo.data} planes={planes.data ?? []} periodo={periodo} nombreSede={nombreSede} programas={programas} params={params} fijar={fijar} />;
}

export interface PropsCuerpo {
  filas: FilaRiesgo[];
  planes: { plan: Plan; grupos: number; matriculas: number; plan_conocido: boolean }[];
  periodo: string;
  nombreSede: string;
  programas: Programa[];
  params: URLSearchParams;
  fijar: (c: Record<string, string | null>) => void;
}

type Ruta = (typeof NIVEL_RUTA)[number];
const PROF: Record<Ruta, number> = { campus: 0, facultad: 1, programa: 2, curso: 3 };

export function Cuerpo({ filas, planes, periodo, nombreSede, programas, params, fijar }: PropsCuerpo) {
  const alc: AlcancePlan = params.get("alc") === "todos" ? "todos" : "tres";
  const f = params.get("f");
  const p = params.get("p");
  const c = params.get("c");

  // El corte: «todos los planes» solo existe para la nota final.
  const hay = useMemo(() => new Set(filas.map((x) => x.corte)), [filas]);
  const pedido = params.get("corte") === "f" ? 4 : (Number(params.get("corte")) as CorteRiesgo);
  const disponibles = CORTES.filter((k) => (k === 4 ? filasDelCorte(filas, 4, alc).length > 0 : hay.has(k)));
  const corte: CorteRiesgo = alc === "todos" ? 4 : disponibles.includes(pedido) ? pedido : (disponibles.filter((k) => k < 4).pop() ?? disponibles[0] ?? 1);

  const prog = useMemo(() => new Map(programas.map((x) => [x.codigo_programa, x])), [programas]);
  const facDe = (cod: string) => prog.get(cod)?.facultad_id ?? "sin-facultad";
  const nombreFac = (id: string) => programas.find((x) => (x.facultad_id ?? "sin-facultad") === id)?.facultad ?? "Sin facultad asignada";
  const nombreProg = (cod: string) => prog.get(cod)?.nombre || filas.find((x) => x.codigo_programa === cod)?.programa || cod;

  // El alcance de la ruta (sin el corte, para poder comparar los cortes entre sí).
  const alcance = useMemo(() => filas.filter((x) => (!f || facDe(x.codigo_programa) === f) && (!p || x.codigo_programa === p) && (!c || x.codigo_materia === c)), [filas, f, p, c, prog]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => filasDelCorte(alcance, corte, alc), [alcance, corte, alc]);
  const ind = useMemo(() => indicadoresDe(base), [base]);
  const porCorte = useMemo(() => tasaPorCorte(alcance, alc), [alcance, alc]);
  const cursos = useMemo(() => cursosDe(base), [base]);
  const grupos = useMemo(() => gruposDeRiesgo(base), [base]);

  const nivel: Ruta = c ? "curso" : p ? "programa" : f ? "facultad" : "campus";
  const titulo = c ? (cursos[0]?.materia ?? c) : p ? nombreProg(p) : f ? nombreFac(f) : nombreSede;

  const antes = useRef(PROF[nivel]);
  const sentido: Sentido = PROF[nivel] > antes.current ? "abajo" : PROF[nivel] < antes.current ? "arriba" : "lado";
  const ref = useEntrada<HTMLDivElement>(`riesgo|${nivel}|${f}|${p}|${c}`, sentido);
  useLayoutEffect(() => {
    antes.current = PROF[nivel];
  });

  // Lo de abajo: facultades, programas, cursos o grupos, según el nivel.
  const hijos = useMemo(() => {
    const por = (clave: (x: FilaRiesgo) => string, nombre: (k: string) => string) => {
      const m = new Map<string, FilaRiesgo[]>();
      for (const x of base) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]);
      return [...m.entries()].map(([k, fs]) => ({ clave: k, nombre: nombre(k), ind: indicadoresDe(fs), sub: "" }));
    };
    if (nivel === "campus") return por((x) => facDe(x.codigo_programa), nombreFac);
    if (nivel === "facultad") return por((x) => x.codigo_programa, nombreProg);
    return [];
  }, [base, nivel, prog]); // eslint-disable-line react-hooks/exhaustive-deps

  const foco = useMemo(() => {
    const lista = nivel === "programa" || nivel === "curso" ? cursos.filter((x) => x.con >= MIN_DETALLE) : hijos.filter((x) => x.ind.matriculas >= MIN_DETALLE * 2).map((x) => ({ nombre: x.nombre, tasa: x.ind.tasa }));
    const top = [...lista].sort((a, b) => b.tasa - a.tasa)[0] as { nombre?: string; materia?: string; tasa: number } | undefined;
    if (!top || top.tasa <= 0) return null;
    return `Empiece por ${top.materia ?? top.nombre}: reprueba ${coma(top.tasa)} % de las matrículas con nota.`;
  }, [nivel, cursos, hijos]);

  const irNivel = (cambios: Record<string, string | null>) => fijar({ vista: "riesgo", ...cambios });

  const migas = (
    <nav className="mo-migas" aria-label="Dónde está">
      <button type="button" onClick={() => irNivel({ f: null, p: null, c: null })} disabled={nivel === "campus"}>
        {nombreSede}
      </button>
      {f && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => irNivel({ p: null, c: null })} disabled={nivel === "facultad"}>
            {nombreFac(f)}
          </button>
        </>
      )}
      {p && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => irNivel({ c: null })} disabled={nivel === "programa"}>
            {nombreProg(p)}
          </button>
        </>
      )}
      {c && (
        <>
          <span className="mo-migas__sep" aria-hidden="true">/</span>
          <span className="mo-migas__aqui">{titulo}</span>
        </>
      )}
    </nav>
  );

  const conocido = planes.length > 0 && planes[0].plan_conocido;
  const cnt = (pl: Plan) => planes.find((x) => x.plan === pl);

  return (
    <>
      {migas}

      <div className="mo-controles mo-controles--riesgo">
        <div className="mo-tren" role="radiogroup" aria-label="Corte">
          {CORTES.map((k, i) => {
            const activo = k === 4 ? filasDelCorte(filas, 4, alc).length > 0 : hay.has(k);
            return (
              <span key={k} style={{ display: "contents" }}>
                {i > 0 && <span className="mo-riel" aria-hidden="true" />}
                <button
                  type="button"
                  role="radio"
                  aria-checked={corte === k}
                  disabled={!activo || (alc === "todos" && k !== 4)}
                  className="mo-estacion-b"
                  onClick={() => irNivel({ corte: k === 4 ? "f" : String(k) })}
                >
                  <i />
                  {k === 4 ? "Final" : `P${k}`}
                  <small>{activo ? (k === 4 ? "nota final" : "con notas") : "aún sin notas"}</small>
                </button>
              </span>
            );
          })}
        </div>
        <div className="mo-alcance" role="radiogroup" aria-label="Qué grupos cuentan">
          <button type="button" role="radio" aria-checked={alc === "tres"} onClick={() => irNivel({ alc: null, corte: corte === 4 ? "f" : params.get("corte") })}>
            Tres cortes
          </button>
          <button type="button" role="radio" aria-checked={alc === "todos"} onClick={() => irNivel({ alc: "todos", corte: "f" })}>
            Nota final: todos los planes
          </button>
        </div>
      </div>

      <ul className="mo-planes" aria-label="Grupos por plan">
        {(["tres_cortes", "unica", "permanente"] as Plan[]).map((pl) => (
          <li key={pl} data-plan={pl} data-cuenta={alc === "todos" || pl === "tres_cortes"}>
            <b>{NOMBRE_PLAN[pl]}</b>
            <span>
              {(cnt(pl)?.grupos ?? 0).toLocaleString("es-CO")} grupos · {(cnt(pl)?.matriculas ?? 0).toLocaleString("es-CO")} matrículas
            </span>
          </li>
        ))}
        <li className="mo-planes__nota">
          {alc === "todos"
            ? "La nota final incluye los grupos de todos los planes."
            : "P1, P2 y P3 usan solo los grupos de plan «Tres cortes»: son los únicos que reportan los tres cortes."}
          {!conocido && " El plan de cada grupo llega del reporte «Rendimiento por grupo» de Master y todavía no se ha cargado: por ahora todos se tratan como «Tres cortes»."}
        </li>
      </ul>

      <div ref={ref} className="mo-cuerpo">
        <section className="mo-portada mo-portada--riesgo" data-in>
          <div className="mo-portada__texto">
            <h2>
              <span>{nivel === "campus" ? "Campus" : nivel === "facultad" ? "Facultad" : nivel === "programa" ? "Programa" : "Curso"} · {corte === 4 ? "nota final" : `corte P${corte}`}</span>
              <strong data-destino>{titulo}</strong>
            </h2>
            {base.length === 0 ? (
              <p>No hay matrículas con nota en este corte para este alcance.</p>
            ) : (
              foco && (
                <p className="mo-foco">
                  <Forma nivel="RS" size={16} />
                  <span>{foco}</span>
                </p>
              )
            )}
          </div>
          <Indicadores ind={ind} nivel={nivel} />
        </section>

        {nivel !== "curso" && nivel !== "programa" && hijos.length > 0 && <Hijos nivel={nivel} hijos={hijos} onAbrir={(k, el) => (prepararVuelo(el), irNivel(nivel === "campus" ? { f: k, p: null, c: null } : { p: k, c: null }))} />}
        {nivel === "programa" && <ListaCursos cursos={cursos} onAbrir={(k, el) => (prepararVuelo(el), irNivel({ c: k }))} />}
        {nivel === "curso" && <ListaGrupos grupos={grupos} onAbrir={(clave, el) => (prepararVuelo(el), fijar({ vista: null, g: clave, m: null, e: null }))} />}

        <Graficas nivel={nivel} porCorte={porCorte} cursos={cursos} grupos={grupos} base={base} corte={corte} nombreProg={nombreProg} irCurso={(k) => irNivel({ c: k })} irGrupo={(g) => fijar({ vista: null, g: g.clave, m: null, e: null })} />
      </div>
      <p className="mo-muted mo-riesgo__pie">
        Reprobar es sacar menos de la nota de aprobar (3,0; en Medicina, 3,5). Los cursos con menos de {MIN_DETALLE} matrículas con nota no se detallan. {periodo}. La reprobación sale de las notas del «Reporte global de notas» ya sumadas en la base.
      </p>
    </>
  );
}

/* --- Indicadores -------------------------------------------------------------------------------- */

function Indicadores({ ind, nivel }: { ind: ReturnType<typeof indicadoresDe>; nivel: string }) {
  const tarjetas: { id: string; titulo: string; valor: number; dec?: number; suf?: string; nota: string; nivel?: Nivel }[] = [
    { id: "tasa", titulo: "Tasa de reprobación", valor: ind.tasa, dec: 1, suf: " %", nota: "de las matrículas con nota", nivel: nivelDeTasa(ind.tasa) },
    { id: "rep", titulo: "Matrículas reprobadas", valor: ind.reprobadas, nota: `de ${ind.matriculas.toLocaleString("es-CO")} con nota` },
    { id: "cur", titulo: "Cursos con reprobación", valor: ind.cursosConReprobacion, nota: `de ${ind.cursos.toLocaleString("es-CO")} cursos` },
    { id: "crit", titulo: `Cursos con ${TASA_CRITICA} % o más`, valor: ind.cursosCriticos, nota: "tasa crítica", nivel: ind.cursosCriticos > 0 ? "RS" : "NE" },
    { id: "prog", titulo: nivel === "programa" || nivel === "curso" ? "Programas con curso crítico" : "Programas con curso crítico", valor: ind.programasConCritico, nota: "al menos un curso crítico" },
    { id: "det", titulo: "Cursos con detalle", valor: ind.cursosDetalle, nota: `${MIN_DETALLE} o más matrículas con nota` },
  ];
  return (
    <ul className="mo-indicadores" aria-label="Indicadores de reprobación">
      {tarjetas.map((t) => (
        <li key={t.id} data-n={t.nivel}>
          <span>{t.titulo}</span>
          <b>
            <Cuenta valor={t.valor} decimales={t.dec ?? 0} sufijo={t.suf ?? ""} />
            {t.nivel && <Forma nivel={t.nivel} size={14} />}
          </b>
          <small>{t.nota}</small>
        </li>
      ))}
    </ul>
  );
}

/* --- Listas para bajar de nivel ----------------------------------------------------------------- */

type Hijo = { clave: string; nombre: string; ind: ReturnType<typeof indicadoresDe> };

function FilaTasa({ k, nombre, sub, tasaV, barra, onAbrir, marca, extra }: { k: string; nombre: string; sub: string; tasaV: number; barra: { NE: number; RS: number }; onAbrir: (el: HTMLElement) => void; marca?: string; extra?: string }) {
  const n = nivelDeTasa(tasaV);
  return (
    <li data-k={k} className="mo-fila" data-n={n}>
      <button type="button" onClick={(ev) => onAbrir(ev.currentTarget)}>
        <span className="mo-fila__nombre">
          {marca && <em className="mo-fila__marca">{marca}</em>}
          <b data-ghost>{nombre}</b>
          <small>{sub}</small>
        </span>
        <span className="mo-fila__barra">
          <BarraNiveles NE={barra.NE} ED={0} RS={barra.RS} alto={12} />
        </span>
        <span className="mo-fila__cifra">
          <b>{coma(tasaV)} %</b>
          <small>{extra ?? "reprueba"}</small>
        </span>
        <span className="mo-fila__nivel">
          <Semaforo nivel={n} palabra={false} />
        </span>
        <span className="mo-fila__ir" aria-hidden="true">
          →
        </span>
      </button>
    </li>
  );
}

function Hijos({ nivel, hijos, onAbrir }: { nivel: Ruta; hijos: Hijo[]; onAbrir: (clave: string, el: HTMLElement) => void }) {
  const [todo, setTodo] = useState(false);
  const lista = useMemo(() => [...hijos].sort((a, b) => b.ind.tasa - a.ind.tasa || b.ind.matriculas - a.ind.matriculas), [hijos]);
  const vista = todo ? lista : lista.slice(0, 6);
  const ref = useFlip<HTMLUListElement>(vista.map((h) => h.clave).join(","));
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-r-hijos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-r-hijos">{nivel === "campus" ? "Dónde se reprueba más: las facultades" : "Dónde se reprueba más: los programas"}</h3>
          <p>De más a menos reprobación en este corte. Abra una para bajar un nivel.</p>
        </div>
      </div>
      <ul ref={ref} className="mo-lista">
        {vista.map((h, i) => (
          <FilaTasa
            key={h.clave}
            k={h.clave}
            nombre={h.nombre}
            marca={i === 0 && h.ind.tasa > 0 ? "Empiece por aquí" : undefined}
            sub={`${h.ind.matriculas.toLocaleString("es-CO")} matrículas con nota · ${h.ind.cursosCriticos} ${h.ind.cursosCriticos === 1 ? "curso crítico" : "cursos críticos"}`}
            tasaV={h.ind.tasa}
            barra={{ NE: h.ind.matriculas - h.ind.reprobadas, RS: h.ind.reprobadas }}
            onAbrir={(el) => onAbrir(h.clave, el)}
          />
        ))}
      </ul>
      {lista.length > 6 && (
        <button type="button" className="mo-mas" aria-expanded={todo} onClick={() => setTodo(!todo)}>
          {todo ? "Ver solo los 6 con más reprobación" : `Ver las ${lista.length - 6} restantes`}
        </button>
      )}
    </section>
  );
}

function ListaCursos({ cursos, onAbrir }: { cursos: ReturnType<typeof cursosDe>; onAbrir: (cod: string, el: HTMLElement) => void }) {
  const [todo, setTodo] = useState(false);
  const lista = cursos.filter((x) => x.con >= MIN_DETALLE);
  const vista = todo ? lista : lista.slice(0, 6);
  const ref = useFlip<HTMLUListElement>(vista.map((h) => h.codigo_materia).join(","));
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-r-cursos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-r-cursos">Dónde se reprueba más: los cursos</h3>
          <p>Cursos con {MIN_DETALLE} o más matrículas con nota, de mayor a menor reprobación. Abra uno para ver sus grupos.</p>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="mo-muted">Ningún curso de este programa llega a {MIN_DETALLE} matrículas con nota en este corte.</p>
      ) : (
        <>
          <ul ref={ref} className="mo-lista">
            {vista.map((x, i) => (
              <FilaTasa
                key={x.codigo_materia}
                k={x.codigo_materia}
                nombre={x.materia}
                marca={i === 0 && x.tasa > 0 ? "Empiece por aquí" : undefined}
                sub={`${x.codigo_materia} · ${x.con} matrículas con nota · ${x.grupos} ${x.grupos === 1 ? "grupo" : "grupos"}`}
                tasaV={x.tasa}
                barra={{ NE: x.con - x.bajo, RS: x.bajo }}
                onAbrir={(el) => onAbrir(x.codigo_materia, el)}
              />
            ))}
          </ul>
          {lista.length > 6 && (
            <button type="button" className="mo-mas" aria-expanded={todo} onClick={() => setTodo(!todo)}>
              {todo ? "Ver solo los 6 con más reprobación" : `Ver los ${lista.length - 6} restantes`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ListaGrupos({ grupos, onAbrir }: { grupos: ReturnType<typeof gruposDeRiesgo>; onAbrir: (clave: string, el: HTMLElement) => void }) {
  const ref = useFlip<HTMLUListElement>(grupos.map((g) => g.clave).join(","));
  return (
    <section className="mo-seccion" data-in aria-labelledby="mo-r-grupos">
      <div className="mo-seccion__cabeza">
        <div>
          <h3 id="mo-r-grupos">Los grupos del curso</h3>
          <p>Cada grupo es código de materia + letra. Abra uno para ver a sus estudiantes por código.</p>
        </div>
      </div>
      <ul ref={ref} className="mo-lista">
        {grupos.map((g, i) => (
          <FilaTasa
            key={g.clave}
            k={g.clave}
            nombre={`Grupo ${g.grupo}`}
            marca={i === 0 && g.tasa > 0 ? "Empiece por aquí" : undefined}
            sub={`${g.clave} · ${g.con} matrículas con nota`}
            tasaV={g.tasa}
            barra={{ NE: g.con - g.bajo, RS: g.bajo }}
            onAbrir={(el) => onAbrir(g.clave, el)}
          />
        ))}
      </ul>
    </section>
  );
}

/* --- Las gráficas, una a la vez ------------------------------------------------------------------ */

type Pestana = "corte" | "cursos" | "dispersion" | "distribucion";

function Graficas({ nivel, porCorte, cursos, grupos, base, corte, nombreProg, irCurso, irGrupo }: { nivel: Ruta; porCorte: ReturnType<typeof tasaPorCorte>; cursos: ReturnType<typeof cursosDe>; grupos: ReturnType<typeof gruposDeRiesgo>; base: FilaRiesgo[]; corte: CorteRiesgo; nombreProg: (c: string) => string; irCurso: (cod: string) => void; irGrupo: (g: { clave: string }) => void }) {
  const [tab, setTab] = useState<Pestana>("corte");
  const pestanas: [Pestana, string][] = [
    ["corte", "Por corte"],
    ["cursos", nivel === "curso" ? "Por programa" : "Cursos con reprobación"],
    ["dispersion", "Tamaño del grupo"],
    ["distribucion", "Distribución"],
  ];
  const mover = (ev: React.KeyboardEvent) => {
    const i = pestanas.findIndex(([id]) => id === tab);
    const sig = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : null;
    if (sig === null) return;
    ev.preventDefault();
    const nuevo = pestanas[(sig + pestanas.length) % pestanas.length][0];
    setTab(nuevo);
    requestAnimationFrame(() => document.getElementById(`mo-gt-${nuevo}`)?.focus());
  };

  const itemsCorte: ItemBarra[] = porCorte.map((x) => ({ id: `c${x.corte}`, etiqueta: x.corte === 4 ? "Nota final" : NOMBRE_CORTE_RIESGO[x.corte], sub: `${x.con.toLocaleString("es-CO")} matrículas`, valor: x.tasa, texto: `${coma(x.tasa)} %`, nivel: nivelDeTasa(x.tasa) }));
  const maxCorte = Math.max(50, ...itemsCorte.map((i) => i.valor));
  const tramos = histogramaDe(cursos);
  const itemsTramo: ItemBarra[] = tramos.map((t) => ({ id: `t${t.desde}`, etiqueta: `${t.etiqueta} %`, valor: t.cursos, texto: String(t.cursos), nivel: t.nivel }));

  const ranking = useMemo(() => {
    if (nivel === "curso") {
      const m = new Map<string, FilaRiesgo[]>();
      for (const x of base) m.set(x.codigo_programa, [...(m.get(x.codigo_programa) ?? []), x]);
      return [...m.entries()].map(([k, fs]) => {
        const con = fs.reduce((s, x) => s + x.con, 0);
        const bajo = fs.reduce((s, x) => s + x.bajo, 0);
        return { id: k, nombre: nombreProg(k), sub: `${con} matrículas con nota`, tasa: tasa(bajo, con), nivel: nivelDeTasa(tasa(bajo, con)), con };
      });
    }
    return cursos.map((x) => ({ id: x.codigo_materia, nombre: x.materia, sub: `${x.con} matrículas con nota · ${x.grupos} ${x.grupos === 1 ? "grupo" : "grupos"}`, tasa: x.tasa, nivel: x.nivel, con: x.con }));
  }, [nivel, cursos, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = ranking.filter((x) => x.con >= MIN_DETALLE).sort((a, b) => b.tasa - a.tasa || b.con - a.con).slice(0, 12);
  const puntos = grupos.filter((g) => g.con >= MIN_DETALLE);

  return (
    <section className="mo-seccion mo-analisis" data-in aria-label="Gráficas de reprobación">
      <div className="mo-pestanas" role="tablist" aria-label="Qué mirar" onKeyDown={mover}>
        {pestanas.map(([id, nombre]) => (
          <button key={id} id={`mo-gt-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`mo-gp-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
            {nombre}
          </button>
        ))}
      </div>
      <div key={tab} id={`mo-gp-${tab}`} role="tabpanel" aria-labelledby={`mo-gt-${tab}`} className="mo-panel">
        {tab === "corte" &&
          (itemsCorte.length === 0 ? (
            <p className="mo-muted">Aún no hay cortes con notas para este alcance.</p>
          ) : (
            <>
              <p className="mo-panel__nota">Tasa de reprobación en cada corte, con los grupos de plan «Tres cortes»{itemsCorte.some((i) => i.id === "c4") ? "; la nota final suma los planes que elija arriba" : ""}. Cada columna lleva su forma y su cifra.</p>
              <Barras items={itemsCorte} maximo={maxCorte} titulo="Tasa de reprobación por corte" />
            </>
          ))}
        {tab === "cursos" &&
          (top.length === 0 ? (
            <p className="mo-muted">No hay {nivel === "curso" ? "programas" : "cursos"} con {MIN_DETALLE} o más matrículas con nota.</p>
          ) : (
            <>
              <p className="mo-panel__nota">
                {nivel === "curso" ? "Los programas donde se cursa, de mayor a menor reprobación." : `Los ${top.length} cursos con más reprobación (con ${MIN_DETALLE} o más matrículas con nota). Abra uno con un clic.`}
              </p>
              <Ranking items={top} titulo={nivel === "curso" ? "Programas por tasa de reprobación" : "Cursos por tasa de reprobación"} onAbrir={nivel === "curso" ? undefined : (i) => irCurso(i.id)} />
            </>
          ))}
        {tab === "dispersion" && <Dispersion grupos={puntos} onAbrir={(g) => (nivel === "curso" ? irGrupo(g) : irCurso(g.clave.split("~")[0]))} />}
        {tab === "distribucion" &&
          (cursos.filter((x) => x.con >= MIN_DETALLE).length === 0 ? (
            <p className="mo-muted">No hay cursos con {MIN_DETALLE} o más matrículas con nota.</p>
          ) : (
            <>
              <p className="mo-panel__nota">Cuántos cursos caen en cada tramo de reprobación. Los de la derecha (50 % o más) son los críticos.</p>
              <Barras items={itemsTramo} maximo={Math.max(1, ...itemsTramo.map((i) => i.valor))} titulo="Número de cursos por tramo de tasa de reprobación" />
            </>
          ))}
      </div>
    </section>
  );
}
