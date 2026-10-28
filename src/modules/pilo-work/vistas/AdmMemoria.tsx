/* Administración · memoria colectiva (curaduría): reglas publicadas y propuestas. Solo rol admin (RLS lo impone). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import type { Colectiva, Propuesta } from "../api";
import { hace } from "../api";
import { Seg, Tg, useEntra, useWork } from "../ui";

export function AdmMemoria() {
  const { perfil, toast, refrescarNav } = useWork();
  const [tab, setTab] = useState<"reg" | "pro">("reg");
  const [reglas, setReglas] = useState<Colectiva[]>([]);
  const [props, setProps] = useState<Propuesta[]>([]);
  const [nueva, setNueva] = useState("");
  const raiz = useEntra(".mem,.prop", tab, 8);

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("pw_memoria_colectiva").select("*").order("creado_en", { ascending: false }),
      supabase.from("pw_propuestas").select("*").eq("estado", "pendiente").order("creado_en"),
    ]);
    setReglas((a.data ?? []) as Colectiva[]);
    setProps((b.data ?? []) as Propuesta[]);
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const publicar = async (texto: string) => {
    const { error } = await supabase.from("pw_memoria_colectiva").insert({ texto: texto.trim(), publicada_por: perfil.userId });
    if (error) toast("No se pudo publicar.");
    return !error;
  };
  const resolver = async (p: Propuesta, ok: boolean, texto: string) => {
    if (ok && !(await publicar(texto))) return;
    await supabase.from("pw_propuestas").update({ estado: ok ? "aprobada" : "rechazada", resuelto_por: perfil.userId, resuelto_en: new Date().toISOString() }).eq("id", p.id);
    toast(ok ? "Publicada en la memoria colectiva" : `Propuesta rechazada · se avisa a ${p.autor.split(" ")[0] || "la persona"}`);
    refrescarNav();
    await cargar();
  };
  const activas = reglas.filter((r) => r.activa).length;
  const usos = reglas.reduce((a, r) => a + r.usos, 0);

  return (
    <div className="pad" style={{ display: "grid", gap: 16, maxWidth: 980, margin: "0 auto" }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Memoria colectiva de la oficina</h2>
          <span className="badge role-adm">Solo administración</span>
        </div>
        <p className="muted" style={{ maxWidth: "68ch" }}>
          Lo que publique aquí lo aplica Pilo a todas las personas de la oficina. Las personas proponen reglas desde su propia memoria; usted decide cuáles se publican.
        </p>
        <div className="stat">
          <div>
            <b>{activas}</b>
            <span>reglas activas</span>
          </div>
          <div>
            <b>{props.length}</b>
            <span>propuestas por revisar</span>
          </div>
          <div>
            <b>{usos}</b>
            <span>veces que Pilo las aplicó</span>
          </div>
        </div>
        <Seg valor={tab} onChange={setTab} etiqueta="Administración" opciones={[["reg", "Reglas publicadas"], ["pro", `Propuestas (${props.length})`]]} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {tab === "reg" ? (
          <>
            <div className="box" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "end" }}>
              <div className="field">
                <label htmlFor="col-n">Publicar una regla nueva</label>
                <input className="inp" id="col-n" value={nueva} maxLength={600} onChange={(e) => setNueva(e.target.value)} placeholder="Toda comunicación externa lleva el pie de página oficial de la UDES" />
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  if (nueva.trim().length >= 3 && (await publicar(nueva))) {
                    setNueva("");
                    await cargar();
                  }
                }}
              >
                Publicar
              </button>
            </div>
            {reglas.map((m) => (
              <div className={`mem colect${m.activa ? "" : " off"}`} key={m.id}>
                <div>
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    style={{ outline: 0 }}
                    aria-label="Texto de la regla"
                    onBlur={async (e) => {
                      const t = e.currentTarget.innerText.trim();
                      if (t && t !== m.texto) {
                        await supabase.from("pw_memoria_colectiva").update({ texto: t }).eq("id", m.id);
                        await cargar();
                      }
                    }}
                  >
                    {m.texto}
                  </p>
                  <small>
                    Publicada {hace(m.creado_en)} · usada en {m.usos} respuestas
                  </small>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tg
                    on={m.activa}
                    label="Regla activa"
                    onChange={async (v) => {
                      await supabase.from("pw_memoria_colectiva").update({ activa: v }).eq("id", m.id);
                      await cargar();
                    }}
                  />
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={async () => {
                      await supabase.from("pw_memoria_colectiva").delete().eq("id", m.id);
                      await cargar();
                    }}
                  >
                    Retirar
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {!props.length && <p className="muted">No hay propuestas por revisar.</p>}
            {props.map((p) => (
              <Prop key={p.id} p={p} resolver={resolver} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Prop({ p, resolver }: { p: Propuesta; resolver: (p: Propuesta, ok: boolean, texto: string) => void }) {
  const [texto, setTexto] = useState(p.texto);
  return (
    <div className="prop">
      <span className="avatar" style={{ background: "var(--blue-soft)", color: "var(--blue-strong)" }}>
        {(p.autor || "?").charAt(0)}
      </span>
      <div>
        <input className="inp" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto que se publicaría (puede editarlo)" />
        <p className="small muted" style={{ marginTop: 4 }}>
          {p.autor} · {p.origen || "Propuesta de la persona"} · {hace(p.creado_en)}
        </p>
      </div>
      <div className="acts">
        <button type="button" className="btn sm primary" onClick={() => resolver(p, true, texto)}>
          Aprobar y publicar
        </button>
        <button type="button" className="btn sm" onClick={() => resolver(p, false, texto)}>
          Rechazar
        </button>
      </div>
    </div>
  );
}
