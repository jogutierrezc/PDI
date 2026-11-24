import { describe, expect, it } from "vitest";
import type { OdBulletinEditionRow, OdBulletinRow } from "../../types/database";
import { ODS_BULLETIN_SLUG } from "./ods-data";
import { canIssueOdsBulletin, editionsOfBulletin, findOdsBulletin, latestPublishedEdition } from "./ods-bulletin-data";

const row = (o: Partial<OdBulletinRow>): OdBulletinRow =>
  ({ id: "b1", period_id: "p", report_id: null, slug: ODS_BULLETIN_SLUG, title: "t", settings: {}, status: "publicado", ...o }) as OdBulletinRow;
const ed = (o: Partial<OdBulletinEditionRow>): OdBulletinEditionRow =>
  ({ id: "e", bulletin_id: "b1", label: "x", status: "publicado", published_at: "2026-01-01T00:00:00Z", ...o }) as OdBulletinEditionRow;

describe("boletín ODS", () => {
  it("elige la edición publicada más reciente e ignora retiradas y otros boletines", () => {
    const bundle = {
      bulletins: [row({}), row({ id: "b2", slug: "otro" })],
      editions: [
        ed({ id: "a", published_at: "2026-02-01T00:00:00Z" }),
        ed({ id: "b", published_at: "2026-03-01T00:00:00Z", status: "retirado" }),
        ed({ id: "c", bulletin_id: "b2", published_at: "2026-04-01T00:00:00Z" }),
      ],
    };
    expect(latestPublishedEdition(bundle)?.id).toBe("a");
  });
  it("sin plantilla o sin ediciones publicadas no hay edición", () => {
    expect(latestPublishedEdition(undefined)).toBeUndefined();
    expect(latestPublishedEdition({ bulletins: [], editions: [ed({})] })).toBeUndefined();
    expect(latestPublishedEdition({ bulletins: [row({})], editions: [ed({ status: "retirado" })] })).toBeUndefined();
  });
  it("solo la fila global cuenta como plantilla", () => {
    expect(findOdsBulletin([row({ report_id: "r" })])).toBeUndefined();
  });
  it("ordena las ediciones de la más reciente a la más antigua", () => {
    const list = editionsOfBulletin([ed({ id: "1", published_at: "2026-01-01" }), ed({ id: "2", published_at: "2026-05-01" })], "b1");
    expect(list.map((e) => e.id)).toEqual(["2", "1"]);
  });
  it("emite quien tiene rol planeación y alcance de periodo", () => {
    expect(canIssueOdsBulletin({ hasRole: () => true, canEditPeriod: () => true })).toBe(true);
    expect(canIssueOdsBulletin({ hasRole: () => true, canEditPeriod: () => false })).toBe(false);
    expect(canIssueOdsBulletin({ hasRole: () => false, canEditPeriod: () => true })).toBe(false);
  });
});
