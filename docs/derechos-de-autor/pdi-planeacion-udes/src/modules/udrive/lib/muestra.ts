/* =============================================================================
   UDrive · un informe de muestra para ver un estilo (0190), sin React.

   El editor de estilos dibuja este informe con las mismas piezas y el mismo
   paginado que un informe de verdad, así lo que se ve al cambiar un control es
   lo que saldrá impreso. Los datos son de ejemplo y se dicen de ejemplo en el
   propio texto: ninguna cifra es real.
   ========================================================================== */

import type { Bloque, Documento, Fuente } from "./documento";
import type { ContenidoTabla } from "../tipos";
import type { Recursos } from "../salida/recursos";

export const ID_TABLA_MUESTRA = "muestra-tabla";

const fuente = (id: string, titulo: string, autores: string, anio: string, origen: string): Fuente => ({ id, tipo: "informe", autores, anio, titulo, origen, volumen: "", paginas: "", url: "" });

const PROGRAMAS: [string, number, number, number][] = [
  ["Administración de Empresas", 1204, 74, 78],
  ["Derecho", 1388, 81, 83],
  ["Enfermería", 902, 69, 73],
  ["Ingeniería de Sistemas", 1156, 63, 68],
  ["Psicología", 1047, 77, 76],
  ["Contaduría Pública", 715, 70, 75],
];

const col = (clave: string, etiqueta: string, tipo: "texto" | "numero", calor: ContenidoTabla["columnas"][number]["calor"] = null): ContenidoTabla["columnas"][number] => ({ clave, etiqueta, tipo, obligatorio: false, opciones: [], min: null, max: null, calor });

export const TABLA_MUESTRA: ContenidoTabla = {
  version: 1,
  columnas: [
    col("programa", "Programa", "texto"),
    col("matricula", "Matrícula 2025", "numero"),
    col("c21", "Cohorte 2021 (%)", "numero"),
    col("c23", "Cohorte 2023 (%)", "numero", [
      { hasta: 70, color: "#fbe3b0" },
      { hasta: 78, color: "#d4e8c8" },
      { hasta: null, color: "#a9d6ad" },
    ]),
  ],
  filas: PROGRAMAS.map((p, i) => ({ id: `f${i}`, datos: { programa: p[0], matricula: p[1], c21: p[2], c23: p[3] } })),
  presentacion: { titulo: "Permanencia al cuarto semestre por programa y cohorte", nota: "Datos ficticios de ejemplo. Promedio simple de los seis programas.", enIndice: true, repetirEncabezado: true },
  mapaCalor: true,
};

export function recursosDeMuestra(): Recursos {
  return {
    tablas: new Map([[ID_TABLA_MUESTRA, TABLA_MUESTRA]]),
    graficas: new Map(),
    imagenes: new Map(),
    nombres: new Map(),
    tamanos: new Map(),
    listo: true,
  };
}

export function documentoDeMuestra(): Documento {
  const b = (x: Bloque): Bloque => x;
  return {
    version: 1,
    plantilla: "blanco",
    portada: {
      titulo: "Permanencia estudiantil en pregrado",
      subtitulo: "Seguimiento de cohortes 2021 a 2025",
      entidad: "Universidad de Santander",
      anio: "2026",
      autor: "Equipo de analítica académica",
      afiliacion: "Universidad de Santander",
      fecha: "Octubre de 2026",
      nota: "Informe de ejemplo con datos ficticios",
    },
    indices: { contenido: true, ilustraciones: false, tablas: true, graficas: false },
    fuentes: [
      fuente("fa", "Seguimiento de cohortes de pregrado 2021-2025 [Conjunto de datos de ejemplo]", "Equipo de Analítica Académica", "2025", "Universidad de Santander"),
      fuente("fb", "Metodología de permanencia al cuarto semestre [Documento de ejemplo]", "Oficina de Planeación Institucional", "2026", "Universidad de Santander"),
    ],
    bloques: [
      b({ id: "m1", tipo: "capitulo", nivel: 1, titulo: "Permanencia por programa" }),
      b({ id: "m2", tipo: "parrafo", texto: "En 2025 el estudio siguió a 6.412 estudiantes de seis programas de pregrado. La permanencia al cuarto semestre de la cohorte 2023 fue de 75,5 % en promedio, 3,2 puntos más que la de la cohorte 2021 {{cita:fa}}. Cinco programas mejoraron y uno bajó." }),
      b({ id: "m3", tipo: "parrafo", texto: "Ingeniería de Sistemas tuvo el mayor aumento (5 puntos) y, aun así, sigue siendo el programa con menor permanencia. Psicología bajó un punto. Los datos de este ejemplo son ficticios." }),
      b({ id: "m4", tipo: "tabla", archivoId: ID_TABLA_MUESTRA, titulo: "", nota: "", enIndice: true, mapaCalor: true, repetirEncabezado: true }),
      b({ id: "m5", tipo: "capitulo", nivel: 2, titulo: "Lectura por programa" }),
      b({ id: "m6", tipo: "parrafo", texto: "La lectura por programa deja tres ideas para el siguiente periodo y una pregunta abierta sobre cómo se midió la permanencia {{cita:fb}}." }),
      b({ id: "m7", tipo: "lista", ordenada: false, items: ["La permanencia mejora donde hubo tutoría de primer semestre.", "Los programas con más horas de laboratorio retienen menos al cuarto semestre.", "La brecha entre el mejor y el peor programa bajó de 18 a 15 puntos.", "Psicología necesita una revisión propia."] }),
      b({ id: "m8", tipo: "destacado", texto: "Con la tutoría de primer semestre, la permanencia de Ingeniería de Sistemas subió 5 puntos entre las cohortes 2021 y 2023." }),
      b({ id: "m9", tipo: "nota", texto: "Los porcentajes son promedios simples y no se ponderan por matrícula. Datos de ejemplo." }),
      b({ id: "m10", tipo: "referencias", titulo: "Referencias" }),
    ],
    cierre: {
      mensaje: "Este informe resume la permanencia al cuarto semestre en seis programas. Las cifras son de ejemplo y sirven para ver cómo queda el diseño.",
      firmas: [
        { nombre: "Nombre de ejemplo", cargo: "Coordinación académica" },
        { nombre: "Otro nombre de ejemplo", cargo: "Analítica de datos" },
      ],
      creditos: "Elaboración: equipo de analítica académica. Revisión de cifras: Planeación Institucional.",
      correo: "informes@ejemplo.udes.edu.co",
      telefono: "",
      direccion: "Campus Lagos del Cacique, Bucaramanga",
      web: "",
      frase: "Datos para decidir con evidencia.",
      conCierre: true,
      conContraportada: true,
    },
  };
}
