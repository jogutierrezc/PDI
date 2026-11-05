/* =============================================================================
   Guía con Pilo · el estado compartido: si la guía está abierta, en qué paso va,
   qué pasos le tocan a esta persona y el estado de demostración. Nada de aquí
   toca datos del informe: el editor solo lo lee para PINTAR «devuelto» o
   «aprobado» (solo visual). Lo recordado en el navegador (banner cerrado y
   «Leer cada paso») va en localStorage, nunca en la base.
   ========================================================================== */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../../../lib/auth";
import type { TipoSeccion } from "../types";
import { PASOS } from "./pasos";
import type { Paso } from "./pasos";

/** Lo que el editor de Mi informe cuenta a la guía: qué secciones tiene la plantilla y si quien mira solo consulta. */
export interface Registro {
  tipos: TipoSeccion[];
  visor: boolean;
}

interface Guia {
  abierta: boolean;
  paso: number;
  pasos: Paso[];
  demo: "back" | "ok" | null;
  registro: Registro | null;
  hablar: boolean;
  setHablar: (v: boolean) => void;
  /** Abre la guía; con zona, en el primer paso que la señala. */
  abrir: (zona?: string) => void;
  cerrar: () => void;
  ir: (n: number) => void;
  registrar: (r: Registro) => void;
}

const SIN_GUIA: Guia = { abierta: false, paso: 0, pasos: [], demo: null, registro: null, hablar: false, setHablar: () => {}, abrir: () => {}, cerrar: () => {}, ir: () => {}, registrar: () => {} };
const Contexto = createContext<Guia>(SIN_GUIA);
export const useGuia = () => useContext(Contexto);

/** localStorage sin romper si está bloqueado (ventana privada, datos del sitio apagados). */
export function recordado(clave: string): boolean {
  try {
    return window.localStorage.getItem(`informes:guia:${clave}`) === "1";
  } catch {
    return false;
  }
}
export function recordar(clave: string, valor: boolean) {
  try {
    window.localStorage.setItem(`informes:guia:${clave}`, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento: la preferencia dura solo esta visita */
  }
}

export function GuiaProvider({ children }: { children: ReactNode }) {
  const { puedeGestionarInformes } = useAuth();
  const [abierta, setAbierta] = useState(false);
  const [paso, setPaso] = useState(0);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [hablar, setHablarEstado] = useState(() => recordado("leer"));

  const pasos = useMemo(
    () => PASOS.filter((p) => (!p.gestion || puedeGestionarInformes) && !(p.tipo && registro && !registro.tipos.includes(p.tipo))),
    [puedeGestionarInformes, registro],
  );

  const abrir = useCallback(
    (zona?: string) => {
      const i = zona ? pasos.findIndex((p) => p.z === zona) : -1;
      setPaso(Math.max(0, i));
      setAbierta(true);
    },
    [pasos],
  );
  const ir = useCallback((n: number) => setPaso(Math.max(0, Math.min(n, pasos.length - 1))), [pasos.length]);
  const setHablar = useCallback((v: boolean) => {
    recordar("leer", v);
    setHablarEstado(v);
  }, []);
  const registrar = useCallback((r: Registro) => setRegistro((a) => (a && a.visor === r.visor && a.tipos.join() === r.tipos.join() ? a : r)), []);

  const demo = abierta ? (pasos[paso]?.demo ?? null) : null;
  const valor = useMemo<Guia>(
    () => ({ abierta, paso, pasos, demo, registro, hablar, setHablar, abrir, cerrar: () => setAbierta(false), ir, registrar }),
    [abierta, paso, pasos, demo, registro, hablar, setHablar, abrir, ir, registrar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
