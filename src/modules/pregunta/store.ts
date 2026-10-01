/* =============================================================================
   Pregúntele a Pilo · lo que se recuerda en el navegador de quien pregunta.

   - El tema: blanco, soleado o negro. Sin elección, sigue al tema del sitio
     (oscuro → negro).
   - Las conversaciones: las últimas 20, con sus respuestas y fuentes, para
     volver a ellas sin preguntar de nuevo. Nunca salen del navegador.
   - Si ya vio la bienvenida.
   Todo va entre try/catch: en modo privado o con el almacenamiento bloqueado,
   la página funciona igual, solo que sin recordar.
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../../lib/theme";
import type { AskResult } from "../../components/pilo/ai/client";
import type { Think } from "./answer-state";

export type Tema = "blanco" | "soleado" | "negro";

export const TEMAS: { id: Tema; label: string }[] = [
  { id: "blanco", label: "Blanco" },
  { id: "soleado", label: "Soleado" },
  { id: "negro", label: "Negro" },
];

const KEY_TEMA = "pilo-pregunta:tema";
const KEY_CONVS = "pilo-pregunta:conversaciones";
export const KEY_WELCOME = "pilo-pregunta:bienvenida";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

export function useTema(): [Tema, (t: Tema) => void] {
  const { resolved } = useTheme();
  const [chosen, setChosen] = useState<Tema | null>(() => {
    const v = read(KEY_TEMA);
    return v === "blanco" || v === "soleado" || v === "negro" ? v : null;
  });
  const set = useCallback((t: Tema) => {
    setChosen(t);
    write(KEY_TEMA, t);
  }, []);
  return [chosen ?? (resolved === "dark" ? "negro" : "blanco"), set];
}

export const seenWelcome = () => read(KEY_WELCOME) === "1";
export const markWelcome = (seen: boolean) => write(KEY_WELCOME, seen ? "1" : null);

/* --- Conversaciones ------------------------------------------------------------------ */

export interface Turn {
  id: string;
  q: string;
  answer?: AskResult;
  error?: string;
  vote?: "up" | "down";
  /** La respuesta se interrumpió (se cortó el flujo o la persona la detuvo): `answer` es lo que alcanzó a escribirse. */
  incomplete?: boolean;
  /** «Pensando…» en compacto: los pasos que reportó el servidor y cuánto tardó. */
  think?: Think;
}

export interface Conversation {
  id: string;
  title: string;
  at: number;
  turns: Turn[];
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function loadConversations(): Conversation[] {
  try {
    const parsed = JSON.parse(read(KEY_CONVS) ?? "[]") as Conversation[];
    if (!Array.isArray(parsed)) return [];
    // Lo guardado antes de «IA siempre» no trae grounding, pasos ni marcas: se lee igual.
    return parsed
      .filter((c) => c && Array.isArray(c.turns))
      .slice(0, 20)
      .map((c) => ({
        ...c,
        turns: c.turns
          .filter((t) => t && typeof t.q === "string")
          .map((t) =>
            t.answer && typeof t.answer.text === "string"
              ? { ...t, answer: { ...t.answer, sources: Array.isArray(t.answer.sources) ? t.answer.sources : [], trail: Array.isArray(t.answer.trail) ? t.answer.trail : [] } }
              : { ...t, answer: undefined },
          ),
      }));
  } catch {
    return [];
  }
}

export function useConversations() {
  const [list, setList] = useState<Conversation[]>(loadConversations);
  useEffect(() => {
    // Solo se guardan los turnos terminados (o marcados como incompletos): lo que
    // aún se está escribiendo vive fuera de esta lista y no se recuerda.
    const done = list
      .map((c) => ({ ...c, turns: c.turns.filter((t) => t.answer || t.error) }))
      .filter((c) => c.turns.length)
      .slice(0, 20);
    write(KEY_CONVS, JSON.stringify(done));
  }, [list]);
  return [list, setList] as const;
}
