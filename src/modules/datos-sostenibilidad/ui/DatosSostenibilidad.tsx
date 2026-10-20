/* =============================================================================
   Datos de Sostenibilidad · la pantalla (/admin/datos-sostenibilidad).

   Como Mis Tableros y el resto de la intranet, no como Programas en Cifras
   (que vive en su marco de pantalla completa): aquí se entra por el lanzador,
   se elige la oficina —UDES Verde, Planeación Institucional…— y se trabaja en
   dos secciones: los libros de datos y el equipo. Pertenecer a ds_miembros
   (0178) es el permiso; Planeación observa sin editar.
   ========================================================================== */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../../admin/components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { useAuth } from "../../../lib/auth";
import { ErrorBlock } from "../../../components/ui/QueryState";
import { esFaltaMigracion, useYo } from "../datos";
import { esMiembro, puedeRepartir, rolEn } from "../lib/permisos";
import type { DsOficina } from "../tipos";
import { ExploradorLibros } from "./ExploradorLibros";
import { EditorLibro } from "./EditorLibro";
import { EquipoOficina } from "./EquipoOficina";
import "../../admin/udes-en-cifras/od-admin.css";
import "./datos-sostenibilidad.css";

type Seccion = "libros" | "equipo";

export function DatosSostenibilidad() {
  const yo = useYo();
  const [params, setParams] = useSearchParams();
  const seccion = (params.get("seccion") as Seccion | null) ?? "libros";
  const { hasRole } = useAuth();
  const admin = hasRole("admin");

  const oficinas = yo.data?.oficinas ?? [];
  const actual = useMemo(
    () => oficinas.find((o) => o.oficina_id === params.get("oficina")) ?? oficinas[0] ?? null,
    [oficinas, params],
  );

  const setQuery = (entries: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(entries)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  if (yo.isPending) {
    return (
      <AdminShell section="datos-sostenibilidad" kicker="Datos de Sostenibilidad" title="Cargando…" description="">
        <p className="admin-loading">Buscando sus oficinas…</p>
      </AdminShell>
    );
  }
  if (yo.error) {
    return (
      <AdminShell section="datos-sostenibilidad" kicker="Datos de Sostenibilidad" title="Datos de Sostenibilidad" description="">
        {esFaltaMigracion(yo.error) ? (
          <p className="oda-banner" role="alert">
            <Icon name="alert" size={16} /> {yo.error.message}
          </p>
        ) : (
          <ErrorBlock error={yo.error} onRetry={() => void yo.refetch()} />
        )}
      </AdminShell>
    );
  }
  if (!yo.data || !esMiembro(yo.data)) {
    return (
      <AdminShell section="datos-sostenibilidad" kicker="Datos de Sostenibilidad" title="Sin oficina asignada" description="">
        <p className="tb-prose">
          Todavía no tiene una oficina asignada. Pídale a la administración de la intranet que lo nombre gestor o
          colaborador de una oficina en Datos de Sostenibilidad.
        </p>
        <Link to="/admin" className="button-secondary">
          Volver a la intranet
        </Link>
      </AdminShell>
    );
  }
  if (!actual) {
    return (
      <AdminShell section="datos-sostenibilidad" kicker="Datos de Sostenibilidad" title="Sin oficinas" description="">
        <p className="tb-prose">No hay oficinas en el organigrama todavía.</p>
      </AdminShell>
    );
  }

  const rol = rolEn(yo.data, actual.oficina_id);
  const reparte = puedeRepartir(yo.data, actual.oficina_id, admin);
  const libroAbierto = params.get("libro");

  return (
    <AdminShell
      section="datos-sostenibilidad"
      kicker="Datos de Sostenibilidad"
      title={libroAbierto ? "Libro de datos" : actual.oficina}
      description={`Libros de datos conectados a los indicadores de sostenibilidad · ${actual.codigo}`}
      rail={
        <AdminRail label="Secciones">
          <AdminRailTab current={seccion === "libros"} onSelect={() => setQuery({ seccion: null, libro: null })}>
            Libros
          </AdminRailTab>
          {reparte && (
            <AdminRailTab current={seccion === "equipo"} onSelect={() => setQuery({ seccion: "equipo", libro: null })}>
              Equipo
            </AdminRailTab>
          )}
        </AdminRail>
      }
      actions={
        oficinas.length > 1 ? (
          <label className="ds-oficina">
            <span className="sr-only">Oficina</span>
            <select value={actual.oficina_id} onChange={(e) => setQuery({ oficina: e.target.value, libro: null })}>
              {oficinas.map((o: DsOficina) => (
                <option key={o.oficina_id} value={o.oficina_id}>
                  {o.oficina} · {o.rol}
                </option>
              ))}
            </select>
          </label>
        ) : null
      }
    >
      {rol === "planeacion" && (
        <p className="oda-banner" role="note">
          <Icon name="eye" size={16} /> Entra como Planeación: lee los libros de cualquier oficina, pero editarlos es
          de su gente.
        </p>
      )}

      {seccion === "equipo" ? (
        <EquipoOficina oficina={actual} />
      ) : libroAbierto ? (
        <EditorLibro yo={yo.data!} oficina={actual} libroId={libroAbierto} onCerrar={() => setQuery({ libro: null })} />
      ) : (
        <ExploradorLibros yo={yo.data!} oficina={actual} onAbrir={(libro) => setQuery({ libro })} />
      )}
    </AdminShell>
  );
}
