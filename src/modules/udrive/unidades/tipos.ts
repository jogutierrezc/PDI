/* =============================================================================
   UDrive · Unidades de trabajo (0191) · tipos y catálogos.

   Los nombres de las columnas son los que devuelven las funciones de la base.
   Los catálogos (iconos, composiciones, portadas, papeles) son listas cerradas:
   la base los comprueba con un check, así que no se pueden agregar aquí sin
   cambiar también la migración.
   ========================================================================== */

export type RolUnidad = "lector" | "editor" | "creador" | "admin";
export type Composicion = "A" | "B" | "C" | "D";
export type Portada = "ninguna" | "lineas" | "curvas" | "puntos" | "bloques" | "trama";
export type Seccion = "carpetas" | "recientes" | "informes" | "miembros" | "actividad";
export type Plantilla = "informes" | "seguimiento" | "blanco";
export type IconoUnidad = "chart" | "book" | "flask" | "heart" | "building" | "globe" | "people" | "compass" | "leaf" | "scale" | "cap" | "gear";

export interface ImagenCabecera {
  ruta: string;
  x: number;
  y: number;
  zoom: number;
}

export interface UnidadFila {
  id: string;
  nombre: string;
  descripcion: string;
  monograma: string;
  acento: string;
  icono: IconoUnidad;
  composicion: Composicion;
  portada: Portada;
  imagen: ImagenCabecera | null;
  orden_secciones: Seccion[];
  ancladas: string[];
  plantilla: Plantilla;
  unit_id: string | null;
  carpeta_raiz: string;
  cuota_bytes: number;
  archivada_en: string | null;
  created_at: string;
  updated_at: string;
  /** «admin» también para el administrador general sin ser miembro. */
  mi_rol: RolUnidad;
  es_miembro: boolean;
  n_miembros: number;
  n_externos: number;
  uso_bytes: number;
  sin_admin: boolean;
  vencen_pronto: number;
}

/** Lo que se pinta de una unidad en una portada o tarjeta (también la unidad a medio crear). */
export interface Apariencia {
  nombre: string;
  descripcion: string;
  monograma: string;
  acento: string;
  icono: IconoUnidad;
  composicion: Composicion;
  portada: Portada;
  /** Dirección ya firmada de la imagen propia (o una vista previa local). */
  imagenUrl: string | null;
  imagen: Pick<ImagenCabecera, "x" | "y" | "zoom"> | null;
}

export interface MiembroFila {
  usuario_id: string;
  correo: string;
  nombre: string;
  rol: RolUnidad;
  vence_en: string | null;
  externo: boolean;
  vigente: boolean;
  otorgado_por: string | null;
  es_yo: boolean;
}

/** Una persona de la lista antes de crear la unidad (todavía no existe en la base). */
export interface MiembroBorrador {
  usuario_id: string;
  correo: string;
  nombre: string;
  rol: RolUnidad;
  externo: boolean;
  vence_en: string | null;
}

export interface PersonaBuscada {
  id: string;
  correo: string;
  nombre: string;
  externo: boolean;
}

export interface EventoFila {
  id: number;
  cuando: string;
  actor_nombre: string | null;
  como: "miembro" | "admin_general" | "sistema";
  accion: string;
  detalle: Record<string, unknown>;
}

export interface EventoGlobal extends EventoFila {
  unidad_id: string;
  unidad: string;
}

export interface EstructuraFila {
  id: string;
  nombre: string;
  codigo: string;
  padre_id: string | null;
}

export interface PersonaEstructura {
  usuario_id: string;
  correo: string;
  nombre: string;
  papel: "jefe" | "editor" | "visor";
}

export interface CapacidadResumen {
  capacidad_bytes: number;
  comprometido_bytes: number;
  uso_unidades_bytes: number;
  uso_personal_bytes: number;
  n_unidades: number;
  cuota_defecto_bytes: number;
}

export interface CapacidadUnidad {
  unidad_id: string;
  nombre: string;
  monograma: string;
  acento: string;
  archivada_en: string | null;
  uso_bytes: number;
  cuota_bytes: number;
  peticion_id: string | null;
  peticion_bytes: number | null;
  peticion_motivo: string | null;
  peticion_por: string | null;
  peticion_fecha: string | null;
}

export interface PeticionFila {
  id: string;
  bytes_pedidos: number;
  motivo: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  respuesta: string | null;
  bytes_otorgados: number | null;
  pedida_por: string;
  created_at: string;
  resuelta_en: string | null;
}

/* ---------- Catálogos ------------------------------------------------------------ */

export const ROLES_UNIDAD: { k: RolUnidad; nombre: string; resumen: string }[] = [
  { k: "lector", nombre: "Solo ver", resumen: "Abre, descarga y comenta." },
  { k: "editor", nombre: "Editar", resumen: "Lo anterior, más cambiar archivos que ya existen." },
  { k: "creador", nombre: "Crear", resumen: "Lo anterior, más subir archivos y crear carpetas." },
  { k: "admin", nombre: "Administra", resumen: "Lo anterior, más gestionar personas, borrar y archivar." },
];
export const NOMBRE_ROL: Record<RolUnidad, string> = { lector: "Solo ver", editor: "Editar", creador: "Crear", admin: "Administra" };
export const RANGO_ROL: Record<RolUnidad, number> = { lector: 1, editor: 2, creador: 3, admin: 4 };

/** Qué puede hacer cada papel: la acción y el rango mínimo. */
export const CAPACIDADES: [string, number][] = [
  ["Abrir y descargar", 1],
  ["Comentar", 1],
  ["Editar archivos que ya existen", 2],
  ["Subir archivos y crear carpetas", 3],
  ["Enviar a la papelera lo que creó", 3],
  ["Borrar para siempre y vaciar la papelera", 4],
  ["Añadir, quitar y cambiar el papel de personas", 4],
  ["Cambiar la identidad y archivar la unidad", 4],
];

export const ACENTOS = ["#0b3a78", "#00717e", "#6b3fa0", "#2e6b2f", "#a4471f", "#ad2f58", "#43536b", "#1a6b5a", "#7a4a2b", "#7f6200"];

export const ICONOS: Record<IconoUnidad, { nombre: string; d: string }> = {
  chart: { nombre: "Gráfica", d: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
  book: { nombre: "Libro", d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6" },
  flask: { nombre: "Laboratorio", d: "M9 3h6M10 3v6L5 19a1 1 0 0 0 1 1.5h12a1 1 0 0 0 1-1.5L14 9V3M8 14h8" },
  heart: { nombre: "Bienestar", d: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" },
  building: { nombre: "Edificio", d: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h2M14 11h2" },
  globe: { nombre: "Mundo", d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" },
  people: { nombre: "Personas", d: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M17 14c2.5 0 4.5 2.2 4.5 5" },
  compass: { nombre: "Brújula", d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z" },
  leaf: { nombre: "Hoja", d: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7" },
  scale: { nombre: "Balanza", d: "M12 4v16M6 20h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" },
  cap: { nombre: "Birrete", d: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5" },
  gear: { nombre: "Engranaje", d: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" },
};

export const COMPOSICIONES: Record<Composicion, { nombre: string; nota: string }> = {
  A: { nombre: "Banda", nota: "Imagen en una banda arriba; monograma y título debajo. La más neutra." },
  B: { nombre: "Lateral", nota: "Panel con imagen y monograma a un lado; título al otro." },
  C: { nombre: "Rótulo", nota: "Sin imagen: el monograma grande es la portada." },
  D: { nombre: "Mosaico", nota: "Imagen a todo el ancho con una placa de color para el título." },
};

export const PORTADAS: Record<Portada, string> = { ninguna: "Sin imagen", lineas: "Líneas", curvas: "Curvas", puntos: "Puntos", bloques: "Bloques", trama: "Trama" };

export const SECCIONES: Record<Seccion, string> = {
  carpetas: "Carpetas ancladas",
  recientes: "Recientes",
  informes: "Informes en construcción",
  miembros: "Personas y papeles",
  actividad: "Actividad",
};
export const ORDEN_POR_DEFECTO: Seccion[] = ["carpetas", "recientes", "informes", "miembros", "actividad"];

export const PLANTILLAS: Record<Plantilla, { nombre: string; carpetas: string[]; nota: string }> = {
  informes: { nombre: "Informes y datos", carpetas: ["Informes", "Datos", "Documentos de apoyo"], nota: "Informes, Datos, Documentos de apoyo" },
  seguimiento: { nombre: "Seguimiento", carpetas: ["Plan de trabajo", "Actas", "Evidencias"], nota: "Plan de trabajo, Actas, Evidencias" },
  blanco: { nombre: "En blanco", carpetas: [], nota: "Sin carpetas. Las crea quien tenga papel de Crear." },
};

export const DOMINIO_INSTITUCIONAL = "udes.edu.co";
export const MAX_DIAS_EXTERNO = 730;
export const AVISO_VENCE_DIAS = 14;
export const CUOTA_DEFECTO_BYTES = 5 * 1024 ** 3;
export const CAPACIDAD_SERVIDOR_BYTES = 512 * 1024 ** 3;
export const MAX_IMAGEN_CABECERA = 5 * 1024 * 1024;
export const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];
export const BUCKET_UNIDADES = "udrive-unidades";
