/* =============================================================================
   Guía con Pilo · los textos. Única fuente de la guía y de los «?»: hoy son
   estáticos; el día que Planeación los edite, este archivo se lleva a una tabla
   con la misma forma (CAPITULOS, PASOS, AYUDAS) y nada más cambia.

   Una zona es un `data-guia="<zona>"` puesto en el elemento real de la pantalla.
   ========================================================================== */

import type { TipoSeccion } from "../types";

export type Vista = "tablero" | "mi-informe" | "revision" | "consolidador" | "capacitacion" | "vista";

export interface Paso {
  /** Capítulo (índice de CAPITULOS). */
  c: number;
  /** Zona que se señala (data-guia). */
  z: string;
  /** Pantalla donde se ve. */
  v: Vista;
  /** Abre la primera sección de este tipo (solo en Mi informe). Si la plantilla no la tiene, el paso se omite. */
  tipo?: TipoSeccion;
  /** Estado de demostración: solo se pinta, no toca datos. */
  demo?: "back" | "ok";
  /** Solo para quien gestiona los informes. */
  gestion?: boolean;
  t: string;
  x: string;
}

export const CAPITULOS = ["Primer vistazo", "Escribir cada sección", "Controles y datos de apoyo", "Reportar con Pilo", "Enviar y revisión", "Para quien gestiona"];

export const PASOS: Paso[] = [
  { c: 0, z: "tabs", v: "mi-informe", t: "Dónde está todo", x: "Soy Pilo y le acompaño a armar su informe de gestión. Arriba están las opciones del módulo. Esta pestaña, Guía con Pilo, solo aparece dentro de Mi informe, y puede volver a ella cuando quiera. Un informe se recorre en cuatro pasos: abrir, diligenciar, enviar y esperar la revisión de Planeación." },
  { c: 0, z: "estado", v: "mi-informe", t: "El estado de su informe", x: "Aquí ve en qué punto va. La etiqueta dice si está en borrador, enviado, aprobado o devuelto, y la barra cuenta las secciones listas. Mientras no envíe, las cifras siguen en vivo. El Gestor diligencia y envía, el Contribuyente diligencia, y quien tiene rol de Consulta solo mira." },
  { c: 0, z: "secs", v: "mi-informe", t: "Las secciones", x: "Su plantilla trae entre ocho y diez secciones numeradas, según su unidad. El punto de cada una marca su avance: sin empezar, en curso o lista, y se calcula solo. Puede pasar de una a otra en el orden que prefiera. Lo que escribe se guarda solo." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "narr", t: "Resumen ejecutivo", x: "Escriba de uno a tres párrafos. Las cifras no se digitan: se citan con una clave entre dobles corchetes, como matric, y yo las cambio por su valor vivo. Si escribe un número a mano, le aviso. Así el texto nunca queda desactualizado." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "pdi", t: "Alineación estratégica con el PDI", x: "Marque los pilares del Plan de Desarrollo a los que aportó su unidad, se recomiendan al menos tres, y cuente brevemente cómo. Con eso el informe queda conectado al plan institucional." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "metas", t: "Objetivos y metas", x: "Si su unidad es un programa o una facultad, las metas no se escriben: vienen de los indicadores que eligió en Impacto, con su resultado y su estado, que puede ser superada, cumplida o parcial. Usted aporta el análisis de cada meta y, si quiere, una meta adicional." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "dim", t: "Resultados por dimensión", x: "Aquí están las cifras de UDES en Cifras, cada una con su fuente. Si una cifra cambia mientras escribe, se lo aviso y usted decide si la acepta. Planeación puede pedir que ciertas cifras se justifiquen: quedan pendientes hasta que escriba la razón. También puede agregar datos propios, hasta el tope que fije Planeación, que por defecto es de tres por sección, con el nombre de su fuente." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "matriz", t: "Síntesis de resultados", x: "La matriz se arma sola con las cifras que usted incluyó, comparadas con su meta. Usted solo la revisa y escribe un breve comentario de al menos diez palabras." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "filas", t: "Puntos críticos y acciones", x: "Complete una fila por cada punto crítico. En la plantilla de decanatura son la dimensión, qué pasó, qué acción propone, para cuándo y con qué recursos. En las demás son el reto, el aprendizaje, la oportunidad y la propuesta." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "logros", t: "Logros destacados", x: "Elija los logros que merecen contarse y añada la evidencia de cada uno. Pocos y bien respaldados valen más que una lista larga." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "evid", t: "Evidencias y fuentes", x: "Cargue aquí cada archivo o enlace una sola vez: se numeran como anexos y la sección queda lista cuando hay al menos uno. Las cifras de UDES en Cifras se verifican solas; las propias necesitan su evidencia." },
  { c: 1, z: "sec-body", v: "mi-informe", tipo: "anexos", t: "Anexos", x: "Esta sección muestra la lista numerada de los archivos y enlaces que cargó, para citarlos en el texto. Cada sección también admite tablas y gráficas de UDrive." },
  { c: 2, z: "controles", v: "mi-informe", tipo: "dim", t: "Los controles", x: "Esta lista le dice qué falta en la sección abierta. Lo verde está bien. Lo ámbar es un aviso: por ejemplo, una cifra pendiente de justificar o un número escrito a mano. Cuando no queda nada ámbar, la sección pasa a lista sola." },
  { c: 2, z: "datos", v: "mi-informe", t: "Datos que puede consultar", x: "Tres atajos de apoyo. UDES en Cifras para ver las cifras con su corte. El portal del Plan de Desarrollo para sus pilares y proyectos. Y yo, para preguntar de dónde sale una cifra." },
  { c: 3, z: "pilo-btn", v: "mi-informe", tipo: "narr", t: "Pídale un borrador a Pilo", x: "En las secciones de texto, si el informe está abierto para editar, puede pedirme un borrador. Parto de lo que ya escribió, uso las claves de las cifras y le marco el texto como borrador mío. Usted lo edita a su gusto. Yo nunca escribo cifras por mi cuenta, nunca envío y nunca apruebo." },
  { c: 3, z: "datos", v: "mi-informe", t: "Pregúnteme por una cifra", x: "Si duda de un número, pregúnteme de dónde sale, a qué corte corresponde o cómo se compara con otra unidad. Me abre en una pestaña nueva y no pierde lo que escribió aquí." },
  { c: 4, z: "enviar", v: "mi-informe", t: "Enviar el informe", x: "El botón de enviar se activa cuando no queda nada pendiente, y debajo le cuento qué falta. Envía el Gestor de la unidad o Planeación. Al enviar se toma una foto de las cifras y el informe se bloquea. Va a la unidad que lo recibe." },
  { c: 4, z: "estado", v: "mi-informe", demo: "back", t: "Si Planeación lo devuelve", x: "Esto es una demostración: su informe no cambió. Una devolución llega con una nota general y, si hace falta, una nota por sección. Usted corrige, y al editar el informe vuelve a borrador y las cifras vuelven a estar vivas. Luego lo envía otra vez." },
  { c: 4, z: "estado", v: "mi-informe", demo: "ok", t: "Cuando se aprueba", x: "Esto también es una demostración. Aprobado significa congelado: las cifras y los textos quedan como estaban el día de la aprobación. Ya no se editan." },
  { c: 4, z: "v-papel", v: "vista", t: "La vista en papel", x: "En cualquier momento puede ver el informe como saldrá en papel, en tamaño Carta o A4, y descargar el PDF oficial." },
  { c: 5, z: "t-head", v: "tablero", gestion: true, t: "Tablero del ciclo", x: "Planeación abre el ciclo del año, fija la fecha límite y el corte, y ve el estado de cada unidad. También decide qué cifras debe justificar cada plantilla, cuántos datos propios se permiten y si se exige fuente y pilar." },
  { c: 5, z: "r-detalle", v: "revision", gestion: true, t: "Revisión", x: "Los informes enviados llegan a una cola. Quien gestiona los lee, y puede aprobar o devolver con al menos una nota, general o por sección. Solo quien gestiona aprueba o devuelve." },
  { c: 5, z: "c-arbol", v: "consolidador", gestion: true, t: "Consolidador", x: "Esta pantalla llega en la próxima fase. Las rectorías de campus y la Rectoría General recibirán aquí lo aprobado de las unidades que les entregan su informe, y decidirán qué entra en el suyo." },
  { c: 5, z: "k-corpus", v: "capacitacion", gestion: true, t: "Capacitación de Pilo", x: "Aquí aprendo. Planeación me carga los informes de años anteriores y decide qué entra. De lo que se escribe ahora, solo aprendo lo aprobado. Nunca aprendo cifras: solo el estilo." },
];

/** La explicación corta de cada «?». Una zona sin paso en la guía lleva al inicio. */
export const AYUDAS: Record<string, { nombre: string; texto: string }> = {
  estado: { nombre: "estado del informe", texto: "El estado del informe y cuántas secciones van listas. Las cifras siguen en vivo hasta que envíe." },
  secs: { nombre: "lista de secciones", texto: "Las secciones de su plantilla. El punto marca el avance, que se calcula solo. Puede saltar entre ellas." },
  "sec-body": { nombre: "cuerpo de la sección", texto: "Aquí se escribe la sección. El contenido cambia según su tipo: texto, tabla, cifras o anexos." },
  controles: { nombre: "controles de la sección", texto: "Lo que falta en esta sección. Verde está bien y ámbar es un aviso." },
  datos: { nombre: "datos que puede consultar", texto: "Atajos a UDES en Cifras, al Plan de Desarrollo y a Pilo para consultar una cifra." },
  enviar: { nombre: "envío del informe", texto: "Se activa cuando no queda nada pendiente. Al enviar, las cifras quedan congeladas." },
  "t-head": { nombre: "resumen del ciclo", texto: "El ciclo del año: su estado, la fecha límite y el corte." },
  "t-tabla": { nombre: "entrega por unidad", texto: "El estado de cada unidad: si tiene informe abierto, en borrador, enviado o aprobado." },
  "t-req": { nombre: "qué cifras se justifican", texto: "Qué cifras debe justificar cada plantilla. Lo marcado como justificar queda bloqueado hasta que la unidad escriba la razón." },
  "r-cola": { nombre: "cola de revisión", texto: "Los informes de las unidades, con el filtro de los que esperan revisión." },
  "r-detalle": { nombre: "decisión de revisión", texto: "Quien gestiona aprueba, o devuelve con al menos una nota, general o por sección." },
  "c-arbol": { nombre: "consolidación", texto: "El consolidador llega en la próxima fase: reunirá lo aprobado de las unidades que entregan su informe a este nivel." },
  "k-corpus": { nombre: "capacitación de Pilo", texto: "Lo que Pilo aprendió de informes anteriores. Nunca aprende cifras, solo el estilo." },
  "v-papel": { nombre: "vista en papel", texto: "El informe como saldrá en papel, en Carta o A4. Aquí se descarga el PDF oficial." },
};
