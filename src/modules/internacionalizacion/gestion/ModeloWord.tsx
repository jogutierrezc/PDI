/* =============================================================================
   Gestión de convenios · Modelo de Word (0257). El .docx original queda guardado TAL CUAL
   en el bucket conv-modelos (estilos, imágenes, encabezados, logos, tablas). Aquí se ve su
   vista previa con los campos resaltados y la lista de campos que el sistema encontró.
   Para cambiar un campo se edita el Word y se vuelve a cargar («Reemplazar archivo»).
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ErrorCaja, useAviso } from "../ui/comunes";
import { bajarArchivo, subirArchivo, useActualizarModelo } from "./datos";
import type { Modelo } from "./datos";
import { DOCX_MAX_BYTES, leerDocx, TIPO_DOCX } from "./docx";
import { CAMPOS, CLAVES_CONOCIDAS, descargarBytes, sha256Hex, tamanoLegible } from "./logica";

const ORIGEN: Record<string, string> = { ficha: "Sale de la ficha", sistema: "La pone el sistema", manual: "Se escribe al generar", imagen: "Es una imagen" };

export function ModeloWord({ m, crea }: { m: Modelo; crea: boolean }) {
  const actualizar = useActualizarModelo();
  const aviso = useAviso();
  const archivo = useRef<HTMLInputElement>(null);
  const lectura = useQuery({
    queryKey: ["gest", "word", m.id, m.archivo_hash],
    enabled: Boolean(m.archivo_ruta),
    retry: false,
    queryFn: async () => leerDocx(await bajarArchivo(m.archivo_ruta as string), CLAVES_CONOCIDAS),
  });

  const reemplazar = async (f: File) => {
    if (!/\.docx$/i.test(f.name)) return aviso.mal(new Error("Cargue un archivo de Word en formato .docx."));
    if (f.size > DOCX_MAX_BYTES) return aviso.mal(new Error("El archivo pesa más de 15 MB."));
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const informe = leerDocx(bytes, CLAVES_CONOCIDAS);
      await subirArchivo(m.archivo_ruta ?? `modelos/${m.id}/original.docx`, bytes, TIPO_DOCX);
      actualizar.mutate(
        { id: m.id, cambios: { archivo_ruta: m.archivo_ruta ?? `modelos/${m.id}/original.docx`, archivo_nombre: f.name, archivo_hash: await sha256Hex(bytes), archivo_tamano: bytes.length, marcadores: informe.marcadores } },
        { onSuccess: () => aviso.ok(`Archivo reemplazado. Campos encontrados: ${informe.marcadores.length}.`), onError: aviso.mal },
      );
    } catch (e) {
      aviso.mal(e);
    } finally {
      if (archivo.current) archivo.current.value = "";
    }
  };

  const bajar = async () => {
    try {
      descargarBytes(await bajarArchivo(m.archivo_ruta as string), m.archivo_nombre ?? "modelo.docx", TIPO_DOCX);
    } catch (e) {
      aviso.mal(e);
    }
  };

  const campos = (lectura.data?.marcadores ?? m.marcadores).map((k) => {
    const def = CAMPOS.find((c) => c.k === k);
    return { k, etiqueta: def?.etiqueta ?? k.replace(/_/g, " "), origen: def ? ORIGEN[def.origen] : "Campo propio: se escribe al generar" };
  });

  return (
    <section className="conv-panel gest-word">
      <div className="conv-bar">
        <Icon name="document" size={16} />
        <h2>{m.archivo_nombre ?? "Documento de Word"}</h2>
        <span className="conv-sub">
          {tamanoLegible(m.archivo_tamano)} · huella {m.archivo_hash?.slice(0, 12)}…
        </span>
        <span className="conv-grow" />
        <button type="button" className="conv-btn conv-btn--sm" onClick={() => void bajar()}>
          <Icon name="download" size={14} />
          Descargar original
        </button>
        {crea ? (
          <button type="button" className="conv-btn conv-btn--sm" disabled={actualizar.isPending} onClick={() => archivo.current?.click()}>
            <Icon name="upload" size={14} />
            Reemplazar archivo
          </button>
        ) : null}
        <input ref={archivo} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => e.target.files?.[0] && void reemplazar(e.target.files[0])} />
      </div>
      {aviso.nodo}
      <div className="gest-word-cuerpo">
        <div className="gest-word-vista">
          {lectura.error ? <ErrorCaja error={lectura.error as Error} /> : null}
          {lectura.isPending && m.archivo_ruta ? <p className="it-cargando" role="status">Leyendo el documento…</p> : null}
          {lectura.data ? <div className="gest-hoja gest-hoja--solo" dangerouslySetInnerHTML={{ __html: lectura.data.vistaHtml }} /> : null}
          {lectura.data?.avisos.map((a) => (
            <p key={a} className="conv-nota">
              {a}
            </p>
          ))}
        </div>
        <aside className="gest-campos">
          <h3>
            Campos encontrados <span className="conv-n">{campos.length}</span>
          </h3>
          {campos.length ? (
            <ul className="gest-campos-lista">
              {campos.map((c) => (
                <li key={c.k}>
                  <span className="gest-var-etq">{`{{${c.k}}}`}</span>
                  <span>{c.etiqueta}</span>
                  <small>{c.origen}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="conv-nota">No se encontró ningún campo. Escríbalos en el Word y vuelva a cargarlo.</p>
          )}
          <h3>Cómo escribir los campos en el Word</h3>
          <ul className="gest-reglas-escritura">
            <li>
              Escriba el nombre entre llaves dobles, por ejemplo <code>{"{{institucion}}"}</code>. También se aceptan <code>[institucion]</code> y <code>{"<<institucion>>"}</code>.
            </li>
            <li>El formato (negrita, tamaño, color) del primer carácter del campo es el que queda en el texto generado.</li>
            <li>
              Para los logos ponga <code>{"{{logo_udes}}"}</code> y <code>{"{{logo_institucion}}"}</code> solos en un párrafo o en una celda. Si el Word ya trae el logo incrustado, se respeta tal cual.
            </li>
            <li>Los campos escritos dentro de cuadros de texto no se reemplazan; póngalos en el cuerpo, en una tabla o en el encabezado.</li>
            <li>Los nombres que no están en la lista de la ficha se piden al generar el convenio.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
