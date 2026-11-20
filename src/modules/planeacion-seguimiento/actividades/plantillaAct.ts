/* =============================================================================
   Planeación y Seguimiento · Fase 2 · plantilla de Excel para importar la
   planificación de UNA oficina (actividades).

   Hojas: «Instrucciones», «Actividades» y, ocultas, «Listas» y «_Control». Listas
   desplegables: línea del plan (las de la oficina), responsable (correo de las
   personas de la oficina), prioridad, campus y Sí/No. Colores: amarillo = obligatorio,
   azul claro = opcional, gris = no tocar (las dos primeras filas son ejemplos y no se
   importan). Banner con el logo de la UDES. Mismo constructor que la plantilla del plan.
   ========================================================================== */

import { construirLibro, type HojaExcel, type TipoCelda } from "../../informes/ui/excel";
import { downloadBlob } from "../../admin/traslado/transfer";
import {
  ACT_PROPIA, COLUMNAS_ACT, FORMATO_ACT, HOJA_ACTIVIDADES, HOJA_CONTROL_ACT, HOJA_INSTRUCCIONES_ACT, HOJA_LISTAS_ACT, HOJA_PDI_ACT, MARCA_EJEMPLO_ACT, MAX_ACTIVIDADES, MAX_RESPONSABLES, VERSION_FORMATO_ACT, tituloColumnaAct,
} from "./columnasAct";
import { textoLineaLista } from "./importarAct";
import { PRIORIDADES_ACT, type DatosActividad, type MiembroEquipo } from "./modelo";
import type { PilarCatalogo } from "./modeloF3";
import { PDI_CON, PDI_SIN, columnasPdiExcel } from "./pdi";

type Fila = (string | number | null)[];

export interface OpcionesPlantillaAct {
  oficina: { id: string; nombre: string };
  /** Personas de la oficina a las que se puede asignar. */
  equipo: readonly Pick<MiembroEquipo, "nombre" | "correo" | "asignable" | "id">[];
  lineas: readonly { no: string; nombre: string }[];
  campus: readonly string[];
  /** Catálogo del PDI: se ofrece en la hoja de ayuda «PDI» y llena las columnas de las actividades exportadas. */
  catalogoPdi?: readonly PilarCatalogo[];
  /** Actividades con las que se llena el libro (una oficina que exporta lo suyo). Sin ellas, va vacía. */
  actividades?: readonly DatosActividad[];
  plan?: string;
  ahora?: Date;
  logo?: string;
}

const NO = null;

export function filaDeActividad(d: DatosActividad, op: Pick<OpcionesPlantillaAct, "lineas" | "equipo" | "catalogoPdi">, n: number | string): Fila {
  const linea = d.lineaNo ? op.lineas.find((l) => l.no === d.lineaNo) : null;
  const pdi = columnasPdiExcel(d.pdi, op.catalogoPdi ?? []);
  const correos = d.asignados.map((id) => op.equipo.find((m) => m.id === id)?.correo ?? null);
  return COLUMNAS_ACT.map((c): string | number | null => {
    switch (c.id) {
      case "n": return n;
      case "linea": return linea ? textoLineaLista(linea) : ACT_PROPIA;
      case "titulo": return d.titulo;
      case "descripcion": return d.descripcion || NO;
      case "inicio": return d.esHito ? NO : d.inicio;
      case "fin": return d.fin;
      case "hito": return d.esHito ? "Sí" : "No";
      case "prioridad": return d.prioridad;
      case "campus": return d.campus;
      case "pdi": return d.pdi.conexion === "sin_definir" ? NO : pdi.pdi;
      case "pilar_pdi": return pdi.pilar_pdi || NO;
      case "linea_pdi": return pdi.linea_pdi || NO;
      default: return correos[Number(c.id.slice(5)) - 1] ?? NO;
    }
  });
}

function ejemplos(op: OpcionesPlantillaAct): DatosActividad[] {
  const asignable = op.equipo.filter((m) => m.asignable);
  const campus = op.campus[0] ?? "Bucaramanga";
  const l1 = op.catalogoPdi?.flatMap((p) => p.areas.flatMap((a) => a.lineas.map((l) => ({ ...l, pillarId: p.pillarId }))))[0];
  const conPdi: DatosActividad["pdi"] = l1 ? { conexion: "con_pdi", items: [{ pillarId: l1.pillarId, lineaId: l1.lineaId }] } : { conexion: "sin_pdi", items: [] };
  return [
    {
      oficinaId: op.oficina.id, lineaNo: op.lineas[0]?.no ?? null, titulo: "Ejemplo: levantar el inventario de lo existente", descripcion: "Ejemplo de una actividad con fechas y un responsable. Esta fila no se importa.",
      inicio: "2027-02-01", fin: "2027-03-31", esHito: false, prioridad: "Alto", campus, asignados: asignable[0] ? [asignable[0].id] : [], pdi: conPdi,
    },
    {
      oficinaId: op.oficina.id, lineaNo: null, titulo: "Ejemplo: entrega del informe de cierre (hito)", descripcion: "Un hito lleva solo la fecha de fin y no tiene fecha de inicio. Esta fila no se importa.",
      inicio: null, fin: "2027-06-30", esHito: true, prioridad: "Medio", campus, asignados: [], pdi: { conexion: "sin_pdi", items: [] },
    },
  ];
}

function hojaInstrucciones(op: OpcionesPlantillaAct): HojaExcel {
  const plan = op.plan ?? "el plan";
  const secciones: { titulo: string; filas: [string, string][] }[] = [
    {
      titulo: "1. Qué es este libro",
      filas: [
        ["Para qué sirve", `Es la plantilla para crear de una sola vez la planificación de ${op.oficina.nombre}: una fila por actividad. Cada actividad contribuye a una línea de ${plan} que la oficina tiene a su cargo, o es una actividad propia de la oficina. Cuando termine, súbala en el portal: Planeación y Seguimiento › Mi planificación › Importar desde Excel.`],
        ["Qué NO hace", "Este libro no envía nada. El archivo se lee en su navegador; solo cuando usted confirma el último paso se crean las actividades, y todas o ninguna: si la base rechaza una, no se crea ninguna."],
        ["Quién puede importar", "El gestor de la oficina (y el administrador del módulo). Un gestor solo asigna a personas de su oficina: por eso los responsables se eligen por correo de una lista."],
      ],
    },
    {
      titulo: "2. Paso a paso",
      filas: [
        ["Paso 1 · Llenar", "En la hoja «Actividades» escriba una fila por actividad. Las dos primeras filas (gris, N.º «EJEMPLO») son ejemplos y no se importan. Empiece en la tercera."],
        ["Paso 2 · Guardar", "Guarde como libro de Excel (.xlsx). No lo convierta a CSV, PDF ni .xls. Tamaño máximo: 5 MB."],
        ["Paso 3 · Importar", "En el portal elija el archivo. Verá primero lo que se leyó, después los problemas por fila y columna con cómo arreglarlos, y por último crea las actividades. Las filas con error no se importan."],
      ],
    },
    {
      titulo: "3. Qué va en cada columna (hoja «Actividades»)",
      filas: [
        ["N.º", "Opcional: un número para su control. No se guarda."],
        ["Línea del plan", `Elija de la lista: las líneas que ${op.oficina.nombre} tiene a su cargo, o «${ACT_PROPIA}». Obligatoria.`],
        ["Actividad", "Qué se va a hacer, de 3 a 200 caracteres. Obligatoria."],
        ["Descripción", "Detalle, hasta 1.000 caracteres. Opcional."],
        ["Fecha de inicio y de fin", "En formato AAAA-MM-DD (por ejemplo 2027-03-15) o fecha de Excel. El fin no puede ser anterior al inicio. En un hito se deja vacía la de inicio y se escribe solo la de fin."],
        ["Es un hito", "Sí si la actividad es un momento (una entrega, una firma) y no un trabajo con duración. Vacío cuenta como No."],
        ["Prioridad", `Elija de la lista: ${PRIORIDADES_ACT.join(", ")}. Obligatoria.`],
        ["Campus", `Elija de la lista: ${op.campus.join(", ")}. Obligatoria.`],
        ["Conexión con el PDI", `Obligatoria. Elija «${PDI_CON}» si la actividad contribuye al Plan de Desarrollo Institucional, o «${PDI_SIN}» si no tiene relación con él.`],
        ["Pilar del PDI y Línea de acción del PDI", `Solo con «${PDI_CON}»: escriba al menos uno. En «Línea de acción» el código de la hoja «PDI» (por ejemplo LA-2.1.1); cada línea ya implica su pilar. En «Pilar» el nombre o el código, solo si la actividad se conecta con el pilar completo. Varios, separados por «;». Hasta 12 en total. Con «${PDI_SIN}» déjelos vacíos.`],
        ["Responsable 1 a 3", "El correo de la persona de la oficina que hará la actividad: elija de la lista. Opcional; una actividad sin responsable aparece en «Asignar» para repartirla después. Los lectores de la oficina no reciben actividades."],
      ],
    },
    {
      titulo: "4. Colores",
      filas: [
        ["Amarillo", "Obligatoria: si falta, esa fila no se importa."],
        ["Azul claro", "Opcional."],
        ["Gris", "No lo toque: son los ejemplos."],
      ],
    },
    {
      titulo: "5. Límites y errores comunes",
      filas: [
        ["Límites", `Hasta ${MAX_ACTIVIDADES} actividades por archivo y 5 MB.`],
        ["Correo que no está en la lista", "Si la persona no aparece, aún no es miembro de la oficina: pídale al administrador que la agregue en Usuarios y vuelva a descargar la plantilla."],
        ["Fórmulas", "No use fórmulas: escriba los datos directamente. Lo que sea fórmula se ignora y se le avisa."],
        ["Hoja «PDI»", "Es de ayuda: lista los pilares, áreas y líneas de acción vigentes del PDI con su código. No se importa; consúltela para llenar las dos columnas del PDI."],
        ["Cambiar encabezados u hojas", "No cambie los encabezados, el nombre de las hojas ni borre la hoja oculta _Control: así se reconoce que el libro es de esta plantilla y de esta oficina."],
      ],
    },
  ];
  const filas: Fila[] = [];
  const negritas: number[] = [];
  const celdas: { fila: number; columna: number; tipo: TipoCelda }[] = [];
  for (const s of secciones) {
    if (filas.length) filas.push(["", ""]);
    negritas.push(filas.length);
    filas.push([s.titulo, ""]);
    for (const f of s.filas) {
      if (s.titulo.startsWith("4.")) celdas.push({ fila: filas.length, columna: 0, tipo: f[0] === "Amarillo" ? "obligatoria" : f[0] === "Azul claro" ? "diligenciar" : "bloqueada" });
      filas.push(f);
    }
  }
  return {
    nombre: HOJA_INSTRUCCIONES_ACT,
    banner: { titulo: "Plantilla de la planificación de la oficina · Instrucciones", subtitulo: op.oficina.nombre, ayuda: "Lea esta hoja una vez; después llene «Actividades». Esta plantilla no envía nada: usted revisa todo en el portal antes de crear las actividades." },
    columnas: [{ titulo: "Tema", ancho: 34 }, { titulo: "Qué hacer o qué significa", ancho: 120 }],
    filas, envolver: true, negritas, celdas,
  };
}

export function hojasPlantillaActividades(op: OpcionesPlantillaAct): HojaExcel[] {
  const hoy = (op.ahora ?? new Date()).toISOString().slice(0, 10);
  const asignables = op.equipo.filter((m) => m.asignable).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const lineasTxt = [ACT_PROPIA, ...op.lineas.map(textoLineaLista)];
  const acts = op.actividades ?? [];
  const filas: Fila[] = [...ejemplos(op).map((d) => filaDeActividad(d, op, MARCA_EJEMPLO_ACT)), ...acts.map((d, i) => filaDeActividad(d, op, i + 1))];
  const idx = (id: string) => COLUMNAS_ACT.findIndex((c) => c.id === id);
  const ej = Array.from({ length: 2 }, (_, f) => COLUMNAS_ACT.map((_, c) => ({ fila: f, columna: c, tipo: "bloqueada" as const }))).flat();
  const listas: Record<number, string[] | { rango: string }> = {
    [idx("linea")]: { rango: `'${HOJA_LISTAS_ACT}'!$A$2:$A$${lineasTxt.length + 1}` },
    [idx("prioridad")]: [...PRIORIDADES_ACT],
    [idx("campus")]: [...op.campus],
    [idx("hito")]: ["Sí", "No"],
  };
  if (asignables.length) for (let i = 1; i <= MAX_RESPONSABLES; i++) listas[idx(`resp:${i}`)] = { rango: `'${HOJA_LISTAS_ACT}'!$E$2:$E$${asignables.length + 1}` };
  const filasPdi: Fila[] = (op.catalogoPdi ?? []).flatMap((p) => (p.areas.length ? p.areas.flatMap((a) => a.lineas.map((l): Fila => [`${p.codigo} · ${p.nombre}`.replace(/^ · /, ""), `${a.codigo} · ${a.nombre}`, l.codigo, l.nombre])) : [[`${p.codigo} · ${p.nombre}`, null, null, null] as Fila]));
  listas[idx("pdi")] = [PDI_CON, PDI_SIN];
  const n = Math.max(lineasTxt.length, asignables.length, op.campus.length, PRIORIDADES_ACT.length, 2);
  return [
    hojaInstrucciones(op),
    {
      nombre: HOJA_ACTIVIDADES,
      banner: {
        titulo: `Actividades · ${op.oficina.nombre}`,
        subtitulo: "Una fila por actividad. Amarillo: obligatorio. Azul claro: opcional. Gris: no lo toque.",
        ayuda: `Las dos primeras filas son ejemplos y no se importan. Hasta ${MAX_ACTIVIDADES} actividades. Los responsables se eligen por correo de la lista: solo personas de ${op.oficina.nombre}.`,
      },
      columnas: COLUMNAS_ACT.map((c) => ({ titulo: tituloColumnaAct(c), ancho: c.ancho })),
      filas,
      tipos: COLUMNAS_ACT.map((c) => c.tipo),
      celdas: ej,
      listas,
      filasLibres: acts.length ? 20 : 80,
      largos: {
        [idx("titulo")]: { min: 3, max: 200, titulo: "Actividad", ayuda: "Qué se va a hacer, de 3 a 200 caracteres.", error: "La actividad debe tener de 3 a 200 caracteres." },
        [idx("descripcion")]: { min: 0, max: 1000, titulo: "Descripción", ayuda: "Hasta 1.000 caracteres.", error: "La descripción admite hasta 1.000 caracteres." },
      },
    },
    {
      nombre: HOJA_PDI_ACT,
      banner: { titulo: "Plan de Desarrollo Institucional · catálogo de ayuda", subtitulo: "Pilares, áreas y líneas de acción vigentes", ayuda: "Hoja de consulta: no se importa. Copie el código de la línea (o el nombre del pilar) a las columnas del PDI de la hoja «Actividades»." },
      columnas: [{ titulo: "Pilar", ancho: 40 }, { titulo: "Área", ancho: 40 }, { titulo: "Código de la línea", ancho: 20 }, { titulo: "Línea de acción", ancho: 70 }],
      filas: filasPdi.length ? filasPdi : [["El catálogo del PDI no estaba disponible al descargar la plantilla.", null, null, null]],
    },
    {
      nombre: HOJA_LISTAS_ACT,
      oculta: true,
      columnas: ["Línea del plan", "Prioridad", "Campus", "Sí o No", "Responsable (correo)", "Responsable (nombre)"].map((t) => ({ titulo: t, ancho: 34 })),
      filas: Array.from({ length: n }, (_, i): Fila => [lineasTxt[i] ?? null, PRIORIDADES_ACT[i] ?? null, op.campus[i] ?? null, i === 0 ? "Sí" : i === 1 ? "No" : null, asignables[i]?.correo ?? null, asignables[i]?.nombre ?? null]),
    },
    {
      nombre: HOJA_CONTROL_ACT,
      oculta: true,
      columnas: [{ titulo: "clave" }, { titulo: "valor" }],
      filas: [["formato", FORMATO_ACT], ["version", VERSION_FORMATO_ACT], ["oficina_id", op.oficina.id], ["oficina", op.oficina.nombre], ["plan", op.plan ?? ""], ["generado", hoy], ["actividades", acts.length]],
    },
  ];
}

export const nombreArchivoPlantillaAct = (oficina: string, lleno = false): string => {
  const slug = oficina.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${lleno ? "planificacion" : "plantilla-planificacion"}-${slug || "oficina"}.xlsx`;
};

export const construirPlantillaActividades = (op: OpcionesPlantillaAct): Promise<ArrayBuffer> => construirLibro(hojasPlantillaActividades(op), { logo: op.logo, filasLibres: 0 });

async function cargarLogo(): Promise<string | undefined> {
  try {
    const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const r = await fetch(`${base}logo-udes-blanco.png`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return undefined;
  }
}

export async function descargarPlantillaActividades(op: OpcionesPlantillaAct): Promise<void> {
  const buffer = await construirPlantillaActividades({ ...op, logo: op.logo ?? (await cargarLogo()) });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivoPlantillaAct(op.oficina.nombre, Boolean(op.actividades?.length)));
}
