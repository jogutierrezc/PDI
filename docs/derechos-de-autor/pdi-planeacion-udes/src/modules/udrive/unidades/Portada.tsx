/* =============================================================================
   UDrive · Unidades de trabajo · portadas y tarjetas.

   Una unidad se reconoce de un vistazo por su rótulo: monograma, color, icono y
   una de cuatro composiciones, dentro de una misma familia visual. Reglas:

     · El texto nunca va sobre la imagen: va sobre papel o sobre una placa de color
       sólido (el acento tiene contraste ≥ 4,5:1 contra blanco).
     · Sin degradados decorativos. Sin tarjetas dentro de tarjetas.
     · Las composiciones: A banda, B lateral, C rótulo, D mosaico.
   ========================================================================== */

import type { CSSProperties, Ref } from "react";
import { useUrlCabecera } from "./datos";
import { aparienciaDe, textoBytes } from "./lib";
import type { Apariencia, IconoUnidad, Portada as TipoPortada, UnidadFila } from "./tipos";
import { ICONOS, NOMBRE_ROL } from "./tipos";

export function Glifo({ icono, tam = 20 }: { icono: IconoUnidad; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONOS[icono]?.d ?? ICONOS.chart.d} />
    </svg>
  );
}

function Patron({ tipo }: { tipo: TipoPortada }) {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);
  if (tipo === "lineas") return <>{n(18).map((i) => <path key={i} d={`M${(i - 4) * 40} 220L${(i - 4) * 40 + 220} -20`} />)}</>;
  if (tipo === "curvas") return <>{n(8).map((i) => <path key={i} d={`M-10 ${20 + i * 26} C 90 ${i * 26 - 20}, 160 ${60 + i * 26}, 260 ${20 + i * 26} S 380 ${i * 26}, 420 ${30 + i * 26}`} />)}</>;
  if (tipo === "puntos") {
    return <>{n(9).flatMap((y) => n(18).map((x) => <circle key={`${x}-${y}`} cx={x * 24 + 8} cy={y * 24 + 8} r={1.6 + ((x + y) % 4) * 0.6} fill="#fff" stroke="none" />))}</>;
  }
  if (tipo === "bloques") {
    return <>{[[20, 110, 70, 90], [100, 70, 60, 130], [170, 130, 80, 70], [260, 40, 50, 160], [320, 90, 70, 110]].map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill="#fff" stroke="none" opacity={0.5} />)}</>;
  }
  if (tipo === "trama") return <>{n(14).map((i) => <path key={`v${i}`} d={`M${i * 32} 0V200`} />)}{n(8).map((i) => <path key={`h${i}`} d={`M0 ${i * 30}H400`} />)}</>;
  return null;
}

/** La imagen de cabecera: propia (con su encuadre) o un patrón de la casa sobre el color de acento. */
export function Cabecera({ a }: { a: Pick<Apariencia, "acento" | "portada" | "imagenUrl" | "imagen"> }) {
  if (a.imagenUrl) {
    const e = a.imagen ?? { x: 50, y: 50, zoom: 1 };
    const estilo: CSSProperties = { objectPosition: `${e.x}% ${e.y}%`, transform: e.zoom > 1 ? `scale(${e.zoom})` : undefined, transformOrigin: `${e.x}% ${e.y}%` };
    return <div className="un-cv" aria-hidden="true"><img src={a.imagenUrl} alt="" draggable={false} style={estilo} /></div>;
  }
  return (
    <div className="un-cv" aria-hidden="true">
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" focusable="false">
        <rect width="400" height="200" fill={a.acento} />
        <g stroke="#fff" strokeOpacity={0.2} strokeWidth={2} fill="none"><Patron tipo={a.portada} /></g>
      </svg>
    </div>
  );
}

type Tam = "tarjeta" | "pagina";

/** La portada en una de sus cuatro composiciones. `como` es la etiqueta del título (h2 en la página, div en una tarjeta). */
export function Portada({ a, tam = "pagina", como = "div", portadaRef }: { a: Apariencia; tam?: Tam; como?: "h1" | "h2" | "div"; portadaRef?: Ref<HTMLDivElement> }) {
  const Titulo = como;
  const estilo = { "--ac": a.acento } as CSSProperties;
  const texto = (
    <div className="un-hero__txt">
      <Titulo className="un-hero__t">{a.nombre || "Nombre de la unidad"}</Titulo>
      {a.descripcion ? <p className="un-hero__d">{a.descripcion}</p> : null}
    </div>
  );
  const mono = <span className="un-mono un-hero__mono" aria-hidden="true">{a.monograma || "UT"}</span>;
  const base = `un-hero un-hero--${a.composicion} un-hero--${tam}`;
  if (a.composicion === "B") {
    return (
      <div className={base} style={estilo} ref={portadaRef}>
        <div className="un-hero__lado"><Cabecera a={a} />{mono}</div>
        <div className="un-hero__cuerpo">{texto}</div>
      </div>
    );
  }
  if (a.composicion === "C") {
    return (
      <div className={base} style={estilo} ref={portadaRef}>
        <span className="un-hero__giant" aria-hidden="true">{a.monograma || "UT"}</span>
        {texto}
      </div>
    );
  }
  if (a.composicion === "D") {
    return (
      <div className={base} style={estilo} ref={portadaRef}>
        <div className="un-hero__vis"><Cabecera a={a} /></div>
        <div className="un-hero__placa">{mono}{texto}</div>
      </div>
    );
  }
  return (
    <div className={base} style={estilo} ref={portadaRef}>
      <div className="un-hero__banda"><Cabecera a={a} /></div>
      <div className="un-hero__cuerpo">{mono}{texto}</div>
    </div>
  );
}

/** La portada de una unidad guardada: pide la dirección de su imagen. */
export function PortadaDeUnidad({ u, tam = "pagina", como = "div", portadaRef, previa }: { u: UnidadFila; tam?: Tam; como?: "h1" | "h2" | "div"; portadaRef?: Ref<HTMLDivElement>; previa?: Partial<Apariencia> }) {
  const url = useUrlCabecera(u.imagen?.ruta);
  return <Portada a={{ ...aparienciaDe(u, url.data ?? null), ...previa }} tam={tam} como={como} portadaRef={portadaRef} />;
}

/** El mismo cuerpo de tarjeta para el índice y para la vista previa del formulario. */
export function CuerpoTarjeta({ a, personas, detalle, etiqueta, tono = "normal" }: { a: Apariencia; personas: number; detalle: string; etiqueta: string; tono?: "normal" | "admin" | "aviso" }) {
  return (
    <>
      <Portada a={a} tam="tarjeta" como="div" />
      <div className="un-meta">
        <span>{personas} {personas === 1 ? "persona" : "personas"}</span>
        <span>{detalle}</span>
        <span className={`un-chip${tono === "admin" ? " un-chip--nav" : tono === "aviso" ? " un-chip--aviso" : ""}`}>{etiqueta}</span>
      </div>
    </>
  );
}

export function etiquetaDeRol(u: Pick<UnidadFila, "es_miembro" | "mi_rol">): string {
  return u.es_miembro ? NOMBRE_ROL[u.mi_rol] : "Administración general";
}

export function textoUso(u: Pick<UnidadFila, "uso_bytes" | "cuota_bytes">): string {
  return `${textoBytes(u.uso_bytes)} de ${textoBytes(u.cuota_bytes)}`;
}
