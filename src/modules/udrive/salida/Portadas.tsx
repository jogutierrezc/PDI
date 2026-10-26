/* =============================================================================
   UDrive · portada, cierre y contraportada de un estilo (migración 0190).

   Las cinco composiciones salen de las del boletín y de Informes
   Institucionales: mismas clases (vi-*, de informes/vista/vista.css) y mismas
   reglas. Lo que cambia es de dónde vienen los textos: en UDrive no hay una
   oficina, así que la portada tiene título, subtítulo, autoría, afiliación,
   fecha y nota, todos opcionales (lo vacío no se imprime ni deja huecos). El
   logo de la Universidad va siempre. El monograma, el logo propio y la foto
   (con su encuadre) los elige la persona.

   La portada «Clásica» (composición 0) es la de siempre de UDrive y sigue en
   Piezas.tsx: aquí solo están las cinco nuevas.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { EDIFICIOS, FOTO_CONTRAPORTADA, FOTO_PORTADA, LOGO_BLANCO, LOGO_COLOR, estiloFoto, varsHoja } from "../../informes/vista/Hoja";
import { SEDES, evaluarAcento } from "../../informes/vista/perfil";
import "../../informes/vista/vista.css";
import type { Cierre, Portada } from "../lib/documento";
import { COMPOSICIONES } from "../lib/estilo";
import type { Estilo, Papel } from "../lib/estilo";

export interface DatosPortada {
  portada: Portada;
  estilo: Estilo;
  papel: Papel;
  /** Enlace firmado de la foto de portada (imagen de UDrive); sin él se usa la institucional. */
  fotoUrl: string | null;
  /** Enlace firmado del logo propio. */
  logoPropioUrl: string | null;
}

const FOTO_DEFECTO = { x: 50, y: 0, zoom: 1, ajuste: "cubrir" as const, velo: 0 };

/** El tamaño del título en milímetros: el elegido, reducido solo si el texto es largo (más de 40 o 65 caracteres). */
export function tamanoTitulo(comp: Estilo["portada"]["comp"], tam: 0 | 1 | 2, titulo: string): number {
  const base = (COMPOSICIONES.find((c) => c.id === comp) ?? COMPOSICIONES[0]).tamanos[tam];
  const k = titulo.length <= 40 ? 1 : titulo.length <= 65 ? 0.86 : 0.74;
  return Math.round(base * k * 10) / 10;
}

const anioDe = (p: Portada): string => p.anio || /\d{4}/.exec(p.fecha ?? "")?.[0] || "";

/** Lo que firma la portada: autoría, afiliación y fecha, y la nota. Cada línea solo si hay algo. */
function Autoria({ p, emblemas }: { p: Portada; emblemas?: ReactNode }) {
  const org = p.afiliacion || p.entidad;
  const segunda = [org, p.fecha || p.anio].filter(Boolean).join(" · ");
  if (!p.autor && !segunda && !p.nota && !emblemas) return null;
  return (
    <div className="vi-un">
      {emblemas}
      {p.autor || segunda || p.nota ? (
        <div>
          {p.autor ? <strong>{p.autor}</strong> : segunda ? <strong>{segunda}</strong> : null}
          {p.autor && segunda ? <span>{segunda}</span> : null}
          {p.nota ? <span>{p.nota}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** El monograma y el logo propio, si el estilo los pide. El logo de la Universidad se pone aparte: es obligatorio. */
function Emblemas({ d }: { d: DatosPortada }) {
  const { logos, mono } = d.estilo.portada;
  const hay = logos.mono || (logos.propioId && d.logoPropioUrl);
  if (!hay) return null;
  return (
    <>
      {logos.propioId && d.logoPropioUrl ? <img className="vi-emb-img" src={d.logoPropioUrl} alt="Logo" /> : null}
      {logos.mono ? (
        <span className="vi-emb" data-n={mono.length} aria-hidden="true">
          {mono}
        </span>
      ) : null}
    </>
  );
}

function Foto({ d, className }: { d: DatosPortada; className: string }) {
  const e = d.estilo.portada;
  const f = d.portada.foto ?? FOTO_DEFECTO;
  const propia = e.fondo === "propia" && d.portada.imagenId && d.fotoUrl;
  const fuente = e.fondo === "color" ? null : propia ? d.fotoUrl : FOTO_PORTADA;
  const estilo: CSSProperties = { ...estiloFoto(f.x, f.y, f.zoom), objectFit: f.ajuste === "contener" ? "contain" : "cover" };
  return (
    <div className={`vi-foto ${className}`} style={f.ajuste === "contener" ? { background: "#eef3f9" } : undefined}>
      {fuente ? <img src={fuente} alt="" style={estilo} /> : null}
      {fuente && f.velo > 0 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: f.velo / 100 }} /> : null}
    </div>
  );
}

export function PortadaEstilo({ d }: { d: DatosPortada }) {
  const e = d.estilo.portada;
  const p = d.portada;
  const acento = evaluarAcento(e.acento);
  const al = e.alinea;
  const centro = al === "centro";
  const titulo = p.titulo.trim() || "Título del informe";
  const h1 = <h1 style={{ fontSize: `${tamanoTitulo(e.comp, e.tam, titulo)}mm` }}>{titulo}</h1>;
  const sub = p.subtitulo.trim() ? <p className="vi-sub">{p.subtitulo}</p> : null;
  const regla = <i className="vi-rule" style={{ background: acento.hex, marginInline: centro ? "auto" : undefined }} />;
  const anio = anioDe(p);
  const emb = <Emblemas d={d} />;
  const logoUdes = <img className="vi-logo" src={LOGO_COLOR} alt="Universidad de Santander" />;
  const org = p.afiliacion || p.entidad;
  let cuerpo: ReactNode;
  switch (e.comp) {
    case 1:
      cuerpo = (
        <div className="vi-cv">
          <Foto d={d} className="vi-c1-ph" />
          <div className="vi-c1-tab">
            <img src={LOGO_COLOR} alt="Universidad de Santander" />
          </div>
          <div className="vi-c1-txt" data-al={al}>
            {h1}
            {regla}
            {sub}
          </div>
          <div className="vi-c1-foot" data-al={al} style={centro ? { display: "grid", justifyItems: "center" } : undefined}>
            <Autoria p={p} emblemas={emb} />
          </div>
        </div>
      );
      break;
    case 2:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c2-top">
            {logoUdes}
            <div style={{ display: "flex", gap: "3mm", alignItems: "center" }}>{emb}</div>
          </div>
          <div className="vi-c2-blk" data-al={al}>
            {h1}
            {sub}
            <Autoria p={p} />
          </div>
        </div>
      );
      break;
    case 3:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c3-top">
            {logoUdes}
            <div style={{ display: "flex", gap: "3mm", alignItems: "center" }}>{emb}</div>
          </div>
          <i className="vi-c3-rule" />
          {anio ? (
            <div className="vi-c3-yr" aria-hidden="true">
              {anio}
            </div>
          ) : null}
          <div className="vi-c3-txt">
            {h1}
            {sub}
          </div>
          <div className="vi-c3-foot">
            <Autoria p={p} />
          </div>
        </div>
      );
      break;
    case 4:
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-c4-col">
            {e.logos.mono ? (
              <span className="vi-emb" data-n={e.mono.length}>
                {e.mono}
              </span>
            ) : e.logos.propioId && d.logoPropioUrl ? (
              <img className="vi-emb-img" src={d.logoPropioUrl} alt="Logo" />
            ) : null}
            {anio ? (
              <div className="vi-c4-yr" aria-hidden="true">
                {anio}
              </div>
            ) : null}
          </div>
          <img className="vi-c4-logo" src={LOGO_COLOR} alt="Universidad de Santander" />
          <div className="vi-c4-txt">
            {h1}
            {regla}
            {sub}
          </div>
          <div className="vi-c4-foot">
            <Autoria p={p} />
          </div>
        </div>
      );
      break;
    default: {
      const datos: [string, string][] = ([["Autoría", p.autor ?? ""], ["Afiliación", org], ["Fecha", p.fecha || p.anio], ["Nota", p.nota ?? ""]] as [string, string][]).filter(([, v]) => v);
      cuerpo = (
        <div className="vi-cv">
          <div className="vi-hd">
            <div className="vi-hd-bar">
              <img src={LOGO_BLANCO} alt="Universidad de Santander" />
              <span style={{ display: "flex", gap: "3mm", alignItems: "center" }}>{emb}</span>
            </div>
            <div className="vi-hd-band">
              <strong>{anio || " "}</strong>
              <img src={EDIFICIOS} alt="" />
            </div>
          </div>
          <div className="vi-c5-txt" data-al={al}>
            {h1}
            {regla}
            {sub}
          </div>
          {datos.length ? (
            <dl className="vi-c5-facts" style={{ gridTemplateColumns: `repeat(${Math.min(datos.length, 3)}, minmax(0, 1fr))` }}>
              {datos.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      );
    }
  }
  return (
    <section className="vi-pg ud-pdf-portada-nueva" style={varsHoja(d.papel, acento)} aria-label="Página 1, portada">
      {cuerpo}
    </section>
  );
}

/* ---------- Contraportada ---------------------------------------------------------------------- */

export function ContraportadaEstilo({ d, cierre }: { d: DatosPortada; cierre: Cierre }) {
  const e = d.estilo.portada;
  const acento = evaluarAcento(e.acento);
  const tono = e.tono;
  const logo = tono === "foto" ? LOGO_COLOR : LOGO_BLANCO;
  const org = d.portada.afiliacion || d.portada.entidad;
  const datos: [string, string][] = ([["Dirección", cierre.direccion], ["Correo", cierre.correo], ["Teléfono", cierre.telefono], ["Sitio web", cierre.web]] as [string, string][]).filter(([, v]) => v);
  const f = d.portada.foto ?? FOTO_DEFECTO;
  return (
    <section className="vi-pg" style={varsHoja(d.papel, acento)} aria-label="Contraportada">
      <div className="vi-bk" data-tono={tono}>
        {tono === "foto" ? <img className="vi-bk-ph" src={FOTO_CONTRAPORTADA} alt="" style={{ objectPosition: `${f.x}% 100%` }} /> : null}
        <img className="vi-bk-mark" src={logo} alt="Universidad de Santander" />
        <div className="vi-bk-main">
          {org || e.logos.mono || (e.logos.propioId && d.logoPropioUrl) ? (
            <div className="vi-un">
              <Emblemas d={d} />
              {org ? (
                <div>
                  <strong>{org}</strong>
                  <span>{d.portada.titulo.trim() || "Informe"}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {cierre.frase ? <p className="vi-frase">{cierre.frase}</p> : null}
          {datos.length ? (
            <dl>
              {datos.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              {org === "Universidad de Santander" || !org ? (
                <div>
                  <dt>Sedes</dt>
                  <dd>{SEDES}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
        <p className="vi-bk-fix">Universidad de Santander · udes.edu.co</p>
      </div>
    </section>
  );
}
