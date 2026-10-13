/* =============================================================================
   Recolector de noticias · una sola pantalla de trabajo.

     franja de flujo   Cargadas → Por revisar → Aprobadas (filtros) · Buscar noticias
     barra de carga    mientras se buscan noticias (no bloquea: se sigue revisando)
     riel              Todas · los 17 ODS · Sin ODS (el filtro principal)
     lista             filas compactas, selección por lote, 30 en 30
     detalle           la nota activa: imagen, ODS con afinidad y razón, acciones

   Se revisan cientos de notas: atajos de teclado (J/K, A, D, E, Z, /), pasa
   sola a la siguiente por revisar y nada se anima al aprobar o descartar.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../components/ui/Icon";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { useAuth } from "../../lib/auth";
import { fmt } from "../sostenible/data";
import { FaltaMigracion, useNewsInbox, useNewsRuns, useSetNewsStates, useToggleNewsOds } from "./noticias";
import type { NewsItem, NewsState } from "./noticias";
import { CargaPanel } from "./CargaPanel";
import { BarraCarga } from "./carga";
import { PiloClasificador } from "./PiloClasificador";
import { detalleOds, etiquetaDecisionPilo, lecturaPilo, propuestaPilo } from "./pilo-noticias";
import "./pilo-noticias.css";
import { ODS_NUMEROS, odsCorto, odsNombre, odsVars } from "./ods";
import {
  SIN_ODS,
  UMBRAL_ALTO,
  altaAfinidad,
  apilar,
  conEstados,
  contarRiel,
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
const LLAVE_INTRANET = ["noticias", "intranet"];

const VERBO: Record<NewsState, [string, string]> = {
  ok: ["Aprobada", "aprobadas"],
  no: ["Descartada", "descartadas"],
  pending: ["Devuelta a revisión", "devueltas a revisión"],
};

const ESTADO_CORTO: Record<NewsState, string> = { pending: "Por revisar", ok: "Aprobada", no: "Descartada" };

const enCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Recolector() {
  const inbox = useNewsInbox();
  const corridas = useNewsRuns();
  const { profile } = useAuth();
  const cliente = useQueryClient();
  const estados = useSetNewsStates();
  const [params, setParams] = useSearchParams();

  const [estado, setEstado] = useState<FiltroEstado>("pending");
  const [ods, setOds] = useState(0);
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
  const panel = params.get("buscar") === "1";
  const buscador = useRef<HTMLInputElement>(null);
  const porTeclado = useRef(false);

  const notas = useMemo(() => inbox.data ?? [], [inbox.data]);
  const riel = useMemo(() => contarRiel(notas), [notas]);
  const lista = useMemo(() => filtrar(notas, { estado, ods, q }), [notas, estado, ods, q]);
  const activa = lista.find((n) => n.id === activaId) ?? lista[0] ?? null;
  const altas = useMemo(() => altaAfinidad(lista), [lista]);
  const total = riel.get(0) ?? { pending: 0, ok: 0, no: 0, total: 0 };

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

  /* ---------- Cambiar estados (al instante en pantalla; la base, detrás) ---------- */

  const escribir = (ids: string[], state: NewsState) => {
    const cambios = new Map(ids.map((id) => [id, state] as const));
    cliente.setQueryData<NewsItem[]>(LLAVE_INTRANET, (old) => (old ? conEstados(old, cambios) : old));
    estados.mutate(
      { ids, state, by: profile?.id ?? null },
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
    if (panel || e.ctrlKey || e.metaKey || e.altKey || enCampo(e.target)) return;
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

  if (inbox.isPending) return <LoadingBlock rows={8} label="Cargando las noticias" />;
  if (inbox.error instanceof FaltaMigracion) {
    return (
      <EmptyBlock
        title="Falta aplicar la migración 0143"
        hint="El recolector todavía no tiene dónde guardar las notas. Cuando la administración aplique la migración, la mesa de revisión aparece aquí."
      />
    );
  }
  if (inbox.error)
    return <ErrorBlock error={inbox.error} title="No se pudieron cargar las noticias" onRetry={() => void inbox.refetch()} />;

  const ultima = corridas.data?.[0]?.started_at;
  const tramo = (valor: FiltroEstado, etiqueta: string, n: number, extra?: string) => (
    <button type="button" className="rk-flow__step" aria-pressed={estado === valor} onClick={() => cambiarFiltro(() => setEstado(valor))}>
      <span className="rk-flow__n rk-num">{fmt(n)}</span> {etiqueta}
      {extra && <span className="rk-flow__extra"> {extra}</span>}
    </button>
  );
  const seleccionVisibles = lista.slice(0, visibles);
  const todasMarcadas = seleccionVisibles.length > 0 && seleccionVisibles.every((n) => seleccion.has(n.id));

  return (
    <div className="rk-desk">
      {/* ---------- Franja de flujo ---------- */}
      <div className="rk-flow">
        <div className="rk-flow__steps" role="group" aria-label="Estado de las notas">
          {tramo("all", "cargadas", total.total)}
          <span className="rk-flow__arrow" aria-hidden="true">
            →
          </span>
          {tramo("pending", "por revisar", total.pending)}
          <span className="rk-flow__arrow" aria-hidden="true">
            →
          </span>
          {tramo("ok", "aprobadas", total.ok, "(en los informes públicos)")}
          <span className="rk-flow__sep" aria-hidden="true" />
          {tramo("no", "descartadas", total.no)}
        </div>
        <div className="rk-flow__tools">
          <span className="rk-hint">Última carga: {corridas.error ? "sin registro" : haceCuanto(ultima)}</span>
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
      <PiloClasificador limite={2} invalidarCada={3} />
      {ayuda && (
        <ul className="rk-help" id="rk-ayuda">
          <li>Se lee una página del listado cada unos 5 segundos, para no cargar el servidor de la Universidad.</li>
          <li>Lo que ya está cargado no se vuelve a descargar.</li>
          <li>Lo aprobado, lo descartado y los ODS corregidos a mano no se tocan al volver a cargar.</li>
          <li>
            Para administración: la búsqueda diaria automática necesita programar la tarea con el secreto <code>NOTICIAS_CRON</code>.
          </li>
        </ul>
      )}

      {/* ---------- Riel · lista · detalle ---------- */}
      <div className="rk-work">
        <nav className="rk-rail" aria-label="Filtrar por ODS">
          <RielBoton activo={ods === 0} onClick={() => cambiarFiltro(() => setOds(0))} conteo={riel.get(0)} nombre="Todas" />
          {ODS_NUMEROS.map((k) => (
            <RielBoton
              key={k}
              activo={ods === k}
              onClick={() => cambiarFiltro(() => setOds(ods === k ? 0 : k))}
              conteo={riel.get(k)}
              numero={k}
              nombre={odsCorto(k)}
              titulo={odsNombre(k)}
            />
          ))}
          <RielBoton
            activo={ods === SIN_ODS}
            onClick={() => cambiarFiltro(() => setOds(SIN_ODS))}
            conteo={riel.get(SIN_ODS)}
            nombre="Sin ODS"
          />
        </nav>

        <section className="rk-listzone" aria-label="Noticias">
          <div className="rk-listbar">
            <label className="rk-check" title="Seleccionar las visibles">
              <input
                type="checkbox"
                checked={todasMarcadas}
                disabled={!seleccionVisibles.length}
                onChange={(e) => setSeleccion(e.target.checked ? new Set(seleccionVisibles.map((n) => n.id)) : new Set())}
              />
              <span className="sr-only">Seleccionar las notas visibles</span>
            </label>
            <label className="rk-search">
              <span className="sr-only">Buscar en los títulos</span>
              <Icon name="search" size={15} aria-hidden="true" />
              <input
                ref={buscador}
                type="search"
                placeholder="Buscar en los títulos  ( / )"
                value={q}
                onChange={(e) => cambiarFiltro(() => setQ(e.target.value))}
              />
            </label>
            <span className="rk-hint rk-num">{fmt(lista.length)}</span>
          </div>

          {seleccion.size > 0 ? (
            <div className="rk-batch" role="region" aria-label="Acciones por lote">
              <b className="rk-num">{seleccion.size}</b> seleccionadas
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
            altas.length > 0 && (
              <div className="rk-batch">
                {confirmarAlto ? (
                  <div role="alertdialog" aria-labelledby="rk-alto-q" className="rk-confirm">
                    <span id="rk-alto-q">
                      ¿Aprobar <b className="rk-num">{altas.length}</b> {altas.length === 1 ? "nota" : "notas"} por revisar con afinidad ≥{" "}
                      {UMBRAL_ALTO} %? Aparecerán en los informes públicos.
                    </span>
                    <button
                      type="button"
                      className="button-secondary rk-sm rk-approve"
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
                ) : (
                  <button type="button" className="rk-link" onClick={() => setConfirmarAlto(true)}>
                    Aprobar las de afinidad ≥ {UMBRAL_ALTO} % ({fmt(altas.length)})
                  </button>
                )}
              </div>
            )
          )}

          {lista.length === 0 ? (
            notas.length === 0 ? (
              <EmptyBlock
                title="Aún no hay noticias cargadas"
                hint="Busca las noticias de udes.edu.co: llegan aquí con los ODS que el sistema detectó, y puedes ir revisando mientras se cargan."
                action={
                  <button type="button" className="button-primary rk-sm" onClick={() => abrirPanel(true)}>
                    Buscar noticias
                  </button>
                }
              />
            ) : (
              <EmptyBlock title="Ninguna nota con este filtro." hint="Cambia el estado, el ODS o la búsqueda." />
            )
          ) : (
            <>
              <ul className="rk-rows">
                {lista.slice(0, visibles).map((n) => (
                  <Fila
                    key={n.id}
                    nota={n}
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
        </section>

        {activa ? (
          <Detalle
            key={activa.id}
            nota={activa}
            corrigiendo={corrigiendo}
            onCorregir={() => setCorrigiendo((v) => !v)}
            onDecidir={decidir}
            abierta={hoja}
            onCerrar={() => setHoja(false)}
          />
        ) : (
          <aside className="rk-detail rk-detail--empty" aria-label="Nota seleccionada">
            <p className="rk-hint">Elige una nota de la lista para revisarla.</p>
          </aside>
        )}
      </div>

      {/* ---------- Atajos y avisos ---------- */}
      <footer className="rk-keys">
        <p aria-label="Atajos de teclado">
          <kbd>J</kbd>/<kbd>K</kbd> mover · <kbd>A</kbd> aprobar · <kbd>D</kbd> descartar · <kbd>E</kbd> corregir ODS · <kbd>Z</kbd>{" "}
          deshacer · <kbd>/</kbd> buscar
        </p>
        <p className="rk-keys__msg" role="status" aria-live="polite">
          {aviso}
        </p>
      </footer>

      {panel && <CargaPanel onClose={() => abrirPanel(false)} />}
    </div>
  );
}

/* ---------- Riel ----------------------------------------------------------- */

function RielBoton({
  activo,
  onClick,
  conteo,
  numero,
  nombre,
  titulo,
}: {
  activo: boolean;
  onClick: () => void;
  conteo?: { pending: number; ok: number };
  numero?: number;
  nombre: string;
  titulo?: string;
}) {
  const pend = conteo?.pending ?? 0;
  const ok = conteo?.ok ?? 0;
  return (
    <button
      type="button"
      className={`rk-railbtn${numero ? "" : " rk-railbtn--plain"}${!pend && !ok ? " rk-railbtn--zero" : ""}`}
      style={numero ? odsVars(numero) : undefined}
      aria-pressed={activo}
      title={titulo}
      onClick={onClick}
    >
      <span className="rk-railbtn__strip" aria-hidden="true" />
      {numero && <span className="rk-railbtn__n rk-num">{numero}</span>}
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
  const principal = nota.ods[0]?.ods;
  const clase = `rk-photo${grande ? " rk-photo--big" : ""}`;
  if (nota.image_url && !rota) {
    return (
      <div className={clase}>
        <img src={nota.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} />
      </div>
    );
  }
  return (
    <div className={`${clase} rk-photo--empty`} style={principal ? odsVars(principal) : undefined} aria-hidden="true">
      <span>{principal ? principal : "—"}</span>
    </div>
  );
}

function Fila({
  nota,
  activa,
  marcada,
  onMarcar,
  onAbrir,
}: {
  nota: NewsItem;
  activa: boolean;
  marcada: boolean;
  onMarcar: (v: boolean) => void;
  onAbrir: () => void;
}) {
  const lugar = [nota.section, nota.campus].filter(Boolean).join(" · ");
  const mejor = mejorAfinidad(nota);
  return (
    <li id={`rk-row-${nota.id}`} className={`rk-row${activa ? " rk-row--active" : ""}`} data-state={nota.state}>
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
              {nota.ods.slice(0, 3).map((o) => (
                <span key={o.ods} className="rk-odsmark" style={odsVars(o.ods)}>
                  <span className="sr-only">ODS </span>
                  {o.ods}
                </span>
              ))}
              {nota.ods.length > 3 && <span className="rk-hint">+{nota.ods.length - 3}</span>}
              <span className="rk-row__pct rk-num">{nota.ods.length ? `${Math.round(mejor)} %` : "sin ODS"}</span>
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
  corrigiendo,
  onCorregir,
  onDecidir,
  abierta,
  onCerrar,
}: {
  nota: NewsItem;
  corrigiendo: boolean;
  onCorregir: () => void;
  onDecidir: (s: NewsState) => void;
  abierta: boolean;
  onCerrar: () => void;
}) {
  const ods = useToggleNewsOds();
  const activos = new Set(nota.ods.map((o) => o.ods));
  const lugar = [nota.section, nota.campus].filter(Boolean).join(" · ");
  return (
    <aside className="rk-detail" data-open={abierta || undefined} aria-labelledby="rk-detail-title">
      <button type="button" className="rk-icon-btn rk-detail__close" onClick={onCerrar} aria-label="Cerrar la nota">
        <Icon name="close" size={18} />
      </button>
      <Foto nota={nota} grande />
      <p className="rk-row__meta">
        {fechaCorta(nota.published_on)}
        {lugar && ` · ${lugar}`} · <span className={`rk-state rk-state--${nota.state}`}>{ESTADO_CORTO[nota.state]}</span>
      </p>
      <h2 id="rk-detail-title" className="rk-detail__title">
        <a href={nota.url} target="_blank" rel="noopener">
          {nota.title}
          <Icon name="external" size={14} aria-hidden="true" />
          <span className="sr-only"> (abre la nota original en una pestaña nueva)</span>
        </a>
      </h2>
      {nota.excerpt && <p className="rk-detail__excerpt">{nota.excerpt}</p>}

      <div className="rk-acts">
        {nota.state !== "ok" && (
          <button type="button" className="button-secondary rk-sm rk-approve" onClick={() => onDecidir("ok")}>
            Aprobar <kbd>A</kbd>
          </button>
        )}
        {nota.state !== "no" && (
          <button type="button" className="button-secondary rk-sm" onClick={() => onDecidir("no")}>
            Descartar <kbd>D</kbd>
          </button>
        )}
        {nota.state !== "pending" && (
          <button type="button" className="button-secondary rk-sm" onClick={() => onDecidir("pending")}>
            Volver a revisar
          </button>
        )}
      </div>

      <PropuestaDePilo nota={nota} />

      <h3 className="rk-detail__h">ODS detectados</h3>
      {nota.ods.length === 0 ? (
        <p className="rk-hint">El sistema no encontró ningún ODS claro. Agrégalo con «Corregir ODS».</p>
      ) : (
        <ul className="rk-det">
          {nota.ods.map((o) => (
            <li key={o.ods}>
              <div className="rk-det__line">
                <span className="rk-odsmark" style={odsVars(o.ods)}>
                  <span className="sr-only">ODS </span>
                  {o.ods}
                </span>
                <span className="rk-det__name">{odsCorto(o.ods)}</span>
                <span className="rk-bar" style={odsVars(o.ods)} aria-hidden="true">
                  <i style={{ width: `${Math.max(0, Math.min(100, o.score))}%` }} />
                </span>
                <span className="rk-det__score rk-num">{o.manual ? "manual" : `${Math.round(o.score)} %`}</span>
              </div>
              {(() => {
                const d = detalleOds(o);
                return (
                  <>
                    {d.indicador && <p className="rk-det__why">Indicador {d.indicador}</p>}
                    {o.reason && <p className="rk-det__why">{o.reason}</p>}
                    {o.by_ai || o.manual ? <p className="rk-hint">{d.origen}</p> : null}
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="rk-link" aria-expanded={corrigiendo} aria-controls="rk-fix" onClick={onCorregir}>
        {corrigiendo ? "Cerrar la corrección" : "Corregir ODS"} <kbd>E</kbd>
      </button>
      {corrigiendo && (
        <div className="rk-fix" id="rk-fix">
          <p className="rk-hint" id="rk-fix-hint">
            Marca o desmarca. Siempre queda al menos uno; los agregados quedan como «manual».
          </p>
          <div className="rk-chips" role="group" aria-labelledby="rk-fix-hint">
            {ODS_NUMEROS.map((k) => {
              const on = activos.has(k);
              const ultimo = on && activos.size === 1;
              return (
                <button
                  key={k}
                  type="button"
                  className="rk-chip"
                  style={odsVars(k)}
                  aria-pressed={on}
                  aria-disabled={ultimo || ods.isPending || undefined}
                  aria-label={`ODS ${k}: ${odsNombre(k)}${ultimo ? " (no se puede quitar el único ODS)" : ""}`}
                  title={ultimo ? "Una nota necesita al menos un ODS" : odsNombre(k)}
                  data-saving={(ods.isPending && ods.variables?.ods === k) || undefined}
                  onClick={() => {
                    if (ultimo || ods.isPending) return;
                    ods.mutate({ id: nota.id, ods: k, on: !on });
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>
          {ods.error && (
            <p className="rk-error" role="alert">
              No se guardó: {ods.error.message}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
