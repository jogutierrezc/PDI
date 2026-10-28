/* Administración · acceso y roles. Asigna roles con pw_asignar_rol (solo admin; la base lo comprueba). */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ROL_ETIQUETA } from "../api";
import type { Rol } from "../api";
import { IC, useEntra, useWork } from "../ui";

interface Persona {
  user_id: string;
  nombre: string;
  correo: string;
  dependencia: string;
  rol: Rol | null;
  pendiente: boolean;
}
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

  const asignar = async (p: Persona, rol: string, dependencia = p.dependencia) => {
    const { error } = await supabase.rpc("pw_asignar_rol", { p_user: p.user_id, p_rol: rol || null, p_dependencia: dependencia });
    if (error) return toast("No se pudo cambiar el rol.");
    toast(rol ? `Rol asignado a ${p.nombre.split(" ")[0]}` : "Se quitó el acceso");
    await cargar();
  };
  const visibles = filas.filter((p) => `${p.nombre} ${p.correo} ${p.dependencia}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pad" style={{ display: "grid", gap: 16, maxWidth: 1040, margin: "0 auto" }} ref={raiz}>
      <div className="box">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h2>Quién puede entrar</h2>
          <span className="badge role-adm">Solo administración</span>
        </div>
        <p className="muted" style={{ maxWidth: "66ch" }}>
          Solo las personas con un rol asignado usan Pilo at Work. Crear la cuenta y verificar el código no basta: la administración asigna el rol.
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
            <li className="item"><span className="ico">{IC.lock}</span><div><b>Rol obligatorio</b><p>Sin rol: cuenta verificada, sin acceso (lo impone la base de datos).</p></div><span /></li>
            <li className="item"><span className="ico">{IC.data}</span><div><b>Bitácora sin contenidos</b><p>Quién usó qué función y cuándo; nunca el texto ni los archivos.</p></div><span /></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
