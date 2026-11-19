/* =============================================================================
   Planeación y Seguimiento · FormularioPasos (asistente por pasos, pantalla completa).

   Lo reutilizan «Crear plan» y «Cargar la planificación» ahora, y las fases 2 a 4
   (actividades, reporte de avance, solicitudes de cambio) después. Ver README.md.

   Qué da:
     · progreso visible (paso N de M, cada paso con glifo y texto: hecho, actual, pendiente);
     · validación en línea: cada campo muestra su error al salir de él (`Campo`);
     · al intentar avanzar con errores, un RESUMEN que enlaza a cada campo y lleva el foco ahí;
     · borrador local en el equipo (`useBorradorLocal`): «Guardado hace un momento»;
     · último paso de revisión y botón de envío (la confirmación es la propia página, no un diálogo);
     · pie de acciones fijo en móvil; foco al título del paso; movimiento de paso solo con ratón.
   ========================================================================== */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { cambiarPaso } from "../movimiento";
import { PaginaCompleta, type Miga } from "./PaginaCompleta";

export interface ErrorCampo {
  /** El id del campo (el mismo que se le dio a `<Campo id>`). */
  campo: string;
  mensaje: string;
}

export interface Paso {
  id: string;
  titulo: string;
  /** Una línea que explica el paso. */
  descripcion?: string;
  contenido: ReactNode;
  /** Valida el paso al intentar avanzar; devuelve los errores (vacío = pasa). */
  validar?: () => ErrorCampo[];
  /** Texto del botón «Siguiente» de este paso, si no es el habitual. */
  etiquetaSiguiente?: string;
  /** El paso no deja avanzar todavía (por ejemplo, aún no hay archivo); no es un error. */
  bloqueado?: boolean;
}

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  migas: Miga[];
  regresarA: string;
  pasos: Paso[];
  /** Id del paso actual (controlado por quien lo usa, por ejemplo desde la dirección). */
  paso: string;
  onPaso: (id: string) => void;
  /** Texto del botón del último paso, y qué hace. */
  etiquetaEnviar: string;
  onEnviar: () => void | Promise<void>;
  enviando?: boolean;
  /** Error del envío (se muestra arriba, con el foco). */
  errorEnvio?: string | null;
  /** Cuándo se guardó el borrador local (para «Guardado hace un momento»). */
  guardado?: number | null;
  /** Acciones extra del pie (a la izquierda). */
  accionesPie?: ReactNode;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** «Guardado hace un momento», «hace 3 min», «a las 14:05». Se actualiza solo. */
export function EstadoGuardado({ guardado }: { guardado: number | null | undefined }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  if (!guardado) return <span className="ps-guardado">El borrador se guarda solo en este equipo.</span>;
  const seg = Math.max(0, Math.round((ahora - guardado) / 1000));
  const d = new Date(guardado);
  const txt = seg < 45 ? "hace un momento" : seg < 3600 ? `hace ${Math.round(seg / 60)} min` : `a las ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  return (
    <span className="ps-guardado" role="status" aria-live="polite">
      <Icon name="check" size={13} /> Guardado {txt} en este equipo
    </span>
  );
}

/**
 * Borrador local: guarda `valor` en localStorage (con espera de 600 ms) y lo devuelve al abrir.
 * No guarda archivos ni nada sensible: solo lo que la persona escribe. `descartar()` lo borra al enviar.
 */
export function useBorradorLocal<T>(clave: string, valor: T, alRestaurar: (v: T) => void, activo = true) {
  const [guardado, setGuardado] = useState<number | null>(null);
  const primera = useRef(true);
  const restaurado = useRef(false);
  const llave = `ps:borrador:${clave}`;
  useLayoutEffect(() => {
    if (restaurado.current) return;
    restaurado.current = true;
    try {
      const crudo = localStorage.getItem(llave);
      if (crudo) {
        const { v, t } = JSON.parse(crudo) as { v: T; t: number };
        alRestaurar(v);
        setGuardado(t);
      }
    } catch {
      /* sin almacenamiento o dato dañado: se empieza en blanco */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);
  useEffect(() => {
    if (!activo) return;
    if (primera.current) {
      primera.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const t = Date.now();
      try {
        localStorage.setItem(llave, JSON.stringify({ v: valor, t }));
        setGuardado(t);
      } catch {
        /* sin almacenamiento */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [valor, activo, llave]);
  const descartar = useCallback(() => {
    try {
      localStorage.removeItem(llave);
    } catch {
      /* nada */
    }
    setGuardado(null);
  }, [llave]);
  return { guardado, descartar };
}

/** Un campo con etiqueta, ayuda y error en línea, enlazados con ARIA. El `id` es el que usa el resumen de errores. */
export function Campo({ id, etiqueta, ayuda, error, obligatorio, children }: { id: string; etiqueta: string; ayuda?: string; error?: string | null; obligatorio?: boolean; children: (p: { id: string; "aria-describedby": string | undefined; "aria-invalid": boolean; "aria-required": boolean }) => ReactNode }) {
  const ayudaId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  const descripcion = [ayuda ? ayudaId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ps-campo" data-error={error ? "true" : undefined}>
      <label htmlFor={id}>
        {etiqueta}
        {obligatorio ? <span className="ps-oblig"> (obligatorio)</span> : null}
      </label>
      {ayuda ? (
        <p className="ps-campo__ayuda" id={ayudaId}>
          {ayuda}
        </p>
      ) : null}
      {children({ id, "aria-describedby": descripcion, "aria-invalid": Boolean(error), "aria-required": Boolean(obligatorio) })}
      {error ? (
        <p className="ps-campo__error" id={errorId}>
          <Icon name="alert" size={14} /> {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormularioPasos({ titulo, subtitulo, migas, regresarA, pasos, paso, onPaso, etiquetaEnviar, onEnviar, enviando, errorEnvio, guardado, accionesPie }: Props) {
  const idx = Math.max(0, pasos.findIndex((p) => p.id === paso));
  const actual = pasos[idx];
  const esUltimo = idx === pasos.length - 1;
  const [errores, setErrores] = useState<ErrorCampo[]>([]);
  const resumen = useRef<HTMLDivElement>(null);
  const encabezadoPaso = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const direccion = useRef<1 | -1>(1);
  const teclado = useRef(false);
  const tituloId = useId();

  useEffect(() => {
    setErrores([]);
    encabezadoPaso.current?.focus({ preventScroll: true });
    cambiarPaso(panel.current, direccion.current, teclado.current);
    teclado.current = false;
  }, [actual.id]);
  useEffect(() => {
    if (errores.length) resumen.current?.focus();
  }, [errores]);

  const validarYAvanzar = () => {
    const errs = actual.validar?.() ?? [];
    if (errs.length) {
      setErrores(errs);
      return false;
    }
    setErrores([]);
    return true;
  };
  const siguiente = (e?: { detail?: number }) => {
    teclado.current = e?.detail === 0;
    if (!validarYAvanzar()) return;
    direccion.current = 1;
    if (esUltimo) void onEnviar();
    else onPaso(pasos[idx + 1].id);
  };
  const anterior = (e?: { detail?: number }) => {
    teclado.current = e?.detail === 0;
    direccion.current = -1;
    onPaso(pasos[idx - 1].id);
  };
  const irAlCampo = (id: string) => (ev: React.MouseEvent) => {
    ev.preventDefault();
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center" });
    (el as HTMLElement | null)?.focus();
  };

  return (
    <PaginaCompleta
      titulo={titulo}
      subtitulo={subtitulo}
      migas={migas}
      regresarA={regresarA}
      claveFoco="formulario"
      ancho="angosto"
      pie={
        <>
          <div className="ps-pie__izq">{accionesPie}<EstadoGuardado guardado={guardado} /></div>
          <div className="ps-pie__der">
            {idx > 0 ? (
              <button type="button" className="button-secondary" onClick={anterior} disabled={enviando}>
                Atrás
              </button>
            ) : null}
            <button type="button" className="button-primary" onClick={siguiente} disabled={enviando || actual.bloqueado} aria-busy={enviando || undefined}>
              {enviando ? "Un momento…" : esUltimo ? etiquetaEnviar : (actual.etiquetaSiguiente ?? "Siguiente")}
            </button>
          </div>
        </>
      }
    >
      <ol className="ps-progreso" aria-label={`Paso ${idx + 1} de ${pasos.length}`}>
        {pasos.map((p, i) => {
          const estado = i < idx ? "hecho" : i === idx ? "actual" : "pendiente";
          return (
            <li key={p.id} data-estado={estado} aria-current={estado === "actual" ? "step" : undefined}>
              <span className="ps-progreso__marca" aria-hidden="true">
                {estado === "hecho" ? <Icon name="check" size={13} /> : i + 1}
              </span>
              <span className="ps-progreso__texto">
                {p.titulo}
                <span className="sr-only"> ({estado === "hecho" ? "hecho" : estado === "actual" ? "paso actual" : "pendiente"})</span>
              </span>
            </li>
          );
        })}
      </ol>

      {errorEnvio ? (
        <div className="ps-aviso ps-aviso--error" role="alert">
          <Icon name="alert" size={16} /> <span>{errorEnvio}</span>
        </div>
      ) : null}
      {errores.length ? (
        <div className="ps-resumen-errores" ref={resumen} tabIndex={-1} role="alert" aria-labelledby={`${tituloId}-err`}>
          <strong id={`${tituloId}-err`}>
            {errores.length === 1 ? "Hay 1 cosa por corregir antes de seguir" : `Hay ${errores.length} cosas por corregir antes de seguir`}
          </strong>
          <ul>
            {errores.map((e) => (
              <li key={e.campo}>
                <a href={`#${e.campo}`} onClick={irAlCampo(e.campo)}>
                  {e.mensaje}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="ps-paso" ref={panel} aria-labelledby={`${tituloId}-paso`}>
        <h2 id={`${tituloId}-paso`} ref={encabezadoPaso} tabIndex={-1}>
          {actual.titulo}
        </h2>
        {actual.descripcion ? <p className="ps-sub">{actual.descripcion}</p> : null}
        {actual.contenido}
      </section>
    </PaginaCompleta>
  );
}
