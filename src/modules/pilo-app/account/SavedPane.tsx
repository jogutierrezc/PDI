/* =============================================================================
   Mr. Pilo · cuentas (0120) · /app/guardadas.

   Las respuestas que la persona guardó de Pilo, de los dos Pilos, la más
   reciente primero: con su buscador, «Copiar» y «Quitar». Viven en su cuenta,
   así que las encuentra en cualquier dispositivo. Sin cuenta, la pantalla
   invita a registrarse.

   Quitar se confirma en el mismo sitio, sin ventanas.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { parseAnswer } from "../../pregunta/AnswerText";
import { toPlain } from "../../pregunta/markdown";
import { APP_ACCOUNT, APP_LOGIN, APP_PILOS } from "../routes";
import { Icon } from "../icons";
import { removeSavedAnswer, savedCopyText, savedKey, savedMeta, searchSaved, useSavedAnswers } from "./answers";
import type { SavedAnswer } from "./answers";
import { Benefits, Msg } from "./parts";

export function SavedPane({ userId, member, pending }: { userId: string | undefined; member: boolean; pending: boolean }) {
  const client = useQueryClient();
  const saved = useSavedAnswers(userId, member);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const all = useMemo(() => saved.data ?? [], [saved.data]);
  const shown = useMemo(() => searchSaved(all, query), [all, query]);

  if (pending || (member && saved.isPending)) {
    return (
      <p className="pc-wait" role="status">
        Pilo está buscando sus respuestas guardadas…
      </p>
    );
  }

  if (!member) {
    return (
      <section className="pc-sheet">
        <div className="pc-sheet__in">
          <p>Guardar respuestas es de quienes tienen cuenta de Pilo: quedan en su cuenta y las encuentra en cualquier dispositivo. Sin cuenta, sus conversaciones siguen en este dispositivo, en el menú.</p>
          <Benefits title="Con una cuenta de Pilo" />
          <div className="pc-actions">
            <Link className="pa-btn pa-btn--line" to={APP_LOGIN}>
              Entrar
            </Link>
            <Link className="pa-btn pa-btn--main" to={APP_ACCOUNT}>
              Crear una cuenta
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const plain = (item: SavedAnswer) => toPlain(parseAnswer(item.answer));

  const copy = async (item: SavedAnswer) => {
    try {
      await navigator.clipboard.writeText(savedCopyText(item, plain(item), window.location.origin));
      setStatus({ tone: "ok", text: "Copiada." });
    } catch {
      setStatus({ tone: "bad", text: "No se pudo copiar: seleccione el texto para copiarlo." });
    }
  };

  const remove = async (item: SavedAnswer) => {
    setAsking(null);
    try {
      await removeSavedAnswer(item.id);
      client.setQueryData<SavedAnswer[]>(savedKey(userId), (list) => (list ?? []).filter((s) => s.id !== item.id));
      setStatus({ tone: "ok", text: "Se quitó de sus guardadas." });
    } catch (e) {
      setStatus({ tone: "bad", text: (e as Error).message });
    }
  };

  return (
    <>
      <div className="pc-field pc-search">
        <label htmlFor="pc-buscar">Buscar en lo guardado</label>
        <input id="pc-buscar" type="search" enterKeyHint="search" autoComplete="off" placeholder="Rúbrica, PDI, evaluación…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="pc-live" aria-live="polite">
        {saved.isError ? <Msg tone="bad">{(saved.error as Error).message}</Msg> : status ? <Msg tone={status.tone}>{status.text}</Msg> : null}
      </div>

      {all.length === 0 && !saved.isError ? (
        <section className="pc-sheet">
          <div className="pc-sheet__in">
            <p>Aún no ha guardado nada. En la conversación, toque «Guardar» junto a una respuesta completa y la encontrará aquí.</p>
          </div>
        </section>
      ) : shown.length === 0 && !saved.isError ? (
        <p className="pc-hint" role="status">
          No hay nada guardado con esa búsqueda.
        </p>
      ) : (
        <ul className="pc-saved" aria-label={`${shown.length} ${shown.length === 1 ? "respuesta guardada" : "respuestas guardadas"}`}>
          {shown.map((item) => {
            const isOpen = open === item.id;
            return (
              <li key={item.id}>
                <div className="pc-saved__head">
                  <strong>{item.question}</strong>
                  <small>{savedMeta(item, APP_PILOS[item.space].short)}</small>
                </div>
                <p className="pc-saved__text" data-open={isOpen || undefined} id={`pc-g-${item.id}`}>
                  {plain(item)}
                </p>
                {isOpen && item.sources.length > 0 && (
                  <ol className="pc-saved__src" aria-label="Fuentes">
                    {item.sources.map((s) => (
                      <li key={s.n}>
                        {s.n}. {s.title}
                        {s.path &&
                          (/^https?:/i.test(s.path) ? (
                            <a href={s.path} target="_blank" rel="noopener noreferrer">
                              Abrir
                            </a>
                          ) : (
                            <Link to={s.path}>Abrir</Link>
                          ))}
                      </li>
                    ))}
                  </ol>
                )}
                {asking === item.id ? (
                  <div className="pc-confirm" role="alert">
                    <span>¿Quitarla de sus guardadas? No se puede deshacer.</span>
                    <button type="button" className="pc-chip" onClick={() => setAsking(null)}>
                      No, dejarla
                    </button>
                    <button type="button" className="pc-chip" data-strong onClick={() => void remove(item)}>
                      Sí, quitar
                    </button>
                  </div>
                ) : (
                  <div className="pc-saved__tools">
                    <button type="button" className="pc-chip" aria-expanded={isOpen} aria-controls={`pc-g-${item.id}`} onClick={() => setOpen(isOpen ? null : item.id)}>
                      {isOpen ? "Ver menos" : "Ver completa"}
                    </button>
                    <button type="button" className="pc-chip" onClick={() => void copy(item)}>
                      {Icon.copy}
                      Copiar
                    </button>
                    <button type="button" className="pc-chip" onClick={() => setAsking(item.id)}>
                      {Icon.trash}
                      Quitar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
