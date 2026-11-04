/* =============================================================================
   Resultados por dimensión · indicadores escritos a mano.

   La unidad escribe, por criterio, la cifra actual, la anterior y la meta; el
   estado no se teclea: sale de la aritmética (indicadores-manual.ts) y se dice
   en palabras y en porcentaje. Los criterios son los base de la plantilla, los
   que Planeación aprobó y los que la unidad escribe para su informe (que puede
   sugerir a Planeación para ciclos siguientes). Todo se puede bajar y subir en
   Excel.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { formatoCifra, numeroDe } from "../cifras-vivas";
import {
  COLUMNAS_EXCEL,
  MAS_ES_MEJOR,
  MENOS_ES_MEJOR,
  criteriosDe,
  evaluar,
  faltantes,
  filasParaExcel,
  indicadorNuevo,
  leerFilasIndicadores,
  normalizar,
  idNuevo,
} from "../indicadores-manual";
import type { Criterio, CriterioPropio, IndicadorManual, LecturaIndicadores } from "../indicadores-manual";
import { ETIQUETA_ESTADO_META } from "../vista/estados";
import type { EstadoMeta } from "../vista/estados";
import { faltaRequerido, respuestaNueva, textoFuenteReq } from "../requeridos-logica";
import type { DatoRequerido } from "../requeridos-logica";
import type { ContenidoSeccion, SeccionDef } from "../types";
import { mensajeDe } from "./comunes";
import { descargarLibro, leerHoja } from "./excel";

const TONO: Record<EstadoMeta, string> = { superada: "is-ok", cumplida: "is-teal", parcial: "is-mid", rezagada: "is-bad" };
const FORMA: Record<EstadoMeta, string> = { superada: "▲", cumplida: "●", parcial: "◐", rezagada: "▼" };

/** Número con coma o punto: guarda lo que se teclea y entrega el número cuando se entiende. */
function CeldaNumero({ valor, onChange, etiqueta, editable }: { valor: number | null; onChange: (n: number | null) => void; etiqueta: string; editable: boolean }) {
  const [txt, setTxt] = useState(valor === null ? "" : String(valor).replace(".", ","));
  useEffect(() => {
    if (valor !== numeroDe(txt)) setTxt(valor === null ? "" : String(valor).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia desde afuera
  }, [valor]);
  return (
    <input
      className="inf-in inf-num"
      inputMode="decimal"
      aria-label={etiqueta}
      readOnly={!editable}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        onChange(e.target.value.trim() === "" ? null : numeroDe(e.target.value));
      }}
    />
  );
}

export function EstadoMetaPill({ estado }: { estado: EstadoMeta | null }) {
  if (!estado) return <span className="inf-muted">Sin meta</span>;
  return (
    <span className={`inf-pill ${TONO[estado]}`}>
      <span aria-hidden="true">{FORMA[estado]} </span>
      {ETIQUETA_ESTADO_META[estado]}
    </span>
  );
}

interface Props {
  def: SeccionDef;
  c: ContenidoSeccion;
  editable: boolean;
  /** Criterios aprobados por Planeación que rigen en este ciclo para esta plantilla. */
  aprobados: { id: string; nombre: string }[];
  exigirFuente: boolean;
  cambiar: (c: ContenidoSeccion) => void;
  /** Sugiere un criterio propio a Planeación para los ciclos siguientes. */
  sugerir: (p: CriterioPropio) => Promise<void>;
  /** Hay tabla de criterios en la base (migración 0252). */
  puedeSugerir: boolean;
  /** Datos que Planeación pide a esta sección (0253): aparecen ya listados y no se pueden quitar. */
  requeridos?: DatoRequerido[];
}

export function ResultadosManuales({ def, c, editable, aprobados, exigirFuente, cambiar, sugerir, puedeSugerir, requeridos = [] }: Props) {
  const indicadores = normalizar(c.indicadores);
  const propios = c.criterios_propios ?? [];
  const criterios = criteriosDe(def.dims ?? [], aprobados, propios);
  // Las respuestas a lo que pide Planeación se muestran en su propio bloque, no entre los criterios.
  const clavesPedidas = new Set(requeridos.map((r) => r.clave));
  const visibles = indicadores.filter((i) => !(i.requerido && clavesPedidas.has(i.requerido)));
  // Indicadores de un criterio que ya no existe (archivado): se muestran aparte, sin perderlos.
  const huerfanos = visibles.filter((i) => !criterios.some((k) => k.id === i.criterio));
  const grupos: Criterio[] = [...criterios, ...(huerfanos.length ? [{ id: "__otros", nombre: "Otros indicadores", origen: "propio" as const }] : [])];

  const entrada = useRef<HTMLInputElement>(null);
  const [nuevo, setNuevo] = useState("");
  const [previa, setPrevia] = useState<(LecturaIndicadores & { archivo: string }) | { error: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const poner = (lista: IndicadorManual[], extra: Partial<ContenidoSeccion> = {}) => cambiar({ ...c, indicadores: lista, ...extra });
  const cambiarIndicador = (id: string, cambios: Partial<IndicadorManual>) => poner(indicadores.map((i) => (i.id === id ? { ...i, ...cambios } : i)));
  const quitar = (id: string) => poner(indicadores.filter((i) => i.id !== id));
  /** Escribe en la respuesta a un dato requerido; la crea al primer cambio. Nombre, unidad y sentido los fija Planeación. */
  const cambiarRequerido = (r: DatoRequerido, cambios: Partial<IndicadorManual>) => {
    const fijos = { nombre: r.dato, unidad: r.unidad, mayorMejor: r.mayor_mejor, criterio: r.criterio, requerido: r.clave };
    const previa = indicadores.find((i) => i.requerido === r.clave);
    if (previa) poner(indicadores.map((i) => (i === previa ? { ...i, ...cambios, ...fijos } : i)));
    else poner([...indicadores, { ...respuestaNueva(r, criterios.find((k) => k.id === r.criterio)?.nombre ?? ""), ...cambios }]);
  };

  const agregarCriterio = () => {
    const nombre = nuevo.trim();
    if (nombre.length < 3) return;
    if (criterios.some((k) => k.nombre.toLowerCase() === nombre.toLowerCase())) {
      setAviso("Ya existe un criterio con ese nombre.");
      return;
    }
    cambiar({ ...c, criterios_propios: [...propios, { id: `l_${idNuevo()}`, nombre }] });
    setNuevo("");
    setAviso("");
  };

  const sugerirCriterio = async (p: CriterioPropio) => {
    setOcupado(true);
    try {
      await sugerir(p);
      cambiar({ ...c, criterios_propios: propios.map((x) => (x.id === p.id ? { ...x, sugerido: true } : x)) });
      setAviso(`«${p.nombre}» quedó sugerido a Planeación.`);
    } catch (e) {
      setAviso(mensajeDe(e));
    }
    setOcupado(false);
  };

  const plantilla = async () => {
    const ejemplo: IndicadorManual[] = criterios.slice(0, 2).map((k, n) => ({ ...indicadorNuevo(k.id, k.nombre), nombre: n ? "Ejemplo: profesores con doctorado" : "Ejemplo: tasa de graduación", unidad: "%", anterior: n ? 18 : 62, actual: n ? 21 : 66, meta: n ? 25 : 70, fuente: "Oficina de la unidad" }));
    await descargarLibro("plantilla-resultados-por-dimension.xlsx", [
      {
        nombre: "Indicadores",
        columnas: COLUMNAS_EXCEL.map((t, n) => ({ titulo: t, ancho: n === 1 || n === 8 ? 40 : n === 0 ? 34 : 16 })),
        filas: filasParaExcel(ejemplo, criterios),
        listas: { 0: criterios.map((k) => k.nombre.replace(/,/g, " ")), 3: [MAS_ES_MEJOR, MENOS_ES_MEJOR] },
        ayuda: [
          "Una fila por indicador. Borre las filas de ejemplo.",
          "Criterio: elija de la lista o escriba uno nuevo; si no existe se crea como criterio propio de su unidad.",
          `Qué es mejor: «${MAS_ES_MEJOR}» (matrícula, graduados) o «${MENOS_ES_MEJOR}» (deserción, tiempos).`,
          "Año anterior, Cifra actual y Meta: solo números (puede usar coma decimal). El estado no se escribe: lo calcula el informe.",
          "Unidad: déjela vacía para conteos, o escriba % o pp.",
        ].join("\n"),
      },
      { nombre: "Criterios", columnas: [{ titulo: "Criterios disponibles", ancho: 50 }], filas: criterios.map((k) => [k.nombre]) },
    ]);
  };

  const exportar = async () => {
    await descargarLibro("resultados-por-dimension.xlsx", [
      {
        nombre: "Indicadores",
        columnas: COLUMNAS_EXCEL.map((t, n) => ({ titulo: t, ancho: n === 1 || n === 8 ? 40 : n === 0 ? 34 : 16 })),
        filas: filasParaExcel(indicadores, [...criterios, ...(huerfanos.length ? [] : [])]),
      },
    ]);
  };

  const leer = async (archivo: File | undefined) => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const filas = await leerHoja(archivo, "Indicadores");
      if (filas.length < 2) setPrevia({ error: "La hoja «Indicadores» no tiene filas. Use la plantilla que se descarga aquí." });
      else {
        const r = leerFilasIndicadores(filas, criterios);
        setPrevia(r.indicadores.length ? { ...r, archivo: archivo.name } : { error: r.avisos.join(" ") || "No se encontró ningún indicador en el archivo." });
      }
    } catch (e) {
      setPrevia({ error: `No se pudo abrir el Excel: ${mensajeDe(e)}` });
    }
    setOcupado(false);
    if (entrada.current) entrada.current.value = "";
  };

  const usarImportado = (reemplazar: boolean) => {
    if (!previa || "error" in previa) return;
    const nuevosCrit = previa.criteriosNuevos.filter((n) => !propios.some((p) => p.nombre.toLowerCase() === n.nombre.toLowerCase()));
    poner(reemplazar ? [...indicadores.filter((i) => i.requerido && clavesPedidas.has(i.requerido)), ...previa.indicadores] : [...indicadores, ...previa.indicadores], { criterios_propios: [...propios, ...nuevosCrit] });
    setPrevia(null);
  };

  return (
    <div className="inf-rm">
      {editable && (
        <div className="inf-row inf-plan__barra">
          <input ref={entrada} type="file" hidden accept=".xlsx" onChange={(e) => void leer(e.target.files?.[0])} />
          <button type="button" className="inf-btn inf-btn--sm" disabled={ocupado} onClick={() => entrada.current?.click()}>
            Importar Excel
          </button>
          <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => void plantilla()}>
            Descargar plantilla
          </button>
          {indicadores.length > 0 && (
            <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => void exportar()}>
              Bajar lo escrito
            </button>
          )}
        </div>
      )}

      {previa && (
        <div className="inf-nota" role="status">
          {"error" in previa ? (
            <>
              <b>No se pudo leer el archivo</b>
              {previa.error}
              <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>
                Vista previa · {previa.indicadores.length} {previa.indicadores.length === 1 ? "indicador" : "indicadores"} de {previa.archivo}
              </b>
              {previa.avisos.length > 0 && (
                <ul>
                  {previa.avisos.slice(0, 8).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {previa.avisos.length > 8 && <li>y {previa.avisos.length - 8} avisos más.</li>}
                </ul>
              )}
              <span className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={() => usarImportado(false)}>
                  Añadir a lo que ya hay
                </button>
                {indicadores.length > 0 && (
                  <button type="button" className="inf-btn inf-btn--sm" onClick={() => window.confirm(`Reemplaza los ${indicadores.length} indicadores escritos. ¿Continuar?`) && usarImportado(true)}>
                    Reemplazar todo
                  </button>
                )}
                <button type="button" className="inf-btn inf-btn--sm inf-btn--ghost" onClick={() => setPrevia(null)}>
                  Descartar
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {requeridos.length > 0 && (
        <section className="inf-dim" aria-label="Lo que pide Planeación">
          <div className="inf-dim__top">
            <h4 className="inf-eyebrow">
              Lo que pide Planeación <span className="inf-pill is-own">{requeridos.length}</span>
            </h4>
          </div>
          <div className="inf-dimtab-wrap">
            <table className="inf-dimtab inf-rm__tab">
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Mejor</th>
                  <th scope="col">Anterior</th>
                  <th scope="col">Actual</th>
                  <th scope="col">Meta</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {requeridos.map((r) => (
                  <FilaRequerida key={r.clave} r={r} resp={indicadores.find((i) => i.requerido === r.clave)} criterio={criterios.find((k) => k.id === r.criterio)?.nombre ?? ""} editable={editable} cambiar={(x) => cambiarRequerido(r, x)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {grupos.map((k) => {
        const lista = k.id === "__otros" ? huerfanos : visibles.filter((i) => i.criterio === k.id);
        if (!lista.length && !editable) return null;
        return (
          <section key={k.id} className="inf-dim" aria-label={k.nombre}>
            <div className="inf-dim__top">
              <h4 className="inf-eyebrow">
                {k.nombre}
                {k.origen === "propio" && k.id !== "__otros" && <span className="inf-pill is-own"> propio</span>}
              </h4>
              {k.origen === "propio" && k.id !== "__otros" && editable && puedeSugerir && (
                <button
                  type="button"
                  className="inf-link"
                  disabled={ocupado || propios.find((p) => p.id === k.id)?.sugerido}
                  onClick={() => void sugerirCriterio(propios.find((p) => p.id === k.id) ?? { id: k.id, nombre: k.nombre })}
                >
                  {propios.find((p) => p.id === k.id)?.sugerido ? "Sugerido a Planeación" : "Sugerir a Planeación para próximos ciclos"}
                </button>
              )}
            </div>
            {lista.length > 0 && (
              <div className="inf-dimtab-wrap">
                <table className="inf-dimtab inf-rm__tab">
                  <thead>
                    <tr>
                      <th scope="col">Indicador</th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Mejor</th>
                      <th scope="col">Anterior</th>
                      <th scope="col">Actual</th>
                      <th scope="col">Meta</th>
                      <th scope="col">Estado</th>
                      <th scope="col">
                        <span className="sr-only">Quitar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((i) => (
                      <Fila key={i.id} i={i} editable={editable} exigirFuente={exigirFuente} cambiar={(x) => cambiarIndicador(i.id, x)} quitar={() => quitar(i.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {editable && k.id !== "__otros" && (
              <div className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={() => poner([...indicadores, indicadorNuevo(k.id, k.nombre)])}>
                  + Añadir indicador
                </button>
                {!lista.length && <span className="inf-hint">Aún no hay indicadores en este criterio.</span>}
              </div>
            )}
          </section>
        );
      })}

      {editable && (
        <div className="inf-rm__nuevo">
          <label className="inf-lab">
            Un criterio propio para su informe
            <span className="inf-row">
              <input
                className="inf-in"
                value={nuevo}
                maxLength={80}
                placeholder="Ej.: Bienestar y permanencia estudiantil"
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarCriterio()}
              />
              <button type="button" className="inf-btn inf-btn--sm" disabled={nuevo.trim().length < 3} onClick={agregarCriterio}>
                Crear criterio
              </button>
            </span>
          </label>
          <small className="inf-hint">Lo usa ya en este informe. Si le sirve a otras unidades, sugiéralo a Planeación y se aprueba para el siguiente ciclo.</small>
        </div>
      )}
      {aviso && (
        <p className="inf-hint" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Un dato que pide Planeación: nombre, unidad y sentido vienen fijos; la unidad llena sus cifras, su fuente y su nota. */
function FilaRequerida({ r, resp, criterio, editable, cambiar }: { r: DatoRequerido; resp: IndicadorManual | undefined; criterio: string; editable: boolean; cambiar: (x: Partial<IndicadorManual>) => void }) {
  const i: IndicadorManual = resp ?? respuestaNueva(r, criterio);
  const ev = evaluar({ actual: i.actual, anterior: i.anterior, meta: i.meta, mayorMejor: r.mayor_mejor, unidad: r.unidad });
  const falta = faltaRequerido(r, resp);
  const obligatorio = r.condicion === "justificar";
  return (
    <>
      <tr>
        <td>
          <b>{r.dato}</b>
          <br />
          <span className="inf-pill is-own">{obligatorio ? "Lo pide Planeación" : "Sugerido por Planeación"}</span>{" "}
          <small className="inf-hint">
            {textoFuenteReq(r.fuente_tipo)}
            {r.fuente_nombre ? ` · ${r.fuente_nombre}` : ""}
            {criterio ? ` · ${criterio}` : ""}
          </small>
        </td>
        <td>{r.unidad.trim() || "Conteo"}</td>
        <td>{r.mayor_mejor ? "Más" : "Menos"}</td>
        <td>
          <CeldaNumero valor={i.anterior} etiqueta={`Año anterior de ${r.dato}`} editable={editable} onChange={(n) => cambiar({ anterior: n })} />
        </td>
        <td>
          <CeldaNumero valor={i.actual} etiqueta={`Cifra actual de ${r.dato}`} editable={editable} onChange={(n) => cambiar({ actual: n })} />
        </td>
        <td>
          <CeldaNumero valor={i.meta} etiqueta={`Meta de ${r.dato}`} editable={editable} onChange={(n) => cambiar({ meta: n })} />
        </td>
        <td>
          <EstadoMetaPill estado={ev.estado} />
          {ev.logroMeta !== null && <small className="inf-num"> {formatoCifra(ev.logroMeta, " %")} de la meta</small>}
        </td>
      </tr>
      <tr className="inf-dimtab__det">
        <td colSpan={7}>
          <p className="inf-rm__lectura">{ev.texto}</p>
          {falta.length > 0 && <small className="inf-hint">Falta {falta.join(", ")}.</small>}
          <div className="inf-rm__det">
            <label className="inf-lab">
              Fuente propia de la unidad
              <input className="inf-in" readOnly={!editable} value={i.fuente} placeholder={r.fuente_nombre || "Oficina, sistema o documento de donde sale la cifra"} onChange={(e) => cambiar({ fuente: e.target.value })} />
            </label>
            <label className="inf-lab">
              Justificación{obligatorio ? " (obligatoria)" : ""}
              <textarea className="inf-in" rows={2} readOnly={!editable} value={i.nota} placeholder="¿Qué explica el resultado de esta cifra?" onChange={(e) => cambiar({ nota: e.target.value })} />
            </label>
          </div>
        </td>
      </tr>
    </>
  );
}

function Fila({ i, editable, exigirFuente, cambiar, quitar }: { i: IndicadorManual; editable: boolean; exigirFuente: boolean; cambiar: (x: Partial<IndicadorManual>) => void; quitar: () => void }) {
  const ev = evaluar(i);
  const falta = faltantes(i, exigirFuente);
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <tr>
        <td>
          <input className="inf-in" aria-label="Indicador" placeholder="Nombre del indicador" readOnly={!editable} value={i.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
        </td>
        <td>
          <select className="inf-in" aria-label="Unidad" disabled={!editable} value={i.unidad} onChange={(e) => cambiar({ unidad: e.target.value })}>
            <option value="">Conteo</option>
            <option value=" %">%</option>
            <option value=" pp">pp</option>
            <option value=" $">$</option>
          </select>
        </td>
        <td>
          <select className="inf-in" aria-label="Qué es mejor" disabled={!editable} value={i.mayorMejor ? "mas" : "menos"} onChange={(e) => cambiar({ mayorMejor: e.target.value === "mas" })}>
            <option value="mas">Más</option>
            <option value="menos">Menos</option>
          </select>
        </td>
        <td>
          <CeldaNumero valor={i.anterior} etiqueta="Año anterior" editable={editable} onChange={(n) => cambiar({ anterior: n })} />
        </td>
        <td>
          <CeldaNumero valor={i.actual} etiqueta="Cifra actual" editable={editable} onChange={(n) => cambiar({ actual: n })} />
        </td>
        <td>
          <CeldaNumero valor={i.meta} etiqueta="Meta" editable={editable} onChange={(n) => cambiar({ meta: n })} />
        </td>
        <td>
          <EstadoMetaPill estado={ev.estado} />
          {ev.logroMeta !== null && <small className="inf-num"> {formatoCifra(ev.logroMeta, " %")} de la meta</small>}
        </td>
        <td className="inf-dimtab__acc">
          <button type="button" className="inf-link" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
            Detalle
          </button>
          {editable && (
            <button type="button" className="inf-link" onClick={quitar} aria-label={`Quitar ${i.nombre || "el indicador"}`}>
              Quitar
            </button>
          )}
        </td>
      </tr>
      <tr className="inf-dimtab__det">
        <td colSpan={8}>
          <p className="inf-rm__lectura">{ev.texto}</p>
          {falta.length > 0 && <small className="inf-hint">Falta {falta.join(", ")}.</small>}
          {abierta && (
            <div className="inf-rm__det">
              <label className="inf-lab">
                Fuente{exigirFuente ? " (obligatoria)" : ""}
                <input className="inf-in" readOnly={!editable} value={i.fuente} placeholder="Oficina, sistema o documento de donde sale la cifra" onChange={(e) => cambiar({ fuente: e.target.value })} />
              </label>
              <label className="inf-lab">
                Nota de la unidad
                <textarea className="inf-in" rows={2} readOnly={!editable} value={i.nota} placeholder="¿Qué explica el movimiento de esta cifra?" onChange={(e) => cambiar({ nota: e.target.value })} />
              </label>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
