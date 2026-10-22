/* =============================================================================
   Encuestas con Pilo · el editor (tres columnas).

   Estructura (reordenar por arrastre o teclado), lienzo (la pregunta) y
   propiedades con la Capa de Pilo. Deshacer y rehacer (Ctrl+Z, Ctrl+Mayús+Z),
   guardado automático del borrador, versiones (la publicada queda fija) y editores
   compartidos. Solo transform y opacity se animan; reordenar con teclado, no.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { usePiloAiConfig } from "../../../components/pilo/ai/config";
import { useCompartir, useEditores, useGuardarBorrador, useGuardarEncuesta, useVersiones } from "../datos";
import { agregarPregunta, cambiarPregunta, duplicarPregunta, moverPregunta, moverSeccion, ponerPreguntaAntesDe, preguntaNueva, quitarPregunta, quitarSeccion } from "../lib/editor";
import { preguntasDe, validarEstructura } from "../lib/estructura";
import type { Estructura, Pregunta, TipoPregunta } from "../lib/estructura";
import { cambiar, deshacer, iniciar, puedeDeshacer, puedeRehacer, rehacer } from "../lib/historia";
import type { Historia } from "../lib/historia";
import { seccionNueva } from "../lib/plantillas";
import { slidePanel } from "../motion";
import type { Encuesta } from "../tipos";
import { textoEstadoEncuesta } from "../tipos";
import { PreviaEncuesta } from "../publico/Previa";
import { EstructuraCol } from "./Estructura";
import { Lienzo } from "./Lienzo";
import { PropiedadesCol } from "./Propiedades";
import "./editor.css";

type Guardado = "limpio" | "pendiente" | "guardando" | "ok" | "error";
const TEXTO_GUARDADO: Record<Guardado, string> = { limpio: "", pendiente: "Cambios sin guardar…", guardando: "Guardando…", ok: "Borrador guardado", error: "No se pudo guardar. Reintentando al próximo cambio." };
const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

export function Editor({ encuesta, puedeEditar, onPublicar, onAviso }: { encuesta: Encuesta; puedeEditar: boolean; onPublicar: () => void; onAviso: (t: string) => void }) {
  const versiones = useVersiones(encuesta.id);
  const borrador = versiones.data?.find((v) => !v.fijada) ?? versiones.data?.[0];
  if (versiones.isPending) return <p className="admin-loading">Abriendo el editor…</p>;
  if (versiones.error || !borrador) return <p className="en-nota" role="alert">No se pudo abrir la estructura de la encuesta{versiones.error ? `: ${versiones.error.message}` : ""}.</p>;
  return <EditorAbierto key={`${encuesta.id}:${borrador.id}`} encuesta={encuesta} inicial={borrador.estructura} puedeEditar={puedeEditar} onPublicar={onPublicar} onAviso={onAviso} />;
}

function EditorAbierto({ encuesta, inicial, puedeEditar, onPublicar, onAviso }: { encuesta: Encuesta; inicial: Estructura; puedeEditar: boolean; onPublicar: () => void; onAviso: (t: string) => void }) {
  const versiones = useVersiones(encuesta.id);
  const guardarBorrador = useGuardarBorrador(encuesta.id);
  const guardarEncuesta = useGuardarEncuesta(encuesta.id);
  const piloIA = usePiloAiConfig().data;
  const [hist, setHist] = useState<Historia<Estructura>>(() => iniciar(inicial));
  const [sel, setSel] = useState<string | null>(() => preguntasDe(inicial)[0]?.id ?? null);
  const [guardado, setGuardado] = useState<Guardado>("limpio");
  const [titulo, setTitulo] = useState(encuesta.titulo);
  const [panel, setPanel] = useState<"versiones" | "compartir" | null>(null);
  const [previa, setPrevia] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const primera = useRef(true);
  const enviado = useRef(inicial);
  const e = hist.presente;

  const preguntas = useMemo(() => preguntasDe(e), [e]);
  const actual = preguntas.find((p) => p.id === sel) ?? null;
  const anteriores = actual ? preguntas.slice(0, preguntas.indexOf(actual)) : [];

  const poner = useCallback((f: (x: Estructura) => Estructura, clave: string | null = null) => setHist((h) => cambiar(h, f(h.presente), clave)), []);

  // Si la pregunta elegida desaparece (se quitó o se deshizo), se elige la que quede.
  useEffect(() => {
    if (sel && !preguntas.some((p) => p.id === sel)) setSel(preguntas[0]?.id ?? null);
  }, [preguntas, sel]);

  // Guardado automático del borrador: un segundo después del último cambio.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (!puedeEditar || e === enviado.current) return;
    setGuardado("pendiente");
    const t = window.setTimeout(() => {
      setGuardado("guardando");
      guardarBorrador.mutate(
        { estructura: e },
        {
          onSuccess: () => {
            enviado.current = e;
            setGuardado("ok");
          },
          onError: () => setGuardado("error"),
        },
      );
    }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la estructura
  }, [e]);

  const alTeclear = (ev: KeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== "z") return;
    const t = ev.target as HTMLElement;
    if (t.matches("input, textarea, select")) return; // ahí manda el deshacer del propio campo
    ev.preventDefault();
    setHist((h) => (ev.shiftKey ? rehacer(h) : deshacer(h)));
  };

  const cambiarActual = (c: Partial<Pregunta>, clave?: string) => actual && poner((x) => cambiarPregunta(x, actual.id, c), clave ?? null);
  const cambiarTipo = (t: TipoPregunta) => {
    if (!actual) return;
    const base = preguntaNueva(e, t);
    poner((x) => cambiarPregunta(x, actual.id, { tipo: t, opciones: base.opciones, validaciones: base.validaciones }));
  };
  const problemas = useMemo(() => validarEstructura(e), [e]);
  const ed = versiones.data ?? [];

  return (
    <div className="ed" onKeyDown={alTeclear}>
      <div className="ed-barra">
        <label className="ed-sr" htmlFor="ed-titulo">
          Nombre de la encuesta
        </label>
        <input
          id="ed-titulo"
          className="ed-titulo"
          value={titulo}
          maxLength={120}
          readOnly={!puedeEditar}
          onChange={(ev) => setTitulo(ev.target.value)}
          onBlur={() => {
            if (puedeEditar && titulo.trim().length >= 5 && titulo.trim() !== encuesta.titulo) guardarEncuesta.mutate({ titulo: titulo.trim() }, { onError: (er) => onAviso(`No se pudo guardar el título: ${er.message}`) });
          }}
        />
        <span className="ed-estado" data-s={encuesta.estado}>
          <i aria-hidden="true" />
          {textoEstadoEncuesta(encuesta.estado)}
        </span>
        <span className="ed-fino" role="status" aria-live="polite">
          {TEXTO_GUARDADO[guardado]}
        </span>
        <span className="ed-esp" />
        <div className="ed-deshacer">
          <button type="button" className="ed-ibtn" aria-label="Deshacer el último cambio" disabled={!puedeDeshacer(hist)} onClick={() => setHist(deshacer)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
          <button type="button" className="ed-ibtn" aria-label="Rehacer" disabled={!puedeRehacer(hist)} onClick={() => setHist(rehacer)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H10a6 6 0 0 0 0 12h3" />
            </svg>
          </button>
        </div>
        <button type="button" className="ed-btn ed-btn--sm" aria-expanded={panel === "versiones"} onClick={() => setPanel(panel === "versiones" ? null : "versiones")}>
          Versiones
        </button>
        {puedeEditar && (
          <button type="button" className="ed-btn ed-btn--sm" aria-expanded={panel === "compartir"} onClick={() => setPanel(panel === "compartir" ? null : "compartir")}>
            Compartir
          </button>
        )}
        <div className="ed-seg" role="group" aria-label="Modo de llenado para quien responde">
          {(["guiado", "clasico"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={encuesta.modo_llenado === m} disabled={!puedeEditar} onClick={() => encuesta.modo_llenado !== m && guardarEncuesta.mutate({ modo_llenado: m }, { onError: (er) => onAviso(er.message) })}>
              {m === "guiado" ? "Guiado por Pilo" : "Formulario clásico"}
            </button>
          ))}
        </div>
        <button type="button" className="ed-btn ed-btn--sm" onClick={() => setPrevia(true)} disabled={problemas.length > 0} title={problemas.length ? problemas[0].mensaje : undefined}>
          Vista previa
        </button>
        {puedeEditar && (
          <button type="button" className="ed-btn ed-btn--pri ed-btn--sm" onClick={onPublicar}>
            Publicar…
          </button>
        )}
        {panel && (
          <PanelLateral titulo={panel === "versiones" ? "Historial de versiones" : "Quién puede editar"} onCerrar={() => setPanel(null)}>
            {panel === "versiones" ? (
              <>
                <p className="ed-fino">La publicada queda fija: las respuestas apuntan a ella. Restaurar copia esa versión al borrador; no borra ninguna.</p>
                {ed.map((v) => (
                  <div key={v.id} className="ed-ver">
                    <div>
                      <b>
                        Versión {v.numero}
                        {!v.fijada ? " · borrador actual" : v.id === encuesta.version_publicada_id ? " · publicada" : " · fijada"}
                      </b>
                      <div className="ed-fino">
                        {v.nota || "Sin nota"} · {FECHA.format(new Date(v.fijada_en ?? v.created_at))}
                      </div>
                    </div>
                    {v.fijada && puedeEditar && (
                      <button
                        type="button"
                        className="ed-btn ed-btn--sm"
                        onClick={() => {
                          poner(() => JSON.parse(JSON.stringify(v.estructura)) as Estructura);
                          setPanel(null);
                          setAnuncio(`Versión ${v.numero} restaurada en el borrador.`);
                        }}
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <Compartir encuestaId={encuesta.id} onAviso={onAviso} />
            )}
          </PanelLateral>
        )}
      </div>
      <p className="ed-sr" role="status" aria-live="polite">
        {anuncio}
      </p>
      {problemas.length > 0 && (
        <p className="ed-problema" role="alert">
          Revise la estructura: {problemas[0].mensaje}
        </p>
      )}

      <div className="ed-cols">
        <EstructuraCol
          estructura={e}
          seleccion={sel}
          puedeEditar={puedeEditar}
          onSeleccionar={setSel}
          onNombreSeccion={(id, n) => poner((x) => ({ ...x, secciones: x.secciones.map((s) => (s.id === id ? { ...s, titulo: n } : s)) }), `seccion:${id}`)}
          onMover={(id, d) => poner((x) => moverPregunta(x, id, d))}
          onArrastrar={(id, hacia, seccion) => poner((x) => ponerPreguntaAntesDe(x, id, hacia, seccion))}
          onAgregar={(s, t) => {
            const r = agregarPregunta(e, s, t);
            poner(() => r.estructura);
            setSel(r.id);
          }}
          onAgregarSeccion={() => {
            const n = e.secciones.length + 1;
            let id = `seccion_${n}`;
            let k = n;
            while (e.secciones.some((s) => s.id === id) || preguntas.some((p) => p.id === id)) id = `seccion_${++k}`;
            poner((x) => ({ ...x, secciones: [...x.secciones, { ...seccionNueva(k), id }] }));
          }}
          onQuitarSeccion={(id) => poner((x) => quitarSeccion(x, id))}
          onMoverSeccion={(id, d) => poner((x) => moverSeccion(x, id, d))}
        />
        <Lienzo
          pregunta={actual}
          puedeEditar={puedeEditar}
          onCambiar={cambiarActual}
          onTipo={cambiarTipo}
          onDuplicar={() => {
            if (!actual) return;
            const r = duplicarPregunta(e, actual.id);
            poner(() => r.estructura);
            if (r.id) setSel(r.id);
          }}
          onQuitar={() => actual && poner((x) => quitarPregunta(x, actual.id))}
        />
        <PropiedadesCol pregunta={actual} anteriores={anteriores} tituloEncuesta={encuesta.titulo} puedeEditar={puedeEditar} iaEncendida={piloIA?.enabled ?? false} onCambiar={cambiarActual} />
      </div>

      {previa && <PreviaEncuesta encuesta={encuesta} estructura={e} onCerrar={() => setPrevia(false)} />}
    </div>
  );
}

function PanelLateral({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slidePanel(ref.current);
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} className="ed-pop" role="dialog" aria-label={titulo} tabIndex={-1} onKeyDown={(ev) => ev.key === "Escape" && onCerrar()}>
      <div className="ed-pop__cab">
        <h3>{titulo}</h3>
        <button type="button" className="ed-ibtn" aria-label="Cerrar" onClick={onCerrar}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

function Compartir({ encuestaId, onAviso }: { encuestaId: string; onAviso: (t: string) => void }) {
  const editores = useEditores(encuestaId);
  const { compartir, quitar } = useCompartir(encuestaId);
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<"editor" | "lector">("editor");
  const invitar = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) return onAviso("Escriba un correo válido.");
    compartir.mutate({ correo: correo.trim(), rol }, { onSuccess: () => { onAviso(`${correo.trim()} ahora puede ${rol === "editor" ? "editar" : "ver"} esta encuesta.`); setCorreo(""); }, onError: (er) => onAviso(er.message) });
  };
  return (
    <>
      {editores.data?.map((x) => (
        <div key={x.usuario_id} className="ed-ver">
          <div>
            <b>{x.correo}</b>
            <div className="ed-fino">{x.rol === "propietario" ? "Propietario" : x.rol === "editor" ? "Editor" : "Lector"}</div>
          </div>
          {x.rol !== "propietario" && (
            <button type="button" className="ed-btn ed-btn--sm" onClick={() => quitar.mutate(x.usuario_id, { onError: (er) => onAviso(er.message) })}>
              Quitar
            </button>
          )}
        </div>
      ))}
      <div className="ed-field">
        <label htmlFor="ed-inv">Invitar por correo UDES</label>
        <input id="ed-inv" className="ed-in" type="email" placeholder="nombre@udes.edu.co" value={correo} onChange={(ev) => setCorreo(ev.target.value)} />
      </div>
      <div className="ed-field">
        <label htmlFor="ed-inv-rol">Como</label>
        <select id="ed-inv-rol" className="ed-in" value={rol} onChange={(ev) => setRol(ev.target.value as "editor" | "lector")}>
          <option value="editor">Editor (cambia la encuesta)</option>
          <option value="lector">Lector (solo ve)</option>
        </select>
      </div>
      <button type="button" className="ed-btn ed-btn--pri" onClick={invitar} disabled={compartir.isPending}>
        Invitar
      </button>
    </>
  );
}
