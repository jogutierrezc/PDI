/* =============================================================================
   Pilo for Teams · equipos con UN solo Pilo.

   El Pilo del equipo usa solo la memoria que cada integrante ACEPTÓ compartir (una fila
   en pw_equipo_aportes por regla, que la persona retira cuando quiera) y la colectiva de
   la oficina. La conversación va por Supabase Realtime (pw_equipo_mensajes).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import gsap from "gsap";
import { supabase } from "../../../lib/supabase";
import { callWork } from "../api";
import type { Memoria } from "../api";
import { movimientoReducido } from "../../rankings/movimiento";
import { Cara, IC, iniciales, MOOD, Seg, Tg, useDialogo, useEntra, useWork } from "../ui";

interface Equipo {
  id: string;
  nombre: string;
  descripcion: string;
  color: string;
  incluye_colectiva: boolean;
  creado_por: string;
}
interface Miembro {
  user_id: string;
  nombre: string;
  estado: "invitado" | "activo";
  funcion: string;
}
interface Msg {
  id: string;
  user_id: string | null;
  autor: string;
  es_pilo: boolean;
  texto: string;
  fuentes: string[];
  creado_en: string;
}
interface Aporte {
  memoria_id: string;
  texto: string;
  aporta_id: string;
  aporta: string;
  activo: boolean;
}
interface Persona {
  user_id: string;
  nombre: string;
  dependencia: string;
}
const COLORES = ["k1", "k2", "k3", "k4", "k5"];

export function Equipos() {
  const { perfil, toast } = useWork();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [invitaciones, setInvitaciones] = useState<{ equipo_id: string; nombre: string }[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [asistente, setAsistente] = useState(false);
  const raiz = useEntra(".tmcard,.tmnew", equipos.length, 10);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("pw_equipo_miembros").select("equipo_id, estado, pw_equipos(id, nombre, descripcion, color, incluye_colectiva, creado_por)").eq("user_id", perfil.userId);
    const filas = (data ?? []) as unknown as { equipo_id: string; estado: string; pw_equipos: Equipo | null }[];
    setEquipos(filas.filter((f) => f.estado === "activo" && f.pw_equipos).map((f) => f.pw_equipos as Equipo));
    setInvitaciones(filas.filter((f) => f.estado === "invitado" && f.pw_equipos).map((f) => ({ equipo_id: f.equipo_id, nombre: (f.pw_equipos as Equipo).nombre })));
  }, [perfil.userId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => {
    if (!sel && equipos.length) setSel(equipos[0].id);
  }, [equipos, sel]);

  const responderInvitacion = async (id: string, acepta: boolean) => {
    if (acepta) await supabase.from("pw_equipo_miembros").update({ estado: "activo", nombre: perfil.nombre }).eq("equipo_id", id).eq("user_id", perfil.userId);
    else await supabase.from("pw_equipo_miembros").delete().eq("equipo_id", id).eq("user_id", perfil.userId);
    toast(acepta ? "Se unió al equipo. Decida qué memoria aporta en «Memoria del equipo»." : "Invitación rechazada");
    await cargar();
    if (acepta) setSel(id);
  };
  const actual = equipos.find((e) => e.id === sel) ?? null;

  return (
    <div className="tm" style={{ position: "relative" }} ref={raiz}>
      <aside className="tm__l" aria-label="Sus equipos">
        <button type="button" className="tmnew" onClick={() => setAsistente(true)}>
          <span style={{ display: "grid", width: 22, height: 22 }}>{IC.plus}</span>Crear un equipo
        </button>
        {invitaciones.map((i) => (
          <div className="propose" key={i.equipo_id}>
            <b>Invitación a «{i.nombre}»</b>
            <p>Usted decide qué memoria aporta al equipo, y la puede retirar cuando quiera.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn sm primary" onClick={() => void responderInvitacion(i.equipo_id, true)}>
                Unirme
              </button>
              <button type="button" className="btn sm" onClick={() => void responderInvitacion(i.equipo_id, false)}>
                No
              </button>
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gap: 10 }}>
          {equipos.map((e) => (
            <button key={e.id} type="button" className="tmcard" aria-current={e.id === sel} style={{ ["--tb" as string]: `var(--${e.color})`, ["--ts" as string]: `var(--${e.color}s)` } as CSSProperties} onClick={() => setSel(e.id)}>
              <b>{e.nombre}</b>
              <span className="d">{e.descripcion || "Equipo de trabajo"}</span>
            </button>
          ))}
        </div>
        {!equipos.length && !invitaciones.length && <p className="hint">Aún no está en ningún equipo. Cree uno: cualquier persona con rol puede.</p>}
      </aside>
      <section className="tm__r">{actual ? <Detalle key={actual.id} equipo={actual} recargar={cargar} /> : <div className="pad muted">Elija un equipo de la lista o cree uno nuevo.</div>}</section>
      {asistente && (
        <Asistente
          cerrar={() => setAsistente(false)}
          listo={async (id) => {
            setAsistente(false);
            await cargar();
            setSel(id);
            toast("Equipo creado");
          }}
          numero={equipos.length}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- */

function Detalle({ equipo, recargar }: { equipo: Equipo; recargar: () => Promise<void> }) {
  const { perfil, toast } = useWork();
  const [tab, setTab] = useState<"chat" | "mem" | "mie">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [aportes, setAportes] = useState<Aporte[]>([]);
  const [mias, setMias] = useState<Memoria[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [asociados, setAsociados] = useState<string[]>([]);
  const caja = useRef<HTMLDivElement>(null);
  const esCreador = equipo.creado_por === perfil.userId;

  const cargarMsgs = useCallback(async () => {
    const { data } = await supabase.from("pw_equipo_mensajes").select("*").eq("equipo_id", equipo.id).order("creado_en").limit(200);
    setMsgs((data ?? []) as Msg[]);
  }, [equipo.id]);
  const cargarMem = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.rpc("pw_equipo_memoria", { p_equipo: equipo.id }),
      supabase.from("pw_memoria").select("*").eq("user_id", perfil.userId).eq("estado", "aceptada").eq("activa", true),
      supabase.from("pw_equipo_miembros").select("user_id, nombre, estado, funcion").eq("equipo_id", equipo.id),
      supabase.from("pw_equipo_asociados").select("asociado_id, pw_equipos:asociado_id(nombre)").eq("equipo_id", equipo.id),
    ]);
    setAportes((a.data ?? []) as Aporte[]);
    setMias((b.data ?? []) as Memoria[]);
    setMiembros((c.data ?? []) as Miembro[]);
    setAsociados(((d.data ?? []) as unknown as { pw_equipos: { nombre: string } | null }[]).map((x) => x.pw_equipos?.nombre ?? "Equipo"));
  }, [equipo.id, perfil.userId]);

  useEffect(() => {
    void cargarMsgs();
    void cargarMem();
    const canal = supabase
      .channel(`pw-eq-${equipo.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pw_equipo_mensajes", filter: `equipo_id=eq.${equipo.id}` }, (p) => {
        const m = p.new as Msg;
        setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
        if (m.es_pilo) setPensando(false);
      })
      .subscribe();
    // Si Realtime no está disponible, la conversación se refresca sola cada 12 s.
    const iv = setInterval(() => void cargarMsgs(), 12_000);
    return () => {
      clearInterval(iv);
      void supabase.removeChannel(canal);
    };
  }, [equipo.id, cargarMsgs, cargarMem]);
  useEffect(() => {
    caja.current?.scrollTo({ top: caja.current.scrollHeight });
  }, [msgs.length, pensando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    const { error } = await supabase.from("pw_equipo_mensajes").insert({ equipo_id: equipo.id, user_id: perfil.userId, autor: perfil.nombre, texto: t });
    if (error) return toast("No se pudo enviar el mensaje.");
    await cargarMsgs();
    if (/@pilo|\?/i.test(t)) {
      setPensando(true);
      try {
        await callWork({ action: "equipo_responder", equipo_id: equipo.id, pregunta: t });
        await cargarMsgs();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Pilo no pudo responder.");
      }
      setPensando(false);
    }
  };
  const aportar = async (m: Memoria, v: boolean) => {
    if (v) await supabase.from("pw_equipo_aportes").insert({ equipo_id: equipo.id, memoria_id: m.id, user_id: perfil.userId });
    else await supabase.from("pw_equipo_aportes").delete().eq("equipo_id", equipo.id).eq("memoria_id", m.id);
    await cargarMem();
  };
  const invitar = async (p: Persona) => {
    const { error } = await supabase.from("pw_equipo_miembros").insert({ equipo_id: equipo.id, user_id: p.user_id, nombre: p.nombre });
    toast(error ? "Ya está invitada o no se pudo invitar." : "Invitación enviada · la persona elegirá qué aporta");
    await cargarMem();
  };
  const salir = async () => {
    await supabase.from("pw_equipo_aportes").delete().eq("equipo_id", equipo.id).eq("user_id", perfil.userId);
    await supabase.from("pw_equipo_miembros").delete().eq("equipo_id", equipo.id).eq("user_id", perfil.userId);
    toast("Salió del equipo y retiró lo que aportaba");
    await recargar();
  };
  useEffect(() => {
    if (tab === "mie" && esCreador) void supabase.rpc("pw_equipo_personas").then(({ data }) => setPersonas((data ?? []) as Persona[]));
  }, [tab, esCreador]);

  const idsAportados = new Set(aportes.filter((a) => a.aporta_id === perfil.userId).map((a) => a.memoria_id));
  return (
    <>
      <div className="tm__h">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>{equipo.nombre}</h2>
          <span className="badge blue">Un solo Pilo para el equipo</span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, maxWidth: "70ch" }}>
          Pilo usa la memoria que cada integrante aceptó compartir{equipo.incluye_colectiva ? ", más la colectiva de la oficina" : ""}. {asociados.length ? `Asociado con: ${asociados.join(", ")}.` : ""}
        </p>
      </div>
      <div className="tm__tabs">
        <Seg valor={tab} onChange={setTab} etiqueta="Equipo" opciones={[["chat", "Conversación"], ["mem", "Memoria del equipo"], ["mie", "Integrantes"]]} />
      </div>
      <div className="tm__b">
        {tab === "chat" && (
          <div className="tchat">
            <div className="tmsgs" ref={caja}>
              {!msgs.length && <p className="hint">Aún no hay mensajes. Escriba al equipo; mencione a @Pilo o haga una pregunta para que participe.</p>}
              {msgs.map((m) => (
                <div className={`tm-msg${m.es_pilo ? " es-pilo" : ""}`} key={m.id}>
                  {m.es_pilo ? <Cara mood="bien" /> : <span className="avatar">{iniciales(m.autor)}</span>}
                  <div>
                    <b>
                      {m.autor}
                      {m.es_pilo ? " · Pilo del equipo" : ""}
                    </b>
                    <p style={{ whiteSpace: "pre-wrap" }}>{m.texto}</p>
                    {m.fuentes?.length > 0 && (
                      <div className="src-tags">
                        {m.fuentes.map((n) => (
                          <span className="badge blue" key={n}>
                            Memoria de {String(n).split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {pensando && (
                <div className="tm-msg es-pilo">
                  <Cara mood="piensa" />
                  <div>
                    <b>Pilo del equipo</b>
                    <p className="muted">Pensando con lo que el equipo compartió…</p>
                  </div>
                </div>
              )}
            </div>
            <div className="cbox" style={{ maxWidth: "none" }}>
              <textarea rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escriba al equipo. Mencione a @Pilo para que participe" aria-label="Mensaje al equipo" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void enviar())} />
              <div className="cbar">
                <span className="hint">Pilo responde cuando lo mencionan o hay una pregunta</span>
                <span className="sp" />
                <button type="button" className="send" onClick={() => void enviar()} aria-label="Enviar">
                  {IC.send}
                </button>
              </div>
            </div>
          </div>
        )}
        {tab === "mem" && (
          <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
            <p className="hint">Cada integrante decide qué aporta, regla por regla. Usted solo puede cambiar lo suyo, y retirarlo cuando quiera.</p>
            <div className="box">
              <h2>Lo que usted aporta</h2>
              {!mias.length && <p className="muted">Su memoria personal aún está vacía.</p>}
              {mias.map((m) => (
                <div className="mem" key={m.id}>
                  <div>
                    <p>{m.texto}</p>
                    <small>{idsAportados.has(m.id) ? "Compartida con este equipo" : "Solo suya"}</small>
                  </div>
                  <Tg on={idsAportados.has(m.id)} onChange={(v) => void aportar(m, v)} label="Compartir con el equipo" />
                </div>
              ))}
            </div>
            <div className="box">
              <h2>Lo que aportó el equipo</h2>
              {aportes.filter((a) => a.aporta_id !== perfil.userId).map((a) => (
                <div className={`mem${a.activo ? "" : " off"}`} key={a.memoria_id}>
                  <div>
                    <p>{a.texto}</p>
                    <small>Aporta {a.aporta}</small>
                  </div>
                  <span className="badge">{a.activo ? "Compartido" : "En pausa"}</span>
                </div>
              ))}
              {!aportes.some((a) => a.aporta_id !== perfil.userId) && <p className="muted">Nadie más ha compartido memoria todavía.</p>}
            </div>
            {equipo.incluye_colectiva && (
              <div className="mem colect">
                <div>
                  <p>Incluye la memoria colectiva de la oficina</p>
                  <small>La administra la administración</small>
                </div>
                <span className="badge ok">Incluida</span>
              </div>
            )}
          </div>
        )}
        {tab === "mie" && (
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <div className="flat">
              {miembros.map((m) => (
                <div className="item" key={m.user_id}>
                  <span className="avatar" style={{ background: "var(--surface-3)", color: "var(--ink)" }}>
                    {iniciales(m.nombre)}
                  </span>
                  <div>
                    <b>{m.nombre || "Integrante"}</b>
                    <p>{m.user_id === perfil.userId ? "Usted" : m.funcion === "creador" ? "Creó el equipo" : "Integrante"}</p>
                  </div>
                  <span className={`badge ${m.estado === "activo" ? "ok" : "warn"}`}>{m.estado === "activo" ? "En el equipo" : "Invitación enviada"}</span>
                </div>
              ))}
            </div>
            {esCreador && (
              <div className="box">
                <h2>Invitar a alguien</h2>
                <div className="pick">
                  {personas.filter((p) => !miembros.some((m) => m.user_id === p.user_id)).map((p) => (
                    <button key={p.user_id} type="button" className="pk" onClick={() => void invitar(p)}>
                      <span className="avatar">{iniciales(p.nombre)}</span>
                      {p.nombre} <span className="muted">· {p.dependencia}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <button type="button" className="btn sm" onClick={() => void salir()}>
                Salir del equipo
              </button>
              <p className="hint" style={{ marginTop: 6 }}>Al salir se retira todo lo que usted aportaba.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------------------------- */

function Asistente({ cerrar, listo, numero }: { cerrar: () => void; listo: (id: string) => void; numero: number }) {
  const { perfil, toast } = useWork();
  const caja = useDialogo(cerrar);
  const [paso, setPaso] = useState(1);
  const [n, setN] = useState("");
  const [d, setD] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [invitadas, setInvitadas] = useState<string[]>([]);
  const [mias, setMias] = useState<Memoria[]>([]);
  const [aporta, setAporta] = useState<Set<string>>(new Set());
  const [col, setCol] = useState(true);
  const [creando, setCreando] = useState(false);
  const orb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void supabase.rpc("pw_equipo_personas").then(({ data }) => setPersonas((data ?? []) as Persona[]));
    void supabase.from("pw_memoria").select("*").eq("user_id", perfil.userId).eq("estado", "aceptada").eq("activa", true).then(({ data }) => setMias((data ?? []) as Memoria[]));
  }, [perfil.userId]);

  const crear = async () => {
    setCreando(true);
    const { data: eq, error } = await supabase.from("pw_equipos").insert({ nombre: n.trim(), descripcion: d.trim(), color: COLORES[numero % COLORES.length], incluye_colectiva: col, creado_por: perfil.userId }).select("id").single();
    if (error || !eq) {
      setCreando(false);
      return toast("No se pudo crear el equipo.");
    }
    await supabase.from("pw_equipo_miembros").insert({ equipo_id: eq.id, user_id: perfil.userId, nombre: perfil.nombre, estado: "activo", funcion: "creador" });
    if (invitadas.length) await supabase.from("pw_equipo_miembros").insert(invitadas.map((u) => ({ equipo_id: eq.id, user_id: u, nombre: personas.find((p) => p.user_id === u)?.nombre ?? "" })));
    if (aporta.size) await supabase.from("pw_equipo_aportes").insert([...aporta].map((m) => ({ equipo_id: eq.id, memoria_id: m, user_id: perfil.userId })));
    await supabase.from("pw_equipo_mensajes").insert({ equipo_id: eq.id, user_id: perfil.userId, autor: perfil.nombre, texto: `Creé el equipo «${n.trim()}».` });
    // El saludo del Pilo del equipo lo escribe el servidor, con lo que se aportó.
    void callWork({ action: "equipo_responder", equipo_id: eq.id, pregunta: "Preséntate al equipo en dos frases y di qué memoria tienes disponible." }).catch(() => undefined);
    // La animación de «reuniendo al equipo» (omitida con movimiento reducido).
    if (orb.current && !movimientoReducido()) {
      const avs = orb.current.querySelectorAll(".fly");
      const tl = gsap.timeline();
      avs.forEach((a, i) => {
        const ang = (i / Math.max(1, avs.length)) * Math.PI * 2;
        tl.fromTo(a, { x: Math.cos(ang) * 160, y: Math.sin(ang) * 110, scale: 0.4, opacity: 0 }, { x: 0, y: -8, scale: 1, opacity: 1, duration: 0.6, ease: "power3.inOut" }, i * 0.1).to(a, { scale: 0.2, opacity: 0, duration: 0.25, ease: "power2.in" }, 0.75 + i * 0.04);
      });
      tl.fromTo(orb.current.querySelector(".pilo-big"), { scale: 0.5, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.6, ease: "back.out(1.8)" }, 0.8);
      await tl.then();
    }
    listo(eq.id as string);
  };

  const cuerpo = creando ? (
    <div className="orb" ref={orb}>
      {[perfil.nombre, ...invitadas.map((u) => personas.find((p) => p.user_id === u)?.nombre ?? "")].slice(0, 5).map((nm, i) => (
        <span key={i} className="avatar fly" style={{ background: "var(--blue-soft)", color: "var(--blue-strong)" }}>
          {iniciales(nm)}
        </span>
      ))}
      <div className="pilo-big" style={{ opacity: movimientoReducido() ? 1 : 0 }}>
        <img src={MOOD.excelente} alt="" />
      </div>
      <h2 style={{ textAlign: "center" }}>Creando el Pilo de «{n}»…</h2>
      <p className="muted" style={{ textAlign: "center" }}>Con la memoria de quienes la acepten</p>
    </div>
  ) : (
    <>
      <div className="steps">
        {["Equipo", "Personas", "Memoria"].map((t, i) => (
          <span key={t} style={{ display: "contents" }}>
            <span className={`st${paso === i + 1 ? " on" : ""}${i + 1 < paso ? " done" : ""}`}>
              <i>{i + 1}</i>
              {t}
            </span>
            {i < 2 && (
              <span className="sln">
                <b style={{ transform: `scaleX(${i + 1 < paso ? 1 : 0})`, transition: "transform .4s cubic-bezier(.23,1,.32,1)" }} />
              </span>
            )}
          </span>
        ))}
      </div>
      {paso === 1 && (
        <>
          <h2 id="wz-t">Cree un equipo con su propio Pilo</h2>
          <p className="muted">Un equipo reúne personas y su memoria para trabajar sobre lo mismo.</p>
          <div className="field">
            <label htmlFor="w-n">Nombre del equipo</label>
            <input className="inp" id="w-n" value={n} onChange={(e) => setN(e.target.value)} placeholder="Informe de gestión 2026" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="w-d">¿Para qué es?</label>
            <input className="inp" id="w-d" value={d} onChange={(e) => setD(e.target.value)} placeholder="Consolidar el informe anual" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={cerrar}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={() => (n.trim().length < 2 ? toast("Póngale un nombre al equipo") : setPaso(2))}>
              Siguiente
            </button>
          </div>
        </>
      )}
      {paso === 2 && (
        <>
          <h2 id="wz-t">¿Quién participa?</h2>
          <p className="muted">Cada persona recibe una invitación y decide qué memoria aporta.</p>
          <div className="pick">
            {personas.map((p) => (
              <button key={p.user_id} type="button" className="pk" aria-pressed={invitadas.includes(p.user_id)} onClick={() => setInvitadas((l) => (l.includes(p.user_id) ? l.filter((x) => x !== p.user_id) : [...l, p.user_id]))}>
                <span className="avatar">{iniciales(p.nombre)}</span>
                {p.nombre}
              </button>
            ))}
            {!personas.length && <p className="hint">Aún no hay otras personas con rol para invitar. Puede crear el equipo y sumarlas después.</p>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button type="button" className="btn ghost" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button type="button" className="btn primary" onClick={() => setPaso(3)}>
              Siguiente
            </button>
          </div>
        </>
      )}
      {paso === 3 && (
        <>
          <h2 id="wz-t">¿Qué memoria usa el Pilo del equipo?</h2>
          <p className="muted">Usted decide lo suyo ahora, regla por regla. Los demás lo deciden al aceptar la invitación.</p>
          <div className="pick" style={{ display: "grid" }}>
            {mias.map((m) => (
              <button key={m.id} type="button" className="pk" style={{ borderRadius: 14, textAlign: "left" }} aria-pressed={aporta.has(m.id)} onClick={() => setAporta((s) => { const x = new Set(s); if (x.has(m.id)) x.delete(m.id); else x.add(m.id); return x; })}>
                {m.texto}
              </button>
            ))}
            {!mias.length && <p className="hint">Su memoria personal está vacía: no aportará nada por ahora.</p>}
          </div>
          <label className="chk">
            <input type="checkbox" checked={col} onChange={(e) => setCol(e.target.checked)} />
            <span>Incluir la memoria colectiva de la oficina (la administra la administración)</span>
          </label>
          <div className="box" style={{ padding: "12px 14px", background: "var(--surface-2)" }}>
            <b style={{ fontSize: 13 }}>{n}</b>
            <p className="hint">
              {1 + invitadas.length} personas · {aporta.size} reglas suyas aportadas · nunca sin el permiso de cada integrante
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <button type="button" className="btn ghost" onClick={() => setPaso(2)}>
              Atrás
            </button>
            <button type="button" className="btn primary" onClick={() => void crear()}>
              Crear equipo
            </button>
          </div>
        </>
      )}
    </>
  );
  return (
    <div className="wiz">
      <div className="wiz__box" role="dialog" aria-modal="true" aria-labelledby="wz-t" ref={caja} style={{ ["--x" as string]: 0 } as CSSProperties}>
        {cuerpo}
      </div>
    </div>
  );
}
