/* Formulario de una oficina: sus indicadores, una ficha por indicador. */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, ChangeEvent } from "react";
import type { RankingCycleRow, RankingResponseRow } from "../../../../types/database";
import { camposDeDato, catalogoOrdenado, coincide, conteoAportes, indicadoresDeUnidad, otrosAportes, respuestaDe } from "../resumen";
import { analizarEvidencia, FORMATOS_EVIDENCIA } from "../analisis-evidencia";
import type { ResultadoAnalisis } from "../analisis-evidencia";
import { contarComentario, errorComentario, normalizarComentario } from "../comentario";
import { aportePuntosOds, estimarPuntos } from "../puntos";
import { motivosNoEnviar, nombreRol, relevanciaDe } from "../envio";
import type { DatosEnvio } from "../envio";
import { bloqueadaParaOficina, ETIQUETA_ESTADO, puedeEditar, transicionPermitida } from "../estados";
import { traducir, TraduccionNoDisponible } from "../traducir";
import {
  esEvidenciaReal,
  useAprobarDirecto,
  useAgregarEnlace,
  useAsegurarRespuesta,
  useEnviarRespuesta,
  useEvidenciasReporte,
  useGuardarRespuesta,
  useQuitarEvidencia,
  useSubirEvidencia,
} from "../datos";
import type { EvidenciaReporte } from "../datos";
import { DeLaBiblioteca } from "./DeLaBiblioteca";
import type { AporteRef, Asignacion, Chequeo, Indicador, RolActor, RolAsignacion, TipoIndicador } from "../tipos";
import { Chequeos, EstadoPill, Cargando, OdsChip, fmtNumero } from "./comunes";
import { useCrecer, useEntrada, useIndicador, usePliegue } from "../../movimiento";

export interface OficinaRef {
  id: string;
  nombre: string;
}

interface Props {
  ciclo: RankingCycleRow;
  oficina: OficinaRef;
  actor: RolActor | null;
  indicadores: Indicador[];
  asignaciones: Asignacion[];
  respuestas: RankingResponseRow[];
  /** Quién aportó a cada indicador, de cualquier oficina, sin contenido (RPC ranking_aportes, 0150). */
  aportes?: AporteRef[];
  /** Indicador que se abre primero (p. ej. desde la mesa de coordinación). */
  indicadorInicial?: string | null;
}

const ETIQUETA_TIPO: Record<TipoIndicador, string> = { ev: "Evidencia", doc: "Documento", dato: "Dato", inv: "Investigación" };
const ACEPTA = FORMATOS_EVIDENCIA.map((e) => `.${e}`).join(",");

type Lista = "sugeridos" | "todos";

/**
 * Formulario de la oficina. Primero sus indicadores sugeridos; con «Todo el catálogo»,
 * los 17 ODS (los priorizados al frente). Cualquier indicador se puede responder: la
 * asignación solo sugiere.
 */
export function FormularioOficina({ ciclo, oficina, actor, indicadores, asignaciones, respuestas, aportes = [], indicadorInicial = null }: Props) {
  const sugeridos = useMemo(() => indicadoresDeUnidad(oficina.id, indicadores, asignaciones), [oficina.id, indicadores, asignaciones]);
  const catalogo = useMemo(() => catalogoOrdenado(indicadores, ciclo.ods_priorizados), [indicadores, ciclo.ods_priorizados]);
  const rolDe = useMemo(() => new Map(sugeridos.map((s) => [s.indicador.id, s.rol])), [sugeridos]);
  const conteo = useMemo(() => conteoAportes(aportes, oficina.id), [aportes, oficina.id]);
  const inicialEnSugeridos = !indicadorInicial || sugeridos.some((x) => x.indicador.id === indicadorInicial);
  const [lista, setLista] = useState<Lista>(sugeridos.length > 0 && inicialEnSugeridos ? "sugeridos" : "todos");
  const [busqueda, setBusqueda] = useState("");
  const [plegada, setPlegada] = useState(false);
  const [sel, setSel] = useState<string | null>(indicadorInicial);
  const asegurar = useAsegurarRespuesta();
  const dos = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  usePliegue(dos, plegada);
  useIndicador(seg, "[aria-pressed='true']", `${lista}-${plegada}`, true);

  const visibles = useMemo(
    () => (lista === "sugeridos" ? sugeridos.map((s) => s.indicador) : catalogo).filter((i) => coincide(i, busqueda)),
    [lista, sugeridos, catalogo, busqueda],
  );
  const actualId = visibles.some((i) => i.id === sel) ? sel : (visibles[0]?.id ?? null);
  const actual = indicadores.find((i) => i.id === actualId) ?? null;
  const respuesta = actual ? (respuestaDe(respuestas, actual.id, oficina.id) as RankingResponseRow | undefined) : undefined;

  // Abrir un indicador crea su respuesta «Sin empezar» si aún no existe (sugerido o no).
  useEffect(() => {
    if (actualId && !respuesta && !asegurar.isPending) {
      asegurar.mutate({ ciclo: ciclo.id, indicador: actualId, unidad: oficina.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia con el indicador o con su respuesta
  }, [actualId, respuesta?.id]);

  if (catalogo.length === 0) {
    return <p className="rk-rep-vacio">El catálogo de THE todavía no tiene indicadores. Planeación lo importa desde «Importar Excel».</p>;
  }

  const propias = respuestas.filter((r) => r.unidad === oficina.id && r.estado !== "none");
  const enviadas = propias.filter((r) => r.estado === "sent" || r.estado === "ok").length;

  const filas: ({ tipo: "grupo"; ods: number; pri: boolean } | { tipo: "item"; indicador: Indicador })[] = [];
  let odsAnterior: number | null = null;
  for (const i of visibles) {
    if (i.ods !== odsAnterior) {
      filas.push({ tipo: "grupo", ods: i.ods, pri: ciclo.ods_priorizados.includes(i.ods) });
      odsAnterior = i.ods;
    }
    filas.push({ tipo: "item", indicador: i });
  }

  return (
    <div className="rk-rep-form">
      <div className="rk-rep-form-barra">
        <button type="button" className="rk-rep-btn is-sm is-ghost" aria-expanded={!plegada} aria-controls={`${oficina.id}-lista`} onClick={() => setPlegada((p) => !p)}>
          {plegada ? "Mostrar la lista de indicadores" : "Ocultar la lista"}
        </button>
        <p className="rk-rep-small rk-rep-muted" aria-live="polite">
          {oficina.nombre}: <b className="rk-rep-num">{propias.length}</b> {propias.length === 1 ? "indicador con respuesta" : "indicadores con respuesta"} ·{" "}
          <b className="rk-rep-num">{enviadas}</b> {enviadas === 1 ? "enviado" : "enviados"} a Planeación
        </p>
      </div>
    <div className={`rk-rep-dos ${plegada ? "is-plegada" : ""}`} ref={dos}>
      <div className="rk-rep-col-nav" hidden={plegada}>
          <nav id={`${oficina.id}-lista`} className="rk-rep-inav" aria-label="Indicadores de la oficina">
            <div className="rk-seg" role="group" aria-label="Qué indicadores mostrar" ref={seg}>
              <span data-indicador aria-hidden="true" />
              <button type="button" aria-pressed={lista === "sugeridos"} onClick={() => setLista("sugeridos")}>
                {`Sugeridos para su oficina (${sugeridos.length})`}
              </button>
              <button type="button" aria-pressed={lista === "todos"} onClick={() => setLista("todos")}>
                {`Todo el catálogo (${catalogo.length})`}
              </button>
            </div>
            <label className="rk-rep-sr" htmlFor={`${oficina.id}-buscar`}>
              Buscar indicador
            </label>
            <input
              id={`${oficina.id}-buscar`}
              type="search"
              className="rk-rep-input"
              placeholder="Buscar por texto o número, p. ej. 5.6.3"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {visibles.length === 0 && (
              <p className="rk-rep-small rk-rep-muted">
                {lista === "sugeridos" && !busqueda
                  ? "Esta oficina no tiene indicadores sugeridos. Puede aportar desde «Todo el catálogo»."
                  : `Ningún indicador coincide con «${busqueda}».`}
              </p>
            )}
            <ul className="rk-rep-lista-nav">
              {filas.map((f) =>
                f.tipo === "grupo" ? (
                  <li key={`g-${f.ods}`} role="presentation" className="rk-rep-grupo">
                    <OdsChip ods={f.ods} /> <span>{f.pri ? "Priorizado" : "Catálogo"}</span>
                  </li>
                ) : (
                  <li key={f.indicador.id}>
                    <ItemNav
                      indicador={f.indicador}
                      activo={f.indicador.id === actualId}
                      sugerido={rolDe.get(f.indicador.id) ?? null}
                      propia={respuestaDe(respuestas, f.indicador.id, oficina.id) as RankingResponseRow | undefined}
                      otras={conteo.get(f.indicador.id) ?? 0}
                      onElegir={() => setSel(f.indicador.id)}
                    />
                  </li>
                ),
              )}
            </ul>
          </nav>
      </div>

      <div className="rk-rep-ficha-col">
        {actual && respuesta ? (
          <FichaIndicador
            key={actual.id}
            ciclo={ciclo}
            oficina={oficina}
            actor={actor}
            indicador={actual}
            rol={rolDe.get(actual.id) ?? null}
            campos={camposDeDato(actual.id, indicadores)}
            respuesta={respuesta}
            aportes={otrosAportes(actual.id, aportes, oficina.id)}
          />
        ) : (
          <Cargando texto="Preparando la ficha del indicador…" />
        )}
      </div>
    </div>
    </div>
  );
}

function ItemNav({
  indicador,
  activo,
  sugerido,
  propia,
  otras,
  onElegir,
}: {
  indicador: Indicador;
  activo: boolean;
  sugerido: "principal" | "apoyo" | null;
  propia: RankingResponseRow | undefined;
  otras: number;
  onElegir: () => void;
}) {
  return (
    <button type="button" aria-current={activo ? "true" : undefined} onClick={onElegir} className="rk-rep-inav-item">
      <span className="rk-rep-code">{indicador.id}</span>
      <span className="rk-rep-corta">{indicador.texto_es || indicador.texto_en}</span>
      <span className="rk-rep-inav-meta">
        {propia ? <EstadoPill estado={propia.estado} /> : <span className="rk-rep-muted">Sin empezar</span>}
        {sugerido && <span className="rk-rep-pill is-blue">Sugerido</span>}
        {otras > 0 && (
          <span className="rk-rep-muted rk-rep-num">
            {otras} {otras === 1 ? "oficina aportó" : "oficinas aportaron"}
          </span>
        )}
      </span>
    </button>
  );
}

interface FichaProps {
  ciclo: RankingCycleRow;
  oficina: OficinaRef;
  actor: RolActor | null;
  indicador: Indicador;
  /** Papel sugerido para esta oficina; nulo si el indicador viene del catálogo (aporte libre). */
  rol: RolAsignacion | null;
  campos: Indicador[];
  respuesta: RankingResponseRow;
  /** Las demás oficinas que aportaron a este indicador (sin su contenido). */
  aportes: AporteRef[];
}

const TEXTO_ROL: Record<RolAsignacion | "libre", string> = {
  principal: "Responsable sugerido",
  apoyo: "Apoyo sugerido",
  libre: "Aporte desde el catálogo",
};

interface Aviso {
  tipo: "ok" | "risk" | "warn";
  texto: string;
}

function aNumero(texto: string): number | null | "NaN" {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "NaN";
}

function FichaIndicador({ ciclo, oficina, actor, indicador, rol, campos, respuesta, aportes }: FichaProps) {
  const uid = useId();
  const esDato = indicador.tipo === "dato";
  const esInv = indicador.tipo === "inv";
  // Un dato sin campos cargados se mide con una sola cifra, la del propio indicador.
  const camposDato = esDato ? (campos.length > 0 ? campos : [{ ...indicador, id: indicador.id, texto_es: "Cifra" }]) : [];

  const [cifras, setCifras] = useState<Record<string, string>>(() =>
    Object.fromEntries(camposDato.map((c) => [c.id, respuesta.valores[c.id] === null || respuesta.valores[c.id] === undefined ? "" : String(respuesta.valores[c.id])])),
  );
  const [siNo, setSiNo] = useState<boolean | null>(respuesta.si_no);
  const [comentario, setComentario] = useState(respuesta.comentario_es);
  const [en, setEn] = useState(respuesta.comentario_en);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [rechazados, setRechazados] = useState<{ nombre: string; chequeos: Chequeo[] }[]>([]);
  const [enlace, setEnlace] = useState("");
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(0);
  const [traduciendo, setTraduciendo] = useState(false);
  const [guardadoA, setGuardadoA] = useState<string | null>(null);
  const archivos = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const ficha = useRef<HTMLElement>(null);
  const listaEv = useRef<HTMLUListElement>(null);

  const evidencias = useEvidenciasReporte(respuesta.id);
  const subir = useSubirEvidencia();
  const enlazar = useAgregarEnlace();
  const quitar = useQuitarEvidencia();
  const guardar = useGuardarRespuesta();
  const enviar = useEnviarRespuesta();
  const aprobar = useAprobarDirecto();
  const evs: EvidenciaReporte[] = useMemo(() => {
    const todas = (evidencias.data ?? []).filter(esEvidenciaReal);
    // La pública primero, luego el orden de llegada.
    return [...todas].sort((a, b) => Number(b.publica) - Number(a.publica));
  }, [evidencias.data]);
  // Notas que trajo el Excel de THE: recuerdan lo que falta, no cuentan como evidencia.
  const notas = useMemo(() => (evidencias.data ?? []).filter((e) => !esEvidenciaReal(e)), [evidencias.data]);
  const esPlaneacion = actor === "planeacion";

  const medidor = useRef<HTMLUListElement>(null);
  useEntrada(ficha, ".rk-rep-anim", indicador.id);
  useEntrada(listaEv, ".rk-rep-ev", evs.length);

  // Planeación corrige también lo enviado o aprobado; la oficina, solo lo abierto.
  const editable = esPlaneacion || (puedeEditar(respuesta.estado, actor) && !bloqueadaParaOficina(respuesta.estado));
  const otras = evs.map((e) => ({ nombre: e.nombre, url: e.url ?? undefined }));
  const numeros = Object.fromEntries(camposDato.map((c) => {
    const v = aNumero(cifras[c.id] ?? "");
    return [c.id, v === "NaN" ? null : v];
  })) as Record<string, number | null>;
  const cifraInvalida = camposDato.some((c) => aNumero(cifras[c.id] ?? "") === "NaN");
  const cuenta = contarComentario(comentario);
  const riesgos = rechazados.length;
  const traduccionAlDia = en.trim() !== "";

  const datos: DatosEnvio = {
    tipo: indicador.tipo ?? "ev",
    siNo,
    valores: numeros,
    campos: camposDato.map((c) => c.id),
    evidencias: evs.length,
    riesgos,
    comentario,
    traduccionAlDia,
    estado: respuesta.estado,
    actor,
  };
  const motivos = motivosNoEnviar(datos);
  // Lo que le falta para que Planeación la apruebe directamente (las mismas reglas que enviar).
  const motivosAprobar = esPlaneacion && respuesta.estado !== "ok" ? motivosNoEnviar({ ...datos, estado: "draft" }) : [];

  const estimacion = !esDato && !esInv
    ? estimarPuntos({
        tipo: indicador.tipo ?? "ev",
        si_no: siNo,
        tieneCifra: false,
        evidencias: evs.map((e) => ({ id: e.id, publica: e.publica, relevancia: relevanciaDe(e.analisis) })),
      })
    : null;
  const aporte = estimacion ? aportePuntosOds(indicador.peso, estimacion.fraccion) : 0;
  useCrecer(medidor, ".rk-rep-barra > i", { clave: estimacion?.total ?? null });

  // Dato: siempre hay evidencias. Ev/doc: solo si la universidad lo tiene. Inv: nunca se sube nada.
  const mostrarEvidenciasSeccion = !esInv && (esDato || siNo === true);
  const mostrarComentario = esDato || siNo !== null || esInv;

  /** Guarda lo que hay en pantalla. Lo usan el botón y las evidencias (una evidencia cambia la respuesta a borrador). */
  async function persistir(): Promise<RankingResponseRow> {
    const fila = await guardar.mutateAsync({
      respuesta,
      valores: esDato ? numeros : {},
      siNo: esDato || esInv ? null : siNo,
      comentarioEs: normalizarComentario(comentario),
      comentarioEn: en,
      actor,
    });
    setGuardadoA(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
    return fila;
  }

  async function guardarBorrador() {
    setAviso(null);
    if (cifraInvalida) return setAviso({ tipo: "risk", texto: "Las cifras deben ser números, sin letras." });
    const err = errorComentario(comentario);
    if (err) return setAviso({ tipo: "risk", texto: err });
    try {
      await persistir();
      setAviso({ tipo: "ok", texto: "Borrador guardado. Puede seguir más tarde." });
    } catch (e) {
      setAviso({ tipo: "risk", texto: e instanceof Error ? e.message : "No se pudo guardar el borrador." });
    }
  }

  async function enviarAPlaneacion() {
    setAviso(null);
    if (motivos.length > 0) return setAviso({ tipo: "risk", texto: `Antes de enviar: ${motivos.join(" ")}` });
    try {
      const fila = await persistir();
      await enviar.mutateAsync({ respuesta: fila, actor });
      setAviso({ tipo: "ok", texto: "Enviada a Planeación. Puede seguir con el siguiente indicador; Planeación la revisa aquí mismo." });
    } catch (e) {
      setAviso({ tipo: "risk", texto: e instanceof Error ? e.message : "No se pudo enviar la respuesta." });
    }
  }

  async function aprobarDirecto() {
    setAviso(null);
    if (motivosAprobar.length > 0) return setAviso({ tipo: "risk", texto: `Antes de aprobar: ${motivosAprobar.join(" ")}` });
    try {
      const fila = await persistir();
      await aprobar.mutateAsync({ respuesta: fila, actor });
      setAviso({ tipo: "ok", texto: `Aprobada a nombre de ${oficina.nombre}. Cuenta en el avance; márquela como oficial en la mesa si hay otras aprobadas.` });
    } catch (e) {
      setAviso({ tipo: "risk", texto: e instanceof Error ? e.message : "No se pudo aprobar." });
    }
  }

  /** Tras una evidencia, la respuesta sale de «Sin empezar» si todavía no tenía borrador. */
  async function tocarBorrador() {
    if (respuesta.estado === "none" || respuesta.estado === "back") {
      try {
        await persistir();
      } catch {
        /* La evidencia ya quedó guardada; el borrador se completa al guardar. */
      }
    }
  }

  async function subirArchivos(lista: File[]) {
    const vistos = [...otras];
    for (const f of lista) {
      const r: ResultadoAnalisis = analizarEvidencia({ kind: "file", nombre: f.name, tamano: f.size }, vistos);
      if (r.nivel === "risk") {
        setRechazados((prev) => [...prev, { nombre: f.name, chequeos: r.chequeos }]);
        continue;
      }
      vistos.push({ nombre: f.name, url: undefined });
      setSubiendo((n) => n + 1);
      try {
        await subir.mutateAsync({
          respuesta,
          archivo: f,
          analisis: r.chequeos.map(({ nivel, texto }) => ({ nivel, texto })),
        });
      } catch (e) {
        setAviso({ tipo: "risk", texto: e instanceof Error ? e.message : `No se pudo subir «${f.name}».` });
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
    if (lista.length > 0) await tocarBorrador();
  }

  function alElegirArchivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = "";
    void subirArchivos(lista);
  }

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    void subirArchivos(Array.from(e.dataTransfer.files));
  }

  async function agregarEnlace() {
    setErrorEnlace(null);
    const url = enlace.trim();
    if (!/^https:\/\/[^\s.]+\.\S+$/i.test(url)) {
      setErrorEnlace("Escriba un enlace completo que empiece por https://.");
      return;
    }
    const r = analizarEvidencia({ kind: "url", url }, otras);
    const riesgo = r.chequeos.find((c) => c.nivel === "risk");
    if (riesgo) {
      setErrorEnlace(riesgo.texto);
      return;
    }
    try {
      await enlazar.mutateAsync({ respuesta, url, analisis: r.chequeos.map(({ nivel, texto }) => ({ nivel, texto })) });
      setEnlace("");
      await tocarBorrador();
    } catch (e) {
      setErrorEnlace(e instanceof Error ? e.message : "No se pudo agregar el enlace.");
    }
  }

  async function traducirComentario() {
    setTraduciendo(true);
    try {
      setEn(await traducir(comentario));
    } catch (e) {
      setAviso({ tipo: e instanceof TraduccionNoDisponible ? "warn" : "risk", texto: e instanceof Error && e.message ? e.message : "No se pudo traducir el comentario." });
    } finally {
      setTraduciendo(false);
    }
  }

  const devuelta = respuesta.estado === "back";
  const titulo = indicador.texto_es || indicador.texto_en;
  const pide = indicador.tipo_requerimiento || indicador.texto_en;

  return (
    <article className="rk-rep-card rk-rep-ficha" ref={ficha} aria-labelledby={`${uid}-t`}>
      <header className="rk-rep-anim">
        <div className="rk-rep-split">
          <div>
            <h2 id={`${uid}-t`} className="rk-rep-h2">
              {titulo}
            </h2>
            <p className="rk-rep-meta">
              <span className="rk-rep-code">{indicador.id}</span> · ODS {indicador.ods} · {ETIQUETA_TIPO[indicador.tipo ?? "ev"]} · {TEXTO_ROL[rol ?? "libre"]}
            </p>
          </div>
          <EstadoPill estado={respuesta.estado} />
        </div>
      </header>

      {devuelta && (
        <div className="rk-rep-note rk-rep-anim" role="status">
          <b>Devuelta por Planeación.</b> {respuesta.nota_revision || "Revise la ficha y vuelva a enviarla."}
        </div>
      )}
      {respuesta.estado === "sent" && (
        <p className="rk-rep-note is-info rk-rep-anim" role="status">
          {esPlaneacion ? "Enviada a Planeación. Como Planeación, puede corregirla y aprobarla aquí mismo." : "Enviada a Planeación. Solo Planeación puede cambiarla ahora."}
        </p>
      )}
      {respuesta.estado === "ok" && (
        <p className="rk-rep-note is-ok rk-rep-anim" role="status">
          {esPlaneacion ? "Aprobada. Como Planeación, puede corregirla: los cambios se guardan sin cambiarle el estado." : "Aprobada por Planeación."}
        </p>
      )}

      <div className="rk-rep-note rk-rep-anim">
        <b>Qué pide THE.</b> {pide || "Sin texto de requerimiento en el catálogo."}
      </div>

      <div className="rk-rep-yaaportaron rk-rep-anim">
        {aportes.length === 0 ? (
          <p className="rk-rep-small rk-rep-muted">Ninguna otra oficina ha aportado a este indicador. Su respuesta puede ser la primera.</p>
        ) : (
          <>
            <p className="rk-rep-small">
              <b>Ya aportaron {aportes.length === 1 ? "1 oficina" : `${aportes.length} oficinas`}</b>
              <span className="rk-rep-muted"> · cada una diligencia su propia respuesta; Planeación elige la oficial.</span>
            </p>
            <ul className="rk-rep-chips" aria-label="Oficinas que ya aportaron">
              {aportes.map((a) => (
                <li key={a.unidad} className="rk-rep-aporte-chip" data-estado={a.estado}>
                  <span className="rk-rep-corta">{a.unidad_nombre}</span>
                  <span className="rk-rep-muted">· {ETIQUETA_ESTADO[a.estado].toLowerCase()}</span>
                  {a.oficial && <span className="rk-rep-pill is-ok">Oficial</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!editable && respuesta.estado !== "sent" && respuesta.estado !== "ok" && (
        <p className="rk-rep-small rk-rep-muted">Solo lectura: su función en la oficina permite consultar, no diligenciar.</p>
      )}

      <fieldset className="rk-rep-fieldset" disabled={!editable}>
        <legend className="rk-rep-sr">Respuesta de la oficina</legend>

        {esDato && (
          <div className="rk-rep-grid-2 rk-rep-anim">
            {camposDato.map((c) => (
              <div className="rk-rep-field" key={c.id}>
                <label className="rk-rep-lbl" htmlFor={`${uid}-c-${c.id}`}>
                  {c.texto_es || c.texto_en || "Cifra"}
                </label>
                <input
                  id={`${uid}-c-${c.id}`}
                  className="rk-rep-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="Número"
                  value={cifras[c.id] ?? ""}
                  onChange={(e) => setCifras({ ...cifras, [c.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {!esDato && !esInv && (
          <div className="rk-rep-field rk-rep-anim">
            <span className="rk-rep-lbl" id={`${uid}-yn`}>
              ¿La universidad lo tiene o lo hace?
            </span>
            <div className="rk-rep-yn" role="group" aria-labelledby={`${uid}-yn`}>
              <button type="button" aria-pressed={siNo === true} onClick={() => setSiNo(true)}>
                Sí
              </button>
              <button type="button" aria-pressed={siNo === false} onClick={() => setSiNo(false)}>
                No
              </button>
            </div>
          </div>
        )}

        {esInv && (
          <p className="rk-rep-note is-info rk-rep-anim">THE calcula este indicador con Scopus: no se sube ninguna evidencia.</p>
        )}

        {mostrarEvidenciasSeccion && !esInv && (
          <section className="rk-rep-evidencias rk-rep-anim" aria-labelledby={`${uid}-ev`}>
            <h3 id={`${uid}-ev`} className="rk-rep-h3">
              Evidencias
            </h3>
            <p className="rk-rep-small rk-rep-muted">Puede subir varias. La pública va primero y vale más. Pilo revisa cada una antes de guardarla.</p>

            <div
              className={`rk-rep-drop ${arrastrando ? "is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={alSoltar}
            >
              <svg className="rk-rep-drop-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
              </svg>
              <p className="rk-rep-drop-t">
                <b>{arrastrando ? "Suelte los archivos para subirlos" : "Arrastre aquí los archivos de evidencia"}</b>
              </p>
              <p className="rk-rep-small rk-rep-muted">PDF, Word, Excel, PowerPoint o imagen · hasta 15 MB cada uno</p>
              <button type="button" className="rk-rep-btn is-sm" onClick={() => archivos.current?.click()}>
                Elegir archivos
              </button>
              <input
                ref={archivos}
                type="file"
                multiple
                hidden
                accept={ACEPTA}
                onChange={alElegirArchivos}
                aria-label="Elija archivos de evidencia"
              />
            </div>

            <div className="rk-rep-row">
              <label className="rk-rep-sr" htmlFor={`${uid}-url`}>
                Enlace público a la evidencia
              </label>
              <input
                id={`${uid}-url`}
                className="rk-rep-input rk-rep-grow"
                type="url"
                placeholder="https://… enlace público a la evidencia"
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void agregarEnlace();
                }}
                aria-invalid={errorEnlace ? true : undefined}
              />
              <button type="button" className="rk-rep-btn" onClick={() => void agregarEnlace()} disabled={!enlace.trim()}>
                Agregar enlace
              </button>
            </div>
            {errorEnlace && (
              <p className="rk-rep-aviso-linea is-risk" role="alert">
                {errorEnlace}
              </p>
            )}

            {esPlaneacion && editable && (
              <DeLaBiblioteca
                ciclo={ciclo.id}
                indicador={indicador.id}
                unidad={oficina.id}
                yaLigados={(evidencias.data ?? []).map((e) => e.biblioteca).filter((x): x is string => Boolean(x))}
                onLigado={() => void tocarBorrador()}
              />
            )}

            {subiendo > 0 && (
              <p className="rk-rep-small rk-rep-muted" role="status">
                <span className="rk-rep-spin" aria-hidden="true" /> Subiendo {subiendo} {subiendo === 1 ? "archivo" : "archivos"}…
              </p>
            )}

            {rechazados.map((r, i) => (
              <div className="rk-rep-ev is-rechazado" key={`${r.nombre}-${i}`}>
                <div className="rk-rep-ev-cuerpo">
                  <b className="rk-rep-wrap">{r.nombre}</b>
                  <span className="rk-rep-pill is-risk">No se guardó: tiene riesgos</span>
                  <Chequeos items={r.chequeos} />
                  <p className="rk-rep-small">
                    Corrija el archivo o quite este aviso. Formatos admitidos: {FORMATOS_EVIDENCIA.join(", ")}.
                  </p>
                </div>
                <button type="button" className="rk-rep-btn is-sm" onClick={() => setRechazados((prev) => prev.filter((_, j) => j !== i))}>
                  Quitar aviso
                </button>
              </div>
            ))}

            {notas.length > 0 && (
              <ul className="rk-rep-lista-ev" aria-label="Notas del Excel de THE">
                {notas.map((n) => (
                  <li className="rk-rep-ev" key={n.id}>
                    <div className="rk-rep-ev-cuerpo">
                      <div className="rk-rep-row">
                        <span className="rk-rep-pill is-warn">Nota del Excel · no cuenta como evidencia</span>
                      </div>
                      <p className="rk-rep-small rk-rep-wrap">{n.nombre}</p>
                    </div>
                    {editable && (
                      <button type="button" className="rk-rep-btn is-sm" disabled={quitar.isPending} aria-label="Quitar la nota" onClick={() => quitar.mutate({ evidencia: n })}>
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {evs.length === 0 ? (
              <p className="rk-rep-small rk-rep-muted">Aún no hay evidencias. Suba un archivo o pegue un enlace público.</p>
            ) : (
              <ul className="rk-rep-lista-ev" ref={listaEv}>
                {evs.map((ev, i) => (
                  <li className={`rk-rep-ev ${ev.publica ? "is-publica" : ""}`} key={ev.id}>
                    <div className="rk-rep-ev-cuerpo">
                      <div className="rk-rep-row">
                        {ev.kind === "url" && ev.url ? (
                          <a className="rk-rep-wrap rk-rep-link" href={ev.url} target="_blank" rel="noopener noreferrer">
                            {ev.url}
                          </a>
                        ) : (
                          <b className="rk-rep-wrap">{ev.nombre}</b>
                        )}
                        {ev.biblioteca && <span className="rk-rep-pill is-blue">De la biblioteca</span>}
                        {i === 0 && ev.publica ? <span className="rk-rep-pill is-ok">Principal · pública</span> : ev.publica ? <span className="rk-rep-pill is-ok">Pública</span> : <span className="rk-rep-pill">Privada</span>}
                      </div>
                      <Chequeos items={ev.analisis} />
                    </div>
                    {editable && (
                      <button
                        type="button"
                        className="rk-rep-btn is-sm"
                        disabled={quitar.isPending}
                        aria-label={`Quitar ${ev.kind === "url" ? "el enlace" : ev.nombre}`}
                        onClick={() => quitar.mutate({ evidencia: ev })}
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {mostrarComentario && (
          <section className="rk-rep-anim" aria-labelledby={`${uid}-com`}>
            <div className="rk-rep-split">
              <label className="rk-rep-lbl" htmlFor={`${uid}-com`} id={`${uid}-com`}>
                Comentario para THE
              </label>
              <span className={`rk-rep-cnt rk-rep-num ${cuenta.estado === "over" ? "is-over" : cuenta.estado === "near" ? "is-near" : ""}`} aria-live="polite">
                {cuenta.caracteres} / {cuenta.limite}
              </span>
            </div>
            <textarea
              id={`${uid}-com`}
              className="rk-rep-textarea"
              value={comentario}
              onChange={(e) => {
                setComentario(e.target.value);
                setEn("");
              }}
              placeholder="Explique cómo se obtuvo el dato o qué demuestra la evidencia. Escriba en español."
              aria-describedby={`${uid}-com-ayuda`}
            />
            {cuenta.estado === "over" ? (
              <p id={`${uid}-com-ayuda`} className="rk-rep-aviso-linea is-risk" role="alert">
                El comentario pasa del máximo que acepta THE: tiene {fmtNumero(cuenta.caracteres, 0)} caracteres y el tope es {fmtNumero(cuenta.limite, 0)}. Quite{" "}
                {fmtNumero(-cuenta.restantes, 0)} para poder traducirlo, guardarlo y enviarlo.
              </p>
            ) : (
              <p id={`${uid}-com-ayuda`} className="rk-rep-small rk-rep-muted">
                Máximo 1000 caracteres, lo que acepta THE. Si cambia el texto, la traducción se borra y hay que volver a traducirlo.
              </p>
            )}
            <div className="rk-rep-row">
              <button type="button" className="rk-rep-btn is-sm" onClick={() => void traducirComentario()} disabled={!comentario.trim() || traduciendo || cuenta.estado === "over"}>
                {traduciendo ? "Pilo está traduciendo…" : "Traducir al inglés con Pilo"}
              </button>
              {traduccionAlDia && <span className="rk-rep-small rk-rep-muted">Traducción lista</span>}
            </div>
            {en && (
              <div className="rk-rep-en" lang="en">
                <div className="rk-rep-lbl">Lo que leerá THE (inglés)</div>
                {en}
              </div>
            )}
          </section>
        )}

        {estimacion && (
          <section className="rk-rep-anim" aria-labelledby={`${uid}-pts`}>
            <div className="rk-rep-split">
              <h3 id={`${uid}-pts`} className="rk-rep-h3">
                Lo que probablemente puntuará
              </h3>
              <span className="rk-rep-pill is-blue">Estimación</span>
            </div>
            <ul className="rk-rep-meter" aria-label="Partes de la estimación" ref={medidor}>
              {[
                ["Existencia", estimacion.existencia],
                ["Relevancia", estimacion.relevancia],
                ["Pública", estimacion.publica],
              ].map(([nombreParte, valor]) => (
                <li key={String(nombreParte)} className={Number(valor) >= 1 ? "is-on" : Number(valor) > 0 ? "is-medio" : ""}>
                  <span>{nombreParte}</span>
                  <b className="rk-rep-num">{fmtNumero(Number(valor), 1)} / 1</b>
                  <span className="rk-rep-barra" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(1, Number(valor))) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="rk-rep-small" aria-live="polite">
              Total <b className="rk-rep-num">{fmtNumero(estimacion.total, 1)}</b> de 3. Aporte estimado al ODS:{" "}
              <b className="rk-rep-num">{fmtNumero(aporte, 1)}</b> de 100 puntos.
            </p>
            <p className="rk-rep-small rk-rep-muted">{consejo({ siNo, tieneEvidencias: evs.length > 0, publica: estimacion.publica > 0, relevancia: estimacion.relevancia, tipo: indicador.tipo })}</p>
            <p className="rk-rep-small rk-rep-muted">Es una estimación para Planeación, no la puntuación de THE.</p>
          </section>
        )}
      </fieldset>

      <footer className="rk-rep-acciones">
        {(esPlaneacion ? motivosAprobar : motivos).length > 0 && (
          <ul className="rk-rep-motivos" aria-label={esPlaneacion ? "Qué falta para aprobar" : "Por qué no se puede enviar"}>
            {(esPlaneacion ? motivosAprobar : motivos).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {aviso && (
          <p className={`rk-rep-aviso-linea is-${aviso.tipo === "ok" ? "ok" : aviso.tipo === "warn" ? "warn" : "risk"}`} role={aviso.tipo === "risk" ? "alert" : "status"}>
            {aviso.texto}
          </p>
        )}
        <div className="rk-rep-acciones-barra">
          <span className="rk-rep-small rk-rep-muted" aria-live="polite">
            {guardadoA ? `Borrador guardado a las ${guardadoA}` : "Se guarda al pulsar «Guardar borrador»."}
          </span>
          <div className="rk-rep-row">
            <button type="button" className="rk-rep-btn" onClick={() => void guardarBorrador()} disabled={!editable || guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className="rk-rep-btn is-primary"
              onClick={() => void enviarAPlaneacion()}
              disabled={!transicionPermitida(respuesta.estado, "sent", actor) || enviar.isPending || guardar.isPending}
            >
              {enviar.isPending ? "Enviando…" : "Enviar a Planeación"}
            </button>
            {esPlaneacion && respuesta.estado !== "ok" && (
              <button type="button" className="rk-rep-btn is-primary" onClick={() => void aprobarDirecto()} disabled={aprobar.isPending || guardar.isPending}>
                {aprobar.isPending ? "Aprobando…" : "Guardar y aprobar"}
              </button>
            )}
          </div>
        </div>
      </footer>
      <p className="rk-rep-sr">Su función en {oficina.nombre}: {nombreRol(actor)}. Ciclo {ciclo.anio}.</p>
    </article>
  );
}

function consejo(p: { siNo: boolean | null; tieneEvidencias: boolean; publica: boolean; relevancia: number; tipo: TipoIndicador | null }): string {
  if (p.siNo !== true) return "Marque «Sí» si la universidad lo tiene.";
  if (!p.tieneEvidencias) return "Sin evidencia no suma relevancia ni pública.";
  const frases: string[] = [];
  if (!p.publica) frases.push("Un enlace público suma hasta +1.");
  if (p.relevancia < 1) frases.push("Una evidencia con año y que nombre la política concreta subiría la relevancia a 1.");
  if (p.tipo === "doc") frases.push("Es un documento: si se creó o revisó entre 2022 y 2026, suma un punto más.");
  return frases.join(" ") || "Esta evidencia ya llega al máximo.";
}
