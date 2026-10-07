/* =============================================================================
   Correos · piezas pequeñas que comparten las tres vistas.
   ========================================================================== */

import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { MIGRACION } from "./datos";

/** Un selector de pocas opciones excluyentes: identidad, rol, computador o celular. */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <span className="cor-seg" role="group" aria-label={label}>
      {options.map(([id, texto]) => (
        <button key={id} type="button" aria-pressed={id === value} onClick={() => onChange(id)}>
          {texto}
        </button>
      ))}
    </span>
  );
}

export type Tono = "ok" | "aviso" | "mal" | "espera";
export interface Aviso {
  tono: Tono;
  texto: string;
}

const ICONO = { ok: "check", aviso: "alert", mal: "close", espera: "clock" } as const;

/** Lo que respondió la última acción. Nunca solo con color: lleva su glifo y su frase. */
export function Estado({ aviso }: { aviso: Aviso | null }) {
  return (
    <p className="cor-estado" data-tono={aviso?.tono} role="status" aria-live="polite">
      {aviso && (
        <>
          <Icon name={ICONO[aviso.tono]} size={15} />
          <span>{aviso.texto}</span>
        </>
      )}
    </p>
  );
}

export function Cargando({ que }: { que: string }) {
  return (
    <p className="cor-nota cor-nota--espera" role="status">
      {que}
    </p>
  );
}

export function Fallo({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="cor-nota cor-nota--mal" role="alert">
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

/** La base todavía no tiene las tablas de este módulo. */
export function FaltaMigracion({ children }: { children?: ReactNode }) {
  return (
    <div className="cor-nota cor-nota--aviso" role="note">
      <Icon name="alert" size={17} />
      <div>
        <strong>Falta la migración {MIGRACION}.</strong> {children ?? "Sin ella no hay dónde guardar las plantillas, la conexión ni la bitácora."} Aplíquela en la base de datos (archivo{" "}
        <code>supabase/migrations/0137_correos.sql</code>) y vuelva a esta pantalla.
      </div>
    </div>
  );
}
