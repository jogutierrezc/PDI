/* =============================================================================
   Internacionalización · el menú «Nuevo» (carpeta, tabla, Multicampus, Excel).

   Un botón que abre un menú anclado a él; se cierra con Escape, con un clic
   fuera o al elegir, y devuelve el foco al botón. Las flechas mueven entre las
   opciones. Entra desde su esquina (scale .97 + opacidad, 160 ms ease-out, en
   CSS) y no anima al cerrarse: se usa varias veces al día.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { ComponentProps, KeyboardEvent } from "react";
import { Icon } from "../../../components/ui/Icon";

export interface OpcionNuevo {
  id: string;
  icono: ComponentProps<typeof Icon>["name"];
  titulo: string;
  ayuda: string;
  /** Línea fina antes de esta opción. */
  separar?: boolean;
  /** La opción nueva: se resalta. */
  destacada?: boolean;
}

export function MenuNuevo({ opciones, onElegir }: { opciones: OpcionNuevo[]; onElegir: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    raiz.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  };

  if (!opciones.length) return null;
  return (
    <div className="it-nuevo-menu" ref={raiz} onKeyDown={alTeclear}>
      <button ref={boton} type="button" className="es-btn es-btn--pri" data-tour="int-nueva" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <Icon name="plus" size={16} />
        Nuevo
        <Icon name="chevron-down" size={14} />
      </button>
      {abierto ? (
        <div className="it-nuevo-menu__lista" role="menu" aria-label="Crear">
          {opciones.map((o) => (
            <div key={o.id} style={{ display: "contents" }}>
              {o.separar ? <hr /> : null}
              <button
                type="button"
                role="menuitem"
                data-destacada={o.destacada ? "" : undefined}
                onClick={() => {
                  setAbierto(false);
                  onElegir(o.id);
                }}
              >
                <Icon name={o.icono} size={18} />
                <span>
                  <b>{o.titulo}</b>
                  <small>{o.ayuda}</small>
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
