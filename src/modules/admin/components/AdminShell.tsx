/* =============================================================================
   Esqueleto de la administración.
   Las pantallas internas repetían su propia barra lateral, su propia cabecera y
   su propio pie de guardado. Aquí viven una sola vez, y además es donde se
   decide qué entradas del menú ve cada rol.

   La intranet atiende tres frentes —el Plan de Desarrollo, UDES en Cifras y
   el Observatorio de Analítica— más el mantenimiento del sistema, así que el
   menú se agrupa por portal. La cabecera lleva la ruta (portal › pantalla) en
   lugar de un rótulo suelto.

   El menú tiene tres anchos, que se recuerdan en este navegador:
   · completo  rótulos y grupos; cada grupo se pliega desde su título.
   · íconos    una columna estrecha: ícono con su nombre al pasar o enfocar.
   · oculto    todo el ancho para el trabajo (la rejilla de Captura, el lienzo
               de Diseño); el botón de la cabecera lo devuelve.
   En el móvil el menú es siempre el cajón de antes.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { useTheme } from "../../../lib/theme";
import { INTRANET_HOME, roleLabels, useAuth } from "../../../lib/auth";
import type { AppRole } from "../../../types/database";
import "../admin.css";

export type AdminSection =
  | "office"
  | "documents"
  | "pillars"
  | "projects"
  | "faculties"
  | "campus"
  | "budget"
  | "structure"
  | "parameters"
  | "development"
  | "users"
  | "repository"
  | "cifras"
  | "observatorio"
  | "tableros"
  | "impacto"
  | "transfer"
  | "institution"
  | "pilo"
  | "pilo_ensenanza"
  | "reportes"
  | "correos"
  | "rutas"
  | "rankings"
  | "internacionalizacion"
  | "informes"
  | "warehouse"
  | "monitor";

export interface NavItem {
  id: AdminSection;
  label: string;
  icon: IconName;
  to: string;
  /** Rol mínimo para ver la entrada. */
  minimum: AppRole;
}

export interface NavGroup {
  id: "planeacion" | "pdi" | "cifras" | "observatorio" | "impacto" | "tableros" | "reportes" | "informes" | "internacionalizacion" | "rankings" | "warehouse" | "monitor" | "sistema";
  label: string;
  /** Ícono y nombre corto: el riel solo tiene 78 px, ahí no cabe el rótulo largo. */
  icon: IconName;
  short: string;
  items: NavItem[];
}

/** El menú de la intranet. El lanzador (/admin) lo reutiliza con los mismos permisos. */
export const navigation: NavGroup[] = [
  {
    // La portada del portal es lo primero que ve quien llega de fuera, así que
    // es también lo primero del menú de quien la escribe.
    id: "planeacion",
    icon: "document",
    short: "Planeación",
    label: "Portal de Planeación",
    items: [
      { id: "office", label: "Página de la oficina", icon: "document", to: "/admin/pagina", minimum: "consulta" },
      { id: "documents", label: "Documentos", icon: "layers", to: "/admin/documentos", minimum: "consulta" },
    ],
  },
  {
    id: "pdi",
    icon: "grid",
    short: "Plan",
    label: "Plan de Desarrollo",
    items: [
      { id: "pillars", label: "Gestión de pilares", icon: "grid", to: "/admin/pilares", minimum: "consulta" },
      // Los proyectos van justo después de los pilares y no dentro: son lo único
      // transversal del plan, uno puede apuntar a varios.
      { id: "projects", label: "Proyectos", icon: "columns", to: "/admin/proyectos", minimum: "consulta" },
      // Las facultades van pegadas a los proyectos porque responden a la otra mitad
      // de la misma pregunta: qué se está haciendo, y quién lo está empujando.
      { id: "faculties", label: "PDI por facultad", icon: "community", to: "/admin/facultades", minimum: "consulta" },
      { id: "campus", label: "PDI por campus", icon: "pin", to: "/admin/campus", minimum: "consulta" },
      // El presupuesto va detrás de los proyectos porque cuelga de ellos, y nunca
      // sale de aquí: no hay pantalla pública que lo muestre.
      { id: "budget", label: "Presupuesto", icon: "chart", to: "/admin/presupuesto", minimum: "consulta" },
      { id: "repository", label: "Repositorio", icon: "document", to: "/implementacion#repositorio", minimum: "consulta" },
    ],
  },
  {
    id: "cifras",
    icon: "table",
    short: "Cifras",
    label: "UDES en Cifras",
    items: [
      { id: "cifras", label: "Estaciones del periodo", icon: "table", to: "/admin/udes-en-cifras", minimum: "consulta" },
    ],
  },
  {
    id: "observatorio",
    icon: "spark-chart",
    short: "Observatorio",
    label: "Observatorio de Analítica",
    items: [
      { id: "observatorio", label: "Taller del Observatorio", icon: "spark-chart", to: "/admin/observatorio", minimum: "consulta" },
    ],
  },
  {
    // La medición del impacto de las tres funciones sustantivas: las
    // vicerrectorías definen y reportan, los programas eligen y aportan. Lo
    // que ve cada quien lo reparte su pertenencia, no este menú.
    id: "impacto",
    icon: "shield",
    short: "Impacto",
    label: "Indicadores de Impacto",
    items: [
      { id: "impacto", label: "Indicadores de impacto", icon: "spark-chart", to: "/admin/impacto", minimum: "consulta" },
    ],
  },
  {
    // Cada unidad con sus propios tableros. Va después del Observatorio porque
    // es lo mismo repartido: allí un observatorio institucional, aquí uno por
    // facultad, programa u oficina.
    id: "tableros",
    icon: "layers",
    short: "Tableros",
    label: "Mis Tableros",
    items: [
      { id: "tableros", label: "Unidades y tableros", icon: "layers", to: "/admin/tableros", minimum: "consulta" },
    ],
  },
  {
    // Lo que la Universidad le entrega al Estado: las plantillas SNIES por
    // periodo (y CNA, en borrador). Se captura con nombres y se exporta con
    // los códigos oficiales.
    id: "reportes",
    icon: "upload",
    short: "Reportes",
    label: "Reportes Institucionales",
    items: [
      { id: "reportes", label: "SNIES y CNA", icon: "table", to: "/admin/reportes-institucionales", minimum: "consulta" },
    ],
  },
  {
    // Cómo van las notas de los estudiantes, por facultad, programa, grupo y estudiante, con alertas
    // tempranas. Lo ve quien pertenece a una facultad o programa (su parte) y Planeación (todo).
    id: "monitor",
    icon: "spark-chart",
    short: "Monitor",
    label: "Monitor de alertas",
    items: [
      { id: "monitor", label: "Alertas tempranas de notas", icon: "spark-chart", to: "/admin/monitor-alertas", minimum: "consulta" },
    ],
  },
  {
    // Los reportes de Master, Galileo y Davinci guardados por periodo, para
    // consultarlos sin volver a pedirlos y vigilar el rendimiento académico.
    id: "warehouse",
    icon: "layers",
    short: "Warehouse",
    label: "Warehouse UDES",
    items: [
      { id: "warehouse", label: "Datos de las plataformas", icon: "layers", to: "/admin/warehouse", minimum: "planeacion" },
    ],
  },
  {
    // El informe de gestión anual de decanaturas, vicerrectorías y rectorías,
    // sobre las plantillas A–D, con cifras vivas de UDES en Cifras y del PDI.
    // Lo ve quien pertenece a una unidad, y Planeación.
    id: "informes",
    icon: "document",
    short: "Informes",
    label: "Informes Institucionales",
    items: [
      { id: "informes", label: "Informes de gestión", icon: "document", to: "/admin/informes-gestion", minimum: "consulta" },
    ],
  },
  {
    // El repositorio de la Oficina de Internacionalización: movilidad,
    // convenios y visitantes por campus, que responden a SNIES, CNA y rankings.
    // Lo ve quien está en el módulo (int_miembros) y la administración.
    id: "internacionalizacion",
    icon: "compass",
    short: "Internac.",
    label: "Internacionalización",
    items: [
      { id: "internacionalizacion", label: "Repositorio de datos", icon: "compass", to: "/admin/internacionalizacion", minimum: "consulta" },
    ],
  },
  {
    // Lo que la Universidad le muestra al mundo: THE Impact Rankings, THE World University
    // Rankings y UI GreenMetric, más el recolector que busca en las noticias de la UDES
    // lo que cada ODS puede mostrar como evidencia.
    id: "rankings",
    icon: "chart",
    short: "Rankings",
    label: "Rankings",
    items: [
      { id: "rankings", label: "Tablero de rankings", icon: "chart", to: "/admin/rankings", minimum: "planeacion" },
    ],
  },
  {
    id: "sistema",
    icon: "settings",
    short: "Sistema",
    label: "Sistema",
    items: [
      // Mantenimiento del esquema, no gestión del plan: solo se entra cuando algo
      // hay que arreglar.
      { id: "structure", label: "Normalizar estructura", icon: "settings", to: "/admin/estructura", minimum: "consulta" },
      { id: "parameters", label: "Parámetros globales", icon: "settings", to: "/admin/parametros", minimum: "consulta" },
      { id: "development", label: "Desarrollo tecnológico", icon: "code", to: "/admin/desarrollo", minimum: "consulta" },
      // Vicerrectorías, facultades y programas: de aquí salen las unidades de
      // Mis Tableros y la oferta de programas.
      { id: "institution", label: "Estructura institucional", icon: "community", to: "/admin/estructura-institucional", minimum: "admin" },
      { id: "users", label: "Usuarios y roles", icon: "user", to: "/admin/usuarios", minimum: "admin" },
      // Voz, resúmenes y síntesis con IA en los portales: la conexión y a quién se abre.
      { id: "pilo", label: "Mr. Pilo con IA", icon: "spark", to: "/admin/mr-pilo", minimum: "admin" },
      // El segundo Pilo: su página, su memoria, su catálogo y su bitácora. Comparte la conexión y la voz con el de arriba.
      { id: "pilo_ensenanza", label: "Mr. Pilo en Enseñanza", icon: "compass", to: "/admin/mr-pilo-ensenanza", minimum: "admin" },
      // Los correos de cuenta de Planeación y de Pilo: plantillas, conexión y bitácora.
      // Planeación entra a leer la bitácora; lo demás es de la administración.
      { id: "correos", label: "Correos", icon: "mail", to: "/admin/correos", minimum: "planeacion" },
      // El mapa de la ruta del bus UDES: calles de OpenStreetMap, flujo de estudiantes y paradas nuevas.
      { id: "rutas", label: "Rutas del bus", icon: "pin", to: "/admin/rutas", minimum: "planeacion" },
      // Copia otro servidor de Supabase en este. Reemplaza datos: solo administración.
      { id: "transfer", label: "Traslado de datos", icon: "upload", to: "/admin/traslado", minimum: "admin" },
    ],
  },
];


type NavMode = "completo" | "iconos" | "oculto";
const NAV_MODE_KEY = "intranet:menu";
const NAV_GROUPS_KEY = "intranet:menu-grupos";

/* El mismo menú, tres barras. No es un gusto suelto: quien pasa el día en la
   rejilla de Captura quiere el ancho y elige los menús de arriba; quien salta
   entre portales quiere las carpetas a un clic y elige el riel; quien lee la
   lista entera se queda en la lateral. La preferencia es de la persona y se
   recuerda en este navegador. */
type NavBar = "lateral" | "menus" | "riel";
const NAV_BAR_KEY = "intranet:barra";
/** Ancho del menú del perfil, el mismo que fija la hoja de estilos. */
const MENU_WIDTH = 252;
/** Ancho del panel de una carpeta en la barra de menús. */
const PANEL_WIDTH = 288;

const BARS: { id: NavBar; label: string; icon: IconName; hint: string }[] = [
  { id: "lateral", label: "Lateral", icon: "sidebar", hint: "Las carpetas abiertas en columna" },
  { id: "menus", label: "Barra de menús", icon: "menu", hint: "Una fila arriba; cada carpeta se abre al pulsarla" },
  { id: "riel", label: "Riel de carpetas", icon: "grip", hint: "Un riel estrecho con la carpeta abierta al lado" },
];

/** Dos letras para el botón del perfil: nunca una sola, nunca tres. */
function initials(name: string, email: string) {
  const parts = (name || email).trim().split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return "··";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : parts[0][1] ?? "";
  return (first + last).toUpperCase();
}

/** El nombre de pila para la barra de menús, como en la de los portales. */
function firstName(name: string, email: string) {
  return name.trim().split(/\s+/)[0] || email.split("@")[0];
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Sin almacenamiento (ventana privada): el menú vuelve a su ancho al recargar. */
  }
}

interface AdminShellProps {
  section: AdminSection;
  kicker: string;
  title: string;
  description?: string;
  /** Botonera de la cabecera. */
  actions?: ReactNode;
  /** Riel de la pantalla: sus vistas o estaciones, en el borde bajo de la
      cabecera (ver AdminRail). Así no ocupan una fila propia en el contenido. */
  rail?: ReactNode;
  /** Barra fija inferior de guardado. */
  footer?: ReactNode;
  children: ReactNode;
}

export function AdminShell({
  section,
  kicker,
  title,
  description,
  actions,
  rail,
  footer,
  children,
}: AdminShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [navMode, setNavModeState] = useState<NavMode>(() => readStored<NavMode>(NAV_MODE_KEY, "completo"));
  const [folded, setFolded] = useState<string[]>(() => readStored<string[]>(NAV_GROUPS_KEY, []));
  const setNavMode = (mode: NavMode) => {
    setNavModeState(mode);
    store(NAV_MODE_KEY, mode);
  };
  const [bar, setBarState] = useState<NavBar>(() => {
    // Un valor desconocido en el almacenamiento no puede dejar la barra trabada.
    const stored = readStored<NavBar>(NAV_BAR_KEY, "lateral");
    return BARS.some((option) => option.id === stored) ? stored : "lateral";
  });
  // Qué carpeta está abierta en los menús y en el riel (en la lateral manda `folded`).
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // El menú del perfil sale de la columna, y la columna recorta lo que se sale
  // (overflow-y: auto). Así que no cuelga del pie: se fija a la ventana en la
  // posición que tenga el botón cuando se abre.
  const profileRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  // En la barra de menús el panel de la carpeta tampoco cuelga del rótulo: la
  // barra abre su propio contexto de apilamiento y la cabecera de la pantalla le
  // caía encima. Se dibuja fuera, sobre la ventana, con la medida del rótulo.
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const setBar = (next: NavBar) => {
    setBarState(next);
    store(NAV_BAR_KEY, next);
    setOpenMenu(null);
    setProfileOpen(false);
    // El ancho de íconos es un modo de la lateral: en las otras dos no significa nada.
    if (next !== "lateral" && navMode === "iconos") setNavMode("completo");
  };
  const toggleProfile = () => {
    const button = profileRef.current;
    if (profileOpen || !button) {
      setProfileOpen(false);
      return;
    }
    const rect = button.getBoundingClientRect();
    // Pegado a la ventana, nunca fuera de ella: con la barra desplazada el botón
    // puede quedar muy abajo y el menú se iría a donde nadie lo alcanza.
    const clamp = (value: number, max: number) => Math.round(Math.max(8, Math.min(value, max)));
    setMenuStyle(
      bar === "menus"
        ? {
            // Cuelga del borde de la barra, como el de los portales, no del botón.
            top: clamp((sidebarRef.current?.getBoundingClientRect().bottom ?? rect.bottom) + 6, window.innerHeight - 120),
            right: clamp(window.innerWidth - rect.right, window.innerWidth - MENU_WIDTH - 8),
          }
        : {
            bottom: clamp(window.innerHeight - rect.top + 8, window.innerHeight - 120),
            left: clamp(bar === "riel" ? rect.right + 8 : rect.left, window.innerWidth - MENU_WIDTH - 8),
          },
    );
    setOpenMenu(bar === "menus" ? null : openMenu);
    setProfileOpen(true);
  };
  const toggleGroup = (id: string) =>
    setFolded((current) => {
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
      store(NAV_GROUPS_KEY, next);
      return next;
    });
  const { resolved, toggle } = useTheme();
  const { profile, signOut, hasRole, canSee } = useAuth();
  const navigate = useNavigate();
  const group = navigation.find((g) => g.items.some((item) => item.id === section));
  const openGroup = openMenu ? navigation.find((g) => g.id === openMenu) : undefined;
  const shellRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // La barra de menús se comprime por niveles hasta caber en UNA fila, a
  // cualquier ancho (320-2560 px), con la letra grande del sistema y con nombres
  // largos: 0 rótulos completos · 1 rótulos cortos · 2 solo íconos y la persona
  // en sus iniciales · 3 lo mismo con los espacios apretados. Cada nivel se
  // prueba en el DOM (data-density en la cáscara) y se mide de verdad, así que
  // el resultado no depende de tamaños adivinados. Con el cajón (≤900 px) no aplica.
  const groupCount = navigation.filter((g) => g.items.some((item) => hasRole(item.minimum) && canSee(item.id))).length;
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const side = sidebarRef.current;
    const nav = side?.querySelector<HTMLElement>(".admin-nav");
    const head = side?.querySelector<HTMLElement>(".admin-sidebar__head");
    const foot = side?.querySelector<HTMLElement>(".admin-sidebar__foot");
    if (!shell || !side || !nav || !head || !foot) return;
    if (bar !== "menus") {
      shell.removeAttribute("data-density");
      return;
    }
    const fit = () => {
      if (!window.matchMedia("(min-width: 901px)").matches) {
        shell.removeAttribute("data-density");
        return;
      }
      let chosen = 3;
      for (let level = 0; level <= 3; level += 1) {
        shell.setAttribute("data-density", String(level));
        const style = getComputedStyle(side);
        const gap = parseFloat(style.columnGap) || 0;
        const room = side.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const groups = Array.from(nav.children) as HTMLElement[];
        const navNeed = groups.reduce((sum, el) => sum + el.offsetWidth, 0) + Math.max(0, groups.length - 1) * (parseFloat(getComputedStyle(nav).columnGap) || 0);
        if (head.offsetWidth + navNeed + foot.offsetWidth + gap * 2 <= room) {
          chosen = level;
          break;
        }
      }
      shell.setAttribute("data-density", String(chosen));
    };
    fit();
    const observer = new ResizeObserver(fit);
    [side, head, foot].forEach((node) => observer.observe(node));
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [bar, groupCount, navMode, profile?.full_name]);

  // La cabecera es fija y su alto cambia con la descripción y el ancho. Las
  // cabeceras pegajosas de las pantallas (rejillas, listas) se colocan debajo
  // leyendo --admin-topbar-h.
  useEffect(() => {
    const shell = shellRef.current;
    const topbar = topbarRef.current;
    if (!shell || !topbar || typeof ResizeObserver === "undefined") return;
    const sidebar = sidebarRef.current;
    const observer = new ResizeObserver(() => {
      const barHeight = bar === "menus" && sidebar ? sidebar.getBoundingClientRect().height : 0;
      shell.style.setProperty(
        "--admin-bar-h",
        `${Math.round(barHeight)}px`,
      );
      shell.style.setProperty(
        "--admin-topbar-h",
        `${Math.round(barHeight + topbar.getBoundingClientRect().height)}px`,
      );
    });
    observer.observe(topbar);
    if (sidebar) observer.observe(sidebar);
    return () => observer.disconnect();
  }, [bar]);

  // Un clic fuera cierra lo que esté abierto. Antes esto lo hacía una capa
  // transparente sobre toda la cáscara, y esa capa se comía los clics del propio
  // menú: se podía abrir, pero no elegir nada. Escuchar el puntero no tapa nada.
  useEffect(() => {
    if (!profileOpen && openMenu === null) return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target && target.closest(".admin-menu, .admin-nav__panel, .admin-nav__fly, .admin-profile, .admin-nav__group-label")) return;
      setProfileOpen(false);
      if (bar === "menus") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [profileOpen, openMenu, bar]);

  // Un menú abierto se cierra con Escape: en una aplicación de escritorio nadie
  // busca el ratón para eso.
  useEffect(() => {
    if (!profileOpen && openMenu === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileOpen(false);
      if (bar !== "riel") setOpenMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen, openMenu, bar]);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [profileOpen]);

  useEffect(() => {
    document.title = `${title} | Intranet UDES`;
    return () => {
      document.title = "PDI 2024-2028 | Universidad de Santander";
    };
  }, [title]);

  async function handleSignOut() {
    await signOut();
    navigate("/acceso-intranet", { replace: true });
  }

  return (
    <div
      ref={shellRef}
      className={`admin-shell${navOpen ? " nav-open" : ""}`}
      data-nav={navMode}
      data-bar={bar}
    >
      <a className="skip-link" href="#admin-contenido">
        Saltar al contenido
      </a>

      <aside ref={sidebarRef} className="admin-sidebar" id="admin-nav">
        <div className="admin-sidebar__head">
          <Link className="admin-brand" to="/admin" aria-label="Intranet UDES · inicio">
            <img src="/logo-udes.svg" alt="" width={95} height={34} />
            <span>
              <strong>Intranet UDES</strong>
              <small>Planeación institucional</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-button admin-sidebar__fold"
            aria-label={navMode === "iconos" ? "Expandir el menú" : "Contraer el menú a íconos"}
            title={navMode === "iconos" ? "Expandir el menú" : "Contraer a íconos"}
            aria-pressed={navMode === "iconos"}
            onClick={() => setNavMode(navMode === "iconos" ? "completo" : "iconos")}
          >
            <Icon name="sidebar" size={17} />
          </button>
        </div>

        <nav className="admin-nav" aria-label="Navegación administrativa">
          {navigation.map((navGroup) => {
            // El rol de acceso decide qué pantallas se enseñan; el rol clásico, con
            // qué permiso se entra a ellas.
            const items = navGroup.items.filter((item) => hasRole(item.minimum) && canSee(item.id));
            if (items.length === 0) return null;
            const holdsCurrent = items.some((item) => item.id === section);
            // En la lateral el grupo se pliega y puede haber varios abiertos.
            // En los menús y en el riel solo hay una carpeta abierta a la vez:
            // es lo que se espera de un menú al que se entra pulsando.
            // Plegado solo en el menú completo: en el de íconos cada grupo es
            // una columna corta y plegarlo escondería la pantalla sin aviso.
            const railOpen = bar === "riel" ? openMenu ?? group?.id ?? navigation[0]?.id ?? null : openMenu;
            const isOpen = bar === "lateral" ? navMode === "iconos" || !folded.includes(navGroup.id) : railOpen === navGroup.id;
            const isFolded = !isOpen;
            return (
              <div className="admin-nav__group" key={navGroup.id} data-folded={isFolded || undefined}>
                <button
                  type="button"
                  className="admin-nav__group-label"
                  id={`admin-nav-${navGroup.id}`}
                  aria-expanded={isOpen}
                  aria-current={bar === "riel" && holdsCurrent ? "true" : undefined}
                  data-current={(bar === "menus" && holdsCurrent) || undefined}
                  aria-controls={`admin-nav-${navGroup.id}-lista`}
                  data-tip={navGroup.label}
                  title={bar === "menus" ? navGroup.label : undefined}
                  onClick={(event) => {
                    if (bar === "lateral") {
                      toggleGroup(navGroup.id);
                      return;
                    }
                    setProfileOpen(false);
                    if (bar === "menus") {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setPanelStyle({
                        top: Math.round((sidebarRef.current?.getBoundingClientRect().bottom ?? rect.bottom) + 6),
                        left: Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))),
                      });
                    }
                    // El riel siempre tiene una carpeta abierta: volver a pulsar
                    // la suya no deja la columna vacía.
                    setOpenMenu(isOpen && bar === "menus" ? null : navGroup.id);
                  }}
                >
                  <Icon name={navGroup.icon} size={19} className="admin-nav__group-icon" />
                  <span className="admin-nav__group-name">{bar === "riel" ? navGroup.short : navGroup.label}</span>
                  {/* En la barra de menús, si el ancho no da para los rótulos largos, entran los cortos. */}
                  {bar === "menus" && <span className="admin-nav__group-short">{navGroup.short}</span>}
                  {bar === "lateral" && isFolded && (
                    <span className="admin-nav__group-count">
                      {holdsCurrent && <i className="admin-nav__here" aria-hidden="true" />}
                      {items.length}
                      <span className="sr-only">
                        {items.length === 1 ? " pantalla" : " pantallas"}
                        {holdsCurrent ? ", incluye la actual" : ""}
                      </span>
                    </span>
                  )}
                  {bar === "riel" && holdsCurrent && <i className="admin-nav__rail-here" aria-hidden="true" />}
                  <Icon name="chevron-down" size={14} className="admin-nav__chevron" />
                </button>
                {bar !== "menus" && (
                <ul
                  id={`admin-nav-${navGroup.id}-lista`}
                  className={bar === "riel" ? "admin-nav__fly" : undefined}
                  aria-labelledby={`admin-nav-${navGroup.id}`}
                  hidden={isFolded}
                >
                  {bar === "riel" && <li className="admin-nav__fly-head">{navGroup.label}</li>}
                  {items.map((item) => (
                    <li key={item.id}>
                      <NavLink
                        to={item.to}
                        className={item.id === section ? "is-active" : ""}
                        aria-current={item.id === section ? "page" : undefined}
                        data-tip={item.label}
                        onClick={() => {
                          setNavOpen(false);
                        }}
                      >
                        <Icon name={item.icon} size={17} />
                        <span className="admin-nav__text">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* El pie era una lista de cinco enlaces que competía con el menú. Ahora
            es un solo control —quién está dentro— y detrás de él lo que no es
            una pantalla de trabajo: salir a los portales, la ayuda, la barra y
            el cierre de sesión. */}
        <div className="admin-sidebar__foot">
          {/* En la barra de menús el tema sube a la barra, como en los portales. */}
          {bar === "menus" && (
            <button
              type="button"
              className="admin-bar-icon"
              onClick={toggle}
              aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
            </button>
          )}
          <button
            type="button"
            className="admin-profile"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-controls="admin-perfil"
            data-tip={profile ? profile.full_name || profile.email : "Tu perfil"}
            ref={profileRef}
            onClick={toggleProfile}
          >
            <span className="admin-profile__av" aria-hidden="true">
              {profile ? initials(profile.full_name ?? "", profile.email ?? "") : "··"}
            </span>
            <span className="admin-profile__id">
              <span className="admin-identity__name">{profile ? profile.full_name || profile.email : "Sesión"}</span>
              <span className="admin-identity__first">{profile ? firstName(profile.full_name ?? "", profile.email ?? "") : "Sesión"}</span>
              <span className="admin-identity__role">{profile ? roleLabels[profile.role] : ""}</span>
            </span>
            <Icon name="chevron-down" size={14} className="admin-nav__chevron" />
          </button>
        </div>
      </aside>

      {/* El panel de la carpeta abierta, fuera de la barra por lo mismo. */}
      {bar === "menus" && openGroup && (
        <div className="admin-menu admin-menu--carpeta" id={`admin-nav-${openGroup.id}-lista`} style={panelStyle}>
          <p className="admin-menu__head">{openGroup.label}</p>
          <ul aria-label={openGroup.label}>
            {openGroup.items
              .filter((item) => hasRole(item.minimum) && canSee(item.id))
              .map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    className={item.id === section ? "is-active" : undefined}
                    aria-current={item.id === section ? "page" : undefined}
                    onClick={() => setOpenMenu(null)}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="admin-menu__label">{item.label}</span>
                    {item.id === section && <Icon name="check" size={15} className="admin-menu__check" />}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* El menú se dibuja FUERA de la barra: dentro, la barra abre su propio
          contexto de apilamiento y cualquier capa de la cáscara le caía encima y
          se tragaba los clics. Se coloca sobre la ventana con la medida del botón. */}
      {profileOpen && (
        <div className="admin-menu" id="admin-perfil" style={menuStyle}>
          {profile && (
            <div className="admin-menu__who">
              <span className="admin-profile__av admin-profile__av--lg" aria-hidden="true">
                {initials(profile.full_name ?? "", profile.email ?? "")}
              </span>
              <span>
                <strong>{profile.full_name || profile.email}</strong>
                <small>{roleLabels[profile.role]}</small>
              </span>
            </div>
      )}

          <p className="admin-menu__head" id="admin-perfil-barra">
            Barra de navegación
          </p>
          <ul role="group" aria-labelledby="admin-perfil-barra">
            {BARS.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={option.id === bar ? "is-active" : undefined}
                  aria-pressed={option.id === bar}
                  onClick={() => setBar(option.id)}
                >
                  <Icon name={option.icon} size={16} />
                  <span className="admin-menu__label">
                    {option.label}
                    <small>{option.hint}</small>
                  </span>
                  {option.id === bar && <Icon name="check" size={15} className="admin-menu__check" />}
                </button>
              </li>
            ))}
          </ul>

          <hr />
          <p className="admin-menu__head">Ir a</p>
          <ul>
            <li>
              <Link to="/" onClick={() => setProfileOpen(false)}>
                <Icon name="external" size={16} />
                <span className="admin-menu__label">Portal PDI</span>
              </Link>
            </li>
            <li>
              <Link to="/datos-abiertos" onClick={() => setProfileOpen(false)}>
                <Icon name="external" size={16} />
                <span className="admin-menu__label">UDES en Cifras</span>
              </Link>
            </li>
            <li>
              <a href="mailto:planeacion@udes.edu.co">
                <Icon name="document" size={16} />
                <span className="admin-menu__label">Ayuda</span>
              </a>
            </li>
          </ul>

          <hr />
          <ul>
            <li>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setNavMode("oculto");
                }}
              >
                <Icon name="eye-off" size={16} />
                <span className="admin-menu__label">Ocultar la barra</span>
              </button>
            </li>
            <li>
              <button type="button" className="admin-menu__out" onClick={handleSignOut}>
                <Icon name="arrow-left" size={16} />
                <span className="admin-menu__label">Cerrar sesión</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      {/* Capa que cierra el menú en móvil sin robar el foco al contenido. */}
      {navOpen && (
        <button
          className="admin-scrim"
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="admin-body">
        {/* Una sola línea: portal › título · de qué se trata, y las acciones. El
            riel de la pantalla, si lo trae, cierra la cabecera por abajo. Antes
            eran cuatro filas —ruta, título, descripción y, más abajo, las
            pestañas— y se comían el alto que la rejilla necesita. */}
        <header ref={topbarRef} className="admin-topbar" data-rail={rail ? "" : undefined}>
          <div className="admin-topbar__row">
            <button
              className="icon-button admin-nav-toggle"
              type="button"
              aria-expanded={navOpen}
              aria-controls="admin-nav"
              aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Icon name={navOpen ? "close" : "menu"} size={18} />
            </button>
            {navMode === "oculto" && (
              <button
                className="icon-button admin-nav-restore"
                type="button"
                aria-controls="admin-nav"
                aria-label="Mostrar el menú"
                title="Mostrar el menú"
                onClick={() => setNavMode("completo")}
              >
                <Icon name="sidebar" size={18} />
              </button>
            )}

            <div className="admin-topbar__copy">
              {/* La ruta lleva hasta el título, que es su último tramo. */}
              <nav className="admin-crumbs" aria-label="Ruta">
                <ol>
                  <li>{group?.label ?? kicker}</li>
                  {group && group.id !== "cifras" && group.id !== "observatorio" && group.id !== "impacto" && kicker && kicker !== group.label && <li>{kicker}</li>}
                </ol>
              </nav>
              <h1>{title}</h1>
              {/* Una línea, no un párrafo: el texto entero queda en el título del elemento. */}
              {description && (
                <p className="admin-topbar__meta" title={description}>
                  {description}
                </p>
              )}
            </div>

            <div className="admin-topbar__actions">
              {actions}
              {/* Volver al panel (el lanzador) desde cualquier pantalla, sin abrir menús. */}
              <Link className="button-secondary admin-topbar__panel" to={INTRANET_HOME} title="Panel de la intranet">
                <Icon name="grid" size={16} />
                <span className="admin-topbar__panel-label">Panel</span>
              </Link>
              <button
                className="icon-button theme-toggle"
                type="button"
                onClick={toggle}
                aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              >
                <Icon name={resolved === "dark" ? "sun" : "moon"} size={17} />
              </button>
            </div>
          </div>
          {rail && <div className="admin-topbar__rail">{rail}</div>}
        </header>

        <main className="admin-main" id="admin-contenido">
          {children}
        </main>

        {footer && <footer className="admin-savebar">{footer}</footer>}
      </div>
    </div>
  );
}

/**
 * El riel de una pantalla: sus vistas o estaciones, colgadas del borde bajo de
 * la cabecera. Va en la prop `rail` de AdminShell.
 */
export function AdminRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="admin-rail" aria-label={label}>
      {children}
    </nav>
  );
}

export function AdminRailTab({
  current,
  count,
  to,
  onSelect,
  children,
}: {
  current: boolean;
  /** Cuántos hay detrás, si importa saberlo antes de entrar. */
  count?: number;
  /** Con dirección es un enlace; si no, un botón que cambia la vista. */
  to?: string;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const content = (
    <>
      {children}
      {count !== undefined && count > 0 && <span className="admin-rail__count">{count}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="admin-rail__tab" aria-current={current ? "page" : undefined}>
      {content}
    </Link>
  ) : (
    <button type="button" className="admin-rail__tab" aria-current={current ? "page" : undefined} onClick={onSelect}>
      {content}
    </button>
  );
}

/** Aviso reutilizable para quien solo puede leer. */
export function ReadOnlyNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="admin-readonly" role="note">
      <Icon name="lock" size={15} />
      {children ?? "Tu rol permite consultar esta información, no modificarla."}
    </p>
  );
}
