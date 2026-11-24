/* =============================================================================
   Informes Institucionales · Galería Institucional.

   Dos piezas sobre las mismas miniaturas:
     SelectorGaleria   dentro de «Personalizar portada»: cualquier persona elige
                       una imagen aprobada (o la de siempre, que va primero).
     GaleriaAdmin      solo del administrador: carga, renombra, oculta y quita.

   Movimiento (GSAP): las miniaturas entran escalonadas (opacidad y 8 px de
   subida, 220 ms, ease-out fuerte, 30 ms entre una y otra) solo la primera vez
   que se pinta cada grupo; nunca al elegir. Con prefers-reduced-motion no hay
   movimiento. Elegir no se anima: es una acción repetida.
   ========================================================================== */

import { useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { BUCKET_GALERIA, MAX_PORTADA, useCambiarGaleria, useGaleria, useQuitarDeGaleria, useSubirAGaleria, useUrlImagen } from "../datos";
import type { ImagenGaleria } from "../datos";
import { Aviso as AvisoError, Cargando, Vacio, mensajeDe } from "../ui/comunes";

gsap.registerPlugin(useGSAP);

/** La foto de siempre del boletín: va primera y no depende de la base. */
export const FOTO_BASE = { ruta: "", src: "/boletin/portada.jpg", titulo: "Edificios UDES" } as const;

/** Entrada escalonada de las miniaturas dentro de `scope`; sin movimiento si la persona lo pidió. */
function useEntrada(scope: React.RefObject<HTMLElement | null>, listo: boolean) {
  useGSAP(
    () => {
      if (!listo) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".vi-gal-t", { opacity: 0, y: 8, duration: 0.22, ease: "power3.out", stagger: 0.03, clearProps: "opacity,transform" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [listo] },
  );
}

function Miniatura({ ruta, src, alt }: { ruta?: string; src?: string; alt: string }) {
  const q = useUrlImagen(src ? null : ruta, BUCKET_GALERIA);
  const url = src ?? q.data ?? null;
  return url ? <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} /> : <span className="vi-gal-vacia" aria-hidden="true" />;
}

/* ---------- Selector, dentro de la portada ---------- */

export function SelectorGaleria({ valor, onElegir, deshabilitado }: { valor: string; onElegir: (ruta: string) => void; deshabilitado?: boolean }) {
  const q = useGaleria();
  const caja = useRef<HTMLDivElement>(null);
  const activas = (q.data ?? []).filter((i) => i.activa);
  useEntrada(caja, !q.isPending);
  return (
    <fieldset disabled={deshabilitado}>
      <legend id="vi-gal">Galería Institucional</legend>
      <div ref={caja} className="vi-gal" role="radiogroup" aria-labelledby="vi-gal">
        {[{ id: "base", ruta: "", titulo: FOTO_BASE.titulo, src: FOTO_BASE.src as string | undefined }, ...activas.map((i) => ({ id: i.id, ruta: i.ruta, titulo: i.titulo || "Imagen de la galería", src: undefined }))].map((i) => (
          <label key={i.id} className="vi-gal-t">
            <input type="radio" name="vi-galeria" checked={valor === i.ruta} onChange={() => onElegir(i.ruta)} aria-label={i.titulo} />
            <span className="vi-gal-marco">
              <Miniatura ruta={i.ruta} src={i.src} alt="" />
            </span>
            <span className="vi-gal-nom">{i.titulo}</span>
          </label>
        ))}
      </div>
      {q.isError && <p className="vi-hint">No se pudo leer la galería. Se usa la foto predeterminada.</p>}
      {!q.isPending && !q.isError && activas.length === 0 && <p className="vi-hint">Planeación todavía no ha aprobado otras imágenes. Mientras tanto puede subir una propia.</p>}
    </fieldset>
  );
}

/* ---------- Administración (solo el administrador) ---------- */

export function GaleriaAdmin() {
  const q = useGaleria();
  const subir = useSubirAGaleria();
  const cambiar = useCambiarGaleria();
  const quitar = useQuitarDeGaleria();
  const input = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [titulo, setTitulo] = useState("");
  const [error, setError] = useState("");
  useEntrada(caja, !q.isPending);

  const cargar = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setError("");
    for (const archivo of Array.from(archivos)) {
      try {
        await subir.mutateAsync({ archivo, titulo: archivos.length === 1 ? titulo : archivo.name.replace(/\.[^.]+$/, "") });
      } catch (e) {
        setError(mensajeDe(e));
        break;
      }
    }
    setTitulo("");
  };

  if (q.isPending) return <Cargando texto="Cargando la galería…" />;
  if (q.error) return <AvisoError error={q.error} />;
  const imagenes = q.data ?? [];

  return (
    <div className="vi-galadm" style={{ display: "grid", gap: 16 }}>
      <section className="vi-galadm-carga">
        <div style={{ display: "grid", gap: 4, flex: "1 1 220px" }}>
          <label className="vi-lab" htmlFor="vi-gal-titulo">
            Nombre de la imagen (opcional)
          </label>
          <input id="vi-gal-titulo" className="inf-in" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Campus Bucaramanga, fachada" />
        </div>
        <button type="button" className="inf-btn inf-btn--pri" disabled={subir.isPending} onClick={() => input.current?.click()}>
          {subir.isPending ? "Subiendo…" : "Cargar imágenes"}
        </button>
        <input ref={input} type="file" multiple hidden accept="image/png,image/jpeg,image/webp" aria-label="Cargar imágenes a la galería" onChange={(e) => { void cargar(e.target.files); e.target.value = ""; }} />
        <p className="vi-hint" style={{ flexBasis: "100%", margin: 0 }}>
          JPG, PNG o WebP, hasta {MAX_PORTADA / 1024 / 1024} MB cada una. Use fotos horizontales y sin texto: el título va sobre fondo blanco. Lo que cargue queda disponible para todas las unidades.
        </p>
        {error && <p className="vi-msg" role="alert" data-error="true">{error}</p>}
      </section>

      {imagenes.length === 0 ? (
        <Vacio>La galería está vacía. Cargue las primeras imágenes aprobadas.</Vacio>
      ) : (
        <div ref={caja} className="vi-galadm-grid">
          {imagenes.map((i) => (
            <FilaGaleria key={i.id} img={i} onCambiar={(c) => cambiar.mutate({ id: i.id, cambios: c })} onQuitar={() => { if (window.confirm(`¿Quitar «${i.titulo || "esta imagen"}» de la galería? Los informes que ya la usan volverán a la foto predeterminada.`)) quitar.mutate(i); }} />
          ))}
        </div>
      )}
      {(cambiar.error || quitar.error) && <p className="vi-msg" role="alert" data-error="true">{mensajeDe(cambiar.error ?? quitar.error)}</p>}
    </div>
  );
}

function FilaGaleria({ img, onCambiar, onQuitar }: { img: ImagenGaleria; onCambiar: (c: Partial<Pick<ImagenGaleria, "titulo" | "activa">>) => void; onQuitar: () => void }) {
  return (
    <article className="vi-gal-t vi-galadm-t" data-activa={img.activa}>
      <span className="vi-gal-marco">
        <Miniatura ruta={img.ruta} alt={img.titulo} />
      </span>
      <input className="inf-in" aria-label="Nombre de la imagen" defaultValue={img.titulo} maxLength={80} onBlur={(e) => e.target.value.trim() !== img.titulo && onCambiar({ titulo: e.target.value.trim() })} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="inf-btn inf-btn--sm" aria-pressed={img.activa} onClick={() => onCambiar({ activa: !img.activa })}>
          {img.activa ? "Ocultar" : "Publicar"}
        </button>
        <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={onQuitar}>
          Quitar
        </button>
      </div>
    </article>
  );
}
