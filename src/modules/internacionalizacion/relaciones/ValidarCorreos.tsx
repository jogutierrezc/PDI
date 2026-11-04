/* =============================================================================
   Relaciones · validar correos. Cuatro niveles (formato, dominio, buzón y prueba a
   Mailpit) que hace la función rel-correos; aquí se piden de a 25 y se pintan al
   llegar. Es el único momento animado del módulo: cada comprobación se resuelve
   nivel por nivel, de borrosa a nítida (transform, opacity y filter, 300 ms
   expo.out). Con movimiento reducido, solo aparece.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import { movimientoReducido } from "../ui/movimiento";
import { REL, validarCorreos } from "./datos";
import type { ContactoRel, Nivel, PlantillaRel, ResultadoValidacion } from "./datos";

const CELDA: Record<Nivel, { texto: string; clase: string }> = {
  ok: { texto: "Pasa", clase: "ok" },
  bad: { texto: "Falla", clase: "bad" },
  nv: { texto: "No verificable", clase: "warn" },
  na: { texto: "—", clase: "idle" },
};
const FINAL: Record<ResultadoValidacion["estado"], { texto: string; clase: string }> = {
  ok: { texto: "Verificado", clase: "ok" },
  nv: { texto: "Enviar con aviso", clase: "warn" },
  dom: { texto: "Dominio sin servidor", clase: "warn" },
  bad: { texto: "Rechazado", clase: "bad" },
};
const REMITENTE = "Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>";
const TANDA = 25;

export function ValidarCorreos({ contactos, elegidos, plantillas, plantillaId }: { contactos: ContactoRel[]; elegidos: ContactoRel[]; plantillas: PlantillaRel[]; plantillaId: string | null }) {
  const cliente = useQueryClient();
  const [cola, setCola] = useState<ContactoRel[]>([]);
  const [resultados, setResultados] = useState<Record<string, ResultadoValidacion>>({});
  const [corriendo, setCorriendo] = useState(false);
  const [info, setInfo] = useState("Nada validado en esta sesión.");
  const [conMailpit, setConMailpit] = useState(plantillaId ?? "");
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const animados = useRef(new Set<string>());
  const cancelado = useRef(false);

  useEffect(() => () => void (cancelado.current = true), []);

  // El momento animado: las celdas de cada fila recién resuelta.
  useEffect(() => {
    const nuevos = Object.keys(resultados).filter((id) => !animados.current.has(id));
    if (!nuevos.length || !cuerpo.current) return;
    nuevos.forEach((id) => animados.current.add(id));
    const celdas = nuevos.flatMap((id) => Array.from(cuerpo.current?.querySelectorAll<HTMLElement>(`tr[data-id="${id}"] .rel-pill`) ?? []));
    if (movimientoReducido()) gsap.fromTo(celdas, { opacity: 0 }, { opacity: 1, duration: 0.12, clearProps: "opacity" });
    else gsap.from(celdas, { opacity: 0, y: 3, filter: "blur(3px)", duration: 0.3, stagger: 0.05, ease: "expo.out", clearProps: "opacity,transform,filter" });
  }, [resultados]);

  const validar = async (lista: ContactoRel[]) => {
    if (!lista.length) return setInfo("No hay contactos para validar.");
    cancelado.current = false;
    animados.current.clear();
    setCola(lista);
    setResultados({});
    setCorriendo(true);
    const plantilla = plantillas.find((p) => p.id === conMailpit) ?? null;
    let hechos = 0;
    try {
      for (let i = 0; i < lista.length; i += TANDA) {
        const ids = lista.slice(i, i + TANDA).map((c) => c.id);
        setInfo(`Comprobando ${Math.min(i + TANDA, lista.length)} de ${lista.length}…`);
        const r = await validarCorreos(ids, plantilla, REMITENTE);
        if (cancelado.current) return;
        hechos += r.resultados.length;
        setResultados((a) => ({ ...a, ...Object.fromEntries(r.resultados.map((x) => [x.id, x])) }));
        if (plantilla && r.mailpit === false) setInfo("Mailpit no está configurado en la función (REL_MAILPIT_HOST): el nivel 4 se omitió.");
      }
      setInfo(`${hechos} de ${lista.length} comprobados en esta sesión.`);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : "No se pudo validar.");
    } finally {
      setCorriendo(false);
      void cliente.invalidateQueries({ queryKey: REL.directorio });
    }
  };

  const pendientes = contactos.filter((c) => c.correo_estado === "pend" && !c.baja);

  return (
    <div className="rel-val">
      <div>
        <div className="rel-bar">
          <button type="button" className="es-btn es-btn--pri" disabled={corriendo || !elegidos.length} onClick={() => void validar(elegidos)}>
            Validar selección ({elegidos.length})
          </button>
          <button type="button" className="es-btn" disabled={corriendo || !pendientes.length} onClick={() => void validar(pendientes)}>
            Validar todos los pendientes ({pendientes.length})
          </button>
          <label className="rel-inline">
            <span>Prueba a Mailpit</span>
            <select value={conMailpit} onChange={(e) => setConMailpit(e.target.value)} aria-label="Plantilla para la prueba a Mailpit">
              <option value="">Sin prueba</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <span className="rel-grow" />
          <span className="rel-aviso" role="status" aria-live="polite">
            {info}
          </span>
        </div>
        <div className="rel-nota-caja">
          <b>Qué puede y qué no puede decir Mailpit.</b> Mailpit recibe cualquier correo que le enviemos, exista o no el buzón. Sirve para comprobar que el mensaje se arma y sale bien. Que el buzón exista se averigua con los niveles 1 a 3.
        </div>
        <div className="rel-tabla rel-tabla--val">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>1 Formato</th>
                <th>2 Dominio</th>
                <th>3 Buzón</th>
                <th>4 Mailpit</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {cola.map((c) => {
                const r = resultados[c.id];
                const celda = (k: "f" | "d" | "b" | "m") => {
                  const z = r ? CELDA[r[k]] : { texto: "…", clase: "idle" };
                  return (
                    <td>
                      <span className={`rel-pill rel-pill--${z.clase}`}>{z.texto}</span>
                    </td>
                  );
                };
                const fin = r ? FINAL[r.estado] : { texto: "Comprobando…", clase: "idle" };
                return (
                  <tr key={c.id} data-id={c.id}>
                    <td className="rel-mono">{c.correo || "(sin correo)"}</td>
                    {celda("f")}
                    {celda("d")}
                    {celda("b")}
                    {celda("m")}
                    <td>
                      <span className={`rel-pill rel-pill--${fin.clase}`} title={r?.nota || undefined}>
                        {fin.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!cola.length ? (
            <div className="rel-vacio">
              <b>Nada en la cola.</b>
              <p>Seleccione contactos en el Directorio y pulse «Validar selección».</p>
            </div>
          ) : null}
        </div>
      </div>
      <aside className="rel-resumen">
        <h3>Niveles de validación</h3>
        <ol className="rel-niveles">
          <li>
            <b>Formato</b>
            <span>Sintaxis y errores comunes (espacios, «.con», dos arrobas).</span>
          </li>
          <li>
            <b>Dominio</b>
            <span>El dominio existe y tiene servidor de correo (registro MX).</span>
          </li>
          <li>
            <b>Buzón</b>
            <span>Pregunta al servidor si acepta ese destinatario, sin enviar nada. Muchos servidores, entre ellos Microsoft 365, no responden: queda «No verificable».</span>
          </li>
          <li>
            <b>Mailpit</b>
            <span>Envía un mensaje de prueba a Mailpit con la plantilla elegida y confirma que se arma y sale bien.</span>
          </li>
        </ol>
        <p className="rel-nota">Un correo sale como «Verificado» solo cuando pasa 1, 2 y 3. Si el buzón es «No verificable», se envía con una advertencia y se corrige con los rebotes.</p>
      </aside>
    </div>
  );
}
