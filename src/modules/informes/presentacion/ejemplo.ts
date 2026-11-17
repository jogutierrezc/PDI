/* Datos de ejemplo (ficticios) para pruebas, capturas y la demostración del visor: un informe con la forma
   de `entradaLibro` (solo lo que Pilo lee) y una presentación con los 11 tipos de diapositiva, cuyas cifras
   y enlaces están todas en ese informe. */

import type { Presentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";

const U = "Facultad de Ingenierías";

export const informeEjemplo = {
  unidad: U,
  anio: "2026",
  secciones: [
    {
      titulo: "Alineación estratégica",
      tipo: "pdi",
      texto: `${U} aporta a 3 pilares del Plan de Desarrollo.`,
      alineacion: [
        { pilar: "1. Excelencia académica", avance: "68 %", aporte: "Actualización de 4 programas de pregrado.", acciones: [{ titulo: "Currículos actualizados", descripcion: "Se ajustaron los planes de estudio." }] },
        { pilar: "2. Investigación e innovación", avance: "55 %", aporte: "Consolidación de 6 grupos de investigación.", acciones: [] },
        { pilar: "3. Proyección social", avance: "61 %", aporte: "Más proyectos con la comunidad.", acciones: [] },
      ],
    },
    {
      titulo: "Objetivos y metas",
      tipo: "metas",
      plan: [
        { dimension: "Docencia", accion: "Actualizar los currículos de pregrado", meta: "4 programas actualizados", responsable: "Decanatura", fecha: "2026-11-30" },
        { dimension: "Docencia", accion: "Fortalecer la permanencia estudiantil", meta: "Permanencia de 85 %", responsable: "Bienestar", fecha: "2026-12-15" },
        { dimension: "Docencia", accion: "Cualificar al profesorado", meta: "30 docentes formados", responsable: "Decanatura", fecha: "2026-10-31" },
        { dimension: "Investigación", accion: "Publicar en revistas indexadas", meta: "12 artículos", responsable: "Investigación", fecha: "2026-12-01" },
        { dimension: "Investigación", accion: "Presentar proyectos a convocatorias", meta: "5 proyectos", responsable: "Investigación", fecha: "2026-09-30" },
        { dimension: "Extensión", accion: "Ejecutar proyectos de proyección social", meta: "8 proyectos", responsable: "Extensión", fecha: "2026-11-15" },
      ],
    },
    {
      titulo: "Resultados por dimensión",
      tipo: "dim",
      dimensiones: [
        { titulo: "Docencia y currículo", filas: [{ etiqueta: "Tasa de permanencia", valor: "84,2 %", meta: "85 %", estado: "cerca" }, { etiqueta: "Docentes con maestría o doctorado", valor: "72 %", meta: "70 %" }] },
        { titulo: "Investigación", filas: [{ etiqueta: "Artículos publicados", valor: "9", meta: "12" }] },
        { titulo: "Extensión y proyección", filas: [{ etiqueta: "Proyectos de proyección social", valor: "5", meta: "8" }] },
      ],
    },
    {
      titulo: "Síntesis de resultados institucionales",
      tipo: "matriz",
      sintesis: {
        plan: {
          total: 12,
          completadas: 5,
          enProceso: 5,
          pendientes: 2,
          avance: 63,
          dimensiones: [
            { nombre: "Docencia y currículo", total: 5, completadas: 2, enProceso: 2, pendientes: 1 },
            { nombre: "Investigación", total: 4, completadas: 2, enProceso: 1, pendientes: 1 },
            { nombre: "Extensión y proyección", total: 3, completadas: 1, enProceso: 2, pendientes: 0 },
          ],
        },
      },
    },
    {
      titulo: "Logros",
      tipo: "logros",
      logros: [
        { titulo: "Cuatro currículos actualizados", resultado: "Se aprobaron los planes de estudio de 4 programas de pregrado.", anexo: 2 },
        { titulo: "Más docentes formados", resultado: "30 docentes completaron el plan de cualificación.", anexo: 4 },
        { titulo: "Proyectos con la comunidad", resultado: "5 proyectos de proyección social en ejecución.", anexo: 5 },
      ],
    },
    {
      titulo: "Evidencias y anexos",
      tipo: "evid",
      anexos: [
        { n: 1, nombre: "Acta del consejo de facultad", descripcion: "Aprobación del plan de trabajo", enlace: "" },
        { n: 2, nombre: "Resolución de currículos", descripcion: "Actualización de 4 programas", enlace: "" },
        { n: 3, nombre: "Informe de permanencia", descripcion: "Seguimiento semestral", enlace: "" },
        { n: 4, nombre: "Registro de formación docente", descripcion: "30 docentes", enlace: "" },
        { n: 5, nombre: "Matriz de proyectos de extensión", descripcion: "Proyectos en ejecución", enlace: "" },
      ],
      evidenciasPlan: [{ origen: "Acción: Actualizar los currículos de pregrado", url: "https://evidencias.example.org/curriculos-2026" }],
      fuente: "UDES en Cifras · corte 31 dic 2025",
    },
  ],
};

export const presentacionEjemplo: Presentacion = {
  titulo: `Informe de gestión 2026 · ${U}`,
  tono: "institucional",
  diapositivas: [
    { tipo: "portada", etiqueta: "Presentación armada por Pilo", titulo: "Informe de gestión 2026", subtitulo: `${U} · Universidad de Santander`, notas: "Presentamos el informe de gestión 2026 de la facultad." },
    {
      tipo: "agenda",
      animo: "feliz",
      titulo: "Lo que veremos",
      items: [
        { titulo: "Alineación estratégica", detalle: "Pilares del Plan de Desarrollo a los que aporta la facultad" },
        { titulo: "Objetivos y metas", detalle: "Acciones del plan de trabajo con responsable y fecha" },
        { titulo: "Resultados por dimensión", detalle: "Avances y lo que los respalda" },
        { titulo: "Síntesis de cumplimiento", detalle: "Acciones completadas, en proceso y pendientes" },
        { titulo: "Logros y evidencias", detalle: "Lo más destacado del año, con su respaldo" },
      ],
    },
    { tipo: "seccion", animo: "idea", numero: "01", kicker: "01 · Alineación estratégica", titulo: "Cómo aporta la facultad al Plan de Desarrollo", bajada: `${U} reporta su avance frente a 3 pilares del plan.` },
    {
      tipo: "tarjetas",
      titulo: "Pilares del Plan",
      intro: "Avance de cada pilar al que aporta la facultad.",
      tarjetas: [
        { titulo: "Excelencia académica", cifra: "68 %", texto: "Actualización de 4 programas de pregrado." },
        { titulo: "Investigación e innovación", cifra: "55 %", texto: "Consolidación de 6 grupos de investigación." },
        { titulo: "Proyección social", cifra: "61 %", texto: "Más proyectos con la comunidad." },
      ],
    },
    {
      tipo: "tabla",
      titulo: "Objetivos y metas",
      intro: "Las acciones del plan de trabajo, con su meta y su responsable.",
      columnas: ["Acción", "Meta", "Responsable", "Fecha límite"],
      filas: [
        ["Actualizar los currículos de pregrado", "4 programas actualizados", "Decanatura", "30 nov 2026"],
        ["Fortalecer la permanencia estudiantil", "Permanencia de 85 %", "Bienestar", "15 dic 2026"],
        ["Cualificar al profesorado", "30 docentes formados", "Decanatura", "31 oct 2026"],
        ["Publicar en revistas indexadas", "12 artículos", "Investigación", "1 dic 2026"],
        ["Presentar proyectos a convocatorias", "5 proyectos", "Investigación", "30 sep 2026"],
        ["Ejecutar proyectos de proyección social", "8 proyectos", "Extensión", "15 nov 2026"],
      ],
      nota: "Fuente: plan de trabajo de la facultad.",
    },
    {
      tipo: "cifras",
      animo: "piensa",
      titulo: "Resultados por dimensión",
      intro: "Lo que reportó la facultad frente a su meta.",
      cifras: [
        { valor: "84,2 %", etiqueta: "Tasa de permanencia", detalle: "Meta: 85 %" },
        { valor: "72 %", etiqueta: "Docentes con maestría o doctorado", detalle: "Meta: 70 %" },
        { valor: "9", etiqueta: "Artículos publicados", detalle: "Meta: 12" },
        { valor: "5", etiqueta: "Proyectos de proyección social", detalle: "Meta: 8" },
      ],
    },
    {
      tipo: "cumplimiento",
      titulo: "Síntesis de resultados",
      filas: [
        { dimension: "Docencia y currículo", completadas: 2, en_proceso: 2, pendientes: 1 },
        { dimension: "Investigación", completadas: 2, en_proceso: 1, pendientes: 1 },
        { dimension: "Extensión y proyección", completadas: 1, en_proceso: 2, pendientes: 0 },
      ],
      resumen: [
        { valor: "12", etiqueta: "acciones en el plan de trabajo" },
        { valor: "63 %", etiqueta: "avance promedio del plan" },
      ],
      nota: "Cumplimiento por dimensión según el plan de trabajo.",
    },
    {
      tipo: "logros",
      animo: "excelente",
      titulo: "Logros",
      intro: "Lo más destacado del año, cada uno con su evidencia.",
      logros: [
        { titulo: "Cuatro currículos actualizados", resultado: "Se aprobaron los planes de estudio de 4 programas de pregrado.", evidencia: "Anexo 2" },
        { titulo: "Más docentes formados", resultado: "30 docentes completaron el plan de cualificación.", evidencia: "Anexo 4" },
        { titulo: "Proyectos con la comunidad", resultado: "5 proyectos de proyección social en ejecución.", evidencia: "Anexo 5" },
      ],
    },
    {
      tipo: "evidencias",
      titulo: "Evidencias y fuentes",
      anexos: [
        { n: "1", documento: "Acta del consejo de facultad", descripcion: "Aprobación del plan de trabajo" },
        { n: "2", documento: "Resolución de currículos", descripcion: "Actualización de 4 programas" },
        { n: "3", documento: "Informe de permanencia", descripcion: "Seguimiento semestral" },
        { n: "4", documento: "Registro de formación docente", descripcion: "30 docentes" },
        { n: "5", documento: "Matriz de proyectos de extensión", descripcion: "Proyectos en ejecución" },
      ],
      fuentes: ["UDES en Cifras · corte 31 dic 2025", "Plan de trabajo de la facultad", "Plan de Desarrollo · avance por pilar"],
      enlaces: [{ texto: "Currículos 2026", url: "https://evidencias.example.org/curriculos-2026" }],
    },
    {
      tipo: "texto",
      animo: "piensa",
      eyebrow: "Para decidir",
      titulo: "Lo que sigue pendiente",
      puntos: ["Dos acciones del plan aún no inician.", "El responsable y la fecha de cada una están por completar: [por completar].", "La meta de permanencia está a menos de 1 punto."],
    },
    { tipo: "cierre", titulo: "Gracias", contacto: "[por completar]" },
  ],
};
