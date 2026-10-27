/* =============================================================================
   Intranet · CMS Portales.

   Edita las páginas de la landing, de Planeación y de UDES Sostenible. Cada
   página puede tener micrositios dentro: páginas hijas con su propia ruta.

   Lo que se escribe es borrador. «Publicar» lo copia a una versión y solo
   entonces lo ve el público. Quien entra aquí edita y publica: planeación y
   administración (migración 0174). El espacio de trabajo (panel izquierdo,
   lienzo e inspector) está en EditorBloques.tsx; aquí se elige el portal y la
   página, y se muestran los avisos como un toast discreto.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminRail, AdminRailTab, AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAuth } from "../../../lib/auth";
import { EditorBloques } from "./EditorBloques";
import { EditoresCms } from "./EditoresCms";
import { arbol } from "./logica";
import { PanelIzquierdo } from "./PanelIzquierdo";
import { PanelPaginas } from "./PanelPaginas";
import { FaltaMigracionCms, useBloques, usePaginas, usePortales } from "./store";
import type { CmsPagina, PortalSlug } from "./tipos";
import "./cms.css";

const AVISO_SALIDA = "Hay cambios sin guardar en esta página. Si sigue, se pierden. ¿Descartarlos?";
/** Cuánto dura un aviso en pantalla. */
const MS_AVISO = 5000;

export function CmsPortales() {
  const { hasRole, cmsPortales } = useAuth();
  // Planeación y administración editan todos los portales; un editor designado (0199) solo los suyos.
  const esPlaneacion = hasRole("planeacion");
  const esAdmin = hasRole("admin");
  const portales = usePortales();
  const permitidos = useMemo(
    () => (portales.data ?? []).filter((p) => esPlaneacion || cmsPortales.includes(p.slug)),
    [portales.data, esPlaneacion, cmsPortales],
  );
  const [elegido, setPortal] = useState<PortalSlug>("sostenible");
  // Si el portal elegido no es de esta persona, se abre el primero que sí.
  const portal: PortalSlug = permitidos.some((p) => p.slug === elegido) ? elegido : (permitidos[0]?.slug ?? elegido);
  const puedeEditar = esPlaneacion || cmsPortales.includes(portal);
  const paginas = usePaginas(portal);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  // El editor avisa aquí si tiene cambios sin guardar; cambiar de página o de portal pide confirmación.
  const sucio = useRef(false);
  const marcarSucio = useCallback((valor: boolean) => {
    sucio.current = valor;
  }, []);
  const puedeSalir = useCallback(() => !sucio.current || window.confirm(AVISO_SALIDA), []);
  const mostrarAviso = useCallback((texto: string | null) => setAviso(texto ? { texto, n: Date.now() } : null), []);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), MS_AVISO);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const todas = paginas.data ?? [];
  const pagina = todas.find((p) => p.id === seleccion) ?? null;
  const arboles = useMemo(() => arbol(todas), [todas]);
  const falta = paginas.error instanceof FaltaMigracionCms || portales.error instanceof FaltaMigracionCms;
  const nombrePortal = portales.data?.find((p) => p.slug === portal)?.nombre ?? "Páginas";

  const panelPaginas = (
    <PanelPaginas
      nombrePortal={nombrePortal}
      arboles={arboles}
      cargando={paginas.isPending && !falta}
      error={paginas.isError && !falta ? (paginas.error instanceof Error ? paginas.error.message : "error desconocido") : null}
      seleccion={seleccion}
      seleccionada={pagina}
      existentes={todas}
      portal={portal}
      puedeEditar={puedeEditar && !falta}
      onElegir={(id) => {
        if (id !== seleccion && puedeSalir()) setSeleccion(id);
      }}
      puedeSalir={puedeSalir}
      onCreada={(p: CmsPagina) => {
        setSeleccion(p.id);
        mostrarAviso(`Página creada en /${p.ruta || "(portada)"}. Escriba el contenido y publique cuando esté lista.`);
      }}
    />
  );

  return (
    <AdminShell
      section="cms"
      kicker="Sistema"
      title="CMS Portales"
      description="Las páginas de la landing, de Planeación y de UDES Sostenible. Cada página puede tener micrositios."
      rail={
        <AdminRail label="Portales">
          {permitidos.map((p) => (
            <AdminRailTab
              key={p.slug}
              current={portal === p.slug}
              onSelect={() => {
                if (p.slug === portal || !puedeSalir()) return;
                setPortal(p.slug);
                setSeleccion(null);
                setAviso(null);
              }}
            >
              {p.nombre}
            </AdminRailTab>
          ))}
        </AdminRail>
      }
    >
      {!puedeEditar && <ReadOnlyNotice>Su rol permite consultar las páginas. Editarlas y publicarlas es de Planeación, de la administración y de quien esta designe editor del portal.</ReadOnlyNotice>}
      {portal === "planeacion" && (
        <p className="cms-aviso cms-aviso--suave">
          La portada de Planeación se sigue escribiendo en «Página de la oficina». Lo que aquí se crea son páginas nuevas del portal.
        </p>
      )}

      <div className="cms-editor">
        {falta ? (
          <EspacioMensaje panel={panelPaginas}>
            <FaltaMigracion />
          </EspacioMensaje>
        ) : !pagina ? (
          <EspacioMensaje panel={panelPaginas}>
            <p className="cms-vacio">Elija una página o cree una nueva para editarla.</p>
          </EspacioMensaje>
        ) : (
          <EditorPagina key={pagina.id} pagina={pagina} puedeEditar={puedeEditar} panelPaginas={panelPaginas} onAviso={mostrarAviso} onSucio={marcarSucio} />
        )}
      </div>

      {esAdmin && !falta && <EditoresCms portales={portales.data ?? []} portalInicial={portal} />}

      {/* La zona existe siempre: así los lectores de pantalla anuncian el aviso cuando aparece. */}
      <div className="cms-toast-zona" role="status" aria-live="polite">
        {aviso && (
          <p className="cms-toast" key={aviso.n}>
            <span>{aviso.texto}</span>
            <button type="button" className="cms-ib" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>
              <Icon name="close" size={14} />
            </button>
          </p>
        )}
      </div>
    </AdminShell>
  );
}

/** Espacio de trabajo sin página abierta: el árbol a la izquierda y un mensaje donde iría el lienzo. */
function EspacioMensaje({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return (
    <div className="cms-ws cms-ws--vacio">
      <PanelIzquierdo paginas={panel} />
      <section className="cms-escenario" aria-label="Lienzo">
        <div className="cms-escena cms-escena--mensaje">{children}</div>
      </section>
    </div>
  );
}

/** La base todavía no tiene las tablas del CMS. */
function FaltaMigracion() {
  return (
    <div className="cms-estado-bloque" role="note">
      <Icon name="alert" size={18} />
      <div>
        <strong>Falta la migración 0174.</strong> Sin ella esta pantalla no puede leer ni guardar páginas. Aplíquela en la base de datos (archivo <code>supabase/migrations/0174_cms_portales.sql</code>) y vuelva a esta pantalla.
      </div>
    </div>
  );
}

function EditorPagina({
  pagina,
  puedeEditar,
  panelPaginas,
  onAviso,
  onSucio,
}: {
  pagina: CmsPagina;
  puedeEditar: boolean;
  panelPaginas: ReactNode;
  onAviso: (m: string | null) => void;
  onSucio: (sucio: boolean) => void;
}) {
  const bloques = useBloques(pagina.id);

  if (bloques.isPending) {
    return (
      <EspacioMensaje panel={panelPaginas}>
        <LoadingBlock rows={4} label="Leyendo los bloques de la página" />
      </EspacioMensaje>
    );
  }
  if (bloques.isError) {
    return (
      <EspacioMensaje panel={panelPaginas}>
        {bloques.error instanceof FaltaMigracionCms ? (
          <FaltaMigracion />
        ) : (
          <ErrorBlock error={bloques.error} title="No se pudieron leer los bloques" onRetry={() => void bloques.refetch()} />
        )}
      </EspacioMensaje>
    );
  }
  return <EditorBloques pagina={pagina} bloques={bloques.data} puedeEditar={puedeEditar} panelPaginas={panelPaginas} onAviso={onAviso} onSucio={onSucio} />;
}
