/* =============================================================================
   UDES en Cifras · qué es cada tipo de bloque de la ficha.

   `BLOCK_HELP` es la frase que Diseño visual pone bajo cada bloque: qué
   muestra. `BLOCK_FILL` dice cómo se llena, y `BLOCK_CLASSIC`, en qué estación
   y pestaña de la vista clásica se hace hoy. El taller y Mr. Pilo leen los
   tres: «Ayúdeme con esto» es etiqueta + qué muestra + cómo se llena.
   ========================================================================== */

import type { OdBlockKind } from "../../../types/database";
import { BLOCK_LABELS } from "../../datos-abiertos/data/types";
import type { StationId } from "./progress";

export const BLOCK_HELP: Record<OdBlockKind, string> = {
  kpis: "Las cifras clave del informe, con variación y rastro de cortes.",
  evolucion: "El indicador elegido año a año, por campus.",
  mapa: "Colombia por departamento, movilidad por país con rutas animadas o convenios por país como mapa de calor.",
  tuberia: "La deserción de una cohorte, tramo a tramo, en estudiantes o en %.",
  historico: "La cifra de un periodo frente a otro, con sus categorías y su peso en el total.",
  mapa_calor: "Matriz de dos dimensiones en escala azul.",
  desgloses: "Cómo se reparte la cifra: circular o barras.",
  tabla_dinamica: "Todas las cifras, para armar la tabla propia y descargarla.",
  metodologia: "Qué mide cada indicador y quién lo reporta.",
  tabla: "Una tabla del informe: listado, ranking, fichas o cifras de un periodo.",
  separador: "Agrupa los bloques que siguen, hasta el próximo separador. En el Boletín abre página.",
  rankings: "Posiciones en QS, THE y otros rankings, con medallas, tabla, evolución y rueda de ODS.",
  saber_pro: "Resultados Saber PRO por competencia: niveles de desempeño, brecha con el país y evolución, filtrables por sede, facultad y programa.",
  saber_tyt: "Motor Beta: de Saber 11 a Saber TyT en rango percentil, con el valor agregado por programa.",
  libre: "Un conjunto libre con sus gráficas: elige una vista o muéstralas todas.",
  modelo: "Modelo estadístico del informe: factores asociados con su intervalo, simulador de perfiles, calidad de la clasificación y la muestra.",
  imagenes: "Fotografías en dos columnas, dentro de la ficha y en el boletín.",
  diversidad: "Tablero propio de Diversidad, Equidad e Inclusión: grupos de protección constitucional por corte y campus, mosaico étnico, discapacidad, estratos, género, zona e INES.",
  medallero: "Lo que gana la universidad cuando compite: juegos, festivales y concursos, con su podio y su tabla de medallas.",
  tablas_personalizadas: "Varias tablas personalizadas, una tras otra: elige cuáles muestra este bloque.",
};

/**
 * En el taller se habla de usted. Las dos frases de `BLOCK_HELP` que tutean se
 * dicen aquí de otra forma; las demás valen tal cual.
 */
const BLOCK_HELP_FORMAL: Partial<Record<OdBlockKind, string>> = {
  libre: "Un conjunto libre con sus gráficas: se elige una vista o se muestran todas.",
  tablas_personalizadas: "Varias tablas personalizadas, una tras otra: se elige cuáles muestra este bloque.",
};

/** Qué muestra un tipo de bloque, dicho de usted. */
export const blockHelp = (kind: OdBlockKind): string => BLOCK_HELP_FORMAL[kind] ?? BLOCK_HELP[kind];

/** Cómo se llena cada tipo de bloque, dicho a quien lo va a llenar. */
export const BLOCK_FILL: Record<OdBlockKind, string> = {
  kpis: "Pulse «Editar»: verá todos los años del periodo a la vez. Escriba la cifra de cada campus o pegue el rango desde Excel. En cada dato elige si se reporta por periodo o por año. El total institucional se suma solo y una casilla vacía es «sin reportar», nunca cero.",
  evolucion: "No se captura aparte: sale de los indicadores. Usted solo elige si abre en líneas por campus o en barras por año.",
  mapa: "Hay seis modos: origen, cobertura, municipio, movilidad entrante, saliente y convenios. Se llenan departamentos o países por fila y campus por columna, o con «Pegar lista»: país, campus y participantes.",
  tuberia: "Campus por fila y etapas por columna. Se captura en estudiantes, en permanencia o en deserción acumulada; los porcentajes van de 0 a 100.",
  historico: "Una rejilla con el total y sus categorías por fila, y los periodos que usted elija por columna.",
  mapa_calor: "Se pega la tabla completa desde Excel: la primera fila y la primera columna son los rótulos.",
  desgloses: "Un desglose reparte una cifra en categorías: se escriben las categorías por fila y los cortes por columna, y se elige si se ve circular o en barras. Una categoría con muy pocos casos sale como «menos de 5», para no señalar a nadie.",
  tabla_dinamica: "No se captura: se arma sola con las cifras del informe.",
  metodologia: "Se arma sola con lo escrito en «Qué mide» y en la oficina que reporta de cada indicador.",
  tabla: "Hoy solo llega por «Importar informe»: no tiene editor propio.",
  separador: "Pulse «Editar» y escriba su título y, si quiere, una frase de descripción. Todo lo que quede debajo, hasta el siguiente separador, pertenece a esa sección.",
  rankings: "Una edición por año: posiciones como texto (145, =145, 801-1000), puntaje, estrellas y ODS.",
  saber_pro: "Se sube el Excel del ICFES. Se cuenta en este equipo: los datos de cada estudiante no salen de aquí; solo suben los resultados sumados.",
  saber_tyt: "Se sube el Excel con una fila por evaluado y se elige la hoja y el nivel de formación. Los datos personales no salen de este equipo.",
  libre: "Usted define las columnas. Se escribe sobre la tabla o se pega desde Excel, y se elige entre diecisiete formas de verlo.",
  modelo: "No tiene formulario: lo carga Planeación con su especificación.",
  imagenes: "Se eligen las fotos y se escribe qué muestra cada una. Esa descripción es obligatoria.",
  diversidad: "No se captura: lee indicadores y desgloses del informe por su clave. Si una cifra falta, se llena en su indicador o en su desglose.",
  medallero: "Filas libres y una columna por categoría (Oro, Plata, Bronce…). Vacío es «no compitió»; cero, «compitió y no ganó».",
  tablas_personalizadas: "Cada tabla se escribe a mano, con columnas de texto, número y estado. El color lo pone una regla y siempre va con su símbolo, para que no dependa solo del color.",
};

/** Dónde se edita hoy cada tipo en la vista clásica: estación y, en Captura, el ancla de su pestaña. */
export const BLOCK_CLASSIC: Record<OdBlockKind, { station: StationId; hash?: string; where: string }> = {
  kpis: { station: "captura", hash: "indicadores", where: "Captura › Indicadores" },
  evolucion: { station: "diseno", where: "Diseño visual" },
  mapa: { station: "captura", hash: "mapas", where: "Captura › Mapas" },
  tuberia: { station: "captura", hash: "tuberia", where: "Captura › Tuberías" },
  historico: { station: "captura", hash: "historico", where: "Captura › Evolución histórica" },
  mapa_calor: { station: "captura", hash: "calor", where: "Captura › Mapas de calor" },
  desgloses: { station: "captura", hash: "desgloses", where: "Captura › Desgloses" },
  tabla_dinamica: { station: "diseno", where: "Diseño visual" },
  metodologia: { station: "estructura", where: "Estructura y KPI" },
  tabla: { station: "captura", hash: "importar", where: "Captura › Importar informe" },
  separador: { station: "diseno", where: "Diseño visual" },
  rankings: { station: "captura", hash: "rankings", where: "Captura › Rankings" },
  saber_pro: { station: "captura", hash: "saber", where: "Captura › Saber PRO" },
  saber_tyt: { station: "captura", hash: "tyt", where: "Captura › Saber TyT" },
  libre: { station: "captura", hash: "libres", where: "Captura › Conjuntos libres" },
  modelo: { station: "diseno", where: "Diseño visual" },
  imagenes: { station: "diseno", where: "Diseño visual" },
  diversidad: { station: "captura", hash: "indicadores", where: "Captura › Indicadores" },
  medallero: { station: "captura", hash: "medalleros", where: "Captura › Medalleros" },
  tablas_personalizadas: { station: "captura", hash: "personalizadas", where: "Captura › Tablas personalizadas" },
};

/**
 * Dónde nace hoy un bloque de cada tipo: los conjuntos se crean en Estructura
 * (o en su pestaña de Captura) y después se colocan en la ficha.
 */
export const BLOCK_CREATE: Record<OdBlockKind, { station: StationId; hash?: string; where: string }> = {
  ...BLOCK_CLASSIC,
  mapa: { station: "estructura", where: "Estructura y KPI" },
  tuberia: { station: "estructura", where: "Estructura y KPI" },
  historico: { station: "estructura", where: "Estructura y KPI" },
  mapa_calor: { station: "estructura", where: "Estructura y KPI" },
  desgloses: { station: "estructura", where: "Estructura y KPI" },
  rankings: { station: "estructura", where: "Estructura y KPI" },
  saber_pro: { station: "estructura", where: "Estructura y KPI" },
  saber_tyt: { station: "estructura", where: "Estructura y KPI" },
  medallero: { station: "estructura", where: "Estructura y KPI" },
  evolucion: { station: "diseno", where: "Diseño visual" },
};

/** Los veinte tipos, agrupados como en «Añadir algo a la ficha». */
export const BLOCK_GROUPS: { title: string; kinds: OdBlockKind[] }[] = [
  { title: "Cifras", kinds: ["kpis", "evolucion", "historico", "desgloses"] },
  { title: "Tablas y gráficas propias", kinds: ["libre", "tablas_personalizadas", "tabla", "tabla_dinamica"] },
  { title: "Mapas y matrices", kinds: ["mapa", "mapa_calor"] },
  { title: "Recorridos y resultados", kinds: ["tuberia", "rankings", "medallero", "saber_pro", "saber_tyt", "modelo", "diversidad"] },
  { title: "Para ordenar y explicar", kinds: ["separador", "imagenes", "metodologia"] },
];

/** Lo que Mr. Pilo dice de un tipo de bloque: su nombre, qué muestra y cómo se llena. */
export function blockHelpText(kind: OdBlockKind): string {
  return `${BLOCK_LABELS[kind]}. ${blockHelp(kind)} ${BLOCK_FILL[kind]}`;
}
