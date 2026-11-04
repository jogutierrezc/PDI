/* =============================================================================
   Relaciones · formulario de un contacto (académico o empleador). Los campos son
   los de las plantillas de Rua y se validan con la misma función que usa el
   enlace público (validarFila). Guarda en la fila de int_filas: es la misma que
   se ve en Tablas. Al editar, el campus y el periodo no cambian (los fija la fila).
   ========================================================================== */

import { useMemo, useState } from "react";
import { Ventana } from "../../../components/espacio/Ventana";
import { PLANTILLAS, SECTORES, validarFila } from "../../../../supabase/functions/int-contactos/contactos";
import { PAISES } from "../../../../supabase/functions/int-contactos/paises";
import { useEstructura, useNombres } from "../datos";
import { fechaCorta } from "../ui/logica";
import { nombreCampus } from "../ui/comunes";
import type { Ctx } from "../ui/comunes";
import { ESTADO_CORREO, useBitacoraContacto, useCambiarBaja, useGuardarContacto } from "./datos";
import type { ContactoRel } from "./datos";

const ROTULO: Record<string, string> = {
  propio_source: "Fuente",
  propio_title: "Tratamiento",
  propio_first_name: "Nombres",
  propio_last_name: "Apellidos",
  propio_job_title: "Cargo",
  propio_position: "Cargo",
  propio_department: "Facultad o departamento",
  propio_institution: "Institución",
  propio_industry: "Sector",
  propio_company_name: "Empresa",
  propio_country: "País",
  propio_email: "Correo",
  propio_subject: "Área de conocimiento",
  propio_phone: "Teléfono",
};

export function FormularioContacto({ ctx, tipo, contacto, contactos, onCerrar }: { ctx: Ctx; tipo: "academico" | "empleador"; contacto: ContactoRel | null; contactos: ContactoRel[]; onCerrar: (mensaje?: string) => void }) {
  const plantilla = tipo === "academico" ? PLANTILLAS.academica : PLANTILLAS.empleadores;
  const estructura = useEstructura();
  const guardar = useGuardarContacto();
  const baja = useCambiarBaja();
  const bitacora = useBitacoraContacto(contacto?.id);
  const quien = useNombres((bitacora.data ?? []).map((d) => d.rel_envios?.created_by ?? null));

  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(plantilla.columnas.map((c) => [c.clave, contacto?.datos[c.clave] ?? ""])));
  const [campus, setCampus] = useState(contacto?.campus_id ?? ctx.visibles[0]?.id ?? "");
  const [dadoDeBaja, setDadoDeBaja] = useState(contacto?.baja ?? false);
  const [errores, setErrores] = useState<string[]>([]);

  const hoja = contacto?.hoja_id ?? (estructura.data ?? []).find((l) => l.plantilla_contactos === plantilla.codigo)?.hojas[0]?.id;
  const periodo = contacto?.periodo_id ?? ctx.periodo?.id;
  const correo = (valores.propio_email ?? "").trim().toLowerCase();
  const repetido = useMemo(() => Boolean(correo) && contactos.some((c) => c.correo === correo && c.id !== contacto?.id), [correo, contactos, contacto?.id]);

  const enviar = () => {
    const v = validarFila(plantilla, Object.fromEntries(plantilla.columnas.map((c) => [c.encabezado, valores[c.clave] ?? ""])));
    const faltas = [...v.errores];
    if (!campus) faltas.push("Elija el campus.");
    if (!hoja || !periodo) faltas.push(!periodo ? "No hay un periodo elegido: escójalo arriba en la barra." : "Falta preparar la carpeta Contactos.");
    setErrores(faltas);
    if (faltas.length || !hoja || !periodo) return;
    guardar.mutate(
      { id: contacto?.id, hoja, periodo, campus, datos: v.datos, reiniciarCorreo: !contacto || v.datos.propio_email !== contacto.datos.propio_email },
      {
        onSuccess: () => {
          if (contacto && dadoDeBaja !== contacto.baja) baja.mutate({ id: contacto.id, baja: dadoDeBaja });
          onCerrar(contacto ? "Contacto actualizado." : "Contacto creado. Su correo queda sin validar.");
        },
        onError: (e) => setErrores([e.message]),
      },
    );
  };

  const campo = (clave: string, encabezado: string, obligatoria: boolean) => {
    const id = `rel-f-${clave}`;
    const v = valores[clave] ?? "";
    const poner = (x: string) => setValores((a) => ({ ...a, [clave]: x }));
    let control;
    if (clave === "propio_country") {
      control = (
        <select id={id} value={v} onChange={(e) => poner(e.target.value)}>
          <option value="">Sin país</option>
          {PAISES.map(([iso, nombre]) => (
            <option key={iso} value={nombre}>
              {nombre} ({iso})
            </option>
          ))}
          {v && !PAISES.some(([, n]) => n === v) ? <option value={v}>{v}</option> : null}
        </select>
      );
    } else if (clave === "propio_industry") {
      control = (
        <select id={id} value={v} onChange={(e) => poner(e.target.value)}>
          <option value="">Sin sector</option>
          {SECTORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {v && !SECTORES.includes(v) ? <option value={v}>{v}</option> : null}
        </select>
      );
    } else {
      control = <input id={id} type={clave === "propio_email" ? "email" : "text"} value={v} maxLength={200} onChange={(e) => poner(e.target.value)} autoComplete="off" />;
    }
    return (
      <label key={clave} className={`it-campo${clave === "propio_email" || clave === "propio_institution" || clave === "propio_company_name" ? " rel-ancho" : ""}`} htmlFor={id}>
        <span>
          {ROTULO[clave] ?? encabezado}
          {obligatoria ? " *" : ""}
        </span>
        {control}
      </label>
    );
  };

  const estado = contacto ? ESTADO_CORREO[contacto.correo_estado] : null;

  return (
    <Ventana
      titulo={`${contacto ? "Editar" : "Nuevo"} contacto ${tipo === "academico" ? "académico" : "de empleador"}`}
      onCerrar={() => onCerrar()}
      pie={
        <>
          <button type="button" className="es-btn" onClick={() => onCerrar()}>
            Cancelar
          </button>
          <button type="button" className="es-btn es-btn--pri" disabled={guardar.isPending} onClick={enviar}>
            {guardar.isPending ? "Guardando…" : contacto ? "Guardar cambios" : "Crear contacto"}
          </button>
        </>
      }
    >
      <div className="rel-form">
        <div className="rel-form__campos">
          {plantilla.columnas.map((c) => campo(c.clave, c.encabezado, c.obligatoria))}
          <label className="it-campo" htmlFor="rel-f-campus">
            <span>Campus *</span>
            <select id="rel-f-campus" value={campus} disabled={Boolean(contacto)} onChange={(e) => setCampus(e.target.value)}>
              {ctx.visibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {repetido ? <p className="rel-nota rel-nota--aviso">Ya hay otro contacto con este correo. Se guardará, y quedará marcado como repetido para que lo fusione a mano.</p> : null}
        {contacto ? (
          <div className="rel-form__estado">
            <span className={`rel-pill rel-pill--${estado?.clase}`}>{estado?.texto}</span>
            <span className="rel-sub">
              {contacto.correo_fecha ? `Validado el ${fechaCorta(contacto.correo_fecha.slice(0, 10))}` : "Sin validar"} · {nombreCampus(ctx.campus, contacto.campus_id)}
            </span>
            <label className="rel-check">
              <input type="checkbox" checked={dadoDeBaja} onChange={(e) => setDadoDeBaja(e.target.checked)} />
              No enviarle más correos (baja){contacto.baja_fecha ? ` desde el ${fechaCorta(contacto.baja_fecha.slice(0, 10))}` : ""}
            </label>
          </div>
        ) : null}
        {errores.length ? (
          <ul className="it-error" role="alert">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {contacto ? (
          <div className="rel-hist">
            <h3>Correos enviados a esta persona</h3>
            {!bitacora.data?.length ? (
              <p className="rel-sub">Todavía no se le ha enviado nada desde Relaciones.</p>
            ) : (
              <ul>
                {bitacora.data.map((d) => (
                  <li key={d.id}>
                    <span>
                      <b>{d.rel_envios?.plantilla_nombre ?? "Plantilla"}</b>
                      <small>
                        {d.rel_envios?.destino === "mailpit" ? "Mailpit (prueba)" : "SMTP institucional"} · lo envió {quien.data?.[d.rel_envios?.created_by ?? ""] ?? "alguien del equipo"}
                        {d.motivo ? ` · ${d.motivo}` : ""}
                      </small>
                    </span>
                    <span className={`rel-pill rel-pill--${d.estado === "enviado" ? "ok" : d.estado === "fallo" ? "bad" : "idle"}`}>
                      {d.estado === "enviado" ? `Enviado ${fechaCorta((d.enviado_en ?? d.created_at).slice(0, 10))}` : d.estado === "fallo" ? "Falló" : "Pendiente"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Ventana>
  );
}
