/* =============================================================================
   Lógica pura de los avisos de Planeación y Seguimiento (migraciones 0287 y 0288).

   Sin imports ni acceso a Deno: se puede probar con vitest
   (tests/planeacion-seguimiento/avisos.test.ts). La usa index.ts.
   ========================================================================== */

export const INTENTOS = 3;
export const POR_LOTE = 20;

export interface AvisoCola {
  id: number;
  plantilla: string;
  destinatario_id: string;
  actividad_id: string | null;
  datos: Record<string, unknown>;
  intentos: number;
}

export interface Redaccion {
  titulo: string;
  detalle: string;
  oficina: string;
  fecha_limite: string;
  dias: string;
  comentario: string;
  autor: string;
}

/** Texto corto y sin saltos de línea; los marcadores {{…}} los quita la función `correos`. */
export const limpio = (v: unknown, max = 300): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v) : "";

export const esPlantillaPs = (clave: unknown): clave is string => typeof clave === "string" && /^c-ps-[a-z0-9-]{1,30}$/.test(clave);

/** «hoy», «mañana» o «N días». */
export function etiquetaDias(n: unknown): string {
  const d = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(d)) return "";
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `${d} días`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** «$ 1.234.000» (pesos colombianos) o vacío si no es un número. */
export function pesos(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? `$ ${Math.round(n).toLocaleString("es-CO")}` : "";
}

const RESULTADO_VAF: Record<string, string> = { aprobada: "aprobada", aprobada_con_ajustes: "aprobada con ajustes", no_viable: "no viable" };

/** «Avance físico: 40 %. Avance financiero: 10 %.» con lo que dejó la base en datos (fisico, financiero); vacío si no hay. */
export function textoAvance(d: Record<string, unknown>): string {
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const fis = num(d.fisico);
  const fin = num(d.financiero);
  return [fis !== null ? `Avance físico: ${fis} %.` : "", fin !== null ? `Avance financiero: ${fin} %.` : ""].filter(Boolean).join(" ");
}

/** El título y el detalle de cada aviso, con lo que dejó la base en ps_avisos.datos. */
export function redactar(a: Pick<AvisoCola, "plantilla" | "datos">): Redaccion {
  const d = a.datos;
  const actividad = limpio(d.actividad, 200) || "una actividad";
  const oficina = limpio(d.oficina, 120);
  const fin = limpio(d.fin, 20);
  const nota = limpio(d.nota, 600);
  const base = [
    `«${actividad}»`,
    limpio(d.linea, 200) ? `Línea: ${limpio(d.linea, 200)}.` : "",
    oficina ? `Oficina: ${oficina}.` : "",
    limpio(d.campus, 60) ? `Campus: ${limpio(d.campus, 60)}.` : "",
    limpio(d.prioridad, 20) ? `Prioridad: ${limpio(d.prioridad, 20)}.` : "",
    fin ? `Fecha de fin: ${fin}.` : "Sin fecha de fin.",
  ]
    .filter(Boolean)
    .join(" ");
  const salida = (titulo: string, detalle: string, extra: Partial<Redaccion> = {}): Redaccion => ({
    titulo,
    detalle,
    oficina,
    fecha_limite: fin,
    dias: "",
    comentario: nota,
    autor: limpio(d.actor, 120),
    ...extra,
  });

  switch (a.plantilla) {
    case "c-ps-asignacion":
      return salida("Le asignaron una actividad", `${base}${nota ? ` Nota: ${nota}` : ""}`);
    case "c-ps-transferencia": {
      const quien = `de ${limpio(d.de, 120) || "otra persona"} a ${limpio(d.a, 120) || "otra persona"}`;
      const motivo = nota ? ` Motivo: ${nota}` : "";
      const rol = limpio(d.rol, 10);
      const titulo = rol === "recibe" ? "Le transfirieron una actividad" : rol === "cede" ? "Su actividad pasó a otra persona" : "Una actividad de su oficina cambió de responsable";
      return salida(titulo, `${base} La asignación pasó ${quien}.${motivo}`);
    }
    case "c-ps-avance": {
      const av = textoAvance(d);
      return salida("Hay un avance por revisar", `${base}${av ? ` ${av}` : ""}${nota ? ` Nota: ${nota}` : ""}`);
    }
    case "c-ps-validado": {
      const av = textoAvance(d);
      return salida("Su avance quedó validado", `${base}${av ? ` ${av}` : ""}${nota ? ` Nota del gestor: ${nota}` : ""}`);
    }
    case "c-ps-validacion-pendiente": {
      const n = Math.max(1, Number(d.n) || 1);
      const lista = limpio(d.actividades, 300);
      return salida(
        `Hay ${n} ${plural(n, "avance esperando", "avances esperando")} su revisión`,
        `${oficina ? `Oficina: ${oficina}. ` : ""}${n} ${plural(n, "avance lleva", "avances llevan")} más del plazo de validación sin respuesta.${lista ? ` Actividades: ${lista}.` : ""}`,
        { comentario: "" },
      );
    }
    case "c-ps-devuelto":
      return salida("Le devolvieron una actividad", `${base}${nota ? ` Nota del gestor: ${nota}` : ""}`);
    case "c-ps-por-vencer": {
      const dias = etiquetaDias(d.dias);
      const titulo = dias === "hoy" ? "Una actividad vence hoy" : dias === "mañana" ? "Una actividad vence mañana" : `Una actividad vence en ${dias}`;
      return salida(titulo, base, { dias });
    }
    case "c-ps-vencida": {
      const n = Number(d.dias);
      const atraso = Number.isFinite(n) && n > 0 ? ` Lleva ${n} ${plural(n, "día", "días")} de retraso.` : "";
      if (limpio(d.rol, 10) === "gestor") {
        const quien = limpio(d.responsables, 300);
        return salida("Una actividad de su oficina está vencida", `${base}${quien ? ` Responsable: ${quien}.` : ""}${atraso}`, { dias: Number.isFinite(n) ? String(n) : "" });
      }
      return salida("Una actividad suya está vencida", `${base}${atraso}`, { dias: Number.isFinite(n) ? String(n) : "" });
    }
    case "c-ps-cumplida":
      return salida("Una actividad quedó hecha", `${base}${nota ? ` Nota: ${nota}` : ""}`);
    case "c-ps-vaf-evaluar": {
      const plan = limpio(d.plan, 160) || "un plan";
      const monto = pesos(d.monto);
      return salida(
        "Un plan espera evaluación financiera",
        `Plan: «${plan}».${oficina ? ` Oficina dueña: ${oficina}.` : ""}${limpio(d.version, 20) ? ` Versión ${limpio(d.version, 20)}.` : ""}${monto ? ` Monto solicitado: ${monto}.` : ""}`,
        { fecha_limite: "" },
      );
    }
    case "c-ps-vaf-resultado": {
      const plan = limpio(d.plan, 160) || "su plan";
      const res = RESULTADO_VAF[limpio(d.resultado, 30)] ?? limpio(d.resultado, 30);
      const apr = pesos(d.monto_aprobado);
      const sol = pesos(d.monto_solicitado);
      return salida(
        `La VAF evaluó el plan: ${res || "con resultado"}`,
        `Plan: «${plan}». Resultado: ${res || "sin dato"}.${sol ? ` Monto solicitado: ${sol}.` : ""}${apr ? ` Monto aprobado: ${apr}.` : ""}${nota ? ` Observaciones: ${nota}` : ""}`,
        { fecha_limite: "" },
      );
    }
    case "c-ps-vaf-alerta": {
      const plan = limpio(d.plan, 160) || "un plan";
      const n = Math.max(1, Number(d.n) || 1);
      return salida(
        `Alerta de ejecución en «${plan}»`,
        `La vigilancia del presupuesto encontró ${n} ${plural(n, "alerta", "alertas")}. ${limpio(d.detalle, 600)}`.trim(),
        { fecha_limite: "", comentario: "" },
      );
    }
    default:
      return salida("Novedad en Planeación y Seguimiento", base);
  }
}

/** El estado en que queda un aviso después de un intento. */
export function estadoTrasIntento(intentosHechos: number, enviado: boolean, max = INTENTOS): "enviado" | "pendiente" | "error" {
  if (enviado) return "enviado";
  return intentosHechos >= max ? "error" : "pendiente";
}

/** El enlace del botón: la ruta de la intranet (configurable) y, si hay, la actividad. */
export function enlaceDe(sitio: string, ruta: string, actividadId: string | null): string {
  const base = sitio.replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/.test(base)) return "";
  const r = `/${ruta.replace(/^\/+|\/+$/g, "")}`;
  return `${base}${r}${actividadId && /^[0-9a-f-]{36}$/.test(actividadId) ? `/${actividadId}` : ""}`;
}

/** Comparación sin atajo por prefijo, para el secreto del cron. */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
