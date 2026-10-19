/* =============================================================================
   Contactos · público · un contacto a la vez.

   El formulario sale de la plantilla de Rua (mismas columnas, mismo orden); la
   etiqueta en español lleva entre paréntesis la cabecera original para que quien
   también use el archivo reconozca cada campo. Se valida aquí al instante y la
   función lo vuelve a validar al recibirlo.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAISES } from "../../../../../supabase/functions/int-contactos/paises";
import { plantillaDeTipo, resolverPais, SECTORES, validarFila } from "../../../../../supabase/functions/int-contactos/contactos";
import type { FilaCruda, TipoContacto } from "../../../../../supabase/functions/int-contactos/contactos";
import { enviar, misContactos, sesionVencida } from "../api";
import type { Sesion } from "../api";
import { useDecir } from "./GuiaPilo";

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

/** Lo que Pilo dice al enfocar cada campo. */
const AYUDA: Record<string, string> = {
  Source: "Cuénteme de dónde sale este contacto: un convenio, un congreso o la persona que lo propuso. Puede quedar vacío.",
  Title: "El tratamiento de su contacto, como Dr. o Prof. Va aparte del nombre y puede quedar vacío.",
  "First Name": "Los nombres de su contacto, tal como los usa en su correo o en su tarjeta.",
  "Last Name": "Sus apellidos. Si tiene dos, escríbalos los dos.",
  "Job Title": "El cargo que tiene hoy esa persona en su institución.",
  Position: "El cargo que tiene hoy esa persona en su empresa.",
  Department: "La facultad, escuela o unidad donde trabaja. Puede quedar vacío.",
  Institution: "La universidad o centro donde trabaja. Escríbalo completo, sin siglas si puede.",
  Industry: "El sector de la empresa. Elija uno de la lista o escriba el suyo. Puede quedar vacío.",
  "Company Name": "El nombre de la empresa. Escríbalo completo, sin siglas si puede.",
  "Country or Territory": "El país donde trabaja. Escríbalo en español o en inglés y yo lo reconozco.",
  Email: "Su correo directo. Es lo más importante: sin él no podemos contactarlo, y no se repite entre contactos.",
  Subject: "El área en la que trabaja o investiga. Este campo puede quedar vacío.",
  "Phone (Optional)": "El teléfono con indicativo del país, si lo sabe. Este campo puede quedar vacío.",
};

const TRATAMIENTOS = ["Dr.", "Dra.", "Prof.", "Mr.", "Ms.", "Mrs."];
const TIPO_INPUT: Record<string, string> = { Email: "email", "Phone (Optional)": "tel" };
const AUTOCOMPLETAR: Record<string, string> = { "First Name": "off", "Last Name": "off", Email: "off" };

const idDe = (encabezado: string) => `cp-${encabezado.replace(/[^a-z]/gi, "").toLowerCase()}`;
const enEspanol = (e: string) => e.replace(/«([^»]+)»/g, (_, h: string) => `«${ETIQUETA[h] ?? h}»`);

export function UnoAUno({
  token,
  sesion,
  tipo,
  onVolver,
  onTerminado,
  onSesionVencida,
}: {
  token: string;
  sesion: Sesion;
  tipo: TipoContacto;
  onVolver: () => void;
  /** Terminó: cuántos contactos envió en esta ronda. La pantalla de arriba muestra el «recibido». */
  onTerminado: (contactos: number) => void;
  onSesionVencida: () => void;
}) {
  const plantilla = plantillaDeTipo(tipo);
  const decir = useDecir();
  const cliente = useQueryClient();
  const vacio = useMemo<FilaCruda>(() => Object.fromEntries(plantilla.columnas.map((c) => [c.encabezado, ""])), [plantilla]);
  const [v, setV] = useState<FilaCruda>(vacio);
  const [errores, setErrores] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<{ clase: "ok" | "mal" | "info"; texto: string } | null>(null);
  const [rondas, setRondas] = useState(0);
  const primero = useRef<HTMLInputElement>(null);
  // Al volver al primer campo tras un envío, Pilo no lo tapa con la ayuda del campo.
  const sinAyuda = useRef(false);

  const mis = useQuery({ queryKey: ["int-contactos", "mis", token, sesion.aportante_id], queryFn: () => misContactos(token, sesion), retry: false });
  const enviados = mis.data?.filas.length ?? sesion.enviados;

  useEffect(() => {
    decir(
      tipo === "academico"
        ? "Empiece por el nombre de la persona. Toque cualquier campo y le explico qué necesito."
        : "Empiece por el nombre de su contacto en la empresa. Toque cualquier campo y le explico qué necesito.",
      "idea",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, [tipo]);

  const mandar = useMutation({
    mutationFn: () => enviar(token, sesion, tipo, [{ fila: 1, cruda: v }], "manual"),
    onError: (e) => {
      if (sesionVencida(e)) return onSesionVencida();
      const texto = e instanceof Error ? e.message : "No se pudo enviar.";
      setMensaje({ clase: "mal", texto });
      decir(texto, "duda");
    },
  });

  const pais = v["Country or Territory"]?.trim() ? resolverPais(v["Country or Territory"]) : null;
  const hayAlgo = Object.values(v).some((x) => x.trim());

  const alEnviar = (otro: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    setMensaje(null);
    if (!hayAlgo) {
      if (rondas > 0) return onTerminado(rondas);
      setErrores([]);
      return decir("Todavía no hay ningún contacto escrito. Empiece por el nombre y el correo de la persona.", "duda");
    }
    const local = validarFila(plantilla, v);
    const lista = local.errores.map(enEspanol);
    setErrores(lista);
    if (local.errores.length) {
      decir(`${lista[0].replace(/^Falta /, "Me falta ").replace(/\.$/, "")}. Complételo y seguimos.`, "duda");
      const faltante = plantilla.columnas.find((c) => local.errores.some((x) => x.includes(`«${c.encabezado}»`)));
      document.getElementById(idDe(faltante?.encabezado ?? "First Name"))?.focus();
      return;
    }
    mandar.mutate(undefined, {
      onSuccess: (r) => {
        const fila = r.resultados[0];
        if (!fila) return setMensaje({ clase: "mal", texto: "No se recibió respuesta. Intente de nuevo." });
        if (fila.accion === "error") {
          const texto = fila.motivo ?? "La fila tiene errores.";
          decir(texto, "duda");
          return setMensaje({ clase: "mal", texto });
        }
        if (fila.accion === "omitir") {
          const texto = `No se guardó: ${fila.motivo ?? "ya estaba"}`;
          decir(texto, "duda");
          return setMensaje({ clase: "info", texto });
        }
        void cliente.invalidateQueries({ queryKey: ["int-contactos", "mis", token] });
        setV(vacio);
        setErrores([]);
        const n = rondas + 1;
        setRondas(n);
        if (!otro) return onTerminado(n);
        decir(`${fila.accion === "actualizar" ? "Ese correo ya lo había enviado usted: lo actualicé." : "Recibido."} Ya lleva ${n} en esta ronda. Cuando quiera, escriba el siguiente.`, "bien");
        sinAyuda.current = true;
        primero.current?.focus();
      },
    });
  };

  const campo = (encabezado: string) => {
    const col = plantilla.columnas.find((c) => c.encabezado === encabezado)!;
    const id = idDe(encabezado);
    const malo = errores.some((x) => x.includes(`«${ETIQUETA[encabezado] ?? encabezado}»`) || x.includes(`«${encabezado}»`));
    const etiqueta = (
      <span>
        {ETIQUETA[encabezado] ?? encabezado}
        {col.obligatoria ? " *" : ""} <small>({encabezado})</small>
      </span>
    );
    const comun = {
      id,
      value: v[encabezado] ?? "",
      onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [encabezado]: e.target.value })),
      onFocus: () => {
        if (sinAyuda.current) {
          sinAyuda.current = false;
          return;
        }
        decir(AYUDA[encabezado] ?? "", "idea");
      },
    };
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
      <label className="cp-campo" key={encabezado} htmlFor={id} data-malo={malo || undefined}>
        {etiqueta}
        <input
          {...comun}
          ref={encabezado === "First Name" ? primero : undefined}
          type={TIPO_INPUT[encabezado] ?? "text"}
          autoComplete={AUTOCOMPLETAR[encabezado] ?? "off"}
          maxLength={200}
          list={encabezado === "Country or Territory" ? "cp-paises" : encabezado === "Industry" ? "cp-sectores" : undefined}
          aria-invalid={malo || undefined}
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
  const nombreTipo = tipo === "academico" ? "Contacto académico" : "Contacto de un empleador";

  return (
    <form className="cp-panel" onSubmit={alEnviar(false)} aria-label={nombreTipo} data-entra noValidate>
      <div data-entra>
        <h2>{nombreTipo}</h2>
        <p className="cp-sub">
          <span className="cp-cnt">
            <b>{enviados}</b> {enviados === 1 ? "enviado" : "enviados"} hasta ahora
          </span>
        </p>
      </div>
      <div className="cp-campos" data-entra>
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
      <p className="cp-ayuda">* obligatorios. Si escribe un correo que ya está en la lista, no se duplica: el contacto se actualiza.{mis.data ? ` Puede enviar hasta ${mis.data.limite} contactos en total.` : ""}</p>
      <div className="cp-acciones" data-entra>
        <button type="button" className="cp-btn cp-btn--suave" onClick={onVolver} disabled={mandar.isPending}>
          Volver
        </button>
        <span className="cp-grupo">
          <button type="button" className="cp-btn cp-btn--suave" disabled={mandar.isPending} onClick={() => alEnviar(true)()}>
            Enviar y agregar otro
          </button>
          <button type="submit" className="cp-btn cp-btn--pri" disabled={mandar.isPending}>
            {mandar.isPending ? "Enviando…" : "Terminar y enviar"}
          </button>
        </span>
      </div>
    </form>
  );
}
