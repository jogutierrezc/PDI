/* Piezas pequeñas compartidas por las pantallas de Informes Institucionales. */

import type { ReactNode } from "react";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "../estados";
import { ETIQUETA_SEMAFORO } from "../cifras-vivas";
import type { Semaforo } from "../cifras-vivas";
import type { Control, EstadoInstancia } from "../types";

const GLIFO: Record<EstadoInstancia | "none", string> = { none: "○", draft: "◐", sent: "◉", back: "↺", ok: "●" };

/** Estado de un informe; sin instancia, «Sin iniciar». Glifo además del color. */
export function EstadoPill({ estado }: { estado: EstadoInstancia | null }) {
  const k = estado ?? "none";
  const tono = TONO_ESTADO[k];
  return (
    <span className={`inf-pill${tono ? ` is-${tono}` : ""}`}>
      <span aria-hidden="true">{GLIFO[k]}</span> {estado ? ETIQUETA_ESTADO[estado] : "Sin iniciar"}
    </span>
  );
}

export function SemaforoPill({ s }: { s: Semaforo | null }) {
  if (!s) return null;
  return (
    <span className={`inf-sem is-${s}`}>
      <i aria-hidden="true" />
      {ETIQUETA_SEMAFORO[s]}
    </span>
  );
}

export function Barra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <div className="inf-bar" role="img" aria-label={`${etiqueta}: ${Math.round(v * 100)} %`}>
      <i style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

export function Aviso({ error }: { error: Error }) {
  return (
    <div className="inf-aviso" role="alert">
      <b>{error.message || "No se pudo leer el informe."}</b>
      <p>Mientras tanto, esta pantalla no guarda nada. Cuando se aplique, recargue la página.</p>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="inf-muted" role="status">
      {texto}
    </p>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="inf-vacio">{children}</p>;
}

export function ProximaFase({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="inf-pronto" aria-labelledby="inf-pronto">
      <span className="inf-eyebrow">Próxima fase</span>
      <h2 id="inf-pronto">{titulo}</h2>
      <p>{children}</p>
    </section>
  );
}

export function Controles({ items }: { items: Control[] }) {
  return (
    <ul className="inf-ctl">
      {items.map((c, i) => (
        <li key={i}>
          <span className={`inf-ico${c.nivel === "warn" ? " is-warn" : ""}`} aria-hidden="true">
            {c.nivel === "warn" ? "!" : "✓"}
          </span>
          <span>
            <span className="inf-sr">{c.nivel === "warn" ? "Revisar: " : "Bien: "}</span>
            {c.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Tag({ auto, children }: { auto?: boolean; children?: ReactNode }) {
  return <span className={`inf-tag ${auto ? "is-auto" : "is-apo"}`}>{children ?? (auto ? "Automático" : "Aporte")}</span>;
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar.");
