/* Internacionalización · piezas compartidas por las secciones. */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useHoja } from "./movimiento";
import { ETIQUETA_ESTADO } from "../lib/permisos";
import type { Campus, IntEstado, IntPeriodoRow, Yo } from "../tipos";
import { GLIFO } from "./logica";
import type { SeccionId } from "./logica";

/** Lo que todas las secciones necesitan saber de quien mira y del periodo elegido. */
export interface Ctx {
  yo: Yo;
  /** Director del módulo (la administración llega como Director por int_yo). */
  director: boolean;
  /** Administración de la intranet (puede nombrar Directores). */
  admin: boolean;
  /** Todos los campus de public.campuses. */
  campus: Campus[];
  /** Los que esta persona ve: todos (Director) o los suyos. */
  visibles: Campus[];
  periodo: IntPeriodoRow | null;
  periodos: IntPeriodoRow[];
  /** Dirección de una sección con el periodo elegido y lo que se pida. */
  enlace: (seccion: SeccionId, extra?: Record<string, string | null | undefined>) => string;
}

export const nombreCampus = (campus: readonly Campus[], id: string | null | undefined) =>
  id ? (campus.find((c) => c.id === id)?.name ?? "Campus") : "Todos los campus";

export function EstadoPill({ estado, corto = false }: { estado: IntEstado; corto?: boolean }) {
  return (
    <span className={`it-estado is-${estado}`}>
      <span aria-hidden="true">{GLIFO[estado]}</span>
      {corto ? <span className="sr-only">{ETIQUETA_ESTADO[estado]}</span> : ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/** Aviso cuando la 0151 no está aplicada: la pantalla no guarda nada. */
export function AvisoMigracion({ error }: { error: Error }) {
  return (
    <div className="it-aviso is-risk" role="alert">
      <Icon name="alert" size={18} aria-hidden="true" />
      <div>
        <b>{error.message || "Falta aplicar la migración 0151 (Internacionalización)."}</b>
        <p>Mientras tanto el módulo no lee ni guarda nada. Aplique la migración en Supabase y recargue la página.</p>
      </div>
    </div>
  );
}

export function ErrorCaja({ error, accion }: { error: Error; accion?: ReactNode }) {
  return (
    <div className="it-aviso is-risk" role="alert">
      <Icon name="alert" size={18} aria-hidden="true" />
      <div>
        <b>No se pudo leer esta parte.</b>
        <p>{error.message}</p>
        {accion}
      </div>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="it-cargando" role="status">
      <span className="it-spin" aria-hidden="true" /> {texto}
    </p>
  );
}

/** Estado vacío con su ayuda: qué falta y quién lo hace. */
export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="it-vacio">
      <b>{titulo}</b>
      {children && <p>{children}</p>}
      {accion}
    </div>
  );
}

/** Barra apilada por estado (borrador · enviado · validado · aprobado), con su lectura para lectores de pantalla. */
export function BarraEstados({ c, etiqueta }: { c: Record<IntEstado, number> & { total: number }; etiqueta: string }) {
  const orden: IntEstado[] = ["aprobado", "validado", "enviado", "borrador"];
  const texto = orden.map((e) => `${c[e]} ${ETIQUETA_ESTADO[e].toLowerCase()}`).join(", ");
  return (
    <div className="it-barra" role="img" aria-label={`${etiqueta}: ${texto}`}>
      {c.total > 0 &&
        orden.map((e) => (c[e] ? <i key={e} className={`is-${e}`} data-crece style={{ width: `${(c[e] / c.total) * 100}%` }} /> : null))}
    </div>
  );
}

export function LeyendaEstados() {
  return (
    <ul className="it-leyenda" aria-label="Estados">
      {(["aprobado", "validado", "enviado", "borrador"] as IntEstado[]).map((e) => (
        <li key={e}>
          <i className={`is-${e}`} aria-hidden="true" /> {GLIFO[e]} {ETIQUETA_ESTADO[e]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Confirmación en el sitio (nunca un modal): la pregunta nombra la
 * consecuencia; «Cancelar» recibe el foco y Escape cancela.
 */
export function Confirmar({
  pregunta,
  detalle,
  si,
  onSi,
  onNo,
  ocupado = false,
}: {
  pregunta: string;
  detalle?: string;
  si: string;
  onSi: () => void;
  onNo: () => void;
  ocupado?: boolean;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelar.current?.focus(), []);
  return (
    <div
      className="it-confirmar"
      role="alertdialog"
      aria-label={pregunta}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onNo();
        }
      }}
    >
      <b>
        <Icon name="alert" size={15} aria-hidden="true" /> {pregunta}
      </b>
      {detalle && <p>{detalle}</p>}
      <div className="it-fila">
        <button ref={cancelar} type="button" className="button-secondary it-btn" onClick={onNo}>
          Cancelar
        </button>
        <button type="button" className="it-btn it-btn--riesgo" onClick={onSi} disabled={ocupado}>
          {ocupado ? "Un momento…" : si}
        </button>
      </div>
    </div>
  );
}

/** Mensaje breve tras una acción (región viva): se borra solo a los 6 s. */
export function useAviso() {
  const [aviso, setAviso] = useState<{ texto: string; tono: "ok" | "risk" } | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);
  const nodo = (
    <p className={`it-nota${aviso ? ` is-${aviso.tono}` : ""}`} role="status" aria-live="polite">
      {aviso && (
        <>
          <span aria-hidden="true">{aviso.tono === "ok" ? "✓" : "✕"}</span> {aviso.texto}
        </>
      )}
    </p>
  );
  return { ok: (texto: string) => setAviso({ texto, tono: "ok" }), mal: (e: unknown) => setAviso({ texto: e instanceof Error ? e.message : String(e), tono: "risk" }), nodo };
}

/**
 * Panel lateral (cajón derecho) para «Nueva tabla», la carga de Excel y las
 * plantillas. Entra desde su lado en 280 ms y sale en 160 ms (useHoja), con
 * velo; Escape cierra y el foco vuelve a quien lo abrió.
 */
export function Cajon({
  titulo,
  onCerrar,
  children,
  pie,
  ancho = "normal",
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: "normal" | "ancho";
}) {
  const ref = useRef<HTMLElement>(null);
  const velo = useRef<HTMLButtonElement>(null);
  const { cerrar } = useHoja(ref, true, { lado: "derecha", alCerrar: onCerrar, velo });
  return (
    <>
      <button ref={velo} type="button" className="it-velo" aria-label="Cerrar el panel" tabIndex={-1} onClick={() => cerrar()} />
      <aside
        ref={ref}
        className={`it-cajon${ancho === "ancho" ? " is-ancho" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="it-cajon-titulo"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            cerrar({ animar: false });
          }
        }}
      >
        <header className="it-cajon__cabeza">
          <h2 id="it-cajon-titulo">{titulo}</h2>
          <button type="button" className="button-ghost it-btn" onClick={() => cerrar()}>
            Cerrar
          </button>
        </header>
        <div className="it-cajon__cuerpo">{children}</div>
        {pie && <footer className="it-cajon__pie">{pie}</footer>}
      </aside>
    </>
  );
}

/** Descarga un texto como archivo (CSV). */
export function descargar(nombre: string, texto: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmt = (n: number) => n.toLocaleString("es-CO");
