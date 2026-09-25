/* =============================================================================
   Indicadores de Impacto · la pantalla de la intranet.

   Una sola ruta, /admin/impacto/:vista. Lo que se ve lo decide la
   PERTENENCIA (ver access.ts), no el rol global:

   Un programa (en una sede)
     Mi catálogo         las fichas que sigue y sus indicadores propios
     Elegir indicadores  qué fichas de las vicerrectorías sigue
     Captura             sus cifras; se habilita cuando ya sigue algo
     + Mr. Pilo Bot      la guía para elegir, con la cadena completa

   Una vicerrectoría u oficina
     Mi vicerrectoría    el catálogo de su función, con «Nuevo indicador»
     Captura             sus cifras: global, por sede o por programa
     Pilares y ODS       los cruces de SU catálogo
     De los programas    lo que crearon los programas en su función, con cifras
     Importar            la plantilla de Excel para cargar cifras
     + Mr. Pilo Bot      alertas, propuestas de los programas y uso de las fichas

   Administración y Planeación sin unidad: todo lo anterior, más el
   diccionario del motor, los ajustes de Mr. Pilo y (administración) la
   sincronización con la hoja anterior.

   El programa y la sede van en la dirección (?sede=), para que un enlace lleve
   al mismo sitio. La función elegida, también (?funcion=).
   ========================================================================== */

import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { StageEmpty } from "../admin/udes-en-cifras/ui";
import { resolveAccess } from "./access";
import { FUNCTION_LABEL, type SubstantiveFunction } from "./model";
import { useAdoptions, useCatalog, useImpactBase } from "./store";
import { Catalog } from "./Catalog";
import { Capture } from "./Capture";
import { ProgramWork } from "./ProgramWork";
import { ProgramSelect } from "./ProgramSelect";
import { ProgramCatalog } from "./ProgramCatalog";
import { PillarsBoard } from "./PillarsBoard";
import { ProgramProposals } from "./ProgramProposals";
import { CriteriaEditor } from "./CriteriaEditor";
import { Importer } from "./import/Importer";
import { PiloBot } from "./pilo/PiloBot";
import { PiloCurator } from "./pilo/PiloCurator";
import { PiloSettings } from "./pilo/PiloSettings";
import { SyncPanel } from "./sync/SyncPanel";
import { useTour } from "../../components/tour/TourProvider";
import { intranetTourFor } from "../../components/tour/tours";
import "../admin/udes-en-cifras/od-admin.css";
import "./impacto.css";

type View =
  | "catalogo"
  | "captura"
  | "pilares"
  | "programas"
  | "importar"
  | "mi-catalogo"
  | "elegir"
  | "programa"
  | "motor"
  | "pilo"
  | "sincronizacion";

const FUNCTION_VIEWS: View[] = ["catalogo", "captura", "pilares", "programas", "importar"];
const PROGRAM_VIEWS: View[] = ["mi-catalogo", "elegir", "programa"];

export function ImpactoAdmin() {
  const { vista } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, hasRole, impactoSide } = useAuth();
  const { start: startTour } = useTour();
  const tourId = intranetTourFor({ admin: hasRole("admin"), impactoSide });
  const base = useImpactBase(profile?.id);
  const catalog = useCatalog(Boolean(base.data && !base.data.missing));

  const access = useMemo(
    () => (base.data ? resolveAccess(base.data, hasRole("planeacion"), hasRole("admin")) : null),
    [base.data, hasRole],
  );

  // Qué vistas le tocan a quien mira. Quien solo es programa empieza por su catálogo.
  const views = useMemo<View[]>(() => {
    if (!access) return [];
    const out: View[] = [];
    const fnSide = access.readableFns.length > 0;
    if (access.programSide && !access.reader) out.push(...PROGRAM_VIEWS);
    if (fnSide) out.push(...FUNCTION_VIEWS);
    if (access.programSide && access.reader) out.push(...PROGRAM_VIEWS);
    if (access.reader) out.push("motor", "pilo");
    if (access.admin) out.push("sincronizacion");
    return out;
  }, [access]);

  const view: View = views.includes(vista as View) ? (vista as View) : views[0] ?? "catalogo";

  // La función que se mira, entre las que puede leer.
  const fnParam = params.get("funcion") as SubstantiveFunction | null;
  const fn: SubstantiveFunction | null = access
    ? access.readableFns.includes(fnParam as SubstantiveFunction)
      ? (fnParam as SubstantiveFunction)
      : access.readableFns[0] ?? null
    : null;

  // El programa en sede que se mira.
  const siteParam = params.get("sede");
  const site = access?.sites.find((s) => s.key === siteParam) ?? access?.sites[0] ?? null;
  const siteAdoptions = useAdoptions(site ? { programId: site.programId, campusId: site.campusId } : null, Boolean(site));
  const following =
    (siteAdoptions.data ?? []).filter((a) => a.active).length +
    (catalog.data?.programIndicators.filter((i) => site && i.programId === site.programId && i.campusId === site.campusId && i.status !== "retirado").length ?? 0);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (vista && views.length && !views.includes(vista as View)) navigate(`/admin/impacto/${views[0]}`, { replace: true });
  }, [vista, views, navigate]);

  const go = (next: View) => navigate({ pathname: `/admin/impacto/${next}`, search: params.toString() });

  // Nombres de las pestañas según quién mira.
  const onlyProgram = Boolean(access && access.programSide && !access.reader && access.readableFns.length === 0);
  const onlyFunction = Boolean(access && !access.reader && access.readableFns.length > 0);
  const functionUnitKind = useMemo(() => {
    if (!base.data) return "vicerrectoria";
    const withFns = new Set(base.data.unitFunctions.map((f) => f.unitId));
    const kinds = base.data.memberships
      .filter((m) => withFns.has(m.unitId))
      .map((m) => base.data!.units.find((u) => u.id === m.unitId)?.kind);
    return kinds.length && kinds.every((k) => k === "oficina") ? "oficina" : "vicerrectoria";
  }, [base.data]);

  const tabLabel = (v: View): string => {
    switch (v) {
      case "catalogo":
        return onlyFunction ? (functionUnitKind === "oficina" ? "Mi oficina" : "Mi vicerrectoría") : "Catálogo";
      case "captura":
        return "Captura";
      case "pilares":
        return "Pilares y ODS";
      case "programas":
        return "De los programas";
      case "importar":
        return "Importar";
      case "mi-catalogo":
        return onlyProgram ? "Mi catálogo" : "Catálogo del programa";
      case "elegir":
        return "Elegir indicadores";
      case "programa":
        return onlyProgram ? "Captura" : "Captura del programa";
      case "motor":
        return "Diccionario del motor";
      case "pilo":
        return "Mr. Pilo · ajustes";
      case "sincronizacion":
        return "Sincronización";
    }
  };

  const onProgramSide = PROGRAM_VIEWS.includes(view);
  const onFunctionSide = FUNCTION_VIEWS.includes(view);
  const siteLabel = site ? `${site.programName} · ${site.campusName}` : "Sin programa asignado";
  const description = onProgramSide
    ? siteLabel
    : view === "motor"
      ? "El diccionario con el que el motor reconoce a qué pilar y a qué ODS apunta cada indicador"
      : view === "pilo"
        ? "Los pesos con que Mr. Pilo puntúa y las fuentes de datos que usa"
        : view === "sincronizacion"
          ? "Trae a la intranet lo capturado en la herramienta anterior (Google Sheets)"
          : fn
            ? `${FUNCTION_LABEL[fn]} · ${catalog.data?.indicators.filter((i) => i.fn === fn).length ?? 0} fichas`
            : "";

  const rail =
    views.length > 1 ? (
      <AdminRail label="Vistas de Impacto">
        {views.map((v) => (
          <AdminRailTab key={v} current={v === view} onSelect={() => go(v)} count={v === "programa" && following ? following : undefined}>
            {tabLabel(v)}
          </AdminRailTab>
        ))}
      </AdminRail>
    ) : undefined;

  // Mr. Pilo: la guía del programa o el análisis de la vicerrectoría.
  const pilo =
    access && base.data && catalog.data ? (
      onProgramSide && site ? (
        <PiloBot site={site} base={base.data} catalog={catalog.data} canEdit={access.canEditSite(site.programId, site.campusId)} />
      ) : onFunctionSide && fn ? (
        <PiloCurator fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : null
    ) : null;

  const picker =
    access && onProgramSide && access.sites.length > 1 ? (
      <label className="imp-picker">
        <span className="sr-only">Programa y sede</span>
        <Icon name="pin" size={15} />
        <select value={site?.key ?? ""} onChange={(e) => setParam("sede", e.target.value)}>
          {access.sites.map((s) => (
            <option key={s.key} value={s.key}>
              {s.programName} · {s.campusName}
            </option>
          ))}
        </select>
      </label>
    ) : access && onFunctionSide && access.readableFns.length > 1 ? (
      <div className="imp-seg" role="group" aria-label="Función sustantiva">
        {access.readableFns.map((f) => (
          <button key={f} type="button" aria-pressed={f === fn} onClick={() => setParam("funcion", f)} data-fn={f}>
            <i aria-hidden="true" />
            {FUNCTION_LABEL[f]}
          </button>
        ))}
      </div>
    ) : null;

  // El recorrido del rol, desde la parada de la vista que se está mirando.
  const tour = tourId ? (
    <button
      type="button"
      className="imp-help"
      aria-label="Recorrido guiado de Impacto"
      title="Recorrido guiado"
      onClick={() => startTour(tourId, 1)}
    >
      <Icon name="compass" size={17} />
    </button>
  ) : null;

  const actions =
    picker || pilo || tour ? (
      <>
        {picker}
        {tour}
        {pilo}
      </>
    ) : undefined;

  const loading = base.isPending || (catalog.isPending && base.data && !base.data.missing);
  const canEditSite = Boolean(access && site && access.canEditSite(site.programId, site.campusId));

  return (
    <AdminShell section="impacto" kicker="Indicadores de Impacto" title={tabLabel(view)} description={description} actions={actions} rail={rail}>
      {loading ? (
        <p className="admin-loading">Cargando los indicadores…</p>
      ) : base.error || catalog.error ? (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {(base.error ?? catalog.error)?.message}
        </p>
      ) : base.data?.missing ? (
        <StageEmpty title="Falta crear las tablas de Impacto">
          Aplica en Supabase las migraciones 0078 a 0085, en ese orden. Hasta entonces esta pantalla no tiene de dónde leer.
        </StageEmpty>
      ) : !access || views.length === 0 || !catalog.data || !base.data ? (
        <StageEmpty title="Todavía no tienes indicadores a cargo">
          Los ven las vicerrectorías y oficinas que llevan una función sustantiva, y los programas. Pide a la administración
          que te ubique en la estructura institucional.
        </StageEmpty>
      ) : view === "catalogo" && fn ? (
        <Catalog fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : view === "captura" && fn ? (
        <Capture fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : view === "pilares" && fn ? (
        <PillarsBoard fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : view === "programas" && fn ? (
        <ProgramProposals fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : view === "importar" && fn ? (
        <Importer fn={fn} base={base.data} catalog={catalog.data} access={access} />
      ) : view === "mi-catalogo" && site ? (
        <ProgramCatalog site={site} base={base.data} catalog={catalog.data} canEdit={canEditSite} onChoose={() => go("elegir")} />
      ) : view === "programa" && site ? (
        <ProgramWork
          site={site}
          base={base.data}
          catalog={catalog.data}
          canEdit={canEditSite}
          mode={params.get("modo") === "comparar" ? "comparar" : "serie"}
          setMode={(m) => setParam("modo", m === "serie" ? null : m)}
          onChoose={() => go("elegir")}
        />
      ) : view === "elegir" && site ? (
        <ProgramSelect site={site} base={base.data} catalog={catalog.data} canEdit={canEditSite} onDone={() => go("mi-catalogo")} />
      ) : view === "motor" ? (
        <CriteriaEditor base={base.data} catalog={catalog.data} canEdit={access.admin} />
      ) : view === "pilo" ? (
        <PiloSettings base={base.data} catalog={catalog.data} canEdit={access.admin} />
      ) : view === "sincronizacion" && access.admin ? (
        <SyncPanel base={base.data} catalog={catalog.data} />
      ) : (
        <StageEmpty title="Nada que mostrar aquí" />
      )}
    </AdminShell>
  );
}
