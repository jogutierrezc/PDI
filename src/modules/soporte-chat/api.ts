/* =============================================================================
   Traspaso de Pilo a un agente · los pedidos de la persona (anónima).

   Todo va por la función `soporte`. Al pedir un agente la persona recibe un
   SECRETO que solo ella guarda (sessionStorage de este espacio); cada pedido
   lo lleva y la función lo compara con la huella que guarda la base. El nombre
   del canal de Broadcast también es aleatorio y solo lo tiene quien recibió la
   respuesta de `crear`.
   ========================================================================== */

import { supabase } from "../../lib/supabase";
import { soporte } from "../soporte/llamada";
import type { ConversationStatus } from "../soporte/estados";

export type Space = "planeacion" | "ensenanza";

export interface PortalState {
  agent_on: boolean;
  /** Hay horario ahora. */
  open: boolean;
  online: number;
  messages: { closed?: string; busy?: string };
}

export interface Saved {
  id: string;
  secret: string;
  channel: string;
  name: string;
  email: string;
}

export interface FileInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
}

export interface View {
  status: ConversationStatus;
  after_hours: boolean;
  csat: number | null;
  agent: { name: string; photo_url: string } | null;
  position: number;
  messages: {
    id: number;
    kind: "incoming" | "outgoing" | "activity";
    author_kind: "student" | "pilo" | "agent" | "system";
    author_name: string;
    body: string;
    status: "sent" | "delivered" | "read";
    created_at: string;
    files: FileInfo[];
  }[];
}

const key = (space: Space) => `pilo-traspaso:${space}`;

export function readSaved(space: Space): Saved | null {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(key(space)) ?? "null") as Saved | null;
    return raw && typeof raw.id === "string" && typeof raw.secret === "string" && typeof raw.channel === "string" ? raw : null;
  } catch {
    return null;
  }
}

export function writeSaved(space: Space, saved: Saved | null) {
  try {
    if (saved) window.sessionStorage.setItem(key(space), JSON.stringify(saved));
    else window.sessionStorage.removeItem(key(space));
  } catch {
    /* sin almacenamiento: la conversación sigue mientras la pestaña lo recuerde en memoria */
  }
}

export const portalState = (space: Space) => soporte<PortalState>({ action: "portal", space });

export const createConversation = (space: Space, body: { nombre: string; correo: string; telefono: string; ciudad: string; politica: string; resumen: string; pregunta: string }) =>
  soporte<{ id: string; secret: string; channel: string; after_hours: boolean }>({ action: "crear", space, ...body, autoriza: true });

export const fetchView = (s: Saved, after = 0) => soporte<View>({ action: "estado", id: s.id, secret: s.secret, despues: after });

export const sendMessage = (s: Saved, texto: string, archivos: { ruta: string; nombre: string }[] = []) => soporte<{ id: number }>({ action: "mensaje", id: s.id, secret: s.secret, texto, archivos });

export const markRead = (s: Saved) => soporte({ action: "leer", id: s.id, secret: s.secret });

export const rate = (s: Saved, puntaje: number) => soporte({ action: "calificar", id: s.id, secret: s.secret, puntaje });

export const cancel = (s: Saved) => soporte({ action: "cancelar", id: s.id, secret: s.secret });

/** Sube un archivo con la URL firmada que entrega la función y devuelve la ruta para el mensaje. */
export async function uploadFile(s: Saved, file: File, mime: string): Promise<string> {
  const out = await soporte<{ path: string; token: string }>({ action: "subir", id: s.id, secret: s.secret, nombre: file.name, tipo: mime, tamano: file.size });
  const { error } = await supabase.storage.from("support-attachments").uploadToSignedUrl(out.path, out.token, file, { contentType: mime });
  if (error) throw new Error("No se pudo subir el archivo. Revisa tu conexión.");
  return out.path;
}

export async function fileUrl(s: Saved, path: string): Promise<string> {
  return (await soporte<{ url: string }>({ action: "descargar", id: s.id, secret: s.secret, ruta: path })).url;
}
