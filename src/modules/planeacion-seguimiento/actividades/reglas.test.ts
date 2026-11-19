import { describe, expect, it } from "vitest";
import type { PsNivel } from "../modelo";
import type { Actividad, EstadoAct, MiembroEquipo, PapelOficina, Poder } from "./modelo";
import { ESTADOS, estadoPlazo, textoPlazo } from "./modelo";
import { MIN_MOTIVO, avisoAsignacion, avisoTransferencia, destinosPosibles, poderEn, puedeAsignar, puedeCrear, puedeMarcarChecklist, puedeMover, puedeTransferir, validarActividad, validarTransferencia, avisosActividad } from "./reglas";

const YO = "u-yo";
const act = (o: Partial<Actividad> = {}): Actividad => ({
  id: "a-1", oficinaId: "of-4", lineaNo: "7", titulo: "Tarea", descripcion: null, estado: "en_curso", prioridad: "Media", inicio: "2027-03-01", fin: "2027-05-01", esHito: false, campus: "Bucaramanga",
  asignados: [YO], checklist: [], creadaPor: "u-10", creadaEn: "2027-01-01T00:00:00Z", ...o,
});

const NIVELES: PsNivel[] = ["none", "lector", "colaborador", "gestor", "aprobador", "admin"];
const PAPELES: (PapelOficina | null)[] = [null, "visor", "editor", "jefe"];

describe("poder efectivo = el menor entre ps_nivel y el papel en la oficina (unit_role)", () => {
  // Tabla completa: nivel × papel
  const esperado: Record<string, Poder> = {
    // none: nada, sea cual sea el papel
    "none|null": "ninguno", "none|visor": "ninguno", "none|editor": "ninguno", "none|jefe": "ninguno",
    // lector: techo lector
    "lector|null": "ninguno", "lector|visor": "lector", "lector|editor": "lector", "lector|jefe": "lector",
    // colaborador: techo colaborador
    "colaborador|null": "ninguno", "colaborador|visor": "lector", "colaborador|editor": "colaborador", "colaborador|jefe": "colaborador",
    // gestor: lo decide el papel
    "gestor|null": "ninguno", "gestor|visor": "lector", "gestor|editor": "colaborador", "gestor|jefe": "gestor",
    // aprobador: solo mira (aprobar es de la fase 4)
    "aprobador|null": "ninguno", "aprobador|visor": "lector", "aprobador|editor": "lector", "aprobador|jefe": "lector",
    // admin: opera todo, sea miembro o no
    "admin|null": "gestor", "admin|visor": "gestor", "admin|editor": "gestor", "admin|jefe": "gestor",
  };
  for (const n of NIVELES) {
    for (const p of PAPELES) {
      it(`${n} × ${p ?? "sin papel"} → ${esperado[`${n}|${p}`]}`, () => {
        expect(poderEn(n, p)).toBe(esperado[`${n}|${p}`]);
      });
    }
  }
});

describe("permisos del tablero por poder", () => {
  const propia = act({ estado: "en_curso", asignados: [YO] });
  const ajena = act({ estado: "en_curso", asignados: ["u-11"] });
  const sinNadie = act({ estado: "por_iniciar", asignados: [] });

  it("gestor: mueve cualquiera de su oficina a cualquier cubo (también a «Hecho», sin flujo de avances aún)", () => {
    for (const a of [propia, ajena, sinNadie]) for (const e of ESTADOS) if (e !== a.estado) expect(puedeMover("gestor", a, e, YO)).toEqual({ ok: true });
  });
  it("colaborador: solo las suyas", () => {
    expect(puedeMover("colaborador", propia, "en_riesgo", YO)).toEqual({ ok: true });
    const r = puedeMover("colaborador", ajena, "en_riesgo", YO);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/solo mueve las actividades que tiene asignadas/);
    expect(puedeMover("colaborador", sinNadie, "en_curso", YO).ok).toBe(false);
  });
  it("colaborador: hasta «En revisión», nunca a «Hecho»", () => {
    expect(puedeMover("colaborador", propia, "en_revision", YO)).toEqual({ ok: true });
    const r = puedeMover("colaborador", propia, "hecho", YO);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/hasta «En revisión»/);
  });
  it("colaborador: no toca lo que ya espera al gestor ni lo hecho", () => {
    expect(puedeMover("colaborador", act({ estado: "en_revision" }), "en_curso", YO).ok).toBe(false);
    expect(puedeMover("colaborador", act({ estado: "hecho" }), "en_curso", YO).ok).toBe(false);
  });
  it("lector y sin acceso: nada, con el motivo", () => {
    const l = puedeMover("lector", propia, "en_riesgo", YO);
    expect(!l.ok && l.motivo).toMatch(/solo puede mirar/);
    const n = puedeMover("ninguno", propia, "en_riesgo", YO);
    expect(!n.ok && n.motivo).toMatch(/No es miembro/);
  });
  it("moverla al cubo en el que ya está no es un movimiento", () => {
    const r = puedeMover("gestor", propia, "en_curso", YO);
    expect(!r.ok && r.motivo).toMatch(/Ya está en «En curso»/);
  });
  it("destinosPosibles devuelve los cinco cubos con su decisión", () => {
    const d = destinosPosibles("colaborador", propia, YO);
    expect(d.map((x) => x.estado)).toEqual([...ESTADOS]);
    expect(d.filter((x) => x.decision.ok).map((x) => x.estado)).toEqual(["por_iniciar", "en_riesgo", "en_revision"]);
  });
  it("crear, asignar y transferir son del gestor", () => {
    expect([puedeCrear("gestor"), puedeAsignar("gestor"), puedeTransferir("gestor")]).toEqual([true, true, true]);
    for (const p of ["colaborador", "lector", "ninguno"] as Poder[]) expect([puedeCrear(p), puedeAsignar(p), puedeTransferir(p)]).toEqual([false, false, false]);
  });
  it("el checklist lo marca el gestor o el colaborador asignado", () => {
    expect(puedeMarcarChecklist("gestor", ajena, YO)).toBe(true);
    expect(puedeMarcarChecklist("colaborador", propia, YO)).toBe(true);
    expect(puedeMarcarChecklist("colaborador", ajena, YO)).toBe(false);
    expect(puedeMarcarChecklist("lector", propia, YO)).toBe(false);
  });
  it("todas las combinaciones nivel × papel × estado de origen y destino son coherentes", () => {
    // El colaborador nunca llega a «hecho» y nunca mueve lo ajeno; el gestor siempre puede.
    for (const n of NIVELES) for (const p of PAPELES) {
      const poder = poderEn(n, p);
      for (const origen of ESTADOS) for (const destino of ESTADOS as readonly EstadoAct[]) {
        const dec = puedeMover(poder, act({ estado: origen }), destino, YO);
        if (origen === destino) expect(dec.ok).toBe(false);
        if (poder === "gestor" && origen !== destino) expect(dec.ok).toBe(true);
        if (poder === "colaborador" && destino === "hecho") expect(dec.ok).toBe(false);
        if ((poder === "lector" || poder === "ninguno")) expect(dec.ok).toBe(false);
      }
    }
  });
});

describe("plazos", () => {
  it("vencida, próxima, en plazo, hecha y sin fecha", () => {
    const hoy = "2027-06-30";
    expect(estadoPlazo({ estado: "en_curso", fin: "2027-06-29" }, hoy)).toBe("vencida");
    expect(estadoPlazo({ estado: "en_curso", fin: "2027-06-30" }, hoy)).toBe("proxima");
    expect(estadoPlazo({ estado: "en_curso", fin: "2027-07-07" }, hoy)).toBe("proxima");
    expect(estadoPlazo({ estado: "en_curso", fin: "2027-07-08" }, hoy)).toBe("en_plazo");
    expect(estadoPlazo({ estado: "hecho", fin: "2020-01-01" }, hoy)).toBe("hecha");
    expect(estadoPlazo({ estado: "en_curso", fin: null }, hoy)).toBe("sin_fecha");
    expect(textoPlazo({ estado: "en_curso", fin: "2027-06-27" }, hoy)).toBe("Venció hace 3 días");
    expect(textoPlazo({ estado: "en_curso", fin: "2027-07-01" }, hoy)).toBe("Vence mañana");
  });
});

describe("validación de la actividad", () => {
  const equipo = [{ id: YO, asignable: true }, { id: "u-11", asignable: true }, { id: "u-14", asignable: false }];
  const ctx = { lineas: ["7", "8"], campus: ["Bucaramanga", "Cúcuta", "Todos"], equipo };
  const ok = { oficinaId: "of-4", lineaNo: "7", titulo: "Levantar el inventario", descripcion: "", inicio: "2027-02-01", fin: "2027-03-31", esHito: false, prioridad: "Alta" as const, campus: "Bucaramanga", asignados: [YO] };

  it("una actividad completa no tiene errores", () => expect(validarActividad(ok, ctx)).toEqual([]));
  it("actividad propia (sin línea) también vale", () => expect(validarActividad({ ...ok, lineaNo: null }, ctx)).toEqual([]));
  it("sin responsable vale (se asigna después)", () => expect(validarActividad({ ...ok, asignados: [] }, ctx)).toEqual([]));
  it("el título es obligatorio y tiene tope", () => {
    expect(validarActividad({ ...ok, titulo: " a " }, ctx).map((e) => e.campo)).toEqual(["act-titulo"]);
    expect(validarActividad({ ...ok, titulo: "x".repeat(201) }, ctx)[0].campo).toBe("act-titulo");
  });
  it("la línea debe ser de la oficina", () => {
    const e = validarActividad({ ...ok, lineaNo: "99" }, ctx);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ campo: "act-linea", paso: "que" });
  });
  it("el fin no puede ser anterior al inicio", () => {
    const e = validarActividad({ ...ok, inicio: "2027-05-01", fin: "2027-03-01" }, ctx);
    expect(e[0]).toMatchObject({ campo: "act-fin", paso: "cuando" });
  });
  it("fechas inexistentes se rechazan", () => {
    expect(validarActividad({ ...ok, fin: "2027-02-30" }, ctx)[0].campo).toBe("act-fin");
    expect(validarActividad({ ...ok, inicio: "ayer" }, ctx)[0].campo).toBe("act-inicio");
  });
  it("un hito lleva solo la fecha de fin", () => {
    expect(validarActividad({ ...ok, esHito: true, inicio: null }, ctx)).toEqual([]);
    expect(validarActividad({ ...ok, esHito: true, inicio: null, fin: null }, ctx)[0].mensaje).toMatch(/fecha del hito/);
  });
  it("campus y prioridad deben ser de las listas", () => {
    expect(validarActividad({ ...ok, campus: "Sede norte" }, ctx)[0].campo).toBe("act-campus");
    expect(validarActividad({ ...ok, prioridad: "Urgente" as never }, ctx)[0].campo).toBe("act-prioridad");
  });
  it("solo se asigna a miembros de la oficina que reciben actividades (un gestor solo asigna a su gente)", () => {
    expect(validarActividad({ ...ok, asignados: ["u-99"] }, ctx)[0]).toMatchObject({ campo: "act-asignados", paso: "quien" });
    expect(validarActividad({ ...ok, asignados: ["u-14"] }, ctx)[0].campo).toBe("act-asignados");
  });
  it("avisos que no impiden crear", () => {
    const a = avisosActividad({ ...ok, fin: "2029-01-01" }, { inicio: "2027-01-01", fin: "2028-12-31" }, "2027-06-30");
    expect(a[0]).toMatch(/después de la línea/);
    expect(avisosActividad({ ...ok, fin: "2027-01-01", inicio: "2026-12-01" }, null, "2027-06-30")[0]).toMatch(/nacerá vencida/);
  });
});

describe("transferencia", () => {
  const equipo = [{ id: YO, asignable: true }, { id: "u-11", asignable: true }, { id: "u-12", asignable: true }, { id: "u-14", asignable: false }];
  const a = { asignados: [YO] };
  const motivo = "Se reasigna por cambio de carga del equipo";
  it("pasa con origen asignado, destino de la oficina y motivo suficiente", () => expect(validarTransferencia({ de: YO, a: "u-11", motivo }, a, equipo)).toEqual([]));
  it(`el motivo pide al menos ${MIN_MOTIVO} caracteres`, () => {
    const e = validarTransferencia({ de: YO, a: "u-11", motivo: "muy corto" }, a, equipo);
    expect(e).toHaveLength(1);
    expect(e[0].campo).toBe("tr-motivo");
    expect(e[0].mensaje).toMatch(/lleva 9/);
    expect(validarTransferencia({ de: YO, a: "u-11", motivo: "x".repeat(MIN_MOTIVO) }, a, equipo)).toEqual([]);
    expect(validarTransferencia({ de: YO, a: "u-11", motivo: `   ${"x".repeat(MIN_MOTIVO - 1)}   ` }, a, equipo)).toHaveLength(1);
  });
  it("el destino debe ser otra persona, de la oficina, que reciba actividades", () => {
    expect(validarTransferencia({ de: YO, a: YO, motivo }, a, equipo)[0].campo).toBe("tr-a");
    expect(validarTransferencia({ de: YO, a: "u-99", motivo }, a, equipo)[0].campo).toBe("tr-a");
    expect(validarTransferencia({ de: YO, a: "u-14", motivo }, a, equipo)[0].campo).toBe("tr-a");
  });
  it("el origen debe tener la actividad", () => {
    expect(validarTransferencia({ de: "u-12", a: "u-11", motivo }, a, equipo)[0].campo).toBe("tr-de");
    expect(validarTransferencia({ de: null, a: null, motivo: "" }, a, equipo).map((e) => e.campo)).toEqual(["tr-de", "tr-a", "tr-motivo"]);
  });
  it("no se transfiere a quien ya la tiene", () => {
    expect(validarTransferencia({ de: YO, a: "u-11", motivo }, { asignados: [YO, "u-11"] }, equipo)[0].mensaje).toMatch(/ya tiene asignada/);
  });
});

describe("a quién se avisa", () => {
  const m = (id: string, papel: PapelOficina, esYo = false): MiembroEquipo => ({ id, nombre: id, correo: `${id}@x.test`, papel, asignable: papel !== "visor", esYo, carga: { activas: 0, vencidas: 0, enRiesgo: 0, total: 0 } });
  const equipo = [m("g1", "jefe"), m(YO, "jefe", true), m("c1", "editor"), m("c2", "editor")];
  it("asignar: a quien recibe, no a quien asigna", () => {
    expect(avisoAsignacion(["c1", YO], equipo, YO).map((a) => a.personaId)).toEqual(["c1"]);
    expect(avisoAsignacion([], equipo, YO)).toEqual([]);
  });
  it("transferir: entra, sale y copia a los demás gestores", () => {
    const r = avisoTransferencia("c1", "c2", equipo, YO);
    expect(r.map((a) => [a.personaId, a.motivo])).toEqual([["c2", "transferencia_entra"], ["c1", "transferencia_sale"], ["g1", "copia_gestor"]]);
  });
});
