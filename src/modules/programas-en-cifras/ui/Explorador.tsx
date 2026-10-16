/* =============================================================================
   Programas en Cifras · el explorador: riel de navegación, migas, comandos y
   archivos del programa.

   Los mosaicos, la lista, la barra de comandos y las migas son del espacio
   compartido (components/espacio); aquí solo se dice qué archivos hay, cómo se
   llama su estado y a qué cuadro del CNA o plantilla del SNIES responden.
   ========================================================================== */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Anillo } from "../../../components/espacio/piezas";
import { EntradaRiel, Riel as RielBase, TituloRiel } from "../../../components/espacio/Marco";
import { Archivos, Carpetas, Comandos as ComandosBase, Migas as MigasBase, Zona } from "../../../components/espacio/Explorador";
import type { VistaArchivos } from "../../../components/espacio/Explorador";
import { haceCuanto } from "../../../components/espacio/logica";
import { cajaDe } from "../../../components/espacio/movimiento";
import { coberturaCuadroMaestro, DESTINOS, nombreCorto } from "../lib/destinos";
import { FichaEstado, Sellos } from "./comunes";
import { useEspacio } from "./contexto";
import { archivosVisibles, carpetasOrdenadas, erroresDe, FILTROS, SECCIONES_NAV, textoTipoArchivo } from "./logica";
import type { FiltroArchivos, SeccionNav } from "./logica";

export interface EstadoExplorador {
  seccion: SeccionNav;
  carpeta: string | null;
  filtro: FiltroArchivos;
  vista: VistaArchivos;
  detalles: boolean;
  seleccion: string | null;
}

export interface ControlExplorador {
  estado: EstadoExplorador;
  cambiar: (parcial: Partial<EstadoExplorador>) => void;
  nuevaCarpeta: () => void;
}

/* ---------- Riel ---------------------------------------------------------------- */

export function Riel({ control }: { control: ControlExplorador }) {
  const { archivos, carpetas, respuestas, salud, verEquipo } = useEspacio();
  const { estado, cambiar } = control;
  const listos = archivos.filter((a) => a.estado === "listo").length;
  const cobertura = useMemo(() => coberturaCuadroMaestro(respuestas.map((r) => ({ archivo_id: r.archivo_id, destino_id: r.destino_id, mapa: r.mapa })), { salud }), [respuestas, salud]);
  return (
    <RielBase etiqueta="Navegación del programa" id="pc-riel" tour="pc-riel">
      <TituloRiel>Programa</TituloRiel>
      {SECCIONES_NAV.filter((n) => n.id !== "equipo" || verEquipo).map((n) => (
        <EntradaRiel
          key={n.id}
          icono={n.icono}
          actual={estado.seccion === n.id && !(n.id === "archivos" && estado.carpeta)}
          cuenta={n.id === "listos" ? listos : undefined}
          onClick={() => cambiar({ seccion: n.id, carpeta: null, filtro: "todos", seleccion: null })}
        >
          {n.etiqueta}
        </EntradaRiel>
      ))}
      <hr />
      <TituloRiel>Carpetas</TituloRiel>
      {carpetasOrdenadas(carpetas).map((c) => (
        <EntradaRiel key={c.id} icono="folder" actual={estado.seccion === "archivos" && estado.carpeta === c.id} onClick={() => cambiar({ seccion: "archivos", carpeta: c.id, filtro: "todos", seleccion: null })}>
          {c.nombre}
        </EntradaRiel>
      ))}
      <div className="pc-cover" data-tour="pc-cobertura">
        <Anillo pct={cobertura.pct} etiqueta="Cobertura del Cuadro Maestro del CNA" />
        <div>
          <b>Cuadro Maestro CNA</b>
          <span>{cobertura.pct} % de las columnas de los cuadros ya las responde el sistema o un archivo.</span>
        </div>
      </div>
    </RielBase>
  );
}

/* ---------- Migas y barra de comandos ---------------------------------------------- */

export function Migas({ control }: { control: ControlExplorador }) {
  const { pareja, carpetas } = useEspacio();
  const { estado, cambiar } = control;
  const nombres: Record<Exclude<SeccionNav, "archivos">, string> = { recientes: "Recientes", listos: "Listos para Planeación", plantillas: "Plantillas CNA y SNIES", equipo: "Equipo" };
  const carpeta = carpetas.find((c) => c.id === estado.carpeta);
  const raiz = () => cambiar({ seccion: "archivos", carpeta: null, seleccion: null });
  return (
    <MigasBase
      partes={[
        { texto: pareja.programa, onClick: raiz },
        ...(estado.seccion === "archivos" ? [{ texto: "Mis archivos", onClick: raiz }, ...(carpeta ? [{ texto: carpeta.nombre }] : [])] : [{ texto: nombres[estado.seccion] }]),
      ]}
    />
  );
}

export function Comandos({ control, onNuevo, onSubir }: { control: ControlExplorador; onNuevo: (caja: ReturnType<typeof cajaDe>) => void; onSubir: (caja: ReturnType<typeof cajaDe>) => void }) {
  const { editable, empezarRecorrido } = useEspacio();
  const { estado, cambiar } = control;
  const enRaiz = estado.seccion === "archivos" && !estado.carpeta;
  const muestraFiltros = estado.seccion !== "plantillas" && !enRaiz;
  return (
    <ComandosBase
      izquierda={
        <>
          <button type="button" className="es-btn es-btn--pri" data-tour="pc-nuevo" disabled={!editable} title={editable ? undefined : "Planeación solo observa"} onClick={(e) => onNuevo(cajaDe(e.currentTarget))}>
            <Icon name="plus" size={16} />
            Nuevo
          </button>
          <button type="button" className="es-btn" disabled={!editable} onClick={(e) => onSubir(cajaDe(e.currentTarget))}>
            <Icon name="upload" size={16} />
            Subir plantilla
          </button>
          {enRaiz && editable ? (
            <button type="button" className="es-btn" onClick={control.nuevaCarpeta}>
              <Icon name="folder" size={16} />
              Nueva carpeta
            </button>
          ) : null}
        </>
      }
      filtros={muestraFiltros ? { items: FILTROS, valor: estado.filtro, onCambiar: (id) => cambiar({ filtro: id as FiltroArchivos }) } : undefined}
      vista={estado.vista}
      onVista={(vista) => cambiar({ vista })}
      detalles={estado.detalles}
      onDetalles={(detalles) => cambiar({ detalles })}
      onRecorrido={() => empezarRecorrido("programas")}
    />
  );
}

/* ---------- Archivos ----------------------------------------------------------------- */

export function ZonaArchivos({ control, arriba, onPlantilla }: { control: ControlExplorador; arriba?: ReactNode; onPlantilla: (destino: string, caja: ReturnType<typeof cajaDe>) => void }) {
  const { archivos, carpetas, resumen, respuestas, editable, abrirEditor, abrirAsistente } = useEspacio();
  const { estado, cambiar } = control;
  const visibles = useMemo(() => archivosVisibles({ archivos, resumen, seccion: estado.seccion, carpeta: estado.carpeta, filtro: estado.filtro }), [archivos, resumen, estado.seccion, estado.carpeta, estado.filtro]);
  const respuestasDe = useMemo(() => {
    const m = new Map<string, typeof respuestas>();
    for (const r of respuestas) m.set(r.archivo_id, [...(m.get(r.archivo_id) ?? []), r]);
    return m;
  }, [respuestas]);

  const seleccionar = (id: string) => cambiar({ seleccion: id, detalles: estado.detalles || window.innerWidth > 1100 ? true : estado.detalles });

  let cuerpo;
  if (estado.seccion === "plantillas") {
    cuerpo = (
      <div className="es-tiles">
        {DESTINOS.map((d) => {
          const existentes = archivos.filter((a) => respuestasDe.get(a.id)?.some((r) => r.destino_id === d.id));
          const propio = archivos.find((a) => a.destino_origen === d.id);
          return (
            <div className="es-tile pc-tile--plantilla" key={d.id}>
              <div className="es-tile__nm">
                <span className="es-tag" data-s={d.sistema}>
                  {d.sistema}
                </span>
                <b>{d.sistema === "CNA" ? d.nombre : nombreCorto(d)}</b>
              </div>
              <span className="es-tile__sub">
                {d.columnas.length} columnas · {d.automatico ? d.automatico : existentes.length ? `lo responde: ${existentes.map((a) => a.nombre).join(", ")}` : "nadie lo responde todavía"}
              </span>
              <div className="pc-tagrow">
                {d.columnas.slice(0, 12).map((c) => (
                  <span className="es-tag" key={c.clave}>
                    {c.etiqueta}
                  </span>
                ))}
                {d.columnas.length > 12 ? <span className="es-tag">+{d.columnas.length - 12}</span> : null}
              </div>
              {d.automatico ? (
                <span className="es-est" data-e="listo" style={{ justifySelf: "start" }}>
                  <Icon name="check" size={12} />
                  Automático
                </span>
              ) : propio ? (
                <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} onClick={(e) => abrirEditor(propio.id, cajaDe(e.currentTarget))}>
                  <Icon name="pen" size={16} />
                  Abrir su archivo
                </button>
              ) : (
                <button type="button" className="es-btn es-btn--sm" style={{ justifySelf: "start" }} disabled={!editable} onClick={(e) => onPlantilla(d.id, cajaDe(e.currentTarget))}>
                  <Icon name="plus" size={16} />
                  Crear archivo para este destino
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  } else if (estado.seccion === "archivos" && !estado.carpeta) {
    cuerpo = (
      <Carpetas
        carpetas={carpetasOrdenadas(carpetas).map((c) => {
          const n = archivos.filter((a) => a.carpeta_id === c.id).length;
          return { id: c.id, nombre: c.nombre, subtitulo: `${c.subtitulo ? `${c.subtitulo} · ` : ""}${n} ${n === 1 ? "archivo" : "archivos"}` };
        })}
        onAbrir={(id) => cambiar({ carpeta: id, seleccion: null })}
      />
    );
  } else if (!visibles.length) {
    cuerpo = (
      <div className="es-empty">
        <b>No hay archivos aquí</b>
        <span>{estado.seccion === "listos" ? "Cuando un archivo se marque como listo, Planeación lo verá en esta vista." : "Cambie el filtro o cree un archivo nuevo."}</span>
        {editable && estado.seccion !== "listos" ? (
          <button type="button" className="es-btn es-btn--pri" onClick={(e) => abrirAsistente({ origen: cajaDe(e.currentTarget), carpeta: estado.carpeta ?? undefined })}>
            <Icon name="plus" size={16} />
            Nuevo archivo
          </button>
        ) : null}
      </div>
    );
  } else {
    cuerpo = (
      <Archivos
        vista={estado.vista}
        seleccion={estado.seleccion}
        onSeleccionar={seleccionar}
        onAbrir={abrirEditor}
        encabezadosLista={["Responde a", "Estado", "Modificado", "Filas"]}
        items={visibles.map((a) => {
          const rs = respuestasDe.get(a.id) ?? [];
          const filas = resumen.get(a.id)?.filas ?? 0;
          const estadoFicha = <FichaEstado estado={a.estado} errores={erroresDe(resumen, a.id)} />;
          return {
            id: a.id,
            nombre: a.nombre,
            tipo: a.tipo,
            columnas: a.columnas.length,
            subtitulo: (
              <>
                {textoTipoArchivo(a.tipo)} · {haceCuanto(a.updated_at)} · <span className="es-num">{filas}</span> filas
              </>
            ),
            estado: estadoFicha,
            sellos: <Sellos respuestas={rs} />,
            celdas: [rs.length ? <Sellos respuestas={rs} /> : <span className="es-note">Sin destino</span>, estadoFicha, haceCuanto(a.updated_at), <span className="es-num">{filas}</span>],
          };
        })}
      />
    );
  }

  return (
    <Zona clave={`${estado.seccion}|${estado.carpeta}|${estado.vista}`}>
      {editable ? null : (
        <div className="es-banner">
          <Icon name="eye" size={16} />
          Modo observador: Planeación puede ver los archivos del programa, pero no editarlos.
        </div>
      )}
      {arriba}
      {cuerpo}
    </Zona>
  );
}
