/* =============================================================================
   THE Impact · evidencias de una respuesta en UDrive (carpeta del indicador en
   «Datos de Sostenibilidad»). Subir sigue el flujo seguro de la migración 0239
   (reservar ruta → subir a Storage → registrar). Funciona dentro de la sección
   de THE Impact y dentro del formulario de la oficina, así que no depende del
   contexto de la sección: recibe lo que necesita por props.

   Reglas de THE a la vista (Apéndice 2 de la metodología 2027): enlace público
   preferido; un archivo adjunto cuenta como no público; una sola evidencia por
   indicador; formatos PDF, Word, Excel, GIF, JPG y PNG; nota con las partes que
   sirven. El tope de 15 MB es decisión propia (el documento no fija uno).
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { enlaceDeArchivo } from "../../../udrive/datos";
import { Alerta, Campo, Cargando, Dialogo, ErrorConsulta, bytesLegibles, mensajeDe } from "../../uigreen/ui/comunes";
import { useArchivosDrive } from "../../uigreen/ui/lectura";
import { useAgregarEnlaceThi, useCarpetasThi, useConteoEvidencias, useEditarEvidenciaThi, useEvidenciasThi, useQuitarEvidenciaThi, useSubirEvidenciaThi } from "../datos";
import type { EvidenciaThi, RequisitoThi } from "../datos";
import { FORMATOS_ARCHIVO, REGLAS_EVIDENCIA, TEXTO_EVIDENCIA, TOPE_NOTA, nombreSeguro, validarArchivo, validarEnlace } from "../lib/metodologia";

export const enlaceCarpeta = (id: string | null | undefined) => `/admin/datos-sostenibilidad${id ? `?c=${id}` : ""}`;

interface Props {
  respuesta: string;
  ciclo: { id: string; anio: number };
  indicador: string;
  requisito?: RequisitoThi;
  /** ¿Puede esta persona agregar y quitar? (la base lo vuelve a comprobar). */
  editable: boolean;
  /** Planeación o más: puede marcar una evidencia como pública. */
  esAdmin?: boolean;
  /** Si el contenedor tiene su propio aviso, lo usa; si no, el bloque muestra el suyo. */
  avisar?: (texto: string, tipo?: "ok" | "error") => void;
}

export function EvidenciasThi({ respuesta, ciclo, indicador, requisito, editable, esAdmin = false, avisar }: Props) {
  const lista = useEvidenciasThi(respuesta);
  const conteo = useConteoEvidencias(ciclo.id);
  const carpetas = useCarpetasThi(ciclo.id);
  const archivos = useArchivosDrive((lista.data ?? []).map((e) => e.archivo_id ?? "").filter(Boolean));
  const quitar = useQuitarEvidenciaThi();
  const editar = useEditarEvidenciaThi();
  const [cola, setCola] = useState<File[]>([]);
  const [enlace, setEnlace] = useState(false);
  const [editando, setEditando] = useState<EvidenciaThi | null>(null);
  const [encima, setEncima] = useState(false);
  const [local, setLocal] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const decir = (texto: string, tipo: "ok" | "error" = "ok") => (avisar ? avisar(texto, tipo) : setLocal({ texto, tipo }));
  const base = indicador.split("/")[0];
  const carpeta = carpetas.data?.get(base) ?? carpetas.data?.get("raiz") ?? null;
  const exigencia = requisito ? TEXTO_EVIDENCIA[requisito.evidencia] : null;
  const previas = conteo.data?.get(respuesta)?.en_bucket ?? 0;
  const n = (lista.data ?? []).length;

  const recibir = (fs: FileList | File[] | null) => {
    const l = fs ? [...fs] : [];
    if (l.length) setCola((c) => [...c, ...l]);
  };
  const accion = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      decir(ok);
    } catch (e) {
      decir(mensajeDe(e), "error");
    }
  };

  return (
    <div className="ugm thi-evid">
      {exigencia && requisito && (
        <p className={`thi-exige thi-exige--${requisito.evidencia}`}>
          <b>{exigencia.etiqueta}.</b> {exigencia.detalle}
        </p>
      )}
      <div className="ugm-carpeta">
        <Icon name="folder" size={18} />
        <span>
          <small>Carpeta de destino</small>
          Datos de Sostenibilidad › THE Impact › Edición {ciclo.anio} › ODS {base.split(".")[0]} › {base}
          {requisito ? ` · ${requisito.titulo}` : ""}
        </span>
        {carpeta ? (
          <a className="ugm-btn ugm-btn--sm" href={enlaceCarpeta(carpeta)} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> Abrir carpeta
          </a>
        ) : (
          <span className="ugm-muted ugm-peq">Se crea sola al subir la primera evidencia.</span>
        )}
      </div>

      {editable && (
        <>
          <div
            className={`ugm-soltar${encima ? " ugm-soltar--on" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Soltar archivos de evidencia aquí o pulsar para elegirlos"
            onClick={() => entrada.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), entrada.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(true);
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(false);
              recibir(e.dataTransfer.files);
            }}
          >
            <Icon name="upload" size={22} />
            <b>Arrastre los archivos aquí</b>
            <span>o pulse para elegirlos. {FORMATOS_ARCHIVO.map((x) => x.toUpperCase()).join(", ")}; hasta 15 MB.</span>
            <input
              ref={entrada}
              type="file"
              multiple
              hidden
              accept={FORMATOS_ARCHIVO.map((x) => `.${x}`).join(",")}
              onChange={(e) => {
                recibir(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="ugm-acciones">
            <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setEnlace(true)}>
              <Icon name="link" size={16} /> Agregar un enlace público (lo que THE prefiere)
            </button>
          </div>
        </>
      )}

      {local && <Alerta tipo={local.tipo === "error" ? "error" : "ok"}>{local.texto}</Alerta>}
      {n > 1 && <Alerta tipo="aviso">THE evalúa una sola evidencia por indicador. Deje la mejor y quite las demás, o dígalo en la nota si cada una cubre una parte distinta.</Alerta>}
      {previas > 0 && <p className="ugm-peq ugm-muted">Esta respuesta también tiene {previas} {previas === 1 ? "evidencia" : "evidencias"} del formulario anterior (bucket del reporte); cuentan igual.</p>}

      {lista.isLoading ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorConsulta error={lista.error} />
      ) : n === 0 ? (
        <p className="ugm-muted">
          {requisito?.evidencia === "obligatoria" ? "Este indicador pide evidencia (si la universidad lo hace) y todavía no tiene ninguna." : "Todavía no hay evidencias en UDrive."}
        </p>
      ) : (
        <ul className="ugm-evidencias">
          {lista.data!.map((e) => {
            const a = e.archivo_id ? archivos.data?.get(e.archivo_id) : undefined;
            return (
              <li key={e.id} className="ugm-evidencia">
                <Icon name={e.url ? "link" : "document"} size={20} />
                <div className="ugm-evidencia__dato">
                  <b className="ugm-romper">{e.url ?? a?.nombre ?? "Archivo"}</b>
                  <small>
                    {e.url ? "Enlace" : `Archivo adjunto${a?.tamano ? ` · ${bytesLegibles(a.tamano)}` : ""}`}
                    {" · "}
                    {e.publica ? "Cuenta como pública" : "THE lo califica como no público"}
                  </small>
                  {e.nota && <small>{e.nota}</small>}
                </div>
                <div className="ugm-evidencia__acc">
                  <div className="ugm-acciones">
                    {e.url && (
                      <a className="ugm-btn ugm-btn--sm" href={e.url} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    )}
                    {a?.ruta_storage && (
                      <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => void enlaceDeArchivo(a.ruta_storage as string).then((url) => window.open(url, "_blank", "noopener")).catch((x) => decir(mensajeDe(x), "error"))}>
                        Abrir
                      </button>
                    )}
                    {editable && (
                      <>
                        <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setEditando(e)}>
                          Nota
                        </button>
                        <button type="button" className="ugm-btn ugm-btn--sm ugm-btn--peligro" onClick={() => window.confirm("¿Quitar esta evidencia del indicador?") && void accion(() => quitar.mutateAsync(e.id), "Evidencia quitada.")}>
                          Quitar
                        </button>
                      </>
                    )}
                    {esAdmin && !e.url && (
                      <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => void accion(() => editar.mutateAsync({ evidencia: e.id, nota: e.nota ?? "", publica: !e.publica }), e.publica ? "Marcada como no pública." : "Marcada como pública.")}>
                        {e.publica ? "Quitar «pública»" : "Marcar pública"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="thi-reglas">
        <summary>Qué exige THE de una evidencia</summary>
        <ul>
          {REGLAS_EVIDENCIA.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>

      {cola.length > 0 && (
        <SubirArchivo
          key={`${cola[0].name}-${cola.length}`}
          archivo={cola[0]}
          pendientes={cola.length - 1}
          respuesta={respuesta}
          decir={decir}
          onTermina={() => setCola((c) => c.slice(1))}
          onCancelar={() => setCola([])}
        />
      )}
      {enlace && <AgregarEnlace respuesta={respuesta} decir={decir} onCerrar={() => setEnlace(false)} />}
      {editando && <EditarNota e={editando} decir={decir} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

type Decir = (texto: string, tipo?: "ok" | "error") => void;

function SubirArchivo({ archivo, pendientes, respuesta, decir, onTermina, onCancelar }: { archivo: File; pendientes: number; respuesta: string; decir: Decir; onTermina: () => void; onCancelar: () => void }) {
  const subir = useSubirEvidenciaThi();
  const [nombre, setNombre] = useState(nombreSeguro(archivo.name));
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const v = validarArchivo(nombre, archivo.size);

  const enviar = async () => {
    setError("");
    try {
      const res = await subir.mutateAsync({ respuesta, archivo, nombre, nota });
      decir(res.avisos?.length ? `Evidencia subida. ${res.avisos.join(" ")}` : "Evidencia subida.");
      onTermina();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  return (
    <Dialogo titulo="Subir evidencia" descripcion={pendientes ? `Quedan ${pendientes} archivos más por subir.` : undefined} onCerrar={onCancelar} ancho={600}>
      <form
        className="ugm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.ok) void enviar();
        }}
      >
        <p className="ugm-archivo">
          <Icon name="document" size={18} /> {archivo.name} <span className="ugm-muted ugm-num">· {bytesLegibles(archivo.size)}</span>
        </p>
        <Campo id="thi-ev-nombre" etiqueta="Nombre del archivo en UDrive" ayuda="Solo letras, números, punto, guion y guion bajo.">
          <input id="thi-ev-nombre" className="ugm-input" value={nombre} onChange={(e) => setNombre(nombreSeguro(e.target.value))} autoFocus />
        </Campo>
        <Campo id="thi-ev-nota" etiqueta="Nota para quien revisa (opcional)" ayuda={`Si solo una parte sirve, diga cuál (páginas o sección). Máximo ${TOPE_NOTA} caracteres.`}>
          <textarea id="thi-ev-nota" className="ugm-input ugm-area" rows={3} maxLength={TOPE_NOTA} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
        {!v.ok && v.error && <Alerta tipo="error">{v.error}</Alerta>}
        {v.avisos.map((x) => (
          <Alerta key={x} tipo="aviso">
            {x}
          </Alerta>
        ))}
        {error && <Alerta tipo="error">{error}</Alerta>}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={!v.ok || subir.isPending}>
            {subir.isPending ? "Subiendo…" : "Subir"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

function AgregarEnlace({ respuesta, decir, onCerrar }: { respuesta: string; decir: Decir; onCerrar: () => void }) {
  const agregar = useAgregarEnlaceThi();
  const [url, setUrl] = useState("https://");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const problema = url.length > 8 ? validarEnlace(url) : "Escriba la dirección completa.";
  return (
    <Dialogo titulo="Agregar un enlace público" descripcion="THE prefiere una página pública: la califica como evidencia pública." onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const r = await agregar.mutateAsync({ respuesta, url: url.trim(), nota });
            decir(`Enlace agregado. ${(r.avisos ?? []).join(" ")}`.trim());
            onCerrar();
          } catch (x) {
            setError(mensajeDe(x));
          }
        }}
      >
        <Campo id="thi-en-url" etiqueta="Enlace">
          <input id="thi-en-url" className="ugm-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </Campo>
        {problema && url.length > 8 && <p className="ugm-error" role="alert">{problema}</p>}
        <Campo id="thi-en-nota" etiqueta="Nota para quien revisa (opcional)" ayuda="Qué parte de la página demuestra el indicador.">
          <textarea id="thi-en-nota" className="ugm-input ugm-area" rows={2} maxLength={TOPE_NOTA} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
        <Alerta>La página debe mostrar la información sin obligar a seguir otros enlaces y seguir pública hasta el inicio del siguiente ciclo de THE.</Alerta>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={Boolean(problema) || agregar.isPending}>
            Agregar
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

function EditarNota({ e, decir, onCerrar }: { e: EvidenciaThi; decir: Decir; onCerrar: () => void }) {
  const editar = useEditarEvidenciaThi();
  const [nota, setNota] = useState(e.nota ?? "");
  const [error, setError] = useState("");
  return (
    <Dialogo titulo="Nota de la evidencia" onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setError("");
          try {
            await editar.mutateAsync({ evidencia: e.id, nota });
            decir("Nota guardada.");
            onCerrar();
          } catch (x) {
            setError(mensajeDe(x));
          }
        }}
      >
        <Campo id="thi-ed-nota" etiqueta="Nota para quien revisa" ayuda="Páginas o sección del documento que demuestran el indicador.">
          <textarea id="thi-ed-nota" className="ugm-input ugm-area" rows={3} maxLength={TOPE_NOTA} value={nota} onChange={(x) => setNota(x.target.value)} autoFocus />
        </Campo>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={editar.isPending}>
            Guardar
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}
