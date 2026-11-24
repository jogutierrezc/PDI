/* Inicio · el panel de botones grandes y orgánicos (prototipo aprobado). */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import gsap from "gsap";
import { supabase } from "../../../lib/supabase";
import { movimientoReducido } from "../../rankings/movimiento";
import { IC, MOOD, useEntra, useWork } from "../ui";

interface Tile {
  ruta: string;
  t: string;
  d: string;
  k: string;
  r: string;
  big?: boolean;
  ic: ReactNode;
  b: string;
}

export function Inicio() {
  const { nombreMostrar, esAdmin, conCorreo, ir, setPedido, funciones } = useWork();
  const [n, setN] = useState({ skills: 0, memoria: 0, equipos: 0, docs: 0, ms: false, reuniones: 0, propuestas: 0 });
  const [q, setQ] = useState("");
  const raiz = useEntra(".tile", 0, 28);
  const pilo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cuenta = (t: string) => supabase.from(t).select("id", { count: "exact", head: true });
    void Promise.all([
      cuenta("pw_skills").eq("activa", true),
      cuenta("pw_memoria").eq("estado", "aceptada"),
      cuenta("pw_equipo_miembros"),
      cuenta("pw_documentos"),
      supabase.rpc("pw_ms_estado"),
      cuenta("pw_recordatorios").gt("inicia_en", new Date().toISOString()).lt("inicia_en", new Date(Date.now() + 86400_000).toISOString()),
      esAdmin ? cuenta("pw_propuestas").eq("estado", "pendiente") : Promise.resolve({ count: 0 }),
    ]).then(([s, m, e, d, ms, r, p]) =>
      setN({
        skills: s.count ?? 0,
        memoria: m.count ?? 0,
        equipos: e.count ?? 0,
        docs: d.count ?? 0,
        ms: Array.isArray(ms.data) && Boolean(ms.data[0]?.conectado),
        reuniones: r.count ?? 0,
        propuestas: p.count ?? 0,
      }),
    );
  }, [esAdmin]);

  useEffect(() => {
    const el = pilo.current;
    if (!el || movimientoReducido()) return;
    const t = gsap.to(el, { y: -7, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
    return () => {
      t.kill();
    };
  }, []);

  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const nombre = nombreMostrar.split(" ")[0];
  const T: Tile[] = [
    { ruta: "chat", t: "Chat", d: "Pídale a Pilo redactar, resumir o revisar lo que necesite.", k: "k1", r: "30px 48px 30px 40px", big: true, ic: IC.chat, b: "Empiece aquí" },
    { ruta: "cowork", t: "Cowork", d: "Documentos, código y revisión en un mismo lienzo, con Pilo al lado.", k: "k2", r: "48px 30px 42px 30px", big: true, ic: IC.cow, b: n.docs ? `${n.docs} documento${n.docs === 1 ? "" : "s"}` : "Sin documentos aún" },
    { ruta: "agenda", t: "Mi agenda", d: "Reuniones de Teams y recordatorios.", k: "k3", r: "28px 40px 28px 34px", ic: IC.cal, b: n.ms ? (n.reuniones ? `${n.reuniones} en 24 h` : "Sin reuniones hoy") : "Conectar calendario" },
    { ruta: "equipos", t: "Pilo for Teams", d: "Grupos con memoria compartida.", k: "k4", r: "40px 28px 36px 28px", ic: IC.team, b: `${n.equipos} equipo${n.equipos === 1 ? "" : "s"}` },
    ...(conCorreo ? [{ ruta: "correo", t: "Correo", d: "Leer y ordenar sin enviar nada.", k: "k1", r: "30px 38px 28px 42px", ic: IC.mail, b: n.ms ? "Conectado" : "Conectar correo" } as Tile] : []),
    { ruta: "archivos", t: "Archivos", d: "OneDrive y SharePoint, sin borrar ni mover.", k: "k5", r: "34px 40px 30px 36px", ic: IC.cloud, b: "Conectar o explorar" },
    { ruta: "datos", t: "Datos en este equipo", d: "Revise Excel sin subirlo.", k: "k5", r: "38px 28px 40px 30px", ic: IC.data, b: "Se leen aquí" },
    { ruta: "skills", t: "Mis skills", d: "Sus maneras de trabajar.", k: "k6", r: "28px 42px 30px 36px", ic: IC.spark, b: `${n.skills} activas` },
    { ruta: "memoria", t: "Memoria", d: "Lo que Pilo sabe de su trabajo.", k: "k2", r: "42px 30px 34px 28px", ic: IC.mem, b: `${n.memoria} reglas suyas` },
    { ruta: "conectores", t: "Conectores", d: "Microsoft 365 y más.", k: "k3", r: "30px 34px 42px 28px", ic: IC.plug, b: n.ms ? "1 conectado" : "Ninguno conectado" },
    ...(esAdmin ? [{ ruta: "admin/memoria", t: "Administración", d: "Memoria colectiva, accesos y diseño.", k: "k4", r: "34px 28px 38px 30px", ic: IC.shield, b: `${n.propuestas} propuesta${n.propuestas === 1 ? "" : "s"} por revisar` } as Tile] : []),
  ].filter((t) => funciones[({ chat: "chat", cowork: "cowork", agenda: "agenda", equipos: "equipos", correo: "correo", archivos: "archivos", datos: "datos" } as Record<string, string>)[t.ruta] ?? ""] !== false);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setPedido(q.trim());
    ir("chat");
  };

  return (
    <div className="home" ref={raiz}>
      <div className="hi">
        <div className="hi__pilo" ref={pilo}>
          <img src={MOOD.feliz} alt="" />
        </div>
        <div>
          <h2>
            {saludo}, {nombre}. ¿Qué hacemos hoy?
          </h2>
          <p>
            {n.ms ? (
              <>
                Hoy tiene <b>{n.reuniones} reunion{n.reuniones === 1 ? "" : "es"}</b> en las próximas 24 horas
                {n.docs ? (
                  <>
                    {" "}
                    y <b>{n.docs} documento{n.docs === 1 ? "" : "s"}</b> en Cowork
                  </>
                ) : null}
                .
              </>
            ) : (
              <>Conecte su calendario para ver aquí sus reuniones.</>
            )}
          </p>
          <form className="ask" onSubmit={enviar}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escriba lo que necesita y Pilo empieza" aria-label="Pedir algo a Pilo" autoComplete="off" />
            <button type="submit" className="send" aria-label="Enviar">
              {IC.send}
            </button>
          </form>
        </div>
      </div>
      <div className="tiles">
        {T.map((t) => (
          <button
            key={t.ruta}
            type="button"
            className={`tile${t.big ? " big" : ""}`}
            style={{ ["--tb" as string]: `var(--${t.k})`, ["--ts" as string]: `var(--${t.k}s)`, ["--tr" as string]: t.r, ["--bl" as string]: "58% 42% 52% 48%/48% 56% 44% 52%" } as CSSProperties}
            onClick={() => ir(t.ruta)}
          >
            <span className="tile__ic">{t.ic}</span>
            <span>
              <span className="tile__t">{t.t}</span>
              <span className="tile__d" style={{ display: "block" }}>
                {t.d}
              </span>
              <span className="tile__b">{t.b}</span>
            </span>
            <span className="tile__go">{IC.arrow}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
