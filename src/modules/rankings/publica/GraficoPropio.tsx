/* =============================================================================
   Pilo Publica · un gráfico con datos propios.

   Un gráfico no depende del tablero ni de las fuentes: una persona puede
   escribir sus datos y decir de dónde salen. Cada dato se guarda como una cifra
   del libro («manual:…») con la fuente a la vista, así el informe público la
   imprime al pie y nada queda sin procedencia. Sin fuente no se crea.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { useCrearCifras } from "./datos";
import type { CifraManual } from "./datos";
import { VistaPrevia } from "./ConstructorGrafico";
import type { CifraPub, SpecGrafico, TipoGrafico, UnidadPP } from "./tipos";
import { ErrorAviso } from "./ui";

type TipoPropio = Extract<TipoGrafico, "bar" | "line" | "compare" | "stack" | "donut">;

const TIPOS: { id: TipoPropio; t: string; d: string; filas: string }[] = [
  { id: "bar", t: "Comparar categorías", d: "Barras: una cifra por categoría (programas, sedes, grupos…).", filas: "Categoría" },
  { id: "line", t: "Cómo cambia en el tiempo", d: "Línea: una cifra por año.", filas: "Año" },
  { id: "compare", t: "Antes y ahora", d: "Los años de una medida con su variación.", filas: "Año" },
  { id: "stack", t: "Composición", d: "Las partes de un total en una barra al 100 %.", filas: "Parte" },
  { id: "donut", t: "Un porcentaje", d: "Un solo % como anillo.", filas: "Nombre" },
];

const ANIO = /^(19|20)\d{2}$/;

/** «1.234,5», «1234,5», «1,234.5» y «12,5 %» como número; null si no lo es. */
export function leerNumero(texto: string): number | null {
  let t = texto.replace(/[%\s]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface Fila {
  x: string;
  v: string;
}

export function GraficoPropio({ informeId, unidad, onCrear, onCerrar }: { informeId: string; unidad: UnidadPP | undefined; onCrear: (spec: SpecGrafico) => Promise<void>; onCerrar: () => void }) {
  const crearCifras = useCrearCifras();
  const lote = useRef(Math.random().toString(36).slice(2, 7));
  const [tipo, setTipo] = useState<TipoPropio>("bar");
  const [filas, setFilas] = useState<Fila[]>([{ x: "", v: "" }, { x: "", v: "" }, { x: "", v: "" }]);
  const [unidadTxt, setUnidadTxt] = useState("");
  const [anioDato, setAnioDato] = useState("");
  const [tEs, setTEs] = useState("");
  const [tEn, setTEn] = useState("");
  const [fuente, setFuente] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);

  const def = TIPOS.find((t) => t.id === tipo) ?? TIPOS[0];
  const enTiempo = tipo === "line" || tipo === "compare";
  const unidadReal = tipo === "donut" ? "%" : unidadTxt.trim();

  const llenas = filas.filter((f) => f.x.trim() || f.v.trim());
  const datos = llenas.map((f) => ({ x: f.x.trim(), n: leerNumero(f.v) }));

  const problemas = useMemo(() => {
    const m: string[] = [];
    const completas = datos.filter((d) => d.x && d.n !== null);
    if (datos.some((d) => !d.x || d.n === null)) m.push("Cada fila necesita su nombre y un valor que sea número.");
    const minimo = tipo === "donut" ? 1 : 2;
    if (completas.length < minimo) m.push(tipo === "donut" ? "Escribe el porcentaje." : "Escribe al menos dos filas.");
    if (tipo === "donut" && completas.length > 1) m.push("El anillo muestra un solo porcentaje.");
    if (tipo === "donut" && completas.some((d) => (d.n as number) < 0 || (d.n as number) > 100)) m.push("Un porcentaje va de 0 a 100.");
    if (enTiempo && completas.some((d) => !ANIO.test(d.x))) m.push("Aquí cada fila es un año (por ejemplo 2024).");
    if (new Set(completas.map((d) => d.x.toLowerCase())).size !== completas.length) m.push("Hay dos filas con el mismo nombre.");
    if (tipo === "stack" && completas.some((d) => (d.n as number) < 0)) m.push("Una composición no admite valores negativos.");
    if (!enTiempo && anioDato.trim() && !ANIO.test(anioDato.trim())) m.push("El año del dato debe ser de cuatro cifras (por ejemplo 2025).");
    if (!tEs.trim()) m.push("Falta el título en español.");
    if (fuente.trim().length < 8) m.push("Falta la fuente: di de dónde salen los datos (oficina o documento y año).");
    return m;
  }, [datos, tipo, enTiempo, anioDato, tEs, fuente]);

  /** Las cifras y el gráfico, con las claves del lote (la vista previa usa unas de mentira, nada se guarda). */
  const armar = (prefijo: string): { cifras: CifraManual[]; spec: SpecGrafico } => {
    const bien = datos.filter((d) => d.x && d.n !== null);
    const anio = !enTiempo && ANIO.test(anioDato.trim()) ? Number(anioDato.trim()) : null;
    const cifras: CifraManual[] = bien.map((d, i) => ({
      key: `manual:${prefijo}:${i + 1}`,
      label: enTiempo ? tEs.trim() : d.x,
      label_en: enTiempo ? tEn.trim() : d.x,
      unit: unidadReal,
      year: enTiempo ? Number(d.x) : anio,
      value: d.n as number,
    }));
    return { cifras, spec: { chart: tipo, series: bien.map((d, i) => ({ x: d.x, cifra: cifras[i].key })), title_es: tEs.trim(), title_en: tEn.trim() } };
  };

  const vista = useMemo(() => {
    if (problemas.some((p) => !/título|fuente/.test(p))) return null;
    const { cifras, spec } = armar("vista");
    const libro = new Map<string, CifraPub>(cifras.map((c) => [c.key, { ...c, source: {} }]));
    return { spec, libro };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recalcula con lo que la persona escribe
  }, [problemas, filas, tipo, unidadTxt, anioDato, tEs, tEn]);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      const { cifras, spec } = armar(lote.current);
      await crearCifras.mutateAsync({ informe_id: informeId, fuente, cifras });
      await onCrear(spec);
      onCerrar();
    } catch (e) {
      setError(e); // lo escrito se conserva
    } finally {
      setGuardando(false);
    }
  };

  const poner = (i: number, n: Partial<Fila>) => setFilas((f) => f.map((x, k) => (k === i ? { ...x, ...n } : x)));
  const sinProblemas = problemas.length === 0 && !guardando;

  return (
    <div className="pp-ctor pp-pad pp-stack">
      <p className="pp-nota">Un gráfico con datos propios no depende del tablero: tú escribes los datos y dices de dónde salen. Esa fuente se imprime al pie del gráfico en el informe.</p>

      <div>
        <div className="pp-opt-t" id="pp-prop-t">
          1. ¿Qué quieres mostrar?
        </div>
        <div className="pp-modos" role="radiogroup" aria-labelledby="pp-prop-t">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} onClick={() => setTipo(t.id)}>
              <strong>{t.t}</strong>
              <small>{t.d}</small>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="pp-opt-t">2. Escribe los datos</div>
        <div className="pp-filas">
          <div className="pp-filas__r pp-filas__enc" aria-hidden="true">
            <span>{def.filas}</span>
            <span>Valor</span>
            <span />
          </div>
          {filas.map((f, i) => (
            <div className="pp-filas__r" key={i}>
              <input aria-label={`${def.filas} ${i + 1}`} value={f.x} placeholder={enTiempo ? "2024" : "Nombre"} inputMode={enTiempo ? "numeric" : undefined} onChange={(e) => poner(i, { x: e.target.value })} />
              <input aria-label={`Valor ${i + 1}`} value={f.v} placeholder="0" inputMode="decimal" onChange={(e) => poner(i, { v: e.target.value })} />
              <button type="button" className="pp-btn pp-btn--sm" onClick={() => setFilas((a) => (a.length > 1 ? a.filter((_, k) => k !== i) : a))} aria-label={`Quitar la fila ${i + 1}`} disabled={filas.length <= 1}>
                Quitar
              </button>
            </div>
          ))}
        </div>
        <div className="pp-acciones">
          <button type="button" className="pp-btn pp-btn--sm" onClick={() => setFilas((a) => [...a, { x: "", v: "" }])} disabled={filas.length >= 24 || tipo === "donut"}>
            + Agregar fila
          </button>
        </div>
        <div className="pp-dos">
          <div className="pp-fld pp-fld--chico">
            <label htmlFor="pp-prop-u">Unidad</label>
            <input id="pp-prop-u" value={tipo === "donut" ? "%" : unidadTxt} disabled={tipo === "donut"} placeholder="personas, %, programas…" onChange={(e) => setUnidadTxt(e.target.value)} />
            <small>Opcional. Con «%» la cifra se muestra como porcentaje.</small>
          </div>
          {!enTiempo && (
            <div className="pp-fld pp-fld--chico">
              <label htmlFor="pp-prop-a">Año de los datos</label>
              <input id="pp-prop-a" value={anioDato} inputMode="numeric" placeholder="2025" onChange={(e) => setAnioDato(e.target.value)} />
              <small>Opcional.</small>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="pp-opt-t">3. Título y fuente</div>
        <div className="pp-dos">
          <div className="pp-fld">
            <label htmlFor="pp-prop-te">Título en español</label>
            <input id="pp-prop-te" lang="es" value={tEs} onChange={(e) => setTEs(e.target.value)} />
            <small>Sin cifras en el título, solo años.</small>
          </div>
          <div className="pp-fld">
            <label htmlFor="pp-prop-ti">Título en inglés</label>
            <input id="pp-prop-ti" lang="en" value={tEn} onChange={(e) => setTEn(e.target.value)} />
          </div>
        </div>
        <div className="pp-fld">
          <label htmlFor="pp-prop-f">De dónde salen los datos (obligatorio)</label>
          <input id="pp-prop-f" value={fuente} placeholder="Oficina de Planeación, informe de gestión 2025" onChange={(e) => setFuente(e.target.value)} />
          <small>Oficina o documento y año. Se imprime al pie del gráfico.</small>
        </div>
      </div>

      {problemas.length > 0 && (
        <ul className="pp-warn-lista" role="status">
          {problemas.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {vista && <VistaPrevia spec={vista.spec} libro={vista.libro} unidad={unidad} uid="propio" />}
      {error != null && <ErrorAviso error={error} titulo="No se pudo guardar el gráfico" />}
      <div className="pp-acciones">
        <button type="button" className="pp-btn pp-btn--pilo" disabled={!sinProblemas} onClick={() => void guardar()} title={!sinProblemas ? "Completa lo que se indica arriba" : undefined}>
          {guardando ? "Guardando…" : "Crear gráfico"}
        </button>
        <button type="button" className="pp-btn" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
