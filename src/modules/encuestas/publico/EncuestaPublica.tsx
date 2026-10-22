/* =============================================================================
   Encuestas con Pilo · la página pública (/encuesta/:slug).

   Sin cuenta de intranet: Mr. Pilo da la bienvenida, guía el formulario y se
   despide. Tema claro siempre. El recorrido:

     bienvenida → 1 Identificación (dependencia + Microsoft)
                → 2 Qué enviar (lista de logros y retos)
                → 3 Detalle (título, descripción, cifras)
                → 4 Envío y despedida

   El correo lo confirma Microsoft y lo lee la función del token: nunca se
   escribe aquí. El token vive solo en memoria; lo escrito, en sessionStorage
   (lib/borrador.ts), así que un error de red o el viaje a Microsoft no cuestan
   nada. Encuesta cerrada o inexistente: pantalla clara.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cerrarSesionMicrosoft, consumirRegresoMicrosoft, iniciarMicrosoft, tokenDeMicrosoft } from "../../internacionalizacion/contactos/api";
import { datosMicrosoft, enviarAportes, ErrorEncuestas, esCerrada, esDeRed, infoEncuesta, sesionVencida } from "../api";
import { guardarBorrador, leerBorrador } from "../lib/borrador";
import { estaCerrada } from "../lib/tabla";
import type { AporteEnvio, CuentaMicrosoft, InfoEncuesta, TipoAporte } from "../tipos";
import { Bienvenida } from "./Bienvenida";
import { RecorridoNuevo } from "./RecorridoNuevo";
import { Despedida } from "./Despedida";
import type { ResumenEnvio } from "./Despedida";
import { GUIA } from "./frases";
import { Guia } from "./Guia";
import type { MensajeGuia } from "./Guia";
import { Detalle, Elegir, Identificacion } from "./Pasos";
import type { EstadoMicrosoft } from "./Pasos";
import type { DecirGuia } from "./tipos-pub";
import "./publico.css";

type Paso = "id" | "elegir" | "detalle";
const RUTA: readonly string[] = ["Identificación", "Qué enviar", "Detalle", "Envío"];
const PASO_RUTA: Record<Paso | "envio", number> = { id: 0, elegir: 1, detalle: 2, envio: 3 };

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="ep ep-aparte">
      <img src="/logo-udes.svg" alt="Universidad de Santander" />
      <h1>{titulo}</h1>
      <p>{texto}</p>
    </div>
  );
}

export function EncuestaPublica() {
  const { slug = "" } = useParams();
  const info = useQuery({ queryKey: ["encuestas", "info", slug], queryFn: () => infoEncuesta(slug), retry: false, staleTime: 60_000 });

  useEffect(() => {
    const previo = document.title;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = previo;
      meta.remove();
    };
  }, []);
  useEffect(() => {
    document.title = info.data ? `${info.data.titulo} · Planeación Institucional UDES` : "Encuesta · Planeación Institucional UDES";
  }, [info.data]);

  if (info.isPending) return <Aviso titulo="Un momento…" texto="Estoy buscando la encuesta." />;
  if (info.error) {
    const noExiste = info.error instanceof ErrorEncuestas && info.error.estado === 404;
    return (
      <div className="ep ep-aparte">
        <img src="/logo-udes.svg" alt="Universidad de Santander" />
        <h1>{noExiste ? "No encuentro esta encuesta" : "No pude abrir la encuesta"}</h1>
        <p>{noExiste ? "Revise el enlace o pida uno nuevo a Planeación Institucional." : info.error.message}</p>
        {!noExiste && (
          <button type="button" className="ep-btn ep-btn--pri" onClick={() => void info.refetch()}>
            Intentar de nuevo
          </button>
        )}
      </div>
    );
  }
  if (estaCerrada(info.data)) {
    return <Aviso titulo="Esta encuesta ya no recibe respuestas" texto={info.data.mensaje_cierre || "El plazo terminó o Planeación Institucional la cerró. Si todavía tiene algo por contar, escríbales para que la reabran."} />;
  }
  // Las encuestas del modelo nuevo se pintan desde su estructura publicada; la de aportes con cifras (rendicion-2026) sigue su recorrido de siempre.
  if (info.data.flujo === "respuestas" && info.data.estructura) return <RecorridoNuevo slug={slug} info={info.data} estructura={info.data.estructura} />;
  return <Recorrido slug={slug} info={info.data} />;
}

function Recorrido({ slug, info }: { slug: string; info: InfoEncuesta }) {
  const inicial = useRef(leerBorrador(slug));
  const [dependencia, setDependencia] = useState(inicial.current.dependencia);
  const [aportes, setAportes] = useState<AporteEnvio[]>(inicial.current.aportes);
  const [visto, setVisto] = useState(inicial.current.visto);
  const [bienvenida, setBienvenida] = useState(!inicial.current.visto);
  const [paso, setPaso] = useState<Paso>("id");
  const [tipo, setTipo] = useState<TipoAporte>("logro");
  /** Posición del aporte que se está editando; null si es uno nuevo. */
  const [editando, setEditando] = useState<number | null>(null);
  /** Lo último que se quitó, para deshacer durante unos segundos. */
  const [quitado, setQuitado] = useState<{ aporte: AporteEnvio; i: number } | null>(null);
  const relojQuitado = useRef<number>();
  const [cuenta, setCuenta] = useState<CuentaMicrosoft | null>(null);
  const [pase, setPase] = useState<string | null>(null);
  const [ms, setMs] = useState<EstadoMicrosoft>({ fase: "inactivo" });
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [despedida, setDespedida] = useState<ResumenEnvio | null>(null);
  const [cerrada, setCerrada] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeGuia>({ id: 1, texto: GUIA.identificar, gesto: "feliz" });
  const hueco = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLDivElement>(null);
  const regreso = useRef(false);

  const decir = useCallback<DecirGuia>((texto, gesto = "feliz", asiente) => {
    setMensaje((m) => (m.texto === texto && m.gesto === gesto ? m : { id: m.id + 1, texto, gesto, asiente }));
  }, []);

  // Lo escrito se guarda en este navegador a cada cambio.
  useEffect(() => {
    guardarBorrador(slug, { dependencia, visto, aportes });
  }, [slug, dependencia, visto, aportes]);

  // Detrás de la bienvenida o la despedida, la página no recibe foco ni lectores.
  const cubierta = bienvenida || despedida !== null;
  useEffect(() => {
    const el = principal.current as (HTMLDivElement & { inert: boolean }) | null;
    if (el) el.inert = cubierta;
  }, [cubierta]);

  // Al volver de Microsoft: se lee la cuenta, se comprueba con la función y se cierra
  // enseguida la sesión de Supabase de este navegador (quien responde no queda con una de intranet).
  useEffect(() => {
    if (regreso.current) return;
    regreso.current = true;
    if (!consumirRegresoMicrosoft(slug)) return;
    setBienvenida(false);
    setVisto(true);
    setMs({ fase: "verificando" });
    decir(GUIA.verificando, "pensar");
    void (async () => {
      try {
        const token = await tokenDeMicrosoft();
        if (!token) throw new Error("No llegó la confirmación de Microsoft. Pruebe de nuevo.");
        const datos = await datosMicrosoft(slug, token);
        setPase(datos.pase);
        setCuenta(datos);
        setMs({ fase: "inactivo" });
      } catch (e) {
        const m = e instanceof Error ? e.message : "No se pudo confirmar la cuenta de Microsoft.";
        setMs({ fase: "error", mensaje: m });
        decir(GUIA.microsoftFalla, "neutral");
      } finally {
        await cerrarSesionMicrosoft();
      }
    })();
  }, [slug, decir]);

  // Con la cuenta confirmada y la dependencia ya escrita, se sigue sin pedir nada más.
  useEffect(() => {
    if (!cuenta || paso !== "id") return;
    if (dependencia.trim().length >= 3) {
      setPaso("elegir");
      decir(GUIA.confirmada, "emocionado", true);
    } else decir("Ya lo reconozco. Solo me falta la dependencia.", "feliz");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega la cuenta
  }, [cuenta]);

  const alTerminarBienvenida = () => {
    setBienvenida(false);
    setVisto(true);
    decir(GUIA.identificar, "feliz", true);
  };

  const conMicrosoft = async () => {
    guardarBorrador(slug, { dependencia, visto: true, aportes });
    decir("Un momento, voy a abrir Microsoft para que confirme que es usted.", "pensar");
    await iniciarMicrosoft(slug);
  };

  useEffect(() => () => window.clearTimeout(relojQuitado.current), []);

  const quitarAporte = (i: number) => {
    const aporte = aportes[i];
    if (!aporte) return;
    setAportes((l) => l.filter((_, k) => k !== i));
    setQuitado({ aporte, i });
    window.clearTimeout(relojQuitado.current);
    relojQuitado.current = window.setTimeout(() => setQuitado(null), 8000);
  };
  const deshacerQuitar = () => {
    if (!quitado) return;
    const { aporte, i } = quitado;
    setAportes((l) => [...l.slice(0, i), aporte, ...l.slice(i)]);
    setQuitado(null);
    window.clearTimeout(relojQuitado.current);
  };

  const guardarAporte = (a: AporteEnvio) => {
    setAportes((l) => (editando === null ? [...l, a] : l.map((x, k) => (k === editando ? a : x))));
    setEditando(null);
    setPaso("elegir");
    decir(GUIA.guardado, "emocionado", true);
  };

  const enviar = async () => {
    if (!cuenta || !pase) return;
    setEnviando(true);
    setErrorEnvio(null);
    decir(GUIA.enviando, "pensar");
    try {
      await enviarAportes(slug, pase, dependencia, aportes);
      const resumen: ResumenEnvio = {
        dependencia: dependencia.trim().replace(/\s+/g, " "),
        aportes: aportes.length,
        logros: aportes.filter((a) => a.tipo === "logro").length,
        retos: aportes.filter((a) => a.tipo === "reto").length,
        cifras: aportes.reduce((s, a) => s + a.cifras.length, 0),
      };
      setAportes([]);
      guardarBorrador(slug, { dependencia, visto: true, aportes: [] });
      setDespedida(resumen);
    } catch (e) {
      if (sesionVencida(e)) {
        setCuenta(null);
        setPase(null);
        setPaso("id");
        setMs({ fase: "inactivo" });
        decir(GUIA.vencida, "neutral");
        setErrorEnvio(null);
      } else if (esCerrada(e)) {
        setCerrada(true);
      } else {
        const base = e instanceof Error ? e.message : "No se pudo enviar.";
        const campo = e instanceof ErrorEncuestas && e.campo ? ` (${e.campo})` : "";
        setErrorEnvio(esDeRed(e) ? `${base} Sus aportes siguen guardados aquí; pruebe de nuevo.` : `${base}${campo}`);
        decir(GUIA.reintento, "neutral");
      }
    } finally {
      setEnviando(false);
    }
  };

  const otroAporte = () => {
    setDespedida(null);
    setPaso("elegir");
    decir(GUIA.otroMas, "feliz");
  };

  if (cerrada) return <Aviso titulo="Esta encuesta ya no recibe respuestas" texto="Se cerró mientras escribía. Sus aportes quedaron guardados en este navegador; escriba a Planeación Institucional para que la reabran." />;

  const rutaActual = PASO_RUTA[enviando || despedida ? "envio" : paso];

  return (
    <div className="ep">
      <div className="ep-app" ref={principal}>
        <header className="ep-cabeza">
          <img src="/logo-udes.svg" alt="Universidad de Santander" />
          <ol className="ep-ruta" aria-label="Avance">
            {RUTA.map((nombre, i) => (
              <li key={nombre} data-s={i < rutaActual ? "hecho" : i === rutaActual ? "ahora" : undefined} aria-current={i === rutaActual ? "step" : undefined}>
                <i aria-hidden="true" />
                <span>{nombre}</span>
              </li>
            ))}
          </ol>
        </header>
        <p className="ep-titulo-encuesta">{info.titulo}</p>

        <main className="ep-escena">
          <Guia ref={hueco} mensaje={mensaje} oculta={bienvenida} />
          <section className="ep-hoja">
            {paso === "id" || !cuenta ? (
              <Identificacion
                dependencia={dependencia}
                onDependencia={setDependencia}
                cuenta={cuenta}
                microsoft={ms}
                onMicrosoft={conMicrosoft}
                onSeguir={() => {
                  setPaso("elegir");
                  decir(GUIA.confirmada, "emocionado", true);
                }}
                decir={decir}
              />
            ) : paso === "elegir" ? (
              <Elegir
                cuenta={cuenta}
                dependencia={dependencia}
                aportes={aportes}
                enviando={enviando}
                error={errorEnvio}
                onElegir={(t) => {
                  setTipo(t);
                  setEditando(null);
                  setPaso("detalle");
                }}
                onEditar={(i) => {
                  setTipo(aportes[i].tipo);
                  setEditando(i);
                  setPaso("detalle");
                }}
                onQuitar={quitarAporte}
                onEnviar={() => void enviar()}
              />
            ) : (
              <Detalle
                key={`${tipo}:${editando ?? "nuevo"}:${aportes.length}`}
                tipo={tipo}
                inicial={editando === null ? undefined : aportes[editando]}
                onGuardar={guardarAporte}
                onVolver={() => {
                  setEditando(null);
                  setPaso("elegir");
                  decir(GUIA.sinPrisa, "feliz");
                }}
                decir={decir}
              />
            )}
          </section>
        </main>
      </div>

      <div className="ep-deshacer" role="status" aria-live="polite" data-on={quitado ? "1" : undefined}>
        {quitado && (
          <>
            <span>Quitó «{quitado.aporte.titulo}».</span>
            <button type="button" onClick={deshacerQuitar}>
              Deshacer
            </button>
          </>
        )}
      </div>

      {bienvenida && <Bienvenida titulo={info.titulo} intro={info.intro} destino={hueco} onFin={alTerminarBienvenida} />}
      {despedida && <Despedida despedida={info.despedida} resumen={despedida} onOtro={otroAporte} />}
    </div>
  );
}
