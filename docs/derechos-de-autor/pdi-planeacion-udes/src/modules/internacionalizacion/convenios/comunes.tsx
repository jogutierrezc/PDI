/* Convenios · piezas compartidas: la etiqueta de vigencia y el aviso de resultado. */

import { useCallback, useEffect, useRef, useState } from "react";
import { CLASE_VIGENCIA } from "./logica";
import type { Vigencia } from "./logica";

export function Pildora({ vigencia }: { vigencia: Vigencia | string }) {
  const clase = CLASE_VIGENCIA[vigencia as Vigencia] ?? "idle";
  return <span className={`conv-pill conv-pill--${clase}`}>{vigencia}</span>;
}

/** Un mensaje corto que se borra solo (4 s), para decir qué se hizo. */
export function useAviso(): [string, (t: string) => void] {
  const [texto, setTexto] = useState("");
  const timer = useRef<number>();
  const decir = useCallback((t: string) => {
    setTexto(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTexto(""), 4500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [texto, decir];
}
