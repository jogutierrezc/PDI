/* =============================================================================
   Informes Institucionales · estados de un informe y quién puede moverlos.

     draft → sent → ok
             sent → back → draft   (la unidad corrige y reenvía)
             ok   → back           (Planeación reabre uno aprobado)

   Espejo de informe_enviar / informe_cambiar_estado (0153): el Gestor (jefe)
   o Planeación envían; solo Planeación aprueba o devuelve. Gestor y
   Contribuyente escriben en borrador o devuelto; Consulta solo lee. La base
   lo vuelve a comprobar con su disparador.
   ========================================================================== */

import type { EstadoInstancia, RolActor } from "./types";

export const ETIQUETA_ESTADO: Record<EstadoInstancia, string> = {
  draft: "Borrador",
  sent: "Enviado",
  ok: "Aprobado",
  back: "Devuelto",
};

const TRANSICIONES: Record<string, readonly RolActor[]> = {
  "draft→sent": ["planeacion", "jefe"],
  "back→sent": ["planeacion", "jefe"],
  "back→draft": ["planeacion", "jefe", "editor"],
  "sent→ok": ["planeacion"],
  "sent→back": ["planeacion"],
  "ok→back": ["planeacion"],
};

export function transicionPermitida(de: EstadoInstancia, a: EstadoInstancia, rol: RolActor | null): boolean {
  if (!rol || rol === "visor") return false;
  return TRANSICIONES[`${de}→${a}`]?.includes(rol) ?? false;
}

/** ¿Puede escribir en el informe? Solo en borrador o devuelto, y no Consulta. */
export function puedeEditar(estado: EstadoInstancia, rol: RolActor | null): boolean {
  if (rol !== "planeacion" && rol !== "jefe" && rol !== "editor") return false;
  return estado === "draft" || estado === "back";
}

/** Lo que falta para enviar, en español. Vacío = se puede enviar. */
export function motivosNoEnviar(o: { estado: EstadoInstancia; rol: RolActor | null; listas: number; total: number }): string[] {
  if (o.estado === "sent") return ["Ya se envió: Planeación lo revisa."];
  if (o.estado === "ok") return ["Está aprobado y congelado."];
  const m: string[] = [];
  if (!transicionPermitida(o.estado, "sent", o.rol)) m.push("Solo el Gestor de la unidad o Planeación envían el informe.");
  if (o.listas < o.total) m.push(`Se habilita cuando las ${o.total} secciones estén listas (van ${o.listas}).`);
  return m;
}

/* ---------- Nota de revisión anclada a secciones ---------------------------- */

const LINEA_SECCION = /^§(s\d+) · [^:\n]*: (.+)$/gm;

/**
 * La nota de devolución en un solo texto (informe_cambiar_estado guarda una
 * nota): primero la general y luego una línea por sección, «§s3 · Título: nota».
 */
export function componerNota(general: string, porSeccion: { clave: string; titulo: string; nota: string }[]): string {
  const lineas = porSeccion.filter((s) => s.nota.trim()).map((s) => `§${s.clave} · ${s.titulo.replace(/:/g, "")}: ${s.nota.trim().replace(/\s*\n\s*/g, " ")}`);
  return [general.trim(), ...lineas].filter(Boolean).join("\n");
}

/** Lee la nota de vuelta: la general y la de cada sección por su clave. */
export function leerNota(nota: string | null | undefined): { general: string; porSeccion: Record<string, string> } {
  const texto = nota ?? "";
  const porSeccion: Record<string, string> = {};
  for (const m of texto.matchAll(LINEA_SECCION)) porSeccion[m[1]] = m[2].trim();
  return { general: texto.replace(LINEA_SECCION, "").trim(), porSeccion };
}

/** Clase de color de cada estado (el texto siempre acompaña: no se distingue solo por color). */
export const TONO_ESTADO: Record<EstadoInstancia | "none", "" | "blue" | "ok" | "bad" | "mid"> = {
  none: "",
  draft: "mid",
  sent: "blue",
  ok: "ok",
  back: "bad",
};
