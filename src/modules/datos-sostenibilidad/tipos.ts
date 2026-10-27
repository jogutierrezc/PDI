/* =============================================================================
   Datos de Sostenibilidad · el contrato del módulo.

   La réplica de Programas en Cifras (0164) para los indicadores de
   sostenibilidad de UDES Sostenible, con dos diferencias que lo definen:

   1. Se trabaja por OFICINA (units: UDES Verde, Planeación Institucional…),
      no por pareja programa × campus. Quien pertenece a `ds_miembros`
      (migración 0178) es gestor o colaborador de una oficina.
   2. El libro de datos no responde a un cuadro del CNA sino a un INDICADOR de
      sostenibilidad (`ds_indicadores`), y lo que se responde son SLOTS fijos:
      qué columna da el valor, el periodo, el campus, la fuente y la evidencia.

   La validación de celdas, la lectura de un Excel y el vocabulario de columnas
   son los de Programas en Cifras: se reutilizan sus funciones puras, no se
   copian. Si una cambia, las dos módulos se corrigen a la vez.
   ========================================================================== */

/** Un miembro del módulo: quién trabaja en qué oficina y con qué papel. */
export interface DsMiembro {
  id: string;
  user_id: string;
  oficina_id: string;
  rol: "gestor" | "colaborador";
  name: string;
  email: string;
}

/** Una oficina a la que la persona tiene acceso (RPC ds_yo). */
export interface DsOficina {
  oficina_id: string;
  oficina: string;
  codigo: string;
  rol: "gestor" | "colaborador" | "admin" | "planeacion";
}

/** Mis papeles en el módulo (RPC ds_yo). */
export interface DsYo {
  /** Rol de Planeación (o administración): lee todo, no edita nada. */
  planeacion: boolean;
  oficinas: DsOficina[];
}

/** Un indicador de sostenimiento del catálogo (ds_indicadores). */
export interface DsIndicador {
  id: string;
  ods: number;
  nombre: string;
  descripcion: string;
  unidad: string;
  position: number;
}

/** Una carpeta: las dos fijas del módulo y las de cada oficina. */
export interface DsCarpeta {
  id: string;
  oficina_id: string | null;
  clave: string;
  nombre: string;
  fija: boolean;
}

/** Un libro de datos: tabla o lista de una oficina. */
export interface DsLibro {
  id: string;
  oficina_id: string;
  carpeta_id: string;
  nombre: string;
  tipo: "tabla" | "lista";
  estado: "borrador" | "listo";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  listo_en: string | null;
  listo_por: string | null;
}

/** Una columna de un libro. La misma forma que una de Programas en Cifras. */
export type DsColumna = import("../programas-en-cifras/tipos").Columna & {
  id?: string;
  libro_id?: string;
  orden?: number;
};

/** Datos de una fila: {clave de columna: valor}. */
export type DsDatos = Record<string, import("../programas-en-cifras/tipos").PcValor>;

/** Una fila de un libro. */
export interface DsFila {
  id: string;
  libro_id: string;
  oficina_id: string | null;
  datos: DsDatos;
  orden: number;
  origen: "manual" | "excel" | "sistema";
}

/** La conexión de un libro a un indicador: {slot: clave de columna}. */
export interface DsRespuesta {
  id: string;
  libro_id: string;
  indicador_id: string;
  mapa: Record<string, string>;
}

/** Un error de validación de una celda, tal como lo devuelve la base. */
export interface DsErrorCelda {
  fila_id: string;
  orden: number;
  clave: string;
  mensaje: string;
}

/** Resumen de un libro en el explorador (RPC ds_resumen_libros). */
export interface DsResumenLibro {
  libro_id: string;
  filas: number;
  errores: number;
}

/** Una entrada del historial de una oficina. */
export interface DsActividad {
  id: string;
  oficina_id: string;
  libro_id: string | null;
  accion: string;
  detalle: Record<string, unknown>;
  user_id: string | null;
  at: string;
}

export type { ErrorCelda, PcValor } from "../programas-en-cifras/tipos";

/* ---------- «Al estilo UDrive» (migración 0202) ----------------------------------------------
   Los indicadores se vinculan a tablas de la unidad de UDrive «Datos de Sostenibilidad»; las
   gráficas de esa unidad se publican por sección del Observatorio. Contrato en README.md. */

/** Claves de las tarjetas del portal (IndKey en sostenible/data.ts). */
export type TarjetaPortal = "energia" | "solar" | "agua" | "residuos" | "verde" | "arboles" | "movil" | "volunt";

export type MejorSos = "sube" | "baja";
export type ResumenSos = "promedio" | "suma" | "ultimo";

/** Un indicador del catálogo con lo que 0202 le añade. */
export interface IndicadorSos extends DsIndicador {
  mejor: MejorSos;
  resumen: ResumenSos;
  meta: number | null;
  decimales: number;
  publicado: boolean;
  /** Tarjeta del portal que alimenta; nulo si es nuevo y sale como tarjeta propia. */
  tarjeta: TarjetaPortal | null;
  nota: string;
}

/** De qué tabla de UDrive y de qué columnas sale un indicador (sos_vinculos; uno por indicador). */
export interface VinculoSos {
  id: string;
  indicador_id: string;
  archivo_id: string;
  col_valor: string;
  col_periodo: string;
  col_campus: string | null;
  filtro_col: string | null;
  filtro_valor: string | null;
}

/** Lo que la pantalla manda al guardar un vínculo (sin id). */
export type VinculoSosEntrada = Omit<VinculoSos, "id">;

export type SeccionSos = "panorama" | "tendencia" | "composicion" | "territorio" | "detalle";

/** Una gráfica marcada (o desmarcada) para el portal (sos_publicaciones). */
export interface PublicacionSos {
  archivo_id: string;
  seccion: SeccionSos;
  orden: number;
  publicado: boolean;
  por: string | null;
  en: string;
}

/** Un punto de la serie agregada. `campus` nulo es la cifra institucional («Todos»). */
export interface PuntoSerieSos {
  campus: string | null;
  anio: number;
  periodo: string | null;
  valor: number;
}

/** Un indicador publicado tal como lo entrega sos_cifras_publicas(). */
export interface CifraPublicaSos {
  id: string;
  ods: number;
  nombre: string;
  unidad: string;
  mejor: MejorSos;
  meta: number | null;
  tarjeta: TarjetaPortal | null;
  decimales: number;
  nota: string;
  resumen: ResumenSos;
  /** Nombre del archivo de UDrive del que sale. */
  fuente: string;
  serie: PuntoSerieSos[];
}

/** Una gráfica publicada tal como la entrega sos_graficas_publicas(): config mínima y solo sus columnas. */
export interface GraficaPublicaSos {
  id: string;
  nombre: string;
  seccion: SeccionSos;
  orden: number;
  fuente: string;
  actualizado: string;
  config: Partial<import("../udrive/tipos").ConfigGrafica>;
  columnas: { clave: string; etiqueta: string; tipo: string }[];
  filas: Record<string, string | number | null>[];
}

/** Lo que la vista previa del portal necesita de un indicador calculado en el cliente. */
export interface IndicadorCalculado {
  /** Serie del campus pedido, por año. */
  serie: PuntoSerieSos[];
  actual: PuntoSerieSos | null;
  previo: PuntoSerieSos | null;
  meta: number | null;
  /** Cambio porcentual frente al año previo; nulo si no hay previo o es cero. */
  cambioPct: number | null;
  /** ¿El cambio es para bien según `mejor`? Nulo si no hay cambio. */
  mejora: boolean | null;
  /** Avance hacia la meta (0 a 1+) si hay meta y valor. */
  avanceMeta: number | null;
  /** Lo que el RPC omitiría o rechazaría (columna inexistente, no numérica, sensible…). */
  avisos: string[];
}
