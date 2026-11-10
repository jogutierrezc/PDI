/* Warehouse UDES · modelo semántico · el tablero como dato y su revisión de calidad.

   Un tablero guarda su definición (fuentes, reglas aprobadas, medidas, páginas), no los datos: los datos se leen
   del Warehouse cada vez con las funciones de la base. Las reglas de calidad siguen el método de las buenas
   prácticas de modelos y reportes de BI: modelo en estrella, relaciones de muchos a uno en una sola vía, tabla de
   periodos, medidas con nombre y descripción, límite de visuales por página y nada de datos personales a la vista. */

import { DIMENSIONES, type DimensionId } from "./dimensiones";
import { MEDIDAS, noDisponible, medidaPorId } from "./medidas";
import { detectarHallazgos, dimensionesComunes, relacionesDe, relacionesEntreDimensiones, type Perfiles, type TipoRegla } from "./relaciones";

export type PlantillaId = "ejecutivo" | "diagnostico" | "detalle";
export type TipoVisual = "kpi" | "barras" | "lineas" | "calor" | "dispersion" | "tabla" | "narrativa";
export type PublicoId = "consejo" | "decanos" | "programas" | "planeacion";

export const PLANTILLAS: Record<PlantillaId, { nombre: string; descripcion: string; maxVisuales: number }> = {
  ejecutivo: { nombre: "Resumen ejecutivo", descripcion: "Pocas cifras y una lectura. Para el Consejo y Rectoría.", maxVisuales: 6 },
  diagnostico: { nombre: "Diagnóstico", descripcion: "Dónde y por qué: comparar departamentos, programas y periodos.", maxVisuales: 8 },
  detalle: { nombre: "Detalle por grupo", descripcion: "Tabla grande y filtros para trabajar caso por caso.", maxVisuales: 6 },
};

export const PUBLICOS: Record<PublicoId, string> = { consejo: "Consejo", decanos: "Decanos y directores", programas: "Programas", planeacion: "Planeación" };

export interface VisualBI {
  id: string;
  tipo: TipoVisual;
  titulo: string;
  /** Ids de MEDIDAS. */
  medidas: string[];
  /** Por qué se agrupa o se cruza. Nunca una dimensión personal. */
  dimensiones: DimensionId[];
}

export interface PaginaBI {
  id: string;
  nombre: string;
  plantilla: PlantillaId;
  visuales: VisualBI[];
}

export interface ModeloBI {
  version: 1;
  nombre: string;
  /** La pregunta que responde: manda sobre qué medidas se proponen. */
  pregunta: string;
  publico: PublicoId;
  /** Ids de conjuntos del Warehouse. */
  fuentes: string[];
  /** Reglas de reconstrucción que la persona aprobó. */
  reglas: TipoRegla[];
  /** Ids de MEDIDAS elegidas. */
  medidas: string[];
  paginas: PaginaBI[];
}

export function modeloVacio(): ModeloBI {
  return { version: 1, nombre: "", pregunta: "", publico: "planeacion", fuentes: [], reglas: [], medidas: [], paginas: [] };
}

export type Severidad = "error" | "aviso";
export interface ReglaCalidad {
  id: string;
  ok: boolean;
  severidad: Severidad;
  texto: string;
}

const esNombreDeNegocio = (nombre: string) => nombre.trim().length >= 4 && !/[_]/.test(nombre) && nombre === nombre.trim();

/** La revisión que se ve antes de publicar: cada regla dice si pasa y qué hacer. */
export function revisarModelo(m: ModeloBI, perfiles: Perfiles = {}): ReglaCalidad[] {
  const r: ReglaCalidad[] = [];
  const hallazgos = detectarHallazgos(m.fuentes, perfiles).filter((h) => h.requiereAprobacion);
  const abiertos = hallazgos.filter((h) => !m.reglas.includes(h.id));
  const elegidas = m.medidas.map((id) => medidaPorId(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const usables = elegidas.filter((x) => noDisponible(x, m.fuentes, m.reglas) === null);
  const relaciones = relacionesDe(m.fuentes, m.reglas, perfiles);

  r.push({ id: "fuentes", ok: m.fuentes.length > 0, severidad: "error", texto: m.fuentes.length ? `${m.fuentes.length} fuente${m.fuentes.length > 1 ? "s" : ""} del Warehouse.` : "Elija al menos una fuente." });
  r.push({
    id: "cruce",
    ok: m.fuentes.length < 2 || dimensionesComunes(m.fuentes).length > 0 || relaciones.some((x) => x.dimension === "periodo"),
    severidad: "error",
    texto: m.fuentes.length < 2 ? "Con una sola fuente no hay cruce." : "Las fuentes comparten al menos una dimensión (periodo, sede…). Se cruzan por dimensiones, no fila contra fila.",
  });
  r.push({ id: "periodos", ok: m.fuentes.length === 0 || relaciones.some((x) => x.dimension === "periodo"), severidad: "error", texto: "Hay una tabla de periodos: ordena, compara con el anterior y dice si el periodo está abierto." });
  r.push({
    id: "hallazgos",
    ok: abiertos.length === 0,
    severidad: "error",
    texto: abiertos.length ? `${abiertos.length} reconstrucción${abiertos.length > 1 ? "es" : ""} sin aprobar: ${abiertos.map((h) => h.titulo).join("; ")}.` : "Las reconstrucciones propuestas están resueltas.",
  });
  const sinResolver = relacionesEntreDimensiones(m.fuentes, m.reglas, perfiles).filter((x) => x.estado === "requiere_regla");
  r.push({ id: "relaciones", ok: relaciones.every((x) => x.cardinalidad === "muchos-a-uno") && sinResolver.length === 0, severidad: "error", texto: "Relaciones de muchos a uno y en una sola vía, sin dimensiones sin puente." });
  r.push({ id: "medidas", ok: usables.length > 0, severidad: "error", texto: usables.length ? `${usables.length} medidas con nombre de negocio y descripción.` : "Elija al menos una medida disponible con las fuentes y reglas actuales." });
  const inutiles = elegidas.filter((x) => noDisponible(x, m.fuentes, m.reglas) !== null);
  r.push({ id: "medidas_disponibles", ok: inutiles.length === 0, severidad: "aviso", texto: inutiles.length ? `${inutiles.map((x) => x.nombre).join(", ")} no está disponible con estas fuentes o reglas.` : "Todas las medidas elegidas están disponibles." });
  r.push({ id: "nombres", ok: elegidas.every((x) => esNombreDeNegocio(x.nombre) && x.descripcion.trim().length > 0), severidad: "aviso", texto: "Las medidas se llaman como las llama la oficina, sin guiones bajos, y llevan descripción." });
  r.push({ id: "carpetas", ok: elegidas.every((x) => x.carpeta.length > 0), severidad: "aviso", texto: "Cada medida está en una carpeta." });

  for (const p of m.paginas) {
    const max = PLANTILLAS[p.plantilla].maxVisuales;
    r.push({ id: `visuales_${p.id}`, ok: p.visuales.length <= max, severidad: "aviso", texto: `«${p.nombre}»: ${p.visuales.length} visuales. Máximo recomendado: ${max}.` });
    r.push({ id: `titulos_${p.id}`, ok: p.visuales.every((v) => v.titulo.trim().length > 0), severidad: "aviso", texto: `«${p.nombre}»: cada visual tiene título.` });
    const personal = p.visuales.flatMap((v) => v.dimensiones).filter((d) => DIMENSIONES[d].personal);
    r.push({ id: `personales_${p.id}`, ok: personal.length === 0, severidad: "error", texto: `«${p.nombre}»: ningún visual agrupa por una dimensión con dato personal.` });
    const sueltas = p.visuales.flatMap((v) => v.medidas).filter((id) => !m.medidas.includes(id));
    r.push({ id: `medidas_${p.id}`, ok: sueltas.length === 0, severidad: "error", texto: `«${p.nombre}»: usa solo medidas elegidas en el modelo.` });
  }
  r.push({ id: "reserva", ok: true, severidad: "aviso", texto: "Los grupos con menos de 5 personas distintas no se entregan cuando una medida cuenta personas." });
  return r;
}

export const hayErrores = (reglas: ReglaCalidad[]) => reglas.some((x) => !x.ok && x.severidad === "error");

/** Las medidas que conviene marcar para una pregunta de riesgo académico, con lo que hay disponible. */
export function medidasRecomendadas(fuentes: string[], reglas: TipoRegla[]): string[] {
  return MEDIDAS.filter((x) => x.recomendada && noDisponible(x, fuentes, reglas) === null).map((x) => x.id);
}
