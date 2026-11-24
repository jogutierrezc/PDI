/* =============================================================================
   Reordenar arrastrando, dentro de la intranet.

   Escrito con eventos de puntero y no con la API de arrastre del navegador
   por dos razones: aquella no existe en táctil —un dedo no puede arrastrar
   nada— y obliga a pasar por el portapapeles del sistema para llevar un dato
   que ya tenemos aquí. Con `pointerdown` el mismo gesto vale para ratón, lápiz
   y dedo, y no hace falta ninguna dependencia nueva.

   Arrastrar nunca es la única salida. El asa responde también a las flechas
   del teclado cuando tiene el foco, y quien la usa encuentra además los
   botones ↑↓ de la fila: el orden de una lista no puede quedar reservado a
   quien puede sostener un puntero sobre un objetivo de veinte píxeles.

   Lo que se devuelve es una intención —«mueve la fila 3 a la posición 0»—, no
   una escritura: quién la persiste y cómo lo decide cada pantalla.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export interface ReorderHandle {
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  /** Sin esto el navegador se lleva el gesto para desplazar la página. */
  style: { touchAction: "none" };
  onPointerDown: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface Reorder {
  /** Fila que se está arrastrando ahora mismo, si alguna. */
  dragging: number | null;
  /**
   * Dónde caería la fila: el índice *antes del cual* se insertaría, de 0 a
   * `count`. Es nulo cuando soltar no cambiaría nada, para no dibujar una
   * marca que promete un movimiento que no va a ocurrir.
   */
  marker: number | null;
  /** Se pone en el elemento de cada fila, para poder medirla. */
  setRow: (index: number) => (node: HTMLElement | null) => void;
  /** Se reparte sobre el asa de cada fila. */
  handle: (index: number, label: string) => ReorderHandle;
}

export function useReorder(count: number, onMove: (from: number, to: number) => void): Reorder {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** El gesto en curso, fuera de React: los oyentes de `window` no ven el estado. */
  const live = useRef<{ from: number; at: number } | null>(null);

  const setRow = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      rows.current[index] = node;
    },
    [],
  );

  useEffect(() => {
    if (dragging === null) return;

    /** El punto de inserción: cuántas filas han quedado por encima del puntero. */
    const insertionAt = (clientY: number) => {
      let at = 0;
      for (let index = 0; index < count; index += 1) {
        const rect = rows.current[index]?.getBoundingClientRect();
        if (rect && clientY > rect.top + rect.height / 2) at = index + 1;
      }
      return at;
    };

    const onMovePointer = (event: globalThis.PointerEvent) => {
      if (!live.current) return;
      const at = insertionAt(event.clientY);
      live.current.at = at;
      setDropAt(at);
    };

    const stop = () => {
      const gesture = live.current;
      live.current = null;
      setDragging(null);
      setDropAt(null);
      if (!gesture) return;
      // Quitar la fila de su sitio corre una posición todo lo que venía
      // después, así que soltar más abajo del origen pide un índice menos.
      const target = gesture.at > gesture.from ? gesture.at - 1 : gesture.at;
      if (target !== gesture.from) onMove(gesture.from, target);
    };

    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Se cancela el gesto, no la posición: al soltar no se escribe nada.
      live.current = null;
      setDragging(null);
      setDropAt(null);
    };

    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onEscape);
    };
  }, [dragging, count, onMove]);

  const handle = useCallback(
    (index: number, label: string): ReorderHandle => ({
      role: "button",
      tabIndex: 0,
      "aria-label": label,
      style: { touchAction: "none" },
      onPointerDown: (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        // Sin esto el navegador empieza a seleccionar texto a mitad del gesto.
        event.preventDefault();
        live.current = { from: index, at: index };
        setDragging(index);
        setDropAt(index);
      },
      onKeyDown: (event) => {
        if (event.key === "ArrowUp" && index > 0) {
          event.preventDefault();
          onMove(index, index - 1);
        }
        if (event.key === "ArrowDown" && index < count - 1) {
          event.preventDefault();
          onMove(index, index + 1);
        }
      },
    }),
    [count, onMove],
  );

  // Soltar justo antes o justo después de donde se cogió no mueve nada: la
  // marca de caída se calla en vez de prometer un cambio que no ocurrirá.
  const marker =
    dragging === null || dropAt === null || dropAt === dragging || dropAt === dragging + 1 ? null : dropAt;

  return { dragging, marker, setRow, handle };
}

/** Mueve un elemento de sitio sin tocar el arreglo original. */
export function moved<T>(rows: T[], from: number, to: number): T[] {
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}
