/* Warehouse UDES · modelo semántico · relaciones y hallazgos de reconstrucción.

   Las relaciones son siempre de muchos a uno y en una sola vía: de la fuente (hechos) hacia la dimensión.
   Una relación puede depender de un hallazgo: una regla de reconstrucción que Pilo propone, la persona
   aprueba y ejecuta la base. Pilo no edita datos: propone la regla. */

import { DIMENSIONES, RELACIONES_ENTRE_DIMENSIONES, esColumnaDePeriodo, normalizarPeriodo, type DimensionId } from "./dimensiones";
import { columnaDe, dimensionesDe, fuentePorId, type FuenteBI } from "./fuentes";

/** Lo que el perfil de la base dice de una columna (es la forma de `ColumnaPerfil` del store, sin traerlo aquí). */
export interface PerfilColumna {
  col: string;
  tipo: string;
  llenos: number;
  distintos: number;
  patron: string | null;
  personal: boolean;
}
export type Perfiles = Record<string, PerfilColumna[] | undefined>;

export type TipoRegla = "programa_es_departamento" | "unir_materia_por_codigo" | "normalizar_periodo" | "pivotar_periodos" | "cruce_codigo_estudiante";

export interface Hallazgo {
  id: TipoRegla;
  titulo: string;
  detalle: string;
  /** Fuentes que toca. */
  fuentes: string[];
  accion: string;
  /** Una regla que cambia cómo se leen los datos la aprueba una persona; un aviso solo se da por leído. */
  requiereAprobacion: boolean;
  /** Qué ejecutaría la base si se aprueba (JSON, sin código arbitrario). */
  spec: Record<string, unknown>;
}

export interface Relacion {
  fuente: string;
  columna: string;
  dimension: DimensionId;
  cardinalidad: "muchos-a-uno";
  direccion: "fuente-a-dimension";
  estado: "lista" | "requiere_regla";
  /** El hallazgo del que depende, si requiere regla. */
  regla?: TipoRegla;
  personal: boolean;
  origen: "confirmada" | "por_nombre" | "de_la_carga";
}

export interface RelacionEntreDimensiones {
  desde: DimensionId;
  hacia: DimensionId;
  estado: "lista" | "requiere_regla";
  regla?: TipoRegla;
  nota: string;
}

/** La columna que lleva el código de la materia en una fuente, si la hay; si no, la que lleva el nombre. */
function columnasDeMateria(f: FuenteBI): { codigo: string | null; nombre: string | null } {
  const cols = Object.entries(f.columnas).filter(([, c]) => c.dimension === "materia").map(([k]) => k);
  const codigo = cols.find((k) => k === "codigo" || k.startsWith("cod")) ?? null;
  const nombre = cols.find((k) => k !== codigo) ?? null;
  return { codigo, nombre };
}

/** El formato de periodo que usa el Warehouse es «2026b»; su patrón en el perfil es 9999A. */
const periodoCanonico = (patron: string | null) => patron === null || patron === "9999A";

export function detectarHallazgos(seleccion: string[], perfiles: Perfiles = {}): Hallazgo[] {
  const fuentes = seleccion.map((id) => fuentePorId(id)).filter((f): f is FuenteBI => Boolean(f));
  const con = (d: DimensionId) => fuentes.filter((f) => dimensionesDe(f).some((x) => x.dimension === d && x.columna !== "(de la carga)"));
  const salida: Hallazgo[] = [];

  // 1. «Programa» de Rendimiento es el departamento: para cruzarlo con una fuente que trae el programa real hay que traducir.
  const rend = fuentes.find((f) => f.id === "ma_rendimiento");
  const conPrograma = con("programa").filter((f) => f.id !== "ma_rendimiento");
  if (rend && conPrograma.length > 0)
    salida.push({
      id: "programa_es_departamento",
      titulo: "«Programa» en Rendimiento es el departamento",
      detalle: `En Rendimiento por grupo la columna «programa» trae el departamento de la materia. ${conPrograma.map((f) => f.nombre).join(", ")} trae el programa real. Para cruzarlos hace falta una tabla de equivalencias Programa → Departamento.`,
      fuentes: [rend.id, ...conPrograma.map((f) => f.id)],
      accion: "Crear equivalencias",
      requiereAprobacion: true,
      spec: { tipo: "equivalencias", desde: { fuente: rend.id, columna: "programa", es: "departamento" }, hacia: conPrograma.map((f) => ({ fuente: f.id, dimension: "programa" })), puente: "programa -> departamento" },
    });

  // 2. La materia en cada fuente: el código es la llave; el nombre solo cuando no hay código.
  const conMateria = con("materia");
  if (conMateria.length >= 2) {
    const columnas = Object.fromEntries(conMateria.map((f) => [f.id, columnasDeMateria(f)]));
    const sinCodigo = conMateria.filter((f) => !columnasDeMateria(f).codigo);
    salida.push({
      id: "unir_materia_por_codigo",
      titulo: "La materia se llama distinto en cada fuente",
      detalle: `Se une por código: ${conMateria.map((f) => `${f.nombre} usa «${columnasDeMateria(f).codigo ?? columnasDeMateria(f).nombre}»`).join("; ")}.${sinCodigo.length ? ` ${sinCodigo.map((f) => f.nombre).join(", ")} no trae código: se une por el nombre sin tildes y en mayúsculas, y las que no tengan pareja las decide una persona.` : ""}`,
      fuentes: conMateria.map((f) => f.id),
      accion: "Unir por código",
      requiereAprobacion: true,
      spec: { tipo: "llave", dimension: "materia", columnas, normalizacion: "nombre_sin_tildes_mayusculas" },
    });
  }

  // 3. Periodos en columnas o con otro formato.
  const pivotables = fuentes.filter((f) => f.periodosEnColumnas);
  if (pivotables.length > 0)
    salida.push({
      id: "pivotar_periodos",
      titulo: "El histórico trae una columna por periodo",
      detalle: `${pivotables.map((f) => f.nombre).join(", ")} guarda un estado por periodo en columnas (2014a, 2014b…). Para filtrar y comparar por periodo hay que pasarlas a filas: una por estudiante y periodo.`,
      fuentes: pivotables.map((f) => f.id),
      accion: "Pasar a filas",
      requiereAprobacion: true,
      spec: { tipo: "pivotar", columnas: "periodo_AAAAx", destino: { periodo: "periodo", estado: "estado" } },
    });
  const otroFormato = fuentes.filter((f) => (perfiles[f.id] ?? []).some((c) => DIMENSIONES.periodo.alias.includes(c.col) && !periodoCanonico(c.patron)));
  if (otroFormato.length > 0)
    salida.push({
      id: "normalizar_periodo",
      titulo: "El periodo viene con otro formato",
      detalle: `${otroFormato.map((f) => f.nombre).join(", ")} trae el periodo como «2026-2» y el Warehouse guarda «2026b». Se normaliza al armar el modelo, sin tocar lo guardado.`,
      fuentes: otroFormato.map((f) => f.id),
      accion: "Normalizar periodo",
      requiereAprobacion: true,
      spec: { tipo: "normalizar", dimension: "periodo", ejemplo: { de: "2026-2", a: normalizarPeriodo("2026-2") } },
    });

  // 4. Fuentes con el código del estudiante: se cruzan en la base y llega solo lo agregado.
  const conEstudiante = con("estudiante");
  if (conEstudiante.length >= 2)
    salida.push({
      id: "cruce_codigo_estudiante",
      titulo: "Estas fuentes comparten el código del estudiante",
      detalle: "El código es dato personal. El cruce lo hace la base y al tablero llegan solo conteos y promedios agregados, con reserva de 5. Pilo nunca ve el código.",
      fuentes: conEstudiante.map((f) => f.id),
      accion: "Entendido",
      requiereAprobacion: false,
      spec: { tipo: "reserva", minimo: 5 },
    });
  return salida;
}

/** La regla de la que depende cruzar esta fuente por esta dimensión, si hay alguna que falte. */
function reglaDe(fuente: string, dimension: DimensionId, hallazgos: Hallazgo[]): TipoRegla | undefined {
  return hallazgos.find((h) => h.requiereAprobacion && h.fuentes.includes(fuente) && (h.id === "unir_materia_por_codigo" ? dimension === "materia" : h.id === "normalizar_periodo" || h.id === "pivotar_periodos" ? dimension === "periodo" : h.id === "programa_es_departamento" ? dimension === "departamento" || dimension === "programa" : false))?.id;
}

/**
 * Las relaciones del modelo: cada fuente elegida hacia cada dimensión por la que se puede cruzar. `aplicadas` son los
 * hallazgos que la persona ya aprobó; con ellos, las relaciones que dependían de una regla quedan listas.
 */
export function relacionesDe(seleccion: string[], aplicadas: TipoRegla[] = [], perfiles: Perfiles = {}): Relacion[] {
  const hallazgos = detectarHallazgos(seleccion, perfiles);
  const salida: Relacion[] = [];
  for (const id of seleccion) {
    const f = fuentePorId(id);
    if (!f) continue;
    const columnas = perfiles[id]?.map((c) => c.col) ?? Object.keys(f.columnas);
    for (const d of dimensionesDe(f, columnas)) {
      const c = d.columna === "(de la carga)" ? null : columnaDe(f, d.columna);
      const regla = reglaDe(id, d.dimension, hallazgos);
      salida.push({
        fuente: id,
        columna: d.columna,
        dimension: d.dimension,
        cardinalidad: "muchos-a-uno",
        direccion: "fuente-a-dimension",
        estado: regla && !aplicadas.includes(regla) ? "requiere_regla" : "lista",
        regla: regla && !aplicadas.includes(regla) ? regla : undefined,
        personal: Boolean(c?.personal),
        origen: d.columna === "(de la carga)" ? "de_la_carga" : f.columnas[d.columna] ? "confirmada" : "por_nombre",
      });
    }
  }
  return salida;
}

/** Programa → departamento: dependen de la tabla de equivalencias cuando se cruzan Rendimiento y una fuente con programa. */
export function relacionesEntreDimensiones(seleccion: string[], aplicadas: TipoRegla[] = [], perfiles: Perfiles = {}): RelacionEntreDimensiones[] {
  const hallazgos = detectarHallazgos(seleccion, perfiles);
  const necesita = hallazgos.some((h) => h.id === "programa_es_departamento");
  return RELACIONES_ENTRE_DIMENSIONES.filter((r) => r.desde === "programa" && r.hacia === "departamento" && necesita).map((r) => ({
    ...r,
    estado: aplicadas.includes("programa_es_departamento") ? "lista" : "requiere_regla",
    regla: aplicadas.includes("programa_es_departamento") ? undefined : "programa_es_departamento",
  }));
}

/** Las dimensiones comunes a todas las fuentes elegidas (por las que se puede cruzar sin regla). */
export function dimensionesComunes(seleccion: string[]): DimensionId[] {
  const lista = seleccion.map((id) => fuentePorId(id)).filter((f): f is FuenteBI => Boolean(f));
  if (lista.length === 0) return [];
  return (Object.keys(DIMENSIONES) as DimensionId[]).filter((d) => lista.every((f) => dimensionesDe(f).some((x) => x.dimension === d)));
}

/** ¿Es la columna de periodo de un archivo de periodos en columnas? Sirve a quien arma consultas a mano. */
export const esPeriodoEnColumna = esColumnaDePeriodo;
