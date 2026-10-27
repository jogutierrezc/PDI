/* =============================================================================
   UDrive · el marco de los editores de gráfica y de cruce, y su guardado
   automático («Guardado», «Guardando…», «No se guardó»).

   El editor de tablas usa el editor compartido; estos dos comparten la misma
   cabecera azul marino (volver, nombre, estado) y el mismo pie de guardado.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { crecerDesde } from "../motion";
import { IconoItem } from "./piezas";
import { useContextoDrive } from "./contexto";
import type { TipoItem } from "../tipos";

export type EstadoGuardado = "guardado" | "guardando" | "error";

/** Guarda `valor` 700 ms después del último cambio. `vaciar()` lo guarda ya (al salir). El primer valor no se guarda. */
export function useAutoguardado<T>(valor: T | null, activo: boolean, guardar: (v: T) => Promise<unknown>) {
  const [estado, setEstado] = useState<EstadoGuardado>("guardado");
  const base = useRef<T | null>(null);
  const pendiente = useRef<T | null>(null);
  const reloj = useRef<number | undefined>();
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;

  const correr = useCallback(async () => {
    window.clearTimeout(reloj.current);
    const v = pendiente.current;
    if (v === null) return true;
    pendiente.current = null;
    setEstado("guardando");
    try {
      await guardarRef.current(v);
      base.current = v;
      setEstado(pendiente.current === null ? "guardado" : "guardando");
      return true;
    } catch {
      pendiente.current = v;
      setEstado("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (valor === null) return;
    if (base.current === null) {
      base.current = valor;
      return;
    }
    if (!activo || valor === base.current) return;
    pendiente.current = valor;
    setEstado("guardando");
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => void correr(), 700);
  }, [valor, activo, correr]);

  useEffect(() => () => window.clearTimeout(reloj.current), []);
  return { estado, vaciar: correr };
}

export function MarcoEditor({
  tipo,
  etiqueta,
  nombre,
  chip,
  guardado,
  soloLectura,
  acciones,
  onVolver,
  children,
}: {
  tipo: Exclude<TipoItem, "archivo">;
  etiqueta: string;
  nombre: { valor: string; editable: boolean; renombrar: (n: string) => void };
  chip: ReactNode;
  guardado: EstadoGuardado;
  soloLectura?: string;
  acciones?: ReactNode;
  onVolver: () => void;
  children: ReactNode;
}) {
  const { volver } = useContextoDrive();
  const cuerpo = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState(nombre.valor);
  useEffect(() => setTexto(nombre.valor), [nombre.valor]);
  useEffect(() => {
    if (cuerpo.current) crecerDesde(cuerpo.current, null);
  }, []);
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".es-scrim")) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      onVolver();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onVolver]);
  return (
    <div className="es-editor" ref={cuerpo} role="dialog" aria-label={etiqueta}>
      <div className="es-eh" data-entra>
        <button type="button" className="es-back" onClick={onVolver}>
          <Icon name="arrow-left" size={16} />
          {volver}
        </button>
        <div className="es-ename">
          <IconoItem tipo={tipo} />
          <input
            value={texto}
            aria-label="Nombre del archivo"
            disabled={!nombre.editable}
            maxLength={160}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => (texto.trim() && texto.trim() !== nombre.valor ? nombre.renombrar(texto.trim()) : setTexto(nombre.valor))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
        {chip}
        <span className="es-st" role="status">
          <Icon name={guardado === "error" ? "alert" : "check"} size={13} />
          <span>{guardado === "guardando" ? "Guardando…" : guardado === "error" ? "No se guardó" : "Guardado"}</span>
        </span>
        <span className="es-grow" />
        {soloLectura ? (
          <span className="es-ro">
            <Icon name="eye" size={12} />
            {soloLectura}
          </span>
        ) : null}
        {acciones}
      </div>
      {children}
    </div>
  );
}
