/* =============================================================================
   Programas en Cifras · el panel «Campos» del editor.

   Qué guarda cada columna: nombre, tipo, si es obligatoria y, en una lista,
   sus opciones. Todo queda bloqueado en los archivos de estructura fija (los
   cuadros del CNA) y en solo lectura (Planeación).
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useGuardarColumnas } from "../datos";
import type { ColumnaNueva } from "../datos";
import { claveDeEncabezado } from "../lib/inferencia";
import { ETIQUETA_TIPO } from "../lib/validacion";
import type { ArchivoCompleto, PcColumnaRow, PcTipo } from "../tipos";
import { useEspacio } from "./contexto";
import { opcionesDeTexto, SIMBOLO_TIPO } from "./logica";

const TIPOS = Object.keys(ETIQUETA_TIPO) as PcTipo[];

const aCarga = (cs: readonly PcColumnaRow[]): ColumnaNueva[] =>
  cs.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, obligatorio: c.obligatorio, opciones: c.opciones, posterior_a: c.posterior_a, personal: c.personal }));

export function PanelCampos({ archivo, editable, guardarAntes }: { archivo: ArchivoCompleto; editable: boolean; guardarAntes: () => Promise<boolean> }) {
  const { pareja, decir } = useEspacio();
  const guardar = useGuardarColumnas();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [tipoNuevo, setTipoNuevo] = useState<PcTipo>("texto");

  const aplicar = async (siguientes: ColumnaNueva[], mensaje?: string) => {
    if (!(await guardarAntes())) return;
    guardar.mutate(
      { archivo: archivo.id, programa: pareja.programa_id, campus: pareja.campus_id, columnas: siguientes },
      { onSuccess: () => mensaje && decir(mensaje), onError: (e) => decir(e.message) },
    );
  };

  const cambiar = (clave: string, parcial: Partial<ColumnaNueva>) => {
    const siguientes = aCarga(archivo.columnas).map((c) => (c.clave === clave ? { ...c, ...parcial } : c));
    void aplicar(siguientes);
  };

  return (
    <>
      <div>
        <h3>Campos</h3>
        <p className="es-sub">{archivo.bloqueado ? "La estructura la fija el CNA; no se puede cambiar." : editable ? "Defina qué guarda cada columna." : "Solo lectura: Planeación no cambia los campos."}</p>
      </div>
      {archivo.columnas.map((c) => {
        const abre = abierto === c.clave;
        const bloquea = !editable || Boolean(c.solo_lectura);
        return (
          <div className="pc-fld" key={c.clave} data-open={abre}>
            <button type="button" aria-expanded={abre} onClick={() => setAbierto(abre ? null : c.clave)}>
              <span className="pc-ft" aria-hidden="true">
                {SIMBOLO_TIPO[c.tipo]}
              </span>
              <span className="es-fn">{c.etiqueta}</span>
              {c.obligatorio ? <span className="es-req">*</span> : null}
              {c.solo_lectura ? <Icon name="lock" size={13} /> : null}
            </button>
            {abre ? (
              <div className="pc-fe">
                <label className="es-fl">
                  Nombre
                  <input type="text" key={c.etiqueta} defaultValue={c.etiqueta} disabled={!editable} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.etiqueta && cambiar(c.clave, { etiqueta: e.target.value.trim() })} />
                </label>
                <label className="es-fl">
                  Tipo
                  <select value={c.tipo} disabled={!editable} onChange={(e) => cambiar(c.clave, { tipo: e.target.value as PcTipo, opciones: e.target.value === "lista" && !c.opciones.length ? ["Sí", "No"] : c.opciones })}>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO[t]}
                      </option>
                    ))}
                  </select>
                </label>
                {c.tipo === "lista" ? (
                  <label className="es-fl">
                    Opciones, separadas por coma
                    <textarea key={c.opciones.join("|")} defaultValue={c.opciones.join(", ")} disabled={!editable} onBlur={(e) => cambiar(c.clave, { opciones: opcionesDeTexto(e.target.value) })} />
                  </label>
                ) : null}
                <label className="es-ck">
                  <input type="checkbox" checked={c.obligatorio} disabled={!editable} onChange={(e) => cambiar(c.clave, { obligatorio: e.target.checked })} />
                  Obligatorio
                </label>
                {c.solo_lectura ? <p className="es-note">Viene del {c.solo_lectura} y no se edita aquí.</p> : null}
                {editable && !bloquea ? (
                  <button
                    type="button"
                    className="es-btn es-btn--sm"
                    style={{ justifySelf: "start" }}
                    onClick={() => {
                      setAbierto(null);
                      void aplicar(aCarga(archivo.columnas).filter((x) => x.clave !== c.clave), "Campo quitado.");
                    }}
                  >
                    <Icon name="trash" size={16} />
                    Quitar el campo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <div className="pc-fld">
          <form
            className="pc-fe"
            style={{ borderTop: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const etiqueta = nuevo.trim();
              if (!etiqueta) return decir("Escriba el nombre del campo.");
              const clave = claveDeEncabezado(etiqueta, archivo.columnas.map((c) => c.clave));
              setNuevo("");
              void aplicar([...aCarga(archivo.columnas), { clave, etiqueta, tipo: tipoNuevo, obligatorio: false, opciones: tipoNuevo === "lista" ? ["Sí", "No"] : [] }], "Campo agregado.");
            }}
          >
            <label className="es-fl">
              Nuevo campo
              <input type="text" value={nuevo} placeholder="Ej. Responsable" onChange={(e) => setNuevo(e.target.value)} />
            </label>
            <div className="es-chips" role="group" aria-label="Tipo del nuevo campo">
              {TIPOS.map((t) => (
                <button key={t} type="button" className="es-chip" aria-pressed={t === tipoNuevo} onClick={() => setTipoNuevo(t)}>
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>
            <button type="submit" className="es-btn es-btn--pri es-btn--sm" style={{ justifySelf: "start" }} disabled={guardar.isPending}>
              <Icon name="plus" size={16} />
              Agregar campo
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
