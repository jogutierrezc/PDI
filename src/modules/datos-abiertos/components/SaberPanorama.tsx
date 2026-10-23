/* =============================================================================
   Resultados Saber PRO UDES frente al país.

   Dos bandas sobre el mismo eje de puntos:
   · arriba, el promedio nacional de las seis competencias en el año elegido;
   · abajo, la UDES: por campus en la competencia activa, o las seis
     competencias de una sola sede. Una barra va de la marca del país al punto
     de la UDES; su tono sigue la escala divergente y lleva siempre la cifra
     con signo y un triángulo.

   El conmutador «Un año / Evolución» cambia las bandas por seis pequeños
   múltiplos de la brecha (SaberPanoramaEvolucion). Un vacío nunca es cero:
   se dibuja rayado y dice «Sin dato». Con menos de 10 evaluados el punto va
   hueco y sin barra; con menos de 30, la fila se atenúa.

   Movimiento solo con CSS: una secuencia al entrar en pantalla y 260 ms al
   cambiar de año o de campus. Con movimiento reducido se ve el estado final.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { SABER_COMPETENCIES, SABER_FEW_LEVELS, SABER_FEW_MEAN, saberPanorama } from "../data/saber-pro";
import type { SaberCompetency, SaberFilter, SaberPanoPoint, SaberPanoRow, SaberPanoScope, SaberProData } from "../data/saber-pro";
import { useInView, usePrefersReducedMotion } from "./motion";
import { SplitFlap } from "./SplitFlap";
import {
  PanoGlyph,
  SaberPanoramaEvolucion,
  SaberPanoramaEvolucionTable,
  panoDir,
  panoEvolutionSentence,
  panoInteger,
  panoSigned,
  panoTone,
  panoWords,
} from "./SaberPanoramaEvolucion";
import "./saber-panorama.css";

const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const labelOf = (key: SaberCompetency) => SABER_COMPETENCIES.find((c) => c.key === key)!;

/** Flechas dentro de un grupo de opciones: mueve la selección como un radiogroup. */
function arrows(event: KeyboardEvent<HTMLElement>, count: number, current: number, pick: (index: number) => void) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = (current + step + count) % count;
  pick(next);
  const items = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  items[next]?.focus();
}

interface PanoramaProps {
  data: SaberProData;
  filter: SaberFilter;
  competency: SaberCompetency;
  year: number;
  evolution: boolean;
  /** Clave del ámbito resaltado en la evolución ("udes" o un campus). */
  highlight: string;
  onYear: (year: number) => void;
  onEvolution: (on: boolean) => void;
  onHighlight: (key: string) => void;
  onCompetency: (competency: SaberCompetency) => void;
  /** Sede elegida en el filtro; vacío para todos los campus. */
  onCampus: (campus: string) => void;
}

export function SaberPanorama({ data, filter, competency, year, evolution, highlight, onYear, onEvolution, onHighlight, onCompetency, onCampus }: PanoramaProps) {
  const pano = useMemo(
    () => saberPanorama(data, 0, filter),
    // El filtro se reconstruye en cada render; sus tres cadenas son la identidad real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filter.campus, filter.faculty, filter.program],
  );
  const board = useRef<HTMLDivElement>(null);
  const seen = useInView(board);
  const reduced = usePrefersReducedMotion();
  const [read, setRead] = useState<string | null>(null);

  const single = Boolean(filter.campus);
  const focusKey = pano.scopes.some((s) => s.key === highlight) ? highlight : pano.scopes[0]?.key ?? "udes";
  const at = (row: SaberPanoRow): SaberPanoPoint => row.serie.find((p) => p.year === year) ?? row.point;
  const nationalAt = (key: SaberCompetency) => pano.rows.find((r) => r.competency === key)?.serie.find((p) => p.year === year)?.national ?? null;

  /** Un año en que los campus no traen filas pero la UDES sí: solo el promedio oficial. */
  const partial = (y: number) => {
    const sedes = pano.rows.filter((r) => r.scope.kind === "sede");
    const udes = pano.rows.filter((r) => r.scope.kind === "udes");
    return udes.length > 0 && sedes.every((r) => r.serie.find((p) => p.year === y)?.value == null);
  };

  if (pano.rows.length === 0) return <p className="od-saber__empty">Sin resultados para comparar con el país en este corte.</p>;

  const bottom: { row: SaberPanoRow; label: string; sub: string; code?: string }[] = single
    ? SABER_COMPETENCIES.flatMap((c) => {
        const row = pano.rows.find((r) => r.competency === c.key);
        return row ? [{ row, label: c.label, sub: "", code: c.code }] : [];
      })
    : pano.rows.filter((r) => r.competency === competency).map((row) => ({ row, label: row.scope.label, sub: "" }));

  const info = labelOf(competency);
  const campusName = filter.campus || "Bucaramanga";
  const armed = seen || reduced;

  const modeButtons = (
    <div className="od-pano__seg" role="radiogroup" aria-label="Qué campus mostrar" onKeyDown={(e) => arrows(e, 2, single ? 1 : 0, (i) => onCampus(i === 0 ? "" : campusName))}>
      <button type="button" role="radio" aria-checked={!single} tabIndex={!single ? 0 : -1} onClick={() => onCampus("")}>
        Por campus
      </button>
      <button type="button" role="radio" aria-checked={single} tabIndex={single ? 0 : -1} onClick={() => onCampus(campusName)}>
        Solo {campusName}
      </button>
    </div>
  );

  const sentenceOf = (row: SaberPanoRow, label: string) => {
    const p = at(row);
    const name = `${label}, ${labelOf(row.competency).label}`;
    if (p.value === null) return `${name}, ${year}: sin dato.`;
    let text = `${name}, ${year}: ${decimal.format(p.value)} puntos`;
    if (p.national === null) return `${text}. Sin promedio nacional ese año.`;
    text += `; el país, ${panoInteger.format(p.national)}. `;
    text += p.kind === "few" ? `Con menos de ${SABER_FEW_MEAN} evaluados no se compara.` : `La UDES queda ${panoWords(p.gap!)}.`;
    if (p.official) text += " Promedio oficial del ICFES.";
    else if (p.evaluated !== null) text += ` ${panoInteger.format(p.evaluated)} evaluados${p.low ? (p.kind === "few" ? `, menos de ${SABER_FEW_MEAN}.` : ", pocos para comparar.") : "."}`;
    return text;
  };

  const readout =
    read ??
    (evolution
      ? panoEvolutionSentence(pano.rows.find((r) => r.scope.key === focusKey && r.competency === competency) ?? pano.rows[0])
      : bottom[0]
        ? sentenceOf(bottom[0].row, bottom[0].label)
        : "");

  return (
    <div className="od-pano" ref={board} data-armed={armed || undefined} data-still={reduced || undefined}>
      <div className="od-pano__bar" data-export-ignore>
        {!evolution ? (
          <div className="od-pano__ctl">
            <span className="od-pano__name" id="od-pano-year">
              Año
            </span>
            <div
              className="od-pano__years"
              role="radiogroup"
              aria-labelledby="od-pano-year"
              onKeyDown={(e) => arrows(e, pano.years.length, pano.years.indexOf(year), (i) => onYear(pano.years[i]))}
            >
              {pano.years.map((y) => (
                <button
                  key={y}
                  type="button"
                  role="radio"
                  className="od-pano__chip"
                  aria-checked={y === year}
                  tabIndex={y === year ? 0 : -1}
                  data-partial={partial(y) || undefined}
                  title={partial(y) ? "Solo el promedio oficial de la UDES y el nacional" : undefined}
                  aria-label={partial(y) ? `${y}, solo promedio oficial` : String(y)}
                  onClick={() => onYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span className="od-pano__name">
            Años {pano.years[0]} a {pano.years[pano.years.length - 1]}
          </span>
        )}
        <div className="od-pano__seg" role="radiogroup" aria-label="Qué mostrar" onKeyDown={(e) => arrows(e, 2, evolution ? 1 : 0, (i) => onEvolution(i === 1))}>
          <button type="button" role="radio" aria-checked={!evolution} tabIndex={!evolution ? 0 : -1} onClick={() => onEvolution(false)}>
            Un año
          </button>
          <button type="button" role="radio" aria-checked={evolution} tabIndex={evolution ? 0 : -1} onClick={() => onEvolution(true)}>
            Evolución
          </button>
        </div>
      </div>

      {!evolution ? (
        <>
          <section className="od-pano__band" aria-label="Resultados nacionales">
            <header className="od-pano__head">
              <div>
                <h3>Resultados nacionales</h3>
                <p>Promedio nacional del ICFES, {year}, en las seis competencias.</p>
              </div>
            </header>
            <Axis domain={pano.domain.points} />
            <ol className="od-pano__rows" aria-label="Promedio nacional por competencia">
              {pano.national.map(({ competency: key }, i) => {
                const value = nationalAt(key);
                const c = labelOf(key);
                const pos = value === null ? 0 : place(value, pano.domain.points);
                return (
                  <li
                    key={key}
                    className="od-pano__row"
                    data-active={key === competency || undefined}
                    style={{ "--delay": `${60 + i * 45}ms` } as CSSProperties}
                    onPointerEnter={() => setRead(`${c.label}, ${year}: ${value === null ? "el ICFES no publicó promedio nacional ese año." : `el promedio nacional fue ${panoInteger.format(value)} puntos.`}`)}
                    onPointerLeave={() => setRead(null)}
                  >
                    <button type="button" className="od-pano__lab" aria-pressed={key === competency} aria-label={`${c.label}, elegir competencia`} onClick={() => onCompetency(key)}>
                      <span className="od-pano__code" aria-hidden="true">
                        {c.code}
                      </span>
                      <span>{c.label}</span>
                    </button>
                    <div className="od-pano__trk" data-empty={value === null || undefined}>
                      {value !== null ? (
                        <>
                          <i className="od-pano__stem" style={{ width: `${pos}%` }} />
                          <i className="od-pano__sq" style={{ left: `${pos}%` }} />
                        </>
                      ) : (
                        <span className="od-pano__none">
                          <span>Sin promedio nacional</span>
                        </span>
                      )}
                    </div>
                    <div className="od-pano__val">
                      <SplitFlap value={value === null ? "—" : panoInteger.format(Math.round(value))} size="sm" numeric delay={i * 40} label={value === null ? "Sin promedio nacional" : `${panoInteger.format(value)} puntos`} />
                      <span className="od-pano__sub">{value === null ? "" : "promedio del país"}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="od-pano__band" aria-label="Cifras UDES">
            <header className="od-pano__head">
              <div>
                <h3>Cifras UDES</h3>
                <p>
                  {single
                    ? `Solo ${campusName}, las seis competencias. Cada línea punteada es el país en esa competencia.`
                    : `Por campus, en ${info.label.toLowerCase()}. La línea punteada es el promedio del país.`}
                </p>
              </div>
              {modeButtons}
            </header>
            <Axis domain={pano.domain.points} />
            <ol className="od-pano__rows" key={single ? "single" : "campus"} aria-label={single ? `Cifras de ${campusName} por competencia` : "Cifras UDES por campus"}>
              {bottom.map(({ row, label, code }, i) => (
                <BandRow
                  key={row.key}
                  row={row}
                  point={at(row)}
                  label={label}
                  code={code}
                  index={i}
                  domain={pano.domain.points}
                  year={year}
                  partial={partial(year)}
                  active={single && row.competency === competency}
                  sentence={sentenceOf(row, label)}
                  onRead={setRead}
                />
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section className="od-pano__band" aria-label="Evolución frente al país">
          <header className="od-pano__head">
            <div>
              <h3>Evolución frente al país</h3>
              <p>
                Brecha por año: promedio de {pano.scopes.find((s) => s.key === focusKey)?.label ?? "la UDES"} menos promedio nacional, en puntos. Sobre la línea del cero, la UDES supera al país; un
                año sin dato interrumpe la línea.
              </p>
            </div>
            {modeButtons}
          </header>
          {pano.scopes.length > 1 && (
            <div className="od-pano__ctl od-pano__ctl--hl" data-export-ignore>
              <span className="od-pano__name" id="od-pano-hl">
                Resaltar
              </span>
              <div
                className="od-pano__years"
                role="radiogroup"
                aria-labelledby="od-pano-hl"
                onKeyDown={(e) => arrows(e, pano.scopes.length, pano.scopes.findIndex((s) => s.key === focusKey), (i) => onHighlight(pano.scopes[i].key))}
              >
                {pano.scopes.map((s: SaberPanoScope) => (
                  <button key={s.key} type="button" role="radio" className="od-pano__chip" aria-checked={s.key === focusKey} tabIndex={s.key === focusKey ? 0 : -1} onClick={() => onHighlight(s.key)}>
                    {s.key === "udes" ? "Toda la UDES" : s.key}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SaberPanoramaEvolucion key={`${focusKey}|${single}`} pano={pano} focusKey={focusKey} competency={competency} onCompetency={onCompetency} onRead={setRead} />
        </section>
      )}

      <p className="od-pano__read" aria-live="polite">
        {readout}
      </p>

      {!evolution ? (
        <ul className="od-pano__legend" aria-label="Cómo leer el gráfico">
          <li>
            <i className="k-sq" /> Promedio nacional
          </li>
          <li>
            <i className="k-dot" /> UDES
          </li>
          <li>
            <i className="k-ghost" /> El país, como referencia
          </li>
          {(["neg-2", "neg-1", "mid", "pos-1", "pos-2"] as const).map((tone, i) => (
            <li key={tone}>
              <i className={tone === "mid" ? "k-mid" : undefined} style={{ background: `var(--od-div-${tone})` }} />
              {["10 o más bajo", "3 a 9 bajo", "como el país", "3 a 9 sobre", "10 o más sobre"][i]}
            </li>
          ))}
          <li>
            <i className="k-few" /> menos de {SABER_FEW_MEAN} evaluados
          </li>
          <li>
            <i className="k-hatch" /> sin dato
          </li>
          <li>
            <i className="k-yr" /> año solo con promedio oficial
          </li>
        </ul>
      ) : (
        <ul className="od-pano__legend" aria-label="Cómo leer la evolución">
          <li>
            <i className="k-line" /> UDES, o el campus resaltado
          </li>
          <li>
            <i className="k-faint" /> los demás campus
          </li>
          <li>
            <i className="k-zero" /> promedio nacional (cero)
          </li>
          <li>
            <i style={{ background: "var(--od-div-pos-1)" }} /> sobre el país
          </li>
          <li>
            <i style={{ background: "var(--od-div-neg-1)" }} /> bajo el país
          </li>
          <li>
            <i className="k-hatch" /> año sin dato: la línea se interrumpe
          </li>
          <li>
            <i className="k-few" /> menos de {SABER_FEW_LEVELS} evaluados
          </li>
        </ul>
      )}

      <p className="od-pano__foot">
        {!evolution
          ? `El eje va de ${pano.domain.points[0]} a ${pano.domain.points[1]} puntos y no parte de cero: así se ven diferencias de pocos puntos. Todas las competencias usan los mismos puntos del ICFES. El promedio de toda la UDES es el oficial del ICFES; el de un campus es el promedio de sus evaluados.`
          : "Las seis filas usan el mismo eje vertical y los mismos años. La brecha es el promedio de la UDES menos el promedio nacional del mismo año; no se proyecta ni se une a través de un año sin dato. Mejorar es subir la brecha, no el puntaje bruto. Una serie con menos de 30 evaluados que se sale del eje se corta en el borde."}
      </p>

      <details className="od-pano__table">
        <summary>Ver como tabla</summary>
        <div className="od-pano__tblwrap">
          {evolution ? (
            <SaberPanoramaEvolucionTable pano={pano} focusKey={focusKey} />
          ) : (
            <table>
              <caption>Promedio por competencia y ámbito, {year}, en puntos del ICFES</caption>
              <thead>
                <tr>
                  <th scope="col">Ámbito</th>
                  <th scope="col">Competencia</th>
                  <th scope="col" className="num">
                    Promedio
                  </th>
                  <th scope="col" className="num">
                    País
                  </th>
                  <th scope="col" className="num">
                    Diferencia
                  </th>
                  <th scope="col" className="num">
                    Evaluados
                  </th>
                  <th scope="col">Nota</th>
                </tr>
              </thead>
              <tbody>
                {pano.national.map(({ competency: key }) => {
                  const value = nationalAt(key);
                  return (
                    <tr key={`n-${key}`}>
                      <th scope="row">País</th>
                      <td>{labelOf(key).label}</td>
                      <td className="num">{value === null ? "Sin dato" : panoInteger.format(value)}</td>
                      <td className="num" />
                      <td className="num" />
                      <td className="num" />
                      <td>{value === null ? "Sin promedio nacional ese año" : ""}</td>
                    </tr>
                  );
                })}
                {bottom.map(({ row, label }) => {
                  const p = at(row);
                  const note =
                    p.value === null
                      ? noteFor(row, year, partial(year))
                      : p.official
                        ? "Oficial ICFES"
                        : p.kind === "few"
                          ? `Menos de ${SABER_FEW_MEAN} evaluados, sin comparar`
                          : p.low
                            ? "Pocos para comparar"
                            : "";
                  return (
                    <tr key={row.key}>
                      <th scope="row">{single ? campusName : label}</th>
                      <td>{labelOf(row.competency).label}</td>
                      <td className="num">{p.value === null ? "Sin dato" : decimal.format(p.value)}</td>
                      <td className="num">{p.national === null ? "" : panoInteger.format(p.national)}</td>
                      <td className="num">{p.gap === null ? "" : p.kind === "few" ? `(${panoSigned(p.gap)})` : panoSigned(p.gap)}</td>
                      <td className="num">{p.evaluated === null ? "" : panoInteger.format(p.evaluated)}</td>
                      <td>{note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}

/* --- Piezas -------------------------------------------------------------------------- */

const place = (value: number, [lo, hi]: [number, number]) => Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));

function noteFor(row: SaberPanoRow, year: number, partial: boolean) {
  return row.scope.kind === "sede" && partial ? `El ICFES publicó ${year} solo para toda la UDES` : "Sin evaluados";
}

function Axis({ domain }: { domain: [number, number] }) {
  const ticks: number[] = [];
  for (let v = domain[0]; v <= domain[1]; v += 10) ticks.push(v);
  return (
    <div className="od-pano__axis" aria-hidden="true">
      <span>Puntos</span>
      <div className="od-pano__ticks">
        {ticks.map((v) => (
          <span key={v} style={{ left: `${place(v, domain)}%` }}>
            {v}
          </span>
        ))}
      </div>
      <span />
    </div>
  );
}

function BandRow({
  row,
  point,
  label,
  code,
  index,
  domain,
  year,
  partial,
  active,
  sentence,
  onRead,
}: {
  row: SaberPanoRow;
  point: SaberPanoPoint;
  label: string;
  code?: string;
  index: number;
  domain: [number, number];
  year: number;
  partial: boolean;
  active: boolean;
  sentence: string;
  onRead: (text: string | null) => void;
}) {
  const has = point.value !== null;
  const showBar = has && point.national !== null && point.kind === "ok";
  const valuePos = has ? place(point.value!, domain) : 0;
  const natPos = point.national !== null ? place(point.national, domain) : null;
  const tone = point.gap !== null ? panoTone(point.gap) : "mid";
  const dir = point.gap !== null ? panoDir(point.gap) : "same";
  const few = point.kind === "few";
  const note = has ? "" : noteFor(row, year, partial);
  const caption = point.official ? "Promedio oficial del ICFES" : point.evaluated !== null ? `${panoInteger.format(point.evaluated)} evaluados` : "";

  return (
    <li
      className="od-pano__row"
      data-kind={point.kind}
      data-low={(point.low && has) || undefined}
      data-active={active || undefined}
      style={{ "--delay": `${420 + index * 45}ms` } as CSSProperties}
      tabIndex={0}
      role="group"
      aria-label={sentence}
      onPointerEnter={() => onRead(sentence)}
      onPointerLeave={() => onRead(null)}
      onFocus={() => onRead(sentence)}
      onBlur={() => onRead(null)}
    >
      <div className={`od-pano__lab od-pano__lab--static${code ? "" : " od-pano__lab--campus"}`}>
        {code && (
          <span className="od-pano__code" aria-hidden="true">
            {code}
          </span>
        )}
        <span>
          {label}
          {!code && caption && <small>{caption}</small>}
        </span>
      </div>
      <div className="od-pano__trk" data-empty={!has || undefined}>
        {natPos !== null && <i className="od-pano__ghost" style={{ left: `${natPos}%` }} />}
        {showBar && natPos !== null && (
          <i
            className="od-pano__bar-fill"
            style={
              {
                left: `${Math.min(valuePos, natPos)}%`,
                width: `max(2px, ${Math.abs(valuePos - natPos)}%)`,
                background: `var(--od-div-${tone})`,
                transformOrigin: valuePos >= natPos ? "left center" : "right center",
                outline: tone === "mid" ? "1px solid var(--od-board-line-strong)" : undefined,
              } as CSSProperties
            }
          />
        )}
        {has && <i className="od-pano__dot" data-few={few || undefined} style={{ left: `${valuePos}%` }} />}
        {!has && (
          <span className="od-pano__none">
            <span>{note}</span>
          </span>
        )}
      </div>
      <div className="od-pano__val">
        <SplitFlap value={has ? panoInteger.format(Math.round(point.value!)) : "—"} size="sm" numeric delay={index * 40} label={has ? `${decimal.format(point.value!)} puntos` : "Sin dato"} />
        <span className="od-pano__sub">
          {!has ? (
            "sin dato"
          ) : point.gap !== null ? (
            <span className="od-pano__gap" data-tone={dir} data-few={few || undefined}>
              <PanoGlyph dir={dir} />
              {few ? `(${panoSigned(point.gap)})` : panoSigned(point.gap)} puntos
            </span>
          ) : (
            <span className="od-pano__gap" data-tone="same" data-few>
              sin país
            </span>
          )}
          {has && (caption || point.low) && (
            <span>
              {caption}
              {point.low ? `${caption ? " · " : ""}${few ? `menos de ${SABER_FEW_MEAN}` : "pocos para comparar"}` : ""}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
