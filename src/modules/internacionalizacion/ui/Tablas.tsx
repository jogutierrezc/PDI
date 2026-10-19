/* =============================================================================
   Internacionalización · Tablas: el explorador de libros y su editor.

   Cada LIBRO (int_libros) es un archivo del explorador. A la izquierda, el árbol
   de CARPETAS con subcarpetas (int_carpetas, 0166), «Multicampus» y «Sin
   carpeta». Un clic en una tabla muestra sus detalles (avance por campus, hojas);
   doble clic o Enter la abre a pantalla completa, creciendo desde el mosaico, con
   las HOJAS como pestañas al pie, como en Excel. Carpeta, libro, hoja y campus
   viajan en la dirección (?carpeta=&libro=&hoja=&campus=): con `hoja` el editor
   está abierto.

   Multicampus (0166): un archivo al que aportan todos los campus. Todos ven todas
   las filas; Bucaramanga edita las de cualquier campus, los demás solo las suyas.
   La rejilla muestra de cada fila el campus, quién la registró, cuándo y de dónde
   vino (a mano o el nombre del Excel).

   El flujo de envío no cambia (borrador → enviado → validado → aprobado, devolver
   con nota, reabrir con motivo) y sigue siendo por campus. Las reglas siguen en
   lib/permisos.ts, espejo de la base.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { useTour } from "../../../components/tour/TourProvider";
import { Editor } from "../../../components/espacio/Editor";
import { Archivos, Carpetas, Comandos, Migas, PanelDetalles, Zona } from "../../../components/espacio/Explorador";
import type { VistaArchivos } from "../../../components/espacio/Explorador";
import { haceCuanto } from "../../../components/espacio/logica";
import { Aviso, Ficha, useAviso as useToast } from "../../../components/espacio/piezas";
import type { Caja, FilaGuardada, FilaLocal } from "../../../components/espacio/tipos";
import { FaltaMigracion, useAportantes, useBorrarFilas, useBorrarLibro, useCarpetas, useConceptos, useEnvios, useEstructura, useFilas, useGuardarFilas, useMoverLibro, useNombres, useVentanas } from "../datos";
import { aplanar, armarArbol, librosDe, rutaDe } from "../lib/carpetas";
import { entroPor } from "../lib/exportar-contactos";
import type { Salida } from "../lib/exportar-contactos";
import { controlaMulticampus, ETIQUETA_ROL, puedeCrear, puedeCrearLibro, puedeEditarLibro } from "../lib/permisos";
import type { IntCarpetaRow, IntLibroRow, LibroCompleto } from "../tipos";
import { avanceDeLibro, columnaEsp, reglasInt } from "./adaptador";
import { ArbolCarpetas } from "./ArbolCarpetas";
import type { SeleccionCarpeta } from "./ArbolCarpetas";
import { BarraEnvio } from "./BarraEnvio";
import { CargaExcel } from "./CargaExcel";
import type { PrevioExcel } from "./CargaExcel";
import { AvisoMigracion, Cargando, Confirmar, ErrorCaja, EstadoPill, fmt, nombreCampus, useAviso } from "./comunes";
import type { Ctx } from "./comunes";
import { ExportarContactos } from "./ExportarContactos";
import { escrituraPorCampus } from "./logica";
import { MenuNuevo } from "./MenuNuevo";
import type { OpcionNuevo } from "./MenuNuevo";
import { NuevaTabla } from "./NuevaTabla";
import { NuevoPanel } from "./NuevoPanel";
import "../../../components/espacio/espacio.css";
import "./carpetas.css";

const CLASE: Record<string, string> = { movilidad: "Movilidad", convenio: "Convenio", general: "General" };
const CAPTURA: Record<IntLibroRow["captura"], string> = { campus: "Por campus", oficina: "Solo la oficina", multicampus: "Multicampus" };
const FILTROS = [
  { id: "todas", etiqueta: "Todas" },
  { id: "pendientes", etiqueta: "Con pendientes" },
  { id: "aprobadas", etiqueta: "Aprobadas" },
];
const ESPECIALES = ["todas", "multicampus", "sin"];

/** «hoy, 9:42» · «ayer, 16:05» · «15 oct»: cuándo se registró una fila. */
function cuando(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(x);
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", hour12: false }).format(d);
  const hoy = new Date();
  if (dia(d) === dia(hoy)) return `hoy, ${hora}`;
  if (dia(d) === dia(new Date(hoy.getTime() - 86_400_000))) return `ayer, ${hora}`;
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }).format(d).replace(".", "");
}

export function Tablas({ ctx }: { ctx: Ctx }) {
  const [params, setParams] = useSearchParams();
  const estructura = useEstructura();
  const conceptos = useConceptos();
  const carpetasQ = useCarpetas();
  const ventanas = useVentanas(ctx.periodo?.id);
  const envios = useEnvios(ctx.periodo?.id);
  const tour = useTour();
  const toast = useToast();
  const aviso = useAviso();
  const [panel, setPanel] = useState<null | "tabla" | "hoja" | "excel">(null);
  const [capturaNueva, setCapturaNueva] = useState<IntLibroRow["captura"]>("campus");
  const [previoExcel, setPrevioExcel] = useState<PrevioExcel | null>(null);
  const [nuevaCarpeta, setNuevaCarpeta] = useState(0);
  const [exportar, setExportar] = useState<Salida | null>(null);
  const [filtro, setFiltro] = useState("todas");
  const [vista, setVista] = useState<VistaArchivos>("mosaicos");
  const [detalles, setDetalles] = useState(true);
  const [origen, setOrigen] = useState<Caja | null>(null);

  const carpetas = useMemo(() => carpetasQ.data ?? [], [carpetasQ.data]);
  const libros = useMemo(() => estructura.data ?? [], [estructura.data]);
  const pedida = params.get("carpeta") ?? "todas";
  const seleccion: SeleccionCarpeta = ESPECIALES.includes(pedida) || carpetas.some((c) => c.id === pedida) ? pedida : "todas";
  const libro = libros.find((l) => l.id === params.get("libro")) ?? null;
  const hoja = libro?.hojas.find((h) => h.id === params.get("hoja")) ?? null;
  // En una tabla Multicampus se ven todos los campus; en las demás, los de quien mira.
  const campusDelLibro = libro?.captura === "multicampus" ? ctx.campus : ctx.visibles;
  const unico = campusDelLibro.length === 1 ? campusDelLibro[0].id : "";
  const campusSel = campusDelLibro.some((c) => c.id === params.get("campus")) ? params.get("campus")! : unico;
  const campusIds = useMemo(() => ctx.visibles.map((c) => c.id), [ctx.visibles]);
  const enviosLista = envios.data ?? [];
  const crea = puedeCrear(ctx.yo);
  const multi = controlaMulticampus(ctx.yo);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const abrirNuevo = (captura: IntLibroRow["captura"]) => {
    setCapturaNueva(captura);
    setPanel("tabla");
  };

  // El buscador Ctrl+K y el riel piden acciones de esta sección por la dirección (?accion=).
  const accion = params.get("accion");
  useEffect(() => {
    if (!accion) return;
    if (accion === "vista") setVista((v) => (v === "mosaicos" ? "lista" : "mosaicos"));
    else if (crea && accion === "nueva") abrirNuevo("campus");
    else if (crea && accion === "excel") {
      setPrevioExcel(null);
      setPanel("excel");
    }
    const p = new URLSearchParams(params);
    p.delete("accion");
    setParams(p, { replace: true });
  }, [accion]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reacciona a la petición

  const delLugar = useMemo(
    () =>
      seleccion === "todas" ? libros : seleccion === "multicampus" ? libros.filter((l) => l.captura === "multicampus") : seleccion === "sin" ? librosDe(libros, null) : librosDe(libros, seleccion),
    [libros, seleccion],
  );
  const visibles = useMemo(() => {
    const avances = new Map(delLugar.map((l) => [l.id, avanceDeLibro(l, enviosLista, campusIds)] as const));
    return delLugar
      .filter((l) => {
        const a = avances.get(l.id)!;
        return filtro === "aprobadas" ? a.total > 0 && a.aprobadas === a.total : filtro === "pendientes" ? a.aprobadas < a.total : true;
      })
      .map((l) => ({ libro: l, avance: avances.get(l.id)! }));
  }, [delLugar, enviosLista, campusIds, filtro]);

  const error = estructura.error ?? conceptos.error ?? carpetasQ.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!estructura.data || !conceptos.data || !carpetasQ.data) return <Cargando texto="Abriendo las tablas…" />;

  const abrir = (id: string, caja: Caja | null) => {
    const l = libros.find((x) => x.id === id);
    setOrigen(caja);
    ir({ libro: id, hoja: l?.hojas[0]?.id ?? null });
  };

  const items = visibles.map(({ libro: l, avance }) => {
    const completa = avance.total > 0 && avance.aprobadas === avance.total;
    const estado = <Ficha clave={completa ? "listo" : "borrador"} texto={avance.total ? `${avance.aprobadas} de ${avance.total} aprobadas` : "Sin envíos"} icono={completa ? "check" : "pen"} />;
    return {
      id: l.id,
      nombre: l.nombre,
      tipo: "tabla" as const,
      columnas: Math.max(0, ...l.hojas.map((h) => h.columnas.length)),
      subtitulo: `${l.hojas.length === 1 ? "1 hoja" : `${l.hojas.length} hojas`} · ${CAPTURA[l.captura].toLowerCase()}`,
      estado,
      pie: avance.total ? (
        <span className="it-libros__medidor" aria-label={`${avance.aprobadas} de ${avance.total} aprobadas`}>
          <i style={{ width: `${(avance.aprobadas / avance.total) * 100}%` }} />
        </span>
      ) : undefined,
      celdas: [l.carpeta_id ? rutaDe(carpetas, l.carpeta_id).map((c) => c.nombre).join(" / ") : "Sin carpeta", estado, l.hojas.length, CAPTURA[l.captura]],
    };
  });

  const subcarpetas = carpetas.filter((c) => c.parent_id === (seleccion === "todas" || seleccion === "multicampus" || seleccion === "sin" ? "—" : seleccion));
  const abierta = hoja && ctx.periodo ? { libro: libro!, hoja } : null;
  const ruta = rutaDe(carpetas, ESPECIALES.includes(seleccion) ? null : seleccion);
  const lugar = seleccion === "multicampus" ? "Multicampus" : seleccion === "sin" ? "Sin carpeta" : null;

  const opciones: OpcionNuevo[] = [
    ...(crea ? [{ id: "carpeta", icono: "folder" as const, titulo: "Carpeta", ayuda: "Para ordenar varias tablas" }] : []),
    ...(puedeCrearLibro(ctx.yo, "campus") ? [{ id: "tabla", icono: "table" as const, titulo: "Tabla", ayuda: "Cada campus captura sus filas, o solo la oficina" }] : []),
    ...(multi ? [{ id: "multicampus", icono: "users" as const, titulo: "Multicampus", ayuda: "Un archivo al que aportan todos los campus", destacada: true }] : []),
    ...(crea ? [{ id: "excel", icono: "upload" as const, titulo: "Subir un Excel", ayuda: "Crea la tabla a partir del archivo", separar: true }] : []),
  ];
  const elegirNuevo = (id: string) => {
    if (id === "carpeta") setNuevaCarpeta((n) => n + 1);
    else if (id === "tabla") abrirNuevo("campus");
    else if (id === "multicampus") abrirNuevo("multicampus");
    else {
      setPrevioExcel(null);
      setPanel("excel");
    }
  };

  return (
    <div className="es it-esp it-esp--arbol" data-tour="int-tablas">
      <ArbolCarpetas
        carpetas={carpetas}
        libros={libros}
        seleccion={seleccion}
        onElegir={(id) => ir({ carpeta: id === "todas" ? null : id, libro: null, hoja: null })}
        puedeCrear={crea}
        puedeCambiar={(c) => ctx.director || ctx.planeacion || (c.created_by === ctx.userId && crea)}
        aviso={aviso}
        nuevaPedida={nuevaCarpeta}
      />
      <div className="it-esp__main">
        <Migas
          partes={[
            { texto: "Tablas", onClick: () => ir({ carpeta: null, libro: null, hoja: null }) },
            ...ruta.map((c) => ({ texto: c.nombre, onClick: () => ir({ carpeta: c.id, libro: null, hoja: null }) })),
            ...(lugar ? [{ texto: lugar }] : []),
          ]}
        />
        <Comandos
          izquierda={<MenuNuevo opciones={opciones} onElegir={elegirNuevo} />}
          filtros={{ items: FILTROS, valor: filtro, onCambiar: setFiltro }}
          vista={vista}
          onVista={setVista}
          detalles={detalles}
          onDetalles={setDetalles}
          onRecorrido={() => tour.start("internacionalizacion-tablas")}
        />
        <Zona clave={`${seleccion}|${filtro}|${vista}`}>
          {subcarpetas.length ? (
            <Carpetas
              carpetas={subcarpetas.map((c) => {
                const n = librosDe(libros, c.id).length;
                const s = carpetas.filter((x) => x.parent_id === c.id).length;
                return { id: c.id, nombre: c.nombre, subtitulo: [n ? `${n} ${n === 1 ? "tabla" : "tablas"}` : null, s ? `${s} ${s === 1 ? "subcarpeta" : "subcarpetas"}` : null].filter(Boolean).join(" · ") || "Vacía" };
              })}
              onAbrir={(id) => ir({ carpeta: id, libro: null, hoja: null })}
            />
          ) : null}
          {items.length ? (
            <Archivos items={items} vista={vista} seleccion={libro?.id ?? null} onSeleccionar={(id) => ir({ libro: id, hoja: null })} onAbrir={abrir} encabezadosLista={["Carpeta", "Avance", "Hojas", "Captura"]} />
          ) : !subcarpetas.length ? (
            <div className="es-empty">
              <b>{libros.length ? "No hay tablas aquí" : "Ninguna tabla abierta."}</b>
              <span>
                {libros.length
                  ? seleccion === "todas" || filtro !== "todas"
                    ? "Cambie el filtro o elija otra carpeta."
                    : crea
                      ? "Cree una tabla con «Nuevo» o muévala aquí desde sus detalles."
                      : "Cuando se agreguen tablas a esta carpeta, aparecerán aquí."
                  : crea
                    ? "Cree una tabla con «Nuevo» (eligiendo los conceptos del catálogo) o súbala con «Subir un Excel»: el importador empareja cada encabezado con su concepto."
                    : "Cuando se creen las tablas, aquí capturará las filas de su campus."}
              </span>
            </div>
          ) : null}
          {hoja && !ctx.periodo ? (
            <div className="es-empty">
              <b>No hay periodo.</b>
              <span>Las filas se capturan por periodo. El Director abre el periodo en «Periodos».</span>
            </div>
          ) : null}
        </Zona>
      </div>
      <PanelDetalles abierto={detalles}>
        {libro ? (
          <DetallesLibro libro={libro} ctx={ctx} carpetas={carpetas} envios={enviosLista} campusSel={campusSel} onAbrir={(caja) => abrir(libro.id, caja)} onNuevaHoja={() => setPanel("hoja")} onExportar={(s) => setExportar(s)} aviso={aviso} />
        ) : (
          <div className="es-dsec">
            <h3>Detalles</h3>
            <p className="es-note">Seleccione una tabla para ver su avance por campus y sus hojas.</p>
          </div>
        )}
      </PanelDetalles>

      {abierta ? (
        <EditorTabla
          key={abierta.libro.id}
          ctx={ctx}
          libro={abierta.libro}
          hoja={abierta.hoja}
          campusSel={campusSel}
          ventanas={ventanas.data ?? []}
          envios={enviosLista}
          personales={new Set(conceptos.data.filter((c) => c.personal).map((c) => c.id))}
          origen={origen}
          aviso={aviso}
          decir={toast.decir}
          onCerrar={() => ir({ hoja: null })}
          onHoja={(id) => ir({ hoja: id })}
          onCampus={(id) => ir({ campus: id || null })}
          onNuevaHoja={() => setPanel("hoja")}
          onExcel={() => {
            setPrevioExcel(null);
            setPanel("excel");
          }}
        />
      ) : null}
      <Aviso texto={toast.aviso} />

      {panel === "tabla" && (
        <NuevoPanel
          yo={ctx.yo}
          conceptos={conceptos.data}
          carpetas={carpetas}
          carpetaInicial={ESPECIALES.includes(seleccion) ? null : seleccion}
          capturaInicial={capturaNueva}
          onCerrar={() => setPanel(null)}
          onCreada={(id) => {
            setPanel(null);
            ir({ libro: id, hoja: null });
            aviso.ok("Tabla creada. Defina su ventana de captura en «Periodos».");
          }}
          onExcel={(previo) => {
            setPrevioExcel(previo);
            setPanel("excel");
          }}
        />
      )}
      {panel === "hoja" && libro && (
        <NuevaTabla
          libro={libro}
          conceptos={conceptos.data}
          onCerrar={() => setPanel(null)}
          onCreada={(_l, h) => {
            setPanel(null);
            ir({ hoja: h ?? null });
            aviso.ok("Hoja creada.");
          }}
        />
      )}
      {panel === "excel" && (
        <CargaExcel
          ctx={ctx}
          estructura={libros}
          libro={previoExcel ? null : libro}
          previo={previoExcel}
          carpetaId={ESPECIALES.includes(seleccion) ? null : seleccion}
          hojaActual={hoja?.id ?? null}
          ventanas={ventanas.data ?? []}
          envios={enviosLista}
          conceptos={conceptos.data}
          onCerrar={() => setPanel(null)}
          onListo={(libroId, hojaId, mensaje) => {
            setPanel(null);
            setPrevioExcel(null);
            ir({ libro: libroId, hoja: hojaId });
            aviso.ok(mensaje);
          }}
        />
      )}
      {exportar && <ExportarContactos ctx={ctx} libros={libros.filter((l) => l.plantilla_contactos)} inicial={exportar} onCerrar={() => setExportar(null)} />}
      {aviso.nodo}
    </div>
  );
}

/* ---------- Los detalles de un libro ----------------------------------------------- */

function DetallesLibro({
  libro,
  ctx,
  carpetas,
  envios,
  campusSel,
  onAbrir,
  onNuevaHoja,
  onExportar,
  aviso,
}: {
  libro: LibroCompleto;
  ctx: Ctx;
  carpetas: IntCarpetaRow[];
  envios: { hoja_id: string; campus_id: string; estado: "borrador" | "enviado" | "validado" | "aprobado" }[];
  campusSel: string;
  onAbrir: (caja: Caja | null) => void;
  onNuevaHoja: () => void;
  /** Tablas de contactos (0167): abre la exportación con la plantilla de esta tabla. */
  onExportar: (salida: Salida) => void;
  aviso: ReturnType<typeof useAviso>;
}) {
  const [borrar, setBorrar] = useState(false);
  const borrarLibro = useBorrarLibro();
  const mover = useMoverLibro();
  const multicampus = libro.captura === "multicampus";
  const nombres = useNombres([libro.created_by]);
  const puedeEditar = puedeEditarLibro(ctx.yo, libro, ctx.userId);
  const campus = multicampus ? (campusSel ? ctx.campus.filter((c) => c.id === campusSel) : ctx.campus) : campusSel ? ctx.visibles.filter((c) => c.id === campusSel) : ctx.visibles;
  const avance = avanceDeLibro(libro, envios, campus.map((c) => c.id));
  const destinos = aplanar(armarArbol(carpetas));
  return (
    <>
      <div className="es-dhead">
        <span className="es-kbig">
          <Icon name={multicampus ? "users" : "table"} size={24} />
        </span>
        <h2>{libro.nombre}</h2>
      </div>
      <dl className="es-kv">
        <dt>Captura</dt>
        <dd>
          {libro.captura === "oficina" ? "Solo la oficina principal" : multicampus ? "Multicampus: aportan todos los campus" : "Cada campus sus filas"}
        </dd>
        <dt>Carpeta</dt>
        <dd>{libro.carpeta_id ? rutaDe(carpetas, libro.carpeta_id).map((c) => c.nombre).join(" / ") : "Sin carpeta"}</dd>
        <dt>Hojas</dt>
        <dd className="es-num">{libro.hojas.length}</dd>
        <dt>Avance</dt>
        <dd className="es-num">{avance.total ? `${avance.aprobadas} de ${avance.total} aprobadas` : "Sin envíos"}</dd>
        <dt>Creada</dt>
        <dd>
          {libro.created_by ? `por ${nombres.data?.[libro.created_by] ?? "…"} · ` : ""}
          {haceCuanto(libro.created_at)}
        </dd>
      </dl>
      <div className="es-act">
        <button type="button" className="es-btn es-btn--pri es-btn--sm" onClick={(e) => onAbrir(e.currentTarget.getBoundingClientRect())}>
          <Icon name="pen" size={16} />
          Abrir
        </button>
        {libro.plantilla_contactos ? (
          <button type="button" className="es-btn es-btn--sm" onClick={() => onExportar(libro.plantilla_contactos!)}>
            <Icon name="download" size={16} />
            Exportar
          </button>
        ) : null}
        {puedeEditar ? (
          <>
            <button type="button" className="es-btn es-btn--sm" onClick={onNuevaHoja}>
              <Icon name="plus" size={16} />
              Nueva hoja
            </button>
            <button type="button" className="es-btn es-btn--sm" onClick={() => setBorrar(true)}>
              <Icon name="trash" size={16} />
              Borrar tabla
            </button>
          </>
        ) : null}
      </div>
      {puedeEditar ? (
        <label className="it-campo it-campo--detalle">
          <span>Mover a la carpeta</span>
          <select
            value={libro.carpeta_id ?? ""}
            disabled={mover.isPending}
            onChange={(e) =>
              mover.mutate(
                { libro: libro.id, carpeta: e.target.value || null },
                { onSuccess: () => aviso.ok("Tabla movida."), onError: (err) => aviso.mal(err) },
              )
            }
          >
            <option value="">Sin carpeta</option>
            {destinos.map(({ carpeta: c }) => (
              <option key={c.id} value={c.id}>
                {rutaDe(carpetas, c.id).map((x) => x.nombre).join(" / ")}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {borrar ? (
        <Confirmar
          pregunta={`¿Borrar la tabla «${libro.nombre}»?`}
          detalle="Se borran sus hojas y todas sus filas, de todos los periodos y campus. Si alguna hoja está aprobada, la base no lo deja: reábrala primero."
          si="Sí, borrar la tabla"
          ocupado={borrarLibro.isPending}
          onNo={() => setBorrar(false)}
          onSi={() =>
            borrarLibro.mutate(libro.id, {
              onSuccess: () => aviso.ok(`Se borró «${libro.nombre}».`),
              onError: (e) => aviso.mal(e),
              onSettled: () => setBorrar(false),
            })
          }
        />
      ) : null}
      <div className="es-dsec">
        <h3>Hojas por campus</h3>
        {libro.hojas.length === 0 ? <p className="es-note">Esta tabla no tiene hojas.</p> : null}
        {libro.hojas.map((h) => (
          <div className="es-cov" key={h.id} style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <b>{h.nombre}</b>
              <span>{h.clase === "movilidad" ? `Movilidad ${h.sentido ?? ""}`.trim() : CLASE[h.clase]}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {campus.map((c) => {
                  const e = envios.find((x) => x.hoja_id === h.id && x.campus_id === c.id);
                  return (
                    <span key={c.id} title={nombreCampus(ctx.campus, c.id)} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <small>{c.code ?? c.name}</small>
                      <EstadoPill estado={e?.estado ?? "borrador"} corto />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- El editor de una hoja ------------------------------------------------------ */

function EditorTabla({
  ctx,
  libro,
  hoja,
  campusSel,
  ventanas,
  envios,
  personales,
  origen,
  aviso,
  decir,
  onCerrar,
  onHoja,
  onCampus,
  onNuevaHoja,
  onExcel,
}: {
  ctx: Ctx;
  libro: LibroCompleto;
  hoja: LibroCompleto["hojas"][number];
  campusSel: string;
  ventanas: Parameters<typeof BarraEnvio>[0]["ventanas"];
  envios: Parameters<typeof escrituraPorCampus>[0]["envios"];
  personales: ReadonlySet<string>;
  origen: Caja | null;
  aviso: ReturnType<typeof useAviso>;
  decir: (mensaje: string) => void;
  onCerrar: () => void;
  onHoja: (id: string) => void;
  onCampus: (id: string) => void;
  onNuevaHoja: () => void;
  onExcel: () => void;
}) {
  const periodo = ctx.periodo!;
  const tour = useTour();
  const filasQ = useFilas(hoja.id, periodo.id);
  const guardar = useGuardarFilas();
  const borrar = useBorrarFilas();
  const multicampus = libro.captura === "multicampus";
  // Multicampus: todos los campus a la vista; en las demás, los que tiene quien mira.
  const campusDelEditor = multicampus ? ctx.campus : ctx.visibles;
  const puedeEditarLaTabla = puedeEditarLibro(ctx.yo, libro, ctx.userId);

  const escritura = useMemo(
    () => escrituraPorCampus({ yo: ctx.yo, campus: campusDelEditor.map((c) => c.id), hoja, libro, periodo, ventanas, envios }),
    [ctx.yo, campusDelEditor, hoja, libro, periodo, ventanas, envios],
  );
  const escribibles = escritura.filter((e) => !e.bloqueo).map((e) => e.campus_id);
  // Fila nueva: el campus elegido o, si no hay, el primero propio donde se pueda escribir (Bucaramanga empieza por el suyo).
  const propioPrimero = [ctx.yo.central, ...ctx.visibles.map((c) => c.id)].filter((x): x is string => Boolean(x) && escribibles.includes(x as string))[0];
  const campusNuevo = campusSel ? (escribibles.includes(campusSel) ? campusSel : null) : escribibles.length === 1 ? escribibles[0] : (propioPrimero ?? escribibles[0] ?? null);
  const sel = escritura.find((e) => e.campus_id === campusSel);

  const columnas = useMemo(() => hoja.columnas.map(columnaEsp), [hoja.columnas]);
  const reglas = useMemo(() => reglasInt(hoja.columnas, personales), [hoja.columnas, personales]);
  const aVer = (filas: NonNullable<typeof filasQ.data>): FilaGuardada[] =>
    filas.filter((f) => (campusSel ? f.campus_id === campusSel : campusDelEditor.some((c) => c.id === f.campus_id))).map((f) => ({ id: f.id, datos: f.datos, grupo: f.campus_id }));
  const guardadas = useMemo(() => (filasQ.data ? aVer(filasQ.data) : undefined), [filasQ.data, campusSel, campusDelEditor]); // eslint-disable-line react-hooks/exhaustive-deps -- aVer depende de las mismas

  // Autoría de cada fila (quién la registró, cuándo y de dónde vino): se muestra en Multicampus.
  const porId = useMemo(() => new Map((filasQ.data ?? []).map((f) => [f.id, f])), [filasQ.data]);
  const nombres = useNombres((filasQ.data ?? []).flatMap((f) => [f.created_by, f.updated_by]));
  // Las filas que llegaron por el enlace de Contactos (0167) traen quién aportó: nombre y cargo declarados.
  const aportantes = useAportantes();
  const delEnlace = useMemo(() => new Map((aportantes.data ?? []).map((a) => [a.id, a])), [aportantes.data]);
  const quien = (f: FilaLocal) => {
    const fila = f.id ? porId.get(f.id) : undefined;
    if (!fila) return "Fila nueva";
    const aporta = fila.aportante_id ? delEnlace.get(fila.aportante_id) : undefined;
    if (aporta) return `${aporta.nombre} · ${aporta.cargo}`;
    const autor = fila.created_by ? (nombres.data?.[fila.created_by] ?? "…") : "—";
    return fila.updated_by && fila.updated_by !== fila.created_by ? `${autor} · editó ${nombres.data?.[fila.updated_by] ?? "…"}` : autor;
  };
  const columnasInfo = multicampus
    ? [
        { etiqueta: "Registró", ancho: 190, texto: quien },
        { etiqueta: "Cuándo", ancho: 110, texto: (f: FilaLocal) => (f.id ? cuando(porId.get(f.id)?.created_at) : "—") },
        {
          etiqueta: "Origen",
          ancho: 190,
          texto: (f: FilaLocal) => {
            const fila = f.id ? porId.get(f.id) : undefined;
            return !fila ? "A mano" : fila.canal === "enlace" ? entroPor(fila) : fila.origen === "excel" ? `Excel${fila.archivo ? ` · ${fila.archivo}` : ""}` : "A mano";
          },
        },
      ]
    : undefined;

  return (
    <Editor
      clave={`${hoja.id}|${periodo.id}|${campusSel}`}
      titulo={`${libro.nombre} · ${hoja.nombre}`}
      tipo="tabla"
      origen={origen}
      onCerrar={onCerrar}
      chip={() => (sel ? <EstadoPill estado={sel.estado} /> : <span className="es-tag">{multicampus ? "Multicampus · todos los campus" : "Varios campus"}</span>)}
      recorrido={() => tour.start("internacionalizacion-hoja")}
      acciones={() => (
        <button type="button" className="es-btn" disabled={!escribibles.length} onClick={onExcel}>
          <Icon name="upload" size={16} />
          {multicampus ? "Subir mi aporte (Excel)" : "Cargar Excel"}
        </button>
      )}
      columnas={columnas}
      reglas={reglas}
      guardadas={guardadas}
      refrescar={async () => aVer((await filasQ.refetch()).data ?? [])}
      guardar={async (g) => {
        if (g.filas.length) {
          const filas = g.filas.map((f) => ({ id: f.id, campus_id: f.grupo ?? campusNuevo ?? "", datos: f.datos, orden: f.orden }));
          const r = await guardar.mutateAsync({ hoja: hoja.id, periodo: periodo.id, filas, origen: "manual" });
          aviso.ok(`Guardado: ${fmt(r.insertadas)} nuevas, ${fmt(r.actualizadas)} cambiadas.`);
        }
        if (g.borrar.length) {
          await borrar.mutateAsync({ ids: g.borrar, hoja: hoja.id, periodo: periodo.id });
          aviso.ok(g.borrar.length === 1 ? "Se quitó 1 fila." : `Se quitaron ${fmt(g.borrar.length)} filas.`);
        }
      }}
      modo="manual"
      confirmarQuitar
      editable={escribibles.length > 0}
      bloqueoFila={(f) =>
        escritura.find((e) => e.campus_id === f.grupo)?.bloqueo ?? (f.grupo ? null : "No tiene permiso en este campus.")
      }
      grupoNuevo={() => campusNuevo}
      columnaGrupo={{ etiqueta: "Campus", texto: (g) => nombreCampus(ctx.campus, g) }}
      columnasInfo={columnasInfo}
      decir={decir}
      barra={
        <div className="it-envio-editor" data-tour="int-envio">
          <BarraEnvio ctx={ctx} hojaId={hoja.id} escritura={escritura} campusSel={campusSel} ventanas={ventanas} onCampus={onCampus} aviso={aviso} />
        </div>
      }
      pestanas={{
        items: libro.hojas.map((h) => ({ id: h.id, nombre: h.nombre, nota: h.clase === "movilidad" ? `movilidad ${h.sentido ?? ""}`.trim() : CLASE[h.clase].toLowerCase() })),
        activa: hoja.id,
        onElegir: onHoja,
        extra: puedeEditarLaTabla ? (
          <button type="button" onClick={onNuevaHoja}>
            <Icon name="plus" size={14} />
            Nueva hoja
          </button>
        ) : undefined,
      }}
      insigniaSoloLectura={sel?.rol ? `Solo lectura · ${ETIQUETA_ROL[sel.rol]}` : "Solo lectura"}
      enfocarAlAbrir={false}
    />
  );
}
