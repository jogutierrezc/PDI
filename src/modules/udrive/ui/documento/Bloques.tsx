/* =============================================================================
   UDrive · los bloques en la hoja del editor.

   Cada bloque se dibuja con las mismas piezas del PDF (salida/Piezas.tsx); lo
   que cambia es el borde de selección, la pestaña con el nombre, la barra de
   acciones (subir, bajar, duplicar, comentar, borrar y el asa para arrastrar)
   y que el texto es editable. Los botones de subir y bajar son el camino
   accesible para reordenar; arrastrar con el asa es el atajo del ratón.
   ========================================================================== */

import { memo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { NOMBRE_BLOQUE } from "../../lib/documento";
import type { BCapitulo, BDestacado, BLista, BNota, BParrafo, Bloque, TipoBloque } from "../../lib/documento";
import { CapituloVista, FiguraGrafica, FiguraImagen, FiguraMapa, FiguraTabla, FuenteVista, TituloReferencias, useRender } from "../../salida/Piezas";
import { MenuInsertar } from "./MenuInsertar";
import { TextoRico } from "./TextoRico";
import type { ApiTexto } from "./TextoRico";

export interface AccionesBloque {
  seleccionar(id: string | null): void;
  cambiar(b: Bloque, claveHistorial?: string): void;
  subir(id: string): void;
  bajar(id: string): void;
  duplicar(id: string): void;
  borrar(id: string): void;
  insertar(tipo: TipoBloque, despuesDe: string | null): void;
  /** Inserta un bloque ya armado (con su texto) justo después de `despuesDe`; lo deja elegido. */
  insertarConContenido(bloque: Bloque, despuesDe: string | null): void;
  /** Mueve el bloque justo después de `despuesDe` (nulo = al principio). */
  mover(id: string, despuesDe: string | null): void;
  comentarios(id: string): void;
  activarTexto(api: ApiTexto | null): void;
  /** Crea un párrafo vacío después del bloque y le pone el foco. */
  parrafoDespuesDe(id: string): void;
}

export const MIME_BLOQUE = "application/x-udrive-bloque";

/* ---------- la fila «+» entre bloques ------------------------------------------------------------ */

export function FilaInsertar({ despuesDe, editable, acc }: { despuesDe: string | null; editable: boolean; acc: AccionesBloque }) {
  const [abierto, setAbierto] = useState(false);
  const [sobre, setSobre] = useState(false);
  if (!editable) return <div className="ud-ins" aria-hidden="true" style={{ height: 8 }} />;
  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    const id = e.dataTransfer.getData(MIME_BLOQUE);
    if (id) acc.mover(id, despuesDe);
  };
  return (
    <div
      className="ud-ins"
      data-abierto={abierto}
      data-sobre={sobre}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(MIME_BLOQUE)) {
          e.preventDefault();
          setSobre(true);
        }
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={alSoltar}
    >
      <span />
      <button type="button" aria-label="Insertar un bloque aquí" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <Icon name="plus" size={12} />
      </button>
      {abierto ? (
        <MenuInsertar
          onCerrar={() => setAbierto(false)}
          onElegir={(t) => {
            setAbierto(false);
            acc.insertar(t, despuesDe);
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- el contenedor de cada bloque ------------------------------------------------------------- */

export const BloqueEnHoja = memo(function BloqueEnHoja({
  b,
  indice,
  total,
  sel,
  editable,
  sangria,
  comentarios,
  acc,
}: {
  b: Bloque;
  indice: number;
  total: number;
  sel: boolean;
  editable: boolean;
  sangria: boolean;
  comentarios: number;
  acc: AccionesBloque;
}) {
  const [arrastrando, setArrastrando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={raiz}
      className="ud-blk"
      data-bloque={b.id}
      data-sel={sel}
      data-arrastrando={arrastrando || undefined}
      style={arrastrando ? { opacity: 0.5 } : undefined}
      onClick={(e) => {
        if (!sel) acc.seleccionar(b.id);
        e.stopPropagation();
      }}
      onFocusCapture={() => !sel && acc.seleccionar(b.id)}
    >
      <span className="ud-blk-tab">{NOMBRE_BLOQUE[b.tipo]}</span>
      {sel ? (
        <div className="ud-blk-acc" role="toolbar" aria-label={`Acciones de ${NOMBRE_BLOQUE[b.tipo].toLowerCase()}`}>
          {editable ? (
            <>
              <button
                type="button"
                data-asa
                draggable
                aria-label="Arrastrar para reordenar"
                title="Arrastre para reordenar"
                onDragStart={(e) => {
                  e.dataTransfer.setData(MIME_BLOQUE, b.id);
                  e.dataTransfer.effectAllowed = "move";
                  if (raiz.current) e.dataTransfer.setDragImage(raiz.current, 20, 20);
                  setArrastrando(true);
                }}
                onDragEnd={() => setArrastrando(false)}
              >
                <Icon name="grip" size={16} />
              </button>
              <button type="button" aria-label="Subir el bloque" title="Subir (Alt + ↑)" disabled={indice === 0} onClick={() => acc.subir(b.id)}>
                <Icon name="chevron-down" size={16} className="ud-flip" />
              </button>
              <button type="button" aria-label="Bajar el bloque" title="Bajar (Alt + ↓)" disabled={indice === total - 1} onClick={() => acc.bajar(b.id)}>
                <Icon name="chevron-down" size={16} />
              </button>
              <button type="button" aria-label="Duplicar el bloque" title="Duplicar (Ctrl + D)" onClick={() => acc.duplicar(b.id)}>
                <Icon name="layers" size={16} />
              </button>
            </>
          ) : null}
          <button type="button" aria-label="Comentarios del bloque" title="Comentarios" onClick={() => acc.comentarios(b.id)}>
            <Icon name="info" size={16} />
          </button>
          {editable ? (
            <button type="button" data-peligro aria-label="Borrar el bloque" title="Borrar (Supr)" onClick={() => acc.borrar(b.id)}>
              <Icon name="trash" size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
      {comentarios > 0 ? (
        <button type="button" className="ud-blk-com" aria-label={`${comentarios} comentarios sin resolver`} onClick={() => acc.comentarios(b.id)}>
          <Icon name="info" size={12} />
          {comentarios}
        </button>
      ) : null}
      <ContenidoBloque b={b} editable={editable} sangria={sangria} acc={acc} />
    </div>
  );
});

/* ---------- el contenido, según el tipo ----------------------------------------------------------------- */

function ContenidoBloque({ b, editable, sangria, acc }: { b: Bloque; editable: boolean; sangria: boolean; acc: AccionesBloque }) {
  switch (b.tipo) {
    case "capitulo":
      return <CapituloEditable b={b} editable={editable} acc={acc} />;
    case "parrafo":
      return <ParrafoEditable b={b} editable={editable} sangria={sangria} acc={acc} />;
    case "lista":
      return <ListaEditable b={b} editable={editable} acc={acc} />;
    case "tabla":
      return <FiguraTabla b={b} />;
    case "grafica":
      return <FiguraGrafica b={b} />;
    case "imagen":
      return <FiguraImagen b={b} />;
    case "mapa":
      return <FiguraMapa b={b} />;
    case "destacado":
      return <DestacadoEditable b={b} editable={editable} acc={acc} />;
    case "nota":
      return <NotaEditable b={b} editable={editable} acc={acc} />;
    case "salto":
      return <div className="ud-salto" role="separator">Salto de página{b.orientacion === "horizontal" ? " · sigue en horizontal" : b.orientacion === "vertical" ? " · sigue en vertical" : ""}</div>;
    case "referencias":
      return <ReferenciasEnHoja b={b} />;
  }
}

function CapituloEditable({ b, editable, acc }: { b: BCapitulo; editable: boolean; acc: AccionesBloque }) {
  if (!editable) return <CapituloVista b={b} />;
  return (
    <div className="ud-pdf-cap-t" data-nivel={b.nivel}>
      <input
        className="ud-cap-input"
        type="text"
        value={b.titulo}
        maxLength={300}
        placeholder="Título del capítulo"
        aria-label={`Título del capítulo, nivel ${b.nivel}`}
        onChange={(e) => acc.cambiar({ ...b, titulo: e.target.value }, `t:${b.id}`)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), acc.parrafoDespuesDe(b.id))}
      />
    </div>
  );
}

function ParrafoEditable({ b, editable, sangria, acc }: { b: BParrafo; editable: boolean; sangria: boolean; acc: AccionesBloque }) {
  return (
    <TextoRico
      valor={b.texto}
      editable={editable}
      className={`ud-pdf-p${sangria ? " ud-sangria" : ""}`}
      etiqueta="Párrafo"
      vacio="Escriba el texto, o inserte un bloque con el +"
      onCambio={(texto) => acc.cambiar({ ...b, texto }, `t:${b.id}`)}
      onEnter={() => acc.parrafoDespuesDe(b.id)}
      onBorrarVacio={() => acc.borrar(b.id)}
      onFoco={acc.activarTexto}
    />
  );
}

function DestacadoEditable({ b, editable, acc }: { b: BDestacado; editable: boolean; acc: AccionesBloque }) {
  return (
    <TextoRico
      valor={b.texto}
      editable={editable}
      className="ud-pdf-dest"
      etiqueta="Cuadro destacado"
      vacio="Una idea clave"
      onCambio={(texto) => acc.cambiar({ ...b, texto }, `t:${b.id}`)}
      onEnter={() => acc.parrafoDespuesDe(b.id)}
      onFoco={acc.activarTexto}
    />
  );
}

function NotaEditable({ b, editable, acc }: { b: BNota; editable: boolean; acc: AccionesBloque }) {
  return (
    <div className="ud-pdf-nota ud-nota-fila">
      <b>Nota.</b>
      <TextoRico
        valor={b.texto}
        editable={editable}
        className="ud-nota-t"
        etiqueta="Nota o fuente"
        vacio="La fuente de los datos"
        onCambio={(texto) => acc.cambiar({ ...b, texto }, `t:${b.id}`)}
        onEnter={() => acc.parrafoDespuesDe(b.id)}
        onFoco={acc.activarTexto}
      />
    </div>
  );
}

function ListaEditable({ b, editable, acc }: { b: BLista; editable: boolean; acc: AccionesBloque }) {
  const Etiqueta = (b.ordenada ? "ol" : "ul") as "ol" | "ul";
  const cambiarItem = (n: number, texto: string) => acc.cambiar({ ...b, items: b.items.map((x, i) => (i === n ? texto : x)) }, `t:${b.id}:${n}`);
  return (
    <Etiqueta className="ud-pdf-lista ud-rico-lista">
      {b.items.map((texto, n) => (
        <li key={n}>
          <TextoRico
            valor={texto}
            editable={editable}
            className="ud-item-t"
            etiqueta={`Elemento ${n + 1} de la lista`}
            vacio="Elemento de la lista"
            onCambio={(t) => cambiarItem(n, t)}
            onEnter={() => acc.cambiar({ ...b, items: [...b.items.slice(0, n + 1), "", ...b.items.slice(n + 1)] })}
            onBorrarVacio={() => (b.items.length > 1 ? acc.cambiar({ ...b, items: b.items.filter((_, i) => i !== n) }) : acc.borrar(b.id))}
            onFoco={acc.activarTexto}
          />
        </li>
      ))}
    </Etiqueta>
  );
}

function ReferenciasEnHoja({ b }: { b: Extract<Bloque, { tipo: "referencias" }> }) {
  const fuentes = useRender().bibliografia;
  return (
    <div>
      <TituloReferencias titulo={b.titulo} id={b.id} />
      {fuentes.length ? fuentes.map((f) => <FuenteVista key={f.id} f={f} />) : <p className="ud-pdf-vacio">Aún no hay fuentes. Agréguelas en «Documento» del panel derecho y cítelas con «Cita APA».</p>}
    </div>
  );
}
