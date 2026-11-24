/* =============================================================================
   Selector de descarga en CSV del portal público.

   Un informe puede tener decenas de conjuntos (indicadores, desgloses, mapas,
   tablas, rankings…). Quien quiere llevarse las cifras elige aquí cuáles, y el
   portal los entrega: un solo conjunto de un solo archivo baja como .csv; lo
   demás baja como .zip con un LEEME.txt.

   La lista sale del registro de exportación (data/export-registry.ts), el mismo
   que usa la acción de cada bloque: lo que se ofrece aquí es lo que la ficha
   pinta. Todo llega marcado; el botón ámbar es la única acción principal y dice
   cuántos archivos baja.

   Va en un Modal (foco atrapado, Escape, desplazamiento bloqueado) y se monta
   con createPortal en el body, porque quien lo abre vive en una barra pegajosa
   con overflow oculto. El cuerpo y el pie son del portal (clases od-pick*); no
   se usa ModalActions, cuyo botón es el de la intranet.

   Mientras prepara la descarga, el botón pulsado no se deshabilita de verdad
   (aria-disabled): conserva el foco y sigue siendo el último de la trampa del
   Modal, que cuenta como enfocables las casillas de un fieldset deshabilitado.
   El diálogo se puede cerrar a media descarga; lo que llegue después no toca
   nada (`vivo`), y el cierre programado se cancela al desmontar.

   Movimiento (csv-motion.ts): los grupos entran en cascada al abrir, marcar o
   quitar todos recorre las casillas, y al descargar las filas marcadas se
   sellan mientras se prepara el archivo. El sello acompaña, no retiene: tiene
   su tope y «Listo» no lo espera más que eso. Con movimiento reducido no hay
   nada de eso y el contenido ya está visible.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../../../components/ui/Modal";
import type { CsvFile } from "../data/csv-export";
import { downloadCsvFiles } from "../data/download";
import type { ExportEntry } from "../data/export-registry";
import { cancelarMovimiento, entrarGrupos, recorrerCasillas, sellarFilas } from "./csv-motion";
import "./export-selector.css";

/** Lo que tarda el diálogo en cerrarse solo después de «Listo». */
const CIERRE_MS = 1400;

type Fase = "libre" | "preparando" | "listo" | "error";

interface Grupo {
  nombre: string;
  entries: ExportEntry[];
}

/** Agrupa por `group` en orden de primera aparición, conservando el orden del informe. */
function agrupar(entries: ExportEntry[]): Grupo[] {
  const porNombre = new Map<string, Grupo>();
  for (const entry of entries) {
    let grupo = porNombre.get(entry.group);
    if (!grupo) {
      grupo = { nombre: entry.group, entries: [] };
      porNombre.set(entry.group, grupo);
    }
    grupo.entries.push(entry);
  }
  return Array.from(porNombre.values());
}

function conNombreCsv(nombre: string): string {
  return /\.csv$/i.test(nombre) ? nombre : `${nombre}.csv`;
}

export function ExportSelector({ reportName, zipName, entries, readme, onClose }: {
  reportName: string;
  /** Nombre del .zip: "udes-en-cifras-<slug>.zip". */
  zipName: string;
  entries: ExportEntry[];
  /** LEEME.txt de los conjuntos elegidos. */
  readme: (chosen: ExportEntry[]) => string;
  onClose: () => void;
}): ReactElement {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(entries.map((e) => e.id)));
  const [fase, setFase] = useState<Fase>("libre");
  const [resultado, setResultado] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);
  const cierreRef = useRef<number | null>(null);
  const vivo = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Estable: el Modal vuelve a montar su trampa de foco cada vez que cambia onClose.
  const cerrar = useCallback(() => onCloseRef.current(), []);

  const grupos = useMemo(() => agrupar(entries), [entries]);
  const elegidos = useMemo(() => entries.filter((e) => marcados.has(e.id)), [entries, marcados]);
  const totalArchivos = useMemo(() => elegidos.reduce((n, e) => n + e.files.length, 0), [elegidos]);
  const ocupado = fase === "preparando" || fase === "listo";

  // Entrada en cascada, una sola vez. El contenido ya es visible: si el script
  // falla, nada queda oculto. Al desmontar se corta lo que siga moviéndose.
  useEffect(() => {
    const lista = listaRef.current;
    entrarGrupos(lista);
    return () => cancelarMovimiento(lista);
  }, []);

  // Al desmontar se cancela el cierre programado, y lo que resuelva después no hace nada.
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      if (cierreRef.current !== null) {
        window.clearTimeout(cierreRef.current);
        cierreRef.current = null;
      }
    };
  }, []);

  const filas = useCallback(
    () => Array.from(listaRef.current?.querySelectorAll<HTMLElement>("label.od-pick__row") ?? []),
    [],
  );

  const alternar = (id: string) => {
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const marcarTodos = (todos: boolean) => {
    setMarcados(todos ? new Set(entries.map((e) => e.id)) : new Set());
    recorrerCasillas(filas());
  };

  const descargar = async () => {
    if (elegidos.length === 0 || ocupado) return;
    const archivos: CsvFile[] = elegidos.flatMap((e) => e.files);
    const unico = archivos.length === 1;
    const filasMarcadas = filas().filter((fila) => fila.querySelector<HTMLInputElement>("input")?.checked);
    setFase("preparando");
    try {
      // Una sola pieza baja como .csv suelto: sin LEEME ni zip.
      // El sello resuelve solo al cumplir su tope (420 ms), también con la pestaña oculta.
      await Promise.all([
        sellarFilas(filasMarcadas),
        downloadCsvFiles(archivos, zipName, unico ? undefined : [{ name: "LEEME.txt", text: readme(elegidos) }]),
      ]);
      // Cerrado a media descarga: este diálogo ya no existe y no programa nada.
      if (!vivo.current) return;
      setResultado(
        unico
          ? `Listo: descargado ${conNombreCsv(archivos[0].filename)}`
          : `Listo: ${archivos.length} archivos descargados`,
      );
      setFase("listo");
      cierreRef.current = window.setTimeout(() => {
        cierreRef.current = null;
        if (vivo.current) cerrar();
      }, CIERRE_MS);
    } catch {
      if (vivo.current) setFase("error");
    }
  };

  const contador =
    fase === "listo"
      ? resultado
      : fase === "preparando"
        ? "Preparando la descarga…"
        : elegidos.length === 0
          ? "Marca al menos un conjunto para descargar"
          : `${elegidos.length} de ${entries.length} conjuntos`;

  const accion =
    fase === "preparando"
      ? "Preparando la descarga…"
      : fase === "listo"
        ? "Descarga lista"
        : totalArchivos === 1
        ? "Descargar CSV"
        : `Descargar ${totalArchivos} archivos (.zip)`;

  return createPortal(
    <Modal
      title="Descargar datos en CSV"
      description={`Elige qué conjuntos del informe ${reportName} quieres. Cada uno baja con todos sus cortes y campus, tal como lo reporta su oficina.`}
      onClose={cerrar}
      size="form"
    >
      <div className="od-pick">
        <div className="od-pick__tools">
          <button type="button" className="od-pick__link" onClick={() => marcarTodos(true)} disabled={ocupado}>
            Marcar todos
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="od-pick__link" onClick={() => marcarTodos(false)} disabled={ocupado}>
            Quitar todos
          </button>
        </div>

        <div className="od-pick__list" ref={listaRef}>
          {grupos.map((grupo) => {
            const n = grupo.entries.filter((e) => marcados.has(e.id)).length;
            return (
              <fieldset key={grupo.nombre} className="od-pick__group" disabled={ocupado}>
                <legend>
                  {grupo.nombre}
                  <span className="od-pick__count">{n} de {grupo.entries.length}</span>
                </legend>
                {grupo.entries.map((entry) => (
                  <label key={entry.id} className="od-pick__row">
                    <input type="checkbox" checked={marcados.has(entry.id)} onChange={() => alternar(entry.id)} />
                    <span className="od-pick__text">
                      {entry.label}
                      {(entry.detail || entry.reserved) && (
                        <small>
                          {[entry.detail, entry.reserved ? "con cifras en reserva" : null].filter(Boolean).join(" · ")}
                        </small>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>

        <p className="od-pick__note">
          Los archivos abren en Excel en español: separador punto y coma y coma decimal. Una casilla vacía es un dato
          sin reportar, no un cero.
        </p>

        <div className="od-pick__footer">
          <div className="od-pick__status">
            <span aria-live="polite">{contador}</span>
            {fase === "error" && (
              <span role="alert" className="od-pick__error">
                No se pudo preparar la descarga. Inténtalo de nuevo.
              </span>
            )}
          </div>
          <div className="od-pick__buttons">
            <button type="button" className="od-button od-button--ghost" onClick={cerrar} disabled={ocupado}>
              Cancelar
            </button>
            {/* Ocupado, sigue enfocable (aria-disabled): el foco no se cae del diálogo. */}
            <button
              type="button"
              className="od-button od-button--signal"
              onClick={descargar}
              disabled={!ocupado && elegidos.length === 0}
              aria-disabled={ocupado || undefined}
            >
              {accion}
            </button>
          </div>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
