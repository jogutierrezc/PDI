/* =============================================================================
   UDrive · la lista de estructura (panel izquierdo).

   Los capítulos del documento con su número de página estimado, un botón para
   agregar capítulos y los cuatro interruptores de los índices automáticos.
   El número de página es una estimación sobre la hoja continua: el exacto se
   calcula al exportar.
   ========================================================================== */

import type { Documento, Indices } from "../../lib/documento";
import { capitulos } from "../../lib/numeracion";

export function Estructura({
  doc,
  seleccion,
  paginas,
  editable,
  onIr,
  onAgregarCapitulo,
  onIndices,
}: {
  doc: Documento;
  seleccion: string | null;
  paginas: ReadonlyMap<string, number>;
  editable: boolean;
  onIr(id: string): void;
  onAgregarCapitulo(): void;
  onIndices(i: Partial<Indices>): void;
}) {
  const caps = capitulos(doc.bloques);
  return (
    <nav className="ud-panel ud-panel--l" aria-label="Estructura del informe">
      <div>
        <h3>Estructura</h3>
        <p className="ud-sub">Los títulos arman el índice solos.</p>
      </div>
      <div className="ud-doc-esquema">
        {caps.length === 0 ? <p className="es-note">Aún no hay capítulos. Agregue el primero.</p> : null}
        {caps.map((c) => (
          <button key={c.id} type="button" className="ud-doc-ol" data-n={c.nivel} aria-current={seleccion === c.id} onClick={() => onIr(c.id)}>
            <span>{c.titulo.trim() || "Capítulo sin título"}</span>
            <small title="Página estimada">{paginas.get(c.id) ?? ""}</small>
          </button>
        ))}
        {editable ? (
          <button type="button" className="ud-doc-ol ud-doc-ol--add" onClick={onAgregarCapitulo}>
            <span>+ Agregar capítulo</span>
          </button>
        ) : null}
      </div>
      <div className="ud-doc-tarjeta">
        <h3>Índices automáticos</h3>
        {(
          [
            ["contenido", "Contenido"],
            ["ilustraciones", "Ilustraciones"],
            ["tablas", "Tablas"],
            ["graficas", "Gráficas"],
          ] as const
        ).map(([k, texto]) => (
          <label key={k} className="es-ck">
            <input type="checkbox" checked={doc.indices[k]} disabled={!editable} onChange={(e) => onIndices({ [k]: e.target.checked })} /> {texto}
          </label>
        ))}
        <p className="es-note">«Ilustración 5», «Tabla 19» y «Gráfica 3» se numeran solas. Si mueve un bloque, los números y las referencias se corrigen. Los números de página se calculan al exportar.</p>
      </div>
    </nav>
  );
}
