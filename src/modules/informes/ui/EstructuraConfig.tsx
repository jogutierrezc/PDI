/* =============================================================================
   Tablero del ciclo · la estructura de cada plantilla (migración 0276).
   Por plantilla: qué secciones lleva el informe del ciclo, su orden, su título,
   si la unidad puede editarla o solo leerla, y las secciones libres que Planeación
   suma. Cada cambio se guarda al instante; sin fila manda la plantilla del código.
   En un ciclo abierto o cerrado solo se activa o desactiva y se cambia la edición:
   no se agregan, borran, renombran ni reordenan secciones (la base también lo exige).
   ========================================================================== */

import { useState } from "react";
import { useInstancias } from "../datos";
import { useRestablecerEstructura } from "../mejoras-datos";
import { LETRAS, PLANTILLAS } from "../plantillas";
import { TITULO_LIBRE, claveLibreNueva, estructuraDe } from "../secciones-config";
import type { SeccionEstructura } from "../secciones-config";
import { informesConContenidoLibre, useBorrarSeccionLibre, useConfigSecciones, useGuardarConfigSecciones } from "../secciones-datos";
import type { CicloRow, Plantilla, SeccionConfigRow } from "../types";
import { Cargando, mensajeDe } from "./comunes";

const NOMBRE_TIPO: Record<string, string> = {
  narr: "Texto",
  pdi: "Alineación con el PDI",
  metas: "Objetivos y metas",
  dim: "Resultados",
  matriz: "Síntesis",
  filas: "Tabla de filas",
  logros: "Logros",
  evid: "Evidencias",
  anexos: "Anexos",
  libre: "Libre",
};

export function EstructuraConfig({ ciclo }: { ciclo: CicloRow }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("A");
  const lectura = useConfigSecciones(ciclo.id);
  const instancias = useInstancias(ciclo.id);
  const guardar = useGuardarConfigSecciones();
  const borrar = useBorrarSeccionLibre();
  const restablecer = useRestablecerEstructura();
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [hecho, setHecho] = useState("");
  if (lectura.isPending) return <Cargando texto="Cargando la estructura…" />;

  const filas = lectura.data?.filas ?? [];
  const falta = Boolean(lectura.data?.falta);
  const abierta = ciclo.estado === "preparacion";
  const lista = estructuraDe(plantilla, filas);
  const activas = lista.filter((e) => e.activa).length;

  /** La fila de una sección con lo que cambia; las que no tenían fila nacen con los valores de la plantilla. */
  const filaDe = (e: SeccionEstructura, cambios: Partial<SeccionConfigRow> = {}): SeccionConfigRow => ({
    ciclo_id: ciclo.id,
    plantilla,
    clave: e.def.clave,
    activa: e.activa,
    orden: e.fila?.orden ?? null,
    titulo: e.fila?.titulo ?? null,
    editable_por_unidad: e.editable,
    libre: Boolean(e.def.libre),
    minimo: e.fila?.minimo ?? null,
    ...cambios,
  });
  const correr = async (trabajo: () => Promise<unknown>) => {
    setError("");
    try {
      await trabajo();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };
  const poner = (e: SeccionEstructura, cambios: Partial<SeccionConfigRow>) => correr(() => guardar.mutateAsync([filaDe(e, cambios)]));
  const mover = (n: number, d: -1 | 1) => {
    const m = n + d;
    if (m < 0 || m >= lista.length) return;
    const copia = [...lista];
    [copia[n], copia[m]] = [copia[m], copia[n]];
    void correr(() => guardar.mutateAsync(copia.map((e, i) => filaDe(e, { orden: i + 1 }))));
  };
  const agregar = () =>
    correr(() =>
      guardar.mutateAsync([
        { ciclo_id: ciclo.id, plantilla, clave: claveLibreNueva(plantilla, filas), activa: true, orden: lista.length + 1, titulo: TITULO_LIBRE, editable_por_unidad: true, libre: true, minimo: null },
      ]),
    );
  const quitar = (e: SeccionEstructura) =>
    correr(async () => {
      const con = await informesConContenidoLibre((instancias.data ?? []).filter((i) => i.plantilla === plantilla).map((i) => i.id), e.def.clave);
      if (con > 0 && !window.confirm(`«${e.def.titulo}» ya tiene contenido en ${con} ${con === 1 ? "informe" : "informes"}. Si la elimina, ese contenido se borra. ¿Continuar?`)) return;
      await borrar.mutateAsync({ ciclo_id: ciclo.id, plantilla, clave: e.def.clave });
    });

  return (
    <section className="inf-card inf-pad" aria-labelledby="inf-estr">
      <h3 id="inf-estr" className="inf-t">
        La estructura de cada informe
      </h3>
      <p className="inf-sub">
        Elija qué secciones lleva cada plantilla en este ciclo. «Solo lectura» deja la sección como la dejó Planeación: la unidad la ve, no la cambia y cuenta como lista.
        {abierta ? " Puede renombrar, reordenar y agregar secciones libres." : " Con el ciclo abierto o cerrado solo se activan, desactivan o se cambia la edición."}
      </p>
      {falta && (
        <p className="inf-error" role="alert">
          Falta aplicar la migración 0276. Mientras tanto los informes usan las plantillas tal como están.
        </p>
      )}
      <div className="rk-seg" role="group" aria-label="Plantilla" style={{ marginBottom: "var(--space-4)" }}>
        {LETRAS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === plantilla}
            onClick={() => {
              setPlantilla(l);
              setConfirmando(false);
              setHecho("");
            }}
            title={PLANTILLAS[l].quien}
          >
            {PLANTILLAS[l].propia ? PLANTILLAS[l].nombre : `${l} · ${PLANTILLAS[l].quien}`}
          </button>
        ))}
      </div>
      <ol className="inf-stack" style={{ gap: "var(--space-3)", listStyle: "none", padding: 0, margin: 0 }}>
        {lista.map((e, n) => (
          <li key={e.def.clave} className="inf-row" style={{ flexWrap: "wrap", opacity: e.activa ? 1 : 0.6 }}>
            <span className="inf-num" style={{ minWidth: "1.5rem" }}>
              {n + 1}
            </span>
            <input
              key={`${e.def.clave}-${e.fila?.titulo ?? ""}`}
              className="inf-in"
              style={{ flex: "1 1 14rem" }}
              defaultValue={e.def.libre || e.fila?.titulo ? e.def.titulo : ""}
              placeholder={e.tituloBase || TITULO_LIBRE}
              disabled={!abierta || falta}
              maxLength={120}
              aria-label={`Título de la sección ${n + 1}`}
              onBlur={(x) => {
                const t = x.target.value.trim();
                const nuevo = t && t !== e.tituloBase ? t : null;
                if (nuevo !== (e.fila?.titulo ?? null) && (nuevo || !e.def.libre)) void poner(e, { titulo: nuevo });
              }}
            />
            <small className="inf-hint">{NOMBRE_TIPO[e.def.tipo]}</small>
            <label className="inf-chk">
              <input type="checkbox" checked={e.activa} disabled={falta || e.def.tipo === "evid" || (e.activa && activas <= 1)} onChange={(x) => void poner(e, { activa: x.target.checked })} /> Activa
            </label>
            {e.def.tipo === "evid" && <small className="inf-hint">Obligatoria en todo informe</small>}
            <label className="inf-chk">
              <input type="checkbox" checked={e.editable} disabled={falta} onChange={(x) => void poner(e, { editable_por_unidad: x.target.checked })} /> La unidad edita
            </label>
            {e.def.libre && (
              <label className="inf-chk" title="Palabras mínimas del texto (opcional)">
                Mín.
                <input
                  className="inf-in inf-num"
                  type="number"
                  min={0}
                  max={2000}
                  style={{ width: "5rem" }}
                  defaultValue={e.fila?.minimo ?? ""}
                  disabled={!abierta || falta}
                  aria-label="Palabras mínimas"
                  onBlur={(x) => {
                    const v = x.target.value.trim() ? Math.max(0, Math.min(2000, Math.round(Number(x.target.value)))) : null;
                    if ((v || null) !== (e.fila?.minimo ?? null)) void poner(e, { minimo: v || null });
                  }}
                />
              </label>
            )}
            <button type="button" className="inf-link" onClick={() => mover(n, -1)} disabled={!abierta || falta || n === 0}>
              Subir
            </button>
            <button type="button" className="inf-link" onClick={() => mover(n, 1)} disabled={!abierta || falta || n === lista.length - 1}>
              Bajar
            </button>
            {e.def.libre && (
              <button type="button" className="inf-link" onClick={() => void quitar(e)} disabled={!abierta || falta || borrar.isPending}>
                Eliminar
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
        <button type="button" className="inf-btn inf-btn--sm" onClick={() => void agregar()} disabled={!abierta || falta || guardar.isPending}>
          + Agregar una sección libre
        </button>
        {!abierta && <span className="inf-hint">Solo con el ciclo en preparación.</span>}
        <button
          type="button"
          className="inf-btn inf-btn--sm"
          onClick={() => {
            setConfirmando(true);
            setHecho("");
          }}
          disabled={falta || confirmando || restablecer.isPending}
        >
          Restablecer a la plantilla
        </button>
        {error && (
          <span className="inf-error" role="alert">
            {error}
          </span>
        )}
      </div>
      {confirmando && (
        <div className="inf-est-confirma" role="group" aria-label="Confirmar el restablecimiento de la plantilla">
          <p>
            {abierta
              ? `Se borran los ajustes de ${PLANTILLAS[plantilla].nombre} en este ciclo: títulos, orden, activación, edición por la unidad y las secciones libres, junto con lo que las unidades hayan escrito en ellas. Las secciones vuelven a ser las de la plantilla.`
              : "Con el ciclo abierto o cerrado no se borra nada: solo se reactivan las secciones desactivadas y se abren de nuevo a la unidad. Títulos, orden y secciones libres se quedan como están."}
          </p>
          <div className="inf-row">
            <button
              type="button"
              className="inf-btn inf-btn--sm inf-btn--riesgo"
              disabled={restablecer.isPending}
              onClick={() => {
                setError("");
                restablecer.mutate(
                  { ciclo: ciclo.id, plantilla },
                  {
                    onSuccess: (n) => {
                      setConfirmando(false);
                      setHecho(n ? `Listo: se restablecieron ${n} ${n === 1 ? "ajuste" : "ajustes"}.` : "La plantilla ya estaba como la define Planeación; no hubo nada que cambiar.");
                    },
                    onError: (e) => setError(mensajeDe(e)),
                  },
                );
              }}
            >
              {restablecer.isPending ? "Restableciendo…" : "Sí, restablecer"}
            </button>
            <button type="button" className="inf-btn inf-btn--sm" onClick={() => setConfirmando(false)} disabled={restablecer.isPending}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {hecho && (
        <p className="inf-hint" role="status" style={{ marginTop: "var(--space-3)" }}>
          {hecho}
        </p>
      )}
    </section>
  );
}
