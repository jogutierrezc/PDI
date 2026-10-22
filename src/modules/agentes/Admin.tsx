/* =============================================================================
   Portal de agentes · el director administra: agentes y equipos, portales de
   Pilo con atención por agente, respuestas rápidas y etiquetas.

   Todo se escribe directo en las tablas support_* (la RLS deja escribir solo al
   director). Crear un agente guarda su fila y le envía la invitación por correo
   con la función `soporte` (que usa la función de correos).
   ========================================================================== */

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { soporte, asSoporteError } from "../soporte/llamada";
import { errorText, keys, PORTAL_NAME, useAgents, useHolidays, useLabels, useMembers, usePortals, useQuickReplies, useTeams } from "./datos";
import type { Agent, Portal, SpaceKey } from "./datos";
import { enterBlock, enterList, useMotion } from "./motion";
import { Avatar, Icon, Notice, PortalTag, Seg, Switch, Tag } from "./ui";

type Result = { error: { message: string } | null };

/** Corre una escritura, avisa si falla y deja las consultas al día. */
function useWrite() {
  const client = useQueryClient();
  const [problem, setProblem] = useState("");
  const [ok, setOk] = useState("");
  const run = async (fn: () => PromiseLike<Result> | Promise<void>, done: string, refresh: (readonly string[])[] = []) => {
    setProblem("");
    setOk("");
    try {
      const out = (await fn()) as Result | void;
      if (out && (out as Result).error) throw new Error((out as Result).error?.message);
      setOk(done);
      refresh.forEach((k) => void client.invalidateQueries({ queryKey: k }));
      return true;
    } catch (e) {
      const m = (e as Error).message ?? "";
      setProblem(/duplicate|unique/i.test(m) ? "Ya existe uno con ese nombre o correo." : /row-level security|permission denied/i.test(m) ? "Solo el director puede hacer este cambio." : errorText(e));
      return false;
    }
  };
  return { run, problem, ok };
}

const DAYS: [string, string][] = [["1", "Lunes"], ["2", "Martes"], ["3", "Miércoles"], ["4", "Jueves"], ["5", "Viernes"], ["6", "Sábado"], ["0", "Domingo"]];

/* --- Agentes y portales ----------------------------------------------------------------------------- */

export function AgentesAdmin() {
  const agents = useAgents();
  const teams = useTeams();
  const members = useMembers();
  const portals = usePortals();
  const { run, problem, ok } = useWrite();
  const [form, setForm] = useState({ name: "", email: "", role: "agent" as "agent" | "director", photo: "", teams: [] as string[] });
  const [teamName, setTeamName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [invited, setInvited] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const okRef = useRef<HTMLDivElement>(null);
  useMotion(listRef, () => enterList(Array.from(listRef.current?.querySelectorAll("[data-row]") ?? []).slice(0, 10)), [agents.data?.length]);
  useMotion(okRef, () => enterBlock(okRef.current?.firstElementChild ?? null), [invited]);

  const teamNames = (id: string) => (teams.data ?? []).filter((t) => (members.data ?? []).some((m) => m.team_id === t.id && m.agent_id === id)).map((t) => t.name).join(", ") || "Sin equipo";

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setInvited("");
    const email = form.email.trim().toLowerCase();
    const done = await run(
      async () => {
        const ins = await supabase.from("support_agents").insert({ name: form.name.trim(), email, role: form.role, photo_url: form.photo.trim() }).select("id").single();
        if (ins.error) return ins;
        const id = (ins.data as { id: string }).id;
        if (form.teams.length) {
          const t = await supabase.from("support_team_members").insert(form.teams.map((team_id) => ({ team_id, agent_id: id })));
          if (t.error) return t;
        }
        try {
          await soporte({ action: "invitar", agente_id: id }, { session: true });
          setInvited(`Invitación enviada a ${email}. Entra con Microsoft UDES o con un código por correo.`);
        } catch (err) {
          setInvited(`Se creó el agente, pero no pudimos enviar la invitación: ${asSoporteError(err).message}`);
        }
        return { error: null };
      },
      "",
      [keys.agents, keys.members],
    );
    if (done) setForm({ name: "", email: "", role: "agent", photo: "", teams: [] });
  };

  const resend = async (a: Agent) => {
    setInvited("");
    try {
      await soporte({ action: "invitar", agente_id: a.id }, { session: true });
      setInvited(`Invitación enviada a ${a.email}.`);
    } catch (err) {
      setInvited(asSoporteError(err).message);
    }
  };

  return (
    <main className="ag-page">
      <header className="ag-page-head">
        <h1>Agentes y portales</h1>
      </header>
      {problem ? <Notice>{problem}</Notice> : null}
      <div ref={okRef}>{invited ? <Notice tone={invited.startsWith("Invitación") ? "ok" : "error"}>{invited}</Notice> : null}</div>

      <div className="ag-cols ag-cols-form">
        <div className="ag-stack">
          <section className="ag-card" aria-label="Agentes">
            <div className="ag-card-head">
              <h2>Equipo de soporte</h2>
              <span className="ag-sub">{agents.data?.length ?? 0} personas</span>
            </div>
            <div ref={listRef}>
              {(agents.data ?? []).map((a) => (
                <div key={a.id} data-row>
                  <div className="ag-ar">
                    <Avatar name={a.name} url={a.photo_url} />
                    <div className="ag-grow"><b>{a.name}</b><div className="ag-sub">{a.email}</div></div>
                    <Tag tone={a.role === "director" ? "y" : "b"}>{a.role === "director" ? "Director" : "Agente"}</Tag>
                    {!a.active ? <Tag tone="n">Inactivo</Tag> : null}
                    <span className="ag-sub">{teamNames(a.id)}</span>
                    {!a.user_id ? <Tag tone="n">{a.invited_at ? "Invitación enviada" : "Sin invitar"}</Tag> : null}
                    <button type="button" className="ag-btn ag-sm ag-press" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id}>
                      Editar
                    </button>
                  </div>
                  {editing === a.id ? <AgentEditor agent={a} teams={teams.data ?? []} memberOf={(members.data ?? []).filter((m) => m.agent_id === a.id).map((m) => m.team_id)} onResend={() => void resend(a)} /> : null}
                </div>
              ))}
            </div>
            {!agents.data?.length ? <p className="ag-empty">Todavía no hay agentes.</p> : null}
          </section>

          <section className="ag-card" aria-label="Equipos">
            <div className="ag-card-head"><h2>Equipos</h2></div>
            <div className="ag-pad">
              <div className="ag-tags">
                {(teams.data ?? []).map((t) => (
                  <span key={t.id} className="ag-tag ag-t-n ag-tag-x">
                    {t.name}
                    <button type="button" className="ag-x ag-press" aria-label={`Quitar el equipo ${t.name}`} onClick={() => void run(() => supabase.from("support_teams").delete().eq("id", t.id), "", [keys.teams, keys.members, keys.portals])}><Icon name="close" size={16} /></button>
                  </span>
                ))}
              </div>
              <form className="ag-inline" onSubmit={(e) => { e.preventDefault(); const n = teamName.trim(); if (n) void run(() => supabase.from("support_teams").insert({ name: n }), "", [keys.teams]).then((ok2) => ok2 && setTeamName("")); }}>
                <input className="ag-in" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nombre del equipo nuevo" aria-label="Nombre del equipo nuevo" maxLength={80} />
                <button type="submit" className="ag-btn ag-press" disabled={teamName.trim().length < 2}>Crear equipo</button>
              </form>
            </div>
          </section>

          {(portals.data ?? []).map((p) => (
            <PortalCard key={p.space} portal={p} teams={teams.data ?? []} />
          ))}
        </div>

        <aside>
          <form className="ag-card ag-pad ag-formcard" onSubmit={create} aria-label="Crear agente">
            <h2>Crear un agente</h2>
            <label className="ag-label">Nombre completo<input className="ag-in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellidos" required minLength={2} maxLength={120} /></label>
            <label className="ag-label">Correo institucional<input className="ag-in" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nombre@mail.udes.edu.co" required /></label>
            <div className="ag-label">Rol
              <Seg value={form.role} label="Rol" options={[{ value: "agent", label: "Agente" }, { value: "director", label: "Director" }]} onChange={(role) => setForm({ ...form, role })} />
              <span className="ag-hint">{form.role === "director" ? "Ve y reparte todo, y administra agentes y portales." : "Atiende las conversaciones de sus equipos."}</span>
            </div>
            <div className="ag-label">Equipos
              <div className="ag-tags">
                {(teams.data ?? []).map((t) => {
                  const on = form.teams.includes(t.id);
                  return (
                    <button key={t.id} type="button" className={`ag-chipbtn ag-press${on ? " on" : ""}`} aria-pressed={on} onClick={() => setForm({ ...form, teams: on ? form.teams.filter((x) => x !== t.id) : [...form.teams, t.id] })}>
                      {t.name}
                    </button>
                  );
                })}
                {!teams.data?.length ? <span className="ag-hint">Cree primero un equipo.</span> : null}
              </div>
            </div>
            <label className="ag-label">Foto (enlace https, opcional)
              <input className="ag-in" type="url" value={form.photo} onChange={(e) => setForm({ ...form, photo: e.target.value })} placeholder="https://…" />
              <span className="ag-hint">Es la que verá la persona en el chat, junto al nombre. Mientras no haya, se muestran las iniciales.</span>
            </label>
            <button type="submit" className="ag-btn ag-primary ag-press" disabled={form.name.trim().length < 3 || !form.email.includes("@")}>Crear y enviar invitación</button>
          </form>
        </aside>
      </div>
    </main>
  );
}

function AgentEditor({ agent, teams, memberOf, onResend }: { agent: Agent; teams: { id: string; name: string }[]; memberOf: string[]; onResend: () => void }) {
  const { run, problem, ok } = useWrite();
  const [d, setD] = useState({ name: agent.name, role: agent.role, photo: agent.photo_url, capacity: agent.capacity ? String(agent.capacity) : "", active: agent.active, teams: memberOf });
  const save = () =>
    run(
      async () => {
        const up = await supabase.from("support_agents").update({ name: d.name.trim(), role: d.role, photo_url: d.photo.trim(), capacity: d.capacity ? Number(d.capacity) : null, active: d.active }).eq("id", agent.id);
        if (up.error) return up;
        const del = await supabase.from("support_team_members").delete().eq("agent_id", agent.id);
        if (del.error) return del;
        if (d.teams.length) return await supabase.from("support_team_members").insert(d.teams.map((team_id) => ({ team_id, agent_id: agent.id })));
        return { error: null };
      },
      "Guardado.",
      [keys.agents, keys.members],
    );
  return (
    <div className="ag-editor">
      <label className="ag-label">Nombre<input className="ag-in" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={120} /></label>
      <label className="ag-label">Foto (enlace https)<input className="ag-in" type="url" value={d.photo} onChange={(e) => setD({ ...d, photo: e.target.value })} placeholder="https://…" /></label>
      <label className="ag-label">Conversaciones a la vez (vacío = la regla general)<input className="ag-in" type="number" min={1} max={50} value={d.capacity} onChange={(e) => setD({ ...d, capacity: e.target.value })} /></label>
      <div className="ag-label">Rol<Seg value={d.role} label="Rol" options={[{ value: "agent", label: "Agente" }, { value: "director", label: "Director" }]} onChange={(role) => setD({ ...d, role })} /></div>
      <div className="ag-label">Equipos
        <div className="ag-tags">
          {teams.map((t) => {
            const on = d.teams.includes(t.id);
            return <button key={t.id} type="button" className={`ag-chipbtn ag-press${on ? " on" : ""}`} aria-pressed={on} onClick={() => setD({ ...d, teams: on ? d.teams.filter((x) => x !== t.id) : [...d.teams, t.id] })}>{t.name}</button>;
          })}
        </div>
      </div>
      <label className="ag-check"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /><span>Tiene acceso al portal</span></label>
      {problem ? <Notice>{problem}</Notice> : null}
      {ok ? <Notice tone="ok">{ok}</Notice> : null}
      <div className="ag-row ag-wrap">
        <button type="button" className="ag-btn ag-primary ag-press" onClick={() => void save()} disabled={d.name.trim().length < 2}>Guardar</button>
        <button type="button" className="ag-btn ag-press" onClick={onResend}>Reenviar invitación</button>
      </div>
    </div>
  );
}

/** Un portal de Pilo: atención por agente, equipo, horario y textos. */
function PortalCard({ portal, teams }: { portal: Portal; teams: { id: string; name: string }[] }) {
  const { run, problem, ok } = useWrite();
  const sched = portal.schedule?.days ?? {};
  const [days, setDays] = useState<Record<string, { on: boolean; from: string; to: string }>>(() =>
    Object.fromEntries(DAYS.map(([k]) => [k, { on: Boolean(sched[k]?.length), from: sched[k]?.[0]?.[0] ?? "08:00", to: sched[k]?.[sched[k].length - 1]?.[1] ?? "18:00" }])),
  );
  const [allDay, setAllDay] = useState(!Object.keys(sched).length);
  const [team, setTeam] = useState(portal.team_id ?? "");
  const [msgs, setMsgs] = useState({ closed: portal.messages?.closed ?? "", busy: portal.messages?.busy ?? "" });

  const patch = (values: Record<string, unknown>, done: string) => run(() => supabase.from("support_portals").update({ ...values, updated_at: new Date().toISOString() }).eq("space", portal.space), done, [keys.portals]);
  const saveSchedule = () => {
    const out: Record<string, string[][]> = {};
    if (!allDay) {
      for (const [k] of DAYS) {
        const d = days[k];
        if (d.on && d.from < d.to) out[k] = [[d.from, d.to]];
      }
    }
    return patch({ schedule: allDay ? {} : { tz: "America/Bogota", days: out }, team_id: team || null, messages: { closed: msgs.closed.trim(), busy: msgs.busy.trim() } }, "Guardado.");
  };
  return (
    <section className="ag-card" aria-label={`Portal ${PORTAL_NAME[portal.space as SpaceKey]}`}>
      <div className="ag-card-head">
        <h2>Portal <PortalTag space={portal.space as SpaceKey} /></h2>
        <label className="ag-row ag-sub">Atención por agente<Switch on={portal.agent_on} label={`Atención por agente en ${PORTAL_NAME[portal.space as SpaceKey]}`} onChange={(v) => void patch({ agent_on: v }, v ? "Activada." : "Desactivada.")} /></label>
      </div>
      <div className="ag-pad ag-stack">
        <p className="ag-sub">Pilo pide primero: nombre completo, correo, teléfono y ciudad, con la autorización de datos personales. Ofrece el agente cuando la persona lo pide o lo dice con sus palabras.</p>
        <label className="ag-label">Equipo que atiende
          <select className="ag-in" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Cualquier agente</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="ag-label">Horario de atención (hora de Colombia)
          <label className="ag-check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /><span>Sin horario: siempre que haya agentes en línea</span></label>
          {!allDay ? (
            <div className="ag-days">
              {DAYS.map(([k, label]) => (
                <div key={k} className="ag-day">
                  <label className="ag-check"><input type="checkbox" checked={days[k].on} onChange={(e) => setDays({ ...days, [k]: { ...days[k], on: e.target.checked } })} /><span>{label}</span></label>
                  <input className="ag-in ag-time-in" type="time" aria-label={`${label}: desde`} value={days[k].from} disabled={!days[k].on} onChange={(e) => setDays({ ...days, [k]: { ...days[k], from: e.target.value } })} />
                  <input className="ag-in ag-time-in" type="time" aria-label={`${label}: hasta`} value={days[k].to} disabled={!days[k].on} onChange={(e) => setDays({ ...days, [k]: { ...days[k], to: e.target.value } })} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <label className="ag-label">Lo que dice Pilo fuera de horario (opcional)
          <textarea className="ag-in ag-area" rows={2} maxLength={300} value={msgs.closed} onChange={(e) => setMsgs({ ...msgs, closed: e.target.value })} placeholder="Ahora no hay agentes. Déjame tus datos y te escribimos al correo cuando alguien tome tu caso." />
        </label>
        <label className="ag-label">Lo que dice Pilo si todos están ocupados (opcional)
          <textarea className="ag-in ag-area" rows={2} maxLength={300} value={msgs.busy} onChange={(e) => setMsgs({ ...msgs, busy: e.target.value })} placeholder="En este momento todos nuestros agentes están ocupados. Quedas en la fila." />
        </label>
        {problem ? <Notice>{problem}</Notice> : null}
        {ok ? <Notice tone="ok">{ok}</Notice> : null}
        <div><button type="button" className="ag-btn ag-primary ag-press" onClick={() => void saveSchedule()}>Guardar horario, equipo y textos</button></div>
      </div>
    </section>
  );
}

/* --- Respuestas rápidas y etiquetas ------------------------------------------------------------------ */

export function Catalogos() {
  const quick = useQuickReplies();
  const labels = useLabels();
  const { run, problem, ok } = useWrite();
  const [q, setQ] = useState({ shortcut: "", title: "", body: "" });
  const [l, setL] = useState({ name: "", color: "azul" });
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [festivo, setFestivo] = useState({ dia: "", name: "" });
  const festivos = useHolidays(anio);
  const ref = useRef<HTMLDivElement>(null);
  useMotion(ref, () => enterList(Array.from(ref.current?.querySelectorAll("[data-row]") ?? []).slice(0, 10)), [quick.data?.length, labels.data?.length]);
  const comoDia = (dia: string) =>
    new Date(`${dia}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="ag-page" ref={ref as never}>
      <header className="ag-page-head"><h1>Respuestas rápidas y etiquetas</h1></header>
      {problem ? <Notice>{problem}</Notice> : null}
      {ok ? <Notice tone="ok">{ok}</Notice> : null}
      <div className="ag-cols">
        <section className="ag-card" aria-label="Respuestas rápidas">
          <div className="ag-card-head"><h2>Respuestas rápidas</h2><span className="ag-sub">Los agentes las usan escribiendo «/»</span></div>
          {(quick.data ?? []).map((r) => (
            <div key={r.id} className="ag-rowq" data-row>
              <div className="ag-grow"><b>/{r.shortcut} · {r.title}</b><div className="ag-sub">{r.body}</div></div>
              <button type="button" className="ag-btn ag-sm ag-press" aria-label={`Borrar la respuesta ${r.title}`} onClick={() => void run(() => supabase.from("support_quick_replies").delete().eq("id", r.id), "Borrada.", [keys.quick])}>Borrar</button>
            </div>
          ))}
          {!quick.data?.length ? <p className="ag-empty">Aún no hay respuestas rápidas.</p> : null}
          <form className="ag-pad ag-stack" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from("support_quick_replies").insert({ shortcut: q.shortcut.trim().toLowerCase(), title: q.title.trim(), body: q.body.trim() }), "Guardada.", [keys.quick]).then((done) => done && setQ({ shortcut: "", title: "", body: "" })); }}>
            <label className="ag-label">Atajo (sin «/»)<input className="ag-in" value={q.shortcut} onChange={(e) => setQ({ ...q, shortcut: e.target.value })} placeholder="saludo" pattern="[a-zA-Z0-9_\-]{2,30}" required /></label>
            <label className="ag-label">Título<input className="ag-in" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} placeholder="Saludo inicial" required maxLength={80} /></label>
            <label className="ag-label">Texto<textarea className="ag-in ag-area" rows={3} value={q.body} onChange={(e) => setQ({ ...q, body: e.target.value })} required maxLength={2000} /></label>
            <div><button type="submit" className="ag-btn ag-primary ag-press">Agregar respuesta</button></div>
          </form>
        </section>

        <section className="ag-card" aria-label="Etiquetas">
          <div className="ag-card-head"><h2>Etiquetas</h2><span className="ag-sub">Los agentes las ponen a cada conversación</span></div>
          <div className="ag-pad ag-tags">
            {(labels.data ?? []).map((x) => (
              <span key={x.id} className="ag-tag ag-t-n ag-tag-x" data-row>
                {x.name}
                <button type="button" className="ag-x ag-press" aria-label={`Borrar la etiqueta ${x.name}`} onClick={() => void run(() => supabase.from("support_labels").delete().eq("id", x.id), "Borrada.", [keys.labels])}><Icon name="close" size={16} /></button>
              </span>
            ))}
            {!labels.data?.length ? <span className="ag-sub">Aún no hay etiquetas.</span> : null}
          </div>
          <form className="ag-pad ag-inline" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from("support_labels").insert({ name: l.name.trim(), color: l.color }), "Guardada.", [keys.labels]).then((done) => done && setL({ name: "", color: "azul" })); }}>
            <input className="ag-in" value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="Etiqueta nueva" aria-label="Etiqueta nueva" required minLength={2} maxLength={40} />
            <button type="submit" className="ag-btn ag-press">Agregar</button>
          </form>
        </section>

        <section className="ag-card" aria-label="Festivos">
          <div className="ag-card-head">
            <h2>Festivos</h2>
            <span className="ag-sub">Los festivos cierran la atención de todos los portales</span>
          </div>
          <div className="ag-pad ag-inline">
            <button type="button" className="ag-btn ag-sm ag-press" aria-label="Año anterior" onClick={() => setAnio((a) => a - 1)}>‹</button>
            <b className="ag-sub">{anio}</b>
            <button type="button" className="ag-btn ag-sm ag-press" aria-label="Año siguiente" onClick={() => setAnio((a) => a + 1)}>›</button>
            <button type="button" className="ag-btn ag-sm ag-press" onClick={() => void run(() => supabase.rpc("support_festivos_cargar", { p_anio: anio }), "Cargados.", [["soporte", "festivos"]])}>
              Cargar los de {anio}
            </button>
          </div>
          <div className="ag-pad">
            {(festivos.data ?? []).map((f) => (
              <div key={f.dia} className="ag-rowq" data-row>
                <div className="ag-grow"><b>{f.name}</b><div className="ag-sub">{comoDia(f.dia)}</div></div>
                <button type="button" className="ag-btn ag-sm ag-press" aria-label={`Borrar el festivo ${f.name}`} onClick={() => void run(() => supabase.from("support_holidays").delete().eq("dia", f.dia), "Borrado.", [["soporte", "festivos"]])}>Borrar</button>
              </div>
            ))}
            {!festivos.data?.length ? <p className="ag-empty">Sin festivos en {anio}: pulse «Cargar» o agréguelos a mano.</p> : null}
          </div>
          <form className="ag-pad ag-stack" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from("support_holidays").upsert({ dia: festivo.dia, name: festivo.name.trim() }), "Guardado.", [["soporte", "festivos"]]).then((done) => done && setFestivo({ dia: "", name: "" })); }}>
            <div className="ag-inline">
              <input className="ag-in" type="date" value={festivo.dia} onChange={(e) => setFestivo({ ...festivo, dia: e.target.value })} aria-label="Día festivo" required />
              <input className="ag-in" value={festivo.name} onChange={(e) => setFestivo({ ...festivo, name: e.target.value })} placeholder="Nombre del festivo" aria-label="Nombre del festivo" required maxLength={80} />
            </div>
            <div><button type="submit" className="ag-btn ag-press">Agregar festivo</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
