/* Ficha del indicador · agregar como evidencia un archivo de la biblioteca (solo Planeación). */

import { useMemo, useState } from "react";
import { normal } from "../../biblioteca/clasificar";
import { useAceptarArchivos, useBiblioteca } from "../../biblioteca/datos";
import type { ArchivoBiblioteca } from "../../biblioteca/datos";
import { FaltaMigracion } from "../../noticias";
import { mb } from "../../biblioteca/zip-seguro";

interface Props {
  ciclo: string;
  indicador: string;
  unidad: string;
  /** Archivos de la biblioteca ya ligados a esta respuesta. */
  yaLigados: string[];
  onLigado: () => void;
}

const LIMITE = 25;

/** Primero lo que Pilo propuso o se aceptó para este indicador; luego lo demás aceptado o propuesto. */
export function ordenarParaIndicador(archivos: ArchivoBiblioteca[], indicador: string, consulta: string): (ArchivoBiblioteca & { puntaje: number })[] {
  const q = normal(consulta);
  return archivos
    .filter((a) => a.estado === "aceptada" || a.estado === "propuesta")
    .filter((a) => !q || normal(a.ruta_zip).includes(q))
    .map((a) => ({ ...a, puntaje: a.indicador_aceptado === indicador ? 101 : (a.propuestas.find((p) => p.indicador === indicador)?.puntaje ?? 0) }))
    .sort((x, y) => y.puntaje - x.puntaje || x.ruta_zip.localeCompare(y.ruta_zip, "es", { numeric: true }));
}

export function DeLaBiblioteca({ ciclo, indicador, unidad, yaLigados, onLigado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lista = useBiblioteca();
  const aceptar = useAceptarArchivos();
  const ligados = useMemo(() => new Set(yaLigados), [yaLigados]);
  const candidatos = useMemo(() => (abierto ? ordenarParaIndicador(lista.data ?? [], indicador, consulta).filter((a) => !ligados.has(a.id)) : []), [abierto, lista.data, indicador, consulta, ligados]);

  async function ligar(a: ArchivoBiblioteca) {
    setError(null);
    const r = await aceptar.mutateAsync([{ archivo: a, ciclo, indicador, unidad }]);
    if (r.errores.length) setError(r.errores[0]);
    else onLigado();
  }

  return (
    <details className="rk-rep-small rk-rep-delabib" onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)}>
      <summary>Agregar de la biblioteca</summary>
      {abierto && (
        <div className="rk-rep-stack">
          {lista.error instanceof FaltaMigracion ? (
            <p className="rk-rep-muted">{lista.error.message}</p>
          ) : (
            <>
              <label className="rk-rep-sr" htmlFor={`bib-${indicador}`}>
                Buscar en la biblioteca
              </label>
              <input
                id={`bib-${indicador}`}
                className="rk-rep-input"
                type="search"
                placeholder="Buscar por nombre o carpeta"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
              />
              {lista.isPending && <p className="rk-rep-muted">Leyendo la biblioteca…</p>}
              {lista.data && candidatos.length === 0 && (
                <p className="rk-rep-muted">No hay archivos propuestos ni aceptados que coincidan. Súbalos en Rankings › THE Impact › Biblioteca.</p>
              )}
              <ul className="rk-rep-lista-ev">
                {candidatos.slice(0, LIMITE).map((a) => (
                  <li key={a.id} className="rk-rep-ev">
                    <div className="rk-rep-ev-cuerpo">
                      <b className="rk-rep-wrap">{a.nombre}</b>
                      <span className="rk-rep-muted rk-rep-wrap">
                        {a.carpeta || "Raíz del ZIP"} · {mb(a.tamano)}
                        {a.puntaje === 101 ? " · aceptado para este indicador" : a.puntaje > 0 ? ` · Pilo lo propone aquí (${a.puntaje})` : ""}
                      </span>
                    </div>
                    <button type="button" className="rk-rep-btn is-sm" disabled={aceptar.isPending} onClick={() => void ligar(a)}>
                      Agregar
                    </button>
                  </li>
                ))}
              </ul>
              {candidatos.length > LIMITE && <p className="rk-rep-muted">Hay {candidatos.length - LIMITE} más: afine la búsqueda.</p>}
              {error && (
                <p className="rk-rep-aviso-linea is-risk" role="alert">
                  {error}
                </p>
              )}
              <p className="rk-rep-muted">Queda como evidencia privada: para el punto de «pública», agregue también su enlace público arriba.</p>
            </>
          )}
        </div>
      )}
    </details>
  );
}
