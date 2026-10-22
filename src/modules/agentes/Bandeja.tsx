/* =============================================================================
   Portal de agentes · la bandeja: lista, oferta y conversación.

   Tres columnas (lista, hilo, contacto) que en pantallas angostas pasan a una
   sola: primero la lista y, al elegir, el hilo con un botón para volver.
   Las filas y el hilo se mantienen al día con Realtime (datos.ts).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ago, offerSecondsLeft, isLongWait } from "../soporte/estados";
import { soporte } from "../soporte/llamada";
import { actions, errorText, keys, useAgents, useConversations, usePolicy, useUnread } from "./datos";
import type { Conv } from "./datos";
import { Hilo } from "./Hilo";
import type { MarcoContext } from "./Marco";
import { enterList, enterOffer, useMotion } from "./motion";
import { useMe } from "./sesion";
import { Notice, PortalTag, Tag } from "./ui";
import { enVista, isVista, relacion, reloj, TITULO } from "./vistas";
import type { Vista } from "./vistas";

/** Un reloj de un segundo para las cuentas atrás y las esperas. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export function Bandeja() {
  const me = useMe();
  const { connected } = useOutletContext<MarcoContext>();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const convs = useConversations();
  const unread = useUnread();
  const policy = usePolicy();
  const agents = useAgents();
  const now = useNow();
  const [problem, setProblem] = useState("");

  const view: Vista = isVista(params.get("v")) ? (params.get("v") as Vista) : "mias";
  const selectedId = params.get("c");
  const all = convs.data ?? [];
  const list = useMemo(
    () =>
      all
        .filter((c) => enVista(c, view, me.id))
        .sort((a, b) => Number(relacion(b, me.id) === "oferta") - Number(relacion(a, me.id) === "oferta") || Date.parse(b.last_message_at) - Date.parse(a.last_message_at)),
    [all, view, me.id],
  );
  const selected = all.find((c) => c.id === selectedId) ?? null;
  const offer = all.find((c) => c.status === "offered" && c.offered_to === me.id) ?? null;
  const longWait = policy.data?.long_wait_minutes ?? 10;

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("c", id);
    else next.delete("c");
    setParams(next, { replace: false });
  };

  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  useMotion(
    listRef,
    () => {
      const fresh = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []).filter((el) => !seen.current.has(el.dataset.row ?? ""));
      fresh.forEach((el) => seen.current.add(el.dataset.row ?? ""));
      enterList(fresh.slice(0, 8));
    },
    [list.map((c) => c.id).join("|")],
  );

  const accept = async (c: Conv) => {
    setProblem("");
    try {
      await actions.accept(c.id);
      void soporte({ action: "tomada", id: c.id }, { session: true }).catch(() => undefined);
      select(c.id);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      void client.invalidateQueries({ queryKey: keys.convs });
    }
  };
  const pass = async (c: Conv) => {
    setProblem("");
    try {
      await actions.decline(c.id);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      void client.invalidateQueries({ queryKey: keys.convs });
    }
  };

  return (
    <div className="ag-bandeja" data-pane={selected ? "hilo" : "lista"}>
      <section className="ag-lista" aria-label="Conversaciones">
        <div className="ag-lista-head">
          <div className="ag-row-between">
            <h1>{TITULO[view]}</h1>
            <span className={`ag-cx${connected ? "" : " re"}`} role="status">
              <i />
              {connected ? "En vivo" : "Reconectando…"}
            </span>
          </div>
          <span className="ag-sub">{list.length === 1 ? "1 conversación" : `${list.length} conversaciones`}</span>
        </div>

        {offer ? <OfferCard conv={offer} now={now} total={policy.data?.accept_seconds ?? 45} onAccept={() => void accept(offer)} onPass={() => void pass(offer)} /> : null}
        {problem ? <Notice>{problem}</Notice> : null}

        <div className="ag-lista-scroll" ref={listRef}>
          {convs.isPending ? <p className="ag-empty">Cargando conversaciones…</p> : null}
          {convs.isError ? <Notice>No se pudieron leer las conversaciones. Revise que estén aplicadas las migraciones 0181 y 0182.</Notice> : null}
          {list.map((c) => {
            const rel = relacion(c, me.id);
            const count = unread.data?.[c.id] ?? 0;
            const owner = agents.data?.find((a) => a.id === c.assignee_id)?.name ?? "otro agente";
            const waiting = c.status === "queued" || c.status === "offered";
            return (
              <div key={c.id} data-row={c.id}>
                <button type="button" className={`ag-cv${c.id === selectedId ? " on" : ""}`} aria-pressed={c.id === selectedId} onClick={() => select(c.id)}>
                  <span className="ag-row-between">
                    <b>{c.contact.name}</b>
                    <span className="ag-cv-when">
                      {count > 0 ? (
                        <span className="ag-bd" role="img" aria-label={`${count} mensajes sin leer`}>
                          {count}
                        </span>
                      ) : null}
                      {ago(c.last_message_at)}
                    </span>
                  </span>
                  <span className="ag-cv-line">{c.unanswered || c.pilo_summary || "Sin resumen de Pilo."}</span>
                  <span className="ag-tags">
                    <PortalTag space={c.space} />
                    {rel === "sin" || rel === "oferta" ? <Tag tone="y">Sin asignar</Tag> : null}
                    {rel === "mia" ? <Tag tone="g">Mía</Tag> : null}
                    {rel === "resuelta" ? <Tag tone="n">Resuelta</Tag> : null}
                    {rel === "otro" ? <Tag tone="n">Atiende {owner}</Tag> : null}
                    {waiting && c.waiting_since ? <span className="ag-tag ag-t-n ag-tm"><i />Espera {reloj((now - Date.parse(c.waiting_since)) / 1000)}</span> : null}
                    {waiting && isLongWait(c.waiting_since, longWait, now) ? <Tag tone="y">Supera el tope</Tag> : null}
                    {c.after_hours && waiting ? <Tag tone="n">Fuera de horario</Tag> : null}
                  </span>
                </button>
              </div>
            );
          })}
          {!convs.isPending && !list.length ? <p className="ag-empty">No hay conversaciones en esta vista. Cuando Pilo entregue una, aparece aquí.</p> : null}
        </div>
      </section>

      {selected ? (
        <Hilo key={selected.id} conv={selected} connected={connected} onBack={() => select(null)} onTaken={() => void client.invalidateQueries({ queryKey: keys.convs })} />
      ) : (
        <section className="ag-hilo ag-hilo-vacio" aria-label="Conversación">
          <p>Elija una conversación de la lista.</p>
        </section>
      )}
    </div>
  );
}

/** «Nueva conversación para ti»: la cuenta atrás de la oferta. Si vence, pasa al siguiente agente. */
function OfferCard({ conv, now, total, onAccept, onPass }: { conv: Conv; now: number; total: number; onAccept: () => void; onPass: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const left = offerSecondsLeft(conv.offer_expires_at, now);
  const ratio = Math.max(0, Math.min(1, left / Math.max(1, total)));
  useMotion(ref, () => enterOffer(ref.current), [conv.id]);
  return (
    <div className="ag-offer" ref={ref} role="alert">
      <div className="ag-row-between">
        <b className="ag-offer-title">Nueva conversación para ti</b>
        <PortalTag space={conv.space} />
      </div>
      <div>
        <b>{conv.contact.name}</b>
        <div className="ag-offer-sub">{conv.unanswered || conv.pilo_summary || "Pilo no dejó resumen."}</div>
      </div>
      <span className={`ag-countdown${left <= 10 ? " hot" : ""}`} aria-hidden="true">
        <i style={{ transform: `scaleX(${ratio})` }} />
      </span>
      <div className="ag-offer-sub">
        Acepta en <b className="ag-tm">{left} s</b>. Si no la acepta, pasa al siguiente agente.
      </div>
      <div className="ag-row">
        <button type="button" className="ag-btn ag-primary ag-press" style={{ flex: 1 }} onClick={onAccept} disabled={left <= 0}>
          Aceptar
        </button>
        <button type="button" className="ag-btn ag-press" onClick={onPass}>
          Pasar
        </button>
      </div>
    </div>
  );
}
