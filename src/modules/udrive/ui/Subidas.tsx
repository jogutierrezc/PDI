/* =============================================================================
   UDrive · subir archivos de cualquier tipo.

   Arrastrando y soltando o con el botón. Cada archivo se valida (tamaño y
   nombre), las fotos grandes se comprimen en el navegador (máx. 2000 px de
   lado), el nombre se vuelve único dentro de la carpeta y se sube con la sesión
   de la persona (políticas del bucket) mostrando el avance. Un error se dice en
   español y se puede descartar; los archivos que sí se subieron no se pierden.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useSubirArchivo } from "../datos";
import { errorDeSubida, limpiarNombre, nombreUnico } from "../lib/nombres";
import { entrarFila, entrarSubidas } from "../motion";
import { comprimirImagen } from "./navegador";

export interface Subida {
  id: number;
  nombre: string;
  estado: "preparando" | "subiendo" | "listo" | "error";
  progreso: number;
  mensaje: string;
}

let contador = 0;

/** La cola de subidas: `subir(archivos)` las procesa de a una, para no saturar la conexión. */
export function useSubidas(opciones: { persona: string | undefined; carpeta: string | null; nombresEnCarpeta: () => string[]; alTerminar: (id: string) => void }) {
  const [cola, setCola] = useState<Subida[]>([]);
  const subir = useSubirArchivo();
  const ocupado = useRef(false);
  const pendientes = useRef<{ id: number; archivo: File; carpeta: string | null; persona: string }[]>([]);
  const reservados = useRef(new Set<string>());
  const op = useRef(opciones);
  op.current = opciones;

  const poner = useCallback((id: number, cambios: Partial<Subida>) => setCola((c) => c.map((s) => (s.id === id ? { ...s, ...cambios } : s))), []);

  const procesar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    for (let p = pendientes.current.shift(); p; p = pendientes.current.shift()) {
      try {
        poner(p.id, { estado: "preparando", mensaje: "Preparando…" });
        const listo = await comprimirImagen(p.archivo);
        const existentes = [...op.current.nombresEnCarpeta(), ...reservados.current];
        const nombre = nombreUnico(listo.name, existentes);
        reservados.current.add(nombre);
        poner(p.id, { estado: "subiendo", nombre, mensaje: listo === p.archivo ? "" : "Imagen reducida antes de subir" });
        const id = await subir.mutateAsync({ archivo: listo, persona: p.persona, carpeta: p.carpeta, nombre, onProgreso: (f) => poner(p.id, { progreso: f }) });
        reservados.current.delete(nombre);
        poner(p.id, { estado: "listo", progreso: 1, mensaje: "Listo" });
        op.current.alTerminar(id);
      } catch (e) {
        poner(p.id, { estado: "error", mensaje: e instanceof Error ? e.message : "No se pudo subir el archivo." });
      }
    }
    ocupado.current = false;
  }, [poner, subir]);

  const agregar = useCallback(
    (archivos: FileList | File[]) => {
      const { persona, carpeta } = op.current;
      const nuevas: Subida[] = [];
      for (const archivo of Array.from(archivos)) {
        const id = ++contador;
        const falla = !persona ? "Su sesión no está lista. Recargue la página." : errorDeSubida(archivo);
        nuevas.push({ id, nombre: limpiarNombre(archivo.name) || "Archivo", estado: falla ? "error" : "preparando", progreso: 0, mensaje: falla });
        if (!falla && persona) pendientes.current.push({ id, archivo, carpeta, persona });
      }
      if (nuevas.length) setCola((c) => [...c, ...nuevas]);
      void procesar();
    },
    [procesar],
  );

  const descartar = useCallback((id?: number) => setCola((c) => c.filter((s) => (id === undefined ? s.estado === "subiendo" || s.estado === "preparando" : s.id !== id))), []);
  return { cola, agregar, descartar };
}

export function PanelSubidas({ cola, onDescartar }: { cola: Subida[]; onDescartar: (id?: number) => void }) {
  const caja = useRef<HTMLElement>(null);
  const abierto = cola.length > 0;
  useEffect(() => {
    if (abierto) entrarSubidas(caja.current);
  }, [abierto]);
  const ultima = useRef(0);
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (cola.length > ultima.current) entrarFila(lista.current?.lastElementChild ?? null);
    ultima.current = cola.length;
  }, [cola.length]);
  if (!abierto) return null;
  const activas = cola.filter((s) => s.estado === "subiendo" || s.estado === "preparando").length;
  const errores = cola.filter((s) => s.estado === "error").length;
  const titulo = activas ? `Subiendo ${activas} ${activas === 1 ? "archivo" : "archivos"}` : errores ? "Algunos archivos no se subieron" : "Subidas terminadas";
  return (
    <section ref={caja} className="ud-subidas" aria-label="Subidas" aria-live="polite">
      <header>
        <span>{titulo}</span>
        {activas ? null : (
          <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => onDescartar()} aria-label="Cerrar la lista de subidas">
            <Icon name="close" size={14} />
          </button>
        )}
      </header>
      <ul ref={lista}>
        {cola.map((s) => (
          <li key={s.id} data-e={s.estado}>
            <b title={s.nombre}>{s.nombre}</b>
            <div className="ud-barra" role="progressbar" aria-label={`Avance de ${s.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progreso * 100)}>
              <i style={{ transform: `scaleX(${s.estado === "error" ? 1 : Math.max(0.02, s.progreso)})` }} />
            </div>
            <span className="ud-msg">{s.mensaje || (s.estado === "subiendo" ? `${Math.round(s.progreso * 100)} %` : "")}</span>
            {s.estado === "error" ? (
              <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={() => onDescartar(s.id)}>
                Descartar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
