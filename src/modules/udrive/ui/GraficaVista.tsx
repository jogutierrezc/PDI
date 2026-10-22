/* =============================================================================
   UDrive · el dibujo de una gráfica con TanStack Charts.

   Recibe la tabla y la configuración y dibuja el tipo elegido: línea (con
   tendencia lineal opcional), área, barras, barras horizontales, agrupadas,
   apiladas, dispersión, burbujas, mapa de calor, torta, dona y las combinadas
   (barras + línea y dos líneas con dos ejes). Los valores son los de la tabla;
   los colores salen de la paleta institucional (lib/graficas.ts). Cada gráfica
   lleva su nombre y su descripción para el lector de pantalla.
   ========================================================================== */

import { useMemo } from "react";
import { areaY, barX, barY, cell, colorLegend, defineChart, dot, group, lineY, text } from "@tanstack/charts";
import type { ChartMark } from "@tanstack/charts";
import { polar, pie, radialArc } from "@tanstack/charts/polar";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import type { ConfigGrafica, TablaDatos } from "../tipos";
import { PALETA, colorCalorGrafica, colorDe, datosCalor, datosCategoricos, datosDispersion, datosPorciones, descripcionAccesible, esCombinada, falta, rangoDeEje, tendenciaDeSerie, tintaSobre, ultimoValor } from "../lib/graficas";
import type { SerieDatos } from "../lib/graficas";
import { textoNumero } from "../lib/valores";

const fmt = (n: number): string => textoNumero(Math.round(n * 100) / 100);
const fmtEje = (n: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);

interface Fila {
  id: string;
  cat: string;
  serie: string;
  valor: number;
}

/** Las filas largas (una por categoría y serie) con rótulos de serie únicos. */
function filasLargas(series: readonly SerieDatos[], categorias: readonly string[]): { filas: Fila[]; nombres: string[]; colores: string[] } {
  const usados = new Set<string>();
  const nombres = series.map((s) => {
    let n = s.etiqueta;
    for (let i = 2; usados.has(n); i++) n = `${s.etiqueta} (${i})`;
    usados.add(n);
    return n;
  });
  const filas: Fila[] = [];
  series.forEach((s, i) =>
    s.valores.forEach((v, k) => {
      if (v !== null) filas.push({ id: `${i}:${k}`, cat: categorias[k], serie: nombres[i], valor: v });
    }),
  );
  return { filas, nombres, colores: series.map((s) => colorDe(s.color)) };
}

interface Props {
  tabla: TablaDatos;
  config: ConfigGrafica;
  altura?: number;
}

export function GraficaVista({ tabla, config, altura = 340 }: Props) {
  const aviso = falta(tabla, config);
  const { etiqueta, descripcion } = useMemo(() => descripcionAccesible(tabla, config), [tabla, config]);
  if (aviso) return <p className="ud-vacio" role="status">{aviso}</p>;
  const comun = { ariaLabel: etiqueta, ariaDescription: descripcion || undefined, altura };
  switch (config.tipo) {
    case "dispersion":
    case "burbujas":
      return <Dispersion tabla={tabla} config={config} {...comun} />;
    case "calor":
      return <Calor tabla={tabla} config={config} {...comun} />;
    case "torta":
    case "dona":
      return <Porciones tabla={tabla} config={config} {...comun} />;
    default:
      return <Categorica tabla={tabla} config={config} {...comun} />;
  }
}

interface Interno extends Props {
  ariaLabel: string;
  ariaDescription?: string;
  altura: number;
}

/* ---------- línea, área, barras, agrupadas, apiladas y combinadas ------------------ */

function Categorica({ tabla, config: c, ariaLabel, ariaDescription, altura }: Interno) {
  const definicion = useMemo(() => {
    const datos = datosCategoricos(tabla, c);
    const { filas, nombres, colores } = filasLargas(datos.series, datos.categorias);
    const horizontal = c.tipo === "barras-h";
    const combinada = esCombinada(c.tipo);
    const barras = c.tipo === "barras" || horizontal || c.tipo === "agrupadas" || c.tipo === "apiladas" || c.tipo === "barras-linea";
    const izquierdas = datos.series.filter((s) => (combinada ? s.eje !== "derecho" : true));
    const derechas = combinada ? datos.series.filter((s) => s.eje === "derecho") : [];
    const valoresIzq = izquierdas.flatMap((s) => s.valores);
    const apilado = c.tipo === "apiladas" || c.tipo === "area";
    const totales = apilado ? datos.categorias.map((_, k) => izquierdas.reduce((t, s) => t + (s.valores[k] ?? 0), 0)) : [];
    const rangoY = rangoDeEje(apilado ? totales : valoresIzq, { min: c.min, max: c.max }, barras || c.tipo === "area");
    const rangoDer = derechas.length ? rangoDeEje(derechas.flatMap((s) => s.valores), { min: null, max: null }, false) : null;

    const nombreDe = (s: SerieDatos) => nombres[datos.series.indexOf(s)];
    const delSerie = (s: SerieDatos) => filas.filter((f) => f.serie === nombreDe(s));
    const rotulos = (s: SerieDatos, color: string) => {
      if (c.rotular === "ninguno") return [];
      const propias = delSerie(s);
      const elegidas = c.rotular === "todos" ? propias : (() => {
        const u = ultimoValor(s, datos.categorias);
        return u ? propias.filter((f) => f.cat === u.categoria && f.valor === u.valor) : [];
      })();
      return [text(elegidas, { id: `rotulo-${s.clave}`, x: "cat", y: "valor", text: (f) => fmt(f.valor), dy: -10, fontWeight: 700, fill: color, key: "id", ...(derechas.includes(s) ? { yScale: "derecha" } : {}) })];
    };

    // Las marcas tienen datos de distinta forma (barras, líneas, rótulos): el arreglo no puede fijar una sola.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marcas: ChartMark<any, any, any, any, any, any, any>[] = [];
    if (barras) {
      const delBarras = c.tipo === "barras-linea" ? izquierdas : datos.series;
      const filasBarras = filas.filter((f) => delBarras.some((s) => nombreDe(s) === f.serie));
      marcas.push(
        horizontal
          ? barX(filasBarras, { x: "valor", y: "cat", color: "serie", key: "id", inset: 1 })
          : barY(filasBarras, { x: "cat", y: "valor", color: "serie", key: "id", inset: 1, ...(c.tipo === "agrupadas" ? { layout: group() } : {}) }),
      );
    }
    if (c.tipo === "area") marcas.push(areaY(filas, { x: "cat", y: "valor", z: "serie", color: "serie", key: "id", fillOpacity: 0.55 }));
    if (c.tipo === "linea" || c.tipo === "dos-lineas" || c.tipo === "barras-linea") {
      const lineas = c.tipo === "barras-linea" ? derechas : datos.series;
      for (const s of lineas) {
        const propias = delSerie(s);
        marcas.push(lineY(propias, { id: `linea-${s.clave}`, x: "cat", y: "valor", z: "serie", color: "serie", key: "id", points: propias.length <= 30, ...(derechas.includes(s) ? { yScale: "derecha" } : {}) }));
      }
    }
    if (c.tendencia && c.tipo === "linea") {
      datos.series.forEach((s, i) => {
        const t = tendenciaDeSerie(s);
        const puntos = t.flatMap((v, k) => (v === null ? [] : [{ id: `t${i}:${k}`, cat: datos.categorias[k], serie: `Tendencia de ${nombres[i]}`, valor: v }]));
        if (puntos.length > 1) marcas.push(lineY(puntos, { id: `tendencia-${s.clave}`, x: "cat", y: "valor", z: "serie", key: "id", stroke: "#5f7089", strokeDasharray: "5 4", strokeWidth: 1.5 }));
      });
    }
    if (!horizontal) {
      datos.series.forEach((s, i) => {
        if (c.tipo === "apiladas" || c.tipo === "area" || c.tipo === "agrupadas") return;
        marcas.push(...rotulos(s, i === 0 || !derechas.includes(s) ? "#13233b" : "#6b4400"));
      });
    }

    const etiquetaEje = (t: string) => (t.trim() ? { label: t.trim() } : {});
    const ejeX = horizontal
      ? { scale: scaleLinear().domain(rangoY), nice: true, grid: true, axis: { ...etiquetaEje(c.ejeY), ticks: { format: fmtEje } } }
      : { scale: () => (barras ? scaleBand<string>().domain(datos.categorias).padding(0.2) : scalePoint<string>().domain(datos.categorias).padding(0.5)), axis: etiquetaEje(c.ejeX) };
    const ejeY = horizontal
      ? { scale: () => scaleBand<string>().domain(datos.categorias).padding(0.2), axis: etiquetaEje(c.ejeX) }
      : { scale: scaleLinear().domain(rangoY), nice: true, grid: true, axis: { ...etiquetaEje(c.ejeY), ticks: { format: fmtEje } } };

    // Las marcas dependen del tipo elegido: el armado de la gráfica lleva los tipos «borrados» (constructor sensible a la pantalla).
    return defineChart(
      () => ({
        marks: marcas,
        scales: {
          x: ejeX,
          y: ejeY,
          ...(rangoDer ? { derecha: { channel: "y" as const, scale: scaleLinear().domain(rangoDer), nice: true, side: "right" as const, axis: { ...etiquetaEje(c.ejeY2), ticks: { format: fmtEje } } } } : {}),
        },
        color: { domain: nombres, range: colores, ...(nombres.length > 1 ? { legend: colorLegend() } : {}) },
      }),
      { tooltip },
    );
  }, [tabla, c]);
  return <Chart definition={definicion} height={altura} ariaLabel={ariaLabel} ariaDescription={ariaDescription} />;
}

/* ---------- dispersión y burbujas ------------------------------------------------------- */

function Dispersion({ tabla, config: c, ariaLabel, ariaDescription, altura }: Interno) {
  const definicion = useMemo(() => {
    const { puntos } = datosDispersion(tabla, c);
    const color = colorDe(c.series[0]?.color ?? 0);
    const mayor = Math.max(1, ...puntos.map((p) => p.r ?? 0));
    const radio = (v: number) => 4 + 22 * Math.sqrt(Math.max(0, v) / mayor);
    const etiquetaEje = (t: string, def: string) => ({ label: (t.trim() || def).trim() });
    const colX = tabla.columnas.find((k) => k.clave === c.x)?.etiqueta ?? "";
    const colY = tabla.columnas.find((k) => k.clave === c.series[0]?.clave)?.etiqueta ?? "";
    return defineChart({
      marks: [dot(puntos, { x: "x", y: "y", key: "id", fill: color, fillOpacity: c.tipo === "burbujas" ? 0.6 : 0.85, stroke: color, strokeWidth: 1, r: c.tipo === "burbujas" ? (p) => p.r ?? 0 : 5, ...(c.tipo === "burbujas" ? { rScale: radio } : {}) })],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { ...etiquetaEje(c.ejeX, colX), ticks: { format: fmtEje } } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { ...etiquetaEje(c.ejeY, colY), ticks: { format: fmtEje } } },
      },
      tooltip,
    });
  }, [tabla, c]);
  return <Chart definition={definicion} height={altura} ariaLabel={ariaLabel} ariaDescription={ariaDescription} />;
}

/* ---------- mapa de calor ------------------------------------------------------------------ */

function Calor({ tabla, config: c, ariaLabel, ariaDescription, altura }: Interno) {
  const definicion = useMemo(() => {
    const { celdas, columnas, filas } = datosCalor(tabla, c);
    const v = celdas.map((x) => x.valor);
    const min = c.min ?? Math.min(...v);
    const max = c.max ?? Math.max(...v);
    // Ocho tonos entre el mínimo y el máximo: el color de cada celda sale de una escala categórica fija.
    const PASOS = 8;
    const paso = (valor: number) => (max > min ? Math.max(0, Math.min(PASOS - 1, Math.round(((valor - min) / (max - min)) * (PASOS - 1)))) : 0);
    const tono = (p: number) => colorCalorGrafica(p, 0, PASOS - 1);
    const conPaso = celdas.map((x) => ({ ...x, paso: paso(x.valor) }));
    return defineChart({
      marks: [
        cell(conPaso, { x: "columna", y: "fila", key: "id", color: "paso", inset: 1 }),
        text(conPaso, { id: "valores-calor", x: "columna", y: "fila", key: "id", text: (d) => fmt(d.valor), fill: (d) => tintaSobre(tono(d.paso)), fontWeight: 600 }),
      ],
      color: { domain: Array.from({ length: PASOS }, (_, i) => i), range: Array.from({ length: PASOS }, (_, i) => tono(i)) },
      scales: {
        x: { scale: () => scaleBand<string>().domain(columnas).padding(0.04), axis: { label: c.ejeX.trim() || (tabla.columnas.find((k) => k.clave === c.x)?.etiqueta ?? "") } },
        y: { scale: () => scaleBand<string>().domain(filas).padding(0.04), axis: { label: c.ejeY.trim() || (tabla.columnas.find((k) => k.clave === c.filaCalor)?.etiqueta ?? "") } },
      },
      tooltip,
    });
  }, [tabla, c]);
  return <Chart definition={definicion} height={Math.max(altura, 120 + datosCalor(tabla, c).filas.length * 34)} ariaLabel={ariaLabel} ariaDescription={ariaDescription} />;
}

/* ---------- torta y dona ------------------------------------------------------------------- */

function Porciones({ tabla, config: c, ariaLabel, ariaDescription, altura }: Interno) {
  const { definicion, total } = useMemo(() => {
    const { porciones, total: suma } = datosPorciones(tabla, c);
    const tajadas = pie(porciones, { value: "valor" });
    const dona = c.tipo === "dona";
    return {
      total: suma,
      definicion: defineChart({
        marks: [polar({ inset: 8, radiusRatio: 0.9, marks: [radialArc(tajadas, { innerRadius: ({ radius }) => (dona ? radius * 0.58 : 0), cornerRadius: 3, color: "nombre", key: "id" })], scales: { angle: null, radius: null } })],
        scales: { x: null, y: null },
        color: { domain: porciones.map((p) => p.nombre), range: porciones.map((p) => colorDe(p.color)), legend: colorLegend() },
        tooltip,
      }),
    };
  }, [tabla, c]);
  return (
    <div className="ud-dona">
      <Chart definition={definicion} height={altura} ariaLabel={ariaLabel} ariaDescription={ariaDescription} />
      {c.tipo === "dona" ? (
        <div className="ud-dona__centro" aria-hidden="true">
          <b>{fmt(total)}</b>
          <span>Total</span>
        </div>
      ) : null}
    </div>
  );
}

/** Para las tarjetas de la galería y la leyenda de colores. */
export const PALETA_VISIBLE = PALETA;
