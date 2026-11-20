/* =============================================================================
   Planeación y Seguimiento · Fase 2 · datos de DEMOSTRACIÓN con semilla fija.

   Se parte de las 75 líneas reales del plan y se INVENTAN oficinas, personas y
   actividades (nombres ficticios; en pantalla se rotulan «Demostración»). El reparto
   de líneas por oficina sigue una regla inferida del nombre y la clasificación: hay
   que reemplazarla por el dato real (`oficina_unit_id` de la línea). «Hoy» es el 30
   de junio de 2027, porque el plan empieza en 2027 y sin esa fecha no habría qué ver.
   ========================================================================== */

import type { Unit } from "../../tableros/model";
import type { Linea } from "../modelo";
import { PILARES } from "../modelo";
import type { Actividad, EstadoAct, EventoActividad, PapelOficina, PrioridadAct } from "./modelo";
import { PRIORIDADES_ACT, sumarDias } from "./modelo";
import type { Accion, Avance, Comentario, Evidencia, ItemPdi, NivelRiesgo, PilarCatalogo, Riesgo } from "./modeloF3";
import { SIN_AVANCE } from "./modeloF3";

export const HOY_DEMO = "2027-06-30";
export const ID_YO = "u-yo";

const unidad = (id: string, parentId: string | null, name: string, kind: Unit["kind"], position: number): Unit => ({ id, parentId, kind, code: id.toUpperCase(), name, slug: id, description: "Demostración", position });
export const UNIDADES_DEMO: Unit[] = [
  unidad("of-1", null, "Vicerrectoría Administrativa y Financiera", "vicerrectoria", 1),
  unidad("of-2", null, "Planeación Institucional", "oficina", 2),
  unidad("of-3", "of-1", "Infraestructura y Planta Física", "oficina", 3),
  unidad("of-4", "of-1", "Tecnología e Infraestructura TI", "oficina", 4),
  unidad("of-5", "of-1", "Compras y Contratación", "oficina", 5),
  unidad("of-6", "of-1", "Bienestar Universitario", "oficina", 6),
];

export interface PersonaSemilla {
  id: string;
  nombre: string;
  oficina: string;
  papel: PapelOficina;
  /** Campus propio (`unit_members.campus_id`); ausente = todos. */
  campus?: string;
}
const p = (id: string, nombre: string, oficina: string, papel: PapelOficina, campus?: string): PersonaSemilla => ({ id, nombre, oficina, papel, campus });
/** Ficticias. Sin la persona de la sesión (u-yo), que se agrega según `?papel=`. */
export const PERSONAS_DEMO: PersonaSemilla[] = [
  p("u-01", "Rosa Elena Pardo", "of-1", "jefe"), p("u-02", "Julián Camacho", "of-1", "editor"),
  p("u-03", "Marcela Duarte", "of-2", "jefe"), p("u-04", "Felipe Arenas", "of-2", "editor"), p("u-05", "Tatiana Gómez", "of-2", "editor"),
  p("u-06", "Héctor Mantilla", "of-3", "jefe"), p("u-07", "Sandra Ruiz", "of-3", "editor"), p("u-08", "Óscar Beltrán", "of-3", "editor"), p("u-09", "Paola Neira", "of-3", "visor"),
  p("u-10", "Diana Cárdenas", "of-4", "jefe"), p("u-11", "Camilo Rojas", "of-4", "editor", "Valledupar"), p("u-12", "Valentina Sarmiento", "of-4", "editor"), p("u-13", "Iván Quiroga", "of-4", "editor", "Cúcuta"), p("u-14", "Natalia Prada", "of-4", "visor"),
  p("u-15", "Gustavo Peña", "of-5", "jefe"), p("u-16", "Liliana Franco", "of-5", "editor"), p("u-17", "Mauricio Ortiz", "of-5", "editor"),
  p("u-18", "Claudia Vargas", "of-6", "jefe"), p("u-19", "Ricardo Serrano", "of-6", "editor"), p("u-20", "Yesenia Cote", "of-6", "editor"),
];
export const correoDemo = (nombre: string): string => `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".")}@demo.udes.test`;

/** Aleatorio determinista (mulberry32). */
export function semilla(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Regla inferida (demostración): a qué oficina se le asigna cada línea del plan. */
export function oficinaDeLinea(l: Linea): string {
  if (l.oficina) {
    const n = l.oficina.toLowerCase();
    const hallada = UNIDADES_DEMO.find((u) => u.name.toLowerCase() === n);
    if (hallada) return hallada.id;
  }
  const t = `${l.nombre} ${l.descripcion ?? ""}`.toLowerCase();
  if (l.clasif === "IFT") return "of-4";
  if (/compra|contrat|adquisici/.test(t)) return "of-5";
  if (/deport|escenario|alojamiento|bienestar|gimnasio|cafeter|residencia/.test(t)) return "of-6";
  if (l.clasif === "IFT-LOG") return "of-3";
  const n = Number(l.no);
  if (n % 5 === 0) return "of-2";
  if (n % 4 === 0) return "of-5";
  if (n % 3 === 0) return "of-6";
  return "of-3";
}

const PLANTILLAS: { t: (n: string) => string; hito?: boolean; items: string[] }[] = [
  { t: (n) => `Definir el alcance y los criterios de «${n}»`, items: ["Reunir requisitos con los usuarios", "Redactar el documento de alcance", "Validarlo con la dirección"] },
  { t: (n) => `Levantar el diagnóstico de ${n}`, items: ["Visitar los espacios o sistemas", "Registrar hallazgos", "Priorizar necesidades"] },
  { t: (n) => `Preparar los estudios previos de ${n}`, items: ["Cotizar con tres proveedores", "Elaborar el presupuesto detallado"] },
  { t: (n) => `Tramitar la contratación o compra de ${n}`, items: ["Radicar la solicitud", "Evaluar propuestas", "Firmar el contrato"] },
  { t: (n) => `Ejecutar la implementación de ${n}`, items: ["Programar el trabajo por etapas", "Hacer seguimiento semanal", "Recibir a satisfacción"] },
  { t: (n) => `Socializar los avances de ${n} con la comunidad`, items: ["Preparar la presentación", "Convocar a los interesados"] },
  { t: (n) => `Entregar el informe de cierre de ${n}`, hito: true, items: [] },
];

const PROPIAS = [
  { t: "Reunión mensual de seguimiento de la oficina", items: ["Armar el orden del día", "Levantar el acta"] },
  { t: "Actualizar el inventario de la oficina", items: [] },
  { t: "Preparar el informe de gestión del semestre", items: ["Recoger cifras", "Redactar el informe"] },
];

const corto = (s: string) => {
  const t = s.replace(/\.$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return t.length > 56 ? `${t.slice(0, 55)}…` : t;
};

function estadoSegun(ini: string | null, fin: string, hoy: string, r: () => number, hito: boolean): EstadoAct {
  const x = r();
  if (fin < hoy) return x < 0.6 ? "hecho" : x < 0.78 ? "en_revision" : x < 0.9 ? "en_riesgo" : "en_curso";
  if (!hito && ini && ini <= hoy) return x < 0.52 ? "en_curso" : x < 0.68 ? "en_riesgo" : x < 0.78 ? "en_revision" : "por_iniciar";
  return x < 0.92 ? "por_iniciar" : "en_curso";
}

/** Genera las actividades de demostración. Devuelve también sus eventos de historial. */
export function generarActividades(lineas: readonly Linea[], personas: readonly PersonaSemilla[], hoy = HOY_DEMO, campus: readonly string[] = ["Bucaramanga", "Valledupar", "Cúcuta"]): { actividades: Actividad[]; eventos: Map<string, EventoActividad[]> } {
  const r = semilla(20270630);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const actividades: Actividad[] = [];
  const eventos = new Map<string, EventoActividad[]>();
  let n = 0;
  const nombre = (id: string) => personas.find((x) => x.id === id)?.nombre ?? "Alguien";
  const nuevo = (oficinaId: string, lineaNo: string | null, titulo: string, ini: string | null, fin: string, hito: boolean, items: string[], cam: string, prio: PrioridadAct) => {
    const pool = personas.filter((x) => x.oficina === oficinaId && x.papel !== "visor");
    const jefe = personas.find((x) => x.oficina === oficinaId && x.papel === "jefe");
    const x = r();
    const asignados = pool.length ? (x < 0.2 ? [] : x < 0.78 ? [pick(pool).id] : (() => { const a = pick(pool).id; const b = pick(pool).id; return a === b ? [a] : [a, b]; })()) : [];
    const estado = estadoSegun(ini, fin, hoy, r, hito);
    const id = `a-${++n}`;
    const hechos = estado === "hecho" ? items.length : estado === "por_iniciar" ? 0 : Math.floor(r() * (items.length + 1));
    const creada = sumarDias(ini ?? fin, -45 - Math.floor(r() * 20));
    actividades.push({
      id, oficinaId, lineaNo, titulo, descripcion: r() < 0.5 ? "Actividad de demostración, generada para probar el tablero." : null, estado, prioridad: prio, inicio: ini, fin, esHito: hito, campus: cam,
      asignados, checklist: items.map((texto, i) => ({ id: `${id}-c${i + 1}`, texto, hecho: i < hechos })), pdi: { conexion: "sin_definir", items: [] }, avance: { ...SIN_AVANCE }, creadaPor: jefe?.id ?? "u-01", creadaEn: `${creada < "2027-01-01" ? "2026-12-15" : creada}T14:00:00Z`, demo: true,
    });
    const ev: EventoActividad[] = [{ id: `${id}-e0`, tipo: "creada", por: jefe ? nombre(jefe.id) : "Administración", en: `${creada < "2027-01-01" ? "2026-12-15" : creada}T14:00:00Z`, detalle: "Se creó la actividad." }];
    asignados.forEach((u, i) => ev.push({ id: `${id}-e${i + 1}`, tipo: "asignada", por: jefe ? nombre(jefe.id) : "Administración", en: `${creada < "2027-01-01" ? "2026-12-15" : creada}T14:05:00Z`, detalle: `Se asignó a ${nombre(u)}.`, a: u }));
    if (estado !== "por_iniciar") ev.push({ id: `${id}-es`, tipo: "estado", por: asignados[0] ? nombre(asignados[0]) : "Administración", en: `${ini && ini <= hoy ? ini : hoy}T09:00:00Z`, detalle: `Pasó a «${estado === "en_curso" ? "En curso" : estado === "en_riesgo" ? "En riesgo" : estado === "en_revision" ? "En revisión" : "Hecho"}».` });
    eventos.set(id, ev);
  };

  for (const l of lineas) {
    if (!l.inicio || !l.fin || !l.resultado) continue;
    const of = oficinaDeLinea(l);
    const base = l.inicio < "2027-01-18" ? "2027-01-18" : l.inicio;
    let cursor = sumarDias(base, Math.floor(r() * 150));
    const cuantos = 2 + Math.floor(r() * 3);
    const lista = PLANTILLAS.slice(0, cuantos - 1);
    lista.push(PLANTILLAS[PLANTILLAS.length - 1]);
    lista.forEach((pl, i) => {
      let ini: string | null = cursor;
      let fin = sumarDias(cursor, 25 + Math.floor(r() * 80));
      if (fin > l.fin!) fin = l.fin!;
      if (ini > fin) ini = fin;
      if (pl.hito) { ini = null; fin = sumarDias(cursor, 10 + Math.floor(r() * 40)); if (fin > l.fin!) fin = l.fin!; }
      cursor = sumarDias(fin, -10 + Math.floor(r() * 12));
      if (cursor < base) cursor = base;
      const cam = l.campus === "Todos" ? pick(["Todos", ...campus]) : l.campus;
      nuevo(of, l.no, pl.t(corto(l.nombre)), ini, fin, Boolean(pl.hito), pl.items, cam, PRIORIDADES_ACT[Math.min(3, Math.max(0, ["Crítico", "Alto", "Medio", "Largo plazo"].indexOf(l.prioridad)) + (r() < 0.3 ? 1 : 0))]);
    });
  }
  for (const u of UNIDADES_DEMO.filter((x) => x.id !== "of-1")) {
    PROPIAS.forEach((pr, i) => {
      const ini = sumarDias(hoy, -40 + i * 30 + Math.floor(r() * 10));
      nuevo(u.id, null, pr.t, ini, sumarDias(ini, 20 + Math.floor(r() * 30)), false, pr.items, campus[0], pick(["Medio", "Bajo", "Alto"] as const));
    });
  }
  return { actividades, eventos };
}


/* =============================================================================
   Fase 3 · catálogo del PDI de EJEMPLO y avances, evidencias, riesgos y comentarios de demostración.
   El catálogo real sale de `ps_pdi_catalogo` (pilares publicados → áreas → líneas de acción); estos
   nombres de áreas y líneas son inventados para recorrer la pantalla sin base.
   ========================================================================== */

const LINEAS_PDI: Record<string, [string, string[]][]> = {
  P2: [["Infraestructura digital", ["Renovar la red y la conectividad de los campus", "Consolidar los servicios en la nube institucional", "Fortalecer la ciberseguridad"]], ["Sistemas de información", ["Integrar los sistemas académicos y administrativos", "Gobernar los datos institucionales"]]],
  P3: [["Emprendimiento e innovación", ["Crear espacios de innovación en los campus", "Acompañar los emprendimientos de estudiantes"]], ["Relación con el entorno", ["Alianzas con empresas y gobierno", "Transferencia de conocimiento"]]],
  P4: [["Planeación y calidad", ["Seguimiento al plan de desarrollo", "Gestión de riesgos institucionales"]], ["Talento humano", ["Cualificación del personal administrativo", "Bienestar laboral"]]],
  P6: [["Extensión y proyección", ["Programas con comunidades vulnerables", "Sostenibilidad ambiental de los campus", "Cultura y deporte para la comunidad"]]],
};

export const CATALOGO_PDI_DEMO: PilarCatalogo[] = Object.entries(PILARES).map(([cod, nombre]) => {
  const n = cod.slice(1);
  return {
    pillarId: `pil-${n}`, codigo: cod, nombre,
    areas: (LINEAS_PDI[cod] ?? []).map(([area, lineas], i) => ({
      areaId: `area-${n}-${i + 1}`, codigo: `A-${n}.${i + 1}`, nombre: area,
      lineas: lineas.map((l, j) => ({ lineaId: `la-${n}-${i + 1}-${j + 1}`, codigo: `LA-${n}.${i + 1}.${j + 1}`, nombre: l })),
    })),
  };
});

const hex = (n: number): string => Array.from({ length: 8 }, (_, i) => ((Math.imul(n + i * 7919, 2654435761) >>> 0).toString(16).padStart(8, "0"))).join("");

export interface DatosF3 {
  avances: Avance[];
  riesgos: Riesgo[];
  comentarios: Map<string, Comentario[]>;
}

/** Les pone conexión con el PDI y avance a las actividades (las modifica) y devuelve los avances, riesgos y comentarios. */
export function generarF3(actividades: Actividad[], personas: readonly PersonaSemilla[], hoy = HOY_DEMO): DatosF3 {
  const r = semilla(20270701);
  const ahora = Date.parse(`${hoy}T12:00:00Z`);
  const hace = (horas: number) => new Date(ahora - horas * 3_600_000).toISOString();
  const nombre = (id: string) => personas.find((x) => x.id === id)?.nombre ?? "Alguien";
  const persona = (id: string) => ({ id, nombre: nombre(id) });
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const avances: Avance[] = [];
  const riesgos: Riesgo[] = [];
  const comentarios = new Map<string, Comentario[]>();
  let k = 0;

  const item = (p: PilarCatalogo, lineaId: string | null): ItemPdi => {
    const a = p.areas.find((x) => x.lineas.some((l) => l.lineaId === lineaId));
    const l = a?.lineas.find((x) => x.lineaId === lineaId);
    return { pillarId: p.pillarId, pilar: `${p.codigo} ${p.nombre}`, pilarSlug: p.codigo.toLowerCase(), area: a?.nombre ?? null, lineaId, lineaCodigo: l?.codigo ?? null, linea: l?.nombre ?? null };
  };
  const evidencia = (a: Actividad, i: number): Evidencia => {
    const id = `ev-${++k}`;
    if (i % 2 === 0) return { id, tipo: "enlace", nombre: "Acta de la reunión de seguimiento", url: "https://intranet.demo.udes.test/actas/seguimiento", storagePath: null, mime: null, bytes: null, huella: null, creadaEn: hace(30) };
    const nom = `informe-${a.id}.pdf`;
    return { id, tipo: "archivo", nombre: nom, url: null, storagePath: `${a.oficinaId}/${a.id}/${id}-${nom}`, mime: "application/pdf", bytes: 180_000 + Math.floor(r() * 900_000), huella: hex(k), creadaEn: hace(30) };
  };
  const avance = (a: Actividad, estado: Avance["estado"], fisico: number, autor: string, revisor: string | null, horas: number, nota: string, notaRev: string | null = null): Avance => {
    const id = `av-${++k}`;
    const n = estado === "pendiente" ? 1 + Math.floor(r() * 2) : Math.floor(r() * 3);
    const reportadoEn = hace(horas);
    return {
      id, actividadId: a.id, fecha: reportadoEn.slice(0, 10), fisico, financiero: r() < 0.35 ? Math.min(100, Math.max(0, fisico - 5 + Math.floor(r() * 10))) : null, nota, estado,
      reportadoPor: persona(autor), reportadoEn, revisadoPor: revisor ? persona(revisor) : null, revisadoEn: revisor ? hace(Math.max(1, horas - 8)) : null, notaRevision: notaRev, vencido: estado === "pendiente" && horas >= 72,
      evidencias: Array.from({ length: n }, (_, i) => evidencia(a, i)),
    };
  };

  for (const a of actividades) {
    const x = r();
    if (x < 0.55) {
      const p = pick(CATALOGO_PDI_DEMO);
      const lineas = p.areas.flatMap((q) => q.lineas);
      const items = [r() < 0.65 ? item(p, pick(lineas).lineaId) : item(p, null)];
      if (r() < 0.25) { const q = pick(CATALOGO_PDI_DEMO.filter((z) => z.pillarId !== p.pillarId)); items.push(item(q, pick(q.areas.flatMap((z) => z.lineas)).lineaId)); }
      a.pdi = { conexion: "con_pdi", items };
    } else if (x < 0.75) a.pdi = { conexion: "sin_pdi", items: [] };

    const jefe = personas.find((q) => q.oficina === a.oficinaId && q.papel === "jefe")?.id ?? "u-01";
    const autor = a.asignados[0] ?? jefe;
    const revisor = autor === jefe ? "u-01" : jefe;
    const lista: Avance[] = [];
    if (a.estado === "hecho") {
      if (r() < 0.5) lista.push(avance(a, "validado", 45 + Math.floor(r() * 20), autor, revisor, 24 * 20, "Se terminó la primera etapa y se dejó el soporte."));
      lista.push(avance(a, "validado", 100, autor, revisor, 24 * 6, "La actividad quedó terminada y entregada a quien la solicitó."));
    } else if (a.estado === "en_revision") {
      const prev = r() < 0.45 ? 25 + Math.floor(r() * 25) : 0;
      if (prev) lista.push(avance(a, "validado", prev, autor, revisor, 24 * 12, "Avance de la primera etapa."));
      lista.push(avance(a, "pendiente", Math.max(prev, 55 + Math.floor(r() * 40)), autor, null, pick([4, 20, 50, 80, 130]), "Se completó lo planeado para el periodo y se adjunta el soporte; queda pendiente la socialización."));
    } else if (a.estado === "en_curso" || a.estado === "en_riesgo") {
      if (r() < 0.55) lista.push(avance(a, "validado", 20 + Math.floor(r() * 45), autor, revisor, 24 * (4 + Math.floor(r() * 20)), "Se avanzó según el cronograma; falta la parte de contratación."));
      if (r() < 0.25) lista.push(avance(a, "devuelto", 60, autor, revisor, 24 * 2, "Se terminó casi todo.", "Falta el soporte de lo que se hizo: adjunte el acta o el informe y vuelva a reportar."));
    }
    lista.sort((p, q) => p.reportadoEn.localeCompare(q.reportadoEn));
    avances.push(...lista);

    if (a.estado === "en_riesgo" || (a.estado !== "por_iniciar" && r() < 0.12)) {
      const abierto = a.estado === "en_riesgo";
      const nivel: NivelRiesgo = abierto ? pick(["Crítico", "Alto", "Alto", "Medio"] as const) : "Medio";
      const id = `rg-${++k}`;
      const acciones: Accion[] = [
        { id: `ac-${++k}`, riesgoId: id, texto: "Reunirse con el proveedor para acordar una nueva fecha de entrega", responsableId: autor, vence: sumarDias(hoy, abierto ? 7 : -15), estado: abierto ? "en_curso" : "hecha" },
        ...(r() < 0.6 ? [{ id: `ac-${++k}`, riesgoId: id, texto: "Pedir recursos adicionales a la Vicerrectoría", responsableId: jefe, vence: sumarDias(hoy, abierto ? -3 : -20), estado: abierto ? ("pendiente" as const) : ("hecha" as const) }] : []),
      ];
      riesgos.push({
        id, actividadId: a.id, titulo: abierto ? "El proveedor puede entregar tarde" : "Retraso en la aprobación del presupuesto", descripcion: "Si no se resuelve, la actividad no se cumple en la fecha prevista y se afectan las siguientes.", nivel, estado: abierto ? "abierto" : "cerrado",
        mitigacion: "Seguimiento semanal con el proveedor y plan B con otro proveedor.", creadoPor: persona(jefe), creadoEn: hace(24 * 9), cerradoEn: abierto ? null : hace(24 * 3), acciones,
      });
    }
    const c: Comentario[] = [];
    if (r() < 0.3) c.push({ id: `cm-${++k}`, autor: nombre(autor), tipo: "comentario", texto: "Quedamos pendientes de la respuesta de Compras para seguir.", creadoEn: hace(24 * 5) });
    if (c.length) comentarios.set(a.id, c);

    const mios = lista.filter((v) => v.estado === "validado").at(-1);
    a.avance = { fisico: a.estado === "hecho" ? 100 : (mios?.fisico ?? 0), financiero: mios?.financiero ?? null, validadoEn: mios?.revisadoEn ?? null, pendientes: lista.filter((v) => v.estado === "pendiente").length };
  }
  return { avances, riesgos, comentarios };
}
