/* =============================================================================
   Encuestas con Pilo · tipos.

   Contrato con la migración 0179 (tablas enc_*, tipos en database.ts) y con la
   función Edge `encuestas`.
   ========================================================================== */

import type { EncAcceso, EncAporteRow, EncBitacoraRow, EncCifraRow, EncEncuestaRow, EncEstadoAporte, EncEstadoEncuesta, EncRespuestaRow, EncTipoAporte, EncTipoCifra, EncVersionRow } from "../../types/database";
import type { Estructura, Valores } from "./lib/estructura";

export type TipoAporte = EncTipoAporte;
export type EstadoAporte = EncEstadoAporte;
export type TipoCifra = EncTipoCifra;

export type Encuesta = EncEncuestaRow;
export type Acceso = EncAcceso;
export type EstadoEncuesta = EncEstadoEncuesta;
export type BitacoraFila = EncBitacoraRow;

/** Una versión de la estructura con la estructura ya tipada. */
export interface Version extends Omit<EncVersionRow, "estructura"> {
  estructura: Estructura;
}

/** Una respuesta del modelo nuevo con sus valores por pregunta. */
export interface RespuestaModelo extends EncRespuestaRow {
  valores: Valores;
}

export interface EditorEncuesta {
  usuario_id: string;
  correo: string;
  rol: "propietario" | "editor" | "lector";
}

export const ESTADOS_ENCUESTA: readonly { id: EstadoEncuesta; texto: string }[] = [
  { id: "borrador", texto: "Borrador" },
  { id: "publicada", texto: "Publicada" },
  { id: "pausada", texto: "Pausada" },
  { id: "cerrada", texto: "Cerrada" },
];
export const textoEstadoEncuesta = (e: EstadoEncuesta): string => ESTADOS_ENCUESTA.find((x) => x.id === e)?.texto ?? e;
export type Cifra = EncCifraRow;

/** Un aporte con sus cifras. */
export interface Aporte extends EncAporteRow {
  cifras: Cifra[];
}

/** Lo que se edita en «Título y mensajes». */
export interface CambiosEncuesta {
  titulo: string;
  anio: string;
  cierra_el: string | null;
  intro: string;
  despedida: string;
}

/* ---------- La función pública ---------- */

export interface InfoEncuesta {
  slug: string;
  titulo: string;
  anio: string;
  intro: string;
  despedida: string;
  abierta: boolean;
  cierra_el: string | null;
  /** Editor de encuestas (0184). Con la función vieja no llegan. */
  abre_el?: string | null;
  estado?: EstadoEncuesta;
  motivo_cierre?: string | null;
  mensaje_cierre?: string;
  acceso?: Acceso;
  dominios?: string[];
  una_por_persona?: boolean;
  modo_llenado?: "guiado" | "clasico";
  config_pilo?: Record<string, unknown>;
  flujo?: "aportes" | "respuestas";
  estructura?: Estructura | null;
}

export interface CifraEnvio {
  que: string;
  tipo: TipoCifra;
  otro?: string;
  valor: number;
}

export interface AporteEnvio {
  tipo: TipoAporte;
  titulo: string;
  descripcion: string;
  cifras: CifraEnvio[];
}

export interface CuentaMicrosoft {
  correo: string;
  nombre: string;
}

export interface RespuestaEnvio {
  recibidos: number;
  cifras: number;
}

export const ESTADOS: readonly { id: EstadoAporte; texto: string }[] = [
  { id: "recibido", texto: "Recibido" },
  { id: "revisado", texto: "Revisado" },
  { id: "para_video", texto: "Para video" },
  { id: "rechazado", texto: "Rechazado" },
  { id: "descartado", texto: "Descartado" },
];

export const TIPOS_CIFRA: readonly { id: TipoCifra; texto: string }[] = [
  { id: "estudiantes", texto: "Estudiantes" },
  { id: "programas", texto: "Programas" },
  { id: "porcentaje", texto: "Porcentaje" },
  { id: "dinero", texto: "Dinero" },
  { id: "otro", texto: "Otro" },
];

export const textoEstado = (e: EstadoAporte): string => ESTADOS.find((x) => x.id === e)?.texto ?? e;
export const textoTipoAporte = (t: TipoAporte): string => (t === "logro" ? "Logro" : "Reto");
