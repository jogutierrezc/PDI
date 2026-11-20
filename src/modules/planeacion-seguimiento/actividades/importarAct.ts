/* =============================================================================
   Planeación y Seguimiento · Fase 2 · importar las actividades de una oficina desde Excel.

   `analizarActividades` es PURO (recibe hojas ya leídas como texto): valida cada fila con
   las mismas reglas del formulario (reglas.ts) y devuelve las actividades listas y los
   problemas por hoja, fila y columna, en español y con cómo arreglarlos. Una fila con
   error no se importa; lo vacío queda vacío. `leerLibro` (exceljs) viene de ../importar.
   El responsable se identifica por CORREO y debe ser miembro de la oficina: un gestor
   solo asigna a su gente.
   ========================================================================== */

import type { HojaCruda, Problema } from "../importar";
import { leerFecha } from "../importar";
import { baseDeEncabezado } from "../columnas";
import { llano } from "../modelo";
import { ACT_PROPIA, COLUMNAS_ACT, FORMATO_ACT, HOJA_ACTIVIDADES, HOJA_CONTROL_ACT, MARCA_EJEMPLO_ACT, MAX_ACTIVIDADES, MAX_RESPONSABLES, VERSION_FORMATO_ACT, colAct, type CampoAct } from "./columnasAct";
import { PRIORIDADES_ACT, type DatosActividad, type MiembroEquipo } from "./modelo";
import type { PilarCatalogo } from "./modeloF3";
import { leerPdiExcel } from "./pdi";
import { validarActividad } from "./reglas";

export interface ActividadLeida {
  fila: number;
  titulo: string;
  /** Lista para crear; nula si la fila tiene errores. */
  datos: DatosActividad | null;
  problemas: Problema[];
}

export interface ResultadoActividades {
  error: string | null;
  origen: "plantilla" | "otro" | null;
  /** Oficina para la que se descargó la plantilla (de la hoja _Control). */
  oficinaDelArchivo: { id: string; nombre: string } | null;
  filas: ActividadLeida[];
  generales: Problema[];
  ejemplosIgnorados: number;
  formulasIgnoradas: number;
}

export interface OpcionesActividades {
  oficinaId: string;
  oficinaNombre: string;
  lineas: readonly { no: string; nombre: string }[];
  equipo: readonly Pick<MiembroEquipo, "id" | "nombre" | "correo" | "asignable">[];
  campus: readonly string[];
  /** Catálogo del PDI (`ps_pdi_catalogo`) para leer `pilar_pdi` y `linea_pdi`. Sin él, solo vale «Sin conexión». */
  catalogoPdi?: readonly PilarCatalogo[];
}

const SI = new Set(["si", "s", "1", "verdadero", "true", "x"]);
const NO = new Set(["no", "n", "0", "falso", "false"]);
const vacio = (error: string, generales: Problema[] = []): ResultadoActividades => ({ error, origen: null, oficinaDelArchivo: null, filas: [], generales, ejemplosIgnorados: 0, formulasIgnoradas: 0 });
const cortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** El texto con que la lista desplegable ofrece una línea: «12 · Nombre». */
export const textoLineaLista = (l: { no: string; nombre: string }): string => `${l.no} · ${cortar(l.nombre.replace(/\s+/g, " ").trim(), 110)}`;

function hallarEncabezado(filas: string[][]): number {
  const clave = new Set(COLUMNAS_ACT.filter((x) => x.tipo === "obligatoria").map((x) => llano(x.base)));
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    if (filas[i].filter((x) => clave.has(llano(baseDeEncabezado(x)))).length >= 3) return i;
  }
  return -1;
}

export function analizarActividades(hojas: HojaCruda[], op: OpcionesActividades): ResultadoActividades {
  const hoja = hojas.find((h) => llano(h.nombre) === llano(HOJA_ACTIVIDADES));
  if (!hoja) {
    return vacio(`No encuentro la hoja «${HOJA_ACTIVIDADES}». Este libro tiene: ${hojas.filter((h) => !h.oculta).map((h) => `«${h.nombre}»`).join(", ") || "ninguna hoja visible"}. Use la plantilla de la página «Importar desde Excel» y no cambie el nombre de sus hojas.`);
  }
  const generales: Problema[] = [];
  const general = (nivel: Problema["nivel"], mensaje: string, hojaNombre = hoja.nombre, fila: number | null = null): Problema => ({ nivel, hoja: hojaNombre, fila, columna: null, mensaje });

  const control = hojas.find((h) => llano(h.nombre) === llano(HOJA_CONTROL_ACT));
  const dic = new Map((control?.filas ?? []).map((f) => [llano(f[0] ?? ""), (f[1] ?? "").trim()]));
  let origen: ResultadoActividades["origen"] = "otro";
  let oficinaDelArchivo: ResultadoActividades["oficinaDelArchivo"] = null;
  if (dic.get("formato") === FORMATO_ACT) {
    origen = "plantilla";
    if (Number(dic.get("version")) > VERSION_FORMATO_ACT) generales.push(general("aviso", "El libro es de una versión más nueva de la plantilla. Se leyó con las reglas de esta; descargue la plantilla de nuevo si algo no cuadra.", HOJA_CONTROL_ACT));
    const id = dic.get("oficina_id");
    if (id) oficinaDelArchivo = { id, nombre: dic.get("oficina") ?? "" };
    if (id && id !== op.oficinaId) {
      return { ...vacio(`Esta plantilla se descargó para «${dic.get("oficina") ?? "otra oficina"}» y usted está importando la planificación de «${op.oficinaNombre}». Cambie de oficina arriba, o descargue la plantilla de esta oficina: así los correos y las líneas de las listas son los correctos.`, generales), oficinaDelArchivo };
    }
  } else {
    generales.push(general("aviso", "El libro no trae la hoja oculta «_Control» de la plantilla: se leyó por los encabezados. Si algo sale mal, descargue la plantilla y copie sus datos.", HOJA_CONTROL_ACT));
  }

  const filaEnc = hallarEncabezado(hoja.filas);
  if (filaEnc < 0) return vacio(`No encuentro los encabezados en la hoja «${hoja.nombre}» (Línea del plan, Actividad, Fecha de fin…). No los cambie ni borre la banda de arriba: descargue la plantilla y copie sus datos.`, generales);
  const indice = new Map<CampoAct, number>();
  hoja.filas[filaEnc].forEach((t, i) => {
    const col = COLUMNAS_ACT.find((x) => llano(x.base) === llano(baseDeEncabezado(t)));
    if (col && !indice.has(col.id)) indice.set(col.id, i);
  });
  const faltan = COLUMNAS_ACT.filter((x) => !indice.has(x.id));
  const faltanObl = faltan.filter((x) => x.tipo === "obligatoria");
  if (faltanObl.length) return vacio(`A la hoja «${hoja.nombre}» le faltan columnas obligatorias: ${faltanObl.map((x) => `«${x.base}»`).join(", ")}. No cambie los encabezados: descargue la plantilla y copie sus datos.`, generales);
  if (faltan.length) generales.push(general("aviso", `No hay columna para: ${faltan.map((x) => `«${x.base}»`).join(", ")}. Esas actividades quedan sin ese dato.`, hoja.nombre, filaEnc + 1));

  let formulasIgnoradas = 0;
  hoja.formulas?.forEach(() => (formulasIgnoradas += 1));
  if (formulasIgnoradas) generales.push(general("aviso", `Hay ${formulasIgnoradas} celda${formulasIgnoradas === 1 ? "" : "s"} con fórmula: se ignoraron y quedaron vacías. Escriba los datos directamente.`));

  const lineasPorNo = new Map(op.lineas.map((l) => [llano(l.no), l.no]));
  const equipoPorCorreo = new Map(op.equipo.map((m) => [m.correo.trim().toLowerCase(), m]));
  const filas: ActividadLeida[] = [];
  const vistas = new Map<string, number>();
  let ejemplosIgnorados = 0;
  let excedido = false;

  for (let r = filaEnc + 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r];
    if (fila.every((x) => !x.trim())) continue;
    const celda = (id: CampoAct) => (fila[indice.get(id) ?? -1] ?? "").trim();
    if (llano(celda("n")).startsWith(llano(MARCA_EJEMPLO_ACT))) {
      ejemplosIgnorados += 1;
      continue;
    }
    if (filas.length >= MAX_ACTIVIDADES) {
      excedido = true;
      break;
    }
    const nFila = r + 1;
    const problemas: Problema[] = [];
    const con = new Set<string>();
    const poner = (nivel: Problema["nivel"], id: CampoAct, mensaje: string) => {
      problemas.push({ nivel, hoja: hoja.nombre, fila: nFila, columna: colAct(id).base, mensaje });
      if (nivel === "error") con.add(id);
    };

    // Línea del plan
    const lineaTxt = celda("linea");
    let lineaNo: string | null = null;
    if (!lineaTxt) poner("error", "linea", "Falta la línea del plan. Elija una de la lista o «Actividad propia de la oficina».");
    else if (llano(lineaTxt) === llano(ACT_PROPIA)) lineaNo = null;
    else {
      const cod = /^\s*#?\s*([^\s·]+)\s*(?:·|$)/.exec(lineaTxt)?.[1] ?? "";
      const no = lineasPorNo.get(llano(cod));
      if (no) lineaNo = no;
      else poner("error", "linea", `«${cortar(lineaTxt, 60)}» no es una línea a cargo de ${op.oficinaNombre}. Elija una de la lista desplegable: así se evita escribirla mal.`);
    }

    const titulo = celda("titulo");
    const descripcion = celda("descripcion");

    const esHitoTxt = celda("hito");
    let esHito = false;
    if (esHitoTxt) {
      if (SI.has(llano(esHitoTxt))) esHito = true;
      else if (!NO.has(llano(esHitoTxt))) poner("error", "hito", `«${esHitoTxt}» no es Sí ni No. Elija de la lista o deje la celda vacía (cuenta como No).`);
    }

    const fechaDe = (id: "inicio" | "fin"): string | null => {
      const t = celda(id);
      if (!t) return null;
      const f = leerFecha(t);
      if (!f) poner("error", id, `«${cortar(t, 30)}» no es una fecha válida. Escríbala como AAAA-MM-DD (por ejemplo 2027-03-15) o como fecha de Excel.`);
      return f;
    };
    const inicio = fechaDe("inicio");
    const fin = fechaDe("fin");

    const prioTxt = celda("prioridad");
    let prioridad = "";
    if (prioTxt) {
      const p = PRIORIDADES_ACT.find((x) => llano(x) === llano(prioTxt));
      if (p) prioridad = p;
      else poner("error", "prioridad", `«${prioTxt}» no es una prioridad válida. Elija de la lista: ${PRIORIDADES_ACT.join(", ")}.`);
    }

    const campusTxt = celda("campus");
    let campus = "";
    if (campusTxt) {
      const k = op.campus.find((x) => llano(x) === llano(campusTxt));
      if (k) campus = k;
      else poner("error", "campus", `El campus «${campusTxt}» no existe en la lista de campus del portal. Elija uno de la lista: ${op.campus.join(", ")}.`);
    }

    // Conexión con el PDI (obligatoria al importar): pdi, pilar_pdi, linea_pdi
    const pdiLeido = leerPdiExcel(celda("pdi"), celda("pilar_pdi"), celda("linea_pdi"), op.catalogoPdi ?? []);
    for (const er of pdiLeido.errores) poner("error", er.columna, er.mensaje);

    // Responsables (por correo, miembros de la oficina)
    const asignados: string[] = [];
    for (let i = 1; i <= MAX_RESPONSABLES; i++) {
      const id = `resp:${i}` as CampoAct;
      if (!indice.has(id)) continue;
      const t = celda(id);
      if (!t) continue;
      const m = equipoPorCorreo.get(t.toLowerCase());
      if (!m) poner("error", id, `«${cortar(t, 50)}» no es el correo de un miembro de ${op.oficinaNombre}. Un gestor solo asigna a la gente de su oficina: elija de la lista, o pídale al administrador que agregue a la persona en Usuarios.`);
      else if (!m.asignable) poner("error", id, `${m.nombre} es lectora de la oficina y no recibe actividades.`);
      else if (asignados.includes(m.id)) poner("aviso", id, `${m.nombre} está repetida en esta fila; se cuenta una vez.`);
      else asignados.push(m.id);
    }

    // Las reglas del formulario sobre lo ya leído (sin repetir lo que ya se dijo de la misma columna).
    const datos: DatosActividad = {
      oficinaId: op.oficinaId, lineaNo, titulo, descripcion, inicio: esHito ? null : inicio, fin, esHito,
      prioridad: (prioridad || "") as DatosActividad["prioridad"], campus, asignados, pdi: pdiLeido.seleccion,
    };
    const colDeCampo: Record<string, CampoAct> = { "act-titulo": "titulo", "act-descripcion": "descripcion", "act-linea": "linea", "act-inicio": "inicio", "act-fin": "fin", "act-prioridad": "prioridad", "act-campus": "campus" };
    for (const e of validarActividad(datos, { lineas: op.lineas.map((l) => l.no), campus: op.campus, equipo: op.equipo })) {
      const id = colDeCampo[e.campo];
      if (!id || con.has(id)) continue;
      if (e.campo === "act-titulo") poner("error", "titulo", `Falta la actividad (qué se va a hacer). Es obligatoria: escríbala en la celda amarilla.`);
      else if (e.campo === "act-prioridad") poner("error", "prioridad", "Falta la prioridad. Elija de la lista.");
      else if (e.campo === "act-campus") poner("error", "campus", "Falta el campus. Elija de la lista.");
      else poner("error", id, e.mensaje);
    }

    const clave = `${llano(lineaNo ?? "propia")}|${llano(titulo)}|${fin ?? ""}`;
    const previa = titulo ? vistas.get(clave) : undefined;
    if (previa !== undefined) problemas.push({ nivel: "aviso", hoja: hoja.nombre, fila: nFila, columna: colAct("titulo").base, mensaje: `Parece repetida: tiene la misma línea, actividad y fecha de fin que la fila ${previa}. Se importa; borre una si no era a propósito.` });
    else if (titulo) vistas.set(clave, nFila);

    const hayError = problemas.some((p) => p.nivel === "error");
    filas.push({ fila: nFila, titulo, problemas, datos: hayError ? null : { ...datos, titulo: titulo.trim(), prioridad: prioridad as DatosActividad["prioridad"] } });
  }
  if (excedido) generales.push(general("aviso", `El libro tiene más de ${MAX_ACTIVIDADES} actividades: entraron las primeras ${MAX_ACTIVIDADES} y el resto no se leyó. Divida el archivo.`));
  if (!filas.length) generales.push(general("aviso", "No encontré ninguna actividad para importar. Escríbalas a partir de la tercera fila de datos (las dos primeras son ejemplos).", hoja.nombre, filaEnc + 1));
  return { error: null, origen, oficinaDelArchivo, filas, generales, ejemplosIgnorados, formulasIgnoradas };
}

export const actividadesListas = (r: ResultadoActividades): DatosActividad[] => r.filas.flatMap((f) => (f.datos ? [f.datos] : []));
export const problemasDeActividades = (r: ResultadoActividades): Problema[] => [...r.generales, ...r.filas.flatMap((f) => f.problemas)];
