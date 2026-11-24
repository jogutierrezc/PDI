/* =============================================================================
   Espacio de archivos · el explorador: migas, barra de comandos, carpetas,
   mosaicos con miniatura, lista y panel de detalles.

   La estructura del prototipo aprobado: arriba las migas y la barra de
   comandos (acciones, filtros, vista, detalles) y debajo los archivos como
   mosaicos o como lista. Doble clic o Enter abre el editor a pantalla completa.
   Qué archivos hay, su estado y sus etiquetas lo pone cada módulo.
   ========================================================================== */

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { IconoArchivo, Miniatura, MiniaturaCarpeta } from "./piezas";
import type { TipoArchivo } from "./piezas";
import { cajaDe, useCascada, usePanelAncho } from "./movimiento";
import type { Caja } from "./tipos";

export type VistaArchivos = "mosaicos" | "lista";

export interface ItemArchivo {
  id: string;
  nombre: string;
  tipo: TipoArchivo;
  /** Columnas de la miniatura. */
  columnas: number;
  /** «Tabla · hace 5 min · 3 filas». */
  subtitulo: ReactNode;
  /** La ficha de estado. */
  estado: ReactNode;
  /** Etiquetas junto al estado (a qué responde). */
  sellos?: ReactNode;
  /** Pie del mosaico (p. ej. un medidor). */
  pie?: ReactNode;
  /** Celdas de la vista Lista, después del nombre, en el orden de `encabezadosLista`. */
  celdas: ReactNode[];
}

export interface ItemCarpeta {
  id: string;
  nombre: string;
  subtitulo: string;
}

/* ---------- migas y comandos ------------------------------------------------------------ */

export function Migas({ partes }: { partes: { texto: string; onClick?: () => void }[] }) {
  return (
    <div className="es-crumb" aria-label="Dónde está">
      {partes.map((p, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 ? <Icon name="chevron-right" size={14} /> : null}
          <button type="button" onClick={p.onClick}>
            {p.texto}
          </button>
        </span>
      ))}
    </div>
  );
}

export function Comandos({
  izquierda,
  filtros,
  vista,
  onVista,
  detalles,
  onDetalles,
  onRecorrido,
}: {
  /** Botones de la izquierda (Nuevo, Subir…). */
  izquierda: ReactNode;
  filtros?: { items: { id: string; etiqueta: string }[]; valor: string; onCambiar: (id: string) => void };
  vista: VistaArchivos;
  onVista: (v: VistaArchivos) => void;
  detalles: boolean;
  onDetalles: (abierto: boolean) => void;
  onRecorrido?: () => void;
}) {
  return (
    <div className="es-cmd" data-tour="es-comandos">
      {izquierda}
      <span className="es-sep" />
      {filtros ? (
        <div className="es-chips" role="group" aria-label="Filtrar archivos">
          {filtros.items.map((f) => (
            <button key={f.id} type="button" className="es-chip" aria-pressed={filtros.valor === f.id} onClick={() => filtros.onCambiar(f.id)}>
              {f.etiqueta}
            </button>
          ))}
        </div>
      ) : null}
      <span className="es-grow" />
      {onRecorrido ? (
        <button type="button" className="es-btn es-btn--ghost" onClick={onRecorrido}>
          <Icon name="play" size={16} />
          Recorrido
        </button>
      ) : null}
      <div className="es-seg" role="group" aria-label="Vista" data-tour="es-vista">
        <button type="button" aria-pressed={vista === "mosaicos"} aria-label="Mosaicos" onClick={() => onVista("mosaicos")}>
          <Icon name="tiles" size={16} />
        </button>
        <button type="button" aria-pressed={vista === "lista"} aria-label="Lista" onClick={() => onVista("lista")}>
          <Icon name="rows" size={16} />
        </button>
      </div>
      <button type="button" className="es-btn es-btn--ghost" aria-pressed={detalles} aria-label="Detalles" onClick={() => onDetalles(!detalles)}>
        <Icon name="info" size={16} />
      </button>
    </div>
  );
}

/* ---------- la zona de archivos ------------------------------------------------------------ */

/** El área que se desplaza; sus mosaicos y filas entran en cascada cada vez que cambia `clave`. */
export function Zona({ clave, children }: { clave: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useCascada(ref, ".es-tile, .es-lista tbody tr", clave);
  return (
    <div className="es-files" ref={ref} data-tour="es-archivos">
      {children}
    </div>
  );
}

export function Carpetas({ carpetas, onAbrir }: { carpetas: ItemCarpeta[]; onAbrir: (id: string) => void }) {
  return (
    <div className="es-tiles">
      {carpetas.map((c) => (
        <button key={c.id} type="button" className="es-tile es-folder" onClick={() => onAbrir(c.id)}>
          <span className="es-thumb">
            <MiniaturaCarpeta />
          </span>
          <span className="es-tile__meta">
            <span className="es-tile__nm">
              <IconoArchivo tipo="carpeta" />
              <span>{c.nombre}</span>
            </span>
            <span className="es-tile__sub">{c.subtitulo}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Archivos({
  items,
  vista,
  seleccion,
  onSeleccionar,
  onAbrir,
  encabezadosLista,
}: {
  items: ItemArchivo[];
  vista: VistaArchivos;
  seleccion: string | null;
  onSeleccionar: (id: string) => void;
  onAbrir: (id: string, caja: Caja | null) => void;
  /** Títulos de las columnas de la lista después de «Nombre». */
  encabezadosLista: string[];
}) {
  const alTeclear = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAbrir(id, cajaDe(e.currentTarget));
    }
  };
  if (vista === "mosaicos") {
    return (
      <div className="es-tiles" role="listbox" aria-label="Archivos">
        {items.map((a) => (
          <button key={a.id} type="button" role="option" className="es-tile" data-id={a.id} aria-selected={seleccion === a.id} onClick={() => onSeleccionar(a.id)} onDoubleClick={(e) => onAbrir(a.id, cajaDe(e.currentTarget))} onKeyDown={(e) => alTeclear(e, a.id)}>
            <span className="es-thumb">
              <Miniatura tipo={a.tipo} columnas={a.columnas} />
            </span>
            <span className="es-tile__meta">
              <span className="es-tile__nm">
                <IconoArchivo tipo={a.tipo} />
                <span>{a.nombre}</span>
              </span>
              <span className="es-tile__sub">{a.subtitulo}</span>
              <span className="es-tile__row2">
                {a.estado}
                {a.sellos}
              </span>
              {a.pie}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <table className="es-lista" role="listbox" aria-label="Archivos">
      <thead>
        <tr>
          <th>Nombre</th>
          {encabezadosLista.map((t) => (
            <th key={t}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.id} role="option" tabIndex={0} data-id={a.id} aria-selected={seleccion === a.id} onClick={() => onSeleccionar(a.id)} onDoubleClick={(e) => onAbrir(a.id, cajaDe(e.currentTarget))} onKeyDown={(e) => alTeclear(e, a.id)}>
            <td>
              <span className="es-fn">
                <IconoArchivo tipo={a.tipo} />
                {a.nombre}
              </span>
            </td>
            {a.celdas.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** El panel de detalles: se abre de ancho y su contenido lo pone el módulo. */
export function PanelDetalles({ abierto, children }: { abierto: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  usePanelAncho(ref, abierto, 320);
  return (
    <aside ref={ref} className="es-details" data-tour="es-detalles" data-open={abierto} aria-label="Detalles" aria-hidden={!abierto}>
      <div className="es-details__in">{children}</div>
    </aside>
  );
}
