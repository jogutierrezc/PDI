/* =============================================================================
   Planeación y Seguimiento · Fase 2 · «Importar la planificación de la oficina desde Excel»:
   asistente de 4 pasos a pantalla completa, igual que «Cargar la planificación».
     1 Descargar la plantilla / elegir el archivo
     2 Revisar lo leído
     3 Corregir (problemas por hoja, fila y columna; las filas con error no se importan)
     4 Crear las actividades (todo o nada contra la base)
   El archivo se lee en el navegador; no sale a ningún servidor hasta el paso 4.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { LoadingBlock } from "../../../components/ui/QueryState";
import { useCampus } from "../api";
import { usePs } from "../contexto";
import { dondeEsta, leerLibro, ErrorImportacion, type Problema } from "../importar";
import { MAX_BYTES } from "../columnas";
import { FormularioPasos, type ErrorCampo } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { CAMPUS_TODOS, entero, fecha, rotuloCampus } from "../modelo";
import { MAX_ACTIVIDADES } from "./columnasAct";
import { actividadesListas, analizarActividades, problemasDeActividades, type ActividadLeida, type ResultadoActividades } from "./importarAct";
import { useAct, useCargarActividades, useEquipo, useLineasOficina, useOficinaActual } from "./hooks";
import { Banner, SelectorOficina, VistaPreviaAvisos } from "./partes";
import { descargarPlantillaActividades } from "./plantillaAct";
import { avisoAsignacion, puedeImportar } from "./reglas";
import { SinOficinas } from "./vacios";

const PASOS = ["archivo", "revisar", "corregir", "crear"] as const;
const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;

/** Lee y analiza el archivo. No lanza: el motivo va en `error`. */
export async function importarActividadesArchivo(origen: File | ArrayBuffer | Uint8Array, op: Parameters<typeof analizarActividades>[1]): Promise<ResultadoActividades> {
  try {
    return analizarActividades(await leerLibro(origen), op);
  } catch (e) {
    return { error: e instanceof ErrorImportacion ? e.message : "No pude leer el archivo. Ábralo en Excel, guárdelo de nuevo como .xlsx y vuelva a intentarlo.", origen: null, oficinaDelArchivo: null, filas: [], generales: [], ejemplosIgnorados: 0, formulasIgnoradas: 0 };
  }
}

function ListaProblemas({ filas, generales }: { filas: ActividadLeida[]; generales: Problema[] }) {
  const con = filas.filter((f) => f.problemas.length);
  return (
    <div className="ps-problemas">
      {generales.length ? (
        <section>
          <h3>Del libro entero</h3>
          <ul>{generales.map((p, i) => <li key={i} data-nivel={p.nivel}><b>{p.nivel === "error" ? "Por corregir" : "Aviso"}</b> <span className="ps-donde">{dondeEsta(p)}.</span> {p.mensaje}</li>)}</ul>
        </section>
      ) : null}
      {con.map((f) => {
        const err = f.problemas.some((p) => p.nivel === "error");
        return (
          <section key={f.fila} data-nivel={err ? "error" : "aviso"}>
            <h3>
              <span className="ps-estado" data-tono={err ? "mal" : "pend"}><Icon name="alert" size={12} />{err ? "No se importa" : "Se importa con aviso"}</span>
              Fila {f.fila}{f.titulo ? ` · ${f.titulo.length > 70 ? `${f.titulo.slice(0, 70)}…` : f.titulo}` : ""}
            </h3>
            <ul>{f.problemas.map((p, i) => <li key={i} data-nivel={p.nivel}><span className="ps-donde">Columna «{p.columna}».</span> {p.mensaje}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}

export function ImportarActividades() {
  const { ruta, plan, ir } = usePs();
  const [params, setParams] = useSearchParams();
  const act = useAct();
  const { oficina, oficinas, elegir } = useOficinaActual();
  const id = oficina?.id ?? null;
  const campusQ = useCampus();
  const lineasQ = useLineasOficina(id);
  const equipoQ = useEquipo(id);
  const cargar = useCargarActividades();
  const [archivo, setArchivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoActividades | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [errorBajada, setErrorBajada] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [erroresBD, setErroresBD] = useState<{ fila: number | null; campo: string; mensaje: string }[] | null>(null);
  const [hecho, setHecho] = useState<{ n: number; avisos: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Importar la planificación" }];
  const volver = `${ruta("planificacion")}${id ? `?oficina=${encodeURIComponent(id)}` : ""}`;

  const campus = useMemo(() => [...(campusQ.data ?? []), CAMPUS_TODOS], [campusQ.data]);
  const lineas = useMemo(() => (lineasQ.data ?? []).map((l) => ({ no: l.no, nombre: l.nombre })), [lineasQ.data]);
  const equipo = useMemo(() => equipoQ.data ?? [], [equipoQ.data]);
  const listas = useMemo(() => (resultado && !resultado.error ? actividadesListas(resultado) : []), [resultado]);
  const filasListas = useMemo(() => (resultado ? resultado.filas.filter((f) => f.datos).map((f) => f.fila) : []), [resultado]);
  const malas = resultado ? resultado.filas.filter((f) => !f.datos).length : 0;
  const avisosN = resultado ? problemasDeActividades(resultado).filter((p) => p.nivel === "aviso").length : 0;

  if (act.cargando) return <PaginaCompleta titulo="Importar la planificación" migas={migas} regresarA={ruta("planificacion")}><LoadingBlock rows={3} label="Preparando" /></PaginaCompleta>;
  if (!oficina) return <PaginaCompleta titulo="Importar la planificación" migas={migas} regresarA={ruta("planificacion")}><SinOficinas /></PaginaCompleta>;
  if (!puedeImportar(oficina.poder)) {
    return <PaginaCompleta titulo="Importar la planificación" migas={migas} regresarA={volver}><Banner><Icon name="lock" size={14} /> Solo el gestor de la oficina importa su planificación. En {oficina.nombre} usted tiene acceso de {oficina.poder}.</Banner></PaginaCompleta>;
  }
  if (hecho) {
    return (
      <PaginaCompleta titulo={`Se crearon ${plural(hecho.n, "actividad", "actividades")}`} migas={migas} regresarA={volver} regresarTexto="Regresar a la planificación" claveFoco="hecho">
        <Banner tipo="ok" rol="status">Las actividades de {oficina.nombre} quedaron creadas en «Por iniciar».{hecho.avisos ? ` Se avisará a ${plural(hecho.avisos, "persona", "personas")} por correo.` : ""}</Banner>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(volver)}>Ver la planificación</button>
          <button type="button" className="button-secondary" onClick={() => ir(`${ruta("tablero")}?oficina=${encodeURIComponent(oficina.id)}`)}>Abrir el tablero</button>
          <button type="button" className="button-secondary" onClick={() => ir(`${ruta("asignar")}?oficina=${encodeURIComponent(oficina.id)}`)}>Asignar las que quedaron sin responsable</button>
        </div>
      </PaginaCompleta>
    );
  }

  const opciones = { oficinaId: oficina.id, oficinaNombre: oficina.nombre, lineas, equipo, campus };
  const pasoParam = params.get("paso") ?? "archivo";
  const paso = resultado && !resultado.error && (PASOS as readonly string[]).includes(pasoParam) ? pasoParam : "archivo";
  const irAPaso = (p: string) => {
    const s = new URLSearchParams(params);
    if (p === "archivo") s.delete("paso");
    else s.set("paso", p);
    setParams(s);
  };
  const datosListos = !lineasQ.isPending && !equipoQ.isPending && !campusQ.isPending;
  const elegirArchivo = async (f: File | undefined) => {
    if (!f) return;
    setLeyendo(true);
    setAcepto(false);
    setErroresBD(null);
    setArchivo(f.name);
    setResultado(await importarActividadesArchivo(f, opciones));
    setLeyendo(false);
    if (entrada.current) entrada.current.value = "";
  };
  const bajar = async () => {
    setBajando(true);
    setErrorBajada(null);
    try {
      await descargarPlantillaActividades({ oficina: { id: oficina.id, nombre: oficina.nombre }, equipo, lineas, campus: campus.filter((c) => c !== CAMPUS_TODOS), plan: plan?.nombre });
    } catch {
      setErrorBajada("No se pudo armar la plantilla. Vuelva a intentarlo.");
    }
    setBajando(false);
  };
  const selector = (
    <div className="ps-archivo">
      <input ref={entrada} id="imp-archivo" className="ps-archivo__input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void elegirArchivo(e.target.files?.[0])} disabled={!datosListos} />
      <label htmlFor="imp-archivo" className="button-secondary"><Icon name="upload" size={16} /> {resultado ? "Elegir otro archivo" : "Elegir el archivo"}</label>
      <span className="ps-archivo__nombre" role="status" aria-live="polite">{leyendo ? "Leyendo el archivo…" : archivo ? `Archivo: ${archivo}` : "Ningún archivo elegido"}</span>
    </div>
  );
  const hayPorCorregir = malas > 0;
  const avisosCorreo = avisoAsignacion([...new Set(listas.flatMap((d) => d.asignados))], equipo, act.yo);
  const traer = (e: { fila: number | null; campo: string; mensaje: string }) => ({ ...e, filaLibro: e.fila && e.fila > 0 ? filasListas[e.fila - 1] : null });

  return (
    <FormularioPasos
      titulo="Importar la planificación de la oficina"
      subtitulo={<>Cuatro pasos para crear de una vez las actividades de <strong>{oficina.nombre}</strong>. El archivo se lee en su navegador y nada sale de él hasta el último paso.</>}
      migas={migas}
      regresarA={volver}
      paso={paso}
      onPaso={irAPaso}
      etiquetaEnviar={`Crear ${plural(listas.length, "actividad", "actividades")}`}
      enviando={cargar.isPending}
      errorEnvio={cargar.error ? (cargar.error as Error).message : null}
      onEnviar={async () => {
        setErroresBD(null);
        const res = await cargar.mutateAsync({ oficinaId: oficina.id, filas: listas, archivo });
        if (res.errores.length || res.creadas === 0) {
          setErroresBD(res.errores.length ? res.errores : [{ fila: null, campo: "carga", mensaje: "La base no creó ninguna actividad." }]);
          return;
        }
        setHecho({ n: res.creadas, avisos: res.avisara.length });
      }}
      pasos={[
        {
          id: "archivo",
          titulo: "Descargar la plantilla y elegir el archivo",
          descripcion: "Baje la plantilla de su oficina, llénela y elíjala aquí.",
          bloqueado: !resultado || Boolean(resultado.error) || leyendo,
          etiquetaSiguiente: "Revisar lo leído",
          contenido: (
            <div className="ps-bloques">
              {oficinas.length > 1 ? <section className="ps-bloque"><h3>0. La oficina</h3><SelectorOficina oficinas={oficinas.filter((o) => puedeImportar(o.poder))} valor={oficina.id} onElegir={(x) => { elegir(x); setResultado(null); setArchivo(""); }} /><p className="ps-nota">La plantilla lleva las líneas y los correos de esta oficina en sus listas desplegables.</p></section> : null}
              <section className="ps-bloque">
                <h3>1. La plantilla</h3>
                <p>Trae las instrucciones columna por columna, listas desplegables (línea del plan, responsable por correo, prioridad, campus) y colores: <strong>amarillo</strong> es obligatorio, <strong>azul claro</strong> es opcional y <strong>gris</strong> no se toca. Las dos primeras filas son ejemplos y no se importan.</p>
                <button type="button" className="button-secondary" onClick={bajar} disabled={bajando || !datosListos} aria-busy={bajando || undefined}><Icon name="download" size={16} /> {bajando ? "Armando la plantilla…" : "Descargar la plantilla de Excel"}</button>
                {errorBajada ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {errorBajada}</p> : null}
              </section>
              <section className="ps-bloque">
                <h3>2. Su archivo</h3>
                <p>Libro de Excel (.xlsx) de hasta {MAX_BYTES / 1048576} MB y {MAX_ACTIVIDADES} actividades. Las fórmulas se ignoran. Un gestor solo asigna a personas de su oficina: los responsables se identifican por su correo.</p>
                {selector}
                {resultado?.error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {resultado.error}</p> : null}
              </section>
            </div>
          ),
        },
        {
          id: "revisar",
          titulo: "Revisar lo leído",
          descripcion: "Esto es lo que encontró el portal en su archivo. Aún no se ha creado nada.",
          etiquetaSiguiente: hayPorCorregir || avisosN ? "Ver qué corregir" : "Seguir",
          bloqueado: listas.length === 0,
          contenido: (
            <>
              <dl className="ps-kpis ps-kpis--chico">
                <div><dt>Actividades listas</dt><dd>{entero(listas.length)}</dd></div>
                <div><dt>Con errores</dt><dd>{entero(malas)}</dd><dd className="ps-kpis__s">no se importan</dd></div>
                <div><dt>Sin responsable</dt><dd>{entero(listas.filter((d) => !d.asignados.length).length)}</dd><dd className="ps-kpis__s">se asignan después</dd></div>
                <div><dt>Hitos</dt><dd>{entero(listas.filter((d) => d.esHito).length)}</dd></div>
              </dl>
              {listas.length === 0 ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> No hay ninguna actividad lista para importar. Vea el paso siguiente para corregir.</p> : null}
              <section className="ps-bloque">
                <h3>Vista previa</h3>
                <div className="ps-tabla-simple ps-previa ps-previa--act" role="table" aria-label="Primeras actividades leídas">
                  <div role="row" className="ps-tabla-simple__cab"><span role="columnheader">Actividad</span><span role="columnheader">Línea</span><span role="columnheader">Fecha de fin</span><span role="columnheader">Responsables</span></div>
                  {listas.slice(0, 8).map((d, i) => (
                    <div role="row" key={i}>
                      <span role="cell">{d.titulo}</span>
                      <span role="cell">{d.lineaNo ? `#${d.lineaNo}` : "Propia"}</span>
                      <span role="cell">{fecha(d.fin)}</span>
                      <span role="cell">{d.asignados.length ? d.asignados.map((x) => equipo.find((m) => m.id === x)?.nombre ?? "").join(", ") : "Sin responsable"}</span>
                    </div>
                  ))}
                </div>
                {listas.length > 8 ? <p className="ps-nota">y {entero(listas.length - 8)} actividades más.</p> : null}
              </section>
              {resultado && resultado.ejemplosIgnorados ? <p className="ps-nota">Se ignoraron {resultado.ejemplosIgnorados} filas de ejemplo.</p> : null}
            </>
          ),
        },
        {
          id: "corregir",
          titulo: "Corregir",
          descripcion: "Los problemas, por hoja, fila y columna, con cómo arreglarlos. Las filas con error no se importan; no se inventa ni se rellena ningún dato.",
          bloqueado: listas.length === 0,
          validar: (): ErrorCampo[] => (hayPorCorregir && !acepto ? [{ campo: "imp-acepto", mensaje: `Confirme que entiende que ${plural(malas, "fila con error no se importa", "filas con error no se importan")}.` }] : []),
          contenido: (
            <>
              {resultado && problemasDeActividades(resultado).length === 0 ? (
                <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> Nada que corregir: todas las filas están en orden.</p>
              ) : resultado ? (
                <>
                  <p className="ps-sub">{plural(malas, "fila con error", "filas con error")} y {plural(avisosN, "aviso", "avisos")}. Para corregir, abra su archivo, arregle esas celdas, guárdelo y elíjalo de nuevo.</p>
                  <div className="ps-botones">{selector}</div>
                  <ListaProblemas filas={resultado.filas} generales={resultado.generales} />
                </>
              ) : null}
              {hayPorCorregir ? (
                <div className="ps-campo">
                  <label className="ps-opcion ps-opcion--grande">
                    <input id="imp-acepto" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                    <span>Entiendo que {plural(malas, "fila con error no se importa", "filas con error no se importan")} y sigo con {plural(listas.length, "actividad lista", "actividades listas")}.</span>
                  </label>
                </div>
              ) : null}
            </>
          ),
        },
        {
          id: "crear",
          titulo: "Crear las actividades",
          descripcion: "Es el único paso que envía datos. Todo o nada: si la base rechaza una, no se crea ninguna.",
          contenido: (
            <>
              <dl className="ps-ficha">
                <div><dt>Oficina</dt><dd>{oficina.nombre}</dd></div>
                <div><dt>Archivo</dt><dd>{archivo}</dd></div>
                <div><dt>Actividades que se crean</dt><dd>{entero(listas.length)}{hayPorCorregir ? ` (${plural(malas, "fila con error queda fuera", "filas con error quedan fuera")})` : ""}</dd></div>
                <div><dt>Campus</dt><dd>{[...new Set(listas.map((d) => rotuloCampus(d.campus)))].join(", ")}</dd></div>
              </dl>
              <VistaPreviaAvisos avisos={avisosCorreo} que="ninguna actividad trae responsable." />
              {erroresBD ? (
                <div className="ps-aviso ps-aviso--error" role="alert">
                  <Icon name="alert" size={16} />
                  <div>
                    <strong>La base de datos no aceptó la carga y no se creó nada.</strong>
                    <ul className="ps-lista-errores">
                      {erroresBD.slice(0, 30).map(traer).map((e, i) => <li key={i}>{e.filaLibro ? `Fila ${e.filaLibro} del libro` : "De la carga"}{e.campo ? `, ${e.campo}` : ""}: {e.mensaje}</li>)}
                    </ul>
                    {erroresBD.length > 30 ? <p>y {erroresBD.length - 30} más.</p> : null}
                    <p>Corrija esas celdas, guarde el archivo y elíjalo de nuevo en el paso 1.</p>
                  </div>
                </div>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}
