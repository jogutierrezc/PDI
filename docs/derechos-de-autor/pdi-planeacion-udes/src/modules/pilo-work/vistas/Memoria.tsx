/* Memoria · la personal (solo suya) y la colectiva de la oficina (solo lectura aquí). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import type { Colectiva, Memoria as Mem } from "../api";
import { hace } from "../api";
import { sale, Seg, Tg, useEntra, useWork } from "../ui";

export function Memoria() {
  const { perfil, toast, refrescarNav } = useWork();
  const [tab, setTab] = useState<"mia" | "col">("mia");
  const [mias, setMias] = useState<Mem[]>([]);
  const [col, setCol] = useState<Colectiva[]>([]);
  const [propias, setPropias] = useState<Set<string>>(new Set());
  const [nuevo, setNuevo] = useState("");
  const raiz = useEntra(".mem", tab, 8);

  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("pw_memoria").select("*").eq("user_id", perfil.userId).order("creado_en", { ascending: false }).limit(200),
      supabase.from("pw_memoria_colectiva").select("*").eq("activa", true).order("creado_en", { ascending: false }),
      supabase.from("pw_propuestas").select("texto").eq("user_id", perfil.userId).eq("estado", "pendiente"),
    ]);
    setMias((a.data ?? []) as Mem[]);
    setCol((b.data ?? []) as Colectiva[]);
    setPropias(new Set((c.data ?? []).map((x) => x.texto as string)));
  }, [perfil.userId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const propuestas = mias.filter((m) => m.estado === "propuesta");
  const aceptadas = mias.filter((m) => m.estado === "aceptada");

  const decidir = async (m: Mem, acepta: boolean) => {
    if (acepta) await supabase.from("pw_memoria").update({ estado: "aceptada", nueva: true, confianza: "nueva" }).eq("id", m.id);
    else await supabase.from("pw_memoria").delete().eq("id", m.id);
    await cargar();
  };
  const alternar = async (m: Mem, activa: boolean) => {
    setMias((l) => l.map((x) => (x.id === m.id ? { ...x, activa } : x)));
    await supabase.from("pw_memoria").update({ activa }).eq("id", m.id);
  };
  const olvidar = (m: Mem, el: HTMLElement | null) =>
    sale(el, async () => {
      await supabase.from("pw_memoria").delete().eq("id", m.id);
      await cargar();
    });
  const proponer = async (m: Mem) => {
    if (propias.has(m.texto)) return toast("Ya está propuesta");
    const { error } = await supabase.from("pw_propuestas").insert({ user_id: perfil.userId, autor: perfil.nombre, texto: m.texto, origen: m.origen });
    if (error) return toast("No se pudo enviar la propuesta.");
    toast("Enviada al administrador para su revisión");
    refrescarNav();
    await cargar();
  };
  const agregar = async () => {
    const t = nuevo.trim();
    if (t.length < 3) return;
    const { error } = await supabase.from("pw_memoria").insert({ user_id: perfil.userId, texto: t, origen: "Escrita por usted", confianza: "alta" });
    if (error) return toast("No se pudo guardar.");
    setNuevo("");
    await cargar();
  };

  return (
    <div className="pad" style={{ display: "grid", gap: 16, maxWidth: 980, margin: "0 auto" }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Lo que Pilo sabe de su trabajo</h2>
          <span className="badge blue">Memoria independiente</span>
        </div>
        <p className="muted" style={{ maxWidth: "68ch" }}>
          Tiene dos memorias. La <b>suya</b> es solo suya: nadie más la ve ni la edita. La <b>colectiva</b> la administra la administración y vale para toda la oficina. Ninguna se mezcla con la de Pilo en el portal.
        </p>
        <Seg valor={tab} onChange={setTab} etiqueta="Memoria" opciones={[["mia", "Mi memoria"], ["col", "Colectiva de la oficina"]]} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {tab === "mia" ? (
          <>
            {propuestas.length > 0 && (
              <div className="box">
                <h2>Pilo propone recordar</h2>
                <p className="hint">Usted decide. Si no la acepta, Pilo la olvida.</p>
                {propuestas.map((m) => (
                  <div className="mem new" key={m.id}>
                    <div>
                      <p>{m.texto}</p>
                      <small>{m.origen}</small>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button type="button" className="btn sm primary" onClick={() => void decidir(m, true)}>
                        Recordar
                      </button>
                      <button type="button" className="btn sm" onClick={() => void decidir(m, false)}>
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="box" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "end" }}>
              <div className="field">
                <label htmlFor="mem-n">Agregar una regla propia</label>
                <input className="inp" id="mem-n" value={nuevo} maxLength={600} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void agregar()} placeholder="Los informes llevan el corte entre paréntesis" />
              </div>
              <button type="button" className="btn primary" onClick={() => void agregar()}>
                Agregar
              </button>
            </div>
            {!aceptadas.length && <p className="muted">Todavía no hay nada. Pilo aprende cuando usted corrige o aplica sugerencias en Cowork.</p>}
            {aceptadas.map((m) => (
              <div className={`mem${m.activa ? "" : " off"}${m.nueva ? " new" : ""}`} key={m.id} id={`m-${m.id}`}>
                <div>
                  <p>{m.texto}</p>
                  <small>
                    {m.origen || "Sin origen"} · {hace(m.creado_en)}
                    {m.nueva ? " · nuevo" : ""}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span className={`badge ${m.confianza === "alta" ? "ok" : m.confianza === "nueva" ? "blue" : "warn"}`}>{m.confianza === "alta" ? "Confianza alta" : m.confianza === "nueva" ? "Recién aprendido" : "Confianza media"}</span>
                  <Tg on={m.activa} onChange={(v) => void alternar(m, v)} label="Usar esta regla" />
                  <button type="button" className="btn sm" disabled={propias.has(m.texto)} onClick={() => void proponer(m)}>
                    {propias.has(m.texto) ? "Propuesta enviada" : "Proponer a la colectiva"}
                  </button>
                  <button type="button" className="btn sm ghost" onClick={() => olvidar(m, document.getElementById(`m-${m.id}`))}>
                    Olvidar
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="hint">Solo lectura. Si cree que falta una regla, propóngala desde «Mi memoria»: la administración decide si se publica.</p>
            {!col.length && <p className="muted">La oficina aún no ha publicado reglas.</p>}
            {col.map((m) => (
              <div className="mem colect" key={m.id}>
                <div>
                  <p>{m.texto}</p>
                  <small>
                    Publicada por Administración · {hace(m.creado_en)} · usada en {m.usos} respuestas
                  </small>
                </div>
                <span className="badge">Solo lectura</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
