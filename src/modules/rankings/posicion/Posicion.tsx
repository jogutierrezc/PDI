/* =============================================================================
   Posicionamiento en THE Impact · /admin/rankings/posicion

   Una herramienta de trabajo, no un pronóstico mágico: todo lo que muestra sale
   de la tabla pública de THE 2026 (migración 0148), de las evidencias elegidas
   en los informes por ODS (0145) y de supuestos que se ven y se cambian aquí.
     a. Dónde está la UDES hoy: la escalera de Colombia.
     b. Escenario 2027: ODS enviados, evidencia, supuestos y meta.
     c. Resultados: probabilidades (redondeadas a 5 %), distribución, Colombia.
     d. Qué mover: indicadores ordenados por lo que suman al general.
     e. Cómo se calcula y qué no sabemos.
   Lógica pura en bandas/calibracion/colombia/evidencia/modelo/palancas.ts.
   ========================================================================== */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion } from "../noticias";
import { odsCorto, odsVars } from "../ods";
import { INDICADORES_EVIDENCIA } from "../informes/the-indicadores";
import { textoRango } from "./bandas";
import { calibrarTodo, ubicar, umbralesDeBanda, type CalibracionCompleta } from "./calibracion";
import { brechaHastaSiguiente, escaleraNacional, esUdes, filasDeColombia, type PeldanoNacional } from "./colombia";
import { useCoberturaTodos, useFilasTHE, useUdesTHE, guardar, leerGuardado, type CoberturaEdiciones } from "./datos";
import { coberturaOds, deltaEvidencia, type CoberturaOds } from "./evidencia";
import {
  cambioOds,
  enviadosPublicados,
  envioValido,
  esperadoOds,
  histograma,
  lineaBase,
  probMeta,
  resumir,
  simular,
  SUPUESTOS_BASE,
  textoProb,
  type LineaBaseOds,
  type Meta,
  type OdsEscenario,
  type Simulacion,
  type Supuestos,
} from "./modelo";
import { ESFUERZO_TEXTO, palancas, totalPorOds, type Palanca } from "./palancas";
import type { FilaTHE } from "./tipos";
import "./posicion.css";

const ANIO = 2026;
const EDICIONES = [2025, 2026];
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "—");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");
const signo = (x: number) => (x > 0.005 ? `+${f1(x)}` : x < -0.005 ? `−${f1(-x)}` : "0");
const fecha = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "fecha desconocida");
const TITULOS = Object.fromEntries(INDICADORES_EVIDENCIA.map((i) => [i.id, i.titulo]));

/* ---------- Línea del tablero ---------------------------------------------- */

/** «601–800 · puntaje 60,7–66,1 · ODS 17: 401–600», leída de la tabla (0148). */
export function ResultadoTHE({ year = ANIO }: { year?: number }) {
  const q = useUdesTHE(year);
  if (q.error instanceof FaltaMigracion)
    return (
      <p className="rk-status rk-status--warn" role="note">
        <Icon name="alert" size={15} aria-hidden="true" /> Falta aplicar la migración 0148: todavía no está la tabla oficial de THE Impact {year}.
      </p>
    );
  if (q.error) return <p className="rk-status">No se pudo leer el resultado de THE {year}: {q.error.message}</p>;
  if (q.isPending) return <p className="rk-status rk-status--muted">Leyendo el resultado de THE {year}…</p>;
  if (!q.data) return <p className="rk-status">La tabla de THE {year} no está cargada.</p>;
  const u = q.data;
  return (
    <p className="rk-status">
      Resultado oficial THE {year}: <strong className="rk-num">{u.rank_label}</strong> · puntaje <strong className="rk-num">{textoRango({ lo: u.overall_lo, hi: u.overall_hi })}</strong>
      {u.sdg17_rank_label && (
        <>
          {" "}
          · ODS 17: <strong className="rk-num">{u.sdg17_rank_label}</strong>
        </>
      )}
    </p>
  );
}

/* ---------- Pantalla -------------------------------------------------------- */

interface Escenario {
  actual: number;
  /** null = igual a la actual (estatus quo). */
  base: number | null;
  soloAprobadas: boolean;
  enviados: number[];
  k: number;
  rigor: number;
  deriva: number;
  meta: Meta;
}

const ESCENARIO_BASE: Escenario = { actual: 2026, base: 2025, soloAprobadas: false, enviados: [], k: 1, rigor: 0.9, deriva: 2, meta: { tipo: "subir" } };

export function Posicion() {
  const tabla = useFilasTHE(ANIO);
  if (tabla.error instanceof FaltaMigracion)
    return (
      <div className="rp">
        <p className="rk-status rk-status--warn" role="note">
          <Icon name="alert" size={15} aria-hidden="true" /> Falta aplicar la migración 0148 (THE Impact Rankings). Cuando esté aplicada, aquí aparecen la tabla de 2026 y el
          analizador.
        </p>
        <Metodo captura={null} />
      </div>
    );
  if (tabla.error) return <p className="rk-error">No se pudo leer la tabla de THE: {tabla.error.message}</p>;
  if (!tabla.data) return <p className="rk-status rk-status--muted">Leyendo la tabla de THE Impact {ANIO}…</p>;
  const udes = tabla.data.filas.find(esUdes);
  if (!tabla.data.filas.length || !udes)
    return (
      <div className="rp">
        <p className="rk-status">
          {tabla.data.filas.length ? "La tabla de THE no trae a la UDES («University of Santander»)." : `La tabla de THE Impact ${ANIO} está vacía.`} Corre{" "}
          <code>node scripts/import-the-impact.mjs impact.har</code> y aplica la migración que genera.
        </p>
        <Metodo captura={tabla.data.captura?.captured_at ?? null} />
      </div>
    );
  return <Analizador filas={tabla.data.filas} udes={udes} captura={tabla.data.captura?.captured_at ?? null} />;
}

export function Analizador({ filas, udes, captura }: { filas: FilaTHE[]; udes: FilaTHE; captura: string | null }) {
  const cal = useMemo(() => calibrarTodo(filas), [filas]);
  const escalera = useMemo(() => escaleraNacional(filas), [filas]);
  const rivales = useMemo(() => filasDeColombia(filas), [filas]);
  const [esc, setEsc] = useState<Escenario>(() => {
    const g = leerGuardado(ESCENARIO_BASE);
    return { ...g, enviados: g.enviados.length ? g.enviados : enviadosPublicados(udes) };
  });
  useEffect(() => guardar(esc), [esc]);
  const cambiar = (p: Partial<Escenario>) => setEsc((e) => ({ ...e, ...p }));

  const cob = useCoberturaTodos(EDICIONES);
  const { actual, base: edBase, soloAprobadas, enviados, k, rigor, deriva } = esc;
  const coberturas = useMemo(() => calcularCoberturas(cob.data, actual, edBase, soloAprobadas), [cob.data, actual, edBase, soloAprobadas]);
  const base = useMemo(() => lineaBase(udes), [udes]);
  const supuestos: Supuestos = useMemo(() => ({ ...SUPUESTOS_BASE, k, rigor, deriva }), [k, rigor, deriva]);
  const ods: OdsEscenario[] = useMemo(
    () => base.map((b) => ({ sdg: b.sdg, enviado: b.sdg === 17 || enviados.includes(b.sdg), deltaEvidencia: coberturas.delta[b.sdg] ?? 0 })),
    [base, enviados, coberturas],
  );
  const sim = useMemo(() => simular({ udes, rivales, ods, supuestos, cal }), [udes, rivales, ods, supuestos, cal]);
  const resumen = useMemo(() => resumir(sim, cal), [sim, cal]);

  const tercero = udes.best.length ? udes.best.reduce((m, b) => (b.lo + b.hi < m.lo + m.hi ? b : m)) : null;
  const esperado: Record<number, { centro: number; sigma: number }> = {};
  for (const b of base) esperado[b.sdg] = esperadoOds(b, tercero, ods[b.sdg - 1], supuestos);
  const lista = palancas({
    cobertura: coberturas.palanca,
    elecciones: coberturas.elecciones,
    esperado: Object.fromEntries(Object.entries(esperado).map(([k, v]) => [k, v.centro])),
    enviados: sim.enviados,
    k: esc.k,
    rigor: esc.rigor,
    titulos: TITULOS,
    soloAprobadas: esc.soloAprobadas,
  });

  return (
    <div className="rp">
      <Hoy escalera={escalera} cal={cal} udes={udes} captura={captura} />
      <EscenarioTabla
        base={base}
        esc={esc}
        cambiar={cambiar}
        coberturas={coberturas}
        esperado={esperado}
        cal={cal}
        supuestos={supuestos}
        cargando={cob.isPending}
        errorCob={cob.error}
      />
      <Resultados sim={sim} resumen={resumen} cal={cal} meta={esc.meta} udes={udes} cambiarMeta={(meta) => cambiar({ meta })} />
      <QueMover lista={lista} />
      <Metodo captura={captura} />
    </div>
  );
}

/* ---------- Coberturas ------------------------------------------------------ */

interface Coberturas {
  actual: Record<number, CoberturaOds>;
  base: Record<number, CoberturaOds> | null;
  delta: Record<number, number>;
  motivo: Record<number, ReturnType<typeof deltaEvidencia>["motivo"]>;
  /** Para las palancas: por indicador, lo mejor entre la actual y la base. */
  palanca: Record<number, CoberturaOds>;
  elecciones: Record<number, NonNullable<CoberturaEdiciones[number][number]>>;
}

function calcularCoberturas(datos: CoberturaEdiciones | undefined, actual: number, edBase: number | null, soloAprobadas: boolean): Coberturas {
  const out: Coberturas = { actual: {}, base: edBase === null ? null : {}, delta: {}, motivo: {}, palanca: {}, elecciones: {} };
  for (let n = 1; n <= 17; n++) {
    const elA = datos?.[actual]?.[n] ?? null;
    const elB = edBase === null ? null : (datos?.[edBase]?.[n] ?? null);
    const a = coberturaOds(n, elA, { soloAprobadas });
    const b = edBase === null ? null : coberturaOds(n, elB, { soloAprobadas });
    out.actual[n] = a;
    if (out.base && b) out.base[n] = b;
    const d = deltaEvidencia(a, b);
    out.delta[n] = d.delta;
    out.motivo[n] = d.motivo;
    out.elecciones[n] = elA ?? elB ?? [];
    out.palanca[n] = {
      ...a,
      indicadores: a.indicadores.map((x, i) => ({ ...x, puntos: Math.max(x.puntos, b?.indicadores[i]?.puntos ?? 0) })),
    };
  }
  return out;
}

/* ---------- a. Hoy ---------------------------------------------------------- */

function Hoy({ escalera, cal, udes, captura }: { escalera: PeldanoNacional[]; cal: CalibracionCompleta; udes: FilaTHE; captura: string | null }) {
  const [abierta, setAbierta] = useState<string | null>(udes.iid);
  const bandas = umbralesDeBanda(cal.general);
  const minimo = Math.floor(Math.min(...escalera.map((p) => p.fila.overall_lo)) / 10) * 10;
  const maximo = Math.ceil(Math.max(...escalera.map((p) => p.fila.overall_hi)) / 10) * 10;
  const x = (s: number) => ((s - minimo) / (maximo - minimo)) * 100;
  const ticks: number[] = [];
  for (let t = minimo; t <= maximo; t += 10) ticks.push(t);
  const brecha = brechaHastaSiguiente(udes, cal.general);
  const yo = escalera.find((p) => p.esUdes);
  const sel = escalera.find((p) => p.fila.iid === abierta);

  return (
    <section className="rp-block" aria-labelledby="rp-hoy">
      <h2 id="rp-hoy" className="rk-h2">
        Dónde está la UDES hoy (THE {ANIO})
      </h2>
      <p className="rk-lead">
        <strong className="rk-num">{udes.rank_label}</strong> en el mundo, con un puntaje general entre <strong className="rk-num">{textoRango({ lo: udes.overall_lo, hi: udes.overall_hi })}</strong>
        {yo && (
          <>
            {" "}
            y el puesto <strong className="rk-num">{yo.etiqueta}</strong> en Colombia ({yo.empatadas} universidades comparten esa banda: THE no dice quién va delante)
          </>
        )}
        .{" "}
        {brecha && (
          <>
            Para la banda {brecha.banda} faltan entre <strong className="rk-num">{f1(brecha.minimo)}</strong> y <strong className="rk-num">{f1(brecha.maximo)}</strong> puntos generales (desde el centro,{" "}
            {f1(brecha.desdeCentro)}).
          </>
        )}
      </p>

      <div className="rp-ladder" role="group" aria-label="Escalera de Colombia: rango de puntaje general de cada universidad">
        <div className="rp-ladder__axis" aria-hidden="true">
          <span />
          <span />
          <span className="rp-ladder__ticks">
            {ticks.map((t) => (
              <span key={t} style={{ left: `${x(t)}%` }}>
                {t}
              </span>
            ))}
          </span>
          <span className="rp-ladder__head">Banda mundial</span>
        </div>
        <ol className="rp-ladder__list">
          {escalera.map((p) => (
            <li key={p.fila.iid}>
              <button
                type="button"
                className={`rp-rung${p.esUdes ? " rp-rung--udes" : ""}`}
                aria-pressed={abierta === p.fila.iid}
                onClick={() => setAbierta(abierta === p.fila.iid ? null : p.fila.iid)}
              >
                <span className="rp-rung__pos rk-num">{p.etiqueta}</span>
                <span className="rp-rung__name">{p.esUdes ? "UDES · University of Santander" : p.fila.name}</span>
                <svg className="rp-rung__bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {bandas.map((b, i) =>
                    i % 2 === 0 && b.hi > minimo && b.lo < maximo ? (
                      <rect key={b.label} className="rp-band" x={x(Math.max(b.lo, minimo))} width={x(Math.min(b.hi, maximo)) - x(Math.max(b.lo, minimo))} y={0} height={10} />
                    ) : null,
                  )}
                  {ticks.map((t) => (
                    <line key={t} className="rp-grid" x1={x(t)} x2={x(t)} y1={0} y2={10} vectorEffect="non-scaling-stroke" />
                  ))}
                  <rect className="rp-range" x={x(p.fila.overall_lo)} width={Math.max(0.6, x(p.fila.overall_hi) - x(p.fila.overall_lo))} y={2.5} height={5} rx={0.5} />
                </svg>
                <span className="rp-rung__band rk-num">
                  {p.fila.rank_label}
                  <span className="rp-rung__score"> · {textoRango({ lo: p.fila.overall_lo, hi: p.fila.overall_hi })}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="rk-hint">Cada barra es el rango de puntaje general que publica THE (no un valor). Las franjas de fondo marcan las bandas mundiales. Toca una universidad para ver sus mejores ODS.</p>

      {sel && <MejoresOds fila={sel.fila} />}

      <details className="rk-fold rp-fold">
        <summary>Ver la escalera como tabla</summary>
        <div className="rk-table-wrap">
          <table className="rk-table">
            <caption className="sr-only">Universidades de Colombia en THE Impact {ANIO}</caption>
            <thead>
              <tr>
                <th scope="col">Colombia</th>
                <th scope="col">Universidad</th>
                <th scope="col">Banda mundial</th>
                <th scope="col">Puntaje</th>
                <th scope="col">ODS 17</th>
                <th scope="col">Mejores ODS</th>
              </tr>
            </thead>
            <tbody>
              {escalera.map((p) => (
                <tr key={p.fila.iid} className={p.esUdes ? "rp-row--udes" : undefined}>
                  <td className="rk-num">{p.etiqueta}</td>
                  <th scope="row">{p.fila.name}</th>
                  <td className="rk-num">{p.fila.rank_label}</td>
                  <td className="rk-num">{textoRango({ lo: p.fila.overall_lo, hi: p.fila.overall_hi })}</td>
                  <td className="rk-num">{p.fila.sdg17_rank_label ?? "—"}</td>
                  <td>{p.fila.best.map((b) => `ODS ${b.sdg} (${b.rank_label})`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="rp-source">Fuente: THE Impact Rankings {ANIO}, captura del {fecha(captura)}.</p>
    </section>
  );
}

function MejoresOds({ fila }: { fila: FilaTHE }) {
  return (
    <div className="rp-best" aria-live="polite">
      <h3 className="rp-h3">{esUdes(fila) ? "La UDES" : fila.name}: lo que publica THE</h3>
      <ul className="rp-best__list">
        {fila.sdg17_rank_label && (
          <li>
            <span className="rk-odsmark" style={odsVars(17)}>
              17
            </span>
            <span>
              Alianzas (obligatorio, 22 %) · <b className="rk-num">{fila.sdg17_rank_label}</b> · {textoRango(fila.sdg17_lo !== null && fila.sdg17_hi !== null ? { lo: fila.sdg17_lo, hi: fila.sdg17_hi } : null)}
            </span>
          </li>
        )}
        {fila.best.map((b) => (
          <li key={b.sdg}>
            <span className="rk-odsmark" style={odsVars(b.sdg)}>
              {b.sdg}
            </span>
            <span>
              {odsCorto(b.sdg)} (26 %) · <b className="rk-num">{b.rank_label}</b> · {textoRango(b)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- b. Escenario ---------------------------------------------------- */

function Campo({ label, children, ayuda }: { label: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="rp-field">
      <span>{label}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

function Numero({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
    />
  );
}

function EscenarioTabla(p: {
  base: LineaBaseOds[];
  esc: Escenario;
  cambiar: (x: Partial<Escenario>) => void;
  coberturas: Coberturas;
  esperado: Record<number, { centro: number; sigma: number }>;
  cal: CalibracionCompleta;
  supuestos: Supuestos;
  cargando: boolean;
  errorCob: Error | null;
}) {
  const { esc, cambiar, coberturas: c } = p;
  const enviados = [...new Set([17, ...esc.enviados])];
  const valido = envioValido(enviados);
  const comparados = Object.values(c.motivo).filter((m) => m === "comparado").length;
  const toggle = (n: number) => cambiar({ enviados: esc.enviados.includes(n) ? esc.enviados.filter((x) => x !== n) : [...esc.enviados, n].sort((a, b) => a - b) });

  return (
    <section className="rp-block" aria-labelledby="rp-esc">
      <h2 id="rp-esc" className="rk-h2">
        Escenario 2027
      </h2>
      <p className="rk-lead">
        El puntaje de cada ODS parte de lo publicado en 2026 y se mueve con la evidencia que cambió entre la edición base y la actual de los informes. El general publicado
        de 2027 será el promedio de 2026 y 2027: lo que se gane este año cuenta la mitad.
      </p>

      <div className="rp-controls">
        <Campo label="Informes de la edición">
          <select value={esc.actual} onChange={(e) => {
              const v = Number(e.target.value);
              cambiar({ actual: v, base: esc.base === v ? (EDICIONES.find((x) => x !== v) ?? null) : esc.base });
            }}
          >
            {EDICIONES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Comparada con">
          <select value={esc.base ?? "igual"} onChange={(e) => cambiar({ base: e.target.value === "igual" ? null : Number(e.target.value) })}>
            {EDICIONES.filter((e) => e !== esc.actual).map((e) => (
              <option key={e} value={e}>
                la edición {e}
              </option>
            ))}
            <option value="igual">nada (estatus quo)</option>
          </select>
        </Campo>
        <Campo label="k · escala de THE" ayuda="1 = un punto del ODS vale un punto escalado">
          <Numero value={esc.k} onChange={(k) => cambiar({ k })} min={0} max={3} step={0.1} />
        </Campo>
        <Campo label="Rigor del evaluador" ayuda="0,9 = THE reconoce el 90 %">
          <Numero value={esc.rigor} onChange={(rigor) => cambiar({ rigor })} min={0} max={1} step={0.05} />
        </Campo>
        <Campo label="Deriva anual (puntos)" ayuda="lo que se mueve un año sin hacer nada">
          <Numero value={esc.deriva} onChange={(deriva) => cambiar({ deriva })} min={0} max={10} step={0.5} />
        </Campo>
        <label className="rp-check">
          <input type="checkbox" checked={esc.soloAprobadas} onChange={(e) => cambiar({ soloAprobadas: e.target.checked })} /> Contar solo evidencias aprobadas
        </label>
      </div>

      {p.errorCob instanceof FaltaMigracion ? (
        <p className="rk-status rk-status--warn" role="note">
          <Icon name="alert" size={15} aria-hidden="true" /> Sin la migración 0145 no hay informes: el escenario es el estatus quo.
        </p>
      ) : p.errorCob ? (
        <p className="rk-status">No se pudieron leer las evidencias: {p.errorCob.message}. El escenario es el estatus quo.</p>
      ) : p.cargando ? (
        <p className="rk-status rk-status--muted">Leyendo las evidencias de los informes…</p>
      ) : comparados === 0 ? (
        <p className="rk-status" role="note">
          {esc.base === null
            ? "Sin edición de comparación: "
            : `Ningún ODS tiene informe en las dos ediciones (${esc.actual} y ${esc.base}): `}
          el cambio estimado es 0 y el escenario es el <b>estatus quo</b> (THE 2026 repetido, con la deriva del año). Cambia los ODS enviados o completa los informes para ver
          un efecto.
        </p>
      ) : null}

      {!valido && (
        <p className="rk-status rk-status--warn" role="alert">
          <Icon name="alert" size={15} aria-hidden="true" /> Para entrar al general hay que enviar al menos 4 ODS, el 17 entre ellos. Con {enviados.length} no hay puntaje general.
        </p>
      )}

      <div className="rk-table-wrap">
        <table className="rk-table rp-table">
          <caption className="sr-only">Escenario por ODS</caption>
          <thead>
            <tr>
              <th scope="col">Enviar</th>
              <th scope="col">ODS</th>
              <th scope="col">THE 2026</th>
              <th scope="col" className="rk-r">
                Evidencia {esc.actual}
              </th>
              <th scope="col" className="rk-r">
                Cambio
              </th>
              <th scope="col" className="rk-r">
                Esperado 2027
              </th>
              <th scope="col">Banda del ODS</th>
            </tr>
          </thead>
          <tbody>
            {p.base.map((b) => {
              const e = p.esperado[b.sdg];
              const enviado = enviados.includes(b.sdg);
              const a = c.actual[b.sdg];
              const d = cambioOds({ deltaEvidencia: c.delta[b.sdg] ?? 0 }, p.supuestos);
              return (
                <tr key={b.sdg} className={enviado ? undefined : "rp-row--off"}>
                  <td>
                    <input
                      type="checkbox"
                      checked={enviado}
                      disabled={b.sdg === 17}
                      onChange={() => toggle(b.sdg)}
                      aria-label={b.sdg === 17 ? "ODS 17: obligatorio" : `Enviar el ODS ${b.sdg}`}
                    />
                  </td>
                  <th scope="row">
                    <span className="rk-odsmark" style={odsVars(b.sdg)}>
                      {b.sdg}
                    </span>{" "}
                    {odsCorto(b.sdg)}
                  </th>
                  <td className="rk-num">{b.publicado ? `${b.banda} · ${textoRango(b.publicado)}` : <span className="rp-muted">no publicado (≤ el tercero)</span>}</td>
                  <td className="rk-r rk-num">{a.hayInforme ? `${f1(a.puntos)} de ${f1(a.techo)}` : <span className="rp-muted">sin informe</span>}</td>
                  <td className="rk-r rk-num">{signo(d)}</td>
                  <td className="rk-r rk-num">
                    {f1(e.centro)} <span className="rp-muted">± {f1(e.sigma)}</span>
                  </td>
                  <td className="rk-num">{enviado ? ubicar(p.cal.ods[b.sdg], e.centro).label : <span className="rp-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rk-hint">
        «Evidencia» son puntos del ODS que aportan las notas elegidas en los <Link to="/admin/rankings/informes">informes</Link> (Σ peso × puntos ÷ máximo de los indicadores de
        evidencia y documento). «Cambio» = (actual − base) × k × rigor. «± » es una desviación: la banda publicada y la deriva del año.
      </p>
    </section>
  );
}

/* ---------- c. Resultados --------------------------------------------------- */

const METAS: { id: string; label: string; meta: Meta }[] = [
  { id: "subir", label: "Subir de banda mundial", meta: { tipo: "subir" } },
  { id: "b401", label: "Quedar en 401–600 o mejor", meta: { tipo: "banda", rank_lo: 401 } },
  { id: "b301", label: "Quedar en 301–400 o mejor", meta: { tipo: "banda", rank_lo: 301 } },
  { id: "c3b", label: "Top 3 de Colombia (por banda; los empates cuentan)", meta: { tipo: "colombia", top: 3, criterio: "banda" } },
  { id: "c3p", label: "Top 3 de Colombia (por puntaje)", meta: { tipo: "colombia", top: 3, criterio: "puntaje" } },
  { id: "c2p", label: "Top 2 de Colombia (por puntaje)", meta: { tipo: "colombia", top: 2, criterio: "puntaje" } },
  { id: "c5b", label: "Top 5 de Colombia (por banda)", meta: { tipo: "colombia", top: 5, criterio: "banda" } },
  { id: "o4", label: "ODS 4 en 301–400 o mejor", meta: { tipo: "ods", sdg: 4, rank_lo: 301 } },
  { id: "o5", label: "ODS 5 en 201–300 o mejor", meta: { tipo: "ods", sdg: 5, rank_lo: 201 } },
  { id: "o10", label: "ODS 10 en 201–300 o mejor", meta: { tipo: "ods", sdg: 10, rank_lo: 201 } },
  { id: "o17", label: "ODS 17 en 301–400 o mejor", meta: { tipo: "ods", sdg: 17, rank_lo: 301 } },
];

const idMeta = (m: Meta) => METAS.find((x) => JSON.stringify(x.meta) === JSON.stringify(m))?.id ?? "subir";

function Cifra({ p, label, nota }: { p: number; label: string; nota?: string }) {
  return (
    <div className="rp-fig">
      <p className="rp-fig__n rk-num">{textoProb(p)}</p>
      <p className="rp-fig__label">{label}</p>
      {nota && <p className="rp-fig__note">{nota}</p>}
    </div>
  );
}

function Resultados({
  sim,
  resumen,
  cal,
  meta,
  udes,
  cambiarMeta,
}: {
  sim: Simulacion;
  resumen: ReturnType<typeof resumir>;
  cal: CalibracionCompleta;
  meta: Meta;
  udes: FilaTHE;
  cambiarMeta: (m: Meta) => void;
}) {
  const pMeta = probMeta(sim, meta, cal);
  const elegida = METAS.find((m) => m.id === idMeta(meta));
  const p401 = probMeta(sim, { tipo: "banda", rank_lo: 401 }, cal);
  if (!sim.valido)
    return (
      <section className="rp-block" aria-labelledby="rp-res">
        <h2 id="rp-res" className="rk-h2">
          Qué tan probable es
        </h2>
        <p className="rk-status rk-status--warn">Con este envío no hay puntaje general: elige al menos 4 ODS con el 17.</p>
      </section>
    );
  return (
    <section className="rp-block" aria-labelledby="rp-res">
      <h2 id="rp-res" className="rk-h2">
        Qué tan probable es
      </h2>
      <div className="rp-meta">
        <Campo label="Meta a evaluar («destacar» lo defines tú)">
          <select value={idMeta(meta)} onChange={(e) => cambiarMeta(METAS.find((m) => m.id === e.target.value)!.meta)}>
            {METAS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="rp-figs">
        <Cifra p={pMeta} label={elegida?.label ?? "Meta"} nota="la meta elegida" />
        <Cifra p={resumen.subir} label={`Subir de ${udes.rank_label}`} />
        <Cifra p={p401} label="401–600 o mejor" />
        <Cifra p={resumen.top[3].banda} label="Top 3 de Colombia por banda" nota="empatada en la banda del 3.º cuenta" />
        <Cifra p={resumen.bajar} label={`Bajar de ${udes.rank_label}`} />
      </div>

      <div className="rp-split">
        <div>
          <h3 className="rp-h3">Puntaje general publicado 2027</h3>
          <Histograma sim={sim} cal={cal} actual={udes} />
          <p className="rk-hint">
            Media <b className="rk-num">{f1(resumen.media)}</b>; 8 de cada 10 escenarios entre <b className="rk-num">{f1(resumen.p10)}</b> y <b className="rk-num">{f1(resumen.p90)}</b>.
            Las líneas verticales son los cortes de banda de 2026; la franja, el rango publicado de la UDES.
          </p>
        </div>
        <div>
          <h3 className="rp-h3">Banda mundial 2027</h3>
          <ul className="rp-dist">
            {resumen.bandas.map((b) => (
              <li key={b.rank_lo} className={b.rank_lo === udes.rank_lo ? "rp-dist--now" : undefined}>
                <span className="rk-num">{b.label}</span>
                <span className="rp-dist__track" aria-hidden="true">
                  <span style={{ width: `${Math.round(b.p * 100)}%` }} />
                </span>
                <b className="rk-num">{textoProb(b.p)}</b>
              </li>
            ))}
          </ul>
          <h3 className="rp-h3">En Colombia</h3>
          <p className="rp-pos">
            Por puntaje, puesto esperado <b className="rk-num">{f1(resumen.puesto.media)}</b> (8 de cada 10: del <b className="rk-num">{Math.round(resumen.puesto.p10)}</b> al{" "}
            <b className="rk-num">{Math.round(resumen.puesto.p90)}</b>). Por banda (lo que se ve en la tabla de THE), <b className="rk-num">{f1(resumen.puestoBanda.media)}</b>.
          </p>
          <p className="rk-hint">
            Top 5: {textoProb(resumen.top[5].banda)} por banda · {textoProb(resumen.top[5].puntaje)} por puntaje. Los rivales se mueven al azar dentro de su rango, con la misma
            deriva; no se sabe qué evidencia preparan.
          </p>
        </div>
      </div>
    </section>
  );
}

function Histograma({ sim, cal, actual }: { sim: Simulacion; cal: CalibracionCompleta; actual: FilaTHE }) {
  const cubos = histograma(sim.general, 0.5);
  if (!cubos.length) return null;
  const lo = Math.min(cubos[0].desde, actual.overall_lo - 1);
  const hi = Math.max(cubos[cubos.length - 1].hasta, actual.overall_hi + 1);
  const top = Math.max(...cubos.map((c) => c.n));
  const W = 320;
  const H = 120;
  const x = (s: number) => ((s - lo) / (hi - lo)) * W;
  const y = (n: number) => H - (n / top) * (H - 8);
  const cortes = umbralesDeBanda(cal.general)
    .map((b) => b.lo)
    .filter((s) => s > lo && s < hi);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo); t <= hi; t += Math.max(1, Math.round((hi - lo) / 6))) ticks.push(t);
  return (
    <figure className="rp-hist">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Distribución del puntaje general 2027 de la UDES, entre ${f1(lo)} y ${f1(hi)} puntos`}>
        <rect className="rp-hist__now" x={x(actual.overall_lo)} width={x(actual.overall_hi) - x(actual.overall_lo)} y={0} height={H} />
        {cubos.map((c) => (
          <rect key={c.desde} className="rp-hist__bar" x={x(c.desde) + 0.5} width={Math.max(0.5, x(c.hasta) - x(c.desde) - 1)} y={y(c.n)} height={H - y(c.n)} />
        ))}
        {cortes.map((s) => (
          <line key={s} className="rp-hist__cut" x1={x(s)} x2={x(s)} y1={0} y2={H} />
        ))}
        <line className="rp-hist__axis" x1={0} x2={W} y1={H} y2={H} />
        {ticks.map((t) => (
          <text key={t} className="rp-hist__tick" x={x(t)} y={H + 13} textAnchor="middle">
            {t}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/* ---------- d. Qué mover ---------------------------------------------------- */

const PAPEL: Record<Palanca["papel"], string> = { "17": "ODS 17 · 22 %", top3: "entre los 3 mejores · 26 %", entra: "entraría a los 3 mejores", fuera: "no entra al general" };

function QueMover({ lista }: { lista: Palanca[] }) {
  const [todas, setTodas] = useState(false);
  const tot = totalPorOds(lista);
  const t17 = tot.find((t) => t.ods === 17);
  const visibles = todas ? lista : lista.filter((p) => p.ganaAnual > 0).slice(0, 12);
  return (
    <section className="rp-block" aria-labelledby="rp-mover">
      <h2 id="rp-mover" className="rk-h2">
        Qué mover
      </h2>
      {t17 && tot[0]?.ods === 17 && (
        <p className="rp-callout">
          <b>El ODS 17 es la palanca más grande.</b> Pesa 22 % del general sin importar cómo le vaya, y sus indicadores de evidencia que faltan suman hasta{" "}
          <b className="rk-num">{f1(t17.odsPts)}</b> puntos del ODS, unos <b className="rk-num">{f2(t17.anual)}</b> puntos en el puntaje del año.
        </p>
      )}
      {!lista.length ? (
        <p className="rk-status">Todos los indicadores de evidencia tienen sus puntos completos.</p>
      ) : (
        <div className="rk-table-wrap">
          <table className="rk-table rp-table">
            <caption className="sr-only">Indicadores ordenados por lo que suman al puntaje general</caption>
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Cómo entra</th>
                <th scope="col" className="rk-r">
                  Hoy
                </th>
                <th scope="col" className="rk-r">
                  + ODS
                </th>
                <th scope="col" className="rk-r">
                  + año
                </th>
                <th scope="col" className="rk-r">
                  + 2027
                </th>
                <th scope="col">Qué hace falta</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="rp-wrap">
                    <span className="rk-odsmark" style={odsVars(p.ods)}>
                      {p.ods}
                    </span>{" "}
                    <span className="rk-num">{p.id}</span> {p.titulo}
                  </th>
                  <td className="rp-muted">{PAPEL[p.papel]}</td>
                  <td className="rk-r rk-num">
                    {f1(p.puntos)}/{p.maximo}
                  </td>
                  <td className="rk-r rk-num">+{f1(p.ganaOds)}</td>
                  <td className="rk-r rk-num">+{f2(p.ganaAnual)}</td>
                  <td className="rk-r rk-num">+{f2(p.gana2027)}</td>
                  <td className="rp-wrap">{ESFUERZO_TEXTO[p.esfuerzo]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lista.length > 12 && (
        <button type="button" className="button-ghost rk-sm" onClick={() => setTodas(!todas)}>
          {todas ? "Ver solo las 12 primeras" : `Ver los ${lista.length} indicadores`}
        </button>
      )}
      <p className="rk-hint">
        «+ ODS»: puntos del ODS (con k y rigor). «+ año»: lo que suma al puntaje de 2027. «+ 2027»: lo que se ve en el general publicado (la mitad, por el promedio con 2026; en
        2028 cuenta entero si se mantiene). Si un ODS no tiene informe, se parte de cero: es un techo.
      </p>
    </section>
  );
}

/* ---------- e. Método ------------------------------------------------------- */

function Metodo({ captura }: { captura: string | null }) {
  return (
    <section className="rp-block" aria-labelledby="rp-metodo">
      <details className="rk-fold rp-fold">
        <summary id="rp-metodo">Cómo se calcula y qué no sabemos</summary>
        <div className="rp-method">
          <h3 className="rp-h3">Cómo se calcula</h3>
          <ul>
            <li>
              THE calcula el general con el ODS 17 (22 %) y los tres ODS con mejor puntaje <i>escalado</i> (26 % cada uno), y lo promedia con el año anterior. Hay que enviar al
              menos 4 ODS, el 17 entre ellos.
            </li>
            <li>
              Como los puntajes escalados no se publican, el modelo no recalcula el general desde cero: parte del rango publicado de 2026 y le suma el <b>cambio</b> que producen
              la evidencia nueva y la elección de ODS. Sin cambios, la UDES queda donde está.
            </li>
            <li>
              El cambio de un ODS es la diferencia de evidencia entre la edición base y la actual de los informes (Σ peso × puntos ÷ máximo de los indicadores de evidencia y
              documento), por <b>k</b> (escala) y por el <b>rigor</b> del evaluador.
            </li>
            <li>
              Se simulan 4.000 escenarios con semilla fija (los mismos números cada vez): el puntaje 2026 de cada universidad al azar dentro de su rango, cada ODS con una
              incertidumbre de media banda (mínimo 2 puntos), los ODS no publicados entre el 60 % y el 100 % del tercer mejor, y una deriva anual igual para todas.
            </li>
            <li>La banda de cada escenario sale de los cortes de 2026 (1.603 universidades). Las probabilidades se redondean a 5 %.</li>
          </ul>
          <h3 className="rp-h3">Qué no sabemos</h3>
          <ul>
            <li>THE solo publica bandas desde el puesto 101: dentro de una banda nadie sabe quién va delante. El «rank» que trae la página dentro de la banda es orden alfabético.</li>
            <li>
              La página de THE trae la tabla general con el ODS 17 y los tres mejores ODS de cada universidad; no trae las tablas completas por ODS ni los años anteriores (lista
              2019–2026, pero solo hay datos de 2026). 2026 es la única línea base.
            </li>
            <li>No sabemos qué otros ODS envió la UDES ni con qué puntaje: solo que están por debajo del tercero.</li>
            <li>La investigación (27 % de cada ODS) la calcula THE con Scopus; aquí no se modela, se supone igual.</li>
            <li>Los datos (cifras) de cada ODS los puntúa THE contra las demás universidades: no se modelan.</li>
            <li>THE valida la evidencia con un modelo de lenguaje y revisores: el rigor es un supuesto, no un dato.</li>
            <li>Los rivales también preparan evidencia: el modelo no lo sabe y los mueve solo con la deriva.</li>
            <li>Las bandas de 2027 pueden quedar en otros puntajes si entran o salen universidades.</li>
          </ul>
          <p className="rk-hint">
            Con más datos de THE (las tablas por ODS de 2026, y las de 2025 y 2024) la calibración por ODS sería completa y se podría medir la deriva real de un año a otro. El
            importador (<code>scripts/import-the-impact.mjs</code>) ya acepta el año y las tablas por ODS.
          </p>
        </div>
      </details>
      <p className="rp-source">Fuente: THE Impact Rankings {ANIO}, captura del {fecha(captura)}. Números calculados con supuestos visibles; no es un pronóstico de THE.</p>
    </section>
  );
}
