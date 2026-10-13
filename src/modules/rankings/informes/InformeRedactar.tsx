/* =============================================================================
   Informes ODS con Pilo · 1. Redactar.

   Secciones a la izquierda, párrafos al centro y, a la derecha, «Lo que Pilo
   tomó»: el pasaje literal de cada nota resaltado, para comprobar cada frase.
   Cada párrafo dice quién lo escribió y si sus cifras están en las fuentes.

   Atajos (fuera de un campo): J / K párrafo siguiente / anterior · E escribir.
   En el texto: Ctrl+Enter guarda · Esc cancela.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as KE } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  cifrasSinFuente,
  ordenarBloques,
  piloRedactar,
  useAgregarBloque,
  useGuardarAjustes,
  useGuardarBloque,
  useNoticiasDeOds,
  useQuitarBloque,
} from "./datos";
import type { NoticiaOds, RespuestaRedactar } from "./datos";
import { SECCIONES } from "./tipos";
import type { Bloque, InformeCompleto, Origen, Persona, Seccion, Tono } from "./tipos";
import { fechaCorta, notasCitadas, pasajes } from "./recorte";

const ORIGEN: Record<Origen, [string, string]> = {
  pilo: ["Redactó Pilo", "pilo"],
  persona: ["Escribió una persona", "mute"],
  editado: ["Pilo + persona", "warn"],
};

const enCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Los párrafos visibles de una sección (sin los de reserva). */
export function visibles(bloques: Bloque[], sec: Seccion): Bloque[] {
  return ordenarBloques(bloques.filter((b) => b.sec === sec && b.enabled && !b.spare));
}

/** El origen tras guardar un texto: si Pilo lo escribió y cambió, queda «editado». */
export function origenTrasEditar(b: Pick<Bloque, "origin" | "orig">, texto: string): Origen {
  if (b.origin === "persona") return "persona";
  return texto.trim() === b.orig.trim() ? b.origin : "editado";
}

export function InformeRedactar({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const notasQ = useNoticiasDeOds(inf.ods);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const guardar = useGuardarBloque();
  const agregar = useAgregarBloque();
  const quitar = useQuitarBloque();
  const cliente = useQueryClient();

  const [sec, setSec] = useState<Seccion>("hicimos");
  const lista = visibles(completo.bloques, sec);
  const reserva = completo.bloques.filter((b) => b.sec === sec && b.spare && !b.enabled);
  const [foco, setFoco] = useState<string | null>(null);
  const activo = lista.find((b) => b.id === foco) ?? lista[0] ?? null;
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [pilo, setPilo] = useState<Set<string>>(() => new Set());
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const mesa = useRef<HTMLDivElement>(null);

  const refrescar = () => void cliente.invalidateQueries({ queryKey: ["informe"] });

  const conPilo = async (clave: string, f: () => Promise<RespuestaRedactar>, ok: string) => {
    setPilo((s) => new Set(s).add(clave));
    setError("");
    try {
      const r = await f();
      const fallos = (r.fallos ?? []).map((x) => x.motivo).join(" ");
      if (!r.escritos) setAviso(r.motivo || fallos || "Pilo no tenía notas nuevas para esta sección: todo lo aprobado ya está usado.");
      else setAviso(`${ok}${r.reserva ? ` ${r.reserva} quedó de reserva.` : ""}${fallos ? ` ${fallos}` : ""}`);
      refrescar();
    } catch (e) {
      setError(`Pilo no pudo hacerlo: ${errorTexto(e)}`);
    } finally {
      setPilo((s) => {
        const n = new Set(s);
        n.delete(clave);
        return n;
      });
    }
  };

  const abrirEdicion = (b: Bloque) => {
    setEditando(b.id);
    setBorrador(b.text);
    setFoco(b.id);
  };

  const guardarTexto = (b: Bloque) => {
    const texto = borrador.trim();
    setError("");
    if (!texto) {
      quitar.mutate(b, { onError: (e) => setError(`No se quitó el párrafo: ${errorTexto(e)}`) });
      setEditando(null);
      return;
    }
    guardar.mutate(
      { ...b, text: texto, origin: origenTrasEditar(b, texto), orig: b.origin === "persona" ? texto : b.orig },
      {
        onSuccess: () => {
          setEditando(null);
          setAviso("Guardado. Pilo no vuelve a tocar un párrafo que cambió una persona.");
        },
        onError: (e) => setError(`No se guardó: ${errorTexto(e)}`),
      },
    );
  };

  const guardarNuevo = () => {
    const texto = (nuevo ?? "").trim();
    if (!texto) return setNuevo(null);
    setError("");
    agregar.mutate(
      { report_id: inf.id, sec, text: texto, origin: "persona" },
      {
        onSuccess: () => {
          setNuevo(null);
          setAviso("Añadiste un párrafo.");
        },
        onError: (e) => setError(`No se añadió el párrafo: ${errorTexto(e)}`),
      },
    );
  };

  const anadirDePilo = () => {
    const sp = reserva[0];
    if (sp) {
      guardar.mutate(
        { ...sp, enabled: true, spare: false },
        { onSuccess: () => setAviso("Pilo añadió un párrafo con notas que no se habían usado."), onError: (e) => setError(`No se añadió: ${errorTexto(e)}`) },
      );
      setFoco(sp.id);
      return;
    }
    void conPilo(`sec-${sec}`, () => piloRedactar({ report_id: inf.id, sec, count: 1 }), "Pilo añadió un párrafo.");
  };

  /* Atajos de la mesa. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || enCampo(e.target) || editando) return;
      if (!mesa.current || !document.body.contains(mesa.current)) return;
      const i = lista.findIndex((b) => b.id === activo?.id);
      if (e.key === "j" || e.key === "k") {
        const sig = lista[Math.max(0, Math.min(lista.length - 1, i + (e.key === "j" ? 1 : -1)))];
        if (sig) {
          e.preventDefault();
          setFoco(sig.id);
          mesa.current.querySelector<HTMLElement>(`#ri-b-${sig.id}`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "e" && activo) {
        e.preventDefault();
        abrirEdicion(activo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const teclasTexto = (e: KE<HTMLTextAreaElement>, guardarF: () => void, cancelar: () => void) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      guardarF();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelar();
    }
  };

  const etiquetaSec = SECCIONES.find((s) => s.id === sec)?.label ?? sec;

  return (
    <div className="ri-desk" ref={mesa}>
      <nav className="ri-secs" aria-label="Estructura del informe">
        <h3 className="ri-k">Estructura del informe</h3>
        <ul>
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={sec === s.id ? "true" : undefined}
                onClick={() => {
                  setSec(s.id);
                  setFoco(null);
                  setEditando(null);
                  setNuevo(null);
                }}
              >
                <span>{s.label}</span>
                <small>{visibles(completo.bloques, s.id).length}</small>
              </button>
            </li>
          ))}
        </ul>
        <p className="ri-keys">
          <kbd>J</kbd> <kbd>K</kbd> párrafo · <kbd>E</kbd> escribir · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> guardar
        </p>
      </nav>

      <div className="ri-editor">
        <div className="ri-edhead">
          <h3>{etiquetaSec}</h3>
          <button
            type="button"
            className="button-secondary rk-sm ri-pilo-btn"
            disabled={pilo.has(`sec-${sec}`)}
            onClick={() => void conPilo(`sec-${sec}`, () => piloRedactar({ report_id: inf.id, sec }), "Pilo redactó la sección. Lo que escribió una persona quedó igual.")}
          >
            {pilo.has(`sec-${sec}`) ? "Pilo está redactando…" : "Que Pilo redacte la sección"}
          </button>
        </div>
        {sec === "hicimos" && (
          <p className="ri-lead">
            Pilo escribe como comunicador social: abre con una escena concreta, nombra el lugar y a quienes participan, y cada frase tiene detrás una nota.
          </p>
        )}
        {!lista.length && <p className="ri-lead">Esta sección aún no tiene párrafos.</p>}

        {lista.map((b) => {
          const [txt, tono] = ORIGEN[b.origin];
          const faltan = cifrasSinFuente(b);
          const verificable = b.sources.length > 0 || b.figs.length > 0;
          const ed = editando === b.id;
          return (
            <article key={b.id} id={`ri-b-${b.id}`} className="ri-blk" aria-current={activo?.id === b.id ? "true" : undefined} onClick={(e) => !(e.target as HTMLElement).closest("button,textarea,a") && setFoco(b.id)}>
              <div className="ri-blk__hd">
                <span className="ri-tag" data-tono={tono}>
                  {txt}
                </span>
                {verificable &&
                  (faltan.length ? (
                    <span className="ri-tag" data-tono="bad">
                      Cifra sin fuente: {faltan.join(", ")}
                    </span>
                  ) : (
                    <span className="ri-tag" data-tono="ok">
                      Cifras verificadas
                    </span>
                  ))}
                {b.warn && (
                  <span className="ri-tag" data-tono="warn">
                    Revisar
                  </span>
                )}
                <span className="ri-sp" />
                {ed ? (
                  <>
                    <button type="button" className="button-primary rk-sm" disabled={guardar.isPending} onClick={() => guardarTexto(b)}>
                      Guardar
                    </button>
                    <button type="button" className="button-ghost rk-sm" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="button-ghost rk-sm" onClick={() => abrirEdicion(b)}>
                      Escribo yo
                    </button>
                    {b.origin !== "persona" && (
                      <button
                        type="button"
                        className="button-ghost rk-sm ri-pilo-btn"
                        disabled={pilo.has(b.id)}
                        onClick={() => {
                          setFoco(b.id);
                          void conPilo(b.id, () => piloRedactar({ report_id: inf.id, sec: b.sec, block_id: b.id }), "Pilo reescribió el párrafo.");
                        }}
                      >
                        {pilo.has(b.id) ? "Reescribiendo…" : "Que Pilo lo reescriba"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="button-ghost rk-sm"
                      aria-label="Quitar este párrafo"
                      disabled={quitar.isPending}
                      onClick={() => quitar.mutate(b, { onSuccess: () => setAviso("Quitaste un párrafo."), onError: (e) => setError(`No se quitó: ${errorTexto(e)}`) })}
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
              {ed ? (
                <textarea
                  className="ri-ta"
                  aria-label="Texto del párrafo"
                  value={borrador}
                  autoFocus
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => teclasTexto(e, () => guardarTexto(b), () => setEditando(null))}
                />
              ) : (
                <p className="ri-blk__t">{b.text}</p>
              )}
              {b.warn && !ed && <p className="ri-warn">{b.warn}</p>}
              {b.figs.length > 0 && b.sec === "cifras" && (
                <ul className="ri-figs">
                  {b.figs.map((f, i) => (
                    <li key={i}>
                      <b>{f.v}</b> {f.label}
                      {f.src && <small> · {f.src}</small>}
                    </li>
                  ))}
                </ul>
              )}
              {b.sources.length > 0 && (
                <div className="ri-chips">
                  {notasCitadas(b.sources).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="ri-chip"
                      onClick={() => {
                        setFoco(b.id);
                        setNotaAbierta(id);
                      }}
                    >
                      {(notas.get(id)?.title ?? "Nota").slice(0, 52)}
                      {(notas.get(id)?.title.length ?? 0) > 52 ? "…" : ""}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}

        {nuevo !== null && (
          <article className="ri-blk" aria-current="true">
            <div className="ri-blk__hd">
              <span className="ri-tag" data-tono="mute">
                Escribe una persona
              </span>
              <span className="ri-sp" />
              <button type="button" className="button-primary rk-sm" disabled={agregar.isPending} onClick={guardarNuevo}>
                Guardar
              </button>
              <button type="button" className="button-ghost rk-sm" onClick={() => setNuevo(null)}>
                Cancelar
              </button>
            </div>
            <textarea className="ri-ta" aria-label="Texto del párrafo nuevo" value={nuevo} autoFocus onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => teclasTexto(e, guardarNuevo, () => setNuevo(null))} />
          </article>
        )}

        <div className="ri-row ri-add">
          <button type="button" className="button-ghost rk-sm ri-pilo-btn" disabled={pilo.has(`sec-${sec}`)} onClick={anadirDePilo}>
            Que Pilo añada un párrafo{reserva.length ? ` (${reserva.length} en reserva)` : ""}
          </button>
          <button type="button" className="button-ghost rk-sm" disabled={nuevo !== null} onClick={() => setNuevo("")}>
            Lo escribo yo
          </button>
        </div>
        <p className="ri-msg" role="status">
          {aviso}
        </p>
        {error && (
          <p className="ri-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <aside className="ri-prov" aria-label="Lo que Pilo tomó">
        <Procedencia bloque={activo} notas={notas} abierta={notaAbierta} cargando={notasQ.isPending} />
        <hr className="ri-hr" />
        <Voz completo={completo} />
      </aside>
    </div>
  );
}

/* ---------- Lo que Pilo tomó ------------------------------------------------------ */

function Procedencia({ bloque, notas, abierta, cargando }: { bloque: Bloque | null; notas: Map<string, NoticiaOds>; abierta: string | null; cargando: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (abierta) caja.current?.querySelector(`[data-nota="${abierta}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abierta, bloque?.id]);

  let cuerpo;
  if (!bloque) cuerpo = <p className="ri-mute">Elige un párrafo para ver de dónde salen sus frases.</p>;
  else if (!bloque.sources.length)
    cuerpo = <p className="ri-mute">{bloque.origin === "persona" ? "Este texto lo escribió una persona. No lleva fuentes: Pilo no lo cita ni lo cambia." : "Este párrafo no tiene fuentes todavía."}</p>;
  else {
    const faltan = cifrasSinFuente(bloque);
    cuerpo = (
      <>
        {notasCitadas(bloque.sources).map((id) => {
          const n = notas.get(id);
          const citas = bloque.sources.filter((s) => s.news_id === id).map((s) => s.quote);
          if (!n)
            return (
              <div key={id} className="ri-pnote" data-nota={id}>
                <p className="ri-mute">{cargando ? "Cargando la nota…" : "La nota ya no está entre las aprobadas."}</p>
                {citas.map((c, i) => (
                  <blockquote key={i}>{c}</blockquote>
                ))}
              </div>
            );
          const p = pasajes(n.body ?? "", citas);
          return (
            <div key={id} className="ri-pnote" data-nota={id} data-open={abierta === id ? "" : undefined}>
              <div className="ri-pnote__row">
                {n.image_url ? <img src={n.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ri-pnote__ph" aria-hidden="true" />}
                <div>
                  <b>{n.title}</b>
                  <small>{[fechaCorta(n.published_on), n.section].filter(Boolean).join(" · ")}</small>
                </div>
              </div>
              {p.encontrados.map((x, i) => (
                <blockquote key={i}>
                  {x.antes}
                  <mark>{x.cita}</mark>
                  {x.despues}
                </blockquote>
              ))}
              {p.faltan.map((c, i) => (
                <blockquote key={`f${i}`} className="ri-miss">
                  «{c}» <small>— Pilo no encuentra este pasaje literal en la nota: revísalo.</small>
                </blockquote>
              ))}
              <a className="ri-ext" href={n.url} target="_blank" rel="noopener noreferrer">
                Abrir la nota en udes.edu.co ↗<span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </div>
          );
        })}
        <p className={faltan.length ? "ri-check ri-check--bad" : "ri-check ri-check--ok"}>
          {faltan.length ? `Este párrafo tiene una cifra que no está en las fuentes: ${faltan.join(", ")}.` : "Cada cifra del párrafo aparece en la nota."}
        </p>
      </>
    );
  }
  return (
    <div ref={caja}>
      <h3 className="ri-k">Lo que Pilo tomó</h3>
      {cuerpo}
    </div>
  );
}

/* ---------- Cómo escribe Pilo ------------------------------------------------------ */

function Voz({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const ajustes = useGuardarAjustes();
  const cambiar = (c: Partial<{ tone: Tono; person: Persona }>) => ajustes.mutate({ id: inf.id, settings: { ...inf.settings, ...c } });
  return (
    <div className="ri-voice">
      <h3 className="ri-k">Cómo escribe Pilo</h3>
      <label>
        Voz
        <select value={inf.settings.tone} disabled={ajustes.isPending} onChange={(e) => cambiar({ tone: e.target.value as Tono })}>
          <option value="cercano">Comunicador social: cercano y concreto</option>
          <option value="institucional">Institucional: sobrio</option>
        </select>
      </label>
      <label>
        Persona
        <select value={inf.settings.person} disabled={ajustes.isPending} onChange={(e) => cambiar({ person: e.target.value as Persona })}>
          <option value="tercera">La UDES (tercera persona)</option>
          <option value="nosotros">Nosotros</option>
        </select>
      </label>
      <p className="ri-mute">Abre con una escena, nombra el lugar y a quienes participan, y justifica por qué la acción responde al ODS. No usa cifras que la nota no dé.</p>
      {ajustes.error && (
        <p className="ri-error" role="alert">
          No se guardó la voz: {errorTexto(ajustes.error)}
        </p>
      )}
    </div>
  );
}
