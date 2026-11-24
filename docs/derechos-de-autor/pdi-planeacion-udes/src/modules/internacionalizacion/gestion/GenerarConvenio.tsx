/* =============================================================================
   Gestión de convenios · Generar convenio (0257). Se elige un modelo y un convenio de
   Convenios (o se llega desde «Iniciar renovación»), se completan los campos que no salen
   de la ficha (representante, cargo, logo de la institución), se ve la vista previa con los
   datos y «Generar» deja el documento en el bucket, con su huella SHA-256, una línea en el
   historial del convenio y el estado «listo para firma» (la firma es la segunda parte).

   · Modelo del editor → una página HTML completa (se descarga o se imprime a PDF).
   · Modelo de Word    → un .docx nuevo con los campos sustituidos dentro del original.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useDirectorio } from "../relaciones/datos";
import { ErrorCaja, useAviso } from "../ui/comunes";
import { vigenciaDe } from "../convenios/logica";
import type { Convenio } from "../convenios/logica";
import { bajarArchivo, subirArchivo, useRegistrarGenerado } from "./datos";
import type { Modelo } from "./datos";
import { dataUrlDe, generarDocx, leerDocx, logoUdesOficial, prepararLogo, TIPO_DOCX } from "./docx";
import type { ImagenLogo } from "./docx";
import { camposDeHoja, camposPorPedir, CAMPOS, CLAVES_CONOCIDAS, CLAVES_IMAGEN, descargarBytes, documentoFinal, imprimirHtml, motivoImagenNoValida, nombreSeguro, sha256Hex, valoresDeConvenio } from "./logica";
import type { Idioma } from "../../../../supabase/functions/conv-avisos/plantilla";

const norma = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

interface Hecho {
  nombre: string;
  formato: "docx" | "html";
  bytes: Uint8Array;
  html?: string;
  hash: string;
}

export function GenerarConvenio({ modelos, convenios, hoy, crea, modeloInicial, convenioInicial }: { modelos: Modelo[]; convenios: Convenio[]; hoy: string; crea: boolean; modeloInicial: string | null; convenioInicial: string | null }) {
  const aviso = useAviso();
  const registrar = useRegistrarGenerado();
  const directorio = useDirectorio();
  const [modeloId, setModeloId] = useState(modeloInicial ?? "");
  const [convenioId, setConvenioId] = useState(convenioInicial ?? "");
  const [filtro, setFiltro] = useState("");
  const [idiomaElegido, setIdiomaElegido] = useState<Idioma | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [logoInst, setLogoInst] = useState<{ img: ImagenLogo; nombre: string } | null>(null);
  const [vistaWord, setVistaWord] = useState<{ html: string; error: string }>({ html: "", error: "" });
  const [generando, setGenerando] = useState(false);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  const modelo = modelos.find((m) => m.id === modeloId) ?? null;
  const convenio = convenios.find((c) => c.id === convenioId) ?? null;
  const idioma: Idioma = !modelo ? "es" : modelo.idioma === "bi" ? (idiomaElegido ?? (convenio?.idioma === "en" ? "en" : "es")) : modelo.idioma;

  // Word: el original y sus campos.
  const word = useQuery({
    queryKey: ["gest", "word-bytes", modelo?.archivo_ruta, modelo?.archivo_hash],
    enabled: modelo?.fuente === "word" && Boolean(modelo.archivo_ruta),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const bytes = await bajarArchivo(modelo?.archivo_ruta as string);
      return { bytes, informe: leerDocx(bytes, CLAVES_CONOCIDAS) };
    },
  });
  const logoUdes = useQuery({
    queryKey: ["gest", "logo-udes", modelo?.logo_udes_ruta ?? "oficial"],
    enabled: Boolean(modelo),
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ImagenLogo> => {
      if (!modelo?.logo_udes_ruta) return logoUdesOficial();
      const bytes = await bajarArchivo(modelo.logo_udes_ruta);
      const tipo = modelo.logo_udes_ruta.endsWith(".png") ? "image/png" : modelo.logo_udes_ruta.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
      return prepararLogo(new Blob([bytes as BlobPart], { type: tipo }));
    },
  });

  const usados = useMemo(() => {
    if (!modelo) return [];
    return modelo.fuente === "editor" ? camposDeHoja(modelo.contenido_html) : (word.data?.informe.marcadores ?? modelo.marcadores);
  }, [modelo, word.data]);
  const conocidos = useMemo(() => new Set<string>([...CLAVES_CONOCIDAS, ...usados]), [usados]);
  const base = useMemo(() => (convenio ? valoresDeConvenio(convenio, idioma, hoy) : {}), [convenio, idioma, hoy]);
  const valores = useMemo(() => ({ ...base, ...edits }), [base, edits]);
  const pedir = usados.filter((k) => !(CLAVES_IMAGEN as readonly string[]).includes(k));
  const faltan = camposPorPedir(usados, valores);
  const pideLogoInst = modelo?.fuente === "editor" || usados.includes("logo_institucion");

  useEffect(() => {
    setEdits({});
    setLogoInst(null);
    setHecho(null);
    setIdiomaElegido(null);
  }, [convenioId, modeloId]);

  // Vista previa de Word: se genera en memoria y se lee de nuevo con la misma vista previa.
  useEffect(() => {
    if (modelo?.fuente !== "word" || !word.data || !convenio) {
      setVistaWord({ html: "", error: "" });
      return;
    }
    const t = window.setTimeout(() => {
      try {
        const r = generarDocx(word.data.bytes, valores, { logo_udes: logoUdes.data ?? null, logo_institucion: logoInst?.img ?? null }, conocidos);
        setVistaWord({ html: leerDocx(r.bytes, conocidos).vistaHtml, error: "" });
      } catch (e) {
        setVistaWord({ html: "", error: e instanceof Error ? e.message : "No se pudo armar la vista previa." });
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [modelo?.fuente, word.data, convenio, valores, logoUdes.data, logoInst, conocidos]);

  const vistaEditor = useMemo(() => {
    if (modelo?.fuente !== "editor" || !convenio) return null;
    return documentoFinal(modelo.contenido_html, valores, idioma, { udes: logoUdes.data ? dataUrlDe(logoUdes.data) : null, institucion: logoInst ? dataUrlDe(logoInst.img) : null }, `${modelo.nombre} · ${convenio.institucion}`);
  }, [modelo, convenio, valores, idioma, logoUdes.data, logoInst]);

  const sugerencias = useMemo(() => {
    if (!convenio || !directorio.data) return [];
    const k = norma(convenio.institucion);
    if (k.length < 4) return [];
    return directorio.data.filter((c) => c.nombre && norma(c.institucion).length >= 4 && (norma(c.institucion).includes(k) || k.includes(norma(c.institucion)))).slice(0, 6);
  }, [convenio, directorio.data]);

  const cargarLogo = async (f: File) => {
    const motivo = motivoImagenNoValida(f);
    if (motivo) return aviso.mal(new Error(motivo));
    try {
      setLogoInst({ img: await prepararLogo(f), nombre: f.name });
    } catch (e) {
      aviso.mal(e);
    }
  };

  const generar = async () => {
    if (!modelo || !convenio) return;
    setGenerando(true);
    try {
      let bytes: Uint8Array;
      let formato: "docx" | "html";
      let html: string | undefined;
      if (modelo.fuente === "word") {
        if (!word.data) throw new Error("El documento del modelo todavía no se ha leído.");
        bytes = generarDocx(word.data.bytes, valores, { logo_udes: logoUdes.data ?? null, logo_institucion: logoInst?.img ?? null }, conocidos).bytes;
        formato = "docx";
      } else {
        if (!vistaEditor) throw new Error("No se pudo armar el documento.");
        html = vistaEditor.html;
        bytes = new TextEncoder().encode(html);
        formato = "html";
      }
      const hash = await sha256Hex(bytes);
      const id = crypto.randomUUID();
      const nombre = `${nombreSeguro(convenio.codigo)}-${nombreSeguro(modelo.nombre)}-${idioma}.${formato}`;
      const ruta = `generados/${convenio.id}/${id}.${formato}`;
      await subirArchivo(ruta, bytes, formato === "docx" ? TIPO_DOCX : "text/html");
      await registrar.mutateAsync({ id, convenio_id: convenio.id, modelo_id: modelo.id, modelo_nombre: modelo.nombre, modelo_version: modelo.version, idioma, formato, nombre, ruta, tamano: bytes.length, hash_sha256: hash, valores });
      setHecho({ nombre, formato, bytes, html, hash });
      aviso.ok("Convenio generado. Quedó listo para firma y anotado en el historial.");
    } catch (e) {
      aviso.mal(e);
    } finally {
      setGenerando(false);
    }
  };

  const abiertos = convenios
    .filter((c) => !filtro.trim() || norma(`${c.codigo} ${c.institucion} ${c.pais}`).includes(norma(filtro)))
    .slice(0, 150);
  const errorLectura = (word.error ?? logoUdes.error) as Error | null;

  return (
    <div className="gest-generar">
      <section className="conv-panel conv-bloque">
        <h2>Qué se va a generar</h2>
        <div className="conv-g2">
          <label className="it-campo" htmlFor="gg-modelo">
            <span>Modelo</span>
            <select id="gg-modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Elija un modelo…</option>
              {[...modelos].sort((a, b) => Number(b.estado === "vigente") - Number(a.estado === "vigente")).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} · v{m.version} · {m.estado === "vigente" ? "vigente" : "borrador"}
                </option>
              ))}
            </select>
          </label>
          <div className="it-campo">
            <label htmlFor="gg-filtro">
              <span>Convenio</span>
            </label>
            <input id="gg-filtro" type="search" value={filtro} placeholder="Buscar por código, institución o país" onChange={(e) => setFiltro(e.target.value)} />
            <select aria-label="Convenio" value={convenioId} onChange={(e) => setConvenioId(e.target.value)}>
              <option value="">Elija un convenio…</option>
              {convenio && !abiertos.some((c) => c.id === convenio.id) ? <option value={convenio.id}>{convenio.codigo.toUpperCase()} · {convenio.institucion}</option> : null}
              {abiertos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo.toUpperCase()} · {c.institucion} · {vigenciaDe(c, hoy)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {modelo?.estado === "borrador" ? <p className="conv-nota">Este modelo está en borrador. Puede generar con él, pero conviene publicarlo antes de enviar algo a firma.</p> : null}
        {modelo?.idioma === "bi" ? (
          <div className="gest-fila">
            <span className="conv-sub">Idioma del documento</span>
            {(["es", "en"] as const).map((i) => (
              <label key={i} className="conv-radio">
                <input type="radio" name="gg-idioma" checked={idioma === i} onChange={() => setIdiomaElegido(i)} />
                {i === "es" ? "Español" : "English"}
              </label>
            ))}
          </div>
        ) : null}
        {errorLectura ? <ErrorCaja error={errorLectura} /> : null}
      </section>

      {modelo && convenio ? (
        <div className="gest-dos gest-dos--gen">
          <section className="conv-panel conv-bloque">
            <h2>Datos del convenio</h2>
            <p className="conv-sub">Lo que sale de la ficha ya viene lleno. Puede corregirlo aquí sin cambiar la ficha.</p>
            {!pedir.length ? <p className="conv-nota">Este modelo no tiene campos. Se generará tal como está.</p> : null}
            <div className="gest-campos-form">
              {pedir.map((k) => {
                const def = CAMPOS.find((c) => c.k === k);
                const largo = k === "objeto" || (valores[k] ?? "").length > 90;
                const vacio = !(valores[k] ?? "").trim();
                return (
                  <label key={k} className={`it-campo${vacio ? " is-falta" : ""}`} htmlFor={`gg-${k}`}>
                    <span>
                      {def?.etiqueta ?? k.replace(/_/g, " ")} {vacio ? <em className="gest-req">· falta</em> : null}
                    </span>
                    {largo ? (
                      <textarea id={`gg-${k}`} rows={3} value={valores[k] ?? ""} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
                    ) : (
                      <input id={`gg-${k}`} type="text" value={valores[k] ?? ""} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
                    )}
                  </label>
                );
              })}
            </div>
            {pedir.includes("representante") && sugerencias.length ? (
              <div className="gest-sugerencias">
                <span className="conv-sub">Contactos de {convenio.institucion} en Relaciones:</span>
                {sugerencias.map((c) => (
                  <button key={c.id} type="button" className="gest-chip" onClick={() => setEdits({ ...edits, representante: c.nombre, ...(c.cargo ? { cargo: c.cargo } : {}) })}>
                    {c.nombre}
                    {c.cargo ? ` · ${c.cargo}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
            {pideLogoInst ? (
              <div className="gest-logo-carga">
                <h3>Logo de la institución</h3>
                <p className="conv-sub">PNG, JPG o SVG, hasta 2 MB. {modelo.fuente === "word" ? "Sale donde el Word tenga {{logo_institucion}}." : "Sale en el encabezado, junto al logo de la UDES."}</p>
                <div className="gest-fila">
                  <label className="conv-btn conv-btn--sm">
                    <Icon name="upload" size={14} />
                    {logoInst ? "Cambiar" : "Cargar logo"}
                    <input type="file" hidden accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => e.target.files?.[0] && void cargarLogo(e.target.files[0])} />
                  </label>
                  {logoInst ? (
                    <>
                      <img className="gest-logo gest-logo--chico" src={dataUrlDe(logoInst.img)} alt={`Logo cargado: ${logoInst.nombre}`} />
                      <button type="button" className="conv-btn conv-btn--sm" onClick={() => setLogoInst(null)}>
                        Quitar
                      </button>
                    </>
                  ) : (
                    <span className="conv-sub">Sin logo: el espacio queda vacío.</span>
                  )}
                </div>
              </div>
            ) : null}
            <div className="gest-acciones">
              <button type="button" className="conv-btn conv-btn--pri" disabled={!crea || generando || faltan.length > 0 || (modelo.fuente === "word" && !word.data) || (modelo.fuente === "editor" && !vistaEditor)} onClick={() => void generar()}>
                {generando ? "Generando…" : "Generar convenio"}
              </button>
              {faltan.length ? <span className="conv-sub">Falta completar: {faltan.map((k) => CAMPOS.find((c) => c.k === k)?.etiqueta ?? k.replace(/_/g, " ")).join(", ")}.</span> : null}
              {!crea ? <span className="conv-sub">Generar requiere permiso de edición.</span> : null}
            </div>
            {aviso.nodo}
            {hecho ? (
              <div className="gest-hecho" role="status">
                <b>{hecho.nombre}</b>
                <span className="conv-pill conv-pill--warn">Listo para firma</span>
                <span className="conv-sub conv-mono" title={hecho.hash}>
                  SHA-256 {hecho.hash.slice(0, 16)}…
                </span>
                <div className="gest-fila">
                  <button type="button" className="conv-btn conv-btn--sm conv-btn--pri" onClick={() => descargarBytes(hecho.bytes, hecho.nombre, hecho.formato === "docx" ? TIPO_DOCX : "text/html")}>
                    <Icon name="download" size={14} />
                    Descargar .{hecho.formato}
                  </button>
                  {hecho.html ? (
                    <button type="button" className="conv-btn conv-btn--sm" onClick={() => imprimirHtml(hecho.html as string)}>
                      Imprimir o guardar como PDF
                    </button>
                  ) : null}
                </div>
                <p className="conv-sub">El envío a firma electrónica se añade en la segunda parte; el PDF que se firmará sale de este mismo documento.</p>
              </div>
            ) : null}
          </section>

          <section className="conv-panel conv-bloque">
            <h2>Vista previa con los datos</h2>
            {modelo.fuente === "editor" && vistaEditor ? (
              <iframe className="gest-previa-doc" title="Vista previa del convenio" sandbox="" srcDoc={vistaEditor.html} />
            ) : vistaWord.error ? (
              <p className="conv-error" role="alert">{vistaWord.error}</p>
            ) : vistaWord.html ? (
              <div className="gest-hoja gest-hoja--solo" dangerouslySetInnerHTML={{ __html: vistaWord.html }} />
            ) : (
              <p className="it-cargando" role="status">Armando la vista previa…</p>
            )}
          </section>
        </div>
      ) : (
        <section className="conv-panel">
          <p className="conv-vacio">
            <b>Elija un modelo y un convenio para ver el documento con sus datos.</b>
          </p>
        </section>
      )}
    </div>
  );
}
