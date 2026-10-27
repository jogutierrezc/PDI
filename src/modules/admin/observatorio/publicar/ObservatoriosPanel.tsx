/* =============================================================================
   Observatorio · panel «Observatorios» (O2).

   Lista de observatorios con su identidad y estado; dentro de uno, los temas
   por LÍNEAS (arrastre con puntero y tacto, o asa enfocada con flechas, o los
   botones del menú), la vista previa de la portada pública y las pestañas de
   identidad y responsables. Todo lo escribe la base por RLS y funciones (0230,
   0231, 0234): aquí solo se oculta lo que el rol no puede.

   Ruta: /admin/observatorio/observatorios[/<enlace>]?tab=temas|portada|identidad|responsables
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../../components/ui/Icon";
import type { IconName } from "../../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../../components/ui/QueryState";
import { supabase } from "../../../../lib/supabase";
import { SelectorPersona } from "../../components/SelectorPersona";
import { useProfiles } from "../../../tableros/store";
import { FaltaMigracion, useCrearObservatorio, useEditarObservatorios, useInsertados, useLineas, useMoverTema, useObservatorios, useResponsables, useTemas } from "./api";
import type { EstadoObservatorio, Linea, Observatorio, Tema } from "./api";
import { usePermisosObservatorio } from "./permisos";
import { Chip, COLORES_OBS, Confirmar, Dialogo, EstadoMigracion, ICONOS_OBS, Ico, MenuAcciones, Seg, Vacio, codigoDe, nombreColor, slugify, useAvisos, useCascada, useFlip } from "./ui";
import "./obsx.css";

export const rutaPublica = (o: Pick<Observatorio, "principal" | "slug">) => (o.principal ? "/datos-abiertos/observatorio" : `/datos-abiertos/observatorio/o/${o.slug}`);
const ETIQUETA_ESTADO: Record<EstadoObservatorio, string> = { borrador: "Borrador", publicado: "Publicado", archivado: "Archivado" };
const iconoDe = (n: string): IconName => ((ICONOS_OBS as readonly string[]).includes(n) ? (n as IconName) : "spark-chart");

function ChipEstado({ estado }: { estado: EstadoObservatorio }) {
  return (
    <Chip tono={estado === "publicado" ? "ok" : undefined} icono={<Icon name={estado === "publicado" ? "check" : estado === "archivado" ? "folder" : "pen"} size={13} />}>
      {ETIQUETA_ESTADO[estado]}
    </Chip>
  );
}

function Baldosa({ o }: { o: Pick<Observatorio, "color" | "icono"> }) {
  return (
    <span className="obsx-baldosa" style={{ background: o.color }} aria-hidden="true">
      <Icon name={iconoDe(o.icono)} size={20} />
    </span>
  );
}

/** Conteos para la lista: temas, publicados e insertados vivos por observatorio. Sin las tablas, vacío. */
function useConteos() {
  return useQuery({
    queryKey: ["obs-conteos"],
    staleTime: 20_000,
    queryFn: async () => {
      const [t, i, r] = await Promise.all([
        supabase.from("obs_topics").select("observatorio_id,status,archivado"),
        supabase.from("obs_insertados").select("observatorio_id,estado"),
        supabase.from("obs_responsables").select("observatorio_id"),
      ]);
      const por = new Map<string, { temas: number; publicados: number; insertados: number; responsables: number }>();
      const dato = (id: string) => por.get(id) ?? por.set(id, { temas: 0, publicados: 0, insertados: 0, responsables: 0 }).get(id)!;
      for (const x of (t.data ?? []) as { observatorio_id: string; status: string; archivado: boolean }[]) {
        if (x.archivado) continue;
        dato(x.observatorio_id).temas += 1;
        if (x.status === "publicado") dato(x.observatorio_id).publicados += 1;
      }
      for (const x of (i.data ?? []) as { observatorio_id: string; estado: string }[]) if (x.estado !== "revocado") dato(x.observatorio_id).insertados += 1;
      for (const x of (r.data ?? []) as { observatorio_id: string }[]) dato(x.observatorio_id).responsables += 1;
      return por;
    },
  });
}

/* =============================================================================
   Raíz del panel
   ========================================================================== */

export function ObservatoriosPanel() {
  const { topic: enlace } = useParams();
  const permisos = usePermisosObservatorio();
  const lista = useObservatorios();
  const conteos = useConteos();
  const [crear, setCrear] = useState(false);
  const { decir, nodo } = useAvisos();
  const navigate = useNavigate();
  const visibles = useMemo(() => (lista.data ?? []).filter((o) => permisos.tiene("obs_observatorios", o.id)), [lista.data, permisos]);
  const abierto = visibles.find((o) => o.slug === enlace);
  const puedeCrear = permisos.puede("obs_observatorios", null, "administrar") && permisos.todos;

  if (lista.isPending) return <LoadingBlock rows={4} label="Cargando los observatorios" />;
  if (lista.isError) return lista.error instanceof FaltaMigracion ? <EstadoMigracion error={lista.error} /> : <ErrorBlock error={lista.error} onRetry={() => void lista.refetch()} />;

  return (
    <div className="obsx">
      {abierto ? (
        <Detalle o={abierto} decir={decir} conteo={conteos.data?.get(abierto.id)} />
      ) : (
        <>
          <div className="obsx-cabeza">
            <p>Cada observatorio tiene su identidad, sus temas por líneas y sus propios insertados. Elige uno para organizarlo.</p>
            {puedeCrear && (
              <button type="button" className="button-primary" onClick={() => setCrear(true)}>
                <Icon name="plus" size={16} /> Crear observatorio
              </button>
            )}
          </div>
          {visibles.length === 0 ? (
            <Vacio titulo="No hay observatorios a tu alcance">Tu rol llega a los observatorios donde figures como persona responsable. Pide a quien administra que te asigne.</Vacio>
          ) : (
            <Lista items={visibles} conteos={conteos.data} abrir={(o) => navigate(`/admin/observatorio/observatorios/${o.slug}`)} />
          )}
        </>
      )}
      {crear && (
        <Asistente
          existentes={lista.data ?? []}
          onCerrar={() => setCrear(false)}
          creado={(o) => {
            setCrear(false);
            decir("Observatorio creado como borrador");
            navigate(`/admin/observatorio/observatorios/${o.slug}`);
          }}
        />
      )}
      {nodo}
    </div>
  );
}

function Lista({ items, conteos, abrir }: { items: Observatorio[]; conteos?: Map<string, { temas: number; publicados: number; insertados: number; responsables: number }>; abrir: (o: Observatorio) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  useCascada(ref, "[data-in]", items.length);
  return (
    <ul className="obsx-filas" ref={ref}>
      {items.map((o) => {
        const c = conteos?.get(o.id);
        return (
          <li key={o.id} className="obsx-obs" data-in>
            <Baldosa o={o} />
            <div className="obsx-obs__texto">
              <h3>
                {o.nombre} <ChipEstado estado={o.estado} />
                {o.principal && <Chip tono="brand">Principal</Chip>}
              </h3>
              <p>{o.descripcion || "Sin descripción todavía."}</p>
              <p className="obsx-meta">
                <span>{rutaPublica(o)}</span>
                {o.responsable && <span>Responsable: {o.responsable}</span>}
              </p>
            </div>
            <dl className="obsx-cifras">
              <div><dt>temas</dt><dd>{c?.temas ?? 0}<small> ({c?.publicados ?? 0} publicados)</small></dd></div>
              <div><dt>insertados</dt><dd>{c?.insertados ?? 0}</dd></div>
              <div><dt>responsables</dt><dd>{c?.responsables ?? 0}</dd></div>
            </dl>
            <button type="button" className="button-secondary" onClick={() => abrir(o)} aria-label={`Abrir ${o.nombre}`}>
              Abrir <Icon name="arrow-right" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* =============================================================================
   Un observatorio por dentro
   ========================================================================== */

type Pestana = "temas" | "portada" | "identidad" | "responsables";
const PESTANAS: [Pestana, string][] = [["temas", "Temas y líneas"], ["portada", "Portada pública"], ["identidad", "Identidad"], ["responsables", "Responsables"]];

/** Los temas agrupados por línea (null: sin línea), en el orden que se ve. */
interface Seccion { id: string | null; slugs: string[] }
function armarSecciones(lineas: Linea[], temas: Tema[]): Seccion[] {
  const orden = [...temas].sort((a, b) => a.orden - b.orden || a.slug.localeCompare(b.slug));
  const ids = new Set(lineas.map((l) => l.id));
  const s: Seccion[] = [...lineas].sort((a, b) => a.orden - b.orden).map((l) => ({ id: l.id, slugs: orden.filter((t) => t.linea_id === l.id).map((t) => t.slug) }));
  const huerfanos = orden.filter((t) => !t.linea_id || !ids.has(t.linea_id)).map((t) => t.slug);
  if (huerfanos.length) s.push({ id: null, slugs: huerfanos });
  return s;
}

function colocar(secciones: Seccion[], slug: string, destino: string | null, indice: number): Seccion[] {
  const sin = secciones.map((s) => ({ ...s, slugs: s.slugs.filter((x) => x !== slug) }));
  const d = sin.find((s) => s.id === destino);
  if (!d) return secciones;
  d.slugs.splice(Math.max(0, Math.min(indice, d.slugs.length)), 0, slug);
  return sin;
}

function Detalle({ o, decir, conteo }: { o: Observatorio; decir: (t: string, mala?: boolean) => void; conteo?: { temas: number; publicados: number; insertados: number; responsables: number } }) {
  const permisos = usePermisosObservatorio();
  const [params, setParams] = useSearchParams();
  const pestana = (PESTANAS.find(([id]) => id === params.get("tab"))?.[0] ?? "temas") as Pestana;
  const editor = useEditarObservatorios();
  const insertados = useInsertados(o.id);
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; accion: string; hecho: () => void } | null>(null);
  const editar = permisos.puede("obs_observatorios", o.id, "editar");
  const admin = permisos.puede("obs_observatorios", o.id, "administrar");
  const vivos = (insertados.data ?? []).filter((i) => i.estado !== "revocado");

  const cambiarEstado = async (estado: EstadoObservatorio) => {
    const hecho = async () => {
      try {
        await editor.identidad(o.id, { estado });
        decir(`«${o.nombre}» pasó a ${ETIQUETA_ESTADO[estado].toLowerCase()}`);
      } catch (e) {
        decir(e instanceof Error ? e.message : "No se pudo cambiar el estado", true);
      }
    };
    if (o.estado === "publicado" && estado !== "publicado" && vivos.length) {
      setConfirmar({ titulo: `Pasar a ${ETIQUETA_ESTADO[estado].toLowerCase()}`, texto: `${vivos.length} insertado${vivos.length > 1 ? "s" : ""} de este observatorio dejarán de mostrar datos y quien los vea encontrará un aviso. Puedes volver a publicar cuando quieras.`, accion: `Pasar a ${ETIQUETA_ESTADO[estado].toLowerCase()}`, hecho: () => void hecho() });
    } else void hecho();
  };

  const opcionesEstado = (["borrador", "publicado", "archivado"] as const).filter((e) => e !== "archivado" || admin || o.estado === "archivado").map((e) => [e, ETIQUETA_ESTADO[e]] as const);

  return (
    <div className="obsx">
      <Link className="obsx-volver" to="/admin/observatorio/observatorios">
        <Icon name="arrow-left" size={16} /> Observatorios
      </Link>
      <div className="obsx-cabeza">
        <div className="obsx-titulo">
          <Baldosa o={o} />
          <div>
            <h2>{o.nombre}</h2>
            <p>
              {rutaPublica(o)} · <ChipEstado estado={o.estado} />
              {conteo ? ` · ${conteo.temas} temas · ${conteo.insertados} insertados` : ""}
            </p>
          </div>
        </div>
        <div className="obsx-acciones">
          {editar && !o.principal && <Seg valor={o.estado} opciones={opcionesEstado} onChange={(e) => void cambiarEstado(e)} etiqueta="Estado del observatorio" />}
          {editar && o.principal && <Seg valor={o.estado} opciones={opcionesEstado.filter(([e]) => e !== "archivado")} onChange={(e) => void cambiarEstado(e)} etiqueta="Estado del observatorio" />}
          {o.estado === "publicado" && (
            <Link className="button-secondary" to={rutaPublica(o)} target="_blank" rel="noreferrer">
              Ver portada <Icon name="external" size={15} />
            </Link>
          )}
          {permisos.puede("obs_insertar", o.id, "editar") && (
            <Link className="button-primary" to={`/admin/observatorio/insertar/${o.slug}?nuevo=portada`}>
              <Icon name="code" size={16} /> Insertar
            </Link>
          )}
        </div>
      </div>

      <div className="obsx-pestanas" role="tablist" aria-label="Secciones del observatorio">
        {PESTANAS.map(([id, texto]) => (
          <button key={id} type="button" role="tab" id={`obsx-tab-${id}`} aria-selected={pestana === id} aria-controls="obsx-vista" tabIndex={pestana === id ? 0 : -1} onClick={() => setParams(id === "temas" ? {} : { tab: id }, { replace: true })}
            onKeyDown={(e) => {
              const i = PESTANAS.findIndex(([x]) => x === pestana);
              const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
              if (n < 0) return;
              const sig = PESTANAS[(n + PESTANAS.length) % PESTANAS.length][0];
              setParams(sig === "temas" ? {} : { tab: sig }, { replace: true });
              requestAnimationFrame(() => document.getElementById(`obsx-tab-${sig}`)?.focus());
            }}>
            {texto}
          </button>
        ))}
      </div>
      <div id="obsx-vista" role="tabpanel" aria-labelledby={`obsx-tab-${pestana}`}>
        {pestana === "temas" && <Temas o={o} editar={editar} decir={decir} vivos={vivos.map((i) => i.tema_slug)} confirmar={setConfirmar} />}
        {pestana === "portada" && <Portada o={o} />}
        {pestana === "identidad" && <Identidad o={o} editar={editar} decir={decir} />}
        {pestana === "responsables" && <Responsables o={o} editar={editar} decir={decir} />}
      </div>
      {confirmar && <Confirmar titulo={confirmar.titulo} texto={confirmar.texto} accion={confirmar.accion} onSi={confirmar.hecho} onNo={() => setConfirmar(null)} />}
    </div>
  );
}

/* --- Temas y líneas -------------------------------------------------------------------- */

function Temas({ o, editar, decir, vivos, confirmar }: { o: Observatorio; editar: boolean; decir: (t: string, mala?: boolean) => void; vivos: (string | null)[]; confirmar: (c: { titulo: string; texto: string; accion: string; hecho: () => void }) => void }) {
  const lineas = useLineas(o.id);
  const temas = useTemas(o.id);
  const editor = useEditarObservatorios();
  const permisos = usePermisosObservatorio();
  const [layout, setLayout] = useState<Seccion[] | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [formTema, setFormTema] = useState<{ tema: Tema | null; linea: string | null } | null>(null);
  const [formLinea, setFormLinea] = useState<Linea | "nueva" | null>(null);
  const [mover, setMover] = useState<Tema | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const foco = useRef<string | null>(null);
  const base = useMemo(() => armarSecciones(lineas.data ?? [], temas.data ?? []), [lineas.data, temas.data]);
  const actual = layout ?? base;
  const porSlug = useMemo(() => new Map((temas.data ?? []).map((t) => [t.slug, t])), [temas.data]);
  const marcarFlip = useFlip(raiz, "[data-flip]", JSON.stringify(actual));
  useCascada(raiz, "[data-in]", `${o.id}:${(lineas.data ?? []).length}`);
  useEffect(() => setLayout(null), [lineas.data, temas.data]);
  useEffect(() => {
    if (foco.current) {
      document.querySelector<HTMLElement>(`[data-asa="${foco.current}"]`)?.focus();
      foco.current = null;
    }
  });

  if (lineas.isPending || temas.isPending) return <LoadingBlock rows={4} label="Cargando los temas" />;
  if (lineas.isError || temas.isError) return <EstadoMigracion error={lineas.error ?? temas.error} />;

  const nombreLinea = (id: string | null) => (lineas.data ?? []).find((l) => l.id === id)?.nombre ?? "Sin línea";

  const guardarOrden = async (nuevo: Seccion[]) => {
    const cambios: Promise<void>[] = [];
    for (const s of nuevo)
      s.slugs.forEach((slug, i) => {
        const t = porSlug.get(slug);
        if (t && (t.linea_id !== s.id || t.orden !== i)) cambios.push(editor.tema(slug, { linea_id: s.id, orden: i }));
      });
    if (!cambios.length) return setLayout(null);
    try {
      await Promise.all(cambios);
    } catch (e) {
      setLayout(null);
      decir(e instanceof Error ? e.message : "No se pudo guardar el orden", true);
    }
  };

  /* Arrastre con puntero y tacto: la fila viaja con el dedo y las demás se abren paso con un FLIP corto. */
  const empezar = (e: ReactPointerEvent<HTMLButtonElement>, slug: string) => {
    if (!editar || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const fila = e.currentTarget.closest<HTMLElement>("[data-flip]")!;
    const r = fila.getBoundingClientRect();
    const fantasma = fila.cloneNode(true) as HTMLElement;
    fantasma.classList.add("obsx-fantasma");
    fantasma.removeAttribute("data-flip");
    fantasma.style.cssText = `left:${r.left}px;top:0;width:${r.width}px;transform:translate3d(0,${r.top}px,0)`;
    document.body.appendChild(fantasma);
    setArrastrando(slug);
    const desfase = e.clientY - r.top;
    let ly = e.clientY;
    let ultimo = actual;
    let terminado = false;
    const recolocar = () => {
      const cajas = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-lista]") ?? []);
      if (!cajas.length) return;
      let mejor = cajas[0];
      let dist = Infinity;
      for (const c of cajas) {
        const b = c.closest("section")!.getBoundingClientRect();
        const d = ly >= b.top && ly <= b.bottom ? -1 : Math.min(Math.abs(ly - b.top), Math.abs(ly - b.bottom));
        if (d < dist) { dist = d; mejor = c; }
      }
      const filas = Array.from(mejor.querySelectorAll<HTMLElement>("[data-flip]")).filter((x) => x.dataset.flip !== slug);
      let indice = filas.length;
      for (let i = 0; i < filas.length; i++) {
        const b = filas[i].getBoundingClientRect();
        if (ly < b.top + b.height / 2) { indice = i; break; }
      }
      const destino = mejor.dataset.lista === "" ? null : mejor.dataset.lista!;
      const actualSeccion = ultimo.find((s) => s.slugs.includes(slug));
      if (actualSeccion?.id === destino && actualSeccion.slugs.filter((x) => x !== slug).length === filas.length && actualSeccion.slugs.indexOf(slug) === indice) return;
      marcarFlip();
      ultimo = colocar(ultimo, slug, destino, indice);
      setLayout(ultimo);
    };
    const andar = window.setInterval(() => {
      if (ly < 90) window.scrollBy(0, -14);
      else if (ly > window.innerHeight - 90) window.scrollBy(0, 14);
      recolocar();
    }, 40);
    const mover = (ev: PointerEvent) => { ly = ev.clientY; fantasma.style.transform = `translate3d(0,${ly - desfase}px,0)`; };
    const fin = (ok: boolean) => {
      if (terminado) return;
      terminado = true;
      window.clearInterval(andar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", arriba);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("keydown", tecla, true);
      fantasma.remove();
      setArrastrando(null);
      if (ok) { void guardarOrden(ultimo); decir("Tema movido"); }
      else setLayout(null);
    };
    const arriba = () => fin(true);
    const cancelar = () => fin(false);
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") fin(false); };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", arriba);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("keydown", tecla, true);
  };

  /* Teclado y botones: un lugar a la vez, sin animación, anunciado. */
  const mueve = (slug: string, dir: -1 | 1) => {
    const i = actual.findIndex((s) => s.slugs.includes(slug));
    if (i < 0) return;
    const pos = actual[i].slugs.indexOf(slug);
    let nuevo: Seccion[] | null = null;
    if (dir < 0) {
      if (pos > 0) nuevo = colocar(actual, slug, actual[i].id, pos - 1);
      else if (i > 0) nuevo = colocar(actual, slug, actual[i - 1].id, actual[i - 1].slugs.length);
    } else if (pos < actual[i].slugs.length - 1) nuevo = colocar(actual, slug, actual[i].id, pos + 1);
    else if (i < actual.length - 1) nuevo = colocar(actual, slug, actual[i + 1].id, 0);
    if (!nuevo) return;
    foco.current = slug;
    setLayout(nuevo);
    const j = nuevo.findIndex((s) => s.slugs.includes(slug));
    decir(`«${porSlug.get(slug)?.nombre ?? slug}»: línea ${nombreLinea(nuevo[j].id)}, posición ${nuevo[j].slugs.indexOf(slug) + 1} de ${nuevo[j].slugs.length}`);
    void guardarOrden(nuevo);
  };

  const cambiarTema = async (slug: string, c: Parameters<typeof editor.tema>[1], ok: string) => {
    try {
      await editor.tema(slug, c);
      decir(ok);
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo guardar", true);
    }
  };

  const estadoTema = (t: Tema, status: "borrador" | "publicado") => {
    const n = vivos.filter((s) => s === t.slug).length;
    const hecho = () => void cambiarTema(t.slug, { status }, status === "publicado" ? "Tema publicado" : "El tema vuelve a borrador");
    if (status === "borrador" && t.status === "publicado" && n)
      confirmar({ titulo: "Pasar a borrador", texto: `${n} insertado${n > 1 ? "s" : ""} apuntan a «${t.nombre}». Dejarán de mostrar datos y aparecerán como alerta en el registro.`, accion: "Pasar a borrador", hecho });
    else hecho();
  };
  const archivar = (t: Tema, a: boolean) => {
    const n = vivos.filter((s) => s === t.slug).length;
    const hecho = () => void cambiarTema(t.slug, { archivado: a }, a ? "Tema archivado" : "Tema restaurado");
    if (a && n) confirmar({ titulo: "Archivar tema", texto: `${n} insertado${n > 1 ? "s" : ""} apuntan a «${t.nombre}». Dejarán de mostrar datos y aparecerán como alerta en el registro.`, accion: "Archivar", hecho });
    else hecho();
  };
  const duplicar = async (t: Tema) => {
    try {
      const slug = await slugLibre(slugify(`${t.nombre ?? t.slug} copia`));
      await editor.crearTema({ slug, observatorio_id: o.id, linea_id: t.linea_id, codigo: t.codigo, nombre: `${t.nombre ?? t.slug} (copia)`, resumen: t.resumen, pregunta: t.pregunta, fuente: t.fuente, orden: t.orden + 1 });
      decir("Duplicado como borrador (copia la ficha, no sus tablas ni visores)");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo duplicar", true);
    }
  };
  const quitarLinea = async (l: Linea) => {
    try {
      await editor.quitarLinea(l.id);
      decir("Línea quitada");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo quitar la línea", true);
    }
  };
  const moverLinea = async (l: Linea, dir: -1 | 1) => {
    const ord = [...(lineas.data ?? [])].sort((a, b) => a.orden - b.orden);
    const i = ord.findIndex((x) => x.id === l.id);
    const otro = ord[i + dir];
    if (!otro) return;
    try {
      await Promise.all([editor.linea({ ...l, orden: otro.orden }), editor.linea({ ...otro, orden: l.orden })]);
      decir(`Línea «${l.nombre}» ${dir < 0 ? "sube" : "baja"} un lugar`);
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo reordenar", true);
    }
  };

  return (
    <div ref={raiz}>
      {editar && (
        <div className="obsx-barra" data-in>
          <button type="button" className="button-secondary" onClick={() => setFormTema({ tema: null, linea: actual.find((s) => s.id)?.id ?? null })}>
            <Icon name="plus" size={16} /> Tema nuevo
          </button>
          <button type="button" className="button-secondary" onClick={() => setFormLinea("nueva")}>
            <Icon name="plus" size={16} /> Línea nueva
          </button>
          <span className="obsx-ayuda">Arrastra el asa para reordenar o pasar entre líneas. Con teclado: asa enfocada y flechas arriba o abajo.</span>
        </div>
      )}
      {actual.length === 0 && <Vacio titulo="Este observatorio aún no tiene líneas">{editar ? "Crea una línea y luego sus temas." : "Quien lo edita aún no ha creado líneas."}</Vacio>}
      {actual.map((s, si) => {
        const linea = (lineas.data ?? []).find((l) => l.id === s.id);
        return (
          <section key={s.id ?? "sin"} className="obsx-linea" data-in>
            <div className="obsx-linea__cab">
              <h3>{linea?.nombre ?? "Sin línea"}</h3>
              <span className="obsx-ayuda">{s.slugs.length} {s.slugs.length === 1 ? "tema" : "temas"}</span>
              {editar && linea && (
                <span className="obsx-linea__acc">
                  <button type="button" className="icon-button" onClick={() => setFormLinea(linea)} aria-label={`Renombrar la línea ${linea.nombre}`}><Ico name="edit" /></button>
                  <button type="button" className="icon-button" onClick={() => void moverLinea(linea, -1)} disabled={si === 0} aria-label={`Subir la línea ${linea.nombre}`}><Ico name="up" /></button>
                  <button type="button" className="icon-button" onClick={() => void moverLinea(linea, 1)} disabled={si >= actual.filter((x) => x.id).length - 1} aria-label={`Bajar la línea ${linea.nombre}`}><Ico name="down" /></button>
                  {s.slugs.length === 0 && <button type="button" className="icon-button" onClick={() => void quitarLinea(linea)} aria-label={`Quitar la línea vacía ${linea.nombre}`}><Icon name="trash" size={16} /></button>}
                </span>
              )}
            </div>
            <div className="obsx-lista" data-lista={s.id ?? ""}>
              {s.slugs.map((slug) => {
                const t = porSlug.get(slug);
                if (!t) return null;
                const n = vivos.filter((x) => x === slug).length;
                return (
                  <div key={slug} className="obsx-tema" data-flip={slug} data-arrastre={arrastrando === slug || undefined} data-archivado={t.archivado || undefined}>
                    {editar ? (
                      <button type="button" className="obsx-asa" data-asa={slug} aria-label={`Reordenar «${t.nombre ?? slug}». Flechas arriba y abajo`} onPointerDown={(e) => empezar(e, slug)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); mueve(slug, e.key === "ArrowUp" ? -1 : 1); }
                        }}>
                        <Icon name="grip" size={18} />
                      </button>
                    ) : <span className="obsx-asa" aria-hidden="true" />}
                    <span className="obsx-codigo" style={{ background: o.color }}>{t.codigo ?? "··"}</span>
                    <div className="obsx-tema__nombre">
                      <b>{t.nombre ?? slug}</b>
                      <span>{t.pregunta || t.resumen || "Sin pregunta guía"}</span>
                    </div>
                    <div className="obsx-tema__lado">
                      {t.archivado ? <Chip icono={<Ico name="archive" size={13} />}>Archivado</Chip> : <Chip tono={t.status === "publicado" ? "ok" : undefined} icono={<Icon name={t.status === "publicado" ? "check" : "pen"} size={13} />}>{t.status === "publicado" ? "Publicado" : "Borrador"}</Chip>}
                      {n > 0 && <span>{n} insertado{n > 1 ? "s" : ""}</span>}
                    </div>
                    <div className="obsx-tema__acc">
                      {permisos.puede("obs_insertar", o.id, "editar") && !t.archivado && (
                        <Link className="button-secondary obsx-pequeno" to={`/admin/observatorio/insertar/${o.slug}?nuevo=tema&tema=${t.slug}`}>
                          <Icon name="code" size={15} /> Insertar
                        </Link>
                      )}
                      {editar && (
                        <MenuAcciones etiqueta={`Más acciones de «${t.nombre ?? slug}»`} items={[
                          { texto: "Editar tema", icono: "edit", hecho: () => setFormTema({ tema: t, linea: t.linea_id }) },
                          { texto: "Duplicar", icono: "duplicate", hecho: () => void duplicar(t) },
                          { texto: "Subir un lugar", icono: "up", hecho: () => mueve(slug, -1) },
                          { texto: "Bajar un lugar", icono: "down", hecho: () => mueve(slug, 1) },
                          { texto: "Mover a otra línea u observatorio", icono: "move", hecho: () => setMover(t) },
                          "-",
                          t.status === "publicado" ? { texto: "Pasar a borrador", icono: "edit", hecho: () => estadoTema(t, "borrador") } : { texto: "Publicar", hecho: () => estadoTema(t, "publicado") },
                          t.archivado ? { texto: "Restaurar", icono: "refresh", hecho: () => archivar(t, false) } : { texto: "Archivar", icono: "archive", peligro: true, hecho: () => archivar(t, true) },
                        ]} />
                      )}
                    </div>
                  </div>
                );
              })}
              {s.slugs.length === 0 && <p className="obsx-gancho">Línea vacía. Suelta aquí un tema{editar ? " o crea uno nuevo" : ""}.</p>}
            </div>
          </section>
        );
      })}
      {formTema && <FormTema o={o} lineas={lineas.data ?? []} tema={formTema.tema} linea={formTema.linea} decir={decir} onCerrar={() => setFormTema(null)} />}
      {formLinea && <FormLinea o={o} linea={formLinea === "nueva" ? null : formLinea} total={(lineas.data ?? []).length} decir={decir} onCerrar={() => setFormLinea(null)} />}
      {mover && <FormMover origen={o} tema={mover} decir={decir} onCerrar={() => setMover(null)} />}
    </div>
  );
}

async function slugLibre(base: string): Promise<string> {
  const b = base || "tema";
  const { data } = await supabase.from("obs_topics").select("slug").like("slug", `${b}%`);
  const usados = new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug));
  let s = b;
  for (let n = 2; usados.has(s); n += 1) s = `${b}-${n}`;
  return s;
}

function FormLinea({ o, linea, total, decir, onCerrar }: { o: Observatorio; linea: Linea | null; total: number; decir: (t: string, mala?: boolean) => void; onCerrar: () => void }) {
  const editor = useEditarObservatorios();
  const [nombre, setNombre] = useState(linea?.nombre ?? "");
  const [error, setError] = useState("");
  const guardar = async (cerrar: () => void) => {
    const n = nombre.trim();
    if (!n) return setError("Escribe un nombre para la línea.");
    if (n.length > 80) return setError("Hasta 80 caracteres.");
    try {
      await editor.linea(linea ? { ...linea, nombre: n } : { observatorio_id: o.id, nombre: n, orden: total });
      decir(linea ? "Línea renombrada" : "Línea creada");
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };
  return (
    <Dialogo titulo={linea ? "Renombrar la línea" : "Línea nueva"} ancho={440} onCerrar={onCerrar} pie={(cerrar) => (<><button type="button" className="button-secondary" onClick={cerrar}>Cancelar</button><button type="button" className="button-primary" onClick={() => void guardar(cerrar)}>Guardar</button></>)}>
      {(cerrar) => (
        <label className="admin-field">
          <span>Nombre de la línea</span>
          <input type="text" value={nombre} autoFocus maxLength={80} onChange={(e) => { setNombre(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(cerrar); } }} placeholder="Por ejemplo: Docencia" />
          {error && <small className="obsx-error" role="alert">{error}</small>}
        </label>
      )}
    </Dialogo>
  );
}

function FormTema({ o, lineas, tema, linea, decir, onCerrar }: { o: Observatorio; lineas: Linea[]; tema: Tema | null; linea: string | null; decir: (t: string, mala?: boolean) => void; onCerrar: () => void }) {
  const editor = useEditarObservatorios();
  const [v, setV] = useState({ nombre: tema?.nombre ?? "", pregunta: tema?.pregunta ?? "", fuente: tema?.fuente ?? o.responsable, resumen: tema?.resumen ?? "", codigo: tema?.codigo ?? "", linea: linea ?? "" });
  const [codigoTocado, setCodigoTocado] = useState(Boolean(tema));
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cambia = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor, ...(k === "nombre" && !codigoTocado ? { codigo: codigoDe(valor) } : {}) }));
  const guardar = async (cerrar: () => void) => {
    const nombre = v.nombre.trim();
    if (!nombre) return setError("Escribe un nombre para continuar.");
    if (v.codigo && !/^[A-Za-z0-9]{1,4}$/.test(v.codigo)) return setError("El código lleva de 1 a 4 letras o cifras.");
    setOcupado(true);
    try {
      const comunes = { nombre, pregunta: v.pregunta.trim() || `¿Qué muestra ${nombre}?`, fuente: v.fuente.trim() || o.responsable, resumen: v.resumen.trim() || null, codigo: v.codigo.toUpperCase() || codigoDe(nombre), linea_id: v.linea || null };
      if (tema) await editor.tema(tema.slug, comunes);
      else await editor.crearTema({ slug: await slugLibre(slugify(nombre)), observatorio_id: o.id, orden: 999, ...comunes });
      decir(tema ? "Tema actualizado" : "Tema creado en borrador");
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setOcupado(false);
    }
  };
  return (
    <Dialogo titulo={tema ? "Editar tema" : "Tema nuevo"} ancho={560} onCerrar={onCerrar} pie={(cerrar) => (<><button type="button" className="button-secondary" onClick={cerrar}>Cancelar</button><button type="button" className="button-primary" disabled={ocupado} onClick={() => void guardar(cerrar)}>{tema ? "Guardar" : "Crear tema"}</button></>)}>
      <div className="obsx-form">
        <label className="admin-field"><span>Nombre</span><input type="text" value={v.nombre} autoFocus maxLength={120} onChange={(e) => cambia("nombre", e.target.value)} placeholder="Por ejemplo: Movilidad entrante" /></label>
        <label className="admin-field"><span>Pregunta guía</span><input type="text" value={v.pregunta} maxLength={300} onChange={(e) => cambia("pregunta", e.target.value)} placeholder="¿Qué pregunta responde esta página?" /></label>
        <div className="obsx-dos">
          <label className="admin-field"><span>Fuente</span><input type="text" value={v.fuente} maxLength={200} onChange={(e) => cambia("fuente", e.target.value)} /></label>
          <label className="admin-field"><span>Línea</span><select value={v.linea} onChange={(e) => cambia("linea", e.target.value)}><option value="">Sin línea</option>{lineas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
        </div>
        <div className="obsx-dos">
          <label className="admin-field"><span>Código (1 a 4 letras)</span><input type="text" value={v.codigo} maxLength={4} onChange={(e) => { setCodigoTocado(true); cambia("codigo", e.target.value.toUpperCase()); }} /></label>
          <label className="admin-field"><span>Resumen para la portada</span><input type="text" value={v.resumen} maxLength={400} onChange={(e) => cambia("resumen", e.target.value)} placeholder="Una línea" /></label>
        </div>
        {!tema && <p className="obsx-ayuda">Nace como borrador. Se publica cuando tenga datos.</p>}
        {error && <p className="obsx-error" role="alert">{error}</p>}
      </div>
    </Dialogo>
  );
}

function FormMover({ origen, tema, decir, onCerrar }: { origen: Observatorio; tema: Tema; decir: (t: string, mala?: boolean) => void; onCerrar: () => void }) {
  const permisos = usePermisosObservatorio();
  const todos = useObservatorios();
  const mover = useMoverTema();
  const [destino, setDestino] = useState(origen.id);
  const [linea, setLinea] = useState(tema.linea_id ?? "");
  const lineas = useLineas(destino);
  const posibles = (todos.data ?? []).filter((x) => x.estado !== "archivado" && permisos.puede("obs_observatorios", x.id, "editar"));
  const otro = destino !== origen.id;
  const ir = async (cerrar: () => void) => {
    try {
      await mover.mutateAsync({ p_slug: tema.slug, p_obs: destino, p_linea: linea || null });
      decir(otro ? `Tema movido a «${posibles.find((x) => x.id === destino)?.nombre}»` : "Tema movido de línea");
      cerrar();
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo mover", true);
    }
  };
  return (
    <Dialogo titulo={`Mover «${tema.nombre ?? tema.slug}»`} ancho={480} onCerrar={onCerrar} pie={(cerrar) => (<><button type="button" className="button-secondary" onClick={cerrar}>Cancelar</button><button type="button" className="button-primary" disabled={mover.isPending} onClick={() => void ir(cerrar)}>Mover</button></>)}>
      <div className="obsx-form">
        <label className="admin-field"><span>Observatorio</span><select value={destino} onChange={(e) => { setDestino(e.target.value); setLinea(""); }}>{posibles.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label className="admin-field"><span>Línea</span><select value={linea} onChange={(e) => setLinea(e.target.value)}><option value="">Sin línea</option>{(lineas.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
        {otro && <p className="obsx-ayuda">Se mueven también sus tablas, visores e insertados. Los insertados se comprobarán contra los dominios autorizados del observatorio de destino.</p>}
        {mover.isError && mover.error instanceof FaltaMigracion && <EstadoMigracion error={mover.error} />}
      </div>
    </Dialogo>
  );
}

/* --- Portada pública (vista previa) -------------------------------------------------- */

function Portada({ o }: { o: Observatorio }) {
  const lineas = useLineas(o.id);
  const temas = useTemas(o.id);
  const [aparato, setAparato] = useState<"escritorio" | "tableta" | "telefono">("escritorio");
  if (lineas.isPending || temas.isPending) return <LoadingBlock rows={3} label="Cargando la portada" />;
  if (lineas.isError || temas.isError) return <EstadoMigracion error={lineas.error ?? temas.error} />;
  const pub = (temas.data ?? []).filter((t) => t.status === "publicado" && !t.archivado);
  const ocultos = (temas.data ?? []).length - pub.length;
  const ancho = { escritorio: "100%", tableta: "768px", telefono: "375px" }[aparato];
  const grupos = [...(lineas.data ?? [])].sort((a, b) => a.orden - b.orden).map((l) => ({ l, ts: pub.filter((t) => t.linea_id === l.id).sort((a, b) => a.orden - b.orden) })).filter((g) => g.ts.length);
  return (
    <div>
      <div className="obsx-barra">
        <Seg valor={aparato} opciones={[["escritorio", "Escritorio"], ["tableta", "Tableta"], ["telefono", "Teléfono"]] as const} onChange={setAparato} etiqueta="Ancho de la vista previa" />
        <span className="obsx-ayuda">{ocultos ? `${ocultos} tema${ocultos > 1 ? "s" : ""} en borrador o archivado${ocultos > 1 ? "s" : ""} no aparece${ocultos > 1 ? "n" : ""} en la portada pública.` : "Todos los temas son visibles."}</span>
        {o.estado !== "publicado" && <Chip tono="warn" icono={<Icon name="alert" size={13} />}>El observatorio está en {o.estado}: el público no lo ve</Chip>}
      </div>
      <div className="obsx-marco" style={{ width: ancho }}>
        <div className="obsx-portada" style={{ "--c": o.color } as CSSProperties}>
          <div className="obsx-portada__cab">
            <Icon name={iconoDe(o.icono)} size={26} />
            <h3>{o.nombre}</h3>
            <p>{o.descripcion || "Sin descripción todavía."}</p>
          </div>
          <div className="obsx-portada__cuerpo">
            {grupos.length === 0 ? <p className="obsx-ayuda">Aún no hay temas publicados. La portada pública quedaría vacía.</p> : grupos.map(({ l, ts }) => (
              <div key={l.id}>
                <h4>{l.nombre}</h4>
                <ul>{ts.map((t) => <li key={t.slug}><span className="obsx-codigo" style={{ background: o.color }}>{t.codigo ?? "··"}</span><b>{t.nombre ?? t.slug}</b><small>{t.resumen || t.pregunta}</small></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Identidad ----------------------------------------------------------------------- */

function Identidad({ o, editar, decir }: { o: Observatorio; editar: boolean; decir: (t: string, mala?: boolean) => void }) {
  const editor = useEditarObservatorios();
  const [v, setV] = useState({ nombre: o.nombre, descripcion: o.descripcion, color: o.color, icono: o.icono, responsable: o.responsable });
  const sucio = v.nombre !== o.nombre || v.descripcion !== o.descripcion || v.color !== o.color || v.icono !== o.icono || v.responsable !== o.responsable;
  const guardar = async () => {
    if (!v.nombre.trim()) return decir("El observatorio necesita un nombre.", true);
    try {
      await editor.identidad(o.id, { ...v, nombre: v.nombre.trim() });
      decir("Identidad guardada");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo guardar", true);
    }
  };
  return (
    <form className="obsx-panel obsx-form" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <fieldset disabled={!editar}>
        <div className="obsx-dos">
          <label className="admin-field"><span>Nombre</span><input type="text" value={v.nombre} maxLength={120} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></label>
          <label className="admin-field"><span>Enlace</span><input type="text" value={o.slug} readOnly /><small className="obsx-ayuda">{rutaPublica(o)}. Cambiarlo es decisión de quien administra y rompe los enlaces ya compartidos.</small></label>
        </div>
        <label className="admin-field"><span>Descripción</span><textarea value={v.descripcion} maxLength={400} rows={3} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></label>
        <div className="admin-field">
          <span>Color</span>
          <div className="obsx-muestras" role="radiogroup" aria-label="Color">
            {COLORES_OBS.map((c) => <label key={c}><input type="radio" name="obsx-color" checked={v.color === c} onChange={() => setV({ ...v, color: c })} aria-label={nombreColor(c)} /><i style={{ background: c }} /></label>)}
          </div>
        </div>
        <div className="admin-field">
          <span>Icono</span>
          <div className="obsx-iconos" role="radiogroup" aria-label="Icono">
            {ICONOS_OBS.map((n) => <label key={n}><input type="radio" name="obsx-icono" checked={v.icono === n} onChange={() => setV({ ...v, icono: n })} aria-label={n} /><span><Icon name={n} size={20} /></span></label>)}
          </div>
        </div>
        <label className="admin-field"><span>Oficina responsable</span><input type="text" value={v.responsable} maxLength={120} onChange={(e) => setV({ ...v, responsable: e.target.value })} placeholder="Por ejemplo: Planeación Institucional" /></label>
      </fieldset>
      {editar && <div className="obsx-acciones"><button type="submit" className="button-primary" disabled={!sucio}>Guardar identidad</button>{sucio && <button type="button" className="button-secondary" onClick={() => setV({ nombre: o.nombre, descripcion: o.descripcion, color: o.color, icono: o.icono, responsable: o.responsable })}>Descartar</button>}</div>}
    </form>
  );
}

/* --- Responsables -------------------------------------------------------------------- */

function Responsables({ o, editar, decir }: { o: Observatorio; editar: boolean; decir: (t: string, mala?: boolean) => void }) {
  const resp = useResponsables(o.id);
  const perfiles = useProfiles();
  const editor = useEditarObservatorios();
  const [nueva, setNueva] = useState("");
  const nombres = useMemo(() => new Map((perfiles.data ?? []).map((p) => [p.id, p])), [perfiles.data]);
  const ya = useMemo(() => new Set((resp.data ?? []).map((r) => r.persona_id)), [resp.data]);
  if (resp.isPending) return <LoadingBlock rows={3} label="Cargando responsables" />;
  if (resp.isError) return <EstadoMigracion error={resp.error} />;
  const probar = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      decir(ok);
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo guardar", true);
    }
  };
  return (
    <div className="obsx-panel">
      <p className="obsx-ayuda">Las personas responsables editan este observatorio cuando el alcance de su rol es «solo donde sea responsable». «Proponer dominios» les deja sugerir páginas externas autorizadas; la administración las aprueba.</p>
      {(resp.data ?? []).length === 0 ? <Vacio titulo="Nadie figura como responsable">Asigna a alguien del directorio de la intranet.</Vacio> : (
        <ul className="obsx-personas">
          {(resp.data ?? []).map((r) => {
            const p = nombres.get(r.persona_id);
            return (
              <li key={r.persona_id}>
                <div><b>{p?.name ?? "Persona del directorio"}</b><span>{[p?.email, p?.unit].filter(Boolean).join(" · ")}</span></div>
                <label className="obsx-interruptor">
                  <input type="checkbox" checked={r.propone_dominios} disabled={!editar} onChange={(e) => void probar(() => editor.asignar({ ...r, propone_dominios: e.target.checked }), "Permiso actualizado")} />
                  <span className="obsx-pista" /> <span>Proponer dominios</span>
                </label>
                {editar && <button type="button" className="icon-button" onClick={() => void probar(() => editor.desasignar(o.id, r.persona_id), "Persona retirada")} aria-label={`Retirar a ${p?.name ?? "la persona"}`}><Ico name="x" /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {editar && (
        <div className="obsx-agregar">
          <SelectorPersona value={nueva} onChange={setNueva} excluir={ya} etiqueta="Agregar a una persona" />
          <button type="button" className="button-primary" disabled={!nueva} onClick={() => void probar(async () => { await editor.asignar({ observatorio_id: o.id, persona_id: nueva, propone_dominios: true }); setNueva(""); }, "Persona agregada")}>Agregar</button>
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   Asistente «Crear observatorio»
   ========================================================================== */

type Plantilla = "vacio" | "copia" | "sostenibilidad";

function Asistente({ existentes, onCerrar, creado }: { existentes: Observatorio[]; onCerrar: () => void; creado: (o: Observatorio) => void }) {
  const crear = useCrearObservatorio();
  const editor = useEditarObservatorios();
  const perfiles = useProfiles();
  const [paso, setPaso] = useState(1);
  const [v, setV] = useState({ nombre: "", slug: "", slugTocado: false, proposito: "", plantilla: "vacio" as Plantilla, desde: existentes.find((x) => x.principal)?.id ?? existentes[0]?.id ?? "", color: COLORES_OBS[1], icono: "compass", responsable: "", editan: [] as string[] });
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const set = (c: Partial<typeof v>) => setV((x) => ({ ...x, ...c }));

  const siguiente = () => {
    if (paso === 1) {
      if (!v.nombre.trim()) return setError("Escribe un nombre para continuar.");
      const slug = v.slug || slugify(v.nombre);
      if (slug.length < 2) return setError("El enlace necesita al menos 2 caracteres.");
      if (existentes.some((x) => x.slug === slug)) return setError(`Ya existe un observatorio con el enlace «${slug}». Cámbialo.`);
      set({ slug });
    }
    setError("");
    setPaso((p) => p + 1);
  };

  const hacer = async (cerrar: () => void) => {
    setOcupado(true);
    try {
      const o = await crear.mutateAsync({ p_nombre: v.nombre.trim(), p_slug: v.slug, p_descripcion: v.proposito.trim(), p_color: v.color, p_icono: v.icono, p_responsable: v.responsable.trim(), p_plantilla: v.plantilla === "copia" ? v.desde : null });
      // Líneas y temas de partida según la plantilla.
      const { data: nuevas } = await supabase.from("obs_lineas").select("*").eq("observatorio_id", o.id).order("orden");
      let lineas = (nuevas ?? []) as Linea[];
      if (v.plantilla === "vacio" && lineas.length === 0) {
        await editor.linea({ observatorio_id: o.id, nombre: "Línea 1", orden: 0 });
      }
      if (v.plantilla === "copia") {
        const { data: origen } = await supabase.from("obs_lineas").select("*").eq("observatorio_id", v.desde).order("orden");
        const { data: temas } = await supabase.from("obs_topics").select("slug,linea_id,codigo,nombre,resumen,pregunta,fuente,orden").eq("observatorio_id", v.desde).eq("archivado", false).order("orden");
        const mapa = new Map(((origen ?? []) as Linea[]).map((l, i) => [l.id, lineas[i]?.id ?? null]));
        for (const t of (temas ?? []) as Tema[]) await editor.crearTema({ slug: await slugLibre(`${t.slug}-${o.slug}`.slice(0, 60)), observatorio_id: o.id, linea_id: t.linea_id ? mapa.get(t.linea_id) ?? null : null, codigo: t.codigo, nombre: t.nombre, resumen: t.resumen, pregunta: t.pregunta, fuente: t.fuente, orden: t.orden });
      }
      if (v.plantilla === "sostenibilidad") {
        const { data: ind } = await supabase.from("ds_indicadores").select("ods,nombre,descripcion,unidad,position").order("ods").order("position");
        const filas = (ind ?? []) as { ods: number; nombre: string; descripcion: string; unidad: string }[];
        const porOds = [...new Set(filas.map((f) => f.ods))];
        for (const [i, ods] of porOds.entries()) await editor.linea({ observatorio_id: o.id, nombre: `ODS ${ods}`, orden: i });
        const { data: l2 } = await supabase.from("obs_lineas").select("*").eq("observatorio_id", o.id).order("orden");
        lineas = (l2 ?? []) as Linea[];
        for (const [i, f] of filas.entries())
          await editor.crearTema({ slug: await slugLibre(slugify(`${o.slug}-${f.nombre}`)), observatorio_id: o.id, linea_id: lineas.find((l) => l.nombre === `ODS ${f.ods}`)?.id ?? null, codigo: codigoDe(f.nombre), nombre: f.nombre.slice(0, 120), pregunta: (f.descripcion || `¿Cómo va ${f.nombre}?`).slice(0, 300), fuente: "Datos de Sostenibilidad", orden: i });
      }
      for (const persona of v.editan) await editor.asignar({ observatorio_id: o.id, persona_id: persona, propone_dominios: true });
      cerrar();
      creado(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el observatorio");
      setOcupado(false);
    }
  };

  const nombresPersonas = new Map((perfiles.data ?? []).map((p) => [p.id, p.name]));
  return (
    <Dialogo titulo="Crear observatorio" sub={`Paso ${paso} de 3`} ancho={560} onCerrar={onCerrar}
      pie={(cerrar) => (
        <>
          {paso > 1 ? <button type="button" className="button-secondary" disabled={ocupado} onClick={() => { setError(""); setPaso(paso - 1); }}>Atrás</button> : <button type="button" className="button-secondary" onClick={cerrar}>Cancelar</button>}
          {paso < 3 ? <button type="button" className="button-primary" onClick={siguiente}>Siguiente</button> : <button type="button" className="button-primary" disabled={ocupado} onClick={() => void hacer(cerrar)}>{ocupado ? "Creando…" : "Crear observatorio"}</button>}
        </>
      )}>
      <div className="obsx-form" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && paso < 3) { e.preventDefault(); siguiente(); } }}>
        {paso === 1 && (
          <>
            <label className="admin-field"><span>Nombre</span><input type="text" value={v.nombre} autoFocus maxLength={120} placeholder="Por ejemplo: Observatorio de Investigación" onChange={(e) => set({ nombre: e.target.value, ...(v.slugTocado ? {} : { slug: slugify(e.target.value) }) })} /></label>
            <label className="admin-field"><span>Enlace</span><input type="text" value={v.slug} maxLength={60} onChange={(e) => set({ slug: slugify(e.target.value), slugTocado: true })} /><small className="obsx-ayuda">/datos-abiertos/observatorio/o/{v.slug || "…"}</small></label>
            <label className="admin-field"><span>Propósito</span><textarea rows={3} maxLength={400} value={v.proposito} onChange={(e) => set({ proposito: e.target.value })} placeholder="¿Qué decisión o pregunta ayuda a resolver?" /></label>
          </>
        )}
        {paso === 2 && (
          <>
            <div className="obsx-radios" role="radiogroup" aria-label="Plantilla de partida">
              {([["vacio", "Vacío", "Una línea sin temas. Tú armas todo."], ["copia", "Copia de otro observatorio", "Mismas líneas y fichas de temas, como borradores (sin tablas ni visores)."], ["sostenibilidad", "Desde Datos de Sostenibilidad", "Una línea por ODS y un tema por cada indicador del catálogo."]] as const).map(([id, t, d]) => (
                <label key={id}><input type="radio" name="obsx-plantilla" checked={v.plantilla === id} onChange={() => set({ plantilla: id })} /><b>{t}</b><span>{d}</span></label>
              ))}
            </div>
            {v.plantilla === "copia" && <label className="admin-field"><span>Copiar de</span><select value={v.desde} onChange={(e) => set({ desde: e.target.value })}>{existentes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
          </>
        )}
        {paso === 3 && (
          <>
            <div className="admin-field"><span>Color</span><div className="obsx-muestras" role="radiogroup" aria-label="Color">{COLORES_OBS.map((c) => <label key={c}><input type="radio" name="obsx-w-color" checked={v.color === c} onChange={() => set({ color: c })} aria-label={nombreColor(c)} /><i style={{ background: c }} /></label>)}</div></div>
            <div className="admin-field"><span>Icono</span><div className="obsx-iconos" role="radiogroup" aria-label="Icono">{ICONOS_OBS.map((n) => <label key={n}><input type="radio" name="obsx-w-icono" checked={v.icono === n} onChange={() => set({ icono: n })} aria-label={n} /><span><Icon name={n} size={20} /></span></label>)}</div></div>
            <label className="admin-field"><span>Oficina responsable</span><input type="text" value={v.responsable} maxLength={120} onChange={(e) => set({ responsable: e.target.value })} placeholder="Por ejemplo: Planeación Institucional" /></label>
            <div className="admin-field">
              <span>Quién edita</span>
              {v.editan.length > 0 && <ul className="obsx-fichas">{v.editan.map((id) => <li key={id}>{nombresPersonas.get(id) ?? "Persona"}<button type="button" onClick={() => set({ editan: v.editan.filter((x) => x !== id) })} aria-label={`Quitar a ${nombresPersonas.get(id) ?? "la persona"}`}><Ico name="x" size={14} /></button></li>)}</ul>}
              <div className="obsx-agregar"><SelectorPersona value={nueva} onChange={setNueva} excluir={new Set(v.editan)} etiqueta="Persona del directorio" /><button type="button" className="button-secondary" disabled={!nueva} onClick={() => { set({ editan: [...v.editan, nueva] }); setNueva(""); }}>Agregar</button></div>
              <small className="obsx-ayuda">Quien crea el observatorio queda como responsable. Estas personas lo editan si el alcance de su rol es «solo donde sea responsable».</small>
            </div>
          </>
        )}
        {error && <p className="obsx-error" role="alert">{error}</p>}
      </div>
    </Dialogo>
  );
}
