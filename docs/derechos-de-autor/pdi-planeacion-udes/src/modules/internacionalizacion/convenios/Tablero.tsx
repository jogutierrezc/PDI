/* =============================================================================
   Convenios · Tablero: cinco cifras que llevan al registro, el aviso de estados
   desactualizados, el mapa por país, los vencimientos por trimestre y el panel
   del país elegido. El único movimiento es la entrada de la primera visita
   (cifras, barras y países); todo lo demás es instantáneo.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../ui/movimiento";
import { MapaConvenios } from "./MapaConvenios";
import { contar, diasFaltantes, porPais, trimestres, vigenciaDe } from "./logica";
import type { Convenio, FiltroEstado } from "./logica";
import { ALERTA_DIAS } from "./logica";
import { Pildora } from "./comunes";

export function Tablero({
  convenios,
  hoy,
  animar,
  onAnimado,
  onRegistro,
  onAbrir,
}: {
  convenios: Convenio[];
  hoy: string;
  animar: boolean;
  onAnimado: () => void;
  onRegistro: (f: { estado?: FiltroEstado; pais?: string }) => void;
  onAbrir: (id: string) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [cod, setCod] = useState<string | null>(null);
  const c = useMemo(() => contar(convenios, hoy), [convenios, hoy]);
  const grupos = useMemo(() => porPais(convenios, hoy), [convenios, hoy]);
  const trim = useMemo(() => trimestres(convenios, hoy), [convenios, hoy]);
  const sinMapa = useMemo(() => convenios.filter((x) => !x.pais_cod).length, [convenios]);
  const maximo = Math.max(1, ...trim.map((t) => t.n));
  const top = useMemo(() => [...grupos.values()].sort((a, b) => b.n - a.n).slice(0, 8), [grupos]);
  const elegido = cod ? grupos.get(cod) : undefined;

  useLayoutEffect(() => {
    const nodo = raiz.current;
    if (!nodo || !animar || !convenios.length) return;
    onAnimado();
    const ctx = gsap.context(() => {
      if (movimientoReducido()) {
        gsap.fromTo(nodo.querySelectorAll(".conv-cifra, .conv-pa.is-on, .conv-trim-barra"), { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "power2.out", clearProps: "opacity" });
        return;
      }
      gsap.from(nodo.querySelectorAll(".conv-cifra-fig"), { textContent: 0, duration: 0.3, ease: "expo.out", snap: { textContent: 1 }, stagger: 0.04 });
      gsap.from(nodo.querySelectorAll(".conv-pa.is-on"), { opacity: 0, duration: 0.3, ease: "expo.out", stagger: { amount: 0.24, from: "random" }, clearProps: "opacity" });
      gsap.from(nodo.querySelectorAll(".conv-trim-barra"), { scaleY: 0.04, transformOrigin: "50% 100%", duration: 0.3, ease: "expo.out", stagger: 0.03, clearProps: "transform" });
    }, nodo);
    return () => ctx.revert();
    // Solo la primera visita con datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convenios.length > 0]);

  const cifras: { clave: FiltroEstado; titulo: string; n: number; tono: string; nota: string }[] = [
    { clave: "Vigente", titulo: "Vigentes", n: c.vigentes, tono: "ok", nota: `${c.indefinidos} son indefinidos` },
    { clave: "Por vencer", titulo: "Por vencer", n: c.porVencer, tono: "warn", nota: `en los próximos ${ALERTA_DIAS} días` },
    { clave: "Vencido", titulo: "Vencidos", n: c.vencidos, tono: "bad", nota: "sin renovación registrada" },
    { clave: "tramite", titulo: "En trámite", n: c.tramite, tono: "", nota: `${c.pendienteFirma} esperan firma` },
    { clave: "Sin fecha", titulo: "Sin fecha de término", n: c.sinFecha, tono: "warn", nota: "hay que completarlas" },
  ];

  return (
    <div ref={raiz} className="conv-tablero">
      <section className="conv-panel conv-cifras" aria-label="Estado de los convenios">
        {cifras.map((x) => (
          <button key={x.clave} type="button" className="conv-cifra" onClick={() => onRegistro({ estado: x.clave })}>
            <span className={`conv-cifra-fig${x.tono ? ` is-${x.tono}` : ""}`}>{x.n}</span>
            <span className="conv-cifra-et">{x.titulo}</span>
            <span className="conv-cifra-nota">{x.nota}</span>
          </button>
        ))}
      </section>

      {c.desajustados ? (
        <div className="conv-aviso" role="status">
          <div>
            <b>{c.desajustados} convenios tienen un estado que ya no coincide con sus fechas.</b> En el Excel decían «Vigente», «Vencido» o «Por vencer», pero la fecha de terminación dice otra cosa. Aquí la vigencia se calcula sola con las fechas.
          </div>
          <button type="button" className="conv-btn" onClick={() => onRegistro({ estado: "desajuste" })}>
            Revisarlos
          </button>
        </div>
      ) : null}

      <div className="conv-grid">
        <section className="conv-panel conv-bloque">
          <MapaConvenios grupos={grupos} seleccion={cod} onSeleccion={setCod} variosPaises={sinMapa} />
        </section>

        <div className="conv-lado">
          <section className="conv-panel conv-bloque">
            <h2>Vencimientos por trimestre</h2>
            <p className="conv-sub">Convenios firmados que terminan en cada periodo. Los indefinidos no aparecen.</p>
            <div className="conv-trim" role="img" aria-label={`Vencimientos por trimestre: ${trim.map((t) => `${t.rotulo}, ${t.n}`).join("; ")}`}>
              {trim.map((t) => (
                <div key={t.rotulo} className="conv-trim-col">
                  <span className="conv-trim-v">{t.n}</span>
                  <div className={`conv-trim-barra${t.actual ? " is-hoy" : ""}`} style={{ height: `${Math.max((t.n / maximo) * 100, 2)}%` }} />
                </div>
              ))}
            </div>
            <div className="conv-trim-ejes" aria-hidden="true">
              {trim.map((t) => (
                <span key={t.rotulo}>{t.rotulo}</span>
              ))}
            </div>
          </section>

          <section className="conv-panel conv-bloque" aria-live="polite">
            {elegido ? (
              <>
                <div className="conv-fila-cab">
                  <div>
                    <h2>{elegido.nombre}</h2>
                    <p className="conv-sub">
                      {elegido.n} convenios · {elegido.vigentes} vigentes
                    </p>
                  </div>
                  <button type="button" className="conv-btn conv-btn--sm" onClick={() => setCod(null)}>
                    Quitar
                  </button>
                </div>
                <ul className="conv-lista">
                  {[...elegido.lista]
                    .sort((a, b) => (diasFaltantes(a, hoy) ?? 9e9) - (diasFaltantes(b, hoy) ?? 9e9))
                    .slice(0, 6)
                    .map((r) => (
                      <li key={r.id}>
                        <button type="button" className="conv-lista-btn" onClick={() => onAbrir(r.id)}>
                          <span className="conv-corto">{r.institucion}</span>
                          <Pildora vigencia={vigenciaDe(r, hoy)} />
                        </button>
                      </li>
                    ))}
                </ul>
                <button type="button" className="conv-btn" onClick={() => onRegistro({ pais: elegido.nombre })}>
                  Ver los {elegido.n} en el registro
                </button>
              </>
            ) : (
              <>
                <h2>Países con más convenios</h2>
                <p className="conv-sub">Elija uno aquí o en el mapa.</p>
                <ul className="conv-lista">
                  {top.map((g) => (
                    <li key={g.cod}>
                      <button type="button" className="conv-lista-btn" onClick={() => setCod(g.cod)}>
                        <span>{g.nombre}</span>
                        <b className="conv-num">{g.n}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
