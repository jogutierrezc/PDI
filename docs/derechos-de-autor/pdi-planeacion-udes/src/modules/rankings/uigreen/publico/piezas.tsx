/* =============================================================================
   UI GreenMetric · página pública · piezas compartidas: marco, regleta de cuadros,
   estados (cargando, vacío, error) y la lectura de la edición.

   El marco es el de los informes de THE Impact (`.odsx`: tema claro, esquinas
   vivas) sobre el marco del portal Sostenible; el selector ES | EN es el del
   portal (SostenibleLayout) y `?lang=` manda.
   ========================================================================== */

import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SostenibleLayout } from "../../../sostenible/SostenibleLayout";
import { OdsPortalArrow } from "../../../sostenible/OdsPortalArrow";
import { useLang } from "../../../sostenible/i18n";
import { usePublicoCiclos } from "../datos";
import { conContenido } from "./logica";
import { tx } from "./textos";
import type { Lang } from "./textos";
import "../../../sostenible/ods.css";
import "../../../sostenible/ods-portal.css";
import "./ugmp.css";

export function Marco({ volver, children }: { volver: { to: string; texto: string }; children: ReactNode }) {
  const { lang } = useLang();
  return (
    <SostenibleLayout title="UI GreenMetric">
      <div className="odsx ugmp" lang={lang}>
        <div className="odsx-bar">
          <div className="odsx-wrap odsx-bar__row">
            <Link to={volver.to} className="odsx-back">
              <OdsPortalArrow dir="left" /> {volver.texto}
            </Link>
          </div>
        </div>
        {children}
      </div>
    </SostenibleLayout>
  );
}

/** Un cuadro por indicador, lleno si está publicado. Inventario, no escala: sin porcentaje ni umbrales. */
export function Regleta({ n, m, lang, clase, clave }: { n: number; m: number; lang: Lang; clase?: string; clave: string }) {
  return (
    <span className={`ugmp-ticks${clase ? ` ${clase}` : ""}`} role="img" aria-label={tx(lang, "n_de_m", { n, m })}>
      {Array.from({ length: m }, (_, i) => (
        <i key={i} data-k={`${clave}:${i}`} className={`ugmp-tk${i < n ? " on" : ""}`} />
      ))}
    </span>
  );
}

export function Icono({ d }: { d: string }) {
  return (
    <svg className="ugmp-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Estado({ tipo, lang, titulo, texto }: { tipo: "cargando" | "vacio" | "error"; lang: Lang; titulo?: string; texto?: string }) {
  if (tipo === "cargando") {
    return (
      <div className="odsx-wrap ugmp-estado" role="status" aria-live="polite">
        <span className="ugmp-spin" aria-hidden="true" />
        <span>{tx(lang, "cargando")}</span>
      </div>
    );
  }
  return (
    <div className="odsx-wrap">
      <div className="ugmp-vacio" role={tipo === "error" ? "alert" : "status"}>
        <b>{titulo ?? (tipo === "error" ? tx(lang, "error_t") : tx(lang, "nada_t"))}</b>
        <span>{texto ?? (tipo === "error" ? tx(lang, "error_x") : tx(lang, "nada_x"))}</span>
      </div>
    </div>
  );
}

/** La edición elegida (`?edicion=`) entre los ciclos que tienen algo publicado. */
export function useEdicion() {
  const [params, setParams] = useSearchParams();
  const q = usePublicoCiclos();
  const ciclos = conContenido(q.data);
  const pedido = params.get("edicion");
  const ciclo = ciclos.find((c) => String(c.anio) === pedido) ?? ciclos[0] ?? null;
  const elegir = (anio: number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("edicion", String(anio));
        return next;
      },
      { replace: true },
    );
  return { ciclos, ciclo, elegir, cargando: q.isPending, error: q.isError };
}
