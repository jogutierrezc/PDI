/* =============================================================================
   Guía con Pilo · la voz. Usa la voz oficial que Pilo ya tiene configurada en
   la plataforma (sayOfficial: la misma de /pregunta y la app, con su
   reproductor único y el reconocimiento del tipo de audio). No cae a la voz del
   navegador: si la oficial no está disponible, lo dice. El reproductor no
   entrega el avance palabra por palabra, así que no se finge sincronía: se
   resalta el párrafo mientras suena y la boca de Pilo se mueve con el audio.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { sayOfficial, stopOfficial } from "../../pilo-app/official-voice";

export type EstadoVoz = "quieto" | "cargando" | "suena";

export const AVISO_SIN_VOZ = "La voz de Pilo no está disponible en este momento. Puede leer el texto.";

export function useVoz() {
  const [estado, setEstado] = useState<EstadoVoz>("quieto");
  const [aviso, setAviso] = useState("");
  const activa = useRef(false);

  const parar = useCallback(() => {
    if (!activa.current) return;
    activa.current = false;
    stopOfficial();
    setEstado("quieto");
  }, []);

  const decir = useCallback(async (texto: string) => {
    stopOfficial();
    activa.current = true;
    setAviso("");
    setEstado("cargando");
    const r = await sayOfficial(texto, { portal: "pregunta", advanced: true, onSound: (on) => activa.current && setEstado(on ? "suena" : "cargando") });
    if (r === "cancelado") return;
    activa.current = false;
    setEstado("quieto");
    if (r === "sin voz") setAviso(AVISO_SIN_VOZ);
  }, []);

  // Al desmontar solo calla lo que esta instancia puso a sonar.
  useEffect(() => parar, [parar]);

  return { estado, aviso, decir, parar, limpiarAviso: () => setAviso("") };
}
