/* =============================================================================
   Correos · Remitentes y conexión.

   El servidor SMTP, quién firma cada identidad, los topes y los dominios. Todo
   se guarda junto con «Guardar», salvo la contraseña: esa se escribe una vez,
   se guarda al momento y no vuelve a mostrarse (solo sus 4 últimos), igual que
   los demás secretos de la intranet. «Probar conexión» prueba lo que está
   escrito, guardado o no, con la contraseña guardada, y no envía nada.
   ========================================================================== */

import { useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { correoValido, dominiosDe, IDENTIDADES, MARCAS, type Identidad } from "./servidor-logica";
import { claves, guardarClave, guardarConexion, probarConexion, type Ajustes, type Configuracion, type Leido, type Remitente } from "./datos";
import { Estado, type Aviso } from "./partes";

const entero = (v: string, min: number, max: number) => /^\d{1,6}$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

/** Qué impide guardar, campo por campo. */
function problemas(a: Ajustes, r: Record<Identidad, Remitente>): Record<string, string> {
  const p: Record<string, string> = {};
  const host = a.host.trim();
  if (host && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host)) p.host = "Solo el nombre del servidor, sin https:// ni espacios. Por ejemplo: smtp.office365.com";
  if (!entero(a.puerto, 1, 65535)) p.puerto = "Un número de puerto: lo habitual es 587 o 465.";
  if (/\s/.test(a.usuario.trim())) p.usuario = "El usuario no lleva espacios.";
  if (!entero(a.topeHora, 0, 100000)) p.topeHora = "Un número de 0 a 100000. Con 0 no hay tope.";
  if (!entero(a.topePersona, 0, 1000)) p.topePersona = "Un número de 0 a 1000. Con 0 no hay tope.";
  if (a.dominios.split(/[\s,;]+/).filter(Boolean).some((d) => dominiosDe(d).length === 0)) {
    p.dominios = "Hay algo que no parece un dominio. Escríbalos así: udes.edu.co, mail.udes.edu.co";
  }
  for (const id of IDENTIDADES) {
    if (!r[id].nombre.trim()) p[`${id}-nombre`] = "Escriba el nombre que verá quien recibe.";
    else if (/[<>"]/.test(r[id].nombre)) p[`${id}-nombre`] = "El nombre no lleva comillas ni los signos < >.";
    if (r[id].direccion.trim() && !correoValido(r[id].direccion.trim())) p[`${id}-direccion`] = "Escriba una dirección completa, o déjela vacía.";
    if (r[id].responder.trim() && !correoValido(r[id].responder.trim())) p[`${id}-responder`] = "Escriba una dirección completa, o déjela vacía.";
  }
  return p;
}

export function Conexion({ config }: { config: Configuracion }) {
  const queryClient = useQueryClient();
  const [ajustes, setAjustes] = useState<Ajustes>(config.ajustes);
  const [remitentes, setRemitentes] = useState(config.remitentes);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [conexion, setConexion] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<"guardar" | "probar" | "clave" | null>(null);
  const [clave, setClave] = useState(config.clave);
  const [escribiendo, setEscribiendo] = useState(!config.clave.hay);
  const [nueva, setNueva] = useState("");
  const [claveAviso, setClaveAviso] = useState<Aviso | null>(null);

  const mal = problemas(ajustes, remitentes);
  const cambiado = JSON.stringify([ajustes, remitentes]) !== JSON.stringify([config.ajustes, config.remitentes]);
  const poner = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => {
    setAviso(null);
    setAjustes((a) => ({ ...a, [k]: v }));
  };
  const ponerRemitente = (id: Identidad, k: keyof Remitente, v: string) => {
    setAviso(null);
    setRemitentes((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(mal).length > 0) {
      setAviso({ tono: "mal", texto: "Revise los campos marcados antes de guardar." });
      return;
    }
    setOcupado("guardar");
    setAviso(null);
    try {
      const limpios: Ajustes = { ...ajustes, host: ajustes.host.trim().toLowerCase(), usuario: ajustes.usuario.trim(), puerto: String(Number(ajustes.puerto)), topeHora: String(Number(ajustes.topeHora)), topePersona: String(Number(ajustes.topePersona)), dominios: dominiosDe(ajustes.dominios).join(", ") };
      const firmas = Object.fromEntries(IDENTIDADES.map((id) => [id, { nombre: remitentes[id].nombre.trim(), direccion: remitentes[id].direccion.trim().toLowerCase(), responder: remitentes[id].responder.trim().toLowerCase() }])) as Record<Identidad, Remitente>;
      await guardarConexion(limpios, dominiosDe(limpios.dominios), firmas);
      setAjustes(limpios);
      setRemitentes(firmas);
      queryClient.setQueryData<Leido<Configuracion>>(claves.configuracion, (viejo) => (viejo && !viejo.falta ? { falta: false, datos: { ...viejo.datos, ajustes: limpios, remitentes: firmas } } : viejo));
      setAviso({ tono: "ok", texto: limpios.encendido ? "Guardado. Vale desde el próximo correo." : "Guardado. El envío de correos de cuenta quedó apagado." });
    } catch (error) {
      setAviso({ tono: "mal", texto: error instanceof Error ? error.message : "No se guardó." });
    } finally {
      setOcupado(null);
    }
  };

  const probar = async () => {
    if (!ajustes.host.trim()) {
      setConexion({ tono: "mal", texto: "Escriba el servidor antes de probar." });
      return;
    }
    if (mal.host || mal.puerto || mal.usuario) {
      setConexion({ tono: "mal", texto: mal.host ?? mal.puerto ?? mal.usuario });
      return;
    }
    setOcupado("probar");
    setConexion({ tono: "espera", texto: "Probando…" });
    const r = await probarConexion(ajustes);
    setConexion({ tono: r.ok ? "ok" : "mal", texto: r.mensaje });
    setOcupado(null);
  };

  const guardarLaClave = async () => {
    if (!nueva) return;
    setOcupado("clave");
    setClaveAviso(null);
    try {
      const ultimos = await guardarClave(nueva);
      const guardada = { hay: true, ultimos };
      setClave(guardada);
      setNueva("");
      setEscribiendo(false);
      setConexion(null);
      queryClient.setQueryData<Leido<Configuracion>>(claves.configuracion, (viejo) => (viejo && !viejo.falta ? { falta: false, datos: { ...viejo.datos, clave: guardada } } : viejo));
    } catch (error) {
      setClaveAviso({ tono: "mal", texto: error instanceof Error ? error.message : "No se guardó la contraseña." });
    } finally {
      setOcupado(null);
    }
  };

  const error = (k: string) =>
    mal[k] ? (
      <small className="admin-field-error" id={`cor-e-${k}`}>
        {mal[k]}
      </small>
    ) : null;
  const marca = (k: string) => (mal[k] ? { "aria-invalid": true, "aria-describedby": `cor-e-${k}` } : {});

  return (
    <form className="cor-conexion" onSubmit={guardar} noValidate>
      <div className="cor-general">
        <label className="cor-interruptor">
          <input type="checkbox" role="switch" checked={ajustes.encendido} onChange={(e) => poner("encendido", e.target.checked)} />
          <span>
            <strong>El módulo envía los correos de cuenta</strong>
            <small>
              {ajustes.encendido
                ? "Activar la cuenta, cambiar la contraseña y los demás salen con estas plantillas."
                : "Apagado, nadie recibe correos de cuenta: quien pida cambiar su contraseña verá un error. Para volver a los correos de antes se apaga el gancho en el servidor, no este interruptor."}
            </small>
          </span>
        </label>
        <div className="cor-acciones">
          <Estado aviso={aviso ?? (cambiado ? { tono: "aviso", texto: "Hay cambios sin guardar." } : null)} />
          <button type="submit" className="button-primary" disabled={!cambiado || ocupado !== null}>
            {ocupado === "guardar" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="cor-columnas">
        <div className="cor-columna">
          <section className="cor-caja" aria-labelledby="cor-remitentes">
            <h2 id="cor-remitentes">Quién firma</h2>
            <p className="cor-chica">Cada correo sale con la identidad de su plantilla. Dirección vacía usa el usuario de la conexión, que con Microsoft 365 es lo que no falla.</p>
            {IDENTIDADES.map((id) => (
              <fieldset key={id} className="cor-remitente">
                <legend>{MARCAS[id].nombre}</legend>
                <label className="admin-field">
                  <span>Nombre que ve quien recibe</span>
                  <input value={remitentes[id].nombre} maxLength={80} onChange={(e) => ponerRemitente(id, "nombre", e.target.value)} {...marca(`${id}-nombre`)} />
                  {error(`${id}-nombre`)}
                </label>
                <label className="admin-field">
                  <span>
                    Dirección
                    <small>Vacía: la del usuario de la conexión.</small>
                  </span>
                  <input type="email" value={remitentes[id].direccion} autoCapitalize="none" spellCheck={false} onChange={(e) => ponerRemitente(id, "direccion", e.target.value)} {...marca(`${id}-direccion`)} />
                  {error(`${id}-direccion`)}
                </label>
                <label className="admin-field">
                  <span>
                    Responder a
                    <small>Vacío: no se espera respuesta.</small>
                  </span>
                  <input type="email" value={remitentes[id].responder} autoCapitalize="none" spellCheck={false} onChange={(e) => ponerRemitente(id, "responder", e.target.value)} {...marca(`${id}-responder`)} />
                  {error(`${id}-responder`)}
                </label>
              </fieldset>
            ))}
            <p className="cor-chica">Con Microsoft 365, la dirección de cada remitente debe ser el buzón de la conexión o uno sobre el que ese buzón tenga permiso «Enviar como».</p>
          </section>
          <section className="cor-caja" aria-labelledby="cor-no-deseado">
            <h2 id="cor-no-deseado">Para que no caiga en correo no deseado</h2>
            <ul className="cor-dns">
              <li>
                <b>SPF</b>
                <span>El DNS del dominio debe autorizar al servidor que envía los correos.</span>
              </li>
              <li>
                <b>DKIM</b>
                <span>El servidor firma cada correo; la clave pública va en el DNS del dominio.</span>
              </li>
              <li>
                <b>DMARC</b>
                <span>Indica qué hacer con los correos que no pasan SPF ni DKIM.</span>
              </li>
            </ul>
            <p className="cor-chica">La intranet no consulta el DNS: compruebe estos tres registros con quien administra el dominio.</p>
          </section>
        </div>
        <div className="cor-columna">
          <section className="cor-caja" aria-labelledby="cor-smtp">
            <h2 id="cor-smtp">Conexión con el servidor de correo</h2>
            <label className="admin-field">
              <span>Servidor</span>
              <input value={ajustes.host} placeholder="smtp.office365.com" autoCapitalize="none" spellCheck={false} onChange={(e) => poner("host", e.target.value)} {...marca("host")} />
              {error("host")}
            </label>
            <div className="cor-par">
              <label className="admin-field">
                <span>Puerto</span>
                <input value={ajustes.puerto} inputMode="numeric" onChange={(e) => poner("puerto", e.target.value)} {...marca("puerto")} />
                {error("puerto")}
              </label>
              <label className="admin-field">
                <span>Seguridad</span>
                <select value={ajustes.seguridad} onChange={(e) => poner("seguridad", e.target.value === "ssl" ? "ssl" : e.target.value === "none" ? "none" : "starttls")}>
                  <option value="starttls">STARTTLS (con 587)</option>
                  <option value="ssl">SSL/TLS (con 465)</option>
                  <option value="none">Sin cifrado (Mailpit, con 1025)</option>
                </select>
              </label>
            </div>
            <label className="admin-field">
              <span>Usuario</span>
              <input value={ajustes.usuario} placeholder="buzon@udes.edu.co" autoCapitalize="none" autoComplete="off" spellCheck={false} onChange={(e) => poner("usuario", e.target.value)} {...marca("usuario")} />
              {error("usuario")}
            </label>

            <div className="admin-field">
              <span>
                Contraseña
                <small>Se escribe una vez y no vuelve a mostrarse.</small>
              </span>
              {escribiendo ? (
                <div className="cor-clave">
                  <input
                    type="password"
                    autoComplete="new-password"
                    aria-label="Contraseña nueva"
                    placeholder="Escriba la contraseña"
                    value={nueva}
                    onChange={(e) => setNueva(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void guardarLaClave();
                      }
                    }}
                  />
                  <button type="button" className="button-secondary" disabled={!nueva || ocupado !== null} onClick={() => void guardarLaClave()}>
                    {ocupado === "clave" ? "Guardando…" : "Guardar contraseña"}
                  </button>
                  {clave.hay && (
                    <button type="button" className="button-ghost" onClick={() => (setEscribiendo(false), setNueva(""), setClaveAviso(null))}>
                      Cancelar
                    </button>
                  )}
                </div>
              ) : (
                <div className="cor-clave cor-clave--guardada">
                  <span>
                    <Icon name="lock" size={15} />
                    Guardada en el servidor{clave.ultimos ? (
                      <>
                        {" "}
                        · termina en <b>••••{clave.ultimos}</b>
                      </>
                    ) : null}
                  </span>
                  <button type="button" className="button-secondary" onClick={() => setEscribiendo(true)}>
                    Cambiar
                  </button>
                </div>
              )}
              <small>La contraseña se guarda al momento, aparte de «Guardar».</small>
              <Estado aviso={claveAviso} />
            </div>

            <div className="cor-probar">
              <button type="button" className="button-secondary" disabled={ocupado !== null} onClick={() => void probar()}>
                Probar conexión
              </button>
              <Estado aviso={conexion} />
            </div>
            {!config.ajustes.host && (
              <p className="cor-chica">Sin servidor escrito aquí, la función usa la conexión de respaldo de sus variables en Coolify, si la tiene.</p>
            )}
          </section>
          <section className="cor-caja" aria-labelledby="cor-limites">
            <h2 id="cor-limites">Límites y resguardo</h2>
            <label className="admin-field">
              <span>
                Correos por hora, como máximo
                <small>Frena los avisos. Los correos de cuenta salen siempre: nadie se queda sin poder entrar.</small>
              </span>
              <input value={ajustes.topeHora} inputMode="numeric" onChange={(e) => poner("topeHora", e.target.value)} {...marca("topeHora")} />
              {error("topeHora")}
            </label>
            <label className="admin-field">
              <span>
                Correos de cuenta por persona al día
                <small>Evita que alguien use «olvidé mi contraseña» para molestar a otro.</small>
              </span>
              <input value={ajustes.topePersona} inputMode="numeric" onChange={(e) => poner("topePersona", e.target.value)} {...marca("topePersona")} />
              {error("topePersona")}
            </label>
            <label className="admin-field">
              <span>
                Solo se envía a estos dominios
                <small>Vacío: a cualquiera. Un dominio incluye sus subdominios.</small>
              </span>
              <input value={ajustes.dominios} placeholder="udes.edu.co, mail.udes.edu.co" autoCapitalize="none" spellCheck={false} onChange={(e) => poner("dominios", e.target.value)} {...marca("dominios")} />
              {error("dominios")}
            </label>
            {dominiosDe(ajustes.dominios).length > 0 && (
              <p className="cor-chica">Ojo: quien tenga su cuenta con un correo de otro dominio no recibirá ni el de «olvidé mi contraseña».</p>
            )}
          </section>
        </div>
      </div>
    </form>
  );
}
