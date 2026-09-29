/* =============================================================================
   Importar Excel: el archivo que sale del sistema académico.
   El motor lee el Excel o CSV, reconoce los encabezados (con o sin tildes, en
   cualquier orden) y cambia los códigos por nombres. Aquí solo se muestra qué
   reconoció y se decide si reemplaza la hoja o se suma a ella.
   ========================================================================== */

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Icon } from "../../components/ui/Icon";
import { motor } from "./motor";
import type { Contexto, Fila, PlantillaSpec, ResultadoImportacion } from "./tipos";

interface ImportarProps {
  spec: PlantillaSpec;
  ctx: Contexto;
  soloLectura: boolean;
  filasActuales: number;
  onAplicar: (filas: Fila[], reemplazar: boolean) => void;
}

export function Importar({ spec, ctx, soloLectura, filasActuales, onAplicar }: ImportarProps) {
  const [encima, setEncima] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ nombre: string; r: ResultadoImportacion } | null>(null);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const etiqueta = (codigo: string) => spec.campos.find((c) => c.codigo === codigo)?.etiqueta ?? codigo;

  async function leer(archivo: File) {
    setError(null);
    setResultado(null);
    setConfirmarReemplazo(false);
    setLeyendo(true);
    try {
      const matriz = await motor.leerArchivo(archivo);
      setResultado({ nombre: archivo.name, r: motor.importar(spec, matriz, ctx) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  }

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEncima(false);
    const archivo = e.dataTransfer.files[0];
    if (archivo && !soloLectura) void leer(archivo);
  };

  const aplicar = (reemplazar: boolean) => {
    if (!resultado) return;
    onAplicar(resultado.r.filas, reemplazar);
    setResultado(null);
    setConfirmarReemplazo(false);
  };

  if (soloLectura) {
    return <p className="ri-hint">Esta plantilla está en solo lectura: no se puede importar sobre ella.</p>;
  }

  const r = resultado?.r;

  return (
    <div className="ri-import">
      <div
        className={`ri-drop${encima ? " is-over" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <Icon name="upload" size={32} className="ri-drop-icon" />
        <strong>Suelte aquí el Excel o CSV de {spec.nombre}</strong>
        <p>
          Se reconocen los encabezados de la plantilla SNIES con o sin tildes y en cualquier orden. Los códigos que traiga el
          archivo (municipio, país, programa) se convierten a nombres con los catálogos.
        </p>
        <button type="button" className="button-primary ri-sm" disabled={leyendo} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={16} />
          {leyendo ? "Leyendo…" : "Elegir archivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo) void leer(archivo);
          }}
        />
      </div>

      {error && (
        <p className="ri-alert" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      {resultado && r && (
        <section className="ri-mapping" aria-label="Resultado de la lectura">
          <h3>
            {resultado.nombre} · <span className="ri-num">{r.filas.length}</span> {r.filas.length === 1 ? "fila" : "filas"}
          </h3>
          <div className="ri-chips">
            {r.reconocidas.map((c) => (
              <span key={c} className="ri-chip">
                <Icon name="check" size={12} />
                {etiqueta(c)}
              </span>
            ))}
            {r.faltantes.map((c) => (
              <span key={c} className="ri-chip is-miss">
                <Icon name="close" size={12} />
                Falta {etiqueta(c)}
              </span>
            ))}
            {r.ignoradas.map((c) => (
              <span key={c} className="ri-chip is-no">
                <Icon name="alert" size={12} />
                {c} · se ignora
              </span>
            ))}
          </div>
          <p className="ri-hint">
            {r.reconocidas.length} de {spec.campos.length} columnas reconocidas. {r.convertidos}{" "}
            {r.convertidos === 1 ? "código convertido" : "códigos convertidos"} a nombres con los catálogos.
            {r.faltantes.length > 0 && " Faltan columnas obligatorias: esas casillas llegarán vacías."}
          </p>
          {confirmarReemplazo ? (
            <div className="ri-confirm" role="alert">
              <span>
                Las {filasActuales} filas de la hoja se cambian por las {r.filas.length} del archivo.
              </span>
              <button type="button" className="button-secondary ri-sm" onClick={() => aplicar(true)}>
                Reemplazar la hoja
              </button>
              <button type="button" className="ri-link" onClick={() => setConfirmarReemplazo(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="ri-row">
              <button
                type="button"
                className="button-primary ri-sm"
                disabled={r.filas.length === 0}
                onClick={() => (filasActuales > 0 ? setConfirmarReemplazo(true) : aplicar(true))}
              >
                Reemplazar la hoja
              </button>
              <button type="button" className="button-secondary ri-sm" disabled={r.filas.length === 0 || filasActuales === 0} onClick={() => aplicar(false)}>
                Agregar a la hoja
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
