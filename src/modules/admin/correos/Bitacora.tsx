/* =============================================================================
   Correos · Bitácora.

   Cada correo que salió o se rechazó: cuál plantilla, a quién (enmascarado),
   cuándo y qué dijo el servidor. El contenido y el enlace personal no se
   guardan en ninguna parte, así que aquí tampoco se ven. La leen Planeación y
   la administración; solo la escribe la función del servidor.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { MARCAS, PLANTILLA_CODIGO, plantillaOriginal, ROL_NOMBRE, esRol } from "./servidor-logica";
import { claves, leerBitacora, type Envio } from "./datos";
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

function nombreDe(e: Envio): string {
  const nombre = e.plantilla === PLANTILLA_CODIGO.clave ? PLANTILLA_CODIGO.nombre : (plantillaOriginal(e.plantilla)?.nombre ?? e.plantilla);
  return [nombre, esRol(e.rol) ? ROL_NOMBRE[e.rol].toLowerCase() : "", e.tipo === "prueba" ? "prueba" : ""].filter(Boolean).join(" · ");
}

const RESULTADO = {
  aceptado: { tono: "ok", icono: "check", texto: "Aceptado por el servidor" },
  rechazado: { tono: "mal", icono: "close", texto: "Rechazado" },
  en_espera: { tono: "aviso", icono: "clock", texto: "En espera" },
} as const;

export function Bitacora() {
  const consulta = useQuery({ queryKey: claves.bitacora, queryFn: leerBitacora });

  return (
    <div className="cor-bitacora">
      <div className="cor-bitacora__cabeza">
        <p>Cada correo que sale queda anotado: cuál plantilla, a quién, cuándo y si el servidor lo aceptó. El contenido no se guarda, y el enlace personal tampoco.</p>
        <button type="button" className="button-secondary" disabled={consulta.isFetching} onClick={() => void consulta.refetch()}>
          {consulta.isFetching ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {consulta.isPending ? (
        <Cargando que="Leyendo la bitácora…" />
      ) : consulta.isError ? (
        <Fallo error={consulta.error} onRetry={() => void consulta.refetch()} />
      ) : consulta.data.falta ? (
        <FaltaMigracion>Sin ella no hay bitácora que mostrar.</FaltaMigracion>
      ) : consulta.data.datos.length === 0 ? (
        <p className="admin-empty">Todavía no ha salido ningún correo por este módulo. Cuando el servidor de cuentas empiece a pasarle los pedidos, cada envío aparecerá aquí.</p>
      ) : (
        <>
          <div className="cor-tabla" tabIndex={0} role="region" aria-label="Envíos">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Identidad</th>
                  <th scope="col">Plantilla</th>
                  <th scope="col">Para</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.datos.map((e) => {
                  const r = RESULTADO[e.resultado];
                  const detalle = e.resultado === "aceptado" ? r.texto : e.motivo ? (/^(rechazado|en espera)/i.test(e.motivo) ? e.motivo : `${r.texto}: ${e.motivo}`) : r.texto;
                  return (
                    <tr key={e.id}>
                      <td>
                        <time dateTime={e.cuando} title={COMPLETA.format(new Date(e.cuando))}>
                          {cuandoFue(e.cuando)}
                        </time>
                      </td>
                      <td>{MARCAS[e.identidad].nombre}</td>
                      <td>{nombreDe(e)}</td>
                      <td className="cor-tabla__para">{e.para}</td>
                      <td>
                        <span className="cor-resultado" data-tono={r.tono}>
                          <Icon name={r.icono} size={14} />
                          {detalle}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {consulta.data.datos.length >= 200 && <p className="cor-chica">Se muestran los 200 envíos más recientes.</p>}
        </>
      )}
    </div>
  );
}
