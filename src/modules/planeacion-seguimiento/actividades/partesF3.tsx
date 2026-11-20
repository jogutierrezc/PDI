/* =============================================================================
   Planeación y Seguimiento · Fase 3 · piezas compartidas: avance validado, estado del
   avance, conexión con el PDI, evidencias (con descarga por URL firmada) y el control de
   porcentaje sin arrastre. Estado siempre con glifo y texto.
   ========================================================================== */

import { useId, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { usePsApi } from "../api";
import { fecha } from "../modelo";
import type { AvanceActividad, Avance, ConexionPdi, EstadoAvance, Evidencia, PdiActividad } from "./modeloF3";
import { ROTULO_AVANCE } from "./modeloF3";
import { bytesLegibles } from "./reglasF3";
import { textoPdi } from "./pdi";

const pct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} %`;

/** El avance validado: barra con el número escrito (nunca solo color). */
export function BarraAvance({ avance, compacta = false, etiqueta = "Avance validado" }: { avance: AvanceActividad; compacta?: boolean; etiqueta?: string }) {
  return (
    <span className={compacta ? "ps-avbar ps-avbar--compacta" : "ps-avbar"}>
      <span className="ps-avbar__pista" role="img" aria-label={`${etiqueta}: ${pct(avance.fisico)}${avance.pendientes ? `. ${avance.pendientes} por validar` : ""}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, avance.fisico))}%` }} data-barra="x" />
      </span>
      <b aria-hidden="true">{pct(avance.fisico)}</b>
      {avance.pendientes ? <span className="ps-avbar__pend" aria-hidden="true"><Icon name="clock" size={11} /> {avance.pendientes} por validar</span> : null}
    </span>
  );
}

function GlifoAvance({ estado }: { estado: EstadoAvance }) {
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, focusable: false, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (estado === "validado") return <svg {...p}><circle cx="8" cy="8" r="5.8" fill="currentColor" fillOpacity=".16" /><path d="m5.2 8.2 2 2 3.6-4" /></svg>;
  if (estado === "devuelto") return <svg {...p}><path d="M6 4 2.8 7.2 6 10.4" /><path d="M3 7.2h6.2a3.8 3.8 0 0 1 3.8 3.8v1" /></svg>;
  return <svg {...p}><path d="M8 1.8 14.2 8 8 14.2 1.8 8z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></svg>;
}

export function ChipAvance({ estado, vencido = false }: { estado: EstadoAvance; vencido?: boolean }) {
  const tono = estado === "validado" ? "ok" : estado === "devuelto" ? "riesgo" : "pend";
  return (
    <span className="ps-est" data-tono={tono}>
      <GlifoAvance estado={estado} />{ROTULO_AVANCE[estado]}{vencido && estado === "pendiente" ? <span className="ps-est__plus"> · plazo vencido</span> : null}
    </span>
  );
}

export function ChipPdi({ pdi }: { pdi: Pick<PdiActividad, "conexion" | "items"> }) {
  const tono: Record<ConexionPdi, string> = { con_pdi: "pdi", sin_pdi: "neutro", sin_definir: "vacio" };
  return (
    <span className="ps-pdi" data-tono={tono[pdi.conexion]} title={pdi.items.map((i) => (i.linea ? `${i.lineaCodigo ?? ""} ${i.linea}` : i.pilar)).join(" · ") || undefined}>
      <Icon name={pdi.conexion === "con_pdi" ? "link" : "compass"} size={12} />{textoPdi(pdi)}
    </span>
  );
}

/* ---------- Evidencias ---------- */

/** Pide la URL (firmada) y la abre; el error se dice en línea. */
export function BotonEvidencia({ e }: { e: Pick<Evidencia, "tipo" | "url" | "storagePath" | "nombre"> }) {
  const api = usePsApi();
  const [estado, setEstado] = useState<"" | "pidiendo" | "error">("");
  const [msg, setMsg] = useState("");
  const abrir = async () => {
    setEstado("pidiendo");
    try {
      const url = await api.urlEvidencia(e);
      setEstado("");
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (e.tipo === "archivo") a.download = e.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (er) {
      setMsg((er as Error).message);
      setEstado("error");
    }
  };
  return (
    <span className="ps-evid-acc">
      <button type="button" className="button-secondary ps-btn-peq" onClick={abrir} disabled={estado === "pidiendo"} aria-busy={estado === "pidiendo" || undefined}>
        <Icon name={e.tipo === "enlace" ? "external" : "download"} size={13} /> {estado === "pidiendo" ? "Un momento…" : e.tipo === "enlace" ? "Abrir enlace" : "Descargar"}
      </button>
      {estado === "error" ? <span className="ps-campo__error" role="alert"><Icon name="alert" size={13} /> No se pudo abrir: {msg}</span> : null}
    </span>
  );
}

export function ListaEvidencias({ evidencias, vacio = "Sin evidencias." }: { evidencias: readonly Evidencia[]; vacio?: string }) {
  if (!evidencias.length) return <p className="ps-nota">{vacio}</p>;
  return (
    <ul className="ps-evids">
      {evidencias.map((e) => (
        <li key={e.id}>
          <Icon name={e.tipo === "enlace" ? "link" : "document"} size={16} />
          <span className="ps-evids__n"><strong>{e.nombre}</strong><em>{e.tipo === "enlace" ? (e.url ?? "") : `${e.mime ?? "archivo"}${e.bytes ? ` · ${bytesLegibles(e.bytes)}` : ""}`}{e.huella ? ` · huella ${e.huella.slice(0, 10)}…` : ""}</em></span>
          <BotonEvidencia e={e} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Un avance (tarjeta de historial) ---------- */

export function TarjetaAvance({ a, children }: { a: Avance; children?: React.ReactNode }) {
  return (
    <article className="ps-avance" data-estado={a.estado}>
      <header>
        <span className="ps-avance__n"><b>{pct(a.fisico)}</b> físico{a.financiero !== null ? <> · <b>{pct(a.financiero)}</b> financiero</> : null}</span>
        <ChipAvance estado={a.estado} vencido={a.vencido} />
      </header>
      <p className="ps-avance__nota">{a.nota}</p>
      <p className="ps-avance__meta">Reportó {a.reportadoPor.nombre} · avance del {fecha(a.fecha)}{a.autovalidado ? " · cierre administrativo autovalidado (auditado)" : null}{a.revisadoPor ? <> · revisó {a.revisadoPor.nombre}{a.revisadoEn ? ` el ${fecha(a.revisadoEn)}` : ""}</> : null}</p>
      {a.notaRevision ? <blockquote>Nota de la revisión: {a.notaRevision}</blockquote> : null}
      {a.evidencias.length ? <ListaEvidencias evidencias={a.evidencias} /> : null}
      {children}
    </article>
  );
}

/* ---------- Porcentaje sin arrastre ---------- */

/** Número, botones −5/+5, atajos y (opcional) deslizador. Todo funciona con teclado, toque y ratón; arrastrar no es necesario. */
export function ControlPorcentaje({ id, etiqueta, ayuda, valor, onCambio, minimo = 0, error, onSalir, obligatorio }: { id: string; etiqueta: string; ayuda?: string; valor: number; onCambio: (n: number) => void; minimo?: number; error?: string | null; onSalir?: () => void; obligatorio?: boolean }) {
  const ayudaId = useId();
  const ajustar = (n: number) => onCambio(Math.max(0, Math.min(100, Math.round(n))));
  return (
    <div className="ps-campo ps-pct" data-error={error ? "true" : undefined}>
      <label htmlFor={id}>{etiqueta}{obligatorio ? <span className="ps-oblig"> (obligatorio)</span> : null}</label>
      {ayuda ? <p className="ps-campo__ayuda" id={ayudaId}>{ayuda}</p> : null}
      <div className="ps-pct__fila">
        <button type="button" className="ps-pct__btn" aria-label={`Restar 5 a ${etiqueta.toLowerCase()}`} onClick={() => ajustar(valor - 5)} disabled={valor <= minimo}>−5</button>
        <span className="ps-pct__num">
          <input id={id} type="number" inputMode="numeric" min={minimo} max={100} step={1} value={Number.isFinite(valor) ? valor : ""} aria-describedby={[ayuda ? ayudaId : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} aria-invalid={Boolean(error)} onChange={(e) => onCambio(e.target.value === "" ? NaN : Number(e.target.value))} onBlur={onSalir} />
          <span aria-hidden="true">%</span>
        </span>
        <button type="button" className="ps-pct__btn" aria-label={`Sumar 5 a ${etiqueta.toLowerCase()}`} onClick={() => ajustar(valor + 5)} disabled={valor >= 100}>+5</button>
      </div>
      <input type="range" className="ps-pct__rango" min={minimo} max={100} step={5} value={Number.isFinite(valor) ? Math.max(minimo, valor) : minimo} onChange={(e) => onCambio(Number(e.target.value))} aria-label={`${etiqueta}: deslizador de 0 a 100`} tabIndex={-1} />
      <div className="ps-pct__atajos" role="group" aria-label="Valores rápidos">
        {[25, 50, 75, 100].filter((n) => n >= minimo).map((n) => <button key={n} type="button" aria-pressed={valor === n} onClick={() => ajustar(n)}>{n} %</button>)}
      </div>
      {error ? <p className="ps-campo__error" id={`${id}-error`}><Icon name="alert" size={14} /> {error}</p> : null}
    </div>
  );
}
