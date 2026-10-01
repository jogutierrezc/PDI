/* =============================================================================
   Mr. Pilo en Enseñanza · Memoria.

   Pilo leyendo     la franja de arriba: qué está leyendo ahora (un documento,
                    un curso, el mapa) o, sin trabajo, cuánto hay en la memoria.

   Fuentes          memory_sources de pilo_spaces: qué colecciones usa, con
                    cuántos pasajes tiene cada una (pilo_memory, por espacio).
                    Se guarda con «Guardar cambios».
   Documentos       ┐ memoria/DocumentsPanel, MoodlePanel y TeachMap: cada uno
   Moodle           ├ dice qué migración le falta (0114, 0116, 0115) y se apaga
   Mapa             ┘ sin romper a los demás.
   Búsqueda por     el índice de vectores de ESTE espacio: la función pilo-ia,
   significado      acción «indexar» con space: "ensenanza" (pilo_embed_status y
                    pilo_embed_pending con p_space). Mientras indexa, Pilo
                    piensa y la barra sigue el avance real, lote por lote.
   Probar           memoria/TeachMap › MemoryProbe: los pasajes que este Pilo
                    encontraría, los que llegan por el mapa y su camino.
   Respuestas       pilo_answers de este espacio, con su rol; se ocultan o se
   guardadas        pasan al catálogo de este Pilo.

   Lo que no es la ficha (índice, respuestas) se aplica al momento.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { pendingOf, useEmbedStatus, useHideAnswer, useIndexMemory, useSavedAnswers } from "../pilo/memory";
import type { EmbedStatus } from "../pilo/memory";
import { CatalogModal } from "../pilo/CatalogModal";
import type { CatalogRow, CatalogRol } from "../pilo/catalog-sheet";
import { SPACE_COPY } from "../pilo/space";
import { Group, StatusMark, Switch, plural, when } from "../pilo/ui";
import { DocumentsPanel } from "./memoria/DocumentsPanel";
import { MoodlePanel } from "./memoria/MoodlePanel";
import { MemoryProbe, TeachMap } from "./memoria/TeachMap";
import { ReadingStrip } from "./memoria/parts";
import type { SpaceEditor } from "./PreguntaPanel";
import { SPACE_SOURCES, useSpaceMemoryCounts } from "./store";
import type { SpaceSource } from "./store";
import { RolTag, Skeleton, Thinking, useEnter } from "./ui";

export function MemoriaPanel({ ed }: { ed: SpaceEditor }) {
  const { s, set, missing } = ed;
  const space = s.id;
  const counts = useSpaceMemoryCounts(space, !missing);
  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <ReadingStrip
        total={missing || !counts.data ? null : total}
        idleLine={missing ? "Sin la migración 0113 este Pilo no tiene memoria propia." : "Suba un documento o sincronice un curso de Moodle para ver a Pilo leer."}
      />

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
        {counts.data && total === 0 && <p className="pis-small">Todavía no hay pasajes: la memoria se llena con los documentos que suba y los cursos de Moodle que elija, aquí abajo.</p>}
      </Group>

      <DocumentsPanel space={space} disabled={missing} />
      <MoodlePanel space={space} disabled={missing} />

      <SemanticGroup ed={ed} />

      <TeachMap space={space} disabled={missing} />

      <MemoryProbe space={space} disabled={missing} />

      <AnswersGroup ed={ed} />
    </>
  );
}

/* --- Búsqueda por significado ------------------------------------------------------------ */

function SemanticGroup({ ed }: { ed: SpaceEditor }) {
  const { s, missing } = ed;
  const status = useEmbedStatus(!missing, s.id);
  const indexer = useIndexMemory(s.id);
  const [progress, setProgress] = useState<EmbedStatus | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const now = progress ?? status.data ?? null;
  const pending = pendingOf(now);
  const total = now ? now.memory_total + now.catalog_total : 0;
  const done = now ? now.memory_done + now.catalog_done : 0;
  const running = indexer.isPending;
  // El avance de ESTA corrida: de lo que faltaba al empezar, cuánto va.
  const share = running && start && start > 0 ? Math.min(1, Math.max(0, (start - pending) / start)) : undefined;

  const run = () => {
    setStart(pending);
    indexer.mutate(setProgress, {
      onSettled: () => {
        setProgress(null);
        setStart(null);
      },
    });
  };

  return (
    <Group title="Búsqueda por significado" aside={<small>{now?.model ? `Modelo ${now.model}` : "El índice de este Pilo"}</small>}>
      <div className="pis-row">
        <p className="pis-note">
          Cada pasaje y cada entrada del catálogo de este Pilo guardan un vector que dice de qué hablan: así encuentra «evaluación formativa» cuando le preguntan «¿cómo
          califico sin examen?». Usa el modelo y la clave de Mr. Pilo con IA, pero su índice es aparte.
        </p>
        <button type="button" className="button-secondary" onClick={run} disabled={missing || running || status.isPending || status.isError || !now || pending === 0}>
          {running ? "Indexando…" : pending === 0 && now ? "Al día" : "Indexar por significado"}
        </button>
      </div>

      {missing ? (
        <p className="pis-small">Sin la migración 0113 este Pilo no tiene índice.</p>
      ) : running ? (
        <Thinking
          progress={share}
          detail={now ? `${done.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} con su vector · faltan ${pending.toLocaleString("es-CO")}. Puede seguir trabajando en otra pestaña.` : "Pidiendo el primer lote…"}
        >
          Pilo está leyendo su memoria
        </Thinking>
      ) : status.isError ? (
        <p className="pis-warn">{(status.error as Error).message}</p>
      ) : status.isPending ? (
        <Skeleton rows={1} label="Revisando el índice" />
      ) : now ? (
        <p className="pis-small" role="status">
          <StatusMark tone={pending ? "warn" : "ok"}>{pending ? "Falta indexar" : "Al día"}</StatusMark> {plural(now.memory_done, "pasaje", "pasajes")} de{" "}
          {now.memory_total.toLocaleString("es-CO")}
          {now.catalog_total ? ` y ${plural(now.catalog_done, "entrada del catálogo", "entradas del catálogo")} de ${now.catalog_total.toLocaleString("es-CO")}` : ""} tienen su vector
          {pending ? ` · faltan ${pending.toLocaleString("es-CO")}` : ""}.
        </p>
      ) : (
        <p className="pis-small">Sin datos del índice.</p>
      )}
      {indexer.isError && (
        <p className="pis-error" role="alert">
          No terminó de indexar: {(indexer.error as Error).message}
        </p>
      )}
    </Group>
  );
}

/* --- Respuestas guardadas ---------------------------------------------------------------- */

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
