/* Internacionalización · Cifras: la ventana de int_cifras.

   Solo lo aprobado cuenta (el Director puede incluir lo validado o lo
   enviado para ver cómo va). Los campus son los que la persona ve; el filtro
   acota los totales por campus. «Por país» suma todos los campus visibles:
   la RPC no lo parte por campus, y la pantalla lo dice. */

import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useCrecer, useEntrada, useIndicador } from "./movimiento";
import { FaltaMigracion, useCifras, useCifrasPeriodos } from "../datos";
import type { Incluir } from "../lib/cifras";
import { ETIQUETA_ESTADO } from "../lib/permisos";
import { AvisoMigracion, BarraEstados, Cargando, descargar, ErrorCaja, fmt, LeyendaEstados, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { aCsv, avancePorCampus, contarEstados, filasCsvCifras } from "./logica";
import { Cifra } from "./Resumen";

const SERIES = [
  { id: "saliente", rotulo: "Saliente", color: "var(--od-series-1)" },
  { id: "entrante", rotulo: "Entrante", color: "var(--od-series-2)" },
  { id: "otro", rotulo: "Sin sentido", color: "var(--od-series-3)" },
  { id: "total", rotulo: "Total", color: "var(--brand-navy)" },
] as const;
type SerieId = (typeof SERIES)[number]["id"];
const serieDe = (sentido: string): SerieId => (sentido === "saliente" || sentido === "entrante" ? sentido : "otro");

const INCLUIR: { id: Incluir; rotulo: string }[] = [
  { id: "aprobado", rotulo: "Solo aprobado" },
  { id: "validado", rotulo: "Desde validado" },
  { id: "enviado", rotulo: "Desde enviado" },
];

interface FilaBarra {
  rotulo: string;
  valores: Partial<Record<SerieId, number>>;
}

/** Barras horizontales propias (SVG por fila): apiladas por sentido, con la cifra escrita al lado. */
function Barras({ filas, titulo, series = ["saliente", "entrante"] }: { filas: FilaBarra[]; titulo: string; series?: readonly SerieId[] }) {
  const max = Math.max(1, ...filas.map((f) => series.reduce((s, k) => s + (f.valores[k] ?? 0), 0)));
  return (
    <ul className="it-barras" aria-label={titulo}>
      {filas.map((f) => {
        const total = series.reduce((s, k) => s + (f.valores[k] ?? 0), 0);
        let x = 0;
        return (
          <li key={f.rotulo}>
            <span className="it-barras__rotulo">{f.rotulo}</span>
            <svg className="it-barras__pista" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`${f.rotulo}: ${series.map((k) => `${f.valores[k] ?? 0} ${SERIES.find((s) => s.id === k)!.rotulo.toLowerCase()}`).join(", ")}`}>
              {series.map((k) => {
                const w = ((f.valores[k] ?? 0) / max) * 100;
                const r = w > 0 ? <rect key={k} data-crece x={x} y={0} width={w} height={10} style={{ fill: SERIES.find((s) => s.id === k)!.color }} /> : null;
                x += w;
                return r;
              })}
            </svg>
            <b className="it-num">{fmt(total)}</b>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Movilidad por periodo: columnas agrupadas (saliente y entrante) de los
 * últimos seis periodos, con la cifra encima. Mismo corte y mismos campus
 * que el resto de la pantalla. SVG propio; las columnas crecen desde abajo.
 */
function PorPeriodo({ ctx, incluir, campus }: { ctx: Ctx; incluir: Incluir; campus: readonly { id: string }[] }) {
  const lista = useMemo(() => [...ctx.periodos].sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(-6), [ctx.periodos]);
  const res = useCifrasPeriodos(
    lista.map((p) => p.id),
    ctx.director ? incluir : "aprobado",
  );
  const svg = useRef<SVGSVGElement>(null);
  const listos = res.every((r) => r.data || r.error);
  useCrecer(svg, "[data-crece-y]", { eje: "y", clave: `${listos}-${incluir}-${campus.length}` });
  if (lista.length < 2) return null;
  const ids = new Set(campus.map((c) => c.id));
  const datos = lista.map((p, i) => {
    const mov = (res[i]?.data?.movilidad ?? []).filter((m) => ids.has(m.campus_id));
    const de = (s: string) => mov.filter((m) => serieDe(m.sentido) === s).reduce((a, m) => a + m.total, 0);
    return { p, saliente: de("saliente"), entrante: de("entrante"), listo: Boolean(res[i]?.data), error: res[i]?.error };
  });
  const max = Math.max(1, ...datos.flatMap((d) => [d.saliente, d.entrante]));
  const W = 100 / datos.length;
  const alto = 120;
  return (
    <section className="it-panel it-graficas__ancha" aria-labelledby="it-g-periodo" data-entra>
      <header className="it-panel__cabeza">
        <h3 id="it-g-periodo">Movilidad por periodo</h3>
        <Leyenda series={["saliente", "entrante"]} />
      </header>
      <div className="it-panel__cuerpo">
        <svg ref={svg} className="it-columnas" viewBox={`0 0 100 ${alto + 22}`} preserveAspectRatio="none" role="img" aria-label={`Movilidad por periodo: ${datos.map((d) => `${d.p.codigo}, ${d.saliente} saliente y ${d.entrante} entrante`).join("; ")}`}>
          <line x1="0" x2="100" y1={alto} y2={alto} className="it-columnas__eje" />
          {datos.map((d, i) => {
            // Columnas de ancho fijo, centradas en su periodo: con dos periodos no se vuelven bloques.
            const b = Math.min(W * 0.28, 4.5);
            const x = i * W + W / 2 - b - W * 0.02;
            const hs = (d.saliente / max) * (alto - 16);
            const he = (d.entrante / max) * (alto - 16);
            return (
              <g key={d.p.id} className={d.p.id === ctx.periodo?.id ? "is-actual" : undefined}>
                {d.listo && (
                  <>
                    <rect data-crece-y x={x} y={alto - hs} width={b} height={hs} style={{ fill: "var(--od-series-1)" }} />
                    <rect data-crece-y x={x + b + W * 0.04} y={alto - he} width={b} height={he} style={{ fill: "var(--od-series-2)" }} />
                  </>
                )}
              </g>
            );
          })}
        </svg>
        <ol className="it-columnas__rotulos" style={{ gridTemplateColumns: `repeat(${datos.length}, minmax(0, 1fr))` }}>
          {datos.map((d) => (
            <li key={d.p.id} aria-current={d.p.id === ctx.periodo?.id ? "true" : undefined}>
              <b className="it-num">{d.p.codigo}</b>
              <small className="it-num">{d.error ? "sin dato" : !d.listo ? "…" : `${fmt(d.saliente)} · ${fmt(d.entrante)}`}</small>
            </li>
          ))}
        </ol>
        <p className="it-nota-pie">Saliente · entrante. Cuenta lo {ctx.director && incluir !== "aprobado" ? "que se incluye arriba" : "aprobado"} de los campus elegidos.</p>
      </div>
    </section>
  );
}

function Leyenda({ series }: { series: readonly SerieId[] }) {
  return (
    <ul className="it-leyenda">
      {SERIES.filter((s) => series.includes(s.id)).map((s) => (
        <li key={s.id}>
          <i style={{ background: s.color }} aria-hidden="true" /> {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

export function Cifras({ ctx }: { ctx: Ctx }) {
  const { periodo } = ctx;
  const [incluir, setIncluir] = useState<Incluir>("aprobado");
  const [campusId, setCampusId] = useState<string>("");
  const cifras = useCifras(periodo?.id, ctx.director ? incluir : "aprobado");
  const raiz = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  const clave = `${periodo?.id}-${incluir}-${campusId}-${Boolean(cifras.data)}`;
  useEntrada(raiz, "[data-entra]", `${periodo?.id}-${Boolean(cifras.data)}`);
  useCrecer(raiz, "[data-crece]", { clave });
  useIndicador(seg, "[aria-pressed='true']", incluir, true);

  const campus = useMemo(() => (campusId ? ctx.visibles.filter((c) => c.id === campusId) : ctx.visibles), [campusId, ctx.visibles]);

  if (!periodo) return <Vacio titulo="Aún no hay periodos.">Las cifras salen de las hojas aprobadas de un periodo. El Director abre los periodos en «Periodos».</Vacio>;
  if (cifras.error instanceof FaltaMigracion) return <AvisoMigracion error={cifras.error} />;
  if (cifras.error) return <ErrorCaja error={cifras.error} />;
  if (!cifras.data) return <Cargando texto="Calculando las cifras…" />;

  const c = cifras.data;
  const ids = new Set(campus.map((x) => x.id));
  const mov = c.movilidad.filter((m) => ids.has(m.campus_id));
  const suma = (s: SerieId) => mov.filter((m) => serieDe(m.sentido) === s).reduce((a, m) => a + m.total, 0);
  const personas = c.personas.filter((p) => ids.has(p.campus_id)).reduce((a, p) => a + p.total, 0);
  const convenios = c.convenios_vigentes.filter((p) => ids.has(p.campus_id)).reduce((a, p) => a + p.total, 0);
  const avance = c.avance.filter((a) => ids.has(a.campus_id));
  const estados = contarEstados(avance);
  const hayOtro = suma("otro") > 0;
  const series: SerieId[] = hayOtro ? ["saliente", "entrante", "otro"] : ["saliente", "entrante"];

  const porCampus: FilaBarra[] = campus.map((x) => ({
    rotulo: x.name,
    valores: Object.fromEntries(series.map((s) => [s, mov.filter((m) => m.campus_id === x.id && serieDe(m.sentido) === s).reduce((a, m) => a + m.total, 0)])),
  }));
  const paises = new Map<string, FilaBarra>();
  for (const p of c.por_pais) {
    const f = paises.get(p.pais) ?? { rotulo: p.pais, valores: {} };
    const s = serieDe(p.sentido);
    f.valores[s] = (f.valores[s] ?? 0) + p.total;
    paises.set(p.pais, f);
  }
  const topPaises = [...paises.values()].sort((a, b) => Object.values(b.valores).reduce((x, y) => x + (y ?? 0), 0) - Object.values(a.valores).reduce((x, y) => x + (y ?? 0), 0)).slice(0, 12);
  const sinDatos = mov.length === 0 && convenios === 0;
  const corte = c.incluye.map((e) => ETIQUETA_ESTADO[e].toLowerCase()).join(", ");

  const exportar = () => {
    const { encabezados, filas } = filasCsvCifras({ periodo: periodo.codigo, incluye: c.incluye, campus, cifras: c });
    descargar(`internacionalizacion-cifras-${periodo.codigo}${campusId ? `-${campus[0]?.name ?? ""}` : ""}.csv`, aCsv(encabezados, filas));
  };

  return (
    <div ref={raiz} className="it-cifras">
      <div className="it-mandos" data-entra>
        {ctx.visibles.length > 1 && (
          <div className="it-chips" role="group" aria-label="Campus">
            <button type="button" aria-pressed={campusId === ""} onClick={() => setCampusId("")}>
              {ctx.director ? "Todos los campus" : "Mis campus"}
            </button>
            {ctx.visibles.map((x) => (
              <button key={x.id} type="button" aria-pressed={campusId === x.id} onClick={() => setCampusId(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {ctx.director && (
          <div ref={seg} className="rk-seg it-seg" role="group" aria-label="Qué cuenta">
            <span data-indicador aria-hidden="true" />
            {INCLUIR.map((o) => (
              <button key={o.id} type="button" aria-pressed={incluir === o.id} onClick={() => setIncluir(o.id)}>
                {o.rotulo}
              </button>
            ))}
          </div>
        )}
        <span className="it-espacio" />
        <button type="button" className="button-secondary it-btn" onClick={exportar}>
          <Icon name="download" size={16} aria-hidden="true" /> Exportar CSV
        </button>
      </div>
      <p className="it-sub" data-entra>
        Periodo {periodo.codigo} · cuenta lo {corte} · referencia de vigencia {c.referencia}
        {incluir !== "aprobado" && ctx.director && <b className="it-marca-aviso"> · vista de trabajo: incluye lo que aún no está aprobado</b>}
      </p>

      <div className="it-kpis">
        <Cifra valor={suma("saliente")} rotulo="Movilidad saliente" detalle="registros en hojas de movilidad" />
        <Cifra valor={suma("entrante")} rotulo="Movilidad entrante" detalle="incluye profesores visitantes" />
        <Cifra valor={personas} rotulo="Personas" detalle="documentos distintos por campus" />
        <Cifra valor={convenios} rotulo="Convenios vigentes" detalle={`al ${c.referencia}`} />
        <Cifra valor={estados.aprobado} rotulo="Hojas aprobadas" detalle={`de ${fmt(estados.total)} (hoja × campus)`} tono="aprobado" />
      </div>

      {sinDatos ? (
        <Vacio
          titulo={`Todavía no hay movilidad ni convenios ${incluir === "aprobado" ? "aprobados" : "que contar"} en ${periodo.codigo}.`}
          accion={
            <Link className="button-secondary it-btn" to={ctx.enlace("tablas")}>
              Ir a las tablas
            </Link>
          }
        >
          Cuentan las hojas de clase «movilidad» y «convenio» cuando el Director aprueba la hoja del campus.
          {ctx.director && " Use «Desde enviado» para ver cómo va lo que todavía se revisa."}
        </Vacio>
      ) : (
        <div className="it-graficas">
          <section className="it-panel" aria-labelledby="it-g-campus" data-entra>
            <header className="it-panel__cabeza">
              <h3 id="it-g-campus">Movilidad por campus</h3>
              <Leyenda series={series} />
            </header>
            <div className="it-panel__cuerpo">
              <Barras filas={porCampus} titulo="Movilidad por campus" series={series} />
            </div>
          </section>
          <section className="it-panel it-graficas__alta" aria-labelledby="it-g-pais" data-entra>
            <header className="it-panel__cabeza">
              <h3 id="it-g-pais">Por país {paises.size > 12 && <small className="it-tenue">(los 12 primeros de {paises.size})</small>}</h3>
              <Leyenda series={series} />
            </header>
            <div className="it-panel__cuerpo">
              {topPaises.length ? <Barras filas={topPaises} titulo="Movilidad por país" series={series} /> : <p className="it-tenue">Sin movilidad.</p>}
              <p className="it-nota-pie">País de la contraparte o, si no lo hay, la nacionalidad. Suma todos los campus que usted ve.</p>
            </div>
          </section>
          <section className="it-panel" aria-labelledby="it-g-conv" data-entra>
            <header className="it-panel__cabeza">
              <h3 id="it-g-conv">Convenios vigentes y personas</h3>
            </header>
            <div className="it-panel__cuerpo it-dos">
              <div>
                <h4 className="it-h4">Convenios vigentes</h4>
                <Barras
                  filas={campus.map((x) => ({ rotulo: x.name, valores: { total: c.convenios_vigentes.find((v) => v.campus_id === x.id)?.total ?? 0 } }))}
                  titulo="Convenios vigentes por campus"
                  series={["total"]}
                />
              </div>
              <div>
                <h4 className="it-h4">Personas en movilidad</h4>
                <Barras
                  filas={campus.map((x) => ({ rotulo: x.name, valores: { total: c.personas.find((v) => v.campus_id === x.id)?.total ?? 0 } }))}
                  titulo="Personas en movilidad por campus"
                  series={["total"]}
                />
              </div>
            </div>
          </section>
          <PorPeriodo ctx={ctx} incluir={incluir} campus={campus} />
        </div>
      )}

      <section className="it-panel" aria-labelledby="it-g-av" data-entra>
        <header className="it-panel__cabeza">
          <h3 id="it-g-av">Avance de validación</h3>
          <LeyendaEstados />
        </header>
        <ul className="it-campus it-panel__cuerpo">
          {avancePorCampus(avance, campus).map((a) => (
            <li key={a.campus.id}>
              <b>{a.campus.name}</b>
              <BarraEstados c={a} etiqueta={a.campus.name} />
              <span className="it-num it-tenue">
                {a.total ? `${fmt(a.aprobado)} aprobadas · ${fmt(a.validado)} validadas · ${fmt(a.enviado)} enviadas · ${fmt(a.borrador)} en borrador` : "sin hojas"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
