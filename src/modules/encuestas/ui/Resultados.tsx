/* =============================================================================
   Encuestas con Pilo · resultados básicos.

   Conteo por estado y una gráfica simple por pregunta: barras para opciones y
   escalas, promedio y rango para cifras, resumen de logros y retos, y cuántas
   personas contestaron en lo demás. Cada barra lleva su número escrito: la gráfica
   no es lo único que dice el dato. Lo borrado no cuenta.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef } from "react";
import type { Estructura } from "../lib/estructura";
import { conteoPorEstado, resultadosDe, vigentes } from "../lib/resultados";
import type { RespuestaLeida, ResultadoPregunta } from "../lib/resultados";
import { bars, kill } from "../motion";

const n = (x: number) => x.toLocaleString("es-CO", { maximumFractionDigits: 2 });

function Tarjeta({ r }: { r: ResultadoPregunta }) {
  return (
    <article className="ed-card ed-pad ed-res">
      <h3 className="ed-h3">{r.pregunta.enunciado}</h3>
      <p className="ed-fino">
        {r.respondieron} {r.respondieron === 1 ? "persona respondió" : "personas respondieron"}
      </p>
      {r.tipo === "reparto" && (
        <ul className="ed-barras">
          {r.barras.map((b) => (
            <li key={b.clave}>
              <span className="ed-barras__t">{b.texto}</span>
              <span className="ed-barras__pista" aria-hidden="true">
                <span className="ed-barras__b" data-barra style={{ width: `${Math.max(b.n ? 2 : 0, b.parte * 100)}%` }} />
              </span>
              <b className="ed-barras__n">{b.n}</b>
            </li>
          ))}
        </ul>
      )}
      {r.tipo === "numerico" && (
        <dl className="ed-kpis">
          <div>
            <dt>Promedio</dt>
            <dd>{n(r.promedio)}</dd>
          </div>
          <div>
            <dt>Mínimo</dt>
            <dd>{n(r.minimo)}</dd>
          </div>
          <div>
            <dt>Máximo</dt>
            <dd>{n(r.maximo)}</dd>
          </div>
          <div>
            <dt>Suma</dt>
            <dd>{n(r.suma)}</dd>
          </div>
        </dl>
      )}
      {r.tipo === "bloque" && (
        <dl className="ed-kpis">
          <div>
            <dt>Logros</dt>
            <dd>{r.logros}</dd>
          </div>
          <div>
            <dt>Retos</dt>
            <dd>{r.retos}</dd>
          </div>
          <div>
            <dt>Cifras</dt>
            <dd>{r.cifras}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}

export function Resultados({ estructura, respuestas }: { estructura: Estructura; respuestas: readonly RespuestaLeida[] }) {
  const raiz = useRef<HTMLDivElement>(null);
  const estados = useMemo(() => conteoPorEstado(respuestas), [respuestas]);
  const resultados = useMemo(() => resultadosDe(estructura, respuestas), [estructura, respuestas]);
  const total = vigentes(respuestas).length;

  useLayoutEffect(() => {
    const barras = raiz.current ? Array.from(raiz.current.querySelectorAll<HTMLElement>("[data-barra]")) : [];
    bars(barras);
    return () => kill(barras);
  }, [resultados]);

  if (total === 0) {
    return (
      <div className="ed-vacio" role="tabpanel" id="en-panel-res" aria-labelledby="en-tab-res">
        <h3>Todavía no hay resultados</h3>
        <p>Cuando lleguen respuestas, aquí verá cuántas hay por estado y una gráfica por pregunta.</p>
      </div>
    );
  }
  return (
    <div ref={raiz} role="tabpanel" id="en-panel-res" aria-labelledby="en-tab-res" className="ed-resultados">
      <section aria-label="Respuestas por estado" className="ed-card ed-pad">
        <h3 className="ed-h3">
          {total} {total === 1 ? "respuesta" : "respuestas"}
        </h3>
        <ul className="ed-estados">
          {estados.map((e) => (
            <li key={e.estado}>
              <span className="en-est" data-v={e.estado}>
                {e.texto}
              </span>
              <b>{e.n}</b>
            </li>
          ))}
        </ul>
      </section>
      <div className="ed-res-g">
        {resultados.map((r) => (
          <Tarjeta key={r.pregunta.id} r={r} />
        ))}
      </div>
    </div>
  );
}
