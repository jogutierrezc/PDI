/* =============================================================================
   Planeación y Seguimiento · VAF · CARGA POR EXCEL de la financiación por línea o de la ejecución presupuestal
   (`vaf-cargar/<plan>?tipo=financiacion|ejecucion`), a pantalla completa y por pasos:
     1 Plantilla y archivo  ·  2 Lo que se leyó y los problemas por fila y columna  ·  3 Confirmar y cargar.
   Todo o nada: con un solo error (aquí o en la base) no se carga ninguna fila. Solo la VAF y el administrador.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { usePs } from "../contexto";
import { FormularioPasos } from "../marco/FormularioPasos";
import { PaginaCompleta } from "../marco/PaginaCompleta";
import { dondeEsta, leerLibro, ErrorImportacion, type HojaCruda } from "../importar";
import { useVafOps } from "./hooksVaf";
import type { ErrorCargaVaf, FilaFinanciacion, FilaMov } from "./contratoVaf";
import { MAX_FILAS_VAF, analizarEjecucion, analizarFinanciacion, descargarPlantillaVaf, problemasVaf, type ResultadoVaf, type TipoCargaVaf } from "./excelVaf";
import { ROTULO_FINANCIACION, ROTULO_MOV, esFinanciero } from "./modeloVaf";
import { Pesos } from "./partesVaf";

const PASOS = ["archivo", "leido", "confirmar"] as const;

export function CargarVaf({ id }: { id: string }) {
  const { ruta, ir, plan, lineas, nivel } = usePs();
  const [params, setParams] = useSearchParams();
  const tipo: TipoCargaVaf = params.get("tipo") === "ejecucion" ? "ejecucion" : "financiacion";
  const ops = useVafOps();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [hojas, setHojas] = useState<HojaCruda[] | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [errorBajada, setErrorBajada] = useState<string | null>(null);
  const [erroresBD, setErroresBD] = useState<ErrorCargaVaf[] | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [hecho, setHecho] = useState<number | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const volver = `${ruta("financiacion")}?pestana=presupuesto`;
  const rotulo = tipo === "financiacion" ? "la financiación por línea" : "la ejecución presupuestal";
  const migas = [{ texto: "Planeación y Seguimiento", a: ruta("planificacion") }, { texto: "Financiación y presupuesto", a: volver }, { texto: "Cargar desde Excel" }];
  const op = useMemo(() => ({ planId: id, planNombre: plan?.nombre ?? "el plan", lineas: lineas.map((l) => ({ no: l.no, nombre: l.nombre })), anioIni: plan?.anioIni ?? 2027, anioFin: plan?.anioFin ?? 2035, hoy }), [id, plan, lineas, hoy]);
  const resultado = useMemo(() => (hojas ? (tipo === "financiacion" ? analizarFinanciacion(hojas, op) : analizarEjecucion(hojas, op)) : null), [hojas, tipo, op]) as ResultadoVaf<FilaFinanciacion | FilaMov> | null;
  const listas = useMemo(() => (resultado ? resultado.filas.flatMap((f) => (f.datos ? [f.datos] : [])) : []), [resultado]);
  const filasListas = useMemo(() => (resultado ? resultado.filas.filter((f) => f.datos).map((f) => f.fila) : []), [resultado]);
  const malas = resultado ? resultado.filas.filter((f) => !f.datos).length : 0;
  const problemas = resultado ? problemasVaf(resultado) : [];
  const paso = hojas && resultado && !resultado.error && (PASOS as readonly string[]).includes(params.get("paso") ?? "") ? (params.get("paso") as string) : "archivo";
  const irAPaso = (p: string) => { const s = new URLSearchParams(params); if (p === "archivo") s.delete("paso"); else s.set("paso", p); setParams(s); };
  const cambiarTipo = (t: TipoCargaVaf) => { const s = new URLSearchParams(); s.set("tipo", t); setParams(s, { replace: true }); setHojas(null); setArchivo(""); setErroresBD(null); };

  if (!esFinanciero(nivel)) return <PaginaCompleta titulo="Cargar desde Excel" migas={migas} regresarA={volver}><p className="ps-aviso"><Icon name="lock" size={16} /> Cargar financiación y ejecución es de la VAF y del administrador.</p></PaginaCompleta>;
  if (hecho !== null) {
    return (
      <PaginaCompleta titulo={`Se cargaron ${hecho} ${hecho === 1 ? "fila" : "filas"}`} migas={migas} regresarA={volver} regresarTexto="Regresar al presupuesto" claveFoco="hecho">
        <p className="ps-aviso ps-aviso--ok" role="status"><Icon name="check" size={16} /> Quedó cargada {rotulo} de «{op.planNombre}».{tipo === "ejecucion" ? " Los movimientos quedaron en el libro: no se editan, se anulan." : ""}</p>
        <div className="ps-botones"><button type="button" className="button-primary" onClick={() => ir(volver)}>Ver el presupuesto</button><button type="button" className="button-secondary" onClick={() => { setHecho(null); setHojas(null); setArchivo(""); }}>Cargar otro archivo</button></div>
      </PaginaCompleta>
    );
  }
  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setLeyendo(true); setErrorLectura(null); setErroresBD(null); setAcepto(false); setArchivo(f.name);
    try { setHojas(await leerLibro(f)); } catch (e) { setHojas(null); setErrorLectura(e instanceof ErrorImportacion ? e.message : "No pude leer el archivo. Ábralo en Excel, guárdelo de nuevo como .xlsx y vuelva a intentarlo."); }
    setLeyendo(false);
    if (entrada.current) entrada.current.value = "";
  };
  const bajar = async () => { setBajando(true); setErrorBajada(null); try { await descargarPlantillaVaf(tipo, op); } catch { setErrorBajada("No se pudo armar la plantilla. Vuelva a intentarlo."); } setBajando(false); };
  const traer = (e: ErrorCargaVaf) => ({ ...e, filaLibro: e.fila && e.fila > 0 ? filasListas[e.fila - 1] : null });
  const columnasDeCampo = (c: string) => ({ linea: "N.º de la línea", anio: "Año", monto: tipo === "financiacion" ? "Monto aprobado" : "Monto", estado: "Estado", fuente: "Fuente", nota: "Nota", tipo: "Tipo", fecha: "Fecha", referencia: "Referencia" } as Record<string, string>)[c] ?? c;
  const error = errorLectura ?? resultado?.error ?? null;

  return (
    <FormularioPasos
      titulo={`Cargar ${rotulo}`}
      subtitulo={<>Plan «{op.planNombre}». Todo o nada: con un solo problema no se carga ninguna fila. El archivo se lee en su navegador.</>}
      migas={migas}
      regresarA={volver}
      paso={paso}
      onPaso={irAPaso}
      etiquetaEnviar={`Cargar ${listas.length} ${listas.length === 1 ? "fila" : "filas"}`}
      enviando={ops.cargarFinanciacion.isPending || ops.cargarEjecucion.isPending}
      errorEnvio={((ops.cargarFinanciacion.error ?? ops.cargarEjecucion.error) as Error | null)?.message ?? null}
      onEnviar={async () => {
        setErroresBD(null);
        const r = tipo === "financiacion" ? await ops.cargarFinanciacion.mutateAsync({ planId: id, filas: listas as FilaFinanciacion[] }) : await ops.cargarEjecucion.mutateAsync({ planId: id, filas: listas as FilaMov[] });
        if (r.errores.length || r.cargadas === 0) { setErroresBD(r.errores.length ? r.errores : [{ fila: null, campo: "carga", mensaje: "La base no cargó ninguna fila." }]); return; }
        setHecho(r.cargadas);
      }}
      pasos={[
        {
          id: "archivo",
          titulo: "Plantilla y archivo",
          descripcion: "Baje la plantilla, llénela y elíjala aquí. Cambie de tipo si va a cargar lo otro.",
          bloqueado: !hojas || Boolean(error),
          etiquetaSiguiente: "Ver lo que se leyó",
          contenido: (
            <div className="ps-campos">
              <div className="ps-segmentos" role="radiogroup" aria-label="Qué se carga">
                <label><input type="radio" name="vaf-tipo" checked={tipo === "financiacion"} onChange={() => cambiarTipo("financiacion")} /><span>Financiación por línea</span></label>
                <label><input type="radio" name="vaf-tipo" checked={tipo === "ejecucion"} onChange={() => cambiarTipo("ejecucion")} /><span>Ejecución presupuestal</span></label>
              </div>
              <div className="ps-botones"><button type="button" className="button-secondary" onClick={bajar} disabled={bajando} aria-busy={bajando || undefined}><Icon name="download" size={15} /> {bajando ? "Armando…" : "Descargar la plantilla"}</button></div>
              {errorBajada ? <p className="ps-campo__error" role="alert"><Icon name="alert" size={14} /> {errorBajada}</p> : null}
              <div className="ps-archivo">
                <input ref={entrada} id="vaf-archivo" className="ps-archivo__input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void elegir(e.target.files?.[0])} />
                <label htmlFor="vaf-archivo" className="button-secondary"><Icon name="upload" size={16} /> {hojas ? "Elegir otro archivo" : "Elegir el archivo"}</label>
                <span className="ps-archivo__nombre" role="status" aria-live="polite">{leyendo ? "Leyendo el archivo…" : archivo ? `Archivo: ${archivo}` : "Ningún archivo elegido"}</span>
              </div>
              {error ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> {error}</p> : null}
              <p className="ps-nota">Hasta {MAX_FILAS_VAF} filas y 5 MB. Montos en pesos, solo el número.</p>
            </div>
          ),
        },
        {
          id: "leido",
          titulo: "Lo que se leyó",
          descripcion: "Revise las filas y los problemas, por fila y columna, con cómo arreglarlos. Mientras haya un error no se puede cargar.",
          bloqueado: malas > 0 || listas.length === 0,
          etiquetaSiguiente: "Continuar",
          contenido: resultado ? (
            <div className="ps-campos">
              <dl className="ps-kpis"><div><dt>Filas leídas</dt><dd>{resultado.filas.length}</dd></div><div><dt>Listas</dt><dd>{listas.length}</dd></div><div><dt>Con error</dt><dd data-mal={malas > 0 || undefined}>{malas}</dd></div><div><dt>Ejemplos ignorados</dt><dd>{resultado.ejemplosIgnorados}</dd></div></dl>
              {malas > 0 ? <p className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /> Hay {malas} {malas === 1 ? "fila" : "filas"} con error. Corrija el Excel y elija el archivo de nuevo: no se carga nada hasta que todas estén bien.</p> : <p className="ps-aviso ps-aviso--ok"><Icon name="check" size={16} /> Todas las filas están bien.</p>}
              {problemas.length ? <ul className="ps-lista-errores">{problemas.slice(0, 60).map((p, i) => <li key={i} data-nivel={p.nivel}><strong>{p.nivel === "error" ? "Error" : "Aviso"}:</strong> {dondeEsta(p)}. {p.mensaje}</li>)}{problemas.length > 60 ? <li>… y {problemas.length - 60} más.</li> : null}</ul> : null}
              <div className="ps-matriz-caja"><table className="ps-tabla-ppto"><caption className="sr-only">Primeras filas leídas</caption>
                <thead><tr><th scope="col">Fila</th><th scope="col">Línea</th><th scope="col">Año</th>{tipo === "ejecucion" ? <th scope="col">Tipo</th> : <th scope="col">Estado</th>}<th scope="col">Monto</th></tr></thead>
                <tbody>{resultado.filas.slice(0, 12).map((f) => { const d = f.datos as (FilaFinanciacion & FilaMov) | null; return <tr key={f.fila} data-mala={!d || undefined}><th scope="row">{f.fila}</th><td>{d?.linea ?? "—"}</td><td>{d?.anio ?? "—"}</td><td>{d ? (tipo === "ejecucion" ? ROTULO_MOV[d.tipo] : ROTULO_FINANCIACION[d.estado]) : "con error"}</td><td>{d ? <Pesos n={tipo === "ejecucion" ? d.monto : d.montoAprobado} /> : "—"}</td></tr>; })}</tbody></table></div>
            </div>
          ) : <p className="ps-nota">Primero elija el archivo.</p>,
        },
        {
          id: "confirmar",
          titulo: "Confirmar y cargar",
          descripcion: "Aún no se ha cargado nada.",
          validar: () => (acepto ? [] : [{ campo: "vaf-acepto", mensaje: "Marque la casilla para confirmar la carga." }]),
          contenido: (
            <div className="ps-campos">
              <dl className="ps-ficha"><div><dt>Qué se carga</dt><dd>{tipo === "financiacion" ? "Financiación por línea y año" : "Movimientos de ejecución"}</dd></div><div><dt>Plan</dt><dd>{op.planNombre}</dd></div><div><dt>Filas</dt><dd>{listas.length}</dd></div></dl>
              <p className="ps-aviso ps-aviso--info"><Icon name="info" size={16} /> {tipo === "financiacion" ? "Una línea y un año ya evaluados se reemplazan con lo del archivo." : "Los movimientos se agregan al libro: no se editan ni se borran después, solo se anulan."}</p>
              {erroresBD ? <div className="ps-aviso ps-aviso--error" role="alert"><Icon name="alert" size={16} /><div><strong>La base no cargó ninguna fila:</strong><ul className="ps-lista-errores">{erroresBD.slice(0, 30).map(traer).map((e, i) => <li key={i}>{e.filaLibro ? `Fila ${e.filaLibro} del libro` : "De la carga"}{e.campo ? `, columna «${columnasDeCampo(e.campo)}»` : ""}: {e.mensaje}</li>)}</ul></div></div> : null}
              <label className="ps-opcion ps-opcion--grande" id="vaf-acepto" tabIndex={-1}><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /><span><strong>Confirmo que revisé lo leído</strong> y que quiero cargar estas {listas.length} filas.</span></label>
            </div>
          ),
        },
      ]}
    />
  );
}
