/* =============================================================================
   Portal de agentes · el marco (menú, disponibilidad, conexión).

   Marco propio: no usa AdminShell ni el menú de la intranet. El agente ve su
   bandeja; el director, además, la cola y el reparto, los agentes y portales,
   las respuestas rápidas y etiquetas y los informes.
   ========================================================================== */

import { useCallback, useState } from "react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { actions, errorText, keys, useConversations, useRealtimeSync } from "./datos";
import type { Availability } from "./datos";
import { AVAILABILITY, Avatar, Notice, Seg } from "./ui";
import { useAgentSession, useMe } from "./sesion";
import { enVista, isVista, VISTAS } from "./vistas";
import type { Vista } from "./vistas";
import "./agentes.css";

const SEG: { value: Availability; label: string }[] = [
  { value: "en_linea", label: "En línea" },
  { value: "ocupado", label: "Ocupado" },
  { value: "fuera", label: "Fuera" },
];

export function Marco() {
  const me = useMe();
  const { refresh, signOut } = useAgentSession();
  const client = useQueryClient();
  const [connected, setConnected] = useState(true);
  const [menu, setMenu] = useState(false);
  const [problem, setProblem] = useState("");
  const [params] = useSearchParams();
  const onBandeja = useLocation().pathname.replace(/\/+$/, "") === "/agentes";
  const convs = useConversations();
  const onStatus = useCallback((ok: boolean) => setConnected(ok), []);
  useRealtimeSync(me.id, onStatus);

  const current = isVista(params.get("v")) ? (params.get("v") as Vista) : "mias";
  const count = (v: Vista) => (convs.data ?? []).filter((c) => enVista(c, v, me.id)).length;

  const setAvailability = async (value: Availability) => {
    setProblem("");
    try {
      await actions.availability(value);
      await refresh();
      void client.invalidateQueries({ queryKey: keys.agents });
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  return (
    <div className="ag ag-marco" data-menu={menu || undefined}>
      <a className="ag-skip" href="#ag-main">
        Saltar al contenido
      </a>
      <header className="ag-topbar">
        <img src="/logo-udes.svg" alt="Universidad de Santander, UDES" height={30} />
        <button type="button" className="ag-btn ag-press" aria-expanded={menu} aria-controls="ag-side" onClick={() => setMenu((m) => !m)}>
          Menú
        </button>
      </header>

      <aside className="ag-side" id="ag-side" aria-label="Menú del portal de agentes">
        <div className="ag-brand">
          <img src="/logo-udes.svg" alt="Universidad de Santander, UDES" height={38} />
          <small>Portal de agentes{me.role === "director" ? " · Director" : ""}</small>
        </div>

        <div className="ag-me">
          <Avatar name={me.name} url={me.photo_url} />
          <div>
            <div className="ag-me-name">{me.name}</div>
            <div className="ag-me-sub">{me.role === "director" ? "Director de agentes" : "Agente"}</div>
          </div>
        </div>

        <div className="ag-field">
          <span className="ag-lab">Mi disponibilidad</span>
          <Seg value={me.availability} options={SEG} label="Disponibilidad" onChange={(v) => void setAvailability(v)} />
          {problem ? <Notice>{problem}</Notice> : null}
        </div>

        <nav className="ag-nav" aria-label="Bandeja">
          {VISTAS.map((v) => (
            <NavLink key={v.key} to={`/agentes?v=${v.key}`} end className={`ag-nv ag-press${onBandeja && current === v.key ? " on" : ""}`} onClick={() => setMenu(false)}>
              <span>{v.label}</span>
              <span className="ag-n">{count(v.key)}</span>
            </NavLink>
          ))}
        </nav>

        {me.role === "director" ? (
          <nav className="ag-nav" aria-label="Director">
            <span className="ag-lab ag-lab-pad">Director</span>
            <NavLink to="/agentes/director" end className={({ isActive }) => `ag-nv ag-press${isActive ? " on" : ""}`} onClick={() => setMenu(false)}>
              Cola y reparto
            </NavLink>
            <NavLink to="/agentes/director/agentes" className={({ isActive }) => `ag-nv ag-press${isActive ? " on" : ""}`} onClick={() => setMenu(false)}>
              Agentes y portales
            </NavLink>
            <NavLink to="/agentes/director/catalogos" className={({ isActive }) => `ag-nv ag-press${isActive ? " on" : ""}`} onClick={() => setMenu(false)}>
              Respuestas y etiquetas
            </NavLink>
            <NavLink to="/agentes/director/informes" className={({ isActive }) => `ag-nv ag-press${isActive ? " on" : ""}`} onClick={() => setMenu(false)}>
              Informes
            </NavLink>
          </nav>
        ) : null}

        <div className="ag-side-foot">
          <span className={`ag-cx${connected ? "" : " re"}`} role="status">
            <i />
            {connected ? "Conectado" : "Reconectando…"}
          </span>
          <button type="button" className="ag-btn ag-press" onClick={() => void signOut()}>
            Salir
          </button>
        </div>
      </aside>

      <div className="ag-body" id="ag-main" tabIndex={-1}>
        <Outlet context={{ connected }} />
      </div>
    </div>
  );
}

/** Lo que el marco comparte con sus pantallas. */
export interface MarcoContext {
  connected: boolean;
}
