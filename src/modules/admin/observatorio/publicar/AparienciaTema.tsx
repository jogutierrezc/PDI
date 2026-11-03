/* =============================================================================
   Observatorio · apariencia del tablero de un tema (0251).

   Solo vive en el panel «Observatorios» (quien puede editar temas); el portal
   público no tiene modo de edición. Por tema: color (paleta de 14 o libre),
   icono, imagen (subir, arrastrar o quitar; se achica a 1600 px en el
   navegador y se sube al guardar), intensidad y alcance del degradado,
   encuadre X/Y y una vista previa en vivo con el MISMO componente del tablero
   de la portada pública. «Restaurar» vuelve al color y icono de respaldo.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { supabase } from "../../../../lib/supabase";
import { ICONOS_TABLERO, PALETA_TABLERO, TableroVista, datosTablero, defectoDe } from "../../../datos-abiertos/observatorio/tablero";
import "../../../datos-abiertos/observatorio/obs-claro.css";
import "../../../datos-abiertos/observatorio/obs-rediseno.css";
import { useEditarObservatorios } from "./api";
import type { Observatorio, Tema } from "./api";
import { Dialogo, nombreColor } from "./ui";

export const BUCKET_TABLEROS = "obs-tableros";
const LADO_MAXIMO = 1600;
const LIMITE_BYTES = 3 * 1024 * 1024;

/** Achica la imagen a 1600 px por su lado mayor y la devuelve como JPEG. */
async function achicar(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen."));
      i.src = url;
    });
    const k = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * k));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo procesar la imagen.");
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    for (const calidad of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
      if (blob && blob.size <= LIMITE_BYTES) return blob;
    }
    throw new Error("La imagen sigue pesando más de 3 MB después de achicarla. Elige otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Borrador {
  color: string;
  icono: string;
  imagen: string | null;
  degradado: number;
  alcance: number;
  encuadreX: number;
  encuadreY: number;
}

const desde = (t: Tema): Borrador => ({
  color: t.color ?? "",
  icono: t.icono ?? "",
  imagen: t.imagen_url ?? null,
  degradado: t.degradado ?? 92,
  alcance: t.alcance ?? 62,
  encuadreX: t.encuadre_x ?? 50,
  encuadreY: t.encuadre_y ?? 50,
});

const RANGOS: { clave: "degradado" | "alcance" | "encuadreX" | "encuadreY"; etiqueta: string }[] = [
  { clave: "degradado", etiqueta: "Intensidad" },
  { clave: "alcance", etiqueta: "Alcance" },
  { clave: "encuadreX", etiqueta: "Encuadre X" },
  { clave: "encuadreY", etiqueta: "Encuadre Y" },
];

export function AparienciaTema({ o, tema, decir, onCerrar }: { o: Observatorio; tema: Tema; decir: (t: string, mala?: boolean) => void; onCerrar: () => void }) {
  const editor = useEditarObservatorios();
  const [v, setV] = useState<Borrador>(() => desde(tema));
  const [local, setLocal] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [encima, setEncima] = useState(false);
  const localUrl = useRef<string | null>(null);
  localUrl.current = local?.url ?? null;
  useEffect(() => () => void (localUrl.current && URL.revokeObjectURL(localUrl.current)), []);

  const cambia = <K extends keyof Borrador>(k: K, valor: Borrador[K]) => setV((x) => ({ ...x, [k]: valor }));
  const respaldo = defectoDe(tema.slug);

  const elegir = async (archivo: File | undefined | null) => {
    if (!archivo) return;
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return setError("Elige una imagen JPEG, PNG o WebP.");
    setError("");
    try {
      const blob = await achicar(archivo);
      setLocal((x) => {
        if (x) URL.revokeObjectURL(x.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar la imagen.");
    }
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    void elegir(e.dataTransfer.files[0]);
  };
  const quitarImagen = () => {
    if (local) URL.revokeObjectURL(local.url);
    setLocal(null);
    cambia("imagen", null);
  };
  const restaurar = () => {
    quitarImagen();
    setV({ color: "", icono: "", imagen: null, degradado: 92, alcance: 62, encuadreX: 50, encuadreY: 50 });
  };

  const imagenVista = local?.url ?? v.imagen;
  const vista = datosTablero({
    slug: tema.slug,
    code: tema.codigo ?? tema.slug.slice(0, 2).toUpperCase(),
    name: tema.nombre ?? tema.slug,
    color: v.color || null,
    icono: v.icono || null,
    imagenUrl: imagenVista,
    degradado: v.degradado,
    alcance: v.alcance,
    encuadreX: v.encuadreX,
    encuadreY: v.encuadreY,
  });

  const guardar = async (cerrar: () => void) => {
    setOcupado(true);
    setError("");
    try {
      let url = v.imagen;
      if (local) {
        const ruta = `${tema.slug}/${Date.now()}.jpg`;
        const { error: e } = await supabase.storage.from(BUCKET_TABLEROS).upload(ruta, local.blob, { contentType: "image/jpeg", upsert: false });
        if (e) throw new Error(`No se pudo subir la imagen: ${e.message}`);
        url = supabase.storage.from(BUCKET_TABLEROS).getPublicUrl(ruta).data.publicUrl;
      }
      await editor.apariencia(tema.slug, {
        color: v.color || null,
        icono: v.icono || null,
        imagen_url: url,
        degradado: v.degradado,
        alcance: v.alcance,
        encuadre_x: v.encuadreX,
        encuadre_y: v.encuadreY,
      });
      decir("Apariencia del tablero guardada");
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo={`Apariencia de «${tema.nombre ?? tema.slug}»`}
      sub={`${o.nombre} · así se ve el tablero en la portada pública`}
      ancho={640}
      onCerrar={onCerrar}
      pie={(cerrar) => (
        <>
          <button type="button" className="button-ghost" onClick={restaurar} disabled={ocupado}>
            Restaurar
          </button>
          <button type="button" className="button-secondary" onClick={cerrar}>
            Cancelar
          </button>
          <button type="button" className="button-primary" disabled={ocupado} onClick={() => void guardar(cerrar)}>
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
        </>
      )}
    >
      <div className="obsx-form obsx-apar">
        <div className="obsx-apar__vista">
          <div className="obsr obsr-claro">
            <TableroVista d={vista} />
          </div>
        </div>

        <div className="admin-field">
          <span>Color</span>
          <div className="obsx-muestras" role="radiogroup" aria-label="Color del tablero">
            <label>
              <input type="radio" name="obsx-a-color" checked={v.color === ""} onChange={() => cambia("color", "")} aria-label="El de respaldo" />
              <i style={{ background: respaldo.color }} title="El de respaldo" />
            </label>
            {PALETA_TABLERO.map((c) => (
              <label key={c}>
                <input type="radio" name="obsx-a-color" checked={v.color.toLowerCase() === c.toLowerCase()} onChange={() => cambia("color", c)} aria-label={nombreColor(c)} />
                <i style={{ background: c }} />
              </label>
            ))}
          </div>
          <label className="obsx-apar__libre">
            <input type="color" value={vista.color} onChange={(e) => cambia("color", e.target.value)} aria-label="Otro color" />
            <span>Otro color libre ({vista.color})</span>
          </label>
        </div>

        <div className="admin-field">
          <span>Icono (marca de agua)</span>
          <div className="obsx-iconos" role="radiogroup" aria-label="Icono del tablero">
            <label>
              <input type="radio" name="obsx-a-icono" checked={v.icono === ""} onChange={() => cambia("icono", "")} aria-label="El de respaldo" />
              <span title="El de respaldo"><Icon name={respaldo.icono} size={20} /></span>
            </label>
            {ICONOS_TABLERO.map((n) => (
              <label key={n}>
                <input type="radio" name="obsx-a-icono" checked={v.icono === n} onChange={() => cambia("icono", n)} aria-label={n} />
                <span><Icon name={n} size={20} /></span>
              </label>
            ))}
          </div>
        </div>

        <div className="admin-field">
          <span>Imagen</span>
          <div className="obsx-apar__soltar" data-encima={encima || undefined} onDragEnter={(e) => { e.preventDefault(); setEncima(true); }} onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
            Arrastra una imagen aquí o elígela
            <div className="obsx-apar__botones">
              <label className="button-secondary obsx-pequeno">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ""; }} />
                Elegir imagen
              </label>
              <button type="button" className="button-ghost obsx-pequeno" onClick={quitarImagen} disabled={!imagenVista}>
                Quitar imagen
              </button>
            </div>
          </div>
          <p className="obsx-ayuda">Se achica a 1600 px antes de subirla. Sin imagen, el tablero es de color sólido con el icono como marca de agua.</p>
        </div>

        <fieldset className="obsx-apar__rangos" disabled={!imagenVista}>
          <legend>Degradado de color sobre la imagen</legend>
          {RANGOS.map((r) => (
            <label key={r.clave} className="obsx-apar__rango">
              <span>{r.etiqueta}</span>
              <input type="range" min={r.clave === "degradado" || r.clave === "alcance" ? 30 : 0} max={r.clave === "alcance" ? 95 : 100} value={v[r.clave]} onChange={(e) => cambia(r.clave, Number(e.target.value))} />
              <output>{v[r.clave]}</output>
            </label>
          ))}
          <p className="obsx-ayuda">El color sube desde abajo y baja desde arriba; el centro deja ver la foto.</p>
        </fieldset>

        {error && <p className="obsx-error" role="alert">{error}</p>}
      </div>
    </Dialogo>
  );
}
