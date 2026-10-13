/* =============================================================================
   UDES Sostenible · informes ODS del THE Impact Rankings, por edición.

   Los 17 informes, el avance de evidencias de la edición vigente, la
   presentación rectoral y el detalle del ODS 13 (el informe que ya se rehízo).
   Aquí solo hay datos y funciones puras; las vistas viven en OdsPortal,
   OdsReport, OdsRector y OdsBulletin.

   Política de datos ilustrativos (PRODUCT.md): lo que no es una cifra oficial
   lleva `real: false` y las vistas lo rotulan «Dato ilustrativo». Hoy solo
   las cifras de los ODS 4 y 13 salen de los informes 2025 publicados.
   ========================================================================== */

import { SDG } from "./data";

export const ODS_EDITIONS = [2025, 2026] as const;
export type OdsEdition = (typeof ODS_EDITIONS)[number];
export const ODS_CURRENT: OdsEdition = 2026;

export type Bi = { es: string; en: string };
export type EvidenceStatus = "ok" | "rev" | "falta";

export interface OdsFigure {
  value: string;
  unit: string;
  label: string;
}

export interface Ods {
  n: number;
  name: string;
  color: string;
  thesis: string;
  figures: [OdsFigure, OdsFigure];
  /** Lo que la UDES prevé para la edición vigente, en una frase que sigue a «La UDES prevé». */
  next: string;
  /** Evidencias verificadas y totales de la edición vigente. */
  ok: number;
  total: number;
  /** Se envía a THE en la edición vigente. */
  the: boolean;
  /** Las cifras salen de un informe publicado, no son de muestra. */
  real: boolean;
}

type Row = [string, string, [string, string, string], [string, string, string], string, number, number, 0 | 1, 0 | 1];

const ROWS: Row[] = [
  ["Fin de la pobreza", "La UDES enfrenta la pobreza con educación, inclusión y programas de proyección social.", ["3.100", "personas", "atendidas por programas de inclusión"], ["62", "apoyos", "a estudiantes en condición de vulnerabilidad"], "medir el efecto de los apoyos en la permanencia estudiantil.", 4, 9, 0, 0],
  ["Hambre cero", "Un ecosistema de conocimiento que conecta investigación, campo y comunidad contra el hambre.", ["18", "proyectos", "de seguridad alimentaria con comunidades"], ["420", "familias", "acompañadas en huertas y capacitación"], "extender las huertas a todos los campus.", 5, 9, 0, 0],
  ["Salud y bienestar", "Formación, atención y proyección en salud para vidas saludables en la región.", ["3.200", "pacientes", "atendidos en programas de salud"], ["12", "brigadas", "en zonas rurales"], "vincular más programas de salud a la proyección social.", 7, 10, 0, 0],
  ["Educación de calidad", "La UDES forma maestros y abre la universidad a quienes son los primeros de su familia en llegar.", ["16.030", "personas", "beneficiadas por Proyección Social"], ["20,09 %", "de egresados", "calificados para la docencia"], "seguir reduciendo las barreras de acceso para la primera generación.", 9, 11, 1, 1],
  ["Igualdad de género", "Evidencias verificables de igualdad de género en la formación, la investigación y la vida universitaria.", ["52 %", "de las estudiantes", "en programas de posgrado"], ["4", "protocolos", "de prevención de violencias"], "publicar la brecha salarial y de cargos directivos.", 3, 8, 0, 0],
  ["Agua limpia y saneamiento", "Uso racional del agua en los campus y conocimiento aplicado al saneamiento.", ["14 %", "menos consumo", "de agua por persona frente a 2024"], ["3", "campus", "con medición por sectores"], "instalar medidores en los campus restantes.", 5, 8, 1, 0],
  ["Energía asequible y no contaminante", "Investigación en energías renovables y eficiencia que acerca la energía limpia a la región.", ["11 %", "del consumo", "con fuentes limpias"], ["5", "proyectos", "de investigación en renovables"], "elevar al 16 % la energía de bajas emisiones.", 6, 9, 1, 0],
  ["Trabajo decente y crecimiento económico", "Emprendimiento, empleabilidad y trabajo decente: del aula al mercado laboral.", ["78 %", "de egresados", "empleados al año de grado"], ["250+", "emprendedores", "en la Feria Yo Emprendo"], "conectar la bolsa de empleo con más empresas aliadas.", 7, 10, 0, 0],
  ["Industria, innovación e infraestructura", "Laboratorios, innovación e infraestructura que construyen una cultura de la curiosidad.", ["39", "proyectos", "de innovación en curso"], ["46", "grupos", "de investigación activos"], "abrir un laboratorio abierto para la comunidad.", 8, 11, 0, 0],
  ["Reducción de las desigualdades", "La inclusión y la reducción de desigualdades son el eje transversal de la misión universitaria.", ["27", "estudiantes", "con ajustes razonables"], ["100+", "becas", "por mérito y condición social"], "ampliar los ajustes razonables a todos los programas.", 4, 8, 0, 0],
  ["Ciudades y comunidades sostenibles", "Intervención directa en comunidades urbanas y cultura para ciudades sostenibles.", ["9", "barrios", "con intervención de extensión"], ["6", "idiomas", "en los cursos de interculturalidad"], "medir el impacto de la extensión en cada barrio.", 6, 9, 1, 0],
  ["Producción y consumo responsables", "Economía circular y valorización de residuos en el campus y la región.", ["300", "kg", "de residuos valorizados"], ["150", "jóvenes", "formados en economía circular"], "llegar a cero residuos a relleno sanitario en un campus.", 7, 9, 1, 0],
  ["Acción por el clima", "Carbono neutralidad, hidrógeno verde y una comunidad que cambia sus hábitos.", ["4.758", "kg de CO₂", "evitados en una jornada sin carro y sin moto"], ["110+", "instituciones", "conectadas por la afiliación al WEC Colombia"], "publicar el plan de transición energética y los datos de energía por fuente.", 6, 12, 1, 1],
  ["Vida submarina", "Conservación del agua y de los ecosistemas acuáticos desde UDES Verde.", ["4", "ediciones", "de la revista UDES Verde"], ["7", "jornadas", "de limpieza de cuencas"], "vincular los semilleros a la cuenca del río de Oro.", 3, 7, 0, 0],
  ["Vida de ecosistemas terrestres", "Protección de la biodiversidad y de los ecosistemas estratégicos del territorio.", ["52", "especies", "registradas en los campus"], ["19", "hectáreas", "en conservación"], "completar el inventario de fauna de los campus.", 7, 9, 1, 0],
  ["Paz, justicia e instituciones sólidas", "Investigación y extensión que construyen paz, justicia e instituciones sólidas.", ["270", "personas", "atendidas en consultorio jurídico"], ["80", "casos", "de conciliación"], "publicar el informe anual de transparencia.", 4, 8, 0, 0],
  ["Alianzas para lograr los objetivos", "Alianzas nacionales e internacionales que multiplican el impacto de la UDES.", ["47", "convenios", "vigentes con aliados"], ["11", "países", "con proyectos conjuntos"], "sumar alianzas con ciudades y empresas del territorio.", 8, 10, 1, 0],
];

const fig = ([value, unit, label]: [string, string, string]): OdsFigure => ({ value, unit, label });

export const ODS_LIST: Ods[] = ROWS.map((r, i) => ({
  n: i + 1,
  name: r[0],
  color: SDG[i]?.color ?? "#3F7E44",
  thesis: r[1],
  figures: [fig(r[2]), fig(r[3])],
  next: r[4],
  ok: r[5],
  total: r[6],
  the: r[7] === 1,
  real: r[8] === 1,
}));

/** Dibujo oficial del ODS (PNG con transparencia, 800 × 1085) en public/ods. Confirmar su licencia de uso antes de publicar. */
export const odsArt = (n: number) => `/ods/ods-${n}.png`;

export const odsByNumber = (n: number | string | undefined): Ods | undefined => ODS_LIST.find((o) => o.n === Number(n));
export const odsEdition = (v: string | null | undefined): OdsEdition => (ODS_EDITIONS.find((e) => String(e) === v) ?? ODS_CURRENT);

export const odsPct = (o: Ods) => Math.round((o.ok / o.total) * 100);
/** Lista para revisión desde 75 %, en recopilación desde 50 %, por iniciar debajo. */
export const odsStatus = (o: Ods): EvidenceStatus => (odsPct(o) >= 75 ? "ok" : odsPct(o) >= 50 ? "rev" : "falta");
export const STATUS_LABEL: Record<EvidenceStatus, string> = { ok: "Lista para revisión", rev: "En recopilación", falta: "Por iniciar" };
export const EVIDENCE_LABEL: Record<EvidenceStatus, Bi> = {
  ok: { es: "Verificada", en: "Verified" },
  rev: { es: "En revisión", en: "In review" },
  falta: { es: "Falta", en: "Missing" },
};

export function odsTotals(list: Ods[] = ODS_LIST) {
  return {
    count: list.length,
    ok: list.reduce((a, o) => a + o.ok, 0),
    total: list.reduce((a, o) => a + o.total, 0),
    ready: list.filter((o) => odsStatus(o) === "ok").length,
    the: list.filter((o) => o.the).length,
  };
}

/* --- Presentación rectoral ---------------------------------------------------------------------- */

export const RECTOR = {
  name: "Nombre del Rector",
  role: "Rector · Universidad de Santander",
  title: "La sostenibilidad es una forma de cumplir nuestra misión.",
  quote: "Lo que medimos se vuelve compromiso; lo que compromete, se vuelve cultura.",
  /** Párrafos separados por una línea en blanco. Texto de ejemplo: lo redacta y aprueba la Rectoría. */
  text:
    "Cada año la UDES se mide frente al mundo en los rankings de sostenibilidad. Más allá de la posición, este informe muestra lo que hacemos todos los días en nuestros campus: formar maestros, cuidar el agua, investigar el hidrógeno verde y acompañar a las comunidades que nos rodean.\n\nPresentamos aquí la contribución de la Universidad a los Objetivos de Desarrollo Sostenible en la edición 2026. Cada cifra tiene detrás una evidencia verificable y un equipo que la hizo posible.\n\nGracias a profesores, estudiantes, administrativos y aliados por hacer de la sostenibilidad una forma de vivir la universidad.",
  illustrative: true,
};
export const rectorParagraphs = (text = RECTOR.text) => text.split(/\n\s*\n/).filter(Boolean);

/* --- Plantillas del boletín ----------------------------------------------------------------------- */

export type BulletinVoice = "narr" | "data";
export interface BulletinTemplate {
  id: "the" | "cifras" | "libre";
  name: string;
  subtitle: string;
  eyebrow: string;
  accent: string;
  voice: BulletinVoice;
}
export const BULLETIN_TEMPLATES: BulletinTemplate[] = [
  { id: "the", name: "THE Impact Rankings", subtitle: "Informe de contribución a los ODS · Edición 2026", eyebrow: "THE Impact Rankings 2026", accent: "#2b5c30", voice: "narr" },
  { id: "cifras", name: "UDES en Cifras", subtitle: "Boletín institucional de datos · Periodo 2026", eyebrow: "UDES en Cifras", accent: "#014898", voice: "data" },
  { id: "libre", name: "Informe libre", subtitle: "Informe de sostenibilidad · Universidad de Santander", eyebrow: "Informe de sostenibilidad", accent: "#0f6f78", voice: "narr" },
];

/** Los párrafos de un ODS en el boletín. En voz de datos, solo la tesis. Las evidencias no se mencionan: son internas. */
export function odsNarrative(o: Ods, voice: BulletinVoice): string[] {
  if (voice === "data") return [o.thesis];
  const [a, b] = o.figures;
  return [o.thesis, `Los resultados lo muestran: ${a.value} ${a.unit} ${a.label}, además de ${b.value} ${b.unit} ${b.label}. Detrás de cada cifra hay un equipo de la UDES que hizo posible el trabajo.`];
}

/**
 * Lo que ve el público de un informe. Las evidencias, su avance y el estado de
 * cada ODS son internos: el importador de informes (intranet) decidirá, informe
 * por informe, si se agrega la sección de evidencias. Mientras tanto no se muestra.
 */
export const ODS_PUBLIC = { evidence: false, status: false, bulletinPick: false } as const;

/* --- Detalle del ODS 13 (el informe rehecho) -------------------------------------------------------- */

export interface Evidence {
  title: Bi;
  type: Bi;
  source: Bi;
  status: EvidenceStatus;
}
export interface IndicatorDetail {
  id: string;
  name: Bi;
  lead: Bi;
  evidence: Evidence[];
}
const ev = (te: string, ten: string, ye: string, yen: string, se: string, sen: string, status: EvidenceStatus): Evidence => ({
  title: { es: te, en: ten },
  type: { es: ye, en: yen },
  source: { es: se, en: sen },
  status,
});

export const ODS13 = {
  /** Nombres de los indicadores del marco del ODS 13 de THE: confirmar contra la metodología vigente. */
  indicators: [
    {
      id: "13.1",
      name: { es: "Investigación sobre acción climática", en: "Research on climate action" },
      lead: { es: "Producción científica y proyectos que atienden el cambio climático y la transición energética.", en: "Research output and projects addressing climate change and the energy transition." },
      evidence: [
        ev("Estufa de hidrógeno UDES", "UDES hydrogen stove", "Video", "Video", "Centro de Investigación de Hidrógeno", "Hydrogen Research Center", "ok"),
        ev("Vehículo con hidrógeno, presentado en la COP16", "Hydrogen vehicle presented at COP16", "Video", "Video", "Centro de Investigación de Hidrógeno", "Hydrogen Research Center", "ok"),
        ev("Publicaciones indexadas sobre clima, 2026", "Indexed climate publications, 2026", "Documento", "Document", "Vicerrectoría de Investigación", "Research Vice-Rectorate", "falta"),
      ],
    },
    {
      id: "13.2",
      name: { es: "Energía con bajas emisiones", en: "Low-carbon energy use" },
      lead: { es: "Consumo de energía de fuentes limpias en los campus y plan de transición.", en: "Share of clean energy in the campuses and the transition plan." },
      evidence: [
        ev("Consumo energético por fuente, 2026", "Energy use by source, 2026", "Documento", "Document", "Servicios generales", "General services", "rev"),
        ev("Paneles solares en los campus", "Solar panels on campuses", "Documento", "Document", "Infraestructura", "Infrastructure", "rev"),
        ev("Plan de transición energética", "Energy transition plan", "Documento", "Document", "Planeación", "Planning", "falta"),
      ],
    },
    {
      id: "13.3",
      name: { es: "Educación ambiental", en: "Environmental education" },
      lead: { es: "Cursos, campañas y jornadas que forman a la comunidad frente al clima.", en: "Courses, campaigns and events that educate the community on climate." },
      evidence: [
        ev("Cursos y asignaturas ambientales", "Environmental courses and subjects", "Documento", "Document", "Vicerrectoría Académica", "Academic Vice-Rectorate", "rev"),
        ev("Día sin carro y sin moto en Bucaramanga: 4.758 kg de CO₂ evitados", "Car and motorcycle free day in Bucaramanga: 4,758 kg of CO₂ avoided", "Informe", "Report", "UDES Verde", "UDES Verde", "ok"),
        ev("Programa de sensibilización UDES Verde", "UDES Verde awareness programme", "Enlace", "Link", "UDES Verde", "UDES Verde", "falta"),
      ],
    },
    {
      id: "13.4",
      name: { es: "Compromiso carbono neutral", en: "Carbon-neutral commitment" },
      lead: { es: "Certificaciones, alianzas y metas públicas de neutralidad de carbono.", en: "Certifications, partnerships and public carbon-neutrality targets." },
      evidence: [
        ev("Certificación Carbono Neutro, II Foro Nacional Santander Carbono Neutro", "Carbon Neutral Certification, II National Santander Carbon Neutral Forum", "Certificado", "Certificate", "Rectoría", "Rectorate", "ok"),
        ev("Adhesión a la Comunidad Cero de AGI Ambiental", "Membership in AGI Ambiental's Comunidad Cero", "Enlace", "Link", "UDES Verde", "UDES Verde", "ok"),
        ev("Afiliado adherente del Consejo Mundial de Energía Colombia", "Adherent affiliate of the World Energy Council Colombia", "Certificado", "Certificate", "Rectoría", "Rectorate", "ok"),
      ],
    },
  ] as IndicatorDetail[],
  /** Cifras de la edición 2025 (informe publicado). `to: null` es un hito sin número. */
  stats: [
    { to: null, unit: { es: "", en: "" }, text: { es: "Carbono Neutro otorgada durante el II Foro Nacional Santander Carbono Neutro.", en: "Carbon Neutral certification awarded at the II National Santander Carbon Neutral Forum." } },
    { to: 4758, unit: { es: "kg", en: "kg" }, text: { es: "CO₂ evitados en una sola jornada del «día sin carro y sin moto» en Bucaramanga.", en: "of CO₂ avoided in a single “car and motorcycle free day” in Bucaramanga." } },
    { to: 1, unit: { es: "galón", en: "gallon" }, text: { es: "de agua basta para que la estufa de hidrógeno cocine para 5 personas durante 3 meses.", en: "of water is enough for the hydrogen stove to cook for 5 people for 3 months." } },
    { to: 50, unit: { es: "%", en: "%" }, text: { es: "de ahorro en gasolina con el vehículo de hidrógeno presentado en la COP16.", en: "fuel savings with the hydrogen vehicle presented at COP16." } },
    { to: 110, unit: { es: "+", en: "+" }, text: { es: "instituciones del sector energético conectadas por la afiliación al WEC Colombia.", en: "energy-sector institutions reached through the WEC Colombia affiliation." } },
  ] as { to: number | null; unit: Bi; text: Bi }[],
  /** Comparación entre ediciones. Las cifras 2026 son ilustrativas. */
  compare: [
    { label: { es: "Publicaciones sobre clima", en: "Climate publications" }, y2025: 14, y2026: 19, suffix: "" },
    { label: { es: "Energía de bajas emisiones (% del consumo)", en: "Low-carbon energy (% of use)" }, y2025: 11, y2026: 16, suffix: "%" },
    { label: { es: "Estudiantes en cursos ambientales", en: "Students in environmental courses" }, y2025: 1240, y2026: 1760, suffix: "" },
    { label: { es: "CO₂ evitado en jornadas sin carro (kg)", en: "CO₂ avoided on car-free days (kg)" }, y2025: 4758, y2026: 6200, suffix: "" },
  ],
  timeline: [
    { when: "2025", title: { es: "Certificación Carbono Neutro", en: "Carbon Neutral Certification" }, text: { es: "Reconocida en el II Foro Nacional Santander Carbono Neutro.", en: "Recognised at the II National Santander Carbon Neutral Forum." }, planned: false },
    { when: "2025", title: { es: "COP16: estufa y vehículo de hidrógeno", en: "COP16: hydrogen stove and vehicle" }, text: { es: "El Centro de Hidrógeno presenta sus desarrollos ante el mundo.", en: "The Hydrogen Center presents its developments to the world." }, planned: false },
    { when: "2025", title: { es: "Afiliación al WEC Colombia", en: "WEC Colombia affiliation" }, text: { es: "La UDES entra como afiliado adherente y se conecta con más de 110 instituciones.", en: "UDES joins as an adherent affiliate and connects with 110+ institutions." }, planned: false },
    { when: "2026", title: { es: "Instituto de Plasma y Fusión Nuclear", en: "Institute of Plasma and Nuclear Fusion" }, text: { es: "Energía limpia a partir de fusión nuclear e hidrógeno, con proyección regional.", en: "Clean energy from nuclear fusion and hydrogen, with regional reach." }, planned: true },
    { when: "2026", title: { es: "Plan de transición energética", en: "Energy transition plan" }, text: { es: "Hoja de ruta de los campus hacia energía de bajas emisiones.", en: "Campus roadmap toward low-carbon energy." }, planned: true },
  ],
  videos: [
    { id: "ca2yygwGkg8", title: { es: "Estufa de hidrógeno", en: "Hydrogen stove" }, text: { es: "Cocina para una familia de cinco durante tres meses con un galón de agua.", en: "Cooks for a family of five for three months on one gallon of water." } },
    { id: "0c5HcMMhEOk", title: { es: "Vehículo de hidrógeno", en: "Hydrogen vehicle" }, text: { es: "Hasta 50 % de ahorro de gasolina, del nivel del mar a 4.000 metros.", en: "Up to 50% fuel savings, from sea level to 4,000 meters." } },
  ],
  allies: ["WEC Colombia", "Comunidad Cero · AGI Ambiental", "Foro Santander Carbono Neutro"],
};

export function odsEvidenceTotals(indicators: IndicatorDetail[] = ODS13.indicators) {
  const all = indicators.flatMap((i) => i.evidence);
  return { ok: all.filter((e) => e.status === "ok").length, rev: all.filter((e) => e.status === "rev").length, falta: all.filter((e) => e.status === "falta").length, total: all.length };
}

/** Rutas del bloque de informes ODS dentro del micrositio de THE Impact Rankings. */
export const ODS_BULLETIN_SLUG = "boletin-ods-impact";

export const ODS_ROUTES = {
  portal: "/sostenible/impact/informes",
  report: (n: number, edition?: OdsEdition) => `/sostenible/impact/informes/ods/${n}${edition ? `?edicion=${edition}` : ""}`,
  rector: "/sostenible/impact/rector",
  bulletin: "/sostenible/impact/boletin",
};
