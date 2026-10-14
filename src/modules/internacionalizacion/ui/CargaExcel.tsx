/* =============================================================================
   Internacionalización · carga de Excel.

   Se arrastra un .xlsx con las tablas ya diseñadas. El archivo se lee en el
   navegador (no se guarda el original) y antes de guardar se ve todo:
   las hojas del libro, la fila de encabezados, cada columna con su concepto o
   «campo propio» y su tipo, y los errores por fila y celda en español
   (lib/importador-excel). Si el Excel no trae columna de campus, se elige el
   campus. Se guarda con int_guardar_filas por lotes, con su progreso.
   El Director puede, además, crear una tabla nueva con las hojas del archivo.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { INT_CLAVES, useCrearTabla, useGuardarFilas } from "../datos";
import { analizarLibro, columnasParaCrear, hojaPorNombre, paraGuardar, prepararCarga } from "../lib/importador-excel";
import type { HojaDetectada, LibroDetectado } from "../lib/importador-excel";
import type { Columna, IntConceptoRow, IntEnvioRow, IntVentanaRow, LibroCompleto } from "../tipos";
import { Cajon, fmt, nombreCampus } from "./comunes";
import type { Ctx } from "./comunes";
import { escrituraPorCampus, PARTIDAS } from "./logica";
import type { Partida } from "./logica";

const LOTE = 500;
const COMO: Record<HojaDetectada["columnas"][number]["como"], string> = { exacto: "concepto", parecido: "concepto por parecido", propio: "campo propio", implicito: "va en la fila" };

export function CargaExcel({
  ctx,
  estructura,
  libro,
  hojaActual,
  ventanas,
  envios,
  conceptos,
  onCerrar,
  onListo,
}: {
  ctx: Ctx;
  estructura: LibroCompleto[];
  libro: LibroCompleto | null;
  hojaActual: string | null;
  ventanas: IntVentanaRow[];
  envios: IntEnvioRow[];
  conceptos: IntConceptoRow[];
  onCerrar: () => void;
  onListo: (libroId: string, hojaId: string | null, mensaje: string) => void;
}) {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leido, setLeido] = useState<LibroDetectado | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const [destino, setDestino] = useState<"existente" | "nueva">(libro ? "existente" : "nueva");
  const [nombreTabla, setNombreTabla] = useState("");
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [clases, setClases] = useState<Record<string, Partida>>({});
  const [campusFijo, setCampusFijo] = useState<string>("");
  const [reemplazar, setReemplazar] = useState(false);
  const [activa, setActiva] = useState(0);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const guardar = useGuardarFilas();
  const crear = useCrearTabla();
  const cliente = useQueryClient();
  const periodo = ctx.periodo;

  const leer = async (file: File) => {
    setError(null);
    setLeido(null);
    if (!/\.xlsx$/i.test(file.name)) return setError("El archivo debe ser un Excel .xlsx (si es .xls o .csv, guárdelo como .xlsx).");
    setLeyendo(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const r = analizarLibro(wb, conceptos);
      setArchivo(file.name);
      setLeido(r);
      setNombreTabla(file.name.replace(/\.xlsx$/i, ""));
      setActiva(0);
      // Cada hoja del Excel va a la hoja del libro con el mismo nombre; con una sola, a la hoja abierta.
      const d: Record<string, string> = {};
      for (const h of r.hojas) d[h.nombre] = (libro && hojaPorNombre(h.nombre, libro.hojas)?.id) ?? (r.hojas.length === 1 && hojaActual ? hojaActual : "");
      setDestinos(d);
      setClases(Object.fromEntries(r.hojas.map((h) => [h.nombre, /convenio/i.test(h.nombre) ? "convenio" : /entrante|visitante/i.test(h.nombre) ? "entrante" : /salien/i.test(h.nombre) ? "saliente" : "general"])));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  };

  const soltar = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setEncima(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void leer(f);
  };

  /** Para cada hoja del Excel: sus columnas de destino, los campus donde se puede escribir y la vista previa. */
  const planes = useMemo(() => {
    if (!leido || !periodo) return [];
    return leido.hojas.map((h) => {
      let columnas: Columna[] | null = null;
      let hojaId: string | null = null;
      let captura: LibroCompleto["captura"] = "campus";
      if (destino === "nueva") columnas = columnasParaCrear(h);
      else {
        hojaId = destinos[h.nombre] || null;
        const libroDe = estructura.find((l) => l.hojas.some((x) => x.id === hojaId));
        const hoja = libroDe?.hojas.find((x) => x.id === hojaId);
        columnas = hoja?.columnas ?? null;
        captura = libroDe?.captura ?? "campus";
      }
      const permitidos =
        destino === "nueva"
          ? ctx.director
            ? ctx.visibles.map((c) => c.id)
            : []
          : hojaId
            ? escrituraPorCampus({ yo: ctx.yo, campus: ctx.visibles.map((c) => c.id), hoja: { id: hojaId }, libro: { captura }, periodo, ventanas, envios })
                .filter((e) => !e.bloqueo)
                .map((e) => e.campus_id)
            : [];
      const conCampus = h.columnas.some((c) => c.implicito === "campus");
      const carga = columnas ? prepararCarga(h, columnas, { campus: ctx.campus, permitidos, campusFijo: campusFijo || null, periodo: periodo.codigo }) : null;
      return { h, hojaId, columnas, permitidos, conCampus, carga };
    });
  }, [leido, periodo, destino, destinos, estructura, ctx, ventanas, envios, campusFijo]);

  const plan = planes[activa];
  const pideCampus = planes.some((p) => !p.conCampus && p.permitidos.length > 1);
  const opcionesCampus = [...new Set(planes.flatMap((p) => p.permitidos))];
  const validas = planes.reduce((n, p) => n + (p.carga?.validas.length ?? 0), 0);
  const listas = planes.filter((p) => p.carga && p.carga.validas.length > 0 && (destino === "nueva" || p.hojaId));

  const guardarTodo = async () => {
    if (!periodo) return;
    setError(null);
    try {
      let libroId = libro?.id ?? "";
      let porNombre = new Map<string, string>();
      if (destino === "nueva") {
        if (!nombreTabla.trim()) return setError("Escriba el nombre de la tabla nueva.");
        libroId = await crear.mutateAsync({
          nombre: nombreTabla.trim(),
          hojas: planes.map((p) => {
            const def = PARTIDAS[clases[p.h.nombre] ?? "general"];
            return { nombre: p.h.nombre, clase: def.clase, sentido: def.sentido, columnas: columnasParaCrear(p.h) };
          }),
        });
        await cliente.invalidateQueries({ queryKey: INT_CLAVES.estructura });
        const nueva = cliente.getQueryData<LibroCompleto[]>(INT_CLAVES.estructura)?.find((l) => l.id === libroId);
        porNombre = new Map((nueva?.hojas ?? []).map((x) => [x.nombre, x.id]));
      }
      const trabajo = listas.map((p) => ({ hoja: destino === "nueva" ? porNombre.get(p.h.nombre) : p.hojaId, filas: paraGuardar(p.carga!), campus: Object.keys(p.carga!.porCampus) }));
      const total = trabajo.reduce((n, t) => n + t.filas.length, 0);
      let hechas = 0;
      setProgreso({ hechas, total });
      for (const t of trabajo) {
        if (!t.hoja) continue;
        for (let i = 0; i < t.filas.length; i += LOTE) {
          const lote = t.filas.slice(i, i + LOTE);
          await guardar.mutateAsync({ hoja: t.hoja, periodo: periodo.id, filas: lote, reemplazar: i === 0 && reemplazar ? t.campus : undefined, origen: "excel" });
          hechas += lote.length;
          setProgreso({ hechas, total });
        }
      }
      onListo(libroId, trabajo[0]?.hoja ?? null, `Se guardaron ${fmt(hechas)} filas de «${archivo}».`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgreso(null);
    }
  };

  const ocupado = Boolean(progreso) || crear.isPending;

  return (
    <Cajon
      titulo="Cargar Excel"
      ancho="ancho"
      onCerrar={onCerrar}
      pie={
        <>
          {progreso && (
            <div className="it-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechas} aria-label="Filas guardadas">
              <i style={{ transform: `scaleX(${progreso.total ? progreso.hechas / progreso.total : 0})` }} />
              <span className="it-num">
                {fmt(progreso.hechas)} de {fmt(progreso.total)} filas
              </span>
            </div>
          )}
          {error && (
            <p className="it-error" role="alert">
              {error}
            </p>
          )}
          <span className="it-espacio" />
          <button type="button" className="button-secondary it-btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="button" className="button-primary it-btn" disabled={!leido || ocupado || (destino === "existente" && validas === 0)} onClick={() => void guardarTodo()}>
            {ocupado ? "Guardando…" : destino === "nueva" ? `Crear la tabla${validas ? ` y guardar ${fmt(validas)} filas` : ""}` : `Guardar ${fmt(validas)} filas válidas`}
          </button>
        </>
      }
    >
      {!periodo && <p className="it-error">No hay periodo: el Director debe abrir uno antes de cargar filas.</p>}
      <label
        className={`it-soltar${encima ? " is-encima" : ""}${leido ? " is-compacta" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <Icon name="upload" size={22} aria-hidden="true" />
        <span>
          <b>{leyendo ? "Leyendo el archivo…" : archivo ? `«${archivo}»` : "Arrastre aquí el Excel (.xlsx)"}</b>
          <small>{archivo ? "Arrastre otro para reemplazarlo, o pulse para elegir." : "o pulse para elegirlo. Se lee en este equipo: el archivo no se sube."}</small>
        </span>
        <input
          ref={entrada}
          data-autofocus
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leer(f);
            e.target.value = "";
          }}
        />
      </label>

      {leido && (
        <>
          {leido.advertencias.length > 0 && (
            <ul className="it-avisos">
              {leido.advertencias.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          {ctx.director && (
            <fieldset className="it-campo">
              <legend>Destino</legend>
              <div className="it-opciones it-opciones--fila">
                {libro && (
                  <label className="it-opcion">
                    <input type="radio" name="it-destino" checked={destino === "existente"} onChange={() => setDestino("existente")} />
                    <span>
                      <b>Cargar filas en «{libro.nombre}»</b>
                      <small>Las columnas se emparejan con las de la hoja.</small>
                    </span>
                  </label>
                )}
                <label className="it-opcion">
                  <input type="radio" name="it-destino" checked={destino === "nueva"} onChange={() => setDestino("nueva")} />
                  <span>
                    <b>Crear una tabla nueva con este Excel</b>
                    <small>Cada hoja del archivo es una hoja de la tabla.</small>
                  </span>
                </label>
              </div>
              {destino === "nueva" && (
                <label className="it-campo">
                  <span>Nombre de la tabla</span>
                  <input type="text" value={nombreTabla} onChange={(e) => setNombreTabla(e.target.value)} />
                </label>
              )}
            </fieldset>
          )}

          {pideCampus && (
            <label className="it-campo">
              <span>Campus de las filas (el Excel no trae columna «Campus»)</span>
              <select value={campusFijo} onChange={(e) => setCampusFijo(e.target.value)}>
                <option value="">Elija el campus</option>
                {opcionesCampus.map((id) => (
                  <option key={id} value={id}>
                    {nombreCampus(ctx.campus, id)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {leido.hojas.length > 1 && (
            <div className="it-pestanas" role="tablist" aria-label="Hojas del Excel">
              {planes.map((p, i) => (
                <button key={p.h.nombre} type="button" role="tab" aria-selected={i === activa} onClick={() => setActiva(i)}>
                  {p.h.nombre}
                  <small className="it-num">{p.carga ? ` · ${fmt(p.carga.validas.length)}/${fmt(p.h.filas.length)}` : ""}</small>
                </button>
              ))}
            </div>
          )}

          {plan && (
            <section className="it-previa-carga" aria-label={`Hoja «${plan.h.nombre}»`}>
              <div className="it-fila it-fila--campos">
                {destino === "existente" ? (
                  <label className="it-campo it-campo--en-linea">
                    <span>Hoja «{plan.h.nombre}» va a</span>
                    <select value={destinos[plan.h.nombre] ?? ""} onChange={(e) => setDestinos({ ...destinos, [plan.h.nombre]: e.target.value })}>
                      <option value="">No cargar esta hoja</option>
                      {(libro?.hojas ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="it-campo it-campo--en-linea">
                    <span>Clase de «{plan.h.nombre}»</span>
                    <select value={clases[plan.h.nombre] ?? "general"} onChange={(e) => setClases({ ...clases, [plan.h.nombre]: e.target.value as Partida })}>
                      {(Object.keys(PARTIDAS) as Partida[]).map((k) => (
                        <option key={k} value={k}>
                          {PARTIDAS[k].rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <span className="it-tenue">Encabezados en la fila {plan.h.filaEncabezado}</span>
              </div>

              {plan.carga && (
                <ul className="it-resumen-carga">
                  <li>
                    <b className="it-num">{fmt(plan.h.filas.length)}</b> filas leídas
                  </li>
                  <li className="is-ok">
                    <b className="it-num">{fmt(plan.carga.validas.length)}</b> se guardan
                  </li>
                  <li className={plan.carga.filas.length - plan.carga.validas.length ? "is-risk" : undefined}>
                    <b className="it-num">{fmt(plan.carga.filas.length - plan.carga.validas.length)}</b> con error
                  </li>
                  {Object.entries(plan.carga.porCampus).map(([id, n]) => (
                    <li key={id}>
                      <b className="it-num">{fmt(n)}</b> de {nombreCampus(ctx.campus, id)}
                    </li>
                  ))}
                </ul>
              )}
              {plan.carga && plan.carga.faltantes.length > 0 && <p className="it-error">Faltan columnas obligatorias de la hoja: {plan.carga.faltantes.join(", ")}.</p>}
              {plan.carga && plan.carga.ignoradas.length > 0 && <p className="it-ayuda">Se ignoran (la hoja no las tiene): {plan.carga.ignoradas.join(", ")}.</p>}
              {destino === "existente" && !plan.hojaId && <p className="it-ayuda">Elija a qué hoja va para ver la vista previa.</p>}
              {plan.hojaId && plan.permitidos.length === 0 && (
                <p className="it-error">En esta hoja no puede escribir ningún campus suyo ahora (ventana cerrada, hoja enviada o aprobada).</p>
              )}

              <h3 className="it-h4">Columnas</h3>
              <div className="it-desliza">
                <table className="it-tabla it-tabla--compacta">
                  <thead>
                    <tr>
                      <th scope="col">Encabezado del Excel</th>
                      <th scope="col">Se guarda como</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Emparejamiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.h.columnas.map((c) => (
                      <tr key={c.indice}>
                        <td>{c.encabezado}</td>
                        <td>
                          {c.etiqueta} <code className="it-clave">{c.clave}</code>
                        </td>
                        <td>{c.tipo}</td>
                        <td>
                          <span className={`it-chip${c.como === "parecido" ? " is-cambio" : c.como === "propio" ? "" : " is-ok"}`}>{COMO[c.como]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {plan.carga && plan.columnas && (
                <>
                  <h3 className="it-h4">Vista previa {plan.carga.filas.length > 30 && <small className="it-tenue">(las 30 primeras filas)</small>}</h3>
                  <div className="it-desliza it-desliza--alto">
                    <table className="it-grilla it-grilla--previa">
                      <thead>
                        <tr>
                          <th scope="col">Fila</th>
                          <th scope="col">Campus</th>
                          {plan.columnas.map((c) => (
                            <th key={c.clave} scope="col">
                              {c.etiqueta}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {plan.carga.filas.slice(0, 30).map((f) => {
                          const mal = new Set(f.errores.map((e) => e.columna));
                          return (
                            <tr key={f.fila} aria-invalid={f.errores.length > 0 || undefined}>
                              <td className="it-num">{f.fila}</td>
                              <td className={mal.has("campus") ? "is-mal" : undefined}>{f.campus_id ? nombreCampus(ctx.campus, f.campus_id) : "—"}</td>
                              {plan.columnas!.map((c) => (
                                <td key={c.clave} className={mal.has(c.clave) ? "is-mal" : undefined} title={f.errores.find((e) => e.columna === c.clave)?.mensaje}>
                                  {f.datos[c.clave] === null || f.datos[c.clave] === undefined ? "" : String(f.datos[c.clave])}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {plan.carga.errores.length > 0 && (
                    <>
                      <h3 className="it-h4">Errores ({fmt(plan.carga.errores.length)})</h3>
                      <ul className="it-errores">
                        {plan.carga.errores.slice(0, 60).map((e, i) => (
                          <li key={i}>
                            <b className="it-num">Fila {e.fila}</b> {e.mensaje}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {destino === "existente" && (
            <label className="it-check">
              <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
              <span>
                Reemplazar las filas que ya tienen esos campus en esta hoja y periodo
                <small>Sin marcar, las filas del Excel se agregan a las que ya hay.</small>
              </span>
            </label>
          )}
        </>
      )}
    </Cajon>
  );
}
