/* =============================================================================
   Programas en Cifras · ventanas cortas: nueva carpeta, crear el Cuadro Maestro
   del programa (onboarding) y emitir el Cuadro Maestro.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { supabase } from "../../../lib/supabase";
import { useCrearArchivo, useCrearCarpeta, useRegistrarEmision } from "../datos";
import { DESTINOS, nombreCorto } from "../lib/destinos";
import { cuadrosConArchivo, nombreArchivoEmitido, revisarEmision } from "../lib/emision-checks";
import type { ArchivoParaEmitir } from "../lib/emision-checks";
import { periodosDeVentana } from "../lib/periodos";
import type { Datos } from "../tipos";
import { carpetaDe, useEspacio } from "./contexto";
import { descargarLibro, generarCuadroMaestro, PLANTILLA_PROGRAMAS, PLANTILLA_SALUD } from "./emision";
import type { ResultadoGenerar } from "./emision";
import { claveDePareja, nombreDePareja } from "./logica";
import { SelectorPareja } from "./SelectorPareja";
import { Ventana } from "../../../components/espacio/Ventana";
import { puedeEditar } from "../lib/permisos";

export function NuevaCarpeta({ onCerrar }: { onCerrar: () => void }) {
  const { pareja, decir } = useEspacio();
  const crear = useCrearCarpeta();
  const [nombre, setNombre] = useState("");
  return (
    <Ventana titulo="Nueva carpeta" ancho="chica" onCerrar={onCerrar} pie={<><span /><button type="submit" form="pc-f-carpeta" className="es-btn es-btn--pri" disabled={!nombre.trim() || crear.isPending}>Crear carpeta</button></>}>
      <form id="pc-f-carpeta" className="es-dbody es-dbody--solo" onSubmit={(e) => { e.preventDefault(); crear.mutate({ programa: pareja.programa_id, campus: pareja.campus_id, nombre: nombre.trim() }, { onSuccess: () => { decir("Carpeta creada."); onCerrar(); }, onError: (er) => decir(er.message) }); }}>
        <label className="es-fl">Nombre de la carpeta<input type="text" className="es-inp" data-foco value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      </form>
    </Ventana>
  );
}

/** Crea los archivos de estructura fija del CNA; el área de la salud se decide aquí (suma el cuadro 10). */
export function CrearCuadroMaestro({ onCerrar }: { onCerrar: () => void }) {
  const { pareja: actual, parejas, carpetas, decir } = useEspacio();
  const crear = useCrearArchivo();
  const propias = parejas.filter((p) => puedeEditar(p.rol));
  const [clave, setClave] = useState(claveDePareja(actual));
  const pareja = propias.find((p) => claveDePareja(p) === clave) ?? actual;
  const [salud, setSalud] = useState(false);
  const [hechos, setHechos] = useState(0);
  const cuadros = cuadrosConArchivo(DESTINOS, salud);
  const cna = carpetaDe(carpetas, "cna");

  const correr = async () => {
    if (!cna) return decir("No encontré la carpeta del CNA.");
    try {
      for (const d of cuadros) {
        await crear.mutateAsync({ programa: pareja.programa_id, campus: pareja.campus_id, carpeta: cna.id, nombre: `${d.cuadro} ${nombreCorto(d)}`, tipo: d.tipo_archivo, destino: d.id });
        setHechos((n) => n + 1);
      }
      decir("Cuadro Maestro creado.");
      onCerrar();
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo crear.");
    }
  };

  return (
    <Ventana titulo="Crear el Cuadro Maestro del programa" ancho="chica" onCerrar={onCerrar} pie={<><button type="button" className="es-btn" onClick={onCerrar}>Ahora no</button><button type="button" className="es-btn es-btn--pri" disabled={crear.isPending} onClick={() => void correr()}>{crear.isPending ? `Creando ${hechos + 1} de ${cuadros.length}…` : "Crear los archivos"}</button></>}>
      <div className="es-dbody es-dbody--solo">
        <div className="es-stage">
          <p style={{ margin: 0 }}><b>{nombreDePareja(pareja)}</b></p>
          {propias.length > 1 ? <SelectorPareja parejas={propias} valor={claveDePareja(pareja)} onCambiar={setClave} /> : null}
          <p className="es-note">Creo un archivo por cada cuadro que el programa llena, con la estructura exacta del CNA. Los cuadros 02, 03, 05 y 06 los llena el sistema.</p>
          <label className="es-ck"><input type="checkbox" checked={salud} onChange={(e) => setSalud(e.target.checked)} /> El programa es del área de la salud (suma el cuadro 10)</label>
          <ul className="es-plain">{cuadros.map((d) => <li key={d.id}>{d.nombre}</li>)}</ul>
        </div>
      </div>
    </Ventana>
  );
}

async function filasDe(archivo: string): Promise<Datos[]> {
  const salida: Datos[] = [];
  for (let d = 0; ; d += 1000) {
    const r = await supabase.from("pc_filas").select("datos").eq("archivo_id", archivo).order("orden").range(d, d + 999);
    if (r.error) throw new Error(r.error.message);
    const lote = (r.data as { datos: Datos }[] | null) ?? [];
    salida.push(...lote.map((f) => f.datos));
    if (lote.length < 1000) return salida;
  }
}

export function EmitirCuadro({ onCerrar }: { onCerrar: () => void }) {
  const { archivos, respuestas, periodos, salud, pareja, decir } = useEspacio();
  const registrar = useRegistrarEmision();
  const [cargados, setCargados] = useState<ArchivoParaEmitir[] | null>(null);
  const [autoriza, setAutoriza] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGenerar | null>(null);

  useEffect(() => {
    const propios = archivos.filter((a) => respuestas.some((r) => r.archivo_id === a.id && DESTINOS.find((d) => d.id === r.destino_id)?.sistema === "CNA"));
    Promise.all(propios.map(async (a) => ({ id: a.id, nombre: a.nombre, estado: a.estado, filas: await filasDe(a.id), respuestas: respuestas.filter((r) => r.archivo_id === a.id).map((r) => ({ destino_id: r.destino_id, mapa: r.mapa })) }))).then(setCargados, (e: Error) => (decir(e.message), setCargados([])));
  }, [archivos, respuestas, decir]);

  const revision = cargados && periodos ? revisarEmision({ periodos, archivos: cargados, salud, autorizacionDatos: autoriza }) : null;

  const generar = async () => {
    if (!cargados || !periodos?.ventana) return;
    setTrabajando(true);
    try {
      const plantilla = await (await fetch(salud ? PLANTILLA_SALUD : PLANTILLA_PROGRAMAS)).arrayBuffer();
      const r = await generarCuadroMaestro({ plantilla, archivos: cargados, salud, periodos: periodosDeVentana(periodos.ventana) });
      const nombre = nombreArchivoEmitido({ programa: pareja.programa, campus: pareja.campus, hasta: periodos.ventana.hasta, salud });
      descargarLibro(r.buffer, nombre);
      await registrar.mutateAsync({ programa: pareja.programa_id, campus: pareja.campus_id, nombre });
      setResultado(r);
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Ventana titulo="Emitir el Cuadro Maestro" onCerrar={onCerrar} pie={<><button type="button" className="es-btn" onClick={onCerrar}>{resultado ? "Cerrar" : "Cancelar"}</button>{resultado ? <span /> : <button type="button" className="es-btn es-btn--pri" disabled={!revision?.puede || trabajando} onClick={() => void generar()}>{trabajando ? "Generando…" : "Generar el Excel"}</button>}</>}>
      <div className="es-dbody es-dbody--solo">
        <div className="es-stage">
          {resultado ? (
            <>
              <p className="es-note es-note--ok">Excel generado y descargado.</p>
              <p className="es-note">Rellenados: {resultado.llenados.join(", ") || "ninguno"}.</p>
              <p className="es-note">Pendientes de conexión (los llena el sistema): {resultado.pendientes.join(", ")}.</p>
              {resultado.sinUbicar.length > 0 && <ul className="pc-hallazgos">{resultado.sinUbicar.map((s) => <li key={s} data-n="aviso"><Icon name="alert" size={14} />{s}</li>)}</ul>}
            </>
          ) : !revision ? (
            <p className="es-note">Revisando las condiciones…</p>
          ) : (
            <>
              <p className="es-note">{revision.hallazgos.length ? "Esto es lo que hay que resolver o revisar:" : "Todo en orden para emitir."}</p>
              <ul className="pc-hallazgos">{revision.hallazgos.map((h) => <li key={h.mensaje} data-n={h.nivel}><Icon name="alert" size={14} />{h.mensaje}</li>)}</ul>
              <label className="es-ck"><input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} /> Cuento con la autorización para tratar los datos personales (Ley 1581 de 2012)</label>
              <p className="es-note">Los cuadros 02, 03, 05 y 06 saldrán marcados «pendiente de conexión»: todavía no están conectados.</p>
            </>
          )}
        </div>
      </div>
    </Ventana>
  );
}
