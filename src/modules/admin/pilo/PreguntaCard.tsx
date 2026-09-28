/* =============================================================================
   Intranet · Mr. Pilo con IA · la tarjeta de «Pregúntele a Pilo».

   - Si la página está abierta y para quién (público, con sesión o solo
     administración), si muestra la bienvenida y si la IA redacta cuando la
     memoria no alcanza. Esto se guarda con «Guardar cambios», como el resto.
   - La memoria: qué fuentes usa, cuántos pasajes tiene cada una y el botón
     «Actualizar la memoria», que la rehace con lo publicado ahora (se aplica
     al momento, como las claves). Cada fuente va por su lado: la que falla o
     llega vacía se queda como estaba y la lista de resultados dice por qué.
   - Probar la memoria: qué pasajes encontraría Pilo para una pregunta.
   - Las respuestas guardadas: las últimas, con cuántas veces sirvieron; una
     respuesta se puede ocultar para que no se vuelva a dar.
   ========================================================================== */

import { useState } from "react";
import { Link } from "react-router-dom";
import type { Portal, PortalRule } from "../../../components/pilo/ai/config";
import { MEMORY_SOURCES, useHideAnswer, useMemoryCounts, useMemoryInputs, useReplaceMemory, useSavedAnswers, useTryMemory } from "./memory";
import type { MemorySource, ReplaceResult, SourceProblem } from "./memory";
import type { PiloSettings } from "./store";

const AUDIENCES = [
  ["admin", "Solo administración"],
  ["sesion", "Con sesión"],
  ["publico", "Público"],
] as const;

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca";

export function PreguntaCard({
  n,
  s,
  set,
  setPortal,
  Switch,
}: {
  n: number;
  s: PiloSettings;
  set: <K extends keyof PiloSettings>(key: K, value: PiloSettings[K]) => void;
  setPortal: (id: Portal, patch: Partial<PortalRule>) => void;
  Switch: (props: { on: boolean; onChange: (v: boolean) => void; label: string; big?: boolean }) => JSX.Element;
}) {
  const rule = s.portals.pregunta ?? { on: false, aud: "publico", fns: ["preguntar"] };
  const counts = useMemoryCounts();
  const inputs = useMemoryInputs();
  const replace = useReplaceMemory();
  const answers = useSavedAnswers();
  const hide = useHideAnswer();
  const tryIt = useTryMemory();
  const [probe, setProbe] = useState("");
  const [results, setResults] = useState<{ done: ReplaceResult[]; problems: SourceProblem[] } | null>(null);
  const [indexedAt, setIndexedAt] = useState<string | null>(null);

  const refresh = () => {
    // Lo que no se armó bien no se envía: una lista vacía borraría esa fuente.
    const { rows, problems } = inputs.build();
    if (!Object.keys(rows).length) {
      setResults({ done: [], problems });
      return;
    }
    replace.mutate(rows, {
      onSuccess: (r) => {
        setResults({ done: r.done, problems: [...problems, ...r.failed] });
        if (r.done.length) setIndexedAt(new Date().toISOString());
      },
    });
  };

  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="pis-card pis-ask" aria-labelledby={`pis-${n}`}>
      <header>
        <h2 id={`pis-${n}`}>{n} · Pregúntele a Pilo</h2>
        <Link to="/pregunta" className="pis-ask__open" target="_blank" rel="noopener">
          Abrir la página ↗
        </Link>
      </header>

      {s.needs0094 && <p className="pis-warn">Falta aplicar la migración 0094 en la base para abrir la página y guardar su memoria.</p>}

      <p className="pis-lead">
        Una página pública (<code>/pregunta</code>) donde cualquiera le pregunta a Pilo por la Planeación de la UDES. Responde primero con reglas, respuestas ya dadas y lo
        publicado; la IA solo redacta cuando hace falta, y funciona aunque la IA esté apagada.
      </p>

      <div className="pis-ask__grid">
        <div className="pis-ask__opt">
          <strong>Página abierta</strong>
          <Switch on={rule.on} onChange={(v) => setPortal("pregunta", { on: v, fns: ["preguntar"] })} label="Pregúntele a Pilo abierta" />
        </div>
        <div className="pis-ask__opt pis-ask__opt--wide">
          <strong>Para quién</strong>
          <span className="pis-aud" role="group" aria-label="Para quién es Pregúntele a Pilo">
            {AUDIENCES.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={rule.aud === id} data-public={id === "publico" || undefined} onClick={() => setPortal("pregunta", { aud: id, fns: ["preguntar"] })}>
                {label}
              </button>
            ))}
          </span>
        </div>
        <div className="pis-ask__opt">
          <strong>Bienvenida la primera vez</strong>
          <Switch on={s.pregunta_welcome} onChange={(v) => set("pregunta_welcome", v)} label="Mostrar la bienvenida" />
        </div>
        <div className="pis-ask__opt">
          <strong>Redactar con IA</strong>
          <Switch on={s.functions.preguntar !== false} onChange={(v) => set("functions", { ...s.functions, preguntar: v })} label="Redactar con IA cuando la memoria no alcance" />
          <small>{s.enabled ? "Cuando la memoria no alcance." : "Mr. Pilo con IA está apagado: responde con lo publicado tal cual."}</small>
        </div>
      </div>

      <h3 className="pis-ask__h">
        La memoria <small>{counts.data ? `${total.toLocaleString("es-CO")} pasajes · actualizada ${when(indexedAt ?? s.memory_indexed_at)}` : ""}</small>
      </h3>
      <ul className="pis-ask__mem">
        {MEMORY_SOURCES.map((m) => (
          <li key={m.id} data-off={!s.memory_sources[m.id] || undefined}>
            <span className="pis-ask__code" data-s={m.id}>
              {m.code}
            </span>
            <span>
              <strong>{m.name}</strong>
              <small>
                {m.desc}
                {m.session ? " · solo con sesión, como su portal" : ""}
              </small>
            </span>
            <em className="pis-ask__count">{counts.data ? `${counts.data[m.id].toLocaleString("es-CO")} pasajes` : "—"}</em>
            <Switch on={s.memory_sources[m.id]} onChange={(v) => set("memory_sources", { ...s.memory_sources, [m.id]: v } as Record<MemorySource, boolean>)} label={`Usar ${m.name}`} />
          </li>
        ))}
      </ul>
      <div className="pis-row">
        <p className="pis-note">
          «Actualizar la memoria» lee los portales como los ve el público y rehace los pasajes. Lo que cambió deja de servirse en las respuestas guardadas. Conviene hacerlo
          después de publicar un corte o un boletín.
        </p>
        <button type="button" className="button-primary" onClick={refresh} disabled={inputs.loading || replace.isPending || s.needs0094}>
          {replace.isPending ? "Actualizando…" : inputs.loading ? "Leyendo los portales…" : "Actualizar la memoria"}
        </button>
      </div>
      {replace.isError && <p className="pis-test">No se actualizó: {(replace.error as Error).message}</p>}
      {results && (
        <ul className="pis-ask__results" role="status">
          {results.done.map((r) => (
            <li key={r.source} data-state="ok">
              <strong>{MEMORY_SOURCES.find((m) => m.id === r.source)?.name}</strong> {r.total} pasajes · {r.added} nuevos · {r.changed} cambiaron · {r.removed} salieron
            </li>
          ))}
          {MEMORY_SOURCES.filter((m) => results.problems.some((p) => p.source === m.id)).map((m) => {
            const p = results.problems.find((x) => x.source === m.id)!;
            return (
              <li key={m.id} data-state={p.kind}>
                <strong>{m.name}</strong> {p.kind === "error" ? "no se actualizó" : "sin cambios"}: {p.message}
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="pis-ask__h">Probar la memoria</h3>
      <form
        className="pis-ask__probe"
        onSubmit={(e) => {
          e.preventDefault();
          if (probe.trim()) tryIt.mutate(probe.trim());
        }}
      >
        <input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Escriba una pregunta como la haría el público" aria-label="Pregunta de prueba" />
        <button type="submit" className="button-secondary" disabled={!probe.trim() || tryIt.isPending}>
          {tryIt.isPending ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {tryIt.isError && <p className="pis-test">{(tryIt.error as Error).message}</p>}
      {tryIt.data &&
        (tryIt.data.length === 0 ? (
          <p className="pis-small">Ningún pasaje responde: Pilo diría que no lo encontró.</p>
        ) : (
          <ol className="pis-ask__hits">
            {tryIt.data.map((h) => (
              <li key={h.ref}>
                <span className="pis-ask__code" data-s={h.source}>
                  {MEMORY_SOURCES.find((m) => m.id === h.source)?.code}
                </span>
                <span>
                  <strong>{h.title}</strong>
                  <small>
                    {h.section}
                    {h.cut ? ` · ${h.cut}` : ""}
                  </small>
                </span>
                <em>{Math.round(h.rank * 100)}</em>
              </li>
            ))}
          </ol>
        ))}

      <h3 className="pis-ask__h">
        Respuestas guardadas <small>{answers.data ? `${answers.data.total} en total` : ""}</small>
      </h3>
      {!answers.data || answers.data.rows.length === 0 ? (
        <p className="pis-small">Todavía no hay respuestas guardadas. Se guardan las que redacta la IA con todas sus cifras verificadas.</p>
      ) : (
        <ul className="pis-ask__answers">
          {answers.data.rows.map((a) => (
            <li key={a.id} data-hidden={a.hidden || undefined}>
              <span>
                <strong>{a.question}</strong>
                <small>{a.answer.replace(/\s*\[\d+\]/g, "").slice(0, 160)}</small>
              </span>
              <em>
                {when(a.created_at)} · sirvió {a.up} · no sirvió {a.down}
              </em>
              <button type="button" className="button-secondary" onClick={() => hide.mutate({ id: a.id, hidden: !a.hidden })} disabled={hide.isPending}>
                {a.hidden ? "Volver a usar" : "Ocultar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
