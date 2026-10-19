/* =============================================================================
   Contactos · las plantillas de nominación, la validación y el CSV. PURO: sin red,
   sin base de datos y sin imports (lo usan igual la función int-contactos, en
   Deno, y la pantalla, en el navegador; las pruebas lo importan directo).

   Las plantillas vienen de Rua (src/lib/plantillasContactos.ts) y se definen UNA
   vez: de aquí salen el .xlsx para rellenar, el .csv que se exporta y los nombres
   de columna que el importador reconoce. Las cabeceras se escriben EXACTAMENTE
   como en los archivos originales (con sus mayúsculas y el «(Optional)»): es un
   formato ajeno, y «arreglarlo» rompería el archivo para quien lo recibe.

   En la tabla (int_filas.datos) cada columna lleva una clave propia estable
   («propio_first_name»…) y como etiqueta, la cabecera original.
   ========================================================================== */

import { PAISES } from "./paises.ts";

export type TipoContacto = "academico" | "empleador";
export type CodigoPlantilla = "academica" | "empleadores";

export interface ColumnaPlantilla {
  /** La cabecera tal como viene en el archivo original. */
  encabezado: string;
  /** La clave de la columna en la tabla (int_columnas.clave, de campo propio). */
  clave: string;
  obligatoria: boolean;
  /** Qué es y de dónde sale, para la ayuda de la pantalla. */
  nota: string;
  ancho: number;
}

export interface DefinicionPlantilla {
  codigo: CodigoPlantilla;
  nombre: string;
  descripcion: string;
  tipo: TipoContacto;
  /** Nombre base del archivo, sin extensión. */
  archivo: string;
  /** La hoja del libro de Excel (31 caracteres como máximo). */
  hoja: string;
  columnas: readonly ColumnaPlantilla[];
  /** Una fila de muestra, por cabecera. */
  ejemplo: Readonly<Record<string, string>>;
  /** Cómo se llaman el libro y la hoja de la tabla donde caen los contactos. */
  libro: string;
}

export const CARPETA_CONTACTOS = "Contactos";

const c = (encabezado: string, clave: string, obligatoria: boolean, ancho: number, nota: string): ColumnaPlantilla => ({ encabezado, clave, obligatoria, ancho, nota });

const COMUN_ANTES = [
  c("Source", "propio_source", false, 22, "De dónde salió la nominación: el convenio, el congreso o la persona que la propuso."),
  c("Title", "propio_title", false, 10, "El tratamiento: Dr., Prof., Mr., Ms. Va aparte del nombre."),
  c("First Name", "propio_first_name", true, 20, "Nombre de pila."),
  c("Last Name", "propio_last_name", true, 22, "Apellidos."),
] as const;

const ACADEMICA: DefinicionPlantilla = {
  codigo: "academica",
  nombre: "Contactos académicos",
  descripcion: "Docentes e investigadores de instituciones socias.",
  tipo: "academico",
  archivo: "academic_template_V3",
  hoja: "Academic Template V3",
  libro: "Contactos académicos",
  columnas: [
    ...COMUN_ANTES,
    c("Job Title", "propio_job_title", true, 34, "El cargo tal como lo usa la persona."),
    c("Department", "propio_department", false, 30, "Facultad, escuela o unidad dentro de la institución."),
    c("Institution", "propio_institution", false, 40, "La universidad o centro al que pertenece."),
    c("Country or Territory", "propio_country", false, 24, "En español o en inglés, o el código de dos letras: México, MX, Mexico."),
    c("Email", "propio_email", true, 34, "Es la columna que identifica al contacto: si el correo ya existe, no se duplica."),
    c("Subject", "propio_subject", false, 30, "El área de conocimiento sobre la que se le nomina."),
    c("Phone (Optional)", "propio_phone", false, 20, "Con indicativo del país, si lo sabe."),
  ],
  ejemplo: {
    Source: "Convenio de movilidad 2026",
    Title: "Dr.",
    "First Name": "María Fernanda",
    "Last Name": "Ruiz Gómez",
    "Job Title": "Directora de Relaciones Internacionales",
    Department: "Facultad de Ingeniería",
    Institution: "Universidad Nacional Autónoma de México",
    "Country or Territory": "México",
    Email: "mf.ruiz@universidad.mx",
    Subject: "Ingeniería de Sistemas",
    "Phone (Optional)": "+52 55 1234 5678",
  },
};

const EMPLEADORES: DefinicionPlantilla = {
  codigo: "empleadores",
  nombre: "Contactos de empleadores",
  descripcion: "Empresas y organizaciones que contratan egresados.",
  tipo: "empleador",
  archivo: "employer_template_2024_V1",
  hoja: "Employer Template 2024",
  libro: "Contactos de empleadores",
  columnas: [
    ...COMUN_ANTES,
    c("Position", "propio_position", true, 34, "El cargo dentro de la empresa."),
    c("Industry", "propio_industry", false, 28, "El sector de la empresa: Empresa privada, Gobierno, Salud…"),
    c("Company Name", "propio_company_name", false, 40, "La empresa u organización."),
    c("Country or Territory", "propio_country", false, 24, "En español o en inglés, o el código de dos letras: Colombia, CO."),
    c("Email", "propio_email", true, 34, "Es la columna que identifica al contacto: si el correo ya existe, no se duplica."),
    c("Phone (Optional)", "propio_phone", false, 20, "Con indicativo del país, si lo sabe."),
  ],
  ejemplo: {
    Source: "Feria de empleo 2026",
    Title: "Ms.",
    "First Name": "Laura",
    "Last Name": "Restrepo Díaz",
    Position: "Gerente de Talento Humano",
    Industry: "Empresa privada",
    "Company Name": "Tecnologías Andinas S.A.S.",
    "Country or Territory": "Colombia",
    Email: "l.restrepo@tecandinas.com",
    "Phone (Optional)": "+57 300 123 4567",
  },
};

export const PLANTILLAS: Readonly<Record<CodigoPlantilla, DefinicionPlantilla>> = { academica: ACADEMICA, empleadores: EMPLEADORES };
export const LISTA_PLANTILLAS: readonly DefinicionPlantilla[] = [ACADEMICA, EMPLEADORES];

export const plantillaDeTipo = (tipo: TipoContacto): DefinicionPlantilla => (tipo === "academico" ? ACADEMICA : EMPLEADORES);
export const esTipoContacto = (x: unknown): x is TipoContacto => x === "academico" || x === "empleador";

/** Sectores sugeridos para «Industry» (los de Rua). Se acepta otro texto: solo se normaliza si coincide. */
export const SECTORES: readonly string[] = [
  "Educación superior",
  "Investigación y ciencia",
  "Gobierno",
  "Cooperación internacional",
  "Empresa privada",
  "ONG y tercer sector",
  "Salud",
  "Cultura",
  "Organismo multilateral",
  "Otro",
];

/* ---------- Texto ------------------------------------------------------------------- */

/** Sin tildes, en minúscula, solo letras y números separados por un espacio. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const limpiar = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[b.length];
}

/* ---------- Países ------------------------------------------------------------------- */

interface EntradaPais {
  codigo: string;
  nombre: string;
  clave: string;
}

const INDICE: Map<string, EntradaPais> = new Map();
const TODAS: EntradaPais[] = [];
for (const [codigo, nombre, alias] of PAISES) {
  const e: EntradaPais = { codigo, nombre, clave: normalizar(nombre) };
  TODAS.push(e);
  INDICE.set(e.clave, e);
  INDICE.set(codigo.toLowerCase(), e);
  for (const a of alias) if (!INDICE.has(normalizar(a))) INDICE.set(normalizar(a), e);
}

export type ResultadoPais = { ok: true; codigo: string; nombre: string } | { ok: false; sugerencia: string | null };

/** El país por nombre (español o inglés), alias o código ISO de dos letras. Si no, el más parecido. */
export function resolverPais(texto: string): ResultadoPais {
  const t = limpiar(texto);
  if (!t) return { ok: false, sugerencia: null };
  const clave = normalizar(t);
  const directo = INDICE.get(clave);
  if (directo) return { ok: true, codigo: directo.codigo, nombre: directo.nombre };
  let mejor: EntradaPais | null = null;
  let mejorD = Infinity;
  for (const e of TODAS) {
    const d = distancia(clave, e.clave);
    if (d < mejorD) {
      mejorD = d;
      mejor = e;
    }
  }
  return { ok: false, sugerencia: mejor && mejorD <= Math.max(2, Math.floor(clave.length / 4)) ? mejor.nombre : null };
}

/* ---------- Correo ------------------------------------------------------------------- */

const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const normalizarCorreo = (s: unknown): string => limpiar(s).toLowerCase();
export const correoValido = (s: string): boolean => CORREO.test(s) && s.length <= 254;

/** El dominio del correo (después de la @), en minúscula. */
export const dominioDe = (correo: string): string => correo.slice(correo.lastIndexOf("@") + 1).toLowerCase();

/** ¿El correo es de uno de los dominios (o de un subdominio)? Sin dominios, no se restringe. */
export function correoPermitido(correo: string, dominios: readonly string[]): boolean {
  if (!dominios.length) return true;
  const d = dominioDe(correo);
  return dominios.some((x) => {
    const dom = x.trim().toLowerCase().replace(/^@/, "");
    return d === dom || d.endsWith(`.${dom}`);
  });
}

/** Los dominios de correo institucional de la UDES: siempre se aceptan, además de los de cada invitación. */
export const DOMINIOS_INSTITUCIONALES: readonly string[] = ["udes.edu.co", "valledupar.udes.edu.co", "cucuta.udes.edu.co", "bogota.udes.edu.co", "mail.udes.edu.co"];

const limpioDominio = (x: string) => x.trim().toLowerCase().replace(/^@/, "");

/**
 * Los dominios que se SUGIEREN en el formulario: los cinco institucionales y, después,
 * los que la invitación sume. Sin repetidos y sin «@».
 */
export function dominiosSugeridos(deLaInvitacion: readonly string[] = []): string[] {
  return [...new Set([...DOMINIOS_INSTITUCIONALES, ...deLaInvitacion.map(limpioDominio)].filter(Boolean))];
}

/**
 * Los dominios que se ACEPTAN (lo que valida el servidor): los de la invitación más los cinco
 * institucionales, siempre. Una invitación sin dominios (lista vacía) no restringe a nadie.
 */
export function dominiosAceptados(deLaInvitacion: readonly string[] = []): string[] {
  return deLaInvitacion.some((d) => limpioDominio(d)) ? dominiosSugeridos(deLaInvitacion) : [];
}

/** El dominio institucional que le toca a un campus (por su nombre); udes.edu.co si no se reconoce. */
export function dominioDeCampus(nombre: string | null | undefined): string {
  const n = normalizar(nombre ?? "");
  if (n.includes("valledupar")) return "valledupar.udes.edu.co";
  if (n.includes("cucuta")) return "cucuta.udes.edu.co";
  if (n.includes("bogota")) return "bogota.udes.edu.co";
  return "udes.edu.co";
}

export type EstadoCorreo = "vacio" | "escribiendo" | "invalido" | "dominio_no_permitido" | "ok";

export interface AnalisisCorreo {
  estado: EstadoCorreo;
  /** Lo que va antes de la arroba. */
  local: string;
  /** El dominio reconocido (de la lista o un subdominio permitido), o null si aún no hay uno. */
  dominio: string | null;
  /** Lo que la persona escribió después de la arroba, si escribió una. */
  escrito: string | null;
  /** El correo completo, solo si está bien. */
  correo: string;
  /** Hubo una arroba y se separó solo el dominio. */
  separado: boolean;
}

const LOCAL = /^[A-Za-z0-9._%+-]+$/;

/**
 * Lee lo que la persona escribe en el campo de correo. Si trae arroba, separa el dominio
 * (el que reconoce de la lista); si no, usa el dominio elegido. `aceptados` vacío no restringe.
 */
export function analizarCorreo(entrada: string, elegido: string, aceptados: readonly string[], sugeridos: readonly string[] = dominiosSugeridos()): AnalisisCorreo {
  const t = entrada.replace(/\s+/g, "").trim();
  const base = { estado: "vacio" as EstadoCorreo, local: "", dominio: null as string | null, escrito: null as string | null, correo: "", separado: false };
  if (!t) return base;
  const arroba = t.lastIndexOf("@");
  if (arroba < 0) {
    const local = t;
    if (!LOCAL.test(local)) return { ...base, estado: "invalido", local, dominio: elegido };
    const correo = `${local.toLowerCase()}@${elegido}`;
    return { ...base, estado: "ok", local, dominio: elegido, correo };
  }
  const local = t.slice(0, arroba);
  const escrito = t.slice(arroba + 1).toLowerCase();
  if (local && !LOCAL.test(local)) return { ...base, estado: "invalido", local, escrito };
  if (!local) return { ...base, estado: "escribiendo", escrito };
  if (!escrito) return { ...base, estado: "escribiendo", local, escrito: "" };
  const exacto = sugeridos.find((d) => d === escrito);
  const permitido = exacto ?? (correoPermitido(`${local}@${escrito}`, aceptados) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(escrito) ? escrito : null);
  if (permitido) return { estado: "ok", local, dominio: permitido, escrito, correo: `${local.toLowerCase()}@${permitido}`, separado: true };
  // A medias («ude» puede ser el principio de «udes.edu.co» y «gmail» aún no es un dominio): no se regaña mientras escribe.
  const completo = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(escrito);
  if (!completo || sugeridos.some((d) => d.startsWith(escrito))) return { ...base, estado: "escribiendo", local, escrito };
  return { ...base, estado: "dominio_no_permitido", local, escrito };
}

/* ---------- Quién aporta ------------------------------------------------------------- */

export interface DatosAportante {
  nombre: string;
  cargo: string;
  correo: string;
}

/** Los errores de la identificación, en español; vacío si está bien. Devuelve también los datos limpios. */
export function validarAportante(a: Partial<DatosAportante>, dominios: readonly string[]): { errores: string[]; datos: DatosAportante } {
  const datos = { nombre: limpiar(a.nombre), cargo: limpiar(a.cargo), correo: normalizarCorreo(a.correo) };
  const errores: string[] = [];
  const aceptados = dominiosAceptados(dominios);
  if (datos.nombre.length < 3 || datos.nombre.length > 160) errores.push("Escriba su nombre completo.");
  if (datos.cargo.length < 2 || datos.cargo.length > 120) errores.push("Escriba su cargo en la UDES.");
  if (!correoValido(datos.correo)) errores.push("El correo no tiene forma de correo.");
  else if (!correoPermitido(datos.correo, aceptados)) errores.push(`Use su correo institucional (${aceptados.map((d) => `@${d}`).join(", ")}).`);
  return { errores, datos };
}

/* ---------- Una fila de contacto ----------------------------------------------------- */

/** Una fila tal como la escribe la persona o viene del archivo: por cabecera original. */
export type FilaCruda = Record<string, string>;
/** Lo que se guarda en int_filas.datos: por clave de columna. */
export type DatosContacto = Record<string, string>;

export interface FilaValidada {
  datos: DatosContacto;
  errores: string[];
  avisos: string[];
  /** El correo en minúscula (la identidad), o "" si no había. */
  correo: string;
}

/**
 * Valida una fila contra su plantilla (Rua: la estructura se comprueba aquí; que el
 * buzón exista es un segundo paso que no se hace). Los nombres de columna son los de
 * la plantilla; el país se escribe con su nombre en español.
 */
export function validarFila(plantilla: DefinicionPlantilla, cruda: FilaCruda): FilaValidada {
  const errores: string[] = [];
  const avisos: string[] = [];
  const datos: DatosContacto = {};
  for (const col of plantilla.columnas) {
    const v = limpiar(cruda[col.encabezado]);
    if (v) datos[col.clave] = v;
    else if (col.obligatoria) errores.push(`Falta «${col.encabezado}».`);
  }
  const maxLargo = 200;
  for (const [clave, v] of Object.entries(datos)) if (v.length > maxLargo) errores.push(`«${plantilla.columnas.find((x) => x.clave === clave)?.encabezado ?? clave}» es demasiado largo.`);

  const nombre = `${datos.propio_first_name ?? ""} ${datos.propio_last_name ?? ""}`.trim();
  if (nombre && (nombre.length < 3 || nombre.length > 160)) errores.push("El nombre completo debe tener entre 3 y 160 caracteres.");
  const cargo = datos[plantilla.tipo === "academico" ? "propio_job_title" : "propio_position"];
  if (cargo && (cargo.length < 2 || cargo.length > 120)) errores.push("El cargo debe tener entre 2 y 120 caracteres.");

  let correo = "";
  if (datos.propio_email) {
    correo = normalizarCorreo(datos.propio_email);
    if (!correoValido(correo)) errores.push("El correo no tiene forma de correo.");
    else datos.propio_email = correo;
  }
  if (datos.propio_country) {
    const p = resolverPais(datos.propio_country);
    if (p.ok) datos.propio_country = p.nombre;
    else errores.push(p.sugerencia ? `País no reconocido. ¿Quiso decir «${p.sugerencia}»?` : "País no reconocido.");
  }
  if (datos.propio_industry) {
    const s = SECTORES.find((x) => normalizar(x) === normalizar(datos.propio_industry));
    if (s) datos.propio_industry = s;
    else avisos.push("El sector no es uno de la lista; se guarda tal cual.");
  }
  if (datos.propio_phone && datos.propio_phone.length > 40) errores.push("El teléfono es demasiado largo.");
  return { datos, errores, avisos, correo };
}

/* ---------- Archivos ----------------------------------------------------------------- */

export interface EmparejoEncabezados {
  /** Posición de cada columna de la plantilla en el archivo (por cabecera original). */
  indice: Record<string, number>;
  /** Cabeceras obligatorias que no aparecen. */
  faltantes: string[];
  /** Cabeceras del archivo que la plantilla no conoce. */
  extras: string[];
}

const clavePlantilla = (e: string) => normalizar(e).replace(/ optional$/, "");

/** Empareja las cabeceras de un archivo con las de la plantilla (sin distinguir mayúsculas, tildes ni «(Optional)»). */
export function emparejarEncabezados(encabezados: readonly string[], plantilla: DefinicionPlantilla): EmparejoEncabezados {
  const indice: Record<string, number> = {};
  const extras: string[] = [];
  const porClave = new Map(plantilla.columnas.map((col) => [clavePlantilla(col.encabezado), col.encabezado] as const));
  encabezados.forEach((h, i) => {
    const original = porClave.get(clavePlantilla(limpiar(h)));
    if (original && !(original in indice)) indice[original] = i;
    else if (limpiar(h)) extras.push(limpiar(h));
  });
  return { indice, faltantes: plantilla.columnas.filter((x) => x.obligatoria && !(x.encabezado in indice)).map((x) => x.encabezado), extras };
}

export interface LecturaMatriz {
  /** La fila (desde 1) donde estaban las cabeceras, o 0 si no se encontraron. */
  filaEncabezado: number;
  emparejo: EmparejoEncabezados;
  /** Las filas de datos, por cabecera original; `fila` es el número en el archivo. */
  filas: { fila: number; cruda: FilaCruda }[];
}

/** Lee una matriz de texto (un CSV o una hoja de Excel): busca la fila de cabeceras y arma las filas. */
export function leerMatriz(matriz: readonly (readonly unknown[])[], plantilla: DefinicionPlantilla): LecturaMatriz {
  let mejor = { fila: -1, aciertos: 0 };
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const e = emparejarEncabezados(matriz[i].map(limpiar), plantilla);
    const aciertos = Object.keys(e.indice).length;
    if (aciertos > mejor.aciertos) mejor = { fila: i, aciertos };
  }
  if (mejor.fila < 0 || mejor.aciertos < 2) return { filaEncabezado: 0, emparejo: { indice: {}, faltantes: plantilla.columnas.filter((x) => x.obligatoria).map((x) => x.encabezado), extras: [] }, filas: [] };
  const emparejo = emparejarEncabezados(matriz[mejor.fila].map(limpiar), plantilla);
  const filas: LecturaMatriz["filas"] = [];
  for (let i = mejor.fila + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (!celdas.some((x) => limpiar(x))) continue;
    const cruda: FilaCruda = {};
    for (const [enc, pos] of Object.entries(emparejo.indice)) cruda[enc] = limpiar(celdas[pos]);
    filas.push({ fila: i + 1, cruda });
  }
  return { filaEncabezado: mejor.fila + 1, emparejo, filas };
}

/* ---------- CSV ---------------------------------------------------------------------- */

/** Un CSV a matriz de texto: separador coma, punto y coma o tabulación (el de la primera línea); comillas dobles; BOM. */
export function parsearCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entre = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (entre) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') entre = false;
      else celda += ch;
    } else if (ch === '"') entre = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Una celda de CSV: entre comillas si lleva coma, comillas, salto de línea o espacios en las puntas. */
const celdaCsv = (v: string) => (/[",;\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** El CSV de una plantilla: UTF-8 con BOM (Excel lee bien las tildes), fin de línea CRLF y las cabeceras originales. */
export function aCsv(encabezados: readonly string[], filas: readonly (readonly string[])[]): string {
  return `﻿${[encabezados, ...filas].map((f) => f.map((v) => celdaCsv(v ?? "")).join(",")).join("\r\n")}\r\n`;
}

/* ---------- Exportar ------------------------------------------------------------------ */

/** Una fila guardada (int_filas.datos) como fila de la plantilla, en el orden de sus cabeceras. */
export function filaParaExportar(plantilla: DefinicionPlantilla, datos: Readonly<Record<string, unknown>>): string[] {
  return plantilla.columnas.map((col) => limpiar(datos[col.clave]));
}

/** Los datos guardados como fila cruda por cabecera (para editar una fila existente). */
export function crudaDesdeDatos(plantilla: DefinicionPlantilla, datos: Readonly<Record<string, unknown>>): FilaCruda {
  return Object.fromEntries(plantilla.columnas.map((col) => [col.encabezado, limpiar(datos[col.clave])]));
}

/* ---------- Límites ------------------------------------------------------------------- */

export const MAX_FILAS_POR_ENVIO = 500;
export const LIMITE_POR_PERSONA = 200;
export const MAX_FILAS_ARCHIVO = 2000;

export type AccionFila = "crear" | "actualizar" | "omitir" | "error";

export const ETIQUETA_ACCION: Record<AccionFila, string> = {
  crear: "Nueva",
  actualizar: "Se actualizará",
  omitir: "Ya estaba",
  error: "Error",
};

/* ---------- Un envío completo ----------------------------------------------------------- */

export interface FilaEnvio {
  /** El número de la fila en el archivo (o 1 si se escribió a mano). */
  fila: number;
  cruda: FilaCruda;
}

export interface ResultadoFila {
  fila: number;
  accion: AccionFila;
  motivo: string | null;
  avisos: string[];
}

/** Lo que dice la base de cada fila que le llegó (int_contactos_revisar / recibir). */
export interface ResultadoBase {
  fila: number;
  accion: AccionFila;
  motivo: string | null;
}

/**
 * Valida las filas de un envío: las buenas van a la base y las que ya traen un error
 * se quedan con él (no hace falta preguntarle nada a la base).
 */
export function prepararEnvio(plantilla: DefinicionPlantilla, filas: readonly FilaEnvio[]): { paraBase: { fila: number; datos: DatosContacto }[]; locales: ResultadoFila[]; avisos: Map<number, string[]> } {
  const paraBase: { fila: number; datos: DatosContacto }[] = [];
  const locales: ResultadoFila[] = [];
  const avisos = new Map<number, string[]>();
  for (const f of filas) {
    const v = validarFila(plantilla, f.cruda);
    if (v.avisos.length) avisos.set(f.fila, v.avisos);
    if (v.errores.length) locales.push({ fila: f.fila, accion: "error", motivo: v.errores.join(" "), avisos: v.avisos });
    else paraBase.push({ fila: f.fila, datos: v.datos });
  }
  return { paraBase, locales, avisos };
}

/** Junta lo local y lo de la base en una sola lista, en el orden del archivo. */
export function combinarResultados(locales: readonly ResultadoFila[], deBase: readonly ResultadoBase[], avisos: ReadonlyMap<number, string[]>): ResultadoFila[] {
  const base: ResultadoFila[] = deBase.map((r) => ({ fila: r.fila, accion: r.accion, motivo: r.motivo, avisos: avisos.get(r.fila) ?? [] }));
  return [...locales, ...base].sort((a, b) => a.fila - b.fila);
}

/** Los totales de una lista de resultados. */
export function totales(resultados: readonly ResultadoFila[]): Record<AccionFila, number> {
  const t: Record<AccionFila, number> = { crear: 0, actualizar: 0, omitir: 0, error: 0 };
  for (const r of resultados) t[r.accion]++;
  return t;
}
