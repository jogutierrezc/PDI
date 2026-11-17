/* =============================================================================
   Informes Institucionales · estados de un informe y quién puede moverlos.

     draft → sent → ok      (enviar: pasa de una vez a aprobado, 0281)
             sent → back → draft   (la unidad corrige y reenvía)
             ok   → back           (se devuelve para modificaciones, con nota)

   Espejo de informe_enviar / informe_cambiar_estado (0281): el Gestor (jefe)
   o Planeación envían y el informe queda aprobado. Devuelven Planeación y la
   unidad destino (el jefe de la unidad a la que se entrega). Gestor y
   Contribuyente escriben en borrador o devuelto; Consulta solo lee. La base
   lo vuelve a comprobar con su disparador.
   ========================================================================== */

import type { EstadoInstancia, RolInforme } from "./types";

export const ETIQUETA_ESTADO: Record<EstadoInstancia, string> = {
  draft: "Borrador",
  sent: "Enviado",
  ok: "Aprobado",
  back: "Devuelto",
};

const TRANSICIONES: Record<string, readonly RolInforme[]> = {
  "draft→sent": ["planeacion", "jefe"],
  "back→sent": ["planeacion", "jefe"],
  "back→draft": ["planeacion", "jefe", "editor"],
  "sent→ok": ["planeacion"],
  "sent→back": ["planeacion", "destino"],
  "ok→back": ["planeacion", "destino"],
};

export function transicionPermitida(de: EstadoInstancia, a: EstadoInstancia, rol: RolInforme | null): boolean {
  if (!rol || rol === "visor") return false;
  return TRANSICIONES[`${de}→${a}`]?.includes(rol) ?? false;
}

/** ¿Puede escribir en el informe? Solo en borrador o devuelto, y no Consulta. */
export function puedeEditar(estado: EstadoInstancia, rol: RolInforme | null): boolean {
  if (rol !== "planeacion" && rol !== "jefe" && rol !== "editor") return false;
  return estado === "draft" || estado === "back";
}

/** Lo que falta para enviar, en español. Vacío = se puede enviar. */
export function motivosNoEnviar(o: { estado: EstadoInstancia; rol: RolInforme | null; listas: number; total: number; /** Evidencias y fuentes de verificación cargadas (informe_anexos). Sin ninguna no se envía. */ anexos?: number }): string[] {
  if (o.estado === "sent") return ["Ya se envió."];
  if (o.estado === "ok") return ["Ya se envió y quedó aprobado."];
  const m: string[] = [];
  if (!transicionPermitida(o.estado, "sent", o.rol)) m.push("Solo el Gestor de la unidad o Planeación envían el informe.");
  if (o.listas < o.total) m.push(`Se habilita cuando las ${o.total} secciones estén listas (van ${o.listas}).`);
  if (o.anexos === 0) m.push("Faltan las evidencias y fuentes de verificación: cargue al menos un archivo o enlace. Es obligatorio en todo informe."); 
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
