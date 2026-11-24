/* =============================================================================
   Contactos · público · tema claro, oscuro o automático.

   El enlace público tiene los dos temas (la intranet es solo clara). El tema se
   fija en el contenedor de la página (data-theme), nunca en <html>, y se recuerda
   en este navegador. «Automático» sigue la preferencia del sistema.
   ========================================================================== */

import { useState } from "react";

export type Tema = "auto" | "claro" | "oscuro";

export const LLAVE_TEMA = "int-contactos:tema";
export const TEMAS: readonly { id: Tema; texto: string }[] = [
  { id: "claro", texto: "Claro" },
  { id: "oscuro", texto: "Oscuro" },
  { id: "auto", texto: "Automático" },
];

export function leerTema(): Tema {
  try {
    const t = window.localStorage.getItem(LLAVE_TEMA);
    return t === "claro" || t === "oscuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Lo que se pone en data-theme: nada en automático. */
export const atributoTema = (t: Tema): "light" | "dark" | undefined => (t === "claro" ? "light" : t === "oscuro" ? "dark" : undefined);

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(() => leerTema());
  const fijar = (t: Tema) => {
    setTema(t);
    try {
      if (t === "auto") window.localStorage.removeItem(LLAVE_TEMA);
      else window.localStorage.setItem(LLAVE_TEMA, t);
    } catch {
      // sin almacenamiento: vale mientras la página siga abierta
    }
  };
  return [tema, fijar];
}

export function InterruptorTema({ tema, onTema }: { tema: Tema; onTema: (t: Tema) => void }) {
  return (
    <div className="cp-tema" role="radiogroup" aria-label="Tema de la página">
      {TEMAS.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={tema === t.id} onClick={() => onTema(t.id)}>
          {t.texto}
        </button>
      ))}
    </div>
  );
}
