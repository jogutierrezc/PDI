/* =============================================================================
   Planeación y Seguimiento · modo demostración (SOLO DESARROLLO).

   /__ps-demo/:seccion?/:id?  con ?estado=ninguno|borrador|publicado  &nivel=admin|lector|…  &latencia=ms
   Usa la capa de datos en memoria (los 75 proyectos reales) y no necesita sesión ni base.
   La ruta solo se registra si `import.meta.env.DEV` (App.tsx); en producción no existe ni
   queda en el paquete. No concede ningún permiso: es una pantalla sin datos de verdad.
   ========================================================================== */

import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { crearApiMemoria } from "./api";
import { PsApp } from "./PlaneacionSeguimiento";
import type { PsNivel } from "./modelo";

const NIVELES: PsNivel[] = ["none", "lector", "colaborador", "gestor", "aprobador", "admin"];

export function PsDemo() {
  const { seccion, id } = useParams();
  const [params] = useSearchParams();
  const estadoParam = params.get("estado");
  const estado = estadoParam === "ninguno" || estadoParam === "borrador" ? estadoParam : "publicado";
  const nivelParam = params.get("nivel") as PsNivel | null;
  const nivel = nivelParam && NIVELES.includes(nivelParam) ? nivelParam : "admin";
  const latencia = Number(params.get("latencia") ?? 0) || 0;
  const api = useMemo(() => crearApiMemoria({ estado, nivel, latencia }), [estado, nivel, latencia]);
  return <PsApp key={`${estado}-${nivel}`} api={api} nivel={nivel} base="/__ps-demo" seccion={seccion} id={id} envoltura="demo" />;
}
