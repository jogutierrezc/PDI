/* =============================================================================
   Mr. Pilo · los saludos del chat incrustado (0173).

   El chat que se incrusta en otros portales (udes.edu.co) ya no abre con un
   texto fijo: toma un saludo de una lista que la administración edita en la
   intranet, por Pilo (Planeación y Enseñanza). Los saludos NO llevan cifras,
   y varían: por la hora del día (un saludo de «buenos días» solo por la
   mañana), por azar y con memoria, para no repetir el último que vio esa
   persona. Si no hay lista (sin la migración, sin red) se usa el saludo único de
   siempre (`greeting`), que sigue valiendo.

   Lo puro va arriba y se prueba en node; el hook que lee la lista y recuerda el
   último saludo, abajo.
   ========================================================================== */

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export type GreetingMoment = "cualquiera" | "manana" | "tarde" | "noche";

export interface Greeting {
  text: string;
  moment: GreetingMoment;
}

export const GREETING_MAX = 300;

const MOMENTS: GreetingMoment[] = ["cualquiera", "manana", "tarde", "noche"];

/** Un saludo no lleva números ni cifras. */
export const hasFigures = (text: string): boolean => /\d/.test(text);

/** Los saludos que llegan de la base, leídos con cuidado: sin texto, con cifras o repetidos no entran. */
export function parseGreetings(raw: unknown): Greeting[] {
  const out: Greeting[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim().slice(0, GREETING_MAX) : "";
    if (text.length < 3 || hasFigures(text) || out.some((g) => g.text === text)) continue;
    out.push({ text, moment: MOMENTS.includes(r.moment as GreetingMoment) ? (r.moment as GreetingMoment) : "cualquiera" });
  }
  return out;
}

/** El momento del día de una hora (0 a 23): mañana hasta las 11, tarde hasta las 18, noche el resto. */
export function momentOf(hour: number): Exclude<GreetingMoment, "cualquiera"> {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 12;
  if (h >= 5 && h < 12) return "manana";
  if (h >= 12 && h < 19) return "tarde";
  return "noche";
}

export interface PickInput {
  /** Hora local de quien mira (0 a 23). */
  hour: number;
  /** El último saludo que se le mostró a esta persona: no se repite si hay otro. */
  last?: string;
  /** Un número en [0, 1): se inyecta para probar. */
  random: number;
}

/**
 * Elige el saludo: los del momento del día y los «de cualquiera»; sin repetir el
 * último si queda otro; al azar entre los que quedan. Si ninguno sirve, null.
 */
export function pickGreeting(list: Greeting[], input: PickInput): Greeting | null {
  if (!list.length) return null;
  const now = momentOf(input.hour);
  const fit = list.filter((g) => g.moment === "cualquiera" || g.moment === now);
  const pool = fit.length ? fit : list;
  const fresh = pool.filter((g) => g.text !== input.last);
  const from = fresh.length ? fresh : pool;
  const r = Number.isFinite(input.random) ? Math.min(Math.max(input.random, 0), 0.999999) : 0;
  return from[Math.floor(r * from.length)];
}

/** El saludo que se muestra: el de la lista o, sin lista, el único de siempre (`fallback`). El único también entra en la lista. */
export function chooseGreeting(list: Greeting[], single: string, input: PickInput): string {
  const clean = single.replace(/\s+/g, " ").trim();
  const withSingle = clean && !hasFigures(clean) && !list.some((g) => g.text === clean) && list.length ? [...list, { text: clean, moment: "cualquiera" as const }] : list;
  return pickGreeting(withSingle, input)?.text ?? clean;
}

/* --- Lo que habla con el navegador y la base ---------------------------------------------- */

const KEY = (space: string) => `pilo-saludo-${space}`;

/** El último saludo de esta persona, si el navegador deja guardarlo. */
export function readLast(space: string): string {
  try {
    return window.localStorage.getItem(KEY(space)) ?? "";
  } catch {
    return "";
  }
}

export function rememberLast(space: string, text: string): void {
  try {
    window.localStorage.setItem(KEY(space), text.slice(0, GREETING_MAX));
  } catch {
    /* sin almacenamiento: se puede repetir, no pasa nada */
  }
}

/** La lista pública de un Pilo. Vacía sin la migración 0173 o sin red. */
export async function fetchGreetings(space: string): Promise<Greeting[]> {
  try {
    const { data, error } = await supabase.rpc("pilo_greetings_public" as never, { p_space: space } as never);
    return error ? [] : parseGreetings(data);
  } catch {
    return [];
  }
}

/**
 * El saludo de esta visita: se elige una vez (no cambia mientras el chat está
 * abierto) en cuanto llega la lista, y se recuerda para no repetirlo la próxima.
 * Mientras llega, o si no llega, es `single` (el saludo único de siempre).
 */
export function useGreeting(space: string, single: string): string {
  const [text, setText] = useState(single);
  useEffect(() => {
    let current = true;
    void fetchGreetings(space).then((list) => {
      if (!current || !list.length) return;
      const chosen = chooseGreeting(list, single, { hour: new Date().getHours(), last: readLast(space), random: Math.random() });
      rememberLast(space, chosen);
      setText(chosen);
    });
    return () => {
      current = false;
    };
  }, [space, single]);
  return text;
}
