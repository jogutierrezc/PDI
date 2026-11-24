/* Mi perfil · lo que Pilo sabe de usted para trabajar mejor con usted.
   La fila de pw_perfiles es solo de su dueña (RLS): la administración no ve el contenido. */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Dialogo, Seg, Tg } from "../ui";

export interface PerfilPw {
  nombre: string;
  cargo: string;
  dependencia: string;
  funciones: string;
  tono: "formal" | "cercano" | "conciso";
  idioma: "es" | "en" | "pt";
  firma: string;
  horario_inicio: string;
  horario_fin: string;
  zona: string;
  trato: string;
  temas: string;
  usar_en_respuestas: boolean;
  proponer_cambios: boolean;
}

export const PERFIL_VACIO: PerfilPw = {
  nombre: "",
  cargo: "",
  dependencia: "",
  funciones: "",
  tono: "cercano",
  idioma: "es",
  firma: "",
  horario_inicio: "08:00",
  horario_fin: "18:00",
  zona: "America/Bogota",
  trato: "",
  temas: "",
  usar_en_respuestas: true,
  proponer_cambios: true,
};

const TONOS = { formal: "formal e institucional", cercano: "cercano y cordial", conciso: "conciso y directo" } as const;
const IDIOMAS = { es: "español", en: "inglés", pt: "portugués" } as const;

/** Lo que ve Pilo (la misma forma que arma el servidor), para que la persona lo revise antes de guardar. */
export function resumenPerfil(p: PerfilPw): string[] {
  const l: string[] = [];
  if (p.nombre) l.push(`Se dirige a usted como ${p.nombre}.`);
  if (p.cargo || p.dependencia) l.push(`Sabe que es ${[p.cargo, p.dependencia].filter(Boolean).join(", ")}.`);
  if (p.funciones) l.push(`Tiene en cuenta sus funciones: ${p.funciones.slice(0, 160)}${p.funciones.length > 160 ? "…" : ""}`);
  l.push(`Escribe en tono ${TONOS[p.tono]}, en ${IDIOMAS[p.idioma]}.`);
  if (p.trato) l.push(`Sigue su indicación de trato: ${p.trato.slice(0, 140)}`);
  if (p.firma) l.push("Cierra oficios y correos con su firma.");
  l.push(`Propone reuniones entre ${p.horario_inicio} y ${p.horario_fin} (${p.zona}).`);
  return l;
}

export function PerfilDialogo({ userId, nombreBase, dependenciaBase, onCerrar, onGuardado, origen }: { userId: string; nombreBase: string; dependenciaBase: string; onCerrar: () => void; onGuardado: (p: PerfilPw) => void; origen?: { x: number; y: number } | null }) {
  const [f, setF] = useState<PerfilPw>({ ...PERFIL_VACIO, nombre: nombreBase, dependencia: dependenciaBase });
  const [estado, setEstado] = useState<"cargando" | "listo" | "guardando" | "guardado" | "error">("cargando");
  const [aviso, setAviso] = useState("");
  const [confirmaReset, setConfirmaReset] = useState(false);

  useEffect(() => {
    let vivo = true;
    void supabase
      .from("pw_perfiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setAviso("No se pudo leer su perfil. Si el problema sigue, avise a Planeación.");
          setEstado("error");
          return;
        }
        if (data) setF({ ...PERFIL_VACIO, ...(data as Partial<PerfilPw>) });
        setEstado("listo");
      });
    return () => {
      vivo = false;
    };
  }, [userId]);

  const set = <K extends keyof PerfilPw>(k: K, v: PerfilPw[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (estado === "guardado") setEstado("listo");
  };
  const horaMal = !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.horario_inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.horario_fin) || f.horario_fin <= f.horario_inicio;
  const vista = useMemo(() => resumenPerfil(f), [f]);

  const guardar = async () => {
    if (horaMal) return setAviso("Revise el horario: la hora de salida debe ser posterior a la de entrada.");
    setEstado("guardando");
    setAviso("");
    const { error } = await supabase.from("pw_perfiles").upsert({ user_id: userId, ...f, actualizado_en: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      setAviso("No se pudo guardar. Revise los datos e intente de nuevo.");
      return setEstado("error");
    }
    setEstado("guardado");
    onGuardado(f);
  };
  const restablecer = async () => {
    const { error } = await supabase.from("pw_perfiles").delete().eq("user_id", userId);
    if (error) return setAviso("No se pudo restablecer.");
    const limpio = { ...PERFIL_VACIO, nombre: nombreBase, dependencia: dependenciaBase };
    setF(limpio);
    setConfirmaReset(false);
    setEstado("listo");
    onGuardado(limpio);
  };

  const campo = (id: string, etiqueta: string, el: JSX.Element, ayuda?: string) => (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      {el}
      {ayuda && <span className="hint">{ayuda}</span>}
    </div>
  );

  return (
    <Dialogo
      titulo="Mi perfil"
      onCerrar={onCerrar}
      ancho={760}
      origen={origen}
      descripcion="Pilo usa estos datos para escribir como usted, firmar y proponer horarios. Solo usted los ve; la administración no."
      pie={
        <>
          {confirmaReset ? (
            <>
              <span className="small muted" style={{ marginRight: "auto" }}>¿Borrar todo su perfil?</span>
              <button type="button" className="btn sm" onClick={() => setConfirmaReset(false)} autoFocus>
                No, conservar
              </button>
              <button type="button" className="btn sm" onClick={() => void restablecer()}>
                Sí, borrar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn sm ghost" style={{ marginRight: "auto" }} onClick={() => setConfirmaReset(true)} disabled={estado === "cargando"}>
                Restablecer
              </button>
              <span className="small" role="status" style={{ color: estado === "guardado" ? "var(--ok)" : "var(--ink-3)" }}>
                {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : ""}
              </span>
              <button type="button" className="btn primary" disabled={estado === "cargando" || estado === "guardando"} onClick={() => void guardar()}>
                Guardar
              </button>
            </>
          )}
        </>
      }
    >
      {estado === "cargando" ? (
        <p className="muted">Cargando su perfil…</p>
      ) : (
        <div className="perfil">
          <div className="perfil__f">
            <div className="row2">
              {campo("pf-n", "Nombre para mostrar", <input className="inp" id="pf-n" value={f.nombre} maxLength={120} onChange={(e) => set("nombre", e.target.value)} />)}
              {campo("pf-c", "Cargo", <input className="inp" id="pf-c" value={f.cargo} maxLength={120} onChange={(e) => set("cargo", e.target.value)} placeholder="Profesional de Planeación" />)}
            </div>
            {campo("pf-d", "Dependencia", <input className="inp" id="pf-d" value={f.dependencia} maxLength={160} onChange={(e) => set("dependencia", e.target.value)} />)}
            {campo("pf-fu", "Funciones o áreas de responsabilidad", <textarea className="inp" id="pf-fu" rows={3} maxLength={1200} value={f.funciones} onChange={(e) => set("funciones", e.target.value)} style={{ padding: 10, minHeight: 72 }} />)}
            <div className="row2">
              <div className="field">
                <span id="pf-t" className="lbl">Tono preferido</span>
                <Seg etiqueta="Tono preferido" valor={f.tono} onChange={(v) => set("tono", v)} opciones={[["formal", "Formal"], ["cercano", "Cercano"], ["conciso", "Conciso"]]} />
              </div>
              <div className="field">
                <span className="lbl">Idioma</span>
                <Seg etiqueta="Idioma" valor={f.idioma} onChange={(v) => set("idioma", v)} opciones={[["es", "Español"], ["en", "English"], ["pt", "Português"]]} />
              </div>
            </div>
            {campo("pf-fi", "Firma de oficios y correos", <textarea className="inp" id="pf-fi" rows={3} maxLength={600} value={f.firma} onChange={(e) => set("firma", e.target.value)} style={{ padding: 10, minHeight: 72 }} placeholder={"Atentamente,\nNombre Apellido\nCargo"} />)}
            <div className="row2">
              {campo("pf-hi", "Entrada", <input className="inp" id="pf-hi" type="time" value={f.horario_inicio} onChange={(e) => set("horario_inicio", e.target.value)} />)}
              {campo("pf-hf", "Salida", <input className="inp" id="pf-hf" type="time" value={f.horario_fin} onChange={(e) => set("horario_fin", e.target.value)} />)}
            </div>
            {campo("pf-tr", "Cómo quiere que Pilo le trate", <input className="inp" id="pf-tr" value={f.trato} maxLength={400} onChange={(e) => set("trato", e.target.value)} placeholder="Directo, sin rodeos; por favor, listas cortas." />)}
            {campo("pf-te", "Temas de trabajo frecuentes", <input className="inp" id="pf-te" value={f.temas} maxLength={400} onChange={(e) => set("temas", e.target.value)} placeholder="Acreditación, SNIES, indicadores del PDI" />)}
            <div className="setrow">
              <span>
                Usar mi perfil en las respuestas
                <small>Si lo apaga, Pilo escribe sin estos datos.</small>
              </span>
              <Tg on={f.usar_en_respuestas} onChange={(v) => set("usar_en_respuestas", v)} label="Usar mi perfil en las respuestas" />
            </div>
            <div className="setrow">
              <span>
                Dejar que Pilo proponga actualizarlo
                <small>Siempre con su aprobación; nunca lo cambia solo.</small>
              </span>
              <Tg on={f.proponer_cambios} onChange={(v) => set("proponer_cambios", v)} label="Dejar que Pilo proponga actualizar mi perfil" />
            </div>
            {aviso && <p className="err" role="alert">{aviso}</p>}
          </div>
          <aside className="perfil__v" aria-label="Cómo me verá Pilo">
            <h3>Cómo me verá Pilo</h3>
            {f.usar_en_respuestas ? (
              <ul>
                {vista.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Con el perfil apagado, Pilo solo conoce su nombre y su dependencia de acceso.</p>
            )}
            {f.firma && f.usar_en_respuestas && <pre className="firma">{f.firma}</pre>}
          </aside>
        </div>
      )}
    </Dialogo>
  );
}
