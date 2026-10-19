/* =============================================================================
   Contactos · público · un contacto a la vez.

   El formulario sale de la plantilla de Rua (mismas columnas, mismo orden); la
   etiqueta en español lleva entre paréntesis la cabecera original para que quien
   también use el archivo reconozca cada campo. Se valida aquí al instante y la
   función lo vuelve a validar al recibirlo.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAISES } from "../../../../../supabase/functions/int-contactos/paises";
import { plantillaDeTipo, resolverPais, SECTORES, validarFila } from "../../../../../supabase/functions/int-contactos/contactos";
import type { FilaCruda, TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { enviar, misContactos, sesionVencida } from "../api";
import type { Sesion } from "../api";

const ETIQUETA: Record<string, string> = {
  Source: "¿De dónde sale?",
  Title: "Tratamiento",
  "First Name": "Nombres",
  "Last Name": "Apellidos",
  "Job Title": "Cargo",
  Position: "Cargo",
  Department: "Departamento o facultad",
  Institution: "Institución",
  Industry: "Sector",
  "Company Name": "Empresa",
  "Country or Territory": "País",
  Email: "Correo",
  Subject: "Área de conocimiento",
  "Phone (Optional)": "Teléfono (opcional)",
};

const TRATAMIENTOS = ["Dr.", "Dra.", "Prof.", "Mr.", "Ms.", "Mrs."];
const TIPO_INPUT: Record<string, string> = { Email: "email", "Phone (Optional)": "tel" };
const AUTOCOMPLETAR: Record<string, string> = { "First Name": "off", "Last Name": "off", Email: "off" };

export function UnoAUno({
  token,
  sesion,
  tipo,
  onVolver,
  onListo,
  onSesionVencida,
}: {
  token: string;
  sesion: Sesion;
  tipo: TipoContacto;
  onVolver: () => void;
  /** Se envió bien: la pantalla de arriba decide qué sigue y qué dice. */
  onListo: (texto: string, otro: boolean) => void;
  onSesionVencida: () => void;
}) {
  const plantilla = plantillaDeTipo(tipo);
  const cliente = useQueryClient();
  const vacio = useMemo<FilaCruda>(() => Object.fromEntries(plantilla.columnas.map((c) => [c.encabezado, ""])), [plantilla]);
  const [v, setV] = useState<FilaCruda>(vacio);
  const [errores, setErrores] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<{ clase: "ok" | "mal" | "info"; texto: string } | null>(null);

  const mis = useQuery({ queryKey: ["int-contactos", "mis", token, sesion.aportante_id], queryFn: () => misContactos(token, sesion), retry: false });
  const propios = (mis.data?.filas ?? []).filter((f) => f.tipo === tipo);

  const mandar = useMutation({
    mutationFn: () => enviar(token, sesion, tipo, [{ fila: 1, cruda: v }], "manual"),
    onError: (e) => {
      if (sesionVencida(e)) return onSesionVencida();
      setMensaje({ clase: "mal", texto: e instanceof Error ? e.message : "No se pudo enviar." });
    },
  });

  const pais = v["Country or Territory"]?.trim() ? resolverPais(v["Country or Territory"]) : null;

  const alEnviar = (otro: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    setMensaje(null);
    const local = validarFila(plantilla, v);
    setErrores(local.errores);
    if (local.errores.length) return;
    mandar.mutate(undefined, {
      onSuccess: (r) => {
        const fila = r.resultados[0];
        if (!fila) return setMensaje({ clase: "mal", texto: "No se recibió respuesta. Intente de nuevo." });
        if (fila.accion === "error") return setMensaje({ clase: "mal", texto: fila.motivo ?? "La fila tiene errores." });
        if (fila.accion === "omitir") return setMensaje({ clase: "info", texto: `No se guardó: ${fila.motivo ?? "ya estaba"}` });
        void cliente.invalidateQueries({ queryKey: ["int-contactos", "mis", token] });
        setV(vacio);
        onListo(fila.accion === "actualizar" ? "Ese correo ya lo había enviado usted: se actualizó el contacto." : "Contacto enviado. Gracias.", otro);
      },
    });
  };

  const campo = (encabezado: string) => {
    const col = plantilla.columnas.find((c) => c.encabezado === encabezado)!;
    const id = `cp-${encabezado.replace(/[^a-z]/gi, "").toLowerCase()}`;
    const etiqueta = (
      <span>
        {ETIQUETA[encabezado] ?? encabezado}
        {col.obligatoria ? " *" : ""} <small>({encabezado})</small>
      </span>
    );
    const comun = { id, value: v[encabezado] ?? "", onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [encabezado]: e.target.value })) };
    if (encabezado === "Title") {
      return (
        <label className="cp-campo" key={encabezado} htmlFor={id}>
          {etiqueta}
          <select {...comun}>
            <option value="">—</option>
            {TRATAMIENTOS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label className="cp-campo" key={encabezado} htmlFor={id}>
        {etiqueta}
        <input
          {...comun}
          type={TIPO_INPUT[encabezado] ?? "text"}
          autoComplete={AUTOCOMPLETAR[encabezado] ?? "off"}
          maxLength={200}
          list={encabezado === "Country or Territory" ? "cp-paises" : encabezado === "Industry" ? "cp-sectores" : undefined}
          aria-invalid={errores.some((x) => x.includes(`«${encabezado}»`)) || undefined}
        />
        {encabezado === "Country or Territory" && pais ? (
          pais.ok ? (
            <span className="cp-ayuda is-ok">
              Reconocido: {pais.nombre} ({pais.codigo}).
            </span>
          ) : (
            <span className="cp-ayuda">{pais.sugerencia ? `No lo reconozco. ¿Quiso decir «${pais.sugerencia}»?` : "No reconozco ese país."}</span>
          )
        ) : null}
      </label>
    );
  };

  const resto = plantilla.columnas.map((c) => c.encabezado).filter((e) => !["Title", "First Name", "Last Name"].includes(e));
  const quedan = mis.data ? Math.max(0, mis.data.limite - (mis.data.filas.length ?? 0)) : null;

  return (
    <div className="cp-dos" data-entra-grupo>
      <form className="cp-card" onSubmit={alEnviar(false)} aria-label={tipo === "academico" ? "Un contacto académico" : "Un contacto de empleador"} data-entra noValidate>
        <div className="cp-acciones">
          <h1>{tipo === "academico" ? "Un contacto académico" : "Un contacto de empleador"}</h1>
          <button type="button" className="cp-btn" onClick={onVolver}>
            Volver
          </button>
        </div>
        <div className="cp-campos">
          <div className="cp-fila3">{["Title", "First Name", "Last Name"].map(campo)}</div>
          <div className="cp-fila2">{resto.map(campo)}</div>
        </div>
        <datalist id="cp-paises">
          {PAISES.map(([codigo, nombre]) => (
            <option key={codigo} value={nombre} />
          ))}
        </datalist>
        <datalist id="cp-sectores">
          {SECTORES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {errores.length > 0 && (
          <ul className="cp-aviso is-mal" role="alert" style={{ margin: 0, paddingLeft: "1.4rem" }}>
            {errores.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {mensaje && (
          <p className={`cp-aviso ${mensaje.clase === "ok" ? "is-ok" : mensaje.clase === "mal" ? "is-mal" : ""}`} role="status">
            {mensaje.texto}
          </p>
        )}
        <div className="cp-acciones">
          <span className="cp-ayuda">* obligatorios. Los nombres entre paréntesis son los de la plantilla.</span>
          <span style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <button type="button" className="cp-btn" disabled={mandar.isPending} onClick={() => alEnviar(true)()}>
              Enviar y agregar otro
            </button>
            <button type="submit" className="cp-btn cp-btn--pri" disabled={mandar.isPending}>
              {mandar.isPending ? "Enviando…" : "Enviar"}
            </button>
          </span>
        </div>
      </form>

      <aside className="cp-card" aria-label="Lo que ya envió" data-entra>
        <h2>
          Lo que ya envió <span className="cp-ayuda">· {propios.length}</span>
        </h2>
        <p className="cp-ayuda">Puede quitarlo mientras su campus no envíe la hoja a revisión.</p>
        <ul className="cp-mis">
          {propios.slice(0, 5).map((f) => (
            <li key={f.id}>
              <span>
                <b>{[f.datos.propio_first_name, f.datos.propio_last_name].filter(Boolean).join(" ")}</b>
                <small>{[f.datos.propio_institution ?? f.datos.propio_company_name, f.datos.propio_country].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="cp-chip is-crear">Recibido</span>
            </li>
          ))}
          {propios.length === 0 && <li className="cp-ayuda">Todavía no ha enviado contactos de este tipo.</li>}
        </ul>
        <p className="cp-aviso">Si escribe un correo que ya está en la lista, no se duplica: el contacto se actualiza.</p>
        {quedan !== null && <p className="cp-ayuda">Puede enviar hasta {mis.data?.limite} contactos en total.</p>}
      </aside>
    </div>
  );
}
