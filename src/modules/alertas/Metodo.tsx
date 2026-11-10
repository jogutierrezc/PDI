/* Portal de alertas · cómo se calcula: lo que significa cada nivel, el mapa de riesgo, las notas estimadas, el modelo y sus límites. */

import { MODELO } from "./estimacion";
import { Forma } from "./graficos";
import { useEntrada } from "../monitor/piezas";

function Bloque({ titulo, children, abierto = false }: { titulo: string; children: React.ReactNode; abierto?: boolean }) {
  return (
    <details className="al-detalle" open={abierto}>
      <summary>{titulo}</summary>
      <div className="al-prosa">{children}</div>
    </details>
  );
}

export function Metodo() {
  const ref = useEntrada<HTMLDivElement>("metodo");
  return (
    <div ref={ref} className="al-pagina">
      <section className="al-seccion">
        <h1 className="al-titulo" data-in>
          Cómo se calcula
        </h1>
        <p className="al-lead" data-in>
          Lo que significa cada nivel, de dónde sale la probabilidad y qué no puede decir.
        </p>
      </section>
      <section className="al-seccion al-estrecha" data-in>
        <Bloque titulo="Los tres niveles" abierto>
          <p>
            <Forma nivel="NE" /> <b>NE, nivel esperado:</b> promedio de 3,5 o más y ninguna materia perdida.
          </p>
          <p>
            <Forma nivel="ED" /> <b>ED, en desarrollo:</b> promedio entre 3,0 y 3,49, o una materia perdida.
          </p>
          <p>
            <Forma nivel="RS" /> <b>RS, requiere seguimiento:</b> promedio menor de 3,0, dos o más materias perdidas, o una caída de 0,5 o más frente al corte o periodo anterior.
          </p>
          <p>Un estudiante se clasifica en un corte solo si ya tiene nota en la mitad o más de sus materias. Un grupo requiere seguimiento cuando 30 % o más de su gente está bajo la nota de aprobar (3,0; en Medicina, 3,5).</p>
        </Bloque>
        <Bloque titulo="El mapa de riesgo">
          <p>Reprobar es sacar menos de 3,0 (en Medicina, menos de 3,5). La tasa es matrículas reprobadas sobre matrículas con nota. Un curso es de reprobación alta desde 30 % y crítico desde 50 %. Los cursos con menos de 5 matrículas con nota no se detallan.</p>
          <p>P1, P2 y P3 usan solo los grupos de plan «Tres cortes», los únicos que reportan los tres cortes. La nota final puede sumar también los planes «Única» y «Formación permanente».</p>
        </Bloque>
        <Bloque titulo="Las notas que faltan">
          <p>Mientras un periodo está en curso, P2, P3 o la nota final pueden no existir. Cada estudiante recibe entonces una estimación a partir de sus notas anteriores del mismo periodo y de su promedio del periodo anterior, con una banda del 80 % que se abre con cada corte estimado.</p>
          <p>En los cursos y grupos, la estimación sale de la pendiente entre P1 y P2 (la mitad de su tendencia), y la nota final, del promedio de las tasas de los tres cortes. El interruptor «Estimar cortes sin notas» del mapa de riesgo deja ver solo lo real.</p>
          <p>Todo lo estimado se marca con trama y la palabra «estimado», y se reemplaza solo cuando llegan las notas reales.</p>
        </Bloque>
        <Bloque titulo="La probabilidad de desertar">
          <p>
            Usa el modelo del estudio de la UDES (Pérez et al., 2023, Tabla 2): una regresión logística con {MODELO.casos.toLocaleString("es-CO")} casos de las cohortes 2017 a 2020 (R² de Nagelkerke {String(MODELO.nagelkerke).replace(".", ",")}; {String(MODELO.acierto).replace(".", ",")} % de casos bien clasificados). La probabilidad es 1 dividido entre 1 más e elevado a menos Z, donde Z suma la constante ({String(MODELO.constante).replace(".", ",")}) y el peso de cada factor.
          </p>
          <p>Se usan los factores que el Warehouse tiene: facultad, promedio, grupo de edad y origen. Estrato y trabajo no están, y se toman en su categoría de referencia. Las facultades se reconocen por su nombre; si una no equivale a las del estudio, cuenta como referencia.</p>
        </Bloque>
        <Bloque titulo="La proyección y los escenarios">
          <p>Para quien tiene dos periodos o más, se toma la tendencia de los últimos cuatro, suavizada a la mitad, y la variación propia como ancho de la banda del 80 %. Con un solo periodo se combina el promedio con el de partida (3,4) y la banda es más amplia. De ahí sale la probabilidad de cerrar bajo 3,2.</p>
          <p>Un escenario cambia el promedio de un grupo de estudiantes y vuelve a calcular cuántos cerrarían bajo 3,2 y las deserciones esperadas. Se puede hacer por estudiante, por programa y, en el mapa de riesgo, bajando la reprobación de los cursos de 30 % o más.</p>
        </Bloque>
        <Bloque titulo="Lo que no puede decir">
          <p>Es una estimación de grupo. No identifica causas, no predice a una persona y no reemplaza la conversación con el estudiante. Con pocos periodos de historia la banda es amplia. Los periodos anteriores aparecen cuando su reporte de notas está cargado en el Warehouse.</p>
        </Bloque>
        <Bloque titulo="Privacidad">
          <p>El código del estudiante es un dato personal. Se ve solo si se tiene acceso al programa, por la unidad a la que se pertenece. No se guardan nombres, documento ni contacto. Lo agregado por curso o grupo no se muestra con menos de 5 matrículas.</p>
        </Bloque>
      </section>
    </div>
  );
}
