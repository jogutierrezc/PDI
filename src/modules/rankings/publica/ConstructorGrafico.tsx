/* Crear un gráfico paso a paso (solo combinaciones válidas) y las sugerencias que arma la pantalla sola. */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Grafica } from "./graficas";
import { agruparPorSerie, diagnosticar, explicacionDe, motivoIncompatible, sinAnio, specDeCifras, tituloSugerido, unidadNorm, unidadTexto } from "./explicar";
import type { Sugerencia } from "./explicar";
import { resolverSerie, varsAcento } from "./tipos";
import type { CifraPP, CifraPub, SpecGrafico, TipoGrafico, UnidadPP } from "./tipos";
import { ErrorAviso } from "./ui";

export const NOMBRE_TIPO: Record<TipoGrafico, string> = { bar: "Barras", line: "Línea", donut: "Anillo" };

const corto = (t: string, n = 150) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Vista previa en vivo con los mismos componentes del informe. */
export function VistaPrevia({ spec, libro, unidad, uid }: { spec: SpecGrafico; libro: Map<string, CifraPub>; unidad: UnidadPP | undefined; uid: string }) {
  const s = resolverSerie(spec, libro);
  const tipo = spec.chart ?? "bar";
  return (
    <div className="pp-cc pp-cc--prev" style={varsAcento(unidad) as CSSProperties}>
      <h3>{spec.title_es || "Sin título"}</h3>
      {s.puntos.some((x) => x.v !== null) ? <Grafica tipo={tipo} puntos={s.puntos} unidad={s.unidad} titulo={spec.title_es ?? ""} idioma="es" uid={uid} /> : <p className="pp-nota">La vista previa aparece cuando haya al menos una cifra con valor.</p>}
    </div>
  );
}

type Modo = "serie" | "comparar" | "pct";
const MODOS: { id: Modo; t: string; d: string }[] = [
  { id: "serie", t: "Cómo cambia una medida en el tiempo", d: "La misma medida en varios años: línea o barras." },
  { id: "comparar", t: "Comparar medidas entre sí", d: "Varias medidas de la misma unidad: barras." },
  { id: "pct", t: "Un porcentaje", d: "Un solo % como anillo." },
];

export function ConstructorGrafico({
  cifras,
  libro,
  unidad,
  onCrear,
  onCerrar,
}: {
  cifras: CifraPP[];
  libro: Map<string, CifraPub>;
  unidad: UnidadPP | undefined;
  onCrear: (spec: SpecGrafico) => Promise<void>;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<Modo>("serie");
  const [q, setQ] = useState("");
  const [serie, setSerie] = useState("");
  const [claves, setClaves] = useState<string[]>([]);
  const [unidadSel, setUnidadSel] = useState("");
  const [tipoElegido, setTipoElegido] = useState<TipoGrafico | null>(null);
  const [tEs, setTEs] = useState<string | null>(null);
  const [tEn, setTEn] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);

  const conValor = useMemo(() => cifras.filter((c) => c.value !== null), [cifras]);
  const porClave = useMemo(() => new Map(cifras.map((c) => [c.key, c])), [cifras]);

  const series = useMemo(
    () =>
      agruparPorSerie(conValor)
        .map((g) => ({ ...g, cifras: Array.from(new Map(g.cifras.filter((c) => c.year !== null).map((c) => [c.year, c])).values()) }))
        .filter((g) => g.cifras.length >= 2 && new Set(g.cifras.map((c) => unidadNorm(c.unit))).size === 1),
    [conValor],
  );
  const unidades = useMemo(() => {
    const m = new Map<string, { t: string; n: number }>();
    for (const c of conValor) {
      const k = unidadNorm(c.unit);
      m.set(k, { t: c.unit.trim(), n: (m.get(k)?.n ?? 0) + 1 });
    }
    return Array.from(m).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n);
  }, [conValor]);

  const elegidas = claves.map((k) => porClave.get(k)).filter((c): c is CifraPP => Boolean(c));
  const tipoPorDefecto: TipoGrafico = modo === "pct" ? "donut" : modo === "comparar" ? "bar" : elegidas.length >= 3 ? "line" : "bar";
  const tipo: TipoGrafico = modo === "pct" ? "donut" : modo === "comparar" ? "bar" : tipoElegido ?? tipoPorDefecto;

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setClaves([]);
    setSerie("");
    setUnidadSel("");
    setTipoElegido(null);
    setTEs(null);
    setTEn(null);
    setQ("");
    setError(null);
  };

  const sug = tituloSugerido(tipo, elegidas);
  const spec = specDeCifras(tipo, elegidas, { es: tEs ?? sug.es, en: tEn ?? sug.en });
  const dx = diagnosticar(tipo, elegidas);
  const sinTitulo = !(spec.title_es ?? "").trim();
  const puedeGuardar = dx.ok && !sinTitulo && !guardando;

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await onCrear(spec);
      onCerrar();
    } catch (e) {
      setError(e); // lo elegido y escrito se conserva
    } finally {
      setGuardando(false);
    }
  };

  const texto = q.trim().toLowerCase();
  const coincide = (c: CifraPP) => !texto || `${c.label} ${c.label_en} ${c.key} ${explicacionDe(c).texto}`.toLowerCase().includes(texto);

  return (
    <div className="pp-ctor pp-pad pp-stack">
      <div>
        <div className="pp-opt-t" id="pp-ctor-m">
          1. ¿Qué quieres mostrar?
        </div>
        <div className="pp-modos" role="radiogroup" aria-labelledby="pp-ctor-m">
          {MODOS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} onClick={() => cambiarModo(m.id)}>
              <strong>{m.t}</strong>
              <small>{m.d}</small>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="pp-opt-t">2. Elige las cifras del libro</div>
        {cifras.length === 0 ? (
          <p className="pp-aviso">El libro de cifras está vacío: arma el tablero primero.</p>
        ) : (
          <>
            {modo === "comparar" && (
              <div className="pp-fld pp-fld--chico">
                <label htmlFor="pp-ctor-u">Unidad de las cifras a comparar</label>
                <select id="pp-ctor-u" value={unidadSel} onChange={(e) => { setUnidadSel(e.target.value); setClaves([]); }}>
                  <option value="">Elegir…</option>
                  {unidades.map(([k, v]) => (
                    <option key={k} value={k}>
                      {unidadTexto(v.t)} ({v.n} cifras)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(modo !== "comparar" || unidadSel) && (
              <div className="pp-fld pp-fld--chico">
                <label htmlFor="pp-ctor-q">Buscar</label>
                <input id="pp-ctor-q" type="search" value={q} placeholder="Nombre o explicación…" onChange={(e) => setQ(e.target.value)} />
              </div>
            )}

            {modo === "serie" && (
              <>
                {series.length === 0 && <p className="pp-aviso">Ninguna medida tiene dos o más años con valor y la misma unidad. Prueba «Comparar medidas» o «Un porcentaje».</p>}
                <ul className="pp-opciones" role="radiogroup" aria-label="Medidas con varios años">
                  {series.filter((g) => coincide(g.cifras[0]) || g.nombre.toLowerCase().includes(texto)).map((g) => (
                    <li key={g.serie}>
                      <button type="button" role="radio" aria-checked={serie === g.serie} onClick={() => { setSerie(g.serie); setClaves(g.cifras.map((c) => c.key)); setTEs(null); setTEn(null); }}>
                        <strong>{g.nombre}</strong>
                        <small>
                          {g.cifras.length} años ({g.cifras[0].year}–{g.cifras[g.cifras.length - 1].year}) · {unidadTexto(g.cifras[0].unit)}
                        </small>
                        <span className="pp-nota">{explicacionDe(g.cifras[0]).texto ? corto(explicacionDe(g.cifras[0]).texto) : "Sin explicación todavía."}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {serie && (
                  <fieldset className="pp-series">
                    <legend>Años que se dibujan</legend>
                    <div className="pp-anios">
                      {(series.find((g) => g.serie === serie)?.cifras ?? []).map((c) => (
                        <label key={c.key} className="pp-check">
                          <input
                            type="checkbox"
                            checked={claves.includes(c.key)}
                            onChange={(e) => setClaves((a) => (e.target.checked ? [...a, c.key] : a.filter((k) => k !== c.key)))}
                          />{" "}
                          {c.year}: <b>{c.value}</b>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {serie && (
                  <div>
                    <div className="pp-opt-t" id="pp-ctor-t">
                      Tipo
                    </div>
                    <div className="pp-seg" role="group" aria-labelledby="pp-ctor-t">
                      {(["line", "bar"] as TipoGrafico[]).map((t) => (
                        <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipoElegido(t)}>
                          {NOMBRE_TIPO[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {modo === "comparar" && unidadSel && (
              <ul className="pp-opciones pp-opciones--multi" aria-label="Cifras de esa unidad">
                {conValor
                  .filter((c) => unidadNorm(c.unit) === unidadSel && coincide(c))
                  .slice(0, 80)
                  .map((c) => {
                    const on = claves.includes(c.key);
                    const motivo = on ? null : motivoIncompatible("bar", elegidas, c);
                    return (
                      <li key={c.key}>
                        <label className={`pp-opcion${motivo ? " pp-opcion--no" : ""}`}>
                          <input type="checkbox" checked={on} disabled={Boolean(motivo)} onChange={(e) => setClaves((a) => (e.target.checked ? [...a, c.key] : a.filter((k) => k !== c.key)))} />
                          <span>
                            <strong>
                              {c.label}
                              {c.year ? ` (${c.year})` : " (sin año)"}: {c.value}
                            </strong>
                            <small className="pp-nota">{explicacionDe(c).texto ? corto(explicacionDe(c).texto) : "Sin explicación todavía."}</small>
                            {motivo && <small className="pp-warn">No se puede sumar: {motivo}</small>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            )}

            {modo === "pct" && (
              <ul className="pp-opciones" role="radiogroup" aria-label="Porcentajes del libro">
                {conValor.filter((c) => c.unit.trim() === "%" && coincide(c)).slice(0, 80).map((c) => (
                  <li key={c.key}>
                    <button type="button" role="radio" aria-checked={claves[0] === c.key} onClick={() => { setClaves([c.key]); setTEs(null); setTEn(null); }}>
                      <strong>
                        {c.label}
                        {c.year ? ` (${c.year})` : ""}: {c.value} %
                      </strong>
                      <span className="pp-nota">{explicacionDe(c).texto ? corto(explicacionDe(c).texto) : "Sin explicación todavía."}</span>
                    </button>
                  </li>
                ))}
                {!conValor.some((c) => c.unit.trim() === "%") && <li className="pp-aviso">El libro no tiene cifras en porcentaje.</li>}
              </ul>
            )}
          </>
        )}
      </div>

      {elegidas.length > 0 && (
        <>
          <div>
            <div className="pp-opt-t">3. Revisa el título y la vista previa</div>
            <div className="pp-dos">
              <div className="pp-fld">
                <label htmlFor="pp-ctor-te">Título en español</label>
                <input id="pp-ctor-te" lang="es" value={tEs ?? sug.es} onChange={(e) => setTEs(e.target.value)} />
                <small>Sin cifras en el título, solo años.</small>
              </div>
              <div className="pp-fld">
                <label htmlFor="pp-ctor-ti">Título en inglés</label>
                <input id="pp-ctor-ti" lang="en" value={tEn ?? sug.en} onChange={(e) => setTEn(e.target.value)} />
              </div>
            </div>
          </div>
          {dx.errores.length > 0 && (
            <ul className="pp-warn-lista" role="alert">
              {dx.errores.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {dx.avisos.length > 0 && (
            <ul className="pp-warn-lista" role="status">
              {dx.avisos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {dx.ok && <VistaPrevia spec={spec} libro={libro} unidad={unidad} uid="ctor" />}
        </>
      )}
      {error != null && <ErrorAviso error={error} titulo="No se pudo guardar el gráfico" />}
      <div className="pp-acciones">
        <button type="button" className="pp-btn pp-btn--pilo" disabled={!puedeGuardar} onClick={() => void guardar()} title={!dx.ok ? "Corrige lo que se indica arriba" : sinTitulo ? "Falta el título en español" : undefined}>
          {guardando ? "Guardando…" : "Crear gráfico"}
        </button>
        <button type="button" className="pp-btn" onClick={onCerrar}>
          Cancelar
        </button>
        {sinTitulo && elegidas.length > 0 && <small className="pp-warn">Falta el título en español.</small>}
      </div>
    </div>
  );
}

/** Gráficos que la pantalla arma sola con el libro (sin Pilo). */
export function Sugerencias({
  sugerencias,
  libro,
  unidad,
  onAgregar,
}: {
  sugerencias: Sugerencia[];
  libro: Map<string, CifraPub>;
  unidad: UnidadPP | undefined;
  onAgregar: (s: Sugerencia) => Promise<void>;
}) {
  const [ver, setVer] = useState(4);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, unknown>>({});
  const [hechas, setHechas] = useState<string[]>([]);
  const lista = sugerencias.filter((s) => !hechas.includes(s.id));
  if (lista.length === 0) return <p className="pp-nota pp-pad">No hay más sugerencias: ya hay un gráfico para cada combinación evidente del libro.</p>;
  return (
    <div className="pp-pad pp-stack">
      <p className="pp-nota">Armadas por la pantalla agrupando las cifras por medida, unidad y año. Funcionan aunque Pilo no esté disponible.</p>
      <div className="pp-sugs">
        {lista.slice(0, ver).map((s) => (
          <article className="pp-sug" key={s.id}>
            <header>
              <span className="pp-pill">{NOMBRE_TIPO[s.tipo]}</span>
              <strong>{s.spec.title_es}</strong>
            </header>
            <p className="pp-nota">{s.motivo}</p>
            <VistaPrevia spec={s.spec} libro={libro} unidad={unidad} uid={`sug-${s.id.replace(/\W/g, "")}`} />
            <small className="pp-nota">{sinAnio(s.cifras[0].label)}{s.cifras.length > 1 ? ` y ${s.cifras.length - 1} más` : ""}</small>
            {errores[s.id] != null && <ErrorAviso error={errores[s.id]} titulo="No se pudo agregar" />}
            <button
              type="button"
              className="pp-btn pp-btn--sm"
              disabled={ocupada !== null}
              onClick={async () => {
                setOcupada(s.id);
                setErrores((e) => ({ ...e, [s.id]: null }));
                try {
                  await onAgregar(s);
                  setHechas((h) => [...h, s.id]);
                } catch (e) {
                  setErrores((x) => ({ ...x, [s.id]: e }));
                } finally {
                  setOcupada(null);
                }
              }}
            >
              {ocupada === s.id ? "Agregando…" : "Agregar al informe"}
            </button>
          </article>
        ))}
      </div>
      {ver < lista.length && (
        <button type="button" className="pp-btn" onClick={() => setVer((n) => n + 4)}>
          Ver más sugerencias ({lista.length - ver})
        </button>
      )}
    </div>
  );
}
