/* =============================================================================
   Tablero IGA · un tema cualquiera a partir de su configuración.
   Frase de lectura, cifras, pestañas y tarjetas con el mismo diseño que Financiero.
   ========================================================================== */

import { useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Aviso, Barras, BarrasApiladas, COLORES, Leyenda, Lineas, TablaOrdenable, Viz } from "./graficas";
import type { ColTabla } from "./graficas";
import { Kpi } from "./Financiero";
import { useEntradaIga } from "./movimiento";
import { agrupar, calcular, enUltimo, filtrar, formato, porTexto, ultimo } from "./motor";
import type { CfgTema, ColPrograma, Fila, Spec, TablaDatos } from "./motor";
import type { FiltroFin } from "./financiero-datos";
import "./tablero-iga.css";

type Tablas = Record<string, TablaDatos | undefined>;

export function TableroTema({ cfg, tablas, filtros, poner, onDetalle }: { cfg: CfgTema; tablas: Tablas; filtros: FiltroFin; poner: (c: Partial<FiltroFin>) => void; onDetalle?: (k: string) => void }) {
  const [sp, setSp] = useSearchParams();
  const raiz = useRef<HTMLDivElement>(null);
  const pest = cfg.pestanas.find((p) => p.id === sp.get("pestana")) ?? cfg.pestanas[0];
  const ir = (id: string) => { const nuevo = new URLSearchParams(sp); nuevo.set("pestana", id); setSp(nuevo, { replace: true }); };
  useEntradaIga(raiz, pest.id);

  const filas = useMemo(() => Object.fromEntries(Object.entries(tablas).map(([id, t]) => [id, t ? filtrar(t, filtros) : []])) as Record<string, Fila[]>, [tablas, filtros]);

  const kpis = cfg.kpis.map((k) => {
    const base = (filas[k.tabla] ?? []).filter((r) => !k.donde || r[k.donde[0]] === k.donde[1]);
    const rs = k.periodo ? enUltimo(base, k.periodo) : base;
    const v = tablas[k.tabla] ? calcular(rs, k.agg) : null;
    return { ...k, v, texto: v === null ? "—" : formato(k.fmt, v) };
  });
  const faltan = cfg.tablas.filter((r) => !tablas[r.id]);
  if (faltan.length === cfg.tablas.length) return <SinTablas cfg={cfg} />;

  return (
    <div className="iga" ref={raiz}>
      <p className="iga-lectura">{cfg.lectura(kpis.map((k) => k.texto))}</p>
      {faltan.length > 0 && <p className="iga-nota" role="note">Faltan por importar: {faltan.map((r) => r.nombre).join(", ")}. Lo que depende de esas tablas sale vacío.</p>}

      <div className="iga-kpis" role="list">
        {kpis.map((k) => <Kpi key={k.etiqueta} etiqueta={k.etiqueta} n={k.v ?? 0} f={(v) => (k.v === null ? "—" : formato(k.fmt, v))} />)}
      </div>

      <div className="iga-barra">
        <div className="iga-tabs" role="tablist" aria-label={`Secciones de ${cfg.nombre}`}>
          {cfg.pestanas.map((p) => <button key={p.id} type="button" role="tab" aria-selected={pest.id === p.id} onClick={() => ir(p.id)}>{p.nombre}</button>)}
        </div>
      </div>

      <div className="iga-grid">
        {pest.specs.map((s, i) => <Tarjeta key={`${pest.id}-${i}`} s={s} tablas={tablas} filas={filas} poner={poner} onDetalle={onDetalle} />)}
      </div>
      <p className="iga-pie">Fuente: {cfg.fuente}. Programas unidos por nombre y sede.</p>
    </div>
  );
}

function SinTablas({ cfg }: { cfg: CfgTema }) {
  return (
    <div className="iga iga-sin" role="note">
      <h3>Falta importar las tablas de {cfg.nombre}</h3>
      <p>Este tablero lee estas tablas del taller. Impórtalas en Captura de datos y conéctalas en la Guía de datos:</p>
      <ul>{cfg.tablas.map((r) => <li key={r.id}>{r.nombre}{r.clave ? ` (${r.clave})` : ""}</li>)}</ul>
    </div>
  );
}

function Tarjeta({ s, tablas, filas, poner, onDetalle }: { s: Spec; tablas: Tablas; filas: Record<string, Fila[]>; poner: (c: Partial<FiltroFin>) => void; onDetalle?: (k: string) => void }) {
  const ancho = s.ancho ?? 6;
  const tabla = "tabla" in s ? s.tabla : undefined;
  if (s.t === "nota") return <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}><Aviso>{s.texto}</Aviso></Viz>;
  if (s.t === "programas") return <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}><TablaProgramas s={s} tablas={tablas} filas={filas} onDetalle={onDetalle} /></Viz>;
  if (!tabla || !tablas[tabla]) return <Viz ancho={ancho} titulo={s.titulo}><Aviso>Falta la tabla de esta tarjeta.</Aviso></Viz>;
  const rs = (filas[tabla] ?? []).filter((r) => !("donde" in s && s.donde) || r[s.donde[0]] === s.donde[1]);
  if (!rs.length) return <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}><Aviso>Sin datos con estos filtros.</Aviso></Viz>;

  if (s.t === "barras") {
    const base = s.periodo ? enUltimo(rs, s.periodo) : rs;
    let items = agrupar(base, s.cat, s.agg, s.sin);
    items = s.orden === "cat" ? items.sort(porTexto) : items.sort((a, b) => b.v - a.v);
    if (s.top) items = items.slice(0, s.top);
    const periodo = s.periodo ? ultimo(rs, s.periodo) : null;
    return (
      <Viz ancho={ancho} titulo={s.titulo} nota={[s.nota, periodo].filter(Boolean).join(" · ") || undefined}>
        <Barras filas={items.map((i) => ({ k: i.k, etiqueta: i.k, v: i.v, texto: formato(s.fmt, i.v), onClick: s.filtro ? () => poner(s.filtro === "sede" ? { sede: i.k } : { fac: i.k }) : undefined }))} />
      </Viz>
    );
  }

  if (s.t === "lineas") {
    const xs = [...new Set(rs.map((r) => String(r[s.x] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    const nombres = s.serie ? [...new Set(rs.map((r) => String(r[s.serie!] ?? "")).filter((v) => v && !(s.sin ?? []).includes(v)))] : [""];
    const peso = (nm: string) => rs.filter((r) => (s.serie ? r[s.serie] === nm : true)).length;
    const mostrados = nombres.sort((a, b) => peso(b) - peso(a)).slice(0, COLORES.length);
    const series = mostrados.map((nm, i) => ({
      label: nm || "Toda la UDES",
      color: COLORES[i],
      vals: xs.map((x) => calcular(rs.filter((r) => String(r[s.x] ?? "") === x && (!s.serie || r[s.serie] === nm)), s.agg)),
    }));
    return (
      <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}>
        {s.serie && <Leyenda items={series.map((x) => ({ l: x.label, c: x.color }))} />}
        <Lineas etiqueta={s.titulo} xs={xs} series={series} fmt={(v) => formato(s.fmt, v)} />
        {nombres.length > COLORES.length && <Aviso>Se dibujan las {COLORES.length} series con más datos de {nombres.length}.</Aviso>}
      </Viz>
    );
  }

  if (s.t === "apiladas") {
    const base = s.periodo ? enUltimo(rs, s.periodo) : rs;
    const series = [...new Set(base.map((r) => String(r[s.serie] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).slice(0, COLORES.length);
    const cats = [...new Set(base.map((r) => String(r[s.cat] ?? "")).filter(Boolean))];
    const filasAp = cats.map((c) => ({
      k: c,
      etiqueta: c,
      partes: series.map((sr) => { const v = calcular(base.filter((r) => r[s.cat] === c && r[s.serie] === sr), s.agg) ?? 0; return { l: sr, v, texto: formato(s.fmt, v) }; }).filter((p) => p.v > 0),
    })).filter((f) => f.partes.length);
    filasAp.sort(s.orden === "cat" ? porTexto : (a, b) => b.partes.reduce((x, p) => x + p.v, 0) - a.partes.reduce((x, p) => x + p.v, 0));
    return (
      <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}>
        <BarrasApiladas filas={filasAp} series={series} total={(f) => formato(s.fmt, f.partes.reduce((x, p) => x + p.v, 0))} />
      </Viz>
    );
  }

  /* lista: filas tal cual */
  const cols: ColTabla<Fila>[] = s.columnas.map((c) => ({ k: c.col, n: c.n, num: Boolean(c.fmt), val: (r) => r[c.col] ?? null, fmt: c.fmt ? (r) => (typeof r[c.col] === "number" ? formato(c.fmt!, r[c.col] as number) : "—") : undefined }));
  return (
    <Viz ancho={ancho} titulo={s.titulo} nota={s.nota}>
      <TablaOrdenable filas={rs} cols={cols} orden={s.orden} desc={s.desc ?? true} clave={(r) => JSON.stringify(r)} />
    </Viz>
  );
}

/* --- Tabla de programas: una fila por programa y sede, con columnas de varias tablas -------------- */

interface FilaProg { k: string; programa: string; sede: string; v: (number | null)[] }

function TablaProgramas({ s, tablas, filas, onDetalle }: { s: Extract<Spec, { t: "programas" }>; tablas: Tablas; filas: Record<string, Fila[]>; onDetalle?: (k: string) => void }) {
  const datos = useMemo(() => {
    const usadas = [...new Set(s.columnas.map((c: ColPrograma) => c.tabla))].filter((t) => tablas[t]);
    const llaves = new Map<string, { programa: string; sede: string }>();
    for (const t of usadas) for (const r of filas[t] ?? []) { const programa = String(r.programa ?? ""); if (!programa) continue; const sede = String(r.sede ?? ""); llaves.set(`${programa}|${sede}`, { programa, sede }); }
    const ult = new Map(s.columnas.map((c) => [c, c.periodo ? ultimo(filas[c.tabla] ?? [], c.periodo) : null]));
    return [...llaves.entries()].map(([k, l]): FilaProg => ({
      k, ...l,
      v: s.columnas.map((c) => {
        if (!tablas[c.tabla]) return null;
        const u = ult.get(c);
        const rs = (filas[c.tabla] ?? []).filter((r) => r.programa === l.programa && String(r.sede ?? "") === l.sede && (!c.periodo || String(r[c.periodo] ?? "") === u));
        return calcular(rs, c.agg);
      }),
    }));
  }, [s, tablas, filas]);
  if (!datos.length) return <Aviso>Sin programas con estos filtros.</Aviso>;
  const cols: ColTabla<FilaProg>[] = [
    { k: "programa", n: "Programa", val: (r) => r.programa },
    { k: "sede", n: "Sede", val: (r) => r.sede },
    ...s.columnas.map((c, i): ColTabla<FilaProg> => ({ k: `c${i}`, n: c.n, num: true, barra: c.barra, val: (r) => r.v[i], fmt: (r) => (r.v[i] === null ? "—" : formato(c.fmt, r.v[i] as number)) })),
  ];
  return <TablaOrdenable filas={datos} cols={cols} orden={`c${s.orden}`} desc={s.desc ?? true} clave={(r) => r.k} onFila={onDetalle ? (r) => onDetalle(r.k) : undefined} />;
}
