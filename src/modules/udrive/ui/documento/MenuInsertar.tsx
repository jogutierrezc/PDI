/* =============================================================================
   UDrive · el menú «Insertar» que abre el «+» entre bloques.

   Una lista de botones (role="menu"): flechas para moverse, Enter para elegir,
   Escape para cerrar. Tabla, gráfica e imagen piden primero el archivo de
   UDrive (selector con búsqueda y vista previa); lo demás inserta de una vez.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { TipoBloque } from "../../lib/documento";

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const OPCIONES_INSERTAR: { tipo: TipoBloque; nombre: string; ayuda: string; icono: ReactNode }[] = [
  { tipo: "parrafo", nombre: "Párrafo", ayuda: "Texto con negrita, cursiva y cifras vivas", icono: I(<path d="M5 7h14M5 12h14M5 17h9" />) },
  { tipo: "capitulo", nombre: "Título de capítulo", ayuda: "Entra solo en el contenido", icono: I(<path d="M6 5v14M18 5v14M6 12h12" />) },
  { tipo: "lista", nombre: "Lista", ayuda: "Con viñetas o numerada", icono: I(<path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" />) },
  { tipo: "tabla", nombre: "Tabla", ayuda: "Una tabla de UDrive", icono: I(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.8" /><path d="M3.5 9.5h17M9.2 4.5v15" /></>) },
  { tipo: "grafica", nombre: "Gráfica", ayuda: "Una gráfica de UDrive", icono: I(<path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8" />) },
  { tipo: "imagen", nombre: "Imagen", ayuda: "Una foto o un dibujo de UDrive", icono: I(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" /></>) },
  { tipo: "mapa", nombre: "Mapa", ayuda: "Un lugar en OpenStreetMap, con marcadores", icono: I(<><path d="M9 5L4 7v12l5-2 6 2 5-2V5l-5 2z" /><path d="M9 5v12M15 7v12" /></>) },
  { tipo: "destacado", nombre: "Cuadro destacado", ayuda: "Una idea clave aparte", icono: I(<path d="M7 9a3 3 0 00-3 3v4h5v-4H6.5M16 9a3 3 0 00-3 3v4h5v-4h-2.5" />) },
  { tipo: "nota", nombre: "Nota o fuente", ayuda: "«Nota. …» suelta", icono: I(<path d="M6 4h9l3 3v13H6zM9 12h6M9 16h6" />) },
  { tipo: "referencias", nombre: "Referencias", ayuda: "La bibliografía APA, generada", icono: I(<path d="M5 5h14M5 10h14M5 15h9M5 20h6" />) },
  { tipo: "salto", nombre: "Salto de página", ayuda: "Empezar en hoja nueva", icono: I(<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />) },
];

export function MenuInsertar({ onElegir, onCerrar }: { onElegir(t: TipoBloque): void; onCerrar(): void }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>("button")?.focus();
    const fuera = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && onCerrar();
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [onCerrar]);
  const alTeclear = (e: React.KeyboardEvent) => {
    const botones = Array.from(raiz.current?.querySelectorAll<HTMLElement>("button") ?? []);
    const i = botones.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCerrar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      botones[(i + 1) % botones.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      botones[(i - 1 + botones.length) % botones.length]?.focus();
    }
  };
  return (
    <div ref={raiz} className="ud-menu-ins" role="menu" aria-label="Insertar un bloque" onKeyDown={alTeclear}>
      <div className="ud-h">Insertar</div>
      {OPCIONES_INSERTAR.map((o) => (
        <button key={o.tipo} type="button" role="menuitem" onClick={() => onElegir(o.tipo)}>
          {o.icono}
          {o.nombre}
          <small>{o.ayuda}</small>
        </button>
      ))}
    </div>
  );
}
