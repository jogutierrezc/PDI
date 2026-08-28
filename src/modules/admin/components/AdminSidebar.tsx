import type { ReactNode } from "react";
import "./admin-sidebar.css";

export type AdminSection = "dashboard" | "users" | "pillars" | "parameters" | "repository";

interface AdminSidebarProps {
  activeSection: AdminSection;
  showNewInitiative?: boolean;
  children?: ReactNode;
}

const navigation = [
  { id: "parameters", label: "Parámetros globales", icon: "⚙", href: "/admin/parametros" },
  { id: "dashboard", label: "Panel de control", icon: "▦", href: "/admin/pilares" },
  { id: "users", label: "Usuarios", icon: "♙", href: "/admin/pilares" },
  { id: "pillars", label: "Gestión de pilares", icon: "◇", href: "/admin/pilares" },
  { id: "repository", label: "Repositorio", icon: "▤", href: "/implementacion" },
] as const;

export function AdminSidebar({ activeSection, showNewInitiative = false, children }: AdminSidebarProps) {
  return <aside className="admin-sidebar"><a className="admin-brand" href="/admin/pilares"><img src="/logo-udes.svg" alt="Universidad de Santander" /><strong>Avant PDI</strong><span>Administración institucional</span></a>{showNewInitiative && <button className="admin-sidebar__primary" type="button">＋ Nueva iniciativa</button>}<nav className="admin-nav" aria-label="Navegación administrativa">{navigation.map((item) => <a className={activeSection === item.id ? "is-active" : ""} href={item.href} key={item.id}><span>{item.icon}</span>{item.label}</a>)}</nav><div className="admin-sidebar__bottom">{children}<a href="mailto:planeacion@udes.edu.co"><span>?</span> Ayuda</a><a href="/acceso-intranet" onClick={() => localStorage.removeItem("pdi-admin-session")}><span>↪</span> Cerrar sesión</a></div></aside>;
}
