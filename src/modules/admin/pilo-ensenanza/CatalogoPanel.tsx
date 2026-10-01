/* =============================================================================
   Mr. Pilo en Enseñanza · Catálogo.

   El catálogo de siempre (CatalogSection), pero el de este Pilo:

   - pilo_catalog con space = 'ensenanza'. La clave es global, así que las de
     aquí empiezan por ER- (respuestas) y EC- (capciosas); pilo_catalog_import
     recibe p_space y no pisa una clave del otro Pilo (la cuenta en «rejected»).
   - Cada entrada dice para quién es (columna rol): todos, estudiante o
     profesor. Pilo solo usa las de «todos» y las del rol de quien pregunta.
   - «Memoria de Pilo» sincroniza los vectores de estas entradas y «Probar el
     catálogo» busca solo en ellas (pilo-ia «indexar» con space).
   - «Lo que Pilo no supo»: pilo_inbox de este espacio. «Responder» lleva la
     pregunta al catálogo de este Pilo, con el rol de quien la hizo, y la
     cierra con pilo_inbox_close.

   Se aplica al momento: no espera a «Guardar cambios».
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { CatalogSection } from "../pilo/CatalogCard";
import { CatalogModal } from "../pilo/CatalogModal";
import type { CatalogRol, CatalogRow } from "../pilo/catalog-sheet";
import { reasonHint, reasonLabel, useCloseInbox, useInbox } from "../pilo/inbox";
import type { InboxItem } from "../pilo/inbox";
import { useIndexMemory } from "../pilo/memory";
import { SPACE_COPY } from "../pilo/space";
import { Group, StatusMark, plural, when } from "../pilo/ui";
import type { SpaceEditor } from "./PreguntaPanel";
import { CATALOG_EXAMPLES, CATALOG_LEAD } from "./store";
import { RolTag, Skeleton, useEnter } from "./ui";

export function CatalogoPanel({ ed }: { ed: SpaceEditor }) {
  const space = ed.s.id;
  return (
    <>
      <CatalogSection space={space} examples={CATALOG_EXAMPLES} lead={CATALOG_LEAD} />
      <InboxGroup ed={ed} />
    </>
  );
}

function InboxGroup({ ed }: { ed: SpaceEditor }) {
  const space = ed.s.id;
  const inbox = useInbox(12, space);
  const close = useCloseInbox();
  const indexer = useIndexMemory(space);
  const [entry, setEntry] = useState<Partial<CatalogRow> | null>(null);
  // La pregunta de la bandeja que se está respondiendo: al guardar en el catálogo, queda resuelta.
  const [answering, setAnswering] = useState<number | null>(null);
  const list = useEnter<HTMLUListElement>(inbox.data ? inbox.data.rows.map((r) => r.id).join() : null);

  const answer = (item: InboxItem) => {
    setAnswering(item.id);
    setEntry({
      kind: "respuesta",
      question: item.question,
      // Lo que la IA redactó con un dato dudoso suele servir de borrador; lo que no sirvió, no.
      answer: item.reason === "revisar" ? item.answer.replace(/\s*\[\d+\]/g, "").trim() : "",
      source_title: SPACE_COPY[space].sourceTitle,
      source_path: SPACE_COPY[space].sourcePath,
      rol: (item.rol === "estudiante" || item.rol === "profesor" ? item.rol : "") as CatalogRol,
    });
  };

  return (
    <Group title="Lo que Pilo no supo" aside={inbox.data ? <small>{plural(inbox.data.total, "pendiente", "pendientes")}</small> : null}>
      {ed.missing || inbox.data === null ? (
        <p className="pis-small">Falta aplicar la migración 0113 para que este Pilo anote lo que no supo responder.</p>
      ) : inbox.isPending ? (
        <Skeleton rows={3} label="Leyendo la bandeja" />
      ) : !inbox.data || inbox.data.rows.length === 0 ? (
        <p className="pis-small">
          Nada pendiente. Aquí llegan las preguntas que este Pilo no pudo responder, las que alguien marcó «No me sirvió», las que la IA redactó con un dato sin fuente y las
          que contestó de conocimiento general. Las del otro Pilo no entran.
        </p>
      ) : (
        <>
          <p className="pis-small">
            Responda las más preguntadas: la respuesta entra al catálogo de este Pilo, para el rol de quien preguntó, y desde ese momento es la base de lo que redacta.
          </p>
          {inbox.data.rows.some((r) => r.reason === "general") && (
            <p className="pis-small">
              <StatusMark tone="warn">Conocimiento general</StatusMark> {reasonHint("general")}
            </p>
          )}
          <ul className="pis-answers" ref={list}>
            {inbox.data.rows.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.question}</strong>
                  <small>
                    {reasonLabel(item.reason)}
                    {item.answer ? ` · Pilo dijo: ${item.answer.replace(/\s*\[\d+\]/g, "").slice(0, 140)}${item.answer.length > 140 ? "…" : ""}` : ""}
                  </small>
                </span>
                <em>
                  <RolTag rol={item.rol} /> {item.times === 1 ? "1 vez" : `${item.times.toLocaleString("es-CO")} veces`} · {when(item.last_at)}
                </em>
                <div className="pis-cat__actions">
                  <button type="button" className="button-secondary pis-to-cat" onClick={() => answer(item)} title="Escribir la respuesta oficial en el catálogo de este Pilo">
                    <Icon name="spark" size={14} />
                    Responder
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => close.mutate({ id: item.id, status: "descartada" })}
                    disabled={close.isPending}
                    title="No hace falta responderla (una prueba, algo fuera de tema)"
                  >
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {close.isError && (
        <p className="pis-error" role="alert">
          No se pudo cerrar: {(close.error as Error).message}
        </p>
      )}

      <CatalogModal
        open={entry !== null}
        onClose={() => {
          setEntry(null);
          setAnswering(null);
        }}
        defaultKind="respuesta"
        initialEntry={entry}
        isEditing={false}
        space={space}
        onSaved={(saved) => {
          if (answering !== null) close.mutate({ id: answering, status: "resuelta", key: saved.key });
          // La respuesta nueva se reconoce por significado en cuanto tenga su vector.
          if (!indexer.isPending) indexer.mutate(undefined);
        }}
      />
    </Group>
  );
}
