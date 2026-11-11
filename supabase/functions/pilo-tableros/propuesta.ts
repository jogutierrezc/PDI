/* =============================================================================
   Pilo Tableros · lógica pura, sin red.

   Dos oficios, nunca mezclados con el cálculo:
     · proponer: diseña un tablero (páginas y visuales) para una pregunta, usando SOLO las medidas y
       dimensiones que el catálogo le entrega. Cada id que invente se descarta.
     · narrar: escribe la lectura de un tablero a partir de las cifras YA calculadas. No calcula: toda cifra
       de su texto tiene que estar en lo que recibió.
   Pilo nunca recibe códigos, nombres de personas ni filas: solo agregados con la reserva de 5 ya aplicada.
   ========================================================================== */

export interface Mensaje {
  role: "system" | "user" | "assistant";
  content: string;
}
export type Lectura<T> = { ok: true; valor: T } | { ok: false; error: string };

export const TIPOS = ["kpi", "barras", "lineas", "calor", "tabla", "narrativa"] as const;
export const PLANTILLAS = { ejecutivo: 6, diagnostico: 8, detalle: 6 } as const;
type Plantilla = keyof typeof PLANTILLAS;

export interface MedidaOferta {
  id: string;
  nombre: string;
  descripcion: string;
  /** Dimensiones por las que se puede desglosar. */
  dimensiones: string[];
}
export interface PedidoProponer {
  pregunta: string;
  publico: string;
  medidas: MedidaOferta[];
  fuentes: string[];
  /** Lo que Pilo concluyó antes sobre cómo se relacionan las fuentes (texto corto). */
  contexto: string;
}
export interface VisualPropuesto {
  tipo: (typeof TIPOS)[number];
  titulo: string;
  medidas: string[];
  dimensiones: string[];
}
export interface Propuesta {
  nombre: string;
  medidas: string[];
  paginas: { nombre: string; plantilla: Plantilla; visuales: VisualPropuesto[] }[];
  notas: string[];
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validarPedido(d: unknown): Lectura<PedidoProponer> {
  const o = d as Partial<PedidoProponer> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "Falta el pedido." };
  const pregunta = texto(o.pregunta, 400);
  if (pregunta.length < 8) return { ok: false, error: "Escriba la pregunta que debe responder el tablero." };
  const medidas = (Array.isArray(o.medidas) ? o.medidas : [])
    .map((m) => ({
      id: texto(m?.id, 60),
      nombre: texto(m?.nombre, 100),
      descripcion: texto(m?.descripcion, 300),
      dimensiones: (Array.isArray(m?.dimensiones) ? m.dimensiones : []).map((x: unknown) => texto(x, 70)).filter(Boolean).slice(0, 14),
    }))
    .filter((m) => m.id && m.nombre)
    .slice(0, 90);
  if (!medidas.length) return { ok: false, error: "No hay medidas disponibles con las fuentes elegidas." };
  return {
    ok: true,
    valor: { pregunta, publico: texto(o.publico, 60), medidas, fuentes: (Array.isArray(o.fuentes) ? o.fuentes : []).map((f: unknown) => texto(f, 80)).filter(Boolean).slice(0, 20), contexto: texto(o.contexto, 700) },
  };
}

const SISTEMA_PROPONER = `Eres Pilo Tableros, el diseñador de tableros de la Universidad de Santander (UDES). Armas el tablero que responde mejor a una pregunta, con buenas prácticas de BI y de narración con datos: poco por página, una idea por visual, comparar con el periodo anterior cuando ayuda y nunca datos personales.

REGLAS DE CATÁLOGO
1. Usa SOLO medidas de la lista MEDIDAS (por su id) y SOLO dimensiones que esa medida admite en «dimensiones». No inventes ids.
2. Tipos de visual: kpi (una cifra, sin dimensiones), barras (1 dimensión), lineas (evolución por periodo, sin dimensiones), calor (exactamente 2 dimensiones), tabla (1 o 2 dimensiones), narrativa (texto escrito después por Pilo, sin medidas).
3. Plantillas: ejecutivo (máx. 6 visuales; cifras y una lectura), diagnostico (máx. 8; comparar y buscar causas), detalle (máx. 6; tabla grande).

REGLAS DE DISEÑO
4. Propósito primero: antes de elegir visuales, resume el tablero en una frase «responde [pregunta] para [público] que debe [decidir o hacer]». Si no cabe en una frase, el tablero hace demasiado: recorta.
5. Jerarquía en cada página: primero las cifras clave (kpi, 3 a 5 como máximo, arriba), luego la evolución (lineas), después los desgloses (barras, calor) y al final el detalle (tabla). Lo más importante va arriba a la izquierda.
6. Una página, una idea; un visual, una pregunta. No repitas la misma medida y dimensión en dos visuales. Todo el tablero debe quedarse en unas 8 cifras distintas: más es ruido.
7. Elige el visual por lo que se quiere mostrar: comparar categorías → barras; cambio en el tiempo → lineas (máximo 3 medidas por gráfico); cruce de dos dimensiones → calor; una cifra con su contexto → kpi; búsqueda de un caso → tabla. Para partes de un todo con 2 o 3 partes sirve una cifra por parte; con más, barras.
8. El título es la pregunta que responde el visual, no el nombre de la variable: «¿Dónde está más alta la deserción?» y no «Deserción por programa». Sin guiones bajos, en español de Colombia. Un título no afirma un hallazgo que aún no se ha visto.
9. Público: consejo y rectoría → plantilla ejecutivo, pocas cifras y una lectura; decanos y programas → diagnostico por su unidad; planeación → diagnostico y detalle.
10. Una a tres páginas. La primera responde la pregunta sola; las demás explican el porqué.

RESPONDE SOLO UN OBJETO JSON, sin texto antes ni después:
{"proposito": "responde … para … que debe …", "nombre": "nombre del tablero", "paginas": [{"nombre": "", "plantilla": "ejecutivo|diagnostico|detalle", "visuales": [{"tipo": "", "titulo": "", "medidas": ["id"], "dimensiones": ["dimension"]}]}], "notas": ["por qué se armó así, 1 a 3 frases"]}`;

export function mensajesProponer(p: PedidoProponer): Mensaje[] {
  return [
    { role: "system", content: SISTEMA_PROPONER },
    { role: "user", content: `PREGUNTA: «${p.pregunta}»\nPÚBLICO: ${p.publico || "Planeación"}\nFUENTES: ${p.fuentes.join(", ") || "(ninguna indicada)"}${p.contexto ? `\nCÓMO SE RELACIONAN LAS FUENTES (análisis previo): ${p.contexto}` : ""}\n\nMEDIDAS (JSON):\n${JSON.stringify(p.medidas)}` },
  ];
}

function jsonDe(crudo: string): Record<string, unknown> | null {
  const limpio = crudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const i = limpio.indexOf("{");
  const f = limpio.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    return JSON.parse(limpio.slice(i, f + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** La respuesta de Pilo, depurada: lo que no está en el catálogo se descarta y se avisa. */
export function leerPropuesta(crudo: string, p: PedidoProponer): Lectura<Propuesta> {
  const j = jsonDe(crudo);
  if (!j) return { ok: false, error: "La respuesta no es un objeto JSON válido." };
  const oferta = new Map(p.medidas.map((m) => [m.id, m]));
  const notas: string[] = [];
  const usadas = new Set<string>();
  const paginas: Propuesta["paginas"] = [];
  for (const raw of (Array.isArray(j.paginas) ? j.paginas : []).slice(0, 3)) {
    const pg = (raw ?? {}) as Record<string, unknown>;
    const plantilla = (Object.keys(PLANTILLAS) as Plantilla[]).includes(pg.plantilla as Plantilla) ? (pg.plantilla as Plantilla) : "diagnostico";
    const visuales: VisualPropuesto[] = [];
    const vistos = new Set<string>();
    let kpis = 0;
    for (const rv of Array.isArray(pg.visuales) ? pg.visuales : []) {
      const v = (rv ?? {}) as Record<string, unknown>;
      const tipo = TIPOS.find((t) => t === v.tipo);
      const titulo = texto(v.titulo, 120);
      if (!tipo || !titulo) continue;
      const medidas = (Array.isArray(v.medidas) ? v.medidas : []).map((x: unknown) => texto(x, 60)).filter((id) => oferta.has(id));
      if (tipo !== "narrativa" && !medidas.length) {
        notas.push(`Se descartó «${titulo}»: usaba una medida que no existe.`);
        continue;
      }
      const dimensiones = (Array.isArray(v.dimensiones) ? v.dimensiones : [])
        .map((x: unknown) => texto(x, 70))
        .filter((d) => medidas.length > 0 && medidas.every((id) => oferta.get(id)!.dimensiones.includes(d)));
      const necesita = { kpi: 0, lineas: 0, barras: 1, calor: 2, tabla: 1, narrativa: 0 }[tipo];
      const encaja = tipo === "tabla" ? dimensiones.length >= 1 : tipo === "narrativa" || dimensiones.length === necesita;
      if (!encaja) {
        notas.push(`Se descartó «${titulo}»: las dimensiones no encajan con las medidas.`);
        continue;
      }
      const huella = `${tipo}|${medidas.join(",")}|${dimensiones.join(",")}`;
      if (vistos.has(huella)) {
        notas.push(`Se descartó «${titulo}»: repetía otro visual de la página.`);
        continue;
      }
      if (tipo === "kpi" && kpis >= 5) {
        notas.push(`Se descartó «${titulo}»: una página no pasa de 5 cifras clave.`);
        continue;
      }
      vistos.add(huella);
      if (tipo === "kpi") kpis++;
      medidas.forEach((m) => usadas.add(m));
      visuales.push({ tipo, titulo, medidas: tipo === "narrativa" ? [] : medidas.slice(0, 3), dimensiones: tipo === "narrativa" ? [] : dimensiones.slice(0, tipo === "tabla" ? 2 : necesita) });
    }
    if (visuales.length) paginas.push({ nombre: texto(pg.nombre, 60) || `Página ${paginas.length + 1}`, plantilla, visuales: visuales.slice(0, PLANTILLAS[plantilla]) });
  }
  if (!paginas.length) return { ok: false, error: "Ningún visual usó medidas y dimensiones del catálogo. Usa solo ids de MEDIDAS y sus dimensiones." };
  const proposito = texto(j.proposito, 300);
  const propias = (Array.isArray(j.notas) ? j.notas : []).map((n: unknown) => texto(n, 300)).filter(Boolean).slice(0, 3);
  if (proposito) propias.unshift(`Propósito: ${proposito}`);
  return { ok: true, valor: { nombre: texto(j.nombre, 80) || "Tablero nuevo", medidas: [...usadas], paginas, notas: [...propias, ...notas] } };
}

/* --- Narrar ------------------------------------------------------------------------------------ */

export interface VisualConCifras {
  titulo: string;
  medida: string;
  formato: string;
  /** Hasta 12 filas ya agregadas, con la reserva de 5 aplicada. */
  filas: { clave: string; valor: number | null }[];
}
export interface PedidoNarrar {
  nombre: string;
  pregunta: string;
  periodo: string;
  sede: string;
  visuales: VisualConCifras[];
}
export interface Narracion {
  titular: string;
  parrafos: string[];
  limites: string[];
  avisos: string[];
}

export function validarNarrar(d: unknown): Lectura<PedidoNarrar> {
  const o = d as Partial<PedidoNarrar> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "Faltan las cifras del tablero." };
  if (!/^\d{4}[ab]$/.test(String(o.periodo ?? ""))) return { ok: false, error: "Falta el periodo." };
  const visuales = (Array.isArray(o.visuales) ? o.visuales : [])
    .map((v) => ({
      titulo: texto(v?.titulo, 120),
      medida: texto(v?.medida, 100),
      formato: texto(v?.formato, 20),
      filas: (Array.isArray(v?.filas) ? v.filas : [])
        .slice(0, 12)
        .map((f: { clave?: unknown; valor?: unknown }) => ({ clave: texto(f?.clave, 100), valor: typeof f?.valor === "number" && Number.isFinite(f.valor) ? f.valor : null })),
    }))
    .filter((v) => v.titulo && v.filas.length)
    .slice(0, 12);
  if (!visuales.length) return { ok: false, error: "No hay cifras que narrar: ningún visual tiene datos." };
  return { ok: true, valor: { nombre: texto(o.nombre, 80), pregunta: texto(o.pregunta, 400), periodo: String(o.periodo), sede: texto(o.sede, 40), visuales } };
}

const SISTEMA_NARRAR = `Eres Mr. Pilo, el asistente de la Universidad de Santander (UDES). Escribes la lectura de un tablero para Planeación y directivos, en español de Colombia, claro, cálido y directo.

REGLAS
1. Usa SOLO cifras que estén en los DATOS. No calcules porcentajes ni diferencias nuevas: si hace falta una, descríbela con palabras («bastante mayor», «casi el doble»).
2. No nombres personas. Los grupos pequeños ya fueron ocultados: no lo comentes como si faltara información.
3. Distingue lo que muestran los datos de una hipótesis: «podría estar relacionado con…» y qué dato habría que mirar.
4. Responde primero la pregunta del tablero. Cierra con lo que estos datos no permiten afirmar.

NARRACIÓN CON DATOS
5. El titular afirma el hallazgo principal con una cifra de los DATOS («La deserción de Ingeniería casi duplica la de Derecho»), no el tema («Análisis de deserción»).
6. Los párrafos siguen un hilo: (a) contexto en una frase: qué se midió y en qué periodo; (b) el hallazgo y la evidencia que lo respalda, con las cifras literales; (c) por qué importa para quien decide; (d) una sola acción o pregunta de seguimiento, concreta, que se pueda emprender esta semana.
7. Elige el arco según la pregunta: si hay evolución, cuenta el cambio (antes, ahora, qué lo movió); si hay comparación, di quién destaca y quién se rezaga; si hay riesgo, di dónde mirar primero. Una sola idea central por lectura.
8. Una cifra por frase, con su contexto (contra qué se compara). Cuenta lo que ves, sin adjetivos grandilocuentes. No te contradigas con los límites.

RESPONDE SOLO UN OBJETO JSON: {"titular": "una frase con el hallazgo", "parrafos": ["2 a 4 párrafos cortos: contexto, hallazgo, por qué importa, qué hacer"], "limites": ["1 a 3 límites"]}`;

export function mensajesNarrar(p: PedidoNarrar): Mensaje[] {
  return [
    { role: "system", content: SISTEMA_NARRAR },
    { role: "user", content: `Tablero «${p.nombre}», periodo ${p.periodo}${p.sede ? `, sede ${p.sede}` : ""}. Pregunta: «${p.pregunta}»\n\nDATOS (JSON):\n${JSON.stringify(p.visuales)}` },
  ];
}

function numerosDe(valor: unknown, salida: Set<number>) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    salida.add(valor);
    salida.add(Math.round(valor * 10) / 10);
    salida.add(Math.round(valor * 100) / 100);
    salida.add(Math.round(valor));
  } else if (typeof valor === "string") {
    for (const m of valor.matchAll(/\d+(?:[.,]\d+)?/g)) salida.add(Number(m[0].replace(",", ".")));
  } else if (Array.isArray(valor)) valor.forEach((v) => numerosDe(v, salida));
  else if (valor && typeof valor === "object") Object.values(valor).forEach((v) => numerosDe(v, salida));
}

/** Cifras del texto que no están en los datos. Los años y los enteros de un dígito sueltos no cuentan. */
export function cifrasNoRespaldadas(textoLibre: string, p: unknown): string[] {
  const permitidos = new Set<number>();
  numerosDe(p, permitidos);
  const fuera: string[] = [];
  for (const m of textoLibre.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (!Number.isFinite(n) || (Number.isInteger(n) && n <= 9)) continue;
    if (![...permitidos].some((x) => Math.abs(x - n) < 0.051 || (Number.isInteger(n) && Math.abs(x - n) < 0.5))) fuera.push(m[0]);
  }
  return [...new Set(fuera)];
}

export function leerNarracion(crudo: string, p: PedidoNarrar): Lectura<Narracion> {
  const j = jsonDe(crudo);
  if (!j) return { ok: false, error: "La respuesta no es un objeto JSON válido." };
  const lista = (v: unknown, max: number, largo: number) => (Array.isArray(v) ? v.map((x) => texto(x, largo)).filter(Boolean).slice(0, max) : []);
  const n = { titular: texto(j.titular, 200), parrafos: lista(j.parrafos, 4, 700), limites: lista(j.limites, 3, 300) };
  if (!n.titular || !n.parrafos.length) return { ok: false, error: "Falta el titular o los párrafos." };
  const fuera = cifrasNoRespaldadas([n.titular, ...n.parrafos, ...n.limites].join(" "), p);
  if (fuera.length > 3) return { ok: false, error: `Citaste cifras que no están en los DATOS: ${fuera.slice(0, 8).join(", ")}. Usa solo cifras literales de los DATOS.` };
  return { ok: true, valor: { ...n, avisos: fuera.map((c) => `La cifra «${c}» no se pudo comprobar en los datos.`) } };
}

/* --- Relaciones entre fuentes -------------------------------------------------------------------- */

const REGLAS = ["programa_es_departamento", "unir_materia_por_codigo", "normalizar_periodo", "pivotar_periodos", "cruce_codigo_estudiante"] as const;
type Regla = (typeof REGLAS)[number];

export interface FuenteConPerfil {
  id: string;
  nombre: string;
  grano: string;
  columnas: { col: string; tipo: string; distintos: number; llenos: number; personal: boolean; dimension?: string }[];
}
export interface PedidoRelaciones {
  pregunta: string;
  fuentes: FuenteConPerfil[];
  hallazgos: { id: string; titulo: string; detalle: string; requiereAprobacion: boolean }[];
  reglas_permitidas: string[];
}
export interface AnalisisRelaciones {
  resumen: string;
  relaciones: { desde: { fuente: string; columna: string }; hacia: { fuente: string; columna: string }; tipo: "muchos-a-uno" | "uno-a-uno" | "muchos-a-muchos"; calidad: "alta" | "media" | "baja"; nota: string }[];
  reglas: { regla: Regla; motivo: string }[];
  riesgos: string[];
  aisladas: string[];
  avisos: string[];
}

export function validarRelaciones(d: unknown): Lectura<PedidoRelaciones> {
  const o = d as Partial<PedidoRelaciones> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "Falta el pedido." };
  const fuentes = (Array.isArray(o.fuentes) ? o.fuentes : [])
    .map((f) => ({
      id: texto(f?.id, 60),
      nombre: texto(f?.nombre, 100),
      grano: texto(f?.grano, 160),
      columnas: (Array.isArray(f?.columnas) ? f.columnas : [])
        .slice(0, 60)
        .map((c: Record<string, unknown>) => ({
          col: texto(c?.col, 80),
          tipo: texto(c?.tipo, 20),
          distintos: Number.isFinite(c?.distintos) ? Number(c.distintos) : 0,
          llenos: Number.isFinite(c?.llenos) ? Number(c.llenos) : 0,
          personal: Boolean(c?.personal),
          ...(c?.dimension ? { dimension: texto(c.dimension, 30) } : {}),
        }))
        .filter((c: { col: string }) => c.col),
    }))
    .filter((f) => f.id && f.nombre)
    .slice(0, 12);
  if (fuentes.length < 2) return { ok: false, error: "Para analizar relaciones hacen falta al menos dos fuentes." };
  const hallazgos = (Array.isArray(o.hallazgos) ? o.hallazgos : []).slice(0, 10).map((h) => ({ id: texto(h?.id, 40), titulo: texto(h?.titulo, 140), detalle: texto(h?.detalle, 300), requiereAprobacion: Boolean(h?.requiereAprobacion) }));
  const permitidas = (Array.isArray(o.reglas_permitidas) ? o.reglas_permitidas : []).map((r: unknown) => texto(r, 40)).filter((r) => (REGLAS as readonly string[]).includes(r));
  return { ok: true, valor: { pregunta: texto(o.pregunta, 400), fuentes, hallazgos, reglas_permitidas: permitidas } };
}

const SISTEMA_RELACIONES = `Eres Pilo Tableros, el analista de datos de la Universidad de Santander (UDES). Revisas cómo se relacionan varias tablas del Warehouse (reportes de Master, Galileo y Davinci) para que se puedan cruzar sin duplicar ni inventar cifras. Hablas en español de Colombia, claro y directo.

QUÉ RECIBES: por cada fuente, qué representa una fila (grano) y sus columnas con tipo, valores distintos, filas llenas, si es dato personal y la dimensión que ya se le reconoce (periodo, sede, programa, materia, departamento, docente, estudiante, jornada). No recibes filas ni valores.

REGLAS
1. Habla SOLO de fuentes y columnas que estén en FUENTES. No inventes columnas.
2. Una relación une una columna de una fuente con una columna de otra. «tipo» es la cardinalidad desde la primera hacia la segunda: muchos-a-uno, uno-a-uno o muchos-a-muchos. Las fuentes con grano distinto (una fila por grupo frente a una por estudiante) NO se suman ni se unen fila contra fila: se cruzan por dimensiones comunes y se dice en la nota.
3. «calidad»: alta si las columnas llevan el mismo concepto y formato; media si hay que normalizar (nombres con tildes, código frente a nombre); baja si es una suposición.
4. Una columna con dato personal (código de estudiante, identificación) puede ser llave de cruce dentro de la base, pero el tablero solo muestra agregados con reserva de 5. Dilo cuando la uses.
5. «reglas» solo puede usar estos ids: ${REGLAS.join(", ")}, y solo los que estén en REGLAS PERMITIDAS. Cada una con su motivo.
6. En «riesgos» pon lo que podría dar cifras engañosas (duplicar al unir, periodos en otro formato, programa que en realidad es departamento). En «aisladas» pon los ids de fuentes que no se relacionan con ninguna otra.
7. Usa solo cifras que estén en los datos recibidos.

RESPONDE SOLO UN OBJETO JSON: {"resumen": "2 a 4 frases", "relaciones": [{"desde": {"fuente": "id", "columna": "col"}, "hacia": {"fuente": "id", "columna": "col"}, "tipo": "muchos-a-uno", "calidad": "alta", "nota": "una frase"}], "reglas": [{"regla": "id", "motivo": "una frase"}], "riesgos": ["..."], "aisladas": ["id"]}
Máximo 12 relaciones.`;

export function mensajesRelaciones(p: PedidoRelaciones): Mensaje[] {
  return [
    { role: "system", content: SISTEMA_RELACIONES },
    { role: "user", content: `PREGUNTA DEL TABLERO: «${p.pregunta || "(no indicada)"}»\n\nFUENTES (JSON):\n${JSON.stringify(p.fuentes)}\n\nHALLAZGOS DETECTADOS POR LA APLICACIÓN (JSON):\n${JSON.stringify(p.hallazgos)}\n\nREGLAS PERMITIDAS: ${p.reglas_permitidas.join(", ") || "(ninguna)"}` },
  ];
}

/** La respuesta de Pilo, depurada: solo fuentes y columnas que existen y solo reglas permitidas. */
export function leerRelaciones(crudo: string, p: PedidoRelaciones): Lectura<AnalisisRelaciones> {
  const j = jsonDe(crudo);
  if (!j) return { ok: false, error: "La respuesta no es un objeto JSON válido." };
  const columnas = new Map(p.fuentes.map((f) => [f.id, new Set(f.columnas.map((c) => c.col))]));
  const avisos: string[] = [];
  const existe = (x: unknown): { fuente: string; columna: string } | null => {
    const o = (x ?? {}) as Record<string, unknown>;
    const fuente = texto(o.fuente, 60);
    const columna = texto(o.columna, 80);
    return columnas.get(fuente)?.has(columna) ? { fuente, columna } : null;
  };
  const relaciones: AnalisisRelaciones["relaciones"] = [];
  for (const rr of (Array.isArray(j.relaciones) ? j.relaciones : []).slice(0, 12)) {
    const r = (rr ?? {}) as Record<string, unknown>;
    const desde = existe(r.desde);
    const hacia = existe(r.hacia);
    if (!desde || !hacia || desde.fuente === hacia.fuente) {
      avisos.push("Se descartó una relación que nombraba una columna o una fuente que no existe.");
      continue;
    }
    const tipo = (["muchos-a-uno", "uno-a-uno", "muchos-a-muchos"] as const).find((t) => t === r.tipo) ?? "muchos-a-muchos";
    const calidad = (["alta", "media", "baja"] as const).find((t) => t === r.calidad) ?? "baja";
    relaciones.push({ desde, hacia, tipo, calidad, nota: texto(r.nota, 240) });
  }
  const reglas: AnalisisRelaciones["reglas"] = [];
  for (const rr of (Array.isArray(j.reglas) ? j.reglas : []).slice(0, 5)) {
    const r = (rr ?? {}) as Record<string, unknown>;
    const id = texto(r.regla, 40);
    if (p.reglas_permitidas.includes(id) && !reglas.some((x) => x.regla === id)) reglas.push({ regla: id as Regla, motivo: texto(r.motivo, 240) });
  }
  const lista = (v: unknown, max: number, largo: number) => (Array.isArray(v) ? v.map((x) => texto(x, largo)).filter(Boolean).slice(0, max) : []);
  const ids = new Set(p.fuentes.map((f) => f.id));
  const a: AnalisisRelaciones = {
    resumen: texto(j.resumen, 900),
    relaciones,
    reglas,
    riesgos: lista(j.riesgos, 6, 280),
    aisladas: lista(j.aisladas, 12, 60).filter((x) => ids.has(x)),
    avisos,
  };
  if (!a.resumen) return { ok: false, error: "Falta el resumen." };
  if (!relaciones.length && !a.aisladas.length) return { ok: false, error: "No devolviste ninguna relación válida ni dijiste qué fuentes quedan aisladas. Usa solo fuentes y columnas de FUENTES." };
  const fuera = cifrasNoRespaldadas([a.resumen, ...a.riesgos, ...relaciones.map((r) => r.nota), ...reglas.map((r) => r.motivo)].join(" "), p);
  if (fuera.length > 3) return { ok: false, error: `Citaste cifras que no están en los datos: ${fuera.slice(0, 8).join(", ")}. Usa solo cifras recibidas.` };
  return { ok: true, valor: { ...a, avisos: [...avisos, ...fuera.map((c) => `La cifra «${c}» no se pudo comprobar en los datos.`)] } };
}

/* --- Paleta de colores ----------------------------------------------------------------------------
   Pilo propone los colores; esta función los comprueba con números, no con confianza: formato, contraste
   contra el fondo claro y el oscuro, distancia entre colores y escalera secuencial ordenada. Lo que no
   pasa se le devuelve a Pilo una vez y, si insiste, no sale. */

export interface PedidoPaleta {
  tema: string;
  pregunta: string;
  nombre: string;
}
export interface Paleta {
  nombre: string;
  descripcion: string;
  /** 6 a 8 colores para series y categorías, distinguibles entre sí. */
  categorica: string[];
  /** 5 pasos de claro a oscuro para mapas de calor. */
  secuencial: string[];
  avisos: string[];
}

export function validarPedidoPaleta(d: unknown): Lectura<PedidoPaleta> {
  const o = d as Partial<PedidoPaleta> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "Falta el pedido de la paleta." };
  const tema = texto(o.tema, 200);
  const pregunta = texto(o.pregunta, 400);
  if (tema.length < 3 && pregunta.length < 8) return { ok: false, error: "Cuente de qué trata el tablero o qué ambiente de color busca." };
  return { ok: true, valor: { tema, pregunta, nombre: texto(o.nombre, 80) } };
}

const FONDO_CLARO = "#ffffff";
const FONDO_OSCURO = "#151d28";
const TINTA_OSCURA = "#0d1c31";
const TINTA_CLARA = "#ffffff";
const HEX = /^#[0-9a-f]{6}$/i;

const canales = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lineal = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminancia = (h: string) => {
  const [r, g, b] = canales(h);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
};
export const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const [lr, lg, lb] = [lineal(r), lineal(g), lineal(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const distancia = (a: [number, number, number], b: [number, number, number]) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const DEUTAN = [
  [0.625, 0.375, 0],
  [0.7, 0.3, 0],
  [0, 0.3, 0.7],
];
const PROTAN = [
  [0.567, 0.433, 0],
  [0.558, 0.442, 0],
  [0, 0.242, 0.758],
];
const simular = (c: [number, number, number], m: number[][]): [number, number, number] => [0, 1, 2].map((i) => m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2]) as [number, number, number];

const SISTEMA_PALETA = `Eres Pilo Tableros, el diseñador de color de los tableros de la Universidad de Santander (UDES). Propones la paleta de un tablero de datos. El color es significado, no adorno: ayuda a distinguir y a enfocar la atención, y tiene que funcionar para personas daltónicas, en pantalla clara y oscura, y en escala de grises.

REGLAS
1. «categorica»: de 6 a 8 colores hex (#rrggbb) para series y categorías. Deben distinguirse entre sí por tono y por luminosidad, no solo por tono. Evita dos tonos de la misma familia seguidos; alterna cálidos y fríos. Cada uno debe leerse sobre fondo blanco (#ffffff) Y sobre fondo oscuro (#151d28): usa tonos medios, ni casi blancos ni casi negros.
2. «secuencial»: exactamente 5 colores hex de la MISMA gama, del más claro al más oscuro, con saltos parejos. Sirven para mapas de calor: mayor valor, más oscuro. Los tres primeros llevan texto oscuro (#0d1c31) y los dos últimos texto blanco, así que los tres primeros deben ser claros y los dos últimos oscuros.
3. El rojo, el ámbar y el verde de estado (alerta, atención, bien) están reservados para semáforos: no los uses como colores de categorías. Si el tema pide verdes (sostenibilidad), usa verdes azulados o amarillentos, y combínalos con otros tonos.
4. El primer color de «categorica» es el protagonista: el que se usará cuando una gráfica tenga una sola serie. Debe expresar el tema del tablero.
5. Respeta la identidad: la base institucional UDES es azul (#1f5fbf), verde azulado (#0b7481), óxido (#a4471f), violeta (#6b3fa0), ocre (#7f6200), frambuesa (#ad2f58), pizarra (#43536b), verde (#2e6b2f). Parte de ahí y desplázate hacia el tema pedido sin perder sobriedad.
6. Nunca uses colores neón ni degradados caprichosos. «descripcion» explica en una frase, en español de Colombia, por qué esa paleta sirve para este tablero.

RESPONDE SOLO UN OBJETO JSON, sin texto antes ni después:
{"nombre": "nombre corto de la paleta", "descripcion": "una frase", "categorica": ["#rrggbb"], "secuencial": ["#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb", "#rrggbb"]}`;

export function mensajesPaleta(p: PedidoPaleta): Mensaje[] {
  return [
    { role: "system", content: SISTEMA_PALETA },
    { role: "user", content: `TABLERO: «${p.nombre || "(sin nombre)"}»\nPREGUNTA: «${p.pregunta || "(no indicada)"}»\nAMBIENTE O TEMA DE COLOR PEDIDO: ${p.tema || "(el que mejor sirva a la pregunta)"}` },
  ];
}

/** La paleta de Pilo, comprobada con números. */
export function leerPaleta(crudo: string): Lectura<Paleta> {
  const j = jsonDe(crudo);
  if (!j) return { ok: false, error: "La respuesta no es un objeto JSON válido." };
  const colores = (v: unknown) => (Array.isArray(v) ? v.map((x) => texto(x, 12).toLowerCase()) : []);
  const categorica = [...new Set(colores(j.categorica))];
  const secuencial = colores(j.secuencial);
  const errores: string[] = [];
  const mal = [...categorica, ...secuencial].filter((c) => !HEX.test(c));
  if (mal.length) errores.push(`Estos valores no son colores #rrggbb: ${mal.slice(0, 4).join(", ")}.`);
  if (categorica.length < 6 || categorica.length > 8) errores.push(`«categorica» debe tener de 6 a 8 colores distintos y tiene ${categorica.length}.`);
  if (secuencial.length !== 5) errores.push(`«secuencial» debe tener exactamente 5 colores y tiene ${secuencial.length}.`);
  if (errores.length) return { ok: false, error: errores.join(" ") };

  const pobres = categorica.filter((c) => contraste(c, FONDO_CLARO) < 3 || contraste(c, FONDO_OSCURO) < 3);
  if (pobres.length) errores.push(`Estos colores de «categorica» no se leen a la vez sobre fondo blanco y fondo oscuro (necesitan contraste 3:1 con ambos): ${pobres.join(", ")}. Usa tonos medios.`);
  const cercanos: string[] = [];
  const avisos: string[] = [];
  for (let i = 0; i < categorica.length; i++) {
    for (let k = i + 1; k < categorica.length; k++) {
      const [a, b] = [canales(categorica[i]), canales(categorica[k])];
      if (distancia(a, b) < 15) cercanos.push(`${categorica[i]} y ${categorica[k]}`);
      else if (i < 5 && k < 5 && (distancia(simular(a, DEUTAN), simular(b, DEUTAN)) < 8 || distancia(simular(a, PROTAN), simular(b, PROTAN)) < 8)) avisos.push(`${categorica[i]} y ${categorica[k]} pueden confundirse con daltonismo rojo-verde.`);
    }
  }
  if (cercanos.length) errores.push(`Estos pares de «categorica» se parecen demasiado: ${cercanos.slice(0, 4).join("; ")}. Sepáralos en tono y luminosidad.`);
  const luz = secuencial.map(luminancia);
  if (!luz.every((l, i) => i === 0 || l < luz[i - 1] - 0.02)) errores.push("«secuencial» debe ir de claro a oscuro con saltos visibles entre un paso y el siguiente.");
  const sinTinta = secuencial.filter((c, i) => (i < 3 ? contraste(c, TINTA_OSCURA) : contraste(c, TINTA_CLARA)) < 4.5);
  if (sinTinta.length) errores.push(`En «secuencial» el texto no se lee sobre ${sinTinta.join(", ")}: los 3 primeros deben ser claros (texto oscuro) y los 2 últimos oscuros (texto blanco), con contraste 4.5:1.`);
  if (errores.length) return { ok: false, error: errores.join(" ") };

  return {
    ok: true,
    valor: { nombre: texto(j.nombre, 60) || "Paleta propuesta", descripcion: texto(j.descripcion, 240), categorica, secuencial, avisos: [...new Set(avisos)].slice(0, 3) },
  };
}
