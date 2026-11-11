/* =============================================================================
   Tablero IGA · Financiero. Las seis pestañas del prototipo aprobado:
   Resumen · Sedes · Equilibrio · Viabilidad · Ingresos · Programas.
   Todo sale de las tres tablas conectadas en la Guía de datos; los filtros
   globales (vicerrectoría, facultad, sede, programa) recortan los programas.
   ========================================================================== */

import { useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Aviso, Barras, Cascada, COLORES, Dispersion, Leyenda, Lineas, Mancuerna, TablaOrdenable, Viz } from "./graficas";
import type { ColTabla } from "./graficas";
import { dinero, distintos, filtrarProgramas, num, pct, periodoDe, sumar } from "./financiero-datos";
import type { FiltroFin, ProgramaFin } from "./financiero-datos";
import { Cuenta, useEntradaIga } from "./movimiento";
import "./tablero-iga.css";

const PESTANAS = [
  ["resumen", "Resumen"],
  ["sedes", "Sedes"],
  ["equilibrio", "Equilibrio"],
  ["viabilidad", "Viabilidad"],
  ["ingresos", "Ingresos"],
  ["programas", "Programas"],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

const MEDIDAS = [
  ["en", "Excedente neto"],
  ["eo", "Excedente operativo"],
  ["n", "Nómina docente"],
  ["d", "Descuentos"],
] as const;
type Medida = (typeof MEDIDAS)[number][0];

const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function FinancieroIga({ programas, filtros, poner, onDetalle }: { programas: ProgramaFin[]; filtros: FiltroFin; poner: (c: Partial<FiltroFin>) => void; onDetalle?: (k: string) => void }) {
  const [sp, setSp] = useSearchParams();
  const raiz = useRef<HTMLDivElement>(null);
  const ps = useMemo(() => filtrarProgramas(programas, filtros), [programas, filtros]);

  const semestres = useMemo(() => distintos(programas.flatMap((p) => Object.keys(p.ec))), [programas]);
  const t = semestres.includes(sp.get("t") ?? "") ? (sp.get("t") as string) : semestres[semestres.length - 1] ?? "";
  const per = periodoDe(t);
  const pest = (PESTANAS.find(([id]) => id === sp.get("pestana"))?.[0] ?? "resumen") as Pestana;
  const medida = (MEDIDAS.find(([id]) => id === sp.get("medida"))?.[0] ?? "en") as Medida;
  const poneP = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };

  const sedes = useMemo(() => distintos(programas.map((p) => p.sede)), [programas]);
  const colorSede = (s: string) => COLORES[Math.max(0, sedes.indexOf(s)) % COLORES.length];
  const a = sumar(ps, t);
  const conEq = ps.filter((p) => p.eq[per]);
  const eM = conEq.reduce((s, p) => s + p.eq[per].m, 0);
  const eE = conEq.reduce((s, p) => s + p.eq[per].e, 0);
  const bajo = conEq.filter((p) => p.eq[per].m < p.eq[per].e).length;
  const nombreP = (p: ProgramaFin) => p.programa;
  const abrir = (k: string) => {
    if (onDetalle) return onDetalle(k);
    const p = programas.find((x) => x.k === k);
    if (p) poner({ prog: p.programa, sede: p.sede });
  };

  useEntradaIga(raiz, `${pest}|${t}`);

  if (!semestres.length) return <Aviso>La tabla «Ingresos, costos y excedentes» no trae semestres: revisa que tenga la columna «semestre».</Aviso>;

  const lectura = a.n ? (
    <>En {t}, los programas generaron <b>{dinero(a.i)}</b>{filtros.sede ? ` en ${filtros.sede}` : ""} y un excedente neto de <b>{dinero(a.en)}</b>{a.i ? ` (${pct(a.en / a.i)} de los ingresos)` : ""}. {a.deficit} de {a.n} cerraron con déficit neto.</>
  ) : (
    <>Con estos filtros no hay programas con cifras en {t}.</>
  );

  const puntos = ps.filter((p) => p.ec[t] && p.ec[t].i > 0).map((p) => ({ k: p.k, etiqueta: `${p.programa} · ${p.sede}`, x: p.ec[t].i, y: p.ec[t].en / p.ec[t].i }));

  return (
    <div className="iga" ref={raiz}>
      <p className="iga-lectura">{lectura}</p>

      <div className="iga-kpis" role="list">
        <Kpi etiqueta={`ingresos de los programas${filtros.sede ? ` · ${filtros.sede}` : ""}`} n={a.i} f={dinero} />
        <Kpi etiqueta="excedente operativo sobre ingresos" n={a.i ? a.eo / a.i : 0} f={(v) => (a.i ? pct(v) : "—")} detalle={dinero(a.eo)} bueno={a.eo >= 0} />
        <Kpi etiqueta="excedente neto sobre ingresos" n={a.i ? a.en / a.i : 0} f={(v) => (a.i ? pct(v) : "—")} detalle={dinero(a.en)} bueno={a.en >= 0} />
        <Kpi etiqueta={`programas con déficit neto de ${a.n}`} n={a.deficit} f={(v) => String(Math.round(v))} />
      </div>

      <div className="iga-barra">
        <div className="iga-chips" role="group" aria-label="Periodo">
          <span>Periodo</span>
          {semestres.map((s) => <button key={s} type="button" aria-pressed={s === t} onClick={() => poneP("t", s)}>{s}</button>)}
        </div>
        <div className="iga-tabs" role="tablist" aria-label="Secciones de Financiero">
          {PESTANAS.map(([id, n]) => <button key={id} type="button" role="tab" aria-selected={pest === id} onClick={() => poneP("pestana", id)}>{n}</button>)}
        </div>
      </div>

      <div className="iga-grid">
        {pest === "resumen" && (
          <>
            <Viz ancho={12} titulo={`De los ingresos al excedente neto · ${t}`} nota="Cada paso en millones de pesos"><Cascada s={a} etiqueta={t} /></Viz>
            <Viz titulo="Excedente neto sobre ingresos, por sede" nota="Clic en una sede para filtrar">
              <Barras filas={sedes.map((s) => ({ s, x: sumar(ps.filter((p) => p.sede === s), t) })).filter((r) => r.x.n).map(({ s, x }) => {
                const v = x.i ? x.en / x.i : 0;
                return { k: s, etiqueta: s, sub: `${dinero(x.en)} de ${dinero(x.i)}`, v, max: 1, texto: pct(v), neg: v < 0, onClick: () => poner({ sede: s }) };
              })} />
            </Viz>
            <Viz titulo="Matriculados frente al punto de equilibrio" nota={`Suma de ${conEq.length} programas, ${per}`}>
              <Barras filas={[{ k: "e", etiqueta: "Punto de equilibrio", v: eE, texto: num(eE) }, { k: "m", etiqueta: "Matriculados", v: eM, max: Math.max(eE, eM), texto: num(eM), neg: eM < eE }]} color="var(--iga-ctx-2)" />
              <Aviso>{bajo} de {conEq.length} programas están bajo su punto de equilibrio.</Aviso>
            </Viz>
            <Viz ancho={12} titulo="Programas: ingresos y excedente neto" nota="Cada punto es un programa. Azul con excedente, óxido con déficit. Clic para abrir el programa"><Dispersion pts={puntos} onPick={abrir} /></Viz>
            <Viz titulo="Rendimientos financieros" nota="No hay archivo con este dato"><Aviso>Los reportes de viabilidad traen ingresos, costos, aportes, gastos y excedentes. No hay una columna de rendimientos financieros por sede ni por programa. Si existe en otra fuente, se agrega aquí.</Aviso></Viz>
          </>
        )}

        {pest === "sedes" && (
          <>
            <Viz ancho={12} titulo="Comparación de sedes" nota={`Cada fila es una sede, ${t}. Las barras comparan sedes entre sí. Las sedes no reportan los mismos conceptos. Clic en una fila`}>
              <TablaSedes sedes={sedes} ps={ps} t={t} per={per} poner={poner} />
            </Viz>
            <Viz ancho={12} titulo="Evolución por sede" nota="Promedio simple de los programas de cada sede. Elige la medida">
              <div className="iga-chips" role="group" aria-label="Medida">
                {MEDIDAS.map(([id, n]) => <button key={id} type="button" aria-pressed={medida === id} onClick={() => poneP("medida", id)}>{n}</button>)}
              </div>
              <Leyenda items={sedes.map((s) => ({ l: s, c: colorSede(s) }))} />
              <EvolucionSedes ps={ps} sedes={sedes} medida={medida} color={colorSede} periodos={distintos(programas.flatMap((p) => Object.keys(p.fp)))} />
            </Viz>
          </>
        )}

        {pest === "equilibrio" && (
          <>
            <Viz ancho={12} titulo="Matriculados frente al punto de equilibrio, por facultad" nota="Marca gris: equilibrio. Punto de color: matriculados (azul si lo supera, óxido si no)">
              <Mancuerna filas={distintos(conEq.map((p) => p.facultad)).map((f) => {
                const e = conEq.filter((p) => p.facultad === f);
                return { k: f, etiqueta: f, sub: `${e.filter((p) => p.eq[per].m < p.eq[per].e).length} de ${e.length} programas bajo equilibrio`, a: e.reduce((s, p) => s + p.eq[per].e, 0), b: e.reduce((s, p) => s + p.eq[per].m, 0) };
              }).sort((x, y) => x.b / x.a - y.b / y.a)} />
            </Viz>
            <Viz titulo="Programas bajo equilibrio, por sede" nota={per}>
              <Barras filas={sedes.map((s) => { const e = conEq.filter((p) => p.sede === s); const b = e.filter((p) => p.eq[per].m < p.eq[per].e).length; return { s, e, b }; }).filter((r) => r.e.length).map(({ s, e, b }) => ({ k: s, etiqueta: s, sub: `${b} de ${e.length} programas`, v: b / e.length, max: 1, texto: pct(b / e.length), onClick: () => poner({ sede: s }) }))} />
            </Viz>
            <Viz titulo="Proporción bajo equilibrio, por periodo y sede">
              <Leyenda items={sedes.map((s) => ({ l: s, c: colorSede(s) }))} />
              <Lineas etiqueta="Proporción de programas bajo equilibrio" xs={distintos(programas.flatMap((p) => Object.keys(p.eq)))} fmt={(v) => pct(v)}
                series={sedes.map((s) => ({ label: s, color: colorSede(s), vals: distintos(programas.flatMap((p) => Object.keys(p.eq))).map((x) => { const e = ps.filter((p) => p.sede === s && p.eq[x]); return e.length ? e.filter((p) => p.eq[x].m < p.eq[x].e).length / e.length : null; }) }))} />
            </Viz>
            <Viz ancho={12} titulo={`Programas con mayor déficit de matrícula · ${per}`}>
              <TablaOrdenable filas={conEq} orden="d" desc={false} clave={(p) => p.k} onFila={(p) => abrir(p.k)} cols={[
                { k: "n", n: "Programa", val: nombreP },
                { k: "s", n: "Sede", val: (p) => p.sede },
                { k: "m", n: "Matriculados", num: true, val: (p) => p.eq[per].m, fmt: (p) => num(p.eq[per].m) },
                { k: "e", n: "Punto de equilibrio", num: true, val: (p) => p.eq[per].e, fmt: (p) => num(p.eq[per].e) },
                { k: "d", n: "Diferencia", num: true, barra: true, val: (p) => p.eq[per].m - p.eq[per].e, fmt: (p) => `${p.eq[per].m >= p.eq[per].e ? "+" : "−"}${num(Math.abs(p.eq[per].m - p.eq[per].e))}` },
              ]} />
            </Viz>
          </>
        )}

        {pest === "viabilidad" && (
          <ViabilidadPestana ps={ps} t={t} per={per} puntos={puntos} abrir={abrir} />
        )}

        {pest === "ingresos" && (
          <>
            <Viz titulo={`Ingresos por sede · ${t}`} nota="Suma de los programas. Clic en una sede">
              <Barras filas={sedes.map((s) => ({ s, i: sumar(ps.filter((p) => p.sede === s), t).i })).filter((r) => r.i).map(({ s, i }) => ({ k: s, etiqueta: s, v: i, texto: dinero(i), onClick: () => poner({ sede: s }) }))} />
            </Viz>
            <Viz titulo="Ingresos por nivel de formación" nota="Pregrado y técnico frente a posgrado">
              <Leyenda items={[{ l: "Pregrado y técnico", c: "var(--iga-c1)" }, { l: "Posgrado", c: "var(--iga-c2)" }]} />
              <Apiladas filas={sedes.map((s) => {
                const e = ps.filter((p) => p.sede === s && p.ec[t]);
                const pos = e.filter((p) => /^(posgrado|especializacion|maestria|doctorado)/i.test(p.nivel.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())).reduce((x, p) => x + p.ec[t].i, 0);
                return { k: s, etiqueta: s, a: e.reduce((x, p) => x + p.ec[t].i, 0) - pos, b: pos };
              }).filter((r) => r.a + r.b > 0)} />
            </Viz>
            <Viz titulo={`Ingresos por facultad · ${t}`} nota="Sin los programas que no tienen facultad asignada">
              <Barras filas={distintos(ps.map((p) => p.facultad)).map((f) => ({ f, i: sumar(ps.filter((p) => p.facultad === f), t).i })).filter((r) => r.i).sort((x, y) => y.i - x.i).map(({ f, i }) => ({ k: f, etiqueta: f, v: i, texto: dinero(i), onClick: () => poner({ fac: f }) }))} />
            </Viz>
            <Viz titulo="Ingresos por educación continua" nota="No hay archivo con este dato"><Aviso>Es otra fuente de ingreso. Cuando se agregue su archivo, se conecta en la Guía de datos y aparece aquí.</Aviso></Viz>
            <Viz ancho={12} titulo="Estructura de costos y gastos por sede" nota="No hay archivo con este dato"><Aviso>Los reportes por semestre traen costos del programa, costos asociados y aportes, nómina y otros gastos; no el desglose por concepto (compartido, directo, posgrados, laboratorios). Ese desglose viene de los reportes 2024-B de cada sede y todavía no está cargado.</Aviso></Viz>
          </>
        )}

        {pest === "programas" && (
          <Viz ancho={12} titulo="Todos los programas" nota="Ordena con el título de cada columna. Clic en una fila para abrir el programa">
            <TablaOrdenable filas={ps.filter((p) => p.ec[t] || p.fp[per])} orden="en" desc={false} clave={(p) => p.k} onFila={(p) => abrir(p.k)} cols={columnasProgramas(t, per, nombreP)} />
          </Viz>
        )}
      </div>

      <p className="iga-pie">Fuente: reportes de viabilidad financiera de la Vicerrectoría Administrativa y Financiera. Programas unidos por nombre y sede.</p>
    </div>
  );
}

/* --- Piezas --------------------------------------------------------------------------------- */

function Kpi({ etiqueta, n, f, detalle, bueno }: { etiqueta: string; n: number; f: (v: number) => string; detalle?: string; bueno?: boolean }) {
  return (
    <div className="iga-kpi" role="listitem">
      <Cuenta valor={n} formato={f} />
      <span>{etiqueta}</span>
      {detalle && <small data-tono={bueno ? "bueno" : "malo"}>{bueno ? "▲" : "▼"} {detalle}</small>}
    </div>
  );
}

function columnasProgramas(t: string, per: string, nombre: (p: ProgramaFin) => string): ColTabla<ProgramaFin>[] {
  return [
    { k: "n", n: "Programa", val: nombre },
    { k: "s", n: "Sede", val: (p) => p.sede },
    { k: "i", n: "Ingresos", num: true, barra: true, val: (p) => p.ec[t]?.i ?? null, fmt: (p) => (p.ec[t] ? dinero(p.ec[t].i) : "—") },
    { k: "eo", n: "Excedente operativo", num: true, barra: true, val: (p) => (p.ec[t]?.i ? p.ec[t].eo / p.ec[t].i : null), fmt: (p) => (p.ec[t]?.i ? pct(p.ec[t].eo / p.ec[t].i) : "—") },
    { k: "en", n: "Excedente neto", num: true, barra: true, val: (p) => (p.ec[t]?.i ? p.ec[t].en / p.ec[t].i : null), fmt: (p) => (p.ec[t]?.i ? pct(p.ec[t].en / p.ec[t].i) : "—") },
    { k: "nm", n: "Nómina docente", num: true, val: (p) => p.fp[per]?.n ?? null, fmt: (p) => (p.fp[per]?.n != null ? pct(p.fp[per].n as number) : "—") },
    { k: "eq", n: "Matriculados / equilibrio", num: true, val: (p) => (p.eq[per] ? p.eq[per].m / p.eq[per].e : null), fmt: (p) => (p.eq[per] ? pct(p.eq[per].m / p.eq[per].e) : "—") },
  ];
}

function TablaSedes({ sedes, ps, t, per, poner }: { sedes: string[]; ps: ProgramaFin[]; t: string; per: string; poner: (c: Partial<FiltroFin>) => void }) {
  const filas = sedes.map((s) => {
    const x = sumar(ps.filter((p) => p.sede === s), t);
    const e = ps.filter((p) => p.sede === s && p.eq[per]);
    const eM = e.reduce((z, p) => z + p.eq[per].m, 0), eE = e.reduce((z, p) => z + p.eq[per].e, 0);
    return { s, x, bj: e.filter((p) => p.eq[per].m < p.eq[per].e).length, en: e.length, eM, eE };
  }).filter((r) => r.x.n);
  const defs: { n: string; v: (r: (typeof filas)[number]) => number; f: (r: (typeof filas)[number]) => string; malo?: boolean }[] = [
    { n: "Ingresos", v: (r) => r.x.i, f: (r) => dinero(r.x.i) },
    { n: "Costos del programa", v: (r) => r.x.cd / r.x.i, f: (r) => pct(r.x.cd / r.x.i) },
    { n: "Costos asociados y aportes", v: (r) => r.x.as / r.x.i, f: (r) => pct(r.x.as / r.x.i) },
    { n: "Excedente operativo", v: (r) => r.x.eo / r.x.i, f: (r) => pct(r.x.eo / r.x.i) },
    { n: "Gastos de nómina", v: (r) => r.x.gn / r.x.i, f: (r) => (r.x.gn ? pct(r.x.gn / r.x.i) : "—") },
    { n: "Otros gastos y aportes", v: (r) => r.x.go / r.x.i, f: (r) => pct(r.x.go / r.x.i) },
    { n: "Excedente neto", v: (r) => r.x.en / r.x.i, f: (r) => pct(r.x.en / r.x.i) },
    { n: "Programas con déficit", v: (r) => r.x.deficit / r.x.n, f: (r) => `${r.x.deficit} de ${r.x.n}`, malo: true },
    { n: "Bajo equilibrio", v: (r) => (r.en ? r.bj / r.en : 0), f: (r) => `${r.bj} de ${r.en}`, malo: true },
    { n: "Matriculados / equilibrio", v: (r) => (r.eE ? r.eM / r.eE : 0), f: (r) => (r.eE ? pct(r.eM / r.eE) : "—") },
  ];
  return (
    <div className="iga-tabla">
      <div className="iga-tabla__w">
        <table>
          <thead><tr><th>Sede</th>{defs.map((d) => <th key={d.n} className="num">{d.n}</th>)}</tr></thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.s} className="is-click" tabIndex={0} onClick={() => poner({ sede: r.s })} onKeyDown={(e) => e.key === "Enter" && poner({ sede: r.s })}>
                <td><b>{r.s}</b></td>
                {defs.map((d) => {
                  const val = d.v(r);
                  const mx = Math.max(...filas.map((z) => Math.abs(d.v(z))), 1e-9);
                  return (
                    <td key={d.n} className="num">
                      <span className="iga-cb" aria-hidden="true"><i style={{ width: `${Math.min(100, (Math.abs(val) / mx) * 100)}%`, background: d.malo || val < 0 ? "var(--iga-c2)" : "var(--iga-ctx-2)" }} /></span>
                      <span>{d.f(r)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvolucionSedes({ ps, sedes, medida, color, periodos }: { ps: ProgramaFin[]; sedes: string[]; medida: Medida; color: (s: string) => string; periodos: string[] }) {
  const series = sedes.map((s) => ({
    label: s,
    color: color(s),
    vals: periodos.map((x) => prom(ps.filter((p) => p.sede === s).map((p) => p.fp[x]?.[medida]).filter((v): v is number => typeof v === "number"))),
  }));
  return (
    <>
      <Lineas etiqueta="Evolución por sede" xs={periodos} series={series} fmt={(v) => pct(v)} />
      <Aviso>Una sede sin cifras en un periodo queda con la línea cortada.</Aviso>
    </>
  );
}

function Apiladas({ filas }: { filas: { k: string; etiqueta: string; a: number; b: number }[] }) {
  const max = Math.max(...filas.map((f) => f.a + f.b), 1);
  return (
    <div className="iga-barras" role="list">
      {filas.map((f) => (
        <div key={f.k} role="listitem" className="iga-barras__fila" title={`${f.etiqueta}: pregrado y técnico ${dinero(f.a)}, posgrado ${dinero(f.b)}`}>
          <span className="iga-barras__l">{f.etiqueta}</span>
          <span className="iga-barras__t">
            <i style={{ width: `${(f.a / max) * 100}%`, background: "var(--iga-c1)" }} />
            <i style={{ width: `${(f.b / max) * 100}%`, background: "var(--iga-c2)" }} />
          </span>
          <span className="iga-barras__v">{dinero(f.a + f.b)}</span>
        </div>
      ))}
    </div>
  );
}

function ViabilidadPestana({ ps, t, per, puntos, abrir }: { ps: ProgramaFin[]; t: string; per: string; puntos: { k: string; etiqueta: string; x: number; y: number }[]; abrir: (k: string) => void }) {
  const orden = ps.filter((p) => typeof p.fp[per]?.en === "number").map((p) => ({ p, en: p.fp[per].en as number })).sort((x, y) => y.en - x.en);
  const lista = (xs: typeof orden) => (
    <ul className="iga-lista" role="list">
      {xs.map(({ p, en }) => (
        <li key={p.k}>
          <button type="button" onClick={() => abrir(p.k)}>
            <span>{p.programa}<small>{p.sede}{p.facultad ? ` · ${p.facultad}` : ""}</small></span>
            <b data-tono={en < 0 ? "malo" : "bueno"}>{en < 0 ? "−" : ""}{pct(Math.abs(en))}</b>
          </button>
        </li>
      ))}
    </ul>
  );
  const nom = ps.map((p) => p.fp[per]?.n).filter((v): v is number => typeof v === "number");
  const bins: [string, number, number][] = [["Menos de 30 %", 0, 0.3], ["30 a 50 %", 0.3, 0.5], ["50 a 70 %", 0.5, 0.7], ["70 a 100 %", 0.7, 1], ["Más de 100 %", 1, 99]];
  return (
    <>
      <Viz ancho={12} titulo="Ingresos y excedente neto de cada programa" nota={`${t}. Eje vertical acotado entre −150 % y 100 %`}><Dispersion pts={puntos} onPick={abrir} /></Viz>
      <Viz titulo={`Mayor excedente neto · ${per}`} nota="Como porcentaje de los ingresos">{lista(orden.slice(0, 8))}</Viz>
      <Viz titulo={`Mayor déficit neto · ${per}`} nota="Como porcentaje de los ingresos">{lista(orden.slice(-8).reverse())}</Viz>
      <Viz ancho={12} titulo="Nómina docente como porcentaje de los ingresos" nota={`${nom.length} programas, ${per}. A más nómina, menos margen`}>
        <Barras filas={bins.map(([n, lo, hi]) => ({ k: n, etiqueta: n, v: nom.filter((x) => x >= lo && x < hi).length, max: Math.max(1, ...bins.map(([, l, h]) => nom.filter((x) => x >= l && x < h).length)), texto: `${nom.filter((x) => x >= lo && x < hi).length} programas` }))} />
      </Viz>
    </>
  );
}
