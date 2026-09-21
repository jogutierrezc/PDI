/* =============================================================================
   Mis Tableros · lectura y escritura en Supabase.

   Mismo patrón que UDES en Cifras (od-data.ts): una consulta por tabla, sin
   incrustaciones, y una envoltura de escritura que invalida lo que toca.

   Si las tablas todavía no existen —la migración sin aplicar— las lecturas
   devuelven vacío en vez de romper la pantalla, como hacen los conjuntos
   libres y el Observatorio. Así la intranet sigue entrando y el aviso lo da
   la pantalla, no una pila de errores.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { describeDatabaseError } from "../../data/errors";
import type { DatabaseError } from "../../data/errors";
import type { AppRole } from "../../types/database";
import type {
  Board,
  BoardDataset,
  BoardReview,
  BoardView,
  BoardVisibility,
  Unit,
  UnitMember,
  UnitRole,
} from "./model";


export const boardKeys = {
  all: ["tableros"] as const,
  units: ["tableros", "unidades"] as const,
  boards: (unitId?: string) => ["tableros", "tableros", unitId ?? "todos"] as const,
  board: (unitSlug: string, boardSlug: string) => ["tableros", "tablero", unitSlug, boardSlug] as const,
  reviews: ["tableros", "revisiones"] as const,
};

type Result<T> = { data: T | null; error: DatabaseError | null };

/** Tablas de una migración que puede no estar aplicada todavía. */
const MISSING = new Set(["PGRST205", "42P01", "42883"]);

function rows<T>({ data, error }: Result<T[]>): T[] {
  if (error) {
    if (MISSING.has(error.code ?? "")) return [];
    throw describeDatabaseError(error);
  }
  return data ?? [];
}

function one<T>({ data, error }: Result<T>): T {
  if (error) throw describeDatabaseError(error);
  return data as T;
}

const run = async <T>(query: PromiseLike<Result<T>>) => one(await query);

/** Envuelve una escritura: al terminar, todo lo de Mis Tableros se relee. */
function useBoardMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}

/* --- El organigrama ---------------------------------------------------------- */

interface UnitRow {
  id: string;
  parent_id: string | null;
  kind: Unit["kind"];
  code: string;
  name: string;
  slug: string;
  description: string;
  position: number;
}

interface MemberRow {
  id: string;
  unit_id: string;
  profile_id: string;
  role: UnitRole;
  profiles: { full_name: string | null; email: string | null } | null;
}

const toUnit = (r: UnitRow): Unit => ({
  id: r.id,
  parentId: r.parent_id,
  kind: r.kind,
  code: r.code,
  name: r.name,
  slug: r.slug,
  description: r.description,
  position: r.position,
});

/**
 * El árbol entero y las pertenencias que se pueden leer.
 *
 * El árbol viene completo —es la estructura de la universidad, no un dato
 * reservado— y las pertenencias vienen filtradas por RLS: solo las de las
 * unidades que quien pregunta puede ver. La pantalla no tiene que recortar
 * nada.
 */
export function useUnits() {
  return useQuery({
    queryKey: boardKeys.units,
    queryFn: async () => {
      const [unitRows, memberRows] = await Promise.all([
        supabase.from("units").select("*").order("position").then((r) => rows<UnitRow>(r as Result<UnitRow[]>)),
        supabase
          .from("unit_members")
          .select("id,unit_id,profile_id,role,profiles(full_name,email)")
          .then((r) => rows<MemberRow>(r as Result<MemberRow[]>)),
      ]);
      const units = unitRows.map(toUnit);
      const members: UnitMember[] = memberRows.map((m) => ({
        id: m.id,
        unitId: m.unit_id,
        profileId: m.profile_id,
        role: m.role,
        name: m.profiles?.full_name?.trim() || m.profiles?.email || "Sin nombre",
        email: m.profiles?.email ?? "",
      }));
      return { units, members };
    },
  });
}

export function useSaveUnit() {
  return useBoardMutation(async (unit: Partial<UnitRow> & { name: string; code: string; slug: string }) => {
    const { id, ...fields } = unit;
    if (id) await run(supabase.from("units").update(fields).eq("id", id).select("id").single());
    else await run(supabase.from("units").insert(fields).select("id").single());
  });
}

export function useDeleteUnit() {
  return useBoardMutation(async (unitId: string) => {
    await run(supabase.from("units").delete().eq("id", unitId).select("id").maybeSingle());
  });
}

export function useSaveMember() {
  return useBoardMutation(async ({ unitId, profileId, role }: { unitId: string; profileId: string; role: UnitRole }) => {
    await run(
      supabase
        .from("unit_members")
        .upsert({ unit_id: unitId, profile_id: profileId, role }, { onConflict: "unit_id,profile_id" })
        .select("id")
        .single(),
    );
  });
}

export function useRemoveMember() {
  return useBoardMutation(async (memberId: string) => {
    await run(supabase.from("unit_members").delete().eq("id", memberId).select("id").maybeSingle());
  });
}

/* --- Los tableros -------------------------------------------------------------- */

interface BoardRow {
  id: string;
  unit_id: string;
  slug: string;
  title: string;
  description: string;
  visibility: BoardVisibility;
  pages: { slug: string; title: string }[];
  position: number;
  updated_at: string;
}

const toBoard = (r: BoardRow): Board => ({
  id: r.id,
  unitId: r.unit_id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  visibility: r.visibility,
  pages: Array.isArray(r.pages) && r.pages.length ? r.pages : [{ slug: "panorama", title: "Panorama" }],
  position: r.position,
  updatedAt: r.updated_at,
});

/** Todos los tableros que quien pregunta puede leer. RLS hace el recorte. */
export function useBoards() {
  return useQuery({
    queryKey: boardKeys.boards(),
    queryFn: async () => {
      const list = await supabase
        .from("boards")
        .select("*")
        .order("position")
        .then((r) => rows<BoardRow>(r as Result<BoardRow[]>));
      return list.map(toBoard);
    },
  });
}

export function useSaveBoard() {
  return useBoardMutation(async (board: Partial<BoardRow> & { unit_id: string; title: string; slug: string }) => {
    const { id, updated_at, ...fields } = board;
    void updated_at;
    if (id) await run(supabase.from("boards").update(fields).eq("id", id).select("id").single());
    else await run(supabase.from("boards").insert(fields).select("id").single());
  });
}

export function useDeleteBoard() {
  return useBoardMutation(async (boardId: string) => {
    await run(supabase.from("boards").delete().eq("id", boardId).select("id").maybeSingle());
  });
}

/* --- El contenido de un tablero ------------------------------------------------ */

interface DatasetRow {
  id: string;
  board_id: string;
  title: string;
  description: string;
  source: string;
  data_type: BoardDataset["dataType"];
  temporality: BoardDataset["temporality"];
  period_label: string;
  columns: BoardDataset["columns"];
  rows: BoardDataset["rows"];
  anonymization: BoardDataset["anonymization"];
  position: number;
  updated_at: string;
}

interface ViewRow {
  id: string;
  board_id: string;
  dataset_id: string;
  page: string;
  spec: Record<string, unknown>;
  size: "media" | "completa";
  visible: boolean;
  position: number;
}

const toDataset = (r: DatasetRow): BoardDataset => ({
  id: r.id,
  boardId: r.board_id,
  title: r.title,
  description: r.description,
  source: r.source,
  dataType: r.data_type,
  temporality: r.temporality,
  periodLabel: r.period_label,
  columns: Array.isArray(r.columns) ? r.columns : [],
  rows: Array.isArray(r.rows) ? r.rows : [],
  anonymization: r.anonymization ?? null,
  position: r.position,
  updatedAt: r.updated_at,
});

const toView = (r: ViewRow): BoardView => ({
  id: r.id,
  boardId: r.board_id,
  datasetId: r.dataset_id,
  page: r.page,
  spec: r.spec ?? {},
  size: r.size,
  visible: r.visible,
  position: r.position,
});

/** Un tablero entero por su dirección: la unidad, el tablero y su contenido. */
export function useBoardBySlug(unitSlug: string | undefined, boardSlug: string | undefined) {
  return useQuery({
    queryKey: boardKeys.board(unitSlug ?? "", boardSlug ?? ""),
    enabled: Boolean(unitSlug && boardSlug),
    queryFn: async () => {
      const unitRows = await supabase
        .from("units")
        .select("*")
        .eq("slug", unitSlug!)
        .then((r) => rows<UnitRow>(r as Result<UnitRow[]>));
      const unit = unitRows[0] ? toUnit(unitRows[0]) : null;
      if (!unit) return null;

      const boardRows = await supabase
        .from("boards")
        .select("*")
        .eq("unit_id", unit.id)
        .eq("slug", boardSlug!)
        .then((r) => rows<BoardRow>(r as Result<BoardRow[]>));
      // Sin fila no se distingue «no existe» de «no te toca»: RLS no dice cuál
      // de las dos, y está bien que no lo diga.
      const board = boardRows[0] ? toBoard(boardRows[0]) : null;
      if (!board) return { unit, board: null, datasets: [], views: [] };

      const [datasetRows, viewRows] = await Promise.all([
        supabase.from("board_datasets").select("*").eq("board_id", board.id).order("position").then((r) => rows<DatasetRow>(r as Result<DatasetRow[]>)),
        supabase.from("board_views").select("*").eq("board_id", board.id).order("position").then((r) => rows<ViewRow>(r as Result<ViewRow[]>)),
      ]);
      return { unit, board, datasets: datasetRows.map(toDataset), views: viewRows.map(toView) };
    },
  });
}

/** El contenido de un tablero, para el taller. */
export function useBoardContent(boardId: string | undefined) {
  return useQuery({
    queryKey: [...boardKeys.all, "contenido", boardId ?? "ninguno"],
    enabled: Boolean(boardId),
    queryFn: async () => {
      const [datasetRows, viewRows] = await Promise.all([
        supabase.from("board_datasets").select("*").eq("board_id", boardId!).order("position").then((r) => rows<DatasetRow>(r as Result<DatasetRow[]>)),
        supabase.from("board_views").select("*").eq("board_id", boardId!).order("position").then((r) => rows<ViewRow>(r as Result<ViewRow[]>)),
      ]);
      return { datasets: datasetRows.map(toDataset), views: viewRows.map(toView) };
    },
  });
}

export function useSaveDataset() {
  return useBoardMutation(async (dataset: Partial<DatasetRow> & { board_id: string; title: string }) => {
    const { id, updated_at, ...fields } = dataset;
    void updated_at;
    if (id) await run(supabase.from("board_datasets").update(fields).eq("id", id).select("id").single());
    else await run(supabase.from("board_datasets").insert(fields).select("id").single());
  });
}

export function useDeleteDataset() {
  return useBoardMutation(async (datasetId: string) => {
    await run(supabase.from("board_datasets").delete().eq("id", datasetId).select("id").maybeSingle());
  });
}

export function useSaveView() {
  return useBoardMutation(async (view: Partial<ViewRow> & { board_id: string; dataset_id: string }) => {
    const { id, ...fields } = view;
    if (id) await run(supabase.from("board_views").update(fields).eq("id", id).select("id").single());
    else await run(supabase.from("board_views").insert(fields).select("id").single());
  });
}

export function useDeleteView() {
  return useBoardMutation(async (viewId: string) => {
    await run(supabase.from("board_views").delete().eq("id", viewId).select("id").maybeSingle());
  });
}

/* --- La publicación ------------------------------------------------------------ */

interface ReviewRow {
  id: string;
  board_id: string;
  target: BoardVisibility;
  state: BoardReview["state"];
  checks: BoardReview["checks"];
  note: string;
  requested_by: string | null;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: string;
}

const toReview = (r: ReviewRow): BoardReview => ({
  id: r.id,
  boardId: r.board_id,
  target: r.target,
  state: r.state,
  checks: Array.isArray(r.checks) ? r.checks : [],
  note: r.note,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  resolvedBy: r.resolved_by,
  resolvedAt: r.resolved_at,
  resolution: r.resolution,
});

export function useReviews() {
  return useQuery({
    queryKey: boardKeys.reviews,
    queryFn: async () => {
      const list = await supabase
        .from("board_reviews")
        .select("*")
        .order("requested_at", { ascending: false })
        .then((r) => rows<ReviewRow>(r as Result<ReviewRow[]>));
      return list.map(toReview);
    },
  });
}

export function useRequestReview() {
  return useBoardMutation(
    async ({ boardId, checks, note }: { boardId: string; checks: BoardReview["checks"]; note: string }) => {
      await run(
        supabase
          .from("board_reviews")
          .insert({ board_id: boardId, target: "publico", checks, note })
          .select("id")
          .single(),
      );
    },
  );
}

export function useWithdrawReview() {
  return useBoardMutation(async (reviewId: string) => {
    await run(supabase.from("board_reviews").delete().eq("id", reviewId).select("id").maybeSingle());
  });
}

/**
 * Resolver una solicitud.
 *
 * Aprobarla hace dos cosas: marca la solicitud y sube el tablero de peldaño.
 * Van seguidas y no en una transacción porque PostgREST no las da juntas; si
 * la segunda fallara, la solicitud queda aprobada y el tablero sin subir, que
 * es el fallo menos malo de los dos: se ve en la lista y se vuelve a intentar.
 */
export function useResolveReview() {
  return useBoardMutation(
    async ({ review, approve, resolution }: { review: BoardReview; approve: boolean; resolution: string }) => {
      await run(
        supabase
          .from("board_reviews")
          .update({
            state: approve ? "aprobada" : "devuelta",
            resolution,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select("id")
          .single(),
      );
      if (approve) {
        await run(supabase.from("boards").update({ visibility: review.target }).eq("id", review.boardId).select("id").single());
      }
    },
  );
}

/* --- Personas a las que invitar ------------------------------------------------ */

/**
 * El directorio de la intranet: a quién se puede invitar a una unidad.
 *
 * Son las personas con cuenta de verdad, no una lista aparte. Las inactivas no
 * salen: invitar a alguien que ya no entra deja una pertenencia que nadie
 * ejerce y que luego nadie entiende. La política `profiles_select` (0002) deja
 * leer el directorio a todo el personal de intranet, así que esto funciona
 * igual para Planeación que para la jefatura de una facultad.
 */
export function useProfiles() {
  return useQuery({
    queryKey: [...boardKeys.all, "perfiles"],
    queryFn: async () => {
      const list = await supabase
        .from("profiles")
        .select("id,full_name,email,unit,role,is_active")
        .eq("is_active", true)
        .order("full_name")
        .then((r) =>
          rows<{ id: string; full_name: string | null; email: string | null; unit: string | null; role: AppRole; is_active: boolean }>(
            r as Result<{ id: string; full_name: string | null; email: string | null; unit: string | null; role: AppRole; is_active: boolean }[]>,
          ),
        );
      return list.map((p) => ({
        id: p.id,
        name: p.full_name?.trim() || p.email || "Sin nombre",
        email: p.email ?? "",
        // La dependencia que la persona declaró en su perfil. Es texto libre y
        // no tiene por qué coincidir con una unidad del organigrama, pero
        // ayuda a distinguir dos personas con el mismo nombre.
        unit: p.unit?.trim() ?? "",
        role: p.role,
      }));
    },
  });
}
