/* Piezas pequeñas de la intranet de Pilo Publica. Estilos en publica.css (prefijo pp-). */

import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import type { Corrida } from "./api";
import { FaltaMigracion } from "../noticias";
import { motivoSinPilo } from "./contexto";
import type { EstadoPilo } from "./contexto";

/** Texto que guarda al salir del campo (no en cada tecla). */
export function Campo({
  etiqueta,
  valor,
  onGuardar,
  multilinea = false,
  filas = 5,
  placeholder,
  lang,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onGuardar: (v: string) => void;
  multilinea?: boolean;
  filas?: number;
  placeholder?: string;
  lang?: string;
  ayuda?: string;
}) {
  const [v, setV] = useState(valor);
  const id = useId();
  useEffect(() => setV(valor), [valor]);
  const guardar = () => {
    if (v !== valor) onGuardar(v);
  };
  return (
    <div className="pp-fld">
      <label htmlFor={id}>{etiqueta}</label>
      {multilinea ? (
        <textarea id={id} value={v} rows={filas} lang={lang} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={guardar} />
      ) : (
        <input id={id} value={v} lang={lang} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={guardar} />
      )}
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

export function Interruptor({ marcado, onCambio, etiqueta, deshabilitado }: { marcado: boolean; onCambio: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return <input type="checkbox" className="pp-tg" role="switch" checked={marcado} disabled={deshabilitado} aria-label={etiqueta} onChange={(e) => onCambio(e.target.checked)} />;
}

export function Tarjeta({ titulo, cuenta, acciones, children }: { titulo: string; cuenta?: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="pp-card">
      <header className="pp-card__h">
        <h3>{titulo}</h3>
        {cuenta && <span className="pp-cnt">{cuenta}</span>}
        {acciones && <span className="pp-card__a">{acciones}</span>}
      </header>
      {children}
    </section>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="pp-vacio">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorAviso({ error, onReintentar }: { error: unknown; onReintentar?: () => void }) {
  const falta = error instanceof FaltaMigracion;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className={`pp-aviso-caja ${falta ? "pp-aviso-caja--info" : "pp-aviso-caja--mal"}`} role="alert">
      <strong>{falta ? "Falta preparar la base de datos" : "No se pudo cargar"}</strong>
      <p>{falta ? `${msg} Pídele a quien administra la base que la aplique y vuelve a abrir esta pantalla.` : msg}</p>
      {onReintentar && !falta && (
        <button type="button" className="pp-btn pp-btn--sm" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** La barra de lo que Pilo está haciendo, con Detener, y el aviso si la función no está desplegada. */
export function BarraPilo({ corrida }: { corrida: Corrida }) {
  const { progreso: p, detener, limpiar } = corrida;
  if (p.noDesplegada) {
    return (
      <div className="pp-aviso-caja pp-aviso-caja--info" role="alert">
        <strong>La función pilo-publica aún no está desplegada</strong>
        <p>Pilo no puede trabajar todavía. Puedes armar el informe a mano; cuando la función esté lista, estos botones funcionarán sin cambiar nada más.</p>
        <button type="button" className="pp-btn pp-btn--sm" onClick={limpiar}>
          Entendido
        </button>
      </div>
    );
  }
  if (!p.corriendo && !p.error && !p.mensaje) return null;
  const pct = p.total > 0 ? Math.min(100, Math.round((p.hecho / p.total) * 100)) : 0;
  return (
    <div className={`pp-barra${p.error ? " pp-barra--mal" : ""}`} role={p.error ? "alert" : "status"} aria-live="polite">
      <div className="pp-barra__t">
        <strong>{p.etiqueta}</strong>
        <span>
          {p.corriendo
            ? p.total > 0
              ? `${p.hecho} de ${p.total}${p.fallos ? ` · ${p.fallos} con fallo` : ""}`
              : "Trabajando…"
            : (p.error ?? p.mensaje) + (p.fallos ? ` ${p.fallos} con fallo.` : "")}
        </span>
        {p.corriendo ? (
          <button type="button" className="pp-btn pp-btn--sm" onClick={detener}>
            Detener
          </button>
        ) : (
          <button type="button" className="pp-btn pp-btn--sm" onClick={limpiar}>
            Cerrar
          </button>
        )}
      </div>
      {p.corriendo && (
        <div className="pp-meter" aria-hidden="true">
          <i style={{ width: p.total > 0 ? `${pct}%` : "30%" }} className={p.total > 0 ? "" : "pp-meter--indef"} />
        </div>
      )}
    </div>
  );
}

/** Botón de una tarea de Pilo: si no se puede, dice por qué y no se pulsa. */
export function BotonPilo({ pilo, corrida, onClick, children, chico }: { pilo: EstadoPilo; corrida: Corrida; onClick: () => void; children: ReactNode; chico?: boolean }) {
  const motivo = motivoSinPilo(pilo, corrida);
  return (
    <button type="button" className={`pp-btn pp-btn--pilo${chico ? " pp-btn--sm" : ""}`} onClick={onClick} disabled={Boolean(motivo)} title={motivo ?? undefined} aria-describedby={undefined}>
      {children}
    </button>
  );
}
