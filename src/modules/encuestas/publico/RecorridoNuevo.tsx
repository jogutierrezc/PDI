/* =============================================================================
   Encuestas con Pilo · el recorrido de una encuesta del modelo nuevo (0184).

     bienvenida (guiado) → identificación (Microsoft) o verificación (abierta)
                         → formulario (guiado por Pilo o clásico) → salida

   Con Microsoft: el correo lo confirma la función; con acceso abierto no hay
   sesión: una cuenta sencilla contra robots y, si la encuesta pide datos
   personales, el nombre y el consentimiento. Lo escrito se guarda en el
   navegador (sessionStorage) para que un error de red no cueste nada.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cerrarSesionMicrosoft, consumirRegresoMicrosoft, iniciarMicrosoft, tokenDeMicrosoft } from "../../internacionalizacion/contactos/api";
import { datosMicrosoft, enviarRespuesta, ErrorEncuestas, esCerrada, esDeRed, pedirReto, sesionVencida } from "../api";
import { leerConfig } from "../lib/config";
import { preguntasVisibles, valoresVisibles } from "../lib/estructura";
import type { Estructura, Valores } from "../lib/estructura";
import type { CuentaMicrosoft, InfoEncuesta } from "../tipos";
import { Bienvenida } from "./Bienvenida";
import { Formulario } from "./Formulario";
import { GUIA } from "./frases";
import { Guia } from "./Guia";
import type { MensajeGuia } from "./Guia";
import { IconoMicrosoft } from "./Pasos";
import { estiloTema, resumenDe, Salida } from "./Salida";
import type { LineaResumen } from "./Salida";

const llave = (slug: string) => `encuesta:${slug}:valores`;
function leer(slug: string): { valores: Valores; visto: boolean } {
  try {
    const j = JSON.parse(window.sessionStorage.getItem(llave(slug)) ?? "null") as { valores?: Valores; visto?: boolean } | null;
    return { valores: j?.valores && typeof j.valores === "object" ? j.valores : {}, visto: j?.visto === true };
  } catch {
    return { valores: {}, visto: false };
  }
}
function guardar(slug: string, valores: Valores, visto: boolean) {
  try {
    window.sessionStorage.setItem(llave(slug), JSON.stringify({ valores, visto }));
  } catch {
    // sin almacenamiento: vale mientras la página siga abierta
  }
}

export function RecorridoNuevo({ slug, info, estructura }: { slug: string; info: InfoEncuesta; estructura: Estructura }) {
  const config = useMemo(() => leerConfig(info.config_pilo), [info.config_pilo]);
  const guiado = info.modo_llenado !== "clasico";
  const abierta = info.acceso === "abierta";
  const inicial = useRef(leer(slug));
  const [valores, setValores] = useState<Valores>(inicial.current.valores);
  const [bienvenida, setBienvenida] = useState(guiado && !inicial.current.visto);
  const [cuenta, setCuenta] = useState<CuentaMicrosoft | null>(null);
  const [pase, setPase] = useState<string | null>(null);
  const [ms, setMs] = useState<{ fase: "inactivo" | "verificando" | "abriendo" | "error"; mensaje?: string }>({ fase: "inactivo" });
  const [reto, setReto] = useState<{ pregunta: string; pase: string } | null>(null);
  const [respuestaReto, setRespuestaReto] = useState("");
  const [nombre, setNombre] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaResumen[] | null>(null);
  const [cerrada, setCerrada] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeGuia>({ id: 1, texto: GUIA.identificar, gesto: config.presentacion.pose });
  const hueco = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLDivElement>(null);
  const regreso = useRef(false);

  const decir = useCallback((texto: string, gesto: MensajeGuia["gesto"] = "feliz", asiente?: boolean) => setMensaje((m) => (m.texto === texto && m.gesto === gesto ? m : { id: m.id + 1, texto, gesto, asiente })), []);

  useEffect(() => guardar(slug, valores, !bienvenida), [slug, valores, bienvenida]);
  useEffect(() => {
    const el = principal.current as (HTMLDivElement & { inert: boolean }) | null;
    if (el) el.inert = bienvenida;
  }, [bienvenida]);

  // Acceso abierto: el reto contra robots.
  const nuevoReto = useCallback(() => {
    setRespuestaReto("");
    pedirReto(slug).then(setReto, () => setReto(null));
  }, [slug]);
  useEffect(() => {
    if (abierta && config.verificacionRobots) nuevoReto();
  }, [abierta, config.verificacionRobots, nuevoReto]);

  // Al volver de Microsoft: se lee la cuenta, se confirma con la función y se cierra la sesión de este navegador.
  useEffect(() => {
    if (regreso.current || abierta) return;
    regreso.current = true;
    if (!consumirRegresoMicrosoft(slug)) return;
    setBienvenida(false);
    setMs({ fase: "verificando" });
    decir(GUIA.verificando, "pensar");
    void (async () => {
      try {
        const token = await tokenDeMicrosoft();
        if (!token) throw new Error("No llegó la confirmación de Microsoft. Pruebe de nuevo.");
        const d = await datosMicrosoft(slug, token);
        setPase(d.pase);
        setCuenta(d);
        setMs({ fase: "inactivo" });
        decir(GUIA.confirmada, "emocionado", true);
      } catch (e) {
        setMs({ fase: "error", mensaje: e instanceof Error ? e.message : "No se pudo confirmar la cuenta de Microsoft." });
        decir(GUIA.microsoftFalla, "neutral");
      } finally {
        await cerrarSesionMicrosoft();
      }
    })();
  }, [slug, abierta, decir]);

  const conMicrosoft = async () => {
    guardar(slug, valores, true);
    setMs({ fase: "abriendo" });
    decir("Un momento, voy a abrir Microsoft para que confirme que es usted.", "pensar");
    try {
      await iniciarMicrosoft(slug);
    } catch (e) {
      setMs({ fase: "error", mensaje: `No se pudo abrir Microsoft${e instanceof Error && e.message ? `: ${e.message}` : "."} Pruebe de nuevo.` });
    }
  };

  const visibles = useMemo(() => preguntasVisibles(estructura, valores), [estructura, valores]);

  const enviar = async () => {
    setEnviando(true);
    setErrorEnvio(null);
    decir(GUIA.enviando, "pensar");
    try {
      const limpios = valoresVisibles(estructura, valores);
      await enviarRespuesta(slug, {
        valores: limpios,
        ...(abierta ? { reto_pase: reto?.pase, reto_respuesta: respuestaReto, nombre: config.datosPersonales ? nombre : undefined, consentimiento: config.datosPersonales ? consentimiento : undefined } : { pase: pase ?? undefined }),
      });
      setLineas(resumenDe(visibles, limpios));
      setValores({});
      guardar(slug, {}, true);
    } catch (e) {
      if (!abierta && sesionVencida(e)) {
        setCuenta(null);
        setPase(null);
        decir(GUIA.vencida, "neutral");
      } else if (esCerrada(e)) setCerrada(true);
      else {
        const base = e instanceof Error ? e.message : "No se pudo enviar.";
        if (e instanceof ErrorEncuestas && e.codigo === "robot") nuevoReto();
        setErrorEnvio(esDeRed(e) ? `${base} Sus respuestas siguen guardadas aquí; pruebe de nuevo.` : base);
        decir(GUIA.reintento, "neutral");
      }
    } finally {
      setEnviando(false);
    }
  };

  const logo = config.tema.logo || "/logo-udes.svg";
  if (cerrada) {
    return (
      <div className="ep ep-aparte" style={estiloTema(config)}>
        <img src={logo} alt="Universidad de Santander" />
        <h1>Esta encuesta ya no recibe respuestas</h1>
        <p>{info.mensaje_cierre || "Se cerró mientras respondía."}</p>
      </div>
    );
  }

  const identificado = abierta || cuenta !== null;
  const extra = abierta ? (
    <div className="ep-verificacion">
      {config.datosPersonales && (
        <>
          <div className="ep-campo">
            <label htmlFor="ep-nombre">Su nombre (opcional)</label>
            <input id="ep-nombre" className="ep-input" maxLength={120} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <label className="ep-eleccion">
            <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} />
            <span>{config.consentimiento || "Autorizo el tratamiento de mis datos personales para esta encuesta."}</span>
          </label>
        </>
      )}
      {config.verificacionRobots && (
        <div className="ep-campo">
          <label htmlFor="ep-reto">{reto?.pregunta ?? "Preparando la verificación…"}</label>
          <input id="ep-reto" className="ep-input ep-input--corto" inputMode="numeric" autoComplete="off" disabled={!reto} value={respuestaReto} onChange={(e) => setRespuestaReto(e.target.value)} />
          <span className="ep-fino">Esta cuenta confirma que es una persona y no un programa.</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="ep" style={estiloTema(config)} data-modo={guiado ? "guiado" : "clasico"}>
      <div className="ep-app" ref={principal}>
        <header className="ep-cabeza">
          <img src={logo} alt="Universidad de Santander" />
        </header>
        {config.tema.imagen && <img className="ep-cabecera-img" src={config.tema.imagen} alt="" />}
        <p className="ep-titulo-encuesta">{info.titulo}</p>

        <main className={guiado ? "ep-escena" : "ep-escena ep-escena--clasica"}>
          {guiado && <Guia ref={hueco} mensaje={mensaje} oculta={bienvenida} />}
          <section className="ep-hoja">
            {lineas ? (
              <Salida titulo={info.titulo} despedida={info.despedida} config={config} lineas={lineas} onOtra={() => setLineas(null)} />
            ) : !identificado ? (
              <div className="ep-panel">
                <h2>Identifíquese con su correo institucional</h2>
                <p className="ep-lede">Solo ingresan los correos permitidos. Verificamos su cuenta con Microsoft y no guardamos su contraseña.</p>
                {ms.fase === "error" && (
                  <p className="ep-error ep-error--bloque" role="alert">
                    {ms.mensaje}
                  </p>
                )}
                <div className="ep-acciones">
                  <button type="button" className="ep-btn ep-btn--pri" disabled={ms.fase === "verificando" || ms.fase === "abriendo"} onClick={() => void conMicrosoft()}>
                    <IconoMicrosoft />
                    <span>{ms.fase === "abriendo" ? "Abriendo Microsoft…" : ms.fase === "verificando" ? "Confirmando con Microsoft…" : "Continuar con Microsoft"}</span>
                  </button>
                </div>
                <p className="ep-fino">Correos admitidos: {(info.dominios ?? []).map((d) => `@${d}`).join(", ")}.</p>
              </div>
            ) : (
              <>
                {cuenta && (
                  <div className="ep-verificado" role="status">
                    <span>
                      Correo confirmado por Microsoft: <b>{cuenta.correo}</b>
                    </span>
                  </div>
                )}
                <Formulario estructura={estructura} config={config} modo={guiado ? "guiado" : "clasico"} valores={valores} onValores={setValores} enviando={enviando} errorEnvio={errorEnvio} onEnviar={() => void enviar()} extra={extra} />
              </>
            )}
          </section>
        </main>
      </div>
      {bienvenida && <Bienvenida titulo={info.titulo} intro={config.presentacion.mensaje || info.intro} destino={hueco} vozInicial={config.presentacion.voz} onFin={() => { setBienvenida(false); decir(GUIA.identificar, config.presentacion.pose, true); }} />}
    </div>
  );
}
