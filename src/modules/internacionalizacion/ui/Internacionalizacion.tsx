/* =============================================================================
   Internacionalización · la pantalla (paquete 2), a pantalla completa con el
   mismo marco de Programas en Cifras (components/espacio/Marco): barra azul
   marino con el buscador Ctrl+K, el periodo y el campus; riel de secciones y
   carpetas; y el contenido a la derecha.

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

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../lib/auth";
import { useTour } from "../../../components/tour/TourProvider";
import { Buscador } from "../../../components/espacio/Buscador";
import type { EntradaBuscador } from "../../../components/espacio/Buscador";
import { Migas } from "../../../components/espacio/Explorador";
import { BarraSuperior, EntradaRiel, Riel, TituloRiel } from "../../../components/espacio/Marco";
import type { IconName } from "../../../components/ui/Icon";
import { FaltaMigracion, useCampus, useEnvios, useEstructura, usePeriodos, useYo } from "../datos";
import { campusVisibles } from "../lib/permisos";
import { carpetaDeLibro, CARPETAS_INT } from "./adaptador";
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
const ICONO: Record<SeccionId, IconName> = { resumen: "grid", cifras: "chart", tablas: "table", plantillas: "library", periodos: "clock", accesos: "users" };

export function Internacionalizacion() {
  const { seccion: param } = useParams();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const tour = useTour();
  const { hasRole } = useAuth();
  const yo = useYo();
  const campus = useCampus();
  const periodos = usePeriodos();
  const [buscando, setBuscando] = useState(false);

  const admin = hasRole("admin");
  const director = Boolean(yo.data?.director) || admin;
  const periodo = periodoInicial(periodos.data ?? [], params.get("periodo"));
  const envios = useEnvios(periodo?.id);
  const estructura = useEstructura();
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

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando((b) => !b);
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  // Accesos sin ser Director, o una sección que no existe: al resumen.
  if (yo.data && !seccion) return <Navigate to={BASE} replace />;
  const actual: SeccionId = seccion ?? "resumen";
  const meta = SECCIONES.find((s) => s.id === actual)!;
  const pendientes = pendientesDe(ctx?.yo, envios.data ?? []);
  const libros = estructura.data ?? [];
  const carpetaActual = actual === "tablas" ? (CARPETAS_INT.find((c) => c.id === params.get("carpeta"))?.id ?? null) : null;
  const enlace = (s: SeccionId, extra?: Record<string, string | null | undefined>) => ctx?.enlace(s, extra) ?? `${BASE}${s === "resumen" ? "" : `/${s}`}`;

  const entradas: EntradaBuscador[] = [
    ...libros.map((l) => ({ id: `l:${l.id}`, titulo: l.nombre, icono: "table" as const, pista: `Tabla · ${CARPETAS_INT.find((c) => c.id === carpetaDeLibro(l))?.nombre ?? ""}` })),
    ...seccionesPara(director).map((s) => ({ id: `s:${s.id}`, titulo: s.rotulo, icono: ICONO[s.id], pista: "Sección" })),
    ...(director
      ? [
          { id: "nueva", titulo: "Nueva tabla", icono: "plus" as const, pista: "Acción" },
          { id: "excel", titulo: "Crear una tabla desde Excel", icono: "upload" as const, pista: "Acción" },
        ]
      : []),
    { id: "recorrido", titulo: "Recorrido guiado de Pilo", icono: "play", pista: "Acción" },
    { id: "vista", titulo: "Cambiar entre mosaicos y lista", icono: "rows", pista: "Acción" },
  ];

  const elegir = (e: EntradaBuscador) => {
    setBuscando(false);
    if (e.id.startsWith("l:")) {
      const l = libros.find((x) => x.id === e.id.slice(2));
      navegar(enlace("tablas", { libro: l?.id, hoja: l?.hojas[0]?.id }));
    } else if (e.id.startsWith("s:")) navegar(enlace(e.id.slice(2) as SeccionId));
    else if (e.id === "recorrido") tour.start("internacionalizacion");
    else navegar(enlace("tablas", { accion: e.id }));
  };

  const campusSel = ctx?.visibles.some((c) => c.id === params.get("campus")) ? params.get("campus")! : "";
  const cambiarParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const selector = (
    <>
      {actual === "tablas" && ctx && ctx.visibles.length > 1 ? (
        <select aria-label="Campus" data-tour="int-campus" value={campusSel} onChange={(e) => cambiarParam("campus", e.target.value)}>
          <option value="">Todos los campus</option>
          {ctx.visibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      {periodos.data && periodos.data.length > 0 ? (
        <select aria-label="Periodo" value={periodo?.codigo ?? ""} onChange={(e) => cambiarParam("periodo", e.target.value)}>
          {[...periodos.data]
            .sort((a, b) => b.codigo.localeCompare(a.codigo))
            .map((p) => (
              <option key={p.id} value={p.codigo}>
                {p.codigo} · {p.estado}
              </option>
            ))}
        </select>
      ) : null}
    </>
  );

  const errores = [yo.error, campus.error, periodos.error].filter((e): e is Error => e instanceof Error);
  const falta = errores.find((e) => e instanceof FaltaMigracion);
  let cuerpo: ReactNode;
  // «Pleno»: Tablas trae su propio explorador y ocupa todo el espacio, sin margen ni título.
  const pleno = !falta && !errores.length && Boolean(ctx) && !periodos.isPending && (director || (ctx?.visibles.length ?? 0) > 0) && actual === "tablas";
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
    <div className="es pc">
      <BarraSuperior sigla="IN" marca="Internacionalización" buscar="Buscar tablas, secciones y acciones" tourBuscar="int-buscar" tourSelector="int-periodo" onBuscar={() => setBuscando(true)} selector={selector} />
      <div className="pc-body it-marco">
        <Riel etiqueta="Secciones de Internacionalización" tour="int-riel">
          <TituloRiel>Repositorio</TituloRiel>
          {seccionesPara(director).map((s) => (
            <EntradaRiel key={s.id} icono={ICONO[s.id]} actual={s.id === actual && !carpetaActual} to={enlace(s.id)} cuenta={s.id === "tablas" ? pendientes.total : undefined}>
              {s.rotulo}
            </EntradaRiel>
          ))}
          <hr />
          <TituloRiel>Carpetas</TituloRiel>
          {CARPETAS_INT.filter((c) => libros.some((l) => carpetaDeLibro(l) === c.id)).map((c) => (
            <EntradaRiel key={c.id} icono="folder" actual={carpetaActual === c.id} to={enlace("tablas", { carpeta: c.id })}>
              {c.nombre}
            </EntradaRiel>
          ))}
        </Riel>
        <main className={`it-main${pleno ? " it-main--pleno" : ""}`}>
          <div className={`it rk${pleno ? " it--pleno" : ""}`}>
            {pleno ? (
              <h1 className="sr-only">{meta.titulo}</h1>
            ) : (
              <>
                <Migas partes={[{ texto: "Internacionalización", onClick: () => navegar(enlace("resumen")) }, { texto: meta.rotulo }]} />
                <header>
                  <h1 className="it-h2">{meta.titulo}</h1>
                  <p className="it-sub">{meta.descripcion}</p>
                </header>
              </>
            )}
            {cuerpo}
          </div>
        </main>
      </div>
      {buscando ? <Buscador entradas={entradas} onElegir={elegir} onCerrar={() => setBuscando(false)} /> : null}
    </div>
  );
}
