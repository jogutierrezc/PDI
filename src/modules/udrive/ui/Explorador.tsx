/* =============================================================================
   UDrive · el explorador (/admin/udrive).

   Pantalla completa al estilo de Programas en Cifras: barra azul marino, riel
   (Mis archivos, Compartidos conmigo, Recientes, Catálogo, Papelera), migas,
   barra de comandos con chips por tipo, mosaicos o lista, panel de detalles y
   zona para soltar archivos. Arrastrar un elemento a una carpeta (o a una miga)
   lo mueve; arrastrar archivos desde el computador los sube. Todo tiene su
   alternativa con teclado: Enter abre, Supr manda a la papelera, «Mover a…».
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Buscador } from "../../../components/espacio/Buscador";
import type { EntradaBuscador } from "../../../components/espacio/Buscador";
import { PanelDetalles } from "../../../components/espacio/Explorador";
import { Aviso, MiniaturaCarpeta, useAviso } from "../../../components/espacio/piezas";
import { BarraSuperior, EntradaRiel, EstadoPantalla, Riel, TituloRiel } from "../../../components/espacio/Marco";
import { cajaDe, entrarMenu } from "../../../components/espacio/movimiento";
import { Icon } from "../../../components/ui/Icon";
import { CardSkeleton, ErrorBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { enlaceDeArchivo, esFaltaMigracion, useAPapelera, useArchivos, useCarpetas, useCrearItem, useDuenos, useEliminarDefinitivo, useMover, useRenombrar, useRestaurar, useVaciarVencidos } from "../datos";
import { contenidoDe, elementosDePapelera, puedeMoverArchivo, puedeMoverCarpeta, rutaDeCarpeta } from "../lib/arbol";
import { vistaPrevia } from "../lib/imagen";
import { textoTamano } from "../lib/nombres";
import { puedeEditar } from "../lib/permisos";
import { tablaDesdeMatriz } from "../lib/tabla";
import { useCascada } from "../motion";
import type { ArchivoRow, CarpetaRow } from "../tipos";
import { Detalles } from "./Detalles";
import type { Seleccion } from "./Detalles";
import { Compartir, Confirmar, MoverA, NuevaCarpeta, Previa } from "./Dialogos";
import { NuevoInforme } from "./documento/NuevoInforme";
import { Galeria } from "./Galeria";
import { Estado, IconoItem, Miniatura, NOMBRE_TIPO, subtituloDe } from "./piezas";
import { PanelSubidas, useSubidas } from "./Subidas";
import { leerArchivoEnNavegador } from "../../programas-en-cifras/ui/leer-excel";
import { haceCuanto } from "../../../components/espacio/logica";
import "../../../components/espacio/espacio.css";
import "../../../components/espacio/marco.css";
import "./udrive.css";

type Seccion = "archivos" | "compartidos" | "recientes" | "papelera" | "catalogo";
type Filtro = "todo" | "tablas" | "graficas" | "informes" | "archivos";

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "todo", etiqueta: "Todo" },
  { id: "tablas", etiqueta: "Tablas" },
  { id: "graficas", etiqueta: "Gráficas" },
  { id: "informes", etiqueta: "Informes" },
  { id: "archivos", etiqueta: "Archivos" },
];

const pasaFiltro = (a: ArchivoRow, f: Filtro): boolean => f === "todo" || (f === "tablas" && a.tipo === "tabla") || (f === "graficas" && (a.tipo === "grafica" || a.tipo === "cruce")) || (f === "informes" && a.tipo === "documento") || (f === "archivos" && a.tipo === "archivo");

const ACCIONES: EntradaBuscador[] = [
  { id: "x:carpeta", titulo: "Nueva carpeta", icono: "folder", pista: "Acción" },
  { id: "x:tabla", titulo: "Nueva tabla", icono: "table", pista: "Acción" },
  { id: "x:grafica", titulo: "Nueva gráfica (catálogo)", icono: "chart", pista: "Acción" },
  { id: "x:subir", titulo: "Subir archivos", icono: "upload", pista: "Acción" },
];

export function Explorador({ seccionInicial = "archivos" }: { seccionInicial?: Seccion }) {
  const { profile } = useAuth();
  const yo = profile?.id;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const carpetaParam = params.get("c");
  const carpetasQ = useCarpetas();
  const archivosQ = useArchivos();
  const { aviso, decir } = useAviso();

  const todasC = useMemo(() => carpetasQ.data ?? [], [carpetasQ.data]);
  const todasA = useMemo(() => archivosQ.data ?? [], [archivosQ.data]);
  const ids = useMemo(() => [...todasC.map((c) => c.id), ...todasA.map((a) => a.id)], [todasC, todasA]);
  const duenos = useDuenos(ids);
  const roles = useMemo(() => duenos.data ?? new Map(), [duenos.data]);

  const [seccion, setSeccion] = useState<Seccion>(seccionInicial);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [vista, setVista] = useState<"mosaicos" | "lista">("mosaicos");
  const [detalles, setDetalles] = useState(true);
  const [sel, setSel] = useState<{ tipo: "carpeta" | "archivo"; id: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [dialogo, setDialogo] = useState<null | { t: "carpeta" } | { t: "informe" } | { t: "mover" | "compartir" | "borrar" | "previa" | "papelera"; s: Seleccion }>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);
  const arrastre = useRef<{ tipo: "carpeta" | "archivo"; id: string } | null>(null);
  const inputSubir = useRef<HTMLInputElement>(null);
  const inputImportar = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const zona = useRef<HTMLDivElement>(null);

  const mover = useMover();
  const aPapelera = useAPapelera();
  const restaurar = useRestaurar();
  const eliminar = useEliminarDefinitivo();
  const renombrar = useRenombrar();
  const crear = useCrearItem();
  const vaciar = useVaciarVencidos();
  const vaciado = useRef(false);

  // Al abrir: lo mío que lleva más de 30 días en la papelera se borra para siempre.
  useEffect(() => {
    if (vaciado.current || !archivosQ.isSuccess || !carpetasQ.isSuccess) return;
    vaciado.current = true;
    vaciar.mutate();
  }, [archivosQ.isSuccess, carpetasQ.isSuccess, vaciar]);

  const carpetaActual = seccion === "archivos" && carpetaParam && todasC.some((c) => c.id === carpetaParam && !c.borrado_en) ? carpetaParam : null;
  const rolActual = carpetaActual ? roles.get(carpetaActual)?.mi_rol : "propietario";
  const puedeCrear = seccion === "archivos" && puedeEditar(rolActual);

  const irA = useCallback(
    (c: string | null, s: Seccion = "archivos") => {
      setSeccion(s);
      setSel(null);
      setParams(c ? { c } : {}, { replace: false });
    },
    [setParams],
  );

  const nombresEn = useCallback((c: string | null) => [...todasC.filter((x) => x.padre_id === c && !x.borrado_en).map((x) => x.nombre), ...todasA.filter((x) => x.carpeta_id === c && !x.borrado_en).map((x) => x.nombre)], [todasC, todasA]);

  const { cola, agregar, descartar } = useSubidas({ persona: yo, carpeta: carpetaActual, nombresEnCarpeta: () => nombresEn(carpetaActual), alTerminar: (id) => setSel({ tipo: "archivo", id }) });

  /* ---- qué se muestra ---- */
  const visiblesC = useMemo(() => todasC.filter((c) => !c.borrado_en), [todasC]);
  const visiblesA = useMemo(() => todasA.filter((a) => !a.borrado_en), [todasA]);
  const idsC = useMemo(() => new Set(visiblesC.map((c) => c.id)), [visiblesC]);

  const lista = useMemo(() => {
    let cs: CarpetaRow[] = [];
    let as: ArchivoRow[] = [];
    if (seccion === "archivos") {
      cs = visiblesC.filter((c) => (carpetaActual === null ? c.padre_id === null && c.creada_por === yo : c.padre_id === carpetaActual));
      as = visiblesA.filter((a) => (carpetaActual === null ? a.carpeta_id === null && a.creada_por === yo : a.carpeta_id === carpetaActual));
    } else if (seccion === "compartidos") {
      cs = visiblesC.filter((c) => c.creada_por !== yo && (c.padre_id === null || !idsC.has(c.padre_id)));
      as = visiblesA.filter((a) => a.creada_por !== yo && (a.carpeta_id === null || !idsC.has(a.carpeta_id)));
    } else if (seccion === "recientes") {
      as = [...visiblesA].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 30);
    }
    cs = [...cs].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    as = as.filter((a) => pasaFiltro(a, filtro));
    if (seccion !== "recientes") as = [...as].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { carpetas: filtro === "todo" ? cs : [], archivos: as };
  }, [seccion, visiblesC, visiblesA, idsC, carpetaActual, yo, filtro]);

  const papelera = useMemo(() => (seccion === "papelera" ? elementosDePapelera(todasC, todasA) : []), [seccion, todasC, todasA]);

  const seleccion: Seleccion | null = useMemo(() => {
    if (!sel) return null;
    if (sel.tipo === "carpeta") {
      const f = todasC.find((c) => c.id === sel.id);
      return f ? { tipo: "carpeta", fila: f } : null;
    }
    const f = todasA.find((a) => a.id === sel.id);
    return f ? { tipo: "archivo", fila: f } : null;
  }, [sel, todasC, todasA]);

  const migas = useMemo(() => {
    const ruta = rutaDeCarpeta(todasC, carpetaActual);
    const propias = !ruta.length || todasC.find((c) => c.id === ruta[0].id)?.creada_por === yo;
    const raiz = seccion === "compartidos" ? "Compartidos conmigo" : seccion === "recientes" ? "Recientes" : seccion === "papelera" ? "Papelera" : seccion === "catalogo" ? "Catálogo" : propias ? "Mis archivos" : "Compartidos conmigo";
    return [{ id: null as string | null, texto: raiz }, ...ruta.map((c) => ({ id: c.id as string | null, texto: c.nombre }))];
  }, [todasC, carpetaActual, seccion, yo]);

  const bytes = useMemo(() => visiblesA.filter((a) => a.creada_por === yo).reduce((t, a) => t + (a.tamano ?? 0), 0), [visiblesA, yo]);
  const resumenCarpeta = contenidoDe(carpetaActual, todasC, todasA);

  /* ---- abrir, mover, soltar ---- */
  const abrir = useCallback(
    (tipo: "carpeta" | "archivo", id: string) => {
      if (tipo === "carpeta") return irA(id);
      const a = todasA.find((x) => x.id === id);
      if (!a || a.borrado_en) return;
      if (a.tipo === "tabla" || a.tipo === "grafica" || a.tipo === "cruce" || a.tipo === "documento") return navigate(`/admin/udrive/${a.tipo}/${a.id}`);
      if (vistaPrevia(a.mime)) return setDialogo({ t: "previa", s: { tipo: "archivo", fila: a } });
      void descargar(a);
    },
    [irA, navigate, todasA], // eslint-disable-line react-hooks/exhaustive-deps -- descargar es estable
  );

  async function descargar(a: ArchivoRow) {
    if (!a.ruta_storage) return;
    try {
      const url = await enlaceDeArchivo(a.ruta_storage, a.nombre);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.rel = "noopener";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo descargar.");
    }
  }

  const moverA = (tipo: "carpeta" | "archivo", id: string, destino: string | null) => {
    const item = tipo === "carpeta" ? todasC.find((c) => c.id === id) : todasA.find((a) => a.id === id);
    if (!item) return;
    if (!puedeEditar(roles.get(id)?.mi_rol)) return decir("No tiene permiso para mover eso.");
    if (destino !== null && !puedeEditar(roles.get(destino)?.mi_rol)) return decir("No tiene permiso para soltar nada en esa carpeta.");
    const valido = tipo === "carpeta" ? puedeMoverCarpeta(todasC, id, destino) : puedeMoverArchivo(item as ArchivoRow, destino);
    if (!valido) return decir(tipo === "carpeta" ? "Una carpeta no se puede mover dentro de sí misma, ni a donde ya está." : "Ya está en esa carpeta.");
    mover.mutate({ tipo, id, destino }, { onSuccess: () => decir("Movido."), onError: (e) => decir(e.message) });
  };

  const alArrastrar = (e: DragEvent, tipo: "carpeta" | "archivo", id: string) => {
    arrastre.current = { tipo, id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-udrive", `${tipo}:${id}`);
  };
  const esArchivosExternos = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const alSoltarEn = (e: DragEvent, destino: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setSobre(null);
    setSoltando(false);
    if (esArchivosExternos(e) && !arrastre.current) {
      if (destino === carpetaActual && puedeCrear) agregar(e.dataTransfer.files);
      else if (destino !== null && puedeEditar(roles.get(destino)?.mi_rol)) decir("Abra la carpeta y suelte allí los archivos.");
      return;
    }
    const a = arrastre.current;
    arrastre.current = null;
    if (a) moverA(a.tipo, a.id, destino);
  };
  const sobreDestino = (e: DragEvent, clave: string | null) => {
    if (!arrastre.current && !esArchivosExternos(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = arrastre.current ? "move" : "copy";
    setSobre(clave);
  };

  /* ---- Nuevo ---- */
  const abrirMenu = (el: HTMLElement) => {
    const c = cajaDe(el);
    if (c) setMenu(menu ? null : { x: Math.min(c.left, window.innerWidth - 270), y: c.top + c.height + 4 });
  };
  useEffect(() => {
    if (menu) entrarMenu(menuRef.current);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(null);
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", fuera), document.removeEventListener("keydown", esc));
  }, [menu]);

  useEffect(() => {
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando((b) => !b);
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  const nuevaTabla = async () => {
    setMenu(null);
    const { tablaVacia } = await import("../lib/tabla");
    crear.mutate(
      { tipo: "tabla", nombre: nombreLibre("Tabla sin título"), carpeta: carpetaActual, contenido: tablaVacia(() => crypto.randomUUID()) },
      { onSuccess: (id) => navigate(`/admin/udrive/tabla/${id}`), onError: (e) => decir(e.message) },
    );
  };
  const nombreLibre = (base: string) => {
    const usados = nombresEn(carpetaActual).map((n) => n.toLowerCase());
    if (!usados.includes(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!usados.includes(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
  };
  const importarTabla = async (archivo: File) => {
    try {
      const lectura = await leerArchivoEnNavegador(archivo);
      const t = tablaDesdeMatriz(lectura.matriz, () => crypto.randomUUID());
      if (!t.columnas.length) return decir("No encontré encabezados en ese archivo.");
      const nombre = nombreLibre((archivo.name.replace(/\.[^.]+$/, "") || "Tabla importada").slice(0, 120));
      crear.mutate(
        { tipo: "tabla", nombre, carpeta: carpetaActual, contenido: { version: 1, columnas: t.columnas, filas: t.filas, presentacion: { titulo: "", nota: "", enIndice: true, repetirEncabezado: true }, mapaCalor: false } },
        {
          onSuccess: (id) => {
            if (t.errores.length) decir(`Importada con ${t.errores.length} ${t.errores.length === 1 ? "valor" : "valores"} por revisar.`);
            navigate(`/admin/udrive/tabla/${id}`);
          },
          onError: (e) => decir(e.message),
        },
      );
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  };

  const entradas = useMemo<EntradaBuscador[]>(
    () => [
      ...visiblesC.map((c) => ({ id: `c:${c.id}`, titulo: c.nombre, icono: "folder" as const, pista: "Carpeta" })),
      ...visiblesA.map((a) => ({ id: `a:${a.id}`, titulo: a.nombre, icono: a.tipo === "tabla" ? ("table" as const) : a.tipo === "grafica" ? ("chart" as const) : ("document" as const), pista: NOMBRE_TIPO[a.tipo] })),
      ...(puedeCrear ? ACCIONES : ACCIONES.filter((x) => x.id === "x:grafica")),
    ],
    [visiblesC, visiblesA, puedeCrear],
  );
  const elegirBusqueda = (e: EntradaBuscador) => {
    setBuscando(false);
    const [k, id] = [e.id.slice(0, 1), e.id.slice(2)];
    if (k === "c") {
      irA(id);
    } else if (k === "a") {
      const a = todasA.find((x) => x.id === id);
      if (a) {
        irA(a.carpeta_id && todasC.some((c) => c.id === a.carpeta_id) ? a.carpeta_id : null, a.creada_por === yo ? "archivos" : "compartidos");
        setSel({ tipo: "archivo", id });
      }
    } else if (e.id === "x:carpeta") setDialogo({ t: "carpeta" });
    else if (e.id === "x:tabla") void nuevaTabla();
    else if (e.id === "x:grafica") irA(null, "catalogo");
    else if (e.id === "x:subir") inputSubir.current?.click();
  };

  const alTeclearItem = (e: KeyboardEvent, tipo: "carpeta" | "archivo", id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      abrir(tipo, id);
    } else if ((e.key === "Delete" || e.key === "Backspace") && seccion !== "papelera" && puedeEditar(roles.get(id)?.mi_rol)) {
      e.preventDefault();
      const fila = tipo === "carpeta" ? todasC.find((c) => c.id === id) : todasA.find((a) => a.id === id);
      if (fila) setDialogo({ t: "papelera", s: tipo === "carpeta" ? { tipo, fila: fila as CarpetaRow } : { tipo, fila: fila as ArchivoRow } });
    }
  };

  useCascada(zona, ".es-tile, .es-lista tbody tr", `${seccion}:${carpetaActual}:${filtro}:${vista}`);

  /* ---- pantallas de espera ---- */
  const falla = carpetasQ.error ?? archivosQ.error;
  if (carpetasQ.isPending || archivosQ.isPending) return <EstadoPantalla><CardSkeleton count={3} /></EstadoPantalla>;
  if (falla) {
    return (
      <EstadoPantalla>
        {esFaltaMigracion(falla) ? <div className="es-empty"><b>Falta preparar UDrive</b><span>{falla.message} Pida a quien administra la base de datos que la aplique.</span></div> : <ErrorBlock error={falla} onRetry={() => { void carpetasQ.refetch(); void archivosQ.refetch(); }} />}
      </EstadoPantalla>
    );
  }

  const hermanasDe = (s: Seleccion) => nombresEn(s.tipo === "carpeta" ? s.fila.padre_id : s.fila.carpeta_id).filter((n) => n.toLowerCase() !== s.fila.nombre.toLowerCase());
  const acciones = (s: Seleccion) => ({
    abrir: () => abrir(s.tipo, s.fila.id),
    previa: () => setDialogo({ t: "previa", s }),
    descargar: () => s.tipo === "archivo" && void descargar(s.fila),
    renombrar: (nombre: string) => renombrar.mutate({ tipo: s.tipo, id: s.fila.id, nombre }, { onSuccess: () => decir("Nombre cambiado."), onError: (e) => decir(e.message) }),
    mover: () => setDialogo({ t: "mover", s }),
    compartir: () => setDialogo({ t: "compartir", s }),
    aPapelera: () => setDialogo({ t: "papelera", s }),
    restaurar: () => restaurar.mutate({ tipo: s.tipo, id: s.fila.id }, { onSuccess: () => decir("Restaurado."), onError: (e) => decir(e.message) }),
    eliminar: () => setDialogo({ t: "borrar", s }),
  });
  const diasSel = seleccion?.fila.borrado_en ? (papelera.find((p) => p.id === seleccion.fila.id)?.dias ?? null) : null;

  const hayAlgo = lista.carpetas.length + lista.archivos.length > 0;

  return (
    <div className="es pc ud">
      <BarraSuperior sigla="UD" marca="UDrive" buscar="Buscar carpetas, tablas y gráficas" onBuscar={() => setBuscando(true)} />
      <div className="pc-body">
        <Riel etiqueta="Secciones de UDrive">
          <EntradaRiel icono="folder" actual={seccion === "archivos"} onClick={() => irA(null)}>Mis archivos</EntradaRiel>
          <EntradaRiel icono="users" actual={seccion === "compartidos"} onClick={() => irA(null, "compartidos")}>Compartidos conmigo</EntradaRiel>
          <EntradaRiel icono="clock" actual={seccion === "recientes"} onClick={() => irA(null, "recientes")}>Recientes</EntradaRiel>
          <hr />
          <TituloRiel>Para armar informes</TituloRiel>
          <EntradaRiel icono="chart" actual={seccion === "catalogo"} onClick={() => irA(null, "catalogo")}>Catálogo de gráficas</EntradaRiel>
          <hr />
          <EntradaRiel icono="trash" actual={seccion === "papelera"} onClick={() => irA(null, "papelera")} cuenta={elementosDePapelera(todasC, todasA).length || undefined}>Papelera</EntradaRiel>
          <div className="es-note" style={{ marginTop: "auto", padding: "10px" }}>
            {bytes ? <>Sus archivos subidos ocupan <b className="es-num">{textoTamano(bytes)}</b>. </> : null}
            Las imágenes se comprimen al subirlas. La papelera guarda 30 días.
          </div>
        </Riel>

        <main
          className="ud-main"
          data-soltando={soltando && puedeCrear}
          onDragOver={(e) => {
            if (esArchivosExternos(e) && !arrastre.current) {
              e.preventDefault();
              setSoltando(true);
            }
          }}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setSoltando(false)}
          onDrop={(e) => alSoltarEn(e, carpetaActual)}
          onDragEnd={() => (arrastre.current = null)}
        >
          <nav className="es-crumb" aria-label="Dónde está">
            {migas.map((m, i) => (
              <span key={m.id ?? "raiz"} style={{ display: "contents" }}>
                {i > 0 ? <Icon name="chevron-right" size={14} /> : null}
                <button
                  type="button"
                  className="ud-miga"
                  data-sobre={sobre === `m:${m.id}`}
                  aria-current={i === migas.length - 1 ? "page" : undefined}
                  onClick={() => (seccion === "archivos" || i > 0 ? irA(m.id, seccion === "archivos" ? "archivos" : seccion) : undefined)}
                  onDragOver={(e) => seccion === "archivos" && sobreDestino(e, `m:${m.id}`)}
                  onDragLeave={() => setSobre(null)}
                  onDrop={(e) => seccion === "archivos" && alSoltarEn(e, m.id)}
                >
                  {m.texto}
                </button>
              </span>
            ))}
          </nav>

          <div className="es-cmd">
            <input ref={inputSubir} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) agregar(e.target.files); e.target.value = ""; }} />
            <input ref={inputImportar} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarTabla(f); e.target.value = ""; }} />
            {seccion === "archivos" ? (
              <>
                <button type="button" className="es-btn es-btn--pri" disabled={!puedeCrear} aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={(e) => abrirMenu(e.currentTarget)}>
                  <Icon name="plus" size={16} />Nuevo
                </button>
                <button type="button" className="es-btn" disabled={!puedeCrear} onClick={() => inputSubir.current?.click()}>
                  <Icon name="upload" size={16} />Subir archivos
                </button>
                <span className="es-sep" />
              </>
            ) : null}
            {seccion !== "papelera" && seccion !== "catalogo" ? (
              <div className="es-chips" role="group" aria-label="Filtrar por tipo">
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" className="es-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.etiqueta}</button>
                ))}
              </div>
            ) : null}
            <span className="es-grow" />
            <div className="es-seg" role="group" aria-label="Vista">
              <button type="button" aria-pressed={vista === "mosaicos"} aria-label="Mosaicos" onClick={() => setVista("mosaicos")}><Icon name="tiles" size={16} /></button>
              <button type="button" aria-pressed={vista === "lista"} aria-label="Lista" onClick={() => setVista("lista")}><Icon name="rows" size={16} /></button>
            </div>
            <button type="button" className="es-btn es-btn--ghost" aria-pressed={detalles} aria-label="Detalles" onClick={() => setDetalles(!detalles)}><Icon name="info" size={16} /></button>
          </div>

          {seccion === "catalogo" ? (
            <Galeria carpeta={null} decir={decir} onImportar={() => inputImportar.current?.click()} />
          ) : (
            <div className="es-files" ref={zona} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {seccion === "papelera" ? (
                papelera.length ? (
                  <ListaPapelera items={papelera} sel={sel} onSel={setSel} />
                ) : (
                  <div className="es-empty"><b>La papelera está vacía</b><span>Lo que borre se queda aquí 30 días y se puede restaurar.</span></div>
                )
              ) : hayAlgo ? (
                <>
                  {lista.carpetas.length ? (
                    <>
                      <h2 className="ud-seccion">Carpetas</h2>
                      <div className="es-tiles">
                        {lista.carpetas.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="es-tile es-folder ud-carpeta ud-tile"
                            draggable={puedeEditar(roles.get(c.id)?.mi_rol)}
                            data-sobre={sobre === `c:${c.id}`}
                            data-arrastrando={arrastre.current?.id === c.id}
                            aria-pressed={sel?.id === c.id}
                            aria-selected={sel?.id === c.id}
                            onClick={() => setSel({ tipo: "carpeta", id: c.id })}
                            onDoubleClick={() => abrir("carpeta", c.id)}
                            onKeyDown={(e) => alTeclearItem(e, "carpeta", c.id)}
                            onDragStart={(e) => alArrastrar(e, "carpeta", c.id)}
                            onDragOver={(e) => sobreDestino(e, `c:${c.id}`)}
                            onDragLeave={() => setSobre(null)}
                            onDrop={(e) => alSoltarEn(e, c.id)}
                          >
                            <span className="es-thumb"><MiniaturaCarpeta /></span>
                            <span className="es-tile__meta">
                              <span className="es-tile__nm"><IconoItem tipo="carpeta" /><span>{c.nombre}</span></span>
                              <span className="es-tile__sub">{(() => { const n = contenidoDe(c.id, todasC, todasA); return `${n.carpetas + n.archivos} ${n.carpetas + n.archivos === 1 ? "elemento" : "elementos"}`; })()}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {lista.archivos.length ? (
                    <>
                      <h2 className="ud-seccion">{seccion === "recientes" ? "Lo último que cambió" : "Archivos"}</h2>
                      {vista === "mosaicos" ? (
                        <div className="es-tiles" role="listbox" aria-label="Archivos">
                          {lista.archivos.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              role="option"
                              className="es-tile ud-tile"
                              draggable={puedeEditar(roles.get(a.id)?.mi_rol)}
                              data-arrastrando={arrastre.current?.id === a.id}
                              aria-selected={sel?.id === a.id}
                              onClick={() => setSel({ tipo: "archivo", id: a.id })}
                              onDoubleClick={() => abrir("archivo", a.id)}
                              onKeyDown={(e) => alTeclearItem(e, "archivo", a.id)}
                              onDragStart={(e) => alArrastrar(e, "archivo", a.id)}
                            >
                              <span className="es-thumb"><Miniatura tipo={a.tipo} nombre={a.nombre} /></span>
                              <span className="es-tile__meta">
                                <span className="es-tile__nm"><IconoItem tipo={a.tipo} /><span>{a.nombre}</span></span>
                                <span className="es-tile__sub">{subtituloDe(a)}</span>
                                {a.tipo !== "archivo" && a.tipo !== "documento" ? <span className="es-tile__row2"><Estado estado={a.estado} /></span> : null}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <table className="es-lista" role="listbox" aria-label="Archivos">
                          <thead><tr><th>Nombre</th><th>Tipo</th><th>Cambió</th><th>Tamaño</th></tr></thead>
                          <tbody>
                            {lista.archivos.map((a) => (
                              <tr key={a.id} role="option" tabIndex={0} draggable={puedeEditar(roles.get(a.id)?.mi_rol)} aria-selected={sel?.id === a.id} onClick={() => setSel({ tipo: "archivo", id: a.id })} onDoubleClick={() => abrir("archivo", a.id)} onKeyDown={(e) => alTeclearItem(e, "archivo", a.id)} onDragStart={(e) => alArrastrar(e, "archivo", a.id)}>
                                <td><span className="es-fn"><IconoItem tipo={a.tipo} />{a.nombre}</span></td>
                                <td>{NOMBRE_TIPO[a.tipo]}</td>
                                <td>{haceCuanto(a.updated_at)}</td>
                                <td className="es-num">{a.tipo === "archivo" ? textoTamano(a.tamano) : a.tipo === "tabla" ? `${a.resumen.filas ?? 0} filas` : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  ) : null}
                  {seccion === "archivos" && puedeCrear && filtro === "todo" && !lista.archivos.length ? <Soltar onElegir={() => inputSubir.current?.click()} /> : null}
                </>
              ) : seccion === "archivos" && puedeCrear ? (
                <Soltar vacia onElegir={() => inputSubir.current?.click()} />
              ) : (
                <div className="es-empty">
                  <b>{seccion === "compartidos" ? "Nadie ha compartido nada con usted" : seccion === "recientes" ? "Todavía no hay archivos" : filtro !== "todo" ? "No hay nada de este tipo aquí" : "Esta carpeta está vacía"}</b>
                  <span>{seccion === "compartidos" ? "Cuando alguien le comparta una carpeta o un archivo, aparecerá aquí." : "Cree una tabla, una gráfica o un informe, o suba un archivo."}</span>
                </div>
              )}
            </div>
          )}
        </main>

        <PanelDetalles abierto={detalles}>
          <Detalles
            sel={seleccion}
            dueno={seleccion ? roles.get(seleccion.fila.id) : undefined}
            hermanas={seleccion ? hermanasDe(seleccion) : []}
            dias={diasSel}
            carpetaAbierta={{ nombre: migas[migas.length - 1].texto, carpetas: resumenCarpeta.carpetas, archivos: resumenCarpeta.archivos, bytes }}
            acciones={seleccion ? acciones(seleccion) : { abrir() {}, previa() {}, descargar() {}, renombrar() {}, mover() {}, compartir() {}, aPapelera() {}, restaurar() {}, eliminar() {} }}
          />
        </PanelDetalles>
      </div>

      {menu ? (
        <div ref={menuRef} className="es-menu" role="menu" style={{ left: menu.x, top: menu.y, width: 256 }}>
          <div className="es-h">Crear</div>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => { setMenu(null); setDialogo({ t: "carpeta" }); }}><Icon name="folder" size={16} />Nueva carpeta</button>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => void nuevaTabla()}><Icon name="table" size={16} />Nueva tabla</button>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => { setMenu(null); setDialogo({ t: "informe" }); }}><Icon name="document" size={16} />Nuevo informe</button>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => { setMenu(null); inputImportar.current?.click(); }}><Icon name="upload" size={16} />Tabla desde Excel o CSV</button>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => { setMenu(null); irA(null, "catalogo"); }}><Icon name="chart" size={16} />Nueva gráfica…</button>
          <button type="button" role="menuitem" className="es-btn es-btn--ghost" onClick={() => { setMenu(null); crear.mutate({ tipo: "cruce", nombre: nombreLibre("Cruce de tablas"), carpeta: carpetaActual, contenido: { version: 1, modo: "dos", tabla_a: null, tabla_b: null, columna_a: null, columna_b: null, conservar: "coinciden", resultado_id: null, grafica: null } }, { onSuccess: (id) => navigate(`/admin/udrive/cruce/${id}`), onError: (e) => decir(e.message) }); }}><Icon name="link" size={16} />Cruce de dos tablas</button>
        </div>
      ) : null}

      {buscando ? <Buscador entradas={entradas} onElegir={elegirBusqueda} onCerrar={() => setBuscando(false)} /> : null}
      {dialogo?.t === "informe" ? <NuevoInforme carpetaInicial={carpetaActual} decir={decir} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.t === "carpeta" ? <NuevaCarpeta padre={carpetaActual} hermanas={nombresEn(carpetaActual)} decir={decir} onCerrar={() => setDialogo(null)} onCreada={(id) => setSel({ tipo: "carpeta", id })} /> : null}
      {dialogo?.t === "mover" ? (
        <MoverA
          nombre={dialogo.s.fila.nombre}
          tipo={dialogo.s.tipo}
          id={dialogo.s.fila.id}
          actual={dialogo.s.tipo === "carpeta" ? dialogo.s.fila.padre_id : dialogo.s.fila.carpeta_id}
          carpetas={todasC}
          roles={roles}
          yo={yo ?? ""}
          onCerrar={() => setDialogo(null)}
          onMover={(d) => { const s = dialogo.s; setDialogo(null); moverA(s.tipo, s.fila.id, d); }}
        />
      ) : null}
      {dialogo?.t === "compartir" ? <Compartir tipo={dialogo.s.tipo} id={dialogo.s.fila.id} nombre={dialogo.s.fila.nombre} decir={decir} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.t === "previa" && dialogo.s.tipo === "archivo" ? <Previa archivo={dialogo.s.fila} onCerrar={() => setDialogo(null)} /> : null}
      {dialogo?.t === "papelera" ? (
        <Confirmar titulo="Mandar a la papelera" boton="A la papelera" ocupado={aPapelera.isPending} onCerrar={() => setDialogo(null)} onConfirmar={() => { const s = dialogo.s; aPapelera.mutate({ tipo: s.tipo, id: s.fila.id }, { onSuccess: () => { decir("Está en la papelera por 30 días."); setSel(null); setDialogo(null); }, onError: (e) => decir(e.message) }); }}>
          <p><b>{dialogo.s.fila.nombre}</b> {dialogo.s.tipo === "carpeta" ? "y todo lo que contiene " : ""}se queda en la papelera 30 días y se puede restaurar.</p>
        </Confirmar>
      ) : null}
      {dialogo?.t === "borrar" ? (
        <Confirmar titulo="Borrar para siempre" boton="Borrar para siempre" ocupado={eliminar.isPending} onCerrar={() => setDialogo(null)} onConfirmar={() => { const s = dialogo.s; eliminar.mutate({ tipo: s.tipo, id: s.fila.id }, { onSuccess: () => { decir("Borrado para siempre."); setSel(null); setDialogo(null); }, onError: (e) => decir(e.message) }); }}>
          <p><b>{dialogo.s.fila.nombre}</b> {dialogo.s.tipo === "carpeta" ? "y todo lo que contiene " : ""}se borrará y no se podrá recuperar.</p>
        </Confirmar>
      ) : null}

      <PanelSubidas cola={cola} onDescartar={descartar} />
      <Aviso texto={aviso} />
      {/* El lector de pantalla oye cuántos elementos quedaron al cambiar de carpeta o de filtro. */}
      <span className="ud-sr" role="status">{seccion === "papelera" ? `${papelera.length} en la papelera` : seccion === "catalogo" ? "Catálogo de gráficas" : `${lista.carpetas.length + lista.archivos.length} elementos`}</span>
    </div>
  );
}

function Soltar({ vacia, onElegir }: { vacia?: boolean; onElegir: () => void }) {
  return (
    <div className="ud-soltar" style={{ marginTop: vacia ? 0 : 22 }}>
      <Icon name="upload" size={22} />
      <b>{vacia ? "Esta carpeta está vacía. Suelte aquí archivos de cualquier tipo" : "Suelte aquí archivos de cualquier tipo"}</b>
      <span>PDF, Word, Excel, imágenes, comprimidos y más, hasta 100 MB cada uno. Las imágenes se comprimen al subirlas.</span>
      <button type="button" className="es-btn" onClick={onElegir}>Elegir archivos</button>
    </div>
  );
}

function ListaPapelera({ items, sel, onSel }: { items: ReturnType<typeof elementosDePapelera>; sel: { tipo: string; id: string } | null; onSel: (s: { tipo: "carpeta" | "archivo"; id: string }) => void }) {
  return (
    <table className="es-lista" role="listbox" aria-label="Papelera">
      <thead><tr><th>Nombre</th><th>Se borró</th><th>Se borra para siempre</th></tr></thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id} role="option" tabIndex={0} aria-selected={sel?.id === i.id} onClick={() => onSel({ tipo: i.tipo, id: i.id })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel({ tipo: i.tipo, id: i.id })}>
            <td><span className="es-fn"><IconoItem tipo={i.tipo} />{i.nombre}</span></td>
            <td>{haceCuanto(i.borrado_en)}</td>
            <td>{i.dias === 0 ? "Hoy" : `En ${i.dias} ${i.dias === 1 ? "día" : "días"}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

