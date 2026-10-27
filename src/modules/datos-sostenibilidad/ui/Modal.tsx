/* =============================================================================
   Datos de Sostenibilidad · la ventana emergente (modal) de los formularios.

   Un <dialog> nativo abierto con showModal(): lo de atrás queda inerte y el foco
   no se escapa; además se refuerza el ciclo de Tab. Esc cierra siempre; el clic
   en el velo solo cierra si no hay cambios sin guardar (si los hay, la caja da
   un toque para decir que no). Al cerrar, el foco vuelve al botón que la abrió
   y el scroll de la página, que estaba bloqueado, se libera.

   El velo no es ::backdrop (no se puede animar con GSAP): es un div propio.
   La caja se queda centrada, no nace en su botón (movimiento.ts).
   ========================================================================== */

import { useId, useLayoutEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { abrirModal, cerrarModal, entradaPorTeclado, llamarAtencion } from "./movimiento";

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PropsModal {
  titulo: string;
  descripcion?: string;
  /** Hay cambios sin guardar: el clic en el velo no cierra. */
  sucio?: boolean;
  onCerrar: () => void;
  /** Se llama al enviar el formulario; si devuelve true, la ventana se cierra sola. */
  onEnviar: () => boolean | Promise<boolean>;
  principal: string;
  /** Mientras guarda: el botón principal muestra el giro y la ventana no se cierra. */
  pendiente?: boolean;
  textoPendiente?: string;
  secundario?: string;
  ancho?: boolean;
  children: ReactNode;
}

export function Modal({ titulo, descripcion, sucio = false, onCerrar, onEnviar, principal, pendiente = false, textoPendiente = "Guardando…", secundario = "Cancelar", ancho = false, children }: PropsModal) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const velo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLFormElement>(null);
  const idTitulo = useId();
  const idDescripcion = useId();
  const cerrando = useRef(false);
  const montado = useRef(true);
  const limpiezaCierre = useRef<() => void>(() => {});
  // Siempre la última versión de lo que llega por props, sin volver a abrir la ventana.
  const vivo = useRef({ onCerrar, pendiente });
  vivo.current = { onCerrar, pendiente };

  useLayoutEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    montado.current = true;
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    // El scroll de la página queda quieto mientras la ventana está abierta.
    const html = document.documentElement;
    const overflowAntes = html.style.overflow;
    html.style.overflow = "hidden";
    const finAbrir = abrirModal(velo.current, caja.current);
    // El foco va al campo marcado (data-foco) o al primero que se pueda usar.
    const inicial = caja.current?.querySelector<HTMLElement>("[data-foco]") ?? caja.current?.querySelector<HTMLElement>(ENFOCABLES);
    inicial?.focus({ preventScroll: true });
    return () => {
      montado.current = false;
      finAbrir();
      limpiezaCierre.current();
      html.style.overflow = overflowAntes;
      if (d.open) d.close();
      // El foco vuelve al botón que la abrió (si sigue en la página).
      if (previo?.isConnected) previo.focus({ preventScroll: true });
    };
  }, []);

  /** Cierra con la salida corta; con teclado, al instante. Nada cierra mientras se guarda. */
  const salir = (instante = false) => {
    if (cerrando.current || vivo.current.pendiente || !montado.current) return;
    cerrando.current = true;
    limpiezaCierre.current = cerrarModal(velo.current, caja.current, () => vivo.current.onCerrar(), instante);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (cerrando.current || vivo.current.pendiente) return;
    const cerrar = await onEnviar();
    if (cerrar && montado.current) salir(entradaPorTeclado());
  };

  const alTeclear = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab" || !caja.current) return;
    const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.offsetParent !== null);
    if (!lista.length) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && activo === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && activo === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  return (
    <dialog
      ref={dialogo}
      className="dsx-modal"
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
      onKeyDown={alTeclear}
      // Esc: el navegador no la cierra solo; pasa por salir() para respetar el guardado y devolver el foco.
      onCancel={(e) => {
        e.preventDefault();
        salir(true);
      }}
      // Respaldo: si el navegador la cierra por su cuenta, se avisa al padre.
      onClose={() => {
        if (montado.current && !cerrando.current) {
          cerrando.current = true;
          vivo.current.onCerrar();
        }
      }}
    >
      <div
        ref={velo}
        className="dsx-modal__velo"
        aria-hidden="true"
        onClick={() => {
          if (vivo.current.pendiente) return;
          if (sucio) llamarAtencion(caja.current);
          else salir();
        }}
      />
      <form ref={caja} className="dsx-modal__caja" data-ancho={ancho ? "" : undefined} noValidate onSubmit={(e) => void enviar(e)}>
        <header className="dsx-modal__cab">
          <div>
            <h2 id={idTitulo}>{titulo}</h2>
            {descripcion ? (
              <p id={idDescripcion} className="dsx-sub">
                {descripcion}
              </p>
            ) : null}
          </div>
          <button type="button" className="dsx-ib" aria-label="Cerrar la ventana" onClick={() => salir()}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="dsx-modal__cuerpo">{children}</div>
        <footer className="dsx-modal__pie">
          <button type="button" className="dsx-btn" onClick={() => salir()}>
            {secundario}
          </button>
          <button type="submit" className="dsx-btn dsx-btn--pri" aria-busy={pendiente || undefined} disabled={pendiente}>
            {pendiente ? <span className="dsx-giro" aria-hidden="true" /> : null}
            {pendiente ? textoPendiente : principal}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
