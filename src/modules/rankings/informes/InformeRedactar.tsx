/* =============================================================================
   Informes ODS con Pilo · 1. Redactar.

   Secciones a la izquierda, párrafos al centro y, a la derecha, «Lo que Pilo
   tomó»: el pasaje literal de cada fuente resaltado, para comprobar cada frase.

   Cada párrafo, en español e inglés: dos columnas en pantallas anchas (una
   debajo de la otra en las angostas); cada idioma se edita por separado y
   «Que Pilo traduzca» completa el inglés que falta sin tocar el español.
   «Qué hicimos» se agrupa por subtítulo temático (heading / heading_en).

   Cada párrafo dice quién lo escribió, si sus cifras están en las fuentes y
   en el libro de cifras. Los párrafos quitados o los que el informe 2025 trajo
   deshabilitados («Texto repetido de otro ODS…») se ven atenuados con su
   aviso y «Habilitar». Pilo nunca reescribe lo que escribió una persona.

   Atajos (fuera de un campo): J / K párrafo siguiente / anterior · E escribir.
   En el texto: Ctrl+Enter guarda · Esc cancela.
   ========================================================================== */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as KE } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  cifrasSinFuente,
  ordenarBloques,
  piloRedactar,
  piloTraducir,
  useAgregarBloque,
  useCifrasDeOds,
  useGuardarAjustes,
  useGuardarBloque,
  useNoticiasDeOds,
  useQuitarBloque,
} from "./datos";
import type { NoticiaOds, RespuestaRedactar } from "./datos";
import { SECCIONES } from "./tipos";
import type { Bloque, CifraNota, InformeCompleto, Origen, Persona, Seccion, Tono } from "./tipos";
import { fechaCorta, notasCitadas, pasajes } from "./recorte";

const ORIGEN: Record<Origen, [string, string]> = {
  pilo: ["Redactó Pilo", "pilo"],
  persona: ["Escribió una persona", "mute"],
  editado: ["Pilo + persona", "warn"],
};

type Idioma = "es" | "en";
const enCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Los párrafos activos de una sección (sin los de reserva ni los quitados). */
export function visibles(bloques: Bloque[], sec: Seccion): Bloque[] {
  return ordenarBloques(bloques.filter((b) => b.sec === sec && b.enabled && !b.spare));
}

/** Lo que se ve en la mesa: los activos y, atenuados, los quitados (no los de reserva). */
export function enMesa(bloques: Bloque[], sec: Seccion): Bloque[] {
  return ordenarBloques(bloques.filter((b) => b.sec === sec && !b.spare));
}

/** El origen tras guardar un texto: si Pilo lo escribió y cambió, queda «editado». */
export function origenTrasEditar(b: Pick<Bloque, "origin" | "orig">, texto: string): Origen {
  if (b.origin === "persona") return "persona";
  return texto.trim() === b.orig.trim() ? b.origin : "editado";
}

/** Párrafos activos sin inglés. */
export function sinIngles(bloques: Bloque[]): number {
  return bloques.filter((b) => b.enabled && !b.spare && b.text.trim() && !b.text_en?.trim()).length;
}

const RE_NUM = /\d[\d.,]*\d|\d/g;
const norm = (n: string) => n.replace(/[.,]+$/, "").replace(/\.(?=\d{3}(?!\d))/g, "").replace(",", ".");

/**
 * Las cifras que usa un párrafo (las de sus `figs` y las del texto, sin años)
 * y si cada una está en el libro de cifras de las notas que cita (o del ODS
 * si el párrafo no cita ninguna).
 */
export function cifrasDelParrafo(b: Pick<Bloque, "text" | "figs" | "sources">, libro: Pick<CifraNota, "news_id" | "value" | "num">[]): { v: string; enLibro: boolean }[] {
  const citadas = new Set(b.sources.map((s) => s.news_id).filter(Boolean));
  const delLibro = libro.filter((c) => !citadas.size || citadas.has(c.news_id));
  const valores = new Set<string>();
  for (const c of delLibro) {
    for (const n of c.value.match(RE_NUM) ?? []) valores.add(norm(n));
    if (c.num !== null && Number.isFinite(c.num)) valores.add(String(c.num));
  }
  const vistos: string[] = [];
  const out: { v: string; enLibro: boolean }[] = [];
  for (const crudo of [...b.figs.flatMap((f) => f.v.match(RE_NUM) ?? []), ...(b.text.match(RE_NUM) ?? [])]) {
    const v = crudo.replace(/[.,]+$/, "");
    const n = norm(crudo);
    if (/^(19|20)\d{2}$/.test(n) || vistos.includes(n)) continue;
    vistos.push(n);
    out.push({ v, enLibro: valores.has(n) || valores.has(String(Number(n))) });
  }
  return out;
}

interface Edicion {
  id: string;
  idioma: Idioma;
}

export function InformeRedactar({ completo, importado = false }: { completo: InformeCompleto; importado?: boolean }) {
  const inf = completo.informe;
  const notasQ = useNoticiasDeOds(inf.ods);
  const libroQ = useCifrasDeOds(inf.ods);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const libro = libroQ.data ?? [];
  const guardar = useGuardarBloque();
  const agregar = useAgregarBloque();
  const quitar = useQuitarBloque();
  const cliente = useQueryClient();

  const [sec, setSec] = useState<Seccion>("hicimos");
  const lista = enMesa(completo.bloques, sec);
  const activos = lista.filter((b) => b.enabled);
  const reserva = completo.bloques.filter((b) => b.sec === sec && b.spare && !b.enabled);
  const [foco, setFoco] = useState<string | null>(null);
  const activo = lista.find((b) => b.id === foco) ?? activos[0] ?? null;
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [borrador, setBorrador] = useState("");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [subtitulo, setSubtitulo] = useState<{ ids: string[]; es: string; en: string } | null>(null);
  const [pilo, setPilo] = useState<Set<string>>(() => new Set());
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const mesa = useRef<HTMLDivElement>(null);
  const faltaIngles = sinIngles(completo.bloques);

  const refrescar = () => void cliente.invalidateQueries({ queryKey: ["informe"] });

  const ocupado = (clave: string, si: boolean) =>
    setPilo((s) => {
      const n = new Set(s);
      if (si) n.add(clave);
      else n.delete(clave);
      return n;
    });

  const conPilo = async (clave: string, f: () => Promise<RespuestaRedactar>, ok: string) => {
    ocupado(clave, true);
    setError("");
    try {
      const r = await f();
      const fallos = (r.fallos ?? []).map((x) => x.motivo).join(" ");
      if (!r.escritos) setAviso(r.motivo || fallos || "Pilo no tenía notas nuevas para esta sección: todo lo aprobado ya está usado.");
      else setAviso(`${ok}${fallos ? ` ${fallos}` : ""}`);
      refrescar();
    } catch (e) {
      setError(`Pilo no pudo hacerlo: ${errorTexto(e)}`);
    } finally {
      ocupado(clave, false);
    }
  };

  const traducir = async () => {
    ocupado("traducir", true);
    setError("");
    try {
      const r = await piloTraducir({ report_id: inf.id });
      const fallos = r.fallos.length ? ` ${r.fallos.length} no se pudieron traducir.` : "";
      setAviso(`Pilo tradujo ${r.bloques} párrafos y ${r.noticias} notas al inglés; el español quedó igual.${r.quedan ? ` Quedan ${r.quedan}: vuelve a pedírselo.` : ""}${fallos}`);
      refrescar();
    } catch (e) {
      setError(`Pilo no pudo traducir: ${errorTexto(e)}`);
    } finally {
      ocupado("traducir", false);
    }
  };

  const abrirEdicion = (b: Bloque, idioma: Idioma) => {
    setEditando({ id: b.id, idioma });
    setBorrador(idioma === "es" ? b.text : (b.text_en ?? ""));
    setFoco(b.id);
  };

  const guardarTexto = (b: Bloque) => {
    if (!editando) return;
    const texto = borrador.trim();
    setError("");
    const ok = {
      onSuccess: () => {
        setEditando(null);
        setAviso(editando.idioma === "es" ? "Guardado. Pilo no vuelve a tocar un párrafo que cambió una persona." : "Guardado el inglés. El español no cambió.");
      },
      onError: (e: unknown) => setError(`No se guardó: ${errorTexto(e)}`),
    };
    if (editando.idioma === "en") return guardar.mutate({ ...b, text_en: texto }, ok);
    if (!texto) {
      quitar.mutate(b, { onError: (e) => setError(`No se quitó el párrafo: ${errorTexto(e)}`) });
      setEditando(null);
      return;
    }
    guardar.mutate({ ...b, text: texto, origin: origenTrasEditar(b, texto), orig: b.origin === "persona" ? texto : b.orig }, ok);
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
          setAviso("Añadiste un párrafo. Pídele a Pilo que lo traduzca cuando quieras.");
        },
        onError: (e) => setError(`No se añadió el párrafo: ${errorTexto(e)}`),
      },
    );
  };

  const guardarSubtitulo = () => {
    if (!subtitulo) return;
    for (const id of subtitulo.ids) {
      const b = completo.bloques.find((x) => x.id === id);
      if (b) guardar.mutate({ ...b, heading: subtitulo.es.trim(), heading_en: subtitulo.en.trim() }, { onError: (e) => setError(`No se guardó el subtítulo: ${errorTexto(e)}`) });
    }
    setSubtitulo(null);
    setAviso("Subtítulo guardado.");
  };

  const anadirDePilo = () => {
    const sp = reserva[0];
    if (sp) {
      guardar.mutate(
        { ...sp, enabled: true, spare: false },
        { onSuccess: () => setAviso("Pilo añadió un párrafo de reserva."), onError: (e) => setError(`No se añadió: ${errorTexto(e)}`) },
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
      } else if (e.key === "e" && activo?.enabled) {
        e.preventDefault();
        abrirEdicion(activo, "es");
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

  /** Un idioma del párrafo: su texto o su campo de edición. */
  /* Una función, no un componente: así el campo no se vuelve a montar con cada tecla. */
  const columna = (b: Bloque, idioma: Idioma) => {
    const ed = editando?.id === b.id && editando.idioma === idioma;
    const texto = idioma === "es" ? b.text : (b.text_en ?? "");
    return (
      <div key={idioma} className="ri-lang" lang={idioma}>
        <div className="ri-lang__hd">
          <span className="ri-k">{idioma === "es" ? "Español" : "English"}</span>
          {b.enabled && !ed && (
            <button type="button" className="ri-link" onClick={() => abrirEdicion(b, idioma)} aria-label={idioma === "es" ? "Escribir el español de este párrafo" : "Escribir el inglés de este párrafo"}>
              {idioma === "es" ? "Escribo yo" : texto ? "Edit" : "Write it"}
            </button>
          )}
        </div>
        {ed ? (
          <>
            <textarea
              className="ri-ta"
              aria-label={idioma === "es" ? "Texto del párrafo en español" : "Paragraph text in English"}
              value={borrador}
              autoFocus
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => teclasTexto(e, () => guardarTexto(b), () => setEditando(null))}
            />
            <div className="ri-row">
              <button type="button" className="button-primary rk-sm" disabled={guardar.isPending} onClick={() => guardarTexto(b)}>
                Guardar
              </button>
              <button type="button" className="button-ghost rk-sm" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </>
        ) : texto.trim() ? (
          <p className="ri-blk__t">{texto}</p>
        ) : (
          <p className="ri-blk__t ri-mute" lang="es">
            Sin inglés todavía: en el portal se verá el español con la marca «ES».
          </p>
        )}
      </div>
    );
  };

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
                  setSubtitulo(null);
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
          <div className="ri-row">
            <button type="button" className="button-ghost rk-sm ri-pilo-btn" disabled={pilo.has("traducir") || !faltaIngles} onClick={() => void traducir()} title={faltaIngles ? undefined : "Todo el informe tiene inglés"}>
              {pilo.has("traducir") ? "Pilo está traduciendo…" : `Que Pilo traduzca${faltaIngles ? ` (${faltaIngles} sin inglés)` : ""}`}
            </button>
            <button
              type="button"
              className="button-secondary rk-sm ri-pilo-btn"
              disabled={pilo.has(`sec-${sec}`)}
              onClick={() => void conPilo(`sec-${sec}`, () => piloRedactar({ report_id: inf.id, sec }), "Pilo redactó la sección. Lo que escribió una persona quedó igual.")}
            >
              {pilo.has(`sec-${sec}`) ? "Pilo está redactando…" : "Que Pilo redacte la sección"}
            </button>
          </div>
        </div>
        {sec === "hicimos" && (
          <p className="ri-lead">
            Pilo escribe como comunicador social: abre con una escena concreta, nombra el lugar y a quienes participan, y cada frase tiene detrás una fuente. Los párrafos se
            agrupan por tema.
          </p>
        )}
        {!lista.length && <p className="ri-lead">Esta sección aún no tiene párrafos.</p>}

        {lista.map((b, i) => {
          const [txt, tono] = ORIGEN[b.origin];
          const faltan = cifrasSinFuente(b);
          const verificable = b.sources.length > 0 || b.figs.length > 0;
          const usadas = libro.length ? cifrasDelParrafo(b, libro) : [];
          const h = b.heading?.trim() ?? "";
          const abreGrupo = sec === "hicimos" && h !== (lista[i - 1]?.heading?.trim() ?? "") && (h || i > 0);
          const grupo = abreGrupo ? lista.slice(i).filter((x, k, arr) => arr.slice(0, k + 1).every((y) => (y.heading?.trim() ?? "") === h)).map((x) => x.id) : [];
          return (
            <Fragment key={b.id}>
              {abreGrupo && (
                <div className="ri-heading">
                  {subtitulo && subtitulo.ids[0] === b.id ? (
                    <div className="ri-heading__ed">
                      <label className="ri-field">
                        Subtítulo
                        <input type="text" value={subtitulo.es} onChange={(e) => setSubtitulo({ ...subtitulo, es: e.target.value })} />
                      </label>
                      <label className="ri-field" lang="en">
                        Heading (English)
                        <input type="text" value={subtitulo.en} onChange={(e) => setSubtitulo({ ...subtitulo, en: e.target.value })} />
                      </label>
                      <div className="ri-row">
                        <button type="button" className="button-primary rk-sm" onClick={guardarSubtitulo}>
                          Guardar
                        </button>
                        <button type="button" className="button-ghost rk-sm" onClick={() => setSubtitulo(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4>{h || "Sin subtítulo"}</h4>
                      {b.heading_en?.trim() ? <span lang="en">{b.heading_en}</span> : h ? <span className="ri-mute">sin inglés</span> : null}
                      <button type="button" className="ri-link" onClick={() => setSubtitulo({ ids: grupo, es: h, en: b.heading_en ?? "" })}>
                        Editar subtítulo
                      </button>
                    </>
                  )}
                </div>
              )}
              <article
                id={`ri-b-${b.id}`}
                className="ri-blk"
                data-off={b.enabled ? undefined : ""}
                aria-current={activo?.id === b.id ? "true" : undefined}
                onClick={(e) => !(e.target as HTMLElement).closest("button,textarea,a,input") && setFoco(b.id)}
              >
                <div className="ri-blk__hd">
                  {!b.enabled && (
                    <span className="ri-tag" data-tono="bad">
                      Fuera del informe
                    </span>
                  )}
                  <span className="ri-tag" data-tono={tono}>
                    {txt}
                  </span>
                  {importado && b.origin === "persona" && (
                    <span className="ri-tag" data-tono="mute">
                      Informe 2025 original
                    </span>
                  )}
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
                  {!b.enabled ? (
                    <button
                      type="button"
                      className="button-secondary rk-sm"
                      disabled={guardar.isPending}
                      onClick={() => guardar.mutate({ ...b, enabled: true }, { onSuccess: () => setAviso("El párrafo volvió al informe."), onError: (e) => setError(`No se habilitó: ${errorTexto(e)}`) })}
                    >
                      Habilitar
                    </button>
                  ) : (
                    <>
                      {b.origin !== "persona" ? (
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
                      ) : (
                        <span className="ri-mute ri-nopilo">Lo escribió una persona: Pilo no lo reescribe.</span>
                      )}
                      <button
                        type="button"
                        className="button-ghost rk-sm"
                        aria-label="Quitar este párrafo del informe"
                        disabled={quitar.isPending}
                        onClick={() => quitar.mutate(b, { onSuccess: () => setAviso("Quitaste un párrafo: queda atenuado por si lo quieres de vuelta."), onError: (e) => setError(`No se quitó: ${errorTexto(e)}`) })}
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
                {b.warn && <p className="ri-warn">{b.warn}</p>}
                <div className="ri-bi">
                  {columna(b, "es")}
                  {columna(b, "en")}
                </div>
                {b.figs.length > 0 && b.sec === "cifras" && (
                  <ul className="ri-figs">
                    {b.figs.map((f, k) => (
                      <li key={k}>
                        <b>{f.v}</b> {f.label}
                        {f.src && <small> · {f.src}</small>}
                      </li>
                    ))}
                  </ul>
                )}
                {usadas.length > 0 && (
                  <p className="ri-usadas">
                    <span className="ri-k">Cifras que usa</span>
                    {usadas.map((c) => (
                      <span key={c.v} className="ri-usada" data-ok={c.enLibro ? "" : undefined} title={c.enLibro ? "Está en el libro de cifras" : "No está en el libro de cifras: revísala"}>
                        {c.v} {c.enLibro ? "✓" : "· no está en el libro"}
                      </span>
                    ))}
                  </p>
                )}
                {b.sources.length > 0 && (
                  <div className="ri-chips">
                    {notasCitadas(b.sources)
                      .filter(Boolean)
                      .map((id) => (
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
                    {b.sources
                      .filter((s) => !s.news_id && s.origen)
                      .map((s, k) => (
                        <span key={`o${k}`} className="ri-chip ri-chip--src">
                          {s.origen}
                        </span>
                      ))}
                  </div>
                )}
              </article>
            </Fragment>
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
            <textarea className="ri-ta" aria-label="Texto del párrafo nuevo, en español" value={nuevo} autoFocus onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => teclasTexto(e, guardarNuevo, () => setNuevo(null))} />
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
    const otras = bloque.sources.filter((s) => !s.news_id);
    cuerpo = (
      <>
        {notasCitadas(bloque.sources)
          .filter(Boolean)
          .map((id) => {
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
        {otras.map((s, i) => (
          <div key={`o${i}`} className="ri-pnote">
            <b className="ri-pnote__src">{s.origen || "Otra fuente"}</b>
            <blockquote>
              <mark>{s.quote}</mark>
            </blockquote>
          </div>
        ))}
        <p className={faltan.length ? "ri-check ri-check--bad" : "ri-check ri-check--ok"}>
          {faltan.length ? `Este párrafo tiene una cifra que no está en las fuentes: ${faltan.join(", ")}.` : "Cada cifra del párrafo aparece en su fuente."}
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
      <p className="ri-mute">Abre con una escena, nombra el lugar y a quienes participan, y justifica por qué la acción responde al ODS. No usa cifras que la fuente no dé.</p>
      {ajustes.error && (
        <p className="ri-error" role="alert">
          No se guardó la voz: {errorTexto(ajustes.error)}
        </p>
      )}
    </div>
  );
}
