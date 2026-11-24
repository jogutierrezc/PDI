/* =============================================================================
   UI GreenMetric · tipos de la sección (migraciones 0208 a 0213).

   Los mismos nombres que las columnas de `ugm_*`. Lo que se escribe como jsonb
   tiene aquí su forma: `valores` (números, URL, fechas, lista de ODS), `textos_es`
   y `textos_en` (textos por campo), `tablas` y `tablas_en` (filas por tabla).
   ========================================================================== */

export type CategoriaId = "SI" | "EC" | "WS" | "WR" | "TR" | "ED" | "GD";

export type TipoPregunta = "seleccion" | "numero" | "razon" | "area_banda" | "escala" | "impacto_ods" | "url";
export type PeriodoPregunta = "ninguno" | "actual" | "anterior" | "tres_anios" | "serie";

export type TipoCampo = "numero" | "texto" | "texto_largo" | "url" | "opcion" | "ods" | "fecha";
export type TipoColumna = "texto" | "numero" | "url" | "fecha";

/** Un campo que la persona llena en el formulario de la pregunta. */
export interface CampoEsquema {
  k: string;
  tipo: TipoCampo;
  es: string;
  en: string;
  unidad?: string;
  obligatorio?: boolean;
  /** Se traduce con Pilo y su traducción se revisa antes de enviar. */
  traducible?: boolean;
  /** La opción 1–5 sale sola de las bandas (la persona no la elige). */
  derivada?: boolean;
}

export interface ColumnaEsquema {
  k: string;
  es: string;
  en: string;
  tipo: TipoColumna;
  unidad?: string;
}

export interface TablaEsquema {
  k: string;
  es: string;
  en: string;
  columnas: ColumnaEsquema[];
  /** Filas sugeridas: el texto de la primera columna. */
  filas?: string[];
  /** Cuántas filas se exigen para enviar. */
  min?: number;
}

/** De dónde sale cada entrada de un cálculo: «1.5.valor», «own.area», «poblacion», «6.5.promedio»… */
export interface EntradaCalculo {
  k: string;
  desde: string;
}

export interface CalculoEsquema {
  id: string;
  unidad: string;
  entradas: EntradaCalculo[];
}

export interface EsquemaPregunta {
  campos: CampoEsquema[];
  tablas: TablaEsquema[];
  calculo?: CalculoEsquema;
}

export interface OpcionPregunta {
  valor: number;
  es: string;
  en?: string;
}

/** Bandas del Apéndice 1: «asc» (x ≤ c0 → 1 … > c3 → 5) o «desc» (x ≥ c0 → 1 … < c3 → 5). USO INTERNO. */
export interface Bandas {
  sentido: "asc" | "desc";
  cortes: [number, number, number, number];
}

export interface PreguntaCatalogo {
  q: string;
  categoria: CategoriaId;
  numero: number;
  orden: number;
  indicador: string | null;
  /** Puntos del indicador (USO INTERNO; la web no los muestra). */
  puntos: number | null;
  nombre_es: string;
  nombre_en: string;
  tipo: TipoPregunta;
  unidad: string | null;
  periodo: PeriodoPregunta;
  requiere_evidencia: boolean;
  pagina_guia: number | null;
  calculada: boolean;
  /** La plantilla oficial existe pero la guía no tiene la pregunta (3.18). */
  sin_guia: boolean;
  plantilla: string | null;
  carpeta_nombre: string | null;
  opciones: OpcionPregunta[] | null;
  bandas: Bandas | null;
  /** Factor de cada opción 1–5 (USO INTERNO). */
  factores: [number, number, number, number, number] | null;
  esquema: EsquemaPregunta;
}

export interface CategoriaCatalogo {
  categoria: CategoriaId;
  numero: number;
  nombre_es: string;
  nombre_en: string;
  /** Peso (%) y puntos máximos: USO INTERNO. */
  peso_pct: number;
  puntos_max: number;
  carpeta_nombre: string;
}

/** Fila de ugm_preguntas (el catálogo del ciclo, con la carpeta de UDrive si ya se creó). */
export interface PreguntaCiclo extends PreguntaCatalogo {
  ciclo_id: string;
  carpeta_id: string | null;
}

export interface CategoriaCiclo extends CategoriaCatalogo {
  ciclo_id: string;
  carpeta_id: string | null;
}

/* --- Estado ---------------------------------------------------------------------------------- */

export type EstadoRespuesta = "sin_asignar" | "asignado" | "en_captura" | "enviado" | "en_revision" | "devuelto" | "aprobado";
export type ActorUgm = "admin" | "revisor" | "responsable" | "apoyo" | "jefe" | "sistema";
export type EstadoCiclo = "preparacion" | "abierto" | "cerrado";

export type ValorCampo = number | string | number[] | null;
export type FilaTabla = Record<string, string | number | null>;

export interface CalculoGuardado {
  valor?: number | null;
  unidad?: string;
  texto?: string;
  entradas?: Record<string, number | null>;
  faltan?: string[];
}

export interface RespuestaUgm {
  id: string;
  ciclo_id: string;
  q: string;
  estado: EstadoRespuesta;
  valores: Record<string, ValorCampo>;
  tablas: Record<string, FilaTabla[]>;
  tablas_en: Record<string, FilaTabla[]>;
  textos_es: Record<string, string>;
  textos_en: Record<string, string>;
  opcion: number | null;
  opcion_calculada: boolean;
  calculo: CalculoGuardado;
  para_actualizar: boolean;
  arrastrada_de: string | null;
  version: number;
  completitud: number;
  nota_revision: string | null;
  revisor_id: string | null;
  enviado_at: string | null;
  aprobado_at: string | null;
  aprobado_por: string | null;
  sensible: boolean;
  publicar_web: boolean;
  publicado_at: string | null;
  publicado_por: string | null;
  retirado_at: string | null;
  retiro_motivo: string | null;
  version_publicada: number | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Lo que el responsable puede escribir (las columnas con grant de 0208). */
export interface CapturaUgm {
  valores?: Record<string, ValorCampo>;
  tablas?: Record<string, FilaTabla[]>;
  tablas_en?: Record<string, FilaTabla[]>;
  textos_es?: Record<string, string>;
  textos_en?: Record<string, string>;
  opcion?: number | null;
  opcion_calculada?: boolean;
  calculo?: CalculoGuardado;
}

export interface ConfigCiclo {
  ciclo_id: string;
  guia: string;
  universidad: string;
  pais: string;
  web: string;
  periodo_ref_desde: string | null;
  periodo_ref_hasta: string | null;
  envio_desde: string | null;
  envio_hasta: string | null;
  recordatorio_dias: number[];
  resumen_semanal: boolean;
  resumen_dia: number;
  unidad_id: string | null;
  carpeta_raiz: string | null;
  ciclo_anterior: string | null;
  avisar_a: string[];
  updated_at: string;
}

export interface CicloUgm {
  id: string;
  ranking: string;
  anio: number;
  anio_datos: number;
  fecha_limite: string | null;
  estado: EstadoCiclo;
  created_at: string;
}

export type RolAsignacion = "responsable" | "apoyo" | "revisor";

export interface AsignacionUgm {
  id: string;
  ciclo_id: string;
  q: string | null;
  categoria: CategoriaId | null;
  usuario_id: string;
  unidad_id: string | null;
  rol: RolAsignacion;
  fecha_limite: string | null;
  asignado_por: string | null;
  vigente: boolean;
  retirado_at: string | null;
  created_at: string;
}

export interface PersonaBuscada {
  id: string;
  correo: string;
  nombre: string;
  unidades: { id: string; nombre: string; rol: string }[];
}

export interface VersionUgm {
  id: string;
  respuesta_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  autor: string | null;
  motivo: "envio" | "devolucion" | "aprobacion" | "reapertura" | "importacion" | "arrastre";
  created_at: string;
}

export interface ComentarioUgm {
  id: string;
  respuesta_id: string;
  autor: string;
  tipo: "comentario" | "devolucion" | "aprobacion";
  campo: string | null;
  texto: string;
  resuelto: boolean;
  created_at: string;
}

export type EstadoTraduccion = "borrador" | "revisada";

export interface TraduccionUgm {
  id: string;
  respuesta_id: string;
  campo: string;
  origen: "pilo" | "humano" | "importacion";
  modelo: string | null;
  estado: EstadoTraduccion;
  hash_es: string;
  hash_en: string;
  revisor: string | null;
  revisado_at: string | null;
  updated_at: string;
}

export interface EvidenciaUgm {
  id: string;
  respuesta_id: string;
  archivo_id: string | null;
  url: string | null;
  figura: number | null;
  pie_es: string | null;
  pie_en: string | null;
  orden: number;
  es_mapa: boolean;
  idioma: "en" | "es";
  publica: boolean;
  creada_por: string | null;
  created_at: string;
}

export interface ReservaEvidencia {
  reserva_id: string;
  bucket: string;
  ruta: string;
  vence: string;
  aviso: string | null;
}

export interface VinculoDato {
  id: string;
  campo: string;
  modo: "conectado" | "manual";
  archivo_id: string;
  tabla: string | null;
  columna: string;
  col_periodo: string | null;
  agregacion: "suma" | "promedio" | "ultimo";
  anio_modo: "ultimo" | "anterior" | "dos_atras" | "fijo";
  anio: number | null;
  dato: { valor: number; anio: number | null; filas: number } | null;
  publicada: boolean;
}

export interface TablaDisponible {
  id: string;
  nombre: string;
  actualizado: string;
  publicada: boolean;
  filas: number;
  columnas: { clave: string; etiqueta: string; tipo: string }[];
}

export interface GraficaDisponible {
  id: string;
  nombre: string;
  publicada: boolean;
}

export interface EvaluacionUgm {
  faltan: string[];
  total: number;
  cumplidos: number;
}

export interface PublicacionEstado {
  puede: boolean;
  bloqueos: string[];
  avisos: string[];
}

export interface CalculadoUgm {
  q: string;
  indicador: string;
  unidad: string | null;
  valor: number | null;
  /** Banda 1–5 (USO INTERNO). */
  opcion: number | null;
  entradas: string[];
  faltan: string[];
  sin_publicar: string[];
  publicable: boolean;
}

export interface ActividadUgm {
  id: number;
  ciclo_id: string;
  respuesta_id: string | null;
  actor: string | null;
  accion: string;
  de: string | null;
  a: string | null;
  detalle: Record<string, unknown>;
  created_at: string;
}

export type EstadoNotificacion = "en_cola" | "enviando" | "enviado" | "error" | "omitido";

export interface NotificacionUgm {
  id: string;
  ciclo_id: string;
  respuesta_id: string | null;
  destinatario: string;
  plantilla: string;
  valores: Record<string, unknown>;
  estado: EstadoNotificacion;
  intentos: number;
  programada_para: string;
  enviado_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ColaEstado {
  conteo: Partial<Record<EstadoNotificacion, number>>;
  errores: { id: string; plantilla: string; error: string | null; intentos: number; creado: string }[];
  ultimo_envio: string | null;
}

export interface ExportacionUgm {
  id: string;
  ciclo_id: string;
  alcance: "indicador" | "categoria" | "todo";
  q: string | null;
  categoria: string | null;
  hash: string | null;
  manifiesto: Record<string, unknown>;
  generado_por: string | null;
  created_at: string;
}

export interface ImportacionUgm {
  id: string;
  ciclo_id: string;
  respuesta_id: string | null;
  archivo: string;
  hash: string | null;
  q_detectada: string | null;
  resultado: Record<string, unknown>;
  estado: "analizado" | "aplicado" | "descartado";
  aplicado_por: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface GlosarioUgm {
  id: string;
  termino_es: string;
  termino_en: string;
  nota: string | null;
}

export interface ResumenCiclo {
  categoria: CategoriaId;
  estado: EstadoRespuesta;
  n: number;
  publicadas: number;
}

/* --- Lecturas públicas (0212) ------------------------------------------------------------------ */

export type IdiomaPublico = "es" | "en";

export interface PublicoCicloRef {
  id: string;
  anio: number;
  anio_datos: number;
  estado: EstadoCiclo;
}

export interface PublicoResumenCategoria {
  categoria: CategoriaId;
  numero: number;
  nombre_es: string;
  nombre_en: string;
  publicados: number;
  total: number;
  graficas: number;
  tablas: number;
  evidencias_publicas: number;
}

/** Sin puntos ni pesos: un inventario, no una escala. */
export interface PublicoResumen {
  ciclo: PublicoCicloRef;
  version: number | null;
  actualizado: string | null;
  categorias: PublicoResumenCategoria[];
  total: { publicados: number; total: number };
}

export interface PublicoCampo {
  k: string;
  etiqueta: string;
  unidad?: string;
  valor: number | string;
}

export interface PublicoTabla {
  k: string;
  titulo: string;
  columnas: { k: string; etiqueta: string; unidad?: string; tipo: TipoColumna }[];
  filas: FilaTabla[];
}

export interface PublicoEvidencia {
  id: string;
  etiqueta: string;
  tipo: string;
  url?: string;
  pie?: string;
  figura?: number;
  es_mapa?: boolean;
  nota?: string;
}

export interface PublicoTablaConectada {
  campo: string;
  dato: { valor: number; anio: number | null; filas: number };
  fuente: string;
  nombre: string;
  actualizado: string;
  columnas: { clave: string; etiqueta: string; tipo: string }[];
  filas: Record<string, unknown>[];
}

export interface PublicoIndicador {
  q: string;
  indicador?: string;
  categoria: CategoriaId;
  nombre: string;
  tipo: TipoPregunta;
  calculado: boolean;
  unidad?: string;
  periodo?: PeriodoPregunta;
  valor?: number;
  /** La frase de la opción elegida (nunca el número de nivel). */
  opcion_frase?: string;
  ods?: number[];
  descripcion?: string;
  campos?: PublicoCampo[];
  tablas?: PublicoTabla[];
  /** Configuración y filas de las gráficas publicadas de Datos de Sostenibilidad (forma de sos_graficas_publicas). */
  graficas?: Record<string, unknown>[];
  tablas_conectadas?: PublicoTablaConectada[];
  evidencias?: PublicoEvidencia[];
  evidencia_publica?: boolean;
  actualizado?: string;
}

export interface PublicoCategoria {
  ciclo: PublicoCicloRef;
  categoria: { categoria: CategoriaId; numero: number; nombre: string; nombre_es: string; nombre_en: string };
  indicadores: PublicoIndicador[];
  calculados: PublicoIndicador[];
  actualizado: string | null;
}

export interface PublicoHoja {
  ciclo: { id: string; anio: number; anio_datos: number };
  indicador: PublicoIndicador;
}

export interface PublicoCicloListado {
  id: string;
  anio: number;
  anio_datos: number;
  estado: EstadoCiclo;
  publicados: number;
  actualizado: string | null;
}
