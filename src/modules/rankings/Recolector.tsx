/* =============================================================================
   Recolector de noticias · una sola pantalla de trabajo.

     barra de filtros  estado (control segmentado) · búsqueda · vistas · Buscar noticias
     barra de carga    mientras se buscan noticias (no bloquea: se sigue revisando)
     Pilo              la franja compacta de «Pilo lee las noticias»
     mesa              riel de ODS · lista · detalle (layout.css): tres paneles en
                       pantallas anchas, el riel como cajón en medianas, y una
                       columna con el detalle como hoja inferior en tableta y móvil

   Perfiles de ranking (0242): ODS (el de siempre), THE Impact, THE World y UI
   GreenMetric leen las mismas notas con su propia capa, su propio mínimo y su
   propia decisión. El selector de perfil desliza su indicador; «Configurar
   perfil» abre la hoja (PerfilHoja.tsx). Sin la migración, solo hay ODS.

   Se revisan cientos de notas: atajos de teclado (J/K, A, D, E, Z, /, Esc), pasa
   sola a la siguiente por revisar y nada se anima al aprobar, al descartar ni al
   moverse con el teclado. Con el ratón, la selección se desliza y el detalle se
   funde (movimiento.ts); el pliegue de «Enfoque» interpola las columnas.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useAuth } from "../../lib/auth";
import { fmt } from "../sostenible/data";
import { FaltaMigracion, FaltaPerfiles, llaveIntranet, temasDe, useNewsInbox, useNewsRuns, useSetNewsStates, useToggleNewsTema } from "./noticias";
import type { NewsItem, NewsState } from "./noticias";
import { CATALOGO, PERFIL_IDS, TEMA_PROPIO, VISTA, etiquetaModo, evaluarPerfil, resaltar, temaInfo, temaVars, useNewsProfiles, useSaveNewsProfiles } from "./perfiles";
import type { PerfilId } from "./perfiles";
import { PerfilHoja } from "./PerfilHoja";
import type { TabPerfil } from "./PerfilHoja";
import "./perfiles.css";
import { CargaPanel } from "./CargaPanel";
import { BarraCarga } from "./carga";
import { PiloClasificador } from "./PiloClasificador";
import { usePreferencia } from "./preferencias";
import { detalleOds, etiquetaDecisionPilo, lecturaPilo, propuestaPilo } from "./pilo-noticias";
import "./pilo-noticias.css";
import { movimientoReducido, useEntrada, useFundido, useHoja, useIndicador, usePliegue, usePresion } from "./movimiento";
import {
  SIN_TEMA,
  UMBRAL_ALTO,
  altaAfinidad,
  apilar,
  conEstados,
  contarTemas,
  desapilar,
  fechaCorta,
  filtrar,
  haceCuanto,
  mejorAfinidad,
  mover,
  restaurar,
  siguienteNota,
} from "./recolector-logica";
import type { Deshacer, FiltroEstado } from "./recolector-logica";

const PAGINA = 30;

const VERBO: Record<NewsState, [string, string]> = {
  ok: ["Aprobada", "aprobadas"],
  no: ["Descartada", "descartadas"],
  pending: ["Devuelta a revisión", "devueltas a revisión"],
};

const ESTADO_CORTO: Record<NewsState, string> = { pending: "Por revisar", ok: "Aprobada", no: "Descartada" };

const enCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Recolector() {
  const [params, setParams] = useSearchParams();
  const perfilParam = params.get("perfil");
  const perfil: PerfilId = PERFIL_IDS.includes(perfilParam as PerfilId) ? (perfilParam as PerfilId) : "ods";
  const [hojaPerfil, setHojaPerfil] = useState<TabPerfil | null>(null);
  const inbox = useNewsInbox(perfil);
  // Todas las notas cargadas (título y extracto) para la vista previa de la hoja: las mismas de cualquier perfil.
  const todas = useNewsInbox("ods", { activo: perfil === "ods" || hojaPerfil !== null });
  const { perfiles, hay: hayPerfiles } = useNewsProfiles();
  const guardarPerfiles = useSaveNewsProfiles();
  const cfg = perfiles[perfil];
  const cat = CATALOGO[perfil];
  const corridas = useNewsRuns();
  const { profile } = useAuth();
  const cliente = useQueryClient();
  const estados = useSetNewsStates();

  const [estado, setEstado] = useState<FiltroEstado>("pending");
  const [tema, setTema] = useState("");
  const [q, setQ] = useState("");
  const [activaId, setActivaId] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(PAGINA);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [pila, setPila] = useState<Deshacer[]>([]);
  const [aviso, setAviso] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [confirmarAlto, setConfirmarAlto] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [evaluando, setEvaluando] = useState(false);
  const [rielAbierto, setRielAbierto] = useState(false);
  const [enfoque, setEnfoque] = usePreferencia("enfoque");
  const [compacta, setCompacta] = usePreferencia("compacta");
  const panel = params.get("buscar") === "1";
  const buscador = useRef<HTMLInputElement>(null);
  const porTeclado = useRef(false);
  // El selector de perfil se animó con el ratón (con el teclado, en seco).
  const perfilConRaton = useRef(false);

  const escritorio = useRef<HTMLDivElement>(null);
  const mesa = useRef<HTMLDivElement>(null);
  const perfilSeg = useRef<HTMLDivElement>(null);
  const riel = useRef<HTMLElement>(null);
  const rielLista = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLDivElement>(null);
  const tramos = useRef<HTMLDivElement>(null);
  const detalle = useRef<HTMLElement>(null);
  const detalleIn = useRef<HTMLDivElement>(null);
  const veloRiel = useRef<HTMLButtonElement>(null);
  const veloHoja = useRef<HTMLButtonElement>(null);

  const notas = useMemo(() => inbox.data ?? [], [inbox.data]);
  const conteo = useMemo(() => contarTemas(notas), [notas]);
  const lista = useMemo(() => filtrar(notas, { estado, ods: 0, tema, q }), [notas, estado, tema, q]);
  const activa = lista.find((n) => n.id === activaId) ?? lista[0] ?? null;
  const altas = useMemo(() => altaAfinidad(lista), [lista]);
  const total = conteo.get("") ?? { pending: 0, ok: 0, no: 0, total: 0 };
  const activos = useMemo(() => cat.temas.filter((t) => cfg.capas.includes(t.id)), [cat, cfg.capas]);

  /* ---------- Movimiento: solo lo que nace del ratón ---------- */

  // Se lee en el render: el teclado y «aprobar y pasar» cambian en seco.
  const conRaton = !porTeclado.current;
  const detalleVisible = !enfoque || hoja;
  usePliegue(mesa, `${enfoque}-${detalleVisible}`);
  useIndicador(filas, ".rk-row--active", `${activa?.id}-${visibles}-${compacta}-${lista.length}-${perfil}`, conRaton);
  useIndicador(rielLista, '[aria-pressed="true"]', `${tema}-${enfoque}-${perfil}`, true);
  useIndicador(perfilSeg, '[aria-pressed="true"]', perfil, true);
  // Al cambiar de perfil con el ratón, el riel y la lista entran escalonados (30 ms entre filas); con el teclado, en seco.
  useEntrada(rielLista, ".rk-railbtn", perfil, perfilConRaton.current);
  useEntrada(filas, ".rk-row", `${perfil}-${inbox.isPending}`, perfilConRaton.current);
  useIndicador(tramos, '[aria-pressed="true"]', `${estado}-${total.total}`, true);
  useFundido(detalleIn, activa?.id, { activo: conRaton });
  usePresion(escritorio, ".rk-toggle, .rk-icon-btn, .rk-railbtn, .rk-chip, .rk-mesa__abrir, .rk-seg--perfil > button");
  const cajon = useHoja(riel, rielAbierto, { lado: "izquierda", alCerrar: () => setRielAbierto(false), velo: veloRiel });
  const hojaInferior = useHoja(detalle, hoja, { lado: "abajo", alCerrar: () => setHoja(false), velo: veloHoja, asa: ".rk-hoja__asa" });

  const abrirPanel = (abrir: boolean) => {
    const next = new URLSearchParams(params);
    if (abrir) next.set("buscar", "1");
    else next.delete("buscar");
    setParams(next, { replace: true });
  };

  const cambiarFiltro = (f: () => void) => {
    f();
    setVisibles(PAGINA);
    setSeleccion(new Set());
    setConfirmarAlto(false);
  };

  const elegirTema = (k: string) => {
    cambiarFiltro(() => setTema(k));
    if (rielAbierto) cajon.cerrar();
  };

  const cambiarPerfil = (id: PerfilId, conTeclado: boolean) => {
    if (id === perfil) return;
    perfilConRaton.current = !conTeclado;
    const next = new URLSearchParams(params);
    if (id === "ods") next.delete("perfil");
    else next.set("perfil", id);
    setParams(next, { replace: true });
    cambiarFiltro(() => setTema(""));
    setActivaId(null);
    setPila([]);
    setCorrigiendo(false);
  };

  /** Lee con el perfil las notas que ya están guardadas (no descarga nada). */
  const evaluarGuardadas = async () => {
    setEvaluando(true);
    setAviso(`Leyendo las notas guardadas con el perfil ${cat.nombre}…`);
    try {
      const r = await evaluarPerfil(perfil, { alAvanzar: (a) => setAviso(`Perfil ${cat.nombre}: ${fmt(a.seen)} notas leídas, ${fmt(a.saved)} nuevas.`) });
      setAviso(r.saved ? `Perfil ${cat.nombre}: ${fmt(r.saved)} ${r.saved === 1 ? "nota nueva" : "notas nuevas"} de ${fmt(r.seen)} leídas.` : `Perfil ${cat.nombre}: no había notas nuevas para este perfil.`);
      void cliente.invalidateQueries({ queryKey: ["noticias"] });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setEvaluando(false);
    }
  };

  const guardarHoja = (cambios: Parameters<typeof guardarPerfiles.mutate>[0]["cambios"]) =>
    guardarPerfiles.mutate(
      { cambios, by: profile?.id ?? null },
      {
        onSuccess: () => {
          setAviso(`Perfil ${cat.nombre} guardado.`);
          setHojaPerfil(null);
        },
      },
    );

  /* ---------- Cambiar estados (al instante en pantalla; la base, detrás) ---------- */

  const escribir = (ids: string[], state: NewsState) => {
    const cambios = new Map(ids.map((id) => [id, state] as const));
    cliente.setQueryData<NewsItem[]>(llaveIntranet(perfil), (old) => (old ? conEstados(old, cambios) : old));
    estados.mutate(
      { ids, state, by: profile?.id ?? null, perfil },
      { onError: (e) => setAviso(`No se guardó el cambio: ${e.message}. La lista se volvió a cargar.`) },
    );
  };

  const aplicar = (ids: string[], state: NewsState) => {
    const afectadas = notas.filter((n) => ids.includes(n.id) && n.state !== state);
    if (!afectadas.length) return;
    const texto = afectadas.length === 1 ? `${VERBO[state][0]}: «${afectadas[0].title}».` : `${afectadas.length} notas ${VERBO[state][1]}.`;
    setPila((p) => apilar(p, { antes: afectadas.map((n) => ({ id: n.id, state: n.state })), despues: state, texto }));
    escribir(
      afectadas.map((n) => n.id),
      state,
    );
    setAviso(`${texto} Z para deshacer.`);
  };

  const decidir = (state: NewsState) => {
    if (!activa) return;
    const siguiente = siguienteNota(lista, activa.id);
    aplicar([activa.id], state);
    setCorrigiendo(false);
    if (siguiente && state !== "pending") {
      porTeclado.current = true;
      setActivaId(siguiente);
    }
  };

  const deshacer = () => {
    const { ultima, resto } = desapilar(pila);
    if (!ultima) {
      setAviso("No hay nada que deshacer.");
      return;
    }
    setPila(resto);
    for (const g of restaurar(ultima)) escribir(g.ids, g.state);
    porTeclado.current = true;
    setActivaId(ultima.antes[0].id);
    setAviso(`Deshecho: ${ultima.texto}`);
  };

  const lote = (state: NewsState) => {
    aplicar([...seleccion], state);
    setSeleccion(new Set());
  };

  /* ---------- Teclado ---------- */

  const irA = (paso: 1 | -1) => {
    const id = mover(lista, activa?.id ?? null, paso);
    if (!id) return;
    const i = lista.findIndex((n) => n.id === id);
    if (i >= visibles) setVisibles(Math.ceil((i + 1) / PAGINA) * PAGINA);
    porTeclado.current = true;
    setActivaId(id);
  };

  const teclas = useRef<(e: KeyboardEvent) => void>(() => {});
  teclas.current = (e: KeyboardEvent) => {
    if (panel || hojaPerfil || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && (rielAbierto || hoja)) {
      // Desde el teclado se cierra en seco.
      if (rielAbierto) cajon.cerrar({ animar: false });
      else hojaInferior.cerrar({ animar: false });
      return;
    }
    if (enCampo(e.target)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const acciones: Record<string, () => void> = {
      j: () => irA(1),
      ArrowDown: () => irA(1),
      k: () => irA(-1),
      ArrowUp: () => irA(-1),
      a: () => activa?.state !== "ok" && decidir("ok"),
      d: () => activa?.state !== "no" && decidir("no"),
      e: () => activa && setCorrigiendo((v) => !v),
      z: deshacer,
      "/": () => buscador.current?.focus(),
    };
    const f = acciones[k];
    if (!f) return;
    e.preventDefault();
    f();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => teclas.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!porTeclado.current || !activa) return;
    porTeclado.current = false;
    document.getElementById(`rk-row-${activa.id}`)?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  /* ---------- Estados de la consulta ---------- */

  // El perfil ODS, mientras carga o sin migración, ocupa toda la pantalla como siempre; los demás conservan el selector para volver.
  if (perfil === "ods" && inbox.isPending) return <LoadingBlock rows={8} label="Cargando las noticias" />;
  if (perfil === "ods" && inbox.error instanceof FaltaMigracion) {
    return (
      <EmptyBlock
        title="Falta aplicar la migración 0143"
        hint="El recolector todavía no tiene dónde guardar las notas. Cuando la administración aplique la migración, la mesa de revisión aparece aquí."
      />
    );
  }
  if (perfil === "ods" && inbox.error)
    return <ErrorBlock error={inbox.error} title="No se pudieron cargar las noticias" onRetry={() => void inbox.refetch()} />;

  const ultima = corridas.data?.[0]?.started_at;
  const tramo = (valor: FiltroEstado, etiqueta: string, n: number, titulo?: string) => (
    <button
      type="button"
      className="rk-flow__step"
      aria-pressed={estado === valor}
      title={titulo}
      onClick={() => cambiarFiltro(() => setEstado(valor))}
    >
      <span className="rk-flow__n rk-num">{fmt(n)}</span> {etiqueta}
    </button>
  );
  const seleccionVisibles = lista.slice(0, visibles);
  const todasMarcadas = seleccionVisibles.length > 0 && seleccionVisibles.every((n) => seleccion.has(n.id));
  const unidad = perfil === "ods" ? "ODS" : "tema";
  const infoTema = tema && tema !== SIN_TEMA ? temaInfo(tema) : null;
  const filtroTema = !tema ? (perfil === "ods" ? "Todos los ODS" : "Todos los temas") : tema === SIN_TEMA ? `Sin ${unidad}` : perfil === "ods" ? `ODS ${infoTema?.cod} · ${infoTema?.corto}` : `${infoTema?.cod} · ${infoTema?.corto}`;
  const modo = cfg.modo;
  const palabrasVistas = cfg.palabras.slice(0, 4);

  return (
    <div ref={escritorio} className="rk-desk" data-enfoque={enfoque || undefined} data-compacta={compacta || undefined}>
      {/* ---------- Barra de filtros única ---------- */}
      <div className="rk-flow">
        <div ref={tramos} className="rk-seg rk-flow__steps" role="group" aria-label="Estado de las notas">
          <span data-indicador aria-hidden="true" />
          {tramo("pending", "por revisar", total.pending)}
          {tramo("ok", "aprobadas", total.ok, "Aprobadas: se ven en los informes públicos")}
          {tramo("no", "descartadas", total.no)}
          {tramo("all", "cargadas", total.total)}
        </div>
        <label className="rk-search">
          <span className="sr-only">Buscar en los títulos</span>
          <Icon name="search" size={15} aria-hidden="true" />
          <input
            ref={buscador}
            type="search"
            placeholder="Buscar títulos"
            value={q}
            onChange={(e) => cambiarFiltro(() => setQ(e.target.value))}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <div className="rk-flow__tools">
          <span className="rk-hint rk-flow__last">Última carga: {corridas.error ? "sin registro" : haceCuanto(ultima)}</span>
          <button type="button" className="rk-toggle" aria-pressed={compacta} title="Filas de 30 px" onClick={() => setCompacta(!compacta)}>
            Compacta
          </button>
          <button
            type="button"
            className="rk-toggle"
            aria-pressed={enfoque}
            title="Oculta los paneles laterales; la franja de ODS queda a la izquierda"
            onClick={() => setEnfoque(!enfoque)}
          >
            Enfoque
          </button>
          <button
            type="button"
            className="rk-icon-btn"
            aria-expanded={ayuda}
            aria-controls="rk-ayuda"
            aria-label="Cómo funciona el recolector"
            onClick={() => setAyuda((v) => !v)}
          >
            ?
          </button>
          <button type="button" className="button-primary rk-sm" onClick={() => abrirPanel(true)}>
            <Icon name="download" size={15} aria-hidden="true" /> Buscar noticias
          </button>
        </div>
      </div>
      <BarraCarga />
      <div className="rk-perfil">
        <div className="rk-perfil__sel">
          <span id="rk-perfil-lbl" className="rk-perfil__lbl">
            Perfil
          </span>
          <div ref={perfilSeg} className="rk-seg rk-seg--perfil" role="group" aria-labelledby="rk-perfil-lbl">
            <span data-indicador aria-hidden="true" />
            {PERFIL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={perfil === id}
                title={CATALOGO[id].descripcion}
                onClick={(e) => cambiarPerfil(id, e.detail === 0)}
              >
                <i className="rk-sw" style={{ background: VISTA[id].color }} aria-hidden="true" />
                {CATALOGO[id].nombre}
                {id === "ods" && <b>hoy</b>}
              </button>
            ))}
          </div>
        </div>
        <div className="rk-perfil__sum" aria-live="polite">
          <p>
            Lee{" "}
            <b>
              {activos.length} {cat.plural}
            </b>{" "}
            · propone desde <b className="rk-num">{cfg.umbral}</b> · hasta <b className="rk-num">{cfg.max_temas}</b> por nota ·{" "}
            {!cfg.recibe ? (
              <>
                <b>no recibe noticias</b> todavía
              </>
            ) : modo === "cerrado" ? (
              <>
                se queda en la <b>intranet</b>
              </>
            ) : (
              <>
                publica en <b>{VISTA[perfil].fin}</b> ({etiquetaModo(modo)})
              </>
            )}
          </p>
          {cfg.palabras.length > 0 && (
            <p className="rk-perfil__terms">
              Palabras propias <b className="rk-num">{cfg.palabras.length}</b>:
              {palabrasVistas.map((w) => (
                <span key={w} className="rk-perfil__term">
                  {w}
                </span>
              ))}
              {cfg.palabras.length > palabrasVistas.length && <span className="rk-hint">+{cfg.palabras.length - palabrasVistas.length}</span>}
            </p>
          )}
        </div>
        <div className="rk-perfil__act">
          {(perfil !== "ods" || cfg.palabras.length > 0) && (
            <button type="button" className="button-secondary rk-sm" onClick={() => void evaluarGuardadas()} disabled={evaluando || !cfg.recibe || !hayPerfiles} title={cfg.recibe ? "Lee con este perfil las notas que ya están guardadas; no descarga nada" : "Activa «Recibe noticias» en Publicación"}>
              {evaluando ? "Leyendo…" : "Evaluar las ya cargadas"}
            </button>
          )}
          <button type="button" className="button-secondary rk-sm" onClick={() => setHojaPerfil("busca")}>
            Configurar perfil
          </button>
          <button type="button" className="button-secondary rk-sm" onClick={() => setHojaPerfil("pub")}>
            Publicación
          </button>
        </div>
      </div>
      <PiloClasificador perfil={perfil} limite={2} invalidarCada={3} />
      {ayuda && (
        <ul className="rk-help" id="rk-ayuda">
          <li>Se lee una página del listado cada unos 5 segundos, para no cargar el servidor de la Universidad.</li>
          <li>Lo que ya está cargado no se vuelve a descargar.</li>
          <li>Lo aprobado, lo descartado y los ODS corregidos a mano no se tocan al volver a cargar.</li>
          <li>
            Cada perfil (ODS, THE Impact, THE World, UI GreenMetric) lee las mismas notas con su propia capa de búsqueda y su propio mínimo, y decide por separado: una nota puede estar aprobada
            en uno y descartada en otro. El perfil ODS es el recolector de siempre.
          </li>
          <li>
            Para administración: la búsqueda diaria automática necesita programar la tarea con el secreto <code>NOTICIAS_CRON</code>.
          </li>
        </ul>
      )}

      {/* ---------- Mesa: riel · lista · detalle ---------- */}
      <div ref={mesa} className="rk-mesa rk-work" data-detalle={detalleVisible || undefined}>
        <nav
          ref={riel}
          id="rk-riel"
          className={`rk-mesa__panel rk-mesa__izq rk-rail${enfoque ? " rk-rail--franja" : ""}`}
          aria-label={cat.riel}
          data-open={rielAbierto || undefined}
          tabIndex={-1}
        >
          {enfoque ? (
            activos.map((t) => {
              const pend = conteo.get(t.id)?.pending ?? 0;
              const nombreCompleto = perfil === "ods" ? `ODS ${t.cod}: ${t.nombre}` : `${t.cod}: ${t.nombre}`;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="rk-franja"
                  style={temaVars(t.id)}
                  aria-pressed={tema === t.id}
                  aria-label={`${nombreCompleto}, ${pend} por revisar`}
                  title={`${t.cod} · ${t.nombre}`}
                  onClick={() => cambiarFiltro(() => setTema(tema === t.id ? "" : t.id))}
                />
              );
            })
          ) : (
            <>
              <div className="rk-rail__head">
                <span>{cat.riel}</span>
                <span className="rk-rail__legend">por revisar · aprobadas</span>
                <button type="button" className="rk-icon-btn rk-rail__close" onClick={() => cajon.cerrar()} aria-label="Cerrar el filtro">
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div ref={rielLista} className="rk-mesa__scroll rk-rail__list">
                <span data-indicador aria-hidden="true" />
                <RielBoton activo={tema === ""} onClick={() => elegirTema("")} conteo={conteo.get("")} nombre="Todas" />
                {activos.map((t) => (
                  <RielBoton key={t.id} activo={tema === t.id} onClick={() => elegirTema(tema === t.id ? "" : t.id)} conteo={conteo.get(t.id)} tema={t.id} nombre={t.corto} titulo={t.nombre} />
                ))}
                {cfg.palabras.length > 0 && (
                  <RielBoton activo={tema === TEMA_PROPIO} onClick={() => elegirTema(tema === TEMA_PROPIO ? "" : TEMA_PROPIO)} conteo={conteo.get(TEMA_PROPIO)} tema={TEMA_PROPIO} nombre="Palabras propias" titulo="Notas que coinciden con las palabras propias del perfil" />
                )}
                <RielBoton activo={tema === SIN_TEMA} onClick={() => elegirTema(SIN_TEMA)} conteo={conteo.get(SIN_TEMA)} nombre={`Sin ${unidad}`} />
              </div>
            </>
          )}
        </nav>
        {rielAbierto && <button ref={veloRiel} type="button" tabIndex={-1} className="rk-velo" aria-label="Cerrar el filtro" onClick={() => cajon.cerrar()} />}

        <section className="rk-mesa__panel rk-listzone" aria-label="Noticias">
          <div className="rk-mesa__barra rk-listbar">
            <label className="rk-check" title="Seleccionar las visibles">
              <input
                type="checkbox"
                checked={todasMarcadas}
                disabled={!seleccionVisibles.length}
                onChange={(e) => setSeleccion(e.target.checked ? new Set(seleccionVisibles.map((n) => n.id)) : new Set())}
              />
              <span className="sr-only">Seleccionar las notas visibles</span>
            </label>
            {!enfoque && (
              <button
                type="button"
                className="rk-mesa__abrir rk-filtro"
                aria-expanded={rielAbierto}
                aria-controls="rk-riel"
                style={infoTema ? temaVars(tema) : undefined}
                data-ods={infoTema ? "" : undefined}
                onClick={() => setRielAbierto(true)}
              >
                <Icon name="filter" size={14} aria-hidden="true" />
                <span>{filtroTema}</span>
              </button>
            )}
            {seleccion.size > 0 ? (
              <div className="rk-batch" role="region" aria-label="Acciones por lote">
                <span>
                  <b className="rk-num">{seleccion.size}</b> seleccionadas
                </span>
                <button type="button" className="button-secondary rk-sm rk-approve" onClick={() => lote("ok")}>
                  Aprobar
                </button>
                <button type="button" className="button-secondary rk-sm" onClick={() => lote("no")}>
                  Descartar
                </button>
                <button type="button" className="rk-link" onClick={() => setSeleccion(new Set())}>
                  Quitar selección
                </button>
              </div>
            ) : (
              altas.length > 0 &&
              !confirmarAlto && (
                <button type="button" className="rk-link rk-batch__alto" onClick={() => setConfirmarAlto(true)}>
                  Aprobar las de afinidad ≥ {UMBRAL_ALTO} % ({fmt(altas.length)})
                </button>
              )
            )}
            <span className="rk-hint rk-num rk-listbar__count">
              {fmt(lista.length)} {lista.length === 1 ? "nota" : "notas"}
            </span>
            {seleccion.size === 0 && confirmarAlto && (
              <div role="alertdialog" aria-labelledby="rk-alto-q" className="rk-confirm">
                <span id="rk-alto-q">
                  ¿Aprobar <b className="rk-num">{altas.length}</b> {altas.length === 1 ? "nota" : "notas"} por revisar con afinidad ≥ {UMBRAL_ALTO} %? Aparecerán
                  en los informes públicos.
                </span>
                <button
                  type="button"
                  className="button-primary rk-sm"
                  onClick={() => {
                    aplicar(
                      altas.map((n) => n.id),
                      "ok",
                    );
                    setConfirmarAlto(false);
                  }}
                >
                  Sí, aprobar {altas.length}
                </button>
                <button type="button" className="button-ghost rk-sm" autoFocus onClick={() => setConfirmarAlto(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div className="rk-mesa__scroll rk-listzone__scroll">
            {inbox.isPending ? (
              <LoadingBlock rows={6} label={`Cargando las noticias del perfil ${cat.nombre}`} />
            ) : inbox.error ? (
              inbox.error instanceof FaltaPerfiles ? (
                <EmptyBlock title="Falta aplicar la migración 0242" hint="Los perfiles de ranking todavía no tienen dónde guardar sus notas. El perfil ODS sigue funcionando como siempre." />
              ) : (
                <ErrorBlock error={inbox.error} title="No se pudieron cargar las noticias" onRetry={() => void inbox.refetch()} />
              )
            ) : lista.length === 0 ? (
              notas.length === 0 ? (
                perfil !== "ods" ? (
                  <EmptyBlock
                    title={cfg.recibe ? `El perfil ${cat.nombre} aún no tiene notas` : `El perfil ${cat.nombre} todavía no recibe noticias`}
                    hint={
                      cfg.recibe
                        ? "Léelas desde las que ya están guardadas, o busca noticias nuevas: cada carga las evalúa también con este perfil."
                        : "Actívalo en «Publicación» para que cada carga lo evalúe, y luego lee las notas que ya están guardadas."
                    }
                    action={
                      cfg.recibe ? (
                        <button type="button" className="button-primary rk-sm" onClick={() => void evaluarGuardadas()} disabled={evaluando || !hayPerfiles}>
                          Evaluar las ya cargadas
                        </button>
                      ) : (
                        <button type="button" className="button-primary rk-sm" onClick={() => setHojaPerfil("pub")}>
                          Abrir Publicación
                        </button>
                      )
                    }
                  />
                ) : (
                  <EmptyBlock
                    title="Aún no hay noticias cargadas"
                    hint="Busca las noticias de udes.edu.co: llegan aquí con los ODS que el sistema detectó, y puedes ir revisando mientras se cargan."
                    action={
                      <button type="button" className="button-primary rk-sm" onClick={() => abrirPanel(true)}>
                        Buscar noticias
                      </button>
                    }
                  />
                )
              ) : (
                <EmptyBlock
                  title="Ninguna nota con este filtro."
                  hint={`Cambia el estado, el ${unidad === "ODS" ? "ODS" : "tema"} o la búsqueda.`}
                  action={
                    <button
                      type="button"
                      className="button-secondary rk-sm"
                      onClick={() =>
                        cambiarFiltro(() => {
                          setEstado("all");
                          setTema("");
                          setQ("");
                        })
                      }
                    >
                      Ver todas las notas
                    </button>
                  }
                />
              )
            ) : (
              <>
                <div ref={filas} className="rk-rowsbox">
                  <span data-indicador aria-hidden="true" />
                  <ul className="rk-rows">
                    {lista.slice(0, visibles).map((n) => (
                      <Fila
                        key={n.id}
                        nota={n}
                        perfil={perfil}
                        activa={n.id === activa?.id}
                        marcada={seleccion.has(n.id)}
                        onMarcar={(v) =>
                          setSeleccion((s) => {
                            const x = new Set(s);
                            if (v) x.add(n.id);
                            else x.delete(n.id);
                            return x;
                          })
                        }
                        onAbrir={() => {
                          setActivaId(n.id);
                          setCorrigiendo(false);
                          setHoja(true);
                        }}
                      />
                    ))}
                  </ul>
                </div>
                {visibles < lista.length && (
                  <div className="rk-more">
                    <button type="button" className="button-secondary rk-sm" onClick={() => setVisibles((v) => v + PAGINA)}>
                      Mostrar más
                    </button>
                    <span className="rk-hint rk-num">
                      {fmt(visibles)} de {fmt(lista.length)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ---------- Atajos y avisos ---------- */}
          <footer className="rk-mesa__pie rk-keys">
            <p aria-label="Atajos de teclado">
              <kbd>J</kbd>/<kbd>K</kbd> mover · <kbd>A</kbd> aprobar · <kbd>D</kbd> descartar · <kbd>E</kbd> corregir {perfil === "ods" ? "ODS" : "temas"} · <kbd>Z</kbd> deshacer ·{" "}
              <kbd>/</kbd> buscar
            </p>
            <p className="rk-keys__msg" role="status" aria-live="polite">
              {aviso}
            </p>
          </footer>
        </section>

        <aside ref={detalle} className="rk-mesa__panel rk-mesa__der rk-detail" data-open={hoja || undefined} aria-labelledby="rk-detail-title" tabIndex={-1}>
          <button type="button" className="rk-hoja__asa" tabIndex={-1} aria-hidden="true" />
          <div ref={detalleIn} className="rk-detail__in">
            {activa ? (
              <Detalle
                key={activa.id}
                nota={activa}
                perfil={perfil}
                palabras={cfg.palabras}
                corrigiendo={corrigiendo}
                onCorregir={() => setCorrigiendo((v) => !v)}
                onDecidir={decidir}
                onCerrar={() => hojaInferior.cerrar()}
              />
            ) : (
              <div className="rk-detail__empty">
                <p className="rk-detail__empty-title" id="rk-detail-title">
                  Ninguna nota seleccionada
                </p>
                <p className="rk-hint">Elige una nota de la lista para revisarla.</p>
              </div>
            )}
          </div>
        </aside>
        {hoja && <button ref={veloHoja} type="button" tabIndex={-1} className="rk-velo rk-velo--hoja" aria-label="Cerrar la nota" onClick={() => hojaInferior.cerrar()} />}
      </div>

      {panel && <CargaPanel onClose={() => abrirPanel(false)} />}
      {hojaPerfil && (
        <PerfilHoja
          perfil={perfil}
          guardadas={perfiles}
          hay={hayPerfiles}
          notas={todas.data ?? []}
          aprobadas={total.ok}
          tab={hojaPerfil}
          onTab={setHojaPerfil}
          guardando={guardarPerfiles.isPending}
          error={guardarPerfiles.error?.message ?? null}
          onGuardar={guardarHoja}
          onCerrar={() => {
            guardarPerfiles.reset();
            setHojaPerfil(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Riel ----------------------------------------------------------- */

function RielBoton({
  activo,
  onClick,
  conteo,
  tema,
  nombre,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  conteo?: { pending: number; ok: number };
  /** El tema de la marca (un ODS, un pilar, una categoría o «propio»); sin él, es un botón sin color («Todas», «Sin tema»). */
  tema?: string;
  nombre: string;
  titulo?: string;
}) {
  const pend = conteo?.pending ?? 0;
  const ok = conteo?.ok ?? 0;
  return (
    <button
      type="button"
      className={`rk-railbtn${tema ? "" : " rk-railbtn--plain"}${!pend && !ok ? " rk-railbtn--zero" : ""}`}
      style={tema ? temaVars(tema) : undefined}
      aria-pressed={activo}
      title={titulo}
      onClick={onClick}
    >
      <span className="rk-railbtn__n rk-num" aria-hidden={!tema || undefined}>
        {tema ? temaInfo(tema).cod : ""}
      </span>
      <span className="rk-railbtn__name">{nombre}</span>
      <span className="rk-railbtn__count rk-num">
        <b>{pend}</b>
        <span className="sr-only"> por revisar,</span>
        <span aria-hidden="true">·</span>
        {ok}
        <span className="sr-only"> aprobadas</span>
      </span>
    </button>
  );
}

/* ---------- Fila ----------------------------------------------------------- */

function Foto({ nota, grande }: { nota: NewsItem; grande?: boolean }) {
  const [rota, setRota] = useState(false);
  const principal = temasDe(nota)[0]?.tema;
  const clase = `rk-photo${grande ? " rk-photo--big" : ""}`;
  if (nota.image_url && !rota) {
    return (
      <div className={clase}>
        <img
          src={nota.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setRota(true)}
          // La foto grande se funde al llegar sobre su lugar reservado; las miniaturas, en seco.
          onLoad={grande && !movimientoReducido() ? (e) => gsap.fromTo(e.currentTarget, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out", clearProps: "opacity" }) : undefined}
        />
      </div>
    );
  }
  return (
    <div className={`${clase} rk-photo--empty`} style={principal ? temaVars(principal) : undefined} aria-hidden="true">
      <span>{principal ? temaInfo(principal).cod : "—"}</span>
    </div>
  );
}

function Fila({
  nota,
  perfil,
  activa,
  marcada,
  onMarcar,
  onAbrir,
}: {
  nota: NewsItem;
  perfil: PerfilId;
  activa: boolean;
  marcada: boolean;
  onMarcar: (v: boolean) => void;
  onAbrir: () => void;
}) {
  const lugar = [nota.section, nota.campus].filter(Boolean).join(" · ");
  const mejor = mejorAfinidad(nota);
  const temas = temasDe(nota);
  return (
    <li id={`rk-row-${nota.id}`} className={`rk-row${activa ? " rk-row--active" : ""}`} data-state={nota.state} data-marcada={marcada || undefined}>
      <label className="rk-check">
        <input type="checkbox" checked={marcada} onChange={(e) => onMarcar(e.target.checked)} />
        <span className="sr-only">Seleccionar «{nota.title}»</span>
      </label>
      <button type="button" className="rk-row__main" aria-current={activa || undefined} onClick={onAbrir}>
        <Foto nota={nota} />
        <span className="rk-row__text">
          <span className="rk-row__title">{nota.title}</span>
          <span className="rk-row__sub">
            <span className="rk-row__ods">
              {temas.slice(0, 3).map((t) => (
                <span key={t.tema} className="rk-odsmark" style={temaVars(t.tema)}>
                  <span className="sr-only">{perfil === "ods" && t.tema !== TEMA_PROPIO ? "ODS " : `${temaInfo(t.tema).corto} `}</span>
                  {temaInfo(t.tema).cod}
                </span>
              ))}
              {temas.length > 3 && <span className="rk-hint">+{temas.length - 3}</span>}
              <span className="rk-row__pct rk-num">{temas.length ? `${Math.round(mejor)} %` : perfil === "ods" ? "sin ODS" : "sin tema"}</span>
            </span>
            <span className="rk-row__meta">
              {fechaCorta(nota.published_on)}
              {lugar && ` · ${lugar}`}
              {nota.state !== "pending" && <span className={`rk-state rk-state--${nota.state}`}> · {etiquetaDecisionPilo(nota) ?? ESTADO_CORTO[nota.state]}</span>}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/* ---------- Detalle -------------------------------------------------------- */

/** Un texto con las palabras propias del perfil resaltadas donde coinciden. */
function Resaltada({ texto, palabras }: { texto: string; palabras: string[] }) {
  return (
    <>
      {resaltar(texto, palabras).map((t, i) =>
        t.coincide ? (
          <mark key={i} className="rk-propia">
            {t.texto}
          </mark>
        ) : (
          t.texto
        ),
      )}
    </>
  );
}

/** Lo que Pilo leyó de la nota: su sugerencia, el resumen y, si falló, por qué. */
function PropuestaDePilo({ nota }: { nota: NewsItem }) {
  const decidio = etiquetaDecisionPilo(nota);
  const p = propuestaPilo(nota);
  const lectura = lecturaPilo(nota);
  if (!decidio && !p && !lectura) return null;
  return (
    <section className="rk-pilo-note" aria-label="Lo que leyó Pilo">
      {decidio && <span className="rk-pilo-tag">{decidio}</span>}
      {p && (
        <p>
          <b>{p.etiqueta}</b>
          {p.confianza !== null && ` · ${Math.round(p.confianza)} %`}
          {p.resumen && <> — {p.resumen}</>}
        </p>
      )}
      {lectura && <p className="rk-hint">{lectura}</p>}
    </section>
  );
}

function Detalle({
  nota,
  perfil,
  palabras,
  corrigiendo,
  onCorregir,
  onDecidir,
  onCerrar,
}: {
  nota: NewsItem;
  perfil: PerfilId;
  /** Las palabras propias del perfil: se resaltan en el título y el extracto. */
  palabras: string[];
  corrigiendo: boolean;
  onCorregir: () => void;
  onDecidir: (s: NewsState) => void;
  onCerrar: () => void;
}) {
  const alternar = useToggleNewsTema();
  const temas = temasDe(nota);
  const activos = new Set(temas.map((t) => t.tema));
  const lugar = [nota.section, nota.campus].filter(Boolean).join(" · ");
  const esOds = perfil === "ods";
  const corregir = esOds ? "Corregir ODS" : "Corregir temas";
  return (
    <>
      <div className="rk-mesa__scroll rk-detail__body">
        <div className="rk-detail__top">
          <p className="rk-row__meta">
            {fechaCorta(nota.published_on)}
            {lugar && ` · ${lugar}`} · <span className={`rk-state rk-state--${nota.state}`}>{ESTADO_CORTO[nota.state]}</span>
          </p>
          <button type="button" className="rk-icon-btn rk-detail__close" onClick={onCerrar} aria-label="Cerrar la nota" data-autofocus>
            <Icon name="close" size={16} />
          </button>
        </div>
        <h2 id="rk-detail-title" className="rk-detail__title">
          <a href={nota.url} target="_blank" rel="noopener">
            <Resaltada texto={nota.title} palabras={palabras} />
            <Icon name="external" size={14} aria-hidden="true" />
            <span className="sr-only"> (abre la nota original en una pestaña nueva)</span>
          </a>
        </h2>
        <Foto nota={nota} grande />
        {nota.excerpt && (
          <p className="rk-detail__excerpt">
            <Resaltada texto={nota.excerpt} palabras={palabras} />
          </p>
        )}

        <PropuestaDePilo nota={nota} />

        <div className="rk-detail__sec">
          <h3 className="rk-detail__h">{esOds ? "ODS detectados" : "Temas detectados"}</h3>
          <button type="button" className="rk-link" aria-expanded={corrigiendo} aria-controls="rk-fix" onClick={onCorregir}>
            {corrigiendo ? "Cerrar la corrección" : corregir} <kbd>E</kbd>
          </button>
        </div>
        {temas.length === 0 ? (
          <p className="rk-hint">{esOds ? "El sistema no encontró ningún ODS claro. Agrégalo con «Corregir ODS»." : "El perfil no encontró ningún tema claro en esta nota. Agrégalo con «Corregir temas»."}</p>
        ) : (
          <ul className="rk-det">
            {temas.map((o) => {
              const d = detalleOds(o);
              const t = temaInfo(o.tema);
              return (
                <li key={o.tema}>
                  <div className="rk-det__line">
                    <span className="rk-odsmark" style={temaVars(o.tema)}>
                      <span className="sr-only">{esOds && o.tema !== TEMA_PROPIO ? "ODS " : ""}</span>
                      {t.cod}
                    </span>
                    <span className="rk-det__name" title={t.nombre}>
                      {t.corto}
                    </span>
                    <span className="rk-bar" style={temaVars(o.tema)} aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, o.score))}%` }} />
                    </span>
                    <span className="rk-det__score rk-num">{o.manual ? "manual" : `${Math.round(o.score)} %`}</span>
                  </div>
                  {d.indicador && <p className="rk-det__why">Indicador {d.indicador}</p>}
                  {o.reason && <p className="rk-det__why">{o.reason}</p>}
                  {o.by_ai || o.manual ? <p className="rk-det__why rk-det__origin">{d.origen}</p> : null}
                </li>
              );
            })}
          </ul>
        )}

        {corrigiendo && (
          <div className="rk-fix" id="rk-fix">
            <p className="rk-hint" id="rk-fix-hint">
              Marca o desmarca. Siempre queda al menos uno; los agregados quedan como «manual».
            </p>
            <div className="rk-chips" role="group" aria-labelledby="rk-fix-hint">
              {CATALOGO[perfil].temas.map((t) => {
                const on = activos.has(t.id);
                const ultimo = on && activos.size === 1;
                const nombre = esOds ? `ODS ${t.cod}: ${t.nombre}` : `${t.cod}: ${t.nombre}`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="rk-chip"
                    style={temaVars(t.id)}
                    aria-pressed={on}
                    aria-disabled={ultimo || alternar.isPending || undefined}
                    aria-label={`${nombre}${ultimo ? ` (no se puede quitar el único ${esOds ? "ODS" : "tema"})` : ""}`}
                    title={ultimo ? `Una nota necesita al menos un ${esOds ? "ODS" : "tema"}` : t.nombre}
                    data-saving={(alternar.isPending && alternar.variables?.tema === t.id) || undefined}
                    onClick={() => {
                      if (ultimo || alternar.isPending) return;
                      alternar.mutate({ id: nota.id, perfil, tema: t.id, on: !on });
                    }}
                  >
                    {t.cod}
                  </button>
                );
              })}
            </div>
            {alternar.error && (
              <p className="rk-error" role="alert">
                No se guardó: {alternar.error.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rk-mesa__pie rk-acts">
        {nota.state !== "ok" && (
          <button type="button" className="button-primary rk-sm rk-approve" onClick={() => onDecidir("ok")}>
            Aprobar <kbd>A</kbd>
          </button>
        )}
        {nota.state !== "no" && (
          <button type="button" className="button-secondary rk-sm" onClick={() => onDecidir("no")}>
            Descartar <kbd>D</kbd>
          </button>
        )}
        {nota.state !== "pending" && (
          <button type="button" className="button-ghost rk-sm" onClick={() => onDecidir("pending")}>
            Volver a revisar
          </button>
        )}
      </div>
    </>
  );
}
