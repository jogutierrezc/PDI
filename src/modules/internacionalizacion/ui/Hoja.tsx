/* =============================================================================
   Internacionalización · la hoja tipo Excel.

   Grilla editable con columnas tipadas: cada encabezado dice su concepto del
   catálogo (o «campo propio»). Se valida al instante con lib/validacion
   (tipos, listas, obligatorios, fin ≥ inicio) y las calculadas se rellenan
   solas. Enter baja a la fila siguiente; pegar un rango de Excel rellena desde
   la celda enfocada (y crea las filas que falten). Lo cambiado se guarda con
   int_guardar_filas; la base vuelve a revisar todo (RLS y disparador).
   Una fila de un campus donde no se puede escribir queda en solo lectura, con
   el motivo en el pie, y lo personal se ve enmascarado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import type { FilaParaGuardar } from "../datos";
import type { Campus, ErrorCelda, IntColumnaRow, IntFilaRow } from "../tipos";
import { Confirmar, fmt } from "./comunes";
import { enmascarar, leerFilaGrilla, pegarRango, textoDe } from "./logica";
import type { PuedeEscribir } from "./logica";

interface Borrador {
  key: string;
  id?: string;
  campus_id: string;
  crudo: Record<string, string>;
  sucia: boolean;
  orden: number;
}

const ETIQUETA_TIPO: Record<IntColumnaRow["tipo"], string> = { texto: "texto", numero: "número", fecha: "fecha", lista: "lista", calculado: "calculado" };

let secuencia = 0;
const nuevaClave = () => `nueva-${++secuencia}`;

function desdeFilas(filas: readonly IntFilaRow[]): Borrador[] {
  return filas.map((f) => ({
    key: f.id,
    id: f.id,
    campus_id: f.campus_id,
    crudo: Object.fromEntries(Object.entries(f.datos).map(([k, v]) => [k, textoDe(v)])),
    sucia: false,
    orden: f.orden,
  }));
}

export function Hoja({
  columnas,
  filas,
  campus,
  escritura,
  campusNuevo,
  personales,
  guardando,
  onGuardar,
  onBorrar,
  agregarFila,
}: {
  columnas: IntColumnaRow[];
  /** Filas de los campus que se muestran (ya filtradas). */
  filas: IntFilaRow[];
  campus: Campus[];
  /** Papel y bloqueo de cada campus visible. */
  escritura: PuedeEscribir[];
  /** Campus de una fila nueva (el elegido o el único donde se puede escribir); nulo si no se puede. */
  campusNuevo: string | null;
  /** Claves de columnas con dato personal (se enmascaran en solo lectura). */
  personales: ReadonlySet<string>;
  guardando: boolean;
  onGuardar: (filas: FilaParaGuardar[]) => Promise<void>;
  onBorrar: (ids: string[]) => Promise<void>;
  /** Contador que sube cada vez que la barra pide «+ Fila». */
  agregarFila: number;
}) {
  const [borradores, setBorradores] = useState<Borrador[]>(() => desdeFilas(filas));
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<{ fila: number; clave: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const tabla = useRef<HTMLTableElement>(null);

  // Al llegar filas nuevas de la base, se reemplazan las limpias y se conservan las cambiadas.
  useEffect(() => {
    setBorradores((antes) => {
      const sucias = antes.filter((b) => b.sucia);
      const base = desdeFilas(filas).map((b) => sucias.find((s) => s.id === b.id) ?? b);
      return [...base, ...sucias.filter((s) => !s.id)];
    });
  }, [filas]);

  // «+ Fila» desde la barra de herramientas.
  const ultimaPedida = useRef(agregarFila);
  useEffect(() => {
    if (agregarFila === ultimaPedida.current || !campusNuevo) return;
    ultimaPedida.current = agregarFila;
    setBorradores((b) => [...b, { key: nuevaClave(), campus_id: campusNuevo, crudo: {}, sucia: true, orden: b.length }]);
    requestAnimationFrame(() => {
      const filasDom = tabla.current?.querySelectorAll("tbody tr");
      filasDom?.[filasDom.length - 1]?.querySelector<HTMLElement>("input, select")?.focus();
    });
  }, [agregarFila, campusNuevo]);

  const bloqueo = (campusId: string) => escritura.find((e) => e.campus_id === campusId)?.bloqueo ?? "No tiene permiso en este campus.";
  const editables = columnas.filter((c) => c.tipo !== "calculado").map((c) => c.clave);
  const lecturas = useMemo(() => borradores.map((b, i) => leerFilaGrilla(columnas, b.crudo, i + 1)), [borradores, columnas]);
  const errores = lecturas.flatMap((l) => l.errores);
  const sucias = borradores.filter((b) => b.sucia);
  const conError = borradores.filter((_, i) => lecturas[i].errores.length > 0).length;
  const algunaEditable = escritura.some((e) => !e.bloqueo);

  const cambiar = (i: number, clave: string, valor: string) =>
    setBorradores((b) => b.map((x, k) => (k === i ? { ...x, crudo: { ...x.crudo, [clave]: valor }, sucia: true } : x)));

  const guardar = async () => {
    const listas = borradores
      .map((b, i) => ({ b, l: lecturas[i] }))
      .filter(({ b, l }) => b.sucia && l.errores.length === 0 && !bloqueo(b.campus_id));
    if (!listas.length) return;
    try {
      await onGuardar(listas.map(({ b, l }) => ({ id: b.id, campus_id: b.campus_id, datos: l.datos, orden: b.orden })));
    } catch {
      return; // quien llama ya mostró el error; las filas siguen sin guardar
    }
    const guardadas = new Set(listas.map(({ b }) => b.key));
    // Las nuevas vuelven desde la base con su id; las demás quedan limpias.
    setBorradores((b) => b.filter((x) => !(guardadas.has(x.key) && !x.id)).map((x) => (guardadas.has(x.key) ? { ...x, sucia: false } : x)));
  };

  const quitar = async () => {
    const ids = borradores.filter((b) => marcadas.has(b.key) && b.id).map((b) => b.id!);
    try {
      if (ids.length) await onBorrar(ids);
    } catch {
      setConfirmar(false);
      return;
    }
    setBorradores((b) => b.filter((x) => !marcadas.has(x.key)));
    setMarcadas(new Set());
    setConfirmar(false);
  };

  const mover = (e: KeyboardEvent<HTMLElement>, fila: number, clave: string) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
    e.preventDefault();
    tabla.current?.querySelector<HTMLElement>(`[data-r="${fila + 1}"][data-c="${clave}"]`)?.focus();
  };

  const pegar = (e: ClipboardEvent<HTMLElement>, fila: number, clave: string) => {
    const texto = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(texto.replace(/\n$/, ""))) return;
    e.preventDefault();
    const cambios = pegarRango(texto, fila, editables.indexOf(clave), editables);
    setBorradores((b) => {
      const salida = [...b];
      for (const c of cambios) {
        while (c.fila >= salida.length && campusNuevo) salida.push({ key: nuevaClave(), campus_id: campusNuevo, crudo: {}, sucia: true, orden: salida.length });
        const x = salida[c.fila];
        if (!x || bloqueo(x.campus_id)) continue;
        salida[c.fila] = { ...x, crudo: { ...x.crudo, [c.clave]: c.valor }, sucia: true };
      }
      return salida;
    });
  };

  const errorDe = (i: number, clave: string): ErrorCelda | undefined => lecturas[i]?.errores.find((x) => x.columna === clave);
  const enFoco = foco ? errorDe(foco.fila, foco.clave) : undefined;
  const bloqueoEnFoco = foco ? bloqueo(borradores[foco.fila]?.campus_id ?? "") : null;
  const nombreCampus = (id: string) => campus.find((c) => c.id === id)?.name ?? "Campus";

  if (columnas.length === 0) {
    return <p className="it-hoja__vacia">Esta hoja todavía no tiene columnas. El Director las define al crearla o desde un Excel.</p>;
  }

  return (
    <div className="it-hoja">
      <div className="it-hoja__marco">
        <table ref={tabla} className="it-grilla">
          <thead>
            <tr>
              <th scope="col" className="it-grilla__n">
                <span className="sr-only">Fila</span>
              </th>
              <th scope="col" className="it-grilla__campus">
                Campus<small>implícito</small>
              </th>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" title={c.concepto_id ? `Concepto del catálogo: ${c.concepto_id}` : "Campo propio de esta hoja"}>
                  {c.etiqueta}
                  {c.obligatorio && <span className="it-obligatorio" aria-label="obligatorio"> *</span>}
                  <small>
                    {c.concepto_id ? c.concepto_id : "campo propio"} · {ETIQUETA_TIPO[c.tipo]}
                  </small>
                </th>
              ))}
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {borradores.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 3} className="it-grilla__nada">
                  {algunaEditable ? "Sin filas en este periodo. Use «+ Fila», pegue un rango de Excel o cargue el archivo." : "Sin filas en este periodo."}
                </td>
              </tr>
            )}
            {borradores.map((b, i) => {
              const motivo = bloqueo(b.campus_id);
              const l = lecturas[i];
              return (
                <tr key={b.key} className={b.sucia ? "is-sucia" : undefined} aria-invalid={l.errores.length > 0 || undefined}>
                  <td className="it-grilla__n">
                    {motivo ? (
                      <span className="it-num">{i + 1}</span>
                    ) : (
                      <label>
                        <input
                          type="checkbox"
                          checked={marcadas.has(b.key)}
                          onChange={(e) => {
                            const s = new Set(marcadas);
                            if (e.target.checked) s.add(b.key);
                            else s.delete(b.key);
                            setMarcadas(s);
                          }}
                          aria-label={`Elegir la fila ${i + 1}`}
                        />
                        <span className="it-num" aria-hidden="true">
                          {i + 1}
                        </span>
                      </label>
                    )}
                  </td>
                  <td className="it-grilla__campus" data-rotulo="Campus">{nombreCampus(b.campus_id)}</td>
                  {columnas.map((c) => {
                    const err = errorDe(i, c.clave);
                    const valor = b.crudo[c.clave] ?? "";
                    if (c.tipo === "calculado") {
                      const v = l.datos[c.clave];
                      return (
                        <td key={c.clave} className="it-grilla__calc it-num" data-rotulo={c.etiqueta}>
                          {v === null || v === undefined ? "" : String(v)}
                        </td>
                      );
                    }
                    const comun = {
                      "data-r": i,
                      "data-c": c.clave,
                      "aria-label": `${c.etiqueta}, fila ${i + 1}`,
                      "aria-invalid": err ? true : undefined,
                      title: err?.mensaje,
                      disabled: Boolean(motivo),
                      onFocus: () => setFoco({ fila: i, clave: c.clave }),
                      onKeyDown: (e: KeyboardEvent<HTMLElement>) => mover(e, i, c.clave),
                      onPaste: (e: ClipboardEvent<HTMLElement>) => pegar(e, i, c.clave),
                    };
                    if (motivo && personales.has(c.clave)) {
                      return (
                        <td key={c.clave} className="it-grilla__fija" data-rotulo={c.etiqueta}>
                          {enmascarar(valor)}
                        </td>
                      );
                    }
                    return (
                      <td key={c.clave} className={err ? "is-mal" : undefined} data-rotulo={c.etiqueta}>
                        {c.tipo === "lista" && c.opciones.length > 0 ? (
                          <select {...comun} value={valor} onChange={(e) => cambiar(i, c.clave, e.target.value)}>
                            <option value="" />
                            {valor && !c.opciones.includes(valor) && <option value={valor}>{valor}</option>}
                            {c.opciones.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            {...comun}
                            type="text"
                            inputMode={c.tipo === "numero" ? "decimal" : undefined}
                            placeholder={c.tipo === "fecha" ? "AAAA-MM-DD" : undefined}
                            className={c.tipo === "numero" ? "it-num it-der" : undefined}
                            value={valor}
                            onChange={(e) => cambiar(i, c.clave, e.target.value)}
                            onBlur={() => {
                              // Una fecha escrita «dd/mm/aaaa» queda en AAAA-MM-DD al salir.
                              const v = l.datos[c.clave];
                              if (c.tipo === "fecha" && typeof v === "string" && v !== valor && !err) cambiar(i, c.clave, v);
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="it-grilla__estado" data-rotulo="Estado">
                    {l.errores.length ? (
                      <span className="it-chip is-risk" title={l.errores.map((x) => x.mensaje).join("\n")}>
                        <span aria-hidden="true">✕</span> {l.errores.length === 1 ? "1 error" : `${l.errores.length} errores`}
                      </span>
                    ) : b.sucia ? (
                      <span className="it-chip is-cambio">
                        <span aria-hidden="true">◆</span> Sin guardar
                      </span>
                    ) : (
                      <span className="it-chip is-ok">
                        <span aria-hidden="true">✓</span> Válida
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="it-hoja__pie" aria-live="polite">
        <span>
          <b className="it-num">{fmt(borradores.length)}</b> filas
        </span>
        <span className={conError ? "is-risk" : undefined}>
          <b className="it-num">{fmt(conError)}</b> con error
        </span>
        {sucias.length > 0 && (
          <span className="is-cambio">
            <b className="it-num">{fmt(sucias.length)}</b> sin guardar
          </span>
        )}
        <span className="it-hoja__msg">
          {enFoco
            ? `Fila ${foco!.fila + 1}: ${enFoco.mensaje}`
            : bloqueoEnFoco
              ? bloqueoEnFoco
              : errores[0]
                ? `Fila ${errores[0].fila}: ${errores[0].mensaje}`
                : "Fechas, listas y obligatorios se revisan al escribir. Pegue un rango de Excel en cualquier celda."}
        </span>
        <span className="it-espacio" />
        {marcadas.size > 0 && !confirmar && (
          <button type="button" className="button-ghost it-btn it-btn--quitar" onClick={() => setConfirmar(true)}>
            Quitar {marcadas.size === 1 ? "1 fila" : `${marcadas.size} filas`}
          </button>
        )}
        {algunaEditable && (
          <button type="button" className="button-primary it-btn" disabled={guardando || sucias.length === 0} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : sucias.length ? `Guardar cambios (${sucias.length})` : "Todo guardado"}
          </button>
        )}
      </div>
      {confirmar && (
        <Confirmar
          pregunta={`¿Quitar ${marcadas.size === 1 ? "1 fila" : `${marcadas.size} filas`} de la hoja?`}
          detalle="Las filas ya guardadas se borran de la base para este periodo; no cuentan más en Cifras ni en las plantillas."
          si="Sí, quitar"
          onSi={() => void quitar()}
          onNo={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}
