/* =============================================================================
   Encuestas con Pilo · «Título y mensajes».

   Lo que se edita aquí es lo que Pilo dice en la página pública: el título,
   lo que lee al empezar (intro) y lo que dice al despedirse. La vista previa
   muestra lo que se está escribiendo. Solo edita quien tiene capacidad de
   Planeación; los demás ven los campos fijos.
   ========================================================================== */

import { useState } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { cierreAFecha, fechaACierre } from "../lib/tabla";
import type { CambiosEncuesta, Encuesta } from "../tipos";

export const MAX_MENSAJE = 320;

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="7" />
    <path d="M5.8 9.3l2.2 2.2 4.2-4.6" />
  </svg>
);

export function ConfigEncuesta({
  encuesta,
  puedeEditar,
  guardando,
  onGuardar,
}: {
  encuesta: Encuesta;
  puedeEditar: boolean;
  guardando: boolean;
  onGuardar: (c: CambiosEncuesta) => void;
}) {
  const [titulo, setTitulo] = useState(encuesta.titulo);
  const [anio, setAnio] = useState(encuesta.anio ?? "");
  const [cierre, setCierre] = useState(cierreAFecha(encuesta.cierra_el));
  const [intro, setIntro] = useState(encuesta.intro);
  const [despedida, setDespedida] = useState(encuesta.despedida);
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    if (titulo.trim().length < 5) {
      setError("El título necesita al menos 5 caracteres.");
      return;
    }
    setError(null);
    onGuardar({ titulo: titulo.trim(), anio: anio.trim(), cierra_el: fechaACierre(cierre), intro: intro.trim(), despedida: despedida.trim() });
  };

  return (
    <div role="tabpanel" id="en-panel-cfg" aria-labelledby="en-tab-cfg" className="en-cfg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="en-fld">
          <label htmlFor="en-c-titulo">Título de la encuesta</label>
          <input id="en-c-titulo" className="en-in" maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} readOnly={!puedeEditar} aria-describedby="en-c-titulo-h" />
          <span id="en-c-titulo-h" className="en-hint">
            Es lo primero que lee Pilo y lo que aparece en la cabecera del enlace público.
          </span>
        </div>
        <div className="en-fila2">
          <div className="en-fld">
            <label htmlFor="en-c-anio">Año o periodo</label>
            <input id="en-c-anio" className="en-in" maxLength={20} value={anio} onChange={(e) => setAnio(e.target.value)} readOnly={!puedeEditar} />
          </div>
          <div className="en-fld">
            <label htmlFor="en-c-cierre">Fecha de cierre</label>
            <input id="en-c-cierre" className="en-in" type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} readOnly={!puedeEditar} />
          </div>
        </div>
        <div className="en-fld">
          <label htmlFor="en-c-intro">Lo que dice Pilo al empezar</label>
          <textarea id="en-c-intro" className="en-in" maxLength={MAX_MENSAJE} value={intro} onChange={(e) => setIntro(e.target.value)} readOnly={!puedeEditar} aria-describedby="en-c-intro-h" />
          <span id="en-c-intro-h" className="en-hint">
            Aquí va el propósito de la encuesta. Pilo lo lee con la voz oficial. {intro.length}/{MAX_MENSAJE}
          </span>
        </div>
        <div className="en-fld">
          <label htmlFor="en-c-bye">Lo que dice Pilo al despedirse</label>
          <textarea id="en-c-bye" className="en-in" maxLength={MAX_MENSAJE} value={despedida} onChange={(e) => setDespedida(e.target.value)} readOnly={!puedeEditar} aria-describedby="en-c-bye-h" />
          <span id="en-c-bye-h" className="en-hint">
            {despedida.length}/{MAX_MENSAJE}
          </span>
        </div>
        {error && (
          <p className="en-error" role="alert">
            {error}
          </p>
        )}
        {puedeEditar ? (
          <div className="en-acciones">
            <button type="submit" className="en-btn en-btn--pri" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        ) : (
          <p className="en-nota">Su rol permite ver estos mensajes, no cambiarlos.</p>
        )}
      </form>

      <div className="en-lado">
        <div className="en-previa" aria-label="Vista previa de la bienvenida">
          <PiloFace size={92} expression="feliz" label="Mr. Pilo" />
          <h3>{titulo || "Sin título"}</h3>
          <p>{intro}</p>
        </div>
        <ul className="en-preguntas" aria-label="Preguntas de la encuesta">
          <li>
            <Check />
            <div>
              <b>Identificación</b>
              <span>Correo institucional por Microsoft y dependencia</span>
            </div>
          </li>
          <li>
            <Check />
            <div>
              <b>Logro o reto</b>
              <span>Título y descripción de hasta 500 caracteres</span>
            </div>
          </li>
          <li>
            <Check />
            <div>
              <b>Cifras relacionadas</b>
              <span>Qué es, tipo (estudiantes, programas, porcentaje, dinero, otro) y valor</span>
            </div>
          </li>
        </ul>
        <p className="en-nota">Por ahora esta encuesta trae estas preguntas fijas. Más adelante, un editor de preguntas permitirá crear encuestas distintas con el mismo Pilo.</p>
      </div>
    </div>
  );
}
