/* =============================================================================
   Mr. Pilo · los lectores de la capa profunda (0173).

   Cada lector lee directo de las tablas del portal y arma pasajes para
   `pilo_deep_save`. Aquí se prueba con una base de mentira (las mismas tablas,
   en memoria) que:

     · lo que arma tiene la forma que la base pide: referencia «prof:», título,
       cuerpo con su mínimo, y «sesion» cuando el portal la pide (Impacto);
     · no entra dinero (nombres, unidades ni frases con cifras de dinero);
     · es idempotente: la misma base da los mismos pasajes, en el mismo orden;
     · las reglas de cada portal: el avance del Plan (cifra ÷ meta, invertido si
       mejora al bajar) y los estados del Portal de Impacto (cumplida ≥ 100 %,
       en camino ≥ 70 %, rezagada por debajo).

   Los lectores de UDES en Cifras y Boletines se probarán con sus propios
   datos; estos comparten `comun.ts` con los de aquí.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { cerrar, contexto, frase, periodo, sinDinero, trocear, type Consulta, type Contexto, type Db, type Fila, type Pasaje } from "../../supabase/functions/pilo-ia/lectores/comun";
import { avance, estadoDe, lectorImpacto, mediana } from "../../supabase/functions/pilo-ia/lectores/impacto";
import { lectorPdi } from "../../supabase/functions/pilo-ia/lectores/pdi";

/* --- Una base de mentira: las tablas, en memoria -------------------------------------------- */

class Fake implements Consulta {
  constructor(private filas: Fila[]) {}
  select(): Consulta {
    return this;
  }
  eq(columna: string, valor: unknown): Consulta {
    return new Fake(this.filas.filter((f) => String(f[columna] ?? "") === String(valor)));
  }
  in(columna: string, valores: unknown[]): Consulta {
    return new Fake(this.filas.filter((f) => valores.some((v) => String(f[columna] ?? "") === String(v))));
  }
  gt(columna: string, valor: unknown): Consulta {
    return new Fake(this.filas.filter((f) => String(f[columna] ?? "") > String(valor)));
  }
  order(columna: string): Consulta {
    return new Fake([...this.filas].sort((a, b) => String(a[columna] ?? "").localeCompare(String(b[columna] ?? ""))));
  }
  limit(n: number): Consulta {
    return new Fake(this.filas.slice(0, n));
  }
  range(desde: number, hasta: number): Consulta {
    return new Fake(this.filas.slice(desde, hasta + 1));
  }
  then<R, E>(cumple: (v: { data: unknown; error: null }) => R | PromiseLike<R>, _rechaza?: (e: E) => void): PromiseLike<R> {
    return Promise.resolve({ data: this.filas, error: null }).then(cumple);
  }
}

const db = (tablas: Record<string, Fila[]>): Db => ({ from: (tabla: string) => new Fake(tablas[tabla] ?? []) });

const ctxDe = (tablas: Record<string, Fila[]>, ahora = new Date("2026-10-20T12:00:00-05:00")): Contexto => contexto(db(tablas), { ahora });

/* --- Las tablas de Impacto, mínimas --------------------------------------------------------- */

const IMPACTO: Record<string, Fila[]> = {
  units: [
    { id: "u1", kind: "facultad", name: "Ciencias Exactas", slug: "ciencias" },
    { id: "u2", kind: "programa", name: "Biología", slug: "biologia", parent_id: "u1" },
  ],
  campuses: [
    { id: "c1", name: "Bucaramanga" },
    { id: "c2", name: "Cúcuta" },
  ],
  program_campuses: [{ program_id: "u2", campus_id: "c1", active: true }],
  imp_dimensions: [{ id: "d1", name: "Oportunidad" }],
  imp_alignments: [
    { indicator_id: "i1", target: "ods", sdg: 4, confirmed: true },
    { indicator_id: "i1", target: "pilar", pillar_id: "p1", origin: "matriz" },
    // Sin confirmar y de otra parte: no entra.
    { indicator_id: "i1", target: "ods", sdg: 8, origin: "ia" },
  ],
  pillars: [{ id: "p1", numeral: "2", name: "Formación integral" }],
  imp_indicators: [
    {
      id: "i1", code: "IND-01", fn: "investigacion", stage: "resultado", dimension_id: "d1",
      name: "Artículos indexados", description: "Artículos en revistas indexadas.", unit_label: "artículos",
      measure: "entero", direction: "sube", baseline_year: 2024, baseline_num: 10,
      target_2026_num: 100, mandatory: true, numerator: "Artículos publicados", denominator: "Programas",
      source: "Scopus", responsible: "Vicerrectoría de Investigaciones", status: "publicado",
      program_id: null, campus_id: null, parent_id: null, position: 1, sheet: { objetivo: "Medir la producción científica." },
    },
    // Un borrador: el portal no lo publica, el lector tampoco.
    { id: "i9", code: "IND-09", fn: "investigacion", name: "Borrador", status: "borrador", program_id: null, unit_label: "artículos" },
    // Uno propio de programa, no retirado.
    { id: "i2", code: "PRO-01", fn: "investigacion", name: "Semilleros activos", unit_label: "semilleros", status: "publicado", program_id: "u2", position: 2 },
    // Uno retirado: fuera.
    { id: "i8", code: "PRO-08", fn: "investigacion", name: "Retirado", status: "retirado", program_id: "u2" },
    // De dinero: ni su nombre ni su unidad entran.
    { id: "i3", code: "IND-03", fn: "investigacion", name: "Presupuesto de investigación", unit_label: "millones de pesos", status: "publicado", program_id: null, position: 3 },
  ],
  imp_adoptions: [
    { id: "a1", indicator_id: "i1", program_id: "u2", campus_id: "c1", target_2026_num: 50, active: true },
    // De un indicador no publicado: no cuenta.
    { id: "a2", indicator_id: "i9", program_id: "u2", campus_id: "c1", active: true },
  ],
  imp_values: [
    { id: "v1", indicator_id: "i1", year: 2024, program_id: null, campus_id: null, value_num: 20 },
    { id: "v2", indicator_id: "i1", year: 2025, program_id: null, campus_id: null, value_num: 40 },
    { id: "v3", indicator_id: "i1", year: 2025, program_id: "u2", campus_id: "c1", value_num: 30 },
    { id: "v4", indicator_id: "i2", year: 2025, program_id: "u2", campus_id: "c1", value_num: 3 },
    // No aplica: no es cero.
    { id: "v5", indicator_id: "i1", year: 2025, program_id: null, campus_id: "c1", value_num: 99, not_applicable: true },
  ],
};

/* --- Las tablas del Plan, mínimas ------------------------------------------------------------ */

const PLAN: Record<string, Fila[]> = {
  pillars: [
    { id: "p1", numeral: "2", name: "Formación integral", slug: "formacion", status: "publicado", position: 1, description: "Un plan para la academia.", management_owner: "Vicerrectoría Académica" },
    // Sin publicar: el lector no lo lee.
    { id: "p2", numeral: "3", name: "Borrador", slug: "borrador", status: "borrador", position: 2 },
  ],
  strategic_areas: [{ id: "a1", pillar_id: "p1", code: "A1", name: "Currículo", position: 1 }],
  v_action_lines: [{ id: "l1", pillar_id: "p1", area_id: "a1", code: "L1", name: "Rediseño de programas", position: 1, progress: 30, project_count: 1, activity_count: 2, activity_done: 1 }],
  projects: [
    {
      id: "proy1", pillar_id: "p1", action_line_id: "l1", name: "Aula Activa", position: 1, progress: 20,
      description: "Aulas con metodologías activas.", owner: "Decanatura de Ciencias", start_date: "2024-02-01",
      end_date: "2025-12-31", academic_units: ["Ciencias Exactas"], sdg_goals: [4], impacts: [{ kind: "educativo", term: "largo" }],
    },
    // Con metas de dinero: la meta no entra; el proyecto sí, por lo demás que tiene.
    { id: "proy2", pillar_id: "p1", action_line_id: "l1", name: "Laboratorios", position: 2, progress: 10, target_value: 500, measure_unit: "millones", achieved_value: 100 },
  ],
  activities: [{ id: "act1", pillar_id: "p1", project_id: "proy1", title: "Pilotar el aula", owner: "Instituto de Educación", progress: 50, due_date: "2025-06-30" }],
  activity_targets: [{ activity_id: "act1", year: 2025, target_value: 3, result_value: 2, compliance: 66.7 }],
  project_links: [],
  v_pillar_progress: [{ pillar_id: "p1", progress: 40, done: 1, active: 2, pending: 1, risk: 0, total: 4 }],
  v_area_progress: [{ area_id: "a1", progress: 55 }],
  v_project_progress: [{ project_id: "proy1", progress: 25 }],
  v_year_progress: [
    { pillar_id: "p1", entity_id: "p1", year: 2024, progress: 10 },
    { pillar_id: "p1", entity_id: "p1", year: 2025, progress: 25 },
    { pillar_id: "p1", entity_id: "proy1", year: 2024, progress: 5 },
  ],
};

/* --- comun.ts: el cierre de un pasaje -------------------------------------------------------- */

describe("cerrar: lo que la base recibe", () => {
  it("deja pasar solo lo que empieza por «prof:», con título y cuerpo suficiente", () => {
    const out = cerrar([
      { ref: "sin-prefijo", title: "Sin prefijo", body: "Un cuerpo largo de verdad." },
      { ref: "prof:corto", title: "Cuerpo chico", body: "chico" },
      { ref: "prof:valido", title: "Válido", body: "Un cuerpo que sí alcanza." },
    ]);
    expect(out.map((p) => p.ref)).toEqual(["prof:valido"]);
  });

  it("una referencia repetida gana la primera", () => {
    const out = cerrar([
      { ref: "prof:repetida", title: "Primera", body: "El cuerpo de la primera." },
      { ref: "prof:repetida", title: "Segunda", body: "El cuerpo de la segunda." },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Primera");
  });

  it("quita las frases con cifras de dinero y deja las demás", () => {
    const out = cerrar([{ ref: "prof:dinero", title: "Gasto", body: "Gastó 100 millones de pesos. Atendió a 5 estudiantes. La frase sigue." }]);
    expect(out[0].body).not.toContain("millones");
    expect(out[0].body).toContain("Atendió a 5 estudiantes.");
  });

  it("marcas «sesion» pasan; lo demás nace público", () => {
    expect(cerrar([{ ref: "prof:sesion", title: "Con sesión", body: "Un cuerpo cualquiera de sesión.", vis: "sesion" }, { ref: "prof:publico", title: "Público", body: "Un cuerpo cualquiera público." }]).map((p) => p.vis ?? "publico")).toEqual(["sesion", "publico"]);
  });
});

describe("las normas de texto", () => {
  it("sinDinero solo quita la frase con la cifra", () => {
    expect(sinDinero("Costó $500. Sirvió a 10 personas.")).toBe("Sirvió a 10 personas.");
  });
  it("frase termina con punto", () => {
    expect(frase("sin punto")).toBe("sin punto.");
  });
  it("los periodos se numeran", () => {
    expect(periodo("2024-A y 2024-B")).toBe("2024-1 y 2024-2");
  });
  it("trocear reparte en cuerpos que caben", () => {
    const cuerpos = trocear("Encabezado fijo.", ["una línea", "otra línea"], 25);
    expect(cuerpos.length).toBeGreaterThan(1);
    expect(cuerpos[0].startsWith("Encabezado fijo.")).toBe(true);
  });
});

/* --- impacto.ts: las reglas del portal ------------------------------------------------------- */

describe("las reglas del Portal de Impacto", () => {
  it("mediana de pares e impares", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
  it("avance: cifra ÷ meta, invertido cuando mejora al bajar", () => {
    expect(avance(50, 100, "sube")).toBe(50);
    expect(avance(2, 1, "baja")).toBe(50);
    expect(avance(50, 0, "sube")).toBeNull();
    expect(avance(null, 100, "sube")).toBeNull();
  });
  it("estados: cumplida desde 100, en camino desde 70, rezagada debajo", () => {
    expect(estadoDe(120, 100, "sube").estado).toBe("cumplida");
    expect(estadoDe(70, 100, "sube").estado).toBe("en_camino");
    expect(estadoDe(69.9, 100, "sube").estado).toBe("rezagada");
    expect(estadoDe(null, 100, "sube").estado).toBe("sin_cifra");
    expect(estadoDe(50, null, "sube").estado).toBe("sin_meta");
  });

  it("las partes: el portal, las tres funciones y las facultades", async () => {
    const partes = await lectorImpacto.partes(ctxDe(IMPACTO));
    expect(partes.map((p) => p.id)).toEqual(["__portal__", "fn:investigacion", "fn:ensenanza", "fn:extension", "fac:ciencias"]);
  });

  it("el portal: cuánto hay y que pide sesión", async () => {
    const ctx = ctxDe(IMPACTO);
    const [pasaje] = await lectorImpacto.leer(ctx, { id: "__portal__", etiqueta: "Portal de Impacto", alias: [] });
    expect(pasaje.vis).toBe("sesion");
    // El de dinero cuenta en el portal; su ficha es la que no se arma.
    expect(pasaje.body).toContain("2 indicadores publicados");
  });

  it("la ficha del indicador: metas, línea base, serie y alineación; sin borradores ni dinero", async () => {
    const ctx = ctxDe(IMPACTO);
    const pasajes = await lectorImpacto.leer(ctx, { id: "fn:investigacion", etiqueta: "Investigación", alias: [] });
    const refs = pasajes.map((p) => p.ref);
    expect(refs.every((r) => r.startsWith("prof:impacto:"))).toBe(true);
    // Ni el borrador ni el de dinero.
    expect(pasajes.some((p) => p.title.includes("Borrador"))).toBe(false);
    expect(pasajes.some((p) => p.title.includes("Presupuesto"))).toBe(false);
    const ficha = pasajes.find((p) => p.ref === "prof:impacto:ind:ind-01");
    expect(ficha).toBeDefined();
    const cuerpo = ficha!.body;
    expect(cuerpo).toContain("Meta 2026: 100 artículos");
    expect(cuerpo).toContain("Línea base 2024: 10 artículos");
    expect(cuerpo).toContain("Cifra institucional por año: 2024: 20 artículos; 2025: 40 artículos");
    expect(cuerpo).toContain("ODS 4");
    expect(cuerpo).toContain("Pilar 2 Formación integral");
    expect(cuerpo).toContain("1 programa reporta cifra de este indicador");
    expect(ficha!.vis).toBe("sesion");
  });

  it("la facultad: el cumplimiento de sus programas con la mediana", async () => {
    const ctx = ctxDe(IMPACTO);
    const pasajes = await lectorImpacto.leer(ctx, { id: "fac:ciencias", etiqueta: "Facultad Ciencias Exactas", alias: [] });
    const programa = pasajes.find((p) => p.ref.startsWith("prof:impacto:programa:"));
    expect(programa).toBeDefined();
    // 30 de 50: rezagado, con la mediana de un solo avance.
    expect(programa!.body).toContain("1 rezagadas");
    expect(programa!.body).toContain("Mediana de avance frente a la meta 2026: 60 %");
    const facultad = pasajes.find((p) => p.ref === "prof:impacto:facultad:ciencias");
    expect(facultad).toBeDefined();
    expect(facultad!.body).toContain("1 programas");
  });

  it("idempotente: la misma base da los mismos pasajes", async () => {
    const ctx = ctxDe(IMPACTO);
    const una = await lectorImpacto.leer(ctx, { id: "fn:investigacion", etiqueta: "Investigación", alias: [] });
    const otra = await lectorImpacto.leer(ctxDe(IMPACTO), { id: "fn:investigacion", etiqueta: "Investigación", alias: [] });
    expect(otra).toEqual(una);
  });
});

/* --- pdi.ts: la cascada del plan ------------------------------------------------------------- */

describe("el lector del Plan de Desarrollo", () => {
  it("las partes: el portal y un pilar por cada uno publicado", async () => {
    const partes = await lectorPdi.partes(ctxDe(PLAN));
    expect(partes.map((p) => p.id)).toEqual(["__portal__", "formacion"]);
  });

  it("el portal: el plan con el avance de cada pilar", async () => {
    const ctx = ctxDe(PLAN);
    const pasajes = await lectorPdi.leer(ctx, { id: "__portal__", etiqueta: "Plan de Desarrollo", alias: [] });
    expect(pasajes[0].ref).toBe("prof:pdi:portal");
    expect(pasajes[0].body).toContain("1 pilares publicados");
    expect(pasajes[0].body).toContain("Pilar 2 · Formación integral: 40 %");
  });

  it("el pilar: avance, conteo de indicadores, áreas y la serie por año", async () => {
    const ctx = ctxDe(PLAN);
    const pasajes = await lectorPdi.leer(ctx, { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    const pilar = pasajes.find((p) => p.ref === "prof:pdi:formacion");
    expect(pilar).toBeDefined();
    expect(pilar!.body).toContain("lleva un avance de 40 %");
    expect(pilar!.body).toContain("De sus 4 indicadores: 1 cumplida, 2 en cursos, 1 pendiente");
    expect(pilar!.body).toContain("Avance por año: 2024: 10 %; 2025: 25 %");
    expect(pilar!.body).toContain("Áreas estratégicas: A1 Currículo");
  });

  it("el área y su línea, con la meta capturada", async () => {
    const ctx = ctxDe(PLAN);
    const pasajes = await lectorPdi.leer(ctx, { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    const area = pasajes.find((p) => p.ref.startsWith("prof:pdi:formacion:area:"));
    expect(area).toBeDefined();
    expect(area!.body).toContain("Área estratégica A1 Currículo");
    expect(area!.body).toContain("L1 Rediseño de programas: 30 %");
    const linea = pasajes.find((p) => p.ref.startsWith("prof:pdi:formacion:linea:"));
    expect(linea!.body).toContain("Tiene 1 proyectos y 2 actividades (1 cumplidas)");
  });

  it("el proyecto: su cadena completa, fechas, ODS y las metas de sus actividades", async () => {
    const ctx = ctxDe(PLAN);
    const pasajes = await lectorPdi.leer(ctx, { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    const proy = pasajes.find((p) => p.ref.startsWith("prof:pdi:formacion:proyecto:proy1"));
    expect(proy).toBeDefined();
    expect(proy!.body).toContain("Ruta: Pilar 2 · Formación integral › A1 Currículo › L1 Rediseño de programas › Aula Activa");
    expect(proy!.body).toContain("Lleva un avance de 25 %");
    expect(proy!.body).toContain("Empieza el 1 de febrero de 2024");
    expect(proy!.body).toContain("Aporta a los ODS 4");
    expect(proy!.body).toContain("Metas por año — 2025: meta 3, resultado 2, cumplimiento 66,7 %");
  });

  it("las metas de dinero no entran; el proyecto sí, por lo demás", async () => {
    const ctx = ctxDe(PLAN);
    const pasajes = await lectorPdi.leer(ctx, { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    const proy = pasajes.find((p) => p.ref.startsWith("prof:pdi:formacion:proyecto:proy2"));
    expect(proy).toBeDefined();
    expect(proy!.body).not.toContain("Meta:");
    expect(proy!.body).not.toContain("500");
  });

  it("idempotente: la misma base da los mismos pasajes", async () => {
    const ctx = ctxDe(PLAN);
    const una = await lectorPdi.leer(ctx, { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    const otra = await lectorPdi.leer(ctxDe(PLAN), { id: "formacion", etiqueta: "Pilar 2 · Formación integral", alias: [] });
    expect(otra).toEqual(una);
  });
});

/* --- el contrato de los pasajes, en los dos lectores ----------------------------------------- */

describe("los pasajes que arman los dos lectores", () => {
  const todos = async (): Promise<Pasaje[]> => {
    const ctx = ctxDe(IMPACTO);
    const deImpacto = await lectorImpacto.leer(ctx, { id: "fn:investigacion", etiqueta: "Investigación", alias: [] });
    const dePlan = await lectorPdi.leer(ctxDe(PLAN), { id: "formacion", etiqueta: "Pilar", alias: [] });
    return [...deImpacto, ...dePlan];
  };

  it("referencias únicas con su prefijo, y los campos que la base pide", async () => {
    const pasajes = await todos();
    const refs = new Set(pasajes.map((p) => p.ref));
    expect(refs.size).toBe(pasajes.length);
    for (const p of pasajes) {
      expect(p.ref.startsWith("prof:")).toBe(true);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.body.length).toBeGreaterThanOrEqual(10);
      expect(p.path.startsWith("/")).toBe(true);
    }
  });

  it("nada de dinero en ningún cuerpo", async () => {
    for (const p of await todos()) {
      expect(p.body).not.toMatch(/millones|presupuesto|\$/i);
    }
  });
});
