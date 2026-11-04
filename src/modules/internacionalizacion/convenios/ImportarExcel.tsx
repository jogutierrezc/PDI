/* =============================================================================
   Convenios · Depurar e importar el Excel institucional. El archivo se lee en el
   navegador (nada sale hasta que la persona pulsa «Importar»), se muestra qué
   encontró la lectura y cómo se leen las columnas, y se inserta por lotes. Un
   código que ya está en el registro se deja como está: reimportar no duplica.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { textoDeCelda } from "../contactos/archivos";
import { useImportarConvenios } from "./datos";
import { ErrorLectura, leerConvenios } from "./logica";
import type { Convenio, InformeLectura } from "./logica";

const MAX_BYTES = 12 * 1024 * 1024;

async function leerLibro(archivo: File): Promise<InformeLectura> {
  if (archivo.size > MAX_BYTES) throw new ErrorLectura("El archivo pesa más de 12 MB. Revise que sea el Excel de convenios.");
  if (/\.xls$/i.test(archivo.name)) throw new ErrorLectura("Ese es un Excel antiguo (.xls). Ábralo y guárdelo como «Libro de Excel (.xlsx)», y súbalo de nuevo.");
  if (!/\.xlsx$/i.test(archivo.name)) throw new ErrorLectura("Suba un archivo de Excel (.xlsx).");
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await archivo.arrayBuffer());
  } catch {
    throw new ErrorLectura("No se pudo abrir el archivo. Compruebe que no esté dañado ni protegido con contraseña.");
  }
  // «Hoja1» primero; «Hoja2» es una tabla dinámica y no trae el encabezado de los convenios, así que falla y se salta.
  const hojas = [...libro.worksheets].sort((a, b) => Number(/^hoja1$/i.test(b.name)) - Number(/^hoja1$/i.test(a.name)));
  let ultimo: unknown = null;
  for (const hoja of hojas) {
    const matriz: string[][] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      matriz[n - 1] = (fila.values as unknown[]).slice(1).map(textoDeCelda);
    });
    for (let i = 0; i < matriz.length; i++) matriz[i] ??= [];
    try {
      return leerConvenios(matriz);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new ErrorLectura("No se encontró la hoja de convenios.");
}

export function ImportarExcel({ convenios, onVerRevision, onHecho }: { convenios: Convenio[]; onVerRevision: () => void; onHecho: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [informe, setInforme] = useState<InformeLectura | null>(null);
  const [avance, setAvance] = useState(0);
  const [resultado, setResultado] = useState<{ nuevos: number; yaEstaban: number } | null>(null);
  const importar = useImportarConvenios();

  const existentes = useMemo(() => new Set(convenios.map((c) => c.codigo)), [convenios]);
  const nuevos = useMemo(() => (informe ? informe.filas.filter((f) => !existentes.has(f.codigo)) : []), [informe, existentes]);

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError("");
    setInforme(null);
    setResultado(null);
    setAvance(0);
    setNombre(archivo.name);
    setLeyendo(true);
    try {
      setInforme(await leerLibro(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const hacer = () => {
    if (!informe) return;
    setError("");
    importar.mutate(
      { filas: informe.filas, alAvanzar: setAvance },
      {
        onSuccess: (r) => {
          setResultado(r);
          onHecho();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const c = informe?.cuentas;

  return (
    <div className="conv-dep">
      <section className="conv-panel conv-bloque">
        <h2>Qué encontró la lectura del archivo</h2>
        <p className="conv-sub">
          Suba el Excel institucional «Relación de convenios». Se lee la hoja «Hoja1»; «Hoja2» es una tabla dinámica y se ignora, igual que las leyendas de las columnas V a Y («HOY», «Posibles Estados»).
        </p>
        <div className="conv-acciones">
          <input ref={entrada} type="file" accept=".xlsx" className="sr-only" id="conv-archivo" onChange={(e) => void elegir(e.target.files?.[0])} />
          <label htmlFor="conv-archivo" className="conv-btn conv-btn--pri conv-btn-archivo">
            <Icon name="upload" size={16} />
            {informe ? "Elegir otro archivo" : "Elegir el archivo de Excel"}
          </label>
          {nombre ? <span className="conv-sub">{nombre}</span> : null}
        </div>
        {leyendo ? <p className="conv-sub" role="status">Leyendo el archivo…</p> : null}
        {error ? (
          <p className="conv-error" role="alert">
            {error}
          </p>
        ) : null}

        {informe && c ? (
          <>
            <p className="conv-resumen-lectura">
              <b>{informe.filas.length}</b> convenios leídos
              {informe.sinCodigo ? `, ${informe.sinCodigo} filas sin código se ignoran` : ""}.{" "}
              {nuevos.length === informe.filas.length ? "Todos son nuevos." : `${nuevos.length} son nuevos y ${informe.filas.length - nuevos.length} ya están en el registro (se dejan como están).`}
            </p>
            <ul className="conv-lst">
              <li>
                <span>Estados escritos distinto (vigente, Vigente, «Pendiente firma de la otra parte»)</span>
                <b className="conv-fig">{c.estado}</b>
              </li>
              <li>
                <span>Tipos con otra grafía (marco, Especifico) o fuera de lista</span>
                <b className="conv-fig">{c.tipo}</b>
              </li>
              <li>
                <span>Modalidades con tilde faltante</span>
                <b className="conv-fig">{c.modalidad}</b>
              </li>
              <li>
                <span>Campus como «Todas», «todos» o «N/A»</span>
                <b className="conv-fig">{c.campus}</b>
              </li>
              <li>
                <span>Países con espacios, «EEUU», «Roma» o escritos en inglés</span>
                <b className="conv-fig">{c.pais}</b>
              </li>
              <li>
                <span>Varios países en una sola celda (pasan a «Varios países»)</span>
                <b className="conv-fig">{c.variosPaises}</b>
              </li>
              <li>
                <span>Estado que contradice la fecha de terminación</span>
                <b className="conv-fig is-warn">{c.desajuste}</b>
              </li>
              <li>
                <span>Sin fecha de terminación ni «Indefinido»</span>
                <b className="conv-fig is-warn">{c.sinFecha}</b>
              </li>
              <li>
                <span>Sin tipo de convenio</span>
                <b className="conv-fig is-warn">{c.sinTipo}</b>
              </li>
              <li>
                <span>Sin enlace a carpeta digital</span>
                <b className="conv-fig">{c.sinEnlace}</b>
              </li>
              <li>
                <span>Códigos repetidos en el archivo (se importa la primera fila)</span>
                <b className="conv-fig is-warn">{informe.repetidos.length}</b>
              </li>
            </ul>
            {informe.repetidos.length ? (
              <p className="conv-nota">
                Códigos repetidos que no se importan: {informe.repetidos.map((r) => `${r.codigo} (${r.institucion})`).join("; ")}. Si son convenios distintos, asígneles un código propio y créelos con «Nuevo convenio».
              </p>
            ) : null}

            <div className="conv-acciones">
              {resultado ? (
                <>
                  <p className="conv-ok" role="status">
                    Listo: {resultado.nuevos} convenios nuevos{resultado.yaEstaban ? `; ${resultado.yaEstaban} ya estaban y no se tocaron` : ""}.
                  </p>
                  <button type="button" className="conv-btn" onClick={onVerRevision}>
                    Ver los que necesitan revisión
                  </button>
                </>
              ) : (
                <button type="button" className="conv-btn conv-btn--pri" disabled={importar.isPending || !nuevos.length} onClick={hacer}>
                  <Icon name="upload" size={16} />
                  {importar.isPending ? `Importando… ${avance} de ${informe.filas.length}` : nuevos.length ? `Importar ${nuevos.length} convenios` : "No hay convenios nuevos"}
                </button>
              )}
            </div>
          </>
        ) : null}
      </section>

      <section className="conv-panel conv-bloque">
        <h2>Cómo se leen las columnas</h2>
        <p className="conv-sub">Cada columna del Excel pasa a un campo con lista cerrada, para que no vuelvan a escribirse variantes. La vigencia ya no se escribe: se calcula con las fechas.</p>
        {informe ? (
          <div className="conv-tabla conv-tabla--chica">
            <table>
              <thead>
                <tr>
                  <th>En el Excel</th>
                  <th>En el módulo</th>
                  <th>Regla</th>
                </tr>
              </thead>
              <tbody>
                {informe.columnas.map((col) => (
                  <tr key={col.encabezado}>
                    <td>{col.encabezado}</td>
                    <td>
                      <b>{col.modulo}</b>
                    </td>
                    <td className="conv-sub">{col.regla}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="conv-sub">Aparece aquí cuando se lea un archivo.</p>
        )}
      </section>
    </div>
  );
}
