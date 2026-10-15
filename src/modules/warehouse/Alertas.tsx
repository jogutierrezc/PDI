/* Warehouse UDES · Alertas tempranas, por grupo (rendimiento por corte de Master) y por estudiante (matriculados de Davinci). */

import { useMemo, useState } from "react";
import {
  NIVELES,
  ORDEN_CORTES,
  REGLAS_ESTUDIANTE,
  REGLAS_GRUPO,
  REGLAS_NOTAS,
  UMBRALES_ESTUDIANTE,
  UMBRALES_GRUPO,
  UMBRALES_NOTAS,
  contarNiveles,
  evaluarEstudiantes,
  evaluarGrupos,
  evaluarNotas,
  evolucionPorCorte,
  resumenPorDepartamento,
  type AlertaEstudiante,
  type AlertaGrupo,
  type AlertaNotas,
  type Nivel,
  type ReglaEstudiante,
  type ReglaGrupo,
  type ReglaNotas,
} from "./reglas";
import { Apiladas, Barras, Lineas } from "./graficos";
import { CORTES, SEDES } from "./conjuntos";
import { useFilasCompletas, useNotasGrupos, useNotasResumen, useRendimiento, type Cobertura } from "./store";
import { ESTUDIO_UDES, NOMBRE_BANDA, NOMBRE_DESEMPENO, materiasCriticas } from "./estudio";
import { resumenParaPilo } from "./paraPilo";
import { PanelPilo } from "./PanelPilo";
import type { Contexto } from "./Warehouse";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";

const COLOR_NIVEL = ["var(--surface-3)", "var(--status-pending)", "var(--od-line-3)", "var(--status-risk)"];
const coma = (n: number, d = 1) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Alertas({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const [vista, setVista] = useState<"grupos" | "notas" | "estudiantes">("grupos");
  return (
    <>
      <div className="wh-fila" role="group" aria-label="Qué se vigila">
        <button type="button" className="wh-chip" aria-pressed={vista === "grupos"} onClick={() => setVista("grupos")}>
          Por grupo (rendimiento por corte)
        </button>
        <button type="button" className="wh-chip" aria-pressed={vista === "notas"} onClick={() => setVista("notas")}>
          Por notas de cada estudiante (P1, P2, P3)
        </button>
        <button type="button" className="wh-chip" aria-pressed={vista === "estudiantes"} onClick={() => setVista("estudiantes")}>
          Por promedio acumulado (matriculados)
        </button>
      </div>
      {vista === "grupos" ? <PorGrupo ctx={ctx} /> : vista === "notas" ? <PorNotas ctx={ctx} cobertura={cobertura} /> : <PorEstudiante ctx={ctx} cobertura={cobertura} />}
    </>
  );
}

function Resumen({ conteo, extra }: { conteo: [number, number, number, number]; extra?: { n: number | string; t: string } }) {
  return (
    <div className="wh-cifras">
      {([3, 2, 1] as Nivel[]).map((n) => (
        <div className="wh-cifra" key={n}>
          <b>{conteo[n].toLocaleString("es-CO")}</b>
          <span>{NIVELES[n]}</span>
        </div>
      ))}
      <div className="wh-cifra">
        <b>{conteo[0].toLocaleString("es-CO")}</b>
        <span>Sin alerta</span>
      </div>
      {extra && (
        <div className="wh-cifra">
          <b>{typeof extra.n === "number" ? extra.n.toLocaleString("es-CO") : extra.n}</b>
          <span>{extra.t}</span>
        </div>
      )}
    </div>
  );
}

function Umbral({ id, nombre, descripcion, valor, paso, onChange }: { id: string; nombre: string; descripcion: string; valor: number; paso: number; onChange: (v: number) => void }) {
  return (
    <div className="wh-regla">
      <label htmlFor={id}>{nombre}</label>
      <input id={id} className="wh-num-in" type="number" step={paso} min={0} value={valor} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} />
      <small>{descripcion}</small>
    </div>
  );
}

function NivelEtiqueta({ nivel }: { nivel: Nivel }) {
  return (
    <span className="wh-etiqueta" data-n={nivel}>
      {NIVELES[nivel]}
    </span>
  );
}

/* --- Por grupo --------------------------------------------------------------------- */

function PorGrupo({ ctx }: { ctx: Contexto }) {
  const { periodo, sede } = ctx;
  const rend = useRendimiento(periodo, sede);
  const [umbrales, setUmbrales] = useState(UMBRALES_GRUPO);
  const [corteElegido, setCorteElegido] = useState("");
  const [nivelMin, setNivelMin] = useState<0 | 1 | 2 | 3>(1);
  const [depto, setDepto] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const datos = useMemo(() => rend.data ?? [], [rend.data]);
  const cortes = ORDEN_CORTES.filter((c) => datos.some((g) => g.corte === c));
  const corte = cortes.includes(corteElegido) ? corteElegido : cortes[cortes.length - 1] ?? "";
  const alertas = useMemo(() => evaluarGrupos(datos, corte, umbrales), [datos, corte, umbrales]);
  const resumen = useMemo(() => contarNiveles(alertas), [alertas]);
  const deptos = useMemo(() => resumenPorDepartamento(alertas), [alertas]);
  const evolucion = useMemo(() => evolucionPorCorte(datos, umbrales.minimo), [datos, umbrales.minimo]);

  const lista = useMemo(
    () =>
      alertas
        .filter((a) => a.nivel >= nivelMin && (!depto || a.grupo.departamento === depto))
        .sort((a, b) => b.nivel - a.nivel || b.grupo.pct_reprobados - a.grupo.pct_reprobados)
        .slice(0, 300),
    [alertas, nivelMin, depto],
  );
  const clave = (a: AlertaGrupo) => `${a.grupo.codigo}|${a.grupo.letra}|${a.grupo.plan}|${a.grupo.docente}`;
  const elegida = lista.find((a) => clave(a) === sel) ?? null;

  if (rend.isPending) return <LoadingBlock rows={5} label="Leyendo el rendimiento" />;
  if (rend.error) return <ErrorBlock error={rend.error} onRetry={() => void rend.refetch()} />;
  if (datos.length === 0) {
    return (
      <EmptyBlock
        title={`Aún no hay rendimiento de ${periodo} en ${SEDES.find((s) => s.id === sede)?.nombre}`}
        hint="Cargue el reporte «Rendimiento académico por grupo» de cada corte en la sección Cargas."
        action={
          <button type="button" className="button-primary" onClick={() => ctx.ir("cargas", { conjunto: "ma_rendimiento" })}>
            Ir a Cargas
          </button>
        }
      />
    );
  }

  const cambiar = <K extends keyof typeof umbrales>(k: K) => (v: number) => setUmbrales((u) => ({ ...u, [k]: v }));
  const enAlerta = alertas.filter((a) => a.nivel > 0).reduce((s, a) => s + a.grupo.matriculados, 0);

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-reglas-g">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-reglas-g">Reglas</h2>
            <p className="wh-muted">Valores de partida; cámbielos y todo se recalcula. Se evalúan los grupos con {umbrales.minimo} matriculados o más.</p>
          </div>
          <label className="wh-campo">
            <span>Corte</span>
            <select value={corte} onChange={(e) => setCorteElegido(e.target.value)}>
              {cortes.map((c) => (
                <option key={c} value={c}>
                  {CORTES.find((x) => x.id === c)?.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="wh-panel__cuerpo wh-reglas">
          <Umbral id="u-rep" nombre={REGLAS_GRUPO.reprobados.nombre} descripcion={REGLAS_GRUPO.reprobados.descripcion(umbrales)} valor={umbrales.reprobados} paso={1} onChange={cambiar("reprobados")} />
          <Umbral id="u-nop" nombre={REGLAS_GRUPO.noPresenta.nombre} descripcion={REGLAS_GRUPO.noPresenta.descripcion(umbrales)} valor={umbrales.noPresenta} paso={1} onChange={cambiar("noPresenta")} />
          <Umbral id="u-pro" nombre={REGLAS_GRUPO.promedio.nombre} descripcion={REGLAS_GRUPO.promedio.descripcion(umbrales)} valor={umbrales.promedio} paso={0.1} onChange={cambiar("promedio")} />
          <Umbral id="u-cai" nombre={REGLAS_GRUPO.caida.nombre} descripcion={REGLAS_GRUPO.caida.descripcion(umbrales) + (cortes.length < 2 ? " (necesita dos cortes cargados)" : "")} valor={umbrales.caida} paso={0.1} onChange={cambiar("caida")} />
          <Umbral id="u-min" nombre="Tamaño mínimo del grupo" descripcion="Un grupo más pequeño no se evalúa: tres estudiantes no hacen una tendencia." valor={umbrales.minimo} paso={1} onChange={cambiar("minimo")} />
        </div>
      </section>

      <Resumen conteo={resumen.porNivel} extra={{ n: enAlerta, t: "estudiantes en grupos con alerta" }} />

      <div className="wh-dos">
        <section className="wh-panel" aria-labelledby="wh-dep">
          <div className="wh-panel__cabeza">
            <h2 id="wh-dep">Grupos en alerta por departamento</h2>
          </div>
          <div className="wh-panel__cuerpo">
            <Apiladas
              titulo="Grupos en alerta por departamento"
              datos={deptos
                .filter((d) => d.enAlerta > 0)
                .slice(0, 10)
                .map((d) => ({
                  etiqueta: d.departamento,
                  partes: ([1, 2, 3] as Nivel[]).map((n) => ({
                    nombre: NIVELES[n],
                    valor: alertas.filter((a) => a.grupo.departamento === d.departamento && a.nivel === n).length,
                    color: COLOR_NIVEL[n],
                  })),
                }))}
            />
            <p className="wh-leyenda-fila">
              {([1, 2, 3] as Nivel[]).map((n) => (
                <span key={n}>
                  <i style={{ background: COLOR_NIVEL[n] }} aria-hidden="true" />
                  {NIVELES[n]}
                </span>
              ))}
            </p>
          </div>
        </section>
        <section className="wh-panel" aria-labelledby="wh-evo">
          <div className="wh-panel__cabeza">
            <h2 id="wh-evo">Evolución del semestre</h2>
            <span className="wh-muted">{periodo}</span>
          </div>
          <div className="wh-panel__cuerpo">
            {evolucion.length < 2 ? (
              <p className="wh-muted">Con dos cortes cargados se ve cómo cambia la aprobación. Hoy hay {evolucion.length}.</p>
            ) : (
              <Lineas
                titulo="Aprobación y reprobación por corte"
                categorias={evolucion.map((p) => CORTES.find((c) => c.id === p.corte)?.nombre ?? p.corte)}
                series={[
                  { nombre: "Aprobación %", valores: evolucion.map((p) => p.aprobacion) },
                  { nombre: "Reprobación %", valores: evolucion.map((p) => p.reprobacion) },
                  { nombre: "No presenta %", valores: evolucion.map((p) => p.noPresenta) },
                ]}
                sufijo=" %"
                decimales={0}
                minimo={0}
              />
            )}
          </div>
        </section>
      </div>

      <section className="wh-panel" aria-labelledby="wh-lista-g">
        <div className="wh-panel__cabeza">
          <h2 id="wh-lista-g">{lista.length.toLocaleString("es-CO")} grupos</h2>
          <div className="wh-fila">
            <select className="wh-select" value={nivelMin} onChange={(e) => setNivelMin(Number(e.target.value) as Nivel)} aria-label="Nivel mínimo">
              <option value={1}>Con alguna alerta</option>
              <option value={2}>Riesgo o crítico</option>
              <option value={3}>Solo crítico</option>
              <option value={0}>Todos</option>
            </select>
            <select className="wh-select" value={depto} onChange={(e) => setDepto(e.target.value)} aria-label="Departamento">
              <option value="">Todos los departamentos</option>
              {deptos.map((d) => (
                <option key={d.departamento} value={d.departamento}>
                  {d.departamento}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="wh-dos" style={{ padding: "var(--space-4)", alignItems: "start" }}>
          <div className="wh-tabla-envuelta">
            <table className="wh-tabla">
              <thead>
                <tr>
                  <th scope="col">Grupo</th>
                  <th scope="col">Departamento</th>
                  <th scope="col" className="wh-num">
                    Matric.
                  </th>
                  <th scope="col" className="wh-num">
                    % reprob.
                  </th>
                  <th scope="col" className="wh-num">
                    Promedio
                  </th>
                  <th scope="col">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr
                    key={clave(a)}
                    tabIndex={0}
                    data-sel={sel === clave(a)}
                    onClick={() => setSel(clave(a))}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(clave(a)))}
                  >
                    <td>
                      {a.grupo.codigo}-{a.grupo.letra} <small className="wh-muted">{a.grupo.nombre}</small>
                    </td>
                    <td>{a.grupo.departamento}</td>
                    <td className="wh-num">{a.grupo.matriculados}</td>
                    <td className="wh-num">{coma(a.grupo.pct_reprobados)}</td>
                    <td className="wh-num">{coma(a.grupo.promedio)}</td>
                    <td>
                      <NivelEtiqueta nivel={a.nivel} />
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={6} className="wh-muted">
                      Ningún grupo cumple el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside aria-live="polite" className="wh-capa">
            {!elegida ? (
              <p className="wh-muted">Elija un grupo para ver por qué alertó.</p>
            ) : (
              <>
                <b>
                  {elegida.grupo.codigo}-{elegida.grupo.letra} · {elegida.grupo.nombre}
                </b>
                <p className="wh-muted">
                  {elegida.grupo.departamento} · {elegida.grupo.plan.toLowerCase()} · docente {elegida.grupo.docente}
                </p>
                <p>
                  {elegida.grupo.matriculados} matriculados: {elegida.grupo.aprobados} aprobaron, {elegida.grupo.reprobados} reprobaron y {elegida.grupo.no_presenta} no presentaron. Promedio {coma(elegida.grupo.promedio)}
                  {elegida.anterior !== null ? ` (corte anterior ${coma(elegida.anterior)})` : ""}.
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                  {elegida.reglas.map((r: ReglaGrupo) => (
                    <li key={r}>
                      <b>{REGLAS_GRUPO[r].nombre}:</b> {REGLAS_GRUPO[r].descripcion(umbrales)}.
                    </li>
                  ))}
                  {elegida.reglas.length === 0 && <li>No cumple ninguna regla.</li>}
                </ul>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

/** El semáforo del Monitor: Nivel Esperado, En Desarrollo y Requiere Seguimiento, con su sigla y su palabra. */
function Desempenos({ evaluados, programa }: { evaluados: AlertaNotas[]; programa: string }) {
  const lista = programa ? evaluados.filter((a) => a.programa === programa) : evaluados;
  const n = { NE: 0, ED: 0, RS: 0 };
  for (const a of lista) if (a.desempeno) n[a.desempeno] += 1;
  const total = n.NE + n.ED + n.RS;
  if (total === 0) return null;
  return (
    <section className="wh-panel" aria-labelledby="wh-desemp">
      <div className="wh-panel__cabeza">
        <div>
          <h2 id="wh-desemp">Niveles de desempeño</h2>
          <p className="wh-muted">
            NE: promedio de 3,5 o más y ninguna materia perdida. ED: entre 3,0 y 3,49, o una materia perdida. RS: promedio menor a 3,0, dos o más materias perdidas o una caída de 0,5 entre cortes. No es una calificación ni una sanción: es una señal para acompañar. Referencia del estudio de la UDES: éxito con promedio superior a {coma(ESTUDIO_UDES.exito, 1)}; periodo de prueba bajo {coma(ESTUDIO_UDES.pruebaAcademica, 1)}.
          </p>
        </div>
        <span className="wh-etiqueta">{total.toLocaleString("es-CO")} estudiantes</span>
      </div>
      <div className="wh-panel__cuerpo">
        <div className="wh-tren" role="img" aria-label={`NE ${n.NE}, ED ${n.ED}, RS ${n.RS}`}>
          {(["NE", "ED", "RS"] as const).map((d) => (
            <i key={d} data-d={d} style={{ flexGrow: n[d] }} title={`${NOMBRE_DESEMPENO[d]}: ${n[d]}`} />
          ))}
        </div>
        <p className="wh-leyenda-fila">
          {(["NE", "ED", "RS"] as const).map((d) => (
            <span key={d}>
              <span className="wh-semaforo" data-d={d}>
                {d}
              </span>{" "}
              {NOMBRE_DESEMPENO[d]}: <b>{n[d].toLocaleString("es-CO")}</b> ({coma((100 * n[d]) / total, 1)} %)
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/* --- Por notas de cada estudiante (P1, P2, P3) ------------------------------------- */

function PorNotas({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const { periodo, sede } = ctx;
  const hay = cobertura.some((c) => c.conjunto === "dv_notas" && c.periodo === periodo && c.sede === sede);
  const resumen = useNotasResumen(periodo, sede, hay);
  const [umbrales, setUmbrales] = useState(UMBRALES_NOTAS);
  const [nivelMin, setNivelMin] = useState<0 | 1 | 2 | 3>(1);
  const [programa, setPrograma] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const alertas = useMemo(() => evaluarNotas(resumen.data ?? [], umbrales), [resumen.data, umbrales]);
  const evaluados = alertas.filter((a) => a.corte !== null);
  const grupos = useNotasGrupos(periodo, sede, hay);
  const criticas = useMemo(() => materiasCriticas(grupos.data ?? []), [grupos.data]);
  const conteo = useMemo(() => contarNiveles(evaluados), [evaluados]);
  const programas = useMemo(() => [...new Set(evaluados.map((a) => a.programa).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [evaluados]);
  const porPrograma = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const a of evaluados) {
      if (a.nivel === 0) continue;
      const c = m.get(a.programa) ?? [0, 0, 0, 0];
      c[a.nivel] += 1;
      m.set(a.programa, c);
    }
    return [...m.entries()].sort((a, b) => b[1][1] + b[1][2] + b[1][3] - (a[1][1] + a[1][2] + a[1][3])).slice(0, 10);
  }, [evaluados]);
  const lista = useMemo(
    () =>
      evaluados
        .filter((a) => a.nivel >= nivelMin && (!programa || a.programa === programa))
        .sort((a, b) => b.nivel - a.nivel || (a.promedio ?? 9) - (b.promedio ?? 9))
        .slice(0, 300),
    [evaluados, nivelMin, programa],
  );
  const elegida: AlertaNotas | null = lista.find((a) => a.id === sel) ?? null;
  const corteActual = evaluados.reduce((m, a) => Math.max(m, a.corte ?? 0), 0);

  if (!hay) {
    return (
      <EmptyBlock
        title={`Falta «Notas por estudiante y materia» de ${periodo}`}
        hint="Es el «Reporte global de notas» de Davinci: P1, P2, P3 y la nota acumulada de cada estudiante en cada materia. Se trae de la plataforma o se carga el Excel en la sección Cargas; el nombre no se guarda y el código real del estudiante se conserva como dato personal."
        action={
          <button type="button" className="button-primary" onClick={() => ctx.ir("cargas", { conjunto: "dv_notas" })}>
            Ir a Cargas
          </button>
        }
      />
    );
  }
  if (resumen.isPending) return <LoadingBlock rows={5} label="Leyendo las notas" />;
  if (resumen.error) return <ErrorBlock error={resumen.error} onRetry={() => void resumen.refetch()} />;

  const cambiar = <K extends keyof typeof umbrales>(k: K) => (v: number) => setUmbrales((u) => ({ ...u, [k]: v }));

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-reglas-n">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-reglas-n">Reglas</h2>
            <p className="wh-muted">
              Se evalúa el último corte que ya tiene notas (hoy, el corte {corteActual || "—"}). Aprobar es 3,0. Valores de partida, no una norma: ajústelos con las facultades.
            </p>
          </div>
          <span className="wh-etiqueta">{evaluados.length.toLocaleString("es-CO")} estudiantes con notas</span>
        </div>
        <div className="wh-panel__cuerpo wh-reglas">
          <Umbral id="n-mat" nombre={REGLAS_NOTAS.materias.nombre} descripcion={REGLAS_NOTAS.materias.descripcion(umbrales)} valor={umbrales.materias} paso={1} onChange={cambiar("materias")} />
          <Umbral id="n-pro" nombre={REGLAS_NOTAS.promedio.nombre} descripcion={REGLAS_NOTAS.promedio.descripcion(umbrales)} valor={umbrales.promedio} paso={0.1} onChange={cambiar("promedio")} />
          <Umbral id="n-cai" nombre={REGLAS_NOTAS.caida.nombre} descripcion={REGLAS_NOTAS.caida.descripcion(umbrales) + (corteActual < 2 ? " (necesita dos cortes con notas)" : "")} valor={umbrales.caida} paso={0.1} onChange={cambiar("caida")} />
        </div>
      </section>

      <Resumen conteo={conteo.porNivel} />

      <Desempenos evaluados={evaluados} programa={programa} />

      <section className="wh-panel" aria-labelledby="wh-crit">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-crit">Cursos con alta reprobación</h2>
            <p className="wh-muted">
              La «Alerta Temprana 4» del estudio de la UDES: materias donde 30 % o más de quienes ya tienen nota va por debajo de la de aprobar (3,0; en Medicina, 3,5), con al menos 15 estudiantes con nota.
            </p>
          </div>
          <span className="wh-etiqueta">{criticas.length} cursos</span>
        </div>
        <div className="wh-panel__cuerpo">
          {grupos.isPending ? (
            <p className="wh-muted">Calculando…</p>
          ) : criticas.length === 0 ? (
            <p className="wh-muted">Ninguna materia llega al 30 % por debajo de la nota de aprobar.</p>
          ) : (
            <Barras
              titulo="Materias con más estudiantes por debajo de la nota de aprobar"
              sufijo=" %"
              decimales={1}
              datos={criticas
                .filter((m) => !programa || m.programas.includes(programa))
                .slice(0, 10)
                .map((m) => ({ etiqueta: `${m.materia} · P${m.corte}`, valor: m.pctBajo, detalle: `${m.estudiantes} estudiantes con nota` }))}
            />
          )}
        </div>
      </section>

      <PanelPilo
        etiqueta={programa || "toda la sede"}
        datos={resumenParaPilo(alertas, criticas, { periodo, sede, programa: programa || undefined, umbrales: { materias: umbrales.materias, promedio: umbrales.promedio, caida: umbrales.caida } })}
      />

      <section className="wh-panel" aria-labelledby="wh-prog-n">
        <div className="wh-panel__cabeza">
          <h2 id="wh-prog-n">Estudiantes en alerta por programa</h2>
        </div>
        <div className="wh-panel__cuerpo">
          <Apiladas
            titulo="Estudiantes en alerta por programa"
            datos={porPrograma.map(([p, c]) => ({ etiqueta: p, partes: ([1, 2, 3] as Nivel[]).map((n) => ({ nombre: NIVELES[n], valor: c[n], color: COLOR_NIVEL[n] })) }))}
          />
          <p className="wh-leyenda-fila">
            {([1, 2, 3] as Nivel[]).map((n) => (
              <span key={n}>
                <i style={{ background: COLOR_NIVEL[n] }} aria-hidden="true" />
                {NIVELES[n]}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-lista-n">
        <div className="wh-panel__cabeza">
          <h2 id="wh-lista-n">{lista.length.toLocaleString("es-CO")} estudiantes</h2>
          <div className="wh-fila">
            <select className="wh-select" value={nivelMin} onChange={(e) => setNivelMin(Number(e.target.value) as Nivel)} aria-label="Nivel mínimo">
              <option value={1}>Con alguna alerta</option>
              <option value={2}>Riesgo o crítico</option>
              <option value={3}>Solo crítico</option>
              <option value={0}>Todos</option>
            </select>
            <select className="wh-select" value={programa} onChange={(e) => setPrograma(e.target.value)} aria-label="Programa">
              <option value="">Todos los programas</option>
              {programas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="wh-dos" style={{ padding: "var(--space-4)", alignItems: "start" }}>
          <div className="wh-tabla-envuelta">
            <table className="wh-tabla">
              <thead>
                <tr>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Programa</th>
                  <th scope="col" className="wh-num">
                    Materias
                  </th>
                  <th scope="col" className="wh-num">
                    En riesgo
                  </th>
                  <th scope="col" className="wh-num">
                    Promedio
                  </th>
                  <th scope="col">Desempeño</th>
                  <th scope="col">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id} tabIndex={0} data-sel={sel === a.id} onClick={() => setSel(a.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(a.id))}>
                    <td className="wh-mono">{a.id}</td>
                    <td>{a.programa}</td>
                    <td className="wh-num">{a.materias}</td>
                    <td className="wh-num">{a.enRiesgo}</td>
                    <td className="wh-num">{a.promedio === null ? "—" : coma(a.promedio, 2)}</td>
                    <td>{a.desempeno && <span className="wh-semaforo" data-d={a.desempeno}>{a.desempeno}</span>}</td>
                    <td>
                      <NivelEtiqueta nivel={a.nivel} />
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={7} className="wh-muted">
                      Ningún estudiante cumple el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside aria-live="polite" className="wh-capa">
            {!elegida ? (
              <p className="wh-muted">Elija un estudiante para ver por qué alertó y qué se sugiere.</p>
            ) : (
              <>
                <b className="wh-mono">{elegida.id}</b>
                <p className="wh-muted">{elegida.programa}</p>
                <p>
                  {elegida.materias} materias; corte {elegida.corte}: promedio {elegida.promedio === null ? "—" : coma(elegida.promedio, 2)}
                  {elegida.anterior !== null ? ` (corte anterior ${coma(elegida.anterior, 2)})` : ""}; {elegida.enRiesgo} por debajo de {coma(umbrales.aprueba, 1)}.
                </p>
                {elegida.desempeno && (
                  <p>
                    <span className="wh-semaforo" data-d={elegida.desempeno}>
                      {elegida.desempeno}
                    </span>{" "}
                    {NOMBRE_DESEMPENO[elegida.desempeno]}
                    {elegida.banda && elegida.riesgoRelativo !== null && (
                      <>
                        . Según el estudio de la UDES, con un {NOMBRE_BANDA[elegida.banda].toLowerCase()} es{" "}
                        {elegida.riesgoRelativo === 1 ? "el caso de referencia" : `${coma(elegida.riesgoRelativo, 1)} veces más probable desertar que con un promedio alto`} (una asociación entre cohortes, no una predicción de esta persona).
                      </>
                    )}
                  </p>
                )}
                <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                  {elegida.reglas.map((r: ReglaNotas) => (
                    <li key={r}>
                      <b>{REGLAS_NOTAS[r].nombre}.</b> {REGLAS_NOTAS[r].sugerencia}
                    </li>
                  ))}
                  {elegida.reglas.length === 0 && <li>No cumple ninguna regla.</li>}
                </ul>
                <p className="wh-nota-chica">El código es el del estudiante, sin nombre: sirve para seguir su caso. Las cargas anteriores a 0161 siguen con seudónimo hasta volver a cargarlas.</p>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

/* --- Por estudiante ---------------------------------------------------------------- */

function PorEstudiante({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const { periodo, sede } = ctx;
  const carga = cobertura.find((c) => c.conjunto === "dv_matric" && c.periodo === periodo && c.sede === sede);
  const filas = useFilasCompletas(carga?.id ?? null);
  const [umbrales, setUmbrales] = useState(UMBRALES_ESTUDIANTE);
  const [nivelMin, setNivelMin] = useState<0 | 1 | 2 | 3>(1);
  const [programa, setPrograma] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const alertas = useMemo(() => evaluarEstudiantes((filas.data ?? []) as Record<string, unknown>[], umbrales), [filas.data, umbrales]);
  const resumen = useMemo(() => contarNiveles(alertas), [alertas]);
  const programas = useMemo(() => [...new Set(alertas.map((a) => a.programa).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [alertas]);
  const porPrograma = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const a of alertas) {
      if (a.nivel === 0) continue;
      const c = m.get(a.programa) ?? [0, 0, 0, 0];
      c[a.nivel] += 1;
      m.set(a.programa, c);
    }
    return [...m.entries()].sort((a, b) => b[1][1] + b[1][2] + b[1][3] - (a[1][1] + a[1][2] + a[1][3])).slice(0, 10);
  }, [alertas]);
  const lista = useMemo(
    () =>
      alertas
        .filter((a) => a.nivel >= nivelMin && (!programa || a.programa === programa))
        .sort((a, b) => b.nivel - a.nivel || (a.acumulado ?? 9) - (b.acumulado ?? 9))
        .slice(0, 300),
    [alertas, nivelMin, programa],
  );
  const elegida: AlertaEstudiante | null = lista.find((a) => a.id === sel) ?? null;

  if (!carga) {
    return (
      <EmptyBlock
        title={`Falta «Estudiantes matriculados» de ${periodo}`}
        hint="Las alertas por estudiante salen del promedio acumulado y los créditos de ese reporte. Se cargan en la sección Cargas; el código real se conserva como dato personal y los nombres no se guardan."
        action={
          <button type="button" className="button-primary" onClick={() => ctx.ir("cargas", { conjunto: "dv_matric" })}>
            Ir a Cargas
          </button>
        }
      />
    );
  }
  if (filas.isPending) return <LoadingBlock rows={5} label="Leyendo los matriculados" />;
  if (filas.error) return <ErrorBlock error={filas.error} onRetry={() => void filas.refetch()} />;

  const cambiar = <K extends keyof typeof umbrales>(k: K) => (v: number) => setUmbrales((u) => ({ ...u, [k]: v }));

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-reglas-e">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-reglas-e">Reglas</h2>
            <p className="wh-muted">Valores de partida míos, no una norma de la Universidad. Ajústelos con el criterio de Bienestar y de las facultades.</p>
          </div>
          <span className="wh-etiqueta">
            {alertas.length.toLocaleString("es-CO")} estudiantes · v{carga.version}
          </span>
        </div>
        <div className="wh-panel__cuerpo wh-reglas">
          <Umbral id="e-acu" nombre={REGLAS_ESTUDIANTE.acumulado.nombre} descripcion={REGLAS_ESTUDIANTE.acumulado.descripcion(umbrales)} valor={umbrales.acumulado} paso={0.1} onChange={cambiar("acumulado")} />
          <Umbral id="e-cai" nombre={REGLAS_ESTUDIANTE.caida.nombre} descripcion={REGLAS_ESTUDIANTE.caida.descripcion(umbrales)} valor={umbrales.caida} paso={0.1} onChange={cambiar("caida")} />
          <Umbral id="e-ava" nombre={REGLAS_ESTUDIANTE.avance.nombre} descripcion={REGLAS_ESTUDIANTE.avance.descripcion(umbrales)} valor={umbrales.avance} paso={0.05} onChange={cambiar("avance")} />
        </div>
      </section>

      <Resumen conteo={resumen.porNivel} />

      <section className="wh-panel" aria-labelledby="wh-prog">
        <div className="wh-panel__cabeza">
          <h2 id="wh-prog">Estudiantes en alerta por programa</h2>
        </div>
        <div className="wh-panel__cuerpo">
          <Apiladas
            titulo="Estudiantes en alerta por programa"
            datos={porPrograma.map(([p, c]) => ({
              etiqueta: p,
              partes: ([1, 2, 3] as Nivel[]).map((n) => ({ nombre: NIVELES[n], valor: c[n], color: COLOR_NIVEL[n] })),
            }))}
          />
          <p className="wh-leyenda-fila">
            {([1, 2, 3] as Nivel[]).map((n) => (
              <span key={n}>
                <i style={{ background: COLOR_NIVEL[n] }} aria-hidden="true" />
                {NIVELES[n]}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="wh-panel" aria-labelledby="wh-lista-e">
        <div className="wh-panel__cabeza">
          <h2 id="wh-lista-e">{lista.length.toLocaleString("es-CO")} estudiantes</h2>
          <div className="wh-fila">
            <select className="wh-select" value={nivelMin} onChange={(e) => setNivelMin(Number(e.target.value) as Nivel)} aria-label="Nivel mínimo">
              <option value={1}>Con alguna alerta</option>
              <option value={2}>Riesgo o crítico</option>
              <option value={3}>Solo crítico</option>
              <option value={0}>Todos</option>
            </select>
            <select className="wh-select" value={programa} onChange={(e) => setPrograma(e.target.value)} aria-label="Programa">
              <option value="">Todos los programas</option>
              {programas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="wh-dos" style={{ padding: "var(--space-4)", alignItems: "start" }}>
          <div className="wh-tabla-envuelta">
            <table className="wh-tabla">
              <thead>
                <tr>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Programa</th>
                  <th scope="col" className="wh-num">
                    Acumulado
                  </th>
                  <th scope="col" className="wh-num">
                    Último
                  </th>
                  <th scope="col">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id} tabIndex={0} data-sel={sel === a.id} onClick={() => setSel(a.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(a.id))}>
                    <td className="wh-mono">{a.id}</td>
                    <td>{a.programa}</td>
                    <td className="wh-num">{a.acumulado === null ? "—" : coma(a.acumulado, 2)}</td>
                    <td className="wh-num">{a.ultimo === null ? "—" : coma(a.ultimo, 2)}</td>
                    <td>
                      <NivelEtiqueta nivel={a.nivel} />
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={5} className="wh-muted">
                      Ningún estudiante cumple el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside aria-live="polite" className="wh-capa">
            {!elegida ? (
              <p className="wh-muted">Elija un estudiante para ver qué reglas se cumplen y qué se sugiere.</p>
            ) : (
              <>
                <b className="wh-mono">{elegida.id}</b>
                <p className="wh-muted">
                  {elegida.programa}
                  {elegida.jornada ? ` · ${elegida.jornada.toLowerCase()}` : ""}
                </p>
                <p>
                  Acumulado {elegida.acumulado === null ? "—" : coma(elegida.acumulado, 2)}, último polígrafo {elegida.ultimo === null ? "—" : coma(elegida.ultimo, 2)}
                  {elegida.creditosAprobados !== null && elegida.creditosEsperados ? `, ${elegida.creditosAprobados} de ${elegida.creditosEsperados} créditos esperados aprobados` : ""}.
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                  {elegida.reglas.map((r: ReglaEstudiante) => (
                    <li key={r}>
                      <b>{REGLAS_ESTUDIANTE[r].nombre}.</b> {REGLAS_ESTUDIANTE[r].sugerencia}
                    </li>
                  ))}
                  {elegida.reglas.length === 0 && <li>No cumple ninguna regla.</li>}
                </ul>
                <p className="wh-nota-chica">El código es el real del estudiante, sin nombre: sirve para seguir casos entre cargas. Las cargas anteriores a 0161 siguen con seudónimo hasta volver a cargarlas.</p>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
