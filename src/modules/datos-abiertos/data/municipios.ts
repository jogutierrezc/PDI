/* =============================================================================
   Ubicar un municipio de origen escrito a mano.

   Los formularios traen el municipio como llega: "BUCARAMANGA", "Cúcuta",
   "San José de Cúcuta", "Valledupar (Cesar)", "Floridablanca - Santander",
   "68001". Esto lo lleva a su código DIVIPOLA. Lo que no se puede decidir
   (una "La Unión" sin departamento, un municipio del exterior, un vacío) no
   se adivina: vuelve con su motivo y queda fuera del mapa.

   Es la misma lógica de scripts/build-mapa-origen.py; los dos caminos (la
   intranet y el generador) ubican igual.
   ========================================================================== */

import { MUNICIPIOS } from "./colombia-municipios";
import { DEPARTMENTS } from "./colombia-map";

export type LocateMiss = "sin dato" | "código inexistente" | "ambiguo" | "no encontrado";

/** Nombres de uso corriente que no son el oficial. */
const ALIAS: Record<string, string> = { BARRANCA: "BARRANCABERMEJA", "SANTA MARTA DTCH": "SANTA MARTA" };

const VACIOS = new Set(["", "NO REGISTRA", "NO APLICA", "NO INFORMA", "SIN INFORMACION", "N/A", "NA", "0", "NINGUNO"]);

/** Sin tildes, en mayúsculas, sin puntos ni comas y con un solo espacio. */
export function plano(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Formas en que suele escribirse un municipio en un formulario. */
function variantes(nombre: string): string[] {
  const base = plano(nombre);
  const out = new Set([base]);
  for (const prefijo of ["SAN JOSE DE ", "SANTIAGO DE ", "VILLA DE "]) if (base.startsWith(prefijo)) out.add(base.slice(prefijo.length));
  for (const sufijo of [" D C", " DC", " DE INDIAS", " DISTRITO CAPITAL"]) if (base.endsWith(sufijo)) out.add(base.slice(0, -sufijo.length).trim());
  return [...out];
}

const CODES = new Set(MUNICIPIOS.map(([code]) => code));
const BY_NAME = new Map<string, string[]>();
for (const [code, name] of MUNICIPIOS) {
  for (const v of variantes(name)) BY_NAME.set(v, [...(BY_NAME.get(v) ?? []), code]);
}
const DEPTS = new Map<string, string>();
for (const d of DEPARTMENTS) for (const v of variantes(d.name)) DEPTS.set(v, d.code);
for (const [alias, code] of [["BOGOTA", "11"], ["BOGOTA D C", "11"], ["NORTE SANTANDER", "54"], ["GUAJIRA", "44"], ["SAN ANDRES", "88"], ["VALLE", "76"]] as const) {
  DEPTS.set(alias, code);
}

/**
 * Código DIVIPOLA del municipio (cinco dígitos), el del departamento (dos) si
 * solo se escribió el departamento, o el motivo por el que no se ubica.
 */
export function locateMunicipio(value: unknown, department?: unknown): { code: string } | { miss: LocateMiss } {
  const raw = plano(value);
  if (VACIOS.has(raw)) return { miss: "sin dato" };
  const digits = raw.replace(/\D/g, "");
  if ((digits.length === 4 || digits.length === 5) && !/[A-Z]/.test(raw)) {
    const code = digits.padStart(5, "0");
    return CODES.has(code) ? { code } : { miss: "código inexistente" };
  }
  // "BUCARAMANGA (SANTANDER)", "BUCARAMANGA - SANTANDER", "SARAVENA-ARAUCA"
  const cleaned = raw.replace(/-/g, " ").replace(/\(/g, " ( ").replace(/\s+/g, " ").trim();
  const spaced = ALIAS[cleaned] ?? cleaned;
  const parts = spaced.split("(");
  let name = parts[0].trim();
  const rest = parts[1] ?? "";
  let dept = department ? DEPTS.get(plano(department)) : undefined;
  if (!dept && rest) dept = DEPTS.get(plano(rest.replace(")", "")));
  // Solo el departamento ("LA GUAJIRA"): suma al calor de su departamento.
  if (!BY_NAME.has(name) && DEPTS.has(name)) return { code: DEPTS.get(name)! };
  // "VALLEDUPAR CESAR": el departamento al final, sin separador.
  if (!dept && !BY_NAME.has(name)) {
    for (const dep of [...DEPTS.keys()].sort((a, b) => b.length - a.length)) {
      const head = name.slice(0, -dep.length - 1).trim();
      if (name.endsWith(` ${dep}`) && BY_NAME.has(head)) {
        name = head;
        dept = DEPTS.get(dep);
        break;
      }
    }
  }
  let candidates: string[] = [];
  for (const v of variantes(name)) {
    candidates = BY_NAME.get(v) ?? [];
    if (candidates.length) break;
  }
  if (dept) candidates = candidates.filter((c) => c.startsWith(dept!));
  if (candidates.length === 1) return { code: candidates[0] };
  return { miss: candidates.length ? "ambiguo" : "no encontrado" };
}

/** Año de un periodo escrito como llega: "2025-2", "2025-B", "20252", "2025". */
export function yearOfPeriod(value: unknown): number | null {
  const m = String(value ?? "").match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

/** El periodo tal como se muestra: "2025-2" para "2025-B" o "20252". */
export function periodLabel(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  const m = text.match(/(20\d{2})\s*[-_ ]?\s*([12AB])?/);
  if (!m) return text;
  const term = m[2] === "A" ? "1" : m[2] === "B" ? "2" : m[2];
  return term ? `${m[1]}-${term}` : m[1];
}
