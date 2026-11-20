/* =============================================================================
   Planeación y Seguimiento · modo demostración (SOLO DESARROLLO).

   /__ps-demo/:seccion?/:id?  con ?estado=ninguno|borrador|publicado  &nivel=admin|aprobador|gestor|colaborador|lector|none
                              &papel=gestor|colaborador|lector|ninguno  (papel de la persona en su oficina: jefe, editor, visor de `unit_members`)
                              &latencia=ms
   Poder efectivo = el menor entre ?nivel= (ps_nivel) y ?papel= (unit_role). Sin ?papel= y sin ?nivel=, administrador (opera todo);
   con ?papel= y sin ?nivel=, nivel gestor para que lo decida el papel. «Hoy» es el 30 de junio de 2027.
   Usa la capa de datos en memoria (los 75 proyectos reales) y no necesita sesión ni base.
   La ruta solo se registra si `import.meta.env.DEV` (App.tsx); en producción no existe ni
   queda en el paquete. No concede ningún permiso: es una pantalla sin datos de verdad.
   ========================================================================== */

import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { crearApiMemoria } from "./api";
import { PsApp } from "./PlaneacionSeguimiento";
import type { PsNivel } from "./modelo";

const NIVELES: PsNivel[] = ["none", "lector", "colaborador", "gestor", "aprobador", "financiero", "admin"];

export function PsDemo() {
  const { seccion, id } = useParams();
  const [params] = useSearchParams();
  const estadoParam = params.get("estado");
  const estado = estadoParam === "ninguno" || estadoParam === "borrador" ? estadoParam : "publicado";
  const nivelParam = params.get("nivel") as PsNivel | null;
  const papelParam = params.get("papel");
  const papel = papelParam === "gestor" ? "jefe" : papelParam === "colaborador" ? "editor" : papelParam === "lector" ? "visor" : papelParam === "ninguno" ? "ninguno" : null;
  const nivel = nivelParam && NIVELES.includes(nivelParam) ? nivelParam : papel ? "gestor" : "admin";
  const latencia = Number(params.get("latencia") ?? 0) || 0;
  const api = useMemo(() => crearApiMemoria({ estado, nivel, latencia, papel: papel ?? "jefe" }), [estado, nivel, latencia, papel]);
  return <PsApp key={`${estado}-${nivel}-${papel}`} api={api} nivel={nivel} base="/__ps-demo" seccion={seccion} id={id} envoltura="demo" />;
}
