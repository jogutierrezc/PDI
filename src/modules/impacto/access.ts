/* =============================================================================
   Indicadores de Impacto · qué puede hacer quien mira.

   Espejo de las funciones de 0078 (imp_can_read_fn, imp_can_define,
   imp_can_edit_program). La base es la que manda; esto solo decide qué
   botones y qué vistas enseñar, para no ofrecer lo que la base va a negar.

   En Impacto manda la PERTENENCIA, no el rol global: el rol de la intranet
   sale de los otros módulos (quien edita UDES en Cifras queda con
   «planeación»), así que una cuenta de programa puede traerlo sin ser de
   Planeación. Quien pertenece a un programa trabaja como programa; quien
   pertenece a una vicerrectoría u oficina, como tal. La vista completa es
   de la administración y de Planeación cuando no pertenece a ninguna unidad
   con indicadores.
   ========================================================================== */

import type { ImpactBase, Membership } from "./store";
import { FUNCTIONS, type ImpactUnit, type ProgramSite, type SubstantiveFunction } from "./model";

export interface ImpactAccess {
  /** Vista completa: administración, o Planeación sin unidades con indicadores. */
  reader: boolean;
  /** Trabaja como programa (pertenece a un programa o a una facultad). */
  programSide: boolean;
  /** Administración: escribe todo. */
  admin: boolean;
  /** Funciones cuyas fichas ve (todas para Planeación). */
  readableFns: SubstantiveFunction[];
  /** Unidades (vicerrectoría u oficina) a cuyo nombre puede crear fichas, por función. */
  ownersFor: (fn: SubstantiveFunction) => ImpactUnit[];
  /** ¿Puede editar esta ficha? */
  canDefine: (fn: SubstantiveFunction, ownerUnitId: string) => boolean;
  /** ¿Reorganiza los indicadores de programa de esta función? (editor o jefe de una unidad que la lleva) */
  canCurate: (fn: SubstantiveFunction) => boolean;
  /** ¿Ve alguna función como vicerrectoría u oficina? */
  onFunctionSide: boolean;
  /** Programas en sede con los que trabaja (o todos, para Planeación). */
  sites: ProgramSite[];
  canEditSite: (programId: string, campusId: string) => boolean;
}

const STRENGTH = { visor: 1, editor: 2, jefe: 3 } as const;

export function resolveAccess(base: ImpactBase, planeacion: boolean, admin: boolean): ImpactAccess {
  const byId = new Map(base.units.map((u) => [u.id, u]));
  const fnsOf = (unitId: string) => base.unitFunctions.filter((f) => f.unitId === unitId).map((f) => f.fn);

  // Pertenencia DIRECTA a una vicerrectoría u oficina con funciones.
  const functionMemberships = base.memberships.filter((m) => fnsOf(m.unitId).length > 0);
  const memberFns = new Set(functionMemberships.flatMap((m) => fnsOf(m.unitId)));
  // Pertenencia a un programa o a una facultad: el lado de los programas.
  const programMemberships = base.memberships.filter((m) => {
    const kind = byId.get(m.unitId)?.kind;
    return kind === "programa" || kind === "facultad";
  });
  const reader = admin || (planeacion && functionMemberships.length === 0 && programMemberships.length === 0);
  const readableFns = reader ? FUNCTIONS : FUNCTIONS.filter((fn) => memberFns.has(fn));

  const ownersFor = (fn: SubstantiveFunction) => {
    const owners = base.unitFunctions.filter((f) => f.fn === fn).map((f) => byId.get(f.unitId)).filter(Boolean) as ImpactUnit[];
    if (admin) return owners;
    return owners.filter((u) => functionMemberships.some((m) => m.unitId === u.id && m.role !== "visor"));
  };

  const canDefine = (fn: SubstantiveFunction, ownerUnitId: string) =>
    admin ||
    (fnsOf(ownerUnitId).includes(fn) && functionMemberships.some((m) => m.unitId === ownerUnitId && m.role !== "visor"));

  // Lo que manda sobre un programa en una sede: la pertenencia más cercana
  // del árbol que valga para esa sede (como imp_program_role).
  const chain = (unitId: string) => {
    const out: string[] = [];
    let walker: string | null = unitId;
    while (walker && out.length < 64) {
      out.push(walker);
      walker = byId.get(walker)?.parentId ?? null;
    }
    return out;
  };
  const roleAt = (programId: string, campusId: string): Membership["role"] | null => {
    const ids = chain(programId);
    let best: { depth: number; role: Membership["role"] } | null = null;
    for (const m of base.memberships) {
      const depth = ids.indexOf(m.unitId);
      if (depth < 0 || (m.campusId && m.campusId !== campusId)) continue;
      if (!best || depth < best.depth || (depth === best.depth && STRENGTH[m.role] > STRENGTH[best.role])) best = { depth, role: m.role };
    }
    return best?.role ?? null;
  };

  const campusName = new Map(base.campuses.map((c) => [c.id, c]));
  const sites: ProgramSite[] = base.offer
    .filter((o) => reader || roleAt(o.programId, o.campusId) !== null)
    .map((o) => {
      const program = byId.get(o.programId);
      const campus = campusName.get(o.campusId);
      return {
        programId: o.programId,
        campusId: o.campusId,
        programName: program?.name ?? "Programa",
        campusName: campus?.name ?? "Sede",
        key: `${program?.code ?? o.programId}:${campus?.slug ?? o.campusId}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.programName.localeCompare(b.programName, "es") || a.campusName.localeCompare(b.campusName, "es"));

  const canCurate = (fn: SubstantiveFunction) =>
    admin || functionMemberships.some((m) => m.role !== "visor" && fnsOf(m.unitId).includes(fn));

  const canEditSite = (programId: string, campusId: string) => {
    if (admin) return true;
    const role = roleAt(programId, campusId);
    return role === "editor" || role === "jefe";
  };

  return {
    reader,
    programSide: sites.length > 0,
    admin,
    readableFns,
    ownersFor,
    canDefine,
    canCurate,
    onFunctionSide: functionMemberships.length > 0,
    sites,
    canEditSite,
  };
}
