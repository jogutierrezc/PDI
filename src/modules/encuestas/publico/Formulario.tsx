/* =============================================================================
   Encuestas con Pilo · el renderizador de la estructura publicada.

   Dos modos: «guiado por Pilo» (una sección a la vez; al enfocar un campo, Pilo
   lo explica en un overlay junto a él, resalta el campo y, si una cifra parece
   absurda, pide confirmarla) y «formulario clásico» (todas las secciones juntas,
   con la explicación de Pilo como texto de ayuda bajo el campo). Lo que se ve lo
   decide la lógica «mostrar si»; lo que se valida, solo lo visible.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { cifraSospechosa, preguntasVisibles, validarRespuestas } from "../lib/estructura";
import type { Estructura, Pregunta, Valor, Valores } from "../lib/estructura";
import type { ConfigPilo } from "../lib/config";
import { kill, overlayAt } from "../motion";
import { Entrada } from "./Campos";
import { sinMovimiento } from "./habla";

interface OverlayEstado {
  id: string;
  /** «ayuda» = la explicación; «confirmar» = pide confirmar una cifra. */
  tipo: "ayuda" | "confirmar";
  texto: string;
}

function OverlayPilo({ ov, config, onConfirmar, onCorregir }: { ov: OverlayEstado; config: ConfigPilo; onConfirmar: () => void; onCorregir: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    overlayAt(ref.current, config.presentacion.entrada);
    return () => kill(ref.current);
  }, [ov.id, ov.tipo, config.presentacion.entrada]);
  return (
    <div ref={ref} id={`ov-${ov.id}`} className="ep-ov" data-tipo={ov.tipo} role={ov.tipo === "confirmar" ? "alert" : "note"}>
      <PiloFace size={44} expression={ov.tipo === "confirmar" ? "pensar" : config.presentacion.pose} label="" />
      <div className="ep-ov__t">
        <b>Mr. Pilo</b>
        <p>{ov.texto}</p>
        {ov.tipo === "confirmar" && (
          <div className="ep-ov__acc">
            <button type="button" className="ep-btn ep-btn--pri" onClick={onConfirmar}>
              Sí, es correcta
            </button>
            <button type="button" className="ep-btn" onClick={onCorregir}>
              Voy a corregirla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Formulario({
  estructura,
  config,
  modo,
  valores,
  onValores,
  enviando,
  errorEnvio,
  onEnviar,
  extra,
}: {
  estructura: Estructura;
  config: ConfigPilo;
  modo: "guiado" | "clasico";
  valores: Valores;
  onValores: (v: Valores) => void;
  enviando: boolean;
  errorEnvio: string | null;
  onEnviar: () => void;
  /** Lo que va antes del botón de enviar, en el último paso (verificación, consentimiento). */
  extra?: ReactNode;
}) {
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [foco, setFoco] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [confirmadas, setConfirmadas] = useState<Set<string>>(() => new Set());
  const raiz = useRef<HTMLFormElement>(null);

  const visibles = useMemo(() => preguntasVisibles(estructura, valores), [estructura, valores]);
  const idsVisibles = useMemo(() => new Set(visibles.map((p) => p.id)), [visibles]);
  const secciones = useMemo(() => estructura.secciones.map((s) => ({ ...s, preguntas: s.preguntas.filter((p) => idsVisibles.has(p.id)) })).filter((s) => s.preguntas.length > 0), [estructura, idsVisibles]);
  const guiado = modo === "guiado";
  const indice = Math.min(paso, Math.max(0, secciones.length - 1));
  const mostradas = guiado ? secciones.slice(indice, indice + 1) : secciones;
  const ultima = !guiado || indice >= secciones.length - 1;

  useEffect(() => {
    if (paso !== indice) setPaso(indice);
  }, [paso, indice]);
  useEffect(() => () => kill(raiz.current ? Array.from(raiz.current.querySelectorAll(".ep-ov")) : []), []);

  const enfocar = (id: string) => window.setTimeout(() => document.getElementById(`q-${id}`)?.focus(), 30);

  const poner = (p: Pregunta, v: Valor) => {
    onValores({ ...valores, [p.id]: v });
    if (errores[p.id]) setErrores((e) => ({ ...e, [p.id]: "" }));
    if (confirmando === p.id) setConfirmando(null);
    setConfirmadas((c) => {
      if (!c.has(p.id)) return c;
      const n = new Set(c);
      n.delete(p.id);
      return n;
    });
  };

  /** Valida lo que se ve ahora; devuelve true si se puede seguir. */
  const revisar = (preguntas: Pregunta[], ya: Set<string> = confirmadas): boolean => {
    const todos = validarRespuestas(estructura, valores);
    const e: Record<string, string> = {};
    for (const p of preguntas) if (todos[p.id]) e[p.id] = todos[p.id];
    setErrores(e);
    const primero = preguntas.find((p) => e[p.id]);
    if (primero) {
      enfocar(primero.id);
      return false;
    }
    for (const p of preguntas) {
      const duda = ya.has(p.id) ? null : cifraSospechosa(p, valores[p.id]);
      if (duda) {
        setConfirmando(p.id);
        setFoco(p.id);
        enfocar(p.id);
        return false;
      }
    }
    return true;
  };

  const avanzar = (ya?: Set<string>) => {
    const actuales = mostradas.flatMap((s) => s.preguntas);
    if (!revisar(actuales, ya)) return;
    if (!ultima) {
      setPaso(indice + 1);
      setFoco(null);
      window.setTimeout(() => raiz.current?.scrollIntoView?.({ block: "start", behavior: sinMovimiento() ? "auto" : "smooth" }), 0);
      return;
    }
    onEnviar();
  };

  const overlay = (p: Pregunta): OverlayEstado | null => {
    if (confirmando === p.id) return { id: p.id, tipo: "confirmar", texto: cifraSospechosa(p, valores[p.id]) ?? "" };
    if (guiado && foco === p.id && p.pilo?.explicacion.trim()) return { id: p.id, tipo: "ayuda", texto: p.pilo.explicacion.trim() };
    return null;
  };

  return (
    <form
      ref={raiz}
      className="ep-panel ep-formulario"
      data-modo={modo}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        avanzar();
      }}
    >
      {guiado && secciones.length > 1 && (
        <p className="ep-fino" aria-live="polite">
          Parte {indice + 1} de {secciones.length}
        </p>
      )}
      {mostradas.map((s) => (
        <section key={s.id} className="ep-seccion" aria-labelledby={`sec-${s.id}`}>
          <h2 id={`sec-${s.id}`}>{s.titulo}</h2>
          {s.descripcion && <p className="ep-lede">{s.descripcion}</p>}
          {s.preguntas.map((p) => {
            const ov = overlay(p);
            const ayudaClasica = !guiado && p.pilo?.explicacion.trim();
            const describe = [errores[p.id] ? `err-${p.id}` : "", ov ? `ov-${p.id}` : "", ayudaClasica ? `ay-${p.id}` : "", p.apoyo ? `ap-${p.id}` : ""].filter(Boolean).join(" ") || undefined;
            const grupo = p.tipo === "opcion_unica" || p.tipo === "opcion_multiple" || p.tipo === "escala";
            return (
              <div key={p.id} className="ep-q" data-foco={foco === p.id ? "1" : undefined} data-error={errores[p.id] ? "1" : undefined} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && foco === p.id && confirmando !== p.id && setFoco(null)}>
                {grupo || p.tipo === "bloque_logro_reto" ? (
                  <div id={`q-${p.id}-l`} className="ep-q__l">
                    {p.enunciado}
                    {!p.obligatoria && <span className="ep-opc"> (opcional)</span>}
                  </div>
                ) : (
                  <label className="ep-q__l" htmlFor={`q-${p.id}`}>
                    {p.enunciado}
                    {!p.obligatoria && <span className="ep-opc"> (opcional)</span>}
                  </label>
                )}
                {p.apoyo && (
                  <div id={`ap-${p.id}`} className="ep-fino">
                    {p.apoyo}
                  </div>
                )}
                <Entrada p={p} valor={valores[p.id]} error={errores[p.id]} describe={describe} decir={() => undefined} onCambio={(v) => poner(p, v)} onFoco={() => setFoco(p.id)} />
                <div id={`err-${p.id}`} className="ep-error" role="alert">
                  {errores[p.id]}
                </div>
                {ayudaClasica && (
                  <p id={`ay-${p.id}`} className="ep-ayuda">
                    {p.pilo?.explicacion}
                  </p>
                )}
                {ov && (
                  <OverlayPilo
                    ov={ov}
                    config={config}
                    onConfirmar={() => {
                      const n = new Set(confirmadas).add(p.id);
                      setConfirmadas(n);
                      setConfirmando(null);
                      avanzar(n);
                    }}
                    onCorregir={() => {
                      setConfirmando(null);
                      enfocar(p.id);
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}

      {ultima && extra}
      {errorEnvio && (
        <p className="ep-error ep-error--bloque" role="alert">
          {errorEnvio}
        </p>
      )}
      <div className="ep-acciones ep-nav">
        {guiado && indice > 0 && (
          <button
            type="button"
            className="ep-btn ep-btn--suave"
            onClick={() => {
              setPaso(indice - 1);
              setErrores({});
            }}
          >
            Atrás
          </button>
        )}
        <span className="ep-espacio" />
        <button type="submit" className="ep-btn ep-btn--pri" disabled={enviando}>
          {enviando ? "Enviando…" : ultima ? "Enviar" : "Siguiente"}
        </button>
      </div>
    </form>
  );
}
