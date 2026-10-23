/* =============================================================================
   UDrive · «Que Pilo lo redacte» (fase 3): el panel de Pilo para un bloque de texto.

   Pilo propone y la persona decide: el texto sugerido se muestra aparte y solo
   entra al informe si la persona pulsa «Reemplazar» o «Agregar debajo». Nada se
   escribe solo. Pilo solo puede usar las cifras vivas, fuentes y figuras que el
   informe ya trae (se le pasan con su valor); si su propuesta trae una marca
   ajena, se descarta aquí aunque el servidor la haya dejado pasar.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { MODOS_PILO, pedirRedaccion, propuestaSegura, textoParaPilo } from "../../datosPilo";
import type { ContextoPilo, ModoPilo, PropuestaPilo, TipoTextoPilo } from "../../datosPilo";
import { LIMITES, bloqueNuevo } from "../../lib/documento";
import type { Bloque } from "../../lib/documento";
import { TextoVista } from "../../salida/Piezas";
import type { AccionesBloque } from "./Bloques";

type BloqueTexto = Extract<Bloque, { tipo: TipoTextoPilo }>;

interface Pedido {
  propuesta: PropuestaPilo;
  /** El texto del bloque cuando se pidió: si cambió después, no se reemplaza a ciegas. */
  deQuien: string;
}

export function PanelPilo({ bloque: b, contexto, acc }: { bloque: BloqueTexto; contexto(): ContextoPilo; acc: AccionesBloque }) {
  const [modo, setModo] = useState<ModoPilo>(textoParaPilo(b).trim() ? "mejorar" : "redactar");
  const [instruccion, setInstruccion] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const turno = useRef(0);

  const actual = textoParaPilo(b);
  const ficha = MODOS_PILO.find((m) => m.id === modo) ?? MODOS_PILO[0];
  const sinTexto = !actual.trim();
  const disponible = (m: ModoPilo) => m === "redactar" || !sinTexto;
  const puedePedir = !pensando && (modo !== "redactar" || instruccion.trim().length > 0 || !sinTexto);

  async function pedir() {
    const mio = ++turno.current;
    setPensando(true);
    setError("");
    setPedido(null);
    try {
      const ctx = contexto();
      const propuesta = await pedirRedaccion({ modo, tipo: b.tipo, texto: actual, instruccion, contexto: ctx });
      if (mio !== turno.current) return;
      const problema = propuestaSegura(propuesta, actual, ctx);
      if (problema) throw new Error(problema);
      setPedido({ propuesta, deQuien: actual });
    } catch (e) {
      if (mio === turno.current) setError(e instanceof Error ? e.message : "Pilo no pudo responder.");
    } finally {
      if (mio === turno.current) setPensando(false);
    }
  }

  function conPropuesta(p: PropuestaPilo): Bloque {
    if (b.tipo === "lista") return { ...b, items: (p.items ?? []).slice(0, LIMITES.items) };
    const texto = (p.texto ?? "").slice(0, b.tipo === "nota" ? LIMITES.nota : LIMITES.texto);
    return { ...b, texto };
  }

  const reemplazar = () => {
    if (!pedido) return;
    acc.cambiar(conPropuesta(pedido.propuesta), `pilo:${b.id}`);
    setPedido(null);
  };
  const agregarDebajo = () => {
    if (!pedido) return;
    const nuevo = bloqueNuevo(b.tipo);
    acc.insertarConContenido({ ...conPropuesta(pedido.propuesta), id: nuevo.id } as Bloque, b.id);
    setPedido(null);
  };

  const cambio = pedido ? pedido.deQuien !== actual : false;

  return (
    <section className="ud-pilo" aria-label="Pilo">
      <div className="ud-pilo-t">
        <Icon name="pen" size={16} />
        <b>Que Pilo lo redacte</b>
      </div>
      <p className="ud-sub">Pilo propone; usted decide. No cambia nada hasta que acepte.</p>
      <label className="es-fl">
        Qué hacer
        <select className="es-inp" value={modo} onChange={(e) => (setModo(e.target.value as ModoPilo), setPedido(null), setError(""))}>
          {MODOS_PILO.map((m) => <option key={m.id} value={m.id} disabled={!disponible(m.id)}>{m.texto}</option>)}
        </select>
      </label>
      <p className="es-note">{ficha.ayuda}</p>
      {modo === "redactar" || ficha.pideInstruccion || !sinTexto ? (
        <label className="es-fl">
          {modo === "redactar" ? "Qué debe decir" : "Indicación (opcional)"}
          <textarea
            className="es-inp"
            rows={3}
            maxLength={600}
            value={instruccion}
            placeholder={modo === "redactar" ? "Ej.: Explicar por qué se priorizó la sede de Cúcuta, con la cifra de estudiantes." : "Ej.: Que suene menos técnico."}
            onChange={(e) => setInstruccion(e.target.value)}
          />
        </label>
      ) : null}
      <button type="button" className="es-btn es-btn--pri" disabled={!puedePedir} onClick={() => void pedir()}>
        {pensando ? "Pilo está escribiendo…" : "Pedir a Pilo"}
      </button>
      {error ? <p className="ud-aviso" data-t="error" role="alert">{error}</p> : null}

      {pedido ? (
        <div className="ud-pilo-prop" role="region" aria-label="Propuesta de Pilo" aria-live="polite">
          <div className="ud-pilo-prop-t">Propuesta de Pilo</div>
          {pedido.propuesta.items ? (
            <ul>{pedido.propuesta.items.map((i, n) => <li key={n}><TextoVista texto={i} /></li>)}</ul>
          ) : (
            <p><TextoVista texto={pedido.propuesta.texto ?? ""} /></p>
          )}
          {pedido.propuesta.avisos.map((a) => <p key={a} className="es-note">{a}</p>)}
          {cambio ? <p className="ud-aviso" data-t="aviso">El bloque cambió desde que pidió esto: puede agregar la propuesta debajo, pero no reemplazarlo.</p> : null}
          <p className="es-note">Revise los hechos y las cifras antes de aceptar: Pilo no ve más que lo que hay en este informe.</p>
          <div className="ud-pilo-acc">
            <button type="button" className="es-btn es-btn--pri es-btn--sm" disabled={cambio} onClick={reemplazar}>Reemplazar</button>
            <button type="button" className="es-btn es-btn--sm" onClick={agregarDebajo}>Agregar debajo</button>
            <button type="button" className="es-btn es-btn--ghost es-btn--sm" onClick={() => setPedido(null)}>Descartar</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
