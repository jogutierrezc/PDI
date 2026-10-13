/* =============================================================================
   Informes ODS con Pilo · 3. Fotografías: la biblioteca de las notas.

   Pilo solo toma imágenes de las noticias: no genera ni modifica ninguna.
   Aquí están TODAS las imágenes de las notas aprobadas del ODS (news_images,
   0146; varias por nota), agrupadas por nota, con lo que Pilo ya organizó
   (cuáles usa y en qué ranura: portada, junto al texto 1 y 2, galería) y la
   posibilidad de cambiarlo a mano. Cada imagen muestra su tamaño, si es una
   pieza gráfica (afiche), el aviso de menores con la casilla de autorización
   y el crédito original de la nota. El recorte (punto de interés y
   proporción) se aplica igual en el portal.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { piloFotos, useGuardarFoto, useImagenesDeOds, useNoticiasDeOds } from "./datos";
import type { NoticiaOds } from "./datos";
import { FaltaMigracion } from "../noticias";
import type { Foto, ImagenNota, InformeCompleto, ProporcionFoto, RanuraFoto, Recorte } from "./tipos";
import { PROPORCIONES, PROPORCIONES_RANURA, RECORTE_INICIAL, estiloRecorte, fechaCorta, normalizarRecorte, puntoDesde, ventanaRecorte } from "./recorte";

export const RANURAS: { id: RanuraFoto; label: string }[] = [
  { id: "portada", label: "Portada (franja ancha)" },
  { id: "n1", label: "Junto al texto 1" },
  { id: "n2", label: "Junto al texto 2" },
  { id: "galeria", label: "Galería" },
];

export const AVISO_IMAGENES = "Pilo solo toma imágenes de las noticias; no genera ni modifica imágenes.";

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** ¿Puede usarse en el informe? Una pieza con menores necesita la autorización confirmada. */
export function fotoPublicable(f: Pick<Foto, "minors" | "cleared">): boolean {
  return !f.minors || f.cleared;
}

/** La ficha (ods_report_photos) de una imagen: por su id o, la portada de la nota, por la nota (0145). */
export function fotoDeImagen(img: Pick<ImagenNota, "id" | "news_id" | "is_cover">, fotos: Foto[]): Foto | undefined {
  return fotos.find((f) => f.image_id === img.id) ?? (img.is_cover ? fotos.find((f) => f.news_id === img.news_id && !f.image_id) : undefined);
}

/** Una ficha nueva a partir de una imagen de la nota: con su pie, alt y crédito originales. */
export function fichaDesdeImagen(report_id: string, img: ImagenNota): Foto {
  return {
    report_id,
    news_id: img.news_id,
    image_id: img.id,
    use: img.kind === "foto" && !img.minors,
    slot: "galeria",
    caption: img.caption,
    alt: img.alt,
    credit: img.credit,
    kind: img.kind,
    minors: img.minors,
    cleared: false,
    crop: RECORTE_INICIAL,
  };
}

/** Las imágenes por nota: primero las notas con fotos en el informe, luego por fecha. */
export function agruparImagenes(imgs: ImagenNota[], fotos: Foto[], notas: Map<string, Pick<NoticiaOds, "published_on">>): [string, ImagenNota[]][] {
  const g = new Map<string, ImagenNota[]>();
  for (const i of imgs.slice().sort((a, b) => a.pos - b.pos)) g.set(i.news_id, [...(g.get(i.news_id) ?? []), i]);
  const enUso = (id: string) => fotos.some((f) => f.news_id === id && f.use);
  return [...g.entries()].sort(([a], [b]) => Number(enUso(b)) - Number(enUso(a)) || String(notas.get(b)?.published_on ?? "").localeCompare(String(notas.get(a)?.published_on ?? "")));
}

type Filtro = "todas" | "uso";

export function InformeFotos({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const notasQ = useNoticiasDeOds(inf.ods);
  const imgsQ = useImagenesDeOds(inf.ods);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const guardar = useGuardarFoto();
  const cliente = useQueryClient();
  const [pilo, setPilo] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const escribir = (f: Foto, c: Partial<Foto>) => {
    setError("");
    guardar.mutate({ ...f, ...c }, { onError: (e) => setError(`No se guardó la fotografía: ${errorTexto(e)}`) });
  };
  const ranura = (f: Foto, slot: RanuraFoto) => {
    escribir(f, { slot });
    /* Portada y las dos del texto son de una sola foto: la que estaba pasa a la galería. */
    if (slot !== "galeria") for (const o of completo.fotos) if ((o.image_id ?? o.news_id) !== (f.image_id ?? f.news_id) && o.slot === slot) escribir(o, { slot: "galeria" });
  };
  const organizar = async () => {
    setPilo(true);
    setError("");
    try {
      const r = await piloFotos({ report_id: inf.id });
      setAviso([r.aviso || `Pilo organizó ${r.propuestas} fotos${r.en_uso !== undefined ? ` (${r.en_uso} en uso)` : ""}.`, ...(r.avisos ?? [])].filter(Boolean).join(" "));
      void cliente.invalidateQueries({ queryKey: ["informe"] });
    } catch (e) {
      setError(`Pilo no pudo organizar las fotografías: ${errorTexto(e)}`);
    } finally {
      setPilo(false);
    }
  };

  const imgs = imgsQ.data ?? [];
  const grupos = agruparImagenes(imgs, completo.fotos, notas).filter(([, xs]) => filtro === "todas" || xs.some((i) => fotoDeImagen(i, completo.fotos)?.use));
  const usadas = completo.fotos.filter((f) => f.use).length;
  /* Antes de 0146 (o sin imágenes cargadas) quedan las fichas de siempre, con la portada de la nota. */
  const sinBiblioteca = !imgs.length && completo.fotos.length > 0;

  return (
    <div className="ri-photos">
      <p className="ri-nogen" role="note">
        <b>{AVISO_IMAGENES}</b> Las organiza: elige cuáles ilustran el informe y dónde van; tú puedes cambiarlo todo.
      </p>
      <div className="ri-edhead">
        <p className="ri-lead">
          {imgs.length} imágenes de {new Set(imgs.map((i) => i.news_id)).size} notas · {usadas} en el informe. Haz clic o arrastra sobre una imagen en uso para fijar lo
          importante del recorte.
        </p>
        <div className="ri-row">
          <div className="ri-seg" role="group" aria-label="Qué imágenes ver">
            <button type="button" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>
              Todas
            </button>
            <button type="button" aria-pressed={filtro === "uso"} onClick={() => setFiltro("uso")}>
              En el informe
            </button>
          </div>
          <button type="button" className="button-secondary rk-sm ri-pilo-btn" disabled={pilo} onClick={() => void organizar()}>
            {pilo ? "Pilo está organizando…" : "Que Pilo vuelva a organizar las fotos"}
          </button>
        </div>
      </div>
      {aviso && (
        <p className="ri-gap" role="status">
          {aviso} Revisa en cada una si es fotografía o pieza gráfica y si aparecen menores de edad.
        </p>
      )}
      {error && (
        <p className="ri-error" role="alert">
          {error}
        </p>
      )}
      {imgsQ.error && !(imgsQ.error instanceof FaltaMigracion) && <p className="ri-error">No se pudieron leer las imágenes de las notas: {errorTexto(imgsQ.error)}</p>}
      {imgsQ.error instanceof FaltaMigracion && <p className="ri-gap">{imgsQ.error.message}</p>}
      {!imgs.length && !completo.fotos.length && !imgsQ.isPending && <p className="ri-gap">Todavía no hay imágenes. Pilo las trae de las notas aprobadas de este ODS al redactar.</p>}

      {sinBiblioteca ? (
        <div className="ri-pgrid">
          {completo.fotos.map((f) => (
            <TarjetaFoto key={f.image_id ?? f.news_id} f={f} src={notas.get(f.news_id)?.image_url ?? null} titulo={notas.get(f.news_id)?.title} guardando={guardar.isPending} onCambio={(c) => escribir(f, c)} onRanura={(s) => ranura(f, s)} />
          ))}
        </div>
      ) : (
        grupos.map(([id, xs]) => {
          const n = notas.get(id);
          const enUso = xs.filter((i) => fotoDeImagen(i, completo.fotos)?.use).length;
          return (
            <section key={id} className="ri-pgroup" aria-label={n?.title ?? "Nota"}>
              <header className="ri-pgroup__hd">
                <b>{n?.title ?? "Nota"}</b>
                <small>
                  {[fechaCorta(n?.published_on), n?.section, `${xs.length} ${xs.length === 1 ? "imagen" : "imágenes"}`, enUso ? `${enUso} en el informe` : ""].filter(Boolean).join(" · ")}
                </small>
              </header>
              <div className="ri-pgrid">
                {xs.map((img) => {
                  const f = fotoDeImagen(img, completo.fotos);
                  return f ? (
                    <TarjetaFoto key={img.id} f={f} img={img} src={img.url} titulo={n?.title} guardando={guardar.isPending} onCambio={(c) => escribir(f, c)} onRanura={(s) => ranura(f, s)} />
                  ) : (
                    <ImagenLibre key={img.id} img={img} guardando={guardar.isPending} onUsar={() => escribir(fichaDesdeImagen(inf.id, img), {})} />
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

/** Tamaño de la imagen, si se conoce. */
const tamano = (img?: Pick<ImagenNota, "width" | "height">) => (img?.width && img.height ? `${img.width} × ${img.height}` : "");

/** Una imagen de la nota que el informe aún no usa. */
function ImagenLibre({ img, guardando, onUsar }: { img: ImagenNota; guardando: boolean; onUsar: () => void }) {
  return (
    <article className="ri-ph ri-ph--libre" aria-label={img.alt || img.caption || "Imagen de la nota"}>
      <div className="ri-ph__im">
        <img src={img.url} alt={img.alt || img.caption || ""} loading="lazy" referrerPolicy="no-referrer" />
        {tamano(img) && <span className="ri-ph__dim">{tamano(img)}</span>}
      </div>
      <div className="ri-ph__b">
        <div className="ri-row">
          <span className="ri-tag" data-tono={img.kind === "foto" ? "ok" : "warn"}>
            {img.kind === "foto" ? "Fotografía" : "Pieza gráfica (afiche)"}
          </span>
          {img.is_cover && (
            <span className="ri-tag" data-tono="mute">
              Portada de la nota
            </span>
          )}
          {img.minors && (
            <span className="ri-tag" data-tono="bad">
              Menores de edad
            </span>
          )}
        </div>
        {img.caption && <p className="ri-mute">{img.caption}</p>}
        <p className="ri-mute">Crédito: {img.credit || "sin crédito en la nota"}</p>
        <button type="button" className="button-ghost rk-sm" disabled={guardando} onClick={onUsar}>
          Usar esta imagen
        </button>
      </div>
    </article>
  );
}
function Campo({ label, valor, onGuardar }: { label: string; valor: string; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <label className="ri-field">
      {label}
      <input type="text" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== valor && onGuardar(v.trim())} />
    </label>
  );
}

function TarjetaFoto({
  f,
  img,
  src,
  titulo,
  guardando,
  onCambio,
  onRanura,
}: {
  f: Foto;
  img?: ImagenNota;
  src: string | null;
  titulo?: string;
  guardando: boolean;
  onCambio: (c: Partial<Foto>) => void;
  onRanura: (s: RanuraFoto) => void;
}) {
  const ok = fotoPublicable(f) && f.kind === "foto";
  return (
    <article className="ri-ph" data-on={f.use ? "" : undefined} aria-label={titulo ?? "Fotografía"}>
      {src ? (
        <Recortador src={src} alt={f.alt} crop={normalizarRecorte(f.crop)} slot={f.slot} onCambiar={(crop) => onCambio({ crop })} />
      ) : (
        <p className="ri-gap">La nota no tiene imagen.</p>
      )}
      <div className="ri-ph__b">
        <span className="ri-row ri-ph__meta">
          {tamano(img) && <span className="ri-mute">{tamano(img)} px</span>}
          {img?.is_cover && <span className="ri-mute">Portada de la nota</span>}
          {img?.credit && <span className="ri-mute">Crédito original: {img.credit}</span>}
        </span>
        <div className="ri-row">
          <div className="ri-seg" role="group" aria-label="Qué es la imagen">
            <button type="button" aria-pressed={f.kind === "foto"} disabled={guardando} onClick={() => onCambio({ kind: "foto" })}>
              Fotografía
            </button>
            <button type="button" aria-pressed={f.kind === "grafica"} disabled={guardando} onClick={() => onCambio({ kind: "grafica", use: false })}>
              Pieza gráfica
            </button>
          </div>
          {f.minors && (
            <span className="ri-tag" data-tono={f.cleared ? "ok" : "bad"}>
              Menores de edad
            </span>
          )}
        </div>
        <label className="ri-use ri-use--sm">
          <input type="checkbox" checked={f.minors} disabled={guardando} onChange={(e) => onCambio({ minors: e.target.checked, cleared: false, use: e.target.checked ? false : f.use })} />
          Aparecen niñas, niños o adolescentes
        </label>
        {f.kind === "grafica" && <p className="ri-warn">Es una pieza con texto, no una fotografía. Sirve para la noticia, no para ilustrar el informe.</p>}
        {f.minors && (
          <>
            <p className="ri-bad">Aparecen niñas, niños o adolescentes. Úsala solo con la autorización de imagen de la UDES; nunca va en una página de evidencia.</p>
            <label className="ri-use">
              <input type="checkbox" checked={f.cleared} disabled={guardando} onChange={(e) => onCambio({ cleared: e.target.checked, use: e.target.checked ? f.use : false })} />
              Tengo la autorización de imagen
            </label>
          </>
        )}
        <label className="ri-use">
          <input type="checkbox" checked={f.use && ok} disabled={guardando || !ok} onChange={(e) => onCambio({ use: e.target.checked })} />
          Usar en el informe
        </label>
        <label className="ri-field">
          Dónde va
          <select value={f.slot} disabled={guardando} onChange={(e) => onRanura(e.target.value as RanuraFoto)}>
            {RANURAS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Campo label="Pie de foto" valor={f.caption} onGuardar={(caption) => onCambio({ caption })} />
        <Campo label="Texto alternativo (qué se ve)" valor={f.alt} onGuardar={(alt) => onCambio({ alt })} />
        <Campo label="Crédito" valor={f.credit} onGuardar={(credit) => onCambio({ credit })} />
      </div>
    </article>
  );
}

/* ---------- El recortador ---------------------------------------------------------- */

export function Recortador({ src, alt, crop, slot, onCambiar }: { src: string; alt: string; crop: Recorte; slot: RanuraFoto; onCambiar: (c: Recorte) => void }) {
  const [local, setLocal] = useState<Recorte>(crop);
  const [prop, setProp] = useState(3);
  const arrastre = useRef(false);
  useEffect(() => setLocal(crop), [crop.fx, crop.fy, crop.ratio]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = ventanaRecorte(prop, local);
  const admite = PROPORCIONES_RANURA[slot];

  const punto = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { ...local, ...puntoDesde(e.clientX - r.left, e.clientY - r.top, r.width, r.height) };
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    arrastre.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLocal(punto(e));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastre.current) setLocal(punto(e));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!arrastre.current) return;
    arrastre.current = false;
    const c = punto(e);
    setLocal(c);
    onCambiar(c);
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    const k = m[e.key];
    if (!k) return;
    e.preventDefault();
    setLocal(normalizarRecorte({ ...local, fx: local.fx + k[0], fy: local.fy + k[1] }));
  };
  const soltarTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.startsWith("Arrow")) onCambiar(local);
  };
  const ratio = (r: ProporcionFoto) => {
    const c = { ...local, ratio: r };
    setLocal(c);
    onCambiar(c);
  };

  return (
    <div className="ri-crop">
      <div
        className="ri-crop__stage"
        tabIndex={0}
        role="group"
        aria-label={`Punto de interés: ${Math.round(local.fx * 100)} % horizontal, ${Math.round(local.fy * 100)} % vertical. Flechas para moverlo.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (arrastre.current = false)}
        onKeyDown={teclas}
        onKeyUp={soltarTecla}
      >
        <img src={src} alt={alt} draggable={false} referrerPolicy="no-referrer" onLoad={(e) => e.currentTarget.naturalHeight && setProp(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
        <span className="ri-crop__win" aria-hidden="true" style={{ left: `${v.left * 100}%`, top: `${v.top * 100}%`, width: `${v.width * 100}%`, height: `${v.height * 100}%` }} />
        <span className="ri-crop__dot" aria-hidden="true" style={{ left: `${local.fx * 100}%`, top: `${local.fy * 100}%` }} />
      </div>
      <div className="ri-crop__bar">
        <div className="ri-seg" role="group" aria-label="Proporción del recorte">
          {PROPORCIONES.map((r) => (
            <button key={r} type="button" aria-pressed={local.ratio === r} onClick={() => ratio(r)}>
              {r}
            </button>
          ))}
        </div>
        {!admite.includes(local.ratio) && <span className="ri-mute">En esta ranura se ve en {admite.join(" o ")}.</span>}
      </div>
      <div className="ri-crop__prev">
        <img src={src} alt="" style={estiloRecorte(local)} referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}
