/* =============================================================================
   Encuestas con Pilo · columna «Estructura» del editor.

   Secciones y preguntas. Se reordena de tres maneras: arrastrando el asa (con el
   puntero, con FLIP al soltar), con Alt + flecha arriba o abajo sobre el asa y con
   los botones de subir y bajar. Con el teclado no se anima: se usa cientos de
   veces y el anuncio por voz (aria-live) dice dónde quedó.
   ========================================================================== */

import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { TIPOS_PREGUNTA } from "../lib/estructura";
import type { Estructura as Est, TipoPregunta } from "../lib/estructura";
import { flip, medir } from "../motion";

export const GLIFO: Record<TipoPregunta, string> = {
  texto_corto: "Aa",
  parrafo: "¶",
  opcion_unica: "◉",
  opcion_multiple: "☑",
  lista: "▾",
  escala: "1–5",
  cifra: "123",
  fecha: "📅",
  contacto: "@",
  archivo: "⎘",
  bloque_logro_reto: "★",
};

const Asa = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
);

const Flecha = ({ abajo }: { abajo?: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={abajo ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} />
  </svg>
);

export function EstructuraCol({
  estructura,
  seleccion,
  puedeEditar,
  onSeleccionar,
  onNombreSeccion,
  onMover,
  onArrastrar,
  onAgregar,
  onAgregarSeccion,
  onQuitarSeccion,
  onMoverSeccion,
}: {
  estructura: Est;
  seleccion: string | null;
  puedeEditar: boolean;
  onSeleccionar: (id: string) => void;
  onNombreSeccion: (id: string, nombre: string) => void;
  onMover: (id: string, delta: -1 | 1) => void;
  /** `hacia` null = al final de la sección. */
  onArrastrar: (id: string, hacia: string | null, seccionId: string) => void;
  onAgregar: (seccionId: string, tipo: TipoPregunta) => void;
  onAgregarSeccion: () => void;
  onQuitarSeccion: (id: string) => void;
  onMoverSeccion: (id: string, delta: -1 | 1) => void;
}) {
  const raiz = useRef<HTMLElement>(null);
  const antes = useRef<Map<string, DOMRect> | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [destino, setDestino] = useState<{ id: string | null; seccion: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  // FLIP: tras soltar un arrastre con el puntero, cada fila viaja de donde estaba a donde quedó.
  useLayoutEffect(() => {
    if (!antes.current || !raiz.current) return;
    flip(Array.from(raiz.current.querySelectorAll<HTMLElement>("[data-flip]")), antes.current);
    antes.current = null;
  });

  const filas = () => (raiz.current ? Array.from(raiz.current.querySelectorAll<HTMLElement>("[data-flip]")) : []);
  const todas = estructura.secciones.flatMap((s) => s.preguntas.map((p) => ({ p, s })));
  const etiqueta = (id: string) => todas.find((x) => x.p.id === id)?.p.enunciado ?? id;

  const alPulsarAsa = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (!puedeEditar || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastrando(id);
  };
  const alMover = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrastrando) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-qi], [data-sec]");
    if (!el) return setDestino(null);
    if (el.dataset.qi) setDestino({ id: el.dataset.qi, seccion: el.dataset.seccion ?? "" });
    else if (el.dataset.sec) setDestino({ id: null, seccion: el.dataset.sec });
  };
  const alSoltar = () => {
    if (arrastrando && destino && destino.id !== arrastrando) {
      antes.current = medir(filas());
      onArrastrar(arrastrando, destino.id, destino.seccion);
      setAnuncio(`«${etiqueta(arrastrando)}» movida.`);
    }
    setArrastrando(null);
    setDestino(null);
  };

  const alTeclearAsa = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!puedeEditar || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const d = e.key === "ArrowUp" ? -1 : 1;
    onMover(id, d);
    setAnuncio(`«${etiqueta(id)}» ${d === -1 ? "subió" : "bajó"} una posición.`);
    // El foco se queda en el asa de la misma pregunta aunque cambie de lugar.
    window.setTimeout(() => raiz.current?.querySelector<HTMLElement>(`[data-asa="${id}"]`)?.focus(), 0);
  };

  return (
    <nav ref={raiz} className="ed-col ed-estructura" aria-label="Estructura de la encuesta">
      <div className="ed-col__cab">
        <h2>Estructura</h2>
        <span className="ed-chip">{todas.length} preguntas</span>
      </div>
      <p className="ed-sr" role="status" aria-live="polite">
        {anuncio}
      </p>

      {estructura.secciones.map((s, si) => (
        <section key={s.id} className="ed-sec" data-sec={s.id} aria-label={`Sección ${s.titulo}`} data-sobre={arrastrando && destino?.id === null && destino.seccion === s.id ? "1" : undefined}>
          <div className="ed-sec__cab">
            <label className="ed-sr" htmlFor={`sn-${s.id}`}>
              Nombre de la sección
            </label>
            <input id={`sn-${s.id}`} className="ed-sec__n" value={s.titulo} maxLength={120} readOnly={!puedeEditar} onChange={(e) => onNombreSeccion(s.id, e.target.value)} />
            {puedeEditar && (
              <span className="ed-sec__acc">
                <button type="button" className="ed-ibtn" aria-label={`Subir la sección ${s.titulo}`} disabled={si === 0} onClick={() => onMoverSeccion(s.id, -1)}>
                  <Flecha />
                </button>
                <button type="button" className="ed-ibtn" aria-label={`Bajar la sección ${s.titulo}`} disabled={si === estructura.secciones.length - 1} onClick={() => onMoverSeccion(s.id, 1)}>
                  <Flecha abajo />
                </button>
                <button type="button" className="ed-ibtn ed-ibtn--peligro" aria-label={`Quitar la sección ${s.titulo}`} disabled={estructura.secciones.length < 2} onClick={() => onQuitarSeccion(s.id)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            )}
          </div>

          {s.preguntas.map((p, qi) => {
            const primera = si === 0 && qi === 0;
            const ultima = si === estructura.secciones.length - 1 && qi === s.preguntas.length - 1;
            return (
              <div
                key={p.id}
                className="ed-qi"
                data-qi={p.id}
                data-seccion={s.id}
                data-flip={p.id}
                data-on={seleccion === p.id ? "1" : undefined}
                data-drag={arrastrando === p.id ? "1" : undefined}
                data-sobre={arrastrando && destino?.id === p.id && arrastrando !== p.id ? "1" : undefined}
              >
                {puedeEditar && (
                  <button
                    type="button"
                    className="ed-asa"
                    data-asa={p.id}
                    aria-label={`Mover «${p.enunciado}»: arrastre, o use Alt con flecha arriba o abajo`}
                    onPointerDown={(e) => alPulsarAsa(e, p.id)}
                    onPointerMove={alMover}
                    onPointerUp={alSoltar}
                    onPointerCancel={() => {
                      setArrastrando(null);
                      setDestino(null);
                    }}
                    onKeyDown={(e) => alTeclearAsa(e, p.id)}
                  >
                    <Asa />
                  </button>
                )}
                <button type="button" className="ed-qsel" aria-current={seleccion === p.id ? "true" : undefined} onClick={() => onSeleccionar(p.id)}>
                  <span className="ed-gl" aria-hidden="true">
                    {GLIFO[p.tipo]}
                  </span>
                  <span className="ed-qsel__t">
                    <b>{p.enunciado || "Sin enunciado"}</b>
                    <small>
                      {TIPOS_PREGUNTA.find((t) => t.id === p.tipo)?.texto}
                      {p.obligatoria ? " · obligatoria" : ""}
                      {p.mostrarSi ? " · condicional" : ""}
                    </small>
                  </span>
                </button>
                {puedeEditar && (
                  <span className="ed-mv">
                    <button type="button" className="ed-ibtn" aria-label={`Subir «${p.enunciado}»`} disabled={primera} onClick={() => onMover(p.id, -1)}>
                      <Flecha />
                    </button>
                    <button type="button" className="ed-ibtn" aria-label={`Bajar «${p.enunciado}»`} disabled={ultima} onClick={() => onMover(p.id, 1)}>
                      <Flecha abajo />
                    </button>
                  </span>
                )}
              </div>
            );
          })}

          {s.preguntas.length === 0 && <p className="ed-fino ed-pad">Esta sección está vacía. Agregue una pregunta o arrastre una hasta aquí.</p>}

          {puedeEditar && (
            <>
              <button type="button" className="ed-btn ed-btn--sm ed-btn--izq" aria-expanded={menu === s.id} aria-controls={`menu-${s.id}`} onClick={() => setMenu(menu === s.id ? null : s.id)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar pregunta
              </button>
              {menu === s.id && (
                <div id={`menu-${s.id}`} className="ed-add" role="group" aria-label="Tipo de pregunta">
                  {TIPOS_PREGUNTA.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onAgregar(s.id, t.id);
                        setMenu(null);
                      }}
                    >
                      <span className="ed-gl" aria-hidden="true">
                        {GLIFO[t.id]}
                      </span>
                      {t.texto}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ))}
      {puedeEditar && (
        <button type="button" className="ed-btn" onClick={onAgregarSeccion}>
          Agregar sección
        </button>
      )}
    </nav>
  );
}
