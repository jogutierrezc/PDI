import { describe, expect, it } from "vitest";
import { ReloadPlan } from "./reload-plan";

const H = "periodo-1";
const names = (only: ReadonlySet<string> | null) => (only ? [...only].sort() : null);

/** Una lectura completa ya hecha en t = 0. */
function loaded(plan: ReloadPlan) {
  plan.settle(H, plan.take(H, 0), 0);
  return plan;
}

describe("qué se relee después de guardar", () => {
  it("la primera lectura va entera", () => {
    expect(new ReloadPlan().take(H, 0).only).toBeNull();
  });

  it("guardar una rejilla relee solo su familia", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], true);
    expect(names(plan.take(H, 1000).only)).toEqual(["indicators"]);
  });

  it("una escritura sin familias declaradas relee todo", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, "all", true);
    expect(plan.take(H, 1000).only).toBeNull();
  });

  it("dos escrituras seguidas suman sus familias", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], true);
    plan.mark(H, ["blocks"], false);
    expect(names(plan.take(H, 1000).only)).toEqual(["blocks", "indicators"]);
  });

  it("después de un «todo», nada lo rebaja a una parte", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, "all", true);
    plan.mark(H, ["indicators"], false);
    expect(plan.take(H, 1000).only).toBeNull();
  });

  it("una lectura que ya estaba vencida sin nada apuntado va entera", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], false);
    expect(plan.take(H, 1000).only).toBeNull();
  });

  it("al terminar bien, lo apuntado se borra y la siguiente relectura sin escritura va entera", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], true);
    const take = plan.take(H, 1000);
    plan.settle(H, take, 1200);
    expect(plan.take(H, 2000).only).toBeNull();
  });

  it("si la relectura falla, la siguiente vuelve a pedir lo mismo", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["maps"], true);
    plan.take(H, 1000); // falla: no hay settle
    expect(names(plan.take(H, 2000).only)).toEqual(["maps"]);
  });

  it("lo apuntado durante una relectura no se pierde cuando esa relectura termina", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], true);
    const take = plan.take(H, 1000);
    plan.mark(H, ["breakdowns"], false);
    plan.settle(H, take, 1500);
    expect(names(plan.take(H, 2000).only)).toEqual(["breakdowns", "indicators"]);
  });

  it("pasada la vigencia de la última lectura completa, relee todo", () => {
    const plan = loaded(new ReloadPlan(60_000));
    plan.mark(H, ["indicators"], true);
    expect(names(plan.take(H, 30_000).only)).toEqual(["indicators"]);
    expect(plan.take(H, 61_000).only).toBeNull();
  });

  it("una relectura parcial no renueva la vigencia de la completa", () => {
    const plan = loaded(new ReloadPlan(60_000));
    plan.mark(H, ["indicators"], true);
    plan.settle(H, plan.take(H, 30_000), 30_500);
    plan.mark(H, ["indicators"], true);
    expect(plan.take(H, 61_000).only).toBeNull();
  });

  it("cada lectura lleva su propia cuenta", () => {
    const plan = loaded(new ReloadPlan());
    plan.mark(H, ["indicators"], true);
    expect(plan.take("periodo-2", 1000).only).toBeNull();
  });
});
