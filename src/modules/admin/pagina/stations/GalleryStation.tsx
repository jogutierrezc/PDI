/* =============================================================================
   Estación 2 · Galería.

   Las fotografías de la oficina, en el orden en que se recorren. Cada una pide
   su texto alternativo antes de publicarse: una foto sin él es una foto que no
   existe para quien no la ve, y son cuatro palabras.

   El archivo se sube al bucket en cuanto se elige, no al guardar. Así la miniatura
   aparece de inmediato y el pie se escribe mirando la foto, que es como se
   escriben los pies.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { officePhotoUrl, uid } from "../../../planeacion/page";
import type { GallerySlide } from "../../../planeacion/page";
import { ConfirmButton, Panel } from "../../udes-en-cifras/ui";
import { Text } from "../fields";
import { MAX_PHOTO_BYTES, formatBytes, removeOfficePhoto, uploadOfficePhoto } from "../store";
import type { OfficeStationProps } from "../OfficePageAdmin";

export function GalleryStation({ draft, patch, canEdit, notify, fail }: OfficeStationProps) {
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const slides = draft.gallery.slides;

  const setSlides = (next: GallerySlide[]) =>
    patch((page) => ({ ...page, gallery: { ...page.gallery, slides: next } }));

  const update = (id: string, change: Partial<GallerySlide>) =>
    setSlides(slides.map((slide) => (slide.id === id ? { ...slide, ...change } : slide)));

  const move = (index: number, step: -1 | 1) => {
    const target = index + step;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next);
  };

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: GallerySlide[] = [];
      for (const file of Array.from(files)) {
        const photo = await uploadOfficePhoto("galeria", file);
        added.push({ id: uid(), photo, alt: "", title: "", caption: "", to: "", toLabel: "" });
      }
      setSlides([...slides, ...added]);
      notify(
        added.length === 1
          ? "Fotografía subida. Escribe su texto alternativo antes de publicar."
          : `${added.length} fotografías subidas. Escribe el texto alternativo de cada una.`,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : "No se pudo subir la fotografía.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  async function remove(slide: GallerySlide) {
    setSlides(slides.filter((item) => item.id !== slide.id));
    await removeOfficePhoto(slide.photo);
  }

  return (
    <>
      <Panel
        title="La franja de la galería"
        description="Va en la portada entre el mosaico de portales y «Lo más reciente». Sin fotografías, la franja no se dibuja."
      >
        <div className="oda-form-grid">
          <Text
            label="Título"
            comfortable={40}
            value={draft.gallery.title}
            disabled={!canEdit}
            placeholder="La oficina por dentro"
            onChange={(title) => patch((page) => ({ ...page, gallery: { ...page.gallery, title } }))}
          />
          <Text
            label="Bajada"
            wide
            rows={2}
            comfortable={140}
            value={draft.gallery.lede}
            disabled={!canEdit}
            placeholder="Mesas de trabajo, cierres de corte y jornadas con las facultades."
            onChange={(lede) => patch((page) => ({ ...page, gallery: { ...page.gallery, lede } }))}
          />
        </div>
      </Panel>

      <Panel
        title={slides.length ? `${slides.length} ${slides.length === 1 ? "fotografía" : "fotografías"}` : "Fotografías"}
        description={`JPG, PNG, WebP o AVIF, hasta ${formatBytes(MAX_PHOTO_BYTES)}. Se recortan a lo ancho (16:9), así que lo importante conviene tenerlo en el centro.`}
        actions={
          canEdit && (
            <>
              <input
                ref={picker}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="sr-only"
                onChange={(event) => void add(event.target.files)}
              />
              <button
                type="button"
                className="button-primary"
                disabled={uploading}
                onClick={() => picker.current?.click()}
              >
                {uploading ? (
                  <>
                    <span className="oda-save__spinner" aria-hidden="true" /> Subiendo…
                  </>
                ) : (
                  <>
                    <Icon name="upload" size={15} /> Subir fotografías
                  </>
                )}
              </button>
            </>
          )
        }
      >
        {slides.length === 0 ? (
          <p className="oda-muted">
            Todavía no hay fotografías. Mientras la galería esté vacía, la portada pasa del mosaico de portales
            directamente a «Lo más reciente».
          </p>
        ) : (
          <ol className="ofa-rows">
            {slides.map((slide, index) => (
              <li key={slide.id} className="ofa-row">
                <figure className="ofa-thumb">
                  <img src={officePhotoUrl(slide.photo) ?? ""} alt="" />
                  <figcaption>{index + 1}</figcaption>
                </figure>

                <div className="ofa-row__fields oda-form-grid">
                  <Text
                    label="Texto alternativo"
                    wide
                    value={slide.alt}
                    disabled={!canEdit}
                    placeholder="Qué se ve en la fotografía"
                    onChange={(alt) => update(slide.id, { alt })}
                    hint={
                      slide.alt ? undefined : (
                        <span className="ofa-warn">
                          <Icon name="alert" size={13} /> Sin esto, quien use lector de pantalla no sabrá qué hay aquí.
                        </span>
                      )
                    }
                  />
                  <Text
                    label="Pie"
                    comfortable={48}
                    value={slide.title}
                    disabled={!canEdit}
                    placeholder="Cierre del corte 2025-1"
                    onChange={(title) => update(slide.id, { title })}
                  />
                  <Text
                    label="Una línea de contexto"
                    comfortable={110}
                    value={slide.caption}
                    disabled={!canEdit}
                    placeholder="El equipo revisa las cifras con las facultades."
                    onChange={(caption) => update(slide.id, { caption })}
                  />
                  <Text
                    label="Destino (opcional)"
                    value={slide.to}
                    disabled={!canEdit}
                    placeholder="/datos-abiertos"
                    onChange={(to) => update(slide.id, { to })}
                  />
                  <Text
                    label="Rótulo del destino"
                    value={slide.toLabel}
                    disabled={!canEdit || !slide.to}
                    placeholder="Ver el informe"
                    onChange={(toLabel) => update(slide.id, { toLabel })}
                  />
                </div>

                {canEdit && (
                  <div className="ofa-row__actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Mover la fotografía ${index + 1} antes`}
                      title="Mover antes"
                    >
                      <Icon name="arrow-left" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === slides.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Mover la fotografía ${index + 1} después`}
                      title="Mover después"
                    >
                      <Icon name="arrow-right" size={15} />
                    </button>
                    <ConfirmButton
                      label="Quitar"
                      confirmLabel="Se quita de la portada y se borra el archivo."
                      onConfirm={() => void remove(slide)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
