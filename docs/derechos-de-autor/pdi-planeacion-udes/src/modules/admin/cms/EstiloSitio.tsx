/* =============================================================================
   CMS Portales · panel «Estilo del sitio».

   Tokens del portal (fuentes, tamaño base, escala de títulos, colores, esquinas
   y botones) con tres temas listos y una vista previa en vivo hecha con el mismo
   RenderBloques de la página pública. Guardar usa cms_guardar_estilo (0201) y se
   publica al instante: no hay borrador del estilo. Lo que no se toca queda como
   está hoy (ver estilo.ts). Quien no puede editar el portal lo ve en solo lectura.
   ========================================================================== */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { definicion } from "./bloques";
import {
  BOTONES,
  ESCALAS,
  FUENTES,
  PESOS_TITULO,
  TEMAS,
  completarEstilo,
  pilaDe,
  sanearEstiloSitio,
  textoVariables,
  useFuentes,
  type EstiloSitio,
  type EstiloSitioParcial,
} from "./estilo";
import { ocultoDe } from "./logica";
import { plantillaPortada } from "./plantillas";
import { RenderBloques, type BloqueRender } from "./render";
import { useBloques, useEstiloPortal, useGuardarEstilo } from "./store";
import type { PortalSlug } from "./tipos";

const ETIQUETA_BOTON: Record<number, string> = { 2: "Rectos", 6: "Suaves", 99: "Píldora" };
const ETIQUETA_ESCALA: Record<number, string> = { 1.2: "Sutil · 1.2", 1.25: "Media · 1.25", 1.333: "Marcada · 1.333", 1.5: "Fuerte · 1.5" };

const FUENTES_TEMAS = TEMAS.flatMap((t) => [t.valores.fh, t.valores.fb]);

interface Props {
  portal: PortalSlug;
  portadaId: string | null;
  puedeEditar: boolean;
  onAviso: (mensaje: string | null) => void;
  /** Avisa si hay cambios sin guardar, para que quien lo contiene no los descarte en silencio. */
  onSucio: (sucio: boolean) => void;
}

export function EstiloSitio({ portal, portadaId, puedeEditar, onAviso, onSucio }: Props) {
  const lectura = useEstiloPortal(portal);
  const guardar = useGuardarEstilo(portal);
  const bloques = useBloques(portadaId);
  const [borrador, setBorrador] = useState<EstiloSitioParcial | null>(null);
  useFuentes(FUENTES_TEMAS);

  const guardado = lectura.data?.estilo;
  const disponible = lectura.data?.disponible ?? false;
  const actual: EstiloSitioParcial = borrador ?? guardado ?? {};
  const completo = completarEstilo(actual);
  const sucio = borrador !== null && JSON.stringify(sanearEstiloSitio(borrador)) !== JSON.stringify(guardado ?? {});
  const editable = puedeEditar && disponible;

  useEffect(() => {
    onSucio(sucio);
  }, [sucio, onSucio]);
  useEffect(() => () => onSucio(false), [onSucio]);
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sucio]);

  // Vista previa: los primeros bloques de la portada; sin portada, los de la plantilla.
  const muestra: BloqueRender[] = useMemo(() => {
    const reales = (bloques.data ?? []).filter((b) => !ocultoDe(b.props) && definicion(b.tipo)?.vivo !== true).map((b) => ({ tipo: b.tipo, ancho: b.ancho, props: b.props }));
    const lista = reales.length > 0 ? reales : plantillaPortada(portal).filter((b) => definicion(b.tipo)?.vivo !== true);
    return lista.slice(0, 3);
  }, [bloques.data, portal]);

  const poner = <K extends keyof EstiloSitio>(k: K, v: EstiloSitio[K]) => setBorrador({ ...actual, [k]: v });

  async function guardarAhora() {
    try {
      await guardar.mutateAsync(actual);
      setBorrador(null);
      onAviso("Estilo del sitio guardado. El público ya lo ve.");
    } catch (e) {
      onAviso(e instanceof Error ? e.message : "No se pudo guardar el estilo.");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoVariables(actual));
      onAviso("Copiadas las variables CSS.");
    } catch {
      onAviso("El navegador no dejó copiar. Seleccione el texto con el teclado y use Ctrl+C.");
    }
  }

  const rango = (k: "base" | "lh" | "radius", etiqueta: string, min: number, max: number, paso: number, unidad: string) => (
    <label className="cms-campo">
      <span>{etiqueta}</span>
      <span className="cms-rango">
        <input type="range" min={min} max={max} step={paso} value={completo[k]} onChange={(e) => poner(k, Number(e.target.value))} />
        <output>
          {completo[k]}
          {unidad}
        </output>
      </span>
    </label>
  );
  const fuente = (k: "fh" | "fb", etiqueta: string) => (
    <label className="cms-campo">
      <span>{etiqueta}</span>
      <select className="cms-input" value={completo[k]} onChange={(e) => poner(k, e.target.value as EstiloSitio["fh"])}>
        {FUENTES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </label>
  );
  const color = (k: "marino" | "acento" | "alt" | "txt", etiqueta: string): ReactNode => (
    <label className="cms-campo">
      <span>{etiqueta}</span>
      <input className="cms-color" type="color" value={completo[k]} onChange={(e) => poner(k, e.target.value.toLowerCase())} />
    </label>
  );

  return (
    <section className="cms-sitio" aria-label="Estilo del sitio">
      <fieldset className="cms-sitio__ctl cms-fieldset" disabled={!editable}>
        {lectura.isPending && <p className="cms-ayuda">Leyendo el estilo del sitio…</p>}
        {lectura.data && !disponible && (
          <p className="cms-aviso" role="status">
            No se pudo leer el estilo del sitio. Si la migración 0201 no está aplicada, aplíquela; mientras tanto el portal conserva su aspecto actual.
          </p>
        )}
        {!puedeEditar && <p className="cms-nota-insp">Su rol permite consultar el estilo, no cambiarlo.</p>}

        <h3 className="cms-panel__titulo">Temas</h3>
        <div className="cms-temas">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" className="cms-tema" aria-pressed={JSON.stringify(sanearEstiloSitio(actual)) === JSON.stringify(t.valores)} onClick={() => setBorrador({ ...t.valores })}>
              <span className="cms-tema__ag" style={{ fontFamily: pilaDe(t.valores.fh, "titulo") }}>
                Ag
              </span>
              <b>{t.nombre}</b>
              <small>{t.resumen}</small>
            </button>
          ))}
        </div>

        <h3 className="cms-panel__titulo">Tipografía</h3>
        <div className="cms-sitio__dos">
          {fuente("fh", "Títulos")}
          {fuente("fb", "Texto")}
        </div>
        {rango("base", "Tamaño del texto base", 14, 22, 1, "px")}
        <label className="cms-campo">
          <span>Escala de los títulos</span>
          <select className="cms-input" value={completo.ratio} onChange={(e) => poner("ratio", Number(e.target.value) as EstiloSitio["ratio"])}>
            {ESCALAS.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ESCALA[r]}
              </option>
            ))}
          </select>
        </label>
        {rango("lh", "Interlineado", 1.2, 1.9, 0.05, "")}
        <label className="cms-campo">
          <span>Peso de los títulos</span>
          <select className="cms-input" value={completo.wh} onChange={(e) => poner("wh", Number(e.target.value) as EstiloSitio["wh"])}>
            {PESOS_TITULO.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <h3 className="cms-panel__titulo">Colores</h3>
        <div className="cms-sitio__dos">
          {color("marino", "Marino")}
          {color("acento", "Acento")}
          {color("alt", "Fondo alterno")}
          {color("txt", "Texto")}
        </div>

        <h3 className="cms-panel__titulo">Forma</h3>
        {rango("radius", "Esquinas de las tarjetas", 0, 32, 1, "px")}
        <label className="cms-campo">
          <span>Botones</span>
          <select className="cms-input" value={completo.btn} onChange={(e) => poner("btn", Number(e.target.value) as EstiloSitio["btn"])}>
            {BOTONES.map((b) => (
              <option key={b} value={b}>
                {ETIQUETA_BOTON[b]}
              </option>
            ))}
          </select>
        </label>

        <h3 className="cms-panel__titulo">Variables CSS que se publican</h3>
        <pre className="cms-codigo" tabIndex={0} aria-label="Variables CSS del estilo del sitio">
          {textoVariables(actual)}
        </pre>
        <p className="cms-ayuda">Solo salen las que usted define. Un bloque puede salirse del estilo del sitio en su pestaña Estilo.</p>
      </fieldset>

      <div className="cms-sitio__vista">
        <div className="cms-barra__grupo" style={{ marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <span className={`cms-estado${sucio ? " cms-estado--sucio" : ""}`} role="status">
            {sucio ? "Cambios sin guardar" : "Sin cambios pendientes"}
          </span>
          <button type="button" className="cms-btn" onClick={() => void copiar()}>
            Copiar variables
          </button>
          {editable && (
            <>
              <button type="button" className="cms-btn" onClick={() => setBorrador({})} disabled={Object.keys(actual).length === 0}>
                Volver al aspecto actual
              </button>
              <button type="button" className="cms-btn" onClick={() => setBorrador(null)} disabled={!sucio}>
                Descartar
              </button>
              <button type="button" className="cms-btn cms-btn--primario" onClick={() => void guardarAhora()} disabled={!sucio || guardar.isPending}>
                {guardar.isPending ? "Guardando…" : "Guardar estilo"}
              </button>
            </>
          )}
        </div>
        <div className="cms-sitio__marco">
          <RenderBloques bloques={muestra} estilo={actual} auto={false} />
        </div>
        <p className="cms-ayuda">Vista previa de la portada con el estilo del sitio. Guardar lo publica de inmediato en todo el portal.</p>
      </div>
    </section>
  );
}
