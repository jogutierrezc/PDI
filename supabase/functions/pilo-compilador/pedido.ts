/* =============================================================================
   Pilo compilador · el pedido, validado (puro).
   ========================================================================== */

export const NIVELES = ["rapida", "compleja", "investigacion"] as const;
export type Nivel = (typeof NIVELES)[number];
export const esNivel = (v: unknown): v is Nivel => (NIVELES as readonly string[]).includes(String(v));

/** Lo organizado que se manda a Pilo para una sección (un JSON plano; forma en src/modules/informes/compilador/logica.ts). */
export const MAX_DATOS_BYTES = 400_000;
export const MAX_INSTRUCCION = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Indicador {
  clave: string;
  nombre: string;
  criterio: string;
  unidad: string;
  valor: number | null;
  meta: number | null;
  anterior: number | null;
  fuentePrimaria: string;
  reporto: { equipo: string; escribio: string; valor: number | null }[];
  conflicto: boolean;
}

export interface DatosSeccion {
  unidad: string;
  anio: number;
  plantilla: string;
  seccion: { clave: string; titulo: string; tipo: string; extension?: string };
  equipos: { nombre: string; plantilla: string | null; hojas: string[] }[];
  indicadores: Indicador[];
  hojas: { equipo: string; hoja: string; destino: string; encabezados: string[]; filas: string[][] }[];
  textosPrevios: Record<string, string>;
}

export interface PedidoLeido {
  instancia_id: string;
  nivel: Nivel;
  instruccion?: string;
  datos: DatosSeccion;
}

export type LecturaPedido = { ok: true; pedido: PedidoLeido } | { ok: false; error: string; code: string; status: number };
const mal = (error: string, code = "pedido", status = 400): LecturaPedido => ({ ok: false, error, code, status });
const texto = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function leerPedido(cuerpo: unknown): LecturaPedido {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return mal("Cuerpo inválido.");
  const c = cuerpo as Record<string, unknown>;
  const id = String(c.instancia_id ?? "");
  if (!UUID.test(id)) return mal("Falta el informe (instancia_id).");
  if (!esNivel(c.nivel)) return mal("Nivel inválido: rapida, compleja o investigacion.");
  let instruccion: string | undefined;
  if (c.instruccion !== undefined && c.instruccion !== null) {
    if (typeof c.instruccion !== "string") return mal("La instrucción debe ser texto.");
    instruccion = c.instruccion.replace(/\s+/g, " ").trim().slice(0, MAX_INSTRUCCION) || undefined;
  }
  const d = c.datos as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object" || Array.isArray(d)) return mal("Faltan los datos organizados.");
  const tam = new TextEncoder().encode(JSON.stringify(d)).length;
  if (tam > MAX_DATOS_BYTES) return mal(`Los datos pesan ${Math.round(tam / 1024)} KB y el tope es ${Math.round(MAX_DATOS_BYTES / 1000)} KB.`, "datos_grandes", 413);
  const s = d.seccion as Record<string, unknown> | undefined;
  if (!s || typeof s.titulo !== "string" || typeof s.clave !== "string") return mal("Falta la sección que se redacta.");
  const indicadores: Indicador[] = (Array.isArray(d.indicadores) ? d.indicadores : []).slice(0, 400).map((x) => {
    const i = x as Record<string, unknown>;
    return {
      clave: texto(i.clave, 60),
      nombre: texto(i.nombre, 200),
      criterio: texto(i.criterio, 120),
      unidad: texto(i.unidad, 20),
      valor: num(i.valor),
      meta: num(i.meta),
      anterior: num(i.anterior),
      fuentePrimaria: texto(i.fuentePrimaria, 160),
      reporto: (Array.isArray(i.reporto) ? i.reporto : []).slice(0, 12).map((r) => {
        const q = r as Record<string, unknown>;
        return { equipo: texto(q.equipo, 120), escribio: texto(q.escribio, 200), valor: num(q.valor) };
      }),
      conflicto: i.conflicto === true,
    };
  }).filter((i) => /^[a-z0-9_]+$/i.test(i.clave) && i.nombre);
  const datos: DatosSeccion = {
    unidad: texto(d.unidad, 200),
    anio: Number(d.anio) || new Date().getFullYear(),
    plantilla: texto(d.plantilla, 10),
    seccion: { clave: s.clave, titulo: s.titulo.slice(0, 200), tipo: texto(s.tipo, 20), extension: typeof s.extension === "string" ? s.extension.slice(0, 120) : undefined },
    equipos: (Array.isArray(d.equipos) ? d.equipos : []).slice(0, 40).map((x) => {
      const e = x as Record<string, unknown>;
      return { nombre: texto(e.nombre, 120), plantilla: typeof e.plantilla === "string" ? e.plantilla.slice(0, 10) : null, hojas: (Array.isArray(e.hojas) ? e.hojas : []).slice(0, 30).map((h) => texto(h, 60)) };
    }),
    indicadores,
    hojas: (Array.isArray(d.hojas) ? d.hojas : []).slice(0, 60).map((x) => {
      const h = x as Record<string, unknown>;
      return {
        equipo: texto(h.equipo, 120),
        hoja: texto(h.hoja, 60),
        destino: texto(h.destino, 120),
        encabezados: (Array.isArray(h.encabezados) ? h.encabezados : []).slice(0, 30).map((e) => texto(e, 80)),
        filas: (Array.isArray(h.filas) ? h.filas : []).slice(0, 200).map((f) => (Array.isArray(f) ? f.slice(0, 30).map((e) => texto(e, 1500)) : [])),
      };
    }),
    textosPrevios: Object.fromEntries(Object.entries((d.textosPrevios as Record<string, unknown>) ?? {}).slice(0, 20).map(([k, v]) => [k.slice(0, 20), texto(v, 6000)])),
  };
  return { ok: true, pedido: { instancia_id: id, nivel: c.nivel, instruccion, datos } };
}
