/* CNA: reservado en el módulo y en borrador. Solo lo ve administración. */

export function Cna() {
  return (
    <section className="ri-draft">
      <span className="ri-pill">Borrador</span>
      <h3>CNA · en borrador</h3>
      <p>
        Queda reservado en el módulo y solo lo ve administración. Cuando se active usará la misma estructura que el SNIES: un
        catálogo de plantillas con sus campos y reglas, una hoja por plantilla y el mismo tablero de estados.
      </p>
      <ul>
        <li>Factores y características del modelo de acreditación como «plantillas».</li>
        <li>Evidencias adjuntas por característica en lugar de filas por persona.</li>
        <li>Reutiliza cifras ya validadas en el SNIES (matriculados, graduados, docentes) sin volver a digitarlas.</li>
      </ul>
    </section>
  );
}
