/* =============================================================================
   Chat · TanStack AI (useChat + herramientas de cliente) contra la función pilo-work.

   El servidor habla el protocolo de streaming de TanStack AI (AG-UI sobre SSE) con el
   mismo modelo que usa Pilo. Las tarjetas de herramienta salen de las partes
   «tool-call» de cada mensaje. Las herramientas que escriben o sacan algo del equipo
   esperan la aprobación de la persona (herramientas.ts → puente).

   Nunca queda «pensando» para siempre: el servidor siempre cierra con RUN_FINISHED o
   RUN_ERROR; aquí un vigilante avisa si pasan ~25 s sin ninguna señal (sin contar el tiempo
   que la persona tarda en aprobar) y ofrece Reintentar y Cancelar de verdad (stop()).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import gsap from "gsap";
import { authHeaders, functionUrl } from "../api";
import { esquemaPermitido, datosAbiertos } from "../datos";
import { herramientasPara, puente } from "../herramientas";
import type { Aprobacion } from "../herramientas";
import { limpiarRespuesta } from "../limpiar";
import { useMs } from "../ms";
import { movimientoReducido } from "../../rankings/movimiento";
import { Cara, IC, Md, useWork } from "../ui";
import type { ModeloUsado } from "../ui";

const IDEAS = ["Redacta un oficio para Talento Humano", "¿Cuántos correos llegaron hoy?", "Cuenta estudiantes por programa en mi Excel", "Escribe un script para consolidar libros de Excel"];
/** Sin ninguna señal del servidor durante este tiempo, se avisa y se ofrece reintentar o cancelar. */
const SILENCIO_MS = 25_000;

const NOMBRE: Record<string, string> = {
  buscar_memoria: "Memoria · búsqueda de reglas",
  aplicar_skill: "Skill · instrucciones",
  crear_documento: "Documento · borrador en Cowork",
  leer_datos_locales: "Datos locales · cálculo en su equipo",
  contar_correos: "Correo · conteo (solo lectura)",
  listar_correos: "Correo · bandeja (solo lectura)",
  leer_correo: "Correo · lectura de un mensaje",
  resumir_correo: "Correo · lectura para resumir",
  organizar_correo: "Correo · organizar (con su aprobación)",
  crear_borrador: "Correo · borrador (no se envía)",
  ver_agenda: "Agenda · leer calendario",
  proponer_horarios: "Agenda · horarios libres",
  crear_reunion: "Agenda · crear reunión",
  listar_archivos: "Archivos · listar",
  leer_archivo: "Archivos · lectura",
  crear_carpeta: "Archivos · crear carpeta",
  guardar_archivo: "Archivos · guardar",
  proponer_perfil: "Perfil · cambio propuesto",
};

function parsear(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function Resumen({ nombre, salida, abrir }: { nombre: string; salida: unknown; abrir: (ruta: string) => void }) {
  const o = parsear(salida);
  if (!o) return <>Listo</>;
  if (o.error) return <span className="err">{String(o.error)}</span>;
  if (o.denegado) return <>No aprobado · no se hizo nada</>;
  if (nombre === "crear_documento")
    return (
      <div className="doc">
        {IC.cow}
        <div>
          <b>{String(o.titulo ?? "Documento")}</b>
        </div>
        <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => abrir(`cowork?doc=${String(o.documento_id)}`)}>
          Abrir
        </button>
      </div>
    );
  if (nombre === "buscar_memoria") return <>Encontré {String(o.encontradas ?? 0)} reglas que aplican</>;
  if (nombre === "aplicar_skill") return <>Cargada: {String(o.nombre ?? "")}</>;
  if (nombre === "leer_datos_locales") return <>Resumen calculado en este equipo y aprobado · 0 filas del archivo enviadas</>;
  if (nombre === "contar_correos") return <>{String(o.total ?? 0)} correos ({String(o.sin_leer ?? 0)} sin leer)</>;
  if (nombre === "listar_correos") return <>{Array.isArray(o.mensajes) ? o.mensajes.length : 0} mensajes leídos (solo lectura)</>;
  if (nombre === "leer_correo" || nombre === "resumir_correo") return <>Mensaje leído (solo lectura)</>;
  if (nombre === "organizar_correo") return <>{String(o.organizados ?? 0)} mensajes organizados · puede deshacer desde Correo</>;
  if (nombre === "crear_borrador") return <>Borrador guardado en Outlook · no se envió</>;
  if (nombre === "crear_reunion") return <>Reunión creada{o.enlace_teams ? " con enlace de Teams" : ""}</>;
  if (nombre === "ver_agenda") return <>{Array.isArray(o.eventos) ? o.eventos.length : 0} eventos leídos</>;
  if (nombre === "listar_archivos") return <>{Array.isArray(o.items) ? o.items.length : 0} elementos</>;
  if (nombre === "leer_archivo") return <>Archivo leído{o.truncado ? " (solo el comienzo)" : ""}</>;
  if (nombre === "crear_carpeta") return <>Carpeta creada</>;
  if (nombre === "guardar_archivo") return <>Guardado como «{String(o.nombre ?? "")}»</>;
  if (nombre === "proponer_perfil") return <>Perfil actualizado</>;
  return <>Listo</>;
}

export function Chat() {
  const { nombreMostrar, conCorreo, toast, esquema, setEsquema, pedido, setPedido, setFilas, ir, funciones, setModelo } = useWork();
  const ms = useMs();
  const [texto, setTexto] = useState("");
  const [aprobs, setAprobs] = useState<(Aprobacion & { listo?: boolean })[]>([]);
  const [colgado, setColgado] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const enviado = useRef(false);
  const pendientes = aprobs.filter((a) => !a.listo).length;

  // La persona deja decidir desde la tarjeta: la herramienta espera esta promesa.
  useEffect(() => {
    puente.pedir = (a) => new Promise<boolean>((resolve) => setAprobs((l) => [...l, { ...a, resolver: resolve }]));
    puente.filas = setFilas;
    puente.nota = toast;
    return () => {
      puente.pedir = async () => false;
    };
  }, [setFilas, toast]);
  // Al salir del chat nada queda esperando una respuesta que ya nadie verá.
  const aprobsRef = useRef(aprobs);
  aprobsRef.current = aprobs;
  useEffect(
    () => () => {
      for (const a of aprobsRef.current) if (!a.listo) a.resolver(false);
    },
    [],
  );

  // El esquema que se comparte con el servidor sale de lo que la persona dejó permitido.
  useEffect(() => setEsquema(esquemaPermitido()), [setEsquema]);

  // Solo se ofrecen las herramientas de lo que la persona de verdad tiene (rol, funciones y lo conectado).
  const tools = useMemo(
    () =>
      herramientasPara({
        correo: conCorreo && ms.correoListo && funciones.correo !== false,
        agenda: ms.agendaListo && funciones.agenda !== false,
        archivos: ms.archivosListo && funciones.archivos !== false,
        datos: funciones.datos !== false,
        perfil: funciones.perfil !== false,
        organiza: ms.puedeOrganizar,
      }),
    [conCorreo, ms.correoListo, ms.agendaListo, ms.archivosListo, ms.puedeOrganizar, funciones],
  );
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const connection = useMemo(
    () =>
      fetchServerSentEvents(functionUrl("pilo-work"), async () => ({
        headers: await authHeaders(),
        body: { esquema: esquemaPermitido() },
      })),
    [],
  );
  const { messages, sendMessage, isLoading, error, stop, reload } = useChat({
    connection,
    tools,
    threadId,
    onCustomEvent: (tipo, datos) => {
      if (tipo === "pilo_modelo" && datos && typeof datos === "object") setModelo(datos as ModeloUsado);
    },
  });

  const enviar = async (q: string) => {
    const t = q.trim();
    if (!t || isLoading) return;
    setTexto("");
    setColgado(false);
    await sendMessage(t);
  };

  /* Vigilante: cada señal del servidor (texto, herramienta, estado) reinicia el reloj. */
  const ultimaSenal = useRef(Date.now());
  const firma = useMemo(() => messages.length + JSON.stringify(messages[messages.length - 1]?.parts ?? "").length, [messages]);
  useEffect(() => {
    ultimaSenal.current = Date.now();
    setColgado(false);
  }, [firma, pendientes, isLoading]);
  useEffect(() => {
    if (!isLoading) return;
    const iv = window.setInterval(() => {
      if (pendientes > 0) ultimaSenal.current = Date.now(); // esperar la aprobación de la persona no cuenta
      else if (Date.now() - ultimaSenal.current > SILENCIO_MS) setColgado(true);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [isLoading, pendientes]);

  const soltarAprobaciones = () => {
    for (const a of aprobsRef.current) if (!a.listo) a.resolver(false);
    setAprobs((l) => l.map((x) => ({ ...x, listo: true })));
  };
  const cancelar = () => {
    soltarAprobaciones();
    stop();
    setColgado(false);
  };
  const reintentar = () => {
    soltarAprobaciones();
    stop();
    setColgado(false);
    window.setTimeout(() => void reload(), 0);
  };

  useEffect(() => {
    if (pedido && !enviado.current) {
      enviado.current = true;
      const q = pedido;
      setPedido("");
      void enviar(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuenta el pedido al abrir
  }, [pedido]);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [messages, aprobs, colgado]);

  // Entrada de cada mensaje nuevo (omitida con movimiento reducido).
  useEffect(() => {
    if (movimientoReducido()) return;
    const nuevos = document.querySelectorAll<HTMLElement>(".pwk .thread .bubble:not([data-v])");
    nuevos.forEach((n) => n.setAttribute("data-v", "1"));
    if (nuevos.length) gsap.fromTo(nuevos, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", clearProps: "opacity,transform" });
  }, [messages.length, aprobs.length]);

  const abierto = datosAbiertos();
  const ultimoMsg = messages[messages.length - 1];
  return (
    <div className="chat">
      <div className="thread">
        <div className="col">
          <div className="bubble es-pilo">
            <Cara mood="feliz" />
            <div className="t">
              <p>Hola, {nombreMostrar.split(" ")[0]}. Cuénteme qué necesita: redactar, revisar, resumir o calcular sobre sus archivos.</p>
              <p className="muted small">Elija una idea para empezar o escriba lo suyo.</p>
            </div>
          </div>
          {messages.map((m) => {
            const mio = m.role === "user";
            const partes = m.parts as unknown as { type: string; content?: string; id?: string; name?: string; state?: string; output?: unknown; input?: unknown }[];
            if (mio)
              return (
                <div className="bubble me" key={m.id}>
                  <div className="t">{partes.filter((p) => p.type === "text").map((p) => p.content).join("")}</div>
                </div>
              );
            const ultimo = m === ultimoMsg;
            const escribiendo = isLoading && ultimo;
            return (
              <div className="bubble es-pilo" key={m.id}>
                <Cara mood={escribiendo && !colgado ? "piensa" : "bien"} />
                <div className="t">
                  {partes.map((p, i) => {
                    if (p.type === "text" && p.content) {
                      const limpio = limpiarRespuesta(p.content, !escribiendo);
                      return limpio ? <Md key={i} texto={limpio} /> : null;
                    }
                    if (p.type !== "tool-call") return null;
                    const listo = p.output !== undefined;
                    return (
                      <div key={p.id ?? i} className={`tool${listo ? " ok" : ""}`}>
                        <div className="tool__h">
                          <span className="ic" />
                          {NOMBRE[p.name ?? ""] ?? p.name}
                          <span className="st small muted">{listo ? "completa" : "ejecutando"}</span>
                        </div>
                        {listo && (
                          <div className="tool__b">
                            <Resumen nombre={p.name ?? ""} salida={p.output} abrir={ir} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {escribiendo && !colgado && !partes.some((p) => p.type === "text" && p.content) && <span className="muted">Pensando…</span>}
                </div>
              </div>
            );
          })}
          {isLoading && ultimoMsg?.role === "user" && !colgado && (
            <div className="bubble es-pilo">
              <Cara mood="piensa" />
              <div className="t">
                <span className="muted">Pensando…</span>
              </div>
            </div>
          )}
          {aprobs
            .filter((a) => !a.listo)
            .map((a) => (
              <div className="apr" key={a.id} role="alertdialog" aria-label={a.titulo}>
                <b>{a.titulo}</b>
                <ul className="flat" style={{ gap: 4 }}>
                  {a.detalle.map((d, i) => (
                    <li key={i} className="small" style={{ listStyle: "disc", marginLeft: 16 }}>
                      {d}
                    </li>
                  ))}
                </ul>
                <div className="acts">
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={() => {
                      a.resolver(true);
                      setAprobs((l) => l.map((x) => (x.id === a.id ? { ...x, listo: true } : x)));
                    }}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      a.resolver(false);
                      setAprobs((l) => l.map((x) => (x.id === a.id ? { ...x, listo: true } : x)));
                    }}
                  >
                    No, gracias
                  </button>
                </div>
              </div>
            ))}
          {isLoading && colgado && (
            <div className="stall" role="alert">
              <div>
                <b>Pilo tardó demasiado</b>
                <p className="small muted">No llegó ninguna respuesta en los últimos segundos. Puede reintentar o cancelar.</p>
              </div>
              <div className="acts">
                <button type="button" className="btn sm primary" onClick={reintentar}>
                  Reintentar
                </button>
                <button type="button" className="btn sm" onClick={cancelar}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {error && !isLoading && (
            <div className="stall" role="alert">
              <div>
                <b>No se pudo completar la respuesta</b>
                <p className="small err">{error.message}</p>
              </div>
              <div className="acts">
                <button type="button" className="btn sm primary" onClick={reintentar}>
                  Reintentar
                </button>
              </div>
            </div>
          )}
          <div ref={fin} />
        </div>
      </div>
      <div className="composer">
        {!messages.length && (
          <div className="sugs">
            {IDEAS.map((s) => (
              <button key={s} type="button" className="sug" onClick={() => void enviar(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="cbox">
          <textarea
            rows={1}
            value={texto}
            placeholder="Pida lo que necesite: redactar, revisar, resumir, ordenar su correo…"
            aria-label="Mensaje"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
          />
          <div className="cbar">
            <span className="tag" aria-label="Memoria">
              Usa su memoria y la colectiva
            </span>
            <span className="tag" aria-label="Archivos locales" style={{ color: abierto ? "var(--ok)" : undefined }}>
              {abierto ? `Archivo abierto: ${abierto.nombre} (solo esquema)` : "Archivos solo locales"}
            </span>
            <span className="sp" />
            <span className="hint">{esquema ? "Esquema permitido compartido" : ""}</span>
            {isLoading ? (
              <button type="button" className="send" onClick={cancelar} aria-label="Detener">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button type="button" className="send" onClick={() => void enviar(texto)} aria-label="Enviar">
                {IC.send}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
