/* =============================================================================
   Portales públicos · piezas pequeñas de la pantalla de administración.
   ========================================================================== */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { MIGRACION } from "./datos";

export type Tono = "ok" | "aviso" | "mal" | "info";
const ICONO = { ok: "check", aviso: "alert", mal: "close", info: "info" } as const;

/** Un aviso con glifo y frase: nunca solo color. */
export function Nota({ tono = "info", children, rol }: { tono?: Tono; children: ReactNode; rol?: "status" | "alert" | "note" }) {
  return (
    <div className="ppa-nota" data-tono={tono} role={rol ?? (tono === "mal" ? "alert" : "note")}>
      <Icon name={ICONO[tono]} size={17} />
      <div>{children}</div>
    </div>
  );
}

export function Cargando({ que }: { que: string }) {
  return (
    <p className="ppa-espera" role="status">
      {que}
    </p>
  );
}

export function Fallo({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="ppa-nota" data-tono="mal" role="alert">
      <Icon name="alert" size={17} />
      <div>
        <strong>No se pudo leer.</strong> {error instanceof Error ? error.message : "Intente de nuevo en un momento."}
      </div>
      <button type="button" className="button-secondary" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** La base todavía no tiene las tablas de este módulo. El sitio público sigue como siempre (falla abierta). */
export function FaltaMigracion() {
  return (
    <Nota tono="aviso">
      <strong>Falta la migración {MIGRACION}.</strong> Sin ella no hay dónde guardar qué portales están abiertos ni los cambios del menú. Mientras tanto el sitio público funciona como siempre: nada se oculta y nada se bloquea. Aplíquela en
      la base de datos (archivo <code>supabase/migrations/0263_portales_publicos.sql</code>) y vuelva a esta pantalla.
    </Nota>
  );
}

/** Una confirmación con <dialog> nativo: atrapa el foco, Escape cancela y el foco vuelve a quien la abrió. */
export function Confirmar({
  abierto,
  titulo,
  children,
  textoConfirmar,
  peligro,
  trabajando,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  peligro?: boolean;
  trabajando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className="ppa-dialogo"
      aria-labelledby="ppa-dialogo-titulo"
      onCancel={(e) => {
        e.preventDefault();
        onCancelar();
      }}
      onClick={(e) => {
        // Un clic en el fondo (fuera de la caja) cancela.
        if (e.target === ref.current) onCancelar();
      }}
    >
      {abierto && (
        <div className="ppa-dialogo__caja">
          <h2 id="ppa-dialogo-titulo">{titulo}</h2>
          <div className="ppa-dialogo__cuerpo">{children}</div>
          <div className="ppa-dialogo__acciones">
            <button type="button" className="button-secondary" onClick={onCancelar} autoFocus>
              Cancelar
            </button>
            <button type="button" className={peligro ? "button-danger" : "button-primary"} disabled={trabajando} onClick={onConfirmar}>
              {trabajando ? "Guardando…" : textoConfirmar}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
