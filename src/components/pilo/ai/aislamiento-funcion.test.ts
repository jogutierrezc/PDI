/* =============================================================================
   Aislamiento de los espacios en la función pilo-ia (0113) · prueba ESTÁTICA.

   Lee el archivo de la función y revisa cada consulta a una tabla de Pilo que
   lleva espacio y cada llamada a una función `pilo_…` de la base: o atiende el
   espacio (manda `p_space`, filtra o marca la fila con `space`), o está en la
   lista de abajo con su razón. Quien agregue una consulta nueva y olvide el
   espacio, rompe esta prueba: así no se mezclan la memoria, el catálogo, las
   respuestas guardadas, la bandeja ni la bitácora de dos Pilos.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../../../supabase/functions/pilo-ia/index.ts"), "utf8").replace(/\r\n/g, "\n");
// Solo el código de la función: la copia de logic.ts no toca la base.
const code = source.slice(source.indexOf("// --- fin de la lógica"));
const lines = code.split("\n");

/** Las tablas de Pilo que tienen columna `space` desde 0113. */
const TABLES = ["pilo_memory", "pilo_answers", "pilo_catalog", "pilo_inbox", "pilo_nodes", "pilo_edges", "pilo_ai_log"];

/** Cómo se ve que una consulta atiende el espacio. */
const HANDLES = /\bp_space\b|"space"|\binSpace\(|\bspace,/;
/** Cuántas líneas abarca una consulta, contando la suya. */
const WINDOW = 4;

interface Allowed {
  /** La tabla o la función. */
  name: string;
  /** Un trozo de la misma línea, para saber cuál de las llamadas es. */
  near: string;
  why: string;
}

/**
 * Lo que no lleva espacio, y por qué. Cada entrada vale para UNA línea: la que
 * nombra esa tabla o función y contiene `near`.
 */
const ALLOWED: Allowed[] = [
  // Sin cambio de firma en 0113 (plan §1): trabajan por llave, y la llave es única entre espacios.
  { name: "pilo_visitor_hit", near: "p_visitor: visitor", why: "el espacio va dentro de la huella (visitorSeed), no como parámetro" },
  { name: "pilo_embed_save", near: "p_rows: payload", why: "guarda por (tipo, ref): las filas salen de pilo_embed_pending, que sí lleva p_space" },
  { name: "pilo_catalog_hit", near: "p_key: key", why: "la clave del catálogo es global (prefijos ER-/EC-) y sale del catálogo ya filtrado por espacio" },
  { name: "pilo_answer_vote", near: "p_id: id", why: "vota por id; antes se comprueba que la respuesta es de este espacio (eq space)" },
  // Las cifras en vivo (0107) son solo de Planeación: un espacio sin la fuente «cifras» nunca las busca.
  { name: "pilo_facts_search", near: "p_q: q, p_limit: 3", why: "solo corre si las fuentes incluyen «cifras», que es de planeacion" },
  { name: "pilo_facts_semantic", near: "p_limit: 3", why: "igual que pilo_facts_search" },
  { name: "pilo_facts_campuses", near: 'admin.from("campuses")', why: "los nombres de las sedes, para entender la pregunta: no es contenido de ningún espacio" },
  // El análisis de los boletines es del Pilo de siempre: su acción nunca sale del espacio de partida.
  { name: "pilo_memory_search", near: 'p_sources: ["pdi"]', why: "«analizar» (boletines e Impacto): siempre planeacion, que es el valor de partida de p_space" },
  // Sin 0113 no hay columna que mirar: es la consulta de siempre, y solo corre para planeacion.
  { name: "pilo_answers", near: "if (!row) row =", why: "calificar sin 0113; con 0113 la fila ya se leyó arriba con eq space" },
  // Moodle (0116): trabajan por id de documento, y ese id acaba de salir de pilo_doc_save, que sí lleva p_space y rechaza el documento de otro espacio.
  { name: "pilo_doc_replace", near: "p_doc: docId, p_rows: built.rows", why: "sin parámetro de espacio (0114): los pasajes heredan el espacio del documento, que pilo_doc_save creó o halló con p_space" },
  { name: "pilo_doc_outline", near: "p_doc: docId, p_nodes: outline.nodes", why: "sin parámetro de espacio (0115): el mapa se escribe en el espacio del documento, que pilo_doc_save creó o halló con p_space" },
];

const calls = lines.flatMap((line, i) => {
  const found: { kind: "tabla" | "función"; name: string; line: number; text: string; window: string }[] = [];
  for (const m of line.matchAll(/\.from\("(pilo_[a-z_]+)"\)/g)) if (TABLES.includes(m[1])) found.push({ kind: "tabla", name: m[1], line: i, text: line, window: lines.slice(i, i + WINDOW).join("\n") });
  for (const m of line.matchAll(/\.rpc\("(pilo_[a-z_]+)"/g)) found.push({ kind: "función", name: m[1], line: i, text: line, window: lines.slice(i, i + WINDOW).join("\n") });
  return found;
});

const allowedFor = (c: (typeof calls)[number]) => ALLOWED.find((a) => a.name === c.name && c.text.includes(a.near));

describe("ninguna consulta de la función olvida el espacio", () => {
  it("la prueba ve las consultas de verdad", () => {
    // Si el archivo cambia de forma y esto deja de encontrar las consultas, que se note.
    expect(calls.length).toBeGreaterThanOrEqual(25);
    for (const name of ["pilo_memory_search", "pilo_memory_semantic", "pilo_answer_candidates", "pilo_catalog_active", "pilo_catalog_semantic", "pilo_catalog_near", "pilo_graph_around", "pilo_embed_status", "pilo_embed_pending", "pilo_inbox_add"]) {
      expect(calls.some((c) => c.name === name), name).toBe(true);
    }
    for (const table of ["pilo_memory", "pilo_answers", "pilo_ai_log"]) expect(calls.some((c) => c.kind === "tabla" && c.name === table), table).toBe(true);
  });

  it("cada tabla con espacio y cada función pilo_… atiende el espacio o está en la lista, con su razón", () => {
    const loose = calls.filter((c) => !HANDLES.test(c.window) && !allowedFor(c)).map((c) => `${c.kind} ${c.name} · ${c.text.trim().slice(0, 140)}`);
    expect(loose).toEqual([]);
  });

  it("la lista no tiene entradas de sobra ni sin razón", () => {
    for (const a of ALLOWED) {
      expect(a.why.length, a.name).toBeGreaterThan(10);
      expect(calls.filter((c) => c.name === a.name && c.text.includes(a.near)).length, `${a.name} · ${a.near}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("las funciones con p_space en 0113 lo mandan en todas sus llamadas (salvo las de la lista)", () => {
    const WITH_SPACE = ["pilo_memory_search", "pilo_memory_semantic", "pilo_answer_candidates", "pilo_catalog_active", "pilo_catalog_semantic", "pilo_catalog_near", "pilo_graph_around", "pilo_embed_status", "pilo_embed_pending", "pilo_inbox_add"];
    const missing = calls.filter((c) => WITH_SPACE.includes(c.name) && !/\bp_space\b/.test(c.window) && !allowedFor(c)).map((c) => `${c.name} · ${c.text.trim().slice(0, 120)}`);
    expect(missing).toEqual([]);
  });

  it("el espacio nunca se manda al de partida: va siempre dentro de inSpace(…)", () => {
    // `p_space: space` suelto, fuera de inSpace, le llegaría también al Pilo de siempre.
    const bare = lines.filter((l) => /p_space:/.test(l) && !/inSpace\(\{[^}]*p_space:/.test(l)).map((l) => l.trim().slice(0, 120));
    expect(bare).toEqual([]);
    expect(code).toMatch(/const inSpace = .*\(spaced \? extra : \{\}\)/);
  });

  it("el espacio sale del portal, nunca de un campo de la página (salvo «indexar», de la administración)", () => {
    const reads = lines.filter((l) => /body\.space\b/.test(l));
    expect(reads.length).toBeGreaterThan(0);
    const start = lines.findIndex((l) => l.includes('if (action === "indexar" && body.space !== undefined'));
    expect(start).toBeGreaterThan(-1);
    const block = lines.slice(start, start + 5).join("\n");
    expect(block).toContain('role !== "admin"');
    expect(block).toContain("isSpace(body.space)");
    // Todas las lecturas de body.space están en ese bloque.
    for (const l of reads) expect(block).toContain(l.trim());
    expect(code).not.toMatch(/body\.sources/);
  });
});
