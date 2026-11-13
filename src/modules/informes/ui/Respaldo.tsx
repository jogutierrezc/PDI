/* Respaldo de una cifra o una acción de «Resultados y evidencias»: uno o varios anexos
   (los archivos y enlaces que se cargan en «Evidencias») y una o varias tablas o gráficas
   de UDrive. Todo es opcional; lo que se elija se imprime bajo la dimensión en el informe. */

import { respaldosDe } from "../indicadores-manual";
import type { IndicadorManual } from "../indicadores-manual";
import type { AnexoRow } from "../types";
import { ElementosDrive } from "./ElementosDrive";

interface Props {
  i: IndicadorManual;
  anexos: AnexoRow[];
  editable: boolean;
  cambiar: (x: Partial<IndicadorManual>) => void;
}

export function RespaldoIndicador({ i, anexos, editable, cambiar }: Props) {
  const elegidos = i.evidencias ?? [];
  const drive = i.drive ?? [];
  const total = respaldosDe(i);
  // Un anexo que ya no existe se muestra aparte para poder quitarlo, no se pierde en silencio.
  const huerfanos = elegidos.filter((n) => !anexos.some((a) => a.n === n));
  if (!editable && total === 0) return null;
  const alternar = (n: number) => cambiar({ evidencias: elegidos.includes(n) ? elegidos.filter((x) => x !== n) : [...elegidos, n].sort((a, b) => a - b) });
  return (
    <details className="inf-respaldo" open={total > 0}>
      <summary>
        Respaldo: evidencias y tablas o gráficas de UDrive{total > 0 ? ` (${total})` : " (opcional)"}
      </summary>
      <fieldset className="inf-respaldo__anexos" disabled={!editable}>
        <legend className="inf-lab">Evidencias (anexos) que respaldan esto</legend>
        {anexos.length === 0 && huerfanos.length === 0 && <p className="inf-hint">Aún no hay archivos cargados. Súbalos en la sección «Evidencias» y vuelva a marcarlos aquí.</p>}
        <ul className="inf-respaldo__lista">
          {anexos.map((a) => (
            <li key={a.id}>
              <label>
                <input type="checkbox" checked={elegidos.includes(a.n)} onChange={() => alternar(a.n)} />
                <span>
                  Anexo {a.n} · {a.nombre}
                </span>
              </label>
            </li>
          ))}
          {huerfanos.map((n) => (
            <li key={`h${n}`}>
              <label>
                <input type="checkbox" checked onChange={() => alternar(n)} />
                <span>Anexo {n} · ya no existe en Evidencias</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <ElementosDrive elementos={drive} editable={editable} onChange={(d) => cambiar({ drive: d })} />
    </details>
  );
}
