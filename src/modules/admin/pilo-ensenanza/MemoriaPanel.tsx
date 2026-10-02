/* =============================================================================
   Mr. Pilo en Enseñanza · Memoria, en cuatro momentos.

   En vez de ocho bloques apilados, una hoja por momento, enlazable por la
   dirección (?seccion=memoria&momento=mapa):

   Alimentar    lo que entra. Fuentes (memory_sources de pilo_spaces, con sus
                pasajes por colección; se guarda con «Guardar cambios»),
                Documentos y Moodle (memoria/DocumentsPanel y MoodlePanel: cada
                uno dice qué migración le falta —0114, 0116— y se apaga sin
                romper a los demás).
   Comprender   lo que Pilo entiende. Búsqueda por significado: el índice de
                vectores de ESTE espacio (pilo-ia «indexar» con space).
                Comprensión con IA: de qué trata cada pasaje y qué normas cita
                (pilo-ia «comprender», 0115), en lotes que siguen solos; se
                puede detener y retomar, lo comprendido no se pierde.
   Mapa         memoria/TeachMap: colección → documento → tema → referencia.
                Aquí se monta también el mapa global de los dos Pilos.
   Probar       memoria/TeachMap › MemoryProbe: los pasajes que este Pilo
                encontraría y su camino; y las respuestas guardadas
                (pilo_answers de este espacio), que se ocultan o se pasan al
                catálogo.

   Un momento ya visitado sigue montado al cambiar a otro: un documento que se
   está leyendo o un lote en curso no se cortan. Su avance se ve en el panel de
   Pilo (almacén de actividad), no en una franja de esta página.

   Lo que no es la ficha (índice, respuestas) se aplica al momento.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { pendingOf, useEmbedStatus, useHideAnswer, useIndexMemory, useSavedAnswers } from "../pilo/memory";
import type { EmbedStatus } from "../pilo/memory";
import { CatalogModal } from "../pilo/CatalogModal";
import type { CatalogRow, CatalogRol } from "../pilo/catalog-sheet";
import { SPACE_COPY } from "../pilo/space";
// MONTAJE GlobalMap: el import; el montaje está en el momento «mapa», más abajo.
import { GlobalMap } from "../pilo/mapa-global/GlobalMap";
import { Group, StatusMark, Switch, plural, when } from "../pilo/ui";
import { activity, isWorking, useActivity } from "./actividad";
import { DocumentsPanel } from "./memoria/DocumentsPanel";
import { MoodlePanel } from "./memoria/MoodlePanel";
import { MemoryProbe, TeachMap } from "./memoria/TeachMap";
import { comprehend, indexRun, useComprehendStatus, useProbePath, useRefreshMemory, useTeachMap } from "./memoria/data";
import { MAX_ROUNDS, comprehendNext, comprehendShare, faultOf } from "./memoria/flow";
import type { ComprehendResult, Fault } from "./memoria/flow";
import { FaultNote, MissingNote } from "./memoria/parts";
import { enterBlock, fillBar as fillBarTo } from "./motion";
import { MOMENTS, parseMoment } from "./navegacion";
import type { MomentId } from "./navegacion";
import type { SpaceEditor } from "./PreguntaPanel";
import { SPACE_SOURCES, useSpaceMemoryCounts } from "./store";
import type { SpaceSource } from "./store";
import { RolTag, Sheet, Skeleton, useEnter } from "./ui";

export function MemoriaPanel({ ed }: { ed: SpaceEditor }) {
  const { s, missing } = ed;
  const space = s.id;
  const [params, setParams] = useSearchParams();
  const moment = parseMoment(params.get("momento"));
  const [visited, setVisited] = useState<Set<MomentId>>(() => new Set([moment]));
  const via = useRef<"pointer" | "keyboard" | null>(null);
  const views = useRef<Record<string, HTMLDivElement | null>>({});
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setVisited((prev) => (prev.has(moment) ? prev : new Set([...prev, moment])));
  }, [moment]);

  // Cambiar de momento con el puntero se ve; con el teclado, no.
  useLayoutEffect(() => {
    if (via.current === "pointer") enterBlock(views.current[moment]);
    via.current = null;
  }, [moment]);

  const go = (id: MomentId, how: "pointer" | "keyboard" = "pointer") => {
    if (id === moment) return;
    via.current = how;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("momento", id);
        return next;
      },
      { replace: true },
    );
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = MOMENTS.findIndex((m) => m.id === moment);
    const to =
      e.key === "ArrowRight" ? (at + 1) % MOMENTS.length
      : e.key === "ArrowLeft" ? (at - 1 + MOMENTS.length) % MOMENTS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? MOMENTS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    go(MOMENTS[to].id, "keyboard");
    tabs.current[MOMENTS[to].id]?.focus();
  };

  const body: Record<MomentId, () => ReactNode> = {
    alimentar: () => (
      <Sheet off={missing}>
        <SourcesGroup ed={ed} />
        <DocumentsPanel space={space} disabled={missing} />
        <MoodlePanel space={space} disabled={missing} />
      </Sheet>
    ),
    comprender: () => (
      <Sheet off={missing}>
        <SemanticGroup ed={ed} />
        <ComprehendGroup ed={ed} onMap={() => go("mapa")} />
      </Sheet>
    ),
    mapa: () => (
      <>
        <Sheet off={missing}>
          <TeachMap space={space} disabled={missing} />
        </Sheet>
        {/* MONTAJE GlobalMap: el único punto donde se monta el mapa global de los dos Pilos
            (src/modules/admin/pilo/mapa-global). Va en su propia hoja, debajo del mapa de este Pilo,
            y abre mostrando los dos («todo»). Este momento se monta al visitarlo y sigue montado después. */}
        <Sheet off={missing}>
          <Group title="Mapa global de los dos Pilos" aside={<small>Solo se dibuja: cada Pilo sigue buscando en lo suyo</small>}>
            {missing ? <p className="pis-small">Sin la migración 0113 este Pilo no existe todavía: no hay qué unir con el de Planeación.</p> : <GlobalMap focus="todo" />}
          </Group>
        </Sheet>
      </>
    ),
    probar: () => (
      <Sheet off={missing}>
        <MemoryProbe space={space} disabled={missing} />
        <ProbeTrail onMap={() => go("mapa")} />
        <AnswersGroup ed={ed} />
      </Sheet>
    ),
  };

  return (
    <>
      <div className="pen-moments" role="tablist" aria-label="Momentos de la memoria" onKeyDown={onKey}>
        {MOMENTS.map((m, i) => {
          const on = m.id === moment;
          return (
            <button
              key={m.id}
              ref={(el) => (tabs.current[m.id] = el)}
              type="button"
              role="tab"
              id={`pen-moment-${m.id}`}
              aria-selected={on}
              aria-controls={`pen-moment-view-${m.id}`}
              tabIndex={on ? 0 : -1}
              onClick={(e) => go(m.id, e.detail === 0 ? "keyboard" : "pointer")}
            >
              <span aria-hidden="true">{i + 1}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {MOMENTS.map((m) =>
        visited.has(m.id) || m.id === moment ? (
          <div key={m.id} id={`pen-moment-view-${m.id}`} role="tabpanel" aria-labelledby={`pen-moment-${m.id}`} hidden={m.id !== moment} className="pen-moment" ref={(el) => (views.current[m.id] = el)}>
            <p className="pis-small">{m.lead}</p>
            {body[m.id]()}
          </div>
        ) : null,
      )}
    </>
  );
}

/* --- Alimentar · Fuentes ------------------------------------------------------------------ */

function SourcesGroup({ ed }: { ed: SpaceEditor }) {
  const { s, set, missing } = ed;
  const counts = useSpaceMemoryCounts(s.id, !missing);
  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0;

  return (
    <Group title="Fuentes" aside={<small>{missing ? "Sin la migración 0113" : counts.data ? `${plural(total, "pasaje", "pasajes")} · actualizada ${when(s.memory_indexed_at)}` : "Contando pasajes…"}</small>}>
      <p className="pis-lead">
        La memoria de este Pilo es solo suya: cuatro colecciones que no se cruzan con las de Planeación. Apagar una la deja guardada, pero Pilo deja de buscar en ella.
      </p>
      <ul className="pis-sources">
        {SPACE_SOURCES.map((m) => (
          <li key={m.id} data-off={!s.memory_sources[m.id] || undefined}>
            <span className="pis-code pen-code" data-s={m.id} aria-hidden="true">
              {m.code}
            </span>
            <span>
              <strong>{m.name}</strong>
              <small>{m.desc}</small>
            </span>
            <em>{counts.data ? plural(counts.data[m.id], "pasaje", "pasajes") : "—"}</em>
            <Switch on={s.memory_sources[m.id]} onChange={(v) => set("memory_sources", { ...s.memory_sources, [m.id]: v } as Record<SpaceSource, boolean>)} label={`Usar ${m.name}`} />
          </li>
        ))}
      </ul>
      {missing ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no tiene memoria propia.</p>
      ) : (
        counts.data && total === 0 && <p className="pis-small">Todavía no hay pasajes: la memoria se llena con los documentos que suba y los cursos de Moodle que elija, aquí abajo.</p>
      )}
    </Group>
  );
}

/* --- Comprender · Búsqueda por significado ------------------------------------------------ */

const INDEX_OWNER = "indice";

function SemanticGroup({ ed }: { ed: SpaceEditor }) {
  const { s, missing } = ed;
  const space = s.id;
  const status = useEmbedStatus(!missing, space);
  const refresh = useRefreshMemory(space);
  const [progress, setProgress] = useState<EmbedStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const halt = useRef(false);
  const alive = useRef(true);
  const now = progress ?? status.data ?? null;
  const pending = pendingOf(now);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      halt.current = true;
      activity.end(INDEX_OWNER);
    };
  }, []);

  /** Lote tras lote, hasta quedar al día; el avance es el de ESTA corrida. */
  const run = async () => {
    if (running || !now) return;
    const start = pending;
    halt.current = false;
    setRunning(true);
    setNote(null);
    setError(null);
    const say = (st: EmbedStatus | null, stopping = false) => {
      const left = pendingOf(st);
      const total = st ? st.memory_total + st.catalog_total : 0;
      const done = st ? st.memory_done + st.catalog_done : 0;
      activity.set({
        owner: INDEX_OWNER,
        title: stopping ? "Pilo termina el lote y se detiene" : "Pilo está indexando su memoria",
        line: st ? `${done.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} con su vector · faltan ${left.toLocaleString("es-CO")}.` : "Pidiendo el primer lote…",
        progress: start > 0 ? (start - left) / start : undefined,
        stop: stopping
          ? undefined
          : () => {
              halt.current = true;
              say(st, true);
            },
      });
    };
    say(now);
    try {
      const r = await indexRun(space, {
        stopped: () => halt.current,
        onStatus: (st) => {
          if (alive.current) setProgress(st);
          say(st, halt.current);
        },
      });
      if (alive.current && r.halted) setNote("Se detuvo. Lo indexado queda guardado: puede retomarlo cuando quiera.");
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "No se pudo indexar.");
    } finally {
      activity.end(INDEX_OWNER);
      refresh();
      if (alive.current) {
        setProgress(null);
        setRunning(false);
      }
    }
  };

  return (
    <Group title="Búsqueda por significado" aside={<small>{now?.model ? `Modelo ${now.model}` : "El índice de este Pilo"}</small>}>
      <div className="pis-row">
        <p className="pis-note">
          Cada pasaje y cada entrada del catálogo de este Pilo guardan un vector que dice de qué hablan: así encuentra «evaluación formativa» cuando le preguntan «¿cómo
          califico sin examen?». Usa el modelo y la clave de Mr. Pilo con IA, pero su índice es aparte.
        </p>
        <button type="button" className="button-secondary" onClick={() => void run()} disabled={missing || running || status.isPending || status.isError || !now || pending === 0}>
          {running ? "Indexando…" : pending === 0 && now ? "Al día" : note ? "Retomar el índice" : "Indexar por significado"}
        </button>
      </div>

      {missing ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no tiene índice.</p>
      ) : status.isError ? (
        <p className="pis-warn">{(status.error as Error).message}</p>
      ) : status.isPending ? (
        <Skeleton rows={1} label="Revisando el índice" />
      ) : now ? (
        <p className="pis-small">
          <StatusMark tone={running ? "off" : pending ? "warn" : "ok"}>{running ? "Indexando" : pending ? "Falta indexar" : "Al día"}</StatusMark> {plural(now.memory_done, "pasaje", "pasajes")} de{" "}
          {now.memory_total.toLocaleString("es-CO")}
          {now.catalog_total ? ` y ${plural(now.catalog_done, "entrada del catálogo", "entradas del catálogo")} de ${now.catalog_total.toLocaleString("es-CO")}` : ""} tienen su vector
          {pending ? ` · faltan ${pending.toLocaleString("es-CO")}` : ""}.{running ? " El avance se ve en el panel de Pilo; puede seguir trabajando en otra sección." : ""}
        </p>
      ) : (
        <p className="pis-small">Sin datos del índice.</p>
      )}
      {note && !running && <p className="pis-small">{note}</p>}
      {error && (
        <p className="pis-error" role="alert">
          No terminó de indexar: {error}
        </p>
      )}
    </Group>
  );
}

/* --- Comprender · Comprensión con IA ------------------------------------------------------ */

const UNDERSTAND_OWNER = "comprender";
/** El dueño con que el mapa (TeachMap) reporta su propio «Comprender»: no se corren dos a la vez. */
const MAP_OWNER = "mapa";

function ComprehendGroup({ ed, onMap }: { ed: SpaceEditor; onMap: () => void }) {
  const { s, missing: off } = ed;
  const space = s.id;
  const map = useTeachMap(space, !off);
  const missing = map.data?.missing ?? null;
  const ai = useComprehendStatus(space, !off && map.data !== undefined && !missing);
  const refresh = useRefreshMemory(space);
  const elsewhere = isWorking(useActivity(), MAP_OWNER);
  const [run, setRun] = useState<{ status: ComprehendResult["status"]; round: number } | null>(null);
  const [stop, setStop] = useState<{ why: string; again: boolean; calm?: boolean } | null>(null);
  const [fault, setFault] = useState<Fault | null>(null);
  const halt = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      halt.current = true;
      activity.end(UNDERSTAND_OWNER);
    };
  }, []);

  const status = run?.status ?? ai.data?.status ?? map.data?.data.status ?? null;
  const hasAi = ai.data ? ai.data.ai !== false : null;
  const pending = Number(status?.pending) || 0;
  const mapped = Number(status?.mapped) || 0;
  const total = Number(status?.total) || 0;
  const running = run !== null;

  /** Lote tras lote, hasta que no quede nada, un lote se detenga o alguien lo pare. */
  const understand = async () => {
    if (running || elsewhere) return;
    halt.current = false;
    setStop(null);
    setFault(null);
    setRun({ status: status ?? undefined, round: 0 });
    const say = (st: ComprehendResult["status"] | null | undefined, round: number, stopping = false) =>
      activity.set({
        owner: UNDERSTAND_OWNER,
        title: stopping ? "Pilo termina el lote y se detiene" : "Pilo está comprendiendo sus pasajes",
        line: `${(Number(st?.mapped) || 0).toLocaleString("es-CO")} de ${(Number(st?.total) || 0).toLocaleString("es-CO")} pasajes · busca temas y referencias.`,
        progress: comprehendShare(st),
        counter: `Lote ${round + 1}`,
        stop: stopping
          ? undefined
          : () => {
              halt.current = true;
              say(st, round, true);
            },
      });
    let last: ComprehendResult["status"] | null | undefined = status;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (halt.current) {
          if (alive.current) setStop({ why: "Se detuvo. Lo comprendido queda guardado: puede retomarlo cuando quiera.", again: true, calm: true });
          break;
        }
        say(last, round);
        const r = await comprehend(space, "lote");
        last = r.status;
        if (!alive.current) return;
        setRun({ status: r.status, round });
        const next = comprehendNext(r, round);
        if (next.next === "seguir") continue;
        if (next.why) setStop({ why: next.why, again: next.again });
        break;
      }
    } catch (error) {
      if (alive.current) setFault(faultOf(error));
    } finally {
      activity.end(UNDERSTAND_OWNER);
      refresh();
      if (alive.current) setRun(null);
    }
  };

  const bar = useRef<HTMLSpanElement>(null);
  const share = comprehendShare(status);

  return (
    <Group title="Comprensión con IA" aside={<small>{status ? `${plural(Number(status.topics) || 0, "tema", "temas")} · ${plural(Number(status.refs) || 0, "referencia", "referencias")}` : "De qué trata cada pasaje"}</small>}>
      {off ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no tiene nada que comprender.</p>
      ) : missing ? (
        <MissingNote migration={missing} what="Sin ella Pilo no guarda temas ni referencias: los documentos quedan en pasajes y responde igual, pero sin seguir conexiones." />
      ) : map.isError ? (
        <FaultNote fault={faultOf(map.error)} lead="No se pudo leer el estado de la comprensión" onRetry={() => void map.refetch()} />
      ) : map.isPending ? (
        <Skeleton rows={2} label="Revisando lo comprendido" />
      ) : (
        <>
          <div className="pis-row">
            <p className="pis-note">
              Pilo le pregunta a la IA de qué trata cada pasaje y qué normas o referentes cita; con eso arma los temas y las referencias del mapa. Trabaja en lotes largos y sigue
              solo hasta terminar. Puede detenerlo y retomarlo: lo ya comprendido no se pierde.
              {hasAi === false ? " Sin IA, el mapa es el básico: estructura y normas citadas." : ""}
            </p>
            <button type="button" className="button-primary" onClick={() => void understand()} disabled={running || elsewhere || hasAi !== true || pending === 0}>
              {running || elsewhere ? "Comprendiendo…" : hasAi === false ? "Comprender necesita la IA" : pending === 0 && status ? "Todo comprendido" : stop?.again ? "Retomar" : "Comprender lo que falta"}
            </button>
          </div>

          {status && (
            <>
              <p className="pis-small">
                <StatusMark tone={hasAi === false ? "off" : running || elsewhere ? "off" : pending ? "warn" : "ok"}>
                  {hasAi === false ? "Mapa básico" : running || elsewhere ? "Comprendiendo" : pending ? `Faltan ${plural(pending, "pasaje", "pasajes")}` : "Todo comprendido"}
                </StatusMark>{" "}
                {mapped.toLocaleString("es-CO")} de {plural(total, "pasaje comprendido", "pasajes comprendidos")}.{running || elsewhere ? " El avance y «Detener» están en el panel de Pilo." : ""}
              </p>
              <ShareBar bar={bar} share={share} label="Pasajes comprendidos" />
            </>
          )}
          {stop && !running && <p className={stop.calm ? "pis-small" : "pis-warn"}>{stop.why}</p>}
          {fault && !running && <FaultNote fault={fault} lead="Comprender se detuvo" onRetry={fault.retry ? () => void understand() : undefined} />}
          {ai.isError && !running && <FaultNote fault={faultOf(ai.error)} lead="No se pudo saber si este Pilo tiene IA para comprender" onRetry={() => void ai.refetch()} />}
          <p className="pis-small">
            Los temas y las referencias que salen de aquí se ven en el{" "}
            <button type="button" className="pis-link" onClick={onMap}>
              Mapa de conexiones
            </button>
            .
          </p>
        </>
      )}
    </Group>
  );
}

/** Una barra de avance que va a su valor. */
function ShareBar({ bar, share, label }: { bar: RefObject<HTMLSpanElement>; share: number; label: string }) {
  const started = useRef(false);
  useLayoutEffect(() => {
    fillBarTo(bar.current, share, started.current ? undefined : 0);
    started.current = true;
  }, [bar, share]);
  return (
    <i className="pen-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
      <span ref={bar} />
    </i>
  );
}

/* --- Probar · el camino de la última prueba ------------------------------------------------ */

/** La prueba deja su camino encendido en el mapa, que ahora es otro momento: se enlaza. */
function ProbeTrail({ onMap }: { onMap: () => void }) {
  const probe = useProbePath();
  if (!probe || probe.direct.length + probe.viaMap.length === 0) return null;
  return (
    <p className="pen-trail">
      <Icon name="layers" size={16} />
      <span>El camino de la última prueba está encendido en el mapa.</span>
      <button type="button" className="button-secondary" onClick={onMap}>
        Ver el camino en el mapa
      </button>
    </p>
  );
}

/* --- Probar · Respuestas guardadas ---------------------------------------------------------- */

function AnswersGroup({ ed }: { ed: SpaceEditor }) {
  const { s, missing } = ed;
  const space = s.id;
  const answers = useSavedAnswers(space);
  const hide = useHideAnswer();
  const indexer = useIndexMemory(space);
  const [entry, setEntry] = useState<Partial<CatalogRow> | null>(null);
  const list = useEnter<HTMLUListElement>(answers.data ? answers.data.rows.map((a) => a.id).join() : null);

  const promote = (a: { question: string; answer: string; rol?: string }) =>
    setEntry({
      kind: "respuesta",
      question: a.question,
      answer: a.answer.replace(/\s*\[\d+\]/g, "").trim(),
      source_title: SPACE_COPY[space].sourceTitle,
      source_path: SPACE_COPY[space].sourcePath,
      rol: (a.rol === "estudiante" || a.rol === "profesor" ? a.rol : "") as CatalogRol,
    });

  return (
    <Group title="Respuestas guardadas" aside={answers.data ? <small>{plural(answers.data.total, "en total", "en total")}</small> : null}>
      {missing ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no guarda respuestas.</p>
      ) : answers.isPending ? (
        <Skeleton rows={3} label="Leyendo las respuestas guardadas" />
      ) : !answers.data || answers.data.rows.length === 0 ? (
        <p className="pis-small">
          Todavía no hay respuestas guardadas. Se guardan las que redacta la IA con todo verificado, separadas por rol: lo que se le dijo a un estudiante no se le sirve a un
          profesor.
        </p>
      ) : (
        <ul className="pis-answers" ref={list}>
          {answers.data.rows.map((a) => (
            <li key={a.id} data-hidden={a.hidden || undefined}>
              <span>
                <strong>{a.question}</strong>
                <small>{a.answer.replace(/\s*\[\d+\]/g, "").slice(0, 160)}</small>
              </span>
              <em>
                <RolTag rol={a.rol} /> {when(a.created_at)} · sirvió {a.up} · no sirvió {a.down}
                {a.hidden ? " · oculta" : ""}
              </em>
              <div className="pis-cat__actions">
                <button type="button" className="button-secondary pis-to-cat" onClick={() => promote(a)} title="Agregar esta respuesta al catálogo de este Pilo">
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
      {hide.isError && (
        <p className="pis-error" role="alert">
          No se cambió: {(hide.error as Error).message}
        </p>
      )}

      <CatalogModal
        open={entry !== null}
        onClose={() => setEntry(null)}
        defaultKind="respuesta"
        initialEntry={entry}
        isEditing={false}
        space={space}
        onSaved={() => {
          // La respuesta nueva se reconoce por significado en cuanto tenga su vector.
          if (!indexer.isPending) indexer.mutate(undefined);
        }}
      />
    </Group>
  );
}
