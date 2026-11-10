/* Warehouse UDES · Explorar: gráficos y tabla de lo guardado.

   Todo el cálculo lo hace la base (0269: wh_perfilar, wh_explorar, wh_filas_pagina, wh_dispersion).
   El navegador recibe grupos ya agregados y páginas de 100 filas, nunca la carga entera. Los tipos de
   las columnas salen del perfil, no se adivinan aquí. Periodo, sede y conjunto viajan en la dirección. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Barras, Dispersion, Lineas, MapaCalor } from "./graficos";
import { CORTES, SEDES, conjuntoPorId } from "./conjuntos";
import { filasACsv, mensajeDe, useDispersion, useExplorar, useFilasPagina, usePerfil, useSerieExplorar, type Cobertura, type ColumnaPerfil, type Filtro, type Medida, type Operacion } from "./store";
import type { Contexto } from "./Warehouse";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";

type Grafico = "barras" | "lineas" | "calor" | "dispersion";
const GRAFICOS: { id: Grafico; nombre: string }[] = [
  { id: "barras", nombre: "Barras" },
  { id: "lineas", nombre: "Líneas por periodo" },
  { id: "calor", nombre: "Mapa de calor" },
  { id: "dispersion", nombre: "Dispersión" },
];

const num = (n: number, d = 0) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const etiqueta = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const PASO = 100;

interface OpcionMedida {
  valor: string;
  texto: string;
  medida: Medida;
}

/** Las medidas que se pueden pedir según el perfil: filas, sumas y promedios de columnas numéricas, y distintos de las demás. */
function opcionesDeMedida(cols: ColumnaPerfil[]): OpcionMedida[] {
  const lista: OpcionMedida[] = [{ valor: "contar", texto: "Cantidad de filas", medida: { op: "contar" } }];
  const nombres: Record<string, string> = { sumar: "Suma de", promediar: "Promedio de", mediana: "Mediana de" };
  for (const c of cols.filter((x) => x.tipo === "numero" && !x.personal))
    for (const op of ["sumar", "promediar", "mediana"] as Operacion[]) lista.push({ valor: `${op}:${c.col}`, texto: `${nombres[op]} ${etiqueta(c.col).toLowerCase()}`, medida: { op, col: c.col } });
  for (const c of cols.filter((x) => (x.tipo === "categoria" || x.tipo === "texto") && x.llenos > 0).slice(0, 14))
    lista.push({ valor: `distintos:${c.col}`, texto: `Distintos de ${etiqueta(c.col).toLowerCase()}`, medida: { op: "distintos", col: c.col } });
  return lista;
}

export function Explorar({ ctx, cobertura }: { ctx: Contexto; cobertura: Cobertura[] }) {
  const { periodo, sede } = ctx;
  const [params, setParams] = useSearchParams();
  const disponibles = useMemo(() => {
    const ids = [...new Set(cobertura.filter((c) => c.sede === sede && c.periodo === periodo).map((c) => c.conjunto))];
    return ids.map((id) => conjuntoPorId(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [cobertura, sede, periodo]);
  const conjunto = disponibles.find((c) => c.id === params.get("conjunto")) ?? disponibles[0];
  const cortes = cobertura.filter((c) => conjunto && c.conjunto === conjunto.id && c.sede === sede && c.periodo === periodo).map((c) => c.corte).sort();
  const [corteElegido, setCorteElegido] = useState("");
  const corte = cortes.includes(corteElegido) ? corteElegido : (cortes[0] ?? "");
  const carga = conjunto ? cobertura.find((c) => c.conjunto === conjunto.id && c.sede === sede && c.periodo === periodo && c.corte === corte) : undefined;
  // Las cargas del mismo conjunto, sede y corte en otros periodos: de ahí salen las líneas.
  const serie = useMemo(
    () => cobertura.filter((c) => conjunto && c.conjunto === conjunto.id && c.sede === sede && c.corte === corte).sort((a, b) => a.periodo.localeCompare(b.periodo)).map((c) => ({ periodo: c.periodo, id: c.id })),
    [cobertura, conjunto, sede, corte],
  );

  if (!conjunto || !carga)
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

  const elegirConjunto = (id: string) => {
    const siguiente = new URLSearchParams(params);
    siguiente.set("conjunto", id);
    setParams(siguiente, { replace: true });
  };

  return (
    <ExplorarCarga
      key={carga.id}
      ctx={ctx}
      carga={carga}
      nombre={conjunto.nombre}
      serie={serie}
      selectores={
        <div className="wh-fila">
          <label className="wh-campo">
            <span>Reporte</span>
            <select value={conjunto.id} onChange={(e) => elegirConjunto(e.target.value)}>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          {cortes.length > 0 && cortes[0] !== "" && (
            <label className="wh-campo">
              <span>Corte</span>
              <select value={corte} onChange={(e) => setCorteElegido(e.target.value)}>
                {cortes.map((c) => (
                  <option key={c} value={c}>
                    {CORTES.find((x) => x.id === c)?.nombre ?? c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      }
    />
  );
}

function ExplorarCarga({ ctx, carga, nombre, serie, selectores }: { ctx: Contexto; carga: Cobertura; nombre: string; serie: { periodo: string; id: string }[]; selectores: React.ReactNode }) {
  const perfil = usePerfil(carga.id);
  const cols = useMemo(() => perfil.data?.columnas ?? [], [perfil.data]);
  const dims = useMemo(
    () => cols.filter((c) => !c.personal && c.llenos > 0 && (c.tipo === "categoria" || c.tipo === "texto" || (c.tipo === "numero" && c.distintos <= 12))),
    [cols],
  );
  const nums = useMemo(() => cols.filter((c) => c.tipo === "numero" && !c.personal), [cols]);
  const medidas = useMemo(() => opcionesDeMedida(cols), [cols]);

  const [grafico, setGrafico] = useState<Grafico>("barras");
  const [por, setPor] = useState("");
  const [por2, setPor2] = useState("");
  const [medidaV, setMedidaV] = useState("contar");
  const [ejeX, setEjeX] = useState("");
  const [ejeY, setEjeY] = useState("");
  const [todas, setTodas] = useState(false);
  const [filtros, setFiltros] = useState<Filtro[]>([]);

  const colPor = dims.find((c) => c.col === por)?.col ?? dims[0]?.col ?? "";
  const colPor2 = dims.find((c) => c.col === por2 && c.col !== colPor)?.col ?? dims.find((c) => c.col !== colPor)?.col ?? "";
  const colX = nums.find((c) => c.col === ejeX)?.col ?? nums[0]?.col ?? "";
  const colY = nums.find((c) => c.col === ejeY && c.col !== colX)?.col ?? nums.find((c) => c.col !== colX)?.col ?? "";
  const opcion = medidas.find((m) => m.valor === medidaV) ?? medidas[0];
  const medida = opcion?.medida ?? { op: "contar" as const };
  const decimales = medida.op === "promediar" || medida.op === "mediana" ? 2 : 0;

  const disponible: Record<Grafico, string | null> = {
    barras: dims.length ? null : "Este reporte no tiene una columna para agrupar.",
    lineas: serie.length >= 2 ? null : "Se necesitan al menos dos periodos guardados de este reporte.",
    calor: dims.length >= 2 ? null : "Se necesitan dos columnas para cruzar.",
    dispersion: nums.length >= 2 ? null : "Se necesitan dos columnas numéricas.",
  };
  const activo = disponible[grafico] ? "barras" : grafico;

  const barras = useExplorar(carga.id, [colPor], [medida], filtros, activo === "barras" && Boolean(colPor));
  const calor = useExplorar(carga.id, [colPor, colPor2], [medida], filtros, activo === "calor" && Boolean(colPor2));
  const lineas = useSerieExplorar(serie, colPor && activo === "lineas" ? [colPor] : [], [medida], filtros, activo === "lineas");
  const puntos = useDispersion(carga.id, colX, colY, filtros, activo === "dispersion");
  const consulta = { barras, calor, lineas, dispersion: puntos }[activo];

  const filtrarPor = (col: string, val: string) => setFiltros((f) => (f.some((x) => x.col === col && x.val === val) ? f : [...f, { col, op: "eq", val }]));

  let grafica: React.ReactNode = null;
  if (activo === "barras" && barras.data) {
    const todos = barras.data.filas.map((r) => ({ etiqueta: r.k[0] ?? "(vacío)", valor: r.v[0] ?? 0 }));
    const lista = todas ? todos : todos.slice(0, 14);
    grafica = (
      <>
        <div className="wh-barras-caja" data-larga={todas}>
          <Barras datos={lista} decimales={decimales} titulo={`${opcion?.texto} por ${etiqueta(colPor)}`} />
        </div>
        <div className="wh-fila wh-entre">
          <span className="wh-muted">
            {num(barras.data.grupos)} {etiqueta(colPor).toLowerCase()}
            {todos.length > 14 && !todas ? " · se muestran las 14 mayores" : ""}
          </span>
          <span className="wh-fila">
            <label className="wh-campo">
              <span>Dejar solo</span>
              <select value="" onChange={(e) => e.target.value && filtrarPor(colPor, e.target.value)}>
                <option value="">Elegir…</option>
                {todos.slice(0, 200).map((b) => (
                  <option key={b.etiqueta} value={b.etiqueta}>
                    {b.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {todos.length > 14 && (
              <button type="button" className="button-secondary" onClick={() => setTodas((v) => !v)}>
                {todas ? "Ver solo las 14 mayores" : `Ver las ${num(todos.length)}`}
              </button>
            )}
          </span>
        </div>
      </>
    );
  } else if (activo === "lineas" && lineas.data) {
    const periodos = lineas.data.map((p) => p.periodo);
    const claves = new Map<string, number>();
    for (const p of lineas.data) for (const r of p.r.filas) claves.set(r.k[0] ?? "(todas)", (claves.get(r.k[0] ?? "(todas)") ?? 0) + Math.abs(r.v[0] ?? 0));
    const top = [...claves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const series = (colPor ? top : ["(todas)"]).map((k) => ({ nombre: k === "(todas)" ? opcion?.texto ?? "" : k, valores: lineas.data.map((p) => p.r.filas.find((r) => (r.k[0] ?? "(todas)") === k)?.v[0] ?? null) }));
    grafica = <Lineas categorias={periodos} series={series} titulo={`${opcion?.texto} por periodo`} decimales={decimales} />;
  } else if (activo === "calor" && calor.data) {
    const suma = (clave: (k: (string | null)[]) => string) => {
      const m = new Map<string, number>();
      for (const r of calor.data.filas) m.set(clave(r.k), (m.get(clave(r.k)) ?? 0) + Math.abs(r.v[0] ?? 0));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const filasTop = suma((k) => k[0] ?? "(vacío)").slice(0, 12).map(([k]) => k);
    const colsTop = suma((k) => k[1] ?? "(vacío)").slice(0, 8).map(([k]) => k);
    const val = new Map(calor.data.filas.map((r) => [`${r.k[0] ?? "(vacío)"}\u0000${r.k[1] ?? "(vacío)"}`, r.v[0]]));
    grafica = <MapaCalor filas={filasTop} columnas={colsTop} valores={filasTop.map((a) => colsTop.map((b) => val.get(`${a}\u0000${b}`) ?? null))} titulo={`${etiqueta(colPor)} por ${etiqueta(colPor2)}`} decimales={decimales} />;
  } else if (activo === "dispersion" && puntos.data) {
    grafica = <DispersionBase r={puntos.data} ejeX={etiqueta(colX)} ejeY={etiqueta(colY)} />;
  }

  const resultado = consulta.data;
  const ocultos = resultado && "descartados" in resultado ? resultado.descartados : 0;
  const reservado = Boolean(resultado && "reservado" in resultado && resultado.reservado);

  if (perfil.isPending) return <LoadingBlock rows={4} label="Leyendo las columnas" />;
  if (perfil.error) return <ErrorBlock error={perfil.error} title="No se pudo perfilar este reporte" onRetry={() => void perfil.refetch()} />;

  const selectDe = (id: string, titulo: string, valor: string, opciones: { v: string; t: string }[], cambiar: (v: string) => void) => (
    <label className="wh-campo" key={id}>
      <span>{titulo}</span>
      <select value={valor} onChange={(e) => cambiar(e.target.value)}>
        {opciones.map((o) => (
          <option key={o.v} value={o.v}>
            {o.t}
          </option>
        ))}
      </select>
    </label>
  );
  const dimOpciones = dims.map((c) => ({ v: c.col, t: etiqueta(c.col) }));
  const numOpciones = nums.map((c) => ({ v: c.col, t: etiqueta(c.col) }));

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-grafica">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-grafica">{nombre}</h2>
            <p className="wh-muted">
              {num(carga.filas)} filas · versión {carga.version} · {SEDES.find((s) => s.id === ctx.sede)?.nombre} · {ctx.periodo}
            </p>
          </div>
          {selectores}
        </div>

        <div className="wh-panel__cabeza" role="group" aria-label="Tipo de gráfico">
          <div className="wh-fila">
            {GRAFICOS.map((g) => (
              <button key={g.id} type="button" className="wh-chip" aria-pressed={activo === g.id} disabled={Boolean(disponible[g.id])} title={disponible[g.id] ?? undefined} onClick={() => setGrafico(g.id)}>
                {g.nombre}
              </button>
            ))}
          </div>
          <div className="wh-fila">
            {(activo === "barras" || activo === "calor" || activo === "lineas") && selectDe("por", activo === "calor" ? "Filas" : activo === "lineas" ? "Una línea por" : "Agrupar por", colPor, dimOpciones, setPor)}
            {activo === "calor" && selectDe("por2", "Columnas", colPor2, dimOpciones.filter((o) => o.v !== colPor), setPor2)}
            {activo !== "dispersion" && selectDe("medida", "Medir", opcion?.valor ?? "contar", medidas.map((m) => ({ v: m.valor, t: m.texto })), setMedidaV)}
            {activo === "dispersion" && (
              <>
                {selectDe("x", "Eje X", colX, numOpciones, setEjeX)}
                {selectDe("y", "Eje Y", colY, numOpciones.filter((o) => o.v !== colX), setEjeY)}
              </>
            )}
          </div>
        </div>

        {filtros.length > 0 && (
          <div className="wh-panel__cabeza wh-fila" aria-label="Filtros activos">
            {filtros.map((f) => (
              <button key={`${f.col}${String(f.val)}`} type="button" className="wh-chip" aria-pressed="true" onClick={() => setFiltros((x) => x.filter((y) => y !== f))} title="Quitar este filtro">
                {etiqueta(f.col)}: {String(f.val)} ×
              </button>
            ))}
          </div>
        )}

        <div className="wh-panel__cuerpo">
          {consulta.isPending && consulta.fetchStatus !== "idle" ? <LoadingBlock rows={4} label="Calculando en la base" /> : consulta.error ? <ErrorBlock error={consulta.error} onRetry={() => void consulta.refetch()} /> : grafica}
          {reservado && ocultos > 0 && (
            <p className="wh-aviso wh-aviso--ambar">
              Se ocultaron {num(ocultos)} grupos con menos de 5 personas distintas. La base no entrega grupos tan pequeños de una columna con dato personal.
            </p>
          )}
        </div>
      </section>

      <TablaFilas carga={carga} cols={cols} filtros={filtros} nombre={`${carga.conjunto}-${carga.periodo}-${carga.sede}${carga.corte ? `-c${carga.corte}` : ""}`} />
    </>
  );
}

/** Puntos hasta 5.000; más allá, la base entrega celdas con su conteo y aquí se dibujan como rejilla. */
function DispersionBase({ r, ejeX, ejeY }: { r: NonNullable<ReturnType<typeof useDispersion>["data"]>; ejeX: string; ejeY: string }) {
  if (r.modo === "puntos") {
    if (r.puntos.length === 0) return <p className="wh-muted">Esas columnas no tienen valores numéricos en común.</p>;
    return <Dispersion puntos={r.puntos.map(([x, y]) => ({ x, y, etiqueta: "" }))} ejeX={ejeX} ejeY={ejeY} titulo={`${ejeX} contra ${ejeY}`} />;
  }
  const lado = 560 / r.celdas;
  const max = Math.max(1, ...r.datos.map((d) => d[2]));
  return (
    <div>
      <svg viewBox="0 0 600 600" role="img" aria-label={`${ejeX} contra ${ejeY}, ${num(r.total)} puntos en celdas`} className="wh-svg">
        <title>{`${ejeX} contra ${ejeY}`}</title>
        {r.datos.map(([cx, cy, n]) => (
          <rect key={`${cx}-${cy}`} x={30 + cx * lado} y={10 + (r.celdas - 1 - cy) * lado} width={lado} height={lado} className="wh-celda-punto" style={{ fillOpacity: 0.12 + 0.88 * (n / max) }}>
            <title>{num(n)} filas</title>
          </rect>
        ))}
        <text x="30" y="592" className="wh-ct">
          {ejeX}: {num(r.xmin, 1)} a {num(r.xmax, 1)}
        </text>
        <text x="30" y="8" className="wh-ct">
          {ejeY}: {num(r.ymin, 1)} a {num(r.ymax, 1)}
        </text>
      </svg>
      <p className="wh-muted">
        Son {num(r.total)} puntos: pasan de 5.000, así que la base los junta en celdas. Cuanto más oscura, más filas.
      </p>
    </div>
  );
}

function TablaFilas({ carga, cols, filtros, nombre }: { carga: Cobertura; cols: ColumnaPerfil[]; filtros: Filtro[]; nombre: string }) {
  const [entrada, setEntrada] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<string | null>(null);
  const [desde, setDesde] = useState(0);
  const [completo, setCompleto] = useState(false);
  const [ficha, setFicha] = useState<Record<string, string | number | boolean | null> | null>(null);
  const [csv, setCsv] = useState<{ hechas: number; total: number } | string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  // La búsqueda va a la base con un respiro: no una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(entrada.trim());
      setDesde(0);
    }, 300);
    return () => clearTimeout(t);
  }, [entrada]);
  useEffect(() => setDesde(0), [filtros]);
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (ficha && !d.open) d.showModal();
    if (!ficha && d.open) d.close();
  }, [ficha]);

  const pagina = useFilasPagina(carga.id, desde, orden, filtros, busqueda);
  const total = pagina.data?.total ?? 0;
  const nombres = cols.map((c) => c.col);
  const esNum = (c: string) => cols.find((x) => x.col === c)?.tipo === "numero";
  const ordenar = (c: string) => {
    setOrden(orden === `${c}:asc` ? `${c}:desc` : `${c}:asc`);
    setDesde(0);
  };

  const descargar = async () => {
    setCsv({ hechas: 0, total });
    try {
      const texto = await filasACsv(carga.id, nombres, orden, filtros, busqueda, (hechas, t) => setCsv({ hechas, total: t }));
      const url = URL.createObjectURL(new Blob(["﻿", texto], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombre}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setCsv(`${num(total)} filas descargadas.`);
    } catch (e) {
      setCsv(mensajeDe(e));
    }
  };

  return (
    <section className="wh-panel" aria-label={`Filas de ${nombre}`}>
      <div className="wh-panel__cabeza">
        <h2>{num(total)} filas</h2>
        <div className="wh-fila">
          <label className="wh-campo">
            <span className="sr-only">Buscar en las filas</span>
            <input value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="Buscar en todas las columnas…" />
          </label>
          <label className="wh-casilla">
            <input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} /> Texto completo
          </label>
          <button type="button" className="button-secondary" onClick={() => void descargar()} disabled={typeof csv === "object" && csv !== null}>
            Descargar CSV
          </button>
        </div>
      </div>
      {csv && (
        <p className="wh-nota-chica wh-nota-barra" role="status">
          {typeof csv === "string" ? csv : `Preparando el CSV: ${num(csv.hechas)} de ${num(csv.total)} filas…`}
        </p>
      )}
      {pagina.error ? (
        <div className="wh-panel__cuerpo">
          <ErrorBlock error={pagina.error} onRetry={() => void pagina.refetch()} />
        </div>
      ) : (
        <div className="wh-tabla-envuelta wh-tabla-datos" data-completo={completo} aria-busy={pagina.isFetching}>
          <table className="wh-tabla">
            <thead>
              <tr>
                {nombres.map((c) => (
                  <th key={c} scope="col" aria-sort={orden?.startsWith(`${c}:`) ? (orden.endsWith("asc") ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => ordenar(c)}>
                      {etiqueta(c)}
                      {orden?.startsWith(`${c}:`) ? (orden.endsWith("asc") ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pagina.data?.filas ?? []).map((f, i) => (
                <tr key={`${desde}-${i}`} tabIndex={0} onClick={() => setFicha(f)} onKeyDown={(e) => e.key === "Enter" && setFicha(f)}>
                  {nombres.map((c) => (
                    <td key={c} className={esNum(c) ? "wh-num" : undefined} title={String(f[c] ?? "")}>
                      {String(f[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pagina.isPending && <LoadingBlock rows={3} label="Leyendo las filas" />}
        </div>
      )}
      <div className="wh-panel__cabeza">
        <span className="wh-muted">
          {total === 0 ? "Sin filas" : `Filas ${num(desde + 1)} a ${num(Math.min(desde + PASO, total))} de ${num(total)}`}
        </span>
        <div className="wh-fila">
          <button type="button" className="button-secondary" disabled={desde === 0} onClick={() => setDesde(Math.max(0, desde - PASO))}>
            Anterior
          </button>
          <button type="button" className="button-secondary" disabled={desde + PASO >= total} onClick={() => setDesde(desde + PASO)}>
            Siguiente
          </button>
        </div>
      </div>

      <dialog ref={dialogo} className="wh-ficha" onClose={() => setFicha(null)} aria-label="Ficha de la fila">
        {ficha && (
          <>
            <div className="wh-panel__cabeza">
              <h2>Ficha de la fila</h2>
              <button type="button" className="button-secondary" onClick={() => setFicha(null)}>
                Cerrar
              </button>
            </div>
            <dl className="wh-ficha__lista">
              {nombres.map((c) => (
                <div key={c}>
                  <dt>{etiqueta(c)}</dt>
                  <dd>{String(ficha[c] ?? "") || "—"}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </dialog>
    </section>
  );
}
