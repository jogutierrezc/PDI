/* =============================================================================
   CMS Portales · tipos compartidos con la base (migración 0174).

   Las props de un bloque son un objeto libre (jsonb). Sus claves de contenido
   las define el registro de bloques.ts. Las claves que empiezan por «_» son
   reservadas del editor y viajan dentro de props, sin migraciones:
     _estilo  { fondo, espacio }        apariencia del bloque
     _mov     { preset, dur, ... }      entrada animada con GSAP
     _alinear "izquierda" | "centro" | "derecha" | "justificado"
     _medida  "estrecha" | "amplia" | "completa"   ancho de los párrafos
     _oculto  true                      no se muestra en la página publicada
   ========================================================================== */

export type PortalSlug = "landing" | "planeacion" | "sostenible";

export interface CmsPortal {
  slug: PortalSlug;
  nombre: string;
  orden: number;
}

export interface CmsPagina {
  id: string;
  portal: PortalSlug;
  padre_id: string | null;
  ruta: string;
  titulo: string;
  publicada_version: number | null;
  publicada_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export type Ancho = 4 | 6 | 8 | 12;

/** Contenido y claves reservadas de un bloque; la base lo guarda como jsonb. */
export type Props = Record<string, unknown>;

export interface CmsBloque {
  id: string;
  pagina_id: string;
  orden: number;
  tipo: string;
  ancho: Ancho;
  props: Props;
  actualizado_en: string;
}

/** Una publicación guardada (cms_versiones), sin el contenido: para el historial de solo lectura. */
export interface CmsVersion {
  version: number;
  publicado_en: string;
}

export type Fondo = "claro" | "alterno" | "marino";
export type Espacio = "compacto" | "normal" | "amplio";

export interface Estilo {
  fondo: Fondo;
  espacio: Espacio;
}

/** Alineación del texto de un bloque (clave reservada `_alinear`). */
export type Alineacion = "izquierda" | "centro" | "derecha" | "justificado";
/** Ancho que ocupan los párrafos dentro del bloque (clave reservada `_medida`). */
export type Medida = "estrecha" | "amplia" | "completa";

export type PresetMovimiento = "palabras" | "sube" | "cascada" | "zoom" | "ninguna";

export interface Movimiento {
  preset: PresetMovimiento;
  /** Segundos. */
  dur: number;
  /** Segundos entre elementos de una cascada. */
  stagger: number;
  /** Segundos antes de empezar. */
  delay: number;
  /** Nombre de una curva de GSAP, p. ej. «power3.out». */
  ease: string;
}
