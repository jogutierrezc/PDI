/* Warehouse UDES · Tablero: qué hay guardado por periodo y sede, y qué falta.
   Línea de tiempo de periodos, matriz con cinco estados y la lista «Requiere atención». */

import { useMemo, useState } from "react";
import { CORTES, HECHOS, cargable, conjuntoPorId, SISTEMAS, type Conjunto } from "./conjuntos";
import { useCargas, type Cobertura } from "./store";
import type { Contexto } from "./Warehouse";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

type Estado = "ok" | "parcial" | "error" | "vacio" | "na";
const ESTADO: Record<Estado, { texto: string; glifo: string }> = {
  ok: { texto: "Guardado", glifo: "✓" },
  parcial: { texto: "Cortes parciales", glifo: "" },
  error: { texto: "La carga falló", glifo: "!" },
  vacio: { texto: "Sin cargar", glifo: "·" },
  na: { texto: "Todavía no se puede cargar", glifo: "–" },
};

/** Cuántos cortes tiene un conjunto por periodo (1 si no es por corte). */
const esperados = (c: Conjunto) => (c.porCorte ? CORTES.length : 1);

export function Tablero({ ctx, cobertura, periodos }: { ctx: Contexto; cobertura: Cobertura[]; periodos: string[] }) {
  const { periodo, sede } = ctx;
  const [celda, setCelda] = useState<{ conjunto: string; periodo: string } | null>(null);
  const cargas = useCargas(500);

  const porClave = useMemo(() => {
    const m = new Map<string, Cobertura[]>();
    for (const c of cobertura) {
      if (c.sede !== sede) continue;
      const k = `${c.conjunto}|${c.periodo}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [cobertura, sede]);

  // La última carga fallida de cada conjunto y periodo: solo cuenta si no hay nada vigente.
  const errores = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cargas.data ?? []) if (c.sede === sede && c.estado === "error" && !m.has(`${c.conjunto}|${c.periodo}`)) m.set(`${c.conjunto}|${c.periodo}`, c.error || "La plataforma no entregó el reporte.");
    return m;
  }, [cargas.data, sede]);

  const estadoDe = (c: Conjunto, p: string): Estado => {
    if (!cargable(c)) return "na";
    const filas = porClave.get(`${c.id}|${p}`) ?? [];
    if (filas.length === 0) return errores.has(`${c.id}|${p}`) ? "error" : "vacio";
    return c.porCorte && filas.length < esperados(c) ? "parcial" : "ok";
  };

  const cargables = HECHOS.filter(cargable);
  const guardadosEn = (p: string) => cargables.filter((c) => estadoDe(c, p) === "ok").length;
  const cerrado = (p: string) => cobertura.some((c) => c.periodo === p && c.periodo_estado === "cerrado");

  const linea = [...periodos].slice(0, 8).reverse();
  const columnas = periodos.slice(0, 8);

  const filasPeriodo = cobertura.filter((c) => c.periodo === periodo && c.sede === sede);
  const totalFilas = filasPeriodo.reduce((s, c) => s + c.filas, 0);
  const fallidas = cargables.filter((c) => estadoDe(c, periodo) === "error").length;

  const atencion = cargables
    .map((c) => ({ c, e: estadoDe(c, periodo) }))
    .filter((x) => x.e === "error" || x.e === "parcial" || x.e === "vacio")
    .sort((a, b) => ["error", "parcial", "vacio"].indexOf(a.e) - ["error", "parcial", "vacio"].indexOf(b.e));
  const detalleAtencion = (c: Conjunto, e: Estado) =>
    e === "error"
      ? (errores.get(`${c.id}|${periodo}`) ?? "")
      : e === "parcial"
        ? `Hay ${(porClave.get(`${c.id}|${periodo}`) ?? []).length} de ${esperados(c)} cortes. Master solo entrega el periodo abierto: cada corte se carga cuando ocurre.`
        : cerrado(periodo)
          ? "Periodo cerrado sin este reporte."
          : "Todavía no se ha traído en este periodo.";

  const seleccion = celda ? (porClave.get(`${celda.conjunto}|${celda.periodo}`) ?? []) : [];
  const seleccionado = celda ? conjuntoPorId(celda.conjunto) : undefined;

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-linea">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-linea">Periodos</h2>
            <p className="wh-muted">Cuánto de lo cargable hay guardado en cada uno. Elija un periodo para verlo abajo.</p>
          </div>
          <span className="wh-etiqueta">{cargables.length} reportes por periodo</span>
        </div>
        <div className="wh-linea" role="group" aria-label="Periodos">
          {linea.map((p) => {
            const n = guardadosEn(p);
            return (
              <button key={p} type="button" className="wh-per" aria-pressed={p === periodo} data-cerrado={cerrado(p)} onClick={() => ctx.ir("tablero", { periodo: p })}>
                <b>{p}</b>
                <i aria-hidden="true">
                  <s style={{ transform: `scaleX(${cargables.length ? n / cargables.length : 0})` }} />
                </i>
                <small>
                  {n} de {cargables.length} · {cerrado(p) ? "cerrado" : "abierto"}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="wh-cifras">
        <div className="wh-cifra">
          <b>{guardadosEn(periodo)}</b>
          <span>
            de {cargables.length} reportes guardados en {periodo}
          </span>
        </div>
        <div className="wh-cifra">
          <b>{totalFilas.toLocaleString("es-CO")}</b>
          <span>filas en {periodo}</span>
        </div>
        <div className="wh-cifra">
          <b>{cerrado(periodo) ? "Cerrado" : "Abierto"}</b>
          <span>{cerrado(periodo) ? "recargar exige un motivo" : "se puede recargar; cada carga es una versión"}</span>
        </div>
        <div className="wh-cifra" data-alerta={fallidas > 0}>
          <b>{fallidas}</b>
          <span>{fallidas === 1 ? "carga con error" : "cargas con error"} en {periodo}</span>
        </div>
      </div>

      <div className="wh-dos">
        <section className="wh-panel" aria-labelledby="wh-matriz">
          <div className="wh-panel__cabeza">
            <h2 id="wh-matriz">Reportes por periodo</h2>
            <span className="wh-muted">Últimos {columnas.length} periodos</span>
          </div>
          <div className="wh-tabla-envuelta">
            <table className="wh-tabla wh-matriz">
              <thead>
                <tr>
                  <th scope="col">Reporte</th>
                  {columnas.map((p) => (
                    <th key={p} scope="col" className="wh-num">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HECHOS.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.nombre}
                      <small className="wh-muted"> · {SISTEMAS[c.sistema].nombre}</small>
                    </th>
                    {columnas.map((p) => {
                      const e = estadoDe(c, p);
                      const n = (porClave.get(`${c.id}|${p}`) ?? []).length;
                      return (
                        <td key={p} className="wh-celda">
                          <button
                            type="button"
                            data-e={e}
                            aria-pressed={celda?.conjunto === c.id && celda.periodo === p}
                            aria-label={`${c.nombre}, ${p}: ${ESTADO[e].texto}`}
                            onClick={() => setCelda({ conjunto: c.id, periodo: p })}
                          >
                            {e === "parcial" || (e === "ok" && c.porCorte) ? `${n}/${esperados(c)}` : ESTADO[e].glifo}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="wh-leyenda-fila wh-leyenda-pie">
            <span>
              <i data-e="ok" /> guardado
            </span>
            <span>
              <i data-e="parcial" /> cortes parciales
            </span>
            <span>
              <i data-e="error" /> la carga falló
            </span>
            <span>
              <i data-e="vacio" /> sin cargar
            </span>
            <span>
              <i data-e="na" /> falta política o captura para poder cargarlo
            </span>
          </p>
        </section>

        <div className="wh-apilados">
          <section className="wh-panel" aria-labelledby="wh-atencion">
            <div className="wh-panel__cabeza">
              <h2 id="wh-atencion">Requiere atención</h2>
              <span className="wh-muted">{periodo}</span>
            </div>
            <div className="wh-panel__cuerpo">
              {atencion.length === 0 ? (
                <p className="wh-muted">Todo lo cargable de este periodo está guardado.</p>
              ) : (
                <ul className="wh-atencion">
                  {atencion.slice(0, 12).map(({ c, e }) => (
                    <li key={c.id}>
                      <div>
                        <span className="wh-etiqueta" data-e={e}>
                          {ESTADO[e].texto}
                        </span>{" "}
                        <b>{c.nombre}</b>
                        <p className="wh-muted">{detalleAtencion(c, e)}</p>
                      </div>
                      <button type="button" className="button-secondary" onClick={() => ctx.ir("cargas", { conjunto: c.id, periodo })}>
                        {e === "error" ? "Reintentar" : "Cargar"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {atencion.length > 12 && <p className="wh-nota-chica">Y {atencion.length - 12} más. Se ven en la matriz.</p>}
            </div>
          </section>

          <aside className="wh-panel" aria-live="polite" aria-label="Detalle de la celda">
            <div className="wh-panel__cabeza">
              <h2>{seleccionado ? seleccionado.nombre : "Detalle"}</h2>
              {celda && <span className="wh-etiqueta">{celda.periodo}</span>}
            </div>
            <div className="wh-panel__cuerpo">
              {!seleccionado ? (
                <p className="wh-muted">Elija una celda de la matriz para ver qué versión hay guardada.</p>
              ) : seleccion.length === 0 ? (
                <div className="wh-pila">
                  <p>No hay nada guardado de este reporte en {celda!.periodo}.</p>
                  {cargable(seleccionado) ? (
                    <div>
                      <button type="button" className="button-primary" onClick={() => ctx.ir("cargas", { conjunto: seleccionado.id, periodo: celda!.periodo })}>
                        Ir a cargarlo
                      </button>
                    </div>
                  ) : (
                    <p className="wh-aviso wh-aviso--ambar">{seleccionado.nota ?? seleccionado.privacidad}</p>
                  )}
                </div>
              ) : (
                <table className="wh-tabla">
                  <thead>
                    <tr>
                      {seleccionado.porCorte && <th scope="col">Corte</th>}
                      <th scope="col">Versión</th>
                      <th scope="col">Filas</th>
                      <th scope="col">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...seleccion]
                      .sort((a, b) => a.corte.localeCompare(b.corte))
                      .map((c) => (
                        <tr key={c.corte}>
                          {seleccionado.porCorte && <td>{CORTES.find((x) => x.id === c.corte)?.nombre ?? "—"}</td>}
                          <td>
                            v{c.version}
                            {c.versiones > 1 && <small className="wh-muted"> ({c.versiones} en total)</small>}
                          </td>
                          <td className="wh-num">{c.filas.toLocaleString("es-CO")}</td>
                          <td>
                            {fecha(c.terminada_en)}
                            <small className="wh-muted"> · {c.origen === "servidor" ? "desde la plataforma" : "archivo"}</small>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {seleccionado && seleccion.length > 0 && (
                <div className="wh-fila wh-sep">
                  <button type="button" className="button-secondary" onClick={() => ctx.ir("explorar", { conjunto: seleccionado.id, periodo: celda!.periodo })}>
                    Explorar
                  </button>
                  <button type="button" className="button-secondary" onClick={() => ctx.ir("cargas", { conjunto: seleccionado.id, periodo: celda!.periodo })}>
                    Recargar
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
