/* =============================================================================
   Tablero IGA · ventana de detalle de un programa.

   Una hoja lateral (<dialog> modal: foco atrapado, Esc y el fondo la cierran, el
   foco vuelve a quien la abrió) con todo lo que el observatorio sabe de un
   programa y sede: la última cifra de cada medida, su serie frente al promedio de
   la facultad y, si las tablas financieras están conectadas, su estructura
   financiera, sus cifras absolutas y su matrícula frente al punto de equilibrio.
   Sirve a cualquier tema: solo pide programa y sede.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { Aviso, Cascada, Leyenda, Lineas, Mancuerna } from "./graficas";
import { dinero, num, pct, sumar } from "./financiero-datos";
import type { ProgramaFin } from "./financiero-datos";
import { bloquesDelPrograma, formatoMedida } from "./detalle-datos";

const reducido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esFinanciero = (i: Indicador) => i.clave.startsWith("financiero.");

const PASOS: [keyof NonNullable<ProgramaFin["fp"][string]>, string][] = [
  ["d", "Descuentos sobre ingresos"],
  ["n", "Nómina docente"],
  ["cd", "Costos directos"],
  ["eo", "Excedente operativo"],
  ["cf", "Contribución a costos y gastos fijos"],
  ["en", "Excedente neto"],
];

export function DetallePrograma({ k, programas, indicadores, datasets, onCerrar, onFiltrar }: { k: string; programas: ProgramaFin[]; indicadores: Indicador[]; datasets: ObsDataset[]; onCerrar: () => void; onFiltrar?: (programa: string, sede: string) => void }) {
  const fin = programas.find((p) => p.k === k);
  const [programa, sede] = fin ? [fin.programa, fin.sede] : k.split("|");
  const facultad = fin?.facultad ?? "";

  const bloques = useMemo(() => bloquesDelPrograma(indicadores, datasets, { programa, sede, facultad }, esFinanciero), [indicadores, datasets, programa, sede, facultad]);
  const tendencias = bloques.filter((b) => b.programa.filter((v) => v !== null).length >= 3);

  /* --- Hoja ---------------------------------------------------------------------------- */
  const ref = useRef<HTMLDialogElement>(null);
  const saliendo = useRef(false);
  const cerrar = useCallback(() => {
    const d = ref.current;
    if (!d || saliendo.current) return;
    saliendo.current = true;
    if (reducido()) { d.close(); return; }
    gsap.to(d, { xPercent: 100, duration: 0.18, ease: "power3.out", onComplete: () => d.close() });
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // StrictMode monta, limpia y vuelve a montar: la limpieza llama a close() y esa no es una salida de la persona.
    saliendo.current = false;
    if (!d.open) d.showModal();
    if (!reducido()) {
      gsap.fromTo(d, { xPercent: 100 }, { xPercent: 0, duration: 0.3, ease: "power4.out", clearProps: "transform" });
      gsap.fromTo(d.querySelectorAll(".iga-det__sec"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "power4.out", stagger: 0.04, delay: 0.12, clearProps: "opacity,transform" });
    }
    return () => {
      gsap.killTweensOf([d, ...d.querySelectorAll(".iga-det__sec")]);
      gsap.set([d, ...d.querySelectorAll(".iga-det__sec")], { clearProps: "transform,opacity" });
      if (d.open) d.close();
    };
  }, []);

  const tiles: { etiqueta: string; valor: string; sub: string }[] = [
    ...bloques.filter((b) => b.ultimo).map((b) => ({ etiqueta: b.titulo, valor: formatoMedida(b.col, b.ultimo!.v), sub: b.ultimo!.t || (b.col.unit ?? "") })),
  ];
  const pfp = fin ? Object.keys(fin.fp).sort() : [];
  const peq = fin ? Object.keys(fin.eq).sort() : [];
  const pec = fin ? Object.keys(fin.ec).sort() : [];
  const ultEq = peq[peq.length - 1];
  if (fin && ultEq) tiles.push({ etiqueta: "Matriculados / equilibrio", valor: `${num(fin.eq[ultEq].m)} / ${num(fin.eq[ultEq].e)}`, sub: ultEq });
  const ultEc = pec[pec.length - 1];
  if (fin && ultEc) tiles.push({ etiqueta: "Excedente neto sobre ingresos", valor: fin.ec[ultEc].i ? pct(fin.ec[ultEc].en / fin.ec[ultEc].i) : "—", sub: `${ultEc} · ${dinero(fin.ec[ultEc].en)}` });

  return (
    <dialog ref={ref} className="iga-det iga" aria-labelledby="iga-det-t" onCancel={(e) => { e.preventDefault(); cerrar(); }} onClose={() => { if (saliendo.current) onCerrar(); }} onClick={(e) => { if (e.target === ref.current) cerrar(); }}>
      <header className="iga-det__cab">
        <div>
          <p className="iga-det__ubic">{facultad || "Sin facultad asignada"} · {sede || "Sin sede"}</p>
          <h2 id="iga-det-t">{programa}</h2>
          {fin?.nivel && <p className="iga-det__nivel">{fin.nivel}</p>}
        </div>
        <button type="button" className="iga-det__x" onClick={cerrar} aria-label="Cerrar el detalle">×</button>
      </header>

      <div className="iga-det__cuerpo">
        <section className="iga-det__sec" aria-label="Cifras del programa">
          {tiles.length ? (
            <div className="iga-det__tiles">
              {tiles.map((t) => (
                <div key={t.etiqueta} className="iga-det__tile"><span>{t.etiqueta}</span><b>{t.valor}</b><small>{t.sub}</small></div>
              ))}
            </div>
          ) : (
            <Aviso>Este programa no tiene cifras en las tablas conectadas. Se une por nombre y sede: si el nombre se escribe distinto en otra tabla, no se encuentra.</Aviso>
          )}
        </section>

        {tendencias.map((b) => (
          <section key={b.id} className="iga-det__sec" aria-label={b.titulo}>
            <h3>{b.titulo}</h3>
            <Leyenda items={[{ l: "Este programa", c: "var(--iga-c1)" }, ...(b.facultad.some((v) => v !== null) ? [{ l: `${facultad || "Facultad"} (promedio)`, c: "var(--iga-ctx-2)" }] : [])]} />
            <Lineas etiqueta={b.titulo} xs={b.periodos} fmt={(v) => formatoMedida(b.col, v)} series={[{ label: "Este programa", color: "var(--iga-c1)", vals: b.programa }, ...(b.facultad.some((v) => v !== null) ? [{ label: facultad || "Facultad", color: "var(--iga-ctx-2)", vals: b.facultad }] : [])]} />
          </section>
        ))}

        {fin && pfp.length > 0 && (
          <section className="iga-det__sec" aria-label="Estructura financiera">
            <h3>Estructura financiera, % de los ingresos</h3>
            <div className="iga-tabla__w">
              <table className="iga-det__tabla">
                <thead><tr><th />{pfp.map((p) => <th key={p} className="num">{p}</th>)}</tr></thead>
                <tbody>
                  {PASOS.map(([clave, nombre]) => (
                    <tr key={clave}>
                      <th scope="row">{nombre}</th>
                      {pfp.map((p) => {
                        const v = fin.fp[p][clave];
                        return <td key={p} className="num" data-tono={v !== null && (clave === "en" || clave === "eo") ? (v < 0 ? "malo" : "bueno") : undefined}>{v === null ? "—" : pct(v, 1)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {fin && ultEc && (
          <section className="iga-det__sec" aria-label="Cifras absolutas">
            <h3>Cifras absolutas · {ultEc}</h3>
            <Cascada s={sumar([fin], ultEc)} etiqueta={`${programa}, ${ultEc}`} />
            <Aviso>Ingresos {dinero(fin.ec[ultEc].i)}. Excedente operativo {dinero(fin.ec[ultEc].eo)}; excedente neto {dinero(fin.ec[ultEc].en)}.</Aviso>
          </section>
        )}

        {fin && peq.length > 0 && (
          <section className="iga-det__sec" aria-label="Matrícula frente al equilibrio">
            <h3>Matriculados frente al punto de equilibrio</h3>
            <Mancuerna filas={peq.map((p) => ({ k: p, etiqueta: p, sub: `${num(fin.eq[p].m)} matriculados, equilibrio ${num(fin.eq[p].e)}`, a: fin.eq[p].e, b: fin.eq[p].m }))} />
            <Aviso>Marca gris: punto de equilibrio. Punto de color: matriculados.</Aviso>
          </section>
        )}
      </div>

      {onFiltrar && (
        <footer className="iga-det__pie">
          <button type="button" className="iga-det__accion" onClick={() => { onFiltrar(programa, sede); cerrar(); }}>Filtrar el tablero por este programa</button>
        </footer>
      )}
    </dialog>
  );
}
