/* Programas en Cifras · elegir programa y campus: primero el campus y luego, de ese campus, el programa
   (con búsqueda si son muchos). Quien tiene un solo campus no ve el paso del campus. */

import { useMemo, useState } from "react";
import { normalizar } from "../../../components/espacio/logica";
import type { ProgramaCampus } from "../tipos";
import { agruparPorCampus, claveDePareja } from "./logica";

export function SelectorPareja({ parejas, valor, onCambiar }: { parejas: readonly ProgramaCampus[]; valor: string; onCambiar: (clave: string) => void }) {
  const grupos = useMemo(() => agruparPorCampus(parejas), [parejas]);
  const actual = parejas.find((p) => claveDePareja(p) === valor) ?? parejas[0];
  const grupo = grupos.find((g) => g.campus_id === actual.campus_id) ?? grupos[0];
  const [q, setQ] = useState("");
  const n = normalizar(q);
  const programas = grupo.parejas.filter((p) => !n || normalizar(p.programa).includes(n) || p.programa_id === actual.programa_id);
  const cambiarCampus = (id: string) => {
    setQ("");
    onCambiar(claveDePareja(grupos.find((g) => g.campus_id === id)!.parejas[0]));
  };
  return (
    <>
      {grupos.length > 1 ? (
        <label className="es-fl">
          Campus
          <select className="es-inp" value={grupo.campus_id} onChange={(e) => cambiarCampus(e.target.value)}>
            {grupos.map((g) => (
              <option key={g.campus_id} value={g.campus_id}>
                {g.campus}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="es-note" style={{ margin: 0 }}>
          Campus: <b>{grupo.campus}</b>
        </p>
      )}
      <label className="es-fl">
        Programa{grupos.length > 1 ? ` en ${grupo.campus}` : ""}
        {grupo.parejas.length > 8 ? <input type="search" className="es-inp" placeholder="Buscar programa" aria-label="Buscar programa" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
        <select className="es-inp" value={claveDePareja(actual)} onChange={(e) => onCambiar(e.target.value)}>
          {programas.map((p) => (
            <option key={claveDePareja(p)} value={claveDePareja(p)}>
              {p.programa}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
