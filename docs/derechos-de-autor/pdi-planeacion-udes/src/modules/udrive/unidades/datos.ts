/* =============================================================================
   UDrive · Unidades de trabajo · datos (TanStack Query + Supabase, 0191).

   Todo pasa por funciones de la base (security definer): ellas deciden quién
   puede qué, validan y escriben el registro. La pantalla no repite permisos
   salvo para no ofrecer lo imposible. Sin la migración, cada lectura falla con
   FaltaMigracion y la pantalla lo dice (patrón de UDrive).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { errorDe, rpc, UD_CLAVES } from "../datos";
import { nombreSeguroStorage } from "../lib/nombres";
import { FaltaMigracion } from "../../rankings/noticias";
import type {
  CapacidadResumen, CapacidadUnidad, EstructuraFila, EventoFila, EventoGlobal, ImagenCabecera, MiembroBorrador, MiembroFila, PeticionFila,
  PersonaBuscada, PersonaEstructura, Plantilla, RolUnidad, UnidadFila,
} from "./tipos";
import { BUCKET_UNIDADES, MAX_IMAGEN_CABECERA, TIPOS_IMAGEN } from "./tipos";

export const CLAVES_UN = {
  lista: ["ud", "unidades"] as const,
  miembros: (id: string) => ["ud", "unidades", id, "miembros"] as const,
  eventos: (id: string) => ["ud", "unidades", id, "eventos"] as const,
  peticiones: (id: string) => ["ud", "unidades", id, "peticiones"] as const,
  capacidad: ["ud", "unidades", "capacidad"] as const,
  registro: ["ud", "unidades", "registro"] as const,
  estructura: ["ud", "unidades", "estructura"] as const,
  imagen: (ruta: string) => ["ud", "unidades", "imagen", ruta] as const,
};

const refrescar = (c: QueryClient) => {
  void c.invalidateQueries({ queryKey: CLAVES_UN.lista });
  void c.invalidateQueries({ queryKey: UD_CLAVES.carpetas });
  void c.invalidateQueries({ queryKey: UD_CLAVES.archivos });
};

/* ---------- Lecturas ---------------------------------------------------------- */

/** Las unidades que veo: las mías y, con el rol de administración general, todas. */
export function useUnidades() {
  return useQuery({
    queryKey: CLAVES_UN.lista,
    retry: false,
    queryFn: async (): Promise<UnidadFila[]> => {
      const filas = await rpc<UnidadFila[]>("drive_unidades_listar", {});
      return (filas ?? []).map((u) => ({ ...u, cuota_bytes: Number(u.cuota_bytes), uso_bytes: Number(u.uso_bytes), orden_secciones: u.orden_secciones ?? [], ancladas: u.ancladas ?? [] }));
    },
  });
}

export function useMiembros(unidad: string | undefined) {
  return useQuery({
    queryKey: CLAVES_UN.miembros(unidad ?? ""),
    enabled: Boolean(unidad),
    retry: false,
    queryFn: () => rpc<MiembroFila[]>("drive_unidad_miembros_de", { p_unidad: unidad }),
  });
}

export function useEventos(unidad: string | undefined, limite = 30) {
  return useQuery({
    queryKey: [...CLAVES_UN.eventos(unidad ?? ""), limite],
    enabled: Boolean(unidad),
    retry: false,
    queryFn: () => rpc<EventoFila[]>("drive_unidad_eventos_de", { p_unidad: unidad, p_limite: limite }),
  });
}

export function usePeticiones(unidad: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: CLAVES_UN.peticiones(unidad ?? ""),
    enabled: Boolean(unidad) && activo,
    retry: false,
    queryFn: async () => (await rpc<PeticionFila[]>("drive_unidad_peticiones_de", { p_unidad: unidad })).map((p) => ({ ...p, bytes_pedidos: Number(p.bytes_pedidos), bytes_otorgados: p.bytes_otorgados === null ? null : Number(p.bytes_otorgados) })),
  });
}

export function useEstructura() {
  return useQuery({
    queryKey: CLAVES_UN.estructura,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<EstructuraFila[]>("drive_estructura_lista", {}),
  });
}

export const pedirPersonasDeEstructura = (unit: string) => rpc<PersonaEstructura[]>("drive_estructura_personas", { p_unit: unit });
export const buscarPersonas = (texto: string) => rpc<PersonaBuscada[]>("drive_personas_buscar", { p_texto: texto });
export const resolverCorreos = (correos: string[]) => rpc<PersonaBuscada[]>("drive_personas_por_correo", { p_correos: correos });

export function useCapacidad(activo: boolean) {
  return useQuery({
    queryKey: CLAVES_UN.capacidad,
    enabled: activo,
    retry: false,
    queryFn: async () => {
      const [resumen, unidades] = await Promise.all([rpc<CapacidadResumen[]>("drive_capacidad_resumen", {}), rpc<CapacidadUnidad[]>("drive_capacidad_unidades", {})]);
      const r = resumen[0];
      return {
        resumen: { capacidad_bytes: Number(r.capacidad_bytes), comprometido_bytes: Number(r.comprometido_bytes), uso_unidades_bytes: Number(r.uso_unidades_bytes), uso_personal_bytes: Number(r.uso_personal_bytes), n_unidades: r.n_unidades, cuota_defecto_bytes: Number(r.cuota_defecto_bytes) } as CapacidadResumen,
        unidades: unidades.map((u) => ({ ...u, uso_bytes: Number(u.uso_bytes), cuota_bytes: Number(u.cuota_bytes), peticion_bytes: u.peticion_bytes === null ? null : Number(u.peticion_bytes) })),
      };
    },
  });
}

export function useRegistroGlobal(activo: boolean) {
  return useQuery({
    queryKey: CLAVES_UN.registro,
    enabled: activo,
    retry: false,
    queryFn: () => rpc<EventoGlobal[]>("drive_registro_global", { p_limite: 80 }),
  });
}

/** Dirección temporal de la imagen de cabecera (bucket privado). */
export function useUrlCabecera(ruta: string | null | undefined) {
  return useQuery({
    queryKey: CLAVES_UN.imagen(ruta ?? ""),
    enabled: Boolean(ruta),
    retry: false,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const r = await supabase.storage.from(BUCKET_UNIDADES).createSignedUrl(ruta ?? "", 3600);
      return r.error || !r.data ? null : r.data.signedUrl;
    },
  });
}

/* ---------- Escrituras ---------------------------------------------------------- */

export interface DatosNuevaUnidad {
  nombre: string;
  descripcion: string;
  monograma: string;
  acento: string;
  icono: string;
  composicion: string;
  portada: string;
  plantilla: Plantilla;
  unit_id: string | null;
  miembros: MiembroBorrador[];
}

export async function subirImagenCabecera(unidad: string, archivo: File): Promise<string> {
  if (!TIPOS_IMAGEN.includes(archivo.type)) throw new Error("La imagen debe ser JPG, PNG o WebP.");
  const { comprimirImagen } = await import("../ui/navegador");
  const lista = await comprimirImagen(archivo);
  if (lista.size > MAX_IMAGEN_CABECERA) throw new Error(`«${archivo.name}» pesa más de 5 MB incluso comprimida. Pruebe con una imagen más pequeña.`);
  const ruta = `${unidad}/${Date.now()}-${nombreSeguroStorage(lista.name)}`;
  const r = await supabase.storage.from(BUCKET_UNIDADES).upload(ruta, lista, { contentType: lista.type || undefined, upsert: false });
  if (r.error) {
    if (/bucket not found/i.test(r.error.message)) throw new FaltaMigracion("Falta el bucket «udrive-unidades»: aplique la migración 0191 o créelo en Storage (privado, 5 MB).");
    throw new Error(`No se pudo subir la imagen: ${r.error.message}`);
  }
  return ruta;
}

export function useCrearUnidad() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { datos: DatosNuevaUnidad; imagen: File | null; encuadre: { x: number; y: number; zoom: number } }): Promise<{ id: string; avisoImagen: string | null }> => {
      const d = a.datos;
      const id = await rpc<string>("drive_unidad_crear", {
        p: {
          nombre: d.nombre, descripcion: d.descripcion, monograma: d.monograma, acento: d.acento, icono: d.icono, composicion: d.composicion, portada: d.portada, plantilla: d.plantilla, unit_id: d.unit_id,
          miembros: d.miembros.map((m) => ({ usuario: m.usuario_id, rol: m.rol, vence_en: m.vence_en })),
        },
      });
      // La imagen se sube cuando la unidad ya existe: solo quien la administra puede escribir en su carpeta del bucket.
      if (!a.imagen) return { id, avisoImagen: null };
      try {
        const ruta = await subirImagenCabecera(id, a.imagen);
        const imagen: ImagenCabecera = { ruta, ...a.encuadre };
        await rpc<void>("drive_unidad_actualizar", { p_unidad: id, p: { imagen } });
        return { id, avisoImagen: null };
      } catch (e) {
        return { id, avisoImagen: `La unidad se creó, pero la imagen no se pudo subir: ${e instanceof Error ? e.message : "error desconocido"}. Puede subirla en Personalizar.` };
      }
    },
    onSuccess: () => refrescar(c),
  });
}

export interface CambiosUnidad {
  nombre?: string;
  descripcion?: string;
  monograma?: string;
  acento?: string;
  icono?: string;
  composicion?: string;
  portada?: string;
  imagen?: ImagenCabecera | null;
  orden_secciones?: string[];
  ancladas?: string[];
}

export function useActualizarUnidad() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; cambios: CambiosUnidad }) => rpc<void>("drive_unidad_actualizar", { p_unidad: a.unidad, p: a.cambios }),
    onSuccess: (_x, a) => {
      refrescar(c);
      void c.invalidateQueries({ queryKey: CLAVES_UN.eventos(a.unidad) });
    },
  });
}

const refrescarPersonas = (c: QueryClient, unidad: string) => {
  void c.invalidateQueries({ queryKey: CLAVES_UN.miembros(unidad) });
  void c.invalidateQueries({ queryKey: CLAVES_UN.eventos(unidad) });
  void c.invalidateQueries({ queryKey: CLAVES_UN.lista });
};

export function useFijarMiembro() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; usuario: string; rol: RolUnidad; vence: string | null }) => rpc<void>("drive_unidad_miembro_fijar", { p_unidad: a.unidad, p_usuario: a.usuario, p_rol: a.rol, p_vence: a.vence }),
    onSuccess: (_x, a) => refrescarPersonas(c, a.unidad),
  });
}

export function useQuitarMiembro() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; usuario: string }) => rpc<void>("drive_unidad_miembro_quitar", { p_unidad: a.unidad, p_usuario: a.usuario }),
    onSuccess: (_x, a) => refrescarPersonas(c, a.unidad),
  });
}

export function useTransferir() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; a: string; dejar: boolean }) => rpc<void>("drive_unidad_transferir", { p_unidad: a.unidad, p_a: a.a, p_dejar: a.dejar }),
    onSuccess: (_x, a) => refrescarPersonas(c, a.unidad),
  });
}

export function useArchivar() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; archivar: boolean }) => rpc<void>("drive_unidad_archivar", { p_unidad: a.unidad, p_archivar: a.archivar }),
    onSuccess: (_x, a) => {
      refrescar(c);
      void c.invalidateQueries({ queryKey: CLAVES_UN.eventos(a.unidad) });
    },
  });
}

/** El administrador general entra a una unidad ajena: la base lo anota (una vez cada 30 minutos). */
export function useRegistrarIngreso() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (unidad: string) => rpc<void>("drive_unidad_entrar", { p_unidad: unidad }),
    onSuccess: () => void c.invalidateQueries({ queryKey: CLAVES_UN.registro }),
  });
}

export function useFijarCuota() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; bytes: number }) => rpc<void>("drive_unidad_cuota_fijar", { p_unidad: a.unidad, p_bytes: a.bytes }),
    onSuccess: () => {
      void c.invalidateQueries({ queryKey: CLAVES_UN.capacidad });
      refrescar(c);
    },
  });
}

export function usePedirAmpliacion() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { unidad: string; bytes: number; motivo: string }) => rpc<string>("drive_unidad_pedir_ampliacion", { p_unidad: a.unidad, p_bytes: a.bytes, p_motivo: a.motivo }),
    onSuccess: (_x, a) => {
      void c.invalidateQueries({ queryKey: CLAVES_UN.peticiones(a.unidad) });
      void c.invalidateQueries({ queryKey: CLAVES_UN.capacidad });
    },
  });
}

export function useResolverPeticion() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; aprobar: boolean; bytes: number | null; respuesta: string }) => rpc<void>("drive_unidad_resolver_peticion", { p_peticion: a.id, p_aprobar: a.aprobar, p_bytes_otorgados: a.bytes, p_respuesta: a.respuesta }),
    onSuccess: () => {
      void c.invalidateQueries({ queryKey: CLAVES_UN.capacidad });
      void c.invalidateQueries({ queryKey: CLAVES_UN.registro });
      refrescar(c);
    },
  });
}

export function useVaciarPapeleraUnidad() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (unidad: string) => {
      const rutas = (await rpc<string[]>("drive_unidad_vaciar_papelera", { p_unidad: unidad })) ?? [];
      if (rutas.length) await supabase.storage.from("udrive").remove(rutas.filter(Boolean));
      return rutas.length;
    },
    onSuccess: () => refrescar(c),
  });
}

export function useFijarParametro() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { clave: "cuota_unidad_bytes" | "capacidad_servidor_bytes"; valor: number }) => rpc<void>("drive_config_fijar", { p_clave: a.clave, p_valor: String(Math.round(a.valor)) }),
    onSuccess: () => void c.invalidateQueries({ queryKey: CLAVES_UN.capacidad }),
  });
}

export { errorDe };
