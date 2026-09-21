/* =============================================================================
   Diseño · el grid de imágenes de un informe.

   Fotografías a una o dos columnas dentro de la ficha, y las mismas en el
   boletín. El archivo se sube en cuanto se elige, no al guardar el diseño: así
   la miniatura aparece de inmediato y el texto alternativo se escribe mirando
   la foto, que es la única manera de escribirlo bien.

   El texto alternativo se pide siempre. Una fotografía sin él no existe para
   quien usa lector de pantalla, y en un informe institucional suele ser justo
   la que documenta quién estuvo y dónde.

   Reordenar se hace arrastrando —con el mismo mecanismo que el carril de
   informes— y también con las flechas, que son la vía del teclado.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdReportBlockRow } from "../../../../types/database";
import { reportImageUrl } from "../../../datos-abiertos/data/images";
import { moved, useReorder } from "../../components/reorder";
import { removeReportImage, uploadReportImage } from "../od-data";

type Settings = OdReportBlockRow["settings"];
type Image = NonNullable<Settings["images"]>[number];

export function ImageGrid({
  reportSlug,
  settings,
  disabled,
  onChange,
  onError,
}: {
  reportSlug: string;
  settings: Settings;
  disabled: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onError: (message: string) => void;
}) {
  const images = settings.images ?? [];
  const columns = settings.columns === 1 ? 1 : 2;
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const setImages = (next: Image[]) => onChange({ images: next });
  const update = (index: number, patch: Partial<Image>) =>
    setImages(images.map((image, i) => (i === index ? { ...image, ...patch } : image)));
  const move = (from: number, to: number) => setImages(moved(images, from, to));
  const drag = useReorder(images.length, move);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    onError("");
    try {
      const added: Image[] = [];
      for (const file of Array.from(files)) {
        const path = await uploadReportImage(reportSlug, file);
        added.push({ path, alt: "", caption: "" });
      }
      setImages([...images, ...added]);
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function remove(index: number) {
    const gone = images[index];
    setImages(images.filter((_image, i) => i !== index));
    void removeReportImage(gone?.path);
  }

  const missingAlt = images.filter((image) => !image.alt.trim()).length;

  return (
    <div className="oda-grid-images">
      <div className="oda-grid-images__head">
        <label className="oda-inline-field">
          <span>Columnas</span>
          <select
            value={columns}
            disabled={disabled}
            onChange={(event) => onChange({ columns: Number(event.target.value) === 1 ? 1 : 2 })}
          >
            <option value={2}>Dos por fila</option>
            <option value={1}>Una por fila</option>
          </select>
        </label>
        {!disabled && (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => void add(event.target.files)}
            />
            <button type="button" className="button-secondary" disabled={uploading} onClick={() => picker.current?.click()}>
              {uploading ? (
                <>
                  <span className="oda-save__spinner" aria-hidden="true" /> Subiendo…
                </>
              ) : (
                <>
                  <Icon name="upload" size={15} /> Subir imágenes
                </>
              )}
            </button>
          </>
        )}
        {missingAlt > 0 && (
          <span className="oda-grid-images__warn">
            <Icon name="alert" size={13} />
            {missingAlt === 1 ? "1 imagen sin texto alternativo" : `${missingAlt} imágenes sin texto alternativo`}
          </span>
        )}
      </div>

      {images.length === 0 ? (
        <p className="oda-muted">
          El grid está vacío: mientras lo esté, el bloque no se dibuja ni en la ficha ni en el boletín.
        </p>
      ) : (
        <ol className="oda-grid-images__list">
          {images.map((image, index) => (
            <li
              key={`${image.path}-${index}`}
              ref={drag.setRow(index)}
              data-dragging={drag.dragging === index || undefined}
              data-drop={
                drag.marker === index
                  ? "antes"
                  : drag.marker === index + 1 && index === images.length - 1
                    ? "despues"
                    : undefined
              }
            >
              {!disabled && (
                <span className="oda-grip" {...drag.handle(index, `Mover la imagen ${index + 1}. Arrastra, o usa las flechas.`)}>
                  <Icon name="grip" size={16} />
                </span>
              )}
              <span className="oda-grid-images__thumb">
                <img src={reportImageUrl(image.path) ?? ""} alt="" />
              </span>
              <div className="oda-grid-images__fields">
                <label className="oda-inline-field oda-inline-field--wide">
                  <span>Texto alternativo</span>
                  <input
                    value={image.alt}
                    placeholder="Qué se ve en la fotografía"
                    disabled={disabled}
                    onChange={(event) => update(index, { alt: event.target.value })}
                  />
                </label>
                <label className="oda-inline-field oda-inline-field--wide">
                  <span>Pie <small>opcional</small></span>
                  <input
                    value={image.caption ?? ""}
                    placeholder="Jornada de inducción, agosto de 2025"
                    disabled={disabled}
                    onChange={(event) => update(index, { caption: event.target.value || undefined })}
                  />
                </label>
              </div>
              {!disabled && (
                <span className="oda-grid-images__actions">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === 0}
                    aria-label={`Subir la imagen ${index + 1}`}
                    title="Subir"
                    onClick={() => move(index, index - 1)}
                  >
                    <Icon name="arrow-left" size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === images.length - 1}
                    aria-label={`Bajar la imagen ${index + 1}`}
                    title="Bajar"
                    onClick={() => move(index, index + 1)}
                  >
                    <Icon name="arrow-right" size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label={`Quitar la imagen ${index + 1}`}
                    title="Quitar"
                    onClick={() => remove(index)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
