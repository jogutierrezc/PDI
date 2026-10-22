/* =============================================================================
   UDrive · el panel de detalles de lo seleccionado (o de la carpeta abierta).

   Qué es, de quién, cuándo cambió, mi papel y lo que puedo hacer: abrir, ver,
   descargar, renombrar, mover, compartir, mandar a la papelera, restaurar o
   borrar para siempre. Cada acción solo aparece si la persona puede hacerla; la
   base lo vuelve a comprobar.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { enlaceDeArchivo } from "../datos";
import { vistaPrevia } from "../lib/imagen";
import { limpiarNombre, nombreEnUso, textoTamano } from "../lib/nombres";
import { ETIQUETA_ROL, puedeCompartir, puedeEditar } from "../lib/permisos";
import type { ArchivoRow, CarpetaRow, DuenoRow } from "../tipos";
import { Estado, IconoItem, NOMBRE_TIPO, fechaLarga } from "./piezas";

export type Seleccion = { tipo: "carpeta"; fila: CarpetaRow } | { tipo: "archivo"; fila: ArchivoRow };

export interface AccionesDetalle {
  abrir: () => void;
  previa: () => void;
  descargar: () => void;
  renombrar: (nombre: string) => void;
  mover: () => void;
  compartir: () => void;
  aPapelera: () => void;
  restaurar: () => void;
  eliminar: () => void;
}

export function Detalles({
  sel,
  dueno,
  hermanas,
  dias,
  carpetaAbierta,
  acciones,
}: {
  sel: Seleccion | null;
  dueno: DuenoRow | undefined;
  /** Nombres de los demás elementos de la misma carpeta, para avisar de un nombre repetido. */
  hermanas: string[];
  /** Días que le quedan en la papelera (solo si está en ella). */
  dias: number | null;
  carpetaAbierta: { nombre: string; carpetas: number; archivos: number; bytes: number };
  acciones: AccionesDetalle;
}) {
  if (!sel) {
    return (
      <>
        <div className="es-dhead">
          <span className="es-kbig"><IconoItem tipo="carpeta" className="es-kico" /></span>
          <div>
            <h2>{carpetaAbierta.nombre}</h2>
            <p className="es-note">Elija un elemento para ver sus detalles.</p>
          </div>
        </div>
        <dl className="es-kv">
          <dt>Carpetas</dt><dd className="es-num">{carpetaAbierta.carpetas}</dd>
          <dt>Archivos</dt><dd className="es-num">{carpetaAbierta.archivos}</dd>
          {carpetaAbierta.bytes ? (<><dt>Archivos subidos</dt><dd className="es-num">{textoTamano(carpetaAbierta.bytes)}</dd></>) : null}
        </dl>
        <p className="es-note">Las imágenes se comprimen al subirlas (hasta 2000 píxeles de lado). Cada archivo puede pesar hasta 100 MB.</p>
      </>
    );
  }
  return <DetalleDe key={`${sel.tipo}:${sel.fila.id}`} sel={sel} dueno={dueno} hermanas={hermanas} dias={dias} acciones={acciones} />;
}

function DetalleDe({ sel, dueno, hermanas, dias, acciones }: { sel: Seleccion; dueno: DuenoRow | undefined; hermanas: string[]; dias: number | null; acciones: AccionesDetalle }) {
  const f = sel.fila;
  const rol = dueno?.mi_rol ?? null;
  const editar = puedeEditar(rol);
  const propietario = puedeCompartir(rol);
  const enPapelera = Boolean(f.borrado_en);
  const archivo = sel.tipo === "archivo" ? sel.fila : null;
  const tipo = sel.tipo === "carpeta" ? "carpeta" : sel.fila.tipo;
  const [nombre, setNombre] = useState(f.nombre);
  useEffect(() => setNombre(f.nombre), [f.nombre]);
  const limpio = limpiarNombre(nombre);
  const repetido = Boolean(limpio) && limpio.toLowerCase() !== f.nombre.toLowerCase() && nombreEnUso(limpio, hermanas);
  const confirmar = () => {
    if (!limpio || limpio === f.nombre) return setNombre(f.nombre);
    if (repetido) return;
    acciones.renombrar(limpio);
  };
  const clase = archivo ? vistaPrevia(archivo.mime) : null;
  const [miniatura, setMiniatura] = useState<string | null>(null);
  useEffect(() => {
    setMiniatura(null);
    if (clase !== "imagen" || !archivo?.ruta_storage || (archivo.tamano ?? 0) > 8 * 1024 * 1024) return;
    let vivo = true;
    enlaceDeArchivo(archivo.ruta_storage)
      .then((u) => vivo && setMiniatura(u))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clase, archivo?.ruta_storage, archivo?.tamano]);

  return (
    <>
      <div className="es-dhead">
        <span className="es-kbig"><IconoItem tipo={tipo} className="es-kico" /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ overflowWrap: "anywhere" }}>{f.nombre}</h2>
          <p className="es-note">{NOMBRE_TIPO[tipo]}{archivo && archivo.tipo !== "archivo" ? <> · <Estado estado={archivo.estado} /></> : null}</p>
        </div>
      </div>

      {enPapelera ? <p className="ud-aviso" data-t="aviso">En la papelera. {dias === null ? "" : dias === 0 ? "Se borra para siempre hoy." : `Se borra para siempre en ${dias} ${dias === 1 ? "día" : "días"}.`}</p> : null}
      {miniatura ? <img className="ud-previa" src={miniatura} alt={`Vista previa de ${f.nombre}`} /> : null}

      <div className="es-act">
        {enPapelera ? (
          <>
            {editar ? <button type="button" className="es-btn es-btn--pri" onClick={acciones.restaurar}><Icon name="undo" size={16} />Restaurar</button> : null}
            {propietario ? <button type="button" className="es-btn" onClick={acciones.eliminar}><Icon name="trash" size={16} />Borrar para siempre</button> : null}
          </>
        ) : (
          <>
            <button type="button" className="es-btn es-btn--pri" onClick={clase ? acciones.previa : acciones.abrir}>{archivo?.tipo === "archivo" ? (clase ? "Ver" : "Descargar") : "Abrir"}</button>
            {archivo?.tipo === "archivo" && clase ? <button type="button" className="es-btn" onClick={acciones.descargar}><Icon name="download" size={16} />Descargar</button> : null}
            {editar ? <button type="button" className="es-btn" onClick={acciones.mover}><Icon name="folder" size={16} />Mover a…</button> : null}
            {propietario ? <button type="button" className="es-btn" onClick={acciones.compartir}><Icon name="share" size={16} />Compartir</button> : null}
            {editar ? <button type="button" className="es-btn" onClick={acciones.aPapelera}><Icon name="trash" size={16} />A la papelera</button> : null}
          </>
        )}
      </div>

      {editar && !enPapelera ? (
        <label className="es-fl">
          Nombre
          <input type="text" className="es-inp" value={nombre} maxLength={160} aria-invalid={repetido} onChange={(e) => setNombre(e.target.value)} onBlur={confirmar} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          {repetido ? <span className="ud-aviso" data-t="error" role="alert">Ya hay algo con ese nombre en esta carpeta.</span> : null}
        </label>
      ) : null}

      <dl className="es-kv">
        <dt>Propietario</dt><dd>{dueno ? dueno.nombre || dueno.correo : "…"}</dd>
        <dt>Su papel</dt><dd>{rol ? ETIQUETA_ROL[rol] : "…"}</dd>
        <dt>Creado</dt><dd>{fechaLarga(f.created_at)}</dd>
        <dt>Cambió</dt><dd>{fechaLarga(f.updated_at)}</dd>
        {archivo?.tipo === "archivo" ? (<><dt>Tamaño</dt><dd className="es-num">{textoTamano(archivo.tamano)}</dd><dt>Formato</dt><dd style={{ overflowWrap: "anywhere" }}>{archivo.mime || "Desconocido"}</dd></>) : null}
        {archivo?.tipo === "tabla" ? (<><dt>Tamaño</dt><dd className="es-num">{archivo.resumen.filas ?? 0} filas × {archivo.resumen.columnas ?? 0} columnas</dd></>) : null}
      </dl>
    </>
  );
}
