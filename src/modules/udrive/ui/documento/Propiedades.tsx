/* =============================================================================
   UDrive · el panel de la derecha: propiedades del bloque y del documento.

   «Bloque» muestra lo que se puede ajustar del bloque elegido, según su tipo;
   «Documento» tiene la portada, las fuentes de las citas APA y las cifras
   vivas que cambiaron. Los títulos y notas de tablas y gráficas se pueden dejar
   vacíos: entonces se usan los de «Cómo se ve en el documento» del archivo.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { falta as faltaFuente, fuenteNueva } from "../../lib/apa";
import { NOMBRE_BLOQUE, nuevoIdBloque } from "../../lib/documento";
import type { AnchoFigura, Bloque, Documento, Fuente } from "../../lib/documento";
import { aPlano, clavesDeCifras } from "../../lib/texto";
import { notaGrafica, notaTabla, tituloGrafica, tituloTabla } from "../../salida/Piezas";
import type { Recursos } from "../../salida/recursos";
import type { Figura } from "../../lib/numeracion";
import type { AccionesBloque } from "./Bloques";
import { PanelMapa } from "./PanelMapa";
import { PanelPilo } from "./PanelPilo";
import { CierreDelInforme, EstiloDelInforme, PortadaDelInforme } from "../estilos/PanelesInforme";
import { esBloqueDeTexto } from "../../datosPilo";
import type { ContextoPilo } from "../../datosPilo";

interface Props {
  doc: Documento;
  bloque: Bloque | null;
  recursos: Recursos;
  figura: Figura | undefined;
  editable: boolean;
  cambiosDeCifras: { clave: string; de: string; a: string }[];
  /** Pestaña inicial: la portada se edita en «Documento». */
  pestana: "bloque" | "documento";
  onPestana(p: "bloque" | "documento"): void;
  acc: AccionesBloque;
  cambiarDoc(fn: (d: Documento) => Documento, clave?: string): void;
  /** Lo que Pilo puede usar del informe para escribir en este bloque (cifras, fuentes, figuras). */
  contextoPilo(bloqueId: string): ContextoPilo;
  elegirArchivo(bloque: Bloque): void;
  elegirPortada(): void;
  abrirArchivo(tipo: "tabla" | "grafica", id: string): void;
  aceptarCifras(): void;
  /** Carpeta del informe: ahí se guardan los estilos que se crean desde él. */
  carpetaId: string | null;
  decir(m: string): void;
  abrirEstilo(id: string): void;
}

export function Propiedades(p: Props) {
  return (
    <aside className="ud-panel ud-panel--r" aria-label="Propiedades">
      <div className="es-seg" role="group" aria-label="Qué editar" style={{ justifySelf: "start" }}>
        <button type="button" aria-pressed={p.pestana === "bloque"} onClick={() => p.onPestana("bloque")}>Bloque</button>
        <button type="button" aria-pressed={p.pestana === "documento"} onClick={() => p.onPestana("documento")}>Documento</button>
      </div>
      {p.pestana === "documento" ? <PanelDocumento {...p} /> : p.bloque ? <PanelBloque {...p} bloque={p.bloque} /> : <SinBloque />}
    </aside>
  );
}

function SinBloque() {
  return (
    <div>
      <h3>Ningún bloque elegido</h3>
      <p className="ud-sub">Haga clic en un bloque de la hoja para ver sus propiedades, o en el «+» entre bloques para insertar uno.</p>
    </div>
  );
}

/* ---------- el bloque ---------------------------------------------------------------------------------- */

const ANCHOS: { id: AnchoFigura; texto: string }[] = [
  { id: "completo", texto: "Columna completa" },
  { id: "medio", texto: "Tres cuartos" },
  { id: "pequeno", texto: "La mitad" },
];

function PanelBloque({ doc, bloque: b, recursos, figura, editable, acc, elegirArchivo, abrirArchivo, contextoPilo }: Props & { bloque: Bloque }) {
  const poner = (cambio: Partial<Bloque>, clave?: string) => acc.cambiar({ ...b, ...cambio } as Bloque, clave ?? `p:${b.id}:${Object.keys(cambio).join(",")}`);
  const nombreArchivo = "archivoId" in b && b.archivoId ? (recursos.nombres.get(b.archivoId) ?? "Archivo que no veo") : "";
  return (
    <>
      <div>
        <h3>{figura ? figura.etiqueta : NOMBRE_BLOQUE[b.tipo]}</h3>
        <p className="ud-sub">{AYUDA[b.tipo]}</p>
      </div>

      {b.tipo === "capitulo" ? (
        <>
          <label className="es-fl">
            Nivel
            <select className="es-inp" value={b.nivel} disabled={!editable} onChange={(e) => poner({ nivel: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>1 · Capítulo (empieza hoja)</option>
              <option value={2}>2 · Sección</option>
              <option value={3}>3 · Apartado</option>
            </select>
          </label>
          <label className="es-fl">
            Título
            <input type="text" className="es-inp" value={b.titulo} maxLength={300} disabled={!editable} onChange={(e) => poner({ titulo: e.target.value }, `t:${b.id}`)} />
          </label>
        </>
      ) : null}

      {b.tipo === "salto" ? (
        <label className="es-fl">
          Orientación de lo que sigue
          <select className="es-inp" value={b.orientacion ?? ""} disabled={!editable} onChange={(e) => poner({ orientacion: (e.target.value || undefined) as "vertical" | "horizontal" | undefined })}>
            <option value="">La misma de antes</option>
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal (para tablas anchas)</option>
          </select>
        </label>
      ) : null}

      {b.tipo === "mapa" ? <PanelMapa b={b} editable={editable} anchos={ANCHOS} poner={poner} /> : null}

      {b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota" ? <ResumenTexto texto={b.texto} /> : null}

      {b.tipo === "lista" ? (
        <label className="es-ck">
          <input type="checkbox" checked={b.ordenada} disabled={!editable} onChange={(e) => poner({ ordenada: e.target.checked })} /> Lista numerada
        </label>
      ) : null}

      {editable && esBloqueDeTexto(b) ? <PanelPilo key={b.id} bloque={b} contexto={() => contextoPilo(b.id)} acc={acc} /> : null}

      {b.tipo === "tabla" || b.tipo === "grafica" || b.tipo === "imagen" ? (
        <>
          <div className="es-fl">
            {b.tipo === "tabla" ? "Tabla de UDrive" : b.tipo === "grafica" ? "Gráfica de UDrive" : "Imagen de UDrive"}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="es-inp" style={{ flex: 1 }}>{nombreArchivo || "Sin elegir"}</span>
              {editable ? <button type="button" className="es-btn es-btn--sm" onClick={() => elegirArchivo(b)}>{nombreArchivo ? "Cambiar" : "Elegir"}</button> : null}
            </div>
          </div>
          <label className="es-fl">
            Título de la figura
            <input
              type="text"
              className="es-inp"
              value={b.titulo}
              maxLength={300}
              disabled={!editable}
              placeholder={b.tipo === "tabla" ? tituloTabla({ ...b, titulo: "" }, recursos.tablas.get(b.archivoId)) : b.tipo === "grafica" ? tituloGrafica({ ...b, titulo: "" }, recursos.graficas.get(b.archivoId)) : "Título del pie"}
              onChange={(e) => poner({ titulo: e.target.value }, `t:${b.id}:titulo`)}
            />
          </label>
          <label className="es-fl">
            Nota o fuente
            <input
              type="text"
              className="es-inp"
              value={b.nota}
              maxLength={600}
              disabled={!editable}
              placeholder={b.tipo === "tabla" ? notaTabla({ ...b, nota: "" }, recursos.tablas.get(b.archivoId)) : b.tipo === "grafica" ? notaGrafica({ ...b, nota: "" }, recursos.graficas.get(b.archivoId)) : "Fuente de la imagen"}
              onChange={(e) => poner({ nota: e.target.value }, `t:${b.id}:nota`)}
            />
          </label>
          {b.tipo === "tabla" || b.tipo === "grafica" ? <p className="es-note">Si lo deja vacío, se usa lo que dice «Cómo se ve en el documento» del archivo.</p> : null}
        </>
      ) : null}

      {b.tipo === "imagen" ? (
        <label className="es-fl">
          Texto alternativo (para quien no ve la imagen)
          <input type="text" className="es-inp" value={b.alt} maxLength={300} disabled={!editable} onChange={(e) => poner({ alt: e.target.value }, `t:${b.id}:alt`)} />
        </label>
      ) : null}

      {b.tipo === "grafica" || b.tipo === "imagen" ? (
        <label className="es-fl">
          Ancho
          <select className="es-inp" value={b.ancho} disabled={!editable} onChange={(e) => poner({ ancho: e.target.value as AnchoFigura })}>
            {ANCHOS.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}
          </select>
        </label>
      ) : null}

      {b.tipo === "tabla" ? (
        <>
          <label className="es-ck"><input type="checkbox" checked={b.mapaCalor} disabled={!editable} onChange={(e) => poner({ mapaCalor: e.target.checked })} /> Mapa de calor de la tabla</label>
          <label className="es-ck"><input type="checkbox" checked={b.repetirEncabezado} disabled={!editable} onChange={(e) => poner({ repetirEncabezado: e.target.checked })} /> Repetir el encabezado en cada página</label>
        </>
      ) : null}

      {b.tipo === "tabla" || b.tipo === "grafica" || b.tipo === "imagen" ? (
        <label className="es-ck"><input type="checkbox" checked={b.enIndice} disabled={!editable} onChange={(e) => poner({ enIndice: e.target.checked })} /> Aparece en el índice de {b.tipo === "tabla" ? "tablas" : b.tipo === "grafica" ? "gráficas" : "ilustraciones"}</label>
      ) : null}

      {(b.tipo === "tabla" || b.tipo === "grafica") && b.archivoId ? (
        <button type="button" className="es-btn" style={{ justifyContent: "center" }} onClick={() => abrirArchivo(b.tipo as "tabla" | "grafica", b.archivoId)}>
          <Icon name="external" size={16} />
          {b.tipo === "tabla" ? "Abrir en el editor de tablas" : "Abrir en el constructor de gráficas"}
        </button>
      ) : null}

      {b.tipo === "referencias" ? (
        <>
          <label className="es-fl">
            Título
            <input type="text" className="es-inp" value={b.titulo} maxLength={300} disabled={!editable} onChange={(e) => poner({ titulo: e.target.value }, `t:${b.id}`)} />
          </label>
          <p className="es-note">La lista se arma sola con las fuentes que cita el texto ({doc.fuentes.length} definidas). Se define cada fuente en «Documento».</p>
        </>
      ) : null}
    </>
  );
}

const AYUDA: Record<Bloque["tipo"], string> = {
  capitulo: "Los capítulos arman el índice de contenido solos.",
  parrafo: "Escriba en la hoja. Seleccione texto para dar formato.",
  lista: "Enter agrega un elemento; Retroceso en uno vacío lo quita.",
  tabla: "Los datos salen de la tabla: si cambia, el documento también.",
  grafica: "Se alimenta de una tabla; si la tabla cambia, la gráfica también.",
  imagen: "Se numera como «Ilustración» y lleva el pie arriba.",
  mapa: "Un mapa de OpenStreetMap. Se numera como «Ilustración» y lleva el pie arriba.",
  destacado: "Una idea clave en un cuadro aparte.",
  nota: "Una nota o fuente suelta.",
  salto: "Lo que sigue empieza en hoja nueva. Puede pasar a horizontal para una tabla ancha.",
  referencias: "La bibliografía en estilo APA 7, generada.",
};

function ResumenTexto({ texto }: { texto: string }) {
  const plano = aPlano(texto);
  const palabras = plano.trim() ? plano.trim().split(/\s+/).length : 0;
  const cifras = clavesDeCifras(texto);
  return (
    <p className="es-note">
      {palabras} {palabras === 1 ? "palabra" : "palabras"}
      {cifras.length ? ` · ${cifras.length} ${cifras.length === 1 ? "cifra viva" : "cifras vivas"}` : ""}
    </p>
  );
}

/* ---------- el documento ------------------------------------------------------------------------------------ */

function PanelDocumento({ doc, editable, cambiarDoc, elegirPortada, recursos, cambiosDeCifras, aceptarCifras, carpetaId, decir, abrirEstilo }: Props) {
  return (
    <>
      <EstiloDelInforme doc={doc} editable={editable} cambiarDoc={cambiarDoc} carpetaId={carpetaId} decir={decir} abrirEstilo={abrirEstilo} recursos={recursos} />
      <PortadaDelInforme doc={doc} editable={editable} cambiarDoc={cambiarDoc} elegirPortada={elegirPortada} recursos={recursos} />
      <CierreDelInforme doc={doc} editable={editable} cambiarDoc={cambiarDoc} />

      <div className="ud-doc-tarjeta">
        <h3>Cifras vivas</h3>
        {cambiosDeCifras.length ? (
          <>
            <p className="es-note" role="status">{cambiosDeCifras.length === 1 ? "Una cifra cambió" : `${cambiosDeCifras.length} cifras cambiaron`} desde que las revisó:</p>
            <ul className="ud-lista-cambios">
              {cambiosDeCifras.map((c) => <li key={c.clave} data-t="cambiado"><b>[[{c.clave}]]</b>de {c.de} a {c.a}</li>)}
            </ul>
            {editable ? <button type="button" className="es-btn es-btn--sm" onClick={aceptarCifras}>Aceptar los valores nuevos</button> : null}
          </>
        ) : (
          <p className="es-note">Las cifras vivas siguen a UDES en Cifras. Si una cambia, aquí se avisa; al aprobar el documento se congelan.</p>
        )}
      </div>

      <Fuentes doc={doc} editable={editable} cambiarDoc={cambiarDoc} />
    </>
  );
}

/* ---------- las fuentes de las citas ------------------------------------------------------------------------------ */

function Fuentes({ doc, editable, cambiarDoc }: { doc: Documento; editable: boolean; cambiarDoc: Props["cambiarDoc"] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const cambiar = (f: Fuente) => cambiarDoc((d) => ({ ...d, fuentes: d.fuentes.map((x) => (x.id === f.id ? f : x)) }), `fuente:${f.id}`);
  return (
    <div className="ud-doc-tarjeta">
      <h3>Fuentes de las citas (APA 7)</h3>
      {doc.fuentes.length === 0 ? <p className="es-note">Defina cada fuente una vez y cítela en el texto con «Cita APA». La bibliografía se genera sola.</p> : null}
      {doc.fuentes.map((f) => (
        <div key={f.id} className="ud-com">
          <header>
            <b>{f.titulo.trim() || "Fuente sin título"}</b>
            <button type="button" className="es-btn es-btn--sm es-btn--ghost" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>{abierta === f.id ? "Cerrar" : "Editar"}</button>
          </header>
          {faltaFuente(f) ? <p style={{ color: "var(--es-warn)" }}>{faltaFuente(f)}</p> : null}
          {abierta === f.id ? (
            <>
              <label className="es-fl">Tipo
                <select className="es-inp" value={f.tipo} disabled={!editable} onChange={(e) => cambiar({ ...f, tipo: e.target.value as Fuente["tipo"] })}>
                  <option value="libro">Libro</option><option value="articulo">Artículo de revista</option><option value="informe">Informe</option><option value="web">Página web</option>
                </select>
              </label>
              <label className="es-fl">Autores (uno por línea: «Apellido, I.»)<textarea className="es-inp" rows={2} value={f.autores} maxLength={400} disabled={!editable} onChange={(e) => cambiar({ ...f, autores: e.target.value })} /></label>
              <label className="es-fl">Año<input type="text" className="es-inp" value={f.anio} maxLength={12} disabled={!editable} onChange={(e) => cambiar({ ...f, anio: e.target.value })} /></label>
              <label className="es-fl">Título<input type="text" className="es-inp" value={f.titulo} maxLength={500} disabled={!editable} onChange={(e) => cambiar({ ...f, titulo: e.target.value })} /></label>
              <label className="es-fl">{f.tipo === "articulo" ? "Revista" : f.tipo === "web" ? "Sitio web" : f.tipo === "informe" ? "Entidad" : "Editorial"}<input type="text" className="es-inp" value={f.origen} maxLength={300} disabled={!editable} onChange={(e) => cambiar({ ...f, origen: e.target.value })} /></label>
              {f.tipo === "articulo" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label className="es-fl">Volumen<input type="text" className="es-inp" value={f.volumen} maxLength={40} disabled={!editable} onChange={(e) => cambiar({ ...f, volumen: e.target.value })} /></label>
                  <label className="es-fl">Páginas<input type="text" className="es-inp" value={f.paginas} maxLength={40} disabled={!editable} onChange={(e) => cambiar({ ...f, paginas: e.target.value })} /></label>
                </div>
              ) : null}
              <label className="es-fl">Enlace<input type="text" className="es-inp" value={f.url} maxLength={600} disabled={!editable} onChange={(e) => cambiar({ ...f, url: e.target.value })} /></label>
              {editable ? <button type="button" className="es-btn es-btn--sm" onClick={() => cambiarDoc((d) => ({ ...d, fuentes: d.fuentes.filter((x) => x.id !== f.id) }))}><Icon name="trash" size={14} />Quitar la fuente</button> : null}
            </>
          ) : null}
        </div>
      ))}
      {editable ? (
        <button
          type="button"
          className="es-btn es-btn--sm"
          onClick={() => {
            const id = `f${nuevoIdBloque().slice(1)}`;
            cambiarDoc((d) => ({ ...d, fuentes: [...d.fuentes, fuenteNueva(id)] }));
            setAbierta(id);
          }}
        >
          <Icon name="plus" size={14} />Agregar fuente
        </button>
      ) : null}
    </div>
  );
}
