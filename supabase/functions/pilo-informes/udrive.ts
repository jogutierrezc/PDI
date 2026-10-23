/* =============================================================================
   Pilo en UDrive · lógica pura y manejador de las acciones de pilo-informes

     udrive_redactar    { modo, tipo, texto?, instruccion?, contexto }
                         → { ok, texto?, items?, avisos }
     udrive_estructurar { tarea: niveles|limpiar|nombres, items, archivo? }
                         → { ok, ... según la tarea }

   «Que Pilo lo redacte» (fase 3 de UDrive) y «Importar Word o PDF». Comparte con
   Informes el proveedor de IA, la bitácora (news_runs) y los topes de tiempo;
   lo propio de UDrive es lo que se verifica:

     · Siempre es una PROPUESTA: nada se guarda aquí; la persona la acepta o la
       descarta en el editor.
     · Las marcas del texto son las de src/modules/udrive/lib/texto.ts:
       **negrita**, *cursiva*, [[clave]] (cifra viva), {{cita:id}} y {{ref:id}}.
       Pilo solo puede usar las claves, fuentes y figuras que el documento ya
       trae (van en `contexto`), copiadas tal cual; nunca escribe una cifra a
       mano. Mejorar, alargar, formal y ortografía conservan todas las marcas.
     · Sin huellas de escritura de IA: el prompt las prohíbe y la verificación
       rechaza las más claras (con un reintento).
     · «estructurar» solo reordena lo que el lector determinista ya leyó: no
       agrega palabras. Un texto «limpio» debe tener las mismas letras y
       números que el original.

   Acceso: sesión con rol y pantalla de UDrive (drive_entra, migración 0187).
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { extraerJson, type Lectura, type Mensaje } from "../pilo-rankingsod/logica.ts";
import { elegirProveedor, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import * as datos from "./datos.ts";
import { AltoProveedor, crearIA } from "./ia.ts";

export const ACCIONES_UDRIVE = ["udrive_redactar", "udrive_estructurar"] as const;
export type AccionUdrive = (typeof ACCIONES_UDRIVE)[number];
export const esAccionUdrive = (a: unknown): a is AccionUdrive => (ACCIONES_UDRIVE as readonly string[]).includes(String(a));

export const FUENTE_UDRIVE = "Pilo en UDrive";

export const MODOS = ["redactar", "mejorar", "resumir", "alargar", "formal", "ortografia"] as const;
export type Modo = (typeof MODOS)[number];
export const TIPOS_TEXTO = ["parrafo", "lista", "destacado", "nota"] as const;
export type TipoTexto = (typeof TIPOS_TEXTO)[number];
export const TAREAS = ["niveles", "limpiar", "nombres"] as const;
export type Tarea = (typeof TAREAS)[number];

const MAX_TEXTO = 6000;
const MAX_INSTRUCCION = 600;
const MAX_ITEMS_LISTA = 12;
/** Largo máximo de lo que Pilo devuelve, por tipo de bloque (el de UDrive es el de lib/documento.ts). */
const MAX_SALIDA: Record<TipoTexto, number> = { parrafo: 3000, lista: 3000, destacado: 500, nota: 600 };

/* ---------- el pedido ---------------------------------------------------------------------- */

export interface ContextoUdrive {
  informe: string;
  capitulo: string;
  antes: string;
  cifras: { clave: string; etiqueta: string; valor: string }[];
  fuentes: { id: string; cita: string }[];
  figuras: { id: string; etiqueta: string; titulo: string }[];
}

export interface PedidoRedactar {
  modo: Modo;
  tipo: TipoTexto;
  texto: string;
  instruccion: string;
  contexto: ContextoUdrive;
}

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const CLAVE = /^[a-z0-9_]{1,60}$/i;
const cadena = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").slice(0, max) : "");
const lista = (v: unknown, max: number): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).slice(0, max).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x));

export function leerPedidoRedactar(cuerpo: Record<string, unknown>): Lectura<PedidoRedactar> {
  const modo = String(cuerpo.modo) as Modo;
  if (!(MODOS as readonly string[]).includes(modo)) return { ok: false, error: "El modo no es válido." };
  const tipo = String(cuerpo.tipo) as TipoTexto;
  if (!(TIPOS_TEXTO as readonly string[]).includes(tipo)) return { ok: false, error: "El tipo de bloque no es válido." };
  const texto = cadena(cuerpo.texto, MAX_TEXTO + 1).trim();
  if (texto.length > MAX_TEXTO) return { ok: false, error: `El texto tiene más de ${MAX_TEXTO} caracteres: seleccione un bloque más corto.` };
  const instruccion = cadena(cuerpo.instruccion, MAX_INSTRUCCION).trim();
  if (modo !== "redactar" && !texto) return { ok: false, error: "Este bloque no tiene texto que trabajar." };
  if (modo === "redactar" && !texto && !instruccion) return { ok: false, error: "Escriba qué quiere que Pilo redacte." };
  const c = (cuerpo.contexto && typeof cuerpo.contexto === "object" ? cuerpo.contexto : {}) as Record<string, unknown>;
  const contexto: ContextoUdrive = {
    informe: cadena(c.informe, 160).replace(/\n/g, " ").trim(),
    capitulo: cadena(c.capitulo, 200).replace(/\n/g, " ").trim(),
    antes: cadena(c.antes, 700).trim(),
    cifras: lista(c.cifras, 40).flatMap((x) => (CLAVE.test(String(x.clave ?? "")) ? [{ clave: String(x.clave).toLowerCase(), etiqueta: cadena(x.etiqueta, 120).replace(/\n/g, " "), valor: cadena(x.valor, 40).replace(/\n/g, " ") }] : [])),
    fuentes: lista(c.fuentes, 30).flatMap((x) => (ID.test(String(x.id ?? "")) ? [{ id: String(x.id), cita: cadena(x.cita, 160).replace(/\n/g, " ") }] : [])),
    figuras: lista(c.figuras, 40).flatMap((x) => (ID.test(String(x.id ?? "")) ? [{ id: String(x.id), etiqueta: cadena(x.etiqueta, 40).replace(/\n/g, " "), titulo: cadena(x.titulo, 160).replace(/\n/g, " ") }] : [])),
  };
  return { ok: true, valor: { modo, tipo, texto, instruccion, contexto } };
}

/* ---------- las marcas ------------------------------------------------------------------------ */

const CIFRA_RE = /\[\[([a-z0-9_]{1,60})\]\]/gi;
const CITA_RE = /\{\{cita:([A-Za-z0-9_-]{1,60})(?:\|[^}]{0,80})?\}\}/g;
const REF_RE = /\{\{ref:([A-Za-z0-9_-]{1,60})\}\}/g;
const ENLACE_RE = /\[([^\][]{1,400})\]\((https?:\/\/[^)\s]{1,800})\)/g;

export interface Marcas {
  cifras: string[];
  citas: string[];
  refs: string[];
}

export function marcasDe(t: string): Marcas {
  const s = String(t ?? "");
  return {
    cifras: [...s.matchAll(CIFRA_RE)].map((m) => m[1].toLowerCase()),
    citas: [...s.matchAll(CITA_RE)].map((m) => m[1]),
    refs: [...s.matchAll(REF_RE)].map((m) => m[1]),
  };
}

/** El texto sin marcas (ni los enlaces ni sus direcciones): solo lo que se lee. */
export function sinMarcas(t: string): string {
  return String(t ?? "")
    .replace(ENLACE_RE, "$1")
    .replace(CIFRA_RE, " ")
    .replace(CITA_RE, " ")
    .replace(REF_RE, " ")
    .replace(/\\(.)/g, "$1")
    .replace(/\*+/g, "");
}

const urlsDe = (t: string) => [...String(t ?? "").matchAll(ENLACE_RE)].map((m) => m[2]);

/** Los números que se leen en el texto (sin separadores de miles ni decimales: «2.580» → «2580»). */
export function numerosDe(t: string): string[] {
  return [...sinMarcas(t).matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/[.,]/g, ""));
}

/* ---------- huellas de escritura de IA ----------------------------------------------------------- */

/** Las más claras (guía «Signs of AI writing» de Wikipedia, en español): se rechazan y se pide corregirlas. */
const HUELLAS: { re: RegExp; texto: string }[] = [
  { re: /\b(en conclusi[óo]n|en resumen|para concluir|en definitiva)\b[ ,]/i, texto: "cierre de plantilla («en conclusión», «en resumen»)" },
  { re: /\b(cabe|conviene|es importante|es fundamental|vale la pena|resulta crucial) (destacar|resaltar|se[ñn]alar|mencionar|subrayar|notar)\b/i, texto: "«cabe destacar», «es importante señalar»" },
  { re: /\bno (solo|s[óo]lo|únicamente) [^.;]{1,80}\bsino (que )?(también|además)\b/i, texto: "paralelismo «no solo… sino también»" },
  { re: /\b(juega|desempe[ñn]a|cumple) un papel (crucial|fundamental|clave|vital|esencial|central)\b/i, texto: "«juega un papel crucial»" },
  { re: /\b(tapiz|testimonio de|panorama (actual|cambiante)|en el mundo actual|en la era (actual|digital))\b/i, texto: "vocabulario inflado («tapiz», «testimonio de», «panorama actual»)" },
  { re: /\b(sin duda|indudablemente|innegablemente|sin lugar a dudas)\b/i, texto: "énfasis vacío («sin duda»)" },
  { re: /\b(esperamos que|espero que) (esto|le|te) (sea|resulte|ayude)\b|\bcon gusto\b|\bclaro que s[ií]\b|¡/i, texto: "cortesía de chatbot" },
  { re: /\b(los|varios) (expertos|especialistas|estudios|analistas) (coinciden|sugieren|señalan|afirman|destacan)\b/i, texto: "atribución vaga («los expertos coinciden»)" },
];

export function huellasDe(t: string): string[] {
  const s = String(t ?? "");
  return HUELLAS.filter((h) => h.re.test(s)).map((h) => h.texto);
}

const REGLAS_ESTILO = [
  "Estilo (escribe como una persona del equipo, no como un asistente):",
  "· Frases directas y verbos concretos. Di lo que pasó, quién lo hizo y qué resultó; nada de importancia genérica.",
  "· Sin vocabulario inflado ni publicitario: nada de «crucial», «fundamental», «clave», «vibrante», «panorama», «tapiz», «testimonio de», «juega un papel».",
  "· Sin paralelismos «no solo… sino también», sin enumeraciones forzadas de tres elementos y sin gerundios de relleno al final de la frase («destacando…», «reflejando…», «contribuyendo a…»).",
  "· Sin cierres de plantilla («en conclusión», «en resumen», «cabe destacar») ni frases que repitan lo ya dicho.",
  "· Sin atribuciones vagas («los expertos coinciden»): si no hay fuente en las listas, no atribuyas.",
  "· Sin cortesías de chatbot, signos de exclamación, emojis, rayas largas decorativas, comillas decorativas ni negrita de adorno.",
  "· La misma palabra para la misma cosa: no alternes sinónimos para variar.",
].join("\n");

/* ---------- los mensajes de «redactar» ------------------------------------------------------------------ */

const INSTRUCCION_MODO: Record<Modo, string> = {
  redactar: "Redacta el texto que pide la persona.",
  mejorar: "Mejora la redacción: más claro y directo, mismos hechos y extensión parecida.",
  resumir: "Resume: deja alrededor de la mitad de la extensión, con lo esencial.",
  alargar: "Desarrolla un poco más el texto con detalle que ya esté en el propio texto, el pedido o el contexto; sin inventar hechos. Hasta un 50 % más de largo.",
  formal: "Reescríbelo con un registro institucional más formal y sobrio, sin cambiar los hechos.",
  ortografia: "Corrige solo la ortografía, la puntuación y los errores gramaticales. No cambies palabras, orden ni estilo.",
};

const FORMA: Record<TipoTexto, string> = {
  parrafo: "Un solo párrafo (sin saltos de línea), de 40 a 140 palabras salvo que el pedido o el texto original pidan otra extensión. Devuelve {\"texto\": \"…\"}.",
  lista: `Una lista de 2 a ${MAX_ITEMS_LISTA} elementos, cada uno una frase breve sin viñeta ni numeración. Devuelve {"items": ["…", "…"]}.`,
  destacado: "Una o dos frases para un cuadro destacado, de hasta 500 caracteres. Devuelve {\"texto\": \"…\"}.",
  nota: "Una nota breve de fuente o aclaración, de hasta 600 caracteres, sin la palabra «Nota.» al inicio. Devuelve {\"texto\": \"…\"}.",
};

export function mensajesRedactar(p: PedidoRedactar): Mensaje[] {
  const c = p.contexto;
  const system = [
    "Eres Mr. Pilo, la IA de la Universidad de Santander (UDES). Ayudas a una persona del equipo a escribir un informe institucional. Escribes en español de Colombia, claro y sobrio, con el registro de un informe de gestión.",
    "Reglas que no se rompen:",
    "1. Cifras: nunca escribas una cifra con dígitos ni con palabras que no esté ya en el texto original o en el pedido de la persona. Para usar una cifra del informe, escribe su marca [[clave]] copiada tal cual de la lista «Cifras del informe». Nada de redondear ni recalcular.",
    "2. Citas y referencias: solo las marcas {{cita:id}} y {{ref:id}} de las listas, copiadas tal cual. No inventes autores, fuentes, normas, fechas, premios, convenios ni causas. Si falta un dato, no lo supongas: escribe con lo que hay.",
    "3. Las marcas que ya trae el texto original ([[…]], {{cita:…}}, {{ref:…}}, enlaces [texto](url)) se conservan tal cual, salvo al resumir, donde puedes quitar alguna. Nunca agregues una marca que no esté en las listas.",
    "4. Formato: texto plano. Solo **negrita** y *cursiva* con asteriscos cuando el original ya las usa. Sin títulos, viñetas, numeración, markdown, HTML, emojis ni otros corchetes.",
    REGLAS_ESTILO,
    'Responde solo un JSON, sin texto antes ni después.',
  ].join("\n");
  const partes: string[] = [];
  if (c.informe) partes.push(`Informe: ${c.informe}.`);
  if (c.capitulo) partes.push(`Capítulo donde va: ${c.capitulo}.`);
  if (c.antes) partes.push(`Lo que va justo antes (solo para dar continuidad, no lo repitas):\n«${sinMarcas(c.antes).slice(0, 700)}»`);
  partes.push(c.cifras.length ? `Cifras del informe (usa solo estas marcas):\n${c.cifras.map((x) => `· [[${x.clave}]] = ${x.valor}${x.etiqueta ? ` (${x.etiqueta})` : ""}`).join("\n")}` : "Este informe aún no tiene cifras vivas: no escribas ninguna cifra.");
  if (c.fuentes.length) partes.push(`Fuentes para citar (marca → cómo se lee):\n${c.fuentes.map((x) => `· {{cita:${x.id}}} → ${x.cita}`).join("\n")}`);
  if (c.figuras.length) partes.push(`Figuras a las que se puede remitir:\n${c.figuras.map((x) => `· {{ref:${x.id}}} → ${x.etiqueta}${x.titulo ? `. ${x.titulo}` : ""}`).join("\n")}`);
  if (p.texto) partes.push(`Texto actual del bloque${p.tipo === "lista" ? " (un elemento por línea)" : ""}:\n«${p.texto}»`);
  if (p.instruccion) partes.push(`Pedido de la persona: ${p.instruccion}`);
  partes.push(`Tarea: ${INSTRUCCION_MODO[p.modo]}\nForma: ${FORMA[p.tipo]}`);
  return [
    { role: "system", content: system },
    { role: "user", content: partes.join("\n\n") },
  ];
}

/* ---------- lectura y verificación de la propuesta ------------------------------------------------------------ */

export interface Propuesta {
  texto?: string;
  items?: string[];
}

export function leerPropuesta(crudo: string, tipo: TipoTexto): Lectura<Propuesta> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const limpiar = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (tipo === "lista") {
    let items: unknown = j.valor.items;
    if (!Array.isArray(items) && typeof j.valor.texto === "string") items = j.valor.texto.split("\n");
    if (!Array.isArray(items)) return { ok: false, error: "El JSON no trae «items»." };
    const limpios = items.filter((x): x is string => typeof x === "string").map((x) => limpiar(x).replace(/^[-*•\d.)\s]+(?=\S)/, "").trim()).filter(Boolean);
    return limpios.length ? { ok: true, valor: { items: limpios } } : { ok: false, error: "La lista llegó vacía." };
  }
  const t = j.valor.texto;
  if (typeof t !== "string" || !t.trim()) return { ok: false, error: "El JSON no trae «texto»." };
  return { ok: true, valor: { texto: limpiar(t) } };
}

export type Verificacion = { ok: true; avisos: string[] } | { ok: false; error: string };

export function verificarPropuesta(p: PedidoRedactar, r: Propuesta): Verificacion {
  const piezas = p.tipo === "lista" ? (r.items ?? []) : [r.texto ?? ""];
  const todo = piezas.join("\n");
  if (!todo.trim()) return { ok: false, error: "La propuesta llegó vacía." };
  const avisos: string[] = [];

  // Forma.
  if (p.tipo === "lista") {
    if (piezas.length < 1 || piezas.length > MAX_ITEMS_LISTA) return { ok: false, error: `La lista debe tener entre 1 y ${MAX_ITEMS_LISTA} elementos.` };
    if (piezas.some((i) => i.length > 400 || /\n/.test(i))) return { ok: false, error: "Cada elemento de la lista debe ser una frase breve, sin saltos de línea." };
  } else {
    if (/\n\s*\n/.test(todo)) return { ok: false, error: "Debe ser un solo párrafo, sin líneas en blanco." };
    if (todo.length > MAX_SALIDA[p.tipo]) return { ok: false, error: `El texto pasa de ${MAX_SALIDA[p.tipo]} caracteres.` };
  }
  if (/^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)/m.test(todo.replace(/\*\*/g, "")) && p.tipo !== "lista") return { ok: false, error: "No uses títulos, viñetas ni numeración." };
  if (/<\/?[a-z][^>]*>|`{1,3}/i.test(todo)) return { ok: false, error: "No uses HTML ni código." };
  if ((todo.match(/\*\*/g) ?? []).length % 2 === 1) return { ok: false, error: "Hay una negrita (**) sin cerrar." };
  if (/\p{Extended_Pictographic}/u.test(todo)) return { ok: false, error: "No uses emojis." };

  // Marcas: nada que el documento no tenga; y se conserva lo que ya traía.
  const permitidas = { cifras: new Set(p.contexto.cifras.map((c) => c.clave)), citas: new Set(p.contexto.fuentes.map((f) => f.id)), refs: new Set(p.contexto.figuras.map((f) => f.id)) };
  const orig = marcasDe(p.texto);
  const nuevas = marcasDe(todo);
  for (const k of nuevas.cifras) if (!permitidas.cifras.has(k) && !orig.cifras.includes(k)) return { ok: false, error: `La cifra [[${k}]] no está en la lista del informe.` };
  for (const k of nuevas.citas) if (!permitidas.citas.has(k) && !orig.citas.includes(k)) return { ok: false, error: `La cita {{cita:${k}}} no está en la lista de fuentes.` };
  for (const k of nuevas.refs) if (!permitidas.refs.has(k) && !orig.refs.includes(k)) return { ok: false, error: `La referencia {{ref:${k}}} no está en la lista de figuras.` };
  if (p.modo !== "resumir" && p.modo !== "redactar") {
    const ahora = marcasDe(todo);
    const faltan = [
      ...orig.cifras.filter((k) => !ahora.cifras.includes(k)).map((k) => `[[${k}]]`),
      ...orig.citas.filter((k) => !ahora.citas.includes(k)).map((k) => `{{cita:${k}}}`),
      ...orig.refs.filter((k) => !ahora.refs.includes(k)).map((k) => `{{ref:${k}}}`),
    ];
    if (faltan.length) return { ok: false, error: `Se perdieron marcas del texto original: ${[...new Set(faltan)].slice(0, 4).join(", ")}. Conservarlas tal cual.` };
  }
  const urlsOrig = new Set(urlsDe(p.texto));
  if (urlsDe(todo).some((u) => !urlsOrig.has(u))) return { ok: false, error: "Agregaste un enlace que no estaba en el texto original." };

  // Números: solo los que ya estaban en el texto, el pedido o el contexto escrito por la persona.
  const conocidos = new Set([...numerosDe(p.texto), ...numerosDe(p.instruccion), ...numerosDe(p.contexto.informe), ...numerosDe(p.contexto.antes), ...numerosDe(p.contexto.capitulo), ...p.contexto.fuentes.flatMap((f) => numerosDe(f.cita)), ...p.contexto.figuras.flatMap((f) => numerosDe(`${f.etiqueta} ${f.titulo}`))]);
  const inventados = [...new Set(numerosDe(todo).filter((n) => !conocidos.has(n)))];
  if (inventados.length) return { ok: false, error: `Escribiste cifras a mano (${inventados.slice(0, 4).join(", ")}). Usa la marca [[clave]] o quita la cifra.` };

  const huellas = huellasDe(todo);
  if (huellas.length) return { ok: false, error: `Suena a texto de IA: ${huellas.join("; ")}. Reescríbelo directo.` };

  if (p.modo === "redactar" && !p.instruccion && !p.texto) avisos.push("Pilo escribió sin un pedido concreto.");
  if (p.modo === "ortografia" && sinMarcas(todo).trim().length > sinMarcas(p.texto).trim().length * 1.15 + 20) avisos.push("La corrección creció más de lo normal: revisa que no haya cambiado el texto.");
  return { ok: true, avisos };
}

/* ---------- «estructurar»: lo ambiguo de un Word o PDF importado ---------------------------------------------------- */

export interface ItemEstructura {
  i: number;
  texto: string;
  nivel: number;
  tam: number;
  pagina: number;
}

const MAX_ITEMS: Record<Tarea, number> = { niveles: 150, limpiar: 40, nombres: 40 };
const MAX_CHARS_ITEM: Record<Tarea, number> = { niveles: 200, limpiar: 1600, nombres: 600 };
const MAX_CHARS_TOTAL = 36_000;

export function leerPedidoEstructurar(cuerpo: Record<string, unknown>): Lectura<{ tarea: Tarea; items: ItemEstructura[]; archivo: string }> {
  const tarea = String(cuerpo.tarea) as Tarea;
  if (!(TAREAS as readonly string[]).includes(tarea)) return { ok: false, error: "La tarea no es válida." };
  const bruto = Array.isArray(cuerpo.items) ? cuerpo.items : [];
  if (!bruto.length) return { ok: false, error: "No hay nada que revisar." };
  if (bruto.length > MAX_ITEMS[tarea]) return { ok: false, error: `Son demasiados elementos para esta tarea (máximo ${MAX_ITEMS[tarea]}).` };
  const items: ItemEstructura[] = [];
  const vistos = new Set<number>();
  let total = 0;
  for (const x of bruto) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const i = Number(o.i);
    if (!Number.isInteger(i) || i < 0 || i > 100_000 || vistos.has(i)) return { ok: false, error: "Un elemento no tiene número válido." };
    vistos.add(i);
    const texto = cadena(o.texto, MAX_CHARS_ITEM[tarea]).trim();
    if (!texto) continue;
    total += texto.length;
    items.push({ i, texto, nivel: Math.min(3, Math.max(0, Math.round(Number(o.nivel) || 0))), tam: Math.round((Number(o.tam) || 0) * 10) / 10, pagina: Math.max(0, Math.round(Number(o.pagina) || 0)) });
  }
  if (!items.length) return { ok: false, error: "No hay texto que revisar." };
  if (total > MAX_CHARS_TOTAL) return { ok: false, error: "Hay demasiado texto para revisar de una vez." };
  return { ok: true, valor: { tarea, items, archivo: cadena(cuerpo.archivo, 160).replace(/\n/g, " ").trim() } };
}

export function mensajesEstructurar(tarea: Tarea, items: ItemEstructura[], archivo: string): Mensaje[] {
  const base = "Eres Mr. Pilo, la IA de la Universidad de Santander (UDES). Ayudas a pasar un Word o un PDF a un informe por bloques. No escribes contenido nuevo: solo decides cómo ordenar lo que ya hay. Responde solo un JSON, sin texto antes ni después.";
  if (tarea === "niveles") {
    return [
      { role: "system", content: [base, 'Se te da la lista de líneas que el lector detectó como posibles títulos, en orden de aparición, con su tamaño de letra relativo y el nivel que se le supuso. Decide para cada una: 0 si NO es un título (un rótulo de tabla, una frase corta del cuerpo, un número de página, un pie), o 1, 2 o 3 según su jerarquía real (1 = capítulo, 2 = sección, 3 = apartado). Mantén la jerarquía coherente: no saltes del 1 al 3 sin un 2 en medio, y no pongas muchos 1 si el documento claramente tiene un solo título general. Devuelve {"niveles": [{"i": número, "nivel": 0|1|2|3}, …]} con TODOS los i recibidos.'].join("\n") },
      { role: "user", content: `${archivo ? `Archivo: ${archivo}\n` : ""}Líneas:\n${items.map((x) => `${x.i} | nivel supuesto ${x.nivel} | letra ${x.tam} | pág. ${x.pagina} | ${x.texto}`).join("\n")}` },
    ];
  }
  if (tarea === "limpiar") {
    return [
      { role: "system", content: [base, 'Se te dan párrafos sacados de un PDF o Word con defectos de extracción: palabras partidas con guion al final de línea, espacios de más o de menos, saltos de línea en medio de la frase, letras separadas. Arréglalos SIN cambiar ninguna palabra, número ni signo con significado: no corrijas estilo, no resumas, no agregues ni quites contenido. Si un párrafo ya está bien, devuélvelo igual. Devuelve {"textos": [{"i": número, "texto": "…"}, …]}.'].join("\n") },
      { role: "user", content: items.map((x) => `### ${x.i}\n${x.texto}`).join("\n\n") },
    ];
  }
  return [
    { role: "system", content: [base, 'Se te da el nombre del archivo y, de cada tabla, su encabezado y las primeras filas. Propón un título corto (hasta 12 palabras) para cada tabla que diga qué contiene, en español, sin cifras que no estén en la muestra, sin la palabra «Tabla» al inicio y sin punto final. Propón también el título del documento (hasta 14 palabras) a partir del nombre del archivo y de lo que se ve; si no hay base, déjalo vacío. Devuelve {"titulo_documento": "…", "tablas": [{"i": número, "titulo": "…"}, …]}.'].join("\n") },
    { role: "user", content: `${archivo ? `Archivo: ${archivo}\n\n` : ""}${items.map((x) => `### Tabla ${x.i}\n${x.texto}`).join("\n\n")}` },
  ];
}

const soloLetras = (t: string) => t.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export interface ResultadoEstructura {
  niveles?: { i: number; nivel: number }[];
  textos?: { i: number; texto: string }[];
  titulo_documento?: string;
  tablas?: { i: number; titulo: string }[];
  descartados: number;
}

export function leerEstructura(crudo: string, tarea: Tarea, items: ItemEstructura[]): Lectura<ResultadoEstructura> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const conocidos = new Map(items.map((x) => [x.i, x]));
  if (tarea === "niveles") {
    if (!Array.isArray(j.valor.niveles)) return { ok: false, error: "Falta la lista «niveles»." };
    const salida: { i: number; nivel: number }[] = [];
    const vistos = new Set<number>();
    for (const x of j.valor.niveles) {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const i = Number(o.i);
      const nivel = Number(o.nivel);
      if (!conocidos.has(i) || vistos.has(i) || !Number.isInteger(nivel) || nivel < 0 || nivel > 3) return { ok: false, error: "Un nivel no corresponde a una línea recibida o no está entre 0 y 3." };
      vistos.add(i);
      salida.push({ i, nivel });
    }
    if (salida.length < items.length) return { ok: false, error: "Faltan líneas en la respuesta: deben venir todas." };
    return { ok: true, valor: { niveles: salida, descartados: 0 } };
  }
  if (tarea === "limpiar") {
    if (!Array.isArray(j.valor.textos)) return { ok: false, error: "Falta la lista «textos»." };
    const salida: { i: number; texto: string }[] = [];
    let descartados = 0;
    for (const x of j.valor.textos) {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const orig = conocidos.get(Number(o.i));
      const texto = typeof o.texto === "string" ? o.texto.replace(/\r\n?/g, "\n").replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim() : "";
      // Solo cuenta si no cambió ninguna letra ni número: arregla espacios, guiones y saltos, nada más.
      if (!orig || !texto || soloLetras(texto) !== soloLetras(orig.texto)) {
        descartados++;
        continue;
      }
      if (texto !== orig.texto) salida.push({ i: orig.i, texto });
    }
    return { ok: true, valor: { textos: salida, descartados } };
  }
  const conocidoTexto = soloLetras(items.map((x) => x.texto).join(" "));
  const titulo = typeof j.valor.titulo_documento === "string" ? j.valor.titulo_documento.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  if (!Array.isArray(j.valor.tablas)) return { ok: false, error: "Falta la lista «tablas»." };
  const salida: { i: number; titulo: string }[] = [];
  let descartados = 0;
  for (const x of j.valor.tablas) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const t = typeof o.titulo === "string" ? o.titulo.replace(/\s+/g, " ").replace(/[.\s]+$/, "").replace(/^tabla\s*\d*[.:\s-]*/i, "").trim().slice(0, 120) : "";
    // Sin cifras que no estén en la muestra ni marcas de formato.
    const nuevasCifras = (t.match(/\d+/g) ?? []).filter((n) => !conocidoTexto.includes(n));
    if (!conocidos.has(Number(o.i)) || !t || nuevasCifras.length || /[*[\]{}<>#`]/.test(t) || huellasDe(t).length) {
      descartados++;
      continue;
    }
    salida.push({ i: Number(o.i), titulo: t });
  }
  const tituloOk = titulo && !/[*[\]{}<>#`]/.test(titulo) && !huellasDe(titulo).length ? titulo : "";
  return { ok: true, valor: { titulo_documento: tituloOk, tablas: salida, descartados } };
}

/* ---------- el manejador ---------------------------------------------------------------------------------------------- */

type Responder = (cuerpo: unknown, estado?: number) => Response;

export async function atenderUdrive(a: {
  accion: AccionUdrive;
  cuerpo: Record<string, unknown>;
  admin: Parameters<typeof datos.leerProveedor>[0];
  url: string;
  anonKey: string;
  authorization: string;
  json: Responder;
}): Promise<Response> {
  const { accion, cuerpo, admin, json } = a;

  // Acceso: rol y pantalla de UDrive, con la sesión de quien llama.
  const comoUsuario = createClient(a.url, a.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: a.authorization } } });
  const entra = await comoUsuario.rpc("drive_entra");
  if (entra.error) {
    const falta = ["42883", "PGRST202"].includes(String(entra.error.code)) || /could not find the function|does not exist/i.test(entra.error.message ?? "");
    return json(falta ? { error: "Falta aplicar la migración 0187 (UDrive).", code: "migracion" } : { error: entra.error.message }, 500);
  }
  if (entra.data !== true) return json({ error: "Su usuario no tiene acceso a UDrive." }, 403);

  // Qué se pide (se valida antes de gastar IA).
  const redactar = accion === "udrive_redactar" ? leerPedidoRedactar(cuerpo) : null;
  if (redactar && !redactar.ok) return json({ error: redactar.error }, 400);
  const estructurar = accion === "udrive_estructurar" ? leerPedidoEstructurar(cuerpo) : null;
  if (estructurar && !estructurar.ok) return json({ error: estructurar.error }, 400);

  // El proveedor de IA (el mismo del resto de pilo-informes).
  const prov = await datos.leerProveedor(admin);
  const destino = elegirProveedor(leerAjustesIA(prov.ajustes), prov.settings, prov.secret);
  if (!destino.ok) return json({ error: destino.motivo ?? "La IA de Pilo no está lista.", code: "sin_ia" }, 503);
  const ia = crearIA(destino, prov.settings?.system_role === "user" && destino.eleccion === "pilo");
  const bitacora = (guardados: number, fallidos: number, error: string | null) =>
    datos.bitacora(admin, { inicio: ia.inicio, llamadas: ia.llamadas(), guardados, fallidos, error, fuente: FUENTE_UDRIVE });

  try {
    if (redactar?.ok) {
      const pedido = redactar.valor;
      const mensajes = mensajesRedactar(pedido);
      const r = await ia.llamarVerificado<{ propuesta: Propuesta; avisos: string[] }>(mensajes, 1800, (crudo) => {
        const l = leerPropuesta(crudo, pedido.tipo);
        if (!l.ok) return l;
        const v = verificarPropuesta(pedido, l.valor);
        return v.ok ? { ok: true, valor: { propuesta: l.valor, avisos: v.avisos } } : v;
      });
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una propuesta que cumpla las reglas: ${r.error}`, code: "verificacion" }, 422);
      }
      await bitacora(1, 0, null);
      return json({ ok: true, ...r.valor.propuesta, avisos: r.valor.avisos });
    }

    const pedido = estructurar && estructurar.ok ? estructurar.valor : null;
    if (!pedido) return json({ error: "Pedido inválido." }, 400);
    const r = await ia.llamarVerificado<ResultadoEstructura>(mensajesEstructurar(pedido.tarea, pedido.items, pedido.archivo), pedido.tarea === "limpiar" ? 6000 : 3000, (crudo) => leerEstructura(crudo, pedido.tarea, pedido.items));
    if (!r.ok) {
      await bitacora(0, 1, r.error);
      return json({ error: `Pilo no logró ordenar el archivo: ${r.error}`, code: "verificacion" }, 422);
    }
    await bitacora(1, 0, null);
    return json({ ok: true, tarea: pedido.tarea, ...r.valor });
  } catch (e) {
    if (e instanceof AltoProveedor) {
      await bitacora(0, 1, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    const m = e instanceof Error ? e.message : String(e);
    await bitacora(0, 1, m);
    return json({ error: m }, 500);
  }
}

