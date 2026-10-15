/* Warehouse UDES · Tablero: la estantería de periodos y la matriz conjunto × periodo. */

import { useMemo, useState } from "react";
import { CONJUNTOS, CORTES, HECHOS, cargable, conjuntoPorId, SISTEMAS, type Conjunto } from "./conjuntos";
import type { Cobertura } from "./store";
import type { Contexto } from "./Warehouse";

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Cuántos cortes tiene un conjunto por periodo (1 si no es por corte). */
const esperados = (c: Conjunto) => (c.porCorte ? CORTES.length : 1);

export function Tablero({ ctx, cobertura, periodos }: { ctx: Contexto; cobertura: Cobertura[]; periodos: string[] }) {
  const { periodo, sede } = ctx;
  const [celda, setCelda] = useState<{ conjunto: string; periodo: string } | null>(null);

  const porClave = useMemo(() => {
    const m = new Map<string, Cobertura[]>();
    for (const c of cobertura) {
      if (c.sede !== sede) continue;
      const k = `${c.conjunto}|${c.periodo}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [cobertura, sede]);

  const cargables = HECHOS.filter(cargable);
  const guardadosEn = (p: string) => cargables.filter((c) => (porClave.get(`${c.id}|${p}`)?.length ?? 0) > 0).length;
  const cerrado = (p: string) => cobertura.some((c) => c.periodo === p && c.periodo_estado === "cerrado");

  const estante = [...periodos].reverse();
  const columnas = periodos.slice(0, 10);

  const filasPeriodo = cobertura.filter((c) => c.periodo === periodo && c.sede === sede);
  const totalFilas = filasPeriodo.reduce((s, c) => s + c.filas, 0);
  const seleccion = celda ? porClave.get(`${celda.conjunto}|${celda.periodo}`) ?? [] : [];
  const seleccionado = celda ? conjuntoPorId(celda.conjunto) : undefined;

  return (
    <>
      <section className="wh-panel" aria-labelledby="wh-estante">
        <div className="wh-panel__cabeza">
          <div>
            <h2 id="wh-estante">Periodos guardados</h2>
            <p className="wh-muted">Cada bahía es un periodo; su altura es cuántos reportes cargables tiene guardados. Azul oscuro: periodo cerrado.</p>
          </div>
          <span className="wh-etiqueta">{cargables.length} reportes por periodo</span>
        </div>
        <div className="wh-estante" role="group" aria-label="Periodos">
          {estante.map((p) => {
            const n = guardadosEn(p);
            return (
              <button
                key={p}
                type="button"
                className="wh-bahia"
                aria-pressed={p === periodo}
                data-cerrado={cerrado(p)}
                title={`${p}: ${n} de ${cargables.length} guardados`}
                onClick={() => ctx.ir("tablero", { periodo: p })}
              >
                <span className="wh-bahia__caja">
                  <i style={{ height: `${n ? Math.max(6, (100 * n) / cargables.length) : 0}%` }} />
                </span>
                {p.slice(2)}
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
                      const filas = porClave.get(`${c.id}|${p}`) ?? [];
                      const estado = filas.length === 0 ? "vacio" : cerrado(p) ? "cerrado" : "ok";
                      return (
                        <td key={p} className="wh-celda">
                          <button
                            type="button"
                            data-e={estado}
                            aria-label={`${c.nombre}, ${p}: ${filas.length ? `${filas.length} de ${esperados(c)} guardado` : cargable(c) ? "sin cargar" : "no se puede cargar todavía"}`}
                            onClick={() => setCelda({ conjunto: c.id, periodo: p })}
                          >
                            {filas.length ? (c.porCorte ? `${filas.length}/${esperados(c)}` : "✓") : cargable(c) ? "·" : "–"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="wh-nota-chica" style={{ padding: "0 var(--space-5) var(--space-4)" }}>
            ✓ guardado · 2/4 cortes guardados · · sin cargar · – falta política o HAR para poder cargarlo
          </p>
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
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
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
              <div className="wh-fila" style={{ marginTop: "var(--space-4)" }}>
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

      <p className="wh-muted">
        Hay {CONJUNTOS.length - HECHOS.length} catálogos e instantáneas más (programas, aulas, cursos, docentes…) que no dependen de un periodo; se ven en el Catálogo.
      </p>
    </>
  );
}
