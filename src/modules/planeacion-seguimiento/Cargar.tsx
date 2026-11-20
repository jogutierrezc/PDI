/* =============================================================================
   Planeación y Seguimiento · «Cargar la planificación»: asistente de 4 pasos, a
   pantalla completa.
     1 Descargar la plantilla / elegir el archivo
     2 Revisar lo leído (vista previa con totales)
     3 Corregir (problemas por hoja, fila y columna; las filas con error no se importan)
     4 Crear la versión borrador v1.0 del plan
   El archivo se lee en el navegador; no sale a ningún servidor hasta el paso 4.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCampus, useCargarPlanificacion, useConfigPlan, useOficinas, type ErrorCarga } from "./api";
import { aniosDe } from "./modelo";
import { useAct } from "./actividades/hooks";
import { resumir } from "./calculos";
import { usePs } from "./contexto";
import { dondeEsta, importarArchivo, lineasListas, MAX_BYTES, MAX_LINEAS, problemasDe, type LineaLeida, type Problema, type ResultadoImportacion } from "./importar";
import { FormularioPasos, type ErrorCampo } from "./marco/FormularioPasos";
import { PaginaCompleta } from "./marco/PaginaCompleta";
import { ListaBarras, Nota } from "./partes";
import { descargarPlantilla } from "./plantilla";
import { entero, millones, millones1, puedeAdministrar, rotuloCampus } from "./modelo";
import { Icon } from "../../components/ui/Icon";

const PASOS = ["archivo", "revisar", "corregir", "crear"] as const;
const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;

function ListaProblemas({ lineas, generales }: { lineas: LineaLeida[]; generales: Problema[] }) {
  const conProblemas = lineas.filter((l) => l.problemas.length);
  return (
    <div className="ps-problemas">
      {generales.length ? (
        <section>
          <h3>Del libro entero</h3>
          <ul>{generales.map((p, i) => <li key={i} data-nivel={p.nivel}><b>{p.nivel === "error" ? "Por corregir" : "Aviso"}</b> <span className="ps-donde">{dondeEsta(p)}.</span> {p.mensaje}</li>)}</ul>
        </section>
      ) : null}
      {conProblemas.map((l) => {
        const err = l.problemas.some((p) => p.nivel === "error");
        return (
          <section key={l.fila} data-nivel={err ? "error" : "aviso"}>
            <h3>
              <span className="ps-estado" data-tono={err ? "mal" : "pend"}><b aria-hidden="true">{err ? "▲" : "◆"}</b>{err ? "No se importa" : "Se importa con aviso"}</span>
              Fila {l.fila}{l.nombre ? ` · ${l.nombre.length > 70 ? `${l.nombre.slice(0, 70)}…` : l.nombre}` : ""}
            </h3>
            <ul>{l.problemas.map((p, i) => <li key={i} data-nivel={p.nivel}><span className="ps-donde">Columna «{p.columna}».</span> {p.mensaje}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}

export function Cargar() {
  const { nivel, plan, ruta, ir } = usePs();
  const [params, setParams] = useSearchParams();
  const campus = useCampus();
  const oficinas = useOficinas();
  const cfgQ = useConfigPlan(plan?.id ?? null);
  const act = useAct();
  // Contrato F3B §6.4: carga el administrador, o el gestor de la oficina dueña de un plan de alcance «oficina».
  const administraElPlan = puedeAdministrar(nivel) || (nivel === "gestor" && plan?.alcance === "oficina" && Boolean(plan.oficina) && act.oficinas.some((o) => o.id === plan.oficina!.id && o.poder === "gestor"));
  const cargar = useCargarPlanificacion();
  const [archivo, setArchivo] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [errorBajada, setErrorBajada] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [erroresBD, setErroresBD] = useState<ErrorCarga[] | null>(null);
  const [hecho, setHecho] = useState<{ etiqueta: string; n: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("resumen") }, { texto: "Cargar la planificación" }];

  const listas = useMemo(() => (resultado && !resultado.error ? lineasListas(resultado) : []), [resultado]);
  const filasListas = useMemo(() => (resultado ? resultado.lineas.filter((l) => l.linea).map((l) => l.fila) : []), [resultado]);
  const malas = resultado ? resultado.lineas.filter((l) => !l.linea).length : 0;
  const avisos = resultado ? problemasDe(resultado).filter((p) => p.nivel === "aviso").length : 0;
  const nombresCampus = campus.data;
  const nombresOficinas = useMemo(() => oficinas.data?.map((o) => o.nombre), [oficinas.data]);

  if (!administraElPlan) {
    return <PaginaCompleta titulo="Cargar la planificación" migas={migas} regresarA={ruta("resumen")}><p className="ps-aviso"><Icon name="lock" size={16} /> Carga la planificación el administrador de planeación o, en un plan de oficina, el gestor de esa oficina.</p></PaginaCompleta>;
  }
  if (!plan) {
    return (
      <PaginaCompleta titulo="Cargar la planificación" migas={migas} regresarA={ruta("resumen")}>
        <p className="ps-aviso"><Icon name="info" size={16} /> Primero hay que crear el plan (su nombre y años).</p>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(ruta("crear"), { reemplazar: true })}>Crear plan</button></div>
      </PaginaCompleta>
    );
  }
  if (!plan.oficina) {
    return (
      <PaginaCompleta titulo="Cargar la planificación" migas={migas} regresarA={ruta("resumen")}>
        <p className="ps-aviso"><Icon name="info" size={16} /> El plan «{plan.nombre}» aún no tiene oficina dueña. Hace falta antes de cargar: las líneas sin oficina propia heredan la del plan.</p>
        {nivel === "admin" ? <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(ruta("plan-editar", plan.id))}>Asignar la oficina del plan</button></div> : <p className="ps-nota">Se lo pide al administrador de planeación.</p>}
      </PaginaCompleta>
    );
  }
  if (plan.version?.vigente) {
    return (
      <PaginaCompleta titulo="Cargar la planificación" migas={migas} regresarA={ruta("resumen")}>
        <p className="ps-aviso"><Icon name="info" size={16} /> El plan «{plan.nombre}» ya tiene una versión vigente ({plan.version.etiqueta}). Cambiarlo se hace por solicitud de cambio, que llega en la fase 4: una versión publicada no se reemplaza con un archivo.</p>
      </PaginaCompleta>
    );
  }
  if (hecho) {
    return (
      <PaginaCompleta titulo={`Se creó la versión ${hecho.etiqueta} (borrador)`} migas={migas} regresarA={ruta("resumen")} regresarTexto="Regresar al resumen" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> Se cargaron {plural(hecho.n, "línea", "líneas")} en el plan «{plan.nombre}». Es un borrador: no es oficial hasta que el administrador lo publique.</p>
        <div className="ps-botones">
          <button type="button" className="button-primary" onClick={() => ir(ruta("resumen"))}>Ver el resumen</button>
          <button type="button" className="button-secondary" onClick={() => ir(ruta("calidad"))}>Revisar la calidad de datos</button>
          <button type="button" className="button-secondary" onClick={() => ir(ruta("versiones"))}>Ir a versiones para publicar</button>
        </div>
      </PaginaCompleta>
    );
  }

  const pasoParam = params.get("paso") ?? "archivo";
  const paso = resultado && !resultado.error && (PASOS as readonly string[]).includes(pasoParam) ? pasoParam : "archivo";
  const irAPaso = (id: string) => {
    const s = new URLSearchParams(params);
    if (id === "archivo") s.delete("paso");
    else s.set("paso", id);
    setParams(s);
  };

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setLeyendo(true);
    setAcepto(false);
    setErroresBD(null);
    setArchivo(f.name);
    const r = await importarArchivo(f, { oficinas: nombresOficinas, campus: nombresCampus, config: cfgQ.data ?? null, anios: plan ? aniosDe(plan.anioIni, plan.anioFin) : undefined });
    setResultado(r);
    setLeyendo(false);
    if (entrada.current) entrada.current.value = "";
  };
  const bajar = async () => {
    setBajando(true);
    setErrorBajada(null);
    try {
      await descargarPlantilla({ plan: plan.nombre, planId: plan.id, oficinas: nombresOficinas, campus: nombresCampus, config: cfgQ.data ?? null, anios: aniosDe(plan.anioIni, plan.anioFin), oficinaDuena: plan.oficina?.nombre ?? null });
    } catch {
      setErrorBajada("No se pudo armar la plantilla. Vuelva a intentarlo.");
    }
    setBajando(false);
  };

  const selector = (
    <div className="ps-archivo">
      <input ref={entrada} id="cargar-archivo" className="ps-archivo__input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void elegir(e.target.files?.[0])} />
      <label htmlFor="cargar-archivo" className="button-secondary"><Icon name="upload" size={16} /> {resultado ? "Elegir otro archivo" : "Elegir el archivo"}</label>
      <span className="ps-archivo__nombre" role="status" aria-live="polite">{leyendo ? "Leyendo el archivo…" : archivo ? `Archivo: ${archivo}` : "Ningún archivo elegido"}</span>
    </div>
  );

  const hayPorCorregir = malas > 0;
  const r = resumir(listas);
  const sumaListas = listas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const traer = (e: ErrorCarga) => {
    const i = (e.fila ?? 0) - 1;
    return { ...e, filaLibro: i >= 0 ? filasListas[i] : null };
  };

  return (
    <FormularioPasos
      titulo="Cargar la planificación"
      subtitulo={`Plan «${plan.nombre}». Cuatro pasos: el archivo se lee en su navegador y nada sale de él hasta el último.`}
      migas={migas}
      regresarA={ruta("resumen")}
      paso={paso}
      onPaso={irAPaso}
      etiquetaEnviar={`Crear la versión borrador`}
      enviando={cargar.isPending}
      errorEnvio={cargar.error ? (cargar.error as Error).message : null}
      onEnviar={async () => {
        setErroresBD(null);
        const res = await cargar.mutateAsync({ planId: plan.id, lineas: listas, nombreArchivo: archivo });
        if (res.errores.length || !res.versionId) {
          setErroresBD(res.errores.length ? res.errores : [{ fila: null, campo: "plan", mensaje: "La base no creó la versión." }]);
          return;
        }
        setHecho({ etiqueta: res.etiqueta ?? "v1.0", n: res.aceptadas });
      }}
      pasos={[
        {
          id: "archivo",
          titulo: "Descargar la plantilla y elegir el archivo",
          descripcion: "Baje la plantilla, llénela con las líneas del plan y elíjala aquí.",
          bloqueado: !resultado || Boolean(resultado.error) || leyendo,
          etiquetaSiguiente: "Revisar lo leído",
          contenido: (
            <div className="ps-bloques">
              <section className="ps-bloque">
                <h3>1. La plantilla</h3>
                <p>Trae las instrucciones campo por campo, listas desplegables (campus, pilar, prioridad, fuente, oficina) y colores: <strong>amarillo</strong> es obligatorio, <strong>azul claro</strong> es opcional y <strong>gris</strong> no se toca. Las dos primeras filas son ejemplos y no se importan.</p>
                <button type="button" className="button-secondary" onClick={bajar} disabled={bajando || campus.isPending || oficinas.isPending} aria-busy={bajando || undefined}><Icon name="download" size={16} /> {bajando ? "Armando la plantilla…" : "Descargar la plantilla de Excel"}</button>
                {errorBajada ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {errorBajada}</p> : null}
              </section>
              <section className="ps-bloque">
                <h3>2. Su archivo</h3>
                <p>Libro de Excel (.xlsx) de hasta {MAX_BYTES / 1048576} MB y {MAX_LINEAS} líneas. Las fórmulas se ignoran. El archivo no sale de su navegador hasta el último paso.</p>
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
          etiquetaSiguiente: hayPorCorregir || avisos ? "Ver qué corregir" : "Seguir",
          bloqueado: listas.length === 0,
          contenido: (
            <>
              <dl className="ps-kpis ps-kpis--chico">
                <div><dt>Líneas listas</dt><dd>{entero(listas.length)}</dd></div>
                <div><dt>Con errores</dt><dd>{entero(malas)}</dd><dd className="ps-kpis__s">no se importan</dd></div>
                <div><dt>Inversión total</dt><dd>{millones(sumaListas)}</dd></div>
                <div><dt>Evaluadas</dt><dd>{r.evaluados}<small> / {r.n}</small></dd></div>
              </dl>
              {listas.length === 0 ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> No hay ninguna línea lista para importar. Vea el paso siguiente para corregir.</p> : null}
              <div className="ps-dos">
                <section className="ps-bloque"><h3>Por campus</h3><ListaBarras filas={r.porCampus.map((c) => ({ ...c, etiqueta: rotuloCampus(c.clave) }))} /></section>
                <section className="ps-bloque"><h3>Por prioridad</h3><ListaBarras filas={r.porPrioridad} /></section>
              </div>
              <section className="ps-bloque">
                <h3>Vista previa</h3>
                <div className="ps-tabla-simple ps-previa" role="table" aria-label="Primeras líneas leídas">
                  <div role="row" className="ps-tabla-simple__cab"><span role="columnheader">N.º</span><span role="columnheader">Nombre</span><span role="columnheader">Campus</span><span role="columnheader" className="ps-der">Monto</span></div>
                  {listas.slice(0, 8).map((l) => (
                    <div role="row" key={l.no}><span role="cell">#{l.no}</span><span role="cell">{l.nombre}</span><span role="cell">{rotuloCampus(l.campus)}</span><span role="cell" className="ps-der">{l.monto === null ? "Sin monto" : millones1(l.monto)}</span></div>
                  ))}
                </div>
                {listas.length > 8 ? <Nota>y {entero(listas.length - 8)} líneas más.</Nota> : null}
              </section>
              {resultado && resultado.ejemplosIgnorados ? <Nota>Se ignoraron {resultado.ejemplosIgnorados} filas de ejemplo.</Nota> : null}
            </>
          ),
        },
        {
          id: "corregir",
          titulo: "Corregir",
          descripcion: "Los problemas, por hoja, fila y columna, con cómo arreglarlos. Las filas con error no se importan; no se inventa ni se rellena ningún dato.",
          bloqueado: listas.length === 0,
          validar: (): ErrorCampo[] => (hayPorCorregir && !acepto ? [{ campo: "cargar-acepto", mensaje: `Confirme que entiende que ${plural(malas, "fila con error no se importa", "filas con error no se importan")}.` }] : []),
          contenido: (
            <>
              {resultado && problemasDe(resultado).length === 0 ? (
                <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> Nada que corregir: todas las líneas están en orden.</p>
              ) : resultado ? (
                <>
                  <p className="ps-sub">{plural(malas, "fila con error", "filas con error")} y {plural(avisos, "aviso", "avisos")}. Para corregir, abra su archivo, arregle esas celdas, guárdelo y elíjalo de nuevo.</p>
                  <div className="ps-botones">{selector}</div>
                  <ListaProblemas lineas={resultado.lineas} generales={resultado.generales} />
                </>
              ) : null}
              {hayPorCorregir ? (
                <div className="ps-campo" data-error={undefined}>
                  <label className="ps-opcion ps-opcion--grande">
                    <input id="cargar-acepto" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                    <span>Entiendo que {plural(malas, "fila con error no se importa", "filas con error no se importan")} y sigo con las {plural(listas.length, "línea lista", "líneas listas")}.</span>
                  </label>
                </div>
              ) : null}
            </>
          ),
        },
        {
          id: "crear",
          titulo: `Crear la versión borrador`,
          descripcion: "Es el único paso que envía datos. Queda como borrador: no es oficial hasta publicarlo.",
          contenido: (
            <>
              <dl className="ps-ficha">
                <div><dt>Plan</dt><dd>{plan.nombre}</dd></div>
                <div><dt>Archivo</dt><dd>{archivo}</dd></div>
                <div><dt>Líneas que se crean</dt><dd>{entero(listas.length)}{hayPorCorregir ? ` (${plural(malas, "fila con error queda fuera", "filas con error quedan fuera")})` : ""}</dd></div>
                <div><dt>Inversión total</dt><dd>{millones(sumaListas)}</dd></div>
              </dl>
              {plan.version?.estado === "borrador" ? <p className="ps-aviso"><Icon name="alert" size={16} /> El plan ya tiene el borrador {plan.version.etiqueta} sin publicar: se reemplaza por completo con este archivo.</p> : null}
              {erroresBD ? (
                <div className="ps-aviso ps-aviso--error" role="alert">
                  <Icon name="alert" size={16} />
                  <div>
                    <strong>La base de datos no aceptó la carga y no se creó nada.</strong>
                    <ul className="ps-lista-errores">
                      {erroresBD.slice(0, 30).map(traer).map((e, i) => <li key={i}>{e.filaLibro ? `Fila ${e.filaLibro} del libro` : "Del plan"}{e.campo ? `, ${e.campo}` : ""}: {e.mensaje}</li>)}
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
