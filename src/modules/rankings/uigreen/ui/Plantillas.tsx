/* =============================================================================
   UI GreenMetric · plantillas: exportar el paquete (Word + evidencias + hoja de
   datos), regenerar las plantillas con marcadores e importar una plantilla
   diligenciada con el asistente de revisión. La descarga se arma en el
   navegador (Blob y un <a> temporal). Solo exporta lo que está LISTO: aprobado,
   con traducción revisada y evidencia completa.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import { supabase } from "../../../../lib/supabase";
import { Icon } from "../../../../components/ui/Icon";
import { enlaceDeArchivo } from "../../../udrive/datos";
import { errorDe, useCerrarImportacion, useExportaciones, useGuardarCaptura, useGuardarTraducciones, useImportaciones, useRegistrarExportacion, useRegistrarImportacion } from "../datos";
import { compararQ, nombreArchivoPlantilla } from "../lib/catalogo";
import { DOCX_MAX_BYTES, ErrorImportacion, construirCaptura, leerPlantillaDiligenciada } from "../lib/docx-leer";
import type { InformeImportacion } from "../lib/docx-leer";
import { ErrorExportacion, generarPlantilla, llenarPlantilla } from "../lib/docx-plantilla";
import type { FiguraDoc } from "../lib/docx-plantilla";
import { aNumero } from "../lib/calculo";
import { dimensionesImagen, extensionDe, nombrePaquete } from "../lib/evidencia";
import { listaParaExportar } from "../lib/estados";
import { armarPaquete } from "../lib/paquete";
import type { FilaDatos, ItemPaquete } from "../lib/paquete";
import type { CategoriaId, EvidenciaUgm, PreguntaCiclo } from "../lib/tipos";
import { Alerta, Campo, Cargando, Dialogo, Vacio, fechaCorta, mensajeDe } from "./comunes";
import { useUgm } from "./contexto";
import type { ArchivoDrive } from "./lectura";

type Alcance = "indicador" | "categoria" | "todo";
const ZIP = "application/zip";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function descargar(bytes: Uint8Array, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function huella(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function rpcJson<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

export function Plantillas() {
  const u = useUgm();
  const exportaciones = useExportaciones(u.ciclo.id);
  const importaciones = useImportaciones(u.ciclo.id);
  const registrar = useRegistrarExportacion();
  const [alcance, setAlcance] = useState<Alcance>("todo");
  const [q, setQ] = useState(u.preguntas.find((p) => p.plantilla)?.q ?? "");
  const [cat, setCat] = useState<CategoriaId>(u.categorias[0]?.categoria ?? "SI");
  const [progreso, setProgreso] = useState("");
  const [resultado, setResultado] = useState<{ incluidas: number; excluidas: { q: string; motivo: string }[] } | null>(null);
  const [importar, setImportar] = useState(false);

  const objetivos = useMemo(() => {
    const todas = [...u.preguntas].sort((a, b) => compararQ(a.q, b.q));
    return alcance === "indicador" ? todas.filter((p) => p.q === q) : alcance === "categoria" ? todas.filter((p) => p.categoria === cat) : todas;
  }, [u.preguntas, alcance, q, cat]);

  if (!u.cfg) return <Cargando texto="Cargando la configuración del ciclo…" />;
  const cfg = u.cfg;

  const exportar = async () => {
    setResultado(null);
    try {
      const ids = objetivos.map((p) => u.porQ.get(p.q)?.id).filter((x): x is string => !!x);
      setProgreso("Leyendo evidencias…");
      const evs = ids.length ? ((await supabase.from("ugm_evidencias").select("*").in("respuesta_id", ids).order("orden")).data ?? []) as EvidenciaUgm[] : [];
      const archivoIds = [...new Set(evs.map((e) => e.archivo_id).filter((x): x is string => !!x))];
      const archivos = new Map<string, ArchivoDrive>(
        archivoIds.length ? (((await supabase.from("drive_archivos").select("id,nombre,tipo,tamano,mime,ruta_storage").in("id", archivoIds)).data ?? []) as ArchivoDrive[]).map((a) => [a.id, a]) : [],
      );
      const items: ItemPaquete[] = [];
      const datos: FilaDatos[] = [];
      let n = 0;
      for (const p of objetivos) {
        n += 1;
        setProgreso(`Preparando ${p.q} (${n} de ${objetivos.length})…`);
        const r = u.porQ.get(p.q);
        const categoria = u.categorias.find((c) => c.categoria === p.categoria)!;
        if (!r) {
          items.push({ pregunta: p, categoria, lista: false, motivoNoLista: "No tiene respuesta en este ciclo.", version: 0, evidencias: [] });
          continue;
        }
        const pend = r.estado === "aprobado" ? await rpcJson<string[]>("ugm_traducciones_pendientes", { p_respuesta: r.id }) : [];
        const deEsta = evs.filter((e) => e.respuesta_id === r.id);
        const lista = listaParaExportar({ estado: r.estado, traduccionesPendientes: pend, requiereEvidencia: p.requiere_evidencia, evidencias: deEsta.length });
        if (!lista) {
          const motivo = r.estado !== "aprobado" ? `No está aprobada (${r.estado.replace("_", " ")}).` : pend.length ? `La traducción no está revisada (${pend.join(", ")}).` : "Falta la evidencia que exige la guía.";
          items.push({ pregunta: p, categoria, lista: false, motivoNoLista: motivo, version: r.version, evidencias: [] });
          continue;
        }
        const efectivos = await rpcJson<Record<string, number | string | number[] | null>>("ugm_valores_efectivos", { p_respuesta: r.id });
        const archivosBytes: { nombre: string; bytes: Uint8Array }[] = [];
        const figuras: FiguraDoc[] = [];
        for (const e of deEsta) {
          const a = e.archivo_id ? archivos.get(e.archivo_id) : undefined;
          if (!a?.ruta_storage) continue;
          const bytes = new Uint8Array(await (await fetch(await enlaceDeArchivo(a.ruta_storage))).arrayBuffer());
          archivosBytes.push({ nombre: a.nombre, bytes });
          const dim = ["png", "jpg", "jpeg"].includes(extensionDe(a.nombre)) ? dimensionesImagen(bytes) : null;
          figuras.push(dim ? { figura: e.figura, pie: e.pie_en ?? "", bytes, tipo: dim.tipo, ancho: dim.ancho, alto: dim.alto } : { figura: e.figura, pie: e.pie_en ?? "", anexo: a.nombre });
        }
        let docx: Uint8Array | undefined;
        let nombreDocx: string | undefined;
        if (p.plantilla) {
          const calculoTexto = r.calculo?.texto ?? "";
          const out = await llenarPlantilla({
            encabezado: { universidad: cfg.universidad, pais: cfg.pais, web: cfg.web },
            categoria,
            pregunta: p,
            respuesta: r,
            valoresEfectivos: efectivos,
            calculoTexto,
            figuras,
            traduccionesPendientes: pend,
          });
          docx = out.bytes;
          nombreDocx = nombreArchivoPlantilla(p) ?? `${p.q}.docx`;
        }
        const valor = r.calculo?.valor ?? aNumero(efectivos.valor);
        datos.push({ q: p.q, indicador: p.indicador, nombre_en: p.nombre_en, valor: valor === null || valor === undefined ? "" : String(valor), unidad: p.unidad ?? "", opcion: r.opcion });
        items.push({ pregunta: p, categoria, lista: true, version: r.version, docx, nombreDocx, evidencias: archivosBytes });
      }
      setProgreso("Armando el paquete…");
      const raiz = nombrePaquete(cfg, u.ciclo.anio);
      const { bytes, manifiesto } = armarPaquete(raiz, items, datos);
      descargar(bytes, `${raiz}.zip`, ZIP);
      await u.hacer(
        async () => registrar.mutateAsync({ ciclo: u.ciclo.id, alcance, q: alcance === "indicador" ? q : undefined, categoria: alcance === "categoria" ? cat : undefined, hash: await huella(bytes), manifiesto: manifiesto as unknown as Record<string, unknown> }),
        manifiesto.incluidas.length ? `Paquete descargado con ${manifiesto.incluidas.length} indicadores.` : "El paquete salió vacío: ningún indicador está listo todavía.",
      );
      setResultado({ incluidas: manifiesto.incluidas.length, excluidas: manifiesto.excluidas });
    } catch (e) {
      u.avisar(e instanceof ErrorExportacion ? e.message : mensajeDe(e), "error");
    } finally {
      setProgreso("");
    }
  };

  const regenerar = async () => {
    try {
      const con = objetivos.filter((p) => p.plantilla);
      if (!con.length) throw new Error("Ninguna de las preguntas elegidas tiene plantilla propia.");
      const archivos: Record<string, Uint8Array> = {};
      let n = 0;
      for (const p of con) {
        n += 1;
        setProgreso(`Generando ${p.q} (${n} de ${con.length})…`);
        const categoria = u.categorias.find((c) => c.categoria === p.categoria)!;
        archivos[`${categoria.carpeta_nombre}/${nombreArchivoPlantilla(p)}`] = await generarPlantilla(p, categoria);
      }
      if (con.length === 1) descargar(Object.values(archivos)[0], nombreArchivoPlantilla(con[0]) ?? "plantilla.docx", DOCX);
      else descargar(zipSync(archivos), `Plantillas-UIGM-${u.ciclo.anio}.zip`, ZIP);
      u.avisar(`${con.length} ${con.length === 1 ? "plantilla generada" : "plantillas generadas"} con marcadores.`);
    } catch (e) {
      u.avisar(mensajeDe(e), "error");
    } finally {
      setProgreso("");
    }
  };

  return (
    <div className="ugm-pila">
      <section className="ugm-sec">
        <h2>Exportar o regenerar</h2>
        <p className="ugm-muted">El paquete lleva solo lo que está listo: aprobado, con la traducción revisada y la evidencia completa. Lo demás queda en el manifiesto con su motivo.</p>
        <div className="ugm-chips" role="group" aria-label="Alcance">
          {([["indicador", "Un indicador"], ["categoria", "Una categoría"], ["todo", "Todo el ciclo"]] as const).map(([k, et]) => (
            <button key={k} type="button" className="ugm-chip" aria-pressed={alcance === k} onClick={() => setAlcance(k)}>
              {et}
            </button>
          ))}
        </div>
        {alcance === "indicador" && (
          <Campo id="pl-q" etiqueta="Indicador">
            <select id="pl-q" className="ugm-input ugm-input--sel" value={q} onChange={(e) => setQ(e.target.value)}>
              {[...u.preguntas].sort((a, b) => compararQ(a.q, b.q)).map((p: PreguntaCiclo) => (
                <option key={p.q} value={p.q}>
                  {p.q} · {p.nombre_es.slice(0, 70)}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {alcance === "categoria" && (
          <Campo id="pl-cat" etiqueta="Categoría">
            <select id="pl-cat" className="ugm-input ugm-input--sel" value={cat} onChange={(e) => setCat(e.target.value as CategoriaId)}>
              {u.categorias.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {c.categoria} · {c.nombre_es}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <div className="ugm-acciones">
          <button type="button" className="ugm-btn ugm-btn--pri" disabled={!!progreso || objetivos.length === 0} onClick={() => void exportar()}>
            <Icon name="download" size={16} /> Exportar paquete (.zip)
          </button>
          <button type="button" className="ugm-btn" disabled={!!progreso || objetivos.length === 0} onClick={() => void regenerar()}>
            <Icon name="document" size={16} /> Regenerar plantillas con marcadores
          </button>
          <button type="button" className="ugm-btn" disabled={!!progreso} onClick={() => setImportar(true)}>
            <Icon name="upload" size={16} /> Importar una plantilla diligenciada
          </button>
        </div>
        {progreso && <p className="ugm-estado" role="status"><span className="ugm-spin" aria-hidden="true" />{progreso}</p>}
        {resultado && (
          <Alerta tipo={resultado.incluidas ? "ok" : "aviso"}>
            <strong>{resultado.incluidas} indicadores incluidos.</strong> {resultado.excluidas.length > 0 && `${resultado.excluidas.length} se quedaron fuera.`}
            {resultado.excluidas.length > 0 && (
              <details className="ugm-detalles">
                <summary>Ver por qué</summary>
                <ul className="ugm-faltan">
                  {resultado.excluidas.slice(0, 60).map((x) => (
                    <li key={x.q}>
                      {x.q}: {x.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Alerta>
        )}
        <p className="ugm-muted ugm-peq">Los PDF de más de 2 MB van como están: la guía pide máximo 2 MB y todavía no se comprimen al exportar; compleméntelos antes de enviarlos a UI GreenMetric.</p>
      </section>

      <section className="ugm-sec">
        <h2>Exportaciones anteriores</h2>
        {exportaciones.isLoading ? <Cargando /> : (exportaciones.data ?? []).length === 0 ? <Vacio>Todavía no se ha exportado nada.</Vacio> : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Alcance</th><th scope="col">Quién</th><th scope="col" className="ugm-der">Incluidos</th></tr></thead>
              <tbody>
                {exportaciones.data!.map((x) => (
                  <tr key={x.id}>
                    <td data-et="Fecha">{fechaCorta(x.created_at)}</td>
                    <td data-et="Alcance">{x.alcance === "todo" ? "Todo el ciclo" : x.alcance === "categoria" ? `Categoría ${x.categoria}` : `Indicador ${x.q}`}</td>
                    <td data-et="Quién">{u.nombre(x.generado_por)}</td>
                    <td data-et="Incluidos" className="ugm-der ugm-num">{Array.isArray((x.manifiesto as { incluidas?: unknown[] }).incluidas) ? (x.manifiesto as { incluidas: unknown[] }).incluidas.length : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2>Importaciones</h2>
        {importaciones.isLoading ? <Cargando /> : (importaciones.data ?? []).length === 0 ? <Vacio>Todavía no se importó ninguna plantilla.</Vacio> : (
          <div className="ugm-tabla-marco">
            <table className="ugm-tabla ugm-tabla--lista">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Archivo</th><th scope="col">Indicador</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {importaciones.data!.map((x) => (
                  <tr key={x.id}>
                    <td data-et="Fecha">{fechaCorta(x.created_at)}</td>
                    <td data-et="Archivo" className="ugm-romper">{x.archivo}</td>
                    <td data-et="Indicador">{x.q_detectada ?? "—"}</td>
                    <td data-et="Estado">{x.estado === "aplicado" ? "Aplicada" : x.estado === "descartado" ? "Descartada" : "Sin cerrar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {importar && <Importar onCerrar={() => setImportar(false)} />}
    </div>
  );
}

function recortar(s: string, n = 160) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function Importar({ onCerrar }: { onCerrar: () => void }) {
  const u = useUgm();
  const registrar = useRegistrarImportacion();
  const cerrar = useCerrarImportacion();
  const guardar = useGuardarCaptura();
  const guardarTrad = useGuardarTraducciones();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [informe, setInforme] = useState<InformeImportacion | null>(null);
  const [importacion, setImportacion] = useState("");
  const [aceptados, setAceptados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  const leer = async (f: File) => {
    setError("");
    setInforme(null);
    if (f.size > DOCX_MAX_BYTES) return setError("El archivo pesa más de 15 MB.");
    setOcupado(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const preguntaDe = (qq: string) => u.pregQ.get(qq);
      const previo = leerPlantillaDiligenciada(bytes, { nombreArchivo: f.name, preguntaDe });
      const actual = u.porQ.get(previo.q);
      if (!actual) throw new ErrorImportacion(`El indicador ${previo.q} no tiene respuesta en este ciclo.`);
      const inf = leerPlantillaDiligenciada(bytes, { nombreArchivo: f.name, preguntaDe, actual });
      const id = await registrar.mutateAsync({ ciclo: u.ciclo.id, archivo: f.name, hash: await huella(bytes), q: inf.q, resultado: { items: inf.items.map((i) => ({ clave: i.clave, estado: i.estado })), advertencias: inf.advertencias, imagenes: inf.imagenes.length } });
      setImportacion(id);
      setInforme(inf);
      setAceptados(new Set(inf.items.filter((i) => i.estado === "nuevo").map((i) => i.clave)));
    } catch (e) {
      setError(e instanceof ErrorImportacion ? e.message : mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async () => {
    if (!informe) return;
    const r = u.porQ.get(informe.q)!;
    const p = u.pregQ.get(informe.q)!;
    const ok = await u.hacer(async () => {
      const { captura, traducciones } = construirCaptura(informe, [...aceptados], p, r);
      await guardar.mutateAsync({ ciclo: u.ciclo.id, id: r.id, captura });
      if (traducciones.length) await guardarTrad.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, items: traducciones });
      await cerrar.mutateAsync({ ciclo: u.ciclo.id, importacion, aplicada: true });
    }, `Se aplicaron ${aceptados.size} elementos a ${informe.q}. Revise la traducción antes de enviar.`);
    if (ok) onCerrar();
  };
  const descartar = async () => {
    if (importacion) await u.hacer(() => cerrar.mutateAsync({ ciclo: u.ciclo.id, importacion, aplicada: false }));
    onCerrar();
  };

  return (
    <Dialogo titulo="Importar una plantilla diligenciada" descripcion="Un Word en inglés, de la plantilla de una pregunta. Usted decide qué elementos entran." onCerrar={() => void descartar()} ancho={760}>
      <div className="ugm-form">
        <input ref={entrada} type="file" accept=".docx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }} />
        {!informe && (
          <button type="button" className="ugm-btn ugm-btn--pri" disabled={ocupado} onClick={() => entrada.current?.click()}>
            <Icon name="upload" size={16} /> {ocupado ? "Leyendo…" : "Elegir el archivo .docx"}
          </button>
        )}
        {error && <Alerta tipo="error">{error}</Alerta>}
        {informe && (
          <>
            <p>
              Indicador <b>{informe.q}</b> · {u.pregQ.get(informe.q)?.nombre_es} <span className="ugm-muted">(reconocido por {informe.origenQ === "titulo" ? "el título" : "el nombre del archivo"})</span>
            </p>
            {informe.advertencias.map((a) => (
              <Alerta key={a} tipo="aviso">{a}</Alerta>
            ))}
            <div className="ugm-tabla-marco">
              <table className="ugm-tabla ugm-tabla--lista">
                <thead>
                  <tr>
                    <th scope="col"><span className="ugm-sr">Aplicar</span></th>
                    <th scope="col">Elemento</th>
                    <th scope="col">Hoy</th>
                    <th scope="col">En el Word</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.items.map((i) => (
                    <tr key={i.clave}>
                      <td className="ugm-chk">
                        <input
                          type="checkbox"
                          aria-label={`Aplicar ${i.etiqueta}`}
                          disabled={i.estado === "igual"}
                          checked={aceptados.has(i.clave)}
                          onChange={() => setAceptados((s) => { const n = new Set(s); if (n.has(i.clave)) n.delete(i.clave); else n.add(i.clave); return n; })}
                        />
                      </td>
                      <th scope="row" data-et="Elemento">{i.etiqueta}</th>
                      <td data-et="Hoy" className="ugm-diff ugm-diff--antes">{i.actual ? recortar(i.actual) : "—"}</td>
                      <td data-et="En el Word" className="ugm-diff ugm-diff--despues">{recortar(i.importado)}</td>
                      <td data-et="Estado"><span className={`ugm-etq ${i.estado === "conflicto" ? "ugm-etq--aviso" : i.estado === "nuevo" ? "ugm-etq--ok" : ""}`}>{i.estado === "igual" ? "Igual" : i.estado === "nuevo" ? "Nuevo" : "Cambia lo que hay"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {informe.imagenes.length > 0 && <Alerta>El Word trae {informe.imagenes.length} {informe.imagenes.length === 1 ? "imagen" : "imágenes"}. No se cargan solas: súbalas como evidencias (los pies leídos son {informe.pies.length}).</Alerta>}
            {informe.descartados.length > 0 && <p className="ugm-muted ugm-peq">Se descartaron {informe.descartados.length} textos de ejemplo de la plantilla oficial.</p>}
            <footer className="ugm-dlg__pie">
              <button type="button" className="ugm-btn" onClick={() => void descartar()}>
                Descartar
              </button>
              <button type="button" className="ugm-btn ugm-btn--pri" disabled={aceptados.size === 0 || guardar.isPending} onClick={() => void aplicar()}>
                Aplicar {aceptados.size} {aceptados.size === 1 ? "elemento" : "elementos"}
              </button>
            </footer>
          </>
        )}
      </div>
    </Dialogo>
  );
}
