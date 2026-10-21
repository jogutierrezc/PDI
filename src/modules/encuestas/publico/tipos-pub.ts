import type { PiloExpression } from "../../../components/pilo/PiloFace";

/** Lo que cada paso usa para que Pilo diga algo en la guía. */
export type DecirGuia = (texto: string, gesto?: PiloExpression, asiente?: boolean) => void;
