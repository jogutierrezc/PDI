/* =============================================================================
   Encuestas con Pilo · las vistas previas del editor.

   Dos cosas vive aquí:

     PreviaEncuesta       la previa de la estructura (botón «Previa» del
                          editor): sección por sección, solo lectura.
     PreviaPresentacion   la previa en vivo de la presentación: cómo la
                          verá quien la responda en escritorio o en el
                          celular, con la cara y el tema de Pilo.

   Ninguna de las dos envía ni guarda nada: son un espejo del editor.
   ========================================================================== */

import { PiloFace } from "../../../components/pilo/PiloFace";
import type { ConfigPilo } from "../lib/config";
import { FONDOS } from "../lib/config";
import type { Estructura } from "../lib/estructura";
import { TIPOS_PREGUNTA } from "../lib/estructura";
import type { InfoEncuesta } from "../tipos";

/* --- La previa de la estructura ------------------------------------------------------------------- */

const nombre = (tipo: string) => TIPOS_PREGUNTA.find((t) => t.id === tipo)?.texto ?? tipo;

export function PreviaEncuesta({ encuesta, estructura, onCerrar }: { encuesta: InfoEncuesta; estructura: Estructura; onCerrar: () => void }) {
  return (
    <div className="pv-velo" role="dialog" aria-modal="true" aria-label={`Previa de ${encuesta.titulo}`} onClick={onCerrar}>
      <div className="pv-hoja" onClick={(e) => e.stopPropagation()}>
        <header className="pv-cabeza">
          <div>
            <span className="ed-fino">
              {encuesta.anio} · previa
            </span>
            <h2 className="ed-h3">{encuesta.titulo}</h2>
          </div>
          <button type="button" className="ed-btn ed-btn--sm" onClick={onCerrar} autoFocus>
            Cerrar
          </button>
        </header>
        {encuesta.intro ? <p className="pv-intro">{encuesta.intro}</p> : null}
        <div className="pv-secciones">
          {estructura.secciones.map((seccion, i) => (
            <section key={seccion.id} className="pv-seccion">
              <h3>
                {i + 1}. {seccion.titulo}
              </h3>
              {seccion.descripcion ? <p>{seccion.descripcion}</p> : null}
              {seccion.preguntas.map((p) => (
                <article key={p.id} className="pv-pregunta">
                  <b>
                    {p.enunciado} {p.obligatoria ? <span className="pv-obligatoria">obligatoria</span> : null}
                  </b>
                  {p.apoyo ? <small>{p.apoyo}</small> : null}
                  {p.opciones?.length ? (
                    <ul>
                      {p.opciones.map((o) => (
                        <li key={o.id}>{o.texto}</li>
                      ))}
                    </ul>
                  ) : null}
                  <span className="pv-tipo">{nombre(p.tipo)}</span>
                </article>
              ))}
              {!seccion.preguntas.length ? <p className="ed-fino">Esta sección todavía no tiene preguntas.</p> : null}
            </section>
          ))}
          {!estructura.secciones.length ? <p className="ed-fino">La encuesta todavía no tiene secciones.</p> : null}
        </div>
        <footer className="pv-pie">
          <span className="ed-fino">Esta previa no guarda ni envía nada: es para revisar la encuesta antes de publicarla.</span>
        </footer>
      </div>
    </div>
  );
}

/* --- La previa de la presentación ---------------------------------------------------------------- */

export type Dispositivo = "escritorio" | "movil";
export type PantallaPrevia = "intro" | "formulario" | "salida";

/** Los dos tamaños de la vista previa. */
export function SelectorDispositivo({ valor, onCambio }: { valor: Dispositivo; onCambio: (d: Dispositivo) => void }) {
  return (
    <div className="ed-seg" role="group" aria-label="Dispositivo de la vista previa">
      {(["escritorio", "movil"] as const).map((d) => (
        <button key={d} type="button" aria-pressed={valor === d} onClick={() => onCambio(d)}>
          {d === "escritorio" ? "Escritorio" : "Móvil"}
        </button>
      ))}
    </div>
  );
}

/** Una caja que imita el dispositivo: angosta para el celular. */
function Marco({ dispositivo, children }: { dispositivo: Dispositivo; children: React.ReactNode }) {
  return <div className={dispositivo === "movil" ? "pv-marco pv-marco--movil" : "pv-marco"}>{children}</div>;
}

export function PreviaPresentacion({
  titulo,
  intro,
  despedida,
  config,
  estructura,
  pantalla,
  dispositivo,
}: {
  titulo: string;
  intro: string;
  despedida: string;
  config: ConfigPilo;
  estructura: Estructura;
  pantalla: PantallaPrevia;
  dispositivo: Dispositivo;
}) {
  const acento = /^#[0-9a-f]{6}$/i.test(config.tema.acento) ? config.tema.acento : "#004a97";
  const fondo = FONDOS.find((f) => f.id === config.tema.fondo)?.color ?? "#f4f8fc";
  const primeras = estructura.secciones.flatMap((s) => s.preguntas).slice(0, 4);
  return (
    <Marco dispositivo={dispositivo}>
      <div className="pv-pantalla" style={{ backgroundColor: fondo }}>
        {config.tema.imagen ? <div className="pv-cabecera" style={{ backgroundImage: `url(${config.tema.imagen})`, backgroundColor: acento }} /> : null}
        <div className="pv-marca" style={{ backgroundColor: acento }}>
          {config.tema.logo ? <img src={config.tema.logo} alt="Logo de la encuesta" height={30} /> : <span className="pv-marca-texto">UDES</span>}
        </div>
        {pantalla === "intro" ? (
          <div className="pv-cuerpo">
            <PiloFace size={dispositivo === "movil" ? 76 : 96} expression={config.presentacion.pose} label="Mr. Pilo" />
            <h2 className="pv-titulo">{titulo || "El título de la encuesta"}</h2>
            <p className="pv-texto">{intro || "Aquí va lo que Pilo dice al empezar."}</p>
            {config.presentacion.mensaje ? <p className="pv-texto pv-texto--suave">{config.presentacion.mensaje}</p> : null}
            <span className="pv-boton" style={{ backgroundColor: acento }}>
              Empezar
            </span>
          </div>
        ) : pantalla === "formulario" ? (
          <div className="pv-cuerpo">
            <PiloFace size={64} expression="pensar" label="Mr. Pilo" />
            {primeras.length ? (
              primeras.map((p) => (
                <div key={p.id} className="pv-campo">
                  <b>
                    {p.enunciado}
                    {p.obligatoria ? " *" : ""}
                  </b>
                  {p.opciones?.length ? (
                    <ul className="pv-opciones">
                      {p.opciones.slice(0, 5).map((o) => (
                        <li key={o.id}>{o.texto}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="pv-linea" />
                  )}
                </div>
              ))
            ) : (
              <p className="pv-texto pv-texto--suave">La encuesta todavía no tiene preguntas.</p>
            )}
            <span className="pv-boton" style={{ backgroundColor: acento }}>
              Enviar
            </span>
          </div>
        ) : (
          <div className="pv-cuerpo">
            <PiloFace size={dispositivo === "movil" ? 76 : 96} expression="emocionado" label="Mr. Pilo" />
            <h2 className="pv-titulo">¡Gracias!</h2>
            <p className="pv-texto">{despedida || "Aquí va lo que Pilo dice al despedirse."}</p>
            {config.salida.siguientePaso ? <p className="pv-texto">{config.salida.siguientePaso}</p> : null}
            {config.salida.enlace ? (
              <span className="pv-boton" style={{ backgroundColor: acento }}>
                {config.salida.textoEnlace || "Siguiente paso"}
              </span>
            ) : null}
            {config.salida.mostrarResumen ? <p className="pv-texto pv-texto--suave">La persona puede ver un resumen de lo que respondió.</p> : null}
          </div>
        )}
      </div>
    </Marco>
  );
}
