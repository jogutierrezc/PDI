/* Importar el Excel de THE: se lee en el navegador; solo se guarda al confirmar. */

import { useMemo, useRef, useState } from "react";
import type { RankingCycleRow } from "../../../../types/database";
import { indicadoresPorOds, leerCatalogo } from "../catalogo-excel";
import { aniosDelArchivo } from "../diligenciado-excel";
import type { CatalogoExcel } from "../catalogo-excel";
import { ANIO_EDICION, ODS_PRIORIZADOS, claveNombre, useAsignacionesReporte, useImportarCatalogo, useUnidadesReporte } from "../datos";
import { odsNombre, odsVars } from "../../ods";
import { useEntrada } from "../../movimiento";
import { fmtNumero } from "./comunes";

interface Props {
  ciclo: RankingCycleRow | null;
}

const LIMITE_ADVERTENCIAS = 8;

export function ImportarCatalogo({ ciclo }: Props) {
  const unidades = useUnidadesReporte();
  const asignaciones = useAsignacionesReporte(ciclo?.id);
  const importar = useImportarCatalogo();
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<{ nombre: string; catalogo: CatalogoExcel; anioArchivo: number | null; anioDatosArchivo: number | null } | null>(null);
  const [anio, setAnio] = useState("");
  const [anioDatos, setAnioDatos] = useState("");
  const [listo, setListo] = useState<string | null>(null);
  const previa = useRef<HTMLDivElement>(null);
  useEntrada(previa, ".rk-rep-vista > *", vista?.nombre ?? null);

  const porOds = useMemo(() => (vista ? indicadoresPorOds(vista.catalogo.filas) : new Map<number, number>()), [vista]);
  const sinOficina = useMemo(() => {
    if (!vista) return 0;
    const nombres = new Map((unidades.data ?? []).map((u) => [claveNombre(u.name), u.id]));
    return vista.catalogo.filas.filter((f) => f.nivel === "indicator" && !f.responsables.some((n) => nombres.has(claveNombre(n)))).length;
  }, [vista, unidades.data]);

  async function alElegir(archivo: File) {
    setError(null);
    setListo(null);
    setLeyendo(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(await archivo.arrayBuffer());
      const catalogo = leerCatalogo(libro);
      if (catalogo.ods.length === 0) throw new Error("No se encontraron hojas SDG1 a SDG17 en el archivo.");
      const anios = aniosDelArchivo(libro, archivo.name);
      const edicion = ciclo?.anio ?? anios.anioArchivo ?? ANIO_EDICION;
      setAnio(String(edicion));
      setAnioDatos(String(ciclo && ciclo.anio === edicion ? ciclo.anio_datos : (anios.anioDatos ?? edicion - 2)));
      setVista({ nombre: archivo.name, catalogo, anioArchivo: anios.anioArchivo, anioDatosArchivo: anios.anioDatos });
    } catch (e) {
      setVista(null);
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : "formato no reconocido"}.`);
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmar() {
    if (!vista) return;
    setError(null);
    const nombres = new Map((unidades.data ?? []).map((u) => [claveNombre(u.name), u.id]));
    const nAnio = Number(anio);
    const nDatos = Number(anioDatos);
    if (!Number.isInteger(nAnio) || nAnio < 2020 || nAnio > 2100 || !Number.isInteger(nDatos) || nDatos < 2015 || nDatos > nAnio) {
      setError("Revise los años: la edición es un año como 2027 y el de los datos no puede ser posterior.");
      return;
    }
    const conPrincipal = new Set((asignaciones.data ?? []).filter((a) => a.rol === "principal").map((a) => a.indicador));
    try {
      const r = await importar.mutateAsync({
        catalogo: vista.catalogo,
        cicloExistente: ciclo,
        unidadesPorNombre: nombres,
        indicadoresConPrincipal: conPrincipal,
        anio: nAnio,
        anioDatos: nDatos,
      });
      setListo(`Catálogo guardado: ${fmtNumero(r.indicadores, 0)} filas y ${fmtNumero(r.asignaciones, 0)} asignaciones nuevas. Los ODS 4, 5, 10 y 17 quedan priorizados.`);
      setVista(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el catálogo.");
    }
  }

  const advertencias = vista?.catalogo.advertencias ?? [];

  return (
    <section className="rk-rep-card" aria-labelledby="rk-rep-imp-h">
      <div className="rk-rep-split">
        <div>
          <h3 id="rk-rep-imp-h" className="rk-rep-h3">
            Catálogo de indicadores de THE
          </h3>
          <p className="rk-rep-muted rk-rep-small">
            El archivo trae una hoja por ODS (SDG1 a SDG17). Se importa una vez y queda el catálogo completo. Los ODS priorizados son {ODS_PRIORIZADOS.join(", ")}.
          </p>
        </div>
        <label className="rk-rep-btn is-primary rk-rep-file-btn">
          {leyendo ? "Leyendo el archivo…" : "Importar Excel de THE"}
          <input
            type="file"
            accept=".xlsx"
            className="rk-rep-sr"
            disabled={leyendo || importar.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void alElegir(f);
            }}
          />
        </label>
      </div>

      {error && (
        <p className="rk-rep-aviso-linea is-risk" role="alert">
          {error}
        </p>
      )}
      {listo && (
        <p className="rk-rep-aviso-linea is-ok" role="status">
          {listo}
        </p>
      )}

      {!vista && !listo && !error && (
        <p className="rk-rep-vacio rk-rep-small">
          Elija el archivo .xlsx que entrega THE. Se lee aquí mismo, en su navegador: verá cuántos indicadores trae cada ODS y qué responsables no coinciden con
          una oficina antes de guardar nada.
        </p>
      )}

      <div ref={previa}>
      {vista && (
        <div className="rk-rep-vista" aria-live="polite">
          <p className="rk-rep-vista-t">
            <b>Vista previa de «{vista.nombre}»</b>
          </p>
          <dl className="rk-rep-vista-cifras">
            <div>
              <dt>Hojas de ODS</dt>
              <dd className="rk-rep-num">{vista.catalogo.ods.length}</dd>
            </div>
            <div>
              <dt>Indicadores</dt>
              <dd className="rk-rep-num">{[...porOds.values()].reduce((s, n) => s + n, 0)}</dd>
            </div>
            <div>
              <dt>Campos de cifras</dt>
              <dd className="rk-rep-num">{vista.catalogo.filas.filter((f) => f.nivel === "option").length}</dd>
            </div>
            <div>
              <dt>Sin oficina que coincida</dt>
              <dd className="rk-rep-num">{sinOficina}</dd>
            </div>
          </dl>
          <ul className="rk-rep-conteos" aria-label="Indicadores por ODS">
            {vista.catalogo.ods.map((n) => (
              <li key={n} className={ODS_PRIORIZADOS.includes(n) ? "is-pri" : ""} style={odsVars(n)} title={odsNombre(n)}>
                <span className="rk-rep-conteos-n rk-rep-num">{n}</span>
                <b className="rk-rep-num">{porOds.get(n) ?? 0}</b>
                <span className="rk-rep-conteos-l">{ODS_PRIORIZADOS.includes(n) ? "priorizado" : "indicadores"}</span>
              </li>
            ))}
          </ul>
          <div className="rk-rep-grid-2">
            <label className="rk-rep-field">
              <span className="rk-rep-lbl">Edición del ranking (ciclo)</span>
              <input className="rk-rep-input" type="number" inputMode="numeric" min={2020} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} />
              <span className="rk-rep-small rk-rep-muted">
                {vista.anioArchivo ? `El archivo dice ${vista.anioArchivo}.` : "El archivo no dice la edición."}
                {ciclo ? ` El ciclo abierto es ${ciclo.anio}; otro año crea (o usa) el ciclo de ese año; el reporte trabaja siempre con el más reciente.` : ""}
              </span>
            </label>
            <label className="rk-rep-field">
              <span className="rk-rep-lbl">Año de los datos</span>
              <input className="rk-rep-input" type="number" inputMode="numeric" min={2015} max={2100} value={anioDatos} onChange={(e) => setAnioDatos(e.target.value)} />
              <span className="rk-rep-small rk-rep-muted">{vista.anioDatosArchivo ? `El archivo pide datos de ${vista.anioDatosArchivo}.` : "THE suele pedir datos de dos años antes."}</span>
            </label>
          </div>
          <p className="rk-rep-small">
            {sinOficina > 0 ? (
              <>
                <b className="rk-rep-num">{sinOficina}</b> indicadores no tienen una oficina que coincida con el nombre de su responsable; quedarán sin asignar hasta
                que Planeación los asigne.
              </>
            ) : (
              "Todos los responsables del archivo coinciden con una oficina existente."
            )}
          </p>
          {advertencias.length > 0 && (
            <details className="rk-rep-small">
              <summary>
                {advertencias.length} advertencias del archivo
              </summary>
              <ul className="rk-rep-lista">
                {advertencias.slice(0, LIMITE_ADVERTENCIAS).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
                {advertencias.length > LIMITE_ADVERTENCIAS && <li>y {advertencias.length - LIMITE_ADVERTENCIAS} más.</li>}
              </ul>
            </details>
          )}
          <div className="rk-rep-row">
            <button type="button" className="rk-rep-btn is-primary" onClick={() => void confirmar()} disabled={importar.isPending}>
              {importar.isPending ? "Guardando…" : "Guardar catálogo en el ciclo"}
            </button>
            <button type="button" className="rk-rep-btn" onClick={() => setVista(null)} disabled={importar.isPending}>
              Cancelar
            </button>
            <span className="rk-rep-small rk-rep-muted">Nada se guarda hasta confirmar.</span>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
