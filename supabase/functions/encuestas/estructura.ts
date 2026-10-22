/* =============================================================================
   Encuestas con Pilo · la estructura de una encuesta (migración 0184)

   Pura y sin dependencias: la usan la función `encuestas` (Deno) para validar lo
   que llega, y la intranet y la página pública (navegador) para editar, mostrar
   y comprobar. Una encuesta es un JSON versionado:

     { version: 1, secciones: [ { id, titulo, preguntas: [ {id, tipo, enunciado,
       apoyo?, obligatoria, opciones?, validaciones?, mostrarSi?, pilo?} ] } ] }

   Las respuestas son un mapa { [idPregunta]: valor } (enc_valores).
   ========================================================================== */

export const VERSION_ESTRUCTURA = 1;

export type TipoPregunta =
  | "texto_corto"
  | "parrafo"
  | "opcion_unica"
  | "opcion_multiple"
  | "lista"
  | "escala"
  | "cifra"
  | "fecha"
  | "contacto"
  | "archivo"
  | "bloque_logro_reto";

export const TIPOS_PREGUNTA: readonly { id: TipoPregunta; texto: string; ayuda: string }[] = [
  { id: "texto_corto", texto: "Texto corto", ayuda: "Una línea: un nombre, un cargo." },
  { id: "parrafo", texto: "Párrafo", ayuda: "Varias líneas para explicar." },
  { id: "opcion_unica", texto: "Opción única", ayuda: "Elige una entre pocas." },
  { id: "opcion_multiple", texto: "Opción múltiple", ayuda: "Puede marcar varias." },
  { id: "lista", texto: "Lista desplegable", ayuda: "Elige una entre muchas." },
  { id: "escala", texto: "Escala", ayuda: "Un número entre dos extremos." },
  { id: "cifra", texto: "Cifra con unidad", ayuda: "Un número con su unidad." },
  { id: "fecha", texto: "Fecha", ayuda: "Un día del calendario." },
  { id: "contacto", texto: "Correo o teléfono", ayuda: "Con formato comprobado." },
  { id: "archivo", texto: "Archivo", ayuda: "Un documento o imagen adjunto." },
  { id: "bloque_logro_reto", texto: "Logro o reto con cifras", ayuda: "Bloque repetible: título, descripción y cifras." },
];

export type Operador = "igual" | "distinto" | "contiene" | "mayor" | "menor" | "responde" | "vacio";
export const OPERADORES: readonly { id: Operador; texto: string; conValor: boolean }[] = [
  { id: "igual", texto: "es igual a", conValor: true },
  { id: "distinto", texto: "es distinto de", conValor: true },
  { id: "contiene", texto: "incluye", conValor: true },
  { id: "mayor", texto: "es mayor que", conValor: true },
  { id: "menor", texto: "es menor que", conValor: true },
  { id: "responde", texto: "tiene respuesta", conValor: false },
  { id: "vacio", texto: "está sin responder", conValor: false },
];

/** «Mostrar si»: la pregunta `pregunta` cumple `op` (con `valor`). */
export interface Condicion {
  pregunta: string;
  op: Operador;
  valor?: string | number;
}

export interface Opcion {
  id: string;
  texto: string;
}

export interface Validaciones {
  largoMin?: number;
  largoMax?: number;
  /** Cifra: rango permitido. */
  min?: number;
  max?: number;
  decimales?: boolean;
  /** Cifra: «estudiantes», «programas», «porcentaje», «dinero» o una palabra. */
  unidad?: string;
  /** Contacto. */
  formato?: "correo" | "telefono";
  /** Escala. */
  escalaMin?: number;
  escalaMax?: number;
  etiquetaMin?: string;
  etiquetaMax?: string;
  /** Archivo. */
  extensiones?: string[];
  tamanoMaxMb?: number;
  /** Fecha. */
  rango?: "pasado" | "futuro";
  /** Bloque repetible: cuántos aportes, como máximo. */
  maxItems?: number;
}

/** La capa de Pilo: lo que explica de este dato y cuándo pide confirmar una cifra. */
export interface CapaPilo {
  explicacion: string;
  /** Una cifra fuera de estos límites se confirma con la persona antes de seguir. */
  confirmarSi?: { mayorA?: number; menorA?: number };
}

/**
 * Los textos que acompañan un logro o un reto en el bloque «logro_reto»: lo que dice Pilo y lo que
 * se lee en cada subpaso. Todo es opcional; lo que falta usa el texto por defecto de la intranet.
 * Admite {max} (largo de la descripción) y {cifras} (cuántas cifras caben).
 */
export const CLAVES_TEXTO_APORTE = [
  "piloTitulo",
  "tituloPregunta",
  "tituloAyuda",
  "tituloEjemplo",
  "piloDescripcion",
  "descripcionPregunta",
  "descripcionAyuda",
  "piloCifras",
  "cifrasPregunta",
  "cifrasAyuda",
] as const;
export type ClaveTextoAporte = (typeof CLAVES_TEXTO_APORTE)[number];
export type TextosAporte = Partial<Record<ClaveTextoAporte, string>>;
export interface TextosBloque {
  logro?: TextosAporte;
  reto?: TextosAporte;
}

export interface Pregunta {
  id: string;
  tipo: TipoPregunta;
  enunciado: string;
  apoyo?: string;
  obligatoria: boolean;
  opciones?: Opcion[];
  validaciones?: Validaciones;
  mostrarSi?: Condicion;
  pilo?: CapaPilo;
  /** Solo en el bloque de logros y retos. */
  textos?: TextosBloque;
}

export interface Seccion {
  id: string;
  titulo: string;
  descripcion?: string;
  mostrarSi?: Condicion;
  preguntas: Pregunta[];
}

export interface Estructura {
  version: typeof VERSION_ESTRUCTURA;
  secciones: Seccion[];
}

/* ---------- Valores de las respuestas ---------- */

export interface CifraBloque {
  que: string;
  tipo: "estudiantes" | "programas" | "porcentaje" | "dinero" | "otro";
  otro?: string;
  valor: number;
}

export interface ItemBloque {
  tipo: "logro" | "reto";
  titulo: string;
  descripcion: string;
  cifras: CifraBloque[];
}

export interface ArchivoValor {
  nombre: string;
  tipo: string;
  tamano: number;
  /** Ruta en el almacenamiento, cuando ya se subió. */
  ruta?: string;
}

export type Valor = string | number | string[] | ItemBloque[] | ArchivoValor | null | undefined;
export type Valores = Record<string, Valor>;

export const LIMITES_ESTRUCTURA = {
  secciones: 30,
  preguntas: 120,
  opciones: 60,
  enunciado: { min: 3, max: 300 },
  apoyo: 300,
  explicacion: 600,
  textoAporte: 700,
  titulo: { min: 2, max: 120 },
  largoTexto: 300,
  largoParrafo: 3000,
  items: 30,
  cifrasPorItem: 12,
} as const;

const ID = /^[a-z0-9_]{1,40}$/;
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const TELEFONO = /^\+?[0-9][0-9 ()-]{6,18}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface Problema {
  ruta: string;
  mensaje: string;
}

const hay = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const conOpciones = (t: TipoPregunta) => t === "opcion_unica" || t === "opcion_multiple" || t === "lista";
const TIPOS = new Set<string>(TIPOS_PREGUNTA.map((t) => t.id));
const OPS = new Set<string>(OPERADORES.map((o) => o.id));

/** Todas las preguntas en orden de aparición. */
export const preguntasDe = (e: Estructura): Pregunta[] => e.secciones.flatMap((s) => s.preguntas);

/** Comprueba que algo desconocido es una estructura válida. Devuelve los problemas (vacío = válida). */
export function validarEstructura(x: unknown): Problema[] {
  const p: Problema[] = [];
  const mal = (ruta: string, mensaje: string) => p.push({ ruta, mensaje });
  if (!hay(x)) return [{ ruta: "", mensaje: "La estructura no tiene el formato esperado." }];
  if (x.version !== VERSION_ESTRUCTURA) mal("version", `La versión de la estructura debe ser ${VERSION_ESTRUCTURA}.`);
  if (!Array.isArray(x.secciones) || x.secciones.length === 0) {
    mal("secciones", "La encuesta necesita al menos una sección.");
    return p;
  }
  if (x.secciones.length > LIMITES_ESTRUCTURA.secciones) mal("secciones", `Hasta ${LIMITES_ESTRUCTURA.secciones} secciones.`);

  const vistas = new Map<string, number>(); // id de pregunta -> posición
  const ids = new Set<string>();
  let n = 0;
  const idUnico = (ruta: string, id: unknown, etiqueta: string): boolean => {
    if (typeof id !== "string" || !ID.test(id)) {
      mal(`${ruta}.id`, `El identificador de ${etiqueta} no es válido (minúsculas, números y guion bajo).`);
      return false;
    }
    if (ids.has(id)) {
      mal(`${ruta}.id`, `El identificador «${id}» está repetido.`);
      return false;
    }
    ids.add(id);
    return true;
  };

  (x.secciones as unknown[]).forEach((s, si) => {
    const rs = `secciones[${si}]`;
    if (!hay(s)) return mal(rs, "La sección no tiene el formato esperado.");
    idUnico(rs, s.id, "la sección");
    const t = texto(s.titulo);
    if (t.length < LIMITES_ESTRUCTURA.titulo.min || t.length > LIMITES_ESTRUCTURA.titulo.max) mal(`${rs}.titulo`, "El título de la sección lleva entre 2 y 120 letras.");
    if (!Array.isArray(s.preguntas)) return mal(`${rs}.preguntas`, "La sección necesita su lista de preguntas.");
    if (s.preguntas.length === 0) mal(`${rs}.preguntas`, "Una sección sin preguntas no tiene sentido.");
    (s.preguntas as unknown[]).forEach((q, qi) => {
      const rq = `${rs}.preguntas[${qi}]`;
      n++;
      if (!hay(q)) return mal(rq, "La pregunta no tiene el formato esperado.");
      idUnico(rq, q.id, "la pregunta");
      const tipo = q.tipo as TipoPregunta;
      if (typeof q.tipo !== "string" || !TIPOS.has(q.tipo)) mal(`${rq}.tipo`, "El tipo de pregunta no existe.");
      const en = texto(q.enunciado);
      if (en.length < LIMITES_ESTRUCTURA.enunciado.min || en.length > LIMITES_ESTRUCTURA.enunciado.max) mal(`${rq}.enunciado`, "El enunciado lleva entre 3 y 300 letras.");
      if (q.apoyo !== undefined && texto(q.apoyo).length > LIMITES_ESTRUCTURA.apoyo) mal(`${rq}.apoyo`, `El texto de apoyo llega a ${LIMITES_ESTRUCTURA.apoyo} letras.`);
      if (typeof q.obligatoria !== "boolean") mal(`${rq}.obligatoria`, "Diga si la pregunta es obligatoria.");
      if (conOpciones(tipo)) {
        const o = q.opciones;
        if (!Array.isArray(o) || o.length < 2) mal(`${rq}.opciones`, "Necesita al menos dos opciones.");
        else if (o.length > LIMITES_ESTRUCTURA.opciones) mal(`${rq}.opciones`, `Hasta ${LIMITES_ESTRUCTURA.opciones} opciones.`);
        else {
          const oid = new Set<string>();
          o.forEach((op, oi) => {
            if (!hay(op) || typeof op.id !== "string" || !ID.test(op.id) || oid.has(op.id)) return mal(`${rq}.opciones[${oi}].id`, "El identificador de la opción no es válido o está repetido.");
            oid.add(op.id);
            if (!texto(op.texto)) mal(`${rq}.opciones[${oi}].texto`, "Una opción no puede quedar vacía.");
          });
        }
      }
      const v = hay(q.validaciones) ? (q.validaciones as Validaciones) : {};
      if (tipo === "escala") {
        const a = v.escalaMin ?? 1;
        const b = v.escalaMax ?? 5;
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > 10 || a >= b) mal(`${rq}.validaciones`, "La escala va de un entero a otro mayor, entre 0 y 10.");
      }
      if (tipo === "cifra" && v.min !== undefined && v.max !== undefined && v.min > v.max) mal(`${rq}.validaciones`, "El mínimo no puede pasar del máximo.");
      if ((tipo === "texto_corto" || tipo === "parrafo") && v.largoMin !== undefined && v.largoMax !== undefined && v.largoMin > v.largoMax) mal(`${rq}.validaciones`, "El largo mínimo no puede pasar del máximo.");
      if (tipo === "archivo" && v.tamanoMaxMb !== undefined && !(v.tamanoMaxMb > 0 && v.tamanoMaxMb <= 25)) mal(`${rq}.validaciones`, "El tamaño máximo va de 1 a 25 MB.");
      if (q.pilo !== undefined) {
        if (!hay(q.pilo) || typeof q.pilo.explicacion !== "string") mal(`${rq}.pilo`, "La capa de Pilo necesita su explicación (puede estar vacía).");
        else if (q.pilo.explicacion.length > LIMITES_ESTRUCTURA.explicacion) mal(`${rq}.pilo.explicacion`, `La explicación de Pilo llega a ${LIMITES_ESTRUCTURA.explicacion} letras.`);
      }
      if (q.textos !== undefined) {
        if (tipo !== "bloque_logro_reto" || !hay(q.textos)) mal(`${rq}.textos`, "Los textos de logro y reto solo van en el bloque de logros y retos.");
        else {
          for (const cual of ["logro", "reto"] as const) {
            const t = (q.textos as Record<string, unknown>)[cual];
            if (t === undefined) continue;
            if (!hay(t)) {
              mal(`${rq}.textos.${cual}`, "Los textos no tienen el formato esperado.");
              continue;
            }
            for (const [k, val] of Object.entries(t)) {
              if (!(CLAVES_TEXTO_APORTE as readonly string[]).includes(k)) mal(`${rq}.textos.${cual}.${k}`, "Ese texto no existe.");
              else if (typeof val !== "string" || val.length > LIMITES_ESTRUCTURA.textoAporte) mal(`${rq}.textos.${cual}.${k}`, `Cada texto llega a ${LIMITES_ESTRUCTURA.textoAporte} letras.`);
            }
          }
        }
      }
      // «Mostrar si» solo puede mirar una pregunta anterior: así no hay ciclos ni orden ambiguo.
      const cond = (c: unknown, ruta: string) => {
        if (c === undefined) return;
        if (!hay(c) || typeof c.pregunta !== "string" || typeof c.op !== "string" || !OPS.has(c.op)) return mal(ruta, "La condición «mostrar si» no tiene el formato esperado.");
        if (!vistas.has(c.pregunta)) mal(ruta, "«Mostrar si» solo puede depender de una pregunta anterior.");
      };
      cond(s.mostrarSi, `${rs}.mostrarSi`);
      cond(q.mostrarSi, `${rq}.mostrarSi`);
      if (typeof q.id === "string") vistas.set(q.id, n);
    });
  });
  if (n > LIMITES_ESTRUCTURA.preguntas) mal("secciones", `Hasta ${LIMITES_ESTRUCTURA.preguntas} preguntas en total.`);
  return p;
}

/* ---------- Lógica «mostrar si» ---------- */

const vacio = (v: Valor): boolean => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** ¿Se cumple la condición con estos valores? Sin respuesta, solo «vacio» se cumple (una pregunta aún sin contestar no dispara nada). */
export function cumple(c: Condicion, valores: Valores): boolean {
  const v = valores[c.pregunta];
  if (c.op === "vacio") return vacio(v);
  if (c.op === "responde") return !vacio(v);
  if (vacio(v)) return false;
  const k = c.valor;
  switch (c.op) {
    case "igual":
      return Array.isArray(v) ? v.length === 1 && String(v[0]) === String(k) : String(v) === String(k);
    case "distinto":
      return Array.isArray(v) ? !(v as unknown[]).map(String).includes(String(k)) : String(v) !== String(k);
    case "contiene":
      return Array.isArray(v) ? (v as unknown[]).map(String).includes(String(k)) : String(v).toLowerCase().includes(String(k).toLowerCase());
    case "mayor":
      return Number(v) > Number(k);
    case "menor":
      return Number(v) < Number(k);
  }
  return false;
}

/** Las preguntas que se ven con estos valores (una sección o pregunta oculta no cuenta; una condición sobre una oculta se evalúa como sin respuesta). */
export function preguntasVisibles(e: Estructura, valores: Valores): Pregunta[] {
  const efectivos: Valores = {};
  const salida: Pregunta[] = [];
  for (const s of e.secciones) {
    const seccionVisible = !s.mostrarSi || cumple(s.mostrarSi, efectivos);
    for (const q of s.preguntas) {
      if (seccionVisible && (!q.mostrarSi || cumple(q.mostrarSi, efectivos))) {
        salida.push(q);
        efectivos[q.id] = valores[q.id];
      }
    }
  }
  return salida;
}

/** Solo los valores de lo que se ve: lo respondido y luego oculto por la lógica no se envía. */
export function valoresVisibles(e: Estructura, valores: Valores): Valores {
  const salida: Valores = {};
  for (const q of preguntasVisibles(e, valores)) if (!vacio(valores[q.id])) salida[q.id] = valores[q.id];
  return salida;
}

/* ---------- Validar lo que responde la persona ---------- */

/** Lee un número escrito con punto decimal (la pantalla ya lo convierte desde el formato colombiano). */
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** El mensaje de lo que está mal en un valor, o null si sirve. */
export function errorDeValor(q: Pregunta, v: Valor, hoy: string = new Date().toISOString().slice(0, 10)): string | null {
  if (vacio(v)) return q.obligatoria ? "Esta pregunta es obligatoria." : null;
  const val = q.validaciones ?? {};
  switch (q.tipo) {
    case "texto_corto":
    case "parrafo": {
      if (typeof v !== "string") return "Escriba un texto.";
      const t = v.trim();
      const max = val.largoMax ?? (q.tipo === "parrafo" ? LIMITES_ESTRUCTURA.largoParrafo : LIMITES_ESTRUCTURA.largoTexto);
      if (val.largoMin !== undefined && t.length < val.largoMin) return `Escriba al menos ${val.largoMin} caracteres.`;
      return t.length > max ? `Escriba máximo ${max} caracteres.` : null;
    }
    case "opcion_unica":
    case "lista":
      return typeof v === "string" && q.opciones?.some((o) => o.id === v) ? null : "Elija una de las opciones.";
    case "opcion_multiple": {
      if (!Array.isArray(v) || !(v as unknown[]).every((x) => typeof x === "string" && q.opciones?.some((o) => o.id === x))) return "Elija entre las opciones.";
      return new Set(v as string[]).size === v.length ? null : "Hay opciones repetidas.";
    }
    case "escala": {
      const n = numero(v);
      const a = val.escalaMin ?? 1;
      const b = val.escalaMax ?? 5;
      return n !== null && Number.isInteger(n) && n >= a && n <= b ? null : `Elija un valor de ${a} a ${b}.`;
    }
    case "cifra": {
      const n = numero(v);
      if (n === null) return "Escriba un número.";
      if (n < (val.min ?? 0)) return val.min !== undefined ? `El valor mínimo es ${val.min}.` : "El valor no puede ser negativo.";
      if (val.unidad === "porcentaje" && n > Math.min(100, val.max ?? 100)) return "Un porcentaje no pasa de 100.";
      if (val.max !== undefined && n > val.max) return `El valor máximo es ${val.max}.`;
      if (val.decimales === false && !Number.isInteger(n)) return "Escriba un número entero.";
      return null;
    }
    case "fecha": {
      if (typeof v !== "string" || !FECHA.test(v) || Number.isNaN(Date.parse(v))) return "Escriba una fecha válida.";
      if (val.rango === "pasado" && v > hoy) return "La fecha debe ser de hoy o anterior.";
      if (val.rango === "futuro" && v < hoy) return "La fecha debe ser de hoy o posterior.";
      return null;
    }
    case "contacto": {
      if (typeof v !== "string") return "Escriba un dato de contacto.";
      const t = v.trim();
      if (val.formato === "telefono") return TELEFONO.test(t) ? null : "Escriba un teléfono válido, por ejemplo 300 123 4567.";
      return CORREO.test(t) && t.length <= 200 ? null : "Escriba un correo válido.";
    }
    case "archivo": {
      if (!hay(v) || typeof v.nombre !== "string" || typeof v.tamano !== "number") return "Adjunte un archivo.";
      const ext = v.nombre.slice(v.nombre.lastIndexOf(".") + 1).toLowerCase();
      if (val.extensiones?.length && !val.extensiones.map((x) => x.toLowerCase().replace(/^\./, "")).includes(ext)) return `Solo se admiten archivos ${val.extensiones.join(", ")}.`;
      return v.tamano > (val.tamanoMaxMb ?? 10) * 1024 * 1024 ? `El archivo pasa de ${val.tamanoMaxMb ?? 10} MB.` : null;
    }
    case "bloque_logro_reto": {
      if (!Array.isArray(v) || (v as unknown[]).some((i) => !hay(i))) return "Agregue al menos un logro o un reto.";
      const items = v as ItemBloque[];
      if (items.length > (val.maxItems ?? LIMITES_ESTRUCTURA.items)) return `Hasta ${val.maxItems ?? LIMITES_ESTRUCTURA.items} aportes.`;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.tipo !== "logro" && it.tipo !== "reto") return `Aporte ${i + 1}: elija logro o reto.`;
        if (texto(it.titulo).length < 5 || texto(it.titulo).length > 120) return `Aporte ${i + 1}: el título lleva de 5 a 120 caracteres.`;
        if (texto(it.descripcion).length < 20 || texto(it.descripcion).length > 500) return `Aporte ${i + 1}: la descripción lleva de 20 a 500 caracteres.`;
        if (!Array.isArray(it.cifras) || it.cifras.length > LIMITES_ESTRUCTURA.cifrasPorItem) return `Aporte ${i + 1}: hasta ${LIMITES_ESTRUCTURA.cifrasPorItem} cifras.`;
        for (const c of it.cifras) {
          const n = numero(c.valor);
          if (texto(c.que).length < 2 || texto(c.que).length > 80) return `Aporte ${i + 1}: describa cada cifra (2 a 80 caracteres).`;
          if (!["estudiantes", "programas", "porcentaje", "dinero", "otro"].includes(c.tipo)) return `Aporte ${i + 1}: tipo de cifra no válido.`;
          if (c.tipo === "otro" && !/^\p{L}{2,20}$/u.test(texto(c.otro))) return `Aporte ${i + 1}: el tipo «otro» es una palabra de 2 a 20 letras.`;
          if (n === null || n < 0 || (c.tipo === "porcentaje" && n > 100)) return `Aporte ${i + 1}: revise el valor de «${texto(c.que)}».`;
        }
      }
      return q.obligatoria && items.length === 0 ? "Agregue al menos un logro o un reto." : null;
    }
  }
  return null;
}

/** Los errores por pregunta de lo visible. Vacío = se puede enviar. */
export function validarRespuestas(e: Estructura, valores: Valores, hoy?: string): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const q of preguntasVisibles(e, valores)) {
    const m = errorDeValor(q, valores[q.id], hoy);
    if (m) errores[q.id] = m;
  }
  return errores;
}

/** ¿El valor de una cifra parece absurdo y conviene confirmarlo con la persona? Devuelve la pregunta de Pilo, o null. */
export function cifraSospechosa(q: Pregunta, v: unknown): string | null {
  const n = numero(v);
  if (q.tipo !== "cifra" || n === null) return null;
  const c = q.pilo?.confirmarSi;
  const unidad = q.validaciones?.unidad;
  const tope = c?.mayorA ?? (unidad === "estudiantes" ? 100_000 : unidad === "programas" ? 500 : unidad === "dinero" ? 10_000_000_000_000 : undefined);
  if (tope !== undefined && n > tope) return `¿De verdad son ${n.toLocaleString("es-CO")}? Es más de lo que suele verse. Confírmelo antes de seguir.`;
  if (c?.menorA !== undefined && n < c.menorA) return `¿De verdad son ${n.toLocaleString("es-CO")}? Es menos de lo que suele verse. Confírmelo antes de seguir.`;
  if (unidad === "porcentaje" && n > 0 && n <= 1 && !Number.isInteger(n)) return `¿Quiso decir ${n} % o ${n * 100} %? Pregunto porque el valor parece una fracción.`;
  return null;
}
