/* =============================================================================
   UDrive · el editor de tablas (/admin/udrive/tabla/:id).

   Se apoya en el editor compartido de components/espacio, que ya trae
   @tanstack/react-table (orden, búsqueda, primera columna fija, selección) y
   @tanstack/react-virtual (miles de filas), pegar desde Excel con Ctrl+V,
   validación por celda en rojo, F8 al siguiente error y guardado automático
   con su estado «Guardado/Guardando…». Lo de UDrive es lo que va encima:
   columnas con tipo y reglas, mapa de calor por columna, importar y exportar,
   y el panel «Cómo se ve en el documento», que solo guarda esos textos.

   Todo se guarda en `contenido` (jsonb) de la tabla; un cambio de estructura
   guarda antes las filas pendientes para no perder lo escrito.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Editor } from "../../../components/espacio/Editor";
import type { PanelEditor } from "../../../components/espacio/Editor";
import { Aviso, useAviso } from "../../../components/espacio/piezas";
import type { EspColumna, FilaGuardada, Reglas } from "../../../components/espacio/tipos";
import type { Guardado } from "../../../components/espacio/logica";
import { Icon } from "../../../components/ui/Icon";
import { useGuardarContenido, useContenido, useCrearItem, useDuenos, useRenombrar } from "../datos";
import { colorDeTramo } from "../lib/calor";
import { configInicial } from "../lib/graficas";
import { puedeEditar } from "../lib/permisos";
import { aplicarGuardado, ajustarFilasAColumnas, normalizarContenido, releerColumna } from "../lib/tabla";
import { erroresDeTabla, errorDeCelda, leerValor, numeroDe } from "../lib/valores";
import type { ColumnaUd, ContenidoGrafica, ContenidoTabla, FilaUd, Presentacion } from "../tipos";
import { PegarExcel, ImportarTabla } from "./DialogosTabla";
import type { Aplicar } from "./DialogosTabla";
import { exportarCsv, exportarExcel } from "./navegador";
import { PanelColumnas } from "./PanelColumnas";
import { Estado } from "./piezas";
import "../../../components/espacio/espacio.css";
import "./udrive.css";

const aEsp = (c: ColumnaUd): EspColumna => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones });

export function EditorTabla({ id }: { id: string }) {
  const navigate = useNavigate();
  const leido = useContenido(id);
  const duenos = useDuenos([id]);
  const { aviso, decir } = useAviso();
  const guardar = useGuardarContenido();
  const renombrar = useRenombrar();
  const crear = useCrearItem();

  const [contenido, setContenido] = useState<ContenidoTabla | null>(null);
  const ref = useRef<ContenidoTabla | null>(null);
  const [estado, setEstado] = useState<"borrador" | "listo">("borrador");
  const [nombre, setNombre] = useState("");
  const [dialogo, setDialogo] = useState<null | "pegar" | { importar: File }>(null);
  const inputImportar = useRef<HTMLInputElement>(null);

  // La primera vez que llega el archivo se arma el contenido local; después manda lo que esta pantalla guarda.
  useEffect(() => {
    if (!leido.data || ref.current) return;
    const c = normalizarContenido(leido.data.contenido, () => crypto.randomUUID());
    ref.current = c;
    setContenido(c);
    setEstado(leido.data.estado);
    setNombre(leido.data.nombre);
  }, [leido.data]);

  const rol = duenos.data?.get(id)?.mi_rol;
  const editable = puedeEditar(rol);

  const persistir = useCallback(
    async (siguiente: ContenidoTabla, nuevoEstado?: "borrador" | "listo") => {
      ref.current = siguiente;
      setContenido(siguiente);
      await guardar.mutateAsync({ id, contenido: siguiente, estado: nuevoEstado });
      if (nuevoEstado) setEstado(nuevoEstado);
    },
    [guardar, id],
  );

  const columnasUd = contenido?.columnas;
  const porClave = useMemo(() => new Map((columnasUd ?? []).map((c) => [c.clave, c] as const)), [columnasUd]);
  const espColumnas = useMemo(() => (columnasUd ?? []).map(aEsp), [columnasUd]);
  const reglas = useMemo<Reglas>(
    () => ({
      leer: (col, escrito) => leerValor(porClave.get(col.clave) ?? { ...col, tipo: col.tipo }, escrito).valor,
      error: (_cs, datos, col) => {
        const c = porClave.get(col.clave);
        return c ? errorDeCelda(c, datos[col.clave]) : "";
      },
    }),
    [porClave],
  );
  const guardadas = useMemo<FilaGuardada[]>(() => (contenido?.filas ?? []).map((f) => ({ id: f.id, datos: f.datos })), [contenido?.filas]);

  const guardarFilas = useCallback(
    async (g: Guardado) => {
      const base = ref.current;
      if (!base) return;
      await persistir({ ...base, filas: aplicarGuardado(base.filas, g, () => crypto.randomUUID()) });
    },
    [persistir],
  );
  const refrescar = useCallback(async (): Promise<FilaGuardada[]> => (ref.current?.filas ?? []).map((f) => ({ id: f.id, datos: f.datos })), []);

  const cambiarColumnas = useCallback(
    async (fn: (c: ContenidoTabla) => ContenidoTabla) => {
      const base = ref.current;
      if (!base) return;
      try {
        await persistir(fn(base));
      } catch (e) {
        decir(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
      }
    },
    [decir, persistir],
  );

  const cambios = useMemo(
    () => ({
      cambiar: (clave: string, parte: Partial<ColumnaUd>) =>
        cambiarColumnas((c) => {
          const antes = c.columnas.find((x) => x.clave === clave);
          if (!antes) return c;
          const despues = { ...antes, ...parte };
          return { ...c, columnas: c.columnas.map((x) => (x.clave === clave ? despues : x)), filas: releerColumna(c.filas, antes, despues), mapaCalor: c.mapaCalor || Boolean(parte.calor) };
        }),
      agregar: (columna: ColumnaUd) => cambiarColumnas((c) => ({ ...c, columnas: [...c.columnas, columna], filas: ajustarFilasAColumnas(c.filas, [...c.columnas, columna]) })),
      quitar: (clave: string) => cambiarColumnas((c) => { const cols = c.columnas.filter((x) => x.clave !== clave); return { ...c, columnas: cols, filas: ajustarFilasAColumnas(c.filas, cols) }; }),
      mover: (clave: string, delta: -1 | 1) =>
        cambiarColumnas((c) => {
          const i = c.columnas.findIndex((x) => x.clave === clave);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= c.columnas.length) return c;
          const cols = [...c.columnas];
          [cols[i], cols[j]] = [cols[j], cols[i]];
          return { ...c, columnas: cols };
        }),
    }),
    [cambiarColumnas],
  );

  const aplicarEntrada = async (a: Aplicar, guardarAntes?: () => Promise<boolean>) => {
    if (guardarAntes && !(await guardarAntes())) return;
    await cambiarColumnas((c) => {
      if (a.modo === "agregar") return { ...c, filas: [...c.filas, ...a.filas] };
      const columnas = a.columnas ?? c.columnas;
      return { ...c, columnas, filas: a.filas };
    });
    setDialogo(null);
    decir(a.modo === "agregar" ? `${a.filas.length} filas agregadas.` : "Tabla reemplazada.");
  };

  const colorCelda = useCallback(
    (col: EspColumna, valor: unknown) => {
      if (!ref.current?.mapaCalor) return undefined;
      const c = porClave.get(col.clave);
      return c?.calor ? (colorDeTramo(numeroDe(valor as string | number | null), c.calor) ?? undefined) : undefined;
    },
    [porClave, contenido?.mapaCalor], // eslint-disable-line react-hooks/exhaustive-deps -- mapaCalor cambia el color
  );

  const alternarEstado = async (guardarYa: () => Promise<boolean>) => {
    if (!(await guardarYa()) || !ref.current) return;
    const siguiente = estado === "listo" ? "borrador" : "listo";
    try {
      await persistir(ref.current, siguiente);
      decir(siguiente === "listo" ? "Marcada como lista." : "Vuelve a borrador.");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  };

  if (leido.isPending || duenos.isPending) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Abriendo la tabla…</p></div>;
  if (leido.error || !leido.data) {
    return (
      <div className="es ud">
        <div className="es-empty" style={{ margin: 24 }}>
          <b>No se pudo abrir la tabla</b>
          <span>{leido.error?.message ?? "No existe o no tiene permiso para verla."}</span>
          <button type="button" className="es-btn" onClick={() => navigate("/admin/udrive")}>Volver a UDrive</button>
        </div>
      </div>
    );
  }
  if (leido.data.tipo !== "tabla" || !contenido) return <div className="es ud"><p className="es-note" style={{ padding: 24 }}>Este archivo no es una tabla.</p></div>;

  const volver = () => navigate(leido.data?.carpeta_id ? `/admin/udrive?c=${leido.data.carpeta_id}` : "/admin/udrive");
  const tabla = { columnas: contenido.columnas, filas: contenido.filas };

  const guardarPresentacion = (p: Partial<Presentacion>) => {
    const base = ref.current;
    if (base) void cambiarColumnas((c) => ({ ...c, presentacion: { ...base.presentacion, ...p } }));
  };

  const panelIzq: PanelEditor = {
    etiqueta: "Columnas",
    abierto: true,
    contenido: ({ guardarAntes }) => <PanelColumnas columnas={contenido.columnas} filas={contenido.filas} editable={editable} cambios={cambios} guardarAntes={guardarAntes} />,
  };
  const panelDer: PanelEditor = {
    etiqueta: "Cómo se ve en el documento",
    contenido: () => <PanelPresentacion p={contenido.presentacion} editable={editable} onGuardar={guardarPresentacion} />,
  };

  return (
    <div className="es ud">
      <Editor
        clave={id}
        titulo={nombre || leido.data.nombre}
        tipo="tabla"
        origen={null}
        onCerrar={volver}
        nombre={{ valor: nombre || leido.data.nombre, editable, renombrar: (n) => renombrar.mutate({ tipo: "archivo", id, nombre: n }, { onSuccess: () => { setNombre(n); decir("Nombre cambiado."); }, onError: (e) => decir(e.message) }) }}
        chip={() => <Estado estado={estado} />}
        acciones={({ guardar: guardarYa, errores }) => (
          <>
            <button type="button" className="es-btn" onClick={() => void exportarExcel(tabla, nombre || leido.data!.nombre).catch((e: Error) => decir(e.message))}>
              <Icon name="download" size={16} />Excel
            </button>
            <button type="button" className="es-btn" onClick={() => exportarCsv(tabla, nombre || leido.data!.nombre)}>CSV</button>
            <button
              type="button"
              className="es-btn"
              onClick={() => {
                const cfg = configInicial("linea", tabla);
                const contenidoG: ContenidoGrafica = { version: 1, tabla_id: id, config: cfg };
                void guardarYa().then((ok) => ok && crear.mutate({ tipo: "grafica", nombre: `Gráfica de ${nombre || leido.data!.nombre}`.slice(0, 160), carpeta: leido.data!.carpeta_id, contenido: contenidoG }, { onSuccess: (nuevo) => navigate(`/admin/udrive/grafica/${nuevo}`), onError: (e) => decir(e.message) }));
              }}
            >
              <Icon name="chart" size={16} />Crear una gráfica
            </button>
            {editable ? (
              <button
                type="button"
                className="es-btn es-btn--pri"
                disabled={estado === "borrador" && errores > 0}
                title={estado === "borrador" && errores > 0 ? "Corrija los valores en rojo para marcarla como lista." : undefined}
                onClick={() => void alternarEstado(guardarYa)}
              >
                {estado === "listo" ? "Volver a borrador" : "Marcar como lista"}
              </button>
            ) : null}
          </>
        )}
        columnas={espColumnas}
        reglas={reglas}
        guardadas={guardadas}
        refrescar={refrescar}
        guardar={guardarFilas}
        modo="auto"
        editable={editable}
        insigniaSoloLectura={rol === "lector" ? "Solo puede ver esta tabla" : "Solo lectura"}
        confirmarQuitar
        colorCelda={colorCelda}
        barra={
          <div className="ud-barra-tabla" role="toolbar" aria-label="Datos de la tabla">
            {editable ? (
              <>
                <button type="button" className="es-btn es-btn--sm" onClick={() => setDialogo("pegar")}><Icon name="clipboard" size={16} />Pegar desde Excel</button>
                <button type="button" className="es-btn es-btn--sm" onClick={() => inputImportar.current?.click()}><Icon name="upload" size={16} />Importar Excel o CSV</button>
                <input ref={inputImportar} type="file" accept=".xlsx,.csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setDialogo({ importar: f }); e.target.value = ""; }} />
                <span className="es-sep" />
              </>
            ) : null}
            <div className="es-seg" role="group" aria-label="Formato condicional">
              <button type="button" aria-pressed={contenido.mapaCalor} disabled={!editable} onClick={() => void cambiarColumnas((c) => ({ ...c, mapaCalor: !c.mapaCalor }))}>Mapa de calor</button>
            </div>
            <span className="es-note">{contenido.columnas.some((c) => c.calor) ? "Cada tramo de color se define por columna, en el panel «Columnas»." : "Defina los tramos de color en el panel «Columnas», en cada columna numérica."}</span>
          </div>
        }
        panelIzq={panelIzq}
        panelDer={panelDer}
        decir={decir}
        enfocarAlAbrir={false}
      />
      {dialogo === "pegar" ? <PegarExcel columnas={contenido.columnas} onCerrar={() => setDialogo(null)} onAplicar={(a) => void aplicarEntrada(a)} /> : null}
      {dialogo && typeof dialogo === "object" ? <ImportarTabla archivo={dialogo.importar} columnas={contenido.columnas} onCerrar={() => setDialogo(null)} onAplicar={(a) => void aplicarEntrada(a)} /> : null}
      <Aviso texto={aviso} />
      <ErroresPie filas={contenido.filas} columnas={contenido.columnas} />
    </div>
  );
}

/** Para el lector de pantalla: el resumen de errores cambia en una región viva. */
function ErroresPie({ filas, columnas }: { filas: FilaUd[]; columnas: ColumnaUd[] }) {
  const n = useMemo(() => erroresDeTabla({ filas, columnas }).length, [filas, columnas]);
  return <span className="ud-sr" role="status">{n ? `${n} ${n === 1 ? "celda con error" : "celdas con error"}` : "Sin errores"}</span>;
}

function PanelPresentacion({ p, editable, onGuardar }: { p: Presentacion; editable: boolean; onGuardar: (p: Partial<Presentacion>) => void }) {
  const [titulo, setTitulo] = useState(p.titulo);
  const [nota, setNota] = useState(p.nota);
  return (
    <>
      <div>
        <h3>Cómo se ve en el documento</h3>
        <p className="es-sub">Estos textos acompañan la tabla cuando se use en un informe. Solo se guardan ellos.</p>
      </div>
      <label className="es-fl">
        Título de la tabla
        <input type="text" className="es-inp" value={titulo} disabled={!editable} maxLength={300} onChange={(e) => setTitulo(e.target.value)} onBlur={() => titulo !== p.titulo && onGuardar({ titulo })} />
      </label>
      <label className="es-fl">
        Nota o fuente
        <input type="text" className="es-inp" value={nota} disabled={!editable} maxLength={500} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== p.nota && onGuardar({ nota })} />
      </label>
      <label className="es-ck">
        <input type="checkbox" checked={p.enIndice} disabled={!editable} onChange={(e) => onGuardar({ enIndice: e.target.checked })} /> Aparece en el índice de tablas
      </label>
      <label className="es-ck">
        <input type="checkbox" checked={p.repetirEncabezado} disabled={!editable} onChange={(e) => onGuardar({ repetirEncabezado: e.target.checked })} /> Repetir el encabezado en cada página
      </label>
    </>
  );
}
