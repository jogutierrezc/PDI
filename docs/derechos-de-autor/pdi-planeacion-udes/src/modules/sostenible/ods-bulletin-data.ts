/* =============================================================================
   UDES Sostenible · boletín de informes ODS: ediciones en PDF.

   Reutiliza el mecanismo del Boletín UDES en Cifras (od_bulletins +
   od_bulletin_editions + bucket «boletines»). El boletín ODS es una fila global
   (report_id nulo) del periodo vigente con el slug ODS_BULLETIN_SLUG; sus
   ediciones congeladas son los PDF que el público descarga.
   ========================================================================== */

import { useCurrentPeriod } from "../../data/queries";
import { useAuth } from "../../lib/auth";
import type { OdBulletinEditionRow, OdBulletinRow } from "../../types/database";
import {
  bulletinFileUrl,
  useBulletins,
  useCreateEdition,
  useDeleteEdition,
  usePublicBulletins,
  useSaveBulletin,
  useSetEditionStatus,
} from "../boletin/data";
import type { BulletinBundle } from "../boletin/data";
import { ODS_BULLETIN_SLUG } from "./ods-data";

export const ODS_BULLETIN_TITLE = "Boletín de informes ODS";

/** Plantilla del boletín ODS dentro de un conjunto de boletines. */
export function findOdsBulletin(bulletins: OdBulletinRow[] | undefined, slug = ODS_BULLETIN_SLUG): OdBulletinRow | undefined {
  return bulletins?.find((b) => b.slug === slug && b.report_id === null);
}

/** Ediciones de una plantilla, de la más reciente a la más antigua. */
export function editionsOfBulletin(editions: OdBulletinEditionRow[] | undefined, bulletinId: string | undefined): OdBulletinEditionRow[] {
  if (!editions || !bulletinId) return [];
  return editions
    .filter((e) => e.bulletin_id === bulletinId)
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
}

/** Edición pública: la publicada más reciente de la plantilla; las retiradas no cuentan. */
export function latestPublishedEdition(
  bundle: BulletinBundle | undefined,
  slug = ODS_BULLETIN_SLUG,
): OdBulletinEditionRow | undefined {
  if (!bundle) return undefined;
  const row = findOdsBulletin(bundle.bulletins, slug);
  return editionsOfBulletin(bundle.editions, row?.id).find((e) => e.status === "publicado");
}

/** Regla de quién emite: la misma que la escritura de filas globales en RLS (0024/0027). */
export function canIssueOdsBulletin(auth: { hasRole: (r: "planeacion") => boolean; canEditPeriod: () => boolean }): boolean {
  return auth.hasRole("planeacion") && auth.canEditPeriod();
}

export interface OdsPublicEdition {
  edition: OdBulletinEditionRow | undefined;
  url: string | null;
  label: string;
  isLoading: boolean;
}

/** Edición pública más reciente del boletín ODS. */
export function useOdsBulletinEditions(): OdsPublicEdition {
  const period = useCurrentPeriod();
  const bundle = usePublicBulletins(period.data?.id);
  const edition = latestPublishedEdition(bundle.data);
  return {
    edition,
    url: edition ? bulletinFileUrl(edition.file_path) : null,
    label: edition?.label ?? "",
    isLoading: period.isLoading || bundle.isLoading,
  };
}

export interface PublishInput {
  file: File;
  label: string;
  cutLabel: string;
  note: string;
}

/** Plantilla y ediciones (todos los estados) para quien puede emitir. */
export function useOdsBulletinAdmin() {
  const auth = useAuth();
  const period = useCurrentPeriod();
  const periodId = period.data?.id;
  const bundle = useBulletins(periodId);
  const save = useSaveBulletin();
  const create = useCreateEdition();
  const setStatus = useSetEditionStatus();
  const remove = useDeleteEdition();

  const row = findOdsBulletin(bundle.data?.bulletins);
  const editions = editionsOfBulletin(bundle.data?.editions, row?.id);

  /** Sube el PDF y lo deja publicado; crea la plantilla del boletín ODS si aún no existe. */
  const publish = async ({ file, label, cutLabel, note }: PublishInput) => {
    if (!periodId || !period.data) throw new Error("No hay un periodo vigente.");
    const template =
      row ??
      (await save.mutateAsync({
        period_id: periodId,
        report_id: null,
        slug: ODS_BULLETIN_SLUG,
        title: ODS_BULLETIN_TITLE,
        settings: {},
        status: "publicado",
      }));
    return create.mutateAsync({ bulletin: template, file, label, cutLabel, periodLabel: period.data.label, note });
  };

  return {
    allowed: canIssueOdsBulletin(auth),
    period: period.data ?? null,
    row,
    editions,
    isLoading: period.isLoading || bundle.isLoading,
    error: period.error ?? bundle.error ?? null,
    publish,
    publishing: save.isPending || create.isPending,
    setStatus: setStatus.mutateAsync,
    settingStatus: setStatus.isPending,
    remove: remove.mutateAsync,
    removing: remove.isPending,
  };
}
