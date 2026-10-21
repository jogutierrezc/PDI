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
