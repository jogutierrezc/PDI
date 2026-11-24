/* Warehouse UDES · Explorar: gráficos y tabla de lo guardado. */

import { useMemo, useState } from "react";
import { Anillo, Barras, Dispersion, Lineas, MapaCalor, type Punto } from "./graficos";
import { CORTES, SEDES, conjuntoPorId } from "./conjuntos";
import { numero } from "./reglas";
import { useFilasCompletas, type Cobertura } from "./store";
import type { Fila } from "./motor";
import type { Contexto } from "./Warehouse";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";

type Grafico = "barras" | "anillo" | "lineas" | "calor" | "dispersion";
const GRAFICOS: { id: Grafico; nombre: string }[] = [
  { id: "barras", nombre: "Barras" },
  { id: "anillo", nombre: "Anillo" },
  { id: "lineas", nombre: "Líneas" },
  { id: "calor", nombre: "Mapa de calor" },
  { id: "dispersion", nombre: "Dispersión" },
];

interface Col {
  nombre: string;
  tipo: "num" | "cat" | "texto";
  distintos: number;
}

/** Qué es cada columna, mirando una muestra: numérica, categórica (pocas opciones) o texto libre. */
function tipar(filas: Fila[]): Col[] {
  if (filas.length === 0) return [];
  const muestra = filas.slice(0, 2000);
  return Object.keys(filas[0]).map((nombre) => {
    const valores = muestra.map((f) => f[nombre]).filter((v) => v !== null && v !== "");
    const distintos = new Set(valores.map(String)).size;
    const esNum = valores.length > 0 && valores.filter((v) => numero(v) !== null).length / valores.length >= 0.9;
    const identificador = distintos > Math.max(60, muestra.length * 0.5);
    return { nombre, distintos, tipo: esNum && distintos > 12 ? "num" : esNum && !identificador ? "num" : identificador ? "texto" : "cat" };
  });
}

const etiqueta = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function agrupar(filas: Fila[], por: string, medir: string) {
  const mapa = new Map<string, { n: number; suma: number }>();
  for (const f of filas) {
    const clave = String(f[por] ?? "—") || "—";
    const g = mapa.get(clave) ?? { n: 0, suma: 0 };
    g.n += 1;
    if (medir !== "conteo") g.suma += numero(f[medir.split(":")[1]]) ?? 0;
    mapa.set(clave, g);
  }
  return [...mapa.entries()]
    .map(([k, g]) => ({ etiqueta: k, valor: medir === "conteo" ? g.n : medir.startsWith("prom:") ? (g.n ? g.suma / g.n : 0) : g.suma }))
    .sort((a, b) => b.valor - a.valor);
}

export function Explorar({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const { periodo, sede } = ctx;
  const disponibles = useMemo(() => {
    const ids = [...new Set(cobertura.filter((c) => c.sede === sede && c.periodo === periodo).map((c) => c.conjunto))];
    return ids.map((id) => conjuntoPorId(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [cobertura, sede, periodo]);

  const pedido = ctx.params.get("conjunto");
  const [conjuntoId, setConjuntoId] = useState(pedido ?? "");
  const conjunto = disponibles.find((c) => c.id === conjuntoId) ?? disponibles[0];
  const cortesGuardados = cobertura.filter((c) => conjunto && c.conjunto === conjunto.id && c.sede === sede && c.periodo === periodo).map((c) => c.corte);
  const [corteElegido, setCorteElegido] = useState("");
  const corte = cortesGuardados.includes(corteElegido) ? corteElegido : cortesGuardados.sort()[0] ?? "";
  const carga = conjunto ? cobertura.find((c) => c.conjunto === conjunto.id && c.sede === sede && c.periodo === periodo && c.corte === corte) : undefined;
  const filas = useFilasCompletas(carga?.id ?? null);

  const [grafico, setGrafico] = useState<Grafico>("barras");
  const [por, setPor] = useState("");
  const [medir, setMedir] = useState("conteo");
  const [porB, setPorB] = useState("");
  const [ejeX, setEjeX] = useState("");
  const [ejeY, setEjeY] = useState("");

  const datos = filas.data ?? [];
  const columnas = useMemo(() => tipar(datos), [datos]);
  const cats = columnas.filter((c) => c.tipo === "cat");
  const nums = columnas.filter((c) => c.tipo === "num");
  const colPor = cats.find((c) => c.nombre === por)?.nombre ?? cats[0]?.nombre ?? "";
  const colPorB = cats.find((c) => c.nombre === porB && c.nombre !== colPor)?.nombre ?? cats.find((c) => c.nombre !== colPor)?.nombre ?? "";
  const colX = nums.find((c) => c.nombre === ejeX)?.nombre ?? nums[0]?.nombre ?? "";
  const colY = nums.find((c) => c.nombre === ejeY && c.nombre !== colX)?.nombre ?? nums.find((c) => c.nombre !== colX)?.nombre ?? "";

  const periodosConDatos = useMemo(
    () => [...new Set(cobertura.filter((c) => conjunto && c.conjunto === conjunto.id && c.sede === sede).map((c) => c.periodo))].sort(),
    [cobertura, conjunto, sede],
  );

  const disponible: Record<Grafico, string | null> = {
    barras: cats.length ? null : "Este reporte no tiene una columna con pocas categorías para agrupar.",
    anillo: !cats.length ? "Este reporte no tiene una columna con pocas categorías." : medir.startsWith("prom:") ? "Un anillo reparte un total; con un promedio no tiene sentido." : null,
    lineas: periodosConDatos.length >= 2 ? null : "Se necesitan al menos dos periodos guardados de este reporte.",
    calor: cats.length >= 2 ? null : "Se necesitan dos columnas con pocas categorías.",
    dispersion: nums.length >= 2 ? null : "Se necesitan dos columnas numéricas.",
  };
  const graficoActivo = disponible[grafico] ? "barras" : grafico;

  if (disponibles.length === 0) {
    return (
      <EmptyBlock
        title={`No hay nada guardado en ${periodo}`}
        hint="Cambie de periodo o de sede arriba, o cargue un reporte en la sección Cargas."
        action={
          <button type="button" className="button-primary" onClick={() => ctx.ir("cargas")}>
            Ir a Cargas
          </button>
        }
      />
    );
  }

  let grafica: React.ReactNode = null;
  if (filas.data && conjunto) {
    if (graficoActivo === "barras" && colPor) {
      const g = agrupar(datos, colPor, medir).slice(0, 12);
      grafica = <Barras datos={g} decimales={medir.startsWith("prom:") ? 2 : 0} titulo={`${conjunto.nombre} por ${etiqueta(colPor)}`} />;
    } else if (graficoActivo === "anillo" && colPor) {
      const g = agrupar(datos, colPor, medir);
      const cabeza = g.slice(0, 5);
      const resto = g.slice(5).reduce((s, x) => s + x.valor, 0);
      grafica = <Anillo datos={resto > 0 ? [...cabeza, { etiqueta: "Otros", valor: resto }] : cabeza} titulo={`${conjunto.nombre} por ${etiqueta(colPor)}`} />;
    } else if (graficoActivo === "lineas") {
      const series = conjunto.porCorte
        ? CORTES.map((c) => ({
            nombre: c.nombre,
            valores: periodosConDatos.map((p) => cobertura.find((x) => x.conjunto === conjunto.id && x.sede === sede && x.periodo === p && x.corte === c.id)?.filas ?? null),
          })).filter((s) => s.valores.some((v) => v !== null))
        : [{ nombre: "Filas guardadas", valores: periodosConDatos.map((p) => cobertura.find((x) => x.conjunto === conjunto.id && x.sede === sede && x.periodo === p)?.filas ?? null) }];
      grafica = <Lineas categorias={periodosConDatos} series={series} titulo={`Filas guardadas de ${conjunto.nombre} por periodo`} minimo={0} />;
    } else if (graficoActivo === "calor" && colPor && colPorB) {
      const filasTop = agrupar(datos, colPor, "conteo").slice(0, 10).map((x) => x.etiqueta);
      const colsTop = agrupar(datos, colPorB, "conteo").slice(0, 8).map((x) => x.etiqueta);
      const cuenta = new Map<string, number>();
      for (const f of datos) {
        const k = `${String(f[colPor] ?? "—")}\u0000${String(f[colPorB] ?? "—")}`;
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
      }
      grafica = (
        <MapaCalor
          filas={filasTop}
          columnas={colsTop}
          valores={filasTop.map((a) => colsTop.map((b) => cuenta.get(`${a}\u0000${b}`) ?? null))}
          titulo={`${etiqueta(colPor)} por ${etiqueta(colPorB)}`}
        />
      );
    } else if (graficoActivo === "dispersion" && colX && colY) {
      const puntos: Punto[] = [];
      for (const f of datos.slice(0, 3000)) {
        const x = numero(f[colX]);
        const y = numero(f[colY]);
        if (x !== null && y !== null) puntos.push({ x, y, etiqueta: String(f[Object.keys(f)[0]] ?? "") });
      }
      grafica = puntos.length ? <Dispersion puntos={puntos} ejeX={etiqueta(colX)} ejeY={etiqueta(colY)} titulo={`${etiqueta(colX)} contra ${etiqueta(colY)}`} /> : <p className="wh-muted">Esas columnas no tienen valores numéricos en común.</p>;
    }
  }

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-grafica">
        <div className="wh-panel__cabeza">
          <h2 id="wh-grafica">{conjunto?.nombre}</h2>
          <div className="wh-fila">
            <label className="wh-campo">
              <span>Reporte</span>
              <select value={conjunto?.id} onChange={(e) => setConjuntoId(e.target.value)}>
                {disponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            {cortesGuardados.length > 0 && cortesGuardados[0] !== "" && (
              <label className="wh-campo">
                <span>Corte</span>
                <select value={corte} onChange={(e) => setCorteElegido(e.target.value)}>
                  {[...cortesGuardados].sort().map((c) => (
                    <option key={c} value={c}>
                      {CORTES.find((x) => x.id === c)?.nombre ?? c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="wh-panel__cabeza" role="group" aria-label="Tipo de gráfico">
          <div className="wh-fila">
            {GRAFICOS.map((g) => (
              <button key={g.id} type="button" className="wh-chip" aria-pressed={graficoActivo === g.id} disabled={Boolean(disponible[g.id])} title={disponible[g.id] ?? undefined} onClick={() => setGrafico(g.id)}>
                {g.nombre}
              </button>
            ))}
          </div>
          <div className="wh-fila">
            {(graficoActivo === "barras" || graficoActivo === "anillo" || graficoActivo === "calor") && cats.length > 0 && (
              <label className="wh-campo">
                <span>{graficoActivo === "calor" ? "Filas" : "Agrupar por"}</span>
                <select value={colPor} onChange={(e) => setPor(e.target.value)}>
                  {cats.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {etiqueta(c.nombre)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {graficoActivo === "calor" && (
              <label className="wh-campo">
                <span>Columnas</span>
                <select value={colPorB} onChange={(e) => setPorB(e.target.value)}>
                  {cats
                    .filter((c) => c.nombre !== colPor)
                    .map((c) => (
                      <option key={c.nombre} value={c.nombre}>
                        {etiqueta(c.nombre)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {(graficoActivo === "barras" || graficoActivo === "anillo") && (
              <label className="wh-campo">
                <span>Medir</span>
                <select value={medir} onChange={(e) => setMedir(e.target.value)}>
                  <option value="conteo">Cantidad de filas</option>
                  {nums.map((c) => (
                    <option key={`s${c.nombre}`} value={`suma:${c.nombre}`}>
                      Suma de {etiqueta(c.nombre).toLowerCase()}
                    </option>
                  ))}
                  {graficoActivo === "barras" &&
                    nums.map((c) => (
                      <option key={`p${c.nombre}`} value={`prom:${c.nombre}`}>
                        Promedio de {etiqueta(c.nombre).toLowerCase()}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {graficoActivo === "dispersion" && (
              <>
                <label className="wh-campo">
                  <span>Eje X</span>
                  <select value={colX} onChange={(e) => setEjeX(e.target.value)}>
                    {nums.map((c) => (
                      <option key={c.nombre} value={c.nombre}>
                        {etiqueta(c.nombre)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wh-campo">
                  <span>Eje Y</span>
                  <select value={colY} onChange={(e) => setEjeY(e.target.value)}>
                    {nums
                      .filter((c) => c.nombre !== colX)
                      .map((c) => (
                        <option key={c.nombre} value={c.nombre}>
                          {etiqueta(c.nombre)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="wh-panel__cuerpo">
          {filas.isPending ? (
            <LoadingBlock rows={4} label="Leyendo las filas" />
          ) : filas.error ? (
            <ErrorBlock error={filas.error} onRetry={() => void filas.refetch()} />
          ) : (
            grafica
          )}
          {carga && (
            <p className="wh-nota-chica">
              Versión {carga.version} · {carga.filas.toLocaleString("es-CO")} filas · {SEDES.find((s) => s.id === sede)?.nombre} · {periodo}
            </p>
          )}
        </div>
      </section>

      {filas.data && <TablaFilas columnas={columnas.map((c) => c.nombre)} filas={datos} nombre={`${conjunto?.id}-${periodo}-${sede}${corte ? `-c${corte}` : ""}`} />}
    </>
  );
}

const POR_PAGINA = 25;

function TablaFilas({ columnas, filas, nombre }: { columnas: string[]; filas: Fila[]; nombre: string }) {
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<{ col: string; asc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [copiado, setCopiado] = useState<string | null>(null);

  const visibles = useMemo(() => {
    let r = filas;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter((f) => columnas.some((c) => String(f[c] ?? "").toLowerCase().includes(t)));
    }
    if (orden) {
      const { col, asc } = orden;
      r = [...r].sort((a, b) => {
        const x = numero(a[col]);
        const y = numero(b[col]);
        const d = x !== null && y !== null ? x - y : String(a[col] ?? "").localeCompare(String(b[col] ?? ""), "es");
        return asc ? d : -d;
      });
    }
    return r;
  }, [filas, columnas, q, orden]);

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas - 1);
  const pagina_ = visibles.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA);

  const copiarCsv = async () => {
    const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [columnas.map(celda).join(","), ...visibles.map((f) => columnas.map((c) => celda(f[c])).join(","))].join("\n");
    try {
      await navigator.clipboard.writeText(csv);
      setCopiado(`${visibles.length.toLocaleString("es-CO")} filas copiadas (CSV).`);
    } catch {
      setCopiado("El navegador no dejó copiar. Seleccione la tabla y cópiela a mano.");
    }
  };

  return (
    <section className="wh-panel" aria-label={`Filas de ${nombre}`}>
      <div className="wh-panel__cabeza">
        <h2>{visibles.length.toLocaleString("es-CO")} filas</h2>
        <div className="wh-fila">
          <label className="wh-campo">
            <span className="sr-only">Buscar en la tabla</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPagina(0);
              }}
              placeholder="Buscar en las filas…"
            />
          </label>
          <button type="button" className="button-secondary" onClick={() => void copiarCsv()}>
            Copiar como CSV
          </button>
        </div>
      </div>
      {copiado && (
        <p className="wh-nota-chica" style={{ padding: "var(--space-2) var(--space-5) 0" }} role="status">
          {copiado}
        </p>
      )}
      <div className="wh-tabla-envuelta">
        <table className="wh-tabla">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col" aria-sort={orden?.col === c ? (orden.asc ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => setOrden(orden?.col === c ? { col: c, asc: !orden.asc } : { col: c, asc: true })}>
                    {etiqueta(c)}
                    {orden?.col === c ? (orden.asc ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagina_.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => (
                  <td key={c} className={numero(f[c]) !== null ? "wh-num" : undefined}>
                    {String(f[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wh-panel__cabeza">
        <span className="wh-muted">
          Página {actual + 1} de {paginas}
        </span>
        <div className="wh-fila">
          <button type="button" className="button-secondary" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
            Anterior
          </button>
          <button type="button" className="button-secondary" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}>
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}
