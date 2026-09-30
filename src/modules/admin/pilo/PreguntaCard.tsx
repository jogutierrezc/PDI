/* =============================================================================
   Intranet · Mr. Pilo con IA · «Pregúntele a Pilo» y su memoria.

   Dos secciones del módulo salen de aquí:

   PreguntaSection
   - Si la página está abierta y para quién (público, con sesión o solo
     administración), si muestra la bienvenida y si la IA redacta cuando la
     memoria no alcanza. Esto se guarda con «Guardar cambios», como el resto.
   - Las respuestas guardadas: las últimas, con cuántas veces sirvieron; una
     respuesta se puede ocultar para que no se vuelva a dar.

   MemorySection
   - Qué fuentes usa, cuántos pasajes tiene cada una y el botón «Actualizar
     la memoria», que la rehace con lo publicado ahora (se aplica al momento,
     como las claves). Cada fuente va por su lado: la que falla o llega vacía
     se queda como estaba y la lista de resultados dice por qué.
   - Probar la memoria: qué pasajes encontraría Pilo para una pregunta.
   - La malla de la memoria (MeshView): cómo se conecta lo que sabe.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { Fn } from "../../../components/pilo/ai/config";
import { MEMORY_SOURCES, useHideAnswer, useMemoryCounts, useMemoryInputs, useReplaceMemory, useSavedAnswers, useTryMemory } from "./memory";
import type { MemorySource, ReplaceResult, SourceProblem } from "./memory";
import { AudiencePicker } from "./sections";
import type { EditorApi } from "./sections";
import { Group, StatusMark, Switch, plural, when } from "./ui";
import { MeshView } from "./MeshView";
import { revealList } from "./motion";
import { CatalogModal } from "./CatalogModal";
import type { CatalogRow } from "./catalog-sheet";

/* --- Pregúntele a Pilo ---------------------------------------------------------------------- */

export function PreguntaSection({ ed }: { ed: EditorApi }) {
  const { s, set, setPortal } = ed;
  const rule = s.portals.pregunta ?? { on: false, aud: "publico", fns: ["preguntar"] };
  // «Leer» en Pregúntele a Pilo: las respuestas suenan con la voz de IA (la de Voz), no con la del navegador.
  const speaks = rule.fns.includes("leer");
  const fns = (voice: boolean): Fn[] => (voice ? ["preguntar", "leer"] : ["preguntar"]);
  const voiceName = s.voice_engine !== "proveedor" ? "" : s.speech_provider === "nvidia" ? "NVIDIA" : s.speech_provider === "fishaudio" ? "Fish Audio" : "Free.ai";
  const answers = useSavedAnswers();
  const hide = useHideAnswer();
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogEntry, setCatalogEntry] = useState<Partial<CatalogRow> | null>(null);

  const promoteToCatalog = (a: { question: string; answer: string }) => {
    const cleanAnswer = a.answer.replace(/\s*\[\d+\]/g, "").trim();
    setCatalogEntry({
      kind: "respuesta",
      question: a.question,
      answer: cleanAnswer,
      source_title: "Planeación Institucional · Pregúntele a Pilo",
      source_path: "/pregunta",
    });
    setModalOpen(true);
  };

  return (
    <>
      {s.needs0094 && <p className="pis-warn">Falta aplicar la migración 0094 en la base para abrir la página y guardar su memoria.</p>}

      <Group
        title="La página"
        aside={
          <Link to="/pregunta" className="pis-link" target="_blank" rel="noopener">
            Abrir /pregunta <Icon name="external" size={14} />
          </Link>
        }
      >
        <p className="pis-lead">
          Una página pública donde cualquiera le pregunta a Pilo por la Planeación de la UDES. Responde primero con reglas, respuestas ya dadas y lo publicado; la IA solo
          redacta cuando hace falta, y funciona aunque la IA esté apagada.
        </p>
        <dl className="pis-opts">
          <div>
            <dt>Página abierta</dt>
            <dd>
              <Switch on={rule.on} onChange={(v) => setPortal("pregunta", { on: v, fns: fns(speaks) })} label="Pregúntele a Pilo abierta" />
            </dd>
          </div>
          <div>
            <dt>Para quién</dt>
            <dd>
              <AudiencePicker value={rule.aud} label="Para quién es Pregúntele a Pilo" onPick={(aud) => setPortal("pregunta", { aud, fns: fns(speaks) })} />
            </dd>
          </div>
          <div>
            <dt>
              Leer las respuestas con la voz de Pilo
              <small>
                {!voiceName
                  ? "En Voz está elegida la del navegador: elija NVIDIA o Free.ai para que suene la de Pilo."
                  : `Con la voz de ${voiceName} y su estilo; si no responde, con la del navegador.`}
              </small>
            </dt>
            <dd>
              <Switch on={speaks} onChange={(v) => setPortal("pregunta", { fns: fns(v) })} label="Leer las respuestas con la voz de Pilo" />
            </dd>
          </div>
          <div>
            <dt>Bienvenida la primera vez</dt>
            <dd>
              <Switch on={s.pregunta_welcome} onChange={(v) => set("pregunta_welcome", v)} label="Mostrar la bienvenida" />
            </dd>
          </div>
          <div>
            <dt>
              Redactar con IA
              <small>{s.enabled ? "Cuando la memoria no alcance." : "Mr. Pilo con IA está apagado: responde con lo publicado tal cual."}</small>
            </dt>
            <dd>
              <Switch on={s.functions.preguntar !== false} onChange={(v) => set("functions", { ...s.functions, preguntar: v })} label="Redactar con IA cuando la memoria no alcance" />
            </dd>
          </div>
        </dl>
      </Group>

      <Group title="Respuestas guardadas" aside={answers.data ? <small>{plural(answers.data.total, "en total", "en total")}</small> : null}>
        {!answers.data || answers.data.rows.length === 0 ? (
          <p className="pis-small">Todavía no hay respuestas guardadas. Se guardan las que redacta la IA con todas sus cifras verificadas.</p>
        ) : (
          <ul className="pis-answers">
            {answers.data.rows.map((a) => (
              <li key={a.id} data-hidden={a.hidden || undefined}>
                <span>
                  <strong>{a.question}</strong>
                  <small>{a.answer.replace(/\s*\[\d+\]/g, "").slice(0, 160)}</small>
                </span>
                <em>
                  {when(a.created_at)} · sirvió {a.up} · no sirvió {a.down}
                  {a.hidden ? " · oculta" : ""}
                </em>
                <div className="pis-cat__actions">
                  <button
                    type="button"
                    className="button-secondary pis-to-cat"
                    onClick={() => promoteToCatalog(a)}
                    title="Agregar esta respuesta al catálogo oficial de Pilo"
                  >
                    <Icon name="spark" size={14} />
                    Al catálogo
                  </button>
                  <button type="button" className="button-secondary" onClick={() => hide.mutate({ id: a.id, hidden: !a.hidden })} disabled={hide.isPending}>
                    {a.hidden ? "Volver a usar" : "Ocultar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <CatalogModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setCatalogEntry(null);
        }}
        defaultKind="respuesta"
        initialEntry={catalogEntry}
        isEditing={false}
      />
    </>
  );
}

/* --- La memoria ------------------------------------------------------------------------------ */

export function MemorySection({ ed, indexedAt, onIndexed }: { ed: EditorApi; indexedAt: string | null; onIndexed: (iso: string) => void }) {
  const { s, set } = ed;
  const counts = useMemoryCounts();
  const inputs = useMemoryInputs();
  const replace = useReplaceMemory();
  const tryIt = useTryMemory();
  const [probe, setProbe] = useState("");
  const [results, setResults] = useState<{ done: ReplaceResult[]; problems: SourceProblem[]; at: number } | null>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [, setParams] = useSearchParams();
  // Un pasaje encontrado es también un nodo (mismo ref): se abre en la malla.
  const showInMesh = (ref: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("nodo", ref);
      return next;
    }, { replace: true });
    document.getElementById("pis-malla")?.scrollIntoView({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  // Cada actualización nueva entra una vez, fila por fila.
  useEffect(() => {
    if (results && resultsRef.current) revealList([...resultsRef.current.children]);
  }, [results?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    // Lo que no se armó bien no se envía: una lista vacía borraría esa fuente.
    const { rows, problems, meshes } = inputs.build();
    if (!Object.keys(rows).length) {
      setResults({ done: [], problems, at: Date.now() });
      return;
    }
    replace.mutate(
      { rows, meshes },
      {
        onSuccess: (r) => {
          setResults({ done: r.done, problems: [...problems, ...r.failed], at: Date.now() });
          if (r.done.length) onIndexed(new Date().toISOString());
        },
      },
    );
  };

  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0;
  const nameOf = (id: MemorySource) => MEMORY_SOURCES.find((m) => m.id === id)?.name ?? id;

  return (
    <>
      {s.needs0094 && <p className="pis-warn">Falta aplicar la migración 0094 en la base para guardar la memoria de Pilo.</p>}

      <Group
        title="Fuentes"
        aside={<small>{counts.data ? `${plural(total, "pasaje", "pasajes")} · actualizada ${when(indexedAt ?? s.memory_indexed_at)}` : "Contando pasajes…"}</small>}
      >
        <ul className="pis-sources">
          {MEMORY_SOURCES.map((m) => (
            <li key={m.id} data-off={!s.memory_sources[m.id] || undefined}>
              <span className="pis-code" data-s={m.id} aria-hidden="true">
                {m.code}
              </span>
              <span>
                <strong>{m.name}</strong>
                <small>
                  {m.desc}
                  {m.session ? " · solo con sesión, como su portal" : ""}
                </small>
              </span>
              <em>{counts.data ? plural(counts.data[m.id], "pasaje", "pasajes") : "—"}</em>
              <Switch
                on={s.memory_sources[m.id]}
                onChange={(v) => set("memory_sources", { ...s.memory_sources, [m.id]: v } as Record<MemorySource, boolean>)}
                label={`Usar ${m.name}`}
              />
            </li>
          ))}
        </ul>
        <div className="pis-row">
          <p className="pis-note">
            «Actualizar la memoria» lee los portales como los ve el público y rehace los pasajes y la malla. Lo que cambió deja de servirse en las respuestas guardadas.
            Conviene hacerlo después de publicar un corte o un boletín. Se aplica al momento.
          </p>
          <button ref={refreshRef} id="pis-refresh" type="button" className="button-primary" onClick={refresh} disabled={inputs.loading || replace.isPending || s.needs0094}>
            {replace.isPending ? "Actualizando…" : inputs.loading ? "Leyendo los portales…" : "Actualizar la memoria"}
          </button>
        </div>
        {replace.isError && (
          <p className="pis-error" role="alert">
            No se actualizó: {(replace.error as Error).message}
          </p>
        )}
        {results && (
          <ul className="pis-results" role="status" ref={resultsRef} aria-label="Resultado de la actualización">
            {results.done.map((r) => (
              <li key={r.source}>
                <StatusMark tone={r.meshError ? "warn" : "ok"}>{nameOf(r.source)}</StatusMark>
                <span>
                  {plural(r.total, "pasaje", "pasajes")} · {r.added} nuevos · {r.changed} cambiaron · {r.removed} salieron
                  {r.nodes !== undefined ? ` · malla: ${plural(r.nodes, "nodo", "nodos")} y ${plural(r.edges ?? 0, "relación", "relaciones")}` : ""}
                  {r.meshError ? ` · ${r.meshError}` : ""}
                </span>
              </li>
            ))}
            {MEMORY_SOURCES.filter((m) => results.problems.some((p) => p.source === m.id)).map((m) => {
              const p = results.problems.find((x) => x.source === m.id)!;
              return (
                <li key={m.id}>
                  <StatusMark tone={p.kind === "error" ? "fail" : "warn"}>{m.name}</StatusMark>
                  <span>
                    {p.kind === "error" ? "No se actualizó" : "Sin cambios"}: {p.message}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Group>

      <Group
        title="Malla de la memoria"
        aside={
          <span className="pis-malla__aside">
            <small>Cómo se conecta lo que sabe Pilo</small>
            <Link className="button-secondary" to="/admin/mr-pilo/presentacion">
              Presentar la capa profunda
            </Link>
          </span>
        }
        id="pis-malla"
      >
        <MeshView onAskRefresh={() => refreshRef.current?.focus()} />
      </Group>

      <Group title="Probar la memoria" aside={<small>Los cinco pasajes que Pilo encontraría</small>}>
        <form
          className="pis-probe"
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
        {tryIt.isError && (
          <p className="pis-error" role="alert">
            {(tryIt.error as Error).message}
          </p>
        )}
        {tryIt.data &&
          (tryIt.data.length === 0 ? (
            <p className="pis-small">Ningún pasaje responde: Pilo diría que no lo encontró.</p>
          ) : (
            <ol className="pis-hits">
              {tryIt.data.map((h) => (
                <li key={h.ref}>
                  <span className="pis-code" data-s={h.source} title={nameOf(h.source)}>
                    {MEMORY_SOURCES.find((m) => m.id === h.source)?.code}
                  </span>
                  <span>
                    <strong>{h.title}</strong>
                    <small>
                      {h.section}
                      {h.cut ? ` · ${h.cut}` : ""}
                    </small>
                  </span>
                  <em title="Qué tanto se parece a la pregunta">{Math.round(h.rank * 100)}</em>
                  <button type="button" className="pis-link" onClick={() => showInMesh(h.ref)}>
                    Ver en la malla
                  </button>
                </li>
              ))}
            </ol>
          ))}
      </Group>
    </>
  );
}
