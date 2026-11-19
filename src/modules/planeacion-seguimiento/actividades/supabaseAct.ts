/* =============================================================================
   Planeación y Seguimiento · Fase 2 · implementación SUPABASE.

   ⚠ PENDIENTE DE CONTRASTAR con docs/planeacion-seguimiento/CONTRATO-BD-F2.md y la
   migración 0287 (las escribe otro agente en paralelo). Los nombres de tablas, columnas
   y funciones `ps_actividad_*` de abajo son FIRMAS PROPUESTAS por la interfaz; lo único
   que ya existe y se usa tal cual es lo del portal: `units`, `unit_members`, `campuses`,
   `profiles` y `ps_nivel_actual()`. Las oficinas y los papeles se leen con las mismas
   consultas que Mis Tableros (`useUnits`) y se resuelven con `roleAt` (espejo de
   `unit_role_at`), no se duplica la lógica de herencia.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { roleAt, roleSource, type Unit, type UnitMember } from "../../tableros/model";
import type { PsNivel } from "../modelo";
import { CAMPUS_TODOS } from "../modelo";
import type { ErrorCargaAct, PersonaRef, PsApiAct } from "./contratoApi";
import type { Actividad, AvisoPrevio, EventoActividad, LineaOficina, MiembroEquipo, OficinaVista, TipoEvento } from "./modelo";
import { cargaPorPersona } from "./modelo";
import { poderEn } from "./reglas";

type Fila = Record<string, unknown>;
const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const falla = (e: { message?: string } | null): Error => new Error(e?.message || "No se pudo completar la operación.");
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

async function leerUnidades(): Promise<{ unidades: Unit[]; miembros: UnitMember[] }> {
  const [u, m] = await Promise.all([
    supabase.from("units").select("*").order("position"),
    supabase.from("unit_members").select("id,unit_id,profile_id,role,profiles(full_name,email)"),
  ]);
  if (u.error) throw falla(u.error);
  if (m.error) throw falla(m.error);
  const unidades = ((u.data ?? []) as Fila[]).map((r): Unit => ({ id: String(r.id), parentId: (r.parent_id as string | null) ?? null, kind: r.kind as Unit["kind"], code: String(r.code ?? ""), name: String(r.name ?? ""), slug: String(r.slug ?? ""), description: String(r.description ?? ""), position: Number(r.position ?? 0) }));
  const miembros = ((m.data ?? []) as Fila[]).map((r): UnitMember => {
    const p = r.profiles as { full_name: string | null; email: string | null } | null;
    return { id: String(r.id), unitId: String(r.unit_id), profileId: String(r.profile_id), role: r.role as UnitMember["role"], name: p?.full_name?.trim() || p?.email || "Sin nombre", email: p?.email ?? "" };
  });
  return { unidades, miembros };
}

async function miId(): Promise<string | null> {
  const r = await supabase.auth.getUser();
  return r.data.user?.id ?? null;
}

async function nivel(): Promise<PsNivel> {
  const r = await supabase.rpc("ps_nivel_actual");
  if (r.error) throw falla(r.error);
  return ((r.data as PsNivel | null) ?? "none") as PsNivel;
}

const avisos = (d: unknown): AvisoPrevio[] => (Array.isArray(d) ? (d as Fila[]).map((a) => ({ personaId: String(a.persona_id ?? ""), nombre: String(a.nombre ?? ""), correo: String(a.correo ?? ""), motivo: a.motivo as AvisoPrevio["motivo"] })) : []);

export function crearActividadesSupabase(): PsApiAct {
  const rpc = async (nombre: string, args: Record<string, unknown>): Promise<unknown> => {
    const r = await supabase.rpc(nombre, args);
    if (r.error) throw falla(r.error);
    return r.data;
  };
  const campusPorId = async () => {
    const r = await supabase.from("campuses").select("id,name");
    if (r.error) throw falla(r.error);
    return new Map(((r.data ?? []) as Fila[]).map((c) => [String(c.id), String(c.name)]));
  };
  const actividadesDe = async (oficinaIds: string[]): Promise<Actividad[]> => {
    if (!oficinaIds.length) return [];
    const [r, campus] = await Promise.all([
      // PENDIENTE DE CONTRASTAR: columnas y relaciones de ps_actividades.
      supabase.from("ps_actividades").select("*, linea:ps_lineas(clave), asignaciones:ps_asignaciones(profile_id,quitado_en), checklist:ps_checklist(id,texto,hecho,orden)").in("oficina_unit_id", oficinaIds).order("fin"),
      campusPorId(),
    ]);
    if (r.error) throw falla(r.error);
    return ((r.data ?? []) as Fila[]).map((f): Actividad => ({
      id: String(f.id), oficinaId: String(f.oficina_unit_id), lineaNo: (f.linea as { clave?: string } | null)?.clave ?? null, titulo: String(f.titulo), descripcion: texto(f.descripcion),
      estado: f.estado as Actividad["estado"], prioridad: f.prioridad as Actividad["prioridad"], inicio: texto(f.inicio), fin: texto(f.fin), esHito: Boolean(f.es_hito),
      campus: f.campus_id ? (campus.get(String(f.campus_id)) ?? "Campus") : CAMPUS_TODOS,
      asignados: ((f.asignaciones ?? []) as Fila[]).filter((a) => !a.quitado_en).map((a) => String(a.profile_id)),
      checklist: ((f.checklist ?? []) as Fila[]).sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0)).map((i) => ({ id: String(i.id), texto: String(i.texto), hecho: Boolean(i.hecho) })),
      creadaPor: String(f.creada_por ?? ""), creadaEn: String(f.creada_en ?? ""),
    }));
  };
  const equipoDe = async (oficinaId: string, yo: string | null, hoy: string): Promise<MiembroEquipo[]> => {
    const [{ miembros }, acts] = await Promise.all([leerUnidades(), actividadesDe([oficinaId])]);
    return miembros.filter((m) => m.unitId === oficinaId).map((m) => ({ id: m.profileId, nombre: m.name, correo: m.email, papel: m.role, asignable: m.role !== "visor", esYo: m.profileId === yo, carga: cargaPorPersona(acts, m.profileId, hoy) }));
  };
  return {
    hoy: hoyLocal(),
    demo: false,
    async yo() {
      const id = await miId();
      if (!id) return null;
      const r = await supabase.from("profiles").select("full_name,email").eq("id", id).maybeSingle();
      const f = r.data as { full_name: string | null; email: string | null } | null;
      return { id, nombre: f?.full_name?.trim() || f?.email || "Usted", correo: f?.email ?? "" };
    },
    async oficinasVisibles() {
      const [{ unidades, miembros }, yo, niv] = await Promise.all([leerUnidades(), miId(), nivel()]);
      // PENDIENTE DE CONTRASTAR: cuántas líneas tiene cada oficina (ps_version_lineas.oficina_unit_id de la versión vigente).
      const conteo = await supabase.rpc("ps_lineas_por_oficina");
      const n = new Map(((conteo.error ? [] : conteo.data ?? []) as Fila[]).map((c) => [String(c.unit_id), Number(c.n)]));
      const mias = (id: string) => (yo ? roleAt(unidades, miembros, yo, id) : null);
      return unidades
        .filter((u) => niv === "admin" || mias(u.id) !== null)
        .map((u): OficinaVista => {
          const papel = mias(u.id);
          const fuente = yo ? roleSource(unidades, miembros, yo, u.id) : null;
          return { id: u.id, nombre: u.name, parentId: u.parentId, papel, heredadoDe: fuente && fuente.id !== u.id ? fuente.name : null, poder: poderEn(niv, papel), nLineas: n.get(u.id) ?? 0 };
        });
    },
    async personas() {
      const { miembros } = await leerUnidades();
      return [...new Map(miembros.map((m): [string, PersonaRef] => [m.profileId, { id: m.profileId, nombre: m.name, correo: m.email }])).values()];
    },
    async equipo(oficinaId) {
      return equipoDe(oficinaId, await miId(), hoyLocal());
    },
    async lineasDeOficina(oficinaId) {
      // PENDIENTE DE CONTRASTAR: líneas de la versión vigente cuya oficina_unit_id es esta.
      const r = await supabase.rpc("ps_lineas_de_oficina", { p_oficina: oficinaId });
      if (r.error) throw falla(r.error);
      return ((r.data ?? []) as Fila[]).map((f): LineaOficina => ({ no: String(f.clave), nombre: String(f.nombre), monto: f.monto === null || f.monto === undefined ? null : Number(f.monto), campus: String(f.campus ?? CAMPUS_TODOS), prioridad: String(f.prioridad ?? ""), inicio: texto(f.inicio), fin: texto(f.fin), clasif: String(f.clasif ?? "") }));
    },
    actividades: actividadesDe,
    async actividad(id) {
      const lista = await supabase.from("ps_actividades").select("oficina_unit_id").eq("id", id).maybeSingle();
      if (lista.error) throw falla(lista.error);
      if (!lista.data) throw new Error("Esa actividad no existe o no puede verla.");
      const [acts, ev] = await Promise.all([
        actividadesDe([String((lista.data as Fila).oficina_unit_id)]),
        // PENDIENTE DE CONTRASTAR: eventos de la actividad (ps_eventos filtrado por actividad, o una vista).
        supabase.rpc("ps_actividad_eventos", { p_actividad: id }),
      ]);
      const actividad = acts.find((a) => a.id === id);
      if (!actividad) throw new Error("Esa actividad no existe o no puede verla.");
      const eventos = ((ev.error ? [] : ev.data ?? []) as Fila[]).map((e, i): EventoActividad => ({ id: String(e.id ?? i), tipo: String(e.tipo ?? "editada") as TipoEvento, por: String(e.por ?? ""), en: String(e.creado_en ?? ""), detalle: String(e.detalle ?? ""), de: texto(e.de), a: texto(e.a), motivo: texto(e.motivo) }));
      return { actividad, eventos };
    },
    async guardarActividad(d) {
      const r = (await rpc("ps_actividad_guardar", { p_datos: { id: d.id ?? null, oficina_unit_id: d.oficinaId, linea_clave: d.lineaNo, titulo: d.titulo, descripcion: d.descripcion || null, inicio: d.esHito ? null : d.inicio, fin: d.fin, es_hito: d.esHito, prioridad: d.prioridad, campus: d.campus, asignados: d.asignados } })) as Fila;
      return { id: String(r.id), avisara: avisos(r.avisara) };
    },
    async moverActividad(id, estado) {
      await rpc("ps_actividad_mover", { p_id: id, p_estado: estado });
    },
    async asignar(ids, personaId) {
      const r = (await rpc("ps_actividad_asignar", { p_ids: ids, p_persona: personaId })) as Fila | null;
      return { avisara: avisos(r?.avisara) };
    },
    async transferir(id, de, a, motivo) {
      const r = (await rpc("ps_actividad_transferir", { p_id: id, p_de: de, p_a: a, p_motivo: motivo })) as Fila | null;
      return { avisara: avisos(r?.avisara) };
    },
    async marcarChecklist(id, itemId, hecho) {
      await rpc("ps_checklist_marcar", { p_actividad: id, p_item: itemId, p_hecho: hecho });
    },
    async agregarItemChecklist(id, textoItem) {
      await rpc("ps_checklist_agregar", { p_actividad: id, p_texto: textoItem });
    },
    async cargarActividades(oficinaId, filas, nombreArchivo) {
      const r = (await rpc("ps_actividades_cargar", { p_oficina: oficinaId, p_nota: `Importadas desde Excel: ${nombreArchivo}`.slice(0, 200), p_actividades: filas.map((d) => ({ linea_clave: d.lineaNo, titulo: d.titulo, descripcion: d.descripcion || null, inicio: d.esHito ? null : d.inicio, fin: d.fin, es_hito: d.esHito, prioridad: d.prioridad, campus: d.campus, asignados: d.asignados })) })) as Fila;
      return { recibidas: filas.length, creadas: Number(r.creadas ?? 0), errores: ((r.errores ?? []) as ErrorCargaAct[]), avisara: avisos(r.avisara) };
    },
  };
}
