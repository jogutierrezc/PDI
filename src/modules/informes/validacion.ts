/* =============================================================================
   Informes Institucionales · cuándo una sección está lista y qué le falta.

   Mismas reglas de la maqueta: 0 sin empezar, 1 en curso, 2 lista. Los
   controles laterales del editor salen de aquí y de tokens.ts.
   ========================================================================== */

import type { CifraVista } from "./cifras-vivas";
import { driveLibre, tablasLibre, textoLibre } from "./secciones-config";
import { palabras, validarTexto } from "./tokens";
import type { ContenidoSeccion, Control, SeccionDef } from "./types";

export type Avance = 0 | 1 | 2;
export const ETIQUETA_AVANCE: Record<Avance, string> = { 0: "Sin empezar", 1: "En curso", 2: "Lista" };

export interface ContextoSeccion {
  /** Cifras de la sección (solo las de sus dimensiones) ya resueltas. */
  cifras: CifraVista[];
  /** Datos propios de la sección. */
  propias: CifraVista[];
  anexos: number;
  exigirFuente: boolean;
  /** Metas que vienen de los indicadores del programa (0165). */
  metasPrograma?: number;
  /** Acciones del Plan de Trabajo de la facultad (API del plan). */
  metasPlan?: number;
  /** Indicadores de resultados por dimensión escritos a mano (total y con nombre y cifra actual). */
  manuales?: { total: number; completos: number };
  /** Datos que Planeación pide a esta plantilla (0253): cuántos se piden y cuántos «Justificar» aún faltan por llenar. */
  requeridos?: { total: number; faltan: number };
}

/** Cifras que Planeación pide justificar y aún no tienen la línea. */
export const sinJustificar = (cifras: CifraVista[]) => cifras.filter((c) => c.condicion === "justificar" && !c.justificacion.trim());

/** Una cifra pedida sin indicador conectado (o escrito) no tiene qué justificar. */
const pedidasDe = (cifras: CifraVista[]) => cifras.filter((c) => c.condicion === "justificar" && (c.valor !== null || c.propia));

export function avanceSeccion(def: SeccionDef, c: ContenidoSeccion | null | undefined, ctx: ContextoSeccion): Avance {
  const x = c ?? {};
  const grado = (n: number, lista: boolean): Avance => (lista ? 2 : n > 0 ? 1 : 0);
  // Solo lectura: lo define Planeación y la unidad no tiene nada que completar.
  if (def.soloLectura) return 2;
  switch (def.tipo) {
    case "narr": {
      const n = palabras(x.texto);
      return grado(n, n >= (def.minimo ?? 1));
    }
    case "pdi": {
      const n = x.pilares?.length ?? 0;
      return grado(n, n >= 3);
    }
    case "metas": {
      const m = x.metas ?? [];
      const n = m.length + (ctx.metasPrograma ?? 0) + (ctx.metasPlan ?? 0);
      return grado(n, n > 0 && m.every((f) => f.meta.trim() && f.alcanzado !== null));
    }
    case "dim": {
      const pedidas = pedidasDe(ctx.cifras);
      const hechas = pedidas.length - sinJustificar(pedidas).length;
      const man = ctx.manuales ?? { total: 0, completos: 0 };
      const req = ctx.requeridos ?? { total: 0, faltan: 0 };
      return grado(hechas + man.total + (req.total - req.faltan), hechas === pedidas.length && man.completos === man.total && req.faltan === 0);
    }
    case "matriz": {
      const n = palabras(x.texto);
      return grado(n, n >= 10);
    }
    case "filas": {
      const f = x.filas ?? [];
      return grado(f.length, f.some((r) => r.length > 0 && r.every((v) => String(v ?? "").trim())));
    }
    case "logros": {
      const l = x.logros ?? [];
      return grado(l.length, l.some((g) => g.titulo.trim() && g.resultado.trim()));
    }
    case "evid":
      return ctx.anexos > 0 ? 2 : 0;
    case "anexos":
      return 2;
    case "libre": {
      const n = palabras(textoLibre(x));
      const d = driveLibre(x).length + tablasLibre(x);
      return grado(n + d, n + d > 0 && n >= (def.minimo ?? 0));
    }
  }
}

/** Los controles del panel lateral para la sección abierta. */
export function controlesSeccion(def: SeccionDef, c: ContenidoSeccion | null | undefined, ctx: ContextoSeccion & { claves: string[]; congelada: boolean; corte: string | null }): Control[] {
  const x = c ?? {};
  const out: Control[] = [];
  if (def.soloLectura) {
    return [{ nivel: "ok", texto: "Sección definida por Planeación: solo lectura" }, { nivel: "ok", texto: ctx.congelada ? "Cifras congeladas al enviar: el informe ya no cambia" : "Cuenta como lista" }];
  }
  if (def.tipo === "dim") {
    const man = ctx.manuales ?? { total: 0, completos: 0 };
    if (man.total) {
      const falta = man.total - man.completos;
      out.push(falta ? { nivel: "warn", texto: `${falta} ${falta === 1 ? "indicador sin nombre o sin cifra actual" : "indicadores sin nombre o sin cifra actual"}` } : { nivel: "ok", texto: `${man.total} ${man.total === 1 ? "indicador escrito" : "indicadores escritos"} con su estado calculado` });
    }
    const req = ctx.requeridos;
    if (req && req.total) {
      out.push(
        req.faltan
          ? { nivel: "warn", texto: `${req.faltan} ${req.faltan === 1 ? "dato que pide" : "datos que pide"} Planeación sin cifra actual, meta o justificación` }
          : { nivel: "ok", texto: `Los ${req.total} datos que pide Planeación están respondidos` },
      );
    }
    const n = sinJustificar(pedidasDe(ctx.cifras)).length;
    out.push(n ? { nivel: "warn", texto: `${n} ${n === 1 ? "cifra que pide" : "cifras que pide"} Planeación aún sin justificación` } : { nivel: "ok", texto: "Todas las cifras pedidas están justificadas" });
    const sinFuente = [...ctx.cifras, ...ctx.propias].filter((v) => v.propia && !v.fuente.trim()).length;
    if (ctx.exigirFuente || sinFuente) {
      out.push(sinFuente ? { nivel: "warn", texto: `${sinFuente} ${sinFuente === 1 ? "cifra con fuente propia" : "cifras con fuente propia"} sin nombre de fuente` } : { nivel: "ok", texto: "Cada cifra tiene su fuente" });
    }
  }
  if (def.tipo === "narr" || def.tipo === "dim" || def.tipo === "matriz" || def.tipo === "pdi") {
    out.push(...validarTexto(x.texto ?? "", { claves: ctx.claves, minimo: def.tipo === "narr" ? def.minimo : undefined }));
  }
  if (def.tipo === "libre") {
    out.push(...validarTexto(textoLibre(x), { claves: ctx.claves, minimo: def.minimo }));
    if (!palabras(textoLibre(x)) && !driveLibre(x).length && !tablasLibre(x)) out.push({ nivel: "warn", texto: "Aún no hay texto, tablas ni gráficas" });
  }
  if (def.tipo === "metas") {
    const delPrograma = ctx.metasPrograma ?? 0;
    if (delPrograma) out.push({ nivel: "ok", texto: `${delPrograma} ${delPrograma === 1 ? "meta viene" : "metas vienen"} de los indicadores del programa` });
    const delPlan = ctx.metasPlan ?? 0;
    if (delPlan) out.push({ nivel: "ok", texto: `${delPlan} ${delPlan === 1 ? "acción viene" : "acciones vienen"} del Plan de Trabajo` });
    out.push((x.metas ?? []).length || delPrograma || delPlan ? { nivel: "ok", texto: "Resultado calculado a partir de programado y alcanzado" } : { nivel: "warn", texto: "Aún no hay metas" });
  }
  if (def.tipo === "logros") {
    const sinEvidencia = (x.logros ?? []).filter((l) => l.anexo === null).length;
    if (sinEvidencia) out.push({ nivel: "warn", texto: `${sinEvidencia} ${sinEvidencia === 1 ? "logro" : "logros"} sin evidencia` });
  }
  out.push({
    nivel: "ok",
    texto: ctx.congelada ? "Cifras congeladas al enviar: el informe ya no cambia" : `Cifras en vivo hasta que envíe${ctx.corte ? `. Corte de referencia: ${ctx.corte}` : ""}`,
  });
  return out;
}
