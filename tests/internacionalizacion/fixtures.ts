/* Datos de prueba de las pantallas de Internacionalización (solo pruebas). */

import type { CifrasRpc } from "../../src/modules/internacionalizacion/lib/cifras";
import type {
  Campus,
  IntConceptoRow,
  IntEnvioRow,
  IntFilaRow,
  IntPeriodoRow,
  IntVentanaRow,
  LibroCompleto,
  Yo,
} from "../../src/modules/internacionalizacion/tipos";
import type { Miembro } from "../../src/modules/internacionalizacion/datos";
import { CONCEPTOS_BASE } from "../../src/modules/internacionalizacion/lib/conceptos";

export const CAMPUS: Campus[] = [
  { id: "c-vup", slug: "valledupar", code: "VUP", name: "Valledupar" },
  { id: "c-bga", slug: "bucaramanga", code: "BGA", name: "Bucaramanga" },
  { id: "c-cuc", slug: "cucuta", code: "CUC", name: "Cúcuta" },
  { id: "c-bog", slug: "bogota", code: "BOG", name: "Bogotá" },
];

export const YO = {
  director: { director: true, coordinador: [], gestor: [] } as Yo,
  coordinador: { director: false, coordinador: ["c-cuc"], gestor: [] } as Yo,
  gestor: { director: false, coordinador: [], gestor: ["c-bga"] } as Yo,
};

export const PERIODOS: IntPeriodoRow[] = [
  { id: "p-2", codigo: "2026-2", nombre: "Periodo 2026-2", abre: "2026-08-01", cierra: "2026-12-15", estado: "abierto" },
  { id: "p-1", codigo: "2026-1", nombre: "Periodo 2026-1", abre: "2026-02-01", cierra: "2026-06-30", estado: "cerrado" },
];

export const CONCEPTOS: IntConceptoRow[] = CONCEPTOS_BASE.map((c, i) => ({
  id: c.id,
  nombre: c.nombre,
  tipo: c.tipo,
  opciones: [...(c.opciones ?? [])],
  sinonimos: [...(c.sinonimos ?? [])],
  descripcion: "",
  implicito: Boolean(c.implicito),
  personal: Boolean(c.personal),
  orden: i,
}));

const col = (hoja: string, clave: string, etiqueta: string, tipo: IntConceptoRow["tipo"], orden: number, extra: Partial<LibroCompleto["hojas"][number]["columnas"][number]> = {}) => ({
  id: `${hoja}-${clave}`,
  hoja_id: hoja,
  clave,
  etiqueta,
  tipo,
  concepto_id: clave.startsWith("propio_") ? null : clave,
  obligatorio: false,
  opciones: [] as string[],
  calculo: null,
  orden,
  ...extra,
});

export const ESTRUCTURA: LibroCompleto[] = [
  {
    id: "l-mov",
    nombre: "Movilidad estudiantil",
    descripcion: "",
    captura: "campus",
    orden: 1,
    carpeta_id: null,
    plantilla_contactos: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    hojas: [
      {
        id: "h-sal",
        libro_id: "l-mov",
        nombre: "Saliente",
        clase: "movilidad",
        sentido: "saliente",
        orden: 1,
        columnas: [
          col("h-sal", "programa", "Programa académico", "texto", 1),
          col("h-sal", "numero_documento", "Número de documento", "texto", 2, { obligatorio: true }),
          col("h-sal", "pais_contraparte", "País de la contraparte", "texto", 3),
          col("h-sal", "fecha_inicio", "Fecha de inicio", "fecha", 4, { obligatorio: true }),
          col("h-sal", "fecha_fin", "Fecha de fin", "fecha", 5),
          col("h-sal", "duracion_dias", "Duración (días)", "calculado", 6, { calculo: { tipo: "dias_entre", desde: "fecha_inicio", hasta: "fecha_fin" } }),
        ],
      },
      { id: "h-ent", libro_id: "l-mov", nombre: "Entrante", clase: "movilidad", sentido: "entrante", orden: 2, columnas: [col("h-ent", "nacionalidad", "Nacionalidad", "texto", 1)] },
    ],
  },
  {
    id: "l-conv",
    nombre: "Convenios",
    descripcion: "",
    captura: "oficina",
    orden: 2,
    carpeta_id: null,
    plantilla_contactos: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    hojas: [{ id: "h-conv", libro_id: "l-conv", nombre: "Vigentes", clase: "convenio", sentido: null, orden: 1, columnas: [col("h-conv", "institucion_contraparte", "Institución", "texto", 1)] }],
  },
];

export const VENTANAS: IntVentanaRow[] = [
  { id: "v1", periodo_id: "p-2", hoja_id: "h-sal", campus_id: null, abre: "2026-08-03", cierra: "2026-12-30" },
  { id: "v2", periodo_id: "p-2", hoja_id: "h-sal", campus_id: "c-cuc", abre: "2026-08-03", cierra: "2026-09-30" },
  { id: "v3", periodo_id: "p-2", hoja_id: "h-conv", campus_id: null, abre: "2026-08-03", cierra: "2026-09-30" },
];

const envio = (hoja: string, campus: string, estado: IntEnvioRow["estado"]): IntEnvioRow => ({
  periodo_id: "p-2",
  hoja_id: hoja,
  campus_id: campus,
  estado,
  nota: "",
  enviado_en: null,
  validado_en: null,
  aprobado_en: null,
  updated_by: null,
  updated_at: "2026-10-01T00:00:00Z",
});

export const ENVIOS: IntEnvioRow[] = [envio("h-sal", "c-bga", "aprobado"), envio("h-sal", "c-cuc", "enviado"), envio("h-sal", "c-vup", "validado"), envio("h-ent", "c-bga", "enviado")];

export const FILAS: IntFilaRow[] = [
  {
    id: "f1",
    hoja_id: "h-sal",
    periodo_id: "p-2",
    campus_id: "c-bga",
    datos: { programa: "Ingeniería de Sistemas", numero_documento: "1098765432", pais_contraparte: "México", fecha_inicio: "2026-08-17", fecha_fin: "2026-12-11", duracion_dias: 116 },
    orden: 1,
    origen: "manual",
    archivo: null,
    aportante_id: null,
    canal: "interno",
    created_by: null,
    updated_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "f2",
    hoja_id: "h-sal",
    periodo_id: "p-2",
    campus_id: "c-cuc",
    datos: { programa: "Derecho", numero_documento: "1090123456", pais_contraparte: "Chile", fecha_inicio: "2026-09-14", fecha_fin: "2026-09-01", duracion_dias: null },
    orden: 1,
    origen: "excel",
    archivo: "visitantes_cuc.xlsx",
    aportante_id: null,
    canal: "interno",
    created_by: null,
    updated_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

export const CIFRAS: CifrasRpc = {
  periodo: "p-2",
  incluye: ["aprobado"],
  referencia: "2026-10-14",
  por_hoja: [],
  movilidad: [
    { campus_id: "c-bga", sentido: "saliente", total: 12 },
    { campus_id: "c-bga", sentido: "entrante", total: 4 },
    { campus_id: "c-cuc", sentido: "saliente", total: 7 },
    { campus_id: "c-bog", sentido: "entrante", total: 3 },
  ],
  por_pais: [
    { pais: "México", sentido: "saliente", total: 8 },
    { pais: "España", sentido: "saliente", total: 6 },
    { pais: "Alemania", sentido: "entrante", total: 4 },
  ],
  personas: [
    { campus_id: "c-bga", total: 15 },
    { campus_id: "c-cuc", total: 7 },
  ],
  convenios_vigentes: [{ campus_id: "c-bga", total: 9 }],
  avance: [
    { campus_id: "c-bga", hoja_id: "h-sal", estado: "aprobado", filas: 12 },
    { campus_id: "c-cuc", hoja_id: "h-sal", estado: "enviado", filas: 7 },
    { campus_id: "c-vup", hoja_id: "h-sal", estado: "validado", filas: 2 },
    { campus_id: "c-bog", hoja_id: "h-sal", estado: "borrador", filas: 0 },
    { campus_id: "c-bga", hoja_id: "h-ent", estado: "enviado", filas: 4 },
  ],
};

export const MIEMBROS: Miembro[] = [
  { id: "m1", user_id: "u1", rol: "director", campus_id: null, created_at: "", nombre: "Directora de prueba", email: "directora@udes.edu.co" },
  { id: "m2", user_id: "u2", rol: "coordinador", campus_id: "c-cuc", created_at: "", nombre: "Coordinador de prueba", email: "coord@udes.edu.co" },
  { id: "m3", user_id: "u3", rol: "gestor", campus_id: "c-bga", created_at: "", nombre: "Gestora de prueba", email: "gestora@udes.edu.co" },
];
