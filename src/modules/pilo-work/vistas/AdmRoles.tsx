/* Administración · acceso y roles. Asigna roles con pw_asignar_rol (solo admin; la base lo comprueba). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ROL_ETIQUETA } from "../api";
import type { Rol } from "../api";
import { IC, useEntra, useWork } from "../ui";
import { UNIT_ROLE } from "../../tableros/model";
import type { UnitRole } from "../../tableros/model";

interface Persona {
  user_id: string;
  nombre: string;
  correo: string;
  dependencia: string;
  rol: Rol | null;
  pendiente: boolean;
  unidad: string | null;
  cargo: string;
  via: string;
  sede: string;
  creado_en: string | null;
  estado: string | null;
  perfil_completo: boolean;
}
const ROLES_ASIGNABLES: Rol[] = ["colaborador", "colaborador_correo", "coordinacion"];
interface Uso {
  personas: number;
  con_rol: number;
  solicitudes: number;
  reglas_activas: number;
  propuestas: number;
  acciones_30d: number;
}

export function AdmRoles() {
  const { toast } = useWork();
  const [filas, setFilas] = useState<Persona[]>([]);
  const [uso, setUso] = useState<Uso | null>(null);
  const [q, setQ] = useState("");
  const raiz = useEntra(".tl", filas.length, 6);

  const cargar = useCallback(async () => {
    const [p, u] = await Promise.all([supabase.rpc("pw_personas_admin"), supabase.rpc("pw_uso_admin")]);
    setFilas(((p.data ?? []) as Persona[]).sort((a, b) => Number(b.pendiente) - Number(a.pendiente) || a.nombre.localeCompare(b.nombre)));
    setUso(((Array.isArray(u.data) ? u.data[0] : u.data) as Uso) ?? null);
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const asignar = async (p: Persona, rol: string, dependencia = p.dependencia, papel: UnitRole | null = null) => {
    const { error } = await supabase.rpc("pw_asignar_rol", { p_user: p.user_id, p_rol: rol || null, p_dependencia: dependencia, p_unit_rol: papel });
    if (error) return toast("No se pudo cambiar el rol.");
    toast(rol ? `Rol asignado a ${p.nombre.split(" ")[0]}` : "Se quitó el acceso");
    await cargar();
  };
  const dejarInvitado = async (p: Persona) => {
    const { error } = await supabase.rpc("pw_dejar_invitado", { p_user: p.user_id });
    if (error) return toast("No se pudo guardar.");
    toast("Queda como invitado. Puede darle un rol cuando quiera.");
    await cargar();
  };
  const perfiles = filas.filter((p) => p.perfil_completo);
  const visibles = filas.filter((p) => `${p.nombre} ${p.correo} ${p.dependencia}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pad" style={{ display: "grid", gap: 16, maxWidth: 1040, margin: "0 auto" }} ref={raiz}>
      <Bandeja perfiles={perfiles} asignar={asignar} dejarInvitado={dejarInvitado} />
      <div className="box">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Quién puede entrar</h2>
          <span className="badge role-adm">Solo administración</span>
          <a className="btn sm" href="/admin/pilo-work">
            Configurar en Planeación
          </a>
        </div>
        <p className="muted" style={{ maxWidth: "66ch" }}>
          Con cuenta UDES verificada y perfil completo, una persona entra como invitada (redactar y archivos locales). El resto de Pilo at Work se abre cuando la administración le asigna un rol.
        </p>
        {uso && (
          <div className="stat">
            <div>
              <b>{uso.con_rol}</b>
              <span>personas con rol</span>
            </div>
            <div>
              <b>{uso.solicitudes}</b>
              <span>solicitudes pendientes</span>
            </div>
            <div>
              <b>{uso.acciones_30d}</b>
              <span>acciones en 30 días (sin contenidos)</span>
            </div>
          </div>
        )}
        <input className="inp" placeholder="Buscar por nombre, correo o dependencia" aria-label="Buscar personas" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-lite">
          <div className="tl" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.9fr) minmax(0,1fr)" }}>
            <span>Persona</span>
            <span>Dependencia</span>
            <span>Rol</span>
          </div>
          {visibles.map((p) => (
            <div className="tl" key={p.user_id} style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.9fr) minmax(0,1fr)", alignItems: "center" }}>
              <span>
                <b>{p.nombre || "(sin nombre)"}</b> {p.pendiente && <span className="badge warn">Pide rol</span>}
                <br />
                <span className="muted">{p.correo}</span>
              </span>
              <span>{p.dependencia || "—"}</span>
              <span>
                <select className="inp" style={{ minHeight: 32 }} aria-label={`Rol de ${p.nombre}`} value={p.rol ?? ""} onChange={(e) => void asignar(p, e.target.value)}>
                  <option value="">Sin rol</option>
                  {(Object.keys(ROL_ETIQUETA) as Rol[]).map((r) => (
                    <option key={r} value={r}>
                      {ROL_ETIQUETA[r]}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          ))}
          {!visibles.length && <p className="muted" style={{ padding: 12 }}>Nadie coincide con la búsqueda.</p>}
        </div>
        <p className="hint">Quienes administran el portal (PDI) son administración de Pilo at Work sin necesidad de una fila aquí.</p>
      </div>
      <div className="grid2">
        <div className="box">
          <h2>Qué cambia con cada rol</h2>
          <ul className="flat">
            <li className="item"><span className="badge">Colaborador</span><div><p>Chat, Cowork, agenda, datos locales, equipos y memoria personal.</p></div><span /></li>
            <li className="item"><span className="badge blue">Con correo</span><div><p>Suma el correo de Microsoft 365 (leer, organizar y borradores).</p></div><span /></li>
            <li className="item"><span className="badge ok">Coordinación</span><div><p>Como «con correo»; pensado para quien lidera una oficina.</p></div><span /></li>
            <li className="item"><span className="badge warn">Administración</span><div><p>Asigna roles, cura la memoria colectiva y ve el uso (sin contenidos).</p></div><span /></li>
          </ul>
        </div>
        <div className="box">
          <h2>Reglas de la cuenta</h2>
          <ul className="flat">
            <li className="item"><span className="ico">{IC.key}</span><div><b>Correo UDES verificado</b><p>Código de seis dígitos o Microsoft.</p></div><span /></li>
            <li className="item"><span className="ico">{IC.lock}</span><div><b>Invitado sin rol</b><p>Sin Microsoft 365, sin memoria colectiva ni administración (lo impone la base de datos).</p></div><span /></li>
            <li className="item"><span className="ico">{IC.data}</span><div><b>Bitácora sin contenidos</b><p>Quién usó qué función y cuándo; nunca el texto ni los archivos.</p></div><span /></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* Perfiles nuevos: lo que la persona dijo de sí misma, y el rol, el papel en su unidad y la aprobación. */
function Bandeja({ perfiles, asignar, dejarInvitado }: { perfiles: Persona[]; asignar: (p: Persona, rol: string, dependencia?: string, papel?: UnitRole | null) => Promise<void>; dejarInvitado: (p: Persona) => Promise<void> }) {
  const [sel, setSel] = useState("");
  const [rol, setRol] = useState<Rol>("colaborador");
  const [papel, setPapel] = useState<UnitRole>("visor");
  const revisar = perfiles.filter((p) => !p.rol);
  const conRol = perfiles.filter((p) => p.rol);
  const p = perfiles.find((x) => x.user_id === sel);
  const fila = (x: Persona) => (
    <button key={x.user_id} type="button" className="tl" aria-pressed={sel === x.user_id} onClick={() => setSel(x.user_id)} style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) auto", textAlign: "left", alignItems: "center" }}>
      <span>
        <b>{x.nombre}</b>
        <br />
        <span className="muted">{x.correo}</span>
      </span>
      <span>
        {x.unidad || x.dependencia || "—"}
        <br />
        <span className="muted">{x.cargo}</span>
      </span>
      {x.rol ? <span className="badge ok">{ROL_ETIQUETA[x.rol]}</span> : x.estado === "invitado" ? <span className="badge">Invitado</span> : <span className="badge warn">Pendiente</span>}
    </button>
  );
  return (
    <div className="box">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2>Perfiles nuevos de Pilo At Work</h2>
        {revisar.some((x) => x.estado !== "invitado") && <span className="badge warn">{revisar.filter((x) => x.estado !== "invitado").length} por revisar</span>}
      </div>
      <p className="muted" style={{ maxWidth: "66ch" }}>
        Quien completa su perfil llega con nombre, unidad del organigrama y cargo. Al aprobar, la persona queda con rol, unidad y perfil de intranet.
      </p>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <b className="small">Por revisar · {revisar.length}</b>
          <div className="table-lite">{revisar.length ? revisar.map(fila) : <p className="muted" style={{ padding: 12 }}>No hay perfiles por revisar.</p>}</div>
          <b className="small">Con rol asignado · {conRol.length}</b>
          <div className="table-lite">{conRol.length ? conRol.map(fila) : <p className="muted" style={{ padding: 12 }}>Aún nadie.</p>}</div>
        </div>
        <div style={{ display: "grid", gap: 10 }} aria-live="polite">
          {!p && <p className="muted">Elija una persona de la lista para ver su perfil y darle un rol.</p>}
          {p && (
            <>
              <h3>{p.nombre}</h3>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 13 }}>
                <dt className="muted">Correo</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{p.correo}</dd>
                <dt className="muted">Unidad</dt><dd style={{ margin: 0 }}>{p.unidad || p.dependencia || "—"}</dd>
                <dt className="muted">Cargo</dt><dd style={{ margin: 0 }}>{p.cargo || "—"}</dd>
                <dt className="muted">Sede</dt><dd style={{ margin: 0 }}>{p.sede || "—"}</dd>
                <dt className="muted">Verificación</dt><dd style={{ margin: 0 }}>{p.via || "Correo UDES"}</dd>
              </dl>
              {p.rol ? (
                <span className="badge ok" style={{ justifySelf: "start" }}>Ya tiene el rol de {ROL_ETIQUETA[p.rol]}</span>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="b-rol">Rol en Pilo At Work</label>
                    <select className="inp" id="b-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                      {ROLES_ASIGNABLES.map((r) => <option key={r} value={r}>{ROL_ETIQUETA[r]}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="b-papel">Papel en la unidad</label>
                    <select className="inp" id="b-papel" value={papel} onChange={(e) => setPapel(e.target.value as UnitRole)}>
                      {(Object.keys(UNIT_ROLE) as UnitRole[]).map((r) => <option key={r} value={r}>{UNIT_ROLE[r].label}</option>)}
                    </select>
                    <span className="hint">La unidad ya viene elegida por la persona.</span>
                  </div>
                  <button type="button" className="btn primary" onClick={() => void asignar(p, rol, p.unidad || p.dependencia, papel)}>Aprobar y asignar</button>
                  <button type="button" className="btn" onClick={() => void dejarInvitado(p)}>Dejar como invitado</button>
                  <p className="hint">Al aprobar se escribe el perfil de intranet (profiles), la pertenencia a la unidad (unit_members) y el rol de Pilo At Work (pw_roles). El aviso por correo aún no existe: escríbale usted.</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
