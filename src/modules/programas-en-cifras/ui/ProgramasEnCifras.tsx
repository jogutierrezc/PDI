/* =============================================================================
   Programas en Cifras · la pantalla (/admin/programas-en-cifras).

   Pantalla completa estilo OneDrive, fuera del marco de la intranet pero dentro
   de su sesión: barra azul marino con la marca, el buscador Ctrl+K, el selector
   de programa y campus, y el menú de la persona con el regreso a la intranet.
   Pertenecer a pc_miembros (o ser Planeación o administración) es el permiso.
   La pareja programa × campus viaja en la dirección (?p=…&c=…).
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { CardSkeleton, ErrorBlock } from "../../../components/ui/QueryState";
import { useTour } from "../../../components/tour/TourProvider";
import { useAuth } from "../../../lib/auth";
import { esFaltaMigracion, useCarpetas, useEstructura, usePeriodos, useRespuestas, useResumenArchivos, useYo } from "../datos";
import { puedeEditar, rolEn, veEquipo } from "../lib/permisos";
import type { ProgramaCampus } from "../tipos";
import { Asistente } from "./Asistente";
import { Buscador } from "../../../components/espacio/Buscador";
import type { EntradaBuscador } from "../../../components/espacio/Buscador";
import { Aviso, useAviso } from "../../../components/espacio/piezas";
import { BarraSuperior, EstadoPantalla } from "../../../components/espacio/Marco";
import { AvisoMigracion } from "./comunes";
import { carpetaDe, ProveedorEspacio } from "./contexto";
import type { Espacio, OpcionesAsistente } from "./contexto";
import { Detalles } from "./Detalles";
import { CrearCuadroMaestro, EmitirCuadro, NuevaCarpeta } from "./Dialogos";
import { Editor } from "./Editor";
import { Equipo } from "./Equipo";
import { Comandos, Migas, Riel, ZonaArchivos } from "./Explorador";
import type { ControlExplorador, EstadoExplorador } from "./Explorador";
import { agruparPorCampus, claveDePareja, parejaInicial, textoTipoArchivo } from "./logica";
import { cajaDe } from "../../../components/espacio/movimiento";
import type { Caja } from "../../../components/espacio/tipos";
import "../../../components/espacio/espacio.css";
import "./programas.css";

const ACCIONES: EntradaBuscador[] = [
  { id: "nuevo", titulo: "Nuevo archivo", icono: "plus", pista: "Acción" },
  { id: "subir", titulo: "Subir una plantilla de Excel", icono: "upload", pista: "Acción" },
  { id: "recorrido", titulo: "Recorrido guiado de Pilo", icono: "play", pista: "Acción" },
  { id: "plantillas", titulo: "Ver plantillas CNA y SNIES", icono: "library", pista: "Acción" },
  { id: "vista", titulo: "Cambiar entre mosaicos y lista", icono: "rows", pista: "Acción" },
];

export function ProgramasEnCifras() {
  const yo = useYo();
  const [params, setParams] = useSearchParams();
  const pareja = parejaInicial(yo.data, params.get("p"), params.get("c"));

  if (yo.isPending) {
    return <EstadoPantalla><CardSkeleton count={3} /></EstadoPantalla>;
  }
  if (yo.error) {
    return <EstadoPantalla>{esFaltaMigracion(yo.error) ? <AvisoMigracion mensaje={yo.error.message} /> : <ErrorBlock error={yo.error} onRetry={() => void yo.refetch()} />}</EstadoPantalla>;
  }
  if (!pareja || !yo.data) {
    return <EstadoPantalla><div className="es-empty"><b>Todavía no tiene programas asignados</b><span>Pídale a la administración de la intranet que lo nombre Director o Coordinador de un programa.</span><Link className="es-btn" to="/admin">Volver a la intranet</Link></div></EstadoPantalla>;
  }
  return <Espacio key={claveDePareja(pareja)} yo={yo.data} pareja={pareja} equipoAlAbrir={params.get("seccion") === "equipo"} onPareja={(p) => setParams({ p: p.programa_id, c: p.campus_id }, { replace: true })} />;
}

function Espacio({ yo, pareja, onPareja, equipoAlAbrir }: { yo: NonNullable<ReturnType<typeof useYo>["data"]>; pareja: ProgramaCampus; equipoAlAbrir: boolean; onPareja: (p: ProgramaCampus) => void }) {
  const { programa_id: p, campus_id: c } = pareja;
  const carpetas = useCarpetas(p, c);
  const estructura = useEstructura(p, c);
  const resumen = useResumenArchivos(p, c);
  const respuestas = useRespuestas(p, c);
  const periodos = usePeriodos(p, c);
  const { aviso, decir } = useAviso();
  const tour = useTour();
  const admin = useAuth().hasRole("admin");
  const rol = rolEn(yo, p, c);
  const editable = puedeEditar(rol);
  const falla = [carpetas, estructura, resumen, respuestas].find((q) => q.error)?.error ?? null;

  const [estado, setEstado] = useState<EstadoExplorador>({ seccion: equipoAlAbrir && veEquipo(yo, admin) ? "equipo" : "archivos", carpeta: null, filtro: "todos", vista: "mosaicos", detalles: true, seleccion: null });
  const cambiar = useCallback((parcial: Partial<EstadoExplorador>) => setEstado((e) => ({ ...e, ...parcial })), []);
  const [editor, setEditor] = useState<{ id: string; caja: Caja | null } | null>(null);
  const [asistente, setAsistente] = useState<OpcionesAsistente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [dialogo, setDialogo] = useState<"carpeta" | "cuadro" | "emitir" | null>(null);

  const archivos = useMemo(() => estructura.data ?? [], [estructura.data]);
  const mapaResumen = useMemo(() => new Map((resumen.data ?? []).map((r) => [r.archivo_id, r])), [resumen.data]);
  const cna = carpetaDe(carpetas.data ?? [], "cna");
  // El área de la salud se sabe por el Cuadro 10: si el programa tiene su archivo, es de salud.
  const salud = archivos.some((a) => a.destino_origen === "cna10");
  const sinCuadro = Boolean(cna) && estructura.isSuccess && !archivos.some((a) => a.destino_origen === "cna01");

  const espacio: Espacio = {
    pareja, rol, editable, admin, verEquipo: veEquipo(yo, admin), parejas: yo.programas, carpetas: carpetas.data ?? [], archivos, resumen: mapaResumen, respuestas: respuestas.data ?? [], periodos: periodos.data ?? null, salud, decir,
    abrirEditor: (id, caja) => setEditor({ id, caja: caja ? { left: caja.left, top: caja.top, width: caja.width, height: caja.height } : null }),
    abrirAsistente: setAsistente,
    empezarRecorrido: (id) => tour.start(id),
  };
  const control: ControlExplorador = { estado, cambiar, nuevaCarpeta: () => setDialogo("carpeta") };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando((b) => !b);
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  const entradas = useMemo<EntradaBuscador[]>(
    () => [
      ...archivos.map((a) => ({ id: `a:${a.id}`, titulo: a.nombre, icono: a.tipo === "lista" ? ("list" as const) : ("table" as const), pista: `${textoTipoArchivo(a.tipo)} · ${(carpetas.data ?? []).find((c) => c.id === a.carpeta_id)?.nombre ?? ""}` })),
      ...ACCIONES,
    ],
    [archivos, carpetas.data],
  );

  const elegir = (e: EntradaBuscador) => {
    setBuscando(false);
    const a = e.id;
    if (a.startsWith("a:")) espacio.abrirEditor(a.slice(2), cajaDe(document.querySelector(`[data-id="${a.slice(2)}"]`)));
    else if (a === "nuevo" && editable) setAsistente({ origen: null });
    else if (a === "subir" && editable) setAsistente({ origen: null, excel: true });
    else if (a === "recorrido") tour.start("programas");
    else if (a === "plantillas") cambiar({ seccion: "plantillas", carpeta: null, seleccion: null });
    else if (a === "vista") cambiar({ vista: estado.vista === "mosaicos" ? "lista" : "mosaicos" });
    else decir("Planeación solo observa.");
  };

  const oferta = sinCuadro && editable ? (
    <div className="es-banner" style={{ justifyContent: "space-between" }} data-tour="pc-oferta">
      <span><Icon name="info" size={16} /> Este programa aún no tiene su Cuadro Maestro del CNA.</span>
      <button type="button" className="es-btn es-btn--sm es-btn--pri" onClick={() => setDialogo("cuadro")}>Crear el Cuadro Maestro del programa</button>
    </div>
  ) : null;

  return (
    <ProveedorEspacio value={espacio}>
      <div className="es pc">
        <BarraSuperior
          sigla="PC"
          marca="Programas en Cifras"
          buscar="Buscar archivos y acciones"
          tourBuscar="pc-buscar"
          tourSelector="pc-selector"
          onBuscar={() => setBuscando(true)}
          selector={
            <select aria-label="Programa y campus" value={claveDePareja(pareja)} disabled={yo.programas.length < 2} onChange={(e) => { const p = yo.programas.find((x) => claveDePareja(x) === e.target.value); if (p) onPareja(p); }}>
              {agruparPorCampus(yo.programas).map((g) => <optgroup key={g.campus_id} label={g.campus}>{g.parejas.map((p) => <option key={claveDePareja(p)} value={claveDePareja(p)}>{p.programa}</option>)}</optgroup>)}
            </select>
          }
        />
        <div className="pc-body">
          <Riel control={control} />
          <main className="pc-main">
            <Migas control={control} />
            {estado.seccion === "equipo" ? <span /> : <Comandos control={control} onNuevo={(caja) => setAsistente({ origen: caja, carpeta: estado.carpeta ?? undefined })} onSubir={(caja) => setAsistente({ origen: caja, excel: true, carpeta: estado.carpeta ?? undefined })} />}
            {estado.seccion === "equipo" ? <Equipo /> : falla ? (
              <div className="es-files">{esFaltaMigracion(falla) ? <AvisoMigracion mensaje={falla.message} /> : <ErrorBlock error={falla} />}</div>
            ) : estructura.isPending ? (
              <div className="es-files"><CardSkeleton count={4} /></div>
            ) : (
              <ZonaArchivos control={control} arriba={oferta} onPlantilla={(destino, caja) => setAsistente({ destino, origen: caja })} />
            )}
          </main>
          {estado.seccion === "equipo" ? <span /> : <Detalles control={control} onEmitir={() => setDialogo("emitir")} />}
        </div>
        {editor ? <Editor key={editor.id} archivoId={editor.id} origen={editor.caja} onCerrar={() => setEditor(null)} /> : null}
        {asistente ? (
          <Asistente
            opciones={asistente}
            onCerrar={() => setAsistente(null)}
            onCreado={(id) => {
              const caja = asistente.origen;
              setAsistente(null);
              cambiar({ seccion: "archivos", carpeta: null, filtro: "todos", seleccion: id });
              setEditor({ id, caja });
            }}
          />
        ) : null}
        {buscando ? <Buscador entradas={entradas} onElegir={elegir} onCerrar={() => setBuscando(false)} /> : null}
        {dialogo === "carpeta" ? <NuevaCarpeta onCerrar={() => setDialogo(null)} /> : null}
        {dialogo === "cuadro" ? <CrearCuadroMaestro onCerrar={() => setDialogo(null)} /> : null}
        {dialogo === "emitir" ? <EmitirCuadro onCerrar={() => setDialogo(null)} /> : null}
        <Aviso texto={aviso} />
      </div>
    </ProveedorEspacio>
  );
}
