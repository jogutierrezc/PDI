/* Pantalla de la oficina: su formulario del reporte THE Impact (/admin/reporte-rankings). */

import { useState } from "react";
import { AdminShell } from "../../../admin/components/AdminShell";
import { useAuth } from "../../../../lib/auth";
import { FaltaMigracion } from "../../noticias";
import { actorDe } from "../envio";
import { useAportesReporte, useAsignacionesReporte, useCatalogoReporte, useCicloReporte, useMembresiasPropias, useRespuestasReporte, useUnidadesReporte } from "../datos";
import { FormularioOficina } from "./FormularioOficina";
import type { OficinaRef } from "./FormularioOficina";
import { AvisoMigracion, Cargando, Vacio } from "./comunes";
import "../../layout.css";
import "../reporte.css";

export function ReporteOficina() {
  const { profile, hasRole } = useAuth();
  const planeacion = hasRole("planeacion");
  const membresias = useMembresiasPropias(profile?.id);
  const unidades = useUnidadesReporte();
  const ciclo = useCicloReporte();
  const cicloId = ciclo.data?.id;
  const catalogo = useCatalogoReporte(cicloId);
  const asignaciones = useAsignacionesReporte(cicloId);
  const respuestas = useRespuestasReporte(cicloId);
  const aportes = useAportesReporte(cicloId);
  const [elegida, setElegida] = useState<string | null>(null);

  // Planeación ve cualquier oficina; el resto, solo las suyas.
  const opciones: OficinaRef[] = planeacion
    ? (unidades.data ?? []).map((u) => ({ id: u.id, nombre: u.name }))
    : (membresias.data ?? []).map((m) => ({ id: m.unidad, nombre: m.nombre }));
  const oficina = opciones.find((o) => o.id === elegida) ?? opciones[0] ?? null;

  const errores = [ciclo.error, catalogo.error, asignaciones.error, respuestas.error, aportes.error, unidades.error, membresias.error].filter((e): e is Error => e instanceof Error);
  const falta = errores.find((e) => e instanceof FaltaMigracion);
  const cargando = !profile || membresias.isPending || ciclo.isPending || (planeacion && unidades.isPending);

  let cuerpo;
  if (falta) {
    cuerpo = <AvisoMigracion error={falta} />;
  } else if (cargando) {
    cuerpo = <Cargando texto="Cargando su oficina…" />;
  } else if (!oficina) {
    cuerpo = (
      <Vacio>
        Su usuario no pertenece a ninguna oficina. Pida a Planeación que lo agregue con la función de Gestor, Contribuyente o Consulta.
      </Vacio>
    );
  } else if (!ciclo.data) {
    cuerpo = <Vacio>Planeación todavía no abre el reporte de THE Impact.</Vacio>;
  } else if (catalogo.isPending || asignaciones.isPending || respuestas.isPending) {
    cuerpo = <Cargando texto="Cargando los indicadores de la oficina…" />;
  } else {
    const actor = actorDe(planeacion, membresias.data ?? [], oficina.id);
    cuerpo = (
      <>
        {opciones.length > 1 && (
          <label className="rk-rep-field-inline">
            <span>Oficina</span>
            <select className="rk-rep-select" value={oficina.id} onChange={(e) => setElegida(e.target.value)}>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <FormularioOficina
          key={oficina.id}
          ciclo={ciclo.data}
          oficina={oficina}
          actor={actor}
          indicadores={catalogo.data ?? []}
          asignaciones={asignaciones.data ?? []}
          respuestas={respuestas.data ?? []}
          aportes={aportes.data ?? []}
        />
      </>
    );
  }

  return (
    <AdminShell
      section="rankings"
      kicker="Rankings · THE Impact"
      title="Reporte por oficinas"
      description="Los indicadores que THE pide: los sugeridos para su oficina y todo el catálogo, con dato o sí/no, evidencias y comentario"
    >
      <div className="rk rk-rep">{cuerpo}</div>
    </AdminShell>
  );
}
