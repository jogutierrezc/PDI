/* Portal de alertas · cursos críticos: reprobación por curso, distribución, tamaño del grupo y evolución por periodo (con el periodo en curso marcado como parcial). */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { TASA_ALTA, cursosDe, type AlcancePlan, type CorteRiesgo } from "../monitor/logica";
import { useEntrada } from "../monitor/piezas";
import { useAlertas } from "./contexto";
import { mensajeAlertas, useCursosHistorial, useRiesgoSemestre, type FilaCursoHistorial } from "./datos";
import { AvisoEstimado, DispersionGrupos, HistogramaTramos, Leyenda, Ranking, coma } from "./graficos";
import { completarRiesgo, corteInicial, filasCorte, itemsCursos, puntosGrupos } from "./vistaRiesgo";

const CORTES: CorteRiesgo[] = [1, 2, 3, 4];
const NOMBRE_CORTE: Record<CorteRiesgo, string> = { 1: "P1", 2: "P2", 3: "P3", 4: "Final" };
const PLAN: AlcancePlan = "tres";

interface PuntoEvolucion {
  periodo: string;
  tasa: number | null;
  /** El corte que se usó: el último con notas de ese periodo. */
  corte: CorteRiesgo | null;
}

/** Por curso, la tasa de cada periodo en su último corte con notas. Si no es la nota final, el periodo es parcial. */
function evolucion(filas: FilaCursoHistorial[], periodos: string[]): Map<string, { materia: string; puntos: PuntoEvolucion[] }> {
  const por = new Map<string, { materia: string; puntos: PuntoEvolucion[] }>();
  for (const f of filas) if (!por.has(f.codigo_materia)) por.set(f.codigo_materia, { materia: f.materia, puntos: [] });
  for (const [cod, e] of por) {
    e.puntos = periodos.map((periodo) => {
      const del = filas.filter((f) => f.codigo_materia === cod && f.periodo === periodo);
      const ultimo = ([4, 3, 2, 1] as CorteRiesgo[]).map((c) => del.find((f) => f.corte === c)).find(Boolean);
      return { periodo, tasa: ultimo ? (100 * ultimo.bajo) / Math.max(1, ultimo.con) : null, corte: ultimo ? ultimo.corte : null };
    });
  }
  return por;
}

export function Cursos() {
  const ctx = useAlertas();
  const riesgo = useRiesgoSemestre(ctx.periodo, ctx.sede, ctx.p, ctx.s);
  const siguiente = ctx.s !== null && ctx.s < 10 ? ctx.s + 1 : null;
  const riesgoSig = useRiesgoSemestre(ctx.periodo, ctx.sede, siguiente === null ? null : ctx.p, siguiente);
  const hist = useCursosHistorial(ctx.sede, ctx.historial, ctx.p);
  const filas = useMemo(() => completarRiesgo(riesgo.data ?? []), [riesgo.data]);
  const filasSig = useMemo(() => completarRiesgo(riesgoSig.data ?? []), [riesgoSig.data]);
  const [elegido, setCorte] = useState<CorteRiesgo | null>(null);
  const corte = elegido ?? corteInicial(filas);
  const delCorte = useMemo(() => filasCorte(filas, corte, PLAN, true), [filas, corte]);
  const delCorteSig = useMemo(() => filasCorte(filasSig, corte, PLAN, true), [filasSig, corte]);
  const cursos = useMemo(() => cursosDe(delCorte), [delCorte]);
  const evol = useMemo(() => evolucion(hist.data ?? [], ctx.historial), [hist.data, ctx.historial]);
  const ref = useEntrada<HTMLDivElement>(`cursos|${ctx.p}|${ctx.s}|${ctx.periodo}|${corte}`);
  const criticos = cursos.filter((c) => c.tasa >= TASA_ALTA && c.con >= 5);
  const estimado = delCorte.some((f) => f.est) || delCorteSig.some((f) => f.est);

  const tabla = (titulo: string, codigos: string[]) => (
    <section className="al-seccion" data-in>
      <h2>{titulo}</h2>
      {hist.isPending ? (
        <LoadingBlock rows={3} label="Leyendo la evolución" />
      ) : hist.error ? (
        <ErrorBlock error={new Error(mensajeAlertas(hist.error))} title="No se pudo leer la evolución" onRetry={() => void hist.refetch()} />
      ) : (
        <div className="al-tabla-envuelta">
          <table className="al-calor">
            <thead>
              <tr>
                <th />
                {ctx.historial.map((p) => (
                  <th key={p} scope="col">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codigos.map((cod) => {
                const e = evol.get(cod);
                if (!e) return null;
                return (
                  <tr key={cod}>
                    <th scope="row">{e.materia}</th>
                    {e.puntos.map((p) => (
                      <td key={p.periodo}>
                        {p.tasa === null ? (
                          <span className="al-muted">sin dato</span>
                        ) : (
                          <span className="al-calor__celda" data-parcial={p.corte !== null && p.corte < 4 ? true : undefined} style={{ ["--v" as string]: `${Math.round(8 + 70 * Math.min(1, p.tasa / 50))}%` }} title={`${p.periodo}: ${coma(p.tasa)} % en ${p.corte ? NOMBRE_CORTE[p.corte] : ""}${p.corte !== null && p.corte < 4 ? ", periodo parcial" : ""}`}>
                            {coma(p.tasa, 0)} %
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {codigos.every((c) => !evol.get(c)) && (
                <tr>
                  <td colSpan={ctx.historial.length + 1} className="al-muted">
                    Todavía no hay periodos anteriores cargados de estos cursos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="al-nota">Cada celda es la reprobación del curso en el último corte con notas de ese periodo. Lo rayado es un periodo parcial.</p>
    </section>
  );

  return (
    <div ref={ref} className="al-pagina">
      <section className="al-seccion">
        <h1 className="al-titulo" data-in>
          Cursos críticos
        </h1>
        <p className="al-lead" data-in>
          Un curso requiere seguimiento cuando reprueba 30 % o más. Aquí se ve su evolución y lo que viene después.
        </p>
        <div role="group" aria-label="Corte" className="al-chips" data-in>
          {CORTES.map((k) => (
            <button key={k} type="button" className="al-chip" aria-pressed={corte === k} onClick={() => setCorte(k)}>
              {NOMBRE_CORTE[k]}
            </button>
          ))}
        </div>
        {estimado && (
          <div data-in>
            <AvisoEstimado />
          </div>
        )}
      </section>

      {riesgo.isPending ? (
        <LoadingBlock rows={4} label="Leyendo los cursos" />
      ) : riesgo.error ? (
        <ErrorBlock error={new Error(mensajeAlertas(riesgo.error))} title="No se pudieron leer los cursos" onRetry={() => void riesgo.refetch()} />
      ) : delCorte.length === 0 ? (
        <p className="al-nota">No hay cursos con 5 matrículas o más con nota en este corte{ctx.s !== null ? ` para el semestre ${ctx.s}` : ""}. Pruebe con otro corte, con todos los semestres o con otro periodo.</p>
      ) : (
        <>
          <section className="al-seccion al-dos al-dos--iguales">
            <div className="al-panel" data-in>
              <h2>Reprobación por curso</h2>
              <p className="al-nota">
                {NOMBRE_CORTE[corte]}, {ctx.s !== null ? `semestre ${ctx.s}` : "todos los semestres"}.
              </p>
              <Ranking titulo="Reprobación por curso" items={itemsCursos(delCorte).slice(0, 12)} />
              <Leyenda tasa estimado={delCorte.some((f) => f.est)} />
            </div>
            <div className="al-panel" data-in>
              <h2>Distribución</h2>
              <p className="al-nota">Cursos por tramo de reprobación.</p>
              <HistogramaTramos cursos={cursos} />
            </div>
          </section>
          <section className="al-seccion" data-in>
            <h2>Tamaño del grupo</h2>
            <p className="al-nota">Grupos grandes y con más reprobación piden atención primero.</p>
            <DispersionGrupos grupos={puntosGrupos(delCorte)} />
          </section>
          {tabla(`Evolución de ${criticos.length ? "los cursos críticos" : "los cursos con más reprobación"}`, (criticos.length ? criticos : cursos).slice(0, 10).map((c) => c.codigo_materia))}
          {siguiente !== null && delCorteSig.length > 0 && (
            <section className="al-seccion" data-in>
              <h2>Lo que viene en el semestre {siguiente}</h2>
              <p className="al-nota">Los cursos del semestre siguiente muestran qué se avecina para esta cohorte: conviene reforzar antes de que lleguen.</p>
              <Ranking titulo="Reprobación por curso del semestre siguiente" items={itemsCursos(delCorteSig).slice(0, 8)} />
            </section>
          )}
          <p>
            <Link className="al-enlace" to={ctx.enlace("riesgo")}>
              Abrir el mapa de riesgo <Icon name="arrow-right" size={16} />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
