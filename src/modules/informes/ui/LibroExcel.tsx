/* =============================================================================
   Libro de Excel del informe · cajón con dos pasos.

   Exportar: el informe completo en un libro (o uno por equipo, con las hojas que le tocan).
   Importar: se carga el libro devuelto, el sistema reconoce cada hoja, se corrige la
   clasificación, se revisan los avisos, se elige cómo aplicar y se escribe en el informe.
   Toda la lógica está en libro-informe.ts (pura y con pruebas); aquí solo la pantalla.
   Escribir sigue las reglas del informe: estado y rol (estados.ts) y secciones de solo lectura.
   ========================================================================== */

import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  MODOS,
  ETIQUETA_NIVEL,
  aplicar,
  armarLibro,
  armarLibrosPorEquipo,
  clasificar,
  destinosDe,
  elegirDestino,
  huellaDe,
  leerLibro,
  nombreArchivoLibro,
  validarControl,
} from "../libro-informe";
import type { ModoAplicacion, Propuesta, LibroLeido } from "../libro-informe";
import { opcionesPilar } from "../indicadores-manual";
import type { AnexoRow, CicloRow, ContenidoSeccion, InstanciaRow, PilarRef, RolInforme, SeccionDef } from "../types";
import { mensajeDe } from "./comunes";
import { descargarLibro, leerLibroCompleto } from "./excel";
import { Cajon } from "./Responsables";

interface Props {
  inst: InstanciaRow;
  ciclo: CicloRow;
  unidad: string;
  /** Las secciones activas del informe, con su título y permiso. */
  secciones: SeccionDef[];
  /** El contenido de una sección (lo que se ve, con lo que aún no se guardó). */
  contenido: (clave: string) => ContenidoSeccion;
  aprobados: { id: string; nombre: string }[];
  pilares: PilarRef[];
  anexos: AnexoRow[];
  actor: RolInforme | null;
  /** Escribe una sección (se guarda al momento y se recalcula si está lista). */
  escribir: (def: SeccionDef, c: ContenidoSeccion) => void;
  /** Suma evidencias de tipo enlace en informe_anexos. */
  agregarEvidencias: (enlaces: { url: string; nombre: string; descripcion: string }[]) => Promise<void>;
  onCerrar: () => void;
}

/** Equipos que se sugieren al repartir las hojas; se puede escribir cualquier otro. */
const EQUIPOS = ["Quien lidera el informe", "Decanatura", "Dirección de programa", "Coordinación de investigación", "Coordinación de extensión", "Secretaría académica"];
const EQUIPO_POR_TIPO: Record<string, string> = { narr: EQUIPOS[0], pdi: EQUIPOS[2], metas: EQUIPOS[2], dim: EQUIPOS[5], matriz: EQUIPOS[0], filas: EQUIPOS[2], logros: EQUIPOS[4], evid: EQUIPOS[5], anexos: EQUIPOS[0], libre: EQUIPOS[0] };
const TIPO_CHIP: Record<string, string> = { matriz: "Automática", anexos: "Automática", dim: "Cifras y acciones de la unidad" };

/** El logo del libro, si se puede leer; sin él, el libro sale igual, solo con la banda azul. */
async function cargarLogo(): Promise<string | undefined> {
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const r = await fetch(`${base}logo-udes-blanco.png`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return undefined;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LibroExcel(p: Props) {
  const [paso, setPaso] = useState<"exportar" | "importar">("exportar");
  return (
    <Cajon titulo="Libro de Excel" subtitulo={p.unidad} onCerrar={p.onCerrar} ancho>
      <p className="inf-sub">Todo el informe en un solo libro, para compartirlo con su equipo o con otras oficinas, recoger la información y cargarla de vuelta.</p>
      <div className="inf-seg inf-lx-pasos" role="tablist" aria-label="Qué quiere hacer">
        <button type="button" role="tab" id="lx-t-exportar" aria-selected={paso === "exportar"} aria-pressed={paso === "exportar"} aria-controls="lx-p-exportar" onClick={() => setPaso("exportar")}>
          1 · Exportar
        </button>
        <button type="button" role="tab" id="lx-t-importar" aria-selected={paso === "importar"} aria-pressed={paso === "importar"} aria-controls="lx-p-importar" onClick={() => setPaso("importar")}>
          2 · Importar
        </button>
      </div>
      {paso === "exportar" ? (
        <div role="tabpanel" id="lx-p-exportar" aria-labelledby="lx-t-exportar">
          <Exportar {...p} />
        </div>
      ) : (
        <div role="tabpanel" id="lx-p-importar" aria-labelledby="lx-t-importar">
          <Importar {...p} />
        </div>
      )}
    </Cajon>
  );
}

/* ---------- Exportar ------------------------------------------------------------------------ */

function Exportar({ inst, ciclo, unidad, secciones, contenido, aprobados, pilares, anexos }: Props) {
  const [modo, setModo] = useState<"completo" | "equipos">("completo");
  const [incluidas, setIncluidas] = useState<Set<string>>(() => new Set(secciones.map((s) => s.clave)));
  const [equipo, setEquipo] = useState<Record<string, string>>(() => Object.fromEntries(secciones.map((s) => [s.clave, EQUIPO_POR_TIPO[s.tipo] ?? EQUIPOS[0]])));
  const [proteger, setProteger] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const idLista = useId();

  const entrada = useMemo(
    () => ({ ciclo: { id: ciclo.id, anio: ciclo.anio }, instancia: inst.id, unidad, plantilla: inst.plantilla, secciones, contenidos: Object.fromEntries(secciones.map((s) => [s.clave, contenido(s.clave)])), aprobados, pilares, anexos, proteger }),
    [ciclo.id, ciclo.anio, inst.id, inst.plantilla, unidad, secciones, contenido, aprobados, pilares, anexos, proteger],
  );

  const elegidas = secciones.filter((s) => incluidas.has(s.clave));
  const libros = useMemo(() => {
    if (!elegidas.length) return [] as { archivo: string; hojas: number; equipo?: string; ejecutar: () => ReturnType<typeof armarLibro> }[];
    if (modo === "completo") {
      const claves = elegidas.map((s) => s.clave);
      return [{ archivo: nombreArchivoLibro(entrada), hojas: 0, ejecutar: () => armarLibro(entrada, { incluir: claves }) }];
    }
    return armarLibrosPorEquipo(entrada, Object.fromEntries(elegidas.map((s) => [s.clave, (equipo[s.clave] ?? "").trim()]))).map((l) => ({ archivo: l.archivo, hojas: l.claves.length, equipo: l.equipo, ejecutar: () => l.hojas }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elegidas sale de incluidas y secciones
  }, [modo, entrada, equipo, incluidas, secciones]);

  const sinEquipo = modo === "equipos" && elegidas.some((s) => !(equipo[s.clave] ?? "").trim());
  const nHojas = (k: number) => (modo === "completo" ? elegidas.length + elegidas.filter((s) => s.tipo === "dim" && !s.consolida).length : libros[k]?.hojas ?? 0);

  const alternar = (clave: string) =>
    setIncluidas((a) => {
      const n = new Set(a);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });

  const descargar = async () => {
    setOcupado(true);
    setMensaje("");
    try {
      const logo = await cargarLogo();
      for (let k = 0; k < libros.length; k++) {
        await descargarLibro(libros[k].archivo, libros[k].ejecutar(), { logo });
        if (k < libros.length - 1) await esperar(350);
      }
      setMensaje(libros.length === 1 ? `Se descargó ${libros[0].archivo}.` : `Se descargaron ${libros.length} libros. Si su navegador pidió permiso para varias descargas, acéptelo.`);
    } catch (e) {
      setMensaje(`No se pudo crear el libro: ${mensajeDe(e)}`);
    }
    setOcupado(false);
  };

  return (
    <div className="inf-lx">
      <fieldset className="inf-lx-grupo">
        <legend className="inf-eyebrow">Qué descargar</legend>
        <label className="inf-lx-opcion">
          <input type="radio" name="lx-modo" checked={modo === "completo"} onChange={() => setModo("completo")} />
          <span>
            <b>Un libro completo</b>
            <small>Todas las hojas en un solo archivo.</small>
          </span>
        </label>
        <label className="inf-lx-opcion">
          <input type="radio" name="lx-modo" checked={modo === "equipos"} onChange={() => setModo("equipos")} />
          <span>
            <b>Un libro por equipo</b>
            <small>Asigne cada sección a un equipo y se descarga un libro por equipo, solo con sus hojas.</small>
          </span>
        </label>
      </fieldset>

      <fieldset className="inf-lx-grupo">
        <legend className="inf-eyebrow">
          Hojas · {elegidas.length} de {secciones.length}
        </legend>
        <ul className="inf-lx-lista">
          {secciones.map((s, i) => (
            <li key={s.clave} className="inf-lx-hoja">
              <label className="inf-lx-hoja__marca">
                <input type="checkbox" checked={incluidas.has(s.clave)} onChange={() => alternar(s.clave)} aria-label={`Incluir ${s.titulo}`} />
                <span className="inf-lx-n inf-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="inf-lx-hoja__t">{s.titulo}</span>
              </label>
              <span className="inf-pill">{TIPO_CHIP[s.tipo] ?? "Se diligencia"}</span>
              {modo === "equipos" && incluidas.has(s.clave) && (
                <input
                  className="inf-in inf-lx-equipo"
                  list={idLista}
                  value={equipo[s.clave] ?? ""}
                  onChange={(e) => setEquipo((q) => ({ ...q, [s.clave]: e.target.value }))}
                  aria-label={`Equipo de ${s.titulo}`}
                  placeholder="Equipo"
                />
              )}
            </li>
          ))}
        </ul>
        <datalist id={idLista}>
          {EQUIPOS.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
        <p className="inf-hint">
          La portada, las listas y el control van siempre. Azul claro = se diligencia, amarillo = obligatoria, gris = la pone el sistema. Los resultados se escriben en el mismo formato de «Resultados y evidencias».
        </p>
      </fieldset>

      <label className="inf-lx-opcion">
        <input type="checkbox" checked={proteger} onChange={(e) => setProteger(e.target.checked)} />
        <span>
          <b>Bloquear las celdas grises</b>
          <small>Protege la hoja sin contraseña: solo se escribe en las celdas de color. Se quita desde Revisar → Desproteger hoja.</small>
        </span>
      </label>

      <div className="inf-lx-archivos" aria-live="polite">
        <span className="inf-eyebrow">Archivos</span>
        {sinEquipo ? (
          <p className="inf-error" role="alert">
            Falta el equipo de alguna hoja.
          </p>
        ) : libros.length ? (
          libros.map((l, k) => (
            <div key={l.archivo} className="inf-lx-archivo">
              <b>{l.archivo}</b>
              <span>{nHojas(k) + 3} hojas</span>
            </div>
          ))
        ) : (
          <p className="inf-muted">Elija al menos una hoja.</p>
        )}
      </div>

      <div className="inf-row">
        <button type="button" className="inf-btn inf-btn--pri" disabled={ocupado || !libros.length || sinEquipo} onClick={() => void descargar()}>
          {ocupado ? "Preparando…" : libros.length > 1 ? `Descargar ${libros.length} libros` : "Descargar libro"}
        </button>
      </div>
      {mensaje && (
        <p className="inf-hint" role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}

/* ---------- Importar ------------------------------------------------------------------------- */

interface Cargado {
  archivo: string;
  libro: LibroLeido;
  propuestas: Propuesta[];
  avisos: string[];
}

const BANDA: Record<Propuesta["nivel"], string> = { reconocida: "is-ok", revisar: "is-mid", sin: "is-bad" };

function Importar({ inst, ciclo, secciones, contenido, aprobados, pilares, anexos, actor, escribir, agregarEvidencias }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [cargado, setCargado] = useState<Cargado | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [modo, setModo] = useState<ModoAplicacion>("agregar");
  const [aporta, setAporta] = useState("");
  const [encima, setEncima] = useState(false);
  const [hecho, setHecho] = useState("");
  const idAporta = useId();

  const destinos = useMemo(() => destinosDe(secciones), [secciones]);
  const contenidos = useMemo(() => Object.fromEntries(secciones.map((s) => [s.clave, contenido(s.clave)])), [secciones, contenido]);
  const pilaresOp = useMemo(() => opcionesPilar(pilares), [pilares]);

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true);
    setError("");
    setHecho("");
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error("Solo se leen libros .xlsx. Si lo tiene en .xls o .csv, ábralo en Excel y guárdelo como .xlsx.");
      const libro = leerLibro(await leerLibroCompleto(f));
      const control = validarControl(libro.control, { ciclo: ciclo.id, instancia: inst.id, plantilla: inst.plantilla, huella: huellaDe(inst.plantilla, secciones) });
      if (control.error) {
        setCargado(null);
        setError(control.error);
      } else if (!libro.bloques.length) {
        setCargado(null);
        setError("El libro no tiene hojas con encabezado y filas para importar.");
      } else {
        setCargado({ archivo: f.name, libro, propuestas: clasificar(libro.bloques, destinos, libro.control), avisos: control.avisos });
        setAporta(libro.control?.valores.equipo ?? "");
      }
    } catch (e) {
      setCargado(null);
      setError(`No se pudo abrir el libro: ${mensajeDe(e)}`);
    }
    setOcupado(false);
    if (entrada.current) entrada.current.value = "";
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    void leer(e.dataTransfer.files[0]);
  };

  const cambiarDestino = (k: number, id: string) => {
    if (!cargado) return;
    const d = destinos.find((x) => x.id === id) ?? null;
    const propuestas = cargado.propuestas.map((p, i) => (i === k ? elegirDestino(cargado.libro.bloques[k], d) : p));
    setCargado({ ...cargado, propuestas });
  };

  const r = useMemo(
    () =>
      cargado
        ? aplicar({
            bloques: cargado.libro.bloques,
            propuestas: cargado.propuestas,
            contexto: { secciones, contenidos, aprobados, pilares: pilaresOp, anexos },
            modo,
            estado: inst.estado,
            rol: actor,
            aporta,
          })
        : null,
    [cargado, secciones, contenidos, aprobados, pilaresOp, anexos, modo, inst.estado, actor, aporta],
  );

  const aplicarAlInforme = async () => {
    if (!r || r.bloqueado) return;
    const claves = Object.keys(r.contenidos);
    if (modo === "reemplazar") {
      const nombres = claves.map((c) => secciones.find((s) => s.clave === c)?.titulo).filter(Boolean).join(", ");
      if (!window.confirm(`Reemplaza lo escrito en: ${nombres || "las secciones importadas"}. Las evidencias no se reemplazan. ¿Continuar?`)) return;
    }
    setOcupado(true);
    setError("");
    try {
      for (const clave of claves) {
        const def = secciones.find((s) => s.clave === clave);
        if (def) escribir(def, r.contenidos[clave]);
      }
      if (r.evidencias.length) await agregarEvidencias(r.evidencias);
      setHecho(`${r.resumen}${r.avisos.length ? ` Revise ${r.avisos.length} ${r.avisos.length === 1 ? "aviso" : "avisos"} antes de enviar.` : ""}`);
      setCargado(null);
    } catch (e) {
      setError(`No se pudo aplicar: ${mensajeDe(e)}`);
    }
    setOcupado(false);
  };

  const nada = !r || (!Object.keys(r.contenidos).length && !r.evidencias.length);

  return (
    <div className="inf-lx">
      {hecho && (
        <div className="inf-nota" role="status">
          <b>Libro aplicado</b>
          {hecho}
          <small className="inf-muted">El nombre de quien aporta queda en este aviso y en la descripción de las evidencias nuevas; el informe no tiene un campo para guardarlo en las demás secciones.</small>
        </div>
      )}
      {error && (
        <p className="inf-error" role="alert">
          {error}
        </p>
      )}

      {!cargado && (
        <div className={`inf-lx-soltar${encima ? " is-encima" : ""}`} onDragOver={(e) => (e.preventDefault(), setEncima(true))} onDragLeave={() => setEncima(false)} onDrop={soltar}>
          <input ref={entrada} type="file" hidden accept=".xlsx" onChange={(e: ChangeEvent<HTMLInputElement>) => void leer(e.target.files?.[0])} />
          <b>Cargue el libro devuelto</b>
          <span className="inf-muted">Arrastre el .xlsx aquí o elíjalo. Si salió de este informe se reconoce solo; si lo armó otra oficina, se compara por encabezados.</span>
          <button type="button" className="inf-btn inf-btn--pri" disabled={ocupado} onClick={() => entrada.current?.click()}>
            {ocupado ? "Leyendo…" : "Elegir archivo"}
          </button>
        </div>
      )}

      {cargado && r && (
        <>
          <div className="inf-lx-cab">
            <div>
              <b>{cargado.archivo}</b>
              <span className="inf-muted">
                {cargado.libro.bloques.length} hojas · {cargado.libro.bloques.reduce((s, b) => s + b.filas.length, 0)} filas
              </span>
            </div>
            <span className={`inf-pill ${cargado.libro.control ? "is-ok" : "is-mid"}`}>{cargado.libro.control ? "Libro del sistema · reconocido" : "Libro de terceros · por encabezados"}</span>
            <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setCargado(null)}>
              Cargar otro
            </button>
          </div>

          {cargado.avisos.map((a) => (
            <p key={a} className="inf-nota" role="note">
              {a}
            </p>
          ))}

          <section aria-label="Clasificación de las hojas" className="inf-lx-clas">
            <h3 className="inf-eyebrow">Qué hoja va a qué sección</h3>
            <ul className="inf-lx-lista">
              {cargado.libro.bloques.map((b, k) => {
                const prop = cargado.propuestas[k];
                const d = prop.destino ? destinos.find((x) => x.id === prop.destino) : undefined;
                const pct = Math.round(prop.puntaje * 100);
                return (
                  <li key={b.hoja} className="inf-lx-fila">
                    <div className="inf-lx-fila__hoja">
                      <b>{b.hoja}</b>
                      <span className="inf-muted">
                        {b.filas.length} filas · {b.encabezados.length} columnas
                      </span>
                    </div>
                    <div className="inf-lx-fila__sel">
                      <select className="inf-in" aria-label={`Sección para ${b.hoja}`} value={prop.destino ?? "no"} onChange={(e) => cambiarDestino(k, e.target.value === "no" ? "" : e.target.value)}>
                        {destinos.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.titulo}
                          </option>
                        ))}
                        <option value="no">{prop.referencia ? "Solo referencia: no se importa" : "No importar esta hoja"}</option>
                      </select>
                      {d && (
                        <div className="inf-lx-cols">
                          {d.columnas.map((c, j) =>
                            c.alias ? (
                              prop.columnas[j] >= 0 ? (
                                <span key={c.titulo} className="inf-pill is-ok">
                                  {b.encabezados[prop.columnas[j]]} → {c.titulo}
                                </span>
                              ) : (
                                <span key={c.titulo} className="inf-pill is-bad">
                                  {c.titulo} · falta
                                </span>
                              )
                            ) : null,
                          )}
                        </div>
                      )}
                    </div>
                    <div className="inf-lx-fila__conf">
                      <span className={`inf-pill ${prop.referencia ? "" : BANDA[prop.nivel]}`}>{prop.referencia ? "Referencia" : prop.origen === "control" ? "Por _Control · 100 %" : prop.origen === "manual" ? "Elegida por usted" : `${ETIQUETA_NIVEL[prop.nivel]} · ${pct} %`}</span>
                      {prop.ambigua && <small className="inf-muted">Otra sección puntúa igual: confirme.</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Revisión" className="inf-lx-rev">
            <h3 className="inf-eyebrow">Revisión</h3>
            <div className="inf-lx-cuentas" role="status">
              <div>
                <b className="inf-num">{r.totales.listas}</b>
                <span>filas listas</span>
              </div>
              <div>
                <b className="inf-num">{r.totales.conAviso}</b>
                <span>con aviso</span>
              </div>
              <div>
                <b className="inf-num">{r.totales.sinImportar}</b>
                <span>sin importar</span>
              </div>
            </div>
            {r.avisos.length ? (
              <details className="inf-lx-avisos" open={r.avisos.length <= 6}>
                <summary>
                  {r.avisos.length} {r.avisos.length === 1 ? "aviso" : "avisos"}
                </summary>
                <ul>
                  {r.avisos.slice(0, 60).map((a, i) => (
                    <li key={`${i}-${a}`}>{a}</li>
                  ))}
                  {r.avisos.length > 60 && <li>y {r.avisos.length - 60} avisos más.</li>}
                </ul>
              </details>
            ) : (
              <p className="inf-hint">Todo coincide con la plantilla. No hay avisos.</p>
            )}
            {r.secciones.length > 0 && (
              <ul className="inf-lx-secs" aria-label="Qué pasaría en cada sección">
                {r.secciones.map((s) => (
                  <li key={s.clave}>
                    <b>{s.titulo}</b>
                    <span>
                      {s.agregadas} nuevas · {s.completadas} completadas · {s.omitidas} ya estaban
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <fieldset className="inf-lx-grupo">
            <legend className="inf-eyebrow">Cómo aplicar</legend>
            {MODOS.map((m) => (
              <label key={m.id} className="inf-lx-opcion">
                <input type="radio" name="lx-aplicar" checked={modo === m.id} onChange={() => setModo(m.id)} />
                <span>
                  <b>{m.titulo}</b>
                  <small>{m.ayuda}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="inf-lx-aporta">
            <label htmlFor={idAporta} className="inf-eyebrow">
              Quién aporta este libro
            </label>
            <input id={idAporta} className="inf-in" value={aporta} onChange={(e) => setAporta(e.target.value)} placeholder="Equipo u oficina, p. ej. Secretaría académica" maxLength={120} />
          </div>

          {r.bloqueado && (
            <p className="inf-error" role="alert">
              {r.bloqueado}
            </p>
          )}
          <div className="inf-row">
            <button type="button" className="inf-btn inf-btn--pri" disabled={ocupado || Boolean(r.bloqueado) || nada} onClick={() => void aplicarAlInforme()}>
              {ocupado ? "Aplicando…" : "Aplicar al informe"}
            </button>
            {nada && !r.bloqueado && <span className="inf-hint">No hay nada que aplicar con esta clasificación.</span>}
          </div>
        </>
      )}
    </div>
  );
}
