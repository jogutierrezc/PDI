/* =============================================================================
   UDrive · el control de la foto de portada (0190).

   Siempre visible cuando la composición usa foto: «Subir imagen», «Elegir de
   UDrive», «Cambiar» y «Quitar»; con la imagen puesta, encuadre arrastrable
   (también con flechas), zoom, alinear arriba, centro o abajo, cubrir o
   mostrar entera y velo blanco. Lo usan el panel de estilo (la foto del estilo,
   o un ajuste de un informe sobre un estilo de fábrica) y la pestaña
   «Documento» (la foto de un informe, que manda sobre la del estilo).

   La imagen se reduce a 2000 px y se sube a UDrive con la sesión de la persona,
   a la carpeta que se indique: es un archivo más, con los permisos de esa
   carpeta. Tipos: JPG, PNG y WebP, hasta 10 MB antes de reducir. Si algo falla
   se dice el motivo en español (tipo, peso, permiso, conexión).
   ========================================================================== */

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Encuadre } from "../../../informes/vista/EditorPortada";
import { useAuth } from "../../../../lib/auth";
import { enlaceDeArchivo, useArchivos, useSubirArchivo } from "../../datos";
import { nombreUnico } from "../../lib/nombres";
import { comprimirImagen } from "../navegador";
import { SelectorArchivo } from "../documento/Selectores";
import "../documento/documento.css";

export const MAX_FOTO = 10 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

export interface EncuadreFoto {
  x: number;
  y: number;
  zoom: number;
  ajuste: "cubrir" | "contener";
  velo: number;
}

export interface ValorFoto extends EncuadreFoto {
  imagenId: string;
}

const mb = (n: number): string => (n / 1024 / 1024).toFixed(1).replace(".", ",");

export function ControlFoto({
  valor,
  onChange,
  editable,
  carpetaId,
  aspecto,
  titulo = "Foto de portada",
  motivoBloqueo,
}: {
  valor: ValorFoto;
  onChange(v: ValorFoto): void;
  editable: boolean;
  /** Carpeta de UDrive donde se guarda la imagen que se sube. */
  carpetaId: string | null;
  /** Proporción del marco de la foto («215.9 / 117.3»). */
  aspecto: string;
  titulo?: string;
  /** Por qué no se puede cambiar (estilo de solo lectura), con lo que hay que hacer. */
  motivoBloqueo?: string;
}) {
  const { profile } = useAuth();
  const archivos = useArchivos();
  const subir = useSubirArchivo();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [progreso, setProgreso] = useState<number | null>(null);
  const [eligiendo, setEligiendo] = useState(false);

  const fila = valor.imagenId ? archivos.data?.find((a) => a.id === valor.imagenId) : undefined;
  const url = useQuery({
    queryKey: ["ud", "url", fila?.ruta_storage ?? ""],
    enabled: Boolean(fila?.ruta_storage),
    retry: false,
    staleTime: 4 * 60_000,
    queryFn: () => enlaceDeArchivo(fila?.ruta_storage ?? ""),
  }).data;
  const puede = editable && !motivoBloqueo;

  const poner = (c: Partial<ValorFoto>) => onChange({ ...valor, ...c });

  const alSubir = async (original: File | undefined) => {
    if (!original) return;
    setError("");
    if (!profile?.id) return setError("Su sesión venció. Inicie sesión de nuevo.");
    if (!TIPOS.includes(original.type)) return setError("Ese tipo de archivo no sirve para una foto de portada. Use JPG, PNG o WebP.");
    if (original.size > MAX_FOTO) return setError(`La imagen pesa ${mb(original.size)} MB y el máximo es ${mb(MAX_FOTO)} MB. Redúzcala o elija otra.`);
    try {
      setProgreso(0);
      const listo = await comprimirImagen(original);
      const existentes = (archivos.data ?? []).filter((a) => !a.borrado_en && a.carpeta_id === carpetaId).map((a) => a.nombre);
      const nombre = nombreUnico(listo.name || "Foto de portada.jpg", existentes);
      const id = await subir.mutateAsync({ archivo: listo, persona: profile.id, carpeta: carpetaId, nombre, onProgreso: setProgreso });
      onChange({ ...valor, imagenId: id, x: 50, y: 0, zoom: 1 });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(/migraci[oó]n/i.test(m) ? m : /permission|row-level|permiso/i.test(m) ? "No tiene permiso para guardar archivos en esa carpeta. Elija otra carpeta o pida permiso de edición." : m || "No se pudo subir la imagen. Inténtelo de nuevo.");
    } finally {
      setProgreso(null);
      if (entrada.current) entrada.current.value = "";
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className="ud-est-lab">{titulo}</span>
      {motivoBloqueo ? <p className="es-note" role="status">{motivoBloqueo}</p> : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="es-btn es-btn--sm" disabled={!puede || progreso !== null} onClick={() => entrada.current?.click()}>
          {progreso !== null ? `Subiendo… ${Math.round(progreso * 100)} %` : valor.imagenId ? "Cambiar imagen" : "Subir imagen"}
        </button>
        <button type="button" className="es-btn es-btn--sm" disabled={!puede || progreso !== null} onClick={() => setEligiendo(true)}>Elegir de UDrive</button>
        {valor.imagenId && puede ? <button type="button" className="es-btn es-btn--sm" onClick={() => poner({ imagenId: "" })}>Quitar</button> : null}
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Subir imagen de portada" onChange={(e) => void alSubir(e.target.files?.[0])} />
      </div>
      <span className="es-note">JPG, PNG o WebP, hasta {mb(MAX_FOTO)} MB. Se reduce a 2000 px al subirla y queda en UDrive. {valor.imagenId ? (fila ? `Imagen: ${fila.nombre}.` : "Imagen que no veo.") : "Sin imagen propia se usa la foto institucional."}</span>
      <p className="ud-est-msg" role="alert">{error}</p>

      {url ? (
        <>
          <Encuadre url={url} foto={{ ruta: "", x: valor.x, y: valor.y, zoom: valor.zoom }} aspecto={aspecto} onChange={(f) => puede && poner({ x: f.x, y: f.y, zoom: f.zoom })} />
          <div className="ud-est-rango">
            <label className="ud-est-lab" htmlFor="ud-foto-zoom" style={{ marginBottom: 0 }}>Zoom</label>
            <output htmlFor="ud-foto-zoom">{Math.round(valor.zoom * 100)} %</output>
            <input id="ud-foto-zoom" type="range" min={1} max={3} step={0.05} value={valor.zoom} disabled={!puede} onChange={(e) => poner({ zoom: Number(e.target.value) })} />
          </div>
          <div>
            <span className="ud-est-lab">Alinear el recorte</span>
            <div className="es-seg" role="group" aria-label="Alinear el recorte">
              {([["Arriba", 0], ["Centro", 50], ["Abajo", 100]] as const).map(([t, y]) => (
                <button key={t} type="button" aria-pressed={valor.y === y} disabled={!puede} onClick={() => poner({ y })}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="ud-est-lab">Ajuste de la foto</span>
            <div className="es-seg" role="group" aria-label="Ajuste de la foto">
              {([["Cubrir el marco", "cubrir"], ["Mostrar entera", "contener"]] as const).map(([t, v]) => (
                <button key={v} type="button" aria-pressed={valor.ajuste === v} disabled={!puede} onClick={() => poner({ ajuste: v })}>{t}</button>
              ))}
            </div>
          </div>
          <div className="ud-est-rango">
            <label className="ud-est-lab" htmlFor="ud-foto-velo" style={{ marginBottom: 0 }}>Velo blanco sobre la foto</label>
            <output htmlFor="ud-foto-velo">{valor.velo} %</output>
            <input id="ud-foto-velo" type="range" min={0} max={60} step={5} value={valor.velo} disabled={!puede} onChange={(e) => poner({ velo: Number(e.target.value) })} />
          </div>
          <p className="es-note">Arrastre la foto para moverla. Con el teclado: flechas para moverla, más y menos para el zoom. No ponga texto en la imagen: el título va debajo, sobre fondo blanco. La portada de la derecha se actualiza al instante.</p>
        </>
      ) : valor.imagenId ? (
        <p className="es-note" role="status">{fila ? "Cargando la imagen…" : "No se puede ver esa imagen: ya no existe o no tiene permiso para verla."}</p>
      ) : null}

      {eligiendo ? (
        <SelectorArchivo
          clase="imagen"
          actual={valor.imagenId}
          onElegir={(a) => {
            onChange({ ...valor, imagenId: a.id, x: 50, y: 0, zoom: 1 });
            setEligiendo(false);
          }}
          onCerrar={() => setEligiendo(false)}
        />
      ) : null}
    </div>
  );
}
