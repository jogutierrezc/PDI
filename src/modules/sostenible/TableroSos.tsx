/* =============================================================================
   UDES Sostenible · tableros personalizados de Datos de Sostenibilidad.

   Dibuja la cuadrícula de 12 columnas de un tablero con las MISMAS piezas del
   portal (TileCuerpo para los indicadores, GraficaSos para las gráficas). La usan
   cuatro sitios, siempre con la misma forma de datos (la de sos_tablero_publico):
     · la ruta pública /sostenible/tablero/:slug;
     · el bloque del CMS «Tablero de sostenibilidad» (TableroIncrustado);
     · el bloque «Indicadores elegidos» (IndicadoresElegidos);
     · la vista previa del constructor, que calcula los datos en el navegador.
   Lo que no está publicado no llega aquí (la base lo omite): sin dato, el elemento
   no se dibuja; solo el editor (`ausentes`) lo muestra, con el motivo.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useCifrasPublicas } from "../datos-sostenibilidad/sos";
import { useTableroPublico } from "../datos-sostenibilidad/tableros";
import type { CifraPublicaSos, ElementoTablero, EstiloElemento, GraficaPublicaSos } from "../datos-sostenibilidad/tipos";
import { CAMPUSES, fmt } from "./data";
import type { Campus } from "./data";
import { GraficaSos } from "./GraficasSostenibles";
import { TileCuerpo } from "./widgets";
import type { TileDatos } from "./widgets";
import "./sostenible.css";
import "./tablero-sos.css";

/** Los estilos de tarjeta; «lista» es una fila por indicador (solo el bloque «Indicadores elegidos»). */
export type EstiloTile = EstiloElemento | "lista";

export interface OpcionesTile {
  meta?: boolean;
  tendencia?: boolean;
  fuente?: boolean;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Un campus válido del portal; cualquier otra cosa es «Todos». */
export const campusValido = (c: unknown): Campus => CAMPUSES.find((x) => typeof c === "string" && sinTildes(x) === sinTildes(c)) ?? "Todos";

/** La serie de un indicador para un campus («Todos» = la cifra institucional). */
function serieDe(c: CifraPublicaSos, campus: Campus) {
  return c.serie.filter((p) => (campus === "Todos" ? p.campus === null : p.campus !== null && sinTildes(p.campus) === sinTildes(campus)));
}

/** Lo que TileCuerpo necesita de un indicador en un campus; nulo si ese campus no tiene cifras. */
export function tileDeCifra(c: CifraPublicaSos, campus: Campus, nombre?: string): TileDatos | null {
  const serie = serieDe(c, campus);
  if (!serie.length) return null;
  const actual = serie[serie.length - 1];
  const primero = serie[0].valor;
  const pct = primero ? ((actual.valor - primero) / primero) * 100 : 0;
  return {
    name: nombre || c.nombre,
    unit: c.unidad,
    decimals: c.decimales,
    value: actual.valor,
    series: serie.map((p) => p.valor),
    pct,
    good: c.mejor === "sube" ? pct >= 0 : pct <= 0,
    desde: serie[0].anio,
    bar: c.unidad.includes("%") ? Math.min(100, actual.valor) : null,
    real: { valor: actual.valor, fuente: c.fuente || null, evidencia: null },
    sinCambio: serie.length < 2,
  };
}

/** La tarjeta de un campus sin cifras: el portal no inventa un número, lo dice. */
function TileVacio({ nombre, campus }: { nombre: string; campus: Campus }) {
  return (
    <div className="sos-tile" data-real="no">
      <span className="sos-tile__name">{nombre}</span>
      <span className="sos-tile__value">
        —<small>{campus === "Todos" ? "Sin cifras institucionales" : `Sin cifras para ${campus}`}</small>
      </span>
      <small className="sos-tile__src sos-tile__ilus">Dato ilustrativo</small>
    </div>
  );
}

function Meta({ cifra, valor }: { cifra: CifraPublicaSos; valor: number }) {
  if (cifra.meta === null || cifra.meta === undefined) return null;
  const avance = cifra.meta ? Math.max(0, Math.min(1, valor / cifra.meta)) : null;
  return (
    <p className="sos-ti__meta">
      Meta: {fmt(cifra.meta, cifra.decimales)} {cifra.unidad}
      {avance !== null ? ` · avance ${fmt(avance * 100, 0)} %` : ""}
    </p>
  );
}

/** Un indicador en el estilo pedido. Las opciones apagan lo que no se quiere ver. */
function Indicador({ cifra, campus, estilo, opciones, nombre }: { cifra: CifraPublicaSos; campus: Campus; estilo: EstiloTile; opciones: OpcionesTile; nombre?: string }) {
  const d = useMemo(() => tileDeCifra(cifra, campus, nombre), [cifra, campus, nombre]);
  const titulo = nombre || cifra.nombre;
  if (!d) return <TileVacio nombre={titulo} campus={campus} />;
  const meta = opciones.meta === true;
  const tendencia = opciones.tendencia !== false;
  const fuente = opciones.fuente !== false;
  if (estilo === "lista") {
    return (
      <div className="sos-ti-fila">
        <span className="sos-ti-fila__n">{titulo}</span>
        <span className="sos-ti-fila__v">
          <b>{fmt(d.value, d.decimals)}</b> <small>{d.unit}</small>
        </span>
        {tendencia && !d.sinCambio ? (
          <span className="sos-delta" data-good={d.good}>
            {d.pct >= 0 ? "▲" : "▼"} {fmt(Math.abs(d.pct))}% desde {d.desde}
          </span>
        ) : null}
        {meta ? <Meta cifra={cifra} valor={d.value} /> : null}
        {fuente && cifra.fuente ? <small className="sos-ti-fila__f">Fuente: {cifra.fuente}</small> : null}
      </div>
    );
  }
  return (
    <div className="sos-ti" data-estilo={estilo} data-sin-tendencia={tendencia ? undefined : ""} data-sin-fuente={fuente ? undefined : ""}>
      <TileCuerpo d={d} />
      {meta ? <Meta cifra={cifra} valor={d.value} /> : null}
    </div>
  );
}

export interface TableroVistaProps {
  elementos: ElementoTablero[];
  cifras: CifraPublicaSos[];
  graficas: GraficaPublicaSos[];
  /** Campus que muestra al abrir (por defecto «Todos»). */
  campus?: string | null;
  /** ¿Se ofrece el selector de campus? */
  selector?: boolean;
  /** Lo que se aplica a todos los indicadores si el elemento no dice otra cosa. */
  opciones?: OpcionesTile;
  /** Fuerza el estilo de todos los indicadores (el bloque «Indicadores elegidos»). */
  estilo?: EstiloTile;
  /** Solo el editor: elementos que no saldrían y por qué (id del elemento → motivo). */
  ausentes?: Record<string, string>;
  /** Solo el editor: el elemento elegido y cómo elegirlo desde el lienzo. */
  seleccionado?: string | null;
  onElegir?: (id: string) => void;
  /** Texto accesible de la cuadrícula. */
  etiqueta?: string;
}

/** La cuadrícula del tablero, con su selector de campus si lo pide. */
export function TableroVista({ elementos, cifras, graficas, campus: campusInicial, selector = false, opciones = {}, estilo, ausentes, seleccionado, onElegir, etiqueta = "Tablero de sostenibilidad" }: TableroVistaProps) {
  const inicial = campusValido(campusInicial);
  const [elegido, setElegido] = useState<Campus>(inicial);
  useEffect(() => setElegido(inicial), [inicial]);
  const campus = selector ? elegido : inicial;
  const cifraDe = useMemo(() => new Map(cifras.map((c) => [c.id, c])), [cifras]);
  const graficaDe = useMemo(() => new Map(graficas.map((g) => [g.id, g])), [graficas]);

  const celdas = elementos.map((el) => {
    let cuerpo: JSX.Element | null = null;
    if (el.tipo === "indicador") {
      const c = el.ref ? cifraDe.get(el.ref) : undefined;
      if (c) {
        const o = el.opciones ?? {};
        cuerpo = <Indicador cifra={c} campus={campus} estilo={estilo ?? el.estilo ?? "tarjeta"} nombre={el.titulo?.trim() || undefined} opciones={{ meta: o.meta ?? opciones.meta ?? true, tendencia: o.tendencia ?? opciones.tendencia, fuente: o.fuente ?? opciones.fuente }} />;
      }
    } else if (el.tipo === "grafica") {
      const g = el.ref ? graficaDe.get(el.ref) : undefined;
      if (g) cuerpo = <GraficaSos g={el.titulo?.trim() ? { ...g, config: { ...g.config, titulo: el.titulo.trim() } } : g} />;
    } else if (el.tipo === "titulo") {
      cuerpo = <h3 className="sos-tab__h">{el.titulo?.trim() || "Sección"}</h3>;
    } else if (el.tipo === "texto") {
      cuerpo = (
        <div className="sos-tab__texto">
          {el.titulo?.trim() ? <h4>{el.titulo.trim()}</h4> : null}
          <p>{el.opciones?.texto ?? ""}</p>
        </div>
      );
    } else if (el.tipo === "separador") {
      cuerpo = <hr className="sos-tab__sep" />;
    }
    if (!cuerpo) {
      // Un indicador o una gráfica que no es público: solo el editor lo deja ver, con el motivo.
      const motivo = ausentes?.[el.id];
      if (!motivo) return null;
      cuerpo = (
        <div className="sos-tab__fantasma" role="note">
          <b>{el.titulo?.trim() || el.ref || "Elemento"}</b>
          <span>{motivo}</span>
        </div>
      );
    }
    const editable = Boolean(onElegir);
    const alElegir = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onElegir?.(el.id);
      }
    };
    return (
      <div
        key={el.id}
        className="sos-tab__el"
        data-ancho={[3, 4, 6, 8, 12].includes(el.ancho) ? el.ancho : 12}
        style={{ "--span": [3, 4, 6, 8, 12].includes(el.ancho) ? el.ancho : 12 } as CSSProperties}
        data-editable={editable ? "" : undefined}
        data-sel={seleccionado === el.id ? "" : undefined}
        onClick={editable ? () => onElegir?.(el.id) : undefined}
        onKeyDown={editable ? alElegir : undefined}
        tabIndex={editable ? 0 : undefined}
        role={editable ? "button" : undefined}
        aria-pressed={editable ? seleccionado === el.id : undefined}
        aria-label={editable ? `Elegir «${el.titulo?.trim() || el.ref || el.tipo}»` : undefined}
      >
        {cuerpo}
      </div>
    );
  });

  return (
    <div className="sos-tab" role="group" aria-label={etiqueta}>
      {selector ? (
        <div className="sos-ctrl">
          <div className="sos-chips" role="group" aria-label="Campus">
            <span className="sos-chips__label">Campus</span>
            {CAMPUSES.map((c) => (
              <button key={c} type="button" aria-pressed={c === elegido} onClick={() => setElegido(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="sos-tab__rejilla">{celdas}</div>
    </div>
  );
}

/* --- Bloques del CMS ------------------------------------------------------------------------ */

function AvisoVacio({ children }: { children: string }) {
  return <p className="sos-tab__vacio">{children}</p>;
}

/**
 * «Indicadores elegidos»: los indicadores PUBLICADOS que eligió la persona, en su orden.
 * Con `editor` explica lo que falta; en la página pública, sin nada que mostrar, no dibuja nada.
 */
export function IndicadoresElegidos({
  ids,
  campus,
  estilo,
  opciones,
  editor = false,
}: {
  ids: string[];
  /** «selector» ofrece el selector de campus; un campus fija el campus. */
  campus: string;
  estilo: EstiloTile;
  opciones: OpcionesTile;
  editor?: boolean;
}) {
  const q = useCifrasPublicas();
  const cifras = q.data ?? [];
  const publicados = new Set(cifras.map((c) => c.id));
  const elementos: ElementoTablero[] = ids.map((id) => ({ id, tipo: "indicador", ref: id, ancho: estilo === "lista" ? 12 : estilo === "compacta" ? 3 : 4 }));
  const ausentes = Object.fromEntries(ids.filter((id) => !publicados.has(id)).map((id) => [id, "Este indicador ya no está publicado: no saldrá en la página."]));
  if (!elementos.length) return editor ? <AvisoVacio>Elija los indicadores en el panel de la derecha. Solo aparecen los publicados.</AvisoVacio> : null;
  if (!editor && !elementos.some((e) => publicados.has(e.id))) return null;
  return (
    <TableroVista
      elementos={elementos}
      cifras={cifras}
      graficas={[]}
      campus={campus === "selector" ? "Todos" : campus}
      selector={campus === "selector"}
      estilo={estilo}
      opciones={opciones}
      ausentes={editor ? ausentes : undefined}
      etiqueta="Indicadores de sostenibilidad"
    />
  );
}

/** «Tablero de sostenibilidad»: un tablero publicado, incrustado. Sin él (o sin migración), nada en la página pública. */
export function TableroIncrustado({ slug, editor = false }: { slug: string; editor?: boolean }) {
  const q = useTableroPublico(slug || undefined);
  if (!slug) return editor ? <AvisoVacio>Elija un tablero publicado en el panel de la derecha.</AvisoVacio> : null;
  if (q.isPending) return editor ? <AvisoVacio>Cargando el tablero…</AvisoVacio> : null;
  if (!q.data) return editor ? <AvisoVacio>No encuentro ese tablero publicado. Puede que se haya retirado, o que falte aplicar la migración 0204.</AvisoVacio> : null;
  return <TableroPublicado t={q.data} />;
}

/** Un tablero tal como lo entrega la base. */
export function TableroPublicado({ t }: { t: NonNullable<ReturnType<typeof useTableroPublico>["data"]> }) {
  return <TableroVista elementos={t.elementos} cifras={t.cifras} graficas={t.graficas} campus={t.campus} selector={t.selector} etiqueta={t.nombre} />;
}
