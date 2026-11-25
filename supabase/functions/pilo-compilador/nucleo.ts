/* =============================================================================
   Pilo compilador · redactar una sección con Astra (puro: `llamar` se inyecta).

   Sin tope de tokens: si Astra se corta (finish_reason «length») se le pide que continúe y se unen las partes,
   hasta MAX_PARTES. Se verifica el texto (tokens y cifras a mano); si falla, un reintento con el error.
   ========================================================================== */

import type { RespuestaAstra } from "../pilo-presentaciones/astra.ts";
import type { PedidoLeido } from "./pedido.ts";
import { mensajeContinuar, mensajeReintento, mensajesSistema, mensajesUsuario } from "./prompt.ts";
import type { Mensaje } from "./prompt.ts";
import { textoDeErrores, verificarTexto } from "./verificar.ts";

export const MAX_PARTES = 8;

export class ErrorCompilador extends Error {
  constructor(message: string, readonly code: string, readonly detalle?: string[]) {
    super(message);
  }
}

export interface DepsGenerar {
  emitir: (evento: string, datos: unknown) => void;
  llamar: (mensajes: Mensaje[], onThinking?: (t: string) => void) => Promise<RespuestaAstra>;
  ahora?: () => number;
}

export interface ResultadoSeccion {
  texto: string;
  partes: number;
  palabras: number;
  usados: string[];
  no_verificado: string[];
  pensamiento_s: number;
  reintento: boolean;
}

const palabras = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Pide el texto y, mientras Astra se corte por longitud, que siga. Devuelve el texto unido y cuántas partes fueron. */
async function escribir(d: DepsGenerar, mensajes: Mensaje[], onThinking: (t: string) => void): Promise<{ texto: string; partes: number }> {
  let texto = "";
  let partes = 0;
  let actual = mensajes;
  for (let i = 0; i < MAX_PARTES; i++) {
    const r = await d.llamar(actual, onThinking);
    partes++;
    texto = texto ? `${texto}${/\s$/.test(texto) || /^\s/.test(r.texto) ? "" : " "}${r.texto}` : r.texto;
    d.emitir("part", { n: partes, palabras: palabras(texto) });
    if (r.finish !== "length") break;
    actual = [...mensajes, { role: "assistant", content: texto }, { role: "user", content: mensajeContinuar() }];
  }
  return { texto: texto.trim(), partes };
}

export async function generar(d: DepsGenerar, p: PedidoLeido): Promise<ResultadoSeccion> {
  const ahora = d.ahora ?? Date.now;
  const t0 = ahora();
  const ds = p.datos;
  d.emitir("step", { id: "leer", label: `Leyendo ${ds.indicadores.length} indicadores y ${ds.hojas.length} hojas de ${ds.equipos.length} equipos` });
  const base: Mensaje[] = [{ role: "system", content: mensajesSistema(ds, p.nivel, p.instruccion) }, { role: "user", content: mensajesUsuario(ds) }];
  d.emitir("step", { id: "razonar", label: `Razonando «${ds.seccion.titulo}»` });
  const onThinking = (t: string) => d.emitir("thinking", { text: t });
  let r = await escribir(d, base, onThinking);
  let reintento = false;
  let v = verificarTexto(r.texto, ds.indicadores);
  if (v.errores.length) {
    reintento = true;
    d.emitir("step", { id: "reintento", label: "Corrigiendo lo que no pasó la revisión" });
    r = await escribir(d, [...base, { role: "assistant", content: r.texto }, { role: "user", content: mensajeReintento(textoDeErrores(v)) }], onThinking);
    v = verificarTexto(r.texto, ds.indicadores);
    if (v.errores.length) throw new ErrorCompilador("Astra no cumplió las reglas de cifras después de un reintento.", "verificacion", v.errores);
  }
  if (!r.texto) throw new ErrorCompilador("Astra no devolvió texto.", "vacio");
  d.emitir("step", { id: "listo", label: "Texto verificado" });
  return { texto: r.texto, partes: r.partes, palabras: palabras(r.texto), usados: v.usados, no_verificado: v.aMano.slice(0, 20), pensamiento_s: Math.round(((ahora() - t0) / 1000) * 10) / 10, reintento };
}
