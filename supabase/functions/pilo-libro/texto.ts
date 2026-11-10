/* =============================================================================
   pilo-libro · pedidos, mensajes y verificación (lógica pura, sin red).

   Pilo recibe cifras ya calculadas por el panel (totales y cifras por dependencia,
   nunca datos personales) y devuelve:
     · narrar  un texto breve por página del libro, 25 a 60 palabras;
     · ods     los ODS (1 a 17) a los que contribuye cada aporte.

   Verificación: en un texto solo puede haber números que vengan en los datos de esa
   página (o un año 2025 a 2027). Si Pilo escribe una cifra que no está, la respuesta
   se rechaza y se le devuelve una vez con el motivo. Esta capa no inventa nada.
   ========================================================================== */

import { extraerJson, type Lectura, type Mensaje } from "../pilo-rankingsod/logica.ts";

export interface DatoPagina {
  etiqueta: string;
  /** Como se lee en la página: «1.240», «72 %», «$ 480 M». */
  texto: string;
  numero: number;
}
export interface PedidoPagina {
  clave: string;
  pagina: string;
  datos: DatoPagina[];
}
export interface PedidoNarrar {
  paginas: PedidoPagina[];
  tono: "i" | "c";
  largo: 1 | 2;
}
export interface AporteOds {
  id: string;
  tipo: "logro" | "reto";
  titulo: string;
  descripcion: string;
  dependencia: string;
}

const limpio = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function validarNarrar(c: unknown): Lectura<PedidoNarrar> {
  const o = c as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.paginas) || o.paginas.length === 0 || o.paginas.length > 10) return { ok: false, error: "Faltan las páginas (de 1 a 10)." };
  const paginas: PedidoPagina[] = [];
  for (const p of o.paginas as Record<string, unknown>[]) {
    const clave = limpio(p?.clave, 30);
    if (!/^[a-z]{3,20}$/.test(clave)) return { ok: false, error: "Clave de página inválida." };
    const datos = (Array.isArray(p?.datos) ? (p.datos as Record<string, unknown>[]) : [])
      .slice(0, 30)
      .map((d) => ({ etiqueta: limpio(d?.etiqueta, 90), texto: limpio(d?.texto, 30), numero: Number(d?.numero) }))
      .filter((d) => d.etiqueta && d.texto && Number.isFinite(d.numero));
    paginas.push({ clave, pagina: limpio(p?.pagina, 60), datos });
  }
  return { ok: true, valor: { paginas, tono: o.tono === "c" ? "c" : "i", largo: o.largo === 2 ? 2 : 1 } };
}

export function validarOds(c: unknown): Lectura<AporteOds[]> {
  const o = c as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.aportes) || o.aportes.length === 0 || o.aportes.length > 30) return { ok: false, error: "Faltan los aportes (de 1 a 30)." };
  const salida: AporteOds[] = [];
  for (const a of o.aportes as Record<string, unknown>[]) {
    const id = limpio(a?.id, 40);
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Id de aporte inválido." };
    salida.push({ id, tipo: a?.tipo === "reto" ? "reto" : "logro", titulo: limpio(a?.titulo, 140), descripcion: limpio(a?.descripcion, 400), dependencia: limpio(a?.dependencia, 90) });
  }
  return { ok: true, valor: salida };
}

const RANGO = { 1: [25, 45], 2: [40, 60] } as const;

export function mensajesNarrar(p: PedidoNarrar): Mensaje[] {
  const [min, max] = RANGO[p.largo];
  return [
    {
      role: "system",
      content: [
        "Eres Mr. Pilo, el comunicador de la Universidad de Santander (UDES). Redactas el texto breve de cada página de un libro de rendición de cuentas.",
        "Reglas:",
        "- Usa solo las cifras que recibes, tal como vienen escritas. No calcules, no redondees, no agregues otras.",
        "- Cada frase se apoya en al menos una cifra. No inventes hechos, causas, nombres, fechas ni logros.",
        `- Entre ${min} y ${max} palabras por página, sin viñetas, sin títulos, sin rayas largas.`,
        `- Español de Colombia, tono ${p.tono === "c" ? "cercano y directo" : "institucional y sobrio"}.`,
        'Responde SOLO un JSON: {"textos":{"<clave>":"texto"}} con una entrada por cada página recibida.',
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({ paginas: p.paginas }) },
  ];
}

const NOMBRES_ODS = [
  "1 Fin de la pobreza", "2 Hambre cero", "3 Salud y bienestar", "4 Educación de calidad", "5 Igualdad de género", "6 Agua limpia y saneamiento",
  "7 Energía asequible y no contaminante", "8 Trabajo decente y crecimiento económico", "9 Industria, innovación e infraestructura", "10 Reducción de las desigualdades",
  "11 Ciudades y comunidades sostenibles", "12 Producción y consumo responsables", "13 Acción por el clima", "14 Vida submarina", "15 Vida de ecosistemas terrestres",
  "16 Paz, justicia e instituciones sólidas", "17 Alianzas para lograr los objetivos",
];

export function mensajesOds(aportes: AporteOds[]): Mensaje[] {
  return [
    {
      role: "system",
      content: [
        "Eres Mr. Pilo, de la Universidad de Santander (UDES). Clasificas logros y retos de las dependencias según los Objetivos de Desarrollo Sostenible.",
        "Objetivos: " + NOMBRES_ODS.join("; ") + ".",
        "Para cada aporte entrega de 0 a 3 ODS a los que contribuye de forma clara según su título y descripción. Si la relación no es clara, entrega una lista vacía. No inventes.",
        'Responde SOLO un JSON: {"ods":{"<id del aporte>":[4,9]}} con una entrada por cada aporte.',
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({ aportes }) },
  ];
}

/* ---------- verificación ---------- */

/** «1.240» → 1240; «3,5» → 3.5; «72» → 72. */
export function numeroDe(t: string): number {
  const s = t.replace(/[.,]+$/, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s.replace(",", "."));
}

export function contarPalabras(t: string): number {
  return (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function leerNarracion(crudo: string, p: PedidoNarrar): Lectura<Record<string, string>> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const t = (j.valor.textos ?? j.valor) as Record<string, unknown>;
  const [min, max] = RANGO[p.largo];
  const salida: Record<string, string> = {};
  for (const pag of p.paginas) {
    const texto = limpio(t?.[pag.clave], 900).replace(/[—–]/g, ",");
    if (!texto) return { ok: false, error: `Falta el texto de la página «${pag.clave}».` };
    const n = contarPalabras(texto);
    if (n < min - 8 || n > max + 12) return { ok: false, error: `El texto de «${pag.clave}» tiene ${n} palabras y debe tener entre ${min} y ${max}.` };
    const permitidos = pag.datos.map((d) => d.numero);
    for (const m of texto.match(/\d[\d.,]*/g) ?? []) {
      const v = numeroDe(m);
      if (!Number.isFinite(v)) continue;
      if ([2025, 2026, 2027].includes(v)) continue;
      if (!permitidos.some((x) => Math.abs(x - v) < 0.051)) return { ok: false, error: `En «${pag.clave}» aparece la cifra ${m}, que no está en los datos de la página.` };
    }
    salida[pag.clave] = texto;
  }
  return { ok: true, valor: salida };
}

export function leerOds(crudo: string, aportes: AporteOds[]): Lectura<Record<string, number[]>> {
  const j = extraerJson(crudo);
  if (!j.ok) return j;
  const o = (j.valor.ods ?? j.valor) as Record<string, unknown>;
  const salida: Record<string, number[]> = {};
  for (const a of aportes) {
    const v = Array.isArray(o?.[a.id]) ? (o[a.id] as unknown[]) : null;
    if (!v) return { ok: false, error: `Falta la clasificación del aporte ${a.id}.` };
    const nums = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 17))].slice(0, 3);
    salida[a.id] = nums;
  }
  return { ok: true, valor: salida };
}
