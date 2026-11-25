// Datos FICTICIOS del módulo Informes Institucionales (nombres, cifras y textos inventados).
// papel: "admin" | "gestor" | "contribuyente" | "consulta"
const CICLO = "c-2026";
const ahora = "2026-11-23T10:00:00Z";

const U = (id, name, kind, code, parent_id = null) => ({ id, name, kind, code, parent_id });
export const UNIDADES = [
  U("u-ing", "Facultad de Ingeniería", "facultad", "FING"),
  U("u-sal", "Facultad de Ciencias de la Salud", "facultad", "FSAL"),
  U("u-der", "Facultad de Derecho", "facultad", "FDER"),
  U("u-eco", "Facultad de Ciencias Económicas", "facultad", "FECO"),
  U("u-edu", "Facultad de Educación", "facultad", "FEDU"),
  U("u-vac", "Vicerrectoría Académica", "vicerrectoria", "VAC"),
  U("u-vin", "Vicerrectoría de Investigación", "vicerrectoria", "VIN"),
  U("u-vex", "Vicerrectoría de Extensión", "vicerrectoria", "VEX"),
  U("u-vaf", "Vicerrectoría Administrativa y Financiera", "vicerrectoria", "VAF"),
  U("u-bib", "Oficina de Bibliotecas", "oficina", "BIB", "u-vac"),
  U("u-rcb", "Rectoría de Campus Bucaramanga", "rectoria", "RCB"),
  U("u-rcc", "Rectoría de Campus Cúcuta", "rectoria", "RCC"),
  U("u-rg", "Rectoría General", "rectoria", "RG"),
  U("p-ind", "Programa de Ingeniería Industrial", "programa", "PIND", "u-ing"),
  U("p-sis", "Programa de Ingeniería de Sistemas", "programa", "PSIS", "u-ing"),
];

const PILARES = [
  { id: "pl-1", numeral: "P1", name: "Formación personalizada" },
  { id: "pl-2", numeral: "P2", name: "Investigación con impacto" },
  { id: "pl-3", numeral: "P3", name: "Proyección e internacionalización" },
  { id: "pl-4", numeral: "P4", name: "Sostenibilidad institucional" },
];
const AVANCE = [{ pillar_id: "pl-1", progress: 78 }, { pillar_id: "pl-2", progress: 64 }, { pillar_id: "pl-3", progress: 52 }, { pillar_id: "pl-4", progress: 71 }];

const PERFILES = {
  admin: { id: "u-admin", email: "planeacion@ejemplo.edu.co", full_name: "Marcela Ejemplo Ortega", unit: "Dirección de Planeación", role: "admin" },
  gestor: { id: "u-gestor", email: "decano.ingenieria@ejemplo.edu.co", full_name: "Julián Ejemplo Barrera", unit: "Facultad de Ingeniería", role: "responsable" },
  contribuyente: { id: "u-contrib", email: "asistente.ingenieria@ejemplo.edu.co", full_name: "Lucía Ejemplo Montes", unit: "Facultad de Ingeniería", role: "responsable" },
  consulta: { id: "u-consulta", email: "consulta.ingenieria@ejemplo.edu.co", full_name: "Tomás Ejemplo Pardo", unit: "Facultad de Ingeniería", role: "consulta" },
};
PERFILES["gestor-listo"] = PERFILES.gestor;
const ROL_UNIDAD = { "gestor-listo": "jefe", gestor: "jefe", contribuyente: "editor", consulta: "visor" };

/* ---------- Informes (instancias) ---------- */
const I = (id, unit, plantilla, estado, extra = {}) => ({
  id, ciclo_id: CICLO, unit_id: unit, campus_id: null, plantilla, destino: null, estado, nota_revision: null,
  enviado_en: null, enviado_por: null, aprobado_en: null, aprobado_por: null, ...extra,
});
const NOTA = "§s4 · Falta explicar por qué bajó la retención de primer semestre y qué se hará.\n§s6 · Cada punto crítico necesita una acción con fecha.";
export const INSTANCIAS = [
  I("i-ing", "u-ing", "A", "draft"),
  I("i-sal", "u-sal", "A", "sent", { enviado_en: "2026-11-10T15:20:00Z", enviado_por: "u-sal-j" }),
  I("i-der", "u-der", "A", "ok", { enviado_en: "2026-11-05T09:00:00Z", aprobado_en: "2026-11-12T11:30:00Z" }),
  I("i-eco", "u-eco", "A", "back", { enviado_en: "2026-11-08T16:00:00Z", nota_revision: NOTA }),
  I("i-vac", "u-vac", "B", "draft"),
  I("i-vin", "u-vin", "B", "sent", { enviado_en: "2026-11-14T08:40:00Z" }),
  I("i-vex", "u-vex", "B", "ok", { enviado_en: "2026-11-03T10:00:00Z", aprobado_en: "2026-11-09T14:00:00Z" }),
  I("i-rcb", "u-rcb", "C", "draft"),
  I("i-bib", "u-bib", "X1", "sent", { enviado_en: "2026-11-16T13:00:00Z" }),
];

/* ---------- Cifras de la Facultad de Ingeniería ---------- */
const C = (clave, etiqueta, seccion, tipo, o = {}) => ({
  instancia_id: "i-ing", clave, etiqueta, seccion_clave: seccion, fuente_tipo: tipo, fuente_nombre: "", valor: null, unidad: "", meta: null, anterior: null,
  incluida: true, justificacion: "", propia: false, pilar: null, visto: null, foto_valor: null, foto_en: null, foto_fuente: null, consulta: null, ...o,
});
const cifrasDe = (inst, enviada = false) => [
  C("matric", "Matrícula total", "s4", "auto", { meta: 2900, anterior: 2765, visto: 2840, justificacion: "Subió por el programa nocturno de Sistemas." }),
  C("deser", "Deserción anual", "s4", "auto", { unidad: " %", meta: 8, anterior: 9.4, visto: 8.8 }),
  C("reten", "Retención de primer semestre", "s4", "auto", { unidad: " %", meta: 82, anterior: 79.5, visto: 80.2 }),
  C("tyt", "Saber PRO · promedio global", "s4", "auto", { meta: 160, anterior: 152, visto: 154 }),
  C("doc", "Profesores con doctorado", "s4", "auto", { unidad: " %", meta: 30, anterior: 24, visto: 26 }),
  C("eval", "Evaluación docente", "s4", "auto", { meta: 4.4, anterior: 4.2, visto: 4.3 }),
  C("rc", "Registros calificados vigentes", "s4", "auto", { meta: 14, anterior: 13, visto: 14 }),
  C("gru", "Grupos categorizados", "s4", "auto", { meta: 9, anterior: 7, visto: 8 }),
  C("sem", "Semilleros activos", "s4", "auto", { meta: 22, anterior: 18, visto: 20 }),
  C("con", "Convenios activos", "s4", "auto", { meta: 40, anterior: 33, visto: 35 }),
  C("ejec", "Ejecución presupuestal", "s4", "auto", { unidad: " %", meta: 95, anterior: 91, visto: 92 }),
  C("prop_lab", "Prácticas en laboratorios externos", "s4", "manual", { propia: true, valor: 64, unidad: "", meta: 70, anterior: 51, fuente_nombre: "Registro de la Coordinación de Prácticas", pilar: "pl-1", justificacion: "Se firmaron tres convenios con empresas de la región." }),
  C("prop_emp", "Egresados empleados a los 6 meses", "s4", "excel", { propia: true, valor: 83, unidad: " %", meta: 85, anterior: 78, fuente_nombre: "Encuesta de seguimiento a egresados 2026.xlsx", pilar: "pl-3" }),
].map((c) => ({ ...c, instancia_id: inst, ...(enviada && c.fuente_tipo === "auto" ? { foto_valor: c.visto, foto_en: "2026-11-10T15:20:00Z", foto_fuente: "UDES en Cifras" } : {}) }));

const VIVAS = {
  matric: [2851, "UDES en Cifras · matriculados · 2026"], deser: [8.6, "UDES en Cifras · SPADIES"], reten: [80.2, "UDES en Cifras · Permanencia"],
  tyt: [155, "UDES en Cifras · Saber PRO"], doc: [27, "UDES en Cifras · Profesorado"], eval: [4.3, "UDES en Cifras · Evaluación"],
  rc: [14, "UDES en Cifras · Oferta"], gru: [8, "UDES en Cifras · Minciencias"], sem: [21, "UDES en Cifras · Semilleros"],
  con: [35, "UDES en Cifras · Convenios"], ejec: [92, "Vicerrectoría Administrativa y Financiera"],
};

/* ---------- Secciones (texto con tokens [[clave]]) ---------- */
const S = (inst, clave, orden, contenido, listo) => ({ instancia_id: inst, clave, orden, contenido, listo });

const INDICADORES = (completo) => [
  { id: "q1", requerido: "req_1", criterio: "ens", nombre: "Estudiantes en prácticas profesionales", unidad: "", mayorMejor: true, actual: 64, anterior: 51, meta: 70, fuente: "Coordinación de Prácticas", nota: "Se firmaron tres convenios con empresas de la región.", pilar: "pl-1", evidencias: [1] },
  { id: "q2", requerido: "req_2", criterio: "ens", nombre: "Egresados vinculados laboralmente", unidad: " %", mayorMejor: true, actual: 83, anterior: 78, meta: 85, fuente: "Encuesta de seguimiento a egresados", nota: "La encuesta de 2026 llegó al 61 % de los egresados.", pilar: "pl-3" },
  { id: "i1", criterio: "ens", nombre: "Estudiantes con tutoría de pares", unidad: "", mayorMejor: true, actual: 420, anterior: 310, meta: 450, fuente: "Registro de la Coordinación de Tutorías", nota: "Se amplió el programa a primer y segundo semestre.", pilar: "pl-1", evidencias: [3] },
  { id: "i2", criterio: "inv", nombre: "Artículos en revistas indexadas", unidad: "", mayorMejor: true, actual: 38, anterior: 41, meta: 45, fuente: "CvLAC y Scopus", nota: "Bajó por la rotación de dos grupos; se reforzó el taller de escritura." },
  { id: "i3", criterio: "fin", nombre: "Ejecución del presupuesto de laboratorios", unidad: " %", mayorMejor: true, actual: 92, anterior: 88, meta: 95, fuente: "Vicerrectoría Administrativa y Financiera", nota: "Quedó pendiente la compra de un equipo importado." },
  { id: "i4", criterio: "ens", tipo: "accion", nombre: "Programa de nivelación en matemáticas", unidad: "", mayorMejor: true, actual: null, anterior: null, meta: null, fuente: "", nota: "", descripcion: "Curso corto previo al primer semestre para estudiantes con resultados bajos en la prueba diagnóstica.", avance_texto: "Se dictó en dos cohortes con 180 estudiantes.", finalizacion: "2027-I", proyeccion_texto: "Ampliar a tres cohortes.", proyeccion_num: null },
];

const seccionesIng = (inst, completo = false, nombre = "Facultad de Ingeniería") => [
  S(inst, "s1", 1, { texto: `Durante 2026 la ${nombre} llegó a [[matric]] estudiantes, con una retención de primer semestre de [[reten]] y [[doc]] de profesores con doctorado. Los [[gru]] grupos de investigación categorizados y los [[sem]] semilleros activos sostuvieron la producción académica, mientras que la ejecución presupuestal cerró en [[ejec]].\n\nEl año deja como reto principal reducir la deserción en los primeros semestres y consolidar la oferta nocturna de Sistemas.`, borrador_pilo: null }, true),
  S(inst, "s2", 2, { pilares: ["pl-1", "pl-3"], alineacion: [
    { pilar: "pl-1", aporte: "Las tutorías por pares y el acompañamiento temprano elevaron la retención a [[reten]].", acciones: [{ id: "a1", titulo: "Tutorías por pares", descripcion: "Estudiantes de últimos semestres acompañan a primíparos en matemáticas y programación.", bloques: [] }] },
    { pilar: "pl-3", aporte: "Se firmaron convenios de prácticas y doble titulación que suman [[con]] convenios activos.", acciones: [] },
  ] }, true),
  S(inst, "s3", 3, { metas: [{ meta: "Aumentar la matrícula total a 2.900 estudiantes", programado: 2900, alcanzado: 2851 }, { meta: "Llegar a 30 % de profesores con doctorado", programado: 30, alcanzado: 27 }, { meta: "Abrir dos laboratorios de prácticas compartidas", programado: 2, alcanzado: 1 }] }, true),
  S(inst, "s4", 4, { criterios_reporta: ["ens", "inv", "fin"], observaciones: { matric: "El crecimiento se explica por el ingreso nocturno de Sistemas." }, indicadores: INDICADORES(completo) }, false),
  S(inst, "s5", 5, {}, false),
  S(inst, "s6", 6, { filas: [["Gestión académica", "Deserción alta en primer semestre", "Ampliar tutorías por pares", "2027-I", "Dos monitorías de tiempo parcial"], ["Investigación", "Pocos productos de nuevo conocimiento", "Taller de escritura científica", "2027-I", "Sin recursos adicionales"]] }, true),
  S(inst, "s7", 7, { logros: [{ titulo: "Acreditación de alta calidad de Ingeniería Industrial", resultado: "El programa recibió la renovación de su acreditación por cuatro años.", anexo: 1 }, { titulo: "Laboratorio de automatización inaugurado", resultado: "Atiende a 320 estudiantes por semestre.", anexo: 2 }] }, true),
  S(inst, "s8", 8, {}, false),
  S(inst, "s9", 9, completo ? { texto: "La facultad cierra 2026 con una oferta consolidada, una permanencia en mejora y una agenda clara de investigación. Para 2027 se priorizan las tutorías por pares, la escritura científica y la apertura de laboratorios compartidos con la industria regional." } : { texto: "" }, false),
  S(inst, "s10", 10, {}, false),
  S(inst, "x1", 11, completo ? { bloques: [{ id: "b1", tipo: "texto", texto: "En 2026 el programa de Ingeniería Industrial recibió la renovación de su acreditación de alta calidad y el laboratorio de automatización fue reconocido por la red regional de universidades como práctica ejemplar de formación con la industria." }] } : {}, false),
];
const ANEXOS = (inst) => [
  { id: "an1", instancia_id: inst, n: 1, nombre: "Resolución de acreditación Ingeniería Industrial.pdf", tipo: "archivo", ruta: `u-ing/${inst}/res-acred.pdf`, descripcion: "Resolución de renovación de la acreditación", created_at: ahora },
  { id: "an2", instancia_id: inst, n: 2, nombre: "Acta de inauguración del laboratorio.pdf", tipo: "archivo", ruta: `u-ing/${inst}/acta-lab.pdf`, descripcion: "Acta firmada por la decanatura", created_at: ahora },
  { id: "an3", instancia_id: inst, n: 3, nombre: "Tablero de permanencia 2026", tipo: "url", ruta: "https://ejemplo.edu.co/permanencia-2026", descripcion: "Seguimiento semestral de la permanencia", created_at: ahora },
];

/* ---------- Estructuras propias (0279) ---------- */
const ESTRUCTURAS = [
  { plantilla: "X1", nombre: "Informe de oficina de apoyo", quien: "Oficina de apoyo", destino: "Vicerrectoría Académica", descripcion: "Para oficinas que sostienen servicios a la comunidad y no tienen programas.", base: "B", activa: true, created_at: ahora, updated_at: ahora,
    secciones: [{ titulo: "Resumen ejecutivo", tipo: "narr", extension: "1 a 3 párrafos", minimo: 25, borrador: true }, { titulo: "Alineación estratégica", tipo: "pdi" }, { titulo: "Servicios prestados", tipo: "filas", columnas: ["Servicio", "Usuarios", "Satisfacción"] }, { titulo: "Logros", tipo: "logros" }, { titulo: "Conclusiones", tipo: "narr", extension: "1 a 3 párrafos", minimo: 25 }, { titulo: "Anexos", tipo: "anexos" }] },
  { plantilla: "X2", nombre: "Informe de centro de investigación", quien: "Centro o instituto", destino: "Vicerrectoría de Investigación", descripcion: "Para centros e institutos adscritos.", base: null, activa: false, created_at: ahora, updated_at: ahora,
    secciones: [{ titulo: "Resumen ejecutivo", tipo: "narr", minimo: 25 }, { titulo: "Producción del año", tipo: "dim", dims: ["inv"] }, { titulo: "Anexos", tipo: "anexos" }] },
];

/* ---------- Requisitos y datos requeridos ---------- */
const CLAVES_A = ["matric", "deser", "reten", "tyt", "doc", "eval", "rc", "rct", "gru", "sem", "nuc", "con", "pext", "ejec"];
const COND = { matric: "justificar", deser: "justificar", reten: "justificar", tyt: "sugerido", doc: "sugerido", eval: "sugerido", rc: "justificar", rct: "no", gru: "sugerido", sem: "sugerido", nuc: "justificar", con: "sugerido", pext: "no", ejec: "justificar" };
const REQUISITOS = ["A", "B", "C", "D"].flatMap((p) => CLAVES_A.map((c) => ({ ciclo_id: CICLO, plantilla: p, clave: c, condicion: COND[c] })));
const REQ = (n, plantilla, dato, fuente_tipo, fuente_nombre, criterio, unidad, condicion) => ({
  id: `rq-${n}`, ciclo_id: CICLO, plantilla, clave: `req_${n}`, dato, fuente_tipo, fuente_nombre, criterio, unidad, mayor_mejor: true, condicion, orden: n,
});
const REQUERIDOS = [
  REQ(1, "A", "Estudiantes en prácticas profesionales", "manual", "Coordinación de Prácticas", "ens", "", "justificar"),
  REQ(2, "A", "Egresados vinculados laboralmente", "excel", "Encuesta de seguimiento a egresados", "ens", " %", "justificar"),
  REQ(3, "A", "Publicaciones indexadas del año", "auto", "UDES en Cifras · Producción", "inv", "", "sugerido"),
  REQ(4, "B", "Usuarios atendidos en servicios de la oficina", "manual", "Registro interno de la oficina", "ens", "", "justificar"),
  REQ(5, "B", "Satisfacción de usuarios", "manual", "Encuesta anual de servicios", "ens", " %", "sugerido"),
];
const CONFIG_SECCIONES = [
  { ciclo_id: CICLO, plantilla: "A", clave: "s5", activa: false, orden: null, titulo: null, editable_por_unidad: true, libre: false, minimo: null },
  { ciclo_id: CICLO, plantilla: "A", clave: "x1", activa: true, orden: 9, titulo: "Reconocimientos externos", editable_por_unidad: true, libre: true, minimo: 20 },
];
const CRITERIOS = [
  { id: "cr1", nombre: "Permanencia y graduación", descripcion: "Retención, deserción y graduación oportuna.", plantillas: ["A"], estado: "aprobado", vigente_desde: 2026, unit_id: null, propuesto_por: null, nota_revision: "", created_at: ahora },
  { id: "cr2", nombre: "Internacionalización del currículo", descripcion: "Cursos en segunda lengua y movilidad.", plantillas: [], estado: "aprobado", vigente_desde: 2026, unit_id: null, propuesto_por: null, nota_revision: "", created_at: ahora },
  { id: "cr3", nombre: "Egresados y empleabilidad", descripcion: "Seguimiento a egresados a seis meses.", plantillas: ["A"], estado: "propuesto", vigente_desde: null, unit_id: "u-ing", propuesto_por: "u-gestor", nota_revision: "", created_at: ahora },
];

/* ---------- Personas y responsables ---------- */
const PERSONAS = [
  { id: "u-gestor", nombre: "Julián Ejemplo Barrera", correo: "decano.ingenieria@ejemplo.edu.co" },
  { id: "u-contrib", nombre: "Lucía Ejemplo Montes", correo: "asistente.ingenieria@ejemplo.edu.co" },
  { id: "u-consulta", nombre: "Tomás Ejemplo Pardo", correo: "consulta.ingenieria@ejemplo.edu.co" },
  { id: "u-otra", nombre: "Paula Ejemplo Cifuentes", correo: "paula.cifuentes@ejemplo.edu.co" },
];
const RESPONSABLES = [
  { profile_id: "u-gestor", nombre: "Julián Ejemplo Barrera", correo: "decano.ingenieria@ejemplo.edu.co", rol: "jefe", asignado: true, asignado_en: "2026-09-02T12:00:00Z" },
  { profile_id: "u-contrib", nombre: "Lucía Ejemplo Montes", correo: "asistente.ingenieria@ejemplo.edu.co", rol: "editor", asignado: true, asignado_en: "2026-09-02T12:05:00Z" },
  { profile_id: "u-consulta", nombre: "Tomás Ejemplo Pardo", correo: "consulta.ingenieria@ejemplo.edu.co", rol: "visor", asignado: false, asignado_en: null },
];

const CORPUS = { total: 46, por_origen: { informe2025: 38, aprobados2026: 8 }, por_plantilla: { A: 24, B: 14, C: 5, D: 3 }, por_tipo: { narr: 30, logros: 10, dim: 6 }, perfiles: [
  { tipo: "narr", textos: 30, mediana_palabras: 180, aperturas: [{ texto: "Durante el año", veces: 9 }, { texto: "En 2025 la facultad", veces: 6 }], conectores: [{ texto: "por otra parte", veces: 7 }, { texto: "en consecuencia", veces: 5 }], frases: [{ texto: "se consolidó la oferta", veces: 4 }] },
  { tipo: "logros", textos: 10, mediana_palabras: 55, aperturas: [{ texto: "Se logró", veces: 5 }], conectores: [], frases: [{ texto: "con el respaldo de", veces: 3 }] },
] };

/* ---------- Pilo Astra (compilador): respuesta SSE simulada con el mismo formato que la función real ---------- */
const sse = (e, d) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const norma = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function redaccionAstra(D) {
  const ind = (s) => { const i = D.indicadores.find((x) => norma(x.nombre).includes(s)); return i && i.valor !== null && !i.conflicto ? `[[${i.clave}]]` : null; };
  const pend = (s) => { const i = D.indicadores.find((x) => norma(x.nombre).includes(s)); return i && (i.valor === null || i.conflicto) ? i.nombre : null; };
  const eq = D.equipos.map((e) => e.nombre);
  const titulo = norma(D.seccion.titulo);
  let texto;
  if (titulo.includes("resumen")) {
    texto = [
      `Durante ${D.anio} la ${D.unidad} consolidó su oferta académica con ${ind("matriculados") ?? "una matrícula por confirmar"} estudiantes matriculados y una retención de primer semestre de ${ind("retencion") ?? "valor pendiente"}, cifra que Secretaría académica, Dirección de programa y Bienestar universitario reportaron por separado y que se tomó de UDES en Cifras, fuente primaria del indicador.`,
      `La deserción anual bajó a ${ind("desercion") ?? "un valor pendiente"} y los profesores con doctorado llegaron a ${ind("doctorado") ?? "un valor pendiente"}. En investigación, la Coordinación de investigación reportó ${ind("grupos") ?? "sin dato"} grupos categorizados y ${ind("semilleros") ?? "sin dato"} semilleros activos.`,
      `Queda un dato pendiente: ${pend("riesgo") ?? "ninguno"}, que Bienestar universitario no había cerrado al recibir su libro.`,
    ].join("\n\n");
  } else if (titulo.includes("alineacion")) {
    texto = [
      `Las tutorías por pares y el acompañamiento temprano sostienen el pilar de formación personalizada: ${ind("tutoria") ?? "sin dato"} estudiantes participaron, según la Dirección de programa, y la retención de primer semestre llegó a ${ind("retencion") ?? "valor pendiente"}.`,
      `Bienestar universitario sumó ${ind("socioeconomico") ?? "sin dato"} estudiantes con apoyo socioeconómico, lo que respalda el mismo pilar desde la permanencia.`,
    ].join("\n\n");
  } else if (titulo.includes("resultados")) {
    texto = [
      `Enseñanza. La retención de primer semestre fue de ${ind("retencion") ?? "valor pendiente"}, frente a su meta anual. Los tres equipos que la reportaron no coincidieron: Dirección de programa escribió un valor distinto y se usó el de UDES en Cifras. La deserción anual fue de ${ind("desercion") ?? "valor pendiente"}.`,
      `- Estudiantes matriculados: ${ind("matriculados") ?? "sin dato"}.\n- Profesores con doctorado: ${ind("doctorado") ?? "sin dato"}.\n- Estudiantes con tutoría de pares: ${ind("tutoria") ?? "sin dato"}.`,
      `Investigación. Los grupos categorizados llegaron a ${ind("grupos") ?? "sin dato"} y los semilleros activos a ${ind("semilleros") ?? "sin dato"}, según la Coordinación de investigación.`,
    ].join("\n\n");
  } else {
    texto = [
      `${D.unidad} cierra ${D.anio} con una permanencia en mejora, con una retención de primer semestre de ${ind("retencion") ?? "valor pendiente"} y una deserción anual de ${ind("desercion") ?? "valor pendiente"}.`,
      `Para el siguiente ciclo queda por cerrar el dato de estudiantes en riesgo atendidos y por acordar entre los equipos una sola forma de escribir cada indicador.`,
    ].join("\n\n");
  }
  const usados = [...texto.matchAll(/\[\[([a-z0-9_]+)\]\]/g)].map((m) => m[1]);
  const palabras = texto.trim().split(/\s+/).length;
  return (
    sse("step", { id: "leer", label: `Leyendo ${D.indicadores.length} indicadores y ${D.hojas.length} hojas de ${eq.length} equipos` }) +
    sse("step", { id: "razonar", label: `Razonando «${D.seccion.titulo}»` }) +
    sse("thinking", { text: `Reviso cada indicador de «${D.seccion.titulo}»: primero los que tienen valor, luego los que están pendientes. La retención de primer semestre la reportaron tres equipos con valores distintos; la persona que gestiona el informe ya eligió el de la fuente primaria, así que la cito con su token. Los datos sin valor los dejo como pendientes, sin inventar cifras.\n` }) +
    sse("part", { n: 1, palabras }) +
    sse("step", { id: "listo", label: "Texto verificado" }) +
    sse("done", { seccion: D.seccion.clave, texto, partes: 1, palabras, usados, no_verificado: [], pensamiento_s: 7.4, reintento: false, modelo: { id: "astra", label: "Pilo Astra 1.0" } })
  );
}

export function fixtures(papelCompleto = "admin") {
  // «gestor:u-sal» = el mismo papel, pero en otra unidad (para ver informes enviados o devueltos).
  const [papel, unidadId = "u-ing"] = papelCompleto.split(":");
  const unidadNombre = UNIDADES.find((u) => u.id === unidadId)?.name ?? "Facultad de Ingeniería";
  const p = PERFILES[papel];
  const perfil = { ...p, unit: papel === "admin" ? p.unit : unidadNombre, access_role_id: null, is_active: true, created_at: "2025-01-01T00:00:00Z", updated_at: ahora };
  const miUnidad = papel === "admin" ? [] : [{ unit_id: unidadId, role: ROL_UNIDAD[papel], campus_id: null, profile_id: perfil.id, units: { name: unidadNombre, kind: "facultad" } }];
  // Estado en memoria por contexto: guardar una sección o una cifra la cambia aquí (sin base real).
  const secs = INSTANCIAS.flatMap((i) => seccionesIng(i.id, papel === "gestor-listo", UNIDADES.find((u) => u.id === i.unit_id)?.name).map((x, k) => ({ ...x, listo: i.id === "i-ing" ? x.listo : i.estado !== "draft" || k < 4 })));
  const cifs = INSTANCIAS.flatMap((i) => cifrasDe(i.id, i.estado === "sent" || i.estado === "ok"));
  if (papel === "gestor-listo") for (const c of cifs) if (["deser", "reten", "rc", "ejec", "nuc"].includes(c.clave) && !c.justificacion) c.justificacion = "Resultado explicado con el seguimiento semestral de la facultad.";
  const porInst = (f) => (sp) => {
    const m = /^eq\.(.*)$/.exec(sp.get("instancia_id") || "");
    const ids = m ? [m[1]] : /^in\.\((.*)\)$/.test(sp.get("instancia_id") || "") ? sp.get("instancia_id").slice(4, -1).split(",") : INSTANCIAS.map((i) => i.id);
    return ids.flatMap(f);
  };
  const tablas = {
    profiles: [perfil],
    unit_members: (sp) => (sp.get("select") || "").includes("units(kind)") ? miUnidad : miUnidad,
    int_miembros: [], pc_miembros: [], ds_miembros: [], cms_editores: [], imp_unit_functions: [], access_roles: [], access_role_reports: [],
    units: UNIDADES,
    campuses: [],
    program_campuses: [],
    pillars: PILARES,
    v_pillar_progress: AVANCE,
    informe_ciclos: [
      { id: CICLO, anio: 2026, nombre: "Informe de gestión 2026", fecha_limite: "2026-12-15", corte: "2026-12-31", estado: "abierto", config: { limite_propios: 3, exigir_fuente: true, exigir_pilar: false } },
      { id: "c-2025", anio: 2025, nombre: "Informe de gestión 2025", fecha_limite: "2025-12-12", corte: "2025-12-31", estado: "cerrado", config: { limite_propios: 3, exigir_fuente: false, exigir_pilar: false } },
    ],
    informe_requisitos: REQUISITOS,
    informe_instancias: INSTANCIAS,
    informe_secciones: porInst((id) => secs.filter((x) => x.instancia_id === id)),
    informe_cifras: porInst((id) => cifs.filter((x) => x.instancia_id === id)),
    informe_anexos: porInst((id) => (id === "i-ing" || id === "i-sal" ? ANEXOS(id) : [])),
    informe_fuentes: CLAVES_A.map((c) => ({ clave: c, nombre: c, tipo: "auto", consulta: {}, activa: true })),
    informe_estructuras: ESTRUCTURAS,
    informe_plantilla_unidades: [{ plantilla: "X1", unit_id: "u-bib" }, { plantilla: "X1", unit_id: "u-vex" }],
    informe_secciones_config: CONFIG_SECCIONES,
    informe_datos_requeridos: REQUERIDOS,
    informe_criterios: CRITERIOS,
    informe_revisiones: [{ id: "rv1", instancia_id: "i-eco", seccion_clave: "s4", decision: "devuelto", nota: "Falta explicar por qué bajó la retención de primer semestre y qué se hará.", por: "u-admin", en: "2026-11-12T09:00:00Z" }, { id: "rv2", instancia_id: "i-eco", seccion_clave: "s6", decision: "devuelto", nota: "Cada punto crítico necesita una acción con fecha.", por: "u-admin", en: "2026-11-12T09:01:00Z" }],
    informe_perfiles: [{ unit_id: "u-ing", monograma: "FI", acento: "#1f6f5c", logo_ruta: "", contacto: { direccion: "Campus Bucaramanga, bloque de Ingeniería", correo: "ingenieria@ejemplo.edu.co", telefono: "(607) 555 0100" }, pie: "Facultad de Ingeniería · Informe de gestión 2026" }],
    informe_diseno: [],
    informe_presentaciones: globalThis.__presentacionEjemplo
      ? [{ id: "pr1", instancia_id: "i-ing", tono: globalThis.__presentacionEjemplo.tono ?? "institucional", titulo: globalThis.__presentacionEjemplo.titulo ?? "Informe de gestión 2026", creado_por: "u-gestor", creado_en: "2026-11-20T10:00:00Z", pensamiento_s: 18, contenido: globalThis.__presentacionEjemplo }]
      : [],
    od_indicators: [], pilo_alerts: [], user_tours: [],
  };
  const rpc = {
    imp_my_role_scope: [], pub_estado: {}, pilo_ai_public_config: {},
    informe_mis_unidades: [],
    informe_mis_destinos: [],
    informe_cifras_vivas: (a) => (a.p_instancia === "i-ing" || INSTANCIAS.some((i) => i.id === a.p_instancia) ? Object.entries(VIVAS).map(([clave, [valor, fuente]]) => ({ clave, valor, fuente, corte: "2026-10-31" })) : []),
    informe_responsables: (a) => (a.p_unit === "u-ing" ? RESPONSABLES : a.p_unit === "u-sal" ? RESPONSABLES.slice(0, 1) : []),
    informe_buscar_personas: (a) => PERSONAS.filter((x) => (x.nombre + x.correo).toLowerCase().includes(String(a.p_q || "").toLowerCase())),
    informe_resumen_gestion: null,
    informe_guardar_seccion: (a) => {
      const i = secs.findIndex((x) => x.instancia_id === a.p_instancia && x.clave === a.p_clave);
      const fila = { instancia_id: a.p_instancia, clave: a.p_clave, orden: i >= 0 ? secs[i].orden : 99, contenido: a.p_contenido, listo: a.p_listo };
      if (i >= 0) secs[i] = fila; else secs.push(fila);
      return fila;
    },
    informe_guardar_cifra: (a) => {
      const i = cifs.findIndex((x) => x.instancia_id === a.p_instancia && x.clave === a.p_clave);
      const fila = { ...(i >= 0 ? cifs[i] : C(a.p_clave, a.p_clave, null, "auto", { instancia_id: a.p_instancia })), ...a.p_datos, instancia_id: a.p_instancia, clave: a.p_clave };
      if (i >= 0) cifs[i] = fila; else cifs.push(fila);
      return fila;
    }, informe_enviar: {}, informe_cambiar_estado: {}, informe_abrir: "i-nuevo",
    informe_metas_sincronizar: 0,
  };
  // Compilador de colaboradores: los libros recibidos viven en memoria y se devuelven tal cual (escribir: POST/DELETE).
  const librosCompilador = [];
  tablas.informe_compilacion_libros = () => librosCompilador;
  tablas.informe_compilacion = [];
  const escribir = {
    informe_compilacion_libros: (metodo, cuerpo, sp) => {
      if (metodo === "POST") { const f = { id: `lb${librosCompilador.length + 1}`, creado_en: ahora, ...cuerpo }; librosCompilador.push(f); return [{ id: f.id }]; }
      if (metodo === "DELETE") { const m = /^eq\.(.*)$/.exec(sp.get("id") || ""); const i = librosCompilador.findIndex((x) => x.id === (m && m[1])); if (i >= 0) librosCompilador.splice(i, 1); }
      return [];
    },
  };
  const funciones = {
    "pilo-compilador": (a) => ({ __sse: redaccionAstra(a.datos) }),
    "pilo-informes": (a) => (a.action === "corpus" ? CORPUS : a.action === "redactar" ? { texto: "Durante 2026 la facultad consolidó su oferta y mejoró la permanencia.", usadas: [{ clave: "matric", etiqueta: "Matrícula total" }], avisos: [] } : {}),
    "informe-plan": { acciones: [] },
  };
  return { papel: papelCompleto, perfil, tablas, rpc, funciones, escribir };
}
export { PILARES, UNIDADES as UNIDADES_FX, INSTANCIAS as INSTANCIAS_FX, CICLO };
