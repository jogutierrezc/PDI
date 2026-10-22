/* =============================================================================
   Encuestas con Pilo · presentación y salida de Pilo.

   Lo que Pilo dice al empezar y al despedirse, su cara y su entrada, el tema
   (acento con letras blancas, fondo, imagen de cabecera, logo) y la pantalla de
   salida (siguiente paso, enlace, resumen, copia). A la derecha, la vista previa
   en vivo en escritorio o móvil. La voz es la oficial de Pilo (masculina); la
   opción solo enciende la que ya existe en el proyecto.
   ========================================================================== */

import { useMemo, useState } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { acentoValido, aGuardar, contrasteConBlanco, ENTRADAS, FONDOS, leerConfig, POSES, urlSegura } from "../lib/config";
import type { ConfigPilo, Pose } from "../lib/config";
import type { Estructura } from "../lib/estructura";
import { PreviaPresentacion, SelectorDispositivo } from "../publico/Previa";
import type { Dispositivo, PantallaPrevia } from "../publico/Previa";
import type { AjustesEncuesta } from "../api";
import type { Encuesta } from "../tipos";

const MAX = 320;

export function Presentacion({ encuesta, estructura, puedeEditar, guardando, onGuardar }: { encuesta: Encuesta; estructura: Estructura; puedeEditar: boolean; guardando: boolean; onGuardar: (c: AjustesEncuesta, mensaje: string) => void }) {
  const inicial = useMemo(() => leerConfig(encuesta.config_pilo), [encuesta.config_pilo]);
  const [titulo, setTitulo] = useState(encuesta.titulo);
  const [intro, setIntro] = useState(encuesta.intro);
  const [despedida, setDespedida] = useState(encuesta.despedida);
  const [cfg, setCfg] = useState<ConfigPilo>(inicial);
  const [acento, setAcento] = useState(inicial.tema.acento);
  const [pantalla, setPantalla] = useState<PantallaPrevia>("intro");
  const [dispositivo, setDispositivo] = useState<Dispositivo>("escritorio");
  const [error, setError] = useState<string | null>(null);

  const ponerPres = (c: Partial<ConfigPilo["presentacion"]>) => setCfg((x) => ({ ...x, presentacion: { ...x.presentacion, ...c } }));
  const ponerTema = (c: Partial<ConfigPilo["tema"]>) => setCfg((x) => ({ ...x, tema: { ...x.tema, ...c } }));
  const ponerSalida = (c: Partial<ConfigPilo["salida"]>) => setCfg((x) => ({ ...x, salida: { ...x.salida, ...c } }));
  const contraste = contrasteConBlanco(acento);
  const acentoOk = acentoValido(acento);
  const { anio } = encuesta;

  const cambiarAcento = (v: string) => {
    setAcento(v);
    if (acentoValido(v)) ponerTema({ acento: v.toLowerCase() });
  };

  const guardar = () => {
    if (titulo.trim().length < 5) return setError("El título necesita al menos 5 caracteres.");
    if (!acentoOk) return setError("El color de acento no tiene contraste suficiente con las letras blancas (necesita 4,5:1).");
    for (const [nombre, u] of [["La imagen de cabecera", cfg.tema.imagen], ["El logo", cfg.tema.logo], ["El enlace de salida", cfg.salida.enlace]] as const) {
      if (!urlSegura(u)) return setError(`${nombre} debe ser una dirección https:// (o una ruta de este sitio).`);
    }
    setError(null);
    onGuardar({ titulo: titulo.trim(), anio, intro: intro.trim(), despedida: despedida.trim(), config_pilo: aGuardar(encuesta.config_pilo, cfg) }, "Presentación guardada.");
  };

  return (
    <div className="ed-doscols ed-doscols--pres" role="tabpanel" id="en-panel-pres" aria-labelledby="en-tab-pres">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          guardar();
        }}
      >
        <fieldset className="ed-cerrado" disabled={!puedeEditar}>
          <section className="ed-card ed-pad">
            <h3 className="ed-h3">Bienvenida</h3>
            <div className="ed-field">
              <label htmlFor="pr-titulo">Título de la encuesta</label>
              <input id="pr-titulo" className="ed-in" maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-intro">Lo que dice Pilo al empezar</label>
              <textarea id="pr-intro" className="ed-in" rows={3} maxLength={MAX} value={intro} onChange={(e) => setIntro(e.target.value)} />
              <span className="ed-fino">
                Pilo lo dice con su voz oficial. {intro.length}/{MAX}
              </span>
            </div>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-msg">Mensaje propio de la bienvenida (opcional)</label>
              <textarea id="pr-msg" className="ed-in" rows={2} maxLength={400} value={cfg.presentacion.mensaje} onChange={(e) => ponerPres({ mensaje: e.target.value })} placeholder="Si lo deja vacío, se usa lo de arriba." />
            </div>
            <fieldset className="ed-poses ed-sep">
              <legend className="ed-lbl">Cara de Pilo</legend>
              {POSES.map((p) => (
                <label key={p} className="ed-pose" data-on={cfg.presentacion.pose === p ? "1" : undefined}>
                  <input type="radio" name="pose" value={p} checked={cfg.presentacion.pose === p} onChange={() => ponerPres({ pose: p as Pose })} />
                  <PiloFace size={44} expression={p} label="" />
                  <span>{p[0].toUpperCase() + p.slice(1)}</span>
                </label>
              ))}
            </fieldset>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-entrada">Entrada de Pilo</label>
              <select id="pr-entrada" className="ed-in" value={cfg.presentacion.entrada} onChange={(e) => ponerPres({ entrada: e.target.value as ConfigPilo["presentacion"]["entrada"] })}>
                {ENTRADAS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.texto}
                  </option>
                ))}
              </select>
              <span className="ed-fino">Cómo aparece su explicación junto a cada campo.</span>
            </div>
            <button type="button" className="ed-sw" role="switch" aria-checked={cfg.presentacion.voz} onClick={() => ponerPres({ voz: !cfg.presentacion.voz })}>
              <span className="ed-sw__tr" />
              Pilo saluda con su voz oficial
            </button>
          </section>

          <section className="ed-card ed-pad">
            <h3 className="ed-h3">Tema</h3>
            <div className="ed-dos">
              <div className="ed-field">
                <label htmlFor="pr-acento">Color de acento</label>
                <div className="ed-fila">
                  <input id="pr-acento-c" aria-label="Elegir el color de acento" className="ed-color" type="color" value={/^#[0-9a-f]{6}$/i.test(acento) ? acento : "#004a97"} onChange={(e) => cambiarAcento(e.target.value)} />
                  <input id="pr-acento" className="ed-in ed-in--corto" maxLength={7} value={acento} onChange={(e) => cambiarAcento(e.target.value)} aria-describedby="pr-acento-h" />
                </div>
                <span id="pr-acento-h" className={acentoOk ? "ed-fino" : "ed-error"} role={acentoOk ? undefined : "alert"}>
                  {acentoOk ? `Contraste con letras blancas: ${contraste.toFixed(1)}:1. Sirve.` : `Contraste ${contraste.toFixed(1)}:1: muy claro para letras blancas. Elija un color más oscuro (mínimo 4,5:1).`}
                </span>
              </div>
              <fieldset className="ed-field ed-fieldset">
                <legend className="ed-lbl">Fondo</legend>
                <div className="ed-seg">
                  {FONDOS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={cfg.tema.fondo === f.id} onClick={() => ponerTema({ fondo: f.id })}>
                      {f.texto}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-img">Imagen de cabecera (https)</label>
              <input id="pr-img" className="ed-in" type="url" value={cfg.tema.imagen} onChange={(e) => ponerTema({ imagen: e.target.value })} placeholder="https://…" />
            </div>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-logo">Logo (https; vacío = el de la UDES)</label>
              <input id="pr-logo" className="ed-in" type="url" value={cfg.tema.logo} onChange={(e) => ponerTema({ logo: e.target.value })} placeholder="https://…" />
            </div>
          </section>

          <section className="ed-card ed-pad">
            <h3 className="ed-h3">Despedida y pantalla de salida</h3>
            <div className="ed-field">
              <label htmlFor="pr-bye">Lo que dice Pilo al despedirse</label>
              <textarea id="pr-bye" className="ed-in" rows={3} maxLength={MAX} value={despedida} onChange={(e) => setDespedida(e.target.value)} />
              <span className="ed-fino">{despedida.length}/{MAX}</span>
            </div>
            <div className="ed-field ed-sep">
              <label htmlFor="pr-paso">Siguiente paso</label>
              <textarea id="pr-paso" className="ed-in" rows={2} maxLength={400} value={cfg.salida.siguientePaso} onChange={(e) => ponerSalida({ siguientePaso: e.target.value })} placeholder="Por ejemplo: En noviembre publicaremos los resultados." />
            </div>
            <div className="ed-dos ed-sep">
              <div className="ed-field">
                <label htmlFor="pr-enl">Enlace (https)</label>
                <input id="pr-enl" className="ed-in" type="url" value={cfg.salida.enlace} onChange={(e) => ponerSalida({ enlace: e.target.value })} placeholder="https://…" />
              </div>
              <div className="ed-field">
                <label htmlFor="pr-enlt">Texto del enlace</label>
                <input id="pr-enlt" className="ed-in" maxLength={60} value={cfg.salida.textoEnlace} onChange={(e) => ponerSalida({ textoEnlace: e.target.value })} placeholder="Ir al sitio" />
              </div>
            </div>
            <button type="button" className="ed-sw" role="switch" aria-checked={cfg.salida.mostrarResumen} onClick={() => ponerSalida({ mostrarResumen: !cfg.salida.mostrarResumen })}>
              <span className="ed-sw__tr" />
              Mostrar un resumen de lo enviado
            </button>
            <button type="button" className="ed-sw" role="switch" aria-checked={cfg.salida.copia} onClick={() => ponerSalida({ copia: !cfg.salida.copia })}>
              <span className="ed-sw__tr" />
              Ofrecer una copia descargable
            </button>
            {error && (
              <p className="ed-problema" role="alert">
                {error}
              </p>
            )}
            {puedeEditar ? (
              <div className="ed-fila ed-fila--sep">
                <button type="submit" className="ed-btn ed-btn--pri" disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar presentación"}
                </button>
              </div>
            ) : (
              <p className="ed-fino">Su rol permite ver esta configuración, no cambiarla.</p>
            )}
          </section>
        </fieldset>
      </form>

      <div className="ed-col ed-props ed-previa">
        <div className="ed-fila">
          <div className="ed-seg" role="group" aria-label="Pantalla de la vista previa">
            {(["intro", "formulario", "salida"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={pantalla === p} onClick={() => setPantalla(p)}>
                {p === "intro" ? "Bienvenida" : p === "formulario" ? "Preguntas" : "Salida"}
              </button>
            ))}
          </div>
          <SelectorDispositivo valor={dispositivo} onCambio={setDispositivo} />
        </div>
        <PreviaPresentacion titulo={titulo} intro={intro} despedida={despedida} config={cfg} estructura={estructura} pantalla={pantalla} dispositivo={dispositivo} />
      </div>
    </div>
  );
}
