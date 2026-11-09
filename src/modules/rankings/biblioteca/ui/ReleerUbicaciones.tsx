/* =============================================================================
   Biblioteca · «Releer con ubicaciones».

   Los archivos subidos antes de la migración 0265 solo tienen un texto corrido:
   las cifras que Pilo Publica saque de ellos no podrán decir la página, la hoja ni la
   celda. Aquí se vuelven a leer (se bajan del bucket y se leen en el navegador,
   de uno en uno) y se les guardan sus fragmentos. El texto y la clasificación no
   se tocan.
   ========================================================================== */

import { useMemo, useState } from "react";
import { lectorDe } from "../extraer-texto";
import { useReleerArchivos } from "../datos";
import type { ArchivoBiblioteca, ResultadoRelectura } from "../datos";

export function ReleerUbicaciones({ archivos }: { archivos: ArchivoBiblioteca[] }) {
  const releer = useReleerArchivos();
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<ResultadoRelectura[] | null>(null);
  const pendientes = useMemo(() => archivos.filter((a) => (a.fragmentos ?? 0) === 0 && lectorDe(a.ext) !== null && a.estado_texto !== "sin_texto"), [archivos]);

  if (!pendientes.length && !resultado) return null;
  const mal = (resultado ?? []).filter((r) => r.problema);

  const correr = async () => {
    setResultado(null);
    setAvance({ hechos: 0, total: pendientes.length });
    try {
      const r = await releer.mutateAsync({ archivos: pendientes, alAvanzar: (hechos, total) => setAvance({ hechos, total }) });
      setResultado(r);
    } finally {
      setAvance(null);
    }
  };

  return (
    <div className="rk-bib-releer">
      {pendientes.length > 0 && (
        <>
          <p className="rk-rep-aviso-linea is-warn">
            {pendientes.length} {pendientes.length === 1 ? "archivo está leído" : "archivos están leídos"} con la versión anterior: sus cifras no pueden decir la página, la hoja ni la celda de donde salen, y las tablas de Excel pierden sus encabezados.
          </p>
          <button type="button" className="rk-rep-btn is-sm is-primary" disabled={releer.isPending} onClick={() => void correr()}>
            {avance ? `Leyendo ${avance.hechos} de ${avance.total}…` : `Releer ${pendientes.length} con ubicaciones`}
          </button>
        </>
      )}
      {releer.error && <p className="rk-rep-aviso-linea is-risk">{releer.error.message}</p>}
      {resultado && (
        <p className={`rk-rep-aviso-linea ${mal.length ? "is-warn" : "is-ok"}`} role="status">
          {resultado.length - mal.length} de {resultado.length} archivos con ubicaciones.
          {mal.length > 0 && ` Sin ubicación: ${mal.slice(0, 4).map((r) => `${r.nombre} (${r.problema})`).join(" · ")}${mal.length > 4 ? ` y ${mal.length - 4} más` : ""}.`} Rehaga el libro de cifras para que las cifras tomen su lugar.
        </p>
      )}
    </div>
  );
}
