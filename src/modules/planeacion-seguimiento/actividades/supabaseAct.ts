/* =============================================================================
   Planeación y Seguimiento · Fase 2 · implementación SUPABASE, contrastada con
   docs/planeacion-seguimiento/CONTRATO-BD-F2.md y la migración 0287 (leídas, NO
   ejecutadas contra una base real: no hay base disponible en este entorno).

   Oficina = unidad (`units`). El papel con herencia lo da la base (`ps_oficinas_visibles` →
   `poder`, `unit_role`); aquí solo se reutiliza `roleSource` (tableros/model.ts, espejo de
   `unit_role_at`) para decir DE QUÉ unidad viene un papel heredado. Todo se escribe por
   funciones ps_*; los avisos por correo los encola la base y los envía la función de borde
   `planeacion-seguimiento` (acción «avisos»), que esta capa invoca después de cada acción.

   Diferencias que quedan, dichas con franqueza:
     · la base no devuelve las líneas de una oficina por función: se leen de `ps_version_lineas`
       (versión vigente, `oficina_unit_id`), tabla de solo lectura de la 0286;
     · `ps_actividades_oficina` devuelve el checklist como conteo {total, hechos}: en las listas
       se arma con elementos sin texto para que el n/m del tablero cuadre; el detalle trae los reales;
     · editar una actividad no quita responsables (la base lo pide con motivo ≥ 20 en
       `ps_actividad_desasignar` / transferir): la edición solo suma;
     · el historial que ve quien no es gestor son las asignaciones y los comentarios del detalle
       (`ps_bitacora_oficina` es de gestor, aprobador y administrador).
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { roleSource } from "../../tableros/model";
import { leerUnidades } from "./unidadesPortal";
import type { PsNivel } from "../modelo";
import { CAMPUS_TODOS } from "../modelo";
import type { ConflictoCampus, ErrorCargaAct, PersonaRef, PsApiAct, ResultadoAccion } from "./contratoApi";
import type { Actividad, ActividadDetalle, AvisoPrevio, DatosActividad, EventoActividad, LineaOficina, MiembroEquipo, OficinaVista, PapelOficina, Poder, TipoEvento } from "./modelo";
import { avisoAsignacion, avisoTransferencia } from "./reglas";

type Fila = Record<string, unknown>;
const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const falla = (e: { message?: string } | null): Error => new Error(e?.message || "No se pudo completar la operación.");
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

async function miId(): Promise<string | null> {
  const r = await supabase.auth.getUser();
  return r.data.user?.id ?? null;
}
async function nivel(): Promise<PsNivel> {
  const r = await supabase.rpc("ps_nivel_actual");
  if (r.error) throw falla(r.error);
  return ((r.data as PsNivel | null) ?? "none") as PsNivel;
}
async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw falla(r.error);
  return r.data as T;
}
/** Vacía la cola de correos al momento (si no, sale con el cron). No bloquea ni falla la acción. */
const despacharAvisos = () => {
  void supabase.functions.invoke("planeacion-seguimiento", { body: { action: "avisos" } }).catch(() => undefined);
};

const poderDe = (v: unknown): Poder => (v === "admin" || v === "gestor" ? "gestor" : v === "colaborador" ? "colaborador" : v === "lector" ? "lector" : "ninguno");
const papelDe = (v: unknown): PapelOficina | null => (v === "jefe" || v === "editor" || v === "visor" ? v : null);

export function crearActividadesSupabase(): PsApiAct {
  const nombres = new Map<string, PersonaRef>();
  const campusPorId = async () => {
    const r = await supabase.from("campuses").select("id,name");
    if (r.error) throw falla(r.error);
    return new Map(((r.data ?? []) as Fila[]).map((c) => [String(c.id), String(c.name)]));
  };
  const actDe = (f: Fila): Actividad => {
    const check = (f.checklist ?? { total: 0, hechos: 0 }) as { total?: number; hechos?: number };
    const total = Number(check.total ?? 0);
    const hechos = Number(check.hechos ?? 0);
    const resp = lista<Fila>(f.responsables);
    for (const r of resp) nombres.set(String(r.id), { id: String(r.id), nombre: String(r.nombre ?? "Persona sin nombre"), correo: nombres.get(String(r.id))?.correo ?? "" });
    return {
      id: String(f.id), oficinaId: String(f.oficina_unit_id), lineaNo: texto(f.linea_clave), titulo: String(f.titulo), descripcion: texto(f.descripcion),
      estado: f.estado as Actividad["estado"], prioridad: f.prioridad as Actividad["prioridad"], inicio: texto(f.inicio), fin: texto(f.fin), esHito: Boolean(f.es_hito),
      campus: texto(f.campus) ?? CAMPUS_TODOS, asignados: resp.map((r) => String(r.id)),
      checklist: Array.from({ length: total }, (_, i) => ({ id: `${f.id}-${i}`, texto: "", hecho: i < hechos })),
      creadaPor: String(f.creada_por ?? ""), creadaEn: String(f.creada_en ?? ""),
    };
  };
  const equipoDe = async (oficinaId: string, yo: string | null): Promise<MiembroEquipo[]> => {
    const [eq, carga] = await Promise.all([
      rpc<Fila[]>("ps_equipo_oficina", { p_unit: oficinaId }),
      // La carga detallada es de gestor y administrador; para los demás basta el conteo de activas del equipo.
      supabase.rpc("ps_carga_equipo", { p_unit: oficinaId }).then((r) => (r.error ? null : (r.data as { equipo?: Fila[] } | null))),
    ]);
    const det = new Map(lista<Fila>(carga?.equipo).map((c) => [String(c.perfil_id), c]));
    return eq.map((m): MiembroEquipo => {
      const id = String(m.perfil_id);
      const c = det.get(id);
      const activas = Number(c?.activas ?? m.activas ?? 0);
      nombres.set(id, { id, nombre: String(m.nombre ?? "Persona sin nombre"), correo: texto(m.correo) ?? "" });
      return {
        id, nombre: String(m.nombre ?? "Persona sin nombre"), correo: texto(m.correo) ?? "", papel: papelDe(m.unit_role) ?? "visor", campus: texto(m.campus), asignable: Boolean(m.asignable), esYo: id === yo,
        carga: { activas, vencidas: Number(c?.vencidas ?? 0), enRiesgo: Number(c?.en_riesgo ?? 0), total: activas },
      };
    });
  };
  const conflictos = (v: unknown): ConflictoCampus[] =>
    lista<Fila>(v).map((c) => ({ personaId: String(c.perfil_id), nombre: String(c.nombre ?? ""), campusPersona: texto(c.campus_miembro), campusActividad: texto(c.campus_actividad), actividadId: texto(c.actividad_id) ?? undefined }));
  const planId = async (): Promise<string> => {
    const r = await supabase.from("ps_planes").select("id").order("creado_en", { ascending: false }).limit(1);
    if (r.error) throw falla(r.error);
    const f = (r.data as Fila[] | null)?.[0];
    if (!f) throw new Error("Aún no hay un plan cargado.");
    return String(f.id);
  };
  const datosCrear = (d: DatosActividad) => ({
    titulo: d.titulo.trim(), descripcion: d.descripcion.trim() || null, linea_clave: d.lineaNo, campus: d.campus === CAMPUS_TODOS ? "" : d.campus, prioridad: d.prioridad,
    inicio: d.esHito ? null : d.inicio, fin: d.fin, es_hito: d.esHito,
  });

  return {
    hoy: hoyLocal(),
    demo: false,
    async yo() {
      const id = await miId();
      if (!id) return null;
      const r = await supabase.from("profiles").select("full_name,email").eq("id", id).maybeSingle();
      const f = r.data as { full_name: string | null; email: string | null } | null;
      const yo = { id, nombre: f?.full_name?.trim() || f?.email || "Usted", correo: f?.email ?? "" };
      nombres.set(id, yo);
      return yo;
    },
    async oficinasVisibles() {
      const niv = await nivel();
      const [filas, yo, u] = await Promise.all([
        rpc<Fila[]>("ps_oficinas_visibles", { p_todas: niv === "admin" }),
        miId(),
        leerUnidades().catch(() => null),
      ]);
      return filas.map((o): OficinaVista => {
        const id = String(o.unit_id);
        const fuente = u && yo ? roleSource(u.unidades, u.miembros, yo, id) : null;
        return { id, nombre: String(o.nombre), parentId: texto(o.parent_id), papel: papelDe(o.unit_role), heredadoDe: fuente && fuente.id !== id ? fuente.name : null, poder: poderDe(o.poder), nLineas: Number(o.lineas ?? 0) };
      });
    },
    async personas() {
      const ofs = await rpc<Fila[]>("ps_oficinas_visibles", { p_todas: false });
      await Promise.all(ofs.map((o) => equipoDe(String(o.unit_id), null).catch(() => [])));
      return [...nombres.values()];
    },
    async equipo(oficinaId) {
      return equipoDe(oficinaId, await miId());
    },
    async lineasDeOficina(oficinaId) {
      const plan = await supabase.from("ps_planes").select("version_vigente_id").order("creado_en", { ascending: false }).limit(1);
      if (plan.error) throw falla(plan.error);
      const v = (plan.data as Fila[] | null)?.[0]?.version_vigente_id;
      if (!v) return [];
      const [r, campus] = await Promise.all([
        supabase.from("ps_version_lineas").select("clave,nombre,monto,campus_id,prioridad,inicio,fin,clasif,orden").eq("version_id", v).eq("oficina_unit_id", oficinaId).order("orden"),
        campusPorId(),
      ]);
      if (r.error) throw falla(r.error);
      return ((r.data ?? []) as Fila[]).map((f): LineaOficina => ({ no: String(f.clave), nombre: String(f.nombre), monto: f.monto === null || f.monto === undefined ? null : Number(f.monto), campus: f.campus_id ? (campus.get(String(f.campus_id)) ?? "Campus") : CAMPUS_TODOS, prioridad: String(f.prioridad ?? ""), inicio: texto(f.inicio), fin: texto(f.fin), clasif: String(f.clasif ?? "") }));
    },
    async actividades(oficinaIds) {
      const r = await Promise.all(oficinaIds.map((id) => rpc<{ actividades?: Fila[] }>("ps_actividades_oficina", { p_unit: id, p_filtros: { limite: 1000 } })));
      return r.flatMap((x) => lista<Fila>(x.actividades).map(actDe));
    },
    async actividad(id): Promise<ActividadDetalle> {
      const d = await rpc<Fila>("ps_actividad_detalle", { p_id: id });
      const base = actDe(d.actividad as Fila);
      const actividad: Actividad = { ...base, checklist: lista<Fila>(d.checklist).map((i) => ({ id: String(i.id), texto: String(i.texto), hecho: Boolean(i.hecho) })) };
      const eventos: EventoActividad[] = [
        { id: `${id}-creada`, tipo: "creada" as const, por: nombres.get(actividad.creadaPor)?.nombre ?? "Alguien", en: actividad.creadaEn, detalle: "Se creó la actividad." },
        ...lista<Fila>(d.asignaciones).flatMap((a): EventoActividad[] => {
          const quien = String(a.nombre ?? "Persona sin nombre");
          const ev: EventoActividad[] = [{ id: `${a.id}-a`, tipo: "asignada", por: nombres.get(String(a.asignado_por))?.nombre ?? "Alguien", en: String(a.asignado_en), detalle: `Se asignó a ${quien}.`, a: String(a.perfil_id), motivo: texto(a.nota) }];
          if (a.quitado_en) ev.push({ id: `${a.id}-q`, tipo: "quitada", por: "Gestor de la oficina", en: String(a.quitado_en), detalle: `Dejó de tener asignada la actividad ${quien}.`, de: String(a.perfil_id), motivo: texto(a.motivo) });
          return ev;
        }),
        ...lista<Fila>(d.comentarios).map((c): EventoActividad => ({ id: String(c.id), tipo: (c.tipo === "transferencia" ? "transferida" : c.tipo === "cambio_estado" || c.tipo === "devolucion" ? "estado" : "editada") as TipoEvento, por: String(c.autor ?? "Alguien"), en: String(c.creado_en), detalle: c.tipo === "transferencia" ? "Transfirió la actividad." : c.tipo === "devolucion" ? "Devolvió la actividad." : c.tipo === "comentario" ? "Comentó." : String(c.texto), motivo: c.tipo === "comentario" || c.tipo === "transferencia" || c.tipo === "devolucion" ? texto(c.texto) : null })),
      ].sort((a, b) => a.en.localeCompare(b.en));
      return { actividad, eventos };
    },
    async guardarActividad(d, confirmar = false) {
      const equipo = await equipoDe(d.oficinaId, await miId());
      if (d.id) {
        const previa = await rpc<Fila>("ps_actividad_detalle", { p_id: d.id });
        const antes = lista<Fila>((previa.actividad as Fila).responsables).map((r) => String(r.id));
        await rpc("ps_actividad_editar", { p_cambios: { ...datosCrear(d), campus: d.campus === CAMPUS_TODOS ? "" : d.campus } , p_id: d.id });
        const nuevos = d.asignados.filter((x) => !antes.includes(x));
        if (nuevos.length) {
          const r = await rpc<Fila>("ps_actividad_asignar", { p_id: d.id, p_perfiles: nuevos, p_nota: "", p_confirmar_campus: confirmar });
          if (r.requiere_confirmacion) return { id: null, avisara: [], conflictos: conflictos(r.conflictos_campus) };
        }
        despacharAvisos();
        return { id: d.id, avisara: avisoAsignacion(nuevos, equipo, await miId()), conflictos: [] };
      }
      const r = await rpc<Fila>("ps_actividad_crear", { p_plan: await planId(), p_unit: d.oficinaId, p_datos: { ...datosCrear(d), responsables: d.asignados }, p_confirmar_campus: confirmar });
      if (r.ok === false || r.requiere_confirmacion) return { id: null, avisara: [], conflictos: conflictos(r.conflictos_campus) };
      despacharAvisos();
      return { id: String((r.actividad as Fila).id), avisara: avisoAsignacion(d.asignados, equipo, await miId()), conflictos: [] };
    },
    async moverActividad(id, estado, nota = "") {
      await rpc("ps_actividad_mover", { p_id: id, p_estado: estado, p_nota: nota.trim() });
      despacharAvisos();
    },
    async asignar(ids, personaId, confirmar = false): Promise<ResultadoAccion> {
      const r = await rpc<Fila>("ps_actividades_asignar", { p_ids: ids, p_perfil: personaId, p_confirmar_campus: confirmar });
      if (r.ok === false || r.requiere_confirmacion) return { avisara: [], conflictos: conflictos(r.conflictos_campus) };
      despacharAvisos();
      const p = nombres.get(personaId);
      return { avisara: Number(r.asignadas ?? 0) > 0 && p ? [{ personaId, nombre: p.nombre, correo: p.correo, motivo: "asignacion" } as AvisoPrevio] : [], conflictos: [] };
    },
    async transferir(id, de, a, motivo, confirmar = false): Promise<ResultadoAccion> {
      const det = await rpc<Fila>("ps_actividad_detalle", { p_id: id });
      const equipo = await equipoDe(String((det.actividad as Fila).oficina_unit_id), await miId());
      const r = await rpc<Fila>("ps_actividad_transferir", { p_id: id, p_de: de, p_a: a, p_motivo: motivo.trim(), p_confirmar_campus: confirmar });
      if (r.ok === false || r.requiere_confirmacion) return { avisara: [], conflictos: conflictos(r.conflictos_campus) };
      despacharAvisos();
      return { avisara: avisoTransferencia(de, a, equipo, await miId()), conflictos: [] };
    },
    async marcarChecklist(id, itemId, hecho) {
      void id;
      await rpc("ps_checklist_marcar", { p_item: itemId, p_hecho: hecho });
    },
    async agregarItemChecklist(id, textoItem) {
      await rpc("ps_checklist_agregar", { p_actividad: id, p_texto: textoItem });
    },
    async cargarActividades(oficinaId, filas, _archivo, confirmar = false) {
      const equipo = await equipoDe(oficinaId, await miId());
      const correo = (id: string) => equipo.find((m) => m.id === id)?.correo ?? "";
      const r = await rpc<Fila>("ps_actividades_cargar", {
        p_unit: oficinaId, p_plan: null, p_confirmar_campus: confirmar,
        p_filas: filas.map((d) => ({ ...datosCrear(d), linea: d.lineaNo, hito: d.esHito ? "Sí" : "No", responsable: d.asignados.map(correo).filter(Boolean).join(";") })),
      });
      const errores = lista<Fila>(r.errores).map((e): ErrorCargaAct => ({ fila: e.fila === null || e.fila === undefined ? null : Number(e.fila), campo: String(e.campo ?? ""), mensaje: String(e.mensaje ?? ""), campus: e.campo === "responsable" && /campus/i.test(String(e.mensaje ?? "")) }));
      const creadas = Number(r.creadas ?? 0);
      if (creadas > 0) despacharAvisos();
      return { recibidas: filas.length, creadas, errores, avisara: creadas ? avisoAsignacion([...new Set(filas.flatMap((d) => d.asignados))], equipo, await miId()) : [] };
    },
  };
}

