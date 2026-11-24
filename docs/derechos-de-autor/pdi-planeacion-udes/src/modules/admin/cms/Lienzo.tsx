/* =============================================================================
   CMS Portales · lienzo del editor.

   Los bloques tal como se verán, con la misma cuadrícula y el mismo render que
   la página pública. Encima de la celda elegida aparece la barra: arrastrar
   desde el asa, subir, bajar, duplicar, ocultar y eliminar. Sin cambiar el
   contenido: eso está en el inspector.

   Columnas con contenido: cada columna de un contenedor es una zona de suelta.
   Se arrastra desde la biblioteca (copia) o desde un bloque de la página o de
   otra columna (mueve); soltar fuera de las columnas lo deja en la página. Un
   bloque dentro de una columna tiene la misma barra, más «columna anterior»,
   «columna siguiente» y «sacar de la columna» para moverlo sin ratón.

   Teclado: Tab recorre los bloques; Enter o Espacio los elige; Alt+flechas los
   mueve (arriba y abajo en su lista; izquierda y derecha entre columnas); Supr los
   elimina; Esc suelta la selección (EditorBloques los atiende).
   ========================================================================== */

import { useEffect, useState, type DragEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { IconoCms } from "./iconos";
import { definicion } from "./bloques";
import { BloqueVista, CeldaBloque, EdicionCtx, evitarNavegacion, type EdicionContenedores } from "./render";
import { idHijo, ocultoDe, resolverBloque, tipoAnidable, hijosPlanos, type LineaBloque } from "./logica";
import { TIPO_ARRASTRE_BLOQUE } from "./PanelIzquierdo";
import { estiloDeMarco, familiasUsadas, useFuentes, type EstiloSitioParcial } from "./estilo";

export type Accion = "subir" | "bajar" | "duplicar" | "ocultar" | "eliminar" | "columna-ant" | "columna-sig" | "sacar";
export type Marca = { id: string | null; lado: "antes" | "despues" } | null;
/** Dónde se soltaría un bloque dentro de una columna: antes del hijo con ese índice (o al final). */
type MarcaColumna = { contenedor: string; columna: number; indice: number } | null;

interface LienzoProps {
  bloques: LineaBloque[];
  seleccion: string | null;
  /** Vista previa: sin barras, sin bloques ocultos y con la entrada animada. */
  modo: "editar" | "vista";
  /** Cambia para volver a reproducir la entrada de un bloque (la página entera o solo él). */
  disparo: (id: string) => string;
  onSeleccionar: (id: string | null) => void;
  onAccion: (accion: Accion, id: string) => void;
  /** Mueve un bloque (o un hijo de una columna) a la página, antes del índice dado (índice de la lista actual). */
  onMoverA: (id: string, destino: number) => void;
  /** Suelta un tipo de la biblioteca: lo inserta antes del índice dado. */
  onInsertar: (tipo: string, destino: number) => void;
  /** Mueve un bloque a una columna, antes del índice dado de esa columna. */
  onMoverAColumna: (id: string, contenedor: string, columna: number, indice: number) => void;
  /** Suelta un tipo de la biblioteca (o lo elige con «Agregar bloque») en una columna. */
  onInsertarEnColumna: (tipo: string, contenedor: string, columna: number, indice: number) => void;
  /** Estilo del sitio del portal; sin él, el aspecto de siempre. */
  estilo?: EstiloSitioParcial | null;
}

/**
 * El tipo que lleva un bloque arrastrado desde la biblioteca. En dragover solo se pueden leer los
 * nombres de los datos, no su valor: por eso la biblioteca lo repite en el nombre de un dato extra.
 */
const tipoNuevoDe = (e: DragEvent): string | null => {
  const prefijo = `${TIPO_ARRASTRE_BLOQUE}.`;
  const t = Array.from(e.dataTransfer.types).find((x) => x.startsWith(prefijo));
  return t ? t.slice(prefijo.length) : null;
};

/** La posición de suelta en una columna: antes del primer hijo cuya mitad queda por debajo del puntero. */
function indiceEnColumna(columna: HTMLElement, y: number): number {
  const celdas = Array.from(columna.children).filter((el) => el.classList.contains("cms-celda--hijo"));
  for (let i = 0; i < celdas.length; i += 1) {
    const r = celdas[i]!.getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return celdas.length;
}

interface BarraProps {
  id: string;
  nombre: string;
  oculto: boolean;
  /** Posición entre sus hermanos (en la página o en su columna). */
  i: number;
  total: number;
  /** Solo para un bloque dentro de una columna. */
  columna?: { indice: number; total: number };
  onAsa: () => void;
  onAccion: (accion: Accion, id: string) => void;
}

/** Etiqueta y barra de acciones del bloque elegido: la misma en la página y dentro de una columna. */
function Barra({ id, nombre, oculto, i, total, columna, onAsa, onAccion }: BarraProps) {
  return (
    <>
      <span className="cms-celda__etiqueta">{oculto ? `${nombre} · Oculto` : nombre}</span>
      <div className="cms-celda__barra" role="toolbar" aria-label={`Acciones de ${nombre}`}>
        <button type="button" className="cms-ib cms-ib--asa" aria-label="Arrastrar para mover" title="Arrastrar para mover" onPointerDown={onAsa}>
          <Icon name="grip" size={16} />
        </button>
        <button type="button" className="cms-ib" aria-label="Subir bloque" title="Subir (Alt + flecha arriba)" disabled={i === 0} onClick={() => onAccion("subir", id)}>
          <Icon name="chevron-down" size={16} className="cms-ico--arriba" />
        </button>
        <button type="button" className="cms-ib" aria-label="Bajar bloque" title="Bajar (Alt + flecha abajo)" disabled={i === total - 1} onClick={() => onAccion("bajar", id)}>
          <Icon name="chevron-down" size={16} />
        </button>
        {columna && (
          <>
            <button type="button" className="cms-ib" aria-label="Pasar a la columna anterior" title="Columna anterior (Alt + flecha izquierda)" disabled={columna.indice === 0} onClick={() => onAccion("columna-ant", id)}>
              <Icon name="arrow-left" size={16} />
            </button>
            <button type="button" className="cms-ib" aria-label="Pasar a la columna siguiente" title="Columna siguiente (Alt + flecha derecha)" disabled={columna.indice === columna.total - 1} onClick={() => onAccion("columna-sig", id)}>
              <Icon name="arrow-right" size={16} />
            </button>
            <button type="button" className="cms-ib" aria-label="Sacar de la columna" title="Sacar de la columna, debajo de las columnas (Alt + Mayús + flecha arriba)" onClick={() => onAccion("sacar", id)}>
              <Icon name="external" size={16} />
            </button>
          </>
        )}
        <button type="button" className="cms-ib" aria-label="Duplicar bloque" title="Duplicar" onClick={() => onAccion("duplicar", id)}>
          <IconoCms name="copiar" size={16} />
        </button>
        <button
          type="button"
          className="cms-ib"
          aria-label={oculto ? "Mostrar bloque" : "Ocultar bloque"}
          title={oculto ? "Mostrar en la página" : "Ocultar en la página"}
          onClick={() => onAccion("ocultar", id)}
        >
          <Icon name={oculto ? "eye" : "eye-off"} size={16} />
        </button>
        <button type="button" className="cms-ib cms-ib--peligro" aria-label="Eliminar bloque" title="Eliminar (Supr)" onClick={() => onAccion("eliminar", id)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </>
  );
}

export function Lienzo({ bloques, seleccion, modo, disparo, onSeleccionar, onAccion, onMoverA, onInsertar, onMoverAColumna, onInsertarEnColumna, estilo }: LienzoProps) {
  const editando = modo === "editar";
  const aplicado = estiloDeMarco(estilo);
  useFuentes(familiasUsadas(estilo, [...bloques, ...hijosPlanos(bloques)]));
  const [agarre, setAgarre] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [marca, setMarca] = useState<Marca>(null);
  const [marcaCol, setMarcaCol] = useState<MarcaColumna>(null);

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
    setMarcaCol(null);
  };

  // En vista previa los ocultos no existen; en edición se ven atenuados.
  const hayAlgo = bloques.some((b) => editando || !ocultoDe(b.props));
  if (!hayAlgo) {
    return <p className="cms-vacio">Esta página no tiene bloques todavía. Elija uno en la pestaña Bloques.</p>;
  }

  /** ¿Lo que se arrastra viene de la biblioteca de bloques? (en dragover solo se pueden leer los tipos) */
  const esNuevo = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TIPO_ARRASTRE_BLOQUE);
  /** ¿Lo que se arrastra cabe dentro de una columna? Ni «html», ni otras columnas, ni lo reservado a la administración. */
  const cabeEnColumna = (e: DragEvent) => {
    const tipo = arrastrando ? resolverBloque(bloques, arrastrando)?.tipo : tipoNuevoDe(e);
    return Boolean(tipo) && tipoAnidable(tipo);
  };
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

  /** Lo que el contenedor necesita del editor para dibujar sus columnas y sus hijos como zonas editables. */
  const edicion: EdicionContenedores = {
    seleccion,
    disparo,
    agregar: (contenedor, columna, indice, tipo) => onInsertarEnColumna(tipo, contenedor, columna, indice),
    zona: (contenedor, columna) => ({
      className: marcaCol && marcaCol.contenedor === contenedor && marcaCol.columna === columna ? "cms-cont__col--sobre" : "",
      atributos: {
        onDragOver: (e) => {
          if (!arrastrando && !esNuevo(e)) return;
          e.stopPropagation();
          if (!cabeEnColumna(e)) {
            // Sin preventDefault el navegador muestra el cursor de «no se puede soltar aquí».
            e.dataTransfer.dropEffect = "none";
            setMarcaCol(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = arrastrando ? "move" : "copy";
          const indice = indiceEnColumna(e.currentTarget, e.clientY);
          setMarca(null);
          setMarcaCol((previa) => (previa && previa.contenedor === contenedor && previa.columna === columna && previa.indice === indice ? previa : { contenedor, columna, indice }));
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMarcaCol(null);
        },
        onDrop: (e) => {
          if (!arrastrando && !esNuevo(e)) return;
          e.stopPropagation();
          if (!cabeEnColumna(e)) {
            limpiarArrastre();
            return;
          }
          e.preventDefault();
          const indice = indiceEnColumna(e.currentTarget, e.clientY);
          if (arrastrando) onMoverAColumna(arrastrando, contenedor, columna, indice);
          else {
            const tipo = e.dataTransfer.getData(TIPO_ARRASTRE_BLOQUE);
            if (tipo) onInsertarEnColumna(tipo, contenedor, columna, indice);
          }
          limpiarArrastre();
        },
      },
    }),
    celdaHijo: ({ contenedor, columna, columnas, indice, total, hijo }) => {
      const id = idHijo(contenedor, hijo.id);
      const nombre = definicion(hijo.tipo)?.nombre ?? `Tipo ${hijo.tipo}`;
      const sel = id === seleccion;
      const oculto = ocultoDe(hijo.props);
      const aqui = marcaCol && marcaCol.contenedor === contenedor && marcaCol.columna === columna ? marcaCol.indice : null;
      // La línea de suelta va sobre el hijo que quedaría debajo; al final de la columna, bajo el último.
      const lado = aqui === indice ? "antes" : aqui === total && indice === total - 1 ? "despues" : null;
      const clases = ["cms-celda--editable", sel && "cms-celda--sel", oculto && "cms-celda--oculto", lado && `cms-celda--marca-${lado}`].filter(Boolean).join(" ");
      return {
        className: clases,
        atributos: {
          "data-id": id,
          role: "group",
          "aria-label": `${nombre}, bloque ${indice + 1} de ${total} en la columna ${columna + 1} de ${columnas}${oculto ? ", oculto" : ""}`,
          tabIndex: 0,
          draggable: agarre === id,
          onClick: (e) => {
            e.stopPropagation();
            onSeleccionar(id);
          },
          onKeyDown: (e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSeleccionar(id);
            }
          },
          onDragStart: (e) => {
            // El contenedor que lo envuelve también escucha: sin esto cancelaría el arrastre del hijo.
            e.stopPropagation();
            if (agarre !== id) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            setArrastrando(id);
          },
          onDragEnd: limpiarArrastre,
        },
        barra: sel ? (
          <Barra id={id} nombre={nombre} oculto={oculto} i={indice} total={total} columna={{ indice: columna, total: columnas }} onAsa={() => setAgarre(id)} onAccion={onAccion} />
        ) : null,
      };
    },
  };

  return (
    <EdicionCtx.Provider value={editando ? edicion : null}>
      <div
        className={`cms-marco${marca && marca.id === null ? " cms-marco--fin" : ""}${aplicado.clase ? ` ${aplicado.clase}` : ""}`}
        style={aplicado.style}
        onClickCapture={evitarNavegacion}
        onClick={(e) => {
          if (editando && !(e.target as Element).closest(".cms-celda")) onSeleccionar(null);
        }}
        onDragOver={(e) => {
          if (!editando || !(arrastrando || esNuevo(e))) return;
          e.preventDefault();
          setMarcaCol(null);
          setMarca({ id: null, lado: "despues" });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setMarca(null);
            setMarcaCol(null);
          }
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
                        setMarcaCol(null);
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
                {sel && <Barra id={b.id} nombre={nombre} oculto={oculto} i={i} total={bloques.length} onAsa={() => setAgarre(b.id)} onAccion={onAccion} />}
                <BloqueVista bloque={b} disparo={disparo(b.id)} auto={!editando} />
              </CeldaBloque>
            );
          })}
        </div>
      </div>
    </EdicionCtx.Provider>
  );
}
