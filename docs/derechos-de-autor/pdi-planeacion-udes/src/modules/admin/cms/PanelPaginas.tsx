/* =============================================================================
   CMS Portales · pestaña «Páginas» del panel izquierdo.

   El árbol de páginas del portal (cada micrositio cuelga de su página) con el
   estado escrito en una etiqueta, y el formulario para crear una página o un
   micrositio de la elegida.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { aplanar, estadoPublicacion, planImportacion, type NodoPagina } from "./logica";
import { plantillaMicrositios } from "./plantillas";
import { crearPagina, importarArbol, useInvalidarCms, type ResultadoImportacion } from "./store";
import type { CmsPagina, PortalSlug } from "./tipos";

export const ETIQUETA_ESTADO = {
  "sin-publicar": "Sin publicar",
  publicada: "Publicada",
  "con-cambios": "Con cambios",
} as const;

interface PanelPaginasProps {
  nombrePortal: string;
  arboles: NodoPagina[];
  cargando: boolean;
  error: string | null;
  seleccion: string | null;
  seleccionada: CmsPagina | null;
  existentes: CmsPagina[];
  portal: PortalSlug;
  puedeEditar: boolean;
  onElegir: (id: string) => void;
  /** Crear una página abre su editor: antes se confirma si hay cambios sin guardar. */
  puedeSalir: () => boolean;
  onCreada: (p: CmsPagina) => void;
}

export function PanelPaginas({ nombrePortal, arboles, cargando, error, seleccion, seleccionada, existentes, portal, puedeEditar, onElegir, puedeSalir, onCreada }: PanelPaginasProps) {
  const filas = aplanar(arboles);
  return (
    <>
      <h3 className="cms-panel__titulo">{nombrePortal}</h3>
      {cargando && <p className="cms-ayuda">Leyendo páginas…</p>}
      {error && (
        <p className="cms-aviso" role="alert">
          No se pudieron leer las páginas: {error}
        </p>
      )}
      {!cargando && !error && filas.length === 0 && <p className="cms-ayuda">Este portal todavía no tiene páginas.</p>}
      <ul className="cms-arbol">
        {filas.map((n) => {
          const estado = estadoPublicacion(n.pagina);
          const activa = seleccion === n.pagina.id;
          return (
            <li key={n.pagina.id}>
              <button
                type="button"
                className="cms-fila"
                aria-current={activa ? "page" : undefined}
                style={{ paddingInlineStart: `calc(var(--space-3) + ${n.profundidad} * var(--space-4))` }}
                onClick={() => onElegir(n.pagina.id)}
              >
                <span className="cms-fila__titulo">{n.pagina.titulo || "(sin título)"}</span>
                <span className={`cms-tag cms-tag--${estado}`}>{ETIQUETA_ESTADO[estado]}</span>
                <span className="cms-fila__ruta">/{n.pagina.ruta}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {puedeEditar && <NuevaPagina portal={portal} padre={seleccionada} existentes={existentes} puedeSalir={puedeSalir} onCreada={onCreada} />}
      {puedeEditar && portal === "sostenible" && <ImportarMicrositios portal={portal} existentes={existentes} />}
    </>
  );
}

/**
 * Crea en el portal las páginas de los micrositios de UDES Sostenible que
 * todavía no existen. Pide confirmación aquí mismo, dice cuántas crea y cuántas
 * ya están, y deja el resumen a la vista. Repetirla no duplica nada.
 */
function ImportarMicrositios({ portal, existentes }: { portal: PortalSlug; existentes: CmsPagina[] }) {
  const nodos = useMemo(() => plantillaMicrositios(portal), [portal]);
  const plan = useMemo(() => planImportacion(existentes, nodos), [existentes, nodos]);
  const invalidar = useInvalidarCms();
  const [confirmando, setConfirmando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Un segundo clic en el mismo instante llega antes de que `importando` se refleje: se frena aquí.
  const enCurso = useRef(false);
  const aviso = useRef<HTMLDivElement>(null);

  async function importar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setImportando(true);
    setError(null);
    setResumen(null);
    try {
      setResumen(await importarArbol(portal, nodos, existentes));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron importar los micrositios.");
    } finally {
      enCurso.current = false;
      setImportando(false);
      setConfirmando(false);
      invalidar(portal);
      // El botón de confirmar desaparece: el foco pasa al resultado para que no se pierda.
      requestAnimationFrame(() => aviso.current?.focus());
    }
  }

  return (
    <div className="cms-nueva">
      <h4 className="cms-panel__titulo">Micrositios de UDES Sostenible</h4>
      <p className="cms-ayuda">
        {plan.crear.length === 0
          ? `Los ${nodos.length} micrositios ya existen. No hay nada que importar.`
          : `Faltan ${plan.crear.length} de ${nodos.length} páginas. ${plan.omitir.length} ya existen y no se tocan.`}
      </p>
      {plan.crear.length > 0 && !confirmando && (
        <button type="button" className="cms-btn cms-btn--chico" disabled={importando} onClick={() => setConfirmando(true)}>
          <Icon name="plus" size={14} />
          Importar los micrositios
        </button>
      )}
      {confirmando && (
        <div className="cms-aviso cms-aviso--suave" role="group" aria-label="Confirmar la importación">
          <p>
            Se crearán {plan.crear.length} páginas nuevas en el portal, como borrador. Nada se publica ni se sobrescribe.
          </p>
          <div className="cms-acciones">
            <button type="button" className="cms-btn cms-btn--chico cms-btn--primario" disabled={importando} onClick={() => void importar()}>
              {importando ? "Importando…" : `Crear ${plan.crear.length} páginas`}
            </button>
            <button type="button" className="cms-btn cms-btn--chico" disabled={importando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {importando && !confirmando && <p className="cms-ayuda" role="status">Importando…</p>}
      {error && (
        <p className="cms-aviso" role="alert">
          {error}
        </p>
      )}
      {resumen && (
        <div ref={aviso} tabIndex={-1} className="cms-aviso cms-aviso--suave" role="status">
          <p>
            Importación lista: {resumen.creadas.length} creadas, {resumen.omitidas.length} omitidas (ya existían), {resumen.fallidas.length} con error.
          </p>
          {resumen.fallidas.length > 0 && (
            <ul>
              {resumen.fallidas.map((f) => (
                <li key={f.ruta}>
                  /{f.ruta}: {f.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NuevaPagina({
  portal,
  padre,
  existentes,
  puedeSalir,
  onCreada,
}: {
  portal: PortalSlug;
  padre: CmsPagina | null;
  existentes: CmsPagina[];
  puedeSalir: () => boolean;
  onCreada: (p: CmsPagina) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const invalidar = useInvalidarCms();
  const [guardando, setGuardando] = useState(false);

  async function crear(conPadre: boolean) {
    if (!puedeSalir()) return;
    setError(null);
    setGuardando(true);
    try {
      const nueva = await crearPagina({ portal, padre: conPadre ? padre ?? undefined : undefined, titulo, existentes });
      setTitulo("");
      invalidar(portal);
      onCreada(nueva);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la página.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="cms-nueva">
      <label className="cms-campo">
        <span>Título de la página nueva</span>
        <input className="cms-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Clima y energía" autoComplete="off" />
      </label>
      <div className="cms-acciones">
        <button type="button" className="cms-btn cms-btn--chico" disabled={!titulo.trim() || guardando} onClick={() => void crear(false)}>
          <Icon name="plus" size={14} />
          Nueva página
        </button>
        <button type="button" className="cms-btn cms-btn--chico" disabled={!padre || !titulo.trim() || guardando} onClick={() => void crear(true)}>
          <Icon name="plus" size={14} />
          Micrositio de «{padre?.titulo || "…"}»
        </button>
      </div>
      <p className="cms-ayuda">Un micrositio es una página que cuelga de otra y hereda su ruta.</p>
      {error && (
        <p className="cms-aviso" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
