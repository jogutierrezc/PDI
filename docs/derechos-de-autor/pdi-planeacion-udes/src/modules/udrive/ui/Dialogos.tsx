/* =============================================================================
   UDrive · ventanas del explorador: nueva carpeta, confirmar, mover, compartir
   y vista previa. Todas con la ventana compartida (foco atrapado, Escape cierra).
   ========================================================================== */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Ventana } from "../../../components/espacio/Ventana";
import { Icon } from "../../../components/ui/Icon";
import { enlaceDeArchivo, useCompartir, useCrearCarpeta, usePermisos, useQuitarPermiso } from "../datos";
import { subarbol } from "../lib/arbol";
import { limpiarNombre, nombreEnUso } from "../lib/nombres";
import { ETIQUETA_ROL, puedeMoverEn } from "../lib/permisos";
import type { ArchivoRow, CarpetaRow, DuenoRow } from "../tipos";
import { vistaPrevia } from "../lib/imagen";

export function NuevaCarpeta({ padre, hermanas, onCerrar, decir, onCreada }: { padre: string | null; hermanas: string[]; onCerrar: () => void; decir: (m: string) => void; onCreada: (id: string) => void }) {
  const crear = useCrearCarpeta();
  const [nombre, setNombre] = useState("");
  const limpio = limpiarNombre(nombre, 120);
  const repetido = Boolean(limpio) && nombreEnUso(limpio, hermanas);
  return (
    <Ventana
      titulo="Nueva carpeta"
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <span />
          <button type="submit" form="ud-f-carpeta" className="es-btn es-btn--pri" disabled={!limpio || repetido || crear.isPending}>
            Crear carpeta
          </button>
        </>
      }
    >
      <form
        id="ud-f-carpeta"
        className="es-dbody es-dbody--solo"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate(
            { nombre: limpio, padre },
            {
              onSuccess: (id) => {
                decir("Carpeta creada.");
                onCreada(id);
                onCerrar();
              },
              onError: (er) => decir(er.message),
            },
          );
        }}
      >
        <label className="es-fl">
          Nombre de la carpeta
          <input type="text" className="es-inp" data-foco value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} aria-invalid={repetido} />
        </label>
        {repetido ? <p className="ud-aviso" data-t="error" role="alert">Ya hay una carpeta con ese nombre aquí.</p> : null}
      </form>
    </Ventana>
  );
}

export function Confirmar({ titulo, children, boton, onConfirmar, onCerrar, ocupado }: { titulo: string; children: ReactNode; boton: string; onConfirmar: () => void; onCerrar: () => void; ocupado?: boolean }) {
  return (
    <Ventana
      titulo={titulo}
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar} data-foco>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={ocupado} onClick={onConfirmar}>
            {boton}
          </button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">{children}</div>
    </Ventana>
  );
}

/** Elegir la carpeta de destino sin arrastrar: la alternativa de teclado al arrastrar y soltar. */
export function MoverA({
  nombre,
  tipo,
  id,
  actual,
  carpetas,
  roles,
  yo,
  enUnidad,
  onMover,
  onCerrar,
}: {
  nombre: string;
  tipo: "carpeta" | "archivo";
  id: string;
  actual: string | null;
  carpetas: CarpetaRow[];
  roles: Map<string, DuenoRow>;
  yo: string;
  /** Dentro de una unidad de trabajo: solo se puede mover donde se tiene el papel Crear. */
  enUnidad?: boolean;
  onMover: (destino: string | null) => void;
  onCerrar: () => void;
}) {
  const fuera = tipo === "carpeta" ? subarbol(carpetas, id) : new Set<string>();
  const opciones = carpetas.filter((c) => !c.borrado_en && !fuera.has(c.id) && puedeMoverEn(roles.get(c.id)?.mi_rol, Boolean(enUnidad)));
  const nombres = new Map(carpetas.map((c) => [c.id, c.nombre] as const));
  const ruta = (c: CarpetaRow): string => {
    const partes: string[] = [];
    for (let x: CarpetaRow | undefined = c, n = 0; x && n < 20; x = x.padre_id ? carpetas.find((k) => k.id === x!.padre_id) : undefined, n++) partes.unshift(nombres.get(x.id) ?? "");
    return partes.join(" / ");
  };
  const lista = opciones.map((c) => ({ id: c.id, texto: ruta(c) })).sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  const [destino, setDestino] = useState<string | null | undefined>(undefined);
  return (
    <Ventana
      titulo={`Mover «${nombre}»`}
      ancho="chica"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="es-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={destino === undefined || destino === actual} onClick={() => destino !== undefined && onMover(destino)}>
            Mover aquí
          </button>
        </>
      }
    >
      <div className="es-dbody es-dbody--solo">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="es-note" style={{ marginBottom: 6 }}>Elija la carpeta de destino</legend>
          <ul className="ud-arbol">
            {yo ? (
              <li>
                <label>
                  <input type="radio" name="ud-destino" checked={destino === null} disabled={actual === null} onChange={() => setDestino(null)} data-foco />
                  <Icon name="folder" size={16} /> Mi espacio (inicio)
                </label>
              </li>
            ) : null}
            {lista.map((o) => (
              <li key={o.id}>
                <label>
                  <input type="radio" name="ud-destino" checked={destino === o.id} disabled={o.id === actual} onChange={() => setDestino(o.id)} />
                  <Icon name="folder" size={16} /> {o.texto}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Ventana>
  );
}

export function Compartir({ tipo, id, nombre, onCerrar, decir }: { tipo: "carpeta" | "archivo"; id: string; nombre: string; onCerrar: () => void; decir: (m: string) => void }) {
  const lista = usePermisos(tipo, id, true);
  const compartir = useCompartir();
  const quitar = useQuitarPermiso();
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<"editor" | "lector">("lector");
  return (
    <Ventana titulo={`Compartir «${nombre}»`} ancho="chica" onCerrar={onCerrar} pie={<><span /><button type="button" className="es-btn es-btn--pri" onClick={onCerrar}>Listo</button></>}>
      <div className="es-dbody es-dbody--solo">
        <form
          className="es-stage"
          onSubmit={(e) => {
            e.preventDefault();
            compartir.mutate(
              { tipo, id, correo: correo.trim(), rol },
              {
                onSuccess: () => {
                  decir("Compartido.");
                  setCorreo("");
                },
                onError: (er) => decir(er.message),
              },
            );
          }}
        >
          <p className="es-note">{tipo === "carpeta" ? "Quien reciba la carpeta ve también todo lo que contiene." : "Solo se comparte este archivo."}</p>
          <label className="es-fl">
            Correo de la persona (debe tener cuenta en la intranet)
            <input type="email" className="es-inp" data-foco value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" required />
          </label>
          <label className="es-fl">
            Qué puede hacer
            <select className="es-inp" value={rol} onChange={(e) => setRol(e.target.value as "editor" | "lector")}>
              <option value="lector">{ETIQUETA_ROL.lector}</option>
              <option value="editor">{ETIQUETA_ROL.editor}</option>
            </select>
          </label>
          <button type="submit" className="es-btn es-btn--pri" style={{ justifySelf: "start" }} disabled={!correo.trim() || compartir.isPending}>
            Compartir
          </button>
        </form>
        <div className="es-stage">
          <h3 className="ud-seccion">Con quién se comparte</h3>
          {lista.isPending ? <p className="es-note">Cargando…</p> : lista.error ? <p className="ud-aviso" data-t="error">{lista.error.message}</p> : !lista.data?.length ? <p className="es-note">Todavía no se comparte con nadie.</p> : (
            <ul className="ud-lista-personas">
              {lista.data.map((p) => (
                <li key={p.usuario_id}>
                  <span>
                    <b>{p.nombre || p.correo}</b>
                    <br />
                    <small>{p.correo} · {ETIQUETA_ROL[p.rol]}</small>
                  </span>
                  <button type="button" className="es-btn es-btn--sm" onClick={() => quitar.mutate({ tipo, id, usuario: p.usuario_id }, { onError: (er) => decir(er.message) })} aria-label={`Dejar de compartir con ${p.nombre || p.correo}`}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Ventana>
  );
}

/** Vista previa de una imagen o un PDF con un enlace temporal. */
export function Previa({ archivo, onCerrar }: { archivo: ArchivoRow; onCerrar: () => void }) {
  const clase = vistaPrevia(archivo.mime);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    if (!archivo.ruta_storage) return;
    enlaceDeArchivo(archivo.ruta_storage)
      .then((u) => vivo && setUrl(u))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [archivo.ruta_storage]);
  return (
    <Ventana titulo={archivo.nombre} onCerrar={onCerrar}>
      <div className="es-dbody es-dbody--solo" style={{ padding: 0 }}>
        {error ? <p className="ud-aviso" data-t="error" style={{ margin: 18 }}>{error}</p> : !url ? <p className="es-note" style={{ margin: 18 }}>Abriendo…</p> : clase === "imagen" ? <img className="ud-previa-grande" src={url} alt={archivo.nombre} /> : clase === "pdf" ? <iframe className="ud-previa-grande" src={url} title={`Vista previa de ${archivo.nombre}`} referrerPolicy="no-referrer" /> : <p className="es-note" style={{ margin: 18 }}>Este tipo de archivo no tiene vista previa. Descárguelo para abrirlo.</p>}
      </div>
    </Ventana>
  );
}
