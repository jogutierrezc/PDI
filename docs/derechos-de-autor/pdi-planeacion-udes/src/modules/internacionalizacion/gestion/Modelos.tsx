/* =============================================================================
   Gestión de convenios · Modelos de convenio (0257). A la izquierda la lista de modelos
   (con «Cargar Word» y «Crear»); a la derecha, según la vista: el modelo (ficha, logos y
   su contenido: editor propio o plantilla Word), «Generar convenio» o los generados.

   Un modelo es del editor (HTML saneado en la base) o de Word (el .docx original queda
   guardado tal cual en el bucket conv-modelos y se sustituyen los campos dentro de su XML).
   Los archivos viven en el bucket y no en UDrive: ver la cabecera de la migración 0257.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FaltaMigracion } from "../../rankings/noticias";
import { AvisoMigracion, Confirmar, ErrorCaja, useAviso } from "../ui/comunes";
import { DOCUMENTOS } from "../convenios/logica";
import type { Convenio } from "../convenios/logica";
import { bajarArchivo, subirArchivo, useActualizarModelo, useBorrarModelo, useCrearModelo, useGenerados, useModelos, useUrlFirmada } from "./datos";
import type { IdiomaModelo, Modelo } from "./datos";
import { EditorModelo, hojaInicial } from "./EditorModelo";
import { DOCX_MAX_BYTES, ErrorDocx, leerDocx, TIPO_DOCX } from "./docx";
import { GenerarConvenio } from "./GenerarConvenio";
import { CLAVES_CONOCIDAS, motivoImagenNoValida, sha256Hex, tamanoLegible } from "./logica";
import { ModeloWord } from "./ModeloWord";

type Vista = "modelo" | "generar" | "generados";
const IDIOMA_TEXTO: Record<IdiomaModelo, string> = { es: "Español", en: "Inglés", bi: "Bilingüe" };

export function Modelos({ convenios, hoy, crea, convenioInicial }: { convenios: Convenio[]; hoy: string; crea: boolean; convenioInicial: string | null }) {
  const modelos = useModelos();
  const generados = useGenerados();
  const crear = useCrearModelo();
  const aviso = useAviso();
  const [elegido, setElegido] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>(convenioInicial ? "generar" : "modelo");
  const [leyendo, setLeyendo] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  const lista = modelos.data ?? [];
  const modelo = lista.find((m) => m.id === elegido) ?? (convenioInicial ? (lista.find((m) => m.estado === "vigente") ?? lista[0]) : lista[0]) ?? null;
  const usos = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of generados.data ?? []) if (g.modelo_id) m.set(g.modelo_id, (m.get(g.modelo_id) ?? 0) + 1);
    return m;
  }, [generados.data]);

  if (modelos.error) return modelos.error instanceof FaltaMigracion ? <AvisoMigracion error={modelos.error} /> : <ErrorCaja error={modelos.error} />;
  if (!modelos.data) return <p className="it-cargando" role="status">Abriendo los modelos…</p>;

  const crearEditor = () =>
    crear.mutate(
      { nombre: "Modelo nuevo", tipo_documento: "Convenio", idioma: "es", fuente: "editor", contenido_html: hojaInicial() },
      {
        onSuccess: (m) => {
          setElegido(m.id);
          setVista("modelo");
          aviso.ok("Modelo creado como borrador. Escriba el texto y marque los campos.");
        },
        onError: aviso.mal,
      },
    );

  const cargarWord = async (f: File) => {
    if (!/\.docx$/i.test(f.name)) return aviso.mal(new Error("Cargue un archivo de Word en formato .docx."));
    if (f.size > DOCX_MAX_BYTES) return aviso.mal(new Error("El archivo pesa más de 15 MB."));
    setLeyendo(f.name);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const informe = leerDocx(bytes, CLAVES_CONOCIDAS);
      const id = crypto.randomUUID();
      const ruta = `modelos/${id}/original.docx`;
      await subirArchivo(ruta, bytes, TIPO_DOCX);
      const nombre = f.name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").trim() || "Modelo de Word";
      const hash = await sha256Hex(bytes);
      crear.mutate(
        { id, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), tipo_documento: "Convenio", idioma: "es", fuente: "word", archivo_ruta: ruta, archivo_nombre: f.name, archivo_hash: hash, archivo_tamano: bytes.length, marcadores: informe.marcadores },
        {
          onSuccess: (m) => {
            setElegido(m.id);
            setVista("modelo");
            aviso.ok(informe.marcadores.length ? `Modelo cargado como borrador. Se encontraron ${informe.marcadores.length} campos.` : "Modelo cargado como borrador, pero no se encontró ningún campo. Escríbalos como {{campo}} en el Word y vuelva a cargarlo.");
          },
          onError: aviso.mal,
        },
      );
    } catch (e) {
      aviso.mal(e instanceof ErrorDocx ? e : e instanceof Error ? e : new Error("No se pudo cargar el archivo."));
    } finally {
      setLeyendo("");
      if (archivo.current) archivo.current.value = "";
    }
  };

  return (
    <div className="gest-modelos">
      <section className="conv-panel gest-lateral">
        <div className="conv-bar">
          <h2>Modelos</h2>
          <span className="conv-grow" />
          {crea ? (
            <>
              <button type="button" className="conv-btn conv-btn--sm conv-btn--pri" disabled={Boolean(leyendo)} onClick={() => archivo.current?.click()}>
                <Icon name="upload" size={14} />
                Cargar Word
              </button>
              <button type="button" className="conv-btn conv-btn--sm" disabled={crear.isPending} onClick={crearEditor}>
                <Icon name="plus" size={14} />
                Crear
              </button>
            </>
          ) : null}
          <input ref={archivo} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => e.target.files?.[0] && void cargarWord(e.target.files[0])} />
        </div>
        {leyendo ? <p className="conv-sub gest-relleno" role="status">Leyendo {leyendo}…</p> : null}
        {!lista.length ? (
          <p className="conv-vacio">
            <b>Todavía no hay modelos.</b>
            <br />
            Cargue un convenio en Word con sus campos escritos como {"{{institucion}}"} o cree uno en el editor.
          </p>
        ) : (
          <div className="gest-modelos-lista" role="list">
            {lista.map((m) => (
              <button key={m.id} type="button" role="listitem" className="gest-item" aria-current={m.id === modelo?.id} onClick={() => { setElegido(m.id); setVista("modelo"); }}>
                <span>{m.nombre}</span>
                <small>
                  v{m.version} · {IDIOMA_TEXTO[m.idioma]} · {m.fuente === "word" ? "Word" : "Editor"} · {usos.get(m.id) ?? 0} {usos.get(m.id) === 1 ? "uso" : "usos"}
                </small>
                <span className={`conv-pill ${m.estado === "vigente" ? "conv-pill--ok" : "conv-pill--idle"}`}>{m.estado === "vigente" ? "Vigente" : "Borrador"}</span>
              </button>
            ))}
          </div>
        )}
        <div className="gest-pie">{aviso.nodo}</div>
      </section>

      <div className="gest-principal">
        <div className="conv-tabs gest-subtabs" role="tablist" aria-label="Qué hacer con los modelos">
          {(
            [
              ["modelo", "Modelo"],
              ["generar", "Generar convenio"],
              ["generados", `Generados${generados.data?.length ? ` (${generados.data.length})` : ""}`],
            ] as [Vista, string][]
          ).map(([id, rotulo]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}>
              {rotulo}
            </button>
          ))}
        </div>
        {vista === "modelo" ? (
          modelo ? (
            <Detalle key={modelo.id} m={modelo} crea={crea} usos={usos.get(modelo.id) ?? 0} onBorrado={() => setElegido(null)} />
          ) : (
            <section className="conv-panel">
              <p className="conv-vacio">
                <b>Elija un modelo o cree el primero.</b>
              </p>
            </section>
          )
        ) : vista === "generar" ? (
          <GenerarConvenio modelos={lista} convenios={convenios} hoy={hoy} crea={crea} modeloInicial={modelo?.id ?? null} convenioInicial={convenioInicial} />
        ) : (
          <Generados convenios={convenios} />
        )}
      </div>
    </div>
  );
}

/* ---------- Ficha, logos y contenido ----------------------------------------------------------- */

function Detalle({ m, crea, usos, onBorrado }: { m: Modelo; crea: boolean; usos: number; onBorrado: () => void }) {
  const actualizar = useActualizarModelo();
  const borrar = useBorrarModelo();
  const aviso = useAviso();
  const [nombre, setNombre] = useState(m.nombre);
  const [borrando, setBorrando] = useState(false);
  const logo = useUrlFirmada(m.logo_udes_ruta);
  const archivoLogo = useRef<HTMLInputElement>(null);

  const poner = (cambios: Parameters<typeof actualizar.mutate>[0]["cambios"], mensaje?: string) => actualizar.mutate({ id: m.id, cambios }, { onSuccess: () => mensaje && aviso.ok(mensaje), onError: aviso.mal });
  const publicar = () => poner({ estado: "vigente", ...(m.estado === "vigente" ? { version: m.version + 1 } : {}) }, m.estado === "vigente" ? `Publicada la versión ${m.version + 1}.` : "Modelo publicado como vigente.");

  const cambiarLogo = async (f: File) => {
    const motivo = motivoImagenNoValida(f);
    if (motivo) return aviso.mal(new Error(motivo));
    try {
      const ext = f.type === "image/png" ? "png" : f.type === "image/jpeg" ? "jpg" : "svg";
      const ruta = `modelos/${m.id}/logo-udes.${ext}`;
      await subirArchivo(ruta, f, f.type);
      poner({ logo_udes_ruta: ruta }, "Logo de la UDES cambiado para este modelo.");
    } catch (e) {
      aviso.mal(e);
    } finally {
      if (archivoLogo.current) archivoLogo.current.value = "";
    }
  };

  return (
    <>
      <section className="conv-panel conv-bloque gest-ficha">
        <div className="conv-g3">
          <label className="it-campo" htmlFor="gm-nombre">
            <span>Nombre del modelo</span>
            <input id="gm-nombre" type="text" value={nombre} maxLength={160} disabled={!crea} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre.trim() && nombre !== m.nombre && poner({ nombre: nombre.trim() })} />
          </label>
          <label className="it-campo" htmlFor="gm-tipo">
            <span>Tipo de documento</span>
            <input id="gm-tipo" type="text" list="gm-tipos" maxLength={80} disabled={!crea} onBlur={(e) => e.target.value.trim() && e.target.value !== m.tipo_documento && poner({ tipo_documento: e.target.value.trim() })} defaultValue={m.tipo_documento} />
            <datalist id="gm-tipos">
              {DOCUMENTOS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="it-campo" htmlFor="gm-idioma">
            <span>Idioma</span>
            <select id="gm-idioma" value={m.idioma} disabled={!crea} onChange={(e) => poner({ idioma: e.target.value as IdiomaModelo })}>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="bi">Bilingüe (se elige al generar)</option>
            </select>
          </label>
        </div>
        <div className="gest-fila">
          <span className={`conv-pill ${m.estado === "vigente" ? "conv-pill--ok" : "conv-pill--idle"}`}>{m.estado === "vigente" ? "Vigente" : "Borrador"}</span>
          <span className="conv-sub">Versión {m.version}</span>
          <span className="conv-grow" />
          {crea ? (
            <>
              <button type="button" className="conv-btn conv-btn--pri" disabled={actualizar.isPending} onClick={publicar}>
                {m.estado === "vigente" ? "Publicar nueva versión" : "Publicar"}
              </button>
              {m.estado === "vigente" ? (
                <button type="button" className="conv-btn" disabled={actualizar.isPending} onClick={() => poner({ estado: "borrador" }, "El modelo volvió a borrador.")}>
                  Volver a borrador
                </button>
              ) : null}
              {m.estado === "borrador" && usos === 0 ? (
                <button type="button" className="conv-btn conv-btn--peligro" onClick={() => setBorrando(true)}>
                  Borrar
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="gest-logos">
          <div>
            <h3>Logo de la UDES</h3>
            <img className="gest-logo" src={m.logo_udes_ruta ? (logo.data ?? "/logo-udes.svg") : "/logo-udes.svg"} alt="Logo de la Universidad de Santander" />
            <p className="conv-sub">{m.logo_udes_ruta ? "Logo propio de este modelo." : "Logo oficial de la UDES."}</p>
            {crea ? (
              <div className="gest-fila">
                <button type="button" className="conv-btn conv-btn--sm" onClick={() => archivoLogo.current?.click()}>
                  <Icon name="upload" size={14} />
                  Cambiar logo
                </button>
                {m.logo_udes_ruta ? (
                  <button type="button" className="conv-btn conv-btn--sm" onClick={() => poner({ logo_udes_ruta: null }, "Volvió el logo oficial.")}>
                    Usar el oficial
                  </button>
                ) : null}
                <input ref={archivoLogo} type="file" hidden accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => e.target.files?.[0] && void cambiarLogo(e.target.files[0])} />
              </div>
            ) : null}
          </div>
          <div>
            <h3>Logo de la institución</h3>
            <p className="conv-sub">Se carga al generar el convenio para cada contraparte (PNG, JPG o SVG, hasta 2 MB). En el editor sale al lado del logo de la UDES; en Word, donde esté el campo {"{{logo_institucion}}"}.</p>
          </div>
        </div>
        {aviso.nodo}
      </section>
      {m.fuente === "editor" ? <EditorModelo m={m} crea={crea} logoUdes={m.logo_udes_ruta ? (logo.data ?? "/logo-udes.svg") : "/logo-udes.svg"} /> : <ModeloWord m={m} crea={crea} />}
      {borrando ? (
        <Confirmar
          pregunta="¿Borrar este modelo?"
          detalle="Solo se pueden borrar los borradores que no se han usado. Se borra también su archivo."
          si="Borrar el modelo"
          ocupado={borrar.isPending}
          onNo={() => setBorrando(false)}
          onSi={() => borrar.mutate(m, { onSuccess: onBorrado, onError: aviso.mal, onSettled: () => setBorrando(false) })}
        />
      ) : null}
    </>
  );
}

/* ---------- Generados -------------------------------------------------------------------------------- */

function Generados({ convenios }: { convenios: Convenio[] }) {
  const g = useGenerados();
  const aviso = useAviso();
  const bajar = async (x: NonNullable<typeof g.data>[number]) => {
    try {
      const bytes = await bajarArchivo(x.ruta);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: x.formato === "docx" ? TIPO_DOCX : "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = x.nombre;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      aviso.mal(e);
    }
  };
  if (g.error) return <ErrorCaja error={g.error as Error} />;
  return (
    <section className="conv-panel">
      <div className="conv-bar">
        <h2>Convenios generados</h2>
        <span className="conv-grow" />
        <span className="conv-sub">Listos para la firma electrónica</span>
      </div>
      {!(g.data ?? []).length ? (
        <p className="conv-vacio">
          <b>Todavía no se ha generado ningún convenio.</b>
        </p>
      ) : (
        <div className="conv-tabla conv-tabla--chica">
          <table>
            <thead>
              <tr>
                <th>Convenio</th>
                <th>Modelo</th>
                <th>Archivo</th>
                <th>Huella</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(g.data ?? []).map((x) => {
                const c = convenios.find((k) => k.id === x.convenio_id);
                return (
                  <tr key={x.id}>
                    <td>
                      <span className="conv-nm">{c?.institucion ?? "Convenio"}</span>
                      <span className="conv-sub">
                        {c?.codigo.toUpperCase()} · {new Date(x.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td>
                      {x.modelo_nombre}
                      <span className="conv-sub"> v{x.modelo_version} · {x.idioma === "es" ? "español" : "inglés"}</span>
                    </td>
                    <td>
                      {x.formato.toUpperCase()} <span className="conv-sub">{tamanoLegible(x.tamano)}</span>
                      <span className="conv-pill conv-pill--warn gest-izq">{x.estado === "listo_firma" ? "Listo para firma" : x.estado === "en_firma" ? "En firma" : "Firmado"}</span>
                    </td>
                    <td className="conv-mono" title={x.hash_sha256}>
                      {x.hash_sha256.slice(0, 12)}…
                    </td>
                    <td>
                      <button type="button" className="conv-btn conv-btn--sm" onClick={() => void bajar(x)}>
                        <Icon name="download" size={14} />
                        Descargar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="gest-pie">{aviso.nodo}</div>
    </section>
  );
}
