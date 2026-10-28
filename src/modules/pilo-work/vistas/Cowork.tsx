/* =============================================================================
   Cowork · documentos con Pilo al lado.

   Los documentos viven en pw_documentos (de cada persona). Las sugerencias las propone
   el modelo con la memoria personal y la colectiva (acción «sugerir» de pilo-work), cada
   una se aplica u omite, y todo cambio guarda una copia en el historial para deshacer.
   Al seleccionar un texto aparece la barra de acortar, ampliar o más formal.
   Se exporta a .docx en el navegador (paquete docx).
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { supabase } from "../../../lib/supabase";
import { callWork, hace, marcarSenal } from "../api";
import type { Bloque, Documento } from "../api";
import { movimientoReducido } from "../../rankings/movimiento";
import { Cara, IC, Logo, Seg, useWork } from "../ui";

interface Sug {
  h: string;
  why: string;
  a: string;
  b: string;
  learn?: string;
  para?: number;
  st: 0 | 1 | 2;
  nuevo?: boolean;
}
interface Hallazgo {
  nivel: "alta" | "media" | "bien";
  t: string;
  d: string;
}
interface Historial {
  id: string;
  resumen: string;
  bloques: Bloque[];
  creado_en: string;
}

const PLANT: { k: string; t: string; d: string; c: string; r: string }[] = [
  { k: "oficio", t: "Oficio", d: "Carta formal con el tono de su oficina", c: "k1", r: "26px 40px 26px 34px" },
  { k: "acta", t: "Acta de reunión", d: "Asistentes, orden del día y acuerdos con responsable", c: "k2", r: "40px 26px 34px 26px" },
  { k: "informe", t: "Informe ejecutivo", d: "Resumen, hallazgos y recomendaciones", c: "k3", r: "30px 36px 24px 40px" },
  { k: "circular", t: "Circular", d: "Comunicado breve para varias dependencias", c: "k4", r: "36px 24px 40px 28px" },
];
const hoy = () => new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const ESQUELETO = (tipo: string, nombre: string, dep: string): Bloque[] =>
  tipo === "oficio"
    ? [
        { k: "fecha", t: `Bucaramanga, ${hoy()}` },
        { k: "dest", t: "[Destinatario]\n[Cargo]" },
        { k: "asunto", t: "Asunto: [por completar]" },
        { k: "p", t: "Cordial saludo," },
        { k: "p", t: "[Cuerpo del oficio]" },
        { k: "firma", t: `Atentamente,\n${nombre}\n${dep || "Universidad de Santander"}` },
      ]
    : tipo === "acta"
      ? [{ k: "titulo", t: "Acta n.º [número] · [Comité]" }, { k: "meta", t: `${hoy()} · [lugar o Teams]` }, { k: "h", t: "Asistentes" }, { k: "p", t: "[Nombres]" }, { k: "h", t: "Orden del día" }, { k: "p", t: "1. [Punto]" }, { k: "h", t: "Acuerdos" }, { k: "p", t: "[Responsable] se compromete a [acción] a más tardar el [fecha]." }]
      : tipo === "circular"
        ? [{ k: "titulo", t: "Circular n.º [número]" }, { k: "meta", t: `Para: [dependencias] · De: ${dep || "Planeación Institucional"}` }, { k: "h", t: "Asunto" }, { k: "p", t: "[Asunto en una frase]" }, { k: "h", t: "Disposiciones" }, { k: "p", t: "1. [Disposición]" }]
        : [{ k: "titulo", t: "Informe ejecutivo · [oficina]" }, { k: "meta", t: `Periodo [corte] · Elaborado por ${nombre}` }, { k: "h", t: "Resumen" }, { k: "p", t: "[Resumen en tres líneas]" }, { k: "h", t: "Hallazgos" }, { k: "p", t: "—" }, { k: "h", t: "Recomendaciones" }, { k: "p", t: "—" }];

const clase = (k: string) => (k === "titulo" ? "d-t" : k === "h" ? "d-h" : k === "asunto" ? "asunto" : k === "meta" ? "mono muted" : "");

export function Cowork() {
  const { perfil, toast, ir } = useWork();
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<Pick<Documento, "id" | "titulo" | "tipo" | "actualizado_en">[]>([]);
  const [doc, setDoc] = useState<Documento | null>(null);
  const [version, setVersion] = useState(0);
  const [galeria, setGaleria] = useState(false);
  const [tab, setTab] = useState<"doc" | "cod" | "rev">("doc");
  const [rtab, setRtab] = useState<"sug" | "fu" | "hi">("sug");
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [fuentes, setFuentes] = useState<{ tipo: string; texto: string }[]>([]);
  const [hist, setHist] = useState<Historial[]>([]);
  const [busy, setBusy] = useState("");
  const [pedido, setPedido] = useState("");
  const [pedidoDoc, setPedidoDoc] = useState("");
  const [hall, setHall] = useState<Hallazgo[] | null>(null);
  const [codigo, setCodigo] = useState<{ nombre: string; lenguaje: string; codigo: string; notas: string } | null>(null);
  const [equipos, setEquipos] = useState<{ id: string; nombre: string }[]>([]);
  const [barra, setBarra] = useState<{ x: number; y: number; texto: string; para: number } | null>(null);
  const centro = useRef<HTMLDivElement>(null);
  const guardando = useRef<number>();
  const bloques = useRef<Bloque[]>([]);

  const listar = useCallback(async () => {
    const { data } = await supabase.from("pw_documentos").select("id, titulo, tipo, actualizado_en").eq("user_id", perfil.userId).order("actualizado_en", { ascending: false }).limit(50);
    setDocs((data ?? []) as typeof docs);
  }, [perfil.userId]);

  const abrir = useCallback(async (id: string) => {
    const { data } = await supabase.from("pw_documentos").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    const d = data as Documento;
    bloques.current = d.bloques;
    setDoc(d);
    setVersion((v) => v + 1);
    setSugs([]);
    setFuentes([]);
    setHall(null);
    setGaleria(false);
    const h = await supabase.from("pw_documento_historial").select("id, resumen, bloques, creado_en").eq("documento_id", id).order("creado_en", { ascending: false }).limit(30);
    setHist((h.data ?? []) as Historial[]);
  }, []);

  useEffect(() => {
    void listar();
    void supabase.from("pw_equipo_miembros").select("equipo_id, pw_equipos(nombre)").eq("user_id", perfil.userId).eq("estado", "activo").then(({ data }) => setEquipos((data ?? []).map((x) => ({ id: x.equipo_id as string, nombre: (x.pw_equipos as unknown as { nombre: string } | null)?.nombre ?? "Equipo" }))));
  }, [listar, perfil.userId]);
  useEffect(() => {
    const id = params.get("doc");
    if (id) void abrir(id);
    else setGaleria(true);
  }, [params, abrir]);

  /* Guardado con pausa (lo que se teclea no recarga el texto: el caret no salta). */
  const guardar = (b: Bloque[], titulo?: string) => {
    if (!doc) return;
    bloques.current = b;
    window.clearTimeout(guardando.current);
    guardando.current = window.setTimeout(async () => {
      await supabase.from("pw_documentos").update({ bloques: b, ...(titulo ? { titulo } : {}), actualizado_en: new Date().toISOString() }).eq("id", doc.id);
    }, 700);
  };
  const instantanea = async (resumen: string, antes: Bloque[]) => {
    if (!doc) return;
    const { data } = await supabase.from("pw_documento_historial").insert({ documento_id: doc.id, user_id: perfil.userId, resumen, bloques: antes }).select("id, resumen, bloques, creado_en").single();
    if (data) setHist((h) => [data as Historial, ...h].slice(0, 30));
  };
  const reemplazar = async (b: Bloque[]) => {
    if (!doc) return;
    bloques.current = b;
    setDoc({ ...doc, bloques: b });
    setVersion((v) => v + 1);
    await supabase.from("pw_documentos").update({ bloques: b, actualizado_en: new Date().toISOString() }).eq("id", doc.id);
    void listar();
  };

  /* --- Crear ------------------------------------------------------------------------------------ */
  const crear = async (tipo: string, titulo: string, b: Bloque[]) => {
    const { data, error } = await supabase.from("pw_documentos").insert({ user_id: perfil.userId, titulo, tipo, bloques: b }).select("id").single();
    if (error || !data) return toast("No se pudo crear el documento.");
    void marcarSenal(perfil.userId, `doc:${tipo}`);
    await listar();
    setParams({ doc: data.id as string });
  };
  const redactar = async (tipo: string) => {
    if (pedidoDoc.trim().length < 5) return toast("Cuéntele a Pilo qué necesita (para quién y qué debe lograr).");
    setBusy("redactar");
    try {
      const r = await callWork<{ titulo: string; bloques: Bloque[]; fuentes: { tipo: string; texto: string }[] }>({ action: "redactar", tipo, pedido: pedidoDoc });
      await crear(tipo, r.titulo, r.bloques);
      setFuentes(r.fuentes);
      setPedidoDoc("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo redactar.");
    }
    setBusy("");
  };

  /* --- Sugerencias --------------------------------------------------------------------------------- */
  const sugerir = async () => {
    if (!doc) return;
    setBusy("sugerir");
    try {
      const r = await callWork<{ sugerencias: Omit<Sug, "st">[]; fuentes: { tipo: string; texto: string }[] }>({ action: "sugerir", tipo: doc.tipo, bloques: bloques.current });
      setSugs((s) => [...s.filter((x) => x.st !== 0 || x.para != null), ...r.sugerencias.map((x) => ({ ...x, st: 0 as const }))]);
      setFuentes(r.fuentes);
      setRtab("sug");
      if (!r.sugerencias.length) toast("Pilo no ve nada que mejorar por ahora.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo pedir sugerencias.");
    }
    setBusy("");
  };
  const decidir = async (i: number, aplica: boolean) => {
    const s = sugs[i];
    if (!doc || !s) return;
    if (aplica) {
      const b = bloques.current.map((x) => ({ ...x }));
      const idx = s.para != null && b[s.para]?.t.includes(s.a) ? s.para : b.findIndex((x) => x.t.includes(s.a));
      if (idx < 0) return toast("No pude aplicarlo: ese texto cambió. Edite o pida de nuevo.");
      await instantanea(`Antes de aplicar «${s.h}»`, bloques.current);
      b[idx].t = b[idx].t.replace(s.a, s.b);
      await reemplazar(b);
      if (s.learn) {
        // Pilo propone recordar; la persona decide en Memoria.
        await supabase.from("pw_memoria").insert({ user_id: perfil.userId, texto: s.learn.slice(0, 600), origen: `Aprendido hoy · ${doc.titulo}`, estado: "propuesta", confianza: "nueva" });
        toast("Pilo propone recordar algo nuevo · ver Memoria");
      }
      if (!movimientoReducido()) requestAnimationFrame(() => centro.current && gsap.fromTo(centro.current.querySelectorAll("p")[idx] ?? [], { backgroundColor: "rgba(63,178,103,.4)" }, { backgroundColor: "rgba(0,0,0,0)", duration: 1, ease: "power2.out", clearProps: "backgroundColor" }));
    }
    setSugs((l) => l.map((x, k) => (k === i ? { ...x, st: aplica ? 1 : 2 } : x)));
  };
  const deshacer = async () => {
    const u = hist[0];
    if (!doc || !u) return;
    await reemplazar(u.bloques);
    await supabase.from("pw_documento_historial").delete().eq("id", u.id);
    setHist((h) => h.slice(1));
    toast("Se deshizo el último cambio");
  };

  /* --- Selección → acortar / ampliar / formal ------------------------------------------------------- */
  const sel = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || tab !== "doc") return setBarra(null);
    const texto = s.toString().trim();
    const n = s.anchorNode;
    const p = (n?.nodeType === 1 ? (n as Element) : n?.parentElement)?.closest<HTMLElement>(".sheet p[data-i]");
    if (texto.length < 4 || !p || !centro.current) return setBarra(null);
    const r = s.getRangeAt(0).getBoundingClientRect();
    const c = centro.current.getBoundingClientRect();
    setBarra({ x: Math.max(8, r.left - c.left + centro.current.scrollLeft), y: Math.max(4, r.top - c.top + centro.current.scrollTop - 46), texto, para: Number(p.dataset.i) });
  };
  const transformar = async (accion: "acortar" | "ampliar" | "formal") => {
    if (!barra) return;
    const b = barra;
    setBarra(null);
    window.getSelection()?.removeAllRanges();
    setBusy("transformar");
    try {
      const r = await callWork<{ texto: string }>({ action: "transformar", accion, texto: b.texto });
      if (!r.texto || r.texto === b.texto) toast("Pilo no ve nada que cambiar en ese texto");
      else {
        setSugs((l) => [...l, { h: { acortar: "Acortar", ampliar: "Ampliar", formal: "Más formal" }[accion], why: "Pedido sobre el texto que usted seleccionó", a: b.texto, b: r.texto, para: b.para, st: 0, nuevo: true }]);
        setRtab("sug");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo transformar.");
    }
    setBusy("");
  };

  /* --- Código, revisión, exportar --------------------------------------------------------------------- */
  const generarCodigo = async () => {
    if (pedido.trim().length < 5) return toast("Cuéntele a Pilo qué debe hacer el script.");
    setBusy("codigo");
    try {
      setCodigo(await callWork({ action: "codigo", pedido }));
      void marcarSenal(perfil.userId, "codigo:script");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo generar el código.");
    }
    setBusy("");
  };
  const revisar = async () => {
    if (!doc) return;
    setBusy("revisar");
    try {
      setHall((await callWork<{ hallazgos: Hallazgo[] }>({ action: "revisar", bloques: bloques.current })).hallazgos);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo revisar.");
    }
    setBusy("");
  };
  const exportar = async () => {
    if (!doc) return;
    const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = await import("docx");
    const hijos = bloques.current.flatMap((b) => {
      const lineas = b.t.split("\n");
      if (b.k === "titulo") return [new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 200 }, children: [new TextRun({ text: b.t, bold: true })] })];
      if (b.k === "h") return [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: b.t, bold: true })] })];
      return [new Paragraph({ alignment: b.k === "fecha" ? AlignmentType.RIGHT : AlignmentType.JUSTIFIED, spacing: { after: 160, line: 320 }, children: lineas.flatMap((l, i) => [new TextRun({ text: l, bold: b.k === "asunto", break: i ? 1 : 0, font: "Calibri", size: 22 })]) })];
    });
    const blob = await Packer.toBlob(new Document({ creator: perfil.nombre, title: doc.titulo, sections: [{ children: hijos }] }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.titulo.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]+/g, "").trim() || "documento"}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const compartir = async (equipoId: string) => {
    if (!doc || !equipoId) return;
    await supabase.from("pw_documentos").update({ equipo_id: equipoId }).eq("id", doc.id);
    toast("Compartido con el equipo · Pilo del equipo podrá usarlo");
  };

  const titulos = (doc?.bloques ?? bloques.current).map((b, i) => ({ b, i })).filter(({ b }) => b.k === "h" || b.k === "titulo" || b.k === "asunto");

  return (
    <div className="cow2">
      <aside className="cow2__l" aria-label="Documentos">
        <h3>Documentos</h3>
        <div className="dlist">
          {docs.map((d) => (
            <button key={d.id} type="button" className="doc-i" aria-current={doc?.id === d.id && !galeria} onClick={() => setParams({ doc: d.id })}>
              {IC.doc}
              <span>{d.titulo}</span>
            </button>
          ))}
          <button
            type="button"
            className="doc-i"
            aria-current={galeria}
            onClick={() => {
              setParams({});
              setGaleria(true);
            }}
          >
            {IC.spark}
            <span>Nuevo documento</span>
          </button>
        </div>
        <h3>Estructura</h3>
        <div className="outline">
          {titulos.length ? (
            titulos.map(({ b, i }) => (
              <button key={i} type="button" onClick={() => centro.current?.querySelector(`p[data-i="${i}"]`)?.scrollIntoView({ block: "center", behavior: movimientoReducido() ? "auto" : "smooth" })}>
                {b.t.replace(/^Asunto: /, "")}
              </button>
            ))
          ) : (
            <span className="hint">Sin títulos aún</span>
          )}
        </div>
      </aside>

      <div className="cow2__c" ref={centro} onMouseUp={() => setTimeout(sel, 0)} onKeyUp={(e) => e.shiftKey && sel()}>
        <div className="ctool">
          <Seg valor={tab} onChange={setTab} tab etiqueta="Tipo de trabajo" opciones={[["doc", "Documento"], ["cod", "Código"], ["rev", "Revisión"]]} />
          <span className="sp" />
          <button type="button" className="btn sm" disabled={!hist.length} onClick={() => void deshacer()}>
            Deshacer
          </button>
          {doc && equipos.length > 0 && (
            <select className="inp" style={{ minHeight: 32, width: "auto", fontSize: 12 }} aria-label="Compartir con un equipo" value={doc.equipo_id ?? ""} onChange={(e) => void compartir(e.target.value)}>
              <option value="">Compartir con equipo…</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn sm" disabled={!doc} onClick={() => void exportar()}>
            Exportar .docx
          </button>
        </div>

        {tab === "doc" &&
          (galeria || !doc ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div className="tpls">
                {PLANT.map((t) => (
                  <button key={t.k} type="button" className="tpl" style={{ ["--tb" as string]: `var(--${t.c})`, ["--ts" as string]: `var(--${t.c}s)`, borderRadius: t.r } as CSSProperties} onClick={() => void crear(t.k, `${t.t} nuevo`, ESQUELETO(t.k, perfil.nombre, perfil.dependencia))}>
                    <b>{t.t}</b>
                    <span>{t.d}</span>
                  </button>
                ))}
              </div>
              <div className="box" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
                <h2>O pídale a Pilo que lo redacte</h2>
                <textarea className="inp" value={pedidoDoc} onChange={(e) => setPedidoDoc(e.target.value)} placeholder="Un oficio a Talento Humano pidiendo la certificación de la planta docente 2026-1, para el informe SNIES…" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PLANT.map((t) => (
                    <button key={t.k} type="button" className="btn sm" disabled={busy === "redactar"} onClick={() => void redactar(t.k)}>
                      {busy === "redactar" ? "Redactando…" : `Redactar ${t.t.toLowerCase()}`}
                    </button>
                  ))}
                </div>
                <p className="hint">Pilo usa su memoria y la colectiva. Lo que no sabe lo deja como «[por completar]».</p>
              </div>
            </div>
          ) : (
            <article className="sheet" aria-label={doc.titulo} key={`${doc.id}-${version}`}>
              <header>
                <Logo variante="original" />
                <span className="mono muted">
                  <input
                    className="inp"
                    style={{ minHeight: 26, width: 220, fontSize: 12 }}
                    defaultValue={doc.titulo}
                    aria-label="Título del documento"
                    onChange={(e) => guardar(bloques.current, e.target.value)}
                  />{" "}
                  · borrador
                </span>
              </header>
              {doc.bloques.map((b, i) => (
                <p
                  key={i}
                  data-i={i}
                  className={clase(b.k)}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onInput={(e) => {
                    const nb = bloques.current.map((x) => ({ ...x }));
                    nb[i].t = e.currentTarget.innerText.replace(/\n$/, "");
                    guardar(nb);
                  }}
                >
                  {b.t.split("\n").map((l, j) => (
                    <span key={j}>
                      {j > 0 && <br />}
                      {l}
                    </span>
                  ))}
                </p>
              ))}
            </article>
          ))}

        {tab === "cod" && (
          <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 12 }}>
            <div className="box">
              <h2>Pídale un script a Pilo</h2>
              <textarea className="inp" value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Un script de Python que consolide todos los libros de Excel de una carpeta en uno solo" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="btn primary" disabled={busy === "codigo"} onClick={() => void generarCodigo()}>
                  {busy === "codigo" ? "Escribiendo…" : "Generar código"}
                </button>
                <span className="hint">Pilo no ejecuta código por usted: lo revisa y usted decide.</span>
              </div>
            </div>
            {codigo && (
              <>
                <pre className="code">
                  <span className="c"># {codigo.nombre} · generado por Pilo · se ejecuta en su equipo</span>
                  {"\n"}
                  {codigo.codigo}
                </pre>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(codigo.codigo);
                      toast("Código copiado");
                    }}
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([codigo.codigo], { type: "text/plain" }));
                      a.download = codigo.nombre;
                      a.click();
                    }}
                  >
                    Descargar
                  </button>
                  <span className="hint">{codigo.notas}</span>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "rev" && (
          <div className="finds">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="btn primary" disabled={!doc || busy === "revisar"} onClick={() => void revisar()}>
                {busy === "revisar" ? "Revisando…" : "Revisar este documento"}
              </button>
              <span className="hint">Contra su memoria y la de la oficina.</span>
            </div>
            {hall?.map((h, i) => (
              <div className="find" key={i}>
                <span className={`badge ${h.nivel === "alta" ? "risk" : h.nivel === "media" ? "warn" : "ok"}`}>{h.nivel === "alta" ? "Alta" : h.nivel === "media" ? "Media" : "Bien"}</span>
                <div>
                  <b>{h.t}</b>
                  <p className="small muted">{h.d}</p>
                </div>
                <button type="button" className="btn sm" onClick={() => setTab("doc")}>
                  Ver
                </button>
              </div>
            ))}
            {hall && !hall.length && <p className="muted">Sin hallazgos.</p>}
          </div>
        )}

        {barra && (
          <div className="selbar" role="toolbar" aria-label="Pedir a Pilo sobre el texto seleccionado" style={{ top: barra.y, left: barra.x }}>
            {(["acortar", "ampliar", "formal"] as const).map((a) => (
              <button key={a} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void transformar(a)}>
                {{ acortar: "Acortar", ampliar: "Ampliar", formal: "Más formal" }[a]}
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="cow2__r" aria-label="Pilo en este documento">
        <div className="side__h">
          <Cara mood={busy ? "piensa" : "idea"} />
          <b>Pilo en este documento</b>
        </div>
        <div>
          <Seg valor={rtab} onChange={setRtab} tab etiqueta="Panel de Pilo" opciones={[["sug", "Sugerencias"], ["fu", "Fuentes"], ["hi", "Historial"]]} />
          <div className="side__b2">
            {rtab === "sug" && (
              <>
                <button type="button" className="btn sm primary" disabled={!doc || Boolean(busy)} onClick={() => void sugerir()}>
                  {busy === "sugerir" ? "Pilo está leyendo…" : sugs.length ? "Pedir más sugerencias" : "Pedir sugerencias a Pilo"}
                </button>
                {!sugs.length && <p className="hint">Seleccione un texto y pida a Pilo que lo acorte, amplíe o formalice; o pida una revisión completa.</p>}
                {sugs.map((s, i) => (
                  <div className={`sg${s.st ? " done" : ""}${!s.st && s.nuevo ? " new" : ""}`} key={i}>
                    <h4>
                      {s.h} {s.st === 1 && <span className="badge ok">Aplicado</span>} {s.st === 2 && <span className="badge">Omitido</span>}
                    </h4>
                    <div className="diff">
                      <span>
                        <del>{s.a}</del>
                      </span>
                      <span>
                        <ins>{s.b}</ins>
                      </span>
                    </div>
                    <p className="why">{s.why}</p>
                    {!s.st && (
                      <div className="acts">
                        <button type="button" className="btn sm primary" onClick={() => void decidir(i, true)}>
                          Aplicar
                        </button>
                        <button type="button" className="btn sm" onClick={() => void decidir(i, false)}>
                          Omitir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {rtab === "fu" && (
              <>
                <p className="hint">Lo que Pilo usó para sugerir cambios en este documento.</p>
                {fuentes.map((f, i) => (
                  <div className="sg" key={i}>
                    <span className="badge blue" style={{ width: "fit-content" }}>
                      {f.tipo}
                    </span>
                    <p style={{ fontSize: 12.5 }}>{f.texto}</p>
                  </div>
                ))}
                {!fuentes.length && <p className="hint">Aún no se pidieron sugerencias.</p>}
                <p className="hint">No se usó ningún archivo de su equipo en este documento.</p>
              </>
            )}
            {rtab === "hi" && (
              <ul className="hist">
                {!hist.length && (
                  <li>
                    <span />
                    <span className="muted">Todavía no hay cambios. Aplique una sugerencia.</span>
                  </li>
                )}
                {hist.map((h) => (
                  <li key={h.id}>
                    <time>{hace(h.creado_en)}</time>
                    <span>{h.resumen}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="side__h" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
          <button type="button" className="btn sm ghost" onClick={() => ir("chat")}>
            Seguir en el chat
          </button>
        </div>
      </aside>
    </div>
  );
}
