/* =============================================================================
   Informes Institucionales · la pantalla de la intranet (contrato en README.md).

   Una sola ruta: /admin/informes-gestion/:seccion?
     (sin sección)   quien gestiona (0192): el tablero del ciclo; el resto: su informe
     mi-informe      el editor (?unidad=<id>&s=<n>)
     revision        Planeación aprueba o devuelve (?informe=<id>)
     consolidador    próxima fase
     capacitacion    Planeación capacita a Pilo con los informes de 2025
   Tablero, revisión, consolidador y capacitación son solo de quien gestiona (puedeGestionarInformes,
   espejo de informe_gestiona()); quien no, solo tiene Mi informe y la Vista del informe.
   El consolidador es de gestión por ahora: las rectorías (plantillas C y D) lo recibirán cuando se
   construya, con su propia regla en la base.
     vista           Vista Carta y PDF (?unidad=<id>): el informe como saldrá en papel
   ?anio=<n> elige el ciclo (por defecto, el abierto o el más reciente).
   ========================================================================== */

import type { ReactNode } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { useCiclos, useInstancias, useRequisitos } from "./datos";
import { Capacitacion } from "./ui/Capacitacion";
import { Aviso, Cargando, ProximaFase, Vacio } from "./ui/comunes";
import { MiInforme } from "./ui/MiInforme";
import { Revision } from "./ui/Revision";
import { Tablero } from "./ui/Tablero";
import { VistaInforme } from "./vista/VistaInforme";
import "../rankings/layout.css";
import "./informes.css";

const BASE = "/admin/informes-gestion";
type Seccion = "tablero" | "mi-informe" | "revision" | "consolidador" | "capacitacion" | "vista";
const SOLO_GESTION: Seccion[] = ["tablero", "revision", "consolidador", "capacitacion"];
const SECCIONES: Seccion[] = ["tablero", "mi-informe", "revision", "consolidador", "capacitacion", "vista"];

const TITULOS: Record<Seccion, [string, string]> = {
  tablero: ["Tablero del ciclo", "Estado por unidad, fecha límite, plantillas y qué cifras se justifican"],
  "mi-informe": ["Mi informe", "Las cifras de UDES en Cifras y del Plan de Desarrollo ya cargadas; usted escribe lo que solo su unidad puede decir"],
  revision: ["Revisión", "Planeación aprueba o devuelve cada informe, con una nota por sección"],
  consolidador: ["Consolidador", "Cada nivel recibe lo aprobado del nivel de abajo y decide qué entra"],
  capacitacion: ["Capacitación de Pilo", "Los informes de 2025 le enseñan a Pilo cómo escribe cada unidad"],
  vista: ["Vista del informe", "El informe como saldrá en papel, en Carta o A4, con su portada y su PDF"],
};

export function InformesAdmin() {
  const { seccion: param } = useParams();
  const { puedeGestionarInformes } = useAuth();
  const gestiona = puedeGestionarInformes;
  const [params, setParams] = useSearchParams();
  const ciclos = useCiclos();

  const seccion = (param ?? (gestiona ? "tablero" : "mi-informe")) as Seccion;
  const anio = Number(params.get("anio")) || null;
  const lista = ciclos.data ?? [];
  const ciclo = lista.find((c) => c.anio === anio) ?? lista.find((c) => c.estado === "abierto") ?? lista[0] ?? null;
  const requisitos = useRequisitos(ciclo?.id);
  const instancias = useInstancias(gestiona ? ciclo?.id : undefined);

  if (!SECCIONES.includes(seccion) || (SOLO_GESTION.includes(seccion) && !gestiona)) return <Navigate to={`${BASE}/mi-informe`} replace />;

  const porRevisar = instancias.data?.filter((i) => i.estado === "sent").length;
  const rail = (
    <AdminRail label="Secciones de Informes Institucionales">
      {gestiona && (
        <AdminRailTab current={seccion === "tablero"} to={BASE}>
          Tablero del ciclo
        </AdminRailTab>
      )}
      <AdminRailTab current={seccion === "mi-informe"} to={`${BASE}/mi-informe`}>
        Mi informe
      </AdminRailTab>
      {gestiona && (
        <AdminRailTab current={seccion === "revision"} to={`${BASE}/revision`} count={porRevisar}>
          Revisión
        </AdminRailTab>
      )}
      {gestiona && (
        <AdminRailTab current={seccion === "consolidador"} to={`${BASE}/consolidador`}>
          Consolidador
        </AdminRailTab>
      )}
      {gestiona && (
        <AdminRailTab current={seccion === "capacitacion"} to={`${BASE}/capacitacion`}>
          Capacitación de Pilo
        </AdminRailTab>
      )}
      <AdminRailTab current={seccion === "vista"} to={`${BASE}/vista`}>
        Vista del informe
      </AdminRailTab>
    </AdminRail>
  );

  const fallo = [ciclos.error, requisitos.error].find((e): e is Error => e instanceof Error);
  let cuerpo: ReactNode;
  if (seccion === "consolidador") {
    cuerpo = (
      <ProximaFase titulo="El consolidador llega en la próxima fase">
        Las rectorías de campus y la Rectoría General recibirán aquí las secciones aprobadas de las unidades que les entregan, por función sustantiva, y
        decidirán qué entra en su informe. El aporte se cita; no se copia el texto.
      </ProximaFase>
    );
  } else if (seccion === "capacitacion") {
    cuerpo = <Capacitacion />;
  } else if (fallo) {
    cuerpo = <Aviso error={fallo} />;
  } else if (ciclos.isPending) {
    cuerpo = <Cargando texto="Cargando el ciclo…" />;
  } else if (seccion === "tablero") {
    cuerpo = (
      <Tablero
        ciclo={ciclo}
        ciclos={lista}
        requisitos={requisitos.data ?? []}
        elegirAnio={(a) => {
          const p = new URLSearchParams(params);
          p.set("anio", String(a));
          setParams(p, { replace: true });
        }}
      />
    );
  } else if (!ciclo) {
    cuerpo = <Vacio>Planeación todavía no abre el ciclo del informe de gestión.</Vacio>;
  } else if (seccion === "revision") {
    cuerpo = <Revision ciclo={ciclo} requisitos={requisitos.data ?? []} />;
  } else if (seccion === "vista") {
    cuerpo = <VistaInforme ciclo={ciclo} requisitos={requisitos.data ?? []} />;
  } else {
    cuerpo = <MiInforme ciclo={ciclo} requisitos={requisitos.data ?? []} />;
  }

  const [titulo, descripcion] = TITULOS[seccion];
  return (
    <AdminShell section="informes" kicker={ciclo ? `Informes Institucionales · ${ciclo.anio}` : "Informes Institucionales"} title={titulo} description={descripcion} rail={rail}>
      <div className="rk inf">{cuerpo}</div>
    </AdminShell>
  );
}

