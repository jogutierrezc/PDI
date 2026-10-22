/* =============================================================================
   UDrive · elegir un archivo de UDrive para un bloque.

   Un selector con búsqueda y vista previa para tablas, gráficas e imágenes (y,
   para «Usar en un informe», documentos). La vista previa reutiliza los
   componentes de la fase 1: la tabla con normalizarContenido y la gráfica con
   GraficaVista, así se ve lo mismo que saldrá en el documento.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ventana } from "../../../../components/espacio/Ventana";
import { enlaceDeArchivo, useArchivos, useCarpetas, useContenido } from "../../datos";
import { rutaDeCarpeta } from "../../lib/arbol";
import { normalizarConfig } from "../../lib/graficas";
import { vistaPrevia } from "../../lib/imagen";
import { normalizarContenido } from "../../lib/tabla";
import { textoNumero } from "../../lib/valores";
import type { ArchivoRow } from "../../tipos";
import { GraficaVista } from "../GraficaVista";
import { IconoItem, NOMBRE_TIPO } from "../piezas";

export type ClaseSelector = "tabla" | "grafica" | "imagen" | "documento";

const TITULO: Record<ClaseSelector, string> = { tabla: "Elegir una tabla", grafica: "Elegir una gráfica", imagen: "Elegir una imagen", documento: "Elegir un informe" };

const sirve = (a: ArchivoRow, clase: ClaseSelector): boolean => {
  if (a.borrado_en) return false;
  if (clase === "imagen") return a.tipo === "archivo" && vistaPrevia(a.mime) === "imagen";
  return a.tipo === clase;
};

export function SelectorArchivo({ clase, actual, onElegir, onCerrar }: { clase: ClaseSelector; actual?: string; onElegir(a: ArchivoRow): void; onCerrar(): void }) {
  const archivos = useArchivos();
  const carpetas = useCarpetas();
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<string | null>(actual || null);
  const rutaDe = (a: ArchivoRow) => rutaDeCarpeta(carpetas.data ?? [], a.carpeta_id).map((c) => c.nombre).join(" / ") || "Mi espacio";
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (archivos.data ?? [])
      .filter((a) => sirve(a, clase))
      .filter((a) => !t || a.nombre.toLowerCase().includes(t) || rutaDe(a).toLowerCase().includes(t))
      .sort((x, y) => y.updated_at.localeCompare(x.updated_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rutaDe depende de carpetas.data
  }, [archivos.data, carpetas.data, clase, q]);
  const sel = lista.find((a) => a.id === elegido) ?? null;

  return (
    <Ventana
      titulo={TITULO[clase]}
      onCerrar={onCerrar}
      pie={
        <>
          <span className="es-note">{lista.length} {lista.length === 1 ? "archivo" : "archivos"}</span>
          <button type="button" className="es-btn es-btn--pri" disabled={!sel} onClick={() => sel && onElegir(sel)}>
            {clase === "documento" ? "Elegir este informe" : "Usar en el informe"}
          </button>
        </>
      }
    >
      <div className="es-dbody">
        <label className="es-fl">
          Buscar por nombre o carpeta
          <input type="text" className="es-inp" data-foco value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matriculados, campus…" />
        </label>
        <div className="ud-selector">
          <div className="ud-selector-lista" role="listbox" aria-label="Archivos de UDrive">
            {archivos.isPending ? <p className="es-note">Leyendo UDrive…</p> : null}
            {!archivos.isPending && !lista.length ? <p className="ud-vacio" role="status">{q ? "Nada coincide con la búsqueda." : `No hay ${clase === "imagen" ? "imágenes" : NOMBRE_TIPO[clase === "documento" ? "documento" : clase].toLowerCase() + "s"} en UDrive todavía.`}</p> : null}
            {lista.map((a) => (
              <button key={a.id} type="button" role="option" aria-selected={a.id === elegido} aria-pressed={a.id === elegido} className="ud-selector-item" onClick={() => setElegido(a.id)} onDoubleClick={() => onElegir(a)}>
                <IconoItem tipo={a.tipo} />
                <span>{a.nombre}</span>
                <small>{rutaDe(a)}</small>
              </button>
            ))}
          </div>
          <div className="ud-selector-vista" aria-live="polite">
            {sel ? <VistaDeArchivo a={sel} /> : <p className="es-note">Elija un archivo de la lista para ver cómo queda.</p>}
          </div>
        </div>
      </div>
    </Ventana>
  );
}

/** La vista previa de un archivo elegido. */
export function VistaDeArchivo({ a }: { a: ArchivoRow }) {
  if (a.tipo === "tabla") return <PreviaTabla id={a.id} />;
  if (a.tipo === "grafica") return <PreviaGrafica id={a.id} />;
  if (a.tipo === "archivo") return <PreviaImagen a={a} />;
  return <p className="es-note">{NOMBRE_TIPO[a.tipo]} · {a.nombre}</p>;
}

function PreviaTabla({ id }: { id: string }) {
  const c = useContenido(id);
  const t = useMemo(() => (c.data?.tipo === "tabla" ? normalizarContenido(c.data.contenido) : null), [c.data]);
  if (c.isPending) return <p className="es-note">Leyendo la tabla…</p>;
  if (!t) return <p className="ud-vacio">No se pudo leer la tabla.</p>;
  return (
    <>
      <table aria-label="Primeras filas de la tabla">
        <thead><tr>{t.columnas.slice(0, 6).map((k) => <th key={k.clave} scope="col">{k.etiqueta}</th>)}</tr></thead>
        <tbody>
          {t.filas.slice(0, 8).map((f) => (
            <tr key={f.id}>{t.columnas.slice(0, 6).map((k) => <td key={k.clave}>{typeof f.datos[k.clave] === "number" ? textoNumero(f.datos[k.clave] as number) : String(f.datos[k.clave] ?? "")}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="es-note">{t.filas.length} filas · {t.columnas.length} columnas</p>
    </>
  );
}

function PreviaGrafica({ id }: { id: string }) {
  const g = useContenido(id);
  const crudo = (g.data?.tipo === "grafica" ? g.data.contenido : null) as { tabla_id?: unknown; config?: unknown } | null;
  const tablaId = typeof crudo?.tabla_id === "string" ? crudo.tabla_id : undefined;
  const t = useContenido(tablaId);
  const tabla = useMemo(() => (t.data?.tipo === "tabla" ? normalizarContenido(t.data.contenido) : null), [t.data]);
  if (g.isPending) return <p className="es-note">Leyendo la gráfica…</p>;
  if (!crudo) return <p className="ud-vacio">No se pudo leer la gráfica.</p>;
  if (!tabla) return <p className="ud-vacio">La gráfica aún no tiene una tabla de donde leer sus datos.</p>;
  return <GraficaVista tabla={{ columnas: tabla.columnas, filas: tabla.filas }} config={normalizarConfig(crudo.config, null)} altura={240} />;
}

function PreviaImagen({ a }: { a: ArchivoRow }) {
  const url = useQuery({ queryKey: ["ud", "url", a.ruta_storage], enabled: Boolean(a.ruta_storage), retry: false, staleTime: 4 * 60_000, queryFn: () => enlaceDeArchivo(a.ruta_storage!) });
  if (url.isPending) return <p className="es-note">Abriendo la imagen…</p>;
  if (!url.data) return <p className="ud-vacio">No se pudo abrir la imagen.</p>;
  return <img src={url.data} alt={`Vista previa de ${a.nombre}`} />;
}
