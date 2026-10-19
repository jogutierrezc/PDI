/* =============================================================================
   Contactos · la página pública del enlace de invitación (/contactos/i/:token).

   Un proceso guiado de cuatro pasos con Mr. Pilo hablando en cada uno:
     1 Quién es usted      «Continuar con Microsoft» o nombre, cargo y correo
     2 Cómo aportar        académicos o empleadores · uno a uno o importar un archivo
     3 Sus contactos       el formulario (con ayuda de Pilo por campo) o el archivo
     4 Recibido            Pilo celebra; sale cada vez que un envío termina bien
   Lo que se envía cae en la carpeta «Contactos» de Tablas, con el nombre, el cargo y
   el correo de quien lo aportó en cada fila. Migraciones 0167 y 0171; función int-contactos.

   El correo se confirma solo si la persona entra con Microsoft (0171); a mano se
   comprueba el dominio permitido. Tema claro, oscuro o automático (solo en esta página).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { useEntrada, usePresion } from "../../ui/movimiento";
import { cerrarSesionMicrosoft, consumirRegresoMicrosoft, datosMicrosoft, ErrorContactos, guardarSesion, infoInvitacion, leerSesion, olvidarSesion, tokenDeMicrosoft } from "../api";
import type { InvitacionPublica, Sesion } from "../api";
import { ComoAportar } from "./ComoAportar";
import { CaraPilo, DecirProvider, PiloHabla, Titular } from "./GuiaPilo";
import type { Decir, MensajePilo } from "./GuiaPilo";
import { Identificacion } from "./Identificacion";
import type { EstadoMicrosoft } from "./Identificacion";
import { ImportarArchivo } from "./ImportarArchivo";
import { MisAportes } from "./MisAportes";
import { Recibido } from "./Recibido";
import { atributoTema, InterruptorTema, useTema } from "./tema";
import { UnoAUno } from "./UnoAUno";
import "./publico.css";

type Pantalla = "camino" | "uno" | "importar" | "mis" | "recibido";

const MOTIVO_CERRADA: Record<Exclude<InvitacionPublica["estado"], "activa">, string> = {
  pausada: "La invitación está en pausa. Pida a Planeación Institucional que la reactive.",
  vencida: "La invitación ya venció. Si todavía tiene contactos por compartir, pida a Planeación Institucional que le envíe una nueva.",
  periodo_cerrado: "El periodo de esta invitación ya cerró y no se reciben más contactos.",
};

/** Lo que dice la página grande en cada pantalla: titular, bajada y a qué paso del recorrido pertenece. */
export const TITULARES: Record<"identificar" | Pantalla, { paso: 1 | 2 | 3 | 4; titulo: string; bajada: string }> = {
  identificar: { paso: 1, titulo: "Primero necesitamos saber quién es usted.", bajada: "Son tres datos y menos de un minuto." },
  camino: { paso: 2, titulo: "Ahora cuénteme cómo prefiere compartir sus contactos.", bajada: "Puede hacerlo uno por uno o subir una lista completa." },
  mis: { paso: 2, titulo: "Esto es lo que ya me ha enviado.", bajada: "Puede quitar un contacto mientras su campus no envíe la hoja a revisión." },
  uno: { paso: 3, titulo: "Escriba los datos de su contacto, yo le voy diciendo qué poner.", bajada: "Cada vez que toque un campo le explico qué va ahí." },
  importar: { paso: 3, titulo: "Suba su archivo y yo lo reviso antes de enviarlo.", bajada: "Son tres pasos y le aviso si algo no cuadra." },
  recibido: { paso: 4, titulo: "¡Felicidades! Los datos compartidos fueron recibidos con éxito.", bajada: "Gracias por ayudarnos a construir las relaciones de la UDES con el mundo." },
};

const PASOS = ["Quién es usted", "Cómo aportar", "Sus contactos", "Recibido"] as const;
const SALUDO = "¡Hola! Soy Mr. Pilo y voy a acompañarlo en todo el camino. Empecemos por lo básico: si tiene correo de la UDES, lo más rápido es continuar con Microsoft.";

export function ContactosPublico() {
  const { token = "" } = useParams();
  const info = useQuery({ queryKey: ["int-contactos", "info", token], queryFn: () => infoInvitacion(token), retry: false, staleTime: 60_000 });
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion(token));
  const [pantalla, setPantalla] = useState<Pantalla>("camino");
  const [tipo, setTipo] = useState<TipoContacto>("academico");
  const [recibidos, setRecibidos] = useState(0);
  const [vencida, setVencida] = useState(false);
  const [ms, setMs] = useState<EstadoMicrosoft>({ fase: "inactivo" });
  const [tema, setTema] = useTema();
  const [mensaje, setMensaje] = useState<MensajePilo>({ id: 1, texto: SALUDO, gesto: "feliz" });
  const raiz = useRef<HTMLDivElement>(null);
  const regreso = useRef(false);

  const decir = useCallback<Decir>((texto, gesto = "idea", nota) => {
    setMensaje((m) => (m.texto === texto && m.gesto === gesto && m.nota === nota ? m : { id: m.id + 1, texto, gesto, nota }));
  }, []);

  useEffect(() => {
    const previo = document.title;
    document.title = "Compartir contactos · Planeación Institucional UDES";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previo;
      meta.remove();
    };
  }, []);

  // Al volver de Microsoft: se lee la cuenta, se comprueba con la función y se cierra
  // enseguida la sesión de Supabase de este navegador (el invitado no queda con una de intranet).
  useEffect(() => {
    if (regreso.current) return;
    regreso.current = true;
    if (!consumirRegresoMicrosoft(token)) return;
    setMs({ fase: "verificando" });
    void (async () => {
      try {
        const jwt = await tokenDeMicrosoft();
        if (!jwt) throw new Error("No llegó la confirmación de Microsoft. Pruebe de nuevo o escriba sus datos.");
        const datos = await datosMicrosoft(token, jwt);
        setMs({ fase: "listo", cuenta: { ...datos, jwt } });
      } catch (e) {
        setMs({ fase: "error", mensaje: e instanceof Error ? e.message : "No se pudo confirmar la cuenta de Microsoft." });
      } finally {
        await cerrarSesionMicrosoft();
      }
    })();
  }, [token]);

  // El primer tipo que la invitación recibe.
  useEffect(() => {
    if (info.data && !info.data.tipos.includes(tipo)) setTipo(info.data.tipos[0] ?? "academico");
  }, [info.data, tipo]);

  const invitacion = info.data;
  const cerrada = invitacion && invitacion.estado !== "activa" ? invitacion : null;
  useEffect(() => {
    if (cerrada) decir("Lo siento, por ahora este enlace no está recibiendo contactos.", "duda");
  }, [cerrada?.estado]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambia el estado

  useEffect(() => {
    if (info.error) decir("No encuentro esa invitación. Revise el enlace o pida uno nuevo a Planeación Institucional.", "duda");
  }, [info.error]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega el error

  const salir = () => {
    olvidarSesion(token);
    setSesion(null);
    setPantalla("camino");
    setMs({ fase: "inactivo" });
    decir("Sin problema. Cuéntenos quién es y seguimos.", "idea");
  };
  const sesionVencida = () => {
    olvidarSesion(token);
    setSesion(null);
    setVencida(true);
    setMs({ fase: "inactivo" });
  };

  const campusNombre = invitacion ? (invitacion.campus?.name ?? invitacion.campuses.find((c) => c.id === sesion?.campus_id)?.name ?? "") : "";
  const vista: "identificar" | Pantalla = sesion ? pantalla : "identificar";

  useEntrada(raiz, "[data-entra]", `${vista}|${ms.fase}|${info.data?.estado ?? ""}`);
  usePresion(raiz, ".cp-btn, .cp-camino, .cp-ms, .cp-seg button");

  let cuerpo;
  let titulos: { paso: number; titulo: string; bajada: string } | null = null;
  if (info.isPending) {
    cuerpo = (
      <p className="cp-ayuda cp-centrado" role="status">
        Abriendo la invitación…
      </p>
    );
  } else if (info.error || !invitacion) {
    const e = info.error;
    const noValido = e instanceof ErrorContactos && e.estado === 404;
    titulos = {
      paso: 0,
      titulo: noValido ? "Este enlace no es válido" : "No se pudo abrir la invitación",
      bajada: noValido ? "Revise que haya copiado el enlace completo o pida uno nuevo a Planeación Institucional." : e instanceof Error ? e.message : "Intente de nuevo en un momento.",
    };
  } else if (cerrada) {
    titulos = { paso: 0, titulo: "Esta invitación no recibe contactos", bajada: MOTIVO_CERRADA[cerrada.estado as Exclude<InvitacionPublica["estado"], "activa">] };
  } else if (!sesion) {
    titulos = TITULARES.identificar;
    cuerpo = (
      <Identificacion
        token={token}
        invitacion={invitacion}
        vencida={vencida}
        microsoft={ms}
        onListo={(s) => {
          guardarSesion(token, s);
          setSesion(s);
          setVencida(false);
          setMs({ fase: "inactivo" });
          setPantalla("camino");
        }}
        onDescartarMicrosoft={() => setMs({ fase: "inactivo" })}
      />
    );
  } else {
    titulos = TITULARES[pantalla];
    if (pantalla === "uno") {
      cuerpo = (
        <UnoAUno
          token={token}
          sesion={sesion}
          tipo={tipo}
          onVolver={() => setPantalla("camino")}
          onSesionVencida={sesionVencida}
          onTerminado={(n) => {
            setRecibidos(n);
            setPantalla("recibido");
          }}
        />
      );
    } else if (pantalla === "importar") {
      cuerpo = (
        <ImportarArchivo
          token={token}
          sesion={sesion}
          tipo={tipo}
          onVolver={() => setPantalla("camino")}
          onSesionVencida={sesionVencida}
          onEnviado={(n) => {
            setRecibidos(n);
            setPantalla("recibido");
          }}
        />
      );
    } else if (pantalla === "mis") cuerpo = <MisAportes token={token} sesion={sesion} onVolver={() => setPantalla("camino")} onSesionVencida={sesionVencida} />;
    else if (pantalla === "recibido") cuerpo = <Recibido contactos={recibidos} campus={campusNombre} periodo={invitacion.periodo} nombre={sesion.nombre} onMas={() => setPantalla("camino")} onMis={() => setPantalla("mis")} />;
    else {
      cuerpo = (
        <ComoAportar
          token={token}
          sesion={sesion}
          invitacion={invitacion}
          campusNombre={campusNombre}
          tipo={tipo}
          onTipo={setTipo}
          onUno={() => setPantalla("uno")}
          onImportar={() => setPantalla("importar")}
          onMis={() => setPantalla("mis")}
          onSalir={salir}
          onSesionVencida={sesionVencida}
        />
      );
    }
  }

  const paso = titulos?.paso ?? 0;

  return (
    <div className="cp" ref={raiz} data-theme={atributoTema(tema)}>
      <header className="cp-top">
        <div className="cp-marca">
          <span className="cp-avatar" aria-hidden="true">
            <CaraPilo gesto="feliz" tamano={40} />
          </span>
          <span>
            <b>Planeación Institucional UDES</b>
            <small>Universidad de Santander · con Mr. Pilo</small>
          </span>
        </div>
        <div className="cp-top-der">
          <span className="cp-quien">
            {sesion ? (
              <>
                <span>
                  {sesion.nombre}
                  {campusNombre ? ` · Campus ${campusNombre}` : ""}
                </span>
                {sesion.correo_verificado && <span className="cp-sello">Correo confirmado por Microsoft</span>}
                <button type="button" onClick={salir}>
                  No soy yo
                </button>
              </>
            ) : (
              "Invitación para compartir contactos"
            )}
          </span>
          <InterruptorTema tema={tema} onTema={setTema} />
        </div>
      </header>

      {invitacion && !cerrada && !info.error && (
        <ol className="cp-ruta" aria-label="Progreso">
          {PASOS.map((nombre, i) => (
            <li key={nombre} data-s={i + 1 < paso ? "hecho" : i + 1 === paso ? "ahora" : undefined} aria-current={i + 1 === paso ? "step" : undefined}>
              <i />
              <span>
                {i + 1} · {nombre}
              </span>
            </li>
          ))}
        </ol>
      )}

      <DecirProvider value={decir}>
        <main className="cp-main">
          {info.isPending ? (
            cuerpo
          ) : (
            <div className="cp-escena" data-solo={cuerpo ? undefined : ""}>
              <section className="cp-historia">
                {paso > 0 ? (
                  <span className="cp-eyebrow">
                    <i>{paso}</i>
                    <span>Paso {paso} de 4</span>
                  </span>
                ) : (
                  invitacion && <span className="cp-eyebrow">{invitacion.nombre}</span>
                )}
                {titulos && <Titular texto={titulos.titulo} bajada={titulos.bajada} clave={`${vista}|${titulos.titulo}`} />}
                <PiloHabla mensaje={mensaje} />
              </section>
              {cuerpo && <div className="cp-escenario">{cuerpo}</div>}
            </div>
          )}
        </main>
      </DecirProvider>

      <footer className="cp-pie">Universidad de Santander · Planeación Institucional</footer>
    </div>
  );
}
