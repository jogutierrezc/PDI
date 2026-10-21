/* =============================================================================
   Encuestas con Pilo · tipos.

   Contrato con la migración 0179 (tablas enc_*, tipos en database.ts) y con la
   función Edge `encuestas`.
   ========================================================================== */

import type { EncAporteRow, EncCifraRow, EncEncuestaRow, EncEstadoAporte, EncTipoAporte, EncTipoCifra } from "../../types/database";

export type TipoAporte = EncTipoAporte;
export type EstadoAporte = EncEstadoAporte;
export type TipoCifra = EncTipoCifra;

export type Encuesta = EncEncuestaRow;
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
