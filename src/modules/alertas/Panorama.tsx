/* Portal de alertas · panorama de un programa y semestre: la cohorte, lo que se espera, los escenarios, los cursos y la comparación con otros semestres. */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import type { AlcancePlan, CorteRiesgo } from "../monitor/logica";
import { useEntrada } from "../monitor/piezas";
import { calorSemestres, composicion, esperadoProximo, personaEscenario, resumenDe, siguientePeriodo } from "./cohorte";
import { useAlertas } from "./contexto";
import { mensajeAlertas, useRiesgoSemestre } from "./datos";
import { escenarioPrograma, NOMBRE_QUIEN, type Quien } from "./estimacion";
import { Apilada, AvisoEstimado, DispersionGrupos, Leyenda, MapaCalor, Pares, Ranking, coma } from "./graficos";
import { Termino } from "./termino";
import { Estado, useCohorte } from "./usoCohorte";
import { completarRiesgo, corteInicial, filasCorte, itemsCursos, puntosGrupos } from "./vistaRiesgo";

const CORTES: CorteRiesgo[] = [1, 2, 3, 4];
const NOMBRE_CORTE: Record<CorteRiesgo, string> = { 1: "P1", 2: "P2", 3: "P3", 4: "Final" };
const PLAN: AlcancePlan = "tres";

export function Panorama() {
  const ctx = useAlertas();
  const { q, cohorte } = useCohorte(ctx);
  return (
    <Estado q={q} cohorte={cohorte} ctx={ctx}>
      <Cuerpo />
    </Estado>
  );
}

function Cuerpo() {
  const ctx = useAlertas();
  const { cohorte } = useCohorte(ctx);
  const t = cohorte.t;
  const r = useMemo(() => resumenDe(t), [t]);
  const esperado = useMemo(() => esperadoProximo(t), [t]);
  const siguiente = siguientePeriodo(ctx.periodo);
  const parcial = t.some((x) => x.actual.parcial);
  const ref = useEntrada<HTMLDivElement>(`panorama|${ctx.p}|${ctx.s}|${ctx.periodo}`);

  const [quien, setQuien] = useState<Quien>("rsed");
  const [d, setD] = useState(0.4);
  const personas = useMemo(() => t.map((x) => personaEscenario(x, ctx.facultad.nombre)), [t, ctx.facultad.nombre]);
  const base = useMemo(() => escenarioPrograma(personas, 0, null), [personas]);
  const esc = useMemo(() => escenarioPrograma(personas, d, quien), [personas, d, quien]);

  const riesgo = useRiesgoSemestre(ctx.periodo, ctx.sede, ctx.p, ctx.s);
  const filas = useMemo(() => completarRiesgo(riesgo.data ?? []), [riesgo.data]);
  const [corteElegido, setCorte] = useState<CorteRiesgo | null>(null);
  const corte = corteElegido ?? corteInicial(filas);
  const delCorte = useMemo(() => filasCorte(filas, corte, PLAN, true), [filas, corte]);
  const calor = useMemo(() => calorSemestres(cohorte.filas, ctx.historial), [cohorte.filas, ctx.historial]);
  const delta = r.pctRSAnterior === null ? null : r.pctRS - r.pctRSAnterior;
  const tope = Math.max(1, base.prueba, esc.prueba, base.pruebaAlto, esc.pruebaAlto);
  const topeD = Math.max(0.1, base.deserciones, esc.deserciones);
  const nombrePeriodo = `${ctx.periodo}${parcial ? " (en curso)" : ""}`;

  return (
    <div ref={ref} className="al-pagina">
      <section className="al-seccion">
        <h1 className="al-frase" data-in>
          <em>
            {r.RS} de {r.n}
          </em>{" "}
          estudiantes requieren seguimiento
        </h1>
        <p className="al-lead" data-in>
          {ctx.programa.nombre}
          {ctx.s !== null ? `, semestre ${ctx.s}` : ", todos los semestres"}, periodo {nombrePeriodo}. <Termino k="RS">Requiere seguimiento</Termino> significa promedio bajo 3,0, dos materias perdidas o una caída de 0,5.
        </p>
        {parcial && (
          <div data-in>
            <AvisoEstimado>El periodo todavía no tiene P3 ni nota final. El promedio y el nivel de cada estudiante son los del último corte con notas, y lo que se espera se estima con sus notas previas.</AvisoEstimado>
          </div>
        )}
      </section>

      <section className="al-seccion al-dos">
        <div className="al-panel" data-in>
          <h2>La cohorte en cada periodo</h2>
          <p className="al-nota">Los mismos estudiantes, desde que ingresaron hasta {ctx.periodo}.</p>
          <Apilada columnas={composicion(t)} grande />
          <Leyenda />
          {delta !== null && (
            <p className="al-prosa">
              Frente al periodo anterior, la proporción en seguimiento {Math.abs(delta) < 0.004 ? "se mantuvo" : `${delta > 0 ? "subió" : "bajó"} ${coma(Math.abs(delta) * 100)} puntos porcentuales`}.
            </p>
          )}
        </div>
        <div className="al-panel" data-in>
          <h2>Lo que se espera en {siguiente}</h2>
          <div className="al-prosa">
            <p>
              Se espera que entre <b>{coma(esperado.bajo, 0)} y {coma(esperado.alto, 0)}</b> estudiantes cierren con promedio menor de 3,2 y entren en <Termino k="prueba">prueba académica</Termino>. El valor central es {coma(esperado.central, 0)}. La <Termino k="banda">banda del 80 %</Termino> sale de la trayectoria de cada estudiante.
            </p>
            <p>
              {r.bajo33} estudiantes ya están por debajo de 3,3. Según el <Termino k="modelo">estudio de la UDES</Termino>, esa franja tiene <Termino k="rr">16,7 veces</Termino> más probabilidad de desertar que la de promedio alto. Es una estimación de grupo: sirve para dimensionar el acompañamiento, no para decidir sobre una persona.
            </p>
          </div>
        </div>
      </section>

      <section className="al-seccion" data-in>
        <h2>Escenarios del programa</h2>
        <p className="al-nota">¿Qué pasaría si cambia el promedio de un grupo de estudiantes? Se recalcula con la proyección de cada uno y con el modelo del estudio.</p>
        <div className="al-fila-ctrl">
          <div role="group" aria-label="A quién se aplica" className="al-chips">
            {(["rs", "rsed", "todos"] as Quien[]).map((k) => (
              <button key={k} type="button" className="al-chip" aria-pressed={quien === k} onClick={() => setQuien(k)}>
                {k === "rs" ? "Requieren seguimiento" : k === "rsed" ? "Seguimiento y desarrollo" : "Todos"}
              </button>
            ))}
          </div>
          <label className="al-rango">
            <span>
              Cambio del promedio: <b>{d > 0 ? "+" : ""}{coma(d, 2)}</b>
            </span>
            <input type="range" min={-0.5} max={0.5} step={0.05} value={d} onChange={(e) => setD(Number(e.target.value))} aria-label="Cambio del promedio" />
          </label>
        </div>
        <div className="al-pares">
          <p className="al-nota">Barra gris: sin cambios. Barra azul: con el escenario, para {NOMBRE_QUIEN[quien]}.</p>
          <Pares titulo={`Estudiantes que cerrarían bajo 3,2 en ${siguiente}`} sin={base.prueba} con={esc.prueba} tope={tope} formato={(v) => coma(v, 0)} />
          <Pares titulo="Deserciones esperadas según el modelo" sin={base.deserciones} con={esc.deserciones} tope={topeD} formato={(v) => coma(v, 1)} />
        </div>
        <p className="al-nota">El modelo del estudio usa tres franjas de promedio, así que el efecto sobre la deserción aparece al cruzar 3,3.</p>
      </section>

      <section className="al-seccion" data-in>
        <div className="al-cabeza">
          <div>
            <h2>Los cursos de {ctx.s !== null ? `este semestre` : "este programa"}</h2>
            <p className="al-nota">
              {ctx.nombreSede}, {NOMBRE_CORTE[corte]}. Cada punto es un grupo.
            </p>
          </div>
          <div role="group" aria-label="Corte" className="al-chips">
            {CORTES.map((k) => (
              <button key={k} type="button" className="al-chip" aria-pressed={corte === k} onClick={() => setCorte(k)}>
                {NOMBRE_CORTE[k]}
              </button>
            ))}
          </div>
        </div>
        {riesgo.isPending ? (
          <LoadingBlock rows={3} label="Leyendo los cursos" />
        ) : riesgo.error ? (
          <ErrorBlock error={new Error(mensajeAlertas(riesgo.error))} title="No se pudieron leer los cursos" onRetry={() => void riesgo.refetch()} />
        ) : delCorte.length === 0 ? (
          <p className="al-nota">No hay cursos con 5 matrículas o más con nota en este corte para este alcance.</p>
        ) : (
          <>
            {delCorte.some((f) => f.est) && <AvisoEstimado />}
            <div className="al-dos al-dos--iguales">
              <div className="al-panel">
                <h3>Reprobación por curso</h3>
                <Ranking titulo="Reprobación por curso" items={itemsCursos(delCorte).slice(0, 10)} />
                <Leyenda tasa estimado={delCorte.some((f) => f.est)} />
              </div>
              <div className="al-panel">
                <h3>Tamaño del grupo</h3>
                <DispersionGrupos grupos={puntosGrupos(delCorte)} />
              </div>
            </div>
          </>
        )}
        <p>
          <Link className="al-enlace" to={ctx.enlace("riesgo")}>
            Abrir el mapa de riesgo <Icon name="arrow-right" size={16} />
          </Link>
        </p>
      </section>

      <section className="al-seccion" data-in>
        <h2>Este semestre frente a los otros y a periodos anteriores</h2>
        <p className="al-nota">Porcentaje de estudiantes que requiere seguimiento, por semestre y por periodo, con 5 estudiantes o más. El recuadro marca su selección; lo rayado es un periodo parcial.</p>
        <MapaCalor {...calor} semestre={ctx.s} periodo={ctx.periodo} />
      </section>
    </div>
  );
}
