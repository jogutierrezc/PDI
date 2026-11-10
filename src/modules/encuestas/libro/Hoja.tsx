/* =============================================================================
   Libro de la Rendición de Cuentas · una hoja.

   Cada hoja es un cuadro que escala por contenedor (1u = 1 % del ancho de la
   página), así la misma plantilla sirve en Carta y en A4, en pantalla y al
   imprimir. El sangrado se añade solo al imprimir: la hoja (.lb-sheet) crece 3 mm
   por lado y la página (.lb-page) queda en el centro, con el fondo y la imagen
   de portada llegando hasta el borde.

   Las listas largas (retos, dependencias, resumen por dependencia) llegan aquí
   ya repartidas por modelo.paginasDe: cada página recibe su rango (desde, hasta).
   Las alturas de fila viven en libro.css y en modelo.MEDIDAS; si cambia una,
   cambia la otra. Los textos largos se recortan con elipsis (recortar) y se
   sujetan con line-clamp para que ninguna fila crezca.
   ========================================================================== */

import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { Anillo, Barra, Leyenda, Logro, Puntos, Reto, estilo } from "./graficos";
import {
  CLAVES_TEXTO, FICHAS_RETOS, capacidades, ODS, TIPOS_LIBRO, cortoDe, dependenciasResumen, fmtDineroNum, fmtN, nombrePagina, odsPrincipales, principal, recortar, resumenDe, textoDe, topLogros, unidadDinero, valorDe,
} from "./modelo";
import type { Calculo, Cif, ConfigLibro, Fila, Pag } from "./modelo";

export const LOGO_BLANCO = "/logo-udes-blanco.png";
export const LOGO_COLOR = "/logo-udes.svg";

export interface CtxHoja {
  calc: Calculo;
  cfg: ConfigLibro;
  paginas: Pag[];
  urls: { portada: string | null; contra: string | null };
  onTexto: (clave: string, texto: string) => void;
  editable: boolean;
  guias: boolean;
}
export const CtxLibro = createContext<CtxHoja | null>(null);
const useCtx = () => {
  const c = useContext(CtxLibro);
  if (!c) throw new Error("Hoja fuera del libro");
  return c;
};

/** El texto corto de la página: editable sobre la hoja, y lo que edita una persona no lo pisa Pilo. */
function Nar({ k }: { k: Pag["id"] }) {
  const { calc, cfg, onTexto, editable } = useCtx();
  const texto = textoDe(k, calc, cfg);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== texto) el.textContent = texto;
  }, [texto]);
  if (!(CLAVES_TEXTO as readonly string[]).includes(k)) return null;
  return (
    <div
      ref={ref}
      className="lb-nar"
      data-k={k}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={`Texto de la página ${nombrePagina(k)}`}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      onBlur={(e) => {
        const t = (e.currentTarget.innerText || "").replace(/\s+/g, " ").trim();
        if (t && t !== texto) onTexto(k, t);
      }}
    />
  );
}

const Encabezado = () => {
  const { cfg } = useCtx();
  return cfg.folios ? (
    <div className="lb-hd">
      <img className="lb-hd__logo" src={LOGO_COLOR} alt="Universidad de Santander, UDES" />
      <span>{cfg.portada.fecha}</span>
    </div>
  ) : (
    <div className="lb-hd vacio" aria-hidden="true" />
  );
};
const Folio = ({ i }: { i: number }) => {
  const { cfg } = useCtx();
  return cfg.folios ? (
    <div className="lb-folio">
      <span>{cfg.portada.fecha}</span>
      <span className="lb-num">{i + 1}</span>
    </div>
  ) : null;
};
/** Título de una línea. En las páginas de continuación la segunda parte dice «continuación». */
const Titulo = ({ a, b, reto, cont }: { a: string; b: string; reto?: boolean; cont?: boolean }) => (
  <h2 className="lb-ttl">
    {a} <i style={reto ? { color: "var(--p-reto)" } : undefined}>{cont ? "continuación" : b}</i>
  </h2>
);
const Num = ({ n, fmt = "n", cls = "", children }: { n: number; fmt?: "n" | "pct" | "din"; cls?: string; children: string }) => (
  <div className={`lb-num ${cls}`} data-n={n} data-fmt={fmt}>
    {children}
  </div>
);
/** Sello discreto de Pilo con su cara oficial (public/pilo-moods). «redactó» = texto; «propuesta» = recomendación. */
const SelloPilo = ({ tipo }: { tipo: "texto" | "propuesta" | "ods" }) => (
  <span className="lb-sello">
    <img src={tipo === "propuesta" ? "/pilo-moods/idea-160.webp" : "/pilo-moods/bien-160.webp"} alt="" width="40" height="40" />
    <span>{tipo === "propuesta" ? "Propuesta de Pilo" : tipo === "ods" ? "Clasificación de Pilo" : "Redactado por Pilo"}</span>
  </span>
);

/** El texto de la página y, si lo redactó Pilo (y una persona no lo editó), su sello al lado. */
function Texto({ k }: { k: Pag["id"] }) {
  const { cfg } = useCtx();
  const t = cfg.textos[k];
  const pilo = Boolean(t && !t.editado);
  return (
    <div className={`lb-narw${pilo ? " con-sello" : ""}`}>
      <Nar k={k} />
      {pilo && <SelloPilo tipo="texto" />}
    </div>
  );
}

/* ---------- portada y contraportada ---------- */

/**
 * Mosaico de altura fija: una columna por dependencia y `filas` cuadrados por columna.
 * Cada cuadrado vale k cifras (k sube cuando hay muchas), así nunca crece ni tapa el título.
 */
function Mosaico({ filas, alto }: { filas: number; alto: number }) {
  const { calc } = useCtx();
  const deps = calc.deps.length ? calc.deps : Array.from({ length: 10 }, (_, i) => `x${i}`);
  const cuenta = deps.map((d) => {
    const fs = calc.r.filter((a) => a.dep === d);
    return { l: fs.filter((a) => a.t === "L").reduce((s, a) => s + a.c.length, 0), r: fs.filter((a) => a.t === "R").reduce((s, a) => s + a.c.length, 0) };
  });
  const k = Math.max(1, Math.ceil(Math.max(1, ...cuenta.map((c) => c.l + c.r)) / filas));
  return (
    <div className="lb-mosaico" aria-hidden="true" style={estilo({ "--n": deps.length, "--filas": filas, height: `calc(var(--u) * ${alto})` })}>
        {cuenta.map((c, n) => {
          let l = c.l ? Math.max(1, Math.round(c.l / k)) : 0;
          let r = c.r ? Math.max(1, Math.round(c.r / k)) : 0;
          while (l + r > filas) (l > r ? l-- : r--);
          return (
            <div className="lb-col" key={n}>
              {Array.from({ length: filas }, (_, i) => {
                const desdeAbajo = filas - 1 - i;
                const cl = desdeAbajo < l ? " l" : desdeAbajo < l + r ? " r" : "";
                return <i key={i} className={`lb-sq${cl}`} />;
              })}
            </div>
          );
        })}
    </div>
  );
}
function kMosaico(calc: Calculo, filas: number) {
  const m = Math.max(1, ...calc.deps.map((d) => calc.r.filter((a) => a.dep === d).reduce((s, a) => s + a.c.length, 0)));
  return Math.max(1, Math.ceil(m / filas));
}

function Portada() {
  const { calc, cfg } = useCtx();
  const p = cfg.portada;
  const palabras = p.titulo.trim().split(/\s+/).filter(Boolean);
  const ultima = palabras.pop() ?? "";
  const larga = Math.max(ultima.length, ...palabras.map((w) => w.length), 1);
  /** El título mayor cabe en el ancho útil (86u) aunque tenga una palabra larga. */
  const tam = Math.min(p.composicion === 2 ? 9.4 : 11.5, 80 / (larga * 0.62));
  const cabeza = (
    <h2 style={{ fontSize: `calc(var(--u) * ${tam.toFixed(2)})` }}>
      {palabras.length > 0 && <span className="lb-l1">{palabras.join(" ")}</span>}
      <em className="lb-l2">{ultima}</em>
    </h2>
  );
  const marca = <img className="lb-marca" src={p.composicion === 3 ? LOGO_COLOR : LOGO_BLANCO} alt="Universidad de Santander, UDES" />;
  const pie = (
    <div className="lb-tt">
      {cabeza}
      <div className="lb-s1">{recortar(p.subtitulo, 70)}</div>
      <div className="lb-s2">{recortar(p.fecha, 70)}</div>
    </div>
  );
  if (p.composicion === 3) {
    return (
      <div className="lb-cv v3">
        <div className="lb-reticula" />
        {marca}
        {pie}
        <div className="lb-tick">
          {[
            ["aportes", calc.r.length, fmtN(calc.r.length)],
            ["dependencias", calc.nd, fmtN(calc.nd)],
            ["estudiantes", calc.est, fmtN(calc.est)],
            ["cifras", calc.nc, fmtN(calc.nc)],
          ].map(([k, n, t]) => (
            <div key={String(k)}>
              <Num n={Number(n)}>{String(t)}</Num>
              <small>{k}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const k = kMosaico(calc, 5);
  return (
    <div className={`lb-cv${p.composicion === 2 ? " v2" : ""}`}>
      {marca}
      {pie}
      {p.composicion === 2 ? (
        <div className="lb-big">
          <Anillo logros={calc.L.length} retos={calc.R.length} />
          <div className="lb-c">
            <Num n={calc.r.length}>{fmtN(calc.r.length)}</Num>
            <small>aportes</small>
          </div>
        </div>
      ) : (
        <>
          <div className="lb-mosaico-caja">
            <Mosaico filas={5} alto={34} />
          </div>
          <div className="lb-cap">
            <span>
              <b style={{ background: "var(--p-logro2)" }} />
              Logro
            </span>
            <span>
              <b style={{ background: "var(--p-reto)" }} />
              Reto
            </span>
            <span>{k === 1 ? "Cada cuadrado es una cifra reportada" : `Cada cuadrado son ${k} cifras reportadas`}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Contra() {
  const { cfg } = useCtx();
  return (
    <div className="lb-bk">
      <div className="lb-mosaico-caja arriba">
        <Mosaico filas={2} alto={11} />
      </div>
      <div className="lb-tt">
        <h2>
          <span className="lb-l1">Seguimos</span>
          <em className="lb-l2">construyendo</em>
        </h2>
        <Texto k="contra" />
      </div>
      <div className="lb-url">
        <img className="lb-marca grande" src={LOGO_BLANCO} alt="Universidad de Santander, UDES" />
        planeacion.udes.edu.co
        <small>{recortar(cfg.portada.fecha, 70).toUpperCase()}</small>
      </div>
    </div>
  );
}

/* ---------- páginas de contenido ---------- */

function Presentacion({ i }: { i: number }) {
  const { calc, paginas } = useCtx();
  const indice: { id: Pag["id"]; n: number; hasta: number }[] = [];
  paginas.forEach((p, n) => {
    if (["portada", "contra", "notas", "presentacion"].includes(p.id)) return;
    if (p.parte === 1) indice.push({ id: p.id, n: n + 1, hasta: n + p.partes });
  });
  const top = calc.deps.slice().sort((a, b) => calc.byDep[b].L + calc.byDep[b].R - (calc.byDep[a].L + calc.byDep[a].R) || a.localeCompare(b, "es")).slice(0, 6);
  const mTop = Math.max(1, ...top.map((d) => calc.byDep[d].L + calc.byDep[d].R));
  const T: [string, number, string][] = [
    ["aportes", calc.r.length, fmtN(calc.r.length)],
    ["dependencias", calc.nd, fmtN(calc.nd)],
    ["estudiantes alcanzados", calc.est, fmtN(calc.est)],
    ["programas y proyectos", calc.prog, fmtN(calc.prog)],
  ];
  return (
    <>
      <Encabezado />
      <Titulo a="Lo que" b="contamos" />
      <Texto k="presentacion" />
      <div className="lb-tiras">
        {T.map(([k, n, t]) => (
          <div key={k}>
            <Num n={n}>{t}</Num>
            <small>{k}</small>
          </div>
        ))}
      </div>
      <div className="lb-pres">
        <div className="lb-anillo-caja">
          <Anillo logros={calc.L.length} retos={calc.R.length} />
          <div className="lb-c">
            <Num n={calc.L.length}>{fmtN(calc.L.length)}</Num>
            <small>logros</small>
          </div>
        </div>
        <div className="lb-resta duo">
          <div>
            <Logro />
            <Num n={calc.L.length}>{fmtN(calc.L.length)}</Num>
            <small>logros</small>
          </div>
          <div>
            <Reto />
            <Num n={calc.R.length}>{fmtN(calc.R.length)}</Num>
            <small>retos</small>
          </div>
        </div>
        <div className="lb-mb">
          <div className="lb-kk">Dependencias con más aportes</div>
          {top.map((d) => {
            const b = calc.byDep[d];
            return (
              <div key={d} className="lb-mbf">
                <span>{cortoDe(d)}</span>
                <div>
                  <b className="l" style={{ width: `${(b.L / mTop) * 100}%` }} />
                  <b className="r" style={{ width: `${(b.R / mTop) * 100}%` }} />
                </div>
                <em>{b.L + b.R}</em>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="lb-idx">
        {indice.map((x) => (
          <li key={x.id}>
            {nombrePagina(x.id)}
            <span />
            <b className="lb-num">{x.hasta > x.n ? `${x.n} a ${x.hasta}` : x.n}</b>
          </li>
        ))}
      </ul>
      <div className="lb-read">
        <div>
          <Logro />
          <span>
            <b>Logro.</b> Lo que una dependencia consiguió y respalda con cifras.
          </span>
        </div>
        <div>
          <Reto />
          <span>
            <b>Reto.</b> Lo que falta o pide más esfuerzo el próximo año.
          </span>
        </div>
      </div>
      <Folio i={i} />
    </>
  );
}

/* Pictogramas: cada icono vale `cada` unidades (el último puede ir a medias). */
const ICONOS: Record<"persona" | "edificio" | "moneda", JSX.Element> = {
  persona: (
    <>
      <circle cx="5" cy="2.6" r="2.1" />
      <rect x="1.8" y="5.5" width="6.4" height="4.2" rx="2.1" />
    </>
  ),
  edificio: (
    <>
      <rect x="1.6" y="0.8" width="6.8" height="8.8" rx="0.8" />
      <path d="M3.4 3h1M5.6 3h1M3.4 5h1M5.6 5h1M4.3 7.4h1.4v2.2H4.3z" stroke="var(--p-paper)" strokeWidth="0.7" fill="none" />
    </>
  ),
  moneda: (
    <>
      <circle cx="5" cy="5" r="4.4" />
      <circle cx="5" cy="5" r="2.6" fill="none" stroke="var(--p-paper)" strokeWidth="0.7" />
    </>
  ),
};
function Picto({ valor, cada, icono, max = 10 }: { valor: number; cada: number; icono: keyof typeof ICONOS; max?: number }) {
  const exacto = valor / cada;
  const n = Math.min(max, Math.max(1, Math.ceil(exacto)));
  return (
    <div className="lb-picto" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => {
        const resto = exacto - k;
        const med = resto > 0 && resto < 1;
        return (
          <svg key={k} viewBox="0 0 10 10" className={med ? "med" : undefined}>
            {ICONOS[icono]}
          </svg>
        );
      })}
    </div>
  );
}
/** Un tamaño de icono «redondo» para que entren como mucho 10 (una fila). */
function cadaIcono(v: number, max = 10): number {
  const pasos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  return pasos.find((p) => v / p <= max) ?? Math.ceil(v / max);
}

function Cifras({ i }: { i: number }) {
  const { calc } = useCtx();
  const pcts = calc.L.flatMap((a) => a.c.filter((c) => c.tipo === "porcentaje").map((c) => c.v));
  const pctProm = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : 0;
  const cadaE = cadaIcono(calc.est);
  const cadaP = cadaIcono(calc.prog);
  const dinM = calc.din / 1_000_000;
  const cadaD = cadaIcono(dinM);
  const m = Math.max(1, ...calc.deps.map((d) => calc.byDep[d].L + calc.byDep[d].R));
  const ds = calc.deps.slice().sort((a, b) => calc.byDep[b].L + calc.byDep[b].R - (calc.byDep[a].L + calc.byDep[a].R) || a.localeCompare(b, "es")).slice(0, 11);
  const colores = ["var(--p-dark)", "var(--p-logro)", "var(--p-logro2)", "var(--p-reto)", "var(--p-reto2)"];
  const tipos = TIPOS_LIBRO.map((t, n) => ({ t, v: calc.tipo[t.id], c: colores[n] }));
  const mt = Math.max(1, ...tipos.map((x) => x.v));
  return (
    <>
      <Encabezado />
      <Titulo a="El año" b="en cifras" />
      <Texto k="cifras" />
      <div className="lb-top">
        <div className="lb-anillo-caja">
          <Anillo logros={calc.L.length} retos={calc.R.length} />
          <div className="lb-c">
            <Num n={calc.r.length}>{fmtN(calc.r.length)}</Num>
            <small>aportes</small>
          </div>
        </div>
        <div className="lb-resta">
          <div>
            <Logro />
            <Num n={calc.L.length}>{fmtN(calc.L.length)}</Num>
            <small>logros</small>
          </div>
          <div>
            <Reto />
            <Num n={calc.R.length}>{fmtN(calc.R.length)}</Num>
            <small>retos</small>
          </div>
          <div>
            <i className="lb-sin" />
            <Num n={calc.nd}>{fmtN(calc.nd)}</Num>
            <small>dependencias</small>
          </div>
          <div>
            <i className="lb-sin" />
            <Num n={calc.nc}>{fmtN(calc.nc)}</Num>
            <small>cifras</small>
          </div>
        </div>
      </div>
      <div className="lb-picts">
        <div className="lb-pc">
          <span className="lb-k">Estudiantes alcanzados</span>
          <Num n={calc.est}>{fmtN(calc.est)}</Num>
          <Picto valor={calc.est} cada={cadaE} icono="persona" />
          <small>Cada icono son {fmtN(cadaE)} estudiantes</small>
        </div>
        <div className="lb-pc">
          <span className="lb-k">Programas y proyectos</span>
          <Num n={calc.prog}>{fmtN(calc.prog)}</Num>
          <Picto valor={calc.prog} cada={cadaP} icono="edificio" />
          <small>Cada icono {cadaP === 1 ? "es 1 programa" : `son ${fmtN(cadaP)} programas`}</small>
        </div>
        <div className="lb-pc">
          <span className="lb-k">Inversión de los logros</span>
          <div className="lb-din">
            <Num n={calc.din} fmt="din">
              {fmtDineroNum(calc.din)}
            </Num>
            <small>{unidadDinero(calc.din)}</small>
          </div>
          <Picto valor={dinM} cada={cadaD} icono="moneda" />
          <small>Cada icono son ${fmtN(cadaD)} millones de pesos</small>
        </div>
        <div className="lb-pc">
          <span className="lb-k">Cifras en porcentaje</span>
          <Num n={pctProm} fmt="pct">{`${fmtN(Math.round(pctProm))} %`}</Num>
          <Puntos p={pctProm} n={25} />
          <small>Promedio de {pcts.length} cifras de los logros</small>
        </div>
      </div>
      <div className="lb-mini">
        <div>
          <div className="lb-kk">Aportes por dependencia</div>
          <div className="lb-mb">
            {ds.map((d) => {
              const b = calc.byDep[d];
              return (
                <div key={d} className="lb-mbf">
                  <span>{cortoDe(d)}</span>
                  <div>
                    <b className="l" style={{ width: `${(b.L / m) * 100}%` }} />
                    <b className="r" style={{ width: `${(b.R / m) * 100}%` }} />
                  </div>
                  <em>{b.L + b.R}</em>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="lb-kk">Tipo de cifra reportada</div>
          <div className="lb-mb">
            {tipos.map((x) => (
              <div key={x.t.id} className="lb-mbf">
                <span>{x.t.corto}</span>
                <div>
                  <b style={{ width: `${(x.v / mt) * 100}%`, background: x.c }} />
                </div>
                <em>{x.v}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Folio i={i} />
    </>
  );
}

function Destacados({ i }: { i: number }) {
  const { calc, cfg } = useCtx();
  const top = topLogros(calc, capacidades(cfg.formato).destacados);
  const mx = Math.max(1, ...calc.L.map((a) => (principal(a)?.tipo === "estudiantes" ? principal(a)!.v : 0)));
  return (
    <>
      <Encabezado />
      <Titulo a="Logros" b="destacados" />
      <Texto k="destacados" />
      <div className="lb-feats">
        {top.map((a) => {
          const f = principal(a)!;
          const pc = a.c.find((c) => c.tipo === "porcentaje");
          return (
            <div className="lb-feat" key={a.id}>
              <div className="lb-fv">
                <Num n={f.v} fmt={f.tipo === "porcentaje" ? "pct" : f.tipo === "dinero" ? "din" : "n"}>
                  {f.tipo === "dinero" ? fmtDineroNum(f.v) : valorDe(f)}
                </Num>
                <div className="lb-u">{f.tipo === "dinero" ? unidadDinero(f.v) : recortar(f.q, 40)}</div>
              </div>
              <div className="lb-fd">
                <span className="lb-tag">{a.dep}</span>
                <h3>{recortar(a.ti, 85)}</h3>
                {a.de && <p>{recortar(a.de, 110)}</p>}
                {pc ? <Puntos p={pc.v} n={50} /> : <Barra p={(f.tipo === "estudiantes" ? f.v / mx : 0.4) * 100} />}
              </div>
            </div>
          );
        })}
        {!top.length && <p className="lb-vacio">No hay logros con los filtros actuales.</p>}
      </div>
      <Leyenda />
      <Folio i={i} />
    </>
  );
}

function Dependencias({ i, pag }: { i: number; pag: Pag }) {
  const { calc } = useCtx();
  const todas = calc.deps;
  const ds = todas.slice(pag.desde, pag.hasta);
  const m = Math.max(1, ...todas.map((d) => Math.max(calc.byDep[d].L, calc.byDep[d].R)));
  return (
    <>
      <Encabezado />
      <Titulo a="Logros y retos" b="por dependencia" cont={pag.parte > 1} />
      {pag.parte === 1 && <Texto k="dependencias" />}
      <div className="lb-bloque">
        <div className="lb-kk">Logros (izquierda) y retos (derecha)</div>
        <div className="lb-div">
          {ds.map((d) => {
            const b = calc.byDep[d];
            return (
              <div className="lb-dv" key={d}>
                <div className="lb-l">
                  <span className="lb-v">{b.L}</span>
                  <b style={{ width: `${(b.L / m) * 100}%` }} />
                </div>
                <div className="lb-lab">{cortoDe(d)}</div>
                <div className="lb-r">
                  <b style={{ width: `${(b.R / m) * 100}%` }} />
                  <span className="lb-v">{b.R}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Leyenda />
      <div className="lb-bloque">
        <div className="lb-kk">Tipo de cifra que aportó cada dependencia</div>
        <div className="lb-heat">
          <span />
          {TIPOS_LIBRO.map((t) => (
            <span className="lb-h" key={t.id}>
              {t.id === "otro" ? "Otras" : t.nombre}
            </span>
          ))}
          {ds.map((d) => (
            <HeatFila key={d} d={d} />
          ))}
        </div>
      </div>
      <Folio i={i} />
    </>
  );
}

function HeatFila({ d }: { d: string }) {
  const { calc } = useCtx();
  const b = calc.byDep[d];
  return (
    <>
      <span className="lb-n">{cortoDe(d)}</span>
      {TIPOS_LIBRO.map((t) => {
        const v = b.t[t.id];
        return (
          <span key={t.id} className="lb-cel" style={estilo({ background: v ? `color-mix(in srgb, var(--p-logro) ${Math.min(25 + v * 12, 100)}%, white)` : "var(--p-tint)", color: v >= 4 ? "#fff" : "var(--p-ink)" })}>
            {v || ""}
          </span>
        );
      })}
    </>
  );
}

/** Valor de una cifra en un reto: el dinero lleva su unidad escrita debajo. */
function ValorReto({ f }: { f: Cif }) {
  if (f.tipo !== "dinero") return <Num n={f.v} fmt={f.tipo === "porcentaje" ? "pct" : "n"}>{valorDe(f)}</Num>;
  return (
    <div className="lb-din">
      <Num n={f.v} fmt="din">
        {fmtDineroNum(f.v)}
      </Num>
      <small>{unidadDinero(f.v)}</small>
    </div>
  );
}

function Retos({ i, pag }: { i: number; pag: Pag }) {
  const { calc } = useCtx();
  const rs = calc.R.slice(pag.desde, pag.hasta);
  const fichas = pag.parte === 1 ? rs.slice(0, FICHAS_RETOS) : [];
  const filas = rs.slice(fichas.length);
  const maxPorTipo = (tipo: string) => Math.max(1, ...calc.R.map((a) => (a.c[0]?.tipo === tipo ? a.c[0].v : 0)));
  return (
    <>
      <Encabezado />
      <Titulo a="Retos" b="para el próximo año" reto cont={pag.parte > 1} />
      {pag.parte === 1 && <Texto k="retos" />}
      <Leyenda />
      {fichas.length > 0 && (
        <div className="lb-rg">
          {fichas.map((a) => {
            const f = a.c[0];
            return (
              <div className="lb-rc" key={a.id}>
                <div className="lb-rc__t">
                  <span className="lb-tag">{a.dep}</span>
                  {f && <ValorReto f={f} />}
                </div>
                <h3>{recortar(a.ti, 72)}</h3>
                <p>{recortar(`${f ? `${f.q}. ` : ""}${a.de}`, 100)}</p>
                {f && <Barra p={f.tipo === "porcentaje" ? f.v : (f.v / maxPorTipo(f.tipo)) * 100} reto />}
              </div>
            );
          })}
        </div>
      )}
      {filas.length > 0 && (
        <ul className="lb-rest">
          {filas.map((a) => (
            <li key={a.id}>
              <div>
                <span className="lb-rt">{recortar(a.ti, 90)}</span>
                <span className="lb-rm">
                  <b className="lb-tag">{a.dep}</b>
                  {recortar(a.de, 60)}
                </span>
              </div>
              {a.c[0] ? (
                <div className="lb-rv">
                  <b>{a.c[0].tipo === "dinero" ? fmtDineroNum(a.c[0].v) : valorDe(a.c[0])}</b>
                  {a.c[0].tipo === "dinero" && <small>{unidadDinero(a.c[0].v)}</small>}
                </div>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
      {!rs.length && <p className="lb-vacio">No hay retos con los filtros actuales.</p>}
      <Folio i={i} />
    </>
  );
}

function OdsPagina({ i }: { i: number }) {
  const { calc } = useCtx();
  const key = odsPrincipales(calc);
  return (
    <>
      <Encabezado />
      <Titulo a="Aportes" b="por ODS" />
      <Texto k="ods" />
      <div className="lb-og">
        {ODS.map((o) => {
          const q = calc.ods[o.n];
          return (
            <div key={o.n} className={`lb-ot${q ? "" : " off"}${key.includes(o.n) ? " key" : ""}`} style={{ background: q ? o.color : undefined }}>
              <span className="lb-n">{o.n}</span>
              <span className="lb-t">{o.nombre}</span>
              <span className="lb-d">
                {q && Array.from({ length: Math.min(q.L, 12) }, (_, n) => <i key={`l${n}`} />)}
                {q && Array.from({ length: Math.min(q.R, 12) }, (_, n) => <i key={`r${n}`} className="r" />)}
              </span>
            </div>
          );
        })}
        <div className="lb-olg">
          <span>
            <i className="lb-dotL" style={{ background: "var(--p-dark)" }} />
            Logro
          </span>
          <span>
            <i className="lb-dotR" style={{ borderColor: "var(--p-dark)" }} />
            Reto
          </span>
          <span style={{ fontWeight: 500 }}>El contorno marca los 3 ODS con más aportes.</span>
        </div>
      </div>
      {calc.clasificados > 0 && (
        <div className="lb-pie">
          <SelloPilo tipo="ods" />
          <span>Una persona confirma la clasificación.</span>
        </div>
      )}
      <Folio i={i} />
    </>
  );
}

/** Una ficha por dependencia, de un vistazo: aportes, tres cifras fuertes y su aporte principal. */
function Resumen({ i, pag }: { i: number; pag: Pag }) {
  const { calc, cfg } = useCtx();
  const ds = dependenciasResumen(calc, cfg).slice(pag.desde, pag.hasta);
  return (
    <>
      <Encabezado />
      <Titulo a="Dependencias" b="en resumen" cont={pag.parte > 1} />
      {pag.parte === 1 && <Texto k="foco" />}
      <Leyenda />
      <div className="lb-fl">
        {ds.map((d) => {
          const r = resumenDe(calc, d);
          return (
            <div className="lb-rs" key={d}>
              <div className="lb-rs__n">
                <b>{d}</b>
                <span>
                  <Logro />
                  {r.L}
                  <Reto />
                  {r.R}
                </span>
              </div>
              <div className="lb-rs__c">
                {r.cifras.map((c) => (
                  <div key={c.q}>
                    <b className="lb-num">{c.v}</b>
                    <small>{c.q}</small>
                  </div>
                ))}
              </div>
              {r.principal && (
                <div className="lb-rs__p">
                  {r.principal.t === "L" ? <Logro /> : <Reto />}
                  {recortar(r.principal.ti, 105)}
                </div>
              )}
            </div>
          );
        })}
        {!ds.length && <p className="lb-vacio">No hay dependencias con aportes en el resumen.</p>}
      </div>
      <Folio i={i} />
    </>
  );
}

function Compromisos({ i }: { i: number }) {
  const { calc } = useCtx();
  const rs = calc.R.slice(0, 12);
  const Q = ["2026-IV", "2027-I", "2027-II", "2027-III", "2027-IV"];
  return (
    <>
      <Encabezado />
      <div className="lb-ttlfila">
        <Titulo a="Lo que" b="sigue" reto />
        <SelloPilo tipo="propuesta" />
      </div>
      <Texto k="compromisos" />
      <div className="lb-tl">
        <span />
        {Q.map((q) => (
          <span className="lb-q" key={q}>
            {q}
          </span>
        ))}
        {rs.map((a, n) => {
          const s = n % 3;
          const e = Math.min(4, s + 1 + (n % 2));
          return <TlFila key={a.id} a={a} s={s} e={e} Q={Q} />;
        })}
      </div>
      {!rs.length && <p className="lb-vacio">No hay retos para convertir en compromisos.</p>}
      <p className="lb-pie lb-pie--t">Cada dependencia define su responsable y su fecha.</p>
      <Folio i={i} />
    </>
  );
}
function TlFila({ a, s, e, Q }: { a: Fila; s: number; e: number; Q: string[] }) {
  return (
    <>
      <div className="lb-t">
        <span>{recortar(a.ti, 70)}</span>
        <small>{recortar(a.dep, 56)}</small>
      </div>
      {Q.map((q, k) => (
        <div className="lb-z" key={q}>
          {k >= s && k <= e ? <b /> : null}
        </div>
      ))}
    </>
  );
}

function Notas({ i }: { i: number }) {
  return (
    <>
      <Encabezado />
      <h2 className="lb-ttl">Notas</h2>
      <div className="lb-notas" />
      <Folio i={i} />
    </>
  );
}

/* ---------- la hoja ---------- */

const CONTENIDO: Record<string, (p: { i: number; pag: Pag }) => JSX.Element> = {
  presentacion: Presentacion,
  cifras: Cifras,
  destacados: Destacados,
  dependencias: Dependencias,
  retos: Retos,
  ods: OdsPagina,
  foco: Resumen,
  compromisos: Compromisos,
  notas: Notas,
};

export function Hoja({ pag, indice }: { pag: Pag; indice: number }) {
  const ctx = useCtx();
  const id = pag.id;
  const oscura = id === "portada" || id === "contra";
  const imagen = id === "portada" ? ctx.urls.portada : id === "contra" ? ctx.urls.contra : null;
  const Cuerpo = CONTENIDO[id];
  return (
    <div className={`lb-sheet pal-${ctx.cfg.portada.paleta}${oscura ? " oscura" : ""}${id === "portada" && ctx.cfg.portada.composicion === 3 && !imagen ? " clara" : ""}`} data-pagina={id} data-parte={pag.parte}>
      {imagen && <img className="lb-img" src={imagen} alt={id === "portada" ? "Portada del libro" : "Contraportada del libro"} />}
      <div className="lb-page">
        <div className={`lb-pg${oscura ? " dark" : ""}`}>
          {!imagen && id === "portada" && <Portada />}
          {!imagen && id === "contra" && <Contra />}
          {Cuerpo && <Cuerpo i={indice} pag={pag} />}
        </div>
        {ctx.guias && (
          <div className="lb-guia" aria-hidden="true">
            <i />
          </div>
        )}
      </div>
    </div>
  );
}

export const HojaVacia = () => <div className="lb-sheet vacia" aria-hidden="true" />;
