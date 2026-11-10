/* =============================================================================
   Portal de alertas · mapa de riesgo por campus.

   Campus (sede) → Facultad → Programa → Curso, con el recorrido en la dirección
   (?f=&p=&c=&corte=&alc=&tab=&est=), como en el Monitor de la intranet. Todo sale de
   wh_monitor_riesgo: ya agregado por programa × curso × grupo × corte, con el alcance de cada
   quien; al navegador no llega ninguna nota individual.

   Reglas: P1, P2 y P3 usan solo grupos de plan «tres cortes»; la nota final puede sumar los demás
   planes. Reprobar es sacar menos de 3,0 (Medicina, 3,5). Un curso es de reprobación alta desde 30 %
   y crítico desde 50 %; con menos de 5 matrículas con nota no se detalla.

   Nuevo: el periodo se elige aquí, los cortes que todavía no tienen notas se pueden estimar (con
   trama y la palabra «estimado») y un escenario baja la reprobación de los cursos de 30 % o más.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { MIN_DETALLE, NOMBRE_PLAN, cursosDe, gruposDeRiesgo, indicadoresDe, partirClave, tasa, TASA_ALTA, type AlcancePlan, type CorteRiesgo, type FilaRiesgo, type Plan } from "../monitor/logica";
import { Cuenta, useEntrada } from "../monitor/piezas";
import { SIN_FACULTAD, useAlertas } from "./contexto";
import { mensajeAlertas, usePlanesMonitor, useRiesgoMonitor } from "./datos";
import { AvisoEstimado, ColumnasCorte, DispersionGrupos, HistogramaTramos, Leyenda, Pares, Ranking, coma, type ItemRank } from "./graficos";
import { PeriodoSede } from "./Marco";
import { completarRiesgo, filasCorte, itemsCursos, puntosCorte, puntosGrupos } from "./vistaRiesgo";

type Pestana = "corte" | "cursos" | "grupo" | "dist";
const PESTANAS: [Pestana, string][] = [
  ["corte", "Por corte"],
  ["cursos", "Cursos con reprobación"],
  ["grupo", "Tamaño del grupo"],
  ["dist", "Distribución"],
];
const NOMBRE_CORTE: Record<CorteRiesgo, string> = { 1: "P1", 2: "P2", 3: "P3", 4: "Final" };

export function Riesgo() {
  const ctx = useAlertas();
  const riesgo = useRiesgoMonitor(ctx.periodo, ctx.sede);
  const planes = usePlanesMonitor(ctx.periodo, ctx.sede);
  const cabeza = (
    <section className="al-seccion">
      <h1 className="al-titulo">Mapa de riesgo</h1>
      <p className="al-lead">Reprobación por campus, facultad, programa y curso. Elija el periodo y el corte.</p>
    </section>
  );
  const selectores = (
    <div className="al-controles">
      <PeriodoSede periodo={ctx.periodo} sede={ctx.sede} periodos={ctx.periodos} fijar={(c) => ctx.fijar("sede" in c ? { ...c, f: null, p: null, c: null } : c)} />
    </div>
  );
  if (riesgo.isPending)
    return (
      <div className="al-pagina">
        {cabeza}
        {selectores}
        <LoadingBlock rows={5} label="Leyendo la reprobación" />
      </div>
    );
  if (riesgo.error)
    return (
      <div className="al-pagina">
        {cabeza}
        {selectores}
        <ErrorBlock error={new Error(/wh_monitor_riesgo|does not exist|schema cache/i.test((riesgo.error as Error).message) ? "Falta aplicar la migración 0161 (mapa de riesgo y plan del grupo)." : mensajeAlertas(riesgo.error))} title="No se pudo abrir el mapa de riesgo" onRetry={() => void riesgo.refetch()} />
      </div>
    );
  if (riesgo.data.length === 0)
    return (
      <div className="al-pagina">
        {cabeza}
        {selectores}
        <EmptyBlock title={`Aún no hay notas de ${ctx.periodo} para ver`} hint="Las notas salen del «Reporte global de notas» de Davinci, que Planeación carga en el Warehouse. Pruebe con otro periodo o sede." />
      </div>
    );
  return <Mapa filasCrudas={riesgo.data} planes={planes.data ?? []} cabeza={cabeza} selectores={selectores} />;
}

function Mapa({ filasCrudas, planes, cabeza, selectores }: { filasCrudas: FilaRiesgo[]; planes: { plan: Plan; grupos: number; matriculas: number; plan_conocido: boolean }[]; cabeza: React.ReactNode; selectores: React.ReactNode }) {
  const ctx = useAlertas();
  const [params] = useSearchParams();
  const alc: AlcancePlan = params.get("alc") === "todos" ? "todos" : "tres";
  const estimar = params.get("est") !== "0";
  const tab = (PESTANAS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "corte") as Pestana;
  const [verTodos, setVerTodos] = useState(false);
  const [bajan, setBajan] = useState(10);

  const filas = useMemo(() => completarRiesgo(filasCrudas), [filasCrudas]);
  const prog = useMemo(() => new Map(ctx.programas.map((x) => [x.codigo_programa, x])), [ctx.programas]);
  const facDe = (cod: string) => prog.get(cod)?.facultad_id ?? SIN_FACULTAD;
  const nombreFac = (id: string) => ctx.programas.find((x) => (x.facultad_id ?? SIN_FACULTAD) === id)?.facultad ?? "Sin facultad asignada";
  const nombreProg = (cod: string) => prog.get(cod)?.nombre || filas.find((x) => x.codigo_programa === cod)?.programa || cod;

  const fParam = params.get("f");
  const pParam = params.get("p");
  const cParam = params.get("c");
  const f = fParam && filas.some((x) => facDe(x.codigo_programa) === fParam) ? fParam : null;
  const p = pParam && filas.some((x) => x.codigo_programa === pParam) ? pParam : null;
  const c = cParam && filas.some((x) => x.codigo_materia === cParam && (!p || x.codigo_programa === p)) ? cParam : null;
  const nivel = c ? "curso" : p ? "programa" : f ? "facultad" : "campus";

  const alcance = useMemo(() => filas.filter((x) => (!f || facDe(x.codigo_programa) === f) && (!p || x.codigo_programa === p) && (!c || x.codigo_materia === c)), [filas, f, p, c, prog]); // eslint-disable-line react-hooks/exhaustive-deps
  const puntos = useMemo(() => puntosCorte(alcance, alc, estimar), [alcance, alc, estimar]);
  const disponibles = puntos.filter((x) => x.hay).map((x) => x.corte);
  const pedido = params.get("corte") === "f" ? 4 : (Number(params.get("corte")) as CorteRiesgo);
  const corte: CorteRiesgo = alc === "todos" ? 4 : disponibles.includes(pedido) ? pedido : (disponibles.filter((k) => k < 4).pop() ?? disponibles[0] ?? 2);
  const base = useMemo(() => filasCorte(alcance, corte, alc, estimar), [alcance, corte, alc, estimar]);
  const ind = useMemo(() => indicadoresDe(base), [base]);
  const cursos = useMemo(() => cursosDe(base), [base]);
  const estimado = base.some((x) => x.est);

  const hijos = useMemo<ItemRank[]>(() => {
    if (nivel !== "campus" && nivel !== "facultad") return [];
    const por = new Map<string, typeof base>();
    for (const x of base) {
      const k = nivel === "campus" ? facDe(x.codigo_programa) : x.codigo_programa;
      por.set(k, [...(por.get(k) ?? []), x]);
    }
    return [...por.entries()]
      .map(([k, fs]) => {
        const i = indicadoresDe(fs);
        return { clave: k, nombre: nivel === "campus" ? nombreFac(k) : nombreProg(k), sub: `${i.matriculas.toLocaleString("es-CO")} matrículas`, tasa: i.tasa, est: fs.some((x) => x.est) };
      })
      .sort((a, b) => b.tasa - a.tasa);
  }, [base, nivel, prog]); // eslint-disable-line react-hooks/exhaustive-deps

  const titulo = c ? (cursos[0]?.materia ?? c) : p ? nombreProg(p) : f ? nombreFac(f) : ctx.nombreSede;
  const ref = useEntrada<HTMLDivElement>(`riesgo|${nivel}|${f}|${p}|${c}|${tab}`, nivel === "campus" ? "arriba" : "abajo");
  const ir = (cambios: Record<string, string | null>) => ctx.fijar(cambios);

  // Escenario: los cursos de 30 % o más bajan `bajan` puntos.
  const escenario = useMemo(() => {
    let nuevo = 0;
    let evitadas = 0;
    let criticosAntes = 0;
    let criticosDespues = 0;
    for (const x of cursos) {
      const b = x.tasa >= TASA_ALTA ? (x.con * Math.max(0, x.tasa - bajan)) / 100 : x.bajo;
      nuevo += b;
      evitadas += x.bajo - b;
      if (x.con >= MIN_DETALLE && x.tasa >= 50) criticosAntes += 1;
      if (x.con >= MIN_DETALLE && (x.tasa >= TASA_ALTA ? Math.max(0, x.tasa - bajan) : x.tasa) >= 50) criticosDespues += 1;
    }
    return { nueva: tasa(nuevo, ind.matriculas), evitadas: Math.round(evitadas), criticosAntes, criticosDespues };
  }, [cursos, bajan, ind.matriculas]);

  const cnt = (pl: Plan) => planes.find((x) => x.plan === pl);
  const conocido = planes.length > 0 && planes[0].plan_conocido;
  const indicadores: [React.ReactNode, string][] = [
    [<Cuenta key="a" valor={ind.tasa} decimales={1} sufijo=" %" />, "de las matrículas con nota se reprueban"],
    [<Cuenta key="b" valor={ind.reprobadas} />, `matrículas reprobadas de ${ind.matriculas.toLocaleString("es-CO")} con nota`],
    [<Cuenta key="c" valor={ind.cursosConReprobacion} />, "cursos con al menos una reprobación"],
    [<Cuenta key="d" valor={ind.cursosCriticos} />, "cursos con 50 % o más de reprobación"],
    [<Cuenta key="e" valor={ind.programasConCritico} />, "programas con un curso crítico"],
    [<Cuenta key="f" valor={ind.cursosDetalle} />, `cursos con detalle (${MIN_DETALLE} matrículas o más)`],
  ];

  const abrirCurso = (cod: string) => ir({ c: cod, tab: null });
  let cuerpoTab: React.ReactNode;
  if (tab === "corte") {
    cuerpoTab = (
      <>
        <p className="al-nota">Tasa de reprobación en cada corte, con los grupos de plan «Tres cortes». Cada columna lleva su forma y su cifra.</p>
        <ColumnasCorte puntos={puntos} corte={corte} />
        <Leyenda tasa estimado={puntos.some((x) => x.est)} />
      </>
    );
  } else if (tab === "cursos") {
    const items = nivel === "curso" ? gruposDeRiesgo(base).map((g) => ({ clave: g.clave, nombre: `Grupo ${g.grupo}`, sub: `${g.con} matrículas con nota`, tasa: g.tasa, est: base.some((x) => x.est && x.grupo_clave === g.clave) })) : itemsCursos(base, nivel !== "programa");
    cuerpoTab = (
      <>
        <p className="al-nota">{nivel === "curso" ? "Los grupos del curso, de más a menos reprobación." : `De más a menos reprobación en ${NOMBRE_CORTE[corte]}.${nivel === "programa" ? " Abra un curso para ver sus grupos." : ""}`}</p>
        {items.length === 0 ? <p className="al-nota">Sin cursos con {MIN_DETALLE} matrículas o más con nota en este corte.</p> : <Ranking titulo="Reprobación" items={verTodos ? items : items.slice(0, 12)} onAbrir={nivel === "programa" ? abrirCurso : undefined} />}
        {items.length > 12 && (
          <button type="button" className="al-boton" onClick={() => setVerTodos(!verTodos)}>
            {verTodos ? "Ver solo los 12 mayores" : `Ver los ${items.length}`}
          </button>
        )}
        <Leyenda tasa estimado={estimado} />
      </>
    );
  } else if (tab === "grupo") {
    cuerpoTab = <DispersionGrupos grupos={puntosGrupos(base)} onAbrir={nivel === "programa" ? (g) => abrirCurso(partirClave(g.clave)?.codigo_materia ?? "") : undefined} />;
  } else {
    cuerpoTab = (
      <>
        <p className="al-nota">Cuántos cursos caen en cada tramo de reprobación, solo con {MIN_DETALLE} matrículas o más con nota.</p>
        <HistogramaTramos cursos={cursos} />
        <Leyenda tasa />
      </>
    );
  }

  return (
    <div ref={ref} className="al-pagina">
      {cabeza}
      {selectores}
      <div className="al-controles al-controles--cortes" data-in>
        <div>
          <p className="al-etiqueta">Corte</p>
          <div className="al-tren" role="radiogroup" aria-label="Corte">
            {puntos.map((x, i) => (
              <span key={x.corte} className="al-tren__par">
                {i > 0 && <span className="al-tren__riel" aria-hidden="true" />}
                <button type="button" role="radio" aria-checked={corte === x.corte} disabled={!x.hay || (alc === "todos" && x.corte !== 4)} data-est={x.est || undefined} onClick={() => ir({ corte: x.corte === 4 ? "f" : String(x.corte) })}>
                  <i />
                  {x.corte === 4 ? "Final" : `P${x.corte}`}
                  <small>{!x.hay ? "aún sin notas" : x.est ? "estimado" : x.corte === 4 ? "nota final" : "con notas"}</small>
                </button>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="al-etiqueta">Qué grupos cuentan</p>
          <div className="al-seg" role="radiogroup" aria-label="Qué grupos cuentan">
            <button type="button" role="radio" aria-checked={alc === "tres"} onClick={() => ir({ alc: null, corte: corte === 4 ? "f" : String(corte) })}>
              Tres cortes
            </button>
            <button type="button" role="radio" aria-checked={alc === "todos"} onClick={() => ir({ alc: "todos", corte: "f" })}>
              Nota final: todos los planes
            </button>
          </div>
        </div>
        <label className="al-interruptor">
          <input type="checkbox" checked={estimar} onChange={(e) => ir({ est: e.target.checked ? null : "0" })} />
          <span>Estimar cortes sin notas</span>
        </label>
      </div>
      <p className="al-nota" data-in>
        {(["tres_cortes", "unica", "permanente"] as Plan[]).map((pl) => cnt(pl) && (alc === "todos" || pl === "tres_cortes") && `${NOMBRE_PLAN[pl]}: ${cnt(pl)?.grupos.toLocaleString("es-CO")} grupos`).filter(Boolean).join(". ")}
        {alc === "todos" ? ". La nota final suma todos los planes." : ". P1, P2 y P3 usan solo los grupos de plan «Tres cortes»: son los únicos que reportan los tres cortes."}
        {!conocido && planes.length > 0 ? " El plan de cada grupo llega del reporte «Rendimiento por grupo» de Master y todavía no se ha cargado: por ahora todos se tratan como «Tres cortes»." : ""}
      </p>

      <section className="al-seccion" data-in>
        <nav className="al-migas" aria-label="Dónde está">
          <button type="button" disabled={nivel === "campus"} onClick={() => ir({ f: null, p: null, c: null })}>
            {ctx.nombreSede}
          </button>
          {f && (
            <>
              <span aria-hidden="true">/</span>
              <button type="button" disabled={nivel === "facultad"} onClick={() => ir({ p: null, c: null })}>
                {nombreFac(f)}
              </button>
            </>
          )}
          {p && (
            <>
              <span aria-hidden="true">/</span>
              <button type="button" disabled={nivel === "programa"} onClick={() => ir({ c: null })}>
                {nombreProg(p)}
              </button>
            </>
          )}
          {c && (
            <>
              <span aria-hidden="true">/</span>
              <span className="al-migas__aqui">{titulo}</span>
            </>
          )}
        </nav>
        <h2 className="al-titulo-nivel">{titulo}</h2>
        <p className="al-nota">
          {NOMBRE_CORTE[corte]}
          {estimado ? " (estimado)" : ""}, {ctx.periodo}
        </p>
        {estimado && <AvisoEstimado />}
        {base.length === 0 ? (
          <p className="al-nota">No hay matrículas con nota en este corte para este alcance.</p>
        ) : (
          <dl className="al-inds">
            {indicadores.map(([valor, texto], i) => (
              <div key={i}>
                <dt>{valor}</dt>
                <dd>{texto}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {hijos.length > 0 && (
        <section className="al-seccion" data-in>
          <h2>{nivel === "campus" ? "Dónde se reprueba más: las facultades" : "Dónde se reprueba más: los programas"}</h2>
          <p className="al-nota">De más a menos reprobación en {NOMBRE_CORTE[corte]}. Abra una para bajar un nivel.</p>
          <Ranking titulo="Dónde se reprueba más" items={hijos} onAbrir={(k) => ir(nivel === "campus" ? { f: k, p: null, c: null } : { p: k, c: null })} />
        </section>
      )}

      <section className="al-seccion" data-in>
        <div className="al-subnav" role="tablist" aria-label="Vistas del mapa">
          {PESTANAS.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => ir({ tab: k === "corte" ? null : k })}>
              {t}
            </button>
          ))}
        </div>
        {base.length === 0 && tab !== "corte" ? <p className="al-nota">No hay matrículas con nota en este corte para este alcance.</p> : cuerpoTab}
      </section>

      {base.length > 0 && (
        <section className="al-seccion" data-in>
          <h2>Escenario para {nivel === "campus" ? "el campus" : nivel === "facultad" ? "la facultad" : nivel === "programa" ? "el programa" : "el curso"}</h2>
          <p className="al-nota">¿Qué pasaría si los cursos con reprobación de 30 % o más la bajan unos puntos?</p>
          <label className="al-rango">
            <span>
              Reducción: <b>{bajan} puntos</b>
            </span>
            <input type="range" min={0} max={25} step={1} value={bajan} onChange={(e) => setBajan(Number(e.target.value))} aria-label="Reducción de la reprobación" />
          </label>
          <Pares titulo="Reprobación del alcance" sin={ind.tasa} con={escenario.nueva} tope={100} formato={(v) => `${coma(v)} %`} />
          <p className="al-prosa">
            Se evitarían unas <b>{escenario.evitadas.toLocaleString("es-CO")}</b> reprobaciones y los cursos críticos pasarían de {escenario.criticosAntes} a {escenario.criticosDespues}.
          </p>
        </section>
      )}
    </div>
  );
}
