/* =============================================================================
   Programas en Cifras · catálogo de destinos (lo que piden el CNA y el SNIES).

   Un DESTINO es un cuadro del Cuadro Maestro del CNA (01–09 de Programas y 10
   de Salud, tomados de «CNA - Cuadros Maestros/*.xlsx») o una plantilla del
   SNIES (las de src/modules/reportes/snies/plantillas, que no se copian: se
   derivan de ellas). Un archivo «responde» a un destino con un MAPA
   {clave de la columna del destino → clave de la columna del archivo}.

   Este archivo es el espejo de la semilla de pc_destinos / pc_destino_columnas
   / pc_dominios de la migración 0164 (la prueba de base de datos comprueba que
   coinciden; el SQL de la semilla se genera desde aquí). En la pantalla se usa
   lo que devuelve la base; esto sirve de respaldo, para las pruebas y para
   proponer el emparejamiento sin viaje a la red.
   ========================================================================== */

import { normalizar } from "../../internacionalizacion/lib/conceptos";
import { DOMINIOS as DOMINIOS_SNIES } from "../../reportes/snies/dominios";
import { PLANTILLAS } from "../../reportes/snies/plantillas";
import type { Campo } from "../../reportes/tipos";
import type { ColumnaDestino, Columna, DestinoLocal, DominioLocal, PcMapa, PcTipo } from "../tipos";

/* ---------- dominios ------------------------------------------------------------ */

const dom = (id: string, nombre: string, opciones: string[], numerado = true): DominioLocal => ({ id, nombre, opciones, numerado });

/** Listas del libro «Menú» de los cuadros maestros. El CNA las numera («1. Doctorado»); aquí van sin número y al emitir se antepone la posición. */
export const DOMINIOS_CNA: DominioLocal[] = [
  dom("si_no", "Sí / No", ["Sí", "No"], false),
  dom("nivel_formacion", "Nivel de formación", ["Doctorado", "Maestría", "Especialización Univ.", "Profesional Univ.", "Tecnólogo", "Técnico Profesional"]),
  dom("reconocimiento_minciencias", "Reconocimiento MinCiencias", ["Emérito", "Senior", "Asociado", "Junior"]),
  dom("categoria_minciencias", "Categoría MinCiencias", ["A1", "A", "B", "C", "Reconocido", "No aplica"], false),
  dom("tipo_contratacion", "Tipo de contratación", ["Indefinido", "Fijo >= 10 meses", "Fijo < 10 meses"]),
  dom("tipo_dedicacion", "Tipo de dedicación contractual", ["Tiempo completo", "Medio tiempo", "Hora cátedra"]),
  dom("tipo_institucion", "Tipo de institución", ["Universidad", "Centro de investigación", "Empresa", "Gobierno", "ONG", "Otros"]),
  dom("ubicacion_institucion", "Ubicación de la institución", ["Local", "Regional", "Nacional", "Internacional"]),
  dom("fuente_financiacion", "Fuentes de financiación", ["Interna de la IES", "Externa nacional", "Externa internacional"]),
  dom("tipo_movilidad", "Tipo de movilidad asociada", [
    "Movilidad entrante presencial",
    "Movilidad entrante virtual",
    "Movilidad saliente presencial",
    "Movilidad saliente virtual",
    "No implicó movilidad",
  ]),
  dom("idioma_interaccion", "Idioma de la interacción", ["Español", "Inglés", "Francés", "Portugués", "Otro idioma"]),
  dom("resultados_profesores", "Resultados cooperación (profesores)", [
    "Docencia / Clases espejo / COIL",
    "Evaluación de tesis / proyecto",
    "Participación en evento / encuentro",
    "Desarrollo de proyecto",
    "Actividad de proyección social",
    "Otro",
    "Ningúno",
  ]),
  dom("resultados_estudiantes", "Resultados cooperación (estudiantes)", [
    "Participación en evento / encuentro",
    "Participación en proyecto o trabajo de grado",
    "Actividad de proyección social",
    "Pasantías, intercambios y estancias",
    "Práctica académica",
    "Participación en clases espejo / COIL",
    "Doble titulación",
    "Otro",
    "Ninguno",
  ]),
  dom("tipo_proyecto", "Tipo de proyecto", ["Investigación", "Creación", "Innovación", "Proyección social", "Consultoría", "Educación contínua"]),
];

/** Las listas del SNIES (src/modules/reportes/snies/dominios.ts), con el nombre que ve la persona. */
export const DOMINIOS_DEL_SNIES: DominioLocal[] = Object.values(DOMINIOS_SNIES).map((d) => ({
  id: `snies_${d.id}`,
  nombre: d.etiqueta,
  opciones: d.valores.map((v) => v.nombre),
  numerado: false,
}));

export const DOMINIOS_PC: DominioLocal[] = [...DOMINIOS_CNA, ...DOMINIOS_DEL_SNIES];

export function dominio(id: string | null | undefined, lista: readonly DominioLocal[] = DOMINIOS_PC): DominioLocal | null {
  return lista.find((d) => d.id === id) ?? null;
}

/** Opciones de una columna de destino (las de su dominio; vacío si no es lista). */
export function opcionesDe(c: Pick<ColumnaDestino, "dominio">, lista: readonly DominioLocal[] = DOMINIOS_PC): string[] {
  return dominio(c.dominio, lista)?.opciones ?? [];
}

/** Cómo se escribe una opción al emitir: el CNA antepone su posición («2. Maestría»). */
export function opcionEmitida(d: Pick<DominioLocal, "opciones" | "numerado">, valor: string): string {
  const i = d.opciones.indexOf(valor);
  if (i < 0) return valor;
  return d.numerado ? `${i + 1}. ${valor}` : valor;
}

/* ---------- Cuadro Maestro del CNA ------------------------------------------------- */

const col = (
  clave: string,
  etiqueta: string,
  tipo: PcTipo = "texto",
  extra: Partial<Omit<ColumnaDestino, "clave" | "etiqueta" | "tipo">> = {},
): ColumnaDestino => ({ clave, etiqueta, tipo, obligatorio: false, ...extra });
const req = { obligatorio: true } as const;
const sel = (clave: string, etiqueta: string, dominioId: string, extra: Partial<ColumnaDestino> = {}) => col(clave, etiqueta, "lista", { dominio: dominioId, ...extra });

const NIVELES: [string, string][] = [
  ["doctorado", "Doctorado"],
  ["maestria", "Maestría"],
  ["especializacion", "Especialización Univ."],
  ["profesional", "Profesional Univ."],
  ["tecnologico", "Tecnológico"],
  ["tecnico", "Técnico Profesional"],
];

/** Cuadro 03: contratos por término, nivel máximo de formación y dedicación (TC / MT). */
function columnasProfesoresResumen(): ColumnaDestino[] {
  const cs: ColumnaDestino[] = [col("anio", "Año", "numero"), col("periodo", "Período académico")];
  for (const [ctr, etiqueta] of [
    ["indef", "Indefinido"],
    ["fijo11", "Fijo de 11 meses o más"],
  ] as const) {
    for (const [nk, nn] of NIVELES) {
      for (const [dk, dn] of [
        ["tc", "TC"],
        ["mt", "MT"],
      ] as const) {
        cs.push(col(`${ctr}_${nk}_${dk}`, `${etiqueta} · ${nn} · ${dn}`, "numero"));
      }
    }
    cs.push(col(`${ctr}_total`, `Total con contrato ${etiqueta.toLowerCase()}`, "numero"));
  }
  cs.push(
    col("posgrado_tc", "Indefinidos o fijos de 11 meses o más con posgrado · TC", "numero"),
    col("posgrado_mt", "Indefinidos o fijos de 11 meses o más con posgrado · MT", "numero"),
    col("posgrado_doctorado", "Indefinidos o fijos de 11 meses o más · Doctorado", "numero"),
    col("posgrado_maestria", "Indefinidos o fijos de 11 meses o más · Maestría", "numero"),
    col("fijo10", "Contratos a término fijo de 10 meses o menos", "numero"),
    col("hora_catedra", "Contratos de hora cátedra", "numero"),
    col("total_profesores", "Total de profesores del programa", "numero"),
  );
  return cs;
}

/** Cuadros 05 y 06: interacción con otras instituciones (iguales salvo la persona y los resultados). */
function columnasInteraccion(persona: "profesor" | "estudiante"): ColumnaDestino[] {
  return [
    col("cedula", "Cédula / identificación", "texto", { personal: true, sinonimos: ["documento", "numero de documento"] }),
    col("nombres", persona === "profesor" ? "Nombres y apellidos del profesor/a" : "Nombres y apellidos del/la estudiante", "texto", {
      personal: true,
      sinonimos: ["nombre completo", persona],
    }),
    col("institucion", "Institución con la que se interactúa o coopera"),
    sel("tipo_institucion", "Tipo de institución", "tipo_institucion"),
    sel("ubicacion", "Ubicación de la institución", "ubicacion_institucion"),
    col("pais", "País de la institución"),
    col("fecha_inicial", "Fecha inicial", "fecha"),
    col("fecha_final", "Fecha final", "fecha", { posterior_a: "fecha_inicial" }),
    col("dias", "# de días", "numero"),
    col("encuentros", "# de encuentros durante el periodo de interacción", "numero"),
    sel("tipo_movilidad", "Tipo de movilidad asociada", "tipo_movilidad"),
    sel("idioma", "Idioma de la interacción", "idioma_interaccion"),
    sel("resultados", "Resultados específicos de la interacción / cooperación", persona === "profesor" ? "resultados_profesores" : "resultados_estudiantes"),
  ];
}

export const DESTINOS_CNA: DestinoLocal[] = [
  {
    id: "cna01",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 01 · General",
    cuadro: "01",
    orden: 1,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "lista",
    carpeta: "cna",
    columnas: [
      col("denominacion", "Denominación del programa", "texto", req),
      col("unidad_academica", "Unidad académica del programa"),
      col("snies_actual", "Código SNIES actual vigente", "texto", req),
      col("snies_anterior", "Código SNIES anterior (últimos 8 años)"),
      sel("registro_unico", "¿Es ofertado en Registro Único?", "si_no"),
      col("codigo_registro_unico", "Código Registro Único (si aplica)"),
      col("modalidades", "¿En qué modalidades se oferta?"),
      sel("ciclos_propedeuticos", "¿Es ofertado por Ciclos Propedéuticos?", "si_no"),
      col("programas_ciclo", "Códigos SNIES y nombres de los programas vinculados en ciclo propedéutico"),
      col("creditos", "Nº de créditos según plan de estudios vigente", "numero", req),
      col("admitidos_primer_periodo", "Nº de estudiantes admitidos en el primer periodo", "numero"),
      col("anio_primera_cohorte", "Año de la primera cohorte", "numero"),
      col("duracion_total", "Duración total del programa, según RC", "texto", req),
      col("periodicidad_admision", "Periodicidad de admisión"),
      col("resolucion_rc_numero", "Resolución de Registro Calificado · número", "texto", req),
      col("resolucion_rc_fecha", "Resolución de Registro Calificado · fecha", "fecha", req),
      col("resolucion_acreditacion_numero", "Resolución de acreditación · número"),
      col("resolucion_acreditacion_fecha", "Resolución de acreditación · fecha", "fecha"),
      col("resolucion_acreditacion_vigencia", "Resolución de acreditación · vigencia"),
      col("resoluciones_modificacion_rc", "Resoluciones de modificación del RC (ampliación de lugares de desarrollo)"),
      col("promociones_graduados", "Nº de promociones de graduados", "numero"),
      col("promociones_ventana", "Nº de promociones en la ventana de observación", "numero"),
      col("graduados_total", "Nº total de graduados", "numero"),
      col("graduados_ventana", "Nº de graduados en la ventana de observación", "numero"),
      col("modificacion_rc_proyectada", "Modificación del RC proyectada o en trámite"),
      col("lugar_desarrollo", "Lugar de desarrollo según RC"),
      col("lugar_fecha_creacion", "Lugar de desarrollo · fecha de creación", "fecha"),
      col("lugar_resolucion", "Lugar de desarrollo · resolución de modificación de RC (No. y fecha)"),
      col("fecha_diligenciamiento", "Fecha de diligenciamiento", "fecha", { ...req, sinonimos: ["fecha de corte"] }),
      col("fecha_autoevaluacion", "Fecha de autoevaluación", "fecha", req),
    ],
  },
  {
    id: "cna02",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 02 · Estudiantes",
    cuadro: "02",
    orden: 2,
    automatico: "Lo llena el sistema con Reportes SNIES y el Warehouse; el programa solo confirma la deserción.",
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("anio", "Año", "numero"),
      col("periodo", "Período académico"),
      col("inscritos", "No. de inscritos", "numero"),
      col("admitidos", "No. de admitidos", "numero"),
      col("tasa_selectividad", "Tasa de selectividad", "porcentaje"),
      col("matriculados", "No. de matriculados (totales)", "numero"),
      col("primer_curso", "No. de matriculados de primer curso", "numero"),
      col("tasa_absorcion", "Tasa de absorción", "porcentaje"),
      col("desercion", "% deserción al finalizar el programa según la duración en el RC", "porcentaje"),
      col("graduados", "# total de graduados", "numero"),
      col("graduados_duracion", "% de graduados al finalizar el programa según la duración en el RC", "porcentaje"),
      col("graduados_mas1", "% de graduados más un periodo del RC", "porcentaje"),
      col("graduados_mas2", "% de graduados más dos periodos del RC", "porcentaje"),
      col("graduados_mas3", "% de graduados más tres periodos del RC", "porcentaje"),
    ],
  },
  {
    id: "cna03",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 03 · Profesores resumen",
    cuadro: "03",
    orden: 3,
    automatico: "Lo llena el sistema con la nómina docente del Warehouse.",
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: columnasProfesoresResumen(),
  },
  {
    id: "cna04",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 04 · Profesores detallado",
    cuadro: "04",
    orden: 4,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("cedula", "Cédula / identificación", "texto", { ...req, solo_lectura: "Warehouse", personal: true, sinonimos: ["documento", "numero de documento", "identificacion"] }),
      col("nombres", "Nombres y apellidos del profesor/a", "texto", { ...req, solo_lectura: "Warehouse", personal: true, sinonimos: ["nombre completo", "profesor"] }),
      sel("nivel_formacion", "Nivel máximo de formación", "nivel_formacion", { ...req, sinonimos: ["nivel de formacion", "formacion"] }),
      col("titulo_maximo", "Título obtenido en nivel máximo de formación"),
      col("pais_titulo", "País de obtención del título de máximo título"),
      col("titulo_pregrado", "Título obtenido en la formación de pregrado"),
      col("categoria_escalafon", "Categoría en el escalafón vigente de la IES"),
      col("enlace_cvlac", "Enlace Web al CvLAC o, si no tiene, a su ORCID", "texto", { ...req, sinonimos: ["cvlac", "orcid", "enlace cvlac u orcid"] }),
      col("enlace_gruplac", "Enlace al GrupLAC del grupo de investigación principal"),
      sel("reconocimiento", "Reconocimiento como investigador en MinCiencias", "reconocimiento_minciencias"),
      col("unidad_academica", "Facultad / departamento / unidad académica a la que pertenece"),
      sel("tipo_contratacion", "Tipo de contratación", "tipo_contratacion", { solo_lectura: "Warehouse" }),
      sel("tipo_dedicacion", "Tipo de dedicación contractual", "tipo_dedicacion", { solo_lectura: "Warehouse" }),
      col("horas_docencia", "No. de horas de docencia", "numero", { solo_lectura: "Warehouse" }),
      col("horas_investigacion", "No. de horas de investigación", "numero", req),
      col("horas_extension", "No. de horas de extensión / proyección social", "numero"),
      col("horas_gestion", "No. de horas de gestión académica", "numero"),
      col("horas_total", "No. total de horas / semana en el programa", "numero"),
      col("lugar_desarrollo", "Lugar de desarrollo (marque «X»)"),
      col("modalidad_presencial", "Modalidad · Presencial (marque «X»)"),
      col("modalidad_virtual", "Modalidad · Virtual (marque «X»)"),
      col("modalidad_distancia", "Modalidad · A distancia (marque «X»)"),
      col("modalidad_dual", "Modalidad · Dual (marque «X»)"),
      col("ciclo_tecnica", "Ciclo propedéutico · Técnica profesional (marque «X»)"),
      col("ciclo_tecnologico", "Ciclo propedéutico · Tecnológico (marque «X»)"),
      col("ciclo_universitario", "Ciclo propedéutico · Universitario (marque «X»)"),
    ],
  },
  {
    id: "cna05",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 05 · Interacción de profesores",
    cuadro: "05",
    orden: 5,
    automatico: "Viene de Internacionalización, ya aprobado por campus.",
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: columnasInteraccion("profesor"),
  },
  {
    id: "cna06",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 06 · Interacción de estudiantes",
    cuadro: "06",
    orden: 6,
    automatico: "Viene de Internacionalización, ya aprobado por campus.",
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: columnasInteraccion("estudiante"),
  },
  {
    id: "cna07",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 07 · Grupos y líneas",
    cuadro: "07",
    orden: 7,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("grupo", "Nombre del grupo de investigación o creación que apoya al programa", "texto", { ...req, sinonimos: ["grupo", "nombre del grupo", "grupo de investigacion"] }),
      col("codigo_grupo", "Código del grupo en MinCiencias", "texto", { ...req, sinonimos: ["codigo grupo", "codigo minciencias"] }),
      sel("categoria_737_2015", "Categoría 737_2015", "categoria_minciencias"),
      sel("categoria_781_2017", "Categoría 781_2017", "categoria_minciencias"),
      sel("categoria_833_2018", "Categoría 833_2018", "categoria_minciencias"),
      sel("categoria_894_2021", "Categoría 894_2021", "categoria_minciencias"),
      sel("categoria_957_2024", "Categoría 957_2024", "categoria_minciencias", { ...req, sinonimos: ["categoria", "categoria 957 de 2024"] }),
      col("lineas", "Líneas de investigación", "texto", { sinonimos: ["lineas"] }),
    ],
  },
  {
    id: "cna08",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 08 · Proyectos y productos",
    cuadro: "08",
    orden: 8,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("proyecto", "Nombre del proyecto de investigación, creación, innovación o proyección social", "texto", { ...req, sinonimos: ["proyecto", "titulo del proyecto"] }),
      sel("tipo_proyecto", "Tipo de proyecto o actividad", "tipo_proyecto", { ...req, sinonimos: ["tipo"] }),
      sel("fuente_financiacion", "Fuente de financiación principal", "fuente_financiacion"),
      col("financiador", "Nombre del financiador"),
      col("inicio", "Inicio", "fecha", { ...req, sinonimos: ["fecha de inicio", "fecha inicial"] }),
      col("fin", "Fin", "fecha", { ...req, posterior_a: "inicio", sinonimos: ["fecha de fin", "fecha final"] }),
      col("n_profesores", "# profesores del programa", "numero"),
      col("n_estudiantes", "# estudiantes del programa", "numero"),
    ],
  },
  {
    id: "cna09",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 09 · Bienestar",
    cuadro: "09",
    orden: 9,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: false,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("estrategia", "Estrategia, programa o servicio", "texto", { ...req, sinonimos: ["estrategia", "servicio", "actividad"] }),
      col("anio", "Año de realización de las actividades", "numero", req),
      col("actividades", "# de actividades realizadas", "numero", req),
      col("estudiantes", "# de estudiantes participantes", "numero"),
      col("profesores", "# de profesores participantes", "numero"),
      col("administrativos", "# de administrativos participantes", "numero"),
      col("lugar_desarrollo", "Lugar de desarrollo (marque «X»)"),
    ],
  },
  {
    id: "cna10",
    sistema: "CNA",
    plantilla: null,
    nombre: "Cuadro 10 · Escenarios de práctica clínica",
    cuadro: "10",
    orden: 10,
    automatico: null,
    estructura_bloqueada: true,
    solo_salud: true,
    tipo_archivo: "tabla",
    carpeta: "cna",
    columnas: [
      col("escenario", "Nombre del escenario de práctica", "texto", { ...req, sinonimos: ["escenario", "institucion", "clinica", "hospital"] }),
      col("reps_prestador", "Código de prestador en el REPS"),
      col("sede", "Nombre de la sede"),
      col("reps_sede", "Código de prestador (sede) en el REPS"),
      col("municipio", "Municipio"),
      col("estudiantes_simultaneos", "# de estudiantes en práctica simultánea", "numero"),
      sel("acreditado", "¿Acreditado?", "si_no"),
      sel("hospital_universitario", "¿Reconocido como hospital universitario?", "si_no"),
      sel("principal", "¿Escenario de práctica principal / base (si aplica)?", "si_no"),
      sel("visitado", "¿Escenario visitado?", "si_no"),
      sel("concepto_favorable_ciths", "¿Escenario con concepto favorable de la CITHS?", "si_no"),
      col("acuerdo_ciths", "Número del acuerdo CITHS"),
      col("fecha_acuerdo_ciths", "Fecha del acuerdo CITHS", "fecha"),
      col("fecha_suscripcion_convenio", "Fecha de suscripción de convenios", "fecha", { sinonimos: ["fecha de suscripcion", "inicio del convenio"] }),
      col("fecha_vencimiento_convenio", "Fecha de vencimiento de convenios", "fecha", { posterior_a: "fecha_suscripcion_convenio", sinonimos: ["vencimiento", "fecha de vencimiento"] }),
    ],
  },
];

/* ---------- SNIES: derivado de las plantillas de Reportes ---------------------------- */

const PERSONAL = /DOCUMENTO|NOMBRE|APELLIDO|NACIMIENTO|TELEFONO|EMAIL|DIRECCION|EXPEDICION/;

function columnaDeCampo(c: Campo): ColumnaDestino {
  // «AÑO» → «anio»: la clave es ASCII (minúsculas, dígitos y guion bajo).
  const clave = c.codigo.toLowerCase().replace(/ñ/g, "ni").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const personal = PERSONAL.test(c.codigo) ? { personal: true } : {};
  const nota = c.ayuda ? { nota: c.ayuda } : {};
  const alias = c.alias?.length ? { sinonimos: c.alias } : {};
  if (c.fuente?.tipo === "dominio" && DOMINIOS_SNIES[c.fuente.dominio]) {
    return { clave, etiqueta: c.etiqueta, tipo: "lista", obligatorio: c.obligatorio, dominio: `snies_${c.fuente.dominio}`, ...personal, ...nota, ...alias };
  }
  const tipo: PcTipo = c.formato === "fecha" ? "fecha" : c.formato === "entero" || c.formato === "anio" || c.formato === "dinero" ? "numero" : "texto";
  return { clave, etiqueta: c.etiqueta, tipo, obligatorio: c.obligatorio, ...personal, ...nota, ...alias };
}

/** Las plantillas SNIES que ya se capturan (las «pendientes» no tienen campos). */
export const DESTINOS_SNIES: DestinoLocal[] = PLANTILLAS.filter((p) => p.campos.length > 0).map((p) => ({
  id: `snies_${p.id}`,
  sistema: "SNIES" as const,
  plantilla: p.id,
  nombre: `Plantilla ${p.nombre}`,
  cuadro: null,
  orden: 100 + p.orden,
  automatico: null,
  estructura_bloqueada: false,
  solo_salud: false,
  tipo_archivo: "tabla" as const,
  carpeta: "snies" as const,
  columnas: p.campos.map(columnaDeCampo),
}));

export const DESTINOS: DestinoLocal[] = [...DESTINOS_CNA, ...DESTINOS_SNIES];

export function destino(id: string | null | undefined, lista: readonly DestinoLocal[] = DESTINOS): DestinoLocal | null {
  return lista.find((d) => d.id === id) ?? null;
}

/** «Cuadro 07 · Grupos y líneas» → «Grupos y líneas»; «Plantilla Graduados» → «Graduados». */
export function nombreCorto(d: Pick<DestinoLocal, "nombre">): string {
  return d.nombre.replace(/^.*? · /, "").replace(/^Plantilla /, "");
}

/** Etiqueta de las fichas: «CNA · 07», «SNIES · Graduados». */
export function etiquetaSistema(d: Pick<DestinoLocal, "sistema" | "cuadro" | "nombre">): string {
  return d.sistema === "CNA" ? `CNA · ${d.cuadro ?? nombreCorto(d)}` : `SNIES · ${nombreCorto(d)}`;
}

/** Columnas de un archivo que parte de un destino (la estructura que pide el CNA o el SNIES). */
export function columnasIniciales(d: DestinoLocal, lista: readonly DominioLocal[] = DOMINIOS_PC): (Columna & { orden: number })[] {
  return d.columnas.map((c, i) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    tipo: c.tipo,
    obligatorio: c.obligatorio,
    opciones: opcionesDe(c, lista),
    solo_lectura: c.solo_lectura ?? null,
    posterior_a: c.posterior_a ?? null,
    personal: c.personal ?? false,
    orden: i + 1,
  }));
}

/* ---------- emparejamiento ----------------------------------------------------------------------- */

/** Grupos de nombres que significan lo mismo, además de los de cada columna. */
const SINONIMOS_GLOBALES: string[][] = [
  ["cedula", "numero de documento", "documento", "identificacion", "nro documento", "cedula identificacion"],
  ["nombres y apellidos", "nombre completo", "nombres", "profesor"],
  ["primer nombre", "nombre", "nombres"],
  ["primer apellido", "apellido", "apellidos"],
  ["fecha de grado", "grado", "fecha graduacion"],
  ["titulo otorgado", "titulo", "titulo obtenido"],
  ["sexo biologico", "sexo", "genero"],
  ["pais de nacimiento", "pais"],
  ["inicio", "fecha de inicio", "fecha inicial"],
  ["fin", "fecha de fin", "fecha final", "fecha de vencimiento"],
  ["enlace web al cvlac o si no tiene a su orcid", "cvlac", "orcid", "enlace cvlac u orcid"],
];

function formasDe(c: ColumnaDestino): string[] {
  const grupos = new Set<string>([normalizar(c.etiqueta), normalizar(c.clave.replace(/_/g, " ")), ...(c.sinonimos ?? []).map(normalizar)]);
  for (const g of SINONIMOS_GLOBALES) if (g.some((x) => grupos.has(x))) for (const x of g) grupos.add(x);
  grupos.delete("");
  return [...grupos];
}

/**
 * Qué tan parecido es el nombre de una columna del archivo al de una del
 * destino: 3 igual, 2,5 sinónimo, entre 2 y 2,4 si uno contiene al otro (con 4
 * letras o más), 0 nada.
 */
export function parecido(etiquetaArchivo: string, destinoCol: ColumnaDestino): number {
  const a = normalizar(etiquetaArchivo);
  if (!a) return 0;
  const formas = formasDe(destinoCol);
  const propias = [normalizar(destinoCol.etiqueta), normalizar(destinoCol.clave.replace(/_/g, " "))];
  if (propias.includes(a)) return 3;
  if (formas.includes(a)) return 2.5;
  // Uno contiene al otro (4 letras o más): entre 2 y 2,4, según cuánto del nombre del archivo explica.
  let mejor = 0;
  if (a.length >= 4) {
    for (const f of formas) {
      if (f.length < 4 || !(f.includes(a) || a.includes(f))) continue;
      mejor = Math.max(mejor, 2 + 0.4 * (Math.min(a.length, f.length) / a.length));
    }
  }
  return mejor;
}

/**
 * Propone el mapa de un archivo hacia un destino: a cada columna del destino,
 * la columna del archivo que más se le parece (mínimo 2) sin repetir una
 * columna del archivo. Solo incluye las que encontró.
 */
export function autoMap(columnas: readonly Pick<Columna, "clave" | "etiqueta">[], d: Pick<DestinoLocal, "columnas">): PcMapa {
  const usadas = new Set<string>();
  const mapa: PcMapa = {};
  // Primero las mejores coincidencias, para que una columna parecida no se lleve la de otra.
  const candidatos: { destino: string; archivo: string; puntos: number }[] = [];
  for (const dc of d.columnas) for (const c of columnas) candidatos.push({ destino: dc.clave, archivo: c.clave, puntos: parecido(c.etiqueta, dc) });
  candidatos.sort((x, y) => y.puntos - x.puntos);
  for (const k of candidatos) {
    if (k.puntos < 2 || k.destino in mapa || usadas.has(k.archivo)) continue;
    mapa[k.destino] = k.archivo;
    usadas.add(k.archivo);
  }
  return mapa;
}

export interface Cobertura {
  n: number;
  t: number;
  pct: number;
}

/** Cobertura = columnas del destino que el mapa une con una columna del archivo / columnas del destino. */
export function cobertura(mapa: PcMapa | null | undefined, d: Pick<DestinoLocal, "columnas">, columnasArchivo?: readonly Pick<Columna, "clave">[]): Cobertura {
  const existentes = columnasArchivo ? new Set(columnasArchivo.map((c) => c.clave)) : null;
  const n = d.columnas.filter((dc) => {
    const v = mapa?.[dc.clave];
    return Boolean(v) && (!existentes || existentes.has(v as string));
  }).length;
  const t = d.columnas.length;
  return { n, t, pct: t ? Math.round((n / t) * 100) : 0 };
}

export interface RespuestaMin {
  archivo_id?: string;
  destino_id: string;
  mapa: PcMapa;
}

/**
 * Cobertura del Cuadro Maestro del CNA: columnas de los cuadros que ya
 * responde el sistema (los automáticos) o un archivo (el mejor de cada
 * cuadro), sobre el total. `soloSalud`: incluir el cuadro 10.
 */
export function coberturaCuadroMaestro(respuestas: readonly RespuestaMin[], opciones: { destinos?: readonly DestinoLocal[]; salud?: boolean } = {}): Cobertura {
  const cna = (opciones.destinos ?? DESTINOS).filter((d) => d.sistema === "CNA" && (opciones.salud || !d.solo_salud));
  let t = 0;
  let n = 0;
  for (const d of cna) {
    t += d.columnas.length;
    if (d.automatico) {
      n += d.columnas.length;
      continue;
    }
    let mejor = 0;
    for (const r of respuestas) if (r.destino_id === d.id) mejor = Math.max(mejor, cobertura(r.mapa, d).n);
    n += mejor;
  }
  return { n, t, pct: t ? Math.round((n / t) * 100) : 0 };
}

/**
 * Avisos de dominio: los valores de una columna unida a una lista del CNA o
 * del SNIES que no están en esa lista («3 valores de «Tipo de proyecto» no
 * están en la lista del CNA (por ejemplo «Extensión»)»).
 */
export function avisosDeDominio(
  d: DestinoLocal,
  mapa: PcMapa,
  filas: readonly Record<string, unknown>[],
  lista: readonly DominioLocal[] = DOMINIOS_PC,
): string[] {
  const avisos: string[] = [];
  for (const dc of d.columnas) {
    const clave = mapa[dc.clave];
    const opciones = opcionesDe(dc, lista);
    if (!clave || !opciones.length) continue;
    const malos = filas.map((f) => String(f[clave] ?? "").trim()).filter((v) => v && !opciones.includes(v));
    if (malos.length) avisos.push(`${malos.length} ${malos.length === 1 ? "valor" : "valores"} de «${dc.etiqueta}» no ${malos.length === 1 ? "está" : "están"} en la lista del ${d.sistema} (por ejemplo «${malos[0]}»).`);
  }
  return avisos;
}

/**
 * Un destino cercano a una columna suelta, para decir «esta columna coincide
 * con X de Y» en el asistente. Nulo si ninguno pasa de 2.
 */
export function sugerirDestino(etiqueta: string, destinos: readonly DestinoLocal[] = DESTINOS): { destino: DestinoLocal; columna: ColumnaDestino } | null {
  let mejor: { destino: DestinoLocal; columna: ColumnaDestino } | null = null;
  let puntos = 0;
  for (const d of destinos) {
    if (d.automatico) continue;
    for (const c of d.columnas) {
      const s = parecido(etiqueta, c);
      if (s > puntos) {
        puntos = s;
        mejor = { destino: d, columna: c };
      }
    }
  }
  return puntos >= 2 ? mejor : null;
}
