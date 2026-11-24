/* =============================================================================
   UI GreenMetric · evidencias: arrastrar y soltar con el flujo seguro (reservar
   ruta, subir a Storage, registrar), carpeta de destino visible, nombres
   normalizados, avisos y límites, reemplazar, quitar y «En la web» (solo
   administración). La optimización de los PDF se hace al exportar.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { enlaceDeArchivo } from "../../../udrive/datos";
import { useAgregarEnlace, useEditarEvidencia, useEvidencias, usePublicarEvidencia, useQuitarEvidencia, useSubirEvidencia } from "../datos";
import { descripcionDeNombre, extensionDe, normalizarNombreEvidencia, rutaCarpetaEvidencia, rutaComoTexto, validarArchivoEvidencia, validarEnlacePublico } from "../lib/evidencia";
import type { EvidenciaUgm, PreguntaCiclo, RespuestaUgm } from "../lib/tipos";
import { Alerta, Campo, Cargando, Dialogo, ErrorConsulta, Interruptor, bytesLegibles, mensajeDe } from "./comunes";
import { useUgm } from "./contexto";
import { useArchivosDrive } from "./lectura";

export const enlaceCarpeta = (id: string | null | undefined) => `/admin/datos-sostenibilidad${id ? `?c=${id}` : ""}`;

export function Evidencias({ r, p, editable }: { r: RespuestaUgm; p: PreguntaCiclo; editable: boolean }) {
  const u = useUgm();
  const lista = useEvidencias(r.id);
  const archivos = useArchivosDrive((lista.data ?? []).map((e) => e.archivo_id ?? "").filter(Boolean));
  const quitar = useQuitarEvidencia();
  const publicar = usePublicarEvidencia();
  const [cola, setCola] = useState<File[]>([]);
  const [reemplaza, setReemplaza] = useState<EvidenciaUgm | null>(null);
  const [editando, setEditando] = useState<EvidenciaUgm | null>(null);
  const [enlace, setEnlace] = useState(false);
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const reemplazo = useRef<HTMLInputElement>(null);

  const categoria = u.categorias.find((c) => c.categoria === p.categoria);
  const ruta = categoria ? rutaComoTexto(rutaCarpetaEvidencia(u.ciclo.anio, categoria, p)) : "";
  const carpeta = p.carpeta_id ?? categoria?.carpeta_id ?? null;

  const recibir = (fs: FileList | File[] | null) => {
    const l = fs ? [...fs] : [];
    setReemplaza(null); // un archivo suelto nunca reemplaza otro por accidente
    if (l.length) setCola((c) => [...c, ...l]);
  };

  return (
    <div className="ugm-form">
      <div className="ugm-carpeta">
        <Icon name="folder" size={18} />
        <span>
          <small>Carpeta de destino</small>
          {ruta || "Las carpetas del ciclo todavía no se crearon."}
        </span>
        {carpeta ? (
          <a className="ugm-btn ugm-btn--sm" href={enlaceCarpeta(carpeta)} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> Abrir carpeta en Datos de Sostenibilidad
          </a>
        ) : (
          <span className="ugm-muted ugm-peq">{u.esAdmin ? "Use «Preparar carpetas» arriba." : "Planeación debe prepararlas."}</span>
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
            <span>o pulse para elegirlos. PDF de hasta 2 MB (la guía lo pide); se admiten imágenes, Word, Excel y CSV hasta 25 MB.</span>
            <input ref={entrada} type="file" multiple hidden onChange={(e) => { recibir(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="ugm-acciones">
            <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setEnlace(true)}>
              <Icon name="link" size={16} /> Agregar un enlace público
            </button>
          </div>
        </>
      )}

      {lista.isLoading ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorConsulta error={lista.error} />
      ) : (lista.data ?? []).length === 0 ? (
        <p className="ugm-muted">{p.requiere_evidencia ? "Este indicador exige evidencia y todavía no tiene ninguna." : "Todavía no hay evidencias."}</p>
      ) : (
        <ul className="ugm-evidencias">
          {lista.data!.map((e) => {
            const a = e.archivo_id ? archivos.data?.get(e.archivo_id) : undefined;
            return (
              <li key={e.id} className="ugm-evidencia">
                <Icon name={e.url ? "link" : "document"} size={20} />
                <div className="ugm-evidencia__dato">
                  <b>{e.url ?? a?.nombre ?? "Archivo"}</b>
                  <small>
                    {e.figura ? `Figura ${e.figura} · ` : ""}
                    {e.idioma === "en" ? "Inglés" : "Español"}
                    {a?.tamano ? ` · ${bytesLegibles(a.tamano)}` : ""}
                    {e.es_mapa ? " · mapa" : ""}
                  </small>
                  {(e.pie_en || e.pie_es) && <small>{e.pie_en || e.pie_es}</small>}
                  {a && a.tamano && a.tamano > 2 * 1024 * 1024 && /pdf/i.test(a.mime ?? a.nombre) && <small className="ugm-falta">Pesa más de 2 MB: se comprime al exportar.</small>}
                </div>
                <div className="ugm-evidencia__acc">
                  {u.esAdmin ? (
                    <Interruptor activo={e.publica} etiqueta="En la web" onChange={(v) => void u.hacer(() => publicar.mutateAsync({ evidencia: e.id, publica: v }), v ? "La evidencia saldrá en la web cuando el indicador se publique." : "La evidencia ya no sale en la web.")} />
                  ) : (
                    e.publica && <span className="ugm-etq ugm-etq--ok">En la web</span>
                  )}
                  <div className="ugm-acciones">
                    {a?.ruta_storage && (
                      <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => void enlaceDeArchivo(a.ruta_storage as string).then((url) => window.open(url, "_blank", "noopener")).catch((x) => u.avisar(mensajeDe(x), "error"))}>
                        Abrir
                      </button>
                    )}
                    {editable && (
                      <>
                        <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => setEditando(e)}>
                          Editar
                        </button>
                        {e.archivo_id && (
                          <button type="button" className="ugm-btn ugm-btn--sm" onClick={() => { setReemplaza(e); reemplazo.current?.click(); }}>
                            Reemplazar
                          </button>
                        )}
                        <button type="button" className="ugm-btn ugm-btn--sm ugm-btn--peligro" onClick={() => window.confirm("¿Quitar esta evidencia del indicador?") && void u.hacer(() => quitar.mutateAsync(e.id), "Evidencia quitada.")}>
                          Quitar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <input ref={reemplazo} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCola((c) => [f, ...c]); else setReemplaza(null); e.target.value = ""; }} />

      {cola.length > 0 && (
        <SubirArchivo
          key={`${cola[0].name}-${cola.length}`}
          archivo={cola[0]}
          pendientes={cola.length - 1}
          p={p}
          r={r}
          siguienteFigura={(lista.data ?? []).reduce((m, e) => Math.max(m, e.figura ?? 0), 0) + 1}
          reemplaza={reemplaza}
          onTermina={() => { setCola((c) => c.slice(1)); setReemplaza(null); }}
          onCancelar={() => { setCola([]); setReemplaza(null); }}
        />
      )}
      {enlace && <AgregarEnlace r={r} onCerrar={() => setEnlace(false)} />}
      {editando && <EditarEvidencia e={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function SubirArchivo({ archivo, pendientes, p, r, siguienteFigura, reemplaza, onTermina, onCancelar }: { archivo: File; pendientes: number; p: PreguntaCiclo; r: RespuestaUgm; siguienteFigura: number; reemplaza: EvidenciaUgm | null; onTermina: () => void; onCancelar: () => void }) {
  const u = useUgm();
  const subir = useSubirEvidencia();
  const quitar = useQuitarEvidencia();
  const [descripcion, setDescripcion] = useState(descripcionDeNombre(archivo.name));
  const [idioma, setIdioma] = useState<"en" | "es">(reemplaza?.idioma ?? "en");
  const [figura, setFigura] = useState<string>(String(reemplaza?.figura ?? siguienteFigura));
  const [pieEs, setPieEs] = useState(reemplaza?.pie_es ?? "");
  const [pieEn, setPieEn] = useState(reemplaza?.pie_en ?? "");
  const [mapa, setMapa] = useState(reemplaza?.es_mapa ?? false);
  const [error, setError] = useState("");

  const nombre = normalizarNombreEvidencia({ q: p.q, descripcion, anio: u.ciclo.anio_datos, extension: extensionDe(archivo.name) || "pdf" });
  const v = validarArchivoEvidencia({ nombre, tamano: archivo.size, idioma });

  const enviar = async () => {
    setError("");
    try {
      const res = await subir.mutateAsync({ respuesta: r.id, archivo, nombre, idioma, figura: figura ? Number(figura) : null, pieEs, pieEn, esMapa: mapa });
      if (reemplaza) await quitar.mutateAsync(reemplaza.id);
      u.avisar(res.avisos?.length ? `Evidencia subida. ${res.avisos.join(" ")}` : "Evidencia subida.");
      onTermina();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  return (
    <Dialogo titulo={reemplaza ? "Reemplazar la evidencia" : "Subir evidencia"} descripcion={pendientes ? `Quedan ${pendientes} archivos más por subir.` : undefined} onCerrar={onCancelar} ancho={600}>
      <form className="ugm-form" onSubmit={(e) => { e.preventDefault(); if (v.ok) void enviar(); }}>
        <p className="ugm-archivo">
          <Icon name="document" size={18} /> {archivo.name} <span className="ugm-muted ugm-num">· {bytesLegibles(archivo.size)}</span>
        </p>
        <Campo id="ev-desc" etiqueta="Descripción corta (va en el nombre)" ayuda={`Se guardará como: ${nombre}`}>
          <input id="ev-desc" className="ugm-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus />
        </Campo>
        <div className="ugm-grid2">
          <Campo id="ev-idioma" etiqueta="Idioma del documento">
            <select id="ev-idioma" className="ugm-input ugm-input--sel" value={idioma} onChange={(e) => setIdioma(e.target.value as "en" | "es")}>
              <option value="en">Inglés (lo que pide la guía)</option>
              <option value="es">Español</option>
            </select>
          </Campo>
          <Campo id="ev-fig" etiqueta="Número de figura" ayuda="Déjelo vacío si no lleva figura.">
            <input id="ev-fig" className="ugm-input ugm-num" inputMode="numeric" value={figura} onChange={(e) => setFigura(e.target.value.replace(/\D/g, ""))} />
          </Campo>
        </div>
        <Campo id="ev-pie-en" etiqueta="Pie de figura en inglés">
          <input id="ev-pie-en" lang="en" className="ugm-input" value={pieEn} onChange={(e) => setPieEn(e.target.value)} />
        </Campo>
        <Campo id="ev-pie-es" etiqueta="Pie de figura en español (opcional)">
          <input id="ev-pie-es" className="ugm-input" value={pieEs} onChange={(e) => setPieEs(e.target.value)} />
        </Campo>
        <label className="ugm-check">
          <input type="checkbox" checked={mapa} onChange={(e) => setMapa(e.target.checked)} />
          <span>Es un mapa</span>
        </label>
        {v.errores.map((x) => (
          <Alerta key={x} tipo="error">{x}</Alerta>
        ))}
        {v.avisos.map((x) => (
          <Alerta key={x} tipo="aviso">{x}</Alerta>
        ))}
        {error && <Alerta tipo="error">{error}</Alerta>}
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={!v.ok || subir.isPending}>
            {subir.isPending ? "Subiendo…" : reemplaza ? "Reemplazar" : "Subir"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}

function AgregarEnlace({ r, onCerrar }: { r: RespuestaUgm; onCerrar: () => void }) {
  const u = useUgm();
  const agregar = useAgregarEnlace();
  const [url, setUrl] = useState("https://");
  const [pieEn, setPieEn] = useState("");
  const val = url.length > 8 ? validarEnlacePublico(url) : { ok: false as const };
  return (
    <Dialogo titulo="Agregar un enlace" descripcion="La guía exige que el enlace sea de acceso público." onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await u.hacer(() => agregar.mutateAsync({ respuesta: r.id, url: url.trim(), pieEn }), "Enlace agregado.")) onCerrar();
        }}
      >
        <Campo id="en-url" etiqueta="Enlace">
          <input id="en-url" className="ugm-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </Campo>
        {"error" in val && val.error && <p className="ugm-error" role="alert">{val.error}</p>}
        <Campo id="en-pie" etiqueta="Descripción en inglés">
          <input id="en-pie" lang="en" className="ugm-input" value={pieEn} onChange={(e) => setPieEn(e.target.value)} />
        </Campo>
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={!val.ok || agregar.isPending}>Agregar</button>
        </footer>
      </form>
    </Dialogo>
  );
}

function EditarEvidencia({ e, onCerrar }: { e: EvidenciaUgm; onCerrar: () => void }) {
  const u = useUgm();
  const editar = useEditarEvidencia();
  const [figura, setFigura] = useState(String(e.figura ?? ""));
  const [pieEs, setPieEs] = useState(e.pie_es ?? "");
  const [pieEn, setPieEn] = useState(e.pie_en ?? "");
  const [orden, setOrden] = useState(String(e.orden));
  const [mapa, setMapa] = useState(e.es_mapa);
  const [idioma, setIdioma] = useState(e.idioma);
  return (
    <Dialogo titulo="Editar la evidencia" onCerrar={onCerrar}>
      <form
        className="ugm-form"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await u.hacer(() => editar.mutateAsync({ evidencia: e.id, figura: figura ? Number(figura) : null, pieEs, pieEn, orden: Number(orden) || 0, esMapa: mapa, idioma }), "Evidencia actualizada.")) onCerrar();
        }}
      >
        <div className="ugm-grid2">
          <Campo id="ed-fig" etiqueta="Número de figura">
            <input id="ed-fig" className="ugm-input ugm-num" inputMode="numeric" value={figura} onChange={(x) => setFigura(x.target.value.replace(/\D/g, ""))} autoFocus />
          </Campo>
          <Campo id="ed-orden" etiqueta="Orden">
            <input id="ed-orden" className="ugm-input ugm-num" inputMode="numeric" value={orden} onChange={(x) => setOrden(x.target.value.replace(/\D/g, ""))} />
          </Campo>
        </div>
        <Campo id="ed-pie-en" etiqueta="Pie en inglés">
          <input id="ed-pie-en" lang="en" className="ugm-input" value={pieEn} onChange={(x) => setPieEn(x.target.value)} />
        </Campo>
        <Campo id="ed-pie-es" etiqueta="Pie en español">
          <input id="ed-pie-es" className="ugm-input" value={pieEs} onChange={(x) => setPieEs(x.target.value)} />
        </Campo>
        <Campo id="ed-idioma" etiqueta="Idioma">
          <select id="ed-idioma" className="ugm-input ugm-input--sel" value={idioma} onChange={(x) => setIdioma(x.target.value as "en" | "es")}>
            <option value="en">Inglés</option>
            <option value="es">Español</option>
          </select>
        </Campo>
        <label className="ugm-check">
          <input type="checkbox" checked={mapa} onChange={(x) => setMapa(x.target.checked)} />
          <span>Es un mapa</span>
        </label>
        <footer className="ugm-dlg__pie">
          <button type="button" className="ugm-btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="ugm-btn ugm-btn--pri" disabled={editar.isPending}>Guardar</button>
        </footer>
      </form>
    </Dialogo>
  );
}
