/* =============================================================================
   Portal de alertas · un estudiante, en su propia página (/alertas/estudiantes/:codigo).

   Conserva todo lo que ya mostraba el Monitor de la intranet (ficha con semáforo por corte, aviso
   del estudio y la tabla de sus materias con P1, P2 y P3) y suma: las notas de los cortes que
   faltan, estimadas y rotuladas; su trayectoria por periodos con la proyección y la banda del 80 %;
   los factores del modelo de deserción del estudio y los escenarios.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { ESTUDIO_UDES } from "../warehouse/estudio";
import { clasificar, nivelDeNota, pareceSeudonimo, tieneCorte, type Corte, type FilaMonitor } from "../monitor/logica";
import { useEntrada } from "../monitor/piezas";
import { factoresDe, siguientePeriodo, trayectorias } from "./cohorte";
import { useAlertas } from "./contexto";
import { mensajeAlertas, useEstudianteMonitor, useHistorial } from "./datos";
import { completarCortes, completarMateria, lineasDelModelo, proyectarPromedio, riesgoDesercion, riesgoRelativo, bandaDePromedio } from "./estimacion";
import { AvisoEstimado, Escala, GraficaTrayectoria, NotasCorte, Semaforo, coma } from "./graficos";
import { Termino } from "./termino";

const ESCENARIOS: { v: number | null; t: string }[] = [
  { v: null, t: "Mantiene el promedio" },
  { v: 3.4, t: "Sube a 3,4" },
  { v: 2.9, t: "Baja a 2,9" },
];

/** Una línea mínima con las notas reales de una materia. */
function Tendencia({ valores }: { valores: (number | null)[] }) {
  const pts = valores.map((v, i) => (v === null ? null : { x: 4 + i * 26, y: 18 - ((v - 1) / 4) * 16 })).filter((p): p is { x: number; y: number } => p !== null);
  if (pts.length < 2) return <span className="al-muted">sin datos</span>;
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" aria-hidden="true" className="al-tendencia">
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.6" />
    </svg>
  );
}

export function Estudiante() {
  const ctx = useAlertas();
  const { codigo = "" } = useParams();
  const hist = useHistorial(ctx.sede, ctx.historial, null, codigo);
  const notas = useEstudianteMonitor(ctx.periodo, ctx.sede, codigo);
  const [corteElegido, setCorte] = useState<Corte | null>(null);
  const [escenario, setEscenario] = useState<number | null>(null);
  const t = useMemo(() => trayectorias(hist.data ?? [], ctx.periodo, null)[0] ?? null, [hist.data, ctx.periodo]);
  const ref = useEntrada<HTMLDivElement>(`estudiante|${codigo}|${ctx.periodo}`);
  const volver = (
    <Link className="al-enlace al-volver" to={ctx.enlace("estudiantes")}>
      <Icon name="arrow-left" size={16} /> Volver a estudiantes
    </Link>
  );
  if (hist.isPending) return <LoadingBlock rows={5} label="Leyendo al estudiante" />;
  if (hist.error) return <ErrorBlock error={new Error(mensajeAlertas(hist.error))} title="No se pudo leer al estudiante" onRetry={() => void hist.refetch()} />;
  if (!t)
    return (
      <>
        {volver}
        <EmptyBlock title={`No hay notas de ${codigo} en ${ctx.periodo}`} hint="El código no tiene notas en este periodo y sede, o pertenece a un programa que usted no puede ver. Pruebe con otro periodo." />
      </>
    );

  const fila = t.actual.fila as FilaMonitor;
  const corte = corteElegido ?? t.actual.corte;
  const c = clasificar(fila, corte);
  const promedios = t.puntos.map((p) => p.promedio);
  const actual = t.actual.promedio;
  const prom = escenario ?? actual;
  const fx = factoresDe(t, ctx.facultad.nombre);
  const proy = proyectarPromedio(escenario === null ? promedios : promedios.slice(0, -1).concat(escenario));
  const base = riesgoDesercion(fx);
  const riesgo = riesgoDesercion(fx, prom);
  const banda = bandaDePromedio(actual);
  const rr = riesgoRelativo(actual);
  const siguiente = siguientePeriodo(ctx.periodo);
  const cortesReales = [1, 2, 3].map((k) => (tieneCorte(fila, k as Corte) ? (k === 1 ? fila.prom_p1 : k === 2 ? fila.prom_p2 : fila.prom_p3) : null));
  const cortes = completarCortes(cortesReales, t.anterior?.promedio ?? null, fila.con_fin > 0 ? fila.prom_fin : null);
  const hayEstimado = cortes.estimado.some(Boolean);
  const modelo = lineasDelModelo({ ...fx, promedio: prom });
  const seud = pareceSeudonimo(codigo);
  const filasMaterias = (notas.data ?? []).map((m) => ({ m, ...completarMateria(m.p1, m.p2, m.p3, t.anterior?.promedio ?? null) }));

  return (
    <div ref={ref} className="al-pagina">
      {volver}
      <section className="al-portada" data-in>
        <div>
          <h1 className="al-titulo">
            Estudiante <span className="al-codigo al-codigo--grande">{codigo}</span>
          </h1>
          <p className="al-prosa">
            {ctx.programas.find((p) => p.codigo_programa === t.codigo_programa)?.nombre ?? t.programa}
            {t.semestre !== null ? `, semestre ${t.semestre}` : ""}.{" "}
            {seud ? "Este código es un seudónimo: la carga es anterior a que el Monitor guardara el código real. Sirve para seguir el caso, pero no dice quién es; Planeación debe volver a cargar las notas." : "Es el código del estudiante, sin nombre ni documento. Es un dato personal: úselo solo para su seguimiento académico y no lo comparta."}
          </p>
        </div>
        <div className="al-ficha" data-n={c?.nivel}>
          <div role="group" aria-label="Corte" className="al-chips">
            {([1, 2, 3] as Corte[]).map((k) => (
              <button key={k} type="button" className="al-chip" aria-pressed={corte === k} disabled={!tieneCorte(fila, k)} onClick={() => setCorte(k)}>
                P{k}
              </button>
            ))}
          </div>
          {c ? (
            <>
              <Semaforo nivel={c.nivel} />
              <p>
                Promedio de P{corte}: <b>{coma(c.promedio, 2)}</b>. Materias por debajo de la de aprobar: <b>{c.perdidas}</b>
                {c.caida !== null ? `. Cambio frente al corte anterior: ${c.caida > 0 ? "-" : "+"}${coma(Math.abs(c.caida), 2)}` : ""}.
              </p>
              <Escala nota={c.promedio} />
            </>
          ) : (
            <p className="al-muted">Aún no tiene notas suficientes en P{corte}.</p>
          )}
        </div>
      </section>

      <section className="al-seccion" data-in>
        <p className="al-aviso">
          Según el estudio de la UDES (Pérez et al., 2023), con un promedio <b>{banda === "bajo" ? "bajo (menor de 3,3)" : banda === "medio" ? "medio (3,3 a 4,3)" : "alto (más de 4,3)"}</b> es{" "}
          {rr === 1 ? "el caso de referencia" : <b>{coma(rr, 1)} veces más probable desertar</b>}
          {rr === 1 ? "" : " que con un promedio alto"}. Es una asociación entre cohortes, no una predicción de esta persona; un promedio bajo es una razón para acompañar, no para sancionar. Éxito: promedio sobre {coma(ESTUDIO_UDES.exito, 1)}.
        </p>
      </section>

      <section className="al-seccion al-dos" data-in>
        <div className="al-panel">
          <h2>Notas del periodo</h2>
          <p className="al-nota">Promedio de sus materias en cada corte.</p>
          <NotasCorte c={cortes} />
        </div>
        <div className="al-panel">
          {hayEstimado || cortes.finalEstimado ? (
            <AvisoEstimado>
              {hayEstimado ? "P3 todavía no es una nota: es una estimación a partir de P1, P2 y los periodos anteriores de este estudiante, con banda del 80 %. " : ""}
              La nota final estimada sería {coma(cortes.final, 2)}
              {cortes.bandaFinal ? ` (entre ${coma(cortes.bandaFinal.bajo, 2)} y ${coma(cortes.bandaFinal.alto, 2)})` : ""}. Se reemplaza cuando lleguen las notas reales.
            </AvisoEstimado>
          ) : (
            <p className="al-nota">Todos los cortes tienen notas reales.</p>
          )}
        </div>
      </section>

      <section className="al-seccion" data-in aria-labelledby="al-mat">
        <h2 id="al-mat">Sus materias</h2>
        <p className="al-nota">Nota de cada corte. Aprobar es 3,0 (en Medicina, 3,5). Lo rayado es una estimación.</p>
        {notas.isPending ? (
          <LoadingBlock rows={3} label="Leyendo sus notas" />
        ) : notas.error ? (
          <ErrorBlock error={notas.error} onRetry={() => void notas.refetch()} />
        ) : (
          <div className="al-tabla-envuelta">
            <table className="al-tabla">
              <thead>
                <tr>
                  <th scope="col">Materia</th>
                  <th scope="col">Grupo</th>
                  {["P1", "P2", "P3"].map((p) => (
                    <th key={p} scope="col" className="num">
                      {p}
                    </th>
                  ))}
                  <th scope="col">Tendencia</th>
                  <th scope="col">En P{corte}</th>
                </tr>
              </thead>
              <tbody>
                {filasMaterias.map(({ m, valores, estimado }) => {
                  const nota = corte === 1 ? m.p1 : corte === 2 ? m.p2 : m.p3;
                  const nv = nivelDeNota(nota, /^MEDICINA$/i.test(m.programa.trim()) ? 3.5 : 3.0);
                  return (
                    <tr key={`${m.codigo_materia}|${m.grupo}`}>
                      <td>{m.materia}</td>
                      <td>{m.grupo}</td>
                      {valores.map((v, i) => (
                        <td key={i} className="num" data-est={estimado[i] || undefined} title={estimado[i] ? "Estimado a partir de las notas anteriores" : undefined}>
                          {v === null ? "sin nota" : coma(v)}
                          {estimado[i] && <small> est.</small>}
                        </td>
                      ))}
                      <td>
                        <Tendencia valores={[m.p1, m.p2, m.p3]} />
                      </td>
                      <td>{nv ? <Semaforo nivel={nv} palabra={false} /> : <span className="al-muted">sin nota</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="al-seccion al-dos" data-in>
        <div className="al-panel">
          <h2>Trayectoria por periodos</h2>
          <p className="al-nota">
            Promedio de cada periodo y lo que se espera en {siguiente}. La banda cubre el 80 % de los casos; un asterisco marca un periodo parcial.
          </p>
          <GraficaTrayectoria puntos={t.puntos.map((p, i) => ({ periodo: p.periodo, promedio: i === t.puntos.length - 1 ? prom : p.promedio, parcial: p.parcial }))} proyeccion={proy} siguiente={siguiente} />
          <div className="al-tabla-envuelta">
            <table className="al-tabla">
              <thead>
                <tr>
                  <th scope="col">Periodo</th>
                  <th scope="col">Nivel</th>
                  <th scope="col" className="num">
                    Promedio
                  </th>
                  <th scope="col" className="num">
                    Materias perdidas
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...t.puntos].reverse().map((p) => (
                  <tr key={p.periodo}>
                    <td>
                      {p.periodo}
                      {p.parcial ? " (parcial)" : ""}
                    </td>
                    <td>
                      <Semaforo nivel={p.nivel} palabra={false} />
                    </td>
                    <td className="num">{coma(p.promedio, 2)}</td>
                    <td className="num">{p.perdidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.puntos.length < 2 && <p className="al-nota">Solo hay un periodo con notas de este estudiante: la proyección se apoya en una sola nota y su banda es amplia. Los periodos anteriores aparecen cuando se carga su reporte de notas en el Warehouse.</p>}
        </div>
        <div className="al-panel">
          <h2>Lo que se espera</h2>
          {proy && (
            <div className="al-prosa">
              <p>
                Promedio proyectado de <b>{coma(proy.mu, 2)}</b>, con <Termino k="banda">banda</Termino> de {coma(proy.bajo, 2)} a {coma(proy.alto, 2)}. La probabilidad de cerrar bajo 3,2 es de <b>{coma(proy.pPrueba * 100, 0)} %</b>.
              </p>
              <p>
                El <Termino k="modelo">modelo del estudio</Termino> estima un riesgo de deserción de <b>{coma(riesgo * 100, 0)} %</b>
                {escenario !== null && Math.abs(riesgo - base) > 0.001 ? ` (con el promedio actual era ${coma(base * 100, 0)} %)` : ""}.
              </p>
            </div>
          )}
          <h3>Escenario</h3>
          <div role="group" aria-label="Escenario" className="al-chips">
            {ESCENARIOS.map((e) => (
              <button key={e.t} type="button" className="al-chip" aria-pressed={escenario === e.v} onClick={() => setEscenario(e.v)}>
                {e.t}
              </button>
            ))}
          </div>
          <h3>Qué mira el modelo</h3>
          <div className="al-tabla-envuelta">
            <table className="al-tabla">
              <thead>
                <tr>
                  <th scope="col">Factor</th>
                  <th scope="col" className="num">
                    Peso (B)
                  </th>
                </tr>
              </thead>
              <tbody>
                {modelo.map((l) => (
                  <tr key={l.factor}>
                    <td>
                      {l.factor}
                      {l.nota && <small className="al-muted"> ({l.nota})</small>}
                    </td>
                    <td className="num">{l.peso === 0 ? "referencia" : coma(l.peso, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
