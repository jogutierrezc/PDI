/* =============================================================================
   Libro de la Rendición de Cuentas · una hoja.

   Cada hoja es un cuadro que escala por contenedor (1u = 1 % del ancho de la
   página), así la misma plantilla sirve en Carta y en A4, en pantalla y al
   imprimir. El sangrado se añade solo al imprimir: la hoja (.lb-sheet) crece 3 mm
   por lado y la página (.lb-page) queda en el centro, con el fondo y la imagen
   de portada llegando hasta el borde.
   ========================================================================== */

import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { Anillo, Barra, Leyenda, Logro, Puntos, Reto, estilo } from "./graficos";
import { CLAVES_TEXTO, ODS, TIPOS_LIBRO, cortoDe, depFoco, fmtDinero, fmtN, nombrePagina, odsPrincipales, principal, textoDe, topLogros, valorDe } from "./modelo";
import type { Calculo, ConfigLibro, Fila, IdPagina } from "./modelo";

export const LOGO_BLANCO = "/logo-udes-blanco.png";
export const LOGO_COLOR = "/logo-udes.svg";

export interface CtxHoja {
  calc: Calculo;
  cfg: ConfigLibro;
  paginas: IdPagina[];
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
function Nar({ k }: { k: IdPagina }) {
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
  ) : null;
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
const Titulo = ({ a, b, reto }: { a: string; b: string; reto?: boolean }) => (
  <h2 className="lb-ttl">
    {a} <i style={reto ? { color: "var(--p-reto)" } : undefined}>{b}</i>
  </h2>
);
const Num = ({ n, fmt = "n", cls = "", children }: { n: number; fmt?: "n" | "pct" | "din"; cls?: string; children: string }) => (
  <div className={`lb-num ${cls}`} data-n={n} data-fmt={fmt}>
    {children}
  </div>
);
const Pilo = ({ children }: { children: string }) => (
  <div className="lb-pilo">
    <i>P</i>
    {children}
  </div>
);

/* ---------- portada y contraportada ---------- */

function Mosaico({ arriba }: { arriba?: boolean }) {
  const { calc } = useCtx();
  const deps = calc.deps.length ? calc.deps : Array.from({ length: 10 }, (_, i) => `x${i}`);
  const filas = arriba ? 4 : 10;
  return (
    <div className="lb-mosaico" aria-hidden="true">
      {deps.map((d) => {
        const fs = calc.r.filter((a) => a.dep === d);
        const l = fs.filter((a) => a.t === "L").reduce((s, a) => s + a.c.length, 0);
        const r = fs.filter((a) => a.t === "R").reduce((s, a) => s + a.c.length, 0);
        return (
          <div className="lb-col" key={d}>
            {Array.from({ length: filas }, (_, i) => (
              <i key={i} className={`lb-sq${i < l ? " l" : i < l + r ? " r" : ""}`} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Portada() {
  const { calc, cfg } = useCtx();
  const p = cfg.portada;
  const palabras = p.titulo.trim().split(/\s+/);
  const ultima = palabras.pop() ?? "";
  const cabeza = (
    <h2>
      {palabras.join(" ")} {palabras.length ? " " : ""}
      <em>{ultima}</em>
    </h2>
  );
  const marca = <img className="lb-marca" src={p.composicion === 3 ? LOGO_COLOR : LOGO_BLANCO} alt="Universidad de Santander, UDES" />;
  const pie = (
    <div className="lb-tt">
      {cabeza}
      <div className="lb-s1">{p.subtitulo}</div>
      <div className="lb-s2">{p.fecha}</div>
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
            <Mosaico />
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
            <span>Cada cuadrado es una cifra reportada</span>
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
        <Mosaico arriba />
      </div>
      <div className="lb-tt">
        <h2>
          Seguimos <em>construyendo</em>
        </h2>
        <Nar k="contra" />
      </div>
      <div className="lb-url">
        <img className="lb-marca grande" src={LOGO_BLANCO} alt="Universidad de Santander, UDES" />
        planeacion.udes.edu.co
        <small>{cfg.portada.fecha.toUpperCase()}</small>
      </div>
    </div>
  );
}

/* ---------- páginas de contenido ---------- */

function Presentacion({ i }: { i: number }) {
  const { paginas } = useCtx();
  const indice = paginas.map((p, n) => ({ p, n })).filter((x) => !["portada", "contra", "notas", "presentacion"].includes(x.p));
  return (
    <>
      <Encabezado />
      <Titulo a="Lo que" b="contamos" />
      <Nar k="presentacion" />
      <Pilo>Redactado con Pilo con las cifras de las dependencias</Pilo>
      <ul className="lb-idx">
        {indice.map((x) => (
          <li key={x.p}>
            {nombrePagina(x.p)}
            <span />
            <b className="lb-num">{x.n + 1}</b>
          </li>
        ))}
      </ul>
      <div className="lb-read">
        <div>
          <Logro />
          <span>
            <b>Logro.</b> Lo que una dependencia consiguió y puede respaldar con cifras.
          </span>
        </div>
        <div>
          <Reto />
          <span>
            <b>Reto.</b> Lo que falta o exige más esfuerzo el próximo año.
          </span>
        </div>
      </div>
      <Folio i={i} />
    </>
  );
}

function Cifras({ i }: { i: number }) {
  const { calc } = useCtx();
  const K: { k: string; n: number; t: string; f: "n" | "din"; suf?: string; p: number }[] = [
    { k: "Estudiantes alcanzados", n: calc.est, t: fmtN(calc.est), f: "n", p: Math.min(1, calc.est / Math.max(calc.est, 5000)) },
    { k: "Programas y proyectos", n: calc.prog, t: fmtN(calc.prog), f: "n", p: Math.min(1, calc.prog / 20) },
    { k: "Inversión de los logros", n: calc.din, t: fmtDinero(calc.din), f: "din", p: Math.min(1, calc.din / 1_500_000_000) },
    { k: "Dependencias con aportes", n: calc.nd, t: fmtN(calc.nd), f: "n", p: 1 },
  ];
  const tot = calc.nc || 1;
  const colores = ["var(--p-dark)", "var(--p-logro)", "var(--p-logro2)", "var(--p-reto)", "var(--p-reto2)"];
  const stk = TIPOS_LIBRO.map((t, n) => ({ t, v: calc.tipo[t.id], c: colores[n] })).filter((x) => x.v);
  return (
    <>
      <Encabezado />
      <Titulo a="El año" b="en cifras" />
      <Nar k="cifras" />
      <div className="lb-split">
        <div className="lb-anillo-caja">
          <Anillo logros={calc.L.length} retos={calc.R.length} />
          <div className="lb-c">
            <Num n={calc.r.length}>{fmtN(calc.r.length)}</Num>
            <small>aportes</small>
          </div>
        </div>
        <ul className="lb-kpis">
          {K.map((k) => (
            <li key={k.k}>
              <span className="lb-k">{k.k}</span>
              <Num n={k.n} fmt={k.f}>
                {k.t}
              </Num>
              <div className="lb-tr">
                <b style={{ width: `${Math.round(k.p * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Leyenda />
      <div className="lb-abajo">
        <div className="lb-kk">Qué tipo de cifras se reportaron</div>
        <div className="lb-stack">
          {stk.map((x) => (
            <b key={x.t.id} style={{ width: `${(x.v / tot) * 100}%`, background: x.c }} />
          ))}
        </div>
        <div className="lb-stk-lg">
          {stk.map((x) => (
            <span key={x.t.id}>
              <i style={{ background: x.c }} />
              {x.t.nombre} {x.v}
            </span>
          ))}
        </div>
      </div>
      <Folio i={i} />
    </>
  );
}

function Destacados({ i }: { i: number }) {
  const { calc } = useCtx();
  const top = topLogros(calc);
  const mx = Math.max(1, ...calc.L.map((a) => (principal(a)?.tipo === "estudiantes" ? principal(a)!.v : 0)));
  return (
    <>
      <Encabezado />
      <Titulo a="Logros" b="destacados" />
      <Nar k="destacados" />
      <div className="lb-feats">
        {top.map((a) => {
          const f = principal(a)!;
          const pc = a.c.find((c) => c.tipo === "porcentaje");
          return (
            <div className="lb-feat" key={a.id}>
              <div>
                <Num n={f.v} fmt={f.tipo === "porcentaje" ? "pct" : f.tipo === "dinero" ? "din" : "n"}>
                  {valorDe(f)}
                </Num>
                <div className="lb-u">{f.q}</div>
              </div>
              <div>
                <span className="lb-tag">{cortoDe(a.dep)}</span>
                <h3>{a.ti}</h3>
                {a.de && <p>{a.de}</p>}
                {pc ? (
                  <>
                    <Puntos p={pc.v} />
                    <div className="lb-u">
                      {fmtN(pc.v)} % {pc.q}
                    </div>
                  </>
                ) : (
                  <Barra p={(f.tipo === "estudiantes" ? f.v / mx : 0.4) * 100} />
                )}
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

function Dependencias({ i }: { i: number }) {
  const { calc } = useCtx();
  const ds = calc.deps.slice(0, 10);
  const m = Math.max(1, ...ds.map((d) => Math.max(calc.byDep[d].L, calc.byDep[d].R)));
  return (
    <>
      <Encabezado />
      <Titulo a="Logros y retos" b="por dependencia" />
      <Nar k="dependencias" />
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
      <Leyenda />
      <div className="lb-abajo">
        <div className="lb-kk">Tipo de cifra que aportó cada dependencia</div>
        <div className="lb-heat">
          <span />
          {TIPOS_LIBRO.map((t) => (
            <span className="lb-h" key={t.id}>
              {t.id === "otro" ? "Otras" : t.nombre}
            </span>
          ))}
          {ds.slice(0, 8).map((d) => (
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
          <span key={t.id} className="lb-cel" style={estilo({ background: v ? `color-mix(in srgb, var(--p-logro) ${Math.min(25 + v * 25, 100)}%, white)` : "var(--p-tint)", color: v >= 2 ? "#fff" : "var(--p-ink)" })}>
            {v || ""}
          </span>
        );
      })}
    </>
  );
}

function Retos({ i }: { i: number }) {
  const { calc } = useCtx();
  const cuatro = calc.R.slice(0, 4);
  const resto = calc.R.slice(4, 9);
  const maxPorTipo = (tipo: string) => Math.max(1, ...calc.R.map((a) => (a.c[0]?.tipo === tipo ? a.c[0].v : 0)));
  return (
    <>
      <Encabezado />
      <Titulo a="Retos" b="para el próximo año" reto />
      <Nar k="retos" />
      <div className="lb-rg">
        {cuatro.map((a) => {
          const f = a.c[0];
          return (
            <div className="lb-rc" key={a.id}>
              <span className="lb-tag">{cortoDe(a.dep)}</span>
              {f ? (
                <Num n={f.v} fmt={f.tipo === "porcentaje" ? "pct" : f.tipo === "dinero" ? "din" : "n"}>
                  {valorDe(f)}
                </Num>
              ) : (
                <div className="lb-num">{" "}</div>
              )}
              <h3>{a.ti}</h3>
              <p>
                {f ? `${f.q}. ` : ""}
                {a.de}
              </p>
              {f && (f.tipo === "porcentaje" ? <Puntos p={f.v} reto /> : <Barra p={(f.v / maxPorTipo(f.tipo)) * 100} reto />)}
            </div>
          );
        })}
      </div>
      {!cuatro.length && <p className="lb-vacio">No hay retos con los filtros actuales.</p>}
      {resto.length > 0 && (
        <ul className="lb-rest">
          {resto.map((a) => (
            <li key={a.id}>
              <span>
                {a.ti} <span className="lb-mute">· {cortoDe(a.dep)}</span>
              </span>
              <b>{a.c[0] ? valorDe(a.c[0]) : ""}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="lb-abajo">
        <Leyenda />
      </div>
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
      <Nar k="ods" />
      <div className="lb-og">
        {ODS.map((o) => {
          const q = calc.ods[o.n];
          return (
            <div key={o.n} className={`lb-ot${q ? "" : " off"}${key.includes(o.n) ? " key" : ""}`} style={{ background: q ? o.color : undefined }}>
              <span className="lb-n">{o.n}</span>
              <span className="lb-t">{o.nombre}</span>
              <span className="lb-d">
                {q && Array.from({ length: q.L }, (_, n) => <i key={`l${n}`} />)}
                {q && Array.from({ length: q.R }, (_, n) => <i key={`r${n}`} className="r" />)}
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
      <div className="lb-abajo">
        <Pilo>Clasificación de Pilo para los ODS, confirmada por una persona</Pilo>
      </div>
      <Folio i={i} />
    </>
  );
}

function Foco({ i }: { i: number }) {
  const { calc, cfg } = useCtx();
  const id = depFoco(calc, cfg);
  const rs: Fila[] = id ? calc.r.filter((a) => a.dep === id) : [];
  return (
    <>
      <Encabezado />
      <div className="lb-fh">
        <div>
          <div className="lb-kk">Dependencia en foco</div>
          <h2 className="lb-ttl chico">{id ?? "Sin dependencias"}</h2>
        </div>
        <Num n={rs.length}>{fmtN(rs.length)}</Num>
      </div>
      <Nar k="foco" />
      <Leyenda />
      <div className="lb-fl">
        {rs.map((a) => {
          const f = principal(a);
          return (
            <div className="lb-fi" key={a.id}>
              {a.t === "L" ? <Logro /> : <Reto />}
              <div>
                <h3>{a.ti}</h3>
                {a.de && <p>{a.de}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="lb-num" style={{ color: a.t === "L" ? "var(--p-logro)" : "var(--p-reto)" }}>
                  {f ? valorDe(f) : ""}
                </div>
                {f && <p>{f.q}</p>}
              </div>
            </div>
          );
        })}
        {!rs.length && <p className="lb-vacio">Esta dependencia no tiene aportes con los filtros actuales.</p>}
      </div>
      <Folio i={i} />
    </>
  );
}

function Compromisos({ i }: { i: number }) {
  const { calc } = useCtx();
  const rs = calc.R.slice(0, 5);
  const Q = ["2026-IV", "2027-I", "2027-II", "2027-III", "2027-IV"];
  return (
    <>
      <Encabezado />
      <Titulo a="Lo que" b="sigue" reto />
      <Nar k="compromisos" />
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
          return (
            <TlFila key={a.id} a={a} s={s} e={e} Q={Q} />
          );
        })}
      </div>
      {!rs.length && <p className="lb-vacio">No hay retos para convertir en compromisos.</p>}
      <div className="lb-abajo">
        <Pilo>Propuesta de Pilo. Cada dependencia define su responsable y su fecha.</Pilo>
      </div>
      <Folio i={i} />
    </>
  );
}
function TlFila({ a, s, e, Q }: { a: Fila; s: number; e: number; Q: string[] }) {
  return (
    <>
      <div className="lb-t">
        {a.ti}
        <small>{a.dep}</small>
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

const CONTENIDO: Record<string, (p: { i: number }) => JSX.Element> = {
  presentacion: Presentacion,
  cifras: Cifras,
  destacados: Destacados,
  dependencias: Dependencias,
  retos: Retos,
  ods: OdsPagina,
  foco: Foco,
  compromisos: Compromisos,
  notas: Notas,
};

export function Hoja({ id, indice }: { id: IdPagina; indice: number }) {
  const ctx = useCtx();
  const oscura = id === "portada" || id === "contra";
  const imagen = id === "portada" ? ctx.urls.portada : id === "contra" ? ctx.urls.contra : null;
  const Cuerpo = CONTENIDO[id];
  return (
    <div className={`lb-sheet pal-${ctx.cfg.portada.paleta}${oscura ? " oscura" : ""}${id === "portada" && ctx.cfg.portada.composicion === 3 && !imagen ? " clara" : ""}`} data-pagina={id}>
      {imagen && <img className="lb-img" src={imagen} alt={id === "portada" ? "Portada del libro" : "Contraportada del libro"} />}
      <div className="lb-page">
        <div className={`lb-pg${oscura ? " dark" : ""}`}>
          {!imagen && id === "portada" && <Portada />}
          {!imagen && id === "contra" && <Contra />}
          {Cuerpo && <Cuerpo i={indice} />}
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
