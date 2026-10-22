/* =============================================================================
   Espacio de archivos · el editor a pantalla completa.

   Se abre con doble clic o Enter desde un mosaico y CRECE desde él (clip-path).
   Tabla con @tanstack/react-table (orden con Mayús para varias columnas,
   búsqueda en todo el archivo, columnas visibles, primera columna fija,
   selección de filas) y @tanstack/react-virtual para archivos grandes; vista
   Tabla o Lista; paneles laterales que pone cada módulo; pestañas de hojas
   al pie, como en Excel; y dos maneras de guardar:

     · «auto»   lo escrito se guarda solo, 700 ms después (Programas en Cifras);
     · «manual» un botón guarda las filas válidas y las que tienen error o
                están bloqueadas quedan sin guardar (Internacionalización).

   Qué es una columna, cómo se lee y valida una celda, a qué grupo pertenece
   una fila (el campus) y cómo se guarda lo pone el módulo. Con `editable` en
   falso todo queda en solo lectura.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { columnFilteringFeature, columnVisibilityFeature, createColumnHelper, createFilteredRowModel, createSortedRowModel, globalFilteringFeature, rowSelectionFeature, rowSortingFeature, tableFeatures, useTable } from "@tanstack/react-table";
import { Icon } from "../ui/Icon";
import { Hoja } from "./Hoja";
import type { HojaApi } from "./Hoja";
import { aplicarPegado, cambiarCelda, cambiosPendientes, erroresEnCeldas, filasLocales, filasSucias, llaveDeCelda, normalizar, reconciliar, siguienteError } from "./logica";
import type { Guardado } from "./logica";
import { cajaDe, crecerDesde, encogerHacia, entrarMenu, usePanelAncho } from "./movimiento";
import type { Caja, Datos, EspColumna, FilaGuardada, FilaLocal, Reglas } from "./tipos";
import { IconoArchivo } from "./piezas";
import { hayRecorrido } from "./Ventana";

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

const ayudante = createColumnHelper<typeof features, FilaLocal>();
const SIN_FILAS: FilaLocal[] = [];

/** Lo que se ordena de una celda: el número como número, lo demás como texto. */
function valorDeOrden(f: FilaLocal, c: EspColumna): number | string | undefined {
  const v = f.datos[c.clave];
  if (v === null || v === undefined || v === "") return undefined;
  if (c.tipo === "numero" || c.tipo === "porcentaje") {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isNaN(n) ? String(v) : n;
  }
  return String(v);
}

export interface ContextoPanel {
  filas: FilaLocal[];
  /** Guarda lo pendiente antes de cambiar la estructura; falso si no se pudo. */
  guardarAntes: () => Promise<boolean>;
}

export interface PanelEditor {
  etiqueta: string;
  icono?: "link";
  /** Valor de data-tour del botón que abre el panel. */
  tour?: string;
  abierto?: boolean;
  contenido: (c: ContextoPanel) => ReactNode;
}

export interface PestanasEditor {
  items: { id: string; nombre: string; nota?: string }[];
  activa: string | null;
  onElegir: (id: string) => void;
  /** Botón al final (p. ej. «Nueva hoja»). */
  extra?: ReactNode;
}

export interface PropsEditor {
  /** Cambia cuando el editor debe empezar de cero con otras filas (otra hoja). */
  clave: string;
  titulo: string;
  tipo: "tabla" | "lista";
  origen: Caja | null;
  onCerrar: () => void;
  nombre?: { valor: string; editable: boolean; renombrar: (nombre: string) => void };
  /** La ficha de estado del archivo; `sucia` dice que hay cambios sin guardar. */
  chip: (c: { sucia: boolean; errores: number }) => ReactNode;
  /** Botones de la derecha de la cabecera (Marcar como listo…). */
  acciones?: (c: { guardar: () => Promise<boolean>; errores: number; irAlError: () => void }) => ReactNode;
  recorrido?: () => void;
  columnas: EspColumna[];
  reglas: Reglas;
  guardadas: FilaGuardada[] | undefined;
  refrescar: () => Promise<FilaGuardada[]>;
  guardar: (g: Guardado) => Promise<void>;
  modo?: "auto" | "manual";
  editable: boolean;
  /** Mensaje de solo lectura de la cabecera. */
  insigniaSoloLectura?: string;
  bloqueoFila?: (f: FilaLocal) => string | null;
  /** Grupo de una fila nueva; nulo si no se pueden agregar filas. */
  grupoNuevo?: () => string | null | undefined;
  columnaGrupo?: { etiqueta: string; texto: (grupo: string | undefined) => string };
  /** Columnas de solo lectura tras el grupo (autoría de cada fila). */
  columnasInfo?: { etiqueta: string; ancho?: number; texto: (f: FilaLocal) => string }[];
  /** Pide confirmación antes de quitar filas. */
  confirmarQuitar?: boolean;
  /** Franja entre la cabecera y las herramientas (p. ej. el envío de una hoja). */
  barra?: ReactNode;
  pestanas?: PestanasEditor;
  panelIzq?: PanelEditor;
  panelDer?: PanelEditor;
  decir: (mensaje: string) => void;
  /** Hay un archivo mostrándose (falso: «ya no existe»). */
  existe?: boolean;
  /** Se anima el crecimiento desde el mosaico (la primera vez). */
  animar?: boolean;
  /** Foco en la primera celda al abrir. */
  enfocarAlAbrir?: boolean;
  /** Mapa de calor: color de fondo de una celda (lo pone el módulo; ver Hoja). */
  colorCelda?: (columna: EspColumna, valor: unknown) => string | undefined;
}

type Guardando = "guardado" | "guardando" | "error";

/** El editor. Al cambiar `clave` (otra hoja) vuelve a empezar sin repetir la animación de apertura. */
export function Editor(p: Omit<PropsEditor, "animar">) {
  const primera = useRef(true);
  useEffect(() => {
    primera.current = false;
  }, []);
  return <Motor key={p.clave} {...p} animar={primera.current} />;
}

function Motor(p: PropsEditor) {
  const { decir, reglas, columnas, editable, modo = "auto" } = p;
  const manual = modo === "manual";
  const cuerpo = useRef<HTMLDivElement>(null);
  const hoja = useRef<HojaApi>(null);

  /* ---- filas: lo guardado y lo que se está escribiendo ---------------------------------- */
  const [filas, setFilas] = useState<FilaLocal[]>(() => (p.guardadas ? filasLocales(p.guardadas) : SIN_FILAS));
  const filasRef = useRef<FilaLocal[]>(filas);
  const servidor = useRef<FilaGuardada[]>(p.guardadas ?? []);
  const contador = useRef(0);
  const [guardado, setGuardado] = useState<Guardando>("guardado");
  const reloj = useRef<number | undefined>();
  const enCurso = useRef<Promise<boolean> | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  const poner = useCallback((siguientes: FilaLocal[]) => {
    filasRef.current = siguientes;
    setFilas(siguientes);
  }, []);

  useEffect(() => {
    if (!p.guardadas || cambiosPendientes(filasRef.current, servidor.current)) return;
    servidor.current = p.guardadas;
    poner(filasLocales(p.guardadas));
  }, [p.guardadas, poner]);

  /** Filas que sí se pueden mandar: sin error y sin bloqueo (en guardado manual). */
  const erroresPorFila = useCallback(
    (lista: FilaLocal[]) => new Set(erroresEnCeldas(propsRef.current.columnas, lista, propsRef.current.reglas).map((e) => e.k)),
    [],
  );

  const guardarYa = useCallback(
    async (soloBorrar = false): Promise<boolean> => {
      window.clearTimeout(reloj.current);
      const q = propsRef.current;
      if (!q.editable) return true;
      if (enCurso.current) await enCurso.current;
      const locales = filasRef.current;
      const malas = q.modo === "manual" ? erroresPorFila(locales) : new Set<string>();
      const incluir = q.modo === "manual" ? (f: FilaLocal) => !malas.has(f.k) && !q.bloqueoFila?.(f) : undefined;
      const cambios = cambiosPendientes(locales, servidor.current, { incluir, soloBorrar });
      if (!cambios) {
        setGuardado("guardado");
        return true;
      }
      const antes = servidor.current;
      const mandadas = soloBorrar ? [] : filasSucias(locales, servidor.current).filter((f) => incluir?.(f) ?? true);
      const enviadas = new Map(mandadas.map((f) => [f.k, f.datos] as const));
      setGuardado("guardando");
      const trabajo = (async () => {
        try {
          await q.guardar(cambios);
          const nuevo = await q.refrescar();
          servidor.current = nuevo;
          poner(reconciliar({ locales: filasRef.current, servidor: nuevo, antes, enviadas }));
          setGuardado("guardado");
          return true;
        } catch (e) {
          setGuardado("error");
          q.decir(e instanceof Error ? e.message : "No se pudo guardar.");
          return false;
        } finally {
          enCurso.current = null;
        }
      })();
      enCurso.current = trabajo;
      return trabajo;
    },
    [erroresPorFila, poner],
  );

  const cambiaron = useCallback(
    (siguientes: FilaLocal[], guardarEnSeguida = false) => {
      poner(siguientes);
      if (propsRef.current.modo === "manual") return;
      setGuardado("guardando");
      window.clearTimeout(reloj.current);
      reloj.current = window.setTimeout(() => void guardarYa(), guardarEnSeguida ? 0 : 700);
    },
    [guardarYa, poner],
  );
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  /* ---- la tabla ------------------------------------------------------------------------ */
  const defs = useMemo(() => ayudante.columns(columnas.map((c) => ayudante.accessor((f) => valorDeOrden(f, c), { id: c.clave, header: c.etiqueta, sortUndefined: "last" }))), [columnas]);
  const [busqueda, setBusqueda] = useState("");
  const tabla = useTable({
    features,
    columns: defs,
    data: filas,
    getRowId: (f) => f.k,
    enableRowSelection: editable,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (fila, id, valor: string) => normalizar(String(fila.getValue(id) ?? "")).includes(normalizar(valor)),
  });
  const filasVisibles = tabla.getRowModel().rows.map((r) => r.original);
  const clavesVisibles = useMemo(() => filasVisibles.map((f) => f.k), [filasVisibles]);
  const columnasVisibles = useMemo(() => {
    const visibles = new Set(tabla.getVisibleLeafColumns().map((c) => c.id));
    return columnas.filter((c) => visibles.has(c.clave));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabla.state cambia con la visibilidad
  }, [columnas, tabla.state.columnVisibility]);
  const ordenes = useMemo(() => new Map((tabla.state.sorting ?? []).map((s) => [s.id, s.desc ? ("desc" as const) : ("asc" as const)])), [tabla.state.sorting]);
  const seleccionadas = useMemo(() => new Set(Object.entries(tabla.state.rowSelection ?? {}).filter(([, v]) => v).map(([k]) => k)), [tabla.state.rowSelection]);

  const errores = useMemo(() => erroresEnCeldas(columnas, filas, reglas, clavesVisibles), [columnas, filas, reglas, clavesVisibles]);
  const mensajes = useMemo(() => new Map(errores.map((e) => [llaveDeCelda(e.k, e.clave), e.mensaje] as const)), [errores]);
  const totalErrores = useMemo(() => erroresEnCeldas(columnas, filas, reglas).length, [columnas, filas, reglas]);
  const sucias = useMemo(() => filasSucias(filas, servidor.current), [filas, guardado]); // eslint-disable-line react-hooks/exhaustive-deps -- servidor cambia con guardado
  const clavesSucias = useMemo(() => new Set(sucias.map((f) => f.k)), [sucias]);
  const filasConError = useMemo(() => erroresPorFila(filas), [erroresPorFila, filas]);
  const hayPendiente = sucias.length > 0 || filas.length < servidor.current.length;

  /* ---- estado del encabezado ------------------------------------------------------------------ */
  const [vista, setVista] = useState<"tabla" | "lista">(p.tipo === "lista" ? "lista" : "tabla");
  const [panelIzq, setPanelIzq] = useState(Boolean(p.panelIzq?.abierto));
  const [panelDer, setPanelDer] = useState(Boolean(p.panelDer?.abierto));
  const [fijar, setFijar] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [nombre, setNombre] = useState(p.nombre?.valor ?? "");
  const [cerrando, setCerrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const campos = useRef<HTMLDivElement>(null);
  const responde = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avisoSalida = useRef(false);
  usePanelAncho(campos, panelIzq, 400);
  usePanelAncho(responde, panelDer, 400);
  const abierto = useRef(false);

  useEffect(() => {
    if (!cuerpo.current || abierto.current) return;
    abierto.current = true;
    if (p.animar !== false) crecerDesde(cuerpo.current, p.origen);
    const t = window.setTimeout(() => {
      const primero = cuerpo.current?.querySelector<HTMLElement>(".es-cell:not(:disabled)");
      if (editable && p.enfocarAlAbrir !== false) primero?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);

  useEffect(() => {
    if (p.nombre) setNombre(p.nombre.valor);
  }, [p.nombre?.valor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (menu) entrarMenu(menuRef.current);
  }, [menu]);

  const cerrar = useCallback(async () => {
    if (cerrando) return;
    if (manual) {
      // Guardado manual: se guardan las filas válidas; si quedan otras sin guardar, avisa una vez.
      await guardarYa();
      if (cambiosPendientes(filasRef.current, servidor.current) && !avisoSalida.current) {
        avisoSalida.current = true;
        decir("Quedan filas sin guardar (con error o bloqueadas). Vuelva a pulsar para salir sin ellas.");
        return;
      }
    } else if (!(await guardarYa())) return;
    setCerrando(true);
    const el = cuerpo.current;
    if (!el) return p.onCerrar();
    encogerHacia(el, p.origen, p.onCerrar);
  }, [cerrando, decir, guardarYa, manual, p.onCerrar, p.origen]);

  const irAlSiguienteError = useCallback(() => {
    const e = siguienteError(errores, hoja.current?.activa() ?? null);
    if (!e) {
      decir("No hay errores.");
      return;
    }
    const i = clavesVisibles.indexOf(e.k);
    if (i >= 0) hoja.current?.enfocar(i, e.clave);
  }, [errores, clavesVisibles, decir]);

  /* ---- teclado ----------------------------------------------------------------------------------- */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (hayRecorrido()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void guardarYa().then((ok) => ok && decir("Guardado."));
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        irAlSiguienteError();
        return;
      }
      if (e.key === "Escape") {
        if (document.querySelector(".es-scrim")) return;
        if (menu) {
          setMenu(null);
          return;
        }
        if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
        e.preventDefault();
        void cerrar();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cerrar, decir, guardarYa, irAlSiguienteError, menu]);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-columnas]")) setMenu(null);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [menu]);

  /* ---- acciones sobre las filas -------------------------------------------------------------------- */
  const nuevaClave = useCallback(() => `n${++contador.current}`, []);
  const puedeAgregar = editable && p.grupoNuevo?.() !== null;

  const alCambiar = useCallback(
    (k: string, columna: EspColumna, escrito: string) => {
      const siguientes = cambiarCelda(filasRef.current, k, columna, escrito, reglas, columnas);
      if (siguientes.some((f, i) => f !== filasRef.current[i])) cambiaron(siguientes);
    },
    [cambiaron, columnas, reglas],
  );

  const alPegar = useCallback(
    (desde: { fila: number; columna: number }, matriz: string[][]) => {
      const r = aplicarPegado({ filas: filasRef.current, orden: clavesVisibles, columnas: columnasVisibles, desde, matriz, reglas, claveNueva: nuevaClave, grupoNuevo: p.grupoNuevo, bloqueada: p.bloqueoFila ? (f) => Boolean(p.bloqueoFila!(f)) : undefined });
      cambiaron(r.filas);
      decir(`${r.pegadas} ${r.pegadas === 1 ? "fila pegada" : "filas pegadas"}.`);
    },
    [cambiaron, clavesVisibles, columnasVisibles, decir, nuevaClave, p.bloqueoFila, p.grupoNuevo, reglas],
  );

  const agregar = useCallback(() => {
    if (!puedeAgregar) return;
    const k = nuevaClave();
    cambiaron([...filasRef.current, { k, datos: {} as Datos, grupo: p.grupoNuevo?.() ?? undefined }]);
    tabla.setGlobalFilter("");
    setBusqueda("");
    const primera = columnas.find((c) => !c.solo_lectura);
    window.setTimeout(() => {
      const i = tabla.getRowModel().rows.findIndex((r) => r.original.k === k);
      if (i >= 0 && primera) hoja.current?.enfocar(i, primera.clave);
    }, 30);
  }, [cambiaron, columnas, nuevaClave, p.grupoNuevo, puedeAgregar, tabla]);

  const quitar = useCallback(
    (claves: string[]) => {
      const fuera = new Set(claves);
      cambiaron(filasRef.current.filter((f) => !fuera.has(f.k)), manual);
      if (manual) void guardarYa(true);
      tabla.resetRowSelection();
      setConfirmando(false);
      decir(`${claves.length} ${claves.length === 1 ? "fila eliminada" : "filas eliminadas"}.`);
    },
    [cambiaron, decir, guardarYa, manual, tabla],
  );

  const irAHoja = async (id: string) => {
    await guardarYa();
    if (manual && cambiosPendientes(filasRef.current, servidor.current)) decir("Las filas con error o bloqueadas no se guardaron y se descartan al cambiar de hoja.");
    p.pestanas?.onElegir(id);
  };

  if (p.existe === false) {
    return (
      <div className="es-editor" ref={cuerpo}>
        <div className="es-eh">
          <button type="button" className="es-back" onClick={p.onCerrar}>
            <Icon name="arrow-left" size={16} />
            Archivos
          </button>
        </div>
        <div className="es-gempty">Este archivo ya no existe.</div>
      </div>
    );
  }

  const sucia = hayPendiente;
  const columnasMenu = tabla.getAllLeafColumns();
  const hayBusqueda = Boolean(busqueda.trim());
  const textoGuardado = guardado === "guardando" ? "Guardando…" : guardado === "error" ? "No se guardó" : manual && sucia ? "Sin guardar" : "Guardado";
  const quitables = [...seleccionadas];

  return (
    <div className="es-editor" ref={cuerpo} role="dialog" aria-label={`Editor de ${p.titulo}`}>
      <div className="es-eh" data-entra>
        <button type="button" className="es-back" id="es-volver" onClick={() => void cerrar()}>
          <Icon name="arrow-left" size={16} />
          Archivos
        </button>
        <div className="es-ename">
          <IconoArchivo tipo={p.tipo} className="es-kico" />
          <input
            id="es-nombre"
            value={nombre}
            aria-label="Nombre del archivo"
            disabled={!p.nombre?.editable}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => {
              const limpio = nombre.trim();
              if (p.nombre && limpio && limpio !== p.nombre.valor) p.nombre.renombrar(limpio);
              else setNombre(p.nombre?.valor ?? p.titulo);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
        {p.chip({ sucia, errores: totalErrores })}
        <span className="es-st" role="status">
          <Icon name={guardado === "error" ? "alert" : "check"} size={13} />
          <span>{textoGuardado}</span>
        </span>
        <span className="es-grow" />
        {editable ? null : (
          <span className="es-ro">
            <Icon name="eye" size={12} />
            {p.insigniaSoloLectura ?? "Solo lectura"}
          </span>
        )}
        {p.recorrido ? (
          <button type="button" className="es-btn" onClick={p.recorrido}>
            <Icon name="play" size={16} />
            Recorrido
          </button>
        ) : null}
        {p.acciones?.({ guardar: () => guardarYa(), errores: totalErrores, irAlError: irAlSiguienteError })}
      </div>

      {p.barra}

      <div className="es-etool" data-entra data-tour="es-herramientas">
        <label className="es-find">
          <Icon name="search" size={14} />
          <input
            placeholder="Buscar en el archivo"
            aria-label="Buscar en el archivo"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              tabla.setGlobalFilter(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="es-btn es-btn--sm"
          data-columnas
          aria-haspopup="true"
          aria-expanded={Boolean(menu)}
          onClick={(e) => {
            const c = cajaDe(e.currentTarget)!;
            setMenu(menu ? null : { x: Math.min(c.left, window.innerWidth - 230), y: c.top + c.height + 4 });
          }}
        >
          <Icon name="columns-view" size={16} />
          Columnas
        </button>
        <button type="button" className="es-btn es-btn--sm" aria-pressed={fijar} onClick={() => setFijar(!fijar)} disabled={vista === "lista"}>
          <Icon name="pin" size={16} />
          Fijar la primera
        </button>
        <span className="es-sep" />
        <div className="es-seg" role="group" aria-label="Vista del archivo">
          <button type="button" aria-pressed={vista === "tabla"} aria-label="Tabla" onClick={() => setVista("tabla")}>
            <Icon name="table" size={16} />
          </button>
          <button type="button" aria-pressed={vista === "lista"} aria-label="Lista" onClick={() => setVista("lista")}>
            <Icon name="list" size={16} />
          </button>
        </div>
        <span className="es-sep" />
        {puedeAgregar ? (
          <button type="button" className="es-btn es-btn--sm" onClick={agregar}>
            <Icon name="plus" size={16} />
            {vista === "lista" ? "Agregar elemento" : "Agregar fila"}
          </button>
        ) : null}
        {editable && quitables.length ? (
          confirmando ? (
            <>
              <button type="button" className="es-btn es-btn--sm" onClick={() => quitar(quitables)}>
                Sí, quitar {quitables.length === 1 ? "1 fila" : `${quitables.length} filas`}
              </button>
              <button type="button" className="es-btn es-btn--sm es-btn--ghost" onClick={() => setConfirmando(false)}>
                No
              </button>
            </>
          ) : (
            <button type="button" className="es-btn es-btn--sm" onClick={() => (p.confirmarQuitar ? setConfirmando(true) : quitar(quitables))}>
              <Icon name="trash" size={16} />
              Eliminar {quitables.length} {quitables.length === 1 ? "fila" : "filas"}
            </button>
          )
        ) : null}
        <span className="es-grow" />
        {p.panelIzq ? (
          <button type="button" className="es-btn es-btn--sm" data-tour={p.panelIzq.tour} aria-pressed={panelIzq} onClick={() => setPanelIzq(!panelIzq)}>
            {p.panelIzq.etiqueta}
          </button>
        ) : null}
        {p.panelDer ? (
          <button type="button" className="es-btn es-btn--sm" data-tour={p.panelDer.tour} aria-pressed={panelDer} onClick={() => setPanelDer(!panelDer)}>
            {p.panelDer.icono ? <Icon name={p.panelDer.icono} size={16} /> : null}
            {p.panelDer.etiqueta}
          </button>
        ) : null}
      </div>

      <div className="es-ework">
        <aside ref={campos} className="es-panel es-panel--l" data-open={panelIzq} aria-label={p.panelIzq?.etiqueta} aria-hidden={!panelIzq}>
          <div className="es-panel__in">{p.panelIzq?.contenido({ filas, guardarAntes: () => guardarYa() })}</div>
        </aside>
        <Hoja
          ref={hoja}
          columnas={columnasVisibles}
          filas={filasVisibles}
          errores={mensajes}
          reglas={reglas}
          editable={editable}
          fijarPrimera={fijar}
          ordenes={ordenes}
          seleccion={seleccionadas}
          todasSeleccionadas={filasVisibles.length > 0 && filasVisibles.every((f) => seleccionadas.has(f.k))}
          hayBusqueda={hayBusqueda}
          vista={vista}
          onOrdenar={(clave, varias) => tabla.getColumn(clave)?.toggleSorting(undefined, varias)}
          onCambiar={alCambiar}
          onPegar={alPegar}
          onSeleccionar={(k, marcado) => tabla.getRow(k).toggleSelected(marcado)}
          onSeleccionarTodas={(marcado) => {
            const siguiente: Record<string, true> = {};
            if (marcado) for (const f of filasVisibles) if (!p.bloqueoFila?.(f)) siguiente[f.k] = true;
            tabla.setRowSelection(() => siguiente);
          }}
          onQuitar={(k) => quitar([k])}
          onAgregar={agregar}
          bloqueoFila={p.bloqueoFila}
          columnaGrupo={p.columnaGrupo}
          columnasInfo={p.columnasInfo}
          puedeAgregar={puedeAgregar}
          colorCelda={p.colorCelda}
          columnaEstado={
            manual
              ? {
                  etiqueta: "Estado",
                  celda: (f) =>
                    filasConError.has(f.k) ? (
                      <span className="es-est" data-e="err">
                        <Icon name="alert" size={12} />
                        Con error
                      </span>
                    ) : clavesSucias.has(f.k) ? (
                      <span className="es-est" data-e="borrador">
                        <Icon name="pen" size={12} />
                        Sin guardar
                      </span>
                    ) : (
                      <span className="es-est" data-e="listo">
                        <Icon name="check" size={12} />
                        Válida
                      </span>
                    ),
                }
              : undefined
          }
        />
        <aside ref={responde} className="es-panel es-panel--r" data-open={panelDer} aria-label={p.panelDer?.etiqueta} aria-hidden={!panelDer}>
          <div className="es-panel__in">{p.panelDer?.contenido({ filas, guardarAntes: () => guardarYa() })}</div>
        </aside>
      </div>

      {p.pestanas ? (
        <nav className="es-pestanas" aria-label="Hojas del archivo" data-tour="es-pestanas">
          {p.pestanas.items.map((h) => (
            <button key={h.id} type="button" aria-current={h.id === p.pestanas!.activa ? "true" : undefined} onClick={() => h.id !== p.pestanas!.activa && void irAHoja(h.id)}>
              {h.nombre}
              {h.nota ? <small>{h.nota}</small> : null}
            </button>
          ))}
          {p.pestanas.extra}
        </nav>
      ) : null}

      <div className="es-estat" data-entra>
        <span>
          <b className="es-num">{filasVisibles.length}</b> de <b className="es-num">{filas.length}</b> filas
        </span>
        <span>
          <b className="es-num">{columnas.length}</b> campos
        </span>
        {totalErrores > 0 ? (
          <>
            <span className="es-bad">
              {totalErrores} {totalErrores === 1 ? "celda con error" : "celdas con error"}
            </span>
            <button type="button" className="es-btn es-btn--sm" onClick={irAlSiguienteError}>
              Siguiente error (F8)
            </button>
          </>
        ) : (
          <span className="es-note es-note--ok">Sin errores</span>
        )}
        {manual && sucias.length > 0 ? (
          <span className="es-note">
            <b className="es-num">{sucias.length}</b> sin guardar
          </span>
        ) : null}
        <span className="es-hint">{editable ? (manual ? "Enter baja · Ctrl+V pega desde Excel · Ctrl+S guarda las filas válidas · Esc cierra" : "Enter baja · Ctrl+V pega desde Excel · Ctrl+S guarda · Esc cierra") : "Esc cierra"}</span>
        {manual && editable ? (
          <button type="button" className="es-btn es-btn--pri es-btn--sm" disabled={guardado === "guardando" || sucias.length === 0} onClick={() => void guardarYa().then((ok) => ok && decir("Guardado."))}>
            {guardado === "guardando" ? "Guardando…" : sucias.length ? `Guardar cambios (${sucias.length})` : "Todo guardado"}
          </button>
        ) : null}
      </div>

      {menu ? (
        <div ref={menuRef} className="es-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <div className="es-h">Columnas visibles</div>
          {columnasMenu.map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={c.getIsVisible()} onChange={(e) => c.toggleVisibility(e.target.checked)} />
              {columnas.find((x) => x.clave === c.id)?.etiqueta ?? c.id}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
