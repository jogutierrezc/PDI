/* =============================================================================
   Pilo at Work · Pilo Astra 1.0 · lógica (sin React salvo el gancho del final).

   Pilo Astra 1.0 es el motor más potente de At Work: razona, escribe código, lee
   documentos y entrega archivos. Corre en el servidor propio de la universidad y la
   persona lo elige a mano en el chat. La administración lo habilita (pw_config,
   migración 0278) y decide qué roles lo usan.

   Aquí vive lo que se puede probar aparte: quién puede usarlo y cuándo sale el aviso de
   lanzamiento (una sola vez por persona). El servidor repite la regla: ocultar el botón
   nunca es la única defensa. El nombre público es siempre «Pilo Astra 1.0»; el modelo
   que hay debajo no se muestra a nadie.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Rol } from "./api";

export const ASTRA_NOMBRE = "Pilo Astra 1.0";

export type Motor = "pilo" | "astra";
export type Razonamiento = "auto" | "profundo" | "apagado";

export const RAZONAMIENTOS: { id: Razonamiento; etiqueta: string; ayuda: string }[] = [
  { id: "auto", etiqueta: "Automático", ayuda: "Decide cuánto pensar según la pregunta." },
  { id: "profundo", etiqueta: "Profundo", ayuda: "Piensa más y revisa su propio trabajo. Tarda más." },
  { id: "apagado", etiqueta: "Apagado", ayuda: "Responde directo, sin razonar. Más rápido." },
];

/** Lo que el chat necesita saber de Astra (pw_astra_publica): sin direcciones ni modelos. */
export interface AstraPublica {
  habilitado: boolean;
  roles: string[];
  formatos: Record<string, boolean>;
  aviso: boolean;
  avisoVisto: boolean;
  subidaMaxMb: number;
  limiteHora: number;
}

/** La fila del RPC como `AstraPublica`; null si falta (migración sin aplicar) o no se entiende. */
export function aPublica(fila: unknown): AstraPublica | null {
  const f = (Array.isArray(fila) ? fila[0] : fila) as Record<string, unknown> | null | undefined;
  if (!f || typeof f !== "object") return null;
  return {
    habilitado: f.habilitado === true,
    roles: Array.isArray(f.roles) ? f.roles.map(String) : [],
    formatos: f.formatos && typeof f.formatos === "object" ? (f.formatos as Record<string, boolean>) : {},
    aviso: f.aviso !== false,
    avisoVisto: f.aviso_visto === true,
    subidaMaxMb: Number(f.subida_max_mb) || 25,
    limiteHora: Number(f.limite_hora) || 20,
  };
}

/** Quién puede usar Astra: habilitado por la administración, su rol incluido y nunca un invitado. */
export function astraDisponible(a: AstraPublica | null, rol: Rol): boolean {
  return Boolean(a && a.habilitado && rol !== "invitado" && a.roles.includes(rol));
}

/** El aviso de lanzamiento sale una sola vez: a quien puede usar Astra, si la administración lo dejó encendido y no lo ha visto. */
export function debeAvisar(a: AstraPublica | null, rol: Rol, vistoAqui: boolean): boolean {
  return astraDisponible(a, rol) && Boolean(a?.aviso) && !a?.avisoVisto && !vistoAqui;
}

const LLAVE_AVISO = "pilo-work-astra-aviso";
const LLAVE_PROBADO = "pilo-work-astra-probado";
/** La insignia «Nuevo» del botón se retira cuando la persona ya probó Astra (solo este navegador). */
export const leerProbado = () => {
  try {
    return localStorage.getItem(LLAVE_PROBADO) === "1";
  } catch {
    return false;
  }
};
export const marcarProbado = () => {
  try {
    localStorage.setItem(LLAVE_PROBADO, "1");
  } catch {
    /* sin almacenamiento */
  }
};
const leerVisto = () => {
  try {
    return localStorage.getItem(LLAVE_AVISO) === "1";
  } catch {
    return false;
  }
};

/**
 * Astra para quien está en el chat. Si la migración 0278 aún no se aplicó, `disponible` es
 * false y At Work se ve y funciona como siempre.
 */
export function useAstra(rol: Rol) {
  const [publica, setPublica] = useState<AstraPublica | null>(null);
  const [cargado, setCargado] = useState(false);
  const [vistoAqui, setVistoAqui] = useState(leerVisto);

  useEffect(() => {
    let vivo = true;
    void supabase.rpc("pw_astra_publica").then(({ data, error }) => {
      if (!vivo) return;
      setPublica(error ? null : aPublica(data));
      setCargado(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const disponible = useMemo(() => astraDisponible(publica, rol), [publica, rol]);
  const mostrarAviso = useMemo(() => cargado && debeAvisar(publica, rol, vistoAqui), [cargado, publica, rol, vistoAqui]);

  /** «Ya lo vi»: queda en el perfil (servidor) y, de respaldo, en este navegador. */
  const marcarAviso = useCallback(() => {
    setVistoAqui(true);
    try {
      localStorage.setItem(LLAVE_AVISO, "1");
    } catch {
      /* sin almacenamiento: queda solo el del servidor */
    }
    void supabase.rpc("pw_astra_aviso_visto");
  }, []);

  return { cargado, publica, disponible, mostrarAviso, marcarAviso };
}
