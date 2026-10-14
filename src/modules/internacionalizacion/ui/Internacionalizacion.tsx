/* =============================================================================
   Internacionalización · la pantalla de la intranet (paquete 2).

   Una ruta: /admin/internacionalizacion/:seccion?  (?periodo=2026-2)
     (sin sección) resumen    qué falta para cerrar el periodo
     cifras                   la ventana de cifras (int_cifras)
     tablas                   libros y hojas tipo Excel, envío y validación
     plantillas               el hilo plantilla ↔ conceptos y el puente SNIES
     periodos                 periodos, ventanas y reaperturas
     accesos                  quién está en el módulo (solo el Director)
   El periodo elegido viaja en la dirección. La base decide (RLS, disparador y
   RPC de 0151); la pantalla solo evita ofrecer lo imposible.
   ========================================================================== */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../../admin/components/AdminShell";
import { useAuth } from "../../../lib/auth";
import { FaltaMigracion, useCampus, useEnvios, usePeriodos, useYo } from "../datos";
import { campusVisibles } from "../lib/permisos";
import { AvisoMigracion, Cargando, ErrorCaja, Vacio } from "./comunes";
import type { Ctx } from "./comunes";
import { pendientesDe, periodoInicial, SECCIONES, seccionDe, seccionesPara } from "./logica";
import type { SeccionId } from "./logica";
import { Resumen } from "./Resumen";
import { Cifras } from "./Cifras";
import { Tablas } from "./Tablas";
import { Plantillas } from "./Plantillas";
import { Periodos } from "./Periodos";
import { Accesos } from "./Accesos";
import "./internacionalizacion.css";

const BASE = "/admin/internacionalizacion";
const KICKER = "Internacionalización";

export function Internacionalizacion() {
  const { seccion: param } = useParams();
  const [params, setParams] = useSearchParams();
  const { hasRole } = useAuth();
  const yo = useYo();
  const campus = useCampus();
  const periodos = usePeriodos();

  const admin = hasRole("admin");
  const director = Boolean(yo.data?.director) || admin;
  const periodo = periodoInicial(periodos.data ?? [], params.get("periodo"));
  const envios = useEnvios(periodo?.id);
  const seccion = seccionDe(param, director);

  const ctx = useMemo<Ctx | null>(() => {
    if (!yo.data || !campus.data) return null;
    const ids = campusVisibles(yo.data, campus.data.map((c) => c.id));
    return {
      yo: { ...yo.data, director },
      director,
      admin,
      campus: campus.data,
      visibles: campus.data.filter((c) => ids.includes(c.id)),
      periodo,
      periodos: periodos.data ?? [],
      enlace: (s, extra) => {
        const q = new URLSearchParams();
        if (periodo) q.set("periodo", periodo.codigo);
        for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
        const qs = q.toString();
        return `${BASE}${s === "resumen" ? "" : `/${s}`}${qs ? `?${qs}` : ""}`;
      },
    };
  }, [yo.data, campus.data, periodos.data, periodo, director, admin]);

  // Accesos sin ser Director, o una sección que no existe: al resumen.
  if (yo.data && !seccion) return <Navigate to={BASE} replace />;
  const actual: SeccionId = seccion ?? "resumen";
  const meta = SECCIONES.find((s) => s.id === actual)!;
  const pendientes = pendientesDe(ctx?.yo, envios.data ?? []);

  const rail = (
    <AdminRail label="Secciones de Internacionalización">
      {seccionesPara(director).map((s) => (
        <AdminRailTab key={s.id} current={s.id === actual} to={ctx?.enlace(s.id) ?? `${BASE}/${s.id}`} count={s.id === "tablas" ? pendientes.total : undefined}>
          {s.rotulo}
        </AdminRailTab>
      ))}
    </AdminRail>
  );

  const selector =
    periodos.data && periodos.data.length > 0 ? (
      <label className="it-periodo">
        <span>Periodo</span>
        <select
          value={periodo?.codigo ?? ""}
          onChange={(e) => {
            const p = new URLSearchParams(params);
            p.set("periodo", e.target.value);
            setParams(p, { replace: true });
          }}
        >
          {[...periodos.data]
            .sort((a, b) => b.codigo.localeCompare(a.codigo))
            .map((p) => (
              <option key={p.id} value={p.codigo}>
                {p.codigo} · {p.estado}
              </option>
            ))}
        </select>
      </label>
    ) : null;

  const errores = [yo.error, campus.error, periodos.error].filter((e): e is Error => e instanceof Error);
  const falta = errores.find((e) => e instanceof FaltaMigracion);
  let cuerpo: ReactNode;
  if (falta) cuerpo = <AvisoMigracion error={falta} />;
  else if (errores.length) cuerpo = <ErrorCaja error={errores[0]} />;
  else if (!ctx || periodos.isPending) cuerpo = <Cargando texto="Leyendo el módulo…" />;
  else if (!director && ctx.visibles.length === 0)
    cuerpo = (
      <Vacio titulo="Todavía no tiene campus asignado en el módulo.">
        Pida al Director de Internacionalización que lo nombre coordinador o gestor de su campus.
      </Vacio>
    );
  else if (actual === "resumen") cuerpo = <Resumen ctx={ctx} />;
  else if (actual === "cifras") cuerpo = <Cifras ctx={ctx} />;
  else if (actual === "tablas") cuerpo = <Tablas ctx={ctx} />;
  else if (actual === "plantillas") cuerpo = <Plantillas ctx={ctx} />;
  else if (actual === "periodos") cuerpo = <Periodos ctx={ctx} />;
  else cuerpo = <Accesos ctx={ctx} />;

  return (
    <AdminShell section="internacionalizacion" kicker={KICKER} title={meta.titulo} description={meta.descripcion} rail={rail} actions={selector}>
      <div className="it rk">{cuerpo}</div>
    </AdminShell>
  );
}
