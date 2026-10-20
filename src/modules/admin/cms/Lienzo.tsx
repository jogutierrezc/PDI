/* =============================================================================
   CMS Portales · lienzo del editor.

   Los bloques tal como se verán, con la misma cuadrícula y el mismo render que
   la página pública. Encima de la celda elegida aparece la barra: arrastrar
   desde el asa, subir, bajar, duplicar, ocultar y eliminar. Sin cambiar el
   contenido: eso está en el inspector.

   Teclado: Tab recorre los bloques; Enter o Espacio los elige; Alt+flechas los
   mueve; Supr los elimina; Esc suelta la selección (EditorBloques los atiende).
   ========================================================================== */

import { useEffect, useState, type DragEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { IconoCms } from "./iconos";
import { definicion } from "./bloques";
import { BloqueVista, CeldaBloque, evitarNavegacion } from "./render";
import { ocultoDe, type LineaBloque } from "./logica";
import { TIPO_ARRASTRE_BLOQUE } from "./PanelIzquierdo";

export type Accion = "subir" | "bajar" | "duplicar" | "ocultar" | "eliminar";
export type Marca = { id: string | null; lado: "antes" | "despues" } | null;

interface LienzoProps {
  bloques: LineaBloque[];
  seleccion: string | null;
  /** Vista previa: sin barras, sin bloques ocultos y con la entrada animada. */
  modo: "editar" | "vista";
  /** Cambia para volver a reproducir la entrada de un bloque (la página entera o solo él). */
  disparo: (id: string) => string;
  onSeleccionar: (id: string | null) => void;
  onAccion: (accion: Accion, id: string) => void;
  /** Mueve un bloque para que quede antes del índice dado (índice de la lista actual). */
  onMoverA: (id: string, destino: number) => void;
  /** Suelta un tipo de la biblioteca: lo inserta antes del índice dado. */
  onInsertar: (tipo: string, destino: number) => void;
}

export function Lienzo({ bloques, seleccion, modo, disparo, onSeleccionar, onAccion, onMoverA, onInsertar }: LienzoProps) {
  const editando = modo === "editar";
  const [agarre, setAgarre] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [marca, setMarca] = useState<Marca>(null);

  // El asa solo habilita el arrastre mientras el puntero está apretado.
  useEffect(() => {
    if (!agarre) return;
    const soltar = () => setAgarre(null);
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, [agarre]);

  const limpiarArrastre = () => {
    setAgarre(null);
    setArrastrando(null);
    setMarca(null);
  };

  // En vista previa los ocultos no existen; en edición se ven atenuados.
  const hayAlgo = bloques.some((b) => editando || !ocultoDe(b.props));
  if (!hayAlgo) {
    return <p className="cms-vacio">Esta página no tiene bloques todavía. Elija uno en la pestaña Bloques.</p>;
  }

  /** ¿Lo que se arrastra viene de la biblioteca de bloques? (en dragover solo se pueden leer los tipos) */
  const esNuevo = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TIPO_ARRASTRE_BLOQUE);
  /** Suelta en `destino`: mueve el bloque que se arrastraba o inserta el tipo de la biblioteca. */
  const soltarEn = (e: DragEvent, destino: number) => {
    if (arrastrando) {
      e.preventDefault();
      onMoverA(arrastrando, destino);
    } else if (esNuevo(e)) {
      e.preventDefault();
      const tipo = e.dataTransfer.getData(TIPO_ARRASTRE_BLOQUE);
      if (tipo) onInsertar(tipo, destino);
    }
    limpiarArrastre();
  };

  return (
    <div
      className={`cms-marco${marca && marca.id === null ? " cms-marco--fin" : ""}`}
      onClickCapture={evitarNavegacion}
      onClick={(e) => {
        if (editando && !(e.target as Element).closest(".cms-celda")) onSeleccionar(null);
      }}
      onDragOver={(e) => {
        if (!editando || !(arrastrando || esNuevo(e))) return;
        e.preventDefault();
        setMarca({ id: null, lado: "despues" });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMarca(null);
      }}
      onDrop={(e) => soltarEn(e, bloques.length)}
    >
      <div className="cms-r-grid">
        {bloques.map((b, i) => {
          if (!editando && ocultoDe(b.props)) return null;
          const def = definicion(b.tipo);
          const nombre = def?.nombre ?? `Tipo ${b.tipo}`;
          const sel = editando && b.id === seleccion;
          const oculto = ocultoDe(b.props);
          const marcaAqui = marca && marca.id === b.id ? marca.lado : null;
          const clases = [
            editando && "cms-celda--editable",
            sel && "cms-celda--sel",
            editando && oculto && "cms-celda--oculto",
            marcaAqui && `cms-celda--marca-${marcaAqui}`,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <CeldaBloque
              key={b.id}
              bloque={b}
              className={clases}
              data-id={b.id}
              role={editando ? "group" : undefined}
              aria-label={editando ? `${nombre}, bloque ${i + 1} de ${bloques.length}${oculto ? ", oculto" : ""}` : undefined}
              tabIndex={editando ? 0 : undefined}
              draggable={editando && agarre === b.id}
              onClick={
                editando
                  ? (e) => {
                      e.stopPropagation();
                      onSeleccionar(b.id);
                    }
                  : undefined
              }
              onKeyDown={
                editando
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSeleccionar(b.id);
                      }
                    }
                  : undefined
              }
              onDragStart={
                editando
                  ? (e) => {
                      if (agarre !== b.id) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/plain", b.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastrando(b.id);
                    }
                  : undefined
              }
              onDragEnd={editando ? limpiarArrastre : undefined}
              onDragOver={
                editando
                  ? (e) => {
                      if (!arrastrando && !esNuevo(e)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setMarca({ id: b.id, lado: e.clientY < r.top + r.height / 2 ? "antes" : "despues" });
                    }
                  : undefined
              }
              onDrop={
                editando
                  ? (e) => {
                      if (!arrastrando && !esNuevo(e)) return;
                      e.stopPropagation();
                      const idx = bloques.findIndex((x) => x.id === b.id);
                      const destino = marca?.id === b.id && marca.lado === "despues" ? idx + 1 : idx;
                      soltarEn(e, destino);
                    }
                  : undefined
              }
            >
              {sel && (
                <>
                  <span className="cms-celda__etiqueta">{oculto ? `${nombre} · Oculto` : nombre}</span>
                  <div className="cms-celda__barra" role="toolbar" aria-label={`Acciones de ${nombre}`}>
                    <button
                      type="button"
                      className="cms-ib cms-ib--asa"
                      aria-label="Arrastrar para mover"
                      title="Arrastrar para mover"
                      onPointerDown={() => setAgarre(b.id)}
                    >
                      <Icon name="grip" size={16} />
                    </button>
                    <button type="button" className="cms-ib" aria-label="Subir bloque" title="Subir (Alt + flecha arriba)" disabled={i === 0} onClick={() => onAccion("subir", b.id)}>
                      <Icon name="chevron-down" size={16} className="cms-ico--arriba" />
                    </button>
                    <button type="button" className="cms-ib" aria-label="Bajar bloque" title="Bajar (Alt + flecha abajo)" disabled={i === bloques.length - 1} onClick={() => onAccion("bajar", b.id)}>
                      <Icon name="chevron-down" size={16} />
                    </button>
                    <button type="button" className="cms-ib" aria-label="Duplicar bloque" title="Duplicar" onClick={() => onAccion("duplicar", b.id)}>
                      <IconoCms name="copiar" size={16} />
                    </button>
                    <button
                      type="button"
                      className="cms-ib"
                      aria-label={oculto ? "Mostrar bloque" : "Ocultar bloque"}
                      title={oculto ? "Mostrar en la página" : "Ocultar en la página"}
                      onClick={() => onAccion("ocultar", b.id)}
                    >
                      <Icon name={oculto ? "eye" : "eye-off"} size={16} />
                    </button>
                    <button type="button" className="cms-ib cms-ib--peligro" aria-label="Eliminar bloque" title="Eliminar (Supr)" onClick={() => onAccion("eliminar", b.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </>
              )}
              <BloqueVista bloque={b} disparo={disparo(b.id)} auto={!editando} />
            </CeldaBloque>
          );
        })}
      </div>
    </div>
  );
}
