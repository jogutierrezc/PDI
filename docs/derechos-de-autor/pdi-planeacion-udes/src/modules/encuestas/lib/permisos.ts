/* =============================================================================
   Encuestas con Pilo · permisos.

   Espejo de la regla de la base (función «encuestas», migración 0179): ve el
   módulo quien tiene la pantalla; edita (título, mensajes, abrir o cerrar,
   estados) el Gestor, que es Planeación o la administración; Consulta solo lee.
   La base manda: esto solo evita ofrecer botones que no van a funcionar.
   ========================================================================== */

import type { AppRole } from "../../../types/database";

const RANGO: Record<AppRole, number> = { consulta: 0, responsable: 1, planeacion: 2, admin: 3 };

export const puedeEditarEncuestas = (rol: AppRole | null | undefined): boolean => Boolean(rol && RANGO[rol] >= RANGO.planeacion);
