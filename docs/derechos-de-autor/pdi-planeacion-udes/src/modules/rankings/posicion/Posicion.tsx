/* =============================================================================
   Posicionamiento en THE Impact · /admin/rankings/posicion

   Una sola pantalla de trabajo, no un pronóstico mágico: todo lo que muestra sale
   de la tabla pública de THE 2026 (migración 0148), de las evidencias elegidas
   en los informes por ODS (0145) y de supuestos que se ven y se cambian aquí.
     · izquierda: el escenario (ODS enviados, supuestos y meta). Con «Enfoque» se
       pliega a una franja de 17 líneas: cada ODS enviado es una línea de su color.
     · arriba: los indicadores clave (banda esperada, probabilidad de la meta,
       puntaje esperado y ODS enviados).
     · cuerpo: qué tan probable es cada cosa, dónde está la UDES en Colombia,
       «Mis indicadores frente a lo publicado» (puntos de las evidencias por ODS y
       por indicador, lo que falta primero) y qué mover.
     · al final, plegados: cómo se calcula y qué no sabemos.
   Lógica pura en bandas/calibracion/colombia/evidencia/modelo/palancas.ts.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion } from "../noticias";
import { ODS_NUMEROS, odsCorto, odsNombre, odsVars } from "../ods";
import { useResumenInformes } from "../informes/ajustes-informe";
import { INDICADORES_EVIDENCIA } from "../informes/the-indicadores";
import type { EstadoInforme } from "../informes/tipos";
import { usePreferencia } from "../preferencias";
import { useContador, useCrecer, useFundido, usePliegue, usePresion } from "../movimiento";
import { textoRango } from "./bandas";
import { calibrarTodo, umbralesDeBanda, type CalibracionCompleta } from "./calibracion";
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
  const [enfoque, setEnfoque] = usePreferencia("enfoque");
  const pantalla = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  usePliegue(pantalla, enfoque);
  usePresion(raiz, ".rk-toggle, .rp-od, .rp-rung, .rk-franja");
  useEffect(() => guardar(esc), [esc]);
  const cambiar = (p: Partial<Escenario>) => setEsc((e) => ({ ...e, ...p }));

  const cob = useCoberturaTodos(EDICIONES);
  const informes = useResumenInformes(esc.actual);
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
  const estados = useMemo(
    () => Object.fromEntries(ODS_NUMEROS.map((n) => [n, (informes.data?.find((r) => r.ods === n)?.state ?? "sin") as EstadoInforme | "sin"])),
    [informes.data],
  );

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

  const alternar = (n: number) => cambiar({ enviados: esc.enviados.includes(n) ? esc.enviados.filter((x) => x !== n) : [...esc.enviados, n].sort((a, b) => a - b) });
  const enviadosTodos = [...new Set([17, ...enviados])];

  return (
    <div ref={raiz} className="rp" data-enfoque={enfoque || undefined}>
      <div className="rp-top">
        <button type="button" className="rk-toggle" aria-pressed={enfoque} title="Pliega los controles; los ODS enviados quedan como franja" onClick={() => setEnfoque(!enfoque)}>
          Enfoque
        </button>
      </div>
      <div ref={pantalla} className="rp-screen">
        <aside className="rp-ctl" aria-label="Escenario">
          {enfoque ? (
            <FranjaEnviados enviados={enviadosTodos} onAlternar={alternar} />
          ) : (
            <Controles
              esc={esc}
              cambiar={cambiar}
              enviados={enviadosTodos}
              onAlternar={alternar}
              coberturas={coberturas}
              cargando={cob.isPending}
              errorCob={cob.error}
            />
          )}
        </aside>

        <div className="rp-main">
          {sim.valido && <Kpis sim={sim} resumen={resumen} cal={cal} meta={esc.meta} enviados={enviadosTodos.length} />}
          <Resultados sim={sim} resumen={resumen} cal={cal} meta={esc.meta} udes={udes} />
          <Hoy escalera={escalera} cal={cal} udes={udes} captura={captura} />
          <MisIndicadores coberturas={coberturas} base={base} enviados={enviadosTodos} estados={estados} supuestos={supuestos} />
          <QueMover lista={lista} />
          <Metodo captura={captura} />
        </div>
      </div>
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

/* ---------- Controles y franja de ODS enviados ----------------------------- */

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

function Controles(p: {
  esc: Escenario;
  cambiar: (x: Partial<Escenario>) => void;
  enviados: number[];
  onAlternar: (n: number) => void;
  coberturas: Coberturas;
  cargando: boolean;
  errorCob: Error | null;
}) {
  const { esc, cambiar, coberturas: c, enviados } = p;
  const valido = envioValido(enviados);
  const comparados = Object.values(c.motivo).filter((m) => m === "comparado").length;

  return (
    <section className="rp-controles" aria-labelledby="rp-esc">
      <h2 id="rp-esc" className="rk-h2">
        Escenario 2027
      </h2>

      <div className="rp-controls">
        <Campo label="Informes de la edición">
          <select
            value={esc.actual}
            onChange={(e) => {
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
      </div>

      <div className="rp-sub">
        <h3 className="rp-h3">ODS enviados a THE</h3>
        <div className="rp-odsgrid" role="group" aria-label="ODS enviados a THE">
          {ODS_NUMEROS.map((n) => {
            const on = enviados.includes(n);
            return (
              <label key={n} className="rp-od" title={`ODS ${n} · ${odsNombre(n)}`}>
                <input type="checkbox" checked={on} disabled={n === 17} onChange={() => p.onAlternar(n)} aria-label={n === 17 ? "ODS 17: obligatorio" : `Enviar el ODS ${n}`} />
                <span className="rk-odsmark" style={odsVars(n)}>
                  {n}
                </span>
              </label>
            );
          })}
        </div>
        <p className="rk-hint">El 17 es obligatorio. «Evidencia» sale de las notas elegidas en los <Link to="/admin/rankings/informes">informes</Link>.</p>
      </div>

      <div className="rp-sub">
        <h3 className="rp-h3">
          Supuestos <span className="rp-tag">Ilustrativo</span>
        </h3>
        <div className="rp-controls">
          <Campo label="k · escala de THE" ayuda="1 = un punto del ODS vale un punto escalado">
            <Numero value={esc.k} onChange={(k) => cambiar({ k })} min={0} max={3} step={0.1} />
          </Campo>
          <Campo label="Rigor del evaluador" ayuda="0,9 = THE reconoce el 90 %">
            <Numero value={esc.rigor} onChange={(rigor) => cambiar({ rigor })} min={0} max={1} step={0.05} />
          </Campo>
          <Campo label="Deriva anual (puntos)" ayuda="lo que se mueve un año sin hacer nada">
            <Numero value={esc.deriva} onChange={(deriva) => cambiar({ deriva })} min={0} max={10} step={0.5} />
          </Campo>
        </div>
        <label className="rp-check">
          <input type="checkbox" checked={esc.soloAprobadas} onChange={(e) => cambiar({ soloAprobadas: e.target.checked })} /> Contar solo evidencias aprobadas
        </label>
      </div>

      <div className="rp-sub">
        <Campo label="Meta a evaluar («destacar» lo defines tú)">
          <select value={idMeta(esc.meta)} onChange={(e) => cambiar({ meta: METAS.find((m) => m.id === e.target.value)!.meta })}>
            {METAS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Campo>
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
          {esc.base === null ? "Sin edición de comparación: " : `Ningún ODS tiene informe en las dos ediciones (${esc.actual} y ${esc.base}): `}
          el cambio estimado es 0 y el escenario es el <b>estatus quo</b> (THE 2026 repetido, con la deriva del año).
        </p>
      ) : null}

      {!valido && (
        <p className="rk-status rk-status--warn" role="alert">
          <Icon name="alert" size={15} aria-hidden="true" /> Para entrar al general hay que enviar al menos 4 ODS, el 17 entre ellos. Con {enviados.length} no hay puntaje general.
        </p>
      )}
    </section>
  );
}

/** Con «Enfoque»: los 17 ODS como franja de 8 px; los enviados, de su color. */
function FranjaEnviados({ enviados, onAlternar }: { enviados: number[]; onAlternar: (n: number) => void }) {
  return (
    <nav className="rk-rail rk-rail--franja rp-franja" aria-label="ODS enviados a THE">
      {ODS_NUMEROS.map((n) => {
        const on = enviados.includes(n);
        return (
          <button
            key={n}
            type="button"
            className="rk-franja"
            style={odsVars(n)}
            aria-pressed={on}
            disabled={n === 17}
            aria-label={`ODS ${n}: ${odsNombre(n)}, ${on ? "enviado" : "no enviado"}${n === 17 ? " (obligatorio)" : ""}`}
            title={`${n} · ${odsNombre(n)}${on ? " · enviado" : ""}`}
            onClick={() => onAlternar(n)}
          />
        );
      })}
    </nav>
  );
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
  const lista = useRef<HTMLOListElement>(null);
  useCrecer(lista, ".rp-range", { escalonado: 0.025 });

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
        <ol ref={lista} className="rp-ladder__list">
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

/* ---------- b. Indicadores clave -------------------------------------------- */

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

function Kpis({ sim, resumen, cal, meta, enviados }: { sim: Simulacion; resumen: ReturnType<typeof resumir>; cal: CalibracionCompleta; meta: Meta; enviados: number }) {
  const pMeta = probMeta(sim, meta, cal);
  const banda = resumen.bandas.reduce((m, b) => (b.p > m.p ? b : m));
  const elegida = METAS.find((m) => m.id === idMeta(meta));
  return (
    <div className="rp-kpis" role="list" aria-label="Indicadores clave del escenario">
      <div className="rp-kpi" role="listitem">
        <span>Banda mundial esperada</span>
        <TextoFundido texto={banda.label} />
        <small>{textoProb(banda.p)} de los escenarios</small>
      </div>
      <div className="rp-kpi rp-kpi--meta" role="listitem">
        <span>Probabilidad de la meta</span>
        <Contador valor={pMeta} formato={textoProb} />
        <small>{elegida?.label}</small>
      </div>
      <div className="rp-kpi" role="listitem">
        <span>Puntaje esperado 2027</span>
        <Contador valor={resumen.media} formato={f1} />
        <small>8 de cada 10 entre {f1(resumen.p10)} y {f1(resumen.p90)}</small>
      </div>
      <div className="rp-kpi" role="listitem">
        <span>ODS enviados</span>
        <Contador valor={enviados} formato={(n) => String(Math.round(n))} />
        <small>el 17 incluido; mínimo 4</small>
      </div>
    </div>
  );
}

/** La cifra de un indicador clave cuenta desde la anterior al cambiar el escenario. */
function Contador({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  const ref = useRef<HTMLElement>(null);
  useContador(ref, valor, formato);
  return (
    <b ref={ref} className="rk-num">
      {formato(valor)}
    </b>
  );
}

/** Un texto que no se cuenta (una banda): se funde al cambiar. */
function TextoFundido({ texto }: { texto: string }) {
  const ref = useRef<HTMLElement>(null);
  useFundido(ref, texto, { desplazamiento: 4 });
  return (
    <b ref={ref} className="rk-num">
      {texto}
    </b>
  );
}

/* ---------- c. Resultados --------------------------------------------------- */

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
}: {
  sim: Simulacion;
  resumen: ReturnType<typeof resumir>;
  cal: CalibracionCompleta;
  meta: Meta;
  udes: FilaTHE;
}) {
  const pMeta = probMeta(sim, meta, cal);
  const elegida = METAS.find((m) => m.id === idMeta(meta));
  const p401 = probMeta(sim, { tipo: "banda", rank_lo: 401 }, cal);
  const dist = useRef<HTMLUListElement>(null);
  useCrecer(dist, ".rp-dist__track span", { escalonado: 0.04 });
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
          <ul ref={dist} className="rp-dist">
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

/** Paso «redondo» para el eje de % de escenarios. */
const pasoEje = (max: number) => [1, 2, 5, 10, 20, 25, 50].find((p) => max / p <= 4) ?? 50;

function Histograma({ sim, cal, actual }: { sim: Simulacion; cal: CalibracionCompleta; actual: FilaTHE }) {
  const svg = useRef<SVGSVGElement>(null);
  // Las barras crecen la primera vez; al mover un supuesto cambian en seco (se está explorando).
  useCrecer(svg, ".rp-hist__bar", { eje: "y", escalonado: 0.006 });
  const cubos = histograma(sim.general, 0.5);
  if (!cubos.length) return null;
  const lo = Math.min(cubos[0].desde, actual.overall_lo - 1);
  const hi = Math.max(cubos[cubos.length - 1].hasta, actual.overall_hi + 1);
  /* Lienzo con márgenes para los ejes y sus rótulos. */
  const W = 360;
  const H = 168;
  const izq = 44;
  const der = 8;
  const arr = 18;
  const abj = 36;
  const ancho = W - izq - der;
  const alto = H - arr - abj;
  const base = arr + alto;
  const pct = (n: number) => (n / Math.max(1, sim.n)) * 100;
  const paso = pasoEje(Math.max(...cubos.map((c) => pct(c.n))));
  const techo = Math.max(paso, Math.ceil(Math.max(...cubos.map((c) => pct(c.n))) / paso) * paso);
  const x = (s: number) => izq + ((s - lo) / (hi - lo)) * ancho;
  const y = (p: number) => base - (p / techo) * alto;
  const bandas = umbralesDeBanda(cal.general).filter((b) => b.hi > lo && b.lo < hi);
  const cortes = bandas.map((b) => b.lo).filter((s) => s > lo && s < hi);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo); t <= hi; t += Math.max(1, Math.round((hi - lo) / 6))) ticks.push(t);
  const lineasY: number[] = [];
  for (let v = 0; v <= techo + 1e-9; v += paso) lineasY.push(v);
  return (
    <figure className="rp-hist">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Distribución del puntaje general 2027 de la UDES, entre ${f1(lo)} y ${f1(hi)} puntos`}>
        <rect className="rp-hist__now" x={x(actual.overall_lo)} width={x(actual.overall_hi) - x(actual.overall_lo)} y={arr} height={alto} />
        {lineasY.map((v) => (
          <g key={v}>
            <line className="rp-hist__grid" x1={izq} x2={W - der} y1={y(v)} y2={y(v)} />
            <text className="rp-hist__tick" x={izq - 6} y={y(v) + 3.5} textAnchor="end">
              {v} %
            </text>
          </g>
        ))}
        {cubos.map((c) => (
          <rect key={c.desde} className="rp-hist__bar" x={x(c.desde) + 0.5} width={Math.max(0.5, x(c.hasta) - x(c.desde) - 1)} y={y(pct(c.n))} height={base - y(pct(c.n))} rx={1} />
        ))}
        {cortes.map((s) => (
          <line key={s} className="rp-hist__cut" x1={x(s)} x2={x(s)} y1={arr - 4} y2={base} />
        ))}
        {bandas.map((b) => {
          const a = x(Math.max(b.lo, lo));
          const z = x(Math.min(b.hi, hi));
          return z - a > 40 ? (
            <text key={b.label} className="rp-hist__band" x={(a + z) / 2} y={arr - 6} textAnchor="middle">
              {b.label}
            </text>
          ) : null;
        })}
        <line className="rp-hist__axis" x1={izq} x2={W - der} y1={base} y2={base} />
        {ticks.map((t) => (
          <text key={t} className="rp-hist__tick" x={x(t)} y={base + 13} textAnchor="middle">
            {t}
          </text>
        ))}
        <text className="rp-hist__title" x={izq + ancho / 2} y={H - 4} textAnchor="middle">
          Puntaje general publicado
        </text>
        <text className="rp-hist__title" x={9} y={arr + alto / 2} textAnchor="middle" transform={`rotate(-90 9 ${arr + alto / 2})`}>
          Escenarios
        </text>
      </svg>
    </figure>
  );
}

/* ---------- d. Mis indicadores frente a lo publicado -------------------------- */

const ESTADO_INFORME: Record<EstadoInforme | "sin", string> = { sin: "Sin informe", borrador: "Borrador", revision: "En revisión", publicado: "Publicado" };

/** Lo que falta de un indicador de evidencia: su peso × lo que no tiene ÷ máximo. */
const faltaInd = (x: { peso: number; maximo: number; puntos: number }) => (x.maximo > 0 ? (x.peso * (x.maximo - x.puntos)) / x.maximo : 0);

function MisIndicadores({
  coberturas,
  base,
  enviados,
  estados,
  supuestos,
}: {
  coberturas: Coberturas;
  base: LineaBaseOds[];
  enviados: number[];
  estados: Record<number, EstadoInforme | "sin">;
  supuestos: Supuestos;
}) {
  const ods = ODS_NUMEROS.map((n) => {
    const c = coberturas.actual[n];
    const indicadores = [...c.indicadores].sort((a, b) => faltaInd(b) - faltaInd(a));
    return { n, c, indicadores, falta: c.techo - c.puntos };
  })
    .filter((o) => o.c.techo > 0)
    .sort((a, b) => b.falta - a.falta);

  return (
    <section className="rp-block" aria-labelledby="rp-mis">
      <h2 id="rp-mis" className="rk-h2">
        Mis indicadores frente a lo publicado
      </h2>
      <p className="rk-lead">
        Puntos que dan las evidencias elegidas en los informes, frente al máximo de cada ODS. Primero lo que más falta. Lo que se publicó en THE 2026 va junto a cada ODS.
      </p>
      <ol className="rp-mis">
        {ods.map((o, i) => {
          const b = base.find((x) => x.sdg === o.n);
          const st = estados[o.n] ?? "sin";
          const envia = enviados.includes(o.n);
          const cambio = cambioOds({ deltaEvidencia: coberturas.delta[o.n] ?? 0 }, supuestos);
          return (
            <li key={o.n} className="rp-mis__item">
              <details className="rp-mis__ods" open={i < 3 || undefined}>
                <summary>
                  <span className="rk-odsmark" style={odsVars(o.n)}>
                    {o.n}
                  </span>
                  <span className="rp-mis__name">{odsCorto(o.n)}</span>
                  <span className={`rp-est rp-est--${st}`}>{ESTADO_INFORME[st]}</span>
                  <span className="rp-mis__meter" aria-hidden="true">
                    <i style={{ width: `${Math.round(Math.min(1, o.c.puntos / o.c.techo) * 100)}%` }} />
                  </span>
                  <span className="rp-mis__pts rk-num">
                    {f1(o.c.puntos)} / {f1(o.c.techo)}
                  </span>
                  <span className="rp-mis__falta rk-num">{o.falta > 0.05 ? `faltan ${f1(o.falta)}` : "completo"}</span>
                  <span className="rp-mis__the rk-num">{b?.publicado ? `THE: ${b.banda}` : "THE: no publicado"}</span>
                  {!envia && <span className="rp-est rp-est--no">no enviado</span>}
                  <span className="rp-mis__cambio rk-num">{cambio === 0 ? "" : `cambio ${signo(cambio)}`}</span>
                  <Icon name="chevron-down" size={16} className="rp-mis__chev" aria-hidden="true" />
                </summary>
                <div className="rk-table-wrap">
                  <table className="rk-table rp-table">
                    <caption className="sr-only">Indicadores de evidencia del ODS {o.n}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Indicador</th>
                        <th scope="col">Tipo</th>
                        <th scope="col" className="rk-r">
                          Puntos
                        </th>
                        <th scope="col" className="rk-r">
                          Peso
                        </th>
                        <th scope="col" className="rk-r">
                          Falta
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.indicadores.map((x) => (
                        <tr key={x.id}>
                          <th scope="row" className="rp-wrap">
                            <span className="rk-num">{x.id}</span> {TITULOS[x.id] ?? ""}
                          </th>
                          <td className="rp-muted">{x.tipo === "doc" ? "documento" : "evidencia"}</td>
                          <td className="rk-r rk-num">
                            {f1(x.puntos)} / {x.maximo}
                          </td>
                          <td className="rk-r rk-num">{f1(x.peso)} %</td>
                          <td className="rk-r rk-num">{faltaInd(x) > 0.05 ? `+${f1(faltaInd(x))}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <p className="rk-hint">
        «Puntos / máximo» son los puntos del ODS que da cada indicador (peso × puntos ÷ máximo). «Falta» es lo que sumaría completar ese indicador con la evidencia que ya existe
        o una mejor nota. Si un ODS no tiene informe en la edición elegida, va en cero.
      </p>
    </section>
  );
}

/* ---------- e. Qué mover ---------------------------------------------------- */

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

/* ---------- f. Método ------------------------------------------------------- */

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
