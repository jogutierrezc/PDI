/* Planeación y Seguimiento · Fase 2 · «Cómo te avisamos»: qué correos llegan y con qué plazo.
   Informativa. Los correos los envía el servidor; esta pantalla no envía nada. Los plazos son los valores por
   defecto (configurables por la administración); PENDIENTE DE CONTRASTAR con el contrato de la base. */

import { Icon } from "../../../components/ui/Icon";
import { AVISOS } from "./catalogoAvisos";

export function Avisos() {
  return (
    <div className="ps-seccion">
      <p className="ps-sub">Los avisos de las actividades llegan a su correo institucional. Los envía el servidor, no esta pantalla: aquí solo se explica cuáles hay y cuándo salen. Cuando usted asigna o transfiere, la pantalla le muestra antes a quién se le va a avisar.</p>
      <ul className="ps-avisos-lista">
        {AVISOS.map((a) => (
          <li key={a.id} className="ps-bloque">
            <h2>{a.titulo}{a.fase3 ? <span className="ps-estado" data-tono="pend"> Llega en la fase 3</span> : null}</h2>
            <dl className="ps-ficha">
              <div><dt>A quién le llega</dt><dd>{a.quien}</dd></div>
              <div><dt>Cuándo</dt><dd>{a.cuando}{a.dias ? <span className="ps-config"> · configurable</span> : null}</dd></div>
              <div><dt>Qué dice</dt><dd>{a.texto}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="ps-aviso ps-aviso--info"><Icon name="info" size={16} /> <span>Los plazos (3 días antes, 1 día después) son los valores por defecto y la administración los puede cambiar. Si un aviso no le llega, revise la carpeta de correo no deseado y que su correo en Usuarios sea el institucional.</span></p>
    </div>
  );
}
