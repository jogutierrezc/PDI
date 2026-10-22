/* =============================================================================
   Portal de agentes · vista del director: cola y reparto, e informes básicos.

   El director ve y reparte todo (RLS: support_is_director). Las reglas de
   reparto son una sola fila (support_assignment_policy); el reparto automático
   lo hace la base (0182), esta pantalla solo cambia sus reglas y deja pedir el
   reparto a mano de una conversación.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { isLongWait } from "../soporte/estados";
import { actions, errorText, keys, PORTAL_NAME, useAgents, useConversations, useMembers, usePolicy, useTeams } from "./datos";
import type { Agent, Policy, Report, SpaceKey } from "./datos";
import { useNow } from "./Bandeja";
import { enterDrawer, enterList, fillBar, enterPop, useMotion } from "./motion";
import { AVAILABILITY, Avatar, Dot, Notice, PortalTag, Seg, Switch, Tag } from "./ui";
import { reloj } from "./vistas";
import { useQuery } from "@tanstack/react-query";

const online = (a: Agent) => a.active && a.availability === "en_linea" && Boolean(a.last_seen_at) && Date.now() - Date.parse(a.last_seen_at as string) < 90_000;

export function Cola() {
  const client = useQueryClient();
  const convs = useConversations();
  const agents = useAgents();
  const teams = useTeams();
  const members = useMembers();
  const policy = usePolicy();
  const now = useNow();
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const [drawer, setDrawer] = useState<Agent | null>(null);

  const all = convs.data ?? [];
  const queue = all.filter((c) => (c.status === "queued" || c.status === "offered") && !c.assignee_id).sort((a, b) => Date.parse(a.queued_at ?? a.created_at) - Date.parse(b.queued_at ?? b.created_at));
  const team = agents.data?.filter((a) => a.active) ?? [];
  const capacity = policy.data?.default_capacity ?? 5;
  const loadOf = (a: Agent) => all.filter((c) => (c.status === "open" && c.assignee_id === a.id) || (c.status === "offered" && c.offered_to === a.id)).length;
  const today = new Date().toDateString();
  const resolvedToday = all.filter((c) => c.resolved_at && new Date(c.resolved_at).toDateString() === today).length;
  const avgWait = queue.length ? Math.round(queue.reduce((s, c) => s + (now - Date.parse(c.queued_at ?? c.created_at)), 0) / queue.length / 60000) : 0;
  const longWait = policy.data?.long_wait_minutes ?? 10;
  const teamsOf = (a: Agent) => (teams.data ?? []).filter((t) => (members.data ?? []).some((m) => m.team_id === t.id && m.agent_id === a.id)).map((t) => t.name).join(", ") || "Sin equipo";

  const rowsRef = useRef<HTMLDivElement>(null);
  const agentsRef = useRef<HTMLDivElement>(null);
  useMotion(rowsRef, () => enterList(Array.from(rowsRef.current?.querySelectorAll("[data-row]") ?? []).slice(0, 8)), [queue.length]);
  useMotion(agentsRef, () => {
    enterList(Array.from(agentsRef.current?.querySelectorAll("[data-row]") ?? []));
    agentsRef.current?.querySelectorAll<HTMLElement>("[data-meter]").forEach((bar) => fillBar(bar, Number(bar.dataset.meter)));
  }, [team.length, all.length]);

  const assign = async (id: string) => {
    setProblem("");
    setNote("");
    try {
      const ok = await actions.assignBest(id);
      setNote(ok ? "Se la ofrecimos al agente más libre." : "Ahora no hay agentes en línea con capacidad. Quedó en la cola.");
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      void client.invalidateQueries({ queryKey: keys.convs });
    }
  };

  const save = async (patch: Partial<Policy>) => {
    setProblem("");
    const { error } = await supabase.from("support_assignment_policy").update(patch).eq("id", 1);
    if (error) setProblem(errorText(error));
    void client.invalidateQueries({ queryKey: keys.policy });
  };
  const p = policy.data;

  return (
    <main className="ag-page">
      <header className="ag-page-head">
        <span className="ag-eyebrow">Director</span>
        <h1>Cola y reparto</h1>
      </header>

      <div className="ag-kpis">
        <div className="ag-card ag-kpi"><span>En cola sin asignar</span><b>{queue.length}</b></div>
        <div className="ag-card ag-kpi"><span>Agentes en línea</span><b>{team.filter(online).length} de {team.length}</b></div>
        <div className="ag-card ag-kpi"><span>Espera media en cola</span><b>{avgWait} min</b></div>
        <div className="ag-card ag-kpi"><span>Resueltas hoy</span><b>{resolvedToday}</b></div>
      </div>

      {problem ? <Notice>{problem}</Notice> : null}
      {note ? <Notice tone="ok">{note}</Notice> : null}

      <div className="ag-cols">
        <div className="ag-stack">
          <section className="ag-card" aria-label="Cola">
            <div className="ag-card-head">
              <h2>Cola sin asignar</h2>
              <span className="ag-sub">{queue.length ? "Primero la que lleva más tiempo esperando." : ""}</span>
            </div>
            <div ref={rowsRef}>
              {queue.map((c) => {
                const waited = (now - Date.parse(c.queued_at ?? c.created_at)) / 1000;
                return (
                  <div key={c.id} className="ag-rowq" data-row>
                    <div className="ag-grow">
                      <b>{c.contact.name}</b>
                      <div className="ag-sub">{c.unanswered || c.pilo_summary || "Sin resumen"}</div>
                    </div>
                    <PortalTag space={c.space} />
                    <span className="ag-tm">{reloj(waited)}</span>
                    {isLongWait(c.queued_at ?? c.created_at, longWait, now) ? <Tag tone="y">Supera el tope de espera</Tag> : null}
                    {c.after_hours ? <Tag tone="n">Fuera de horario</Tag> : null}
                    <button type="button" className="ag-btn ag-press" onClick={() => void assign(c.id)}>
                      Asignar al más libre
                    </button>
                  </div>
                );
              })}
            </div>
            {!queue.length ? <p className="ag-empty">No hay nadie esperando. Cuando Pilo entregue una conversación, aparece aquí.</p> : null}
          </section>

          <section className="ag-card" aria-label="Agentes">
            <div className="ag-card-head"><h2>Agentes</h2></div>
            <div ref={agentsRef}>
              {team.map((a) => {
                const load = loadOf(a);
                const cap = a.capacity ?? capacity;
                const av = online(a) ? AVAILABILITY.en_linea : a.availability === "en_linea" ? AVAILABILITY.fuera : AVAILABILITY[a.availability];
                return (
                  <div key={a.id} className="ag-rowa" data-row>
                    <div className="ag-who">
                      <Avatar name={a.name} url={a.photo_url} />
                      <div>
                        <b>{a.name}</b>
                        <div className="ag-sub">{teamsOf(a)}</div>
                      </div>
                    </div>
                    <span className="ag-av"><Dot color={av.color} />{av.label}</span>
                    <div className="ag-load">
                      <span><b>{load}</b> de {cap} conversaciones</span>
                      <span className={`ag-meter${load >= cap ? " full" : ""}`}><span data-meter={Math.min(1, load / cap)} style={{ transform: `scaleX(${Math.min(1, load / cap)})` }} /></span>
                    </div>
                    <button type="button" className="ag-btn ag-press" aria-haspopup="dialog" aria-label={`Ver conversaciones de ${a.name}`} onClick={() => setDrawer(a)}>
                      Ver
                    </button>
                  </div>
                );
              })}
            </div>
            {!team.length ? <p className="ag-empty">Aún no hay agentes. Créelos en «Agentes y portales».</p> : null}
          </section>
        </div>

        <section className="ag-card ag-rules" aria-label="Reglas de reparto">
          <h2>Reglas de reparto</h2>
          {p ? (
            <>
              <div className="ag-rule ag-row-between">
                <div><b>Reparto automático</b><div className="ag-sub">Round-robin entre agentes en línea</div></div>
                <Switch on={p.auto_assign} label="Reparto automático" onChange={(v) => void save({ auto_assign: v })} />
              </div>
              <div className="ag-rule">
                <b>Conversaciones a la vez por agente</b>
                <div className="ag-stepper">
                  <button type="button" className="ag-step ag-press" aria-label="Menos" onClick={() => void save({ default_capacity: Math.max(1, p.default_capacity - 1) })}>−</button>
                  <b>{p.default_capacity}</b>
                  <button type="button" className="ag-step ag-press" aria-label="Más" onClick={() => void save({ default_capacity: Math.min(50, p.default_capacity + 1) })}>+</button>
                </div>
              </div>
              <div className="ag-rule">
                <b>Se atiende primero</b>
                <Seg value={p.queue_order} label="Prioridad" options={[{ value: "oldest", label: "La más antigua" }, { value: "longest_wait", label: "La que más espera" }]} onChange={(v) => void save({ queue_order: v })} />
              </div>
              <div className="ag-rule">
                <b>Tiempo para aceptar</b>
                <Seg value={p.accept_seconds} label="Tiempo para aceptar" options={[30, 45, 60, 90].map((n) => ({ value: n, label: `${n} s` }))} onChange={(v) => void save({ accept_seconds: v })} />
                <span className="ag-sub">Es la cuenta atrás que ve el agente en «Nueva conversación para ti». Si no acepta a tiempo, pasa al siguiente.</span>
              </div>
              <div className="ag-rule">
                <b>Aviso por espera larga</b>
                <Seg value={p.long_wait_minutes} label="Tope de espera" options={[5, 10, 15, 30].map((n) => ({ value: n, label: `${n} min` }))} onChange={(v) => void save({ long_wait_minutes: v })} />
                <span className="ag-sub">Cuando alguien espera más que el tope, la cola y la bandeja lo marcan con «Supera el tope de espera».</span>
              </div>
              <div className="ag-rule"><b>Fuera de horario</b><br /><span className="ag-sub">Pilo avisa que no hay agentes, toma los datos y escribe a la persona por correo cuando alguien tome el caso.</span></div>
            </>
          ) : (
            <p className="ag-empty">Cargando las reglas…</p>
          )}
        </section>
      </div>

      {drawer ? <AgentDrawer agent={drawer} agents={agents.data ?? []} onClose={() => setDrawer(null)} /> : null}
    </main>
  );
}

/** Las conversaciones de un agente, con «Reasignar a…» para cada una. */
function AgentDrawer({ agent, agents, onClose }: { agent: Agent; agents: Agent[]; onClose: () => void }) {
  const client = useQueryClient();
  const convs = useConversations();
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const scrim = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const rows = (convs.data ?? []).filter((c) => (c.assignee_id === agent.id && (c.status === "open" || c.status === "snoozed")) || (c.offered_to === agent.id && c.status === "offered"));
  useMotion(aside, () => enterDrawer(scrim.current, aside.current), []);
  useMotion(pop, () => enterPop(pop.current, "100% 0%"), [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const move = async (id: string, to: Agent) => {
    setProblem("");
    try {
      await actions.reassign(id, to.id, "");
      setOpen(null);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      void client.invalidateQueries({ queryKey: keys.convs });
    }
  };
  return (
    <>
      <div className="ag-scrim" ref={scrim}>
        <button type="button" className="ag-scrim-clear" aria-label="Cerrar el panel" onClick={onClose} />
      </div>
      <aside className="ag-drawer" ref={aside} role="dialog" aria-label={`Conversaciones de ${agent.name}`}>
        <div className="ag-drawer-head">
          <div className="ag-who">
            <Avatar name={agent.name} url={agent.photo_url} size={44} />
            <div><h2>{agent.name}</h2><div className="ag-sub">{agent.email}</div></div>
          </div>
          <button type="button" className="ag-btn ag-press" aria-label="Cerrar el panel" onClick={onClose} autoFocus>✕</button>
        </div>
        {problem ? <Notice>{problem}</Notice> : null}
        <div className="ag-drawer-body">
          {rows.map((c) => (
            <div key={c.id} className="ag-rowq ag-rel">
              <div className="ag-grow"><b>{c.contact.name}</b><div className="ag-sub">{c.unanswered || c.pilo_summary || "Sin resumen"}</div></div>
              <button type="button" className="ag-btn ag-sm ag-press" aria-haspopup="menu" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                Reasignar a…
              </button>
              {open === c.id ? (
                <div className="ag-pop ag-pop-move" ref={pop} role="menu" aria-label={`Reasignar ${c.contact.name}`}>
                  <h3>Elegir agente</h3>
                  {agents.filter((a) => a.active && a.id !== agent.id).map((a) => (
                    <button key={a.id} type="button" role="menuitem" className="ag-it" data-pop-item disabled={a.availability === "fuera"} onClick={() => void move(c.id, a)}>
                      <span>{a.name}</span>
                      <span className="ag-it-state"><Dot color={AVAILABILITY[a.availability].color} />{AVAILABILITY[a.availability].label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!rows.length ? <p className="ag-empty">{agent.name} no tiene conversaciones abiertas ahora.</p> : null}
        </div>
        <p className="ag-drawer-foot">Al reasignar, el agente actual y el nuevo ven el cambio al instante y la persona recibe el aviso del cambio de agente.</p>
      </aside>
    </>
  );
}

/* --- Informes básicos ------------------------------------------------------------------------------- */

export function Informes() {
  const [days, setDays] = useState(30);
  const agents = useAgents();
  const range = useMemo(() => ({ from: new Date(Date.now() - days * 86_400_000).toISOString(), to: new Date().toISOString() }), [days]);
  const report = useQuery({ queryKey: ["soporte", "informe", days], queryFn: () => actions.report(range.from, range.to), staleTime: 60_000 });
  const r: Report | undefined = report.data;
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? "Agente";
  const num = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}${unit}`);
  return (
    <main className="ag-page">
      <header className="ag-page-head">
        <span className="ag-eyebrow">Director</span>
        <h1>Informes</h1>
        <Seg value={days} label="Periodo" options={[7, 30, 90].map((n) => ({ value: n, label: `${n} días` }))} onChange={setDays} />
      </header>
      {report.isError ? <Notice>No se pudo leer el informe. Revise que estén aplicadas las migraciones 0181 y 0182.</Notice> : null}
      <div className="ag-kpis">
        <div className="ag-card ag-kpi"><span>Conversaciones</span><b>{num(r?.total)}</b></div>
        <div className="ag-card ag-kpi"><span>Resueltas</span><b>{num(r?.resolved)}</b></div>
        <div className="ag-card ag-kpi"><span>Espera hasta ser atendida</span><b>{num(r?.wait_minutes, " min")}</b></div>
        <div className="ag-card ag-kpi"><span>Duración de la atención</span><b>{num(r?.handle_minutes, " min")}</b></div>
        <div className="ag-card ag-kpi"><span>Satisfacción ({r?.csat_count ?? 0} respuestas)</span><b>{num(r?.csat, " / 5")}</b></div>
      </div>
      <div className="ag-cols">
        <section className="ag-card" aria-label="Por portal">
          <div className="ag-card-head"><h2>Por portal</h2></div>
          {(["planeacion", "ensenanza"] as SpaceKey[]).map((s) => (
            <div key={s} className="ag-rowq"><PortalTag space={s} /><span className="ag-grow" /><b className="ag-tm">{r?.by_space?.[s] ?? 0}</b></div>
          ))}
        </section>
        <section className="ag-card" aria-label="Por agente">
          <div className="ag-card-head"><h2>Por agente</h2></div>
          {(r?.by_agent ?? []).map((a) => (
            <div key={a.agent_id} className="ag-rowq">
              <span className="ag-grow"><b>{name(a.agent_id)}</b></span>
              <span className="ag-tm">{a.total} conversaciones</span>
              <span className="ag-tm">{num(a.csat, " / 5")}</span>
            </div>
          ))}
          {!r?.by_agent?.length ? <p className="ag-empty">Todavía no hay conversaciones atendidas en este periodo.</p> : null}
        </section>
      </div>
    </main>
  );
}
