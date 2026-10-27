/* =============================================================================
   CMS Portales · panel izquierdo del espacio de trabajo.

   Tres pestañas: Páginas (el árbol, lo pone CmsPortales), Bloques (la
   biblioteca por grupo: clic para agregar o arrastrar al lienzo) y Capas (los
   bloques de la página en orden, con el ojo para ocultarlos). Sin página
   elegida solo hay árbol.
   ========================================================================== */

import { Fragment, useState, type DragEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../../../components/ui/Icon";
import { useAuth } from "../../../lib/auth";
import { BLOQUES, GRUPOS, definicion } from "./bloques";
import { resumenDeBloque } from "./esquema";
import { IconoCms } from "./iconos";
import { contenedorDe, idHijo, ocultoDe, type LineaBloque } from "./logica";
import { Pestanas, idPanel, idPestana, type PestanaDef } from "./Pestanas";

/** Tipo de dato que lleva un bloque arrastrado desde la biblioteca. */
export const TIPO_ARRASTRE_BLOQUE = "application/x-cms-bloque";

type Pestana = "paginas" | "bloques" | "capas";

const ICONO_BLOQUE: Record<string, IconName> = {
  hero: "rows",
  ods: "list",
  frentes: "tiles",
  rankings: "chart",
  informes: "document",
  ticker: "list",
  salto: "columns-view",
  mosaico: "tiles",
  cierre: "rows",
  texto: "pen",
  cta: "link",
  cuadricula: "grid",
  cifras: "spark-chart",
  "imagen-texto": "columns-view",
  cita: "pen",
  html: "code",
  "linea-tiempo": "clock",
  equipo: "users",
  testimonios: "person",
  pestanas: "folder",
  banner: "layers",
  "contacto-mapa": "pin",
  "columnas-desiguales": "columns",
  contenedor: "columns-view",
  video: "play",
  indicadores: "chart",
  "graficas-sostenibles": "chart",
  "avance-plan": "spark-chart",
  "pilares-plan": "columns-view",
  "sdg-band": "grid",
  "campus-explorer": "pin",
  "route-finder": "compass",
  "galeria-oficina": "tiles",
  recientes: "clock",
  "equipo-oficina": "users",
  "resource-room": "library",
};

interface EditorPanel {
  bloques: LineaBloque[];
  seleccion: string | null;
  /** Agregar y arrastrar se apagan en la vista previa. */
  puedeAgregar: boolean;
  onAgregar: (tipo: string) => void;
  onElegir: (id: string) => void;
  onOcultar: (id: string) => void;
}

interface PanelIzquierdoProps {
  paginas: ReactNode;
  editor?: EditorPanel;
}

export function PanelIzquierdo({ paginas, editor }: PanelIzquierdoProps) {
  const [pestana, setPestana] = useState<Pestana>("paginas");
  const pestanas: PestanaDef<Pestana>[] = [
    { id: "paginas", etiqueta: "Páginas", icono: <IconoCms name="pagina" size={15} /> },
    { id: "bloques", etiqueta: "Bloques", icono: <IconoCms name="bloques" size={15} /> },
    { id: "capas", etiqueta: "Capas", icono: <Icon name="layers" size={15} /> },
  ];
  const activa: Pestana = editor ? pestana : "paginas";

  return (
    <aside className="cms-izq" aria-label="Contenido del portal">
      {editor && <Pestanas base="cms-izq" etiqueta="Contenido del portal" pestanas={pestanas} valor={pestana} onCambio={setPestana} />}
      <div
        className="cms-panel"
        role={editor ? "tabpanel" : undefined}
        id={editor ? idPanel("cms-izq") : undefined}
        aria-labelledby={editor ? idPestana("cms-izq", activa) : undefined}
      >
        {activa === "paginas" && paginas}
        {editor && activa === "bloques" && <Biblioteca editor={editor} />}
        {editor && activa === "capas" && <Capas editor={editor} />}
      </div>
    </aside>
  );
}

function Biblioteca({ editor }: { editor: EditorPanel }) {
  // Los bloques reservados a la administración (HTML) no se ofrecen a quien no lo es.
  const esAdmin = useAuth().hasRole("admin");
  const empezar = (e: DragEvent, tipo: string) => {
    e.dataTransfer.setData(TIPO_ARRASTRE_BLOQUE, tipo);
    // En dragover solo se leen los nombres de los datos: el tipo viaja también en uno, para que una columna
    // pueda rechazar de entrada lo que no admite (cursor de «no se puede soltar»).
    e.dataTransfer.setData(`${TIPO_ARRASTRE_BLOQUE}.${tipo}`, "1");
    e.dataTransfer.setData("text/plain", tipo);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <>
      <p className="cms-ayuda">
        {editor.puedeAgregar
          ? "Clic para agregar después del bloque elegido, o arrastre hasta el lienzo o hasta una columna."
          : "En la vista previa no se agregan bloques. Vuelva a Editar."}
      </p>
      {GRUPOS.map((grupo) => {
        const items = BLOQUES.filter((b) => b.grupo === grupo && (!b.soloAdmin || esAdmin));
        if (items.length === 0) return null;
        return (
          <section key={grupo} aria-label={grupo}>
            <h3 className="cms-panel__titulo">{grupo}</h3>
            <ul className="cms-lib">
              {items.map((b) => (
                <li key={b.tipo}>
                  <button
                    type="button"
                    className="cms-lib__item"
                    disabled={!editor.puedeAgregar}
                    draggable={editor.puedeAgregar}
                    onDragStart={(e) => empezar(e, b.tipo)}
                    onClick={() => editor.onAgregar(b.tipo)}
                  >
                    <span className="cms-lib__ico" aria-hidden="true">
                      <Icon name={ICONO_BLOQUE[b.tipo] ?? "tiles"} size={16} />
                    </span>
                    <b>{b.nombre}</b>
                    <span className="cms-lib__ayuda">{b.ayuda}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** Una fila de la lista de capas: la de un bloque de la página o la de uno que va dentro de una columna. */
function Capa({ editor, id, tipo, props }: { editor: EditorPanel; id: string; tipo: string; props: LineaBloque["props"] }) {
  const nombre = definicion(tipo)?.nombre ?? `Tipo ${tipo}`;
  const oculto = ocultoDe(props);
  return (
    <li className={`cms-capa${oculto ? " is-oculta" : ""}`} aria-current={editor.seleccion === id ? "true" : undefined}>
      <button type="button" className="cms-capa__elegir" onClick={() => editor.onElegir(id)}>
        <b>
          {nombre}
          {oculto && <span className="cms-sr"> (oculto)</span>}
        </b>
        <small>{resumenDeBloque(props) || "—"}</small>
      </button>
      <button
        type="button"
        className="cms-ib"
        aria-label={`${oculto ? "Mostrar" : "Ocultar"} ${nombre}`}
        title={oculto ? "Mostrar en la página" : "Ocultar en la página"}
        onClick={() => editor.onOcultar(id)}
      >
        <Icon name={oculto ? "eye-off" : "eye"} size={16} />
      </button>
    </li>
  );
}

function Capas({ editor }: { editor: EditorPanel }) {
  if (editor.bloques.length === 0) return <p className="cms-ayuda">Esta página no tiene bloques todavía.</p>;
  return (
    <ul className="cms-capas">
      {editor.bloques.map((b) => (
        <Fragment key={b.id}>
          <Capa editor={editor} id={b.id} tipo={b.tipo} props={b.props} />
          {b.tipo === "contenedor" &&
            contenedorDe(b.props).items.map((col, c, todas) =>
              col.bloques.length === 0 ? null : (
                <li key={col.id} className="cms-capa__columna">
                  <small>
                    Columna {c + 1} de {todas.length}
                  </small>
                  <ul className="cms-capas cms-capas--hijos">
                    {col.bloques.map((h) => (
                      <Capa key={h.id} editor={editor} id={idHijo(b.id, h.id)} tipo={h.tipo} props={h.props} />
                    ))}
                  </ul>
                </li>
              ),
            )}
        </Fragment>
      ))}
    </ul>
  );
}
