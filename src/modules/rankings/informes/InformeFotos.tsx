/* =============================================================================
   Informes ODS con Pilo · 3. Fotografías.

   Pilo toma la imagen principal de cada nota aprobada y la valora: fotografía
   o pieza gráfica, y si aparecen menores de edad. La persona elige cuáles
   ilustran el informe, dónde van, ajusta pie, texto alternativo y crédito, y
   recorta: un clic (o arrastrar) fija el punto de interés y la proporción
   decide la ventana. Las imágenes de las noticias llegan en 3:1; el recorte se
   aplica igual en el portal (portada ancha, dentro del texto, galería).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { piloFotos, useGuardarFoto, useNoticiasDeOds } from "./datos";
import type { NoticiaOds } from "./datos";
import type { Foto, InformeCompleto, ProporcionFoto, RanuraFoto, Recorte } from "./tipos";
import { PROPORCIONES, PROPORCIONES_RANURA, estiloRecorte, normalizarRecorte, puntoDesde, ventanaRecorte } from "./recorte";

export const RANURAS: { id: RanuraFoto; label: string }[] = [
  { id: "portada", label: "Portada (franja ancha)" },
  { id: "n1", label: "Junto al texto 1" },
  { id: "n2", label: "Junto al texto 2" },
  { id: "galeria", label: "Galería" },
];

const errorTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** ¿Puede usarse en el informe? Una pieza con menores necesita la autorización confirmada. */
export function fotoPublicable(f: Pick<Foto, "minors" | "cleared">): boolean {
  return !f.minors || f.cleared;
}

export function InformeFotos({ completo }: { completo: InformeCompleto }) {
  const inf = completo.informe;
  const notasQ = useNoticiasDeOds(inf.ods);
  const notas = useMemo(() => new Map((notasQ.data ?? []).map((n) => [n.id, n])), [notasQ.data]);
  const guardar = useGuardarFoto();
  const cliente = useQueryClient();
  const [pilo, setPilo] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const escribir = (f: Foto, c: Partial<Foto>) => {
    setError("");
    guardar.mutate({ ...f, ...c }, { onError: (e) => setError(`No se guardó la fotografía: ${errorTexto(e)}`) });
  };
  const ranura = (f: Foto, slot: RanuraFoto) => {
    escribir(f, { slot });
    /* Portada y las dos del texto son de una sola foto: la que estaba pasa a la galería. */
    if (slot !== "galeria") for (const o of completo.fotos) if (o.news_id !== f.news_id && o.slot === slot) escribir(o, { slot: "galeria" });
  };
  const valorar = async () => {
    setPilo(true);
    setError("");
    try {
      const r = await piloFotos({ report_id: inf.id });
      setAviso(r.aviso || `Pilo preparó ${r.propuestas} fichas.`);
      void cliente.invalidateQueries({ queryKey: ["informe"] });
    } catch (e) {
      setError(`Pilo no pudo valorar las fotografías: ${errorTexto(e)}`);
    } finally {
      setPilo(false);
    }
  };

  const usadas = completo.fotos.filter((f) => f.use).length;

  return (
    <div className="ri-photos">
      <div className="ri-edhead">
        <p className="ri-lead">
          Elige cuáles ilustran el informe y dónde van ({usadas} en uso). Pilo escribe el pie y el texto alternativo; tú los ajustas. Haz clic o arrastra sobre la
          imagen para fijar lo importante.
        </p>
        <button type="button" className="button-secondary rk-sm ri-pilo-btn" disabled={pilo} onClick={() => void valorar()}>
          {pilo ? "Pilo está mirando las fotos…" : completo.fotos.length ? "Que Pilo vuelva a valorarlas" : "Que Pilo traiga las fotografías"}
        </button>
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
      {!completo.fotos.length && <p className="ri-gap">Todavía no hay fotografías. Pilo las toma de las notas aprobadas de este ODS.</p>}
      <div className="ri-pgrid">
        {completo.fotos.map((f) => (
          <TarjetaFoto key={f.news_id} f={f} nota={notas.get(f.news_id)} guardando={guardar.isPending} onCambio={(c) => escribir(f, c)} onRanura={(s) => ranura(f, s)} />
        ))}
      </div>
    </div>
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

function TarjetaFoto({ f, nota, guardando, onCambio, onRanura }: { f: Foto; nota?: NoticiaOds; guardando: boolean; onCambio: (c: Partial<Foto>) => void; onRanura: (s: RanuraFoto) => void }) {
  const ok = fotoPublicable(f) && f.kind === "foto";
  return (
    <article className="ri-ph" data-on={f.use ? "" : undefined} aria-label={nota?.title ?? "Fotografía"}>
      {nota?.image_url ? (
        <Recortador src={nota.image_url} alt={f.alt} crop={normalizarRecorte(f.crop)} slot={f.slot} onCambiar={(crop) => onCambio({ crop })} />
      ) : (
        <p className="ri-gap">La nota no tiene imagen.</p>
      )}
      <div className="ri-ph__b">
        <b className="ri-ph__t">{nota?.title ?? "Nota no disponible"}</b>
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
