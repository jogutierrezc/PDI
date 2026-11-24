/* Mis skills · por persona, con propuestas de Pilo y las de la oficina (las publica la administración). */

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../lib/supabase";
import { HERRAMIENTAS } from "../api";
import type { Skill } from "../api";
import { Cara, IC, Tg, useEntra, useWork } from "../ui";

const COLORES = ["k1", "k2", "k3", "k5", "k6"];
/** Qué tarea repetida detecta Pilo (las señales las marca Cowork al crear cada tipo de documento). */
const SUGERENCIAS: Record<string, { n: string; cuando: string; pasos: string; herr: string[]; texto: string }> = {
  "doc:acta": { n: "Acta con responsables", cuando: "Al cerrar una reunión con acuerdos", pasos: "1. Cada acuerdo lleva responsable y fecha límite.\n2. Si falta alguno, pregunte antes de cerrar el acta.", herr: ["cow", "agenda"], texto: "Esta semana creó varias actas. ¿Creo la skill «Acta con responsables»: cada acuerdo con responsable y fecha?" },
  "doc:oficio": { n: "Oficio institucional", cuando: "Cuando redacte un oficio o una carta formal", pasos: "1. Abra con «Cordial saludo,» y cierre con «Atentamente,».\n2. Toda cifra lleva corte y fuente.\n3. Frases de máximo 25 palabras.", herr: ["mem", "cow"], texto: "Ya redactó varios oficios. ¿Creo la skill «Oficio institucional» con su manera de escribirlos?" },
  "doc:informe": { n: "Informe ejecutivo", cuando: "Cuando prepare un informe", pasos: "1. Resumen de tres líneas.\n2. Hallazgos con cifra, corte y fuente.\n3. Recomendaciones accionables.", herr: ["mem", "cow"], texto: "Repite el formato de informe. ¿Creo la skill «Informe ejecutivo»?" },
  "doc:circular": { n: "Circular", cuando: "Cuando prepare una circular", pasos: "1. Número, para quién y de quién.\n2. Asunto en una frase.\n3. Disposiciones numeradas.", herr: ["cow"], texto: "Ya hizo varias circulares. ¿Creo la skill «Circular»?" },
  "datos:conteo": { n: "Conteos de matrícula", cuando: "Cuando abra un archivo de matrícula", pasos: "1. Detecte columnas sensibles y ciérrelas.\n2. Calcule los conteos en el equipo.\n3. Cite el corte.", herr: ["datos"], texto: "Repite los mismos conteos sobre sus archivos. ¿Creo la skill «Conteos de matrícula»?" },
};

export function Skills() {
  const { perfil, esAdmin, toast, setPedido, ir } = useWork();
  const [lista, setLista] = useState<Skill[]>([]);
  const [senal, setSenal] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Skill> | null>(null);
  const raiz = useEntra(".sk", lista.length, 14);

  const cargar = useCallback(async () => {
    const [s, g] = await Promise.all([
      supabase.from("pw_skills").select("*").order("creado_en", { ascending: false }),
      supabase.from("pw_senales").select("clave, n, descartada").eq("user_id", perfil.userId).gte("n", 3).eq("descartada", false).like("clave", "%:%"),
    ]);
    const skills = (s.data ?? []) as Skill[];
    setLista(skills);
    const ya = new Set(skills.filter((x) => x.alcance === "personal").map((x) => x.nombre.toLowerCase()));
    const c = (g.data ?? []).map((x) => x.clave as string).find((k) => SUGERENCIAS[k] && !ya.has(SUGERENCIAS[k].n.toLowerCase()));
    setSenal(c ?? null);
  }, [perfil.userId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crearDeSenal = async () => {
    const s = senal && SUGERENCIAS[senal];
    if (!s || !senal) return;
    await supabase.from("pw_skills").insert({ user_id: perfil.userId, alcance: "personal", nombre: s.n, cuando: s.cuando, instrucciones: s.pasos, herramientas: s.herr, color: "k6", nueva: true });
    await supabase.from("pw_senales").update({ descartada: true }).eq("user_id", perfil.userId).eq("clave", senal);
    toast("Skill creada · puede editarla cuando quiera");
    await cargar();
  };
  const descartar = async () => {
    if (senal) await supabase.from("pw_senales").update({ descartada: true }).eq("user_id", perfil.userId).eq("clave", senal);
    await cargar();
  };
  const guardar = async () => {
    if (!edit) return;
    const nombre = (edit.nombre ?? "").trim();
    if (nombre.length < 2) return toast("Póngale un nombre a la skill");
    const oficina = edit.alcance === "oficina";
    const fila = { nombre, cuando: edit.cuando ?? "", instrucciones: edit.instrucciones ?? "", herramientas: edit.herramientas ?? ["mem"] };
    const r = edit.id
      ? await supabase.from("pw_skills").update(fila).eq("id", edit.id)
      : await supabase.from("pw_skills").insert({ ...fila, alcance: oficina ? "oficina" : "personal", user_id: oficina ? null : perfil.userId, color: COLORES[lista.length % COLORES.length], nueva: true });
    if (r.error) return toast("No se pudo guardar la skill.");
    setEdit(null);
    toast("Skill guardada");
    await cargar();
  };
  const alternar = async (s: Skill, activa: boolean) => {
    // Las de la oficina las apaga la administración; la persona solo apaga las suyas.
    if (s.alcance === "oficina" && !esAdmin) return toast("Esta skill la administra la oficina. Copie la suya para cambiarla.");
    setLista((l) => l.map((x) => (x.id === s.id ? { ...x, activa } : x)));
    await supabase.from("pw_skills").update({ activa }).eq("id", s.id);
  };
  const copiar = async (s: Skill) => {
    await supabase.from("pw_skills").insert({ user_id: perfil.userId, alcance: "personal", nombre: `${s.nombre} (mi versión)`, cuando: s.cuando, instrucciones: s.instrucciones, herramientas: s.herramientas, color: s.color, nueva: true });
    toast("Copiada a sus skills");
    await cargar();
  };
  const borrar = async (s: Skill) => {
    await supabase.from("pw_skills").delete().eq("id", s.id);
    await cargar();
  };

  const sug = senal ? SUGERENCIAS[senal] : null;
  return (
    <div className="skills" ref={raiz}>
      <div>
        <h2 className="h2" style={{ fontSize: 19 }}>
          Mis skills
        </h2>
        <p className="muted" style={{ maxWidth: "68ch" }}>
          Una skill es una manera de trabajar que Pilo aplica solo cuando viene al caso. Las suyas son personales; las de la oficina las publica la administración y usted puede copiarlas y ajustarlas.
        </p>
      </div>
      {sug && (
        <div className="nudge">
          <Cara mood="idea" />
          <div>
            <b>Noté que repite algo</b>
            <p>{sug.texto}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn sm primary" onClick={() => void crearDeSenal()}>
              Crear skill
            </button>
            <button type="button" className="btn sm" onClick={() => void descartar()}>
              No
            </button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => setEdit({ herramientas: ["mem"], alcance: "personal" })}>
          Crear una skill
        </button>
        {esAdmin && (
          <button type="button" className="btn" onClick={() => setEdit({ herramientas: ["mem"], alcance: "oficina" })}>
            Publicar una skill de la oficina
          </button>
        )}
        <span className="hint">Pilo también le propone skills cuando nota que repite algo.</span>
      </div>
      <div className="sk-grid">
        {lista.map((s, i) => {
          const suya = s.alcance === "personal";
          return (
            <article key={s.id} className={`sk${s.activa ? "" : " off"}`} style={{ ["--tb" as string]: `var(--${s.color || "k1"})`, ["--ts" as string]: `var(--${s.color || "k1"}s)`, ["--tr" as string]: i % 2 ? "36px 26px 32px 26px" : "26px 38px 26px 32px" } as CSSProperties}>
              <header>
                <span className="ico">{IC.spark}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{s.nombre}</h3>
                  <div className="meta">
                    <span className={`badge ${suya ? "blue" : "ok"}`}>{suya ? "Suya" : "De la oficina"}</span>
                    {s.nueva && <span className="badge warn">Nueva</span>}
                    <span className="hint">Usada {s.usos} veces</span>
                  </div>
                </div>
                <Tg on={s.activa} onChange={(v) => void alternar(s, v)} label={`Usar la skill «${s.nombre}»`} />
              </header>
              <p>
                <b>Cuándo:</b> {s.cuando || "—"}
              </p>
              <div className="meta">
                {s.herramientas.map((t) => (
                  <span className="badge" key={t}>
                    {HERRAMIENTAS[t] ?? t}
                  </span>
                ))}
              </div>
              <div className="acts">
                {suya || esAdmin ? (
                  <button type="button" className="btn sm" onClick={() => setEdit(s)}>
                    Editar
                  </button>
                ) : (
                  <button type="button" className="btn sm" onClick={() => void copiar(s)}>
                    Copiar a mis skills
                  </button>
                )}
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setPedido(`Usa la skill «${s.nombre}» en mi trabajo de hoy`);
                    ir("chat");
                  }}
                >
                  Probar con Pilo
                </button>
                {(suya || esAdmin) && (
                  <button type="button" className="btn sm ghost" onClick={() => void borrar(s)}>
                    Eliminar
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!lista.length && <p className="muted">Aún no tiene skills. Cree la primera o espere a que Pilo le proponga una.</p>}
      {edit && (
        <div className="sk-ed">
          <h2 className="h2">{edit.id ? "Editar skill" : edit.alcance === "oficina" ? "Nueva skill de la oficina" : "Nueva skill"}</h2>
          <div className="field">
            <label htmlFor="sk-n">Nombre</label>
            <input className="inp" id="sk-n" value={edit.nombre ?? ""} maxLength={120} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="Informe mensual de avance" />
          </div>
          <div className="field">
            <label htmlFor="sk-w">Cuándo debe usarla Pilo</label>
            <input className="inp" id="sk-w" value={edit.cuando ?? ""} maxLength={300} onChange={(e) => setEdit({ ...edit, cuando: e.target.value })} placeholder="Cuando me pida el informe mensual" />
          </div>
          <div className="field">
            <label htmlFor="sk-s">Instrucciones paso a paso</label>
            <textarea className="inp" id="sk-s" value={edit.instrucciones ?? ""} maxLength={4000} onChange={(e) => setEdit({ ...edit, instrucciones: e.target.value })} placeholder="1. …" />
          </div>
          <div className="field">
            <label>Qué puede usar</label>
            <div className="toolchips">
              {Object.entries(HERRAMIENTAS).map(([k, t]) => {
                const on = (edit.herramientas ?? []).includes(k);
                return (
                  <button key={k} type="button" className="tag" aria-pressed={on} onClick={() => setEdit({ ...edit, herramientas: on ? (edit.herramientas ?? []).filter((x) => x !== k) : [...(edit.herramientas ?? []), k] })}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn primary" onClick={() => void guardar()}>
              Guardar skill
            </button>
            <button type="button" className="btn" onClick={() => setEdit(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
