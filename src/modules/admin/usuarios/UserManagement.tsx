/* =============================================================================
   Usuarios y roles.

   Cuatro vistas bajo la misma pantalla, cada una con su dirección:

     /admin/usuarios            Personas: lista y ficha (o el asistente).
     /admin/usuarios/roles      Roles: lista y matriz del rol abierto.
     /admin/usuarios/carga      Carga masiva de usuarios y asignaciones.
     /admin/usuarios/microsoft  Acceso con Microsoft: lista de correos habilitados.

   La persona o el rol abiertos van en la dirección (?persona=, ?rol=), así
   que se pueden enlazar: la ficha de una unidad en Estructura institucional
   lleva directo a la persona.

   El alta pasa por la Edge Function admin-users porque crear una cuenta exige
   la clave de servicio. Lo demás son escrituras normales o funciones de 0073,
   y RLS decide: esta pantalla no concede nada que la base no conceda.
   ========================================================================== */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { useProfiles } from "../../../data/queries";
import { BulkUsers } from "./BulkUsers";
import { MicrosoftAccess } from "./MicrosoftAccess";
import { PeopleView } from "./PeopleView";
import { useMemberships, useUnitOptions } from "./people-db";
import { RolesView } from "./RolesView";
import "./usuarios.css";

const VIEWS = [
  { id: "personas", label: "Personas", path: "/admin/usuarios" },
  { id: "roles", label: "Roles", path: "/admin/usuarios/roles" },
  { id: "carga", label: "Carga masiva", path: "/admin/usuarios/carga" },
  { id: "microsoft", label: "Acceso Microsoft", path: "/admin/usuarios/microsoft" },
] as const;

export function UserManagement() {
  const { vista } = useParams();
  const navigate = useNavigate();
  const view = VIEWS.find((item) => item.id === vista) ?? VIEWS[0];
  const profiles = useProfiles();
  const memberships = useMemberships();
  const units = useUnitOptions();
  const [notice, setNotice] = useState("");

  return (
    <AdminShell
      section="users"
      kicker="Sistema"
      title="Usuarios y roles"
      description="Quién entra a la intranet, qué hace en toda la universidad y en qué unidades trabaja."
      rail={
        <AdminRail label="Vistas de usuarios y roles">
          {VIEWS.map((item) => (
            <AdminRailTab key={item.id} to={item.path} current={item.id === view.id}>
              {item.label}
            </AdminRailTab>
          ))}
        </AdminRail>
      }
      actions={
        <button className="button-primary" type="button" onClick={() => navigate("/admin/usuarios?nueva=1")}>
          <Icon name="plus" size={16} /> Crear usuario
        </button>
      }
    >
      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> {notice}
          <button type="button" className="us-icon-button" aria-label="Cerrar el aviso" onClick={() => setNotice("")}>
            <Icon name="close" size={14} />
          </button>
        </p>
      )}

      {(memberships.isError || units.isError) && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> No se pudieron leer las unidades: ¿falta aplicar la migración 0073?
        </p>
      )}

      {view.id === "personas" && (
        <PeopleView
          profiles={profiles}
          memberships={memberships.data ?? []}
          units={units.data ?? []}
          onNotice={setNotice}
        />
      )}
      {view.id === "roles" && <RolesView profiles={profiles.data ?? []} />}
      {view.id === "carga" && <BulkUsers profiles={profiles.data ?? []} units={units.data ?? []} />}
      {view.id === "microsoft" && <MicrosoftAccess profiles={profiles.data ?? []} />}
    </AdminShell>
  );
}
