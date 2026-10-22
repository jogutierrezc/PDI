/* =============================================================================
   Encuestas con Pilo · operaciones puras del editor sobre la estructura, y la
   lista «Antes de publicar». Todas devuelven una estructura nueva.
   ========================================================================== */

import type { Estructura, Pregunta, Problema, TipoPregunta } from "./estructura";
import { preguntasDe, validarEstructura } from "./estructura";

/** Un identificador libre con ese prefijo («pregunta_3»). */
export function idLibre(e: Estructura, prefijo: string): string {
  const usados = new Set<string>([...e.secciones.map((s) => s.id), ...preguntasDe(e).map((p) => p.id)]);
  for (let n = 1; ; n++) if (!usados.has(`${prefijo}_${n}`)) return `${prefijo}_${n}`;
}

export function preguntaNueva(e: Estructura, tipo: TipoPregunta): Pregunta {
  const base: Pregunta = { id: idLibre(e, "pregunta"), tipo, enunciado: "Nueva pregunta", obligatoria: false };
  if (tipo === "opcion_unica" || tipo === "opcion_multiple" || tipo === "lista") base.opciones = [{ id: "opcion_1", texto: "Opción 1" }, { id: "opcion_2", texto: "Opción 2" }];
  if (tipo === "escala") base.validaciones = { escalaMin: 1, escalaMax: 5 };
  if (tipo === "cifra") base.validaciones = { min: 0, unidad: "estudiantes", decimales: false };
  if (tipo === "contacto") base.validaciones = { formato: "correo" };
  if (tipo === "archivo") base.validaciones = { tamanoMaxMb: 10, extensiones: ["pdf", "png", "jpg"] };
  if (tipo === "bloque_logro_reto") {
    base.enunciado = "Logros y retos";
    base.validaciones = { maxItems: 30 };
  }
  return base;
}

const mapa = (e: Estructura, f: (p: Pregunta) => Pregunta): Estructura => ({ ...e, secciones: e.secciones.map((s) => ({ ...s, preguntas: s.preguntas.map(f) })) });

export const cambiarPregunta = (e: Estructura, id: string, cambios: Partial<Pregunta>): Estructura => mapa(e, (p) => (p.id === id ? { ...p, ...cambios } : p));

export function agregarPregunta(e: Estructura, seccionId: string, tipo: TipoPregunta): { estructura: Estructura; id: string } {
  const p = preguntaNueva(e, tipo);
  return { estructura: { ...e, secciones: e.secciones.map((s) => (s.id === seccionId ? { ...s, preguntas: [...s.preguntas, p] } : s)) }, id: p.id };
}

/** Las condiciones que apuntan a una pregunta que ya no existe se quitan. */
function sinHuerfanas(e: Estructura): Estructura {
  const hay = new Set(preguntasDe(e).map((p) => p.id));
  const ok = <T extends { mostrarSi?: { pregunta: string } }>(x: T): T => (x.mostrarSi && !hay.has(x.mostrarSi.pregunta) ? { ...x, mostrarSi: undefined } : x);
  return { ...e, secciones: e.secciones.map((s) => ({ ...ok(s), preguntas: s.preguntas.map(ok) })) };
}

/** Mover una pregunta no puede dejar un «mostrar si» mirando a una pregunta posterior: esa condición se quita. */
function sinMirarAdelante(e: Estructura): Estructura {
  const antes = new Set<string>();
  const secciones = e.secciones.map((s) => {
    const sOk = !s.mostrarSi || antes.has(s.mostrarSi.pregunta);
    const preguntas = s.preguntas.map((p) => {
      const ok = !p.mostrarSi || antes.has(p.mostrarSi.pregunta);
      antes.add(p.id);
      return ok ? p : { ...p, mostrarSi: undefined };
    });
    return { ...s, mostrarSi: sOk ? s.mostrarSi : undefined, preguntas };
  });
  return { ...e, secciones };
}

export const quitarPregunta = (e: Estructura, id: string): Estructura => sinHuerfanas({ ...e, secciones: e.secciones.map((s) => ({ ...s, preguntas: s.preguntas.filter((p) => p.id !== id) })) });

export function duplicarPregunta(e: Estructura, id: string): { estructura: Estructura; id: string | null } {
  const nuevo = idLibre(e, "pregunta");
  let hecho = false;
  const estructura: Estructura = {
    ...e,
    secciones: e.secciones.map((s) => {
      const i = s.preguntas.findIndex((p) => p.id === id);
      if (i < 0) return s;
      hecho = true;
      const copia: Pregunta = { ...JSON.parse(JSON.stringify(s.preguntas[i])), id: nuevo };
      return { ...s, preguntas: [...s.preguntas.slice(0, i + 1), copia, ...s.preguntas.slice(i + 1)] };
    }),
  };
  return { estructura, id: hecho ? nuevo : null };
}

/** Una pregunta sube o baja una posición; al llegar al borde de su sección pasa a la vecina. */
export function moverPregunta(e: Estructura, id: string, delta: -1 | 1): Estructura {
  const planas = e.secciones.map((s) => [...s.preguntas]);
  const si = planas.findIndex((l) => l.some((p) => p.id === id));
  if (si < 0) return e;
  const i = planas[si].findIndex((p) => p.id === id);
  const [p] = planas[si].splice(i, 1);
  if (delta === -1) {
    if (i > 0) planas[si].splice(i - 1, 0, p);
    else if (si > 0) planas[si - 1].push(p);
    else planas[si].unshift(p);
  } else if (i < planas[si].length) planas[si].splice(i + 1, 0, p);
  else if (si < planas.length - 1) planas[si + 1].unshift(p);
  else planas[si].push(p);
  return sinMirarAdelante({ ...e, secciones: e.secciones.map((s, k) => ({ ...s, preguntas: planas[k] })) });
}

/** Arrastre: la pregunta queda antes de `hacia`; con null, al final de la sección `seccionId`. */
export function ponerPreguntaAntesDe(e: Estructura, id: string, hacia: string | null, seccionId?: string): Estructura {
  if (id === hacia) return e;
  const origen = preguntasDe(e).find((p) => p.id === id);
  if (!origen) return e;
  const sin = e.secciones.map((s) => ({ ...s, preguntas: s.preguntas.filter((p) => p.id !== id) }));
  let puesto = false;
  const secciones = sin.map((s) => {
    if (hacia) {
      const i = s.preguntas.findIndex((p) => p.id === hacia);
      if (i < 0) return s;
      puesto = true;
      return { ...s, preguntas: [...s.preguntas.slice(0, i), origen, ...s.preguntas.slice(i)] };
    }
    if (s.id !== seccionId) return s;
    puesto = true;
    return { ...s, preguntas: [...s.preguntas, origen] };
  });
  return puesto ? sinMirarAdelante({ ...e, secciones }) : e;
}

export function moverSeccion(e: Estructura, id: string, delta: -1 | 1): Estructura {
  const i = e.secciones.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= e.secciones.length) return e;
  const s = [...e.secciones];
  [s[i], s[j]] = [s[j], s[i]];
  return sinMirarAdelante({ ...e, secciones: s });
}

export const quitarSeccion = (e: Estructura, id: string): Estructura => (e.secciones.length > 1 ? sinHuerfanas({ ...e, secciones: e.secciones.filter((s) => s.id !== id) }) : e);

/* ---------- Antes de publicar ---------- */

export interface Requisito {
  id: string;
  texto: string;
  cumple: boolean;
  /** Dónde se arregla: una pestaña del editor. */
  donde?: "editor" | "presentacion" | "acceso";
}

export interface DatosPublicacion {
  titulo: string;
  acceso: "microsoft" | "abierta";
  dominios: string[];
  cierra_el: string | null;
  abre_el: string | null;
  mensaje_cierre: string;
  intro: string;
  despedida: string;
  /** La verificación contra robots está encendida (acceso abierto). */
  verificacionRobots: boolean;
  /** Acceso abierto que pide datos personales (nombre, correo, teléfono...). */
  pideDatosPersonales: boolean;
  consentimiento: string;
}

export function antesDePublicar(e: Estructura, d: DatosPublicacion): Requisito[] {
  const problemas: Problema[] = validarEstructura(e);
  const preguntas = preguntasDe(e);
  const lista: Requisito[] = [
    { id: "estructura", texto: problemas.length ? `Corrija la estructura: ${problemas[0].mensaje}` : "La estructura no tiene errores", cumple: problemas.length === 0, donde: "editor" },
    { id: "preguntas", texto: "Tiene al menos una pregunta", cumple: preguntas.length > 0, donde: "editor" },
    { id: "archivos", texto: "Sin preguntas de archivo (la carga de archivos aún no está disponible)", cumple: !preguntas.some((p) => p.tipo === "archivo"), donde: "editor" },
    { id: "titulo", texto: "Tiene un título de al menos 5 letras", cumple: d.titulo.trim().length >= 5, donde: "presentacion" },
    { id: "intro", texto: "Pilo tiene un mensaje de bienvenida", cumple: d.intro.trim().length > 0, donde: "presentacion" },
    { id: "despedida", texto: "Pilo tiene un mensaje de despedida", cumple: d.despedida.trim().length > 0, donde: "presentacion" },
    { id: "fechas", texto: "La apertura es anterior al cierre", cumple: !d.abre_el || !d.cierra_el || d.abre_el <= d.cierra_el, donde: "acceso" },
    { id: "mensaje_cierre", texto: "Tiene un mensaje para cuando cierre", cumple: d.mensaje_cierre.trim().length > 0, donde: "acceso" },
  ];
  if (d.acceso === "abierta") {
    lista.push({ id: "robots", texto: "Acceso abierto: la verificación contra robots está activa", cumple: d.verificacionRobots, donde: "acceso" });
    if (d.pideDatosPersonales) lista.push({ id: "consentimiento", texto: "Pide datos personales: escribió el texto de consentimiento", cumple: d.consentimiento.trim().length >= 20, donde: "acceso" });
  } else lista.push({ id: "dominios", texto: "Con Microsoft: hay al menos un dominio permitido", cumple: d.dominios.length > 0, donde: "acceso" });
  return lista;
}

export const puedePublicar = (l: readonly Requisito[]): boolean => l.every((r) => r.cumple);

/* ---------- Enlace (slug) de una encuesta nueva ---------- */

/** «Satisfacción 2026 · Biblioteca» → «satisfaccion-2026-biblioteca» (sin tildes, hasta 50 letras). */
export function slugDe(titulo: string): string {
  const s = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return s || "encuesta";
}

/** Un enlace libre: el slug del título o, si ya existe, con -2, -3… */
export function slugLibre(titulo: string, usados: readonly string[]): string {
  const base = slugDe(titulo);
  if (!usados.includes(base)) return base;
  for (let n = 2; ; n++) if (!usados.includes(`${base}-${n}`)) return `${base}-${n}`;
}
