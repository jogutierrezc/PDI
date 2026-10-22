/* =============================================================================
   UDrive · la barra de formato del editor de documento.

   Estilo del bloque, negrita, cursiva, enlace, cifra viva, cita APA y
   referencia cruzada (estos cuatro últimos abren un cuadrito para elegir),
   atajos para insertar tabla, gráfica, imagen y nota, deshacer y rehacer,
   «Página N de M» (estimada) y el zoom. Los botones de formato no le quitan
   el foco al texto (mousedown no se propaga) para no perder la selección.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { CifraCatalogo } from "../../datosDocumento";
import type { Fuente, TipoBloque } from "../../lib/documento";
import type { Figura } from "../../lib/numeracion";
import { enlaceSeguro } from "../../lib/texto";

export type Estilo = "parrafo" | "capitulo-1" | "capitulo-2" | "capitulo-3" | "lista" | "destacado";

type Pop = "cifra" | "cita" | "ref" | "enlace";

interface Props {
  editable: boolean;
  hayTexto: boolean;
  estilo: Estilo | "";
  onEstilo(e: Estilo): void;
  onNegrita(): void;
  onCursiva(): void;
  onEnlace(url: string): void;
  onCifra(clave: string): void;
  onCita(fuente: string, extra: string): void;
  onRef(bloque: string): void;
  onNuevaFuente(): void;
  guardarSeleccion(): void;
  restaurarSeleccion(): void;
  catalogo: readonly CifraCatalogo[];
  catalogoError: string | null;
  fuentes: readonly Fuente[];
  figuras: readonly Figura[];
  onInsertar(t: TipoBloque): void;
  pagina: string;
  zoom: number;
  onZoom(z: number): void;
  onAjustar(): void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onDeshacer(): void;
  onRehacer(): void;
}

/** Los botones de formato no mueven el foco: así la selección del texto sigue ahí. */
const sinFoco = (e: MouseEvent) => e.preventDefault();

export function Herramientas(p: Props) {
  const [pop, setPop] = useState<{ tipo: Pop; x: number; y: number } | null>(null);
  const abrir = (tipo: Pop, e: MouseEvent<HTMLElement>) => {
    p.guardarSeleccion();
    const r = e.currentTarget.getBoundingClientRect();
    setPop(pop?.tipo === tipo ? null : { tipo, x: Math.min(r.left, window.innerWidth - 320), y: r.bottom + 6 });
  };
  const hecho = (fn: () => void) => {
    setPop(null);
    window.setTimeout(() => {
      p.restaurarSeleccion();
      fn();
    }, 0);
  };

  return (
    <div className="ud-doc-bar" role="toolbar" aria-label="Formato">
      <button type="button" className="es-btn es-btn--sm" aria-label="Deshacer (Ctrl + Z)" title="Deshacer (Ctrl + Z)" disabled={!p.editable || !p.puedeDeshacer} onClick={p.onDeshacer}>
        <Icon name="undo" size={16} />
      </button>
      <button type="button" className="es-btn es-btn--sm" aria-label="Rehacer (Ctrl + Mayús + Z)" title="Rehacer (Ctrl + Mayús + Z)" disabled={!p.editable || !p.puedeRehacer} onClick={p.onRehacer}>
        <Icon name="undo" size={16} style={{ transform: "scaleX(-1)" }} />
      </button>
      <span className="ud-sep" />
      <select className="es-inp" style={{ width: 170 }} aria-label="Estilo del bloque" value={p.estilo} disabled={!p.editable || !p.estilo} onChange={(e) => p.onEstilo(e.target.value as Estilo)}>
        {!p.estilo ? <option value="">Elija un bloque de texto</option> : null}
        <option value="parrafo">Párrafo</option>
        <option value="capitulo-1">Título · capítulo</option>
        <option value="capitulo-2">Título · sección</option>
        <option value="capitulo-3">Título · apartado</option>
        <option value="lista">Lista</option>
        <option value="destacado">Cuadro destacado</option>
      </select>
      <div className="es-seg" role="group" aria-label="Texto">
        <button type="button" aria-label="Negrita (Ctrl + B)" title="Negrita (Ctrl + B)" disabled={!p.editable || !p.hayTexto} onMouseDown={sinFoco} onClick={p.onNegrita} style={{ fontWeight: 800 }}>N</button>
        <button type="button" aria-label="Cursiva (Ctrl + I)" title="Cursiva (Ctrl + I)" disabled={!p.editable || !p.hayTexto} onMouseDown={sinFoco} onClick={p.onCursiva} style={{ fontStyle: "italic", fontFamily: "serif" }}>C</button>
        <button type="button" aria-label="Enlace (Ctrl + K)" title="Enlace (Ctrl + K)" disabled={!p.editable || !p.hayTexto} aria-haspopup="dialog" onMouseDown={sinFoco} onClick={(e) => abrir("enlace", e)}>
          <Icon name="link" size={16} />
        </button>
      </div>
      <button type="button" className="es-btn es-btn--sm" disabled={!p.editable || !p.hayTexto} aria-haspopup="dialog" onMouseDown={sinFoco} onClick={(e) => abrir("cifra", e)}>
        <span className="ud-doc-cifra-btn">[[ ]]</span>Insertar cifra viva
      </button>
      <button type="button" className="es-btn es-btn--sm" disabled={!p.editable || !p.hayTexto} aria-haspopup="dialog" onMouseDown={sinFoco} onClick={(e) => abrir("cita", e)}>Cita APA</button>
      <button type="button" className="es-btn es-btn--sm" disabled={!p.editable || !p.hayTexto || !p.figuras.length} aria-haspopup="dialog" title={p.figuras.length ? undefined : "Aún no hay figuras numeradas a las que referirse"} onMouseDown={sinFoco} onClick={(e) => abrir("ref", e)}>Referencia</button>
      <span className="ud-sep" />
      {(["tabla", "grafica", "imagen", "nota"] as const).map((t) => (
        <button key={t} type="button" className="es-btn es-btn--sm" disabled={!p.editable} onClick={() => p.onInsertar(t)}>
          {t === "tabla" ? "Tabla" : t === "grafica" ? "Gráfica" : t === "imagen" ? "Imagen" : "Nota o fuente"}
        </button>
      ))}
      <span className="es-grow" />
      <span className="ud-num" title="Estimada sobre la hoja continua; la exacta se calcula al exportar">Página <b>{p.pagina}</b></span>
      <div className="es-seg" role="group" aria-label="Zoom">
        <button type="button" aria-label="Alejar" onClick={() => p.onZoom(Math.max(0.4, Math.round((p.zoom - 0.1) * 10) / 10))}>−</button>
        <button type="button" aria-label="Ajustar al ancho" className="ud-num" onClick={p.onAjustar}>{Math.round(p.zoom * 100)} %</button>
        <button type="button" aria-label="Acercar" onClick={() => p.onZoom(Math.min(1.5, Math.round((p.zoom + 0.1) * 10) / 10))}>+</button>
      </div>

      {pop ? (
        <Popover x={pop.x} y={pop.y} onCerrar={() => setPop(null)} titulo={pop.tipo === "enlace" ? "Enlace" : pop.tipo === "cifra" ? "Cifra viva" : pop.tipo === "cita" ? "Cita APA" : "Referencia cruzada"}>
          {pop.tipo === "enlace" ? <FormEnlace onListo={(u) => hecho(() => p.onEnlace(u))} /> : null}
          {pop.tipo === "cifra" ? <FormCifra catalogo={p.catalogo} error={p.catalogoError} onListo={(k) => hecho(() => p.onCifra(k))} /> : null}
          {pop.tipo === "cita" ? <FormCita fuentes={p.fuentes} onNueva={() => (setPop(null), p.onNuevaFuente())} onListo={(f, x) => hecho(() => p.onCita(f, x))} /> : null}
          {pop.tipo === "ref" ? <FormRef figuras={p.figuras} onListo={(b) => hecho(() => p.onRef(b))} /> : null}
        </Popover>
      ) : null}
    </div>
  );
}

function Popover({ x, y, titulo, onCerrar, children }: { x: number; y: number; titulo: string; onCerrar(): void; children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    raiz.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, []);
  useEffect(() => {
    const fuera = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && onCerrar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onCerrar());
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc, true);
    return () => (document.removeEventListener("pointerdown", fuera), document.removeEventListener("keydown", esc, true));
  }, [onCerrar]);
  return (
    <div ref={raiz} className="es-menu" role="dialog" aria-label={titulo} style={{ left: x, top: y, width: 300, padding: 12, gap: 8 }}>
      <div className="es-h" style={{ padding: 0 }}>{titulo}</div>
      {children}
    </div>
  );
}

function FormEnlace({ onListo }: { onListo(url: string): void }) {
  const [url, setUrl] = useState("https://");
  const valido = enlaceSeguro(url);
  return (
    <form onSubmit={(e) => (e.preventDefault(), valido && onListo(url.trim()))} style={{ display: "grid", gap: 8 }}>
      <label className="es-fl">Dirección (http o https)<input type="text" className="es-inp" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!valido} /></label>
      <button type="submit" className="es-btn es-btn--pri" disabled={!valido} style={{ justifyContent: "center" }}>Poner el enlace</button>
    </form>
  );
}

function FormCifra({ catalogo, error, onListo }: { catalogo: readonly CifraCatalogo[]; error: string | null; onListo(clave: string): void }) {
  const [clave, setClave] = useState(catalogo[0]?.clave ?? "");
  const [propia, setPropia] = useState("");
  const efectiva = (propia.trim() || clave).toLowerCase();
  const valida = /^[a-z0-9_]{1,60}$/.test(efectiva);
  return (
    <form onSubmit={(e) => (e.preventDefault(), valida && onListo(efectiva))} style={{ display: "grid", gap: 8 }}>
      {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}
      {catalogo.length ? (
        <label className="es-fl">
          Cifra de UDES en Cifras
          <select className="es-inp" value={clave} onChange={(e) => setClave(e.target.value)}>
            {catalogo.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </select>
        </label>
      ) : null}
      <label className="es-fl">
        {catalogo.length ? "…o escriba la clave" : "Clave de la cifra"}
        <input type="text" className="es-inp" value={propia} placeholder="matric" onChange={(e) => setPropia(e.target.value)} />
      </label>
      <p className="es-note">Se escribe como [[{efectiva || "clave"}]] y sigue el valor de UDES en Cifras.</p>
      <button type="submit" className="es-btn es-btn--pri" disabled={!valida} style={{ justifyContent: "center" }}>Insertar la cifra</button>
    </form>
  );
}

function FormCita({ fuentes, onNueva, onListo }: { fuentes: readonly Fuente[]; onNueva(): void; onListo(fuente: string, extra: string): void }) {
  const [id, setId] = useState(fuentes[0]?.id ?? "");
  const [extra, setExtra] = useState("");
  if (!fuentes.length) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p className="es-note">Todavía no hay fuentes. Defina la primera para citarla.</p>
        <button type="button" className="es-btn es-btn--pri" onClick={onNueva} style={{ justifyContent: "center" }}>Agregar una fuente</button>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => (e.preventDefault(), id && onListo(id, extra))} style={{ display: "grid", gap: 8 }}>
      <label className="es-fl">
        Fuente
        <select className="es-inp" value={id} onChange={(e) => setId(e.target.value)}>
          {fuentes.map((f) => <option key={f.id} value={f.id}>{f.titulo.trim() || "Fuente sin título"}{f.anio ? ` (${f.anio})` : ""}</option>)}
        </select>
      </label>
      <label className="es-fl">Página (opcional)<input type="text" className="es-inp" maxLength={40} value={extra} placeholder="p. 12" onChange={(e) => setExtra(e.target.value)} /></label>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="es-btn es-btn--pri" style={{ flex: 1, justifyContent: "center" }}>Insertar la cita</button>
        <button type="button" className="es-btn" onClick={onNueva}>Otra fuente</button>
      </div>
    </form>
  );
}

function FormRef({ figuras, onListo }: { figuras: readonly Figura[]; onListo(bloque: string): void }) {
  const [id, setId] = useState(figuras[0]?.bloqueId ?? "");
  return (
    <form onSubmit={(e) => (e.preventDefault(), id && onListo(id))} style={{ display: "grid", gap: 8 }}>
      <label className="es-fl">
        Figura
        <select className="es-inp" value={id} onChange={(e) => setId(e.target.value)}>
          {figuras.map((f) => <option key={f.bloqueId} value={f.bloqueId}>{f.etiqueta}</option>)}
        </select>
      </label>
      <p className="es-note">El número se corrige solo si mueve la figura.</p>
      <button type="submit" className="es-btn es-btn--pri" style={{ justifyContent: "center" }}>Insertar la referencia</button>
    </form>
  );
}
