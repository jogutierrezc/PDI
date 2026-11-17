/* =============================================================================
   Pilo presentaciones · los mensajes para Astra.

   Módulo puro. Arma el prompt de sistema (catálogo de tipos, reglas de la
   plantilla, anti-invención, la voz del tono) y el del usuario (el informe,
   compactado para caber en el contexto de Astra). El razonamiento del modelo se
   queda en inglés; el JSON de la presentación va en español de Colombia.
   ========================================================================== */

import { ANIMOS, LIM, MAX_BANDA, MAX_BANDA_CORTA, MAX_FILAS_TABLA, MAX_NOTAS, POR_COMPLETAR, TIPOS } from "./esquema.ts";
import { textoDeTono } from "./tonos.ts";
import type { Tono } from "./tonos.ts";

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Cuántos caracteres del informe caben en el prompt (el contexto de Astra es de 32 768 tokens y la respuesta gasta tope). */
export const PRESUPUESTO_INFORME = 48_000;
const TEXTO_LARGO = 500;
const SIN_USO = new Set(["drive", "driveLogros", "driveIndicadores", "matriz", "clave", "funcion"]);

const vacio = (v: unknown) => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

function podar(v: unknown, tope: number, perdio: { cortes: number }, hondo = 0): unknown {
  if (typeof v === "string") return v.length > TEXTO_LARGO ? `${v.slice(0, TEXTO_LARGO)}…` : v;
  if (Array.isArray(v)) {
    if (v.length > tope) perdio.cortes++;
    return v.slice(0, tope).map((x) => podar(x, tope, perdio, hondo + 1)).filter((x) => !vacio(x));
  }
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (SIN_USO.has(k)) continue;
      const p = podar(x, tope, perdio, hondo + 1);
      if (!vacio(p)) o[k] = p;
    }
    return o;
  }
  return v;
}

/** El informe sin lo vacío ni lo que no se dibuja, recortado por listas hasta caber en el presupuesto. */
export function compactarInforme(informe: unknown, presupuesto = PRESUPUESTO_INFORME): { texto: string; recortado: boolean } {
  for (const tope of [60, 40, 25, 15, 10, 6, 4]) {
    const perdio = { cortes: 0 };
    const texto = JSON.stringify(podar(informe, tope, perdio));
    if (texto.length <= presupuesto) return { texto, recortado: perdio.cortes > 0 };
  }
  return { texto: JSON.stringify(podar(informe, 3, { cortes: 0 })).slice(0, presupuesto), recortado: true };
}

/** Diapositivas objetivo según los minutos (≈ 1,5 min por diapositiva); sin duración, 12. */
export function diapositivasObjetivo(minutos?: number): { min: number; max: number } {
  if (!minutos || !Number.isFinite(minutos) || minutos <= 0) return { min: 9, max: 14 };
  const n = Math.max(5, Math.min(24, Math.round(minutos / 1.5)));
  return { min: Math.max(4, n - 2), max: Math.min(30, n + 2) };
}

const CATALOGO = `TIPOS DE DIAPOSITIVA (cerrados; cada una puede llevar "animo" y "notas"):
1. portada: {tipo, titulo (≤${LIM.titulo}), subtitulo (≤${LIM.subtitulo}), etiqueta? (≤${LIM.etiqueta})}
2. agenda: {tipo, titulo (≤${LIM.itemTitulo}), items: 2-7 de {titulo (≤${LIM.itemTitulo}), detalle? (≤${LIM.itemDetalle})}}
3. seccion: {tipo, numero? ("01"), kicker? (≤50), titulo (≤${LIM.titulo}), bajada? (≤${LIM.bajada})}  (portada de sección, fondo azul)
4. tabla: {tipo, titulo (≤${MAX_BANDA}), intro? (≤${LIM.intro}), columnas: 2-5 (≤${LIM.celdaCabecera} c/u), filas: ≤${MAX_FILAS_TABLA} filas de tantas celdas como columnas (≤${LIM.celda} c/u), nota? (≤${LIM.nota})}
5. tarjetas: {tipo, titulo (≤${MAX_BANDA}), intro?, tarjetas: 2-4 de {titulo (≤${LIM.tarjetaTitulo}), cifra? (≤${LIM.tarjetaCifra}, p. ej. "72 %"), texto (≤${LIM.tarjetaTexto}), pie? (≤${LIM.tarjetaPie})}, destacado? {etiqueta, valor}}
6. cifras: {tipo, titulo (≤${MAX_BANDA}), intro?, cifras: 2-4 de {valor (≤${LIM.tarjetaCifra}), etiqueta (≤${LIM.cifraEtiqueta}), detalle? (≤${LIM.cifraDetalle})}, nota?}
7. cumplimiento: {tipo, titulo (≤${MAX_BANDA}), filas: 1-6 de {dimension (≤${LIM.dimension}), completadas, en_proceso, pendientes (enteros)}, resumen?: hasta 3 de {valor, etiqueta}, nota?}  (gráfica de barras apiladas por dimensión)
8. logros: {tipo, titulo (≤${MAX_BANDA}), intro?, logros: 1-4 de {titulo (≤${LIM.logroTitulo}), resultado (≤${LIM.logroTexto}), evidencia? (≤${LIM.etiqueta}, p. ej. "Anexo 3")}}
9. evidencias: {tipo, titulo (≤${MAX_BANDA}), anexos: ≤6 de {n, documento, descripcion?}, fuentes: ≤4 textos (≤${LIM.fuente}), enlaces?: ≤4 de {texto, url}}
10. texto: {tipo, eyebrow? (≤${LIM.etiqueta}), titulo (≤70), parrafos?: ≤3 (≤${LIM.parrafo}), puntos?: ≤5 (≤${LIM.punto})}
11. cierre: {tipo, titulo (≤${LIM.etiqueta}, p. ej. "Gracias"), contacto? (≤${LIM.contacto})}`;

export function mensajeSistema(tono: Tono): string {
  return `Eres Pilo, el asistente de la Universidad de Santander (UDES). Conviertes un informe de gestión en una presentación para proyectar, sobre la plantilla institucional «Bucaramanga 2026». Respondes SOLO con un objeto JSON válido, sin texto antes ni después y sin bloques de código.

FORMATO DE SALIDA
{"titulo": "...", "tono": "<tono>", "diapositivas": [ {tipo, ...} ]}

${CATALOGO}

Valores de "animo" (opcional, uno por diapositiva y no en todas): ${ANIMOS.join(", ")}. «feliz» para lo logrado, «piensa» para lo pendiente o por decidir, «idea» para aperturas de sección, «excelente» para logros destacados. Nunca otro valor.
"notas": guion para quien presenta, 1 a 3 frases (≤${MAX_NOTAS} caracteres), solo con hechos del informe.

REGLAS DE LA PLANTILLA
- Primera diapositiva: portada. Última: cierre. Un solo tipo «portada».
- El título de las diapositivas con banda (tabla, tarjetas, cifras, cumplimiento, logros, evidencias) va dentro de una banda azul: máximo ${MAX_BANDA} caracteres. Si lo quieres en la banda corta, que tenga ${MAX_BANDA_CORTA} caracteres o menos («Acciones», «Logros»).
- Una tabla no pasa de ${MAX_FILAS_TABLA} filas: si hay más datos, escoge las más importantes o usa dos tablas con títulos distintos.
- Cada diapositiva dice una cosa. Frases cortas que se lean proyectadas. Nada de párrafos largos.
- Los estados se escriben siempre con su palabra («Completado», «En proceso», «Sin iniciar»), nunca solo con color o símbolo.

ESTRUCTURA SUGERIDA (usa solo lo que el informe tenga; si una parte no tiene datos, no hay diapositiva de esa parte, y si no hay plan, no hay diapositivas de plan)
portada → agenda → alineación estratégica (seccion + tarjetas por pilar) → objetivos y metas (tabla del plan de trabajo) → resultados por dimensión (tarjetas o cifras) → síntesis (cumplimiento + cifras) → acciones (tabla con estado) → logros → evidencias y fuentes → cierre.

NO INVENTAR (regla obligatoria)
- Toda cifra, nombre, fecha, enlace, cargo o cita que escribas debe estar en el informe, tal cual. No calcules porcentajes nuevos, no sumes, no redondees, no estimes, no completes con lo que "suele" pasar.
- Escribe las cifras con dígitos, como aparecen en el informe.
- Lo que el informe no traiga se escribe exactamente «${POR_COMPLETAR}». Nunca lo rellenes. No inventes enlaces: usa solo los que el informe trae.
- El tono cambia solo la redacción, nunca los hechos.
- Un servidor revisa cada número y cada enlace contra el informe: lo que no esté, se borra.

REDACCIÓN
Español de Colombia, sin frases de relleno ni fórmulas de asistente («cabe destacar», «en el panorama actual», «es importante resaltar», «sin lugar a dudas»), sin exclamaciones, sin emojis, sin «no solo… sino también».
${textoDeTono(tono)}
El campo "tono" del JSON es «${tono}».

Antes de responder, razona en inglés lo que necesites. La respuesta final es únicamente el JSON.`;
}

export interface EntradaUsuario {
  informe: unknown;
  duracion_min?: number;
  enfoque?: string;
}

export function mensajeUsuario(e: EntradaUsuario): string {
  const { min, max } = diapositivasObjetivo(e.duracion_min);
  const { texto, recortado } = compactarInforme(e.informe);
  const enfoque = (e.enfoque ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return [
    `Arma la presentación con entre ${min} y ${max} diapositivas${e.duracion_min ? ` (para unos ${Math.round(e.duracion_min)} minutos)` : ""}.`,
    enfoque ? `Enfoque pedido por quien presenta (úsalo para elegir qué destacar; no cambia los hechos): «${enfoque}»` : "",
    recortado ? "Nota: el informe era muy largo y se resumió por listas; trabaja con lo que ves." : "",
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
