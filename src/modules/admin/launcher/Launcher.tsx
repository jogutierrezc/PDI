/* =============================================================================
   Intranet · el lanzador (/admin).

   Lo primero al entrar: un saludo, dónde puede trabajar la persona y lo que
   tiene pendiente. Los módulos salen del mismo menú de la intranet y con las
   mismas reglas (rol mínimo y canSee): si no tiene nada que hacer en un
   módulo, no aparece ni aquí ni en el menú.

   Con pocos módulos (lo normal para una vicerrectoría o un programa), cada
   uno es una tarjeta con sus accesos directos. Con muchos (administración),
   van agrupados como en el menú, con un buscador para ir directo.

   La primera vez que la persona entra, Mr. Pilo arranca solo el recorrido de
   su rol; después queda el botón «Recorrido guiado».

   Movimiento (GSAP): el saludo y las tarjetas llegan en cascada de 40 ms.
   Elegir un módulo no se anima: se hace muchas veces al día.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useQuery } from "@tanstack/react-query";
import { Icon, type IconName } from "../../../components/ui/Icon";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { useTour } from "../../../components/tour/TourProvider";
import { intranetTourFor, tourById } from "../../../components/tour/tours";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { navigation, type NavGroup, type NavItem } from "../components/AdminShell";
import "./launcher.css";

const GROUP_TEXT: Record<NavGroup["id"], string> = {
  planeacion: "La portada pública y los documentos de la oficina",
  pdi: "Pilares, proyectos, facultades, sedes y presupuesto del plan",
  cifras: "Las estaciones del periodo de UDES en Cifras",
  observatorio: "El taller de análisis y sus boletines",
  impacto: "Los indicadores de impacto, sus metas y sus cifras",
  tableros: "Los tableros de datos de sus unidades",
  reportes: "Las plantillas SNIES por periodo: captura, validación y envío",
  sistema: "Estructura, usuarios, parámetros y traslado de datos",
};

interface QuickLink {
  label: string;
  to: string;
  primary?: boolean;
}

const DATE = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });

export function Launcher() {
  const { profile, hasRole, canSee, impactoSide, signOut } = useAuth();
  const { start, isDone, active } = useTour();
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [tourOffer, setTourOffer] = useState(true);

  // Los módulos que la persona puede usar, con las reglas del menú.
  const groups = useMemo(
    () =>
      navigation
        .map((g) => ({ ...g, items: g.items.filter((item) => hasRole(item.minimum) && canSee(item.id as never)) }))
        .filter((g) => g.items.length > 0),
    [hasRole, canSee],
  );
  const compact = groups.length > 3;
  const admin = hasRole("admin");
  const tourId = intranetTourFor({ admin, impactoSide });
  const tour = tourId ? tourById(tourId) : null;
  const firstTime = tourId ? isDone(tourId) === false : false;
  const pending = usePending(impactoSide);

  // Primer ingreso: el recorrido arranca solo, una vez.
  const started = useRef(false);
  useEffect(() => {
    if (!tourId || !firstTime || started.current || active) return;
    started.current = true;
    const timer = window.setTimeout(() => start(tourId), 900);
    return () => window.clearTimeout(timer);
  }, [tourId, firstTime, active, start]);

  // La entrada en cascada.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-anim]", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.28, stagger: 0.04, ease: "expo.out", clearProps: "transform" });
    }, node);
    return () => ctx.revert();
  }, []);

  // Buscar entre todas las pantallas que puede abrir.
  const allItems = groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })));
  const q = query.trim().toLowerCase();
  const matches = q ? allItems.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(q)) : [];

  const quick = (group: NavGroup & { items: NavItem[] }): QuickLink[] => {
    if (group.id === "impacto") {
      if (impactoSide === "programa") {
        return [
          { label: "Registrar cifras", to: "/admin/impacto/programa", primary: true },
          { label: "Mi catálogo", to: "/admin/impacto/mi-catalogo" },
          { label: "Elegir indicadores", to: "/admin/impacto/elegir" },
        ];
      }
      if (impactoSide === "funcion" || impactoSide === "ambos") {
        return [
          { label: "Nuevo indicador", to: "/admin/impacto/catalogo?nuevo=1", primary: true },
          { label: "Mi catálogo", to: "/admin/impacto/catalogo" },
          { label: "Captura", to: "/admin/impacto/captura" },
          { label: "Importar", to: "/admin/impacto/importar" },
          { label: "De los programas", to: "/admin/impacto/programas" },
        ];
      }
    }
    return group.items.map((item, k) => ({ label: item.label, to: item.to, primary: k === 0 }));
  };

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "";

  return (
    <div ref={root} className="ln">
      <header className="ln__top">
        <Link to="/" className="ln__brand">
          <img src="/logo-udes.svg" alt="" width={86} height={31} />
          <span>Intranet</span>
        </Link>
        <span className="ln__spacer" />
        {tour && (
          <button type="button" className="ln__tour" data-tour="launcher-tour" onClick={() => start(tour.id)}>
            <PiloAvatar mood="feliz" size={26} />
            Recorrido guiado
          </button>
        )}
        <span className="ln__who">
          <span aria-hidden="true">{(profile?.full_name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
          {profile?.full_name || profile?.email}
        </span>
        <button type="button" className="ln__out" onClick={() => void signOut().then(() => navigate("/acceso-intranet"))}>
          Salir
        </button>
      </header>

      <main className="ln__main" data-compact={compact || undefined}>
        <section className="ln__work">
          <div className="ln__hello" data-anim>
            <span>{DATE.format(new Date()).replace(/^./, (c) => c.toUpperCase())}</span>
            <h1>Hola{firstName ? `, ${firstName}` : ""}</h1>
            <p>¿Dónde quiere trabajar hoy?</p>
          </div>

          {tour && tourOffer && isDone(tour.id) === false && !active && (
            <div className="ln__pilo" data-anim>
              <PiloAvatar mood="feliz" size={60} alive />
              <div>
                <strong>Es su primera vez aquí. ¿Le muestro cómo funciona?</strong>
                <span>Un recorrido corto por lo que usted usa. Lo puede repetir cuando quiera.</span>
              </div>
              <button type="button" className="ln__pilo-go" onClick={() => start(tour.id)}>
                Empezar el recorrido
              </button>
              <button type="button" className="ln__pilo-no" onClick={() => setTourOffer(false)}>
                Ahora no
              </button>
            </div>
          )}

          {compact && (
            <label className="ln__search" data-anim data-tour="launcher-search">
              <Icon name="search" size={17} />
              <span className="sr-only">Buscar dónde trabajar</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) navigate(matches[0].to);
                }}
                placeholder="¿Qué quiere hacer? Ej. usuarios, cargar cifras…"
              />
            </label>
          )}

          {q ? (
            <ul className="ln__matches" aria-label="Resultados">
              {matches.length ? (
                matches.map((m) => (
                  <li key={m.id}>
                    <Link to={m.to}>
                      <Icon name={m.icon} size={16} />
                      <span>{m.label}</span>
                      <small>{m.group}</small>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="ln__none">Nada con «{query}». Pruebe con otra palabra.</li>
              )}
            </ul>
          ) : groups.length === 0 ? (
            <p className="ln__empty" data-anim>
              Todavía no tiene módulos asignados. Pida a la administración de la intranet que le dé acceso o que lo ubique en
              su unidad.
            </p>
          ) : (
            <div className="ln__modules" data-tour="launcher-modules">
              {groups.map((g) =>
                compact ? (
                  <section key={g.id} className="ln__group" data-anim>
                    <h2>
                      <i aria-hidden="true">
                        <Icon name={g.icon} size={16} />
                      </i>
                      {g.label}
                    </h2>
                    {g.items.map((item) => (
                      <Link key={item.id} to={item.to} className="ln__link">
                        {item.label}
                      </Link>
                    ))}
                  </section>
                ) : (
                  <article key={g.id} className="ln__card" data-anim>
                    <Link to={g.items[0].to} className="ln__card-head">
                      <i aria-hidden="true">
                        <Icon name={g.icon as IconName} size={22} />
                      </i>
                      <span>
                        <strong>{g.label}</strong>
                        <small>{GROUP_TEXT[g.id]}</small>
                      </span>
                      <Icon name="arrow-right" size={16} />
                    </Link>
                    <div className="ln__quick">
                      {quick(g).map((l) => (
                        <Link key={l.to} to={l.to} className={l.primary ? "button-primary" : "button-secondary"}>
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <aside className="ln__side" data-anim>
          {/* El Portal de Impacto lo ve toda persona con sesión. */}
          <Link to="/impacto" className="ln__portal" data-tour="launcher-portal">
            <PiloAvatar mood="idea" size={52} />
            <span>
              <strong>Portal de Impacto</strong>
              <small>La matriz de indicadores, sus vínculos y resultados, por vicerrectoría, facultad y programa.</small>
            </span>
            <Icon name="arrow-right" size={16} />
          </Link>
          {pending.length > 0 && (
            <section className="ln__pending">
              <h2>Pendientes</h2>
              <ul>
                {pending.map((p) => (
                  <li key={p.label}>
                    <Icon name="alert" size={15} />
                    <span>{p.label}</span>
                    <Link to={p.to}>Ir</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}

/* --- Lo pendiente en Impacto --------------------------------------------------------- */

interface Pending {
  label: string;
  to: string;
}

/**
 * Pocas consultas y livianas, con los permisos de quien mira (RLS). Si algo
 * falla (una migración sin aplicar), simplemente no hay pendientes.
 */
function usePending(side: ReturnType<typeof useAuth>["impactoSide"]) {
  const lastYear = Math.min(new Date().getFullYear() - 1, 2028);
  const query = useQuery({
    queryKey: ["lanzador", "pendientes", side, lastYear],
    enabled: Boolean(side),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Pending[]> => {
      const out: Pending[] = [];
      try {
        if (side === "programa" || side === "ambos") {
          const { data } = await supabase.from("imp_adoptions").select("id,baseline_text,target_2026").eq("active", true);
          const rows = (data ?? []) as { baseline_text: string; target_2026: string }[];
          const noTargets = rows.filter((r) => !r.baseline_text || !r.target_2026).length;
          if (!rows.length) out.push({ label: "Todavía no sigue indicadores: Mr. Pilo le ayuda a elegir", to: "/admin/impacto/mi-catalogo" });
          else if (noTargets) out.push({ label: `Línea base o meta 2026 de ${noTargets} indicadores`, to: "/admin/impacto/programa" });
        }
        if (side === "funcion" || side === "ambos") {
          const [{ data: fichas }, { data: values }] = await Promise.all([
            supabase.from("imp_indicators").select("id").is("program_id", null).eq("status", "publicado"),
            supabase.from("imp_values").select("indicator_id").eq("year", lastYear).is("program_id", null),
          ]);
          const withValue = new Set(((values ?? []) as { indicator_id: string }[]).map((v) => v.indicator_id));
          const missing = ((fichas ?? []) as { id: string }[]).filter((f) => !withValue.has(f.id)).length;
          if (missing) out.push({ label: `${missing} fichas sin cifra global de ${lastYear}`, to: "/admin/impacto/captura" });
          const { data: drafts } = await supabase.from("imp_indicators").select("id").is("program_id", null).eq("status", "borrador");
          if ((drafts ?? []).length) out.push({ label: `${(drafts ?? []).length} fichas en borrador sin publicar`, to: "/admin/impacto/catalogo" });
        }
      } catch {
        return [];
      }
      return out;
    },
  });
  return query.data ?? [];
}
