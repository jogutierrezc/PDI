/* =============================================================================
   Datos de Sostenibilidad · Tableros.

   Tableros personalizados: la persona arma una cuadrícula de 12 columnas con
   indicadores del catálogo, gráficas de la unidad, títulos, textos y
   separadores, ve cómo quedará (los mismos componentes del portal, con los
   datos calculados aquí) y la publica en /sostenible/tablero/:slug o la incrusta
   en el CMS. Ver: todas las personas con acceso. Crear, editar y publicar: papel
   Crea o más en la unidad. Archivar y borrar: quien lo creó o Administra. La
   base lo hace cumplir; la pantalla solo lo refleja.

   Dos vistas en la misma sección: la lista (/tableros) y el constructor
   (/tableros/:id). Movimiento: lo de movimiento.ts, nada por teclado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../lib/auth";
import { CAMPUSES } from "../../sostenible/data";
import { TableroVista, campusValido } from "../../sostenible/TableroSos";
import "../../sostenible/sostenible.css";
import { configDe, slugDe, urlTablero, useArchivarTablero, useBorrarTablero, useGuardarTablero, usePublicarTablero, useTableros } from "../tableros";
import type { AnchoTablero, ConfigTablero, ElementoTablero, EstiloElemento, TableroSos, TipoElementoTablero } from "../tipos";
import { cambiar, entrar } from "./movimiento";
import { AvisoSos, ErrorSos, Interruptor } from "./piezas";
import { useAccesoSos } from "./usos";
import { useDatosPublicados } from "./vistaPrevia";

const BASE = "/admin/datos-sostenibilidad/tableros";

const ANCHOS: { id: AnchoTablero; etiqueta: string }[] = [
  { id: 3, etiqueta: "3 de 12 · un cuarto" },
  { id: 4, etiqueta: "4 de 12 · un tercio" },
  { id: 6, etiqueta: "6 de 12 · la mitad" },
  { id: 8, etiqueta: "8 de 12 · dos tercios" },
  { id: 12, etiqueta: "12 de 12 · todo el ancho" },
];

const ESTILOS: { id: EstiloElemento; etiqueta: string }[] = [
  { id: "tarjeta", etiqueta: "Tarjeta" },
  { id: "compacta", etiqueta: "Compacta" },
  { id: "grande", etiqueta: "Grande" },
];

const TIPOS: Record<TipoElementoTablero, { etiqueta: string; icono: "spark-chart" | "chart" | "pen" | "document" | "rows" }> = {
  indicador: { etiqueta: "Indicador", icono: "spark-chart" },
  grafica: { etiqueta: "Gráfica", icono: "chart" },
  titulo: { etiqueta: "Título", icono: "pen" },
  texto: { etiqueta: "Texto", icono: "document" },
  separador: { etiqueta: "Separador", icono: "rows" },
};

const idNuevo = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14));

/** Un enlace libre: si ya lo usa otro tablero, se le suma -2, -3… */
function slugLibre(base: string, usados: Set<string>): string {
  let s = base;
  for (let n = 2; usados.has(s); n++) s = `${base.slice(0, 56)}-${n}`;
  return s;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

/* ---------- Entrada de la sección --------------------------------------------------------------------- */

export function Tableros({ acceso, id }: { acceso: ReturnType<typeof useAccesoSos>; id?: string }) {
  return id ? <Constructor key={id} id={id} acceso={acceso} /> : <Lista acceso={acceso} />;
}

/* ---------- La lista -------------------------------------------------------------------------------------- */

function Lista({ acceso }: { acceso: ReturnType<typeof useAccesoSos> }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const q = useTableros();
  const guardar = useGuardarTablero();
  const archivar = useArchivarTablero();
  const borrar = useBorrarTablero();
  const raiz = useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const todos = q.data ?? [];
  const usados = useMemo(() => new Set(todos.map((t) => t.slug)), [todos]);
  const visibles = todos.filter((t) => t.archivado === verArchivados);
  const puede = (t: TableroSos) => acceso.administra || t.creado_por === profile?.id;

  useEffect(() => {
    if (q.isSuccess) entrar(raiz.current, ".dsx-tab-card");
  }, [q.isSuccess]);

  const crear = () => {
    const n = (nombre ?? "").trim();
    if (!n) return setError("Escriba un nombre para el tablero.");
    setError(null);
    guardar.mutate(
      { nombre: n, slug: slugLibre(slugDe(n), usados), descripcion: "", config: configDe(null) },
      { onSuccess: (t) => navigate(`${BASE}/${t.id}`), onError: (e) => setError(e.message) },
    );
  };

  const duplicar = (t: TableroSos) => {
    setError(null);
    const copia = `${t.nombre} (copia)`.slice(0, 120);
    guardar.mutate({ nombre: copia, slug: slugLibre(slugDe(copia), usados), descripcion: t.descripcion, config: t.config }, { onSuccess: (n) => navigate(`${BASE}/${n.id}`), onError: (e) => setError(e.message) });
  };

  const copiar = async (t: TableroSos) => {
    try {
      await navigator.clipboard.writeText(urlTablero(t.slug));
      setCopiado(t.id);
      window.setTimeout(() => setCopiado((c) => (c === t.id ? null : c)), 2000);
    } catch {
      setError(`No pude copiar el enlace. Cópielo a mano: ${urlTablero(t.slug)}`);
    }
  };

  return (
    <div ref={raiz} className="dsx-pagina">
      <div className="dsx-cab">
        <div>
          <h2>Tableros</h2>
          <p className="dsx-sub">Arme tableros con indicadores y gráficas del portal, publíquelos con su propio enlace o muéstrelos en el CMS de Sostenibilidad.</p>
        </div>
        {acceso.crea ? (
          <button type="button" className="es-btn es-btn--pri" aria-expanded={nombre !== null} onClick={() => setNombre(nombre === null ? "" : null)}>
            <Icon name="plus" size={16} />
            Nuevo tablero
          </button>
        ) : null}
      </div>
      {!acceso.crea ? <AvisoSos>Ve los tableros en solo lectura: crearlos y publicarlos pide el papel Crea o más en la unidad Datos de Sostenibilidad.</AvisoSos> : null}

      {nombre !== null && acceso.crea ? (
        <form
          className="dsx-form"
          aria-label="Nuevo tablero"
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
        >
          <label className="es-fl">
            Nombre del tablero
            <input className="es-inp" autoFocus value={nombre} maxLength={120} placeholder="Por ejemplo, Campus verde 2025" onChange={(e) => setNombre(e.target.value)} />
          </label>
          <div className="dsx-form__pie">
            <button type="submit" className="es-btn es-btn--pri" disabled={guardar.isPending}>
              {guardar.isPending ? "Creando…" : "Crear y abrir"}
            </button>
            <button type="button" className="es-btn" onClick={() => setNombre(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {q.error ? <ErrorSos error={q.error} /> : null}
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}
      {q.isPending ? <p className="admin-loading">Cargando los tableros…</p> : null}

      {q.isSuccess ? (
        <Interruptor marcado={verArchivados} onChange={setVerArchivados}>
          Ver los archivados ({todos.filter((t) => t.archivado).length})
        </Interruptor>
      ) : null}

      {q.isSuccess && !visibles.length ? (
        <div className="es-empty">
          <b>{verArchivados ? "No hay tableros archivados" : "Todavía no hay tableros"}</b>
          <span>{verArchivados ? "Aquí aparecen los que archive." : acceso.crea ? "Cree el primero con «Nuevo tablero»." : "Quien tenga el papel Crea o más en la unidad puede crear el primero."}</span>
        </div>
      ) : null}

      <div className="dsx-tab-lista">
        {visibles.map((t) => (
          <article key={t.id} className="dsx-tab-card" aria-label={t.nombre}>
            <div className="dsx-tab-card__cab">
              <h3>{t.nombre}</h3>
              <span className="dsx-chip" data-t={t.archivado ? "aviso" : t.publicado ? "ok" : undefined}>
                {t.archivado ? "Archivado" : t.publicado ? "Publicado" : "Borrador"}
              </span>
            </div>
            {t.descripcion ? <p className="dsx-sub">{t.descripcion}</p> : null}
            <small className="dsx-tenue">
              <span className="dsx-mono">/sostenible/tablero/{t.slug}</span> · {t.config.elementos.length} {t.config.elementos.length === 1 ? "elemento" : "elementos"} · editado {fecha(t.updated_at)}
            </small>
            <div className="dsx-tab-card__acciones">
              <Link className="es-btn es-btn--sm" to={`${BASE}/${t.id}`}>
                <Icon name="pen" size={14} />
                {puede(t) || acceso.crea ? "Editar" : "Ver"}
              </Link>
              {acceso.crea ? (
                <button type="button" className="es-btn es-btn--sm es-btn--ghost" disabled={guardar.isPending} onClick={() => duplicar(t)}>
                  Duplicar
                </button>
              ) : null}
              {t.publicado ? (
                <>
                  <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => void copiar(t)}>
                    <Icon name="link" size={14} />
                    {copiado === t.id ? "Enlace copiado" : "Copiar enlace"}
                  </button>
                  <a className="es-btn es-btn--sm es-btn--ghost" href={`/sostenible/tablero/${t.slug}`} target="_blank" rel="noreferrer">
                    <Icon name="external" size={14} />
                    Ver en el portal
                  </a>
                </>
              ) : null}
              {puede(t) ? (
                <button
                  type="button"
                  className="es-btn es-btn--sm es-btn--ghost"
                  disabled={archivar.isPending}
                  onClick={() => {
                    setError(null);
                    archivar.mutate({ id: t.id, archivado: !t.archivado }, { onError: (e) => setError(e.message) });
                  }}
                >
                  {t.archivado ? "Restaurar" : "Archivar"}
                </button>
              ) : null}
              {t.archivado && puede(t) ? (
                <button
                  type="button"
                  className="es-btn es-btn--sm es-btn--ghost dsx-peligro"
                  disabled={borrar.isPending}
                  onClick={() => {
                    if (!window.confirm(`¿Borrar «${t.nombre}» para siempre? Esto no se puede deshacer.`)) return;
                    setError(null);
                    borrar.mutate(t.id, { onError: (e) => setError(e.message) });
                  }}
                >
                  <Icon name="trash" size={14} />
                  Borrar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------- El constructor --------------------------------------------------------------------------------- */

interface Borrador {
  nombre: string;
  slug: string;
  descripcion: string;
  config: ConfigTablero;
}

const firmaDe = (b: Borrador) => JSON.stringify(b);

function Constructor({ id, acceso }: { id: string; acceso: ReturnType<typeof useAccesoSos> }) {
  const q = useTableros();
  const t = q.data?.find((x) => x.id === id);
  if (q.error) return <ErrorSos error={q.error} />;
  if (q.isPending) return <p className="admin-loading">Abriendo el tablero…</p>;
  if (!t)
    return (
      <div className="dsx-pagina">
        <AvisoSos>No encuentro ese tablero. Puede que lo hayan borrado o que no tenga acceso.</AvisoSos>
        <Link className="es-btn" to={BASE}>
          <Icon name="arrow-left" size={14} />
          Volver a los tableros
        </Link>
      </div>
    );
  // La clave por versión guardada reinicia el borrador cuando llega un cambio ajeno al editor (publicar, archivar).
  return <Editor key={`${t.id}:${t.archivado}`} t={t} acceso={acceso} />;
}

function Editor({ t, acceso }: { t: TableroSos; acceso: ReturnType<typeof useAccesoSos> }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const todos = useTableros().data ?? [];
  const guardar = useGuardarTablero();
  const publicar = usePublicarTablero();
  const archivar = useArchivarTablero();
  const datos = useDatosPublicados(acceso.unidad?.carpeta_raiz);
  const raiz = useRef<HTMLDivElement>(null);

  const inicial = useMemo<Borrador>(() => ({ nombre: t.nombre, slug: t.slug, descripcion: t.descripcion, config: t.config }), [t]);
  const [b, setB] = useState<Borrador>(inicial);
  const [guardado, setGuardado] = useState(firmaDe(inicial));
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [agregando, setAgregando] = useState<"indicador" | "grafica" | null>(null);
  const [refElegida, setRefElegida] = useState("");
  const [arrastrado, setArrastrado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const sucio = firmaDe(b) !== guardado;
  const puedeEditar = acceso.crea || t.creado_por === profile?.id;
  const puedeArchivar = acceso.administra || t.creado_por === profile?.id;
  const editable = puedeEditar && !t.archivado;
  const els = b.config.elementos;

  useEffect(() => {
    entrar(raiz.current);
  }, []);

  const cambiarConfig = (f: (c: ConfigTablero) => ConfigTablero) => setB((x) => ({ ...x, config: f(x.config) }));
  const cambiarEl = (elId: string, cambio: Partial<ElementoTablero>) => cambiarConfig((c) => ({ ...c, elementos: c.elementos.map((e) => (e.id === elId ? { ...e, ...cambio } : e)) }));
  const mover = (de: number, a: number) =>
    cambiarConfig((c) => {
      if (a < 0 || a >= c.elementos.length || de === a) return c;
      const lista = [...c.elementos];
      const [x] = lista.splice(de, 1);
      lista.splice(a, 0, x!);
      return { ...c, elementos: lista };
    });

  /* --- Lo que se puede elegir y lo que el público vería --- */
  const catalogo = datos.catalogo;
  const indicadorDe = (ref?: string) => catalogo.find((i) => i.id === ref);
  const graficaDe = (ref?: string) => datos.graficasUnidad.find((g) => g.id === ref);
  const cifrasIds = useMemo(() => new Set(datos.cifras.map((c) => c.id)), [datos.cifras]);
  const grafIds = useMemo(() => new Set(datos.graficas.map((g) => g.id)), [datos.graficas]);

  /** Por qué un elemento no saldría en el portal; nulo si saldría (o si aún se calcula). */
  const avisoDe = (e: ElementoTablero): string | null => {
    if (e.tipo === "indicador") {
      const i = indicadorDe(e.ref);
      if (!i) return datos.cargando ? null : "Este indicador ya no existe en el catálogo y no saldrá.";
      if (i.archivado) return "Este indicador está archivado y no saldrá.";
      if (!i.publicado) return "Este indicador no está publicado y no saldrá. Publíquelo en Indicadores.";
      if (!datos.cargando && !cifrasIds.has(i.id)) return "Sin datos: la tabla aún no trae cifras con valor y año. Hoy no saldría en el portal.";
      return null;
    }
    if (e.tipo === "grafica") {
      const g = graficaDe(e.ref);
      if (!g) return datos.cargando ? null : "Esta gráfica ya no existe y no saldrá.";
      if (!datos.publicadas.get(g.id)?.publicado) return "Esta gráfica no está publicada y no saldrá. Publíquela en el editor de la gráfica o en Portal de sostenibilidad.";
      if (!datos.cargando && !grafIds.has(g.id)) return "Esta gráfica no se puede publicar (dispersión, burbujas, columnas personales o sin tabla) y no saldrá.";
    }
    return null;
  };

  const ausentes = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of els) {
      const a = e.tipo === "indicador" || e.tipo === "grafica" ? avisoDe(e) : null;
      if (a) m[e.id] = a;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisoDe depende de lo que ya cuenta como dato de la vista
  }, [els, catalogo, datos.graficasUnidad, datos.publicadas, cifrasIds, grafIds, datos.cargando]);

  const nombreDe = (e: ElementoTablero): string => {
    if (e.tipo === "indicador") return indicadorDe(e.ref)?.nombre ?? e.ref ?? "Indicador";
    if (e.tipo === "grafica") return graficaDe(e.ref)?.nombre ?? "Gráfica";
    if (e.tipo === "titulo") return e.titulo?.trim() || "Título";
    if (e.tipo === "texto") return e.titulo?.trim() || (e.opciones?.texto ?? "").slice(0, 40) || "Texto";
    return "Separador";
  };

  /* --- Agregar --- */
  const agregar = (tipo: TipoElementoTablero, ref?: string) => {
    const base: Record<TipoElementoTablero, Omit<ElementoTablero, "id" | "tipo">> = {
      indicador: { ref, ancho: 4, estilo: "tarjeta" },
      grafica: { ref, ancho: 6 },
      titulo: { ancho: 12, titulo: "Nueva sección" },
      texto: { ancho: 12, opciones: { texto: "" } },
      separador: { ancho: 12 },
    };
    const nuevo: ElementoTablero = { id: idNuevo(), tipo, ...base[tipo] };
    cambiarConfig((c) => ({ ...c, elementos: [...c.elementos, nuevo] }));
    setSeleccion(nuevo.id);
    setAgregando(null);
    setRefElegida("");
  };

  /* --- Guardar, publicar, archivar --- */
  const guardarAhora = () => {
    setError(null);
    const slug = b.slug.trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2) return setError("El enlace lleva minúsculas, números y guiones, sin espacios (por ejemplo campus-verde).");
    if (todos.some((x) => x.slug === slug && x.id !== t.id)) return setError(`Ya existe un tablero con el enlace «${slug}». Elija otro.`);
    if (!b.nombre.trim()) return setError("El tablero necesita un nombre.");
    guardar.mutate(
      { id: t.id, nombre: b.nombre, slug, descripcion: b.descripcion, config: b.config },
      {
        onSuccess: (n) => {
          const sig = { nombre: n.nombre, slug: n.slug, descripcion: n.descripcion, config: n.config };
          setB(sig);
          setGuardado(firmaDe(sig));
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(urlTablero(t.slug));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError(`No pude copiar el enlace. Cópielo a mano: ${urlTablero(t.slug)}`);
    }
  };

  /* --- Arrastrar y teclado --- */
  const alSoltar = (e: DragEvent<HTMLLIElement>, a: number) => {
    e.preventDefault();
    const de = els.findIndex((x) => x.id === arrastrado);
    setArrastrado(null);
    if (de >= 0) mover(de, a);
  };
  const alTeclear = (e: KeyboardEvent<HTMLLIElement>, i: number) => {
    // Alt + flechas mueve el elemento (el foco se queda en él: la fila conserva su clave).
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    mover(i, e.key === "ArrowUp" ? i - 1 : i + 1);
  };

  const elegirDesdeLienzo = (elId: string) => {
    setSeleccion(elId);
    document.getElementById(`dsx-el-${elId}`)?.scrollIntoView({ block: "nearest" });
  };

  const opcionesIndicador = catalogo.filter((i) => !i.archivado);
  const url = urlTablero(b.slug);
  const lectura = !editable;

  return (
    <div ref={raiz} className="dsx-pagina">
      <div className="dsx-cab">
        <div>
          <Link className="dsx-enlace" to={BASE}>
            ← Tableros
          </Link>
          <h2>{b.nombre || "Tablero sin nombre"}</h2>
          <p className="dsx-sub">
            <span className="dsx-mono">/sostenible/tablero/{b.slug}</span>
          </p>
        </div>
        <div className="dsx-tab-cab__acciones">
          {sucio ? (
            <span className="dsx-chip" data-t="aviso" role="status">
              Cambios sin guardar
            </span>
          ) : (
            <span className="dsx-chip" data-t={t.publicado ? "ok" : undefined}>
              {t.archivado ? "Archivado" : t.publicado ? "Publicado" : "Borrador"}
            </span>
          )}
          {editable ? (
            <button type="button" className="es-btn es-btn--pri" disabled={!sucio || guardar.isPending} onClick={guardarAhora}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
          ) : null}
        </div>
      </div>

      {t.archivado ? <AvisoSos>Este tablero está archivado: no se publica y no se puede editar. Restáurelo desde la lista o aquí abajo.</AvisoSos> : null}
      {!puedeEditar && !t.archivado ? <AvisoSos>Lo ve en solo lectura: editarlo pide el papel Crea o más en la unidad, o haberlo creado.</AvisoSos> : null}
      {datos.error ? <ErrorSos error={datos.error} /> : null}
      {error ? <AvisoSos tipo="error">{error}</AvisoSos> : null}

      <div className="dsx-dividido dsx-dividido--ancho">
        {/* --- La vista previa fiel --- */}
        <div>
          <div className="dsx-barra">
            <span className="dsx-chip" data-t="acento">
              Vista previa en vivo
            </span>
            {datos.cargando ? <span className="dsx-tenue">Calculando…</span> : null}
          </div>
          <div className="dsx-navegador">
            <div className="dsx-navegador__url">
              <Icon name="pin" size={14} />
              <span>planeacion.udes.edu.co/sostenible/tablero/{b.slug}</span>
            </div>
            <div className="sos dsx-previa" data-tablero="">
              <div className="dsx-previa__cab">
                <p className="sos-eyebrow sos-eyebrow--on-dark">Datos de sostenibilidad</p>
                <h3>{b.nombre || "Tablero sin nombre"}</h3>
                {b.descripcion ? <p className="dsx-previa__desc">{b.descripcion}</p> : null}
              </div>
              <div className="dsx-previa__cuerpo">
                {els.length ? (
                  <TableroVista
                    elementos={els}
                    cifras={datos.cifras}
                    graficas={datos.graficas}
                    campus={b.config.campus}
                    selector={b.config.selector}
                    ausentes={ausentes}
                    seleccionado={seleccion}
                    onElegir={elegirDesdeLienzo}
                    etiqueta={`Vista previa de ${b.nombre}`}
                  />
                ) : (
                  <p className="dsx-previa__nota">El tablero está vacío. Agregue elementos con «Agregar elemento».</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- Los controles --- */}
        <div className="dsx-tab-ctl">
          <div className="dsx-tarjeta">
            <b>Publicación</b>
            <Interruptor
              marcado={t.publicado}
              disabled={!acceso.crea || sucio || t.archivado || publicar.isPending}
              titulo={sucio ? "Guarde los cambios antes de publicar" : !acceso.crea ? "Publicar pide el papel Crea o más en la unidad" : undefined}
              onChange={(p) => {
                setError(null);
                publicar.mutate({ id: t.id, publicado: p }, { onError: (e) => setError(e.message) });
              }}
            >
              Publicado en el portal
            </Interruptor>
            {sucio && !t.publicado ? <p className="dsx-tenue">Guarde los cambios para poder publicar.</p> : null}
            {t.publicado ? (
              <div className="dsx-tab-enlace">
                <input className="es-inp dsx-mono" readOnly value={url} aria-label="Enlace público del tablero" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="es-btn es-btn--sm" onClick={() => void copiar()}>
                  <Icon name="link" size={14} />
                  {copiado ? "Copiado" : "Copiar"}
                </button>
                <a className="es-btn es-btn--sm es-btn--ghost" href={`/sostenible/tablero/${t.slug}`} target="_blank" rel="noreferrer">
                  <Icon name="external" size={14} />
                  Abrir
                </a>
              </div>
            ) : (
              <p className="dsx-tenue">Mientras no se publique, el enlace público no existe.</p>
            )}
            {puedeArchivar ? (
              <button
                type="button"
                className="es-btn es-btn--sm es-btn--ghost"
                disabled={archivar.isPending || (sucio && !t.archivado)}
                onClick={() => {
                  setError(null);
                  archivar.mutate({ id: t.id, archivado: !t.archivado }, { onSuccess: () => (t.archivado ? undefined : navigate(BASE)), onError: (e) => setError(e.message) });
                }}
              >
                {t.archivado ? "Restaurar el tablero" : "Archivar el tablero"}
              </button>
            ) : null}
          </div>

          <fieldset className="dsx-tab-fs" disabled={lectura}>
            <legend className="dsx-sr">Datos del tablero</legend>
            <label className="es-fl">
              Nombre
              <input className="es-inp" value={b.nombre} maxLength={120} onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))} />
            </label>
            <label className="es-fl">
              Enlace
              <input
                className="es-inp dsx-mono"
                value={b.slug}
                maxLength={60}
                disabled={t.publicado}
                onChange={(e) => setB((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }))}
              />
              <span className="dsx-tenue">{t.publicado ? "Retire el tablero para cambiar su enlace." : "Minúsculas, números y guiones."}</span>
            </label>
            <label className="es-fl">
              Descripción (opcional)
              <input className="es-inp" value={b.descripcion} maxLength={400} onChange={(e) => setB((x) => ({ ...x, descripcion: e.target.value }))} />
            </label>
            <label className="es-fl">
              Campus con que abre
              <select className="es-inp" value={campusValido(b.config.campus)} onChange={(e) => cambiarConfig((c) => ({ ...c, campus: e.target.value }))}>
                {CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c === "Todos" ? "Todos los campus" : c}
                  </option>
                ))}
              </select>
            </label>
            <Interruptor marcado={b.config.selector === true} onChange={(v) => cambiarConfig((c) => ({ ...c, selector: v }))} disabled={lectura}>
              Mostrar el selector de campus a quien lo ve
            </Interruptor>
          </fieldset>

          <div className="dsx-tarjeta">
            <div className="dsx-tab-cab2">
              <b>Elementos ({els.length})</b>
              {editable ? (
                <details className="dsx-tab-menu">
                  <summary className="es-btn es-btn--sm es-btn--pri">
                    <Icon name="plus" size={14} />
                    Agregar elemento
                  </summary>
                  <div className="dsx-tab-menu__lista" role="menu">
                    {(Object.keys(TIPOS) as TipoElementoTablero[]).map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.currentTarget.closest("details")?.removeAttribute("open");
                          if (tipo === "indicador" || tipo === "grafica") {
                            setAgregando(tipo);
                            setRefElegida("");
                          } else agregar(tipo);
                        }}
                      >
                        <Icon name={TIPOS[tipo].icono} size={14} />
                        {TIPOS[tipo].etiqueta}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>

            {agregando && editable ? (
              <AgregarRef
                tipo={agregando}
                valor={refElegida}
                onValor={setRefElegida}
                indicadores={opcionesIndicador.map((i) => ({ id: i.id, texto: `${i.nombre}${i.archivado ? "" : i.publicado ? "" : " (sin publicar: no saldrá)"}` }))}
                graficas={datos.graficasUnidad.map((g) => ({ id: g.id, texto: `${g.nombre}${datos.publicadas.get(g.id)?.publicado ? "" : " (sin publicar: no saldrá)"}` }))}
                cargando={datos.cargando}
                onAgregar={() => refElegida && agregar(agregando, refElegida)}
                onCancelar={() => setAgregando(null)}
              />
            ) : null}

            {!els.length ? <p className="dsx-tenue">Sin elementos. Agregue indicadores, gráficas, títulos o textos.</p> : null}
            <ol className="dsx-tab-els" aria-label="Elementos del tablero, en orden">
              {els.map((e, i) => {
                const aviso = e.tipo === "indicador" || e.tipo === "grafica" ? avisoDe(e) : null;
                return (
                  <li
                    key={e.id}
                    id={`dsx-el-${e.id}`}
                    className="dsx-tab-el"
                    data-sel={seleccion === e.id ? "" : undefined}
                    data-arrastrando={arrastrado === e.id ? "" : undefined}
                    draggable={editable}
                    onDragStart={() => setArrastrado(e.id)}
                    onDragEnd={() => setArrastrado(null)}
                    onDragOver={(ev) => editable && ev.preventDefault()}
                    onDrop={(ev) => alSoltar(ev, i)}
                    onKeyDown={(ev) => editable && alTeclear(ev, i)}
                    onFocus={() => setSeleccion(e.id)}
                  >
                    <div className="dsx-tab-el__cab">
                      <span className="dsx-tab-el__asa" aria-hidden="true" title="Arrastre para reordenar">
                        <Icon name="grip" size={14} />
                      </span>
                      <Icon name={TIPOS[e.tipo].icono} size={14} />
                      <span className="dsx-tab-el__nombre">
                        <small>{TIPOS[e.tipo].etiqueta}</small>
                        {nombreDe(e)}
                      </span>
                      {editable ? (
                        <span className="dsx-tab-el__botones">
                          <button type="button" className="dsx-ib" aria-label={`Subir ${nombreDe(e)}`} title="Subir (Alt + flecha arriba)" disabled={i === 0} onClick={() => mover(i, i - 1)}>
                            <Icon name="chevron-down" size={14} className="dsx-ico-arriba" />
                          </button>
                          <button type="button" className="dsx-ib" aria-label={`Bajar ${nombreDe(e)}`} title="Bajar (Alt + flecha abajo)" disabled={i === els.length - 1} onClick={() => mover(i, i + 1)}>
                            <Icon name="chevron-down" size={14} />
                          </button>
                          <button type="button" className="dsx-ib dsx-peligro" aria-label={`Quitar ${nombreDe(e)}`} onClick={() => cambiarConfig((c) => ({ ...c, elementos: c.elementos.filter((x) => x.id !== e.id) }))}>
                            <Icon name="trash" size={14} />
                          </button>
                        </span>
                      ) : null}
                    </div>
                    {aviso ? (
                      <p className="dsx-aviso" data-t="aviso" role="note">
                        <Icon name="alert" size={14} />
                        <span>{aviso}</span>
                      </p>
                    ) : null}
                    <fieldset className="dsx-tab-el__campos" disabled={lectura}>
                      <legend className="dsx-sr">Opciones de {nombreDe(e)}</legend>
                      <label>
                        <span>Ancho</span>
                        <select className="es-inp" value={e.ancho} onChange={(ev) => cambiarEl(e.id, { ancho: Number(ev.target.value) as AnchoTablero })}>
                          {ANCHOS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.etiqueta}
                            </option>
                          ))}
                        </select>
                      </label>
                      {e.tipo === "indicador" ? (
                        <label>
                          <span>Estilo</span>
                          <select className="es-inp" value={e.estilo ?? "tarjeta"} onChange={(ev) => cambiarEl(e.id, { estilo: ev.target.value as EstiloElemento })}>
                            {ESTILOS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.etiqueta}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {e.tipo !== "separador" ? (
                        <label className="dsx-tab-el__ancha">
                          <span>{e.tipo === "titulo" ? "Texto del título" : "Título propio (opcional)"}</span>
                          <input className="es-inp" value={e.titulo ?? ""} maxLength={200} placeholder={e.tipo === "indicador" || e.tipo === "grafica" ? "Usa el nombre original" : ""} onChange={(ev) => cambiarEl(e.id, { titulo: ev.target.value })} />
                        </label>
                      ) : null}
                      {e.tipo === "texto" ? (
                        <label className="dsx-tab-el__ancha">
                          <span>Texto</span>
                          <textarea className="es-inp" rows={4} maxLength={2000} value={e.opciones?.texto ?? ""} onChange={(ev) => cambiarEl(e.id, { opciones: { ...e.opciones, texto: ev.target.value } })} />
                        </label>
                      ) : null}
                    </fieldset>
                  </li>
                );
              })}
            </ol>
            {editable && els.length > 1 ? <p className="dsx-tenue">Reordene arrastrando, con los botones, o con Alt + flecha arriba o abajo.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Elegir el indicador o la gráfica a agregar ---------------------------------------------------- */

function AgregarRef({
  tipo,
  valor,
  onValor,
  indicadores,
  graficas,
  cargando,
  onAgregar,
  onCancelar,
}: {
  tipo: "indicador" | "grafica";
  valor: string;
  onValor: (v: string) => void;
  indicadores: { id: string; texto: string }[];
  graficas: { id: string; texto: string }[];
  cargando: boolean;
  onAgregar: () => void;
  onCancelar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const opciones = tipo === "indicador" ? indicadores : graficas;
  useEffect(() => {
    if (caja.current) cambiar(caja.current);
  }, []);
  return (
    <div ref={caja} className="dsx-tab-agregar">
      <label className="es-fl">
        {tipo === "indicador" ? "Indicador del catálogo" : "Gráfica de la unidad"}
        <select className="es-inp" value={valor} onChange={(e) => onValor(e.target.value)}>
          <option value="">{cargando ? "Cargando…" : opciones.length ? "Elija uno" : tipo === "indicador" ? "No hay indicadores en el catálogo" : "No hay gráficas en la unidad"}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      <div className="dsx-form__pie">
        <button type="button" className="es-btn es-btn--sm es-btn--pri" disabled={!valor} onClick={onAgregar}>
          Agregar
        </button>
        <button type="button" className="es-btn es-btn--sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
