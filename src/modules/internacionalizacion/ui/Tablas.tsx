/* =============================================================================
   Internacionalización · Tablas: el explorador de libros y su editor.

   Cada LIBRO (int_libros) es un archivo del explorador, agrupado por la clase
   de sus hojas. Un clic muestra sus detalles (avance por campus, hojas); doble
   clic o Enter lo abre a pantalla completa, creciendo desde el mosaico, con las
   HOJAS como pestañas al pie, como en Excel. Libro, hoja y campus viajan en la
   dirección (?libro=&hoja=&campus=): con `hoja` el editor está abierto.

   El flujo de envío no cambia (borrador → enviado → validado → aprobado,
   devolver con nota, reabrir con motivo): su barra va en el editor y su
   resumen en los detalles. Las reglas siguen en lib/permisos.ts.

   La interfaz es la compartida de components/espacio; aquí solo se le dice
   qué libros hay, qué columnas tiene cada hoja, quién puede escribir dónde y
   cómo se guarda.
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
import type { Caja, FilaGuardada } from "../../../components/espacio/tipos";
import { FaltaMigracion, useBorrarFilas, useBorrarLibro, useConceptos, useEnvios, useEstructura, useFilas, useGuardarFilas, useVentanas } from "../datos";
import { ETIQUETA_ROL } from "../lib/permisos";
import type { LibroCompleto } from "../tipos";
import { avanceLibro, carpetaDeLibro, CARPETAS_INT, columnaEsp, reglasInt } from "./adaptador";
import type { CarpetaId } from "./adaptador";
import { BarraEnvio } from "./BarraEnvio";
import { CargaExcel } from "./CargaExcel";
import { AvisoMigracion, Cargando, Confirmar, ErrorCaja, EstadoPill, fmt, nombreCampus, useAviso } from "./comunes";
import type { Ctx } from "./comunes";
import { escrituraPorCampus } from "./logica";
import { NuevaTabla } from "./NuevaTabla";
import "../../../components/espacio/espacio.css";

const CLASE: Record<string, string> = { movilidad: "Movilidad", convenio: "Convenio", general: "General" };
const FILTROS = [
  { id: "todas", etiqueta: "Todas" },
  { id: "pendientes", etiqueta: "Con pendientes" },
  { id: "aprobadas", etiqueta: "Aprobadas" },
];

export function Tablas({ ctx }: { ctx: Ctx }) {
  const [params, setParams] = useSearchParams();
  const estructura = useEstructura();
  const conceptos = useConceptos();
  const ventanas = useVentanas(ctx.periodo?.id);
  const envios = useEnvios(ctx.periodo?.id);
  const tour = useTour();
  const toast = useToast();
  const aviso = useAviso();
  const [panel, setPanel] = useState<null | "tabla" | "hoja" | "excel">(null);
  const [filtro, setFiltro] = useState("todas");
  const [vista, setVista] = useState<VistaArchivos>("mosaicos");
  const [detalles, setDetalles] = useState(true);
  const [origen, setOrigen] = useState<Caja | null>(null);

  const carpeta: CarpetaId | null = CARPETAS_INT.find((c) => c.id === params.get("carpeta"))?.id ?? null;
  const libros = useMemo(() => estructura.data ?? [], [estructura.data]);
  const libro = libros.find((l) => l.id === params.get("libro")) ?? null;
  const hoja = libro?.hojas.find((h) => h.id === params.get("hoja")) ?? null;
  const unico = ctx.visibles.length === 1 ? ctx.visibles[0].id : "";
  const campusSel = ctx.visibles.some((c) => c.id === params.get("campus")) ? params.get("campus")! : unico;
  const campusIds = useMemo(() => ctx.visibles.map((c) => c.id), [ctx.visibles]);
  const enviosLista = envios.data ?? [];

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  // El buscador Ctrl+K y el riel piden acciones de esta sección por la dirección (?accion=).
  const accion = params.get("accion");
  useEffect(() => {
    if (!accion) return;
    if (accion === "vista") setVista((v) => (v === "mosaicos" ? "lista" : "mosaicos"));
    else if (ctx.director && (accion === "nueva" || accion === "excel")) setPanel(accion === "nueva" ? "tabla" : "excel");
    const p = new URLSearchParams(params);
    p.delete("accion");
    setParams(p, { replace: true });
  }, [accion]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reacciona a la petición

  const visibles = useMemo(() => {
    const avances = new Map(libros.map((l) => [l.id, avanceLibro(l, enviosLista, campusIds)] as const));
    return libros
      .filter((l) => (carpeta ? carpetaDeLibro(l) === carpeta : true))
      .filter((l) => {
        const a = avances.get(l.id)!;
        return filtro === "aprobadas" ? a.total > 0 && a.aprobadas === a.total : filtro === "pendientes" ? a.aprobadas < a.total : true;
      })
      .map((l) => ({ libro: l, avance: avances.get(l.id)! }));
  }, [libros, enviosLista, campusIds, carpeta, filtro]);

  const error = estructura.error ?? conceptos.error;
  if (error instanceof FaltaMigracion) return <AvisoMigracion error={error} />;
  if (error) return <ErrorCaja error={error} />;
  if (!estructura.data || !conceptos.data) return <Cargando texto="Abriendo las tablas…" />;

  const carpetasConLibros = CARPETAS_INT.filter((c) => libros.some((l) => carpetaDeLibro(l) === c.id));
  const abrir = (id: string, caja: Caja | null) => {
    const l = libros.find((x) => x.id === id);
    setOrigen(caja);
    ir({ libro: id, hoja: l?.hojas[0]?.id ?? null });
  };

  const items = visibles.map(({ libro: l, avance }) => {
    const estado = <Ficha clave={avance.total > 0 && avance.aprobadas === avance.total ? "listo" : "borrador"} texto={`${avance.aprobadas} de ${avance.total} aprobadas`} icono={avance.total > 0 && avance.aprobadas === avance.total ? "check" : "pen"} />;
    const captura = l.captura === "oficina" ? "Solo la oficina" : "Cada campus";
    return {
      id: l.id,
      nombre: l.nombre,
      tipo: "tabla" as const,
      columnas: Math.max(0, ...l.hojas.map((h) => h.columnas.length)),
      subtitulo: `${l.hojas.length === 1 ? "1 hoja" : `${l.hojas.length} hojas`} · ${captura.toLowerCase()}`,
      estado,
      pie: avance.total ? (
        <span className="it-libros__medidor" aria-label={`${avance.aprobadas} de ${avance.total} aprobadas`}>
          <i style={{ width: `${(avance.aprobadas / avance.total) * 100}%` }} />
        </span>
      ) : undefined,
      celdas: [CARPETAS_INT.find((c) => c.id === carpetaDeLibro(l))?.nombre, estado, l.hojas.length, captura],
    };
  });

  const enRaiz = !carpeta && carpetasConLibros.length > 1;
  const abierta = hoja && ctx.periodo ? { libro: libro!, hoja } : null;

  return (
    <div className="es it-esp" data-tour="int-tablas">
      <div className="it-esp__main">
        <Migas partes={[{ texto: "Tablas", onClick: () => ir({ carpeta: null, libro: null, hoja: null }) }, ...(carpeta ? [{ texto: CARPETAS_INT.find((c) => c.id === carpeta)!.nombre }] : [])]} />
        <Comandos
          izquierda={
            <>
              {ctx.director ? (
                <>
                  <button type="button" className="es-btn es-btn--pri" data-tour="int-nueva" onClick={() => setPanel("tabla")}>
                    <Icon name="plus" size={16} />
                    Nueva tabla
                  </button>
                  <button type="button" className="es-btn" onClick={() => setPanel("excel")}>
                    <Icon name="upload" size={16} />
                    Desde Excel
                  </button>
                </>
              ) : null}
            </>
          }
          filtros={{ items: FILTROS, valor: filtro, onCambiar: setFiltro }}
          vista={vista}
          onVista={setVista}
          detalles={detalles}
          onDetalles={setDetalles}
          onRecorrido={() => tour.start("internacionalizacion-tablas")}
        />
        <Zona clave={`${carpeta}|${filtro}|${vista}`}>
          {!libros.length ? (
            <div className="es-empty">
              <b>Ninguna tabla abierta.</b>
              <span>
                {ctx.director
                  ? "Cree una tabla con «Nueva tabla» (eligiendo los conceptos del catálogo) o súbala con «Desde Excel»: el importador empareja cada encabezado con su concepto."
                  : "Cuando el Director cree las tablas, aquí capturará las filas de su campus."}
              </span>
            </div>
          ) : enRaiz ? (
            <Carpetas
              carpetas={carpetasConLibros.map((c) => {
                const n = libros.filter((l) => carpetaDeLibro(l) === c.id).length;
                return { id: c.id, nombre: c.nombre, subtitulo: `${c.subtitulo} · ${n} ${n === 1 ? "tabla" : "tablas"}` };
              })}
              onAbrir={(id) => ir({ carpeta: id })}
            />
          ) : items.length ? (
            <Archivos items={items} vista={vista} seleccion={libro?.id ?? null} onSeleccionar={(id) => ir({ libro: id, hoja: null })} onAbrir={abrir} encabezadosLista={["Clase", "Avance", "Hojas", "Captura"]} />
          ) : (
            <div className="es-empty">
              <b>No hay tablas aquí</b>
              <span>Cambie el filtro o la carpeta.</span>
            </div>
          )}
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
          <DetallesLibro libro={libro} ctx={ctx} envios={enviosLista} campusSel={campusSel} onAbrir={(caja) => abrir(libro.id, caja)} onNuevaHoja={() => setPanel("hoja")} aviso={aviso} />
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
          onExcel={() => setPanel("excel")}
        />
      ) : null}
      <Aviso texto={toast.aviso} />

      {panel === "tabla" && (
        <NuevaTabla
          conceptos={conceptos.data}
          onCerrar={() => setPanel(null)}
          onCreada={(id) => {
            setPanel(null);
            ir({ libro: id, hoja: null });
            aviso.ok("Tabla creada. Defina su ventana de captura en «Periodos».");
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
          libro={libro}
          hojaActual={hoja?.id ?? null}
          ventanas={ventanas.data ?? []}
          envios={enviosLista}
          conceptos={conceptos.data}
          onCerrar={() => setPanel(null)}
          onListo={(libroId, hojaId, mensaje) => {
            setPanel(null);
            ir({ libro: libroId, hoja: hojaId });
            aviso.ok(mensaje);
          }}
        />
      )}
      {aviso.nodo}
    </div>
  );
}

/* ---------- Los detalles de un libro ----------------------------------------------- */

function DetallesLibro({
  libro,
  ctx,
  envios,
  campusSel,
  onAbrir,
  onNuevaHoja,
  aviso,
}: {
  libro: LibroCompleto;
  ctx: Ctx;
  envios: { hoja_id: string; campus_id: string; estado: "borrador" | "enviado" | "validado" | "aprobado" }[];
  campusSel: string;
  onAbrir: (caja: Caja | null) => void;
  onNuevaHoja: () => void;
  aviso: ReturnType<typeof useAviso>;
}) {
  const [borrar, setBorrar] = useState(false);
  const borrarLibro = useBorrarLibro();
  const campus = campusSel ? ctx.visibles.filter((c) => c.id === campusSel) : ctx.visibles;
  const avance = avanceLibro(libro, envios, campus.map((c) => c.id));
  return (
    <>
      <div className="es-dhead">
        <span className="es-kbig">
          <Icon name="table" size={24} />
        </span>
        <h2>{libro.nombre}</h2>
      </div>
      <dl className="es-kv">
        <dt>Captura</dt>
        <dd>{libro.captura === "oficina" ? "Solo la oficina principal" : "Cada campus sus filas"}</dd>
        <dt>Hojas</dt>
        <dd className="es-num">{libro.hojas.length}</dd>
        <dt>Avance</dt>
        <dd className="es-num">
          {avance.aprobadas} de {avance.total} aprobadas
        </dd>
        <dt>Creada</dt>
        <dd>{haceCuanto(libro.created_at)}</dd>
      </dl>
      <div className="es-act">
        <button type="button" className="es-btn es-btn--pri es-btn--sm" onClick={(e) => onAbrir(e.currentTarget.getBoundingClientRect())}>
          <Icon name="pen" size={16} />
          Abrir
        </button>
        {ctx.director ? (
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

  const escritura = useMemo(
    () => escrituraPorCampus({ yo: ctx.yo, campus: ctx.visibles.map((c) => c.id), hoja, libro, periodo, ventanas, envios }),
    [ctx.yo, ctx.visibles, hoja, libro, periodo, ventanas, envios],
  );
  const escribibles = escritura.filter((e) => !e.bloqueo).map((e) => e.campus_id);
  const campusNuevo = campusSel ? (escribibles.includes(campusSel) ? campusSel : null) : escribibles.length === 1 ? escribibles[0] : (escribibles[0] ?? null);
  const sel = escritura.find((e) => e.campus_id === campusSel);

  const columnas = useMemo(() => hoja.columnas.map(columnaEsp), [hoja.columnas]);
  const reglas = useMemo(() => reglasInt(hoja.columnas, personales), [hoja.columnas, personales]);
  const aVer = (filas: NonNullable<typeof filasQ.data>): FilaGuardada[] =>
    filas.filter((f) => (campusSel ? f.campus_id === campusSel : ctx.visibles.some((c) => c.id === f.campus_id))).map((f) => ({ id: f.id, datos: f.datos, grupo: f.campus_id }));
  const guardadas = useMemo(() => (filasQ.data ? aVer(filasQ.data) : undefined), [filasQ.data, campusSel, ctx.visibles]); // eslint-disable-line react-hooks/exhaustive-deps -- aVer depende de las mismas

  return (
    <Editor
      clave={`${hoja.id}|${periodo.id}|${campusSel}`}
      titulo={`${libro.nombre} · ${hoja.nombre}`}
      tipo="tabla"
      origen={origen}
      onCerrar={onCerrar}
      chip={() => (sel ? <EstadoPill estado={sel.estado} /> : <span className="es-tag">Varios campus</span>)}
      recorrido={() => tour.start("internacionalizacion-hoja")}
      acciones={() => (
        <button type="button" className="es-btn" disabled={!escribibles.length} onClick={onExcel}>
          <Icon name="upload" size={16} />
          Cargar Excel
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
      bloqueoFila={(f) => escritura.find((e) => e.campus_id === f.grupo)?.bloqueo ?? (f.grupo ? null : "No tiene permiso en este campus.")}
      grupoNuevo={() => campusNuevo}
      columnaGrupo={{ etiqueta: "Campus", texto: (g) => nombreCampus(ctx.campus, g) }}
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
        extra: ctx.director ? (
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
