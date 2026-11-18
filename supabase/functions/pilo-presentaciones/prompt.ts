/* =============================================================================
   Pilo presentaciones · los mensajes para Astra.

   Módulo puro. Arma el prompt de sistema (catálogo de tipos, reglas de la
   plantilla, anti-invención, la voz del tono) y el del usuario (el informe,
   compactado para caber en el contexto de Astra). El razonamiento del modelo se
   queda en inglés; el JSON de la presentación va en español de Colombia.
   ========================================================================== */

import { ANIMOS, FORMAS_GRAFICA, LIM, MAX_BANDA, MAX_BANDA_CORTA, MAX_FILAS_TABLA, MAX_NOTAS, POR_COMPLETAR, TIPOS } from "./esquema.ts";
import { textoDeTono } from "./tonos.ts";
import type { Tono } from "./tonos.ts";

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Cuántos caracteres del informe caben en el prompt. El contexto de Astra es de 32 768 tokens y hay que dejar sitio
 * a las instrucciones (~3 000 tokens) y a la respuesta (una presentación de 25 láminas son ~10 000 tokens): el JSON en
 * español gasta ~3,3 caracteres por token, así que ~60 000 caracteres (~18 000 tokens) es lo que cabe sin ahogar la salida.
 */
export const PRESUPUESTO_INFORME = 60_000;
/** Un texto del informe se lleva casi entero (las narraciones largas se reparten en varias láminas). */
export const TEXTO_LARGO = 3000;
const SIN_USO = new Set(["drive", "driveLogros", "driveIndicadores", "matriz", "clave", "funcion"]);
/** Las pasadas de poda, de la más fiel a la más corta: [elementos por lista, caracteres por texto]. */
const PASADAS: [number, number][] = [[200, TEXTO_LARGO], [120, TEXTO_LARGO], [80, 2000], [50, 1500], [35, 1000], [25, 700], [15, 500], [10, 400], [6, 300], [4, 250]];

const vacio = (v: unknown) => v === null || v === undefined || v === "" || v === "—" || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

interface Perdida {
  cortes: number;
  textos: number;
}

function podar(v: unknown, tope: number, largo: number, perdio: Perdida): unknown {
  if (typeof v === "string") {
    if (v.length <= largo) return v;
    perdio.textos++;
    return `${v.slice(0, largo)}…`;
  }
  if (Array.isArray(v)) {
    if (v.length > tope) perdio.cortes++;
    // Las celdas de una fila no se quitan aunque estén vacías: correrían las columnas.
    return v.slice(0, tope).map((x) => podar(x, tope, largo, perdio)).filter((x) => typeof x === "string" || !vacio(x));
  }
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (SIN_USO.has(k)) continue;
      const p = podar(x, tope, largo, perdio);
      if (!vacio(p)) o[k] = p;
    }
    return o;
  }
  return v;
}

/** El informe sin lo vacío ni lo que no se dibuja; recorta lo mínimo (primero la longitud de las listas, luego la de los textos) hasta caber en el presupuesto. */
export function compactarInforme(informe: unknown, presupuesto = PRESUPUESTO_INFORME): { texto: string; recortado: boolean } {
  for (const [tope, largo] of PASADAS) {
    const perdio: Perdida = { cortes: 0, textos: 0 };
    const texto = JSON.stringify(podar(informe, tope, largo, perdio));
    if (texto.length <= presupuesto) return { texto, recortado: perdio.cortes > 0 || perdio.textos > 0 };
  }
  return { texto: JSON.stringify(podar(informe, 3, 200, { cortes: 0, textos: 0 })).slice(0, presupuesto), recortado: true };
}

/**
 * Diapositivas objetivo: según los minutos (≈ 1,2 min por diapositiva) o, sin duración, según cuánto trae el informe
 * (`caracteres`, ya compactado): un informe completo pide más láminas. Las de continuación («parte n de m») no cuentan.
 */
export function diapositivasObjetivo(minutos?: number, caracteres?: number): { min: number; max: number } {
  if (!minutos || !Number.isFinite(minutos) || minutos <= 0) {
    const n = caracteres && caracteres > 0 ? Math.max(14, Math.min(32, Math.round(caracteres / 2200))) : 18;
    return { min: n - 2, max: Math.min(40, n + 6) };
  }
  const n = Math.max(6, Math.min(32, Math.round(minutos / 1.2)));
  return { min: Math.max(5, n - 2), max: Math.min(40, n + 4) };
}

const CATALOGO = `TIPOS DE DIAPOSITIVA (cerrados; cada una puede llevar "animo" y "notas"):
1. portada: {tipo, titulo (≤${LIM.titulo}), subtitulo (≤${LIM.subtitulo}), etiqueta? (≤${LIM.etiqueta})}
2. agenda: {tipo, titulo (≤${LIM.itemTitulo}), items: 2-8 de {titulo (≤${LIM.itemTitulo}), detalle? (≤${LIM.itemDetalle})}}
3. seccion: {tipo, numero? ("01"), kicker? (≤50), titulo (≤${LIM.titulo}), bajada? (≤${LIM.bajada})}  (portada de sección, fondo azul)
4. tabla: {tipo, titulo (≤${MAX_BANDA}), intro? (≤${LIM.intro}), columnas: 2-5 (≤${LIM.celdaCabecera} c/u), filas: de tantas celdas como columnas (≤${LIM.celda} c/u), nota? (≤${LIM.nota})}  (pon TODAS las filas que el informe traiga, hasta 40: el servidor las reparte de ${MAX_FILAS_TABLA} en ${MAX_FILAS_TABLA} en láminas «parte n de m»)
5. tarjetas: {tipo, titulo (≤${MAX_BANDA}), intro?, tarjetas: 2-12 de {titulo (≤${LIM.tarjetaTitulo}), cifra? (≤${LIM.tarjetaCifra}, p. ej. "72 %"), texto (≤${LIM.tarjetaTexto}), pie? (≤${LIM.tarjetaPie})}, destacado? {etiqueta, valor}}  (4 por lámina; el servidor reparte el resto)
6. cifras: {tipo, titulo (≤${MAX_BANDA}), intro?, cifras: 2-12 de {valor (≤${LIM.tarjetaCifra}), etiqueta (≤${LIM.cifraEtiqueta}), detalle? (≤${LIM.cifraDetalle}, p. ej. "Meta: 85 %")}, nota?}  (4 por lámina; el servidor reparte el resto)
7. cumplimiento: {tipo, titulo (≤${MAX_BANDA}), filas: 1-12 de {dimension (≤${LIM.dimension}), completadas, en_proceso, pendientes (enteros)}, resumen?: hasta 3 de {valor, etiqueta}, nota?}  (barras apiladas por dimensión: solo con los conteos de la síntesis del plan)
8. grafica: {tipo, forma: ${FORMAS_GRAFICA.map((f) => `"${f}"`).join(" | ")}, titulo (≤${MAX_BANDA}), intro? (≤${LIM.intro}), unidad? (≤${LIM.unidad}, p. ej. "%"), series: 2-10 de {etiqueta (≤${LIM.serie}), valor (NÚMERO, sin texto ni unidad), meta? (NÚMERO), unidad? (≤${LIM.unidad})}, nota?}
   Úsala cuando haya cifras comparables que se entienden mejor dibujadas: «barras» (horizontales) para comparar valores entre dimensiones, programas o indicadores; «columnas» para pocos valores (hasta 8) o una evolución entre periodos del informe; «dona» para partes de un todo cuando los valores del informe ya son las partes (2 a 8); «progreso» para el avance de cada meta o pilar frente a su meta (valor y meta del informe; si el valor es un porcentaje, sin «meta»: nunca escribas una meta que el informe no traiga, ni 100 como escala). Cada valor y cada meta deben estar tal cual en el informe, en el mismo número y escala (84,2 se escribe 84.2). No uses la gráfica para un solo dato (usa cifras) ni inventes la serie: si el informe no trae al menos 2 valores comparables, no la pongas.
9. logros: {tipo, titulo (≤${MAX_BANDA}), intro?, logros: 1-12 de {titulo (≤${LIM.logroTitulo}), resultado (≤${LIM.logroTexto}), evidencia? (≤${LIM.etiqueta}, p. ej. "Anexo 3")}}  (4 por lámina; el servidor reparte el resto)
10. evidencias: {tipo, titulo (≤${MAX_BANDA}), anexos: hasta 30 de {n, documento (≤90), descripcion? (≤${LIM.celda})}, fuentes: ≤8 CADENAS de texto (≤${LIM.fuente}), nunca objetos, enlaces?: ≤8 de {texto, url}}  (6 anexos por lámina; el servidor reparte el resto)
11. texto: {tipo, eyebrow? (≤${LIM.etiqueta}), titulo (≤80), parrafos?: hasta 30 (≤${LIM.parrafo} c/u), puntos?: hasta 40 (≤${LIM.punto} c/u)}  (la narración del informe: el servidor la reparte en láminas «parte n de m» si no cabe en una)
12. cierre: {tipo, titulo (≤${LIM.etiqueta}, p. ej. "Gracias"), contacto? (≤${LIM.contacto})}`;

export function mensajeSistema(tono: Tono): string {
  return `Eres Pilo, el asistente de la Universidad de Santander (UDES). Conviertes un informe de gestión en una presentación para proyectar, sobre la plantilla institucional «Bucaramanga 2026». Respondes SOLO con un objeto JSON válido, sin texto antes ni después y sin bloques de código.

FORMATO DE SALIDA
{"titulo": "...", "tono": "<tono>", "diapositivas": [ {tipo, ...} ]}

${CATALOGO}

Valores de "animo" (opcional, uno por diapositiva y no en todas): ${ANIMOS.join(", ")}. «feliz» para lo logrado, «piensa» para lo pendiente o por decidir, «idea» para aperturas de sección, «excelente» para logros destacados. Nunca otro valor.
"notas": guion para quien presenta, 2 a 5 frases (≤${MAX_NOTAS} caracteres), solo con hechos del informe.

REGLAS DE LA PLANTILLA
- Primera diapositiva: portada. Última: cierre. Un solo tipo «portada».
- El título de las diapositivas con banda (tabla, tarjetas, cifras, cumplimiento, grafica, logros, evidencias) va dentro de una banda azul: máximo ${MAX_BANDA} caracteres. Si lo quieres en la banda corta, que tenga ${MAX_BANDA_CORTA} caracteres o menos («Acciones», «Logros»).
- Las listas largas (filas de una tabla, tarjetas, cifras, logros, anexos, series de una gráfica) puedes escribirlas completas en UNA diapositiva: el servidor las reparte en láminas de continuación («parte n de m»). No las acortes ni las resumas por espacio.
- Respeta el límite de cada campo: un texto del informe más largo que el límite de una tarjeta, cifra o celda NO se mete recortado ahí; va en una diapositiva «texto» (párrafos), que no se recorta. Las filas de las tablas son LISTAS de celdas (["a","b"]), nunca objetos, con tantas celdas como columnas.
- Cada diapositiva dice una cosa, pero el contenido del informe se conserva: la presentación es una versión completa y ordenada, no un resumen.
- Los estados de los datos y las cifras van en tablas, cifras o gráficas, no escondidos en un párrafo.
- Los estados se escriben siempre con su palabra («Completado», «En proceso», «Sin iniciar»), nunca solo con color o símbolo.

COBERTURA COMPLETA (lo más importante)
Recorre el informe sección por sección, en su orden, y cubre TODO lo que trae. Por cada sección del informe: una diapositiva «seccion» (opcional si es corta) y, según lo que tenga:
- Narración o texto de la sección (campo "texto", aportes, análisis, observaciones, descripciones, justificaciones): diapositivas «texto» con los párrafos del informe casi tal cual. Parafrasea solo lo mínimo para que se lea bien proyectado; conserva sus datos, nombres, fechas y matices; no los resumas en una frase ni los omitas. Un texto largo va entero en una diapositiva «texto» (el servidor lo parte); no lo dividas tú.
- Alineación estratégica: una tarjeta por pilar con su avance y su aporte, y las acciones de cada pilar.
- Objetivos y metas / plan de trabajo: una tabla con TODAS las acciones (acción, meta, responsable, fecha, estado si lo trae).
- Metas con resultado (programa y adicionales): tabla con meta, alcanzado, estado y análisis.
- Resultados por dimensión: por cada dimensión, sus indicadores con valor, meta y estado (cifras, tarjetas o tabla) y, si hay 2 o más cifras comparables, una «grafica»; y las acciones que la unidad describió (nombre, descripción, lo hecho, fecha de finalización).
- Síntesis de resultados: «cumplimiento» con el conteo por dimensión, «cifras» con los totales y, si el informe trae avances por dimensión o pilar, una «grafica» de progreso o barras. Una gráfica por idea, con sus datos reales; si el informe no trae cifras para dibujar, no hay gráfica.
- Logros: todos, cada uno con su resultado y su anexo.
- Evidencias, anexos y fuentes: todos los anexos y los enlaces que el informe trae.
- Secciones de tabla libre o de bloques: sus tablas y textos.
GRÁFICAS: si el informe trae cifras comparables, incluye entre 2 y 4 diapositivas «grafica» repartidas en la presentación (avance de cada pilar → «barras»; indicadores frente a su meta → «progreso»; conteos del plan por estado → «dona»; pocos valores → «columnas»), siempre con valores que estén tal cual en el informe. Una gráfica no sustituye a la tabla o las cifras de esos mismos datos cuando hacen falta los detalles.
Si una parte no tiene datos, no hay diapositiva de esa parte. La presentación abre con portada y agenda y cierra con evidencias/fuentes y cierre.

NO INVENTAR (regla obligatoria)
- Toda cifra, nombre, fecha, enlace, cargo o cita que escribas debe estar en el informe, tal cual. No calcules porcentajes nuevos, no sumes, no redondees, no estimes, no completes con lo que "suele" pasar.
- Escribe las cifras con dígitos, como aparecen en el informe.
- Lo que el informe no traiga se escribe exactamente «${POR_COMPLETAR}». Nunca lo rellenes. No inventes enlaces: usa solo los que el informe trae.
- El tono cambia solo la redacción, nunca los hechos.
- Un servidor revisa cada número y cada enlace contra el informe: lo que no esté, se borra.

REDACCIÓN
Español de Colombia, sin frases de relleno ni fórmulas de asistente («cabe destacar», «en el panorama actual», «es importante resaltar», «sin lugar a dudas»), sin exclamaciones, sin emojis, sin «no solo… sino también».
${textoDeTono(tono)}
La voz cambia cómo se escribe, no cuánto del informe se cubre: en las diapositivas de narración conserva el contenido del informe aunque la voz pida frases cortas (córtalas en puntos, no las borres).
El campo "tono" del JSON es «${tono}».

Antes de responder, razona en inglés lo que necesites. La respuesta final es únicamente el JSON.`;
}

export interface EntradaUsuario {
  informe: unknown;
  duracion_min?: number;
  enfoque?: string;
}

export function mensajeUsuario(e: EntradaUsuario): string {
  const { texto, recortado } = compactarInforme(e.informe);
  const { min, max } = diapositivasObjetivo(e.duracion_min, texto.length);
  const enfoque = (e.enfoque ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return [
    `Arma la presentación completa con entre ${min} y ${max} diapositivas${e.duracion_min ? ` (para unos ${Math.round(e.duracion_min)} minutos)` : ""}; si el informe trae más contenido, usa el máximo. Las láminas de continuación que el servidor agrega no cuentan.`,
    enfoque ? `Enfoque pedido por quien presenta (úsalo para elegir qué destacar; no cambia los hechos): «${enfoque}»` : "",
    recortado ? "Nota: el informe era muy largo y se recortó (listas o textos); trabaja con lo que ves y no completes lo que falta." : "",
    "INFORME (JSON; las cifras ya están resueltas):",
    texto,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Los mensajes de la primera llamada. */
export function mensajesPresentacion(tono: Tono, e: EntradaUsuario): Mensaje[] {
  return [
    { role: "system", content: mensajeSistema(tono) },
    { role: "user", content: mensajeUsuario(e) },
  ];
}

/** El reintento: lo que respondió el modelo y qué falló, para que corrija solo eso. */
export function mensajesReintento(mensajes: Mensaje[], crudo: string, errores: string[]): Mensaje[] {
  return [
    ...mensajes,
    { role: "assistant", content: crudo.slice(0, 20_000) },
    { role: "user", content: `Tu respuesta no pasó la validación:\n${errores.slice(0, 10).map((e) => `- ${e}`).join("\n")}\n\nCorrígela y devuelve el objeto JSON completo, solo el JSON. Mantén los tipos cerrados, los límites de longitud y los hechos del informe.` },
  ];
}

export const TIPOS_DISPONIBLES = TIPOS;
