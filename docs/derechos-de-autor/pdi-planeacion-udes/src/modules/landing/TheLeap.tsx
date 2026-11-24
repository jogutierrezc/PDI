/* =============================================================================
   El gran salto: de la universidad convencional a la innovadora.

   Las dos columnas se muestran a la vez, no detrás de un conmutador. Un
   comparador que esconde la mitad obliga a recordar lo que acaba de
   desaparecer; aquí el contraste es el contenido, así que las dos caras tienen
   que poder leerse de un vistazo. En móvil se apilan con su etiqueta delante.
   ========================================================================== */

import { leapDimensions, planFigures } from "./content";

export function TheLeap() {
  return (
    <section className="leap" id="desafio" aria-labelledby="leap-title">
      <div className="u-container">
        <div className="section-heading">
          <span className="eyebrow">El gran salto</span>
          <h2 id="leap-title">Rompemos el molde: una educación pensada para la vida real</h2>
          <p>
            Superamos el aula magistral tradicional para abrazar un modelo centrado en retos,
            tecnología y adaptabilidad.
          </p>
        </div>

        <ol className="leap__list">
          {leapDimensions.map((row) => (
            <li className="leap__row" key={row.id}>
              <h3 className="leap__dimension">{row.dimension}</h3>

              <div className="leap__pane leap__pane--before">
                <span className="leap__tag">Lo que superamos</span>
                <p>{row.before}</p>
              </div>

              <span className="leap__arrow" aria-hidden="true">
                →
              </span>

              <div className="leap__pane leap__pane--after">
                <span className="leap__tag">En el PDI 2024-2028</span>
                <p>{row.after}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* La forma del plan aprobado. No es seguimiento: son las cifras del
            documento, y por eso no cambian con el corte del mes. */}
        <dl className="leap__figures" aria-label="La forma del plan aprobado">
          {planFigures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
