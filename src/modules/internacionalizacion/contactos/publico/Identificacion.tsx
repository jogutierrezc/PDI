/* =============================================================================
   Contactos · público · paso 1, «Quién es usted».

   Dos puertas: «Continuar con Microsoft» (para los correos de la UDES: Microsoft
   confirma nombre y correo y aquí solo se pide el cargo) o el formulario a mano
   (nombre, cargo, correo y aceptación del tratamiento de datos). Pilo explica cada
   campo al enfocarlo y avisa con gesto de duda si falta algo.

   El correo se escribe en dos partes: lo anterior a la arroba y el dominio, que se
   elige de una lista con los cinco dominios de la UDES (más los de la invitación).
   Si la persona pega o escribe el correo completo, el dominio se separa solo; si el
   dominio no es institucional, Pilo lo dice y no deja continuar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { analizarCorreo, dominioDeCampus, dominiosAceptados, dominiosSugeridos } from "../../../../../supabase/functions/int-contactos/contactos";
import { identificar, identificarMicrosoft, iniciarMicrosoft, sesionVencida } from "../api";
import type { DatosMicrosoft, InvitacionPublica, Sesion } from "../api";
import { useDecir } from "./GuiaPilo";
import { TEXTO_AUTORIZACION, TEXTO_SUS_DATOS } from "./texto-legal";

/** Lo que dejó el regreso de Microsoft: la cuenta confirmada y el token con el que la función la vuelve a comprobar. */
export interface CuentaMicrosoft extends DatosMicrosoft {
  jwt: string;
}

export type EstadoMicrosoft = { fase: "inactivo" } | { fase: "verificando" } | { fase: "listo"; cuenta: CuentaMicrosoft } | { fase: "error"; mensaje: string };

const IconoMicrosoft = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

const AYUDA = {
  nombre: "Escriba su nombre completo, como aparece en su carné. Solo lo usamos para saber quién nos ayudó.",
  cargo: "Ahora el cargo que tiene hoy en la UDES. Por ejemplo: Directora de programa o Profesor de planta.",
  correo: "Su correo institucional. Escriba lo que va antes de la arroba y elija el dominio de la lista; si prefiere, péguelo completo y yo lo separo.",
  campus: "Elija el campus al que pertenece. Así sabemos a qué sede ayuda con sus contactos.",
  acepta: "Los contactos que va a compartir son datos de otras personas, por eso necesito su aceptación. Es un solo clic.",
} as const;

export function Identificacion({
  token,
  invitacion,
  vencida,
  microsoft,
  onListo,
  onDescartarMicrosoft,
}: {
  token: string;
  invitacion: InvitacionPublica;
  vencida: boolean;
  microsoft: EstadoMicrosoft;
  onListo: (s: Sesion) => void;
  onDescartarMicrosoft: () => void;
}) {
  const decir = useDecir();
  const sugeridos = useMemo(() => dominiosSugeridos(invitacion.dominios), [invitacion.dominios]);
  const aceptados = useMemo(() => dominiosAceptados(invitacion.dominios), [invitacion.dominios]);
  const cuenta = microsoft.fase === "listo" ? microsoft.cuenta : null;

  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [correoTxt, setCorreoTxt] = useState("");
  const [campus, setCampus] = useState("");
  const [dominio, setDominio] = useState(() => dominioDeCampus(invitacion.campus?.name));
  const [dominioTocado, setDominioTocado] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [trampa, setTrampa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [malos, setMalos] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [yendoAMicrosoft, setYendoAMicrosoft] = useState(false);
  const refs = {
    nombre: useRef<HTMLInputElement>(null),
    cargo: useRef<HTMLInputElement>(null),
    correo: useRef<HTMLInputElement>(null),
    campus: useRef<HTMLSelectElement>(null),
    acepta: useRef<HTMLInputElement>(null),
  };

  const analisis = analizarCorreo(correoTxt, dominio, aceptados, sugeridos);
  const campusNombre = invitacion.campus?.name ?? invitacion.campuses.find((c) => c.id === campus)?.name;
  const opcionesDominio = sugeridos.includes(dominio) ? sugeridos : [...sugeridos, dominio];
  const primerNombre = (cuenta?.nombre ?? "").split(" ")[0];

  // Lo primero que dice Pilo: cambia si venimos de Microsoft.
  useEffect(() => {
    if (cuenta) decir(`Hola, ${primerNombre || "bienvenido"}. Microsoft ya confirmó su correo. Solo me falta que me diga su cargo en la UDES.`, "feliz", "Correo confirmado por Microsoft");
    else if (microsoft.fase === "verificando") decir("Estoy confirmando su cuenta con Microsoft, un momento.", "piensa");
    else if (microsoft.fase === "error") decir(microsoft.mensaje, "duda");
    else decir("¡Hola! Soy Mr. Pilo y voy a acompañarlo en todo el camino. Empecemos por lo básico: si tiene correo de la UDES, lo más rápido es continuar con Microsoft.", "feliz");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la fase de Microsoft
  }, [microsoft.fase]);

  // El dominio sigue al campus mientras la persona no lo haya elegido.
  useEffect(() => {
    if (!dominioTocado && !invitacion.campus) setDominio(dominioDeCampus(campusNombre));
  }, [campusNombre, dominioTocado, invitacion.campus]);

  // Un dominio que no es de la UDES: Pilo lo dice (sin apuro, cuando la persona deja de escribir).
  useEffect(() => {
    if (analisis.estado !== "dominio_no_permitido") return;
    const id = window.setTimeout(() => decir(`El dominio @${analisis.escrito} no es institucional. Use un correo de la UDES, por ejemplo @udes.edu.co, o elija el dominio de la lista.`, "duda"), 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo escrito
  }, [analisis.estado, analisis.escrito]);

  const alCorreo = (texto: string) => {
    setCorreoTxt(texto);
    setMalos((m) => {
      const n = new Set(m);
      n.delete("correo");
      return n;
    });
    const a = analizarCorreo(texto, dominio, aceptados, sugeridos);
    if (a.separado && a.estado === "ok" && a.dominio) {
      setCorreoTxt(a.local);
      setDominio(a.dominio);
      setDominioTocado(true);
    }
  };

  const falta = (clave: keyof typeof refs, mensaje: string) => {
    setMalos(new Set([clave]));
    setError(mensaje);
    decir(mensaje, "duda");
    refs[clave].current?.focus();
  };

  const alEnviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMalos(new Set());
    if (trampa || enviando) return;
    if (!cuenta) {
      if (nombre.trim().length < 3) return falta("nombre", "Todavía me falta su nombre completo. Complételo y seguimos.");
    }
    if (cargo.trim().length < 2) return falta("cargo", "Todavía me falta su cargo en la UDES. Complételo y seguimos.");
    if (!cuenta) {
      if (analisis.estado === "dominio_no_permitido") return falta("correo", `El dominio @${analisis.escrito} no es institucional. Use su correo de la UDES o elija el dominio de la lista.`);
      if (analisis.estado !== "ok") return falta("correo", analisis.estado === "vacio" ? "Todavía me falta la primera parte de su correo institucional." : "Ese correo no tiene forma de correo. Revíselo, por favor.");
    }
    if (!invitacion.campus && !campus) return falta("campus", "Elija su campus para poder continuar.");
    if (!acepta) return falta("acepta", "Para continuar necesito que acepte el tratamiento de los datos. Es un solo clic.");
    setEnviando(true);
    try {
      const campusId = invitacion.campus ? null : campus;
      if (cuenta) onListo(await identificarMicrosoft(token, cuenta.jwt, { cargo, campus_id: campusId, nombre: cuenta.nombre ? undefined : nombre }));
      else onListo(await identificar(token, { nombre, cargo, correo: analisis.correo, campus_id: campusId }));
    } catch (err) {
      if (cuenta && sesionVencida(err)) {
        onDescartarMicrosoft();
        setError("La confirmación de Microsoft venció. Pulse «Continuar con Microsoft» otra vez o use el formulario.");
        return;
      }
      const m = err instanceof Error ? err.message : "No se pudo continuar. Intente de nuevo.";
      setError(m);
      decir(m, "duda");
    } finally {
      setEnviando(false);
    }
  };

  const conMicrosoft = async () => {
    setError(null);
    setYendoAMicrosoft(true);
    decir("Un momento, voy a abrir Microsoft para que confirme que es usted.", "piensa");
    try {
      await iniciarMicrosoft(token);
    } catch (e) {
      setYendoAMicrosoft(false);
      const m = `No se pudo abrir Microsoft${e instanceof Error ? `: ${e.message}` : "."} Puede escribir sus datos aquí abajo.`;
      setError(m);
      decir(m, "duda");
    }
  };

  const ayuda = (clave: keyof typeof AYUDA) => () => decir(AYUDA[clave], "idea");
  const ocupado = enviando || microsoft.fase === "verificando";

  return (
    <form className="cp-panel" onSubmit={alEnviar} data-entra noValidate aria-label="Sus datos">
      <p className="cp-aviso" data-entra>
        <b>{invitacion.nombre}</b> · Periodo {invitacion.periodo}
        {invitacion.campus ? ` · Campus ${invitacion.campus.name}` : ""} · vigente hasta el {new Date(`${invitacion.vence}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      {vencida && (
        <p className="cp-aviso is-mal" role="alert">
          Su sesión venció. Vuelva a identificarse con el mismo correo.
        </p>
      )}

      {cuenta ? (
        <div className="cp-cuenta" data-entra>
          <span className="cp-sello">
            <IconoMicrosoft /> Correo confirmado por Microsoft
          </span>
          <b>{cuenta.nombre || "Cuenta de Microsoft"}</b>
          <span className="cp-ayuda">{cuenta.correo}</span>
          <button type="button" className="cp-enlace" onClick={onDescartarMicrosoft}>
            No es usted, usar el formulario
          </button>
        </div>
      ) : (
        <div data-entra>
          <button type="button" className="cp-ms" onClick={() => void conMicrosoft()} disabled={yendoAMicrosoft || ocupado}>
            <IconoMicrosoft />
            <span>{yendoAMicrosoft ? "Abriendo Microsoft…" : microsoft.fase === "verificando" ? "Confirmando con Microsoft…" : "Continuar con Microsoft"}</span>
          </button>
          <div className="cp-dom" aria-label="Correos que admite Microsoft">
            {sugeridos.map((d) => (
              <code key={d}>{d}</code>
            ))}
          </div>
        </div>
      )}

      {microsoft.fase === "error" && (
        <p className="cp-aviso is-mal" role="alert">
          {microsoft.mensaje} Puede escribir sus datos en el formulario.
        </p>
      )}

      {!cuenta && (
        <>
          <div className="cp-o" data-entra>
            o escríbalos usted
          </div>
          <div className="cp-campos" data-entra>
            <label className="cp-campo" data-malo={malos.has("nombre") || undefined}>
              <span>Nombre completo</span>
              <input ref={refs.nombre} value={nombre} onChange={(e) => setNombre(e.target.value)} onFocus={ayuda("nombre")} autoComplete="name" maxLength={160} required placeholder="Laura Mendoza Ortiz" />
            </label>
          </div>
        </>
      )}

      <div className="cp-campos" data-entra>
        <label className="cp-campo" data-malo={malos.has("cargo") || undefined}>
          <span>Cargo en la UDES</span>
          <input ref={refs.cargo} value={cargo} onChange={(e) => setCargo(e.target.value)} onFocus={ayuda("cargo")} autoComplete="organization-title" maxLength={120} required placeholder="Directora de programa" />
        </label>

        {!cuenta && (
          <div className="cp-campo" data-malo={malos.has("correo") || analisis.estado === "dominio_no_permitido" || undefined}>
            <label htmlFor="cp-correo-local">Correo institucional</label>
            <div className="cp-sufijo">
              <input
                id="cp-correo-local"
                ref={refs.correo}
                type="text"
                inputMode="email"
                value={correoTxt}
                onChange={(e) => alCorreo(e.target.value)}
                onFocus={ayuda("correo")}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                placeholder="lmendoza"
                aria-describedby="cp-correo-ayuda"
                aria-invalid={analisis.estado === "dominio_no_permitido" || analisis.estado === "invalido" || undefined}
              />
              <select
                aria-label="Dominio del correo"
                value={dominio}
                onChange={(e) => {
                  setDominio(e.target.value);
                  setDominioTocado(true);
                }}
              >
                {opcionesDominio.map((d) => (
                  <option key={d} value={d}>
                    {`@${d}`}
                  </option>
                ))}
              </select>
            </div>
            <span id="cp-correo-ayuda" className={analisis.estado === "dominio_no_permitido" || analisis.estado === "invalido" ? "cp-error" : "cp-ayuda"}>
              {analisis.estado === "dominio_no_permitido"
                ? `El dominio @${analisis.escrito} no es institucional: elija uno de la lista.`
                : analisis.estado === "invalido"
                  ? "Use solo letras, números, punto y guion antes de la arroba."
                  : analisis.estado === "ok"
                    ? analisis.correo
                    : "Escriba lo que va antes de la arroba y elija el dominio, o pegue el correo completo."}
            </span>
          </div>
        )}

        {!invitacion.campus && (
          <label className="cp-campo" data-malo={malos.has("campus") || undefined}>
            <span>Su campus</span>
            <select ref={refs.campus} value={campus} onChange={(e) => setCampus(e.target.value)} onFocus={ayuda("campus")} required>
              <option value="">Elija…</option>
              {invitacion.campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="cp-honey" aria-hidden="true">
          <label>
            No llenar este campo
            <input tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
          </label>
        </div>
      </div>

      <label className="cp-check" data-entra data-malo={malos.has("acepta") || undefined}>
        <input ref={refs.acepta} type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} onFocus={ayuda("acepta")} />
        <span>{TEXTO_AUTORIZACION}</span>
      </label>

      {error && (
        <p className="cp-aviso is-mal" role="alert">
          {error}
        </p>
      )}

      <div className="cp-acciones" data-entra>
        <span className="cp-ayuda">{TEXTO_SUS_DATOS}</span>
        <button type="submit" className="cp-btn cp-btn--pri" disabled={ocupado}>
          {enviando ? "Un momento…" : "Continuar"}
        </button>
      </div>
    </form>
  );
}
