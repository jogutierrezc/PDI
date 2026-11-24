/* =============================================================================
   UI GreenMetric · inicio del ciclo: avance global y por categoría, estados,
   vencimientos y quién tiene pendientes. La estimación de puntos es interna
   y solo la ve la administración.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCalculados } from "../datos";
import { estimarAvance, formatearNumero } from "../lib/calculo";
import { ESTADOS, ETIQUETA_ESTADO } from "../lib/estados";
import type { CategoriaId, EstadoRespuesta } from "../lib/tipos";
import { Alerta, Anillo, Barra, Estado, Vacio, crecerMedidores, fechaCorta, llenarAnillos, textoVence, diasHasta } from "./comunes";
import { useUgm } from "./contexto";

const EN_CURSO: EstadoRespuesta[] = ["asignado", "en_captura", "enviado", "en_revision", "devuelto"];

export function Inicio() {
  const u = useUgm();
  const [cat, setCat] = useState<CategoriaId | "">("");
  const [persona, setPersona] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  const responsable = useMemo(() => new Map(u.asignaciones.filter((a) => a.rol === "responsable" && a.q).map((a) => [a.q as string, a])), [u.asignaciones]);
  const personas = useMemo(() => [...new Set([...responsable.values()].map((a) => a.usuario_id))], [responsable]);

  const filas = useMemo(
    () =>
      u.respuestas
        .filter((r) => {
          const p = u.pregQ.get(r.q);
          if (!p || (cat && p.categoria !== cat)) return false;
          return !persona || responsable.get(r.q)?.usuario_id === persona;
        })
        .map((r) => ({ r, p: u.pregQ.get(r.q)!, a: responsable.get(r.q) })),
    [u.respuestas, u.pregQ, cat, persona, responsable],
  );

  const conteo = useMemo(() => {
    const c = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoRespuesta, number>;
    for (const f of filas) c[f.r.estado] += 1;
    return c;
  }, [filas]);
  const total = filas.length;
  const aprobados = conteo.aprobado;
  const pct = total ? (aprobados / total) * 100 : 0;
  const sinResp = filas.filter((f) => !f.a).length;

  useEffect(() => {
    const a = crecerMedidores(raiz.current, 0.05);
    const b = llenarAnillos(raiz.current);
    return () => {
      a();
      b();
    };
  }, [cat, persona, u.respuestas.length]);

  const proximos = filas
    .filter((f) => f.r.estado !== "aprobado" && u.vence(f.r.q))
    .sort((a, b) => (u.vence(a.r.q) as string).localeCompare(u.vence(b.r.q) as string))
    .slice(0, 6);

  const pendientes = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) if (f.a && f.r.estado !== "aprobado" && f.r.estado !== "enviado" && f.r.estado !== "en_revision") m.set(f.a.usuario_id, (m.get(f.a.usuario_id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filas]);
  const maxPend = pendientes[0]?.[1] ?? 1;

  return (
    <div ref={raiz} className="ugm-pila">
      <section className="ugm-sec ugm-filtros" aria-label="Filtros del avance">
        <div className="ugm-chips" role="group" aria-label="Categoría">
          <button type="button" className="ugm-chip" aria-pressed={cat === ""} onClick={() => setCat("")}>
            Todas
          </button>
          {u.categorias.map((c) => (
            <button key={c.categoria} type="button" className="ugm-chip" aria-pressed={cat === c.categoria} onClick={() => setCat(cat === c.categoria ? "" : c.categoria)}>
              {c.categoria}
            </button>
          ))}
        </div>
        <label className="ugm-sr" htmlFor="ugm-f-persona">
          Responsable
        </label>
        <select id="ugm-f-persona" className="ugm-input ugm-input--sel ugm-input--sm" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">Todas las personas</option>
          {personas.map((id) => (
            <option key={id} value={id}>
              {u.nombre(id)}
            </option>
          ))}
        </select>
      </section>

      {total === 0 ? (
        <Vacio>No hay indicadores con estos filtros.</Vacio>
      ) : (
        <>
          <section className="ugm-sec ugm-global">
            <Anillo pct={pct} etiqueta="Indicadores aprobados" />
            <div>
              <h2>
                <span className="ugm-num">{aprobados}</span> de <span className="ugm-num">{total}</span> indicadores aprobados
              </h2>
              <p className="ugm-muted">
                {conteo.enviado + conteo.en_revision} esperan revisión · {conteo.devuelto} devueltos · {conteo.sin_asignar} sin asignar
              </p>
              {sinResp > 0 && u.esAdmin && (
                <p className="ugm-aparte">
                  {sinResp} sin responsable.{" "}
                  <button type="button" className="ugm-link" onClick={() => u.ir("asignar")}>
                    Asignar ahora
                  </button>
                </p>
              )}
            </div>
          </section>

          <div className="ugm-cols">
            <section className="ugm-sec">
              <h2>Avance por categoría</h2>
              <ul className="ugm-lista">
                {u.categorias
                  .filter((c) => !cat || c.categoria === cat)
                  .map((c) => {
                    const de = filas.filter((f) => f.p.categoria === c.categoria);
                    const ok = de.filter((f) => f.r.estado === "aprobado").length;
                    const curso = de.filter((f) => EN_CURSO.includes(f.r.estado)).length;
                    const n = de.length || 1;
                    return (
                      <li key={c.categoria} className="ugm-fila-barra">
                        <span>
                          <b className="ugm-cod">{c.categoria}</b> {c.nombre_es}
                        </span>
                        <Barra aprobado={(ok / n) * 100} curso={(curso / n) * 100} etiqueta={`${c.nombre_es}: ${ok} de ${de.length} aprobados`} />
                        <span className="ugm-num ugm-muted">
                          {ok}/{de.length}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              <p className="ugm-leyenda">
                <i className="ugm-pt ugm-pt--ok" /> Aprobado <i className="ugm-pt ugm-pt--curso" /> En trámite
              </p>
            </section>

            <div className="ugm-pila">
              <section className="ugm-sec">
                <h2>Indicadores por estado</h2>
                <ul className="ugm-estados">
                  {ESTADOS.map((e) => (
                    <li key={e}>
                      <button type="button" className="ugm-estado-btn" onClick={() => u.ir(`indicadores&estado=${e}`)}>
                        <Estado estado={e} />
                        <b className="ugm-num">{conteo[e]}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="ugm-sec">
                <h2>Próximos vencimientos</h2>
                {proximos.length ? (
                  <ul className="ugm-lista">
                    {proximos.map(({ r, p, a }) => {
                      const d = diasHasta(u.vence(r.q));
                      return (
                        <li key={r.q}>
                          <button type="button" className="ugm-fila-btn" onClick={() => u.abrir(r.q)}>
                            <span className={`ugm-num ugm-fecha${d !== null && d < 0 ? " ugm-fecha--tarde" : ""}`}>{fechaCorta(u.vence(r.q))}</span>
                            <span>
                              {p.q} · {p.nombre_es}
                              <small>
                                {a ? u.nombre(a.usuario_id) : "Sin responsable"} · {textoVence(u.vence(r.q))}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="ugm-muted">No hay fechas pendientes con estos filtros.</p>
                )}
              </section>
              <section className="ugm-sec">
                <h2>Quién tiene pendientes</h2>
                {pendientes.length ? (
                  <ul className="ugm-lista">
                    {pendientes.map(([id, n]) => {
                      const a = [...responsable.values()].find((x) => x.usuario_id === id);
                      return (
                        <li key={id} className="ugm-fila-barra">
                          <span>
                            {u.nombre(id)}
                            <small>{u.oficina(a?.unidad_id)}</small>
                          </span>
                          <Barra aprobado={0} curso={(n / maxPend) * 100} etiqueta={`${u.nombre(id)}: ${n} pendientes`} />
                          <b className="ugm-num">{n}</b>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="ugm-muted">Nadie tiene pendientes con estos filtros.</p>
                )}
              </section>
            </div>
          </div>

          {u.esAdmin && <Estimacion />}
        </>
      )}
    </div>
  );
}

/** La estimación interna de puntos: para priorizar, no es el puntaje oficial. */
function Estimacion() {
  const u = useUgm();
  const calc = useCalculados(u.ciclo.id);
  const porQ = useMemo(() => Object.fromEntries(u.respuestas.map((r) => [r.q, r])), [u.respuestas]);
  const todo = useMemo(() => estimarAvance(u.preguntas, porQ, calc.data ?? [], false), [u.preguntas, porQ, calc.data]);
  const aprobado = useMemo(() => estimarAvance(u.preguntas, porQ, calc.data ?? [], true), [u.preguntas, porQ, calc.data]);
  const suma = (l: typeof todo, k: "estimados" | "maximos") => l.reduce((s, x) => s + x[k], 0);
  return (
    <section className="ugm-sec">
      <h2>Estimación de puntos (solo administración)</h2>
      <Alerta tipo="aviso">
        <strong>No es el puntaje oficial.</strong> UI GreenMetric asigna el puntaje tras revisar el envío. Antes de confiar en esta cifra, verifique en el Apéndice 1 de la guía el «primer factor» (0 o 0,05) de cada indicador: se leyó con una regla automática.
      </Alerta>
      <div className="ugm-tabla-marco">
        <table className="ugm-tabla">
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col" className="ugm-der">Con lo capturado</th>
              <th scope="col" className="ugm-der">Solo aprobado</th>
              <th scope="col" className="ugm-der">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {u.categorias.map((c) => {
              const t = todo.find((x) => x.categoria === c.categoria);
              const a = aprobado.find((x) => x.categoria === c.categoria);
              return (
                <tr key={c.categoria}>
                  <th scope="row">
                    <b className="ugm-cod">{c.categoria}</b> {c.nombre_es} <small className="ugm-muted">· peso {c.peso_pct} %</small>
                  </th>
                  <td className="ugm-der ugm-num">{formatearNumero(t?.estimados ?? 0, 0)}</td>
                  <td className="ugm-der ugm-num">{formatearNumero(a?.estimados ?? 0, 0)}</td>
                  <td className="ugm-der ugm-num">{formatearNumero(t?.maximos ?? c.puntos_max, 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="ugm-der ugm-num">{formatearNumero(suma(todo, "estimados"), 0)}</td>
              <td className="ugm-der ugm-num">{formatearNumero(suma(aprobado, "estimados"), 0)}</td>
              <td className="ugm-der ugm-num">{formatearNumero(suma(todo, "maximos"), 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="ugm-muted ugm-peq">
        Los estados cuentan: {ESTADOS.map((e) => ETIQUETA_ESTADO[e]).join(", ")}. «Con lo capturado» incluye respuestas aún sin aprobar.
      </p>
    </section>
  );
}
