/* =============================================================================
   Chat · TanStack AI (useChat + herramientas de cliente) contra la función pilo-work.

   El servidor habla el protocolo de streaming de TanStack AI (AG-UI sobre SSE) con el
   mismo modelo que usa Pilo. Las tarjetas de herramienta salen de las partes
   «tool-call» de cada mensaje. Las herramientas que escriben o sacan algo del equipo
   esperan la aprobación de la persona (herramientas.ts → puente).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import gsap from "gsap";
import { authHeaders, functionUrl } from "../api";
import { esquemaPermitido, datosAbiertos } from "../datos";
import { HERRAMIENTAS_CLIENTE, puente, SOLO_CORREO } from "../herramientas";
import type { Aprobacion } from "../herramientas";
import { movimientoReducido } from "../../rankings/movimiento";
import { Cara, IC, Md, useWork } from "../ui";

const IDEAS = ["Redacta un oficio para Talento Humano", "Resume mi correo de hoy", "Cuenta estudiantes por programa en mi Excel", "Genera un script para consolidar libros de Excel"];

const NOMBRE: Record<string, string> = {
  buscar_memoria: "Memoria · búsqueda de reglas",
  aplicar_skill: "Skill · instrucciones",
  crear_documento: "Documento · borrador en Cowork",
  leer_datos_locales: "Herramienta local · leer_datos_locales",
  leer_correo: "Correo · bandeja (solo lectura)",
  organizar_correo: "Correo · organizar (con su aprobación)",
  crear_borrador: "Correo · borrador (no se envía)",
  ver_agenda: "Agenda · leer calendario",
  proponer_horarios: "Agenda · horarios libres",
  crear_reunion: "Agenda · crear reunión",
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
  if (nombre === "leer_correo") return <>{Array.isArray(o.mensajes) ? o.mensajes.length : 0} mensajes leídos (solo lectura)</>;
  if (nombre === "organizar_correo") return <>{String(o.organizados ?? 0)} mensajes organizados · puede deshacer desde Correo</>;
  if (nombre === "crear_borrador") return <>Borrador guardado en Outlook · no se envió</>;
  if (nombre === "crear_reunion") return <>Reunión creada{o.enlace_teams ? " con enlace de Teams" : ""}</>;
  if (nombre === "ver_agenda") return <>{Array.isArray(o.eventos) ? o.eventos.length : 0} eventos leídos</>;
  return <>Listo</>;
}

export function Chat() {
  const { perfil, conCorreo, toast, esquema, setEsquema, pedido, setPedido, setFilas, ir } = useWork();
  const [texto, setTexto] = useState("");
  const [aprobs, setAprobs] = useState<(Aprobacion & { listo?: boolean })[]>([]);
  const fin = useRef<HTMLDivElement>(null);
  const enviado = useRef(false);

  // La persona deja decidir desde la tarjeta: la herramienta espera esta promesa.
  useEffect(() => {
    puente.pedir = (a) => new Promise<boolean>((resolve) => setAprobs((l) => [...l, { ...a, resolver: resolve }]));
    puente.filas = setFilas;
    puente.nota = toast;
    return () => {
      puente.pedir = async () => false;
    };
  }, [setFilas, toast]);

  // El esquema que se comparte con el servidor sale de lo que la persona dejó permitido.
  useEffect(() => setEsquema(esquemaPermitido()), [setEsquema]);

  const tools = useMemo(() => HERRAMIENTAS_CLIENTE.filter((t) => conCorreo || !SOLO_CORREO.has(t.name)), [conCorreo]);
  const threadId = useMemo(() => crypto.randomUUID(), []);
  const connection = useMemo(
    () =>
      fetchServerSentEvents(functionUrl("pilo-work"), async () => ({
        headers: await authHeaders(),
        body: { esquema: esquemaPermitido() },
      })),
    [],
  );
  const { messages, sendMessage, isLoading, error, stop } = useChat({ connection, tools, threadId });

  const enviar = async (q: string) => {
    const t = q.trim();
    if (!t || isLoading) return;
    setTexto("");
    await sendMessage(t);
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
  }, [messages, aprobs]);

  // Entrada de cada mensaje nuevo (omitida con movimiento reducido).
  const vistos = useRef(new Set<string>());
  useEffect(() => {
    if (movimientoReducido()) return;
    const nuevos = document.querySelectorAll<HTMLElement>(".pw .thread .bubble:not([data-v])");
    nuevos.forEach((n) => n.setAttribute("data-v", "1"));
    if (nuevos.length) gsap.fromTo(nuevos, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", clearProps: "opacity,transform" });
    void vistos;
  }, [messages.length, aprobs.length]);

  const abierto = datosAbiertos();
  return (
    <div className="chat">
      <div className="thread">
        <div className="col">
          <div className="bubble pilo">
            <Cara mood="feliz" />
            <div className="t">
              <p>
                Hola, {perfil.nombre.split(" ")[0]}. Soy Pilo, su agente de trabajo. Recuerdo cómo escribe usted y su oficina, y puedo leer sus archivos sin subirlos.
              </p>
              <p className="muted small">Pruebe una de estas ideas o escriba lo suyo.</p>
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
            const ultimo = m === messages[messages.length - 1];
            return (
              <div className="bubble pilo" key={m.id}>
                <Cara mood={isLoading && ultimo ? "piensa" : "bien"} />
                <div className="t">
                  {partes.map((p, i) => {
                    if (p.type === "text" && p.content) return <Md key={i} texto={p.content} />;
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
                  {isLoading && ultimo && !partes.some((p) => p.type === "text" && p.content) && <span className="muted">Pilo está pensando…</span>}
                </div>
              </div>
            );
          })}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="bubble pilo">
              <Cara mood="piensa" />
              <div className="t">
                <span className="muted">Pilo está pensando…</span>
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
          {error && (
            <p className="err" role="alert">
              {error.message}
            </p>
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
            placeholder="Pídale a Pilo: redactar, revisar, resumir, ordenar su correo…"
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
            <span className="hint">{esquema ? "Esquema permitido compartido" : "Mistral"}</span>
            {isLoading ? (
              <button type="button" className="send" onClick={stop} aria-label="Detener">
                ■
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
