/* =============================================================================
   Encuestas con Pilo · acceso y publicación.

   Quién puede responder (con Microsoft UDES, o abierta a cualquiera sin iniciar
   sesión), fechas, límite, mensaje de cierre, estado (borrador, publicada,
   pausada, cerrada), el enlace con su QR y la lista «Antes de publicar». Publicar
   fija la versión: las respuestas apuntan a ella y no cambia aunque se siga
   editando el borrador.
   ========================================================================== */

import { useMemo, useState } from "react";
import { drawQr } from "../../pilo-app/carnet/qr";
import { aGuardar, leerConfig } from "../lib/config";
import { antesDePublicar, puedePublicar } from "../lib/editor";
import type { Requisito } from "../lib/editor";
import type { Estructura } from "../lib/estructura";
import type { AjustesEncuesta } from "../api";
import type { Acceso as TipoAcceso, Encuesta, EstadoEncuesta } from "../tipos";
import { textoEstadoEncuesta } from "../tipos";

const DOMINIO = /^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$/;

function Qr({ texto, titulo }: { texto: string; titulo: string }) {
  const qr = useMemo(() => drawQr(texto), [texto]);
  if (!qr.size) return null;
  const bajar = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="512" height="512" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.path}" fill="#000"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr-encuesta.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className="ed-qr">
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width="132" height="132" role="img" aria-label={`Código QR del enlace de «${titulo}»`} shapeRendering="crispEdges">
        <rect width="100%" height="100%" fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
      <button type="button" className="ed-btn ed-btn--sm" onClick={bajar}>
        Descargar QR
      </button>
    </div>
  );
}

export function Acceso({
  encuesta,
  estructura,
  puedeEditar,
  guardando,
  publicando,
  onGuardar,
  onPublicar,
  onAviso,
}: {
  encuesta: Encuesta;
  estructura: Estructura;
  puedeEditar: boolean;
  guardando: boolean;
  publicando: boolean;
  onGuardar: (c: AjustesEncuesta, mensaje: string) => void;
  onPublicar: (nota: string) => void;
  onAviso: (t: string) => void;
}) {
  const cfg = useMemo(() => leerConfig(encuesta.config_pilo), [encuesta.config_pilo]);
  const [acceso, setAcceso] = useState<TipoAcceso>(encuesta.acceso);
  const [dominios, setDominios] = useState(encuesta.dominios_permitidos.join(", "));
  const [una, setUna] = useState(encuesta.una_por_persona);
  const [abre, setAbre] = useState(encuesta.abre_el ?? "");
  const [cierra, setCierra] = useState((encuesta.cierra_el ?? "").slice(0, 10));
  const [limite, setLimite] = useState(encuesta.limite_respuestas ? String(encuesta.limite_respuestas) : "");
  const [mensajeCierre, setMensajeCierre] = useState(encuesta.mensaje_cierre);
  const [robots, setRobots] = useState(cfg.verificacionRobots);
  const [datos, setDatos] = useState(cfg.datosPersonales);
  const [consentimiento, setConsentimiento] = useState(cfg.consentimiento);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lista = useMemo(() => dominios.split(/[,\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean), [dominios]);
  const enlace = `${window.location.origin}/encuesta/${encuesta.slug}`;
  const requisitos: Requisito[] = antesDePublicar(estructura, {
    titulo: encuesta.titulo,
    acceso,
    dominios: lista,
    cierra_el: cierra || null,
    abre_el: abre || null,
    mensaje_cierre: mensajeCierre,
    intro: cfg.presentacion.mensaje || encuesta.intro,
    despedida: encuesta.despedida,
    verificacionRobots: robots,
    pideDatosPersonales: datos,
    consentimiento,
  });
  const listo = puedePublicar(requisitos);

  const guardar = () => {
    const mala = lista.find((d) => !DOMINIO.test(d));
    if (acceso === "microsoft" && mala) return setError(`«${mala}» no parece un dominio. Escríbalos así: udes.edu.co, mail.udes.edu.co.`);
    const n = limite.trim() === "" ? null : Number(limite);
    if (n !== null && (!Number.isInteger(n) || n < 1)) return setError("El límite de respuestas es un número entero mayor que cero, o déjelo vacío.");
    if (abre && cierra && abre > cierra) return setError("La apertura tiene que ser anterior al cierre.");
    setError(null);
    onGuardar(
      {
        acceso,
        dominios_permitidos: acceso === "microsoft" ? lista : encuesta.dominios_permitidos,
        una_por_persona: acceso === "microsoft" ? una : false,
        abre_el: abre || null,
        cierra_el: cierra ? `${cierra}T23:59:59-05:00` : null,
        limite_respuestas: n,
        mensaje_cierre: mensajeCierre.trim(),
        config_pilo: aGuardar(encuesta.config_pilo, { ...cfg, verificacionRobots: robots, datosPersonales: acceso === "abierta" && datos, consentimiento: consentimiento.trim() }),
      },
      "Acceso guardado.",
    );
  };

  const cambiarEstado = (estado: EstadoEncuesta, texto: string) => onGuardar({ estado }, texto);
  const e = encuesta.estado;

  return (
    <div className="ed-doscols" role="tabpanel" id="en-panel-acceso" aria-labelledby="en-tab-acceso">
      <fieldset className="ed-cerrado" disabled={!puedeEditar}>
        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Quién puede responder</h3>
          <div className="ed-seg" role="group" aria-label="Acceso a la encuesta">
            <button type="button" aria-pressed={acceso === "microsoft"} onClick={() => setAcceso("microsoft")}>
              Con Microsoft UDES
            </button>
            <button type="button" aria-pressed={acceso === "abierta"} onClick={() => setAcceso("abierta")}>
              Abierta a cualquiera
            </button>
          </div>
          {acceso === "microsoft" ? (
            <>
              <p className="ed-fino ed-sep">Quien responde confirma su cuenta con Microsoft; el correo queda ligado a su respuesta.</p>
              <div className="ed-field ed-sep">
                <label htmlFor="ac-dom">Dominios permitidos</label>
                <input id="ac-dom" className="ed-in" value={dominios} onChange={(ev) => setDominios(ev.target.value)} placeholder="udes.edu.co, mail.udes.edu.co" />
                <span className="ed-fino">Separados por coma. Cada dominio admite también sus subdominios.</span>
              </div>
              <button type="button" className="ed-sw" role="switch" aria-checked={una} onClick={() => setUna(!una)}>
                <span className="ed-sw__tr" />
                Una respuesta por persona
              </button>
            </>
          ) : (
            <>
              <p className="ed-fino ed-sep">Cualquier persona con el enlace puede responder, sin iniciar sesión. No hay «una por persona»: no se conoce quién responde.</p>
              <button type="button" className="ed-sw" role="switch" aria-checked={robots} onClick={() => setRobots(!robots)}>
                <span className="ed-sw__tr" />
                Verificación contra robots
              </button>
              <p className="ed-fino">Además se frena a quien envía muchas veces seguidas (5 envíos cada 10 minutos por conexión) y se puede limitar el total de respuestas.</p>
              <button type="button" className="ed-sw" role="switch" aria-checked={datos} onClick={() => setDatos(!datos)}>
                <span className="ed-sw__tr" />
                Pedir el nombre (dato personal, opcional)
              </button>
              {datos && (
                <div className="ed-field">
                  <label htmlFor="ac-cons">Texto de consentimiento</label>
                  <textarea id="ac-cons" className="ed-in" rows={3} maxLength={1000} value={consentimiento} onChange={(ev) => setConsentimiento(ev.target.value)} placeholder="Autorizo a la Universidad de Santander a tratar mis datos personales para esta encuesta, según su política de tratamiento de datos." />
                  <span className="ed-fino">Quien responde debe marcarlo para enviar su nombre.</span>
                </div>
              )}
            </>
          )}
        </section>

        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Fechas y límites</h3>
          <div className="ed-dos">
            <div className="ed-field">
              <label htmlFor="ac-abre">Abre el</label>
              <input id="ac-abre" className="ed-in" type="date" value={abre} onChange={(ev) => setAbre(ev.target.value)} />
            </div>
            <div className="ed-field">
              <label htmlFor="ac-cierra">Cierra el (inclusive)</label>
              <input id="ac-cierra" className="ed-in" type="date" value={cierra} onChange={(ev) => setCierra(ev.target.value)} />
            </div>
          </div>
          <div className="ed-field ed-sep">
            <label htmlFor="ac-lim">Límite de respuestas</label>
            <input id="ac-lim" className="ed-in ed-in--corto" type="number" min={1} value={limite} onChange={(ev) => setLimite(ev.target.value)} placeholder="Sin límite" />
          </div>
          <div className="ed-field ed-sep">
            <label htmlFor="ac-cierre">Mensaje de cierre</label>
            <textarea id="ac-cierre" className="ed-in" rows={2} maxLength={1000} value={mensajeCierre} onChange={(ev) => setMensajeCierre(ev.target.value)} placeholder="Esta encuesta ya no recibe respuestas. Gracias por su interés." />
          </div>
          {error && (
            <p className="ed-problema" role="alert">
              {error}
            </p>
          )}
          <div className="ed-fila ed-fila--sep">
            <button type="button" className="ed-btn ed-btn--pri" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar acceso"}
            </button>
          </div>
        </section>
      </fieldset>

      <div className="ed-col ed-props">
        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Estado</h3>
          <p>
            <span className="ed-estado" data-s={e}>
              <i aria-hidden="true" />
              {textoEstadoEncuesta(e)}
            </span>
          </p>
          {puedeEditar && (
            <div className="ed-fila ed-fila--sep">
              {e === "borrador" && (
                <button type="button" className="ed-btn ed-btn--pri" disabled={!listo || publicando} onClick={() => onPublicar(nota)}>
                  {publicando ? "Publicando…" : "Publicar encuesta"}
                </button>
              )}
              {e === "publicada" && (
                <>
                  <button type="button" className="ed-btn" disabled={guardando} onClick={() => cambiarEstado("pausada", "Encuesta en pausa: el enlace no recibe respuestas.")}>
                    Pausar
                  </button>
                  <button type="button" className="ed-btn ed-btn--peligro" disabled={guardando} onClick={() => cambiarEstado("cerrada", "Encuesta cerrada.")}>
                    Cerrar
                  </button>
                </>
              )}
              {e === "pausada" && (
                <>
                  <button type="button" className="ed-btn ed-btn--pri" disabled={guardando} onClick={() => cambiarEstado("publicada", "Encuesta reanudada: el enlace recibe respuestas.")}>
                    Reanudar
                  </button>
                  <button type="button" className="ed-btn ed-btn--peligro" disabled={guardando} onClick={() => cambiarEstado("cerrada", "Encuesta cerrada.")}>
                    Cerrar
                  </button>
                </>
              )}
              {e === "cerrada" && (
                <button type="button" className="ed-btn ed-btn--pri" disabled={guardando || !encuesta.version_publicada_id} onClick={() => cambiarEstado("publicada", "Encuesta reabierta.")}>
                  Reabrir
                </button>
              )}
            </div>
          )}
          {puedeEditar && e !== "borrador" && (
            <div className="ed-sep">
              <div className="ed-field">
                <label htmlFor="ac-nota">Nota de la nueva versión (opcional)</label>
                <input id="ac-nota" className="ed-in" maxLength={300} value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Qué cambió" />
              </div>
              <button type="button" className="ed-btn ed-sep" disabled={!listo || publicando} onClick={() => onPublicar(nota)}>
                {publicando ? "Publicando…" : "Publicar los cambios del editor"}
              </button>
              <p className="ed-fino">Quienes ya respondieron quedan ligados a la versión anterior.</p>
            </div>
          )}
        </section>

        <section className="ed-card ed-pad" aria-labelledby="ac-antes">
          <h3 id="ac-antes" className="ed-h3">
            Antes de publicar
          </h3>
          <ul className="ed-requisitos">
            {requisitos.map((r) => (
              <li key={r.id} data-ok={r.cumple ? "1" : undefined}>
                <span className="ed-requisitos__ic" aria-hidden="true">
                  {r.cumple ? "✓" : "!"}
                </span>
                <span>
                  <span className="ed-sr">{r.cumple ? "Cumplido: " : "Pendiente: "}</span>
                  {r.texto}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ed-card ed-pad">
          <h3 className="ed-h3">Enlace</h3>
          <div className="ed-fila">
            <input className="ed-in ed-in--enlace" readOnly aria-label="Enlace público" value={enlace} onFocus={(ev) => ev.currentTarget.select()} />
            <button
              type="button"
              className="ed-btn"
              onClick={() =>
                navigator.clipboard.writeText(enlace).then(
                  () => onAviso("Enlace copiado."),
                  () => onAviso("No se pudo copiar. Selecciónelo y use Ctrl+C."),
                )
              }
            >
              Copiar
            </button>
          </div>
          <Qr texto={enlace} titulo={encuesta.titulo} />
          {e !== "publicada" && <p className="ed-fino">El enlace solo recibe respuestas cuando la encuesta está publicada y dentro de sus fechas.</p>}
        </section>
      </div>
    </div>
  );
}
