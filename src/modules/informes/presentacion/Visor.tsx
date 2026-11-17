/* =============================================================================
   Presentación con Pilo · el visor.

   Diapositivas de 1920×1080 escaladas a 16:9 (Escalado, de la vista Carta), con
   miniaturas, flechas y teclado, modo presentar a pantalla completa, edición de
   textos en línea, regenerar con otro tono e imprimir/PDF. Las animaciones son de
   GSAP y cargan con este módulo (import dinámico en animar.ts); respetan
   «reducir movimiento».

   Teclas: ← → (o PgUp/PgDn, espacio) · Inicio/Fin · P presentar · E editar · Esc sale.
   ========================================================================== */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Escalado } from "../vista/Escalado";
import { PX_POR_MM } from "../vista/perfil";
import "../vista/vista.css";
import { animarEntrada } from "./animar";
import { ALTO, ANCHO, Lamina } from "./Laminas";
import {
  INFO_TONOS,
  nombreArchivoPresentacion,
  notasDe,
  ponerEn,
  reemplazarDiapositiva,
} from "./modelo";
import type { Presentacion, Ruta } from "./modelo";
import type { NoVerificado } from "./presentaciones";
import "./presentacion.css";

const ANCHO_MM = ANCHO / PX_POR_MM;
const ID_PAGINA = "pr-pagina";

export interface PropsVisor {
  presentacion: Presentacion;
  onCambiar: (p: Presentacion) => void;
  onCerrar: () => void;
  /** «Regenerar con otro tono»: abre el diálogo de la creación. */
  onRegenerar?: () => void;
  onGuardar?: () => void;
  guardando?: boolean;
  /** Texto de estado del guardado («Guardada», «Cambios sin guardar»…). */
  estadoGuardado?: string;
  puedeGuardar?: boolean;
  sinVerificar?: NoVerificado[];
  ajustes?: string[];
  pensamientoS?: number | null;
  indiceInicial?: number;
}

/** El tamaño de un elemento, siguiendo sus cambios. */
function useMedida(ref: React.RefObject<HTMLElement>) {
  const [m, setM] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setM({ w: el.clientWidth, h: el.clientHeight });
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [ref]);
  return m;
}

/** Montserrat para el lienzo (el portal no la trae): una sola vez. */
function usarMontserrat() {
  useEffect(() => {
    if (document.getElementById("pr-montserrat")) return;
    const l = document.createElement("link");
    l.id = "pr-montserrat";
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
}

export function Visor(p: PropsVisor) {
  const { presentacion, onCambiar } = p;
  const total = presentacion.diapositivas.length;
  const [i, setI] = useState(
    Math.min(Math.max(0, p.indiceInicial ?? 0), total - 1),
  );
  const [editando, setEditando] = useState(false);
  const [presentando, setPresentando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const lamina = useRef<HTMLDivElement>(null);
  const { w, h } = useMedida(lienzo);
  usarMontserrat();

  const d = presentacion.diapositivas[i];
  const ir = useCallback(
    (n: number) => setI(Math.min(Math.max(0, n), total - 1)),
    [total],
  );
  const mover = useCallback(
    (delta: number) => setI((a) => Math.min(Math.max(0, a + delta), total - 1)),
    [total],
  );

  // Pantalla completa para presentar.
  const presentar = useCallback(async () => {
    setEditando(false);
    setPresentando(true);
    try {
      await raiz.current?.requestFullscreen?.();
    } catch {
      /* sin pantalla completa: se presenta dentro de la ventana */
    }
  }, []);
  const salirDePresentar = useCallback(() => {
    setPresentando(false);
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const cambio = () => {
      if (!document.fullscreenElement) setPresentando(false);
    };
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);

  // Teclado (no cuando se escribe en un campo).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
        case "Enter":
          e.preventDefault();
          mover(1);
          break;
        case "ArrowLeft":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          mover(-1);
          break;
        case "Home":
          e.preventDefault();
          ir(0);
          break;
        case "End":
          e.preventDefault();
          ir(total - 1);
          break;
        case "p":
        case "P":
          e.preventDefault();
          if (presentando) salirDePresentar();
          else void presentar();
          break;
        case "e":
        case "E":
          if (!presentando) {
            e.preventDefault();
            setEditando((x) => !x);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (presentando) salirDePresentar();
          else if (editando) setEditando(false);
          else p.onCerrar();
          break;
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mover, ir, total, presentando, editando, presentar, salirDePresentar, p]);

  // Entrada animada al cambiar de diapositiva (GSAP, con import dinámico).
  useEffect(() => {
    if (editando) return;
    let parar = () => {};
    let vivo = true;
    void animarEntrada(lamina.current).then((f) => {
      if (vivo) parar = f;
      else f();
    });
    return () => {
      vivo = false;
      parar();
    };
  }, [i, editando, presentando]);

  // Foco y bloqueo del desplazamiento de la página de atrás.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    raiz.current?.focus();
    return () => {
      document.body.style.overflow = sobre;
      previo?.focus?.();
    };
  }, []);

  const editar = useCallback(
    (ruta: Ruta, valor: string) =>
      onCambiar(
        reemplazarDiapositiva(
          presentacion,
          i,
          ponerEn(presentacion.diapositivas[i], ruta, valor),
        ),
      ),
    [onCambiar, presentacion, i],
  );

  // Imprimir / PDF a 16:9: todas las diapositivas en su página, con @page del tamaño del lienzo.
  const imprimir = useCallback(() => setImprimiendo(true), []);
  useEffect(() => {
    if (!imprimiendo) return;
    const antes = document.title;
    document.title = nombreArchivoPresentacion(presentacion);
    const estilo = document.createElement("style");
    estilo.id = ID_PAGINA;
    estilo.textContent = `@page { size: ${ANCHO}px ${ALTO}px; margin: 0; }`;
    document.head.appendChild(estilo);
    document.body.classList.add("pr-imprimiendo");
    const limpiar = () => {
      document.body.classList.remove("pr-imprimiendo");
      document.getElementById(ID_PAGINA)?.remove();
      document.title = antes;
      window.removeEventListener("afterprint", limpiar);
      setImprimiendo(false);
    };
    window.addEventListener("afterprint", limpiar);
    // Un respiro para que carguen los fondos y se aplique el tamaño de página.
    const t = window.setTimeout(() => window.print(), 400);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", limpiar);
    };
  }, [imprimiendo, presentacion]);

  const margen = presentando ? 0 : 32;
  const zoom =
    w && h
      ? Math.max(0.05, Math.min((w - margen) / ANCHO, (h - margen) / ALTO))
      : 0.3;
  const miniaturas = useMemo(
    () => presentacion.diapositivas,
    [presentacion.diapositivas],
  );
  const info = INFO_TONOS[presentacion.tono];
  const notas = notasDe(d);

  const aviso =
    !presentando && (p.sinVerificar?.length || p.ajustes?.length) ? (
      <details className="pr-aviso">
        <summary>
          {p.sinVerificar?.length
            ? `Pilo dejó ${p.sinVerificar.length} dato(s) «[por completar]» porque no estaban en el informe`
            : "Pilo ajustó algunos textos para que cupieran"}
        </summary>
        <ul>
          {(p.sinVerificar ?? []).slice(0, 12).map((n, k) => (
            <li key={k}>
              Diapositiva {n.diapositiva} ·{" "}
              {n.motivo === "enlace" ? "enlace" : "cifra"} «{n.valor}» (
              {n.campo})
            </li>
          ))}
          {(p.ajustes ?? []).slice(0, 8).map((a, k) => (
            <li key={`a${k}`}>{a}</li>
          ))}
        </ul>
      </details>
    ) : null;

  const vista = (
    <div
      ref={raiz}
      className="pr-visor"
      data-presentando={presentando}
      role="dialog"
      aria-modal="true"
      aria-label={`Presentación: ${presentacion.titulo}`}
      tabIndex={-1}
    >
      {!presentando && (
        <div>
          <header className="pr-bar">
            <h2>
              {presentacion.titulo}
              <br />
              <span className="pr-bar__sub">
                Tono {info.nombre.toLowerCase()} · {total} diapositivas
                {p.pensamientoS
                  ? ` · Pilo pensó ${Math.round(p.pensamientoS)} s`
                  : ""}
                {p.estadoGuardado ? ` · ${p.estadoGuardado}` : ""}
              </span>
            </h2>
            <button
              type="button"
              className="pr-btn"
              aria-pressed={editando}
              onClick={() => setEditando((x) => !x)}
              title="Editar los textos en la diapositiva (E)"
            >
              Editar textos
            </button>
            {p.onRegenerar && (
              <button type="button" className="pr-btn" onClick={p.onRegenerar}>
                Regenerar con otro tono
              </button>
            )}
            {p.onGuardar && (
              <button
                type="button"
                className="pr-btn"
                onClick={p.onGuardar}
                disabled={p.guardando || p.puedeGuardar === false}
              >
                {p.guardando ? "Guardando…" : "Guardar"}
              </button>
            )}
            <button
              type="button"
              className="pr-btn"
              onClick={imprimir}
              title="Imprimir o guardar como PDF en 16:9"
            >
              PDF / Imprimir
            </button>
            <button
              type="button"
              className="pr-btn pr-btn--pri"
              onClick={() => void presentar()}
              title="Presentar a pantalla completa (P)"
            >
              Presentar
            </button>
            <button
              type="button"
              className="pr-btn"
              onClick={p.onCerrar}
              title="Cerrar (Esc)"
            >
              Cerrar
            </button>
          </header>
          {aviso}
        </div>
      )}
      <div
        className="pr-cuerpo"
        style={presentando ? { gridRow: 1 } : undefined}
      >
        <ol className="pr-lista" aria-label="Diapositivas">
          {miniaturas.map((m, k) => (
            <li key={k}>
              <button
                type="button"
                className="pr-mini"
                aria-current={k === i}
                aria-label={`Diapositiva ${k + 1} de ${total}: ${m.tipo}`}
                onClick={() => ir(k)}
              >
                <span className="pr-mini__n">{k + 1}</span>
                <Escalado anchoMm={ANCHO_MM} zoom={176 / ANCHO}>
                  <Lamina d={m} />
                </Escalado>
              </button>
            </li>
          ))}
        </ol>
        <div className="pr-escena">
          <div
            ref={lienzo}
            className="pr-lienzo"
            onClick={() => presentando && mover(1)}
          >
            <div className="pr-sombra" ref={lamina} key={`${i}-${editando}`}>
              <Escalado anchoMm={ANCHO_MM} zoom={zoom}>
                <Lamina d={d} editable={editando} onEditar={editar} />
              </Escalado>
            </div>
            <p
              className="pr-sr"
              role="status"
              aria-live="polite"
            >{`Diapositiva ${i + 1} de ${total}`}</p>
          </div>
          <div className="pr-pie">
            <button
              type="button"
              className="pr-btn"
              onClick={() => mover(-1)}
              disabled={i === 0}
              aria-label="Diapositiva anterior"
            >
              ←
            </button>
            <span>
              {i + 1} / {total}
            </span>
            <button
              type="button"
              className="pr-btn"
              onClick={() => mover(1)}
              disabled={i === total - 1}
              aria-label="Diapositiva siguiente"
            >
              →
            </button>
            <p className="pr-pie__notas">
              {notas ? (
                <>
                  <b>Notas:</b> {notas}
                </>
              ) : editando ? (
                "Haga clic en un texto para editarlo; Enter guarda y Esc descarta."
              ) : (
                "Sin notas para esta diapositiva."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {vista}
      {imprimiendo && (
        <div className="pr-print" aria-hidden="true">
          {presentacion.diapositivas.map((x, k) => (
            <Lamina d={x} key={k} />
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}

export default Visor;
