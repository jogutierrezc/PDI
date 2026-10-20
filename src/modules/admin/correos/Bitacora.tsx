/* =============================================================================
   Correos · Bitácora.

   Cada correo que salió o se rechazó: cuál plantilla, a quién (enmascarado),
   cuándo y qué dijo el servidor. El contenido y el enlace personal no se
   guardan en ninguna parte, así que aquí tampoco se ven. La leen Planeación y
   la administración; solo la escribe la función del servidor.

   Los filtros trabajan sobre los 200 envíos más recientes. El resumen de arriba
   cuenta las últimas 24 horas completas, aunque sean más de 200.
   ========================================================================== */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { MARCAS, PLANTILLA_CODIGO, PLANTILLA_PILO_CODIGO, PLANTILLAS, ROL_NOMBRE, esRol } from "./servidor-logica";
import { claves, leerBitacora, leerResumen, type Envio } from "./datos";
import { Cargando, FaltaMigracion, Fallo } from "./partes";

const HORA = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
const DIA = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const COMPLETA = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "medium" });

/** «Hoy, 9:42», «Ayer, 17:20» o «3 oct, 10:58». */
export function cuandoFue(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  return `${dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : DIA.format(d)}, ${HORA.format(d)}`;
}

const TODAS = [...PLANTILLAS, PLANTILLA_CODIGO, PLANTILLA_PILO_CODIGO];

/** El nombre que se ve en la bitácora. Una plantilla propia no tiene nombre aquí (Planeación no la lee): se ve su clave. */
function nombreDe(e: Envio): string {
  const nombre = TODAS.find((p) => p.clave === e.plantilla)?.nombre ?? e.plantilla;
  return [nombre, esRol(e.rol) ? ROL_NOMBRE[e.rol].toLowerCase() : "", e.tipo === "prueba" ? "prueba" : ""].filter(Boolean).join(" · ");
}

const TIPO = { cuenta: "Cuenta", codigo: "Código", aviso: "Aviso", prueba: "Prueba" } as const;

const RESULTADO = {
  aceptado: { tono: "ok", icono: "check", texto: "Aceptado" },
  rechazado: { tono: "mal", icono: "close", texto: "Rechazado" },
  en_espera: { tono: "aviso", icono: "clock", texto: "En espera" },
} as const;

const FILTROS_TIPO = [
  ["", "Todos"],
  ["cuenta", "Cuenta"],
  ["codigo", "Código"],
  ["aviso", "Aviso"],
  ["prueba", "Prueba"],
] as const;
const FILTROS_RESULTADO = [
  ["", "Todos"],
  ["aceptado", "Aceptado"],
  ["rechazado", "Rechazado"],
  ["en_espera", "En espera"],
] as const;
const FILTROS_IDENTIDAD = [
  ["", "Ambas"],
  ["plan", "Planeación"],
  ["pilo", "Mr. Pilo"],
] as const;

export function Bitacora() {
  const consulta = useQuery({ queryKey: claves.bitacora, queryFn: leerBitacora });
  const resumen = useQuery({ queryKey: claves.resumen, queryFn: leerResumen, staleTime: 30_000 });
  const [tipo, setTipo] = useState("");
  const [resultado, setResultado] = useState("");
  const [identidad, setIdentidad] = useState("");
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);

  const envios = consulta.data && !consulta.data.falta ? consulta.data.datos : [];
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return envios.filter(
      (e) =>
        (!tipo || e.tipo === tipo) &&
        (!resultado || e.resultado === resultado) &&
        (!identidad || e.identidad === identidad) &&
        (!q || `${e.plantilla} ${nombreDe(e)} ${e.motivo}`.toLowerCase().includes(q)),
    );
  }, [envios, tipo, resultado, identidad, buscar]);

  const recargar = () => {
    void consulta.refetch();
    void resumen.refetch();
  };

  return (
    <div className="cor-bitacora">
      <div className="cor-bitacora__cabeza">
        <p>Cada correo que sale queda anotado: cuál plantilla, a quién, cuándo y si el servidor lo aceptó. El contenido no se guarda, y el enlace personal tampoco.</p>
        <button type="button" className="button-secondary" disabled={consulta.isFetching} onClick={recargar}>
          {consulta.isFetching ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {consulta.isPending ? (
        <Cargando que="Leyendo la bitácora…" />
      ) : consulta.isError ? (
        <Fallo error={consulta.error} onRetry={recargar} />
      ) : consulta.data.falta ? (
        <FaltaMigracion>Sin ella no hay bitácora que mostrar.</FaltaMigracion>
      ) : envios.length === 0 ? (
        <p className="admin-empty">Todavía no ha salido ningún correo por este módulo. Cuando el servidor de cuentas empiece a pasarle los pedidos, cada envío aparecerá aquí.</p>
      ) : (
        <>
          {resumen.data && (
            <p className="cor-resumen">
              En las últimas 24 horas: <b>{resumen.data.aceptado} aceptados</b>, <b>{resumen.data.rechazado} rechazados</b> y <b>{resumen.data.en_espera} en espera</b>.
            </p>
          )}

          <div className="cor-filtros" role="group" aria-label="Filtrar la bitácora">
            <label className="cor-filtro">
              <span>Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {FILTROS_TIPO.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="cor-filtro">
              <span>Resultado</span>
              <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                {FILTROS_RESULTADO.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="cor-filtro">
              <span>Identidad</span>
              <select value={identidad} onChange={(e) => setIdentidad(e.target.value)}>
                {FILTROS_IDENTIDAD.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="cor-filtro cor-filtro--ancho">
              <span>Buscar</span>
              <input type="search" value={buscar} placeholder="plantilla o motivo" autoComplete="off" onChange={(e) => setBuscar(e.target.value)} />
            </label>
          </div>

          {filas.length === 0 ? (
            <p className="admin-empty">Ningún envío coincide con esos filtros.</p>
          ) : (
            <div className="cor-tabla" tabIndex={0} role="region" aria-label="Envíos">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Cuándo</th>
                    <th scope="col">Plantilla</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Destinatario</th>
                    <th scope="col">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((e) => {
                    const r = RESULTADO[e.resultado];
                    const expandida = abierto === e.id;
                    return (
                      <Fragment key={e.id}>
                        <tr>
                          <td>
                            <time dateTime={e.cuando} title={COMPLETA.format(new Date(e.cuando))}>
                              {cuandoFue(e.cuando)}
                            </time>
                          </td>
                          <td>
                            <b>{nombreDe(e)}</b>
                            <small className="cor-tabla__sub">{MARCAS[e.identidad].nombre}</small>
                          </td>
                          <td>{TIPO[e.tipo]}</td>
                          <td className="cor-tabla__para">{e.para}</td>
                          <td>
                            <span className="cor-resultado" data-tono={r.tono}>
                              <Icon name={r.icono} size={14} />
                              {r.texto}
                            </span>
                            <button type="button" className="cor-tabla__detalle" aria-expanded={expandida} aria-controls={`cor-det-${e.id}`} onClick={() => setAbierto(expandida ? null : e.id)}>
                              {expandida ? "Ocultar" : "Detalle"}
                            </button>
                          </td>
                        </tr>
                        {expandida && (
                          <tr id={`cor-det-${e.id}`} className="cor-tabla__fila-detalle">
                            <td colSpan={5}>
                              <dl>
                                <div>
                                  <dt>Motivo</dt>
                                  <dd>{e.motivo || (e.resultado === "aceptado" ? "Aceptado por el servidor de correo." : "El servidor no dio un motivo.")}</dd>
                                </div>
                                <div>
                                  <dt>Número de pedido</dt>
                                  <dd className="cor-tabla__codigo">{e.pedido || "Sin número de pedido"}</dd>
                                </div>
                              </dl>
                              <p className="cor-chica">El contenido y el enlace no se guardan.</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {envios.length >= 200 && <p className="cor-chica">Se muestran los 200 envíos más recientes.</p>}
        </>
      )}
    </div>
  );
}
