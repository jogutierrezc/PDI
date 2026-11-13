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
  COLUMNAS_ACCIONES,
  COLUMNAS_CIFRAS,
  HOJA_ACCIONES,
  HOJA_CIFRAS,
  HOJA_INDICADORES,
  criteriosMarcados,
  filasAcciones,
  filasCifras,
  filasCriterios,
  idCriterio,
  leerLibroIndicadores,
  esAccion,
  esCifra,
  esCompleto,
  MAS_ES_MEJOR,
  MENOS_ES_MEJOR,
  criteriosDe,
  evaluar,
  faltantes,
  indicadorNuevo,
  normalizar,
  idNuevo,
} from "../indicadores-manual";
import type { Criterio, CriterioPropio, IndicadorManual, LecturaIndicadores, PilarOpcion } from "../indicadores-manual";
import { ETIQUETA_ESTADO_META } from "../vista/estados";
import type { EstadoMeta } from "../vista/estados";
import { faltaRequerido, respuestaNueva, textoFuenteReq } from "../requeridos-logica";
import type { DatoRequerido } from "../requeridos-logica";
import type { AnexoRow, ContenidoSeccion, SeccionDef } from "../types";
import { mensajeDe } from "./comunes";
import { descargarLibro, leerHoja, nombresDeHojas } from "./excel";
import { RespaldoIndicador } from "./Respaldo";

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
  /** Pilares del PDI a los que se puede conectar cada cifra o acción (alimentan la Alineación estratégica). */
  pilares?: PilarOpcion[];
  /** Criterios cuyas cifras Planeación pide justificar (condición «justificar»): quedan marcados y bloqueados. */
  criteriosPedidos?: string[];
  /** Anexos cargados en «Evidencias»: se pueden marcar como respaldo de cada cifra o acción. */
  anexos?: AnexoRow[];
}

export function ResultadosManuales({ def, c, editable, aprobados, exigirFuente, cambiar, sugerir, puedeSugerir, requeridos = [], criteriosPedidos = [], pilares = [], anexos = [] }: Props) {
  const indicadores = normalizar(c.indicadores);
  const propios = c.criterios_propios ?? [];
  const criterios = criteriosDe(def.dims ?? [], aprobados, propios, !def.consolida);
  // Las respuestas a lo que pide Planeación se muestran en su propio bloque, no entre los criterios.
  const clavesPedidas = new Set(requeridos.map((r) => r.clave));
  const visibles = indicadores.filter((i) => !(i.requerido && clavesPedidas.has(i.requerido)));
  // Indicadores de un criterio que ya no existe (archivado): se muestran aparte, sin perderlos.
  const huerfanos = visibles.filter((i) => !criterios.some((k) => k.id === i.criterio));
  // Selector: reportar a un criterio es opcional. Lo que Planeación exige y lo que ya tiene indicadores cuenta como marcado.
  const pedidos = new Set([...criteriosPedidos, ...requeridos.map((r) => r.criterio)].filter(Boolean).map(idCriterio));
  const marcados = criteriosMarcados(c.criterios_reporta, visibles, [...pedidos]);
  const cuantos = (id: string) => visibles.filter((i) => i.criterio === id).length;
  const alternar = (id: string) => {
    const actuales = c.criterios_reporta ?? [];
    cambiar({ ...c, criterios_reporta: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id] });
  };
  const grupos: Criterio[] = [...criterios.filter((k) => marcados.has(k.id)), ...(huerfanos.length ? [{ id: "__otros", nombre: "Otros indicadores", origen: "propio" as const }] : [])];

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
    const fijos = { nombre: r.dato, unidad: r.unidad, mayorMejor: r.mayor_mejor, criterio: idCriterio(r.criterio), requerido: r.clave };
    const previa = indicadores.find((i) => i.requerido === r.clave);
    if (previa) poner(indicadores.map((i) => (i === previa ? { ...i, ...cambios, ...fijos } : i)));
    else poner([...indicadores, { ...respuestaNueva(r, criterios.find((k) => k.id === idCriterio(r.criterio))?.nombre ?? ""), ...cambios }]);
  };

  const agregarCriterio = () => {
    const nombre = nuevo.trim();
    if (nombre.length < 3) return;
    if (criterios.some((k) => k.nombre.toLowerCase() === nombre.toLowerCase())) {
      setAviso("Ya existe un criterio con ese nombre.");
      return;
    }
    const id = `l_${idNuevo()}`;
    cambiar({ ...c, criterios_propios: [...propios, { id, nombre }], criterios_reporta: [...(c.criterios_reporta ?? []), id] });
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

  const rangoCriterios = `Criterios!$A$2:$A$${Math.max(2, criterios.length + 1)}`;
  const rangoPilares = `Pilares!$A$2:$A$${Math.max(2, pilares.length + 1)}`;
  const hojaPilares = { nombre: "Pilares", columnas: [{ titulo: "Pilares del Plan de Desarrollo", ancho: 60 }], filas: pilares.map((p) => [p.etiqueta]) };
  const hojaCriterios = { nombre: "Criterios", columnas: [{ titulo: "Criterios disponibles", ancho: 50 }, { titulo: "Origen", ancho: 28 }], filas: filasCriterios(criterios) };
  const anchoCifras = (n: number) => (n === 0 || n === 9 ? 34 : n === 1 || n === 7 || n === 8 ? 40 : 16);
  const anchoAcciones = (n: number) => (n === 0 || n === 10 ? 34 : n === 1 || n === 2 || n === 3 ? 40 : n === 4 || n === 5 ? 28 : 16);
  const listasCifras: Record<number, string[] | { rango: string }> = { 0: { rango: rangoCriterios }, 3: [MAS_ES_MEJOR, MENOS_ES_MEJOR] };
  const listasAcciones: Record<number, string[] | { rango: string }> = { 0: { rango: rangoCriterios } };
  if (pilares.length) {
    listasCifras[9] = { rango: rangoPilares };
    listasAcciones[10] = { rango: rangoPilares };
  }
  const hojasApoyo = pilares.length ? [hojaCriterios, hojaPilares] : [hojaCriterios];

  const plantilla = async () => {
    const [k1, k2] = [criterios[0], criterios[1] ?? criterios[0]];
    const ejemploCifras: IndicadorManual[] = [k1, k2].filter(Boolean).map((k, n) => ({ ...indicadorNuevo(k.id, k.nombre), nombre: n ? "Ejemplo: profesores con doctorado" : "Ejemplo: tasa de graduación", unidad: "%", anterior: n ? 18 : 62, actual: n ? 21 : 66, meta: n ? 25 : 70, fuente: "Oficina de la unidad" }));
    const ejemploAcciones: IndicadorManual[] = k1
      ? [{ ...indicadorNuevo(k1.id, k1.nombre, "accion"), nombre: "Ejemplo: tutorías de refuerzo", descripcion: "Acompañamiento a estudiantes de primer semestre", avance_texto: "Se abrieron 12 grupos en el primer periodo", finalizacion: "Segundo periodo de 2026", proyeccion_texto: "Ampliar a todos los programas", proyeccion_num: 20, unidad: "" }]
      : [];
    await descargarLibro("plantilla-resultados-y-evidencias.xlsx", [
      {
        nombre: HOJA_CIFRAS,
        columnas: COLUMNAS_CIFRAS.map((t, n) => ({ titulo: t, ancho: anchoCifras(n) })),
        filas: filasCifras(ejemploCifras, criterios, pilares),
        listas: listasCifras,
        ayuda: [
          "Una fila por cifra. Borre las filas de ejemplo.",
          "Criterio: elija de la lista (hoja «Criterios») o escriba uno nuevo; si no existe se crea como criterio propio de su unidad.",
          `Qué es mejor: «${MAS_ES_MEJOR}» (matrícula, graduados) o «${MENOS_ES_MEJOR}» (deserción, tiempos).`,
          "Año anterior, Cifra actual y Meta: solo números (puede usar coma decimal). El estado no se escribe: lo calcula el informe.",
          "Unidad: déjela vacía para conteos, o escriba % o pp.",
          "Pilar del PDI: opcional; elija el pilar del Plan de Desarrollo con el que se conecta la cifra (hoja «Pilares»). Alimenta la Alineación estratégica.",
        ].join("\n"),
      },
      {
        nombre: HOJA_ACCIONES,
        columnas: COLUMNAS_ACCIONES.map((t, n) => ({ titulo: t, ancho: anchoAcciones(n) })),
        filas: filasAcciones(ejemploAcciones, criterios, pilares),
        listas: listasAcciones,
        ayuda: [
          "Una fila por acción. Borre la fila de ejemplo.",
          "Criterio: igual que en la hoja «Cifras»; sirve cualquiera de la hoja «Criterios» o uno nuevo.",
          "Acción: el nombre corto. Descripción y Qué se ha hecho son obligatorios para dar la acción por completa.",
          "Finalización: cuándo se plantea terminarla (fecha o periodo, en texto). Proyección: en texto y, si aplica, en número (con su unidad).",
          "Pilar del PDI: opcional; el pilar con el que se conecta la acción (hoja «Pilares»).",
        ].join("\n"),
      },
      ...hojasApoyo,
    ]);
  };

  const exportar = async () => {
    await descargarLibro("resultados-y-evidencias.xlsx", [
      { nombre: HOJA_CIFRAS, columnas: COLUMNAS_CIFRAS.map((t, n) => ({ titulo: t, ancho: anchoCifras(n) })), filas: filasCifras(indicadores, criterios, pilares), listas: listasCifras },
      { nombre: HOJA_ACCIONES, columnas: COLUMNAS_ACCIONES.map((t, n) => ({ titulo: t, ancho: anchoAcciones(n) })), filas: filasAcciones(indicadores, criterios, pilares), listas: listasAcciones },
      ...hojasApoyo,
    ]);
  };

  const leer = async (archivo: File | undefined) => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const nombres = await nombresDeHojas(archivo);
      const tiene = (n: string) => nombres.some((x) => x.trim().toLowerCase() === n.toLowerCase());
      const [cifras, acciones, legado] = await Promise.all([
        tiene(HOJA_CIFRAS) ? leerHoja(archivo, HOJA_CIFRAS) : Promise.resolve(undefined),
        tiene(HOJA_ACCIONES) ? leerHoja(archivo, HOJA_ACCIONES) : Promise.resolve(undefined),
        tiene(HOJA_INDICADORES) ? leerHoja(archivo, HOJA_INDICADORES) : Promise.resolve(undefined),
      ]);
      if (!cifras && !acciones && !legado) setPrevia({ error: "El libro no tiene las hojas «Cifras» ni «Acciones». Use la plantilla que se descarga aquí." });
      else {
        const r = leerLibroIndicadores({ cifras, acciones, indicadores: legado }, criterios, pilares);
        setPrevia(r.indicadores.length ? { ...r, archivo: archivo.name } : { error: r.avisos.join(" ") || "No se encontró ninguna cifra ni acción en el archivo." });
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
      <fieldset className="inf-res-sel" disabled={!editable}>
        <legend className="inf-res-sel__q">¿A qué criterios reporta su oficina?</legend>
        <p className="inf-hint">Es opcional: marque solo los que aplican. Cada criterio marcado abre su formulario de indicadores y acciones; los demás no le exigen nada.</p>
        <div className="inf-res-sel__lista">
          {criterios.map((k) => {
            const pedido = pedidos.has(k.id);
            const n = cuantos(k.id);
            const fijo = pedido || n > 0;
            const on = marcados.has(k.id);
            return (
              <label key={k.id} className={`inf-res-op${on ? " is-on" : ""}${fijo ? " is-fijo" : ""}`}>
                <input type="checkbox" checked={on} disabled={fijo} onChange={() => alternar(k.id)} />
                <span className="inf-res-op__txt">
                  <b>{k.nombre}</b>
                  <small>
                    {pedido ? "Lo pide Planeación" : n > 0 ? `Ya tiene ${n} ${n === 1 ? "registro" : "registros"}; quítelos para dejar de reportar` : on ? "Reporta" : k.origen === "propio" ? "Criterio propio" : k.origen === "aprobado" ? "Aprobado por Planeación" : "Criterio base"}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {editable && (
        <div className="inf-rm__nuevo inf-res-nuevo">
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

      {marcados.size === 0 && requeridos.length === 0 && (
        <div className="inf-nota inf-res-vacio" role="status">
          <b>Aún no hay criterios marcados</b>
          {editable
            ? "Marque arriba los criterios a los que su oficina reporta para abrir su formulario. Si no reporta a ninguno, puede dejar esta parte vacía y seguir con los aportes."
            : "Esta oficina no reportó a ningún criterio en esta sección."}
        </div>
      )}

      {editable && marcados.size > 0 && (
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
                  <FilaRequerida key={r.clave} r={r} anexos={anexos} resp={indicadores.find((i) => i.requerido === r.clave)} criterio={criterios.find((k) => k.id === idCriterio(r.criterio))?.nombre ?? ""} editable={editable} cambiar={(x) => cambiarRequerido(r, x)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {grupos.map((k) => {
        const lista = k.id === "__otros" ? huerfanos : visibles.filter((i) => i.criterio === k.id);
        const cifras = lista.filter(esCifra);
        const acciones = lista.filter(esAccion);
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
            {cifras.length > 0 && (
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
                    {cifras.map((i) => (
                      <Fila key={i.id} i={i} pilares={pilares} anexos={anexos} editable={editable} exigirFuente={exigirFuente} cambiar={(x) => cambiarIndicador(i.id, x)} quitar={() => quitar(i.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {acciones.length > 0 && (
              <div className="inf-res-acc" role="list" aria-label={`Acciones de ${k.nombre}`}>
                {acciones.map((i) => (
                  <FichaAccion key={i.id} i={i} pilares={pilares} anexos={anexos} editable={editable} cambiar={(x) => cambiarIndicador(i.id, x)} quitar={() => quitar(i.id)} />
                ))}
              </div>
            )}
            {editable && k.id !== "__otros" && (
              <div className="inf-row">
                <button type="button" className="inf-btn inf-btn--sm inf-btn--pri" onClick={() => poner([...indicadores, indicadorNuevo(k.id, k.nombre)])}>
                  + Añadir cifra
                </button>
                <button type="button" className="inf-btn inf-btn--sm" onClick={() => poner([...indicadores, indicadorNuevo(k.id, k.nombre, "accion")])}>
                  + Añadir acción
                </button>
                {!lista.length && <span className="inf-hint">Aún no hay nada en este criterio: añada una cifra o una acción.</span>}
              </div>
            )}
          </section>
        );
      })}

      {aviso && (
        <p className="inf-hint" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Un dato que pide Planeación: nombre, unidad y sentido vienen fijos; la unidad llena sus cifras, su fuente y su nota. */
function FilaRequerida({ r, anexos, resp, criterio, editable, cambiar }: { r: DatoRequerido; anexos: AnexoRow[]; resp: IndicadorManual | undefined; criterio: string; editable: boolean; cambiar: (x: Partial<IndicadorManual>) => void }) {
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
          <RespaldoIndicador i={i} anexos={anexos} editable={editable} cambiar={cambiar} />
        </td>
      </tr>
    </>
  );
}

/** ¿Esta cifra o acción se conecta con un pilar del PDI? Lo que se conecte alimenta la Alineación estratégica. */
export function SelectorPilar({ valor, pilares, editable, onChange }: { valor: string | undefined; pilares: PilarOpcion[]; editable: boolean; onChange: (id: string) => void }) {
  if (!pilares.length) return null;
  if (!editable && !valor) return null;
  const conocido = pilares.some((p) => p.id === valor);
  return (
    <label className="inf-lab inf-pilar-sel">
      Se conecta con el pilar del PDI
      <select className="inf-in" disabled={!editable} value={valor ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ninguno (no se conecta)</option>
        {pilares.map((p) => (
          <option key={p.id} value={p.id}>
            {p.etiqueta}
          </option>
        ))}
        {valor && !conocido && <option value={valor}>Un pilar que ya no está en el Plan</option>}
      </select>
    </label>
  );
}

function Fila({ i, pilares, anexos, editable, exigirFuente, cambiar, quitar }: { i: IndicadorManual; pilares: PilarOpcion[]; anexos: AnexoRow[]; editable: boolean; exigirFuente: boolean; cambiar: (x: Partial<IndicadorManual>) => void; quitar: () => void }) {
  const ev = evaluar(i);
  const falta = faltantes(i, exigirFuente);
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <tr>
        <td data-lab="Indicador">
          <input className="inf-in" aria-label="Indicador" placeholder="Nombre del indicador" readOnly={!editable} value={i.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
        </td>
        <td data-lab="Unidad">
          <select className="inf-in" aria-label="Unidad" disabled={!editable} value={i.unidad} onChange={(e) => cambiar({ unidad: e.target.value })}>
            <option value="">Conteo</option>
            <option value=" %">%</option>
            <option value=" pp">pp</option>
            <option value=" $">$</option>
          </select>
        </td>
        <td data-lab="Mejor">
          <select className="inf-in" aria-label="Qué es mejor" disabled={!editable} value={i.mayorMejor ? "mas" : "menos"} onChange={(e) => cambiar({ mayorMejor: e.target.value === "mas" })}>
            <option value="mas">Más</option>
            <option value="menos">Menos</option>
          </select>
        </td>
        <td data-lab="Anterior">
          <CeldaNumero valor={i.anterior} etiqueta="Año anterior" editable={editable} onChange={(n) => cambiar({ anterior: n })} />
        </td>
        <td data-lab="Actual">
          <CeldaNumero valor={i.actual} etiqueta="Cifra actual" editable={editable} onChange={(n) => cambiar({ actual: n })} />
        </td>
        <td data-lab="Meta">
          <CeldaNumero valor={i.meta} etiqueta="Meta" editable={editable} onChange={(n) => cambiar({ meta: n })} />
        </td>
        <td data-lab="Estado">
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
          <SelectorPilar valor={i.pilar} pilares={pilares} editable={editable} onChange={(pilar) => cambiar({ pilar })} />
          <RespaldoIndicador i={i} anexos={anexos} editable={editable} cambiar={cambiar} />
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

/** Una acción: solo texto. Nombre, descripción, qué se ha hecho, cuándo termina y proyecciones en texto y número. */
function FichaAccion({ i, pilares, anexos, editable, cambiar, quitar }: { i: IndicadorManual; pilares: PilarOpcion[]; anexos: AnexoRow[]; editable: boolean; cambiar: (x: Partial<IndicadorManual>) => void; quitar: () => void }) {
  const falta = faltantes(i, false);
  return (
    <article className="inf-res-ficha" role="listitem">
      <div className="inf-res-ficha__top">
        <span className={`inf-pill ${esCompleto(i) ? "is-ok" : "is-mid"}`}>{esCompleto(i) ? "Completa" : "Incompleta"}</span>
        <span className="inf-res-ficha__tipo">Acción</span>
        {editable && (
          <button type="button" className="inf-link" onClick={quitar} aria-label={`Quitar la acción ${i.nombre || "sin nombre"}`}>
            Quitar
          </button>
        )}
      </div>
      <label className="inf-lab">
        Nombre de la acción
        <input className="inf-in" readOnly={!editable} value={i.nombre} placeholder="Ej.: Programa de tutorías de refuerzo" onChange={(e) => cambiar({ nombre: e.target.value })} />
      </label>
      <label className="inf-lab">
        Descripción de la acción
        <textarea className="inf-in" rows={2} readOnly={!editable} value={i.descripcion ?? ""} onChange={(e) => cambiar({ descripcion: e.target.value })} />
      </label>
      <label className="inf-lab">
        Qué se ha hecho con la acción
        <textarea className="inf-in" rows={2} readOnly={!editable} value={i.avance_texto ?? ""} onChange={(e) => cambiar({ avance_texto: e.target.value })} />
      </label>
      <div className="inf-res-ficha__fila">
        <label className="inf-lab">
          Cuándo se plantea su finalización
          <input className="inf-in" readOnly={!editable} value={i.finalizacion ?? ""} placeholder="Una fecha o un periodo, ej.: junio de 2027" onChange={(e) => cambiar({ finalizacion: e.target.value })} />
        </label>
      </div>
      <div className="inf-res-ficha__fila inf-res-ficha__proy">
        <label className="inf-lab">
          Proyecciones (texto)
          <input className="inf-in" readOnly={!editable} value={i.proyeccion_texto ?? ""} placeholder="Qué se espera lograr" onChange={(e) => cambiar({ proyeccion_texto: e.target.value })} />
        </label>
        <label className="inf-lab">
          Proyecciones (número)
          <CeldaNumero valor={i.proyeccion_num ?? null} etiqueta="Proyecciones, número" editable={editable} onChange={(n) => cambiar({ proyeccion_num: n })} />
        </label>
        <label className="inf-lab">
          Unidad
          <select className="inf-in" disabled={!editable} value={i.unidad} onChange={(e) => cambiar({ unidad: e.target.value })}>
            <option value="">Sin unidad</option>
            <option value=" %">%</option>
            <option value=" pp">pp</option>
            <option value=" $">$</option>
          </select>
        </label>
      </div>
      <SelectorPilar valor={i.pilar} pilares={pilares} editable={editable} onChange={(pilar) => cambiar({ pilar })} />
      <RespaldoIndicador i={i} anexos={anexos} editable={editable} cambiar={cambiar} />
      {falta.length > 0 && <small className="inf-hint">Falta {falta.join(" y ")}.</small>}
    </article>
  );
}
