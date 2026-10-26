/* =============================================================================
   Informes Institucionales · Vista Carta y PDF · las hojas.

   Cada función dibuja una hoja completa en milímetros (estilos en vista.css):
   la de contenido con su cabecera de dos niveles y su pie, la portada (cinco
   composiciones), el índice, el cierre y la contraportada. Son puras: reciben
   lo que dibujan y no leen la base. La imagen propia llega como URL ya firmada.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { PAPELES, SEDES, hayContacto, tamanoTituloMm } from "./perfil";
import type { AlineacionFoto, CierreDiseno, ContraportadaDiseno, DisenoInforme, EvaluacionAcento, Papel, PerfilOficina, PortadaDiseno } from "./perfil";

export const LOGO_BLANCO = "/boletin/logo-udes-blanco.png";
export const LOGO_COLOR = "/logo-udes.svg";
export const EDIFICIOS = "/boletin/cabecera-edificios.png";
export const FOTO_PORTADA = "/boletin/portada.jpg";
export const FOTO_CONTRAPORTADA = "/boletin/contraportada.jpg";

/** Marca de estado del pie: cifras en vivo (borrador) o foto con su fecha (enviado o aprobado). */
export interface MarcaEstado {
  e: "vivo" | "foto";
  texto: string;
}

/** Lo que toda hoja necesita saber del informe. */
export interface ContextoHoja {
  papel: Papel;
  perfil: PerfilOficina;
  acento: EvaluacionAcento;
  anio: string;
  /** Escudo propio ya firmado; sin él se usa el monograma. */
  escudoUrl: string | null;
  marca: MarcaEstado;
}

/** Variables de la hoja: tamaño del papel y colores de marco. */
export function varsHoja(papel: Papel, acento: EvaluacionAcento): CSSProperties {
  const m = PAPELES[papel];
  return {
    "--pw": `${m.ancho}mm`,
    "--ph": `${m.alto}mm`,
    "--bw": `${m.cuerpoAncho}mm`,
    "--acc": acento.hex,
    "--acc-tx": acento.texto,
  } as CSSProperties;
}

const nombreCorto = (nombre: string): string => (nombre.length > 52 ? `${nombre.slice(0, 51).trimEnd()}…` : nombre);

/** El monograma o el escudo de la oficina. */
export function Emblema({ ctx }: { ctx: ContextoHoja }) {
  if (ctx.escudoUrl) return <img className="vi-emb-img" src={ctx.escudoUrl} alt="" />;
  const m = ctx.perfil.monograma;
  return (
    <span className="vi-emb" data-n={m.length} aria-hidden="true">
      {m}
    </span>
  );
}

/* ---------- Hoja de contenido ---------- */

export function HojaContenido({
  ctx,
  titulo,
  folio,
  children,
  referencia,
  ariaLabel,
}: {
  ctx: ContextoHoja;
  titulo: string;
  folio: number;
  children: ReactNode;
  referencia?: (el: HTMLDivElement | null) => void;
  ariaLabel?: string;
}) {
  const lado = folio % 2 === 0 ? "izq" : "der";
  const pie = [ctx.perfil.pie || ctx.perfil.nombre, ctx.perfil.contacto.correo].filter(Boolean).join(" · ");
  return (
    <section className="vi-pg" style={varsHoja(ctx.papel, ctx.acento)} aria-label={ariaLabel ?? `Página ${folio}, ${titulo}`}>
      <div className="vi-hd">
        <div className="vi-hd-bar">
          <img src={LOGO_BLANCO} alt="Universidad de Santander" />
          <span>
            Informe de gestión {ctx.anio} · {nombreCorto(ctx.perfil.nombre)}
          </span>
        </div>
        <div className="vi-hd-band">
          <strong>{titulo}</strong>
          <img src={EDIFICIOS} alt="" />
        </div>
      </div>
      <div className="vi-bd" ref={referencia}>
        {children}
      </div>
      <footer className="vi-ft" data-side={lado}>
        <span className="vi-ft-s">{pie}</span>
        <span className="vi-ft-t" data-e={ctx.marca.e}>
          {ctx.marca.texto}
        </span>
        <span className="vi-ft-f">
          <b>{folio < 10 ? `0${folio}` : folio}</b>
        </span>
      </footer>
    </section>
  );
}

/** Encabezado de sección: código (número o monograma), título y una línea de contexto. */
export function EncabezadoSeccion({ codigo, titulo, linea }: { codigo: string; titulo: string; linea?: string }) {
  return (
    <div className="vi-sec-h">
      <span className="vi-code" data-n={codigo.length}>
        {codigo}
      </span>
      <div>
        <h2>{titulo}</h2>
        {linea ? <p>{linea}</p> : null}
      </div>
    </div>
  );
}

/* ---------- Índice ---------- */

export interface EntradaContenido {
  titulo: string;
  pagina: number | null;
  numero?: string;
}

export function PaginaContenido({ ctx, entradas, folio = 2 }: { ctx: ContextoHoja; entradas: EntradaContenido[]; folio?: number }) {
  return (
    <HojaContenido ctx={ctx} titulo="Contenido" folio={folio}>
      <ul className="vi-toc">
        {entradas.map((e, i) => (
          <li key={i}>
            {e.numero ? <small>{e.numero}</small> : null}
            <span>{e.titulo}</span>
            <i />
            <b>{e.pagina ?? "·"}</b>
          </li>
        ))}
      </ul>
    </HojaContenido>
  );
}

/* ---------- Portada ---------- */

const YDE: Record<AlineacionFoto, number> = { arriba: 0, centro: 50, abajo: 100 };

/** Estilo de la imagen según el encuadre: posición, zoom y punto de anclaje coinciden para que arrastrar sea predecible. */
export function estiloFoto(x: number, y: number, zoom: number): CSSProperties {
  return { objectPosition: `${x}% ${y}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: `${x}% ${y}%` };
}

function FotoSuperior({ portada, url }: { portada: PortadaDiseno; url: string | null }) {
  // Imagen propia con su encuadre; foto institucional con la alineación elegida.
  const propia = portada.fondo === "propia" && portada.foto && url;
  const fuente = propia ? url : portada.fondo === "foto" ? FOTO_PORTADA : null;
  const estilo = propia ? estiloFoto(portada.foto!.x, portada.foto!.y, portada.foto!.zoom) : estiloFoto(50, YDE[portada.alineacionFoto], 1);
  return <div className="vi-foto vi-c1-ph">{fuente ? <img src={fuente} alt="" style={estilo} /> : null}</div>;
}

export function PaginaPortada({ ctx, portada, fotoUrl }: { ctx: ContextoHoja; portada: PortadaDiseno; fotoUrl: string | null }) {
  const al = portada.alineacion;
  const centro = al === "centro";
  const tam = tamanoTituloMm(portada);
  const h1 = <h1 style={{ fontSize: `${tam}mm` }}>{portada.titulo}</h1>;
  const sub = portada.subtitulo ? <p className="vi-sub">{portada.subtitulo}</p> : null;
  const anio = portada.anio;
  const eyebrow = (
    <p className="vi-eyebrow" style={{ marginBottom: 0 }}>
      Informe de gestión{anio ? ` · ${anio}` : ""}
    </p>
  );
  const unidad = (
    <div className="vi-un" style={centro ? { justifyContent: "center" } : undefined}>
      <Emblema ctx={ctx} />
      <div>
        <strong>{portada.unidad || ctx.perfil.nombre}</strong>
        {portada.ciclo ? <span>{portada.ciclo}</span> : null}
      </div>
    </div>
  );
  const regla = <i className="vi-rule" style={{ background: ctx.acento.hex, marginInline: centro ? "auto" : undefined }} />;
  const vars = varsHoja(ctx.papel, ctx.acento);

  let cuerpo: ReactNode;
  switch (portada.composicion) {
    case 1:
      cuerpo = (
        <div className="vi-cv">
          <FotoSuperior portada={portada} url={fotoUrl} />
          <div className="vi-c1-tab">
            <img src={LOGO_COLOR} alt="Universidad de Santander" />
          </div>
          <div className="vi-c1-txt" data-al={al}>
            {eyebrow}
            {h1}
            {regla}
            {sub}
          </div>
          <div className="vi-c1-foot" data-al={al}>
            {unidad}
          </div>
        </div>
      );
      break;
    case 2:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c2-top">
            <img className="vi-logo" src={LOGO_COLOR} alt="Universidad de Santander" />
            <Emblema ctx={ctx} />
          </div>
          <div className="vi-c2-blk" data-al={al}>
            <p className="vi-eyebrow">Informe de gestión{anio ? ` · ${anio}` : ""}</p>
            {h1}
            {sub}
            <div className="vi-un" style={centro ? { justifyContent: "center" } : undefined}>
              <div>
                <strong>{portada.unidad || ctx.perfil.nombre}</strong>
                {portada.ciclo ? <span>{portada.ciclo}</span> : null}
              </div>
            </div>
          </div>
        </div>
      );
      break;
    case 3:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c3-top">
            <img className="vi-logo" src={LOGO_COLOR} alt="Universidad de Santander" />
            <Emblema ctx={ctx} />
          </div>
          <i className="vi-c3-rule" />
          {anio ? (
            <div className="vi-c3-yr" aria-hidden="true">
              {anio}
            </div>
          ) : null}
          <div className="vi-c3-txt">
            {eyebrow}
            {h1}
            {sub}
          </div>
          <div className="vi-c3-foot">{unidad}</div>
        </div>
      );
      break;
    case 4:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c4-col">
            {ctx.escudoUrl ? <img className="vi-emb-img" src={ctx.escudoUrl} alt="" /> : <span className="vi-emb" data-n={ctx.perfil.monograma.length}>{ctx.perfil.monograma}</span>}
            {anio ? (
              <div className="vi-c4-yr" aria-hidden="true">
                {anio}
              </div>
            ) : null}
          </div>
          <img className="vi-c4-logo" src={LOGO_COLOR} alt="Universidad de Santander" />
          <div className="vi-c4-txt">
            {eyebrow}
            {h1}
            {regla}
            {sub}
          </div>
          <div className="vi-c4-foot">
            <div className="vi-un">
              <div>
                <strong>{portada.unidad || ctx.perfil.nombre}</strong>
                {portada.ciclo ? <span>{portada.ciclo}</span> : null}
              </div>
            </div>
          </div>
        </div>
      );
      break;
    default:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-hd">
            <div className="vi-hd-bar">
              <img src={LOGO_BLANCO} alt="Universidad de Santander" />
              <span>{nombreCorto(ctx.perfil.nombre)}</span>
            </div>
            <div className="vi-hd-band">
              <strong>Informe de gestión{anio ? ` · ${anio}` : ""}</strong>
              <img src={EDIFICIOS} alt="" />
            </div>
          </div>
          <div className="vi-c5-txt" data-al={al}>
            {h1}
            {regla}
            {sub}
          </div>
          <dl className="vi-c5-facts">
            <div>
              <dt>Unidad</dt>
              <dd>{portada.unidad || ctx.perfil.nombre}</dd>
            </div>
            {anio ? (
              <div>
                <dt>Año de gestión</dt>
                <dd>{anio}</dd>
              </div>
            ) : null}
            {portada.ciclo ? (
              <div>
                <dt>Ciclo</dt>
                <dd>{portada.ciclo}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      );
  }
  return (
    <section className="vi-pg" style={vars} aria-label="Página 1, portada">
      {cuerpo}
    </section>
  );
}

/* ---------- Cierre ---------- */

const PARRAFOS = (t: string): string[] => t.split(/\n+/).map((x) => x.trim()).filter(Boolean);

export function PaginaCierre({ ctx, cierre, folio, anioTexto }: { ctx: ContextoHoja; cierre: CierreDiseno; folio: number; anioTexto: string }) {
  const c = ctx.perfil.contacto;
  const estado =
    ctx.marca.e === "vivo"
      ? "Las cifras de este borrador se leyeron en vivo y cambian hasta el envío del informe."
      : `Las cifras son las que se guardaron al enviar el informe (${ctx.marca.texto.replace(/^Foto del /, "")}).`;
  return (
    <HojaContenido ctx={ctx} titulo="Cierre del informe" folio={folio}>
      <div className="vi-u">
        <EncabezadoSeccion codigo={ctx.perfil.monograma} titulo="Cierre del informe" linea={`${ctx.perfil.nombre} · ${anioTexto}`} />
      </div>
      {PARRAFOS(cierre.mensaje).map((p, i) => (
        <div className="vi-u" key={i}>
          <p className="vi-p">{p}</p>
        </div>
      ))}
      {cierre.firmas.length ? (
        <div className="vi-firmas">
          {cierre.firmas.map((f, i) => (
            <div key={i}>
              <b>{f.nombre}</b>
              <span>{f.cargo}</span>
            </div>
          ))}
        </div>
      ) : null}
      {cierre.creditos || hayContacto(c) ? (
        <div className="vi-two" style={{ marginTop: "8mm" }}>
          {cierre.creditos ? (
            <div className="vi-blk">
              <span className="vi-eyebrow">Créditos</span>
              {PARRAFOS(cierre.creditos).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <div />
          )}
          {hayContacto(c) ? (
            <div className="vi-blk">
              <span className="vi-eyebrow">Contacto</span>
              <p>
                {[c.direccion, c.correo, c.telefono, c.web].filter(Boolean).map((l, i) => (
                  <span key={i}>
                    {i ? <br /> : null}
                    {l}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="vi-src vi-u--pie">
        <b>Fuente de los datos.</b> Las cifras vienen de UDES en Cifras y del seguimiento del Plan de Desarrollo Institucional. Los datos propios de cada unidad indican su fuente en la tabla donde aparecen. {estado}
      </p>
    </HojaContenido>
  );
}

/* ---------- Contraportada ---------- */

export function PaginaContraportada({ ctx, contra, anio }: { ctx: ContextoHoja; contra: ContraportadaDiseno; anio: string }) {
  const c = ctx.perfil.contacto;
  const tono = contra.tono;
  const logo = tono === "foto" ? LOGO_COLOR : LOGO_BLANCO;
  const datos: [string, string][] = [
    ["Dirección", c.direccion],
    ["Correo", c.correo],
    ["Teléfono", c.telefono],
    ["Sitio web", c.web],
  ];
  const lleno = datos.filter(([, v]) => v);
  return (
    <section className="vi-pg" style={varsHoja(ctx.papel, ctx.acento)} aria-label="Contraportada">
      <div className="vi-bk" data-tono={tono}>
        {tono === "foto" ? <img className="vi-bk-ph" src={FOTO_CONTRAPORTADA} alt="" /> : null}
        <img className="vi-bk-mark" src={logo} alt="Universidad de Santander" />
        <div className="vi-bk-main">
          <div className="vi-un">
            <Emblema ctx={ctx} />
            <div>
              <strong>{ctx.perfil.nombre}</strong>
              <span>Informe de gestión{anio ? ` ${anio}` : ""}</span>
            </div>
          </div>
          {contra.frase ? <p className="vi-frase">{contra.frase}</p> : null}
          {lleno.length || contra.sedes ? (
            <dl>
              {lleno.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              {contra.sedes ? (
                <div>
                  <dt>Sedes</dt>
                  <dd>{SEDES}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
        <p className="vi-bk-fix">Universidad de Santander · UDES en Cifras · udes.edu.co</p>
      </div>
    </section>
  );
}

/** Para las miniaturas del editor: el diseño con la composición cambiada. */
export const conComposicion = (d: PortadaDiseno, composicion: PortadaDiseno["composicion"]): PortadaDiseno => ({ ...d, composicion });

export type { DisenoInforme };
