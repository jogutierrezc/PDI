/* =============================================================================
   Contactos · público · importar un archivo.

   1 descargar la plantilla · 2 soltar el archivo (se lee en este navegador) ·
   3 revisar fila por fila (nueva, se actualizará, ya estaba, error) sin guardar
   nada · 4 enviar solo lo válido, en tandas de 500. Las filas con error no se
   envían: se descargan aparte para corregirlas en el archivo y volver a subirlo.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { aCsv, MAX_FILAS_ARCHIVO, MAX_FILAS_POR_ENVIO, plantillaDeTipo, validarFila } from "../../../../../supabase/functions/int-contactos/contactos";
import type { AccionFila, FilaEnvio, ResultadoFila, TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { enviar, revisar, sesionVencida, TEXTO_ACCION } from "../api";
import type { Sesion } from "../api";
import { descargar, descargarPlantillaCsv, descargarPlantillaXlsx, leerArchivo } from "../archivos";
import type { ArchivoLeido } from "../archivos";
import { useDecir } from "./GuiaPilo";

type Fase = "inicio" | "leyendo" | "revisado" | "enviando";

/** Lo que Pilo dice al terminar de revisar: cuántas filas están listas y cuáles necesitan una mirada. */
function resumenPilo(resultados: readonly ResultadoFila[]): string {
  const listas = resultados.filter((r) => r.accion === "crear" || r.accion === "actualizar").length;
  const errores = resultados.filter((r) => r.accion === "error");
  const avisos = resultados.filter((r) => r.accion !== "error" && r.avisos.length > 0);
  const ya = resultados.filter((r) => r.accion === "omitir").length;
  const partes: string[] = [];
  if (listas) partes.push(listas === 1 ? "Hay 1 fila lista" : `Hay ${listas} filas listas`);
  else partes.push("Ninguna fila quedó lista para enviar");
  if (avisos.length) partes.push(`${avisos.length} con aviso (${avisos[0].avisos[0].replace(/\.$/, "")})`);
  if (ya) partes.push(`${ya} ya estaban`);
  if (errores.length) partes.push(`${errores.length} con error: ${errores.slice(0, 3).map((r) => `la ${r.fila}`).join(", ")}${errores.length > 3 ? "…" : ""}`);
  return `${partes.join("; ")}. ${errores.length ? "Puede corregirlas en el archivo y volver a subirlo, o enviar las que están bien." : "Si todo le parece bien, envíelas."}`;
}

const trozos = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export function ImportarArchivo({
  token,
  sesion,
  tipo,
  onVolver,
  onEnviado,
  onSesionVencida,
}: {
  token: string;
  sesion: Sesion;
  tipo: TipoContacto;
  onVolver: () => void;
  /** Se envió bien: cuántos contactos entraron (nuevos y actualizados). La pantalla de arriba muestra el «recibido». */
  onEnviado: (contactos: number) => void;
  onSesionVencida: () => void;
}) {
  const plantilla = plantillaDeTipo(tipo);
  const decir = useDecir();
  const [fase, setFase] = useState<Fase>("inicio");
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [resultados, setResultados] = useState<ResultadoFila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const [soloErrores, setSoloErrores] = useState(false);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [limite, setLimite] = useState<{ enviados: number; limite: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    decir("Primero descargue la plantilla, llénela con sus contactos y súbala aquí. Yo la reviso fila por fila.", "idea");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, [tipo]);

  const crudaDe = useMemo(() => new Map((archivo?.lectura.filas ?? []).map((f) => [f.fila, f.cruda])), [archivo]);
  const cuenta = useMemo(() => {
    const c: Record<AccionFila, number> = { crear: 0, actualizar: 0, omitir: 0, error: 0 };
    for (const r of resultados) c[r.accion]++;
    return c;
  }, [resultados]);
  const conAviso = useMemo(() => resultados.filter((r) => r.accion !== "error" && r.avisos.length > 0).length, [resultados]);

  const fallo = (e: unknown) => {
    if (sesionVencida(e)) return onSesionVencida();
    const m = e instanceof Error ? e.message : "Algo falló. Intente de nuevo.";
    setError(m);
    decir(m.length > 220 ? "Hay un problema con el archivo. Lea el aviso de abajo." : m, "duda");
  };

  const reiniciar = () => {
    setFase("inicio");
    setArchivo(null);
    setResultados([]);
    setError(null);
    setLimite(null);
    if (entrada.current) entrada.current.value = "";
  };

  /** El correo repetido dentro del archivo se resuelve aquí: las tandas no se ven entre sí. */
  const separarRepetidos = (filas: readonly FilaEnvio[]) => {
    const vistos = new Set<string>();
    const unicas: FilaEnvio[] = [];
    const repetidas: ResultadoFila[] = [];
    for (const f of filas) {
      const correo = (f.cruda["Email"] ?? "").trim().toLowerCase();
      if (correo && vistos.has(correo)) repetidas.push({ fila: f.fila, accion: "omitir", motivo: "El correo está repetido en el archivo.", avisos: [] });
      else {
        if (correo) vistos.add(correo);
        unicas.push(f);
      }
    }
    return { unicas, repetidas };
  };

  const alElegir = async (f: File) => {
    reiniciar();
    setFase("leyendo");
    decir("Estoy leyendo su archivo, fila por fila…", "piensa");
    try {
      const leido = await leerArchivo(f, plantilla);
      const { filaEncabezado, emparejo, filas } = leido.lectura;
      if (!filaEncabezado) throw new Error(`No encontré las cabeceras de la plantilla. Descargue la plantilla y copie sus contactos debajo de ellas. Faltan: ${emparejo.faltantes.join(", ")}.`);
      if (emparejo.faltantes.length) throw new Error(`A su archivo le faltan columnas obligatorias: ${emparejo.faltantes.join(", ")}.`);
      if (filas.length === 0) throw new Error("El archivo no tiene filas con contactos debajo de las cabeceras.");
      if (filas.length > MAX_FILAS_ARCHIVO) throw new Error(`El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS_ARCHIVO}. Divídalo en partes.`);
      setArchivo(leido);
      const { unicas, repetidas } = separarRepetidos(filas.map((x) => ({ fila: x.fila, cruda: x.cruda })));
      let todos: ResultadoFila[] = [...repetidas];
      let ultimo = { enviados: 0, limite: 0 };
      for (const lote of trozos(unicas, MAX_FILAS_POR_ENVIO)) {
        const r = await revisar(token, sesion, tipo, lote);
        todos = todos.concat(r.resultados);
        ultimo = { enviados: r.enviados, limite: r.limite };
      }
      const ordenados = todos.sort((a, b) => a.fila - b.fila);
      setResultados(ordenados);
      setLimite(ultimo);
      setFase("revisado");
      decir(resumenPilo(ordenados), ordenados.some((r) => r.accion === "crear" || r.accion === "actualizar") ? "bien" : "duda");
    } catch (e) {
      setFase("inicio");
      fallo(e);
    }
  };

  const alEnviar = async () => {
    if (!archivo) return;
    setFase("enviando");
    setError(null);
    decir("Enviando sus contactos, ya casi.", "piensa");
    const buenas = archivo.lectura.filas.filter((f) => ["crear", "actualizar"].includes(resultados.find((r) => r.fila === f.fila)?.accion ?? "")).map((f) => ({ fila: f.fila, cruda: f.cruda }));
    const lotes = trozos(buenas, MAX_FILAS_POR_ENVIO);
    setProgreso({ hechas: 0, total: buenas.length });
    let finales: ResultadoFila[] = resultados.filter((r) => !["crear", "actualizar"].includes(r.accion));
    try {
      let hechas = 0;
      for (const lote of lotes) {
        const r = await enviar(token, sesion, tipo, lote, "excel", archivo.nombre);
        finales = finales.concat(r.resultados);
        hechas += lote.length;
        setProgreso({ hechas, total: buenas.length });
        setLimite({ enviados: r.enviados, limite: r.limite });
      }
      const ordenados = finales.sort((a, b) => a.fila - b.fila);
      setResultados(ordenados);
      const recibidos = ordenados.filter((r) => r.accion === "crear" || r.accion === "actualizar").length;
      if (recibidos === 0) {
        setFase("revisado");
        return fallo(new Error("No entró ningún contacto. Revise las filas e intente de nuevo."));
      }
      onEnviado(recibidos);
    } catch (e) {
      // Lo que alcanzó a entrar queda; se vuelve a revisar el archivo para ver qué falta.
      fallo(e);
      setFase("revisado");
    }
  };

  const descargarErrores = () => {
    const malas = resultados.filter((r) => r.accion === "error");
    const encabezados = [...plantilla.columnas.map((c) => c.encabezado), "Fila en su archivo", "Qué corregir"];
    const filas = malas.map((r) => [...plantilla.columnas.map((c) => crudaDe.get(r.fila)?.[c.encabezado] ?? ""), String(r.fila), r.motivo ?? ""]);
    descargar(new Blob([aCsv(encabezados, filas)], { type: "text/csv;charset=utf-8" }), `${plantilla.archivo}_filas-con-error.csv`);
  };

  const soltar = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setEncima(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void alElegir(f);
  };

  const filasVista = (soloErrores ? resultados.filter((r) => r.accion === "error") : resultados).slice(0, 200);
  const validas = cuenta.crear + cuenta.actualizar;
  const ocupado = fase === "leyendo" || fase === "enviando";
  const pedirPlantilla = (descarga: () => void) => () => {
    decir("Ahí va la plantilla. Llénela con calma y vuelva cuando la tenga lista; aquí lo espero.", "feliz");
    descarga();
  };

  return (
    <div className="cp-panel" data-entra>
      <div data-entra>
        <h2>Su archivo, en tres pasos</h2>
        <p className="cp-sub">{tipo === "academico" ? "Contactos académicos" : "Contactos de empleadores"}</p>
      </div>

      <ol className="cp-como" data-entra>
        <li>
          <i>1</i>
          <div>
            <b>Descargue la plantilla</b>
            <span>Tiene {plantilla.columnas.length} columnas, en su orden, y una hoja de instrucciones. No cambie los encabezados.</span>
            <span className="cp-grupo">
              <button type="button" className="cp-btn cp-btn--suave" onClick={pedirPlantilla(() => void descargarPlantillaXlsx(plantilla))}>
                Excel (.xlsx)
              </button>
              <button type="button" className="cp-btn cp-btn--suave" onClick={pedirPlantilla(() => descargarPlantillaCsv(plantilla))}>
                CSV
              </button>
            </span>
          </div>
        </li>
        <li>
          <i>2</i>
          <div>
            <b>Llénela con sus contactos</b>
            <span>Una fila por persona. No cambie los títulos de las columnas.</span>
          </div>
        </li>
        <li>
          <i>3</i>
          <div>
            <b>Súbala aquí</b>
            <span>
              Excel (.xlsx) o CSV. Hasta {MAX_FILAS_ARCHIVO} filas; se envían en tandas de {MAX_FILAS_POR_ENVIO}.
            </span>
          </div>
        </li>
      </ol>

      <div
        className="cp-suelta"
        data-encima={encima}
        data-entra
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{archivo ? archivo.nombre : "Arrastre aquí su Excel o CSV"}</b>
          <p className="cp-ayuda">{archivo ? `${archivo.lectura.filas.length} filas leídas en este equipo.${archivo.hoja ? ` Hoja: ${archivo.hoja}.` : ""} Aún no se ha enviado nada.` : "Se lee en su equipo; hasta que usted envíe, nada sale de él."}</p>
        </div>
        <button type="button" className="cp-btn cp-btn--suave" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {archivo ? "Cambiar archivo" : "Elegir archivo"}
        </button>
        <input ref={entrada} className="cp-sr" type="file" accept=".xlsx,.csv,.txt" aria-label="Archivo de contactos" onChange={(e) => e.target.files?.[0] && void alElegir(e.target.files[0])} />
      </div>
      {fase === "leyendo" && (
        <p role="status" className="cp-ayuda">
          Leyendo y revisando el archivo…
        </p>
      )}

      {error && (
        <p className="cp-aviso is-mal" role="alert">
          {error}
        </p>
      )}

      {(fase === "revisado" || fase === "enviando") && (
        <div className="cp-resultado" data-entra>
          <div className="cp-pastillas">
            <span className="cp-chip is-crear">
              {validas} {validas === 1 ? "lista" : "listas"}
            </span>
            {conAviso > 0 && <span className="cp-chip is-aviso">{conAviso} con aviso</span>}
            {cuenta.omitir > 0 && <span className="cp-chip">{cuenta.omitir} ya estaban</span>}
            {cuenta.error > 0 && <span className="cp-chip is-error">{cuenta.error} con error</span>}
          </div>

          {cuenta.error > 0 && (
            <label className="cp-check">
              <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} /> <span>Ver solo las filas con error</span>
            </label>
          )}

          <div className="cp-tabla" role="region" aria-label="Revisión de las filas" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Nombre</th>
                  <th>Cargo</th>
                  <th>País</th>
                  <th>Correo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasVista.map((r) => {
                  const c = crudaDe.get(r.fila) ?? {};
                  return (
                    <tr key={r.fila} data-accion={r.accion}>
                      <td>{r.fila}</td>
                      <td>{[c["First Name"], c["Last Name"]].filter(Boolean).join(" ")}</td>
                      <td>{c["Job Title"] || c["Position"]}</td>
                      <td>{c["Country or Territory"]}</td>
                      <td>{c["Email"]}</td>
                      <td>
                        <span className={`cp-chip is-${r.accion}`}>{TEXTO_ACCION[r.accion]}</span>
                        {r.motivo && <div className={r.accion === "error" ? "cp-error" : "cp-ayuda"}>{r.motivo}</div>}
                        {r.avisos.length > 0 && <div className="cp-ayuda">{r.avisos.join(" ")}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {resultados.length > filasVista.length && (
            <p className="cp-ayuda">
              Se muestran las primeras {filasVista.length} de {resultados.length} filas.
            </p>
          )}

          {fase === "enviando" && (
            <div className="cp-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechas} aria-label="Contactos enviados">
              <i style={{ transform: `scaleX(${progreso.total ? progreso.hechas / progreso.total : 0})` }} />
            </div>
          )}

          <div className="cp-acciones">
            <span className="cp-ayuda">
              {limite ? `Lleva ${limite.enviados} de ${limite.limite} contactos permitidos. ` : ""}
              {cuenta.error > 0 ? `Las ${cuenta.error} filas con error no se envían.` : ""}
            </span>
            <span className="cp-grupo">
              {cuenta.error > 0 && (
                <button type="button" className="cp-btn cp-btn--suave" onClick={descargarErrores}>
                  Descargar las filas con error
                </button>
              )}
              <button type="button" className="cp-btn cp-btn--pri" disabled={validas === 0 || fase === "enviando"} onClick={() => void alEnviar()}>
                {fase === "enviando" ? `Enviando ${progreso.hechas} de ${progreso.total}…` : `Enviar ${validas} ${validas === 1 ? "contacto" : "contactos"}`}
              </button>
            </span>
          </div>
        </div>
      )}

      <div className="cp-acciones">
        <button type="button" className="cp-btn cp-btn--suave" onClick={onVolver} disabled={ocupado}>
          Volver
        </button>
      </div>
    </div>
  );
}
