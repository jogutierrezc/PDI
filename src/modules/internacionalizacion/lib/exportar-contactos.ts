/* =============================================================================
   Contactos · armar lo que se exporta. Puro: recibe las filas ya leídas y devuelve
   encabezados y filas de texto; escribir el .xlsx o el .csv es de ui/descarga.

   Tres salidas:
     · «academica» y «empleadores»: SOLO las columnas de la plantilla de Rua, en su
       orden y con su grafía original (se puede volver a importar tal cual). Un
       correo que aparece más de una vez sale una sola, con la fila más reciente.
     · «libreta»: las dos listas juntas, con lo que la plantilla no lleva: campus,
       periodo, quién aportó (nombre, cargo y correo en la UDES), cuándo y por
       dónde entró. Es para revisar y archivar: deja todo lo recibido, sin quitar
       correos repetidos.
   ========================================================================== */

import { filaParaExportar, limpiar, PLANTILLAS } from "../../../../supabase/functions/int-contactos/contactos";
import type { CodigoPlantilla, DefinicionPlantilla } from "../../../../supabase/functions/int-contactos/contactos";
import type { IntEstado } from "../tipos";

export type Salida = CodigoPlantilla | "libreta";

export interface FilaFuente {
  id: string;
  hoja_id: string;
  periodo_id: string;
  campus_id: string;
  datos: Record<string, unknown>;
  origen: "manual" | "excel";
  archivo: string | null;
  aportante_id: string | null;
  canal: "interno" | "enlace";
  created_by: string | null;
  created_at: string;
}

export interface Aportante {
  nombre: string;
  cargo: string;
  correo: string;
}

export interface EntradaExportar {
  salida: Salida;
  /** Las filas de cada tabla de contactos, por plantilla. */
  filas: Readonly<Record<CodigoPlantilla, readonly FilaFuente[]>>;
  /** Id de la hoja de cada plantilla (para mirar el estado de su envío). */
  hojas: Readonly<Record<CodigoPlantilla, string>>;
  campus: readonly { id: string; name: string; code: string | null }[];
  periodos: ReadonlyMap<string, string>;
  aportantes: ReadonlyMap<string, Aportante>;
  /** Nombre de quien cargó una fila a mano o con Excel desde el panel (por id de usuario). */
  usuarios: Readonly<Record<string, string>>;
  /** Estado del envío de (periodo, hoja, campus); borrador si no hay. */
  estadoDe: (periodoId: string, hojaId: string, campusId: string) => IntEstado;
  filtro: { campus: string | null; periodo: string | null; soloAprobado: boolean };
}

export interface Exportacion {
  encabezados: string[];
  filas: string[][];
  /** Nombre del archivo sin extensión. */
  archivo: string;
  hoja: string;
  anchos: number[];
  /** Filas que sobraron por estar repetido el correo. */
  repetidas: number;
}

const ENCABEZADOS_LIBRETA = [
  "Tipo",
  "Source",
  "Title",
  "First Name",
  "Last Name",
  "Cargo (Job Title o Position)",
  "Department",
  "Institution o Company Name",
  "Industry",
  "Subject",
  "Country or Territory",
  "Email",
  "Phone (Optional)",
  "Campus",
  "Periodo",
  "Aportó",
  "Cargo en la UDES",
  "Correo de quien aportó",
  "Cuándo",
  "Entró por",
  "Archivo",
];

/** «15/10/2026 09:42» en hora de Bogotá. */
function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const sinEspacios = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** Las filas que pasan el filtro (campus, periodo, solo lo aprobado). */
export function filtrar(e: EntradaExportar, codigo: CodigoPlantilla): FilaFuente[] {
  return e.filas[codigo].filter(
    (f) =>
      (!e.filtro.campus || f.campus_id === e.filtro.campus) &&
      (!e.filtro.periodo || f.periodo_id === e.filtro.periodo) &&
      (!e.filtro.soloAprobado || e.estadoDe(f.periodo_id, e.hojas[codigo], f.campus_id) === "aprobado"),
  );
}

/** Un correo, una sola fila: la más reciente. Las filas sin correo se conservan. */
export function sinRepetidos<T extends { datos: Record<string, unknown>; created_at: string }>(filas: readonly T[]): { filas: T[]; repetidas: number } {
  const vistos = new Map<string, T>();
  const sueltas: T[] = [];
  for (const f of filas) {
    const correo = limpiar(f.datos.propio_email).toLowerCase();
    if (!correo) {
      sueltas.push(f);
      continue;
    }
    const previa = vistos.get(correo);
    if (!previa || f.created_at > previa.created_at) vistos.set(correo, f);
  }
  const salida = [...vistos.values(), ...sueltas];
  return { filas: salida, repetidas: filas.length - salida.length };
}

/** De dónde vino una fila, en palabras. */
export function entroPor(f: Pick<FilaFuente, "canal" | "origen" | "archivo">): string {
  const via = f.canal === "enlace" ? "Enlace" : "Equipo";
  return f.origen === "excel" ? `${via} · Excel${f.archivo ? ` (${f.archivo})` : ""}` : `${via} · a mano`;
}

function nombreArchivo(base: string, e: EntradaExportar): string {
  const campus = e.filtro.campus ? (e.campus.find((c) => c.id === e.filtro.campus)?.code ?? e.campus.find((c) => c.id === e.filtro.campus)?.name ?? "campus") : "todos-los-campus";
  const periodo = e.filtro.periodo ? (e.periodos.get(e.filtro.periodo) ?? "periodo") : "todos-los-periodos";
  return `${base}_${sinEspacios(campus)}_${sinEspacios(periodo)}`;
}

export function construirExportacion(e: EntradaExportar): Exportacion {
  if (e.salida !== "libreta") {
    const p: DefinicionPlantilla = PLANTILLAS[e.salida];
    const { filas, repetidas } = sinRepetidos(filtrar(e, e.salida));
    filas.sort((a, b) => limpiar(a.datos.propio_last_name).localeCompare(limpiar(b.datos.propio_last_name), "es") || limpiar(a.datos.propio_first_name).localeCompare(limpiar(b.datos.propio_first_name), "es"));
    return {
      encabezados: p.columnas.map((c) => c.encabezado),
      filas: filas.map((f) => filaParaExportar(p, f.datos)),
      archivo: nombreArchivo(p.archivo, e),
      hoja: p.hoja,
      anchos: p.columnas.map((c) => c.ancho),
      repetidas,
    };
  }

  const nombreCampus = (id: string) => e.campus.find((c) => c.id === id)?.name ?? "";
  const filas: string[][] = [];
  for (const codigo of ["academica", "empleadores"] as const) {
    const p = PLANTILLAS[codigo];
    const tipo = p.tipo === "academico" ? "Académico" : "Empleador";
    for (const f of filtrar(e, codigo)) {
      const d = f.datos;
      const a = f.aportante_id ? e.aportantes.get(f.aportante_id) : undefined;
      const interno = f.created_by ? e.usuarios[f.created_by] : undefined;
      filas.push([
        tipo,
        limpiar(d.propio_source),
        limpiar(d.propio_title),
        limpiar(d.propio_first_name),
        limpiar(d.propio_last_name),
        limpiar(codigo === "academica" ? d.propio_job_title : d.propio_position),
        limpiar(d.propio_department),
        limpiar(codigo === "academica" ? d.propio_institution : d.propio_company_name),
        limpiar(d.propio_industry),
        limpiar(d.propio_subject),
        limpiar(d.propio_country),
        limpiar(d.propio_email),
        limpiar(d.propio_phone),
        nombreCampus(f.campus_id),
        e.periodos.get(f.periodo_id) ?? "",
        a?.nombre ?? interno ?? "Equipo de Internacionalización",
        a?.cargo ?? "",
        a?.correo ?? "",
        fecha(f.created_at),
        entroPor(f),
        f.archivo ?? "",
      ]);
    }
  }
  filas.sort((a, b) => a[0].localeCompare(b[0], "es") || a[4].localeCompare(b[4], "es") || a[3].localeCompare(b[3], "es"));
  return { encabezados: ENCABEZADOS_LIBRETA, filas, archivo: nombreArchivo("libreta_contactos", e), hoja: "Libreta de contactos", anchos: ENCABEZADOS_LIBRETA.map((h) => (h.length > 18 ? 30 : 20)), repetidas: 0 };
}
