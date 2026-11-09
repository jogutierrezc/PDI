/* =============================================================================
   Portales públicos · pestaña «Portales».

   Una tarjeta por portal: el interruptor «Abierto al público», el mensaje de
   mantenimiento, la fecha de regreso (opcional) y la vista previa de la página
   que verá el público. Los cambios se guardan con el botón de la tarjeta;
   deshabilitar pide confirmación y dice, en claro, qué pasa.
   ========================================================================== */

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { aCampoFecha, deCampoFecha, guardarPortal, refrescar } from "./datos";
import type { PortalFila } from "./datos";
import { MENSAJE_PREDETERMINADO, Mantenimiento } from "./GuardiaPortales";
import { Confirmar, Nota } from "./Piezas";

const LIMITE_MENSAJE = 600;

export function TabPortales({ portales, enfocar }: { portales: PortalFila[]; enfocar?: string }) {
  const cerrados = portales.filter((p) => !p.habilitado).length;
  return (
    <div className="ppa-pestana">
      <p className="ppa-intro">
        Cada portal público se puede abrir o cerrar sin tocar el código. Un portal cerrado muestra <strong>una página de mantenimiento</strong> a quien entre por su enlace, desaparece del menú y del buscador (Ctrl + K) y no se indexa en los
        buscadores. La administración lo sigue viendo, con una franja de aviso. La intranet (<code>/admin</code>) y el ingreso nunca se cierran.
      </p>
      <p className="ppa-resumen" role="status">
        {cerrados === 0 ? "Todos los portales están abiertos al público." : `${cerrados} ${cerrados === 1 ? "portal está cerrado" : "portales están cerrados"} al público.`}
      </p>
      <ul className="ppa-tarjetas">
        {portales.map((p) => (
          <li key={p.slug}>
            <TarjetaPortal fila={p} enfocar={enfocar === p.slug} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TarjetaPortal({ fila, enfocar }: { fila: PortalFila; enfocar: boolean }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [habilitado, setHabilitado] = useState(fila.habilitado);
  const [mensaje, setMensaje] = useState(fila.mensaje);
  const [regreso, setRegreso] = useState(aCampoFecha(fila.regreso));
  const [previa, setPrevia] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);

  // Si la fila cambia desde fuera (otro administrador, otra pestaña), el borrador se vuelve a poner.
  const [visto, setVisto] = useState(`${fila.habilitado}|${fila.mensaje}|${fila.regreso}`);
  const actual = `${fila.habilitado}|${fila.mensaje}|${fila.regreso}`;
  if (visto !== actual) {
    setVisto(actual);
    setHabilitado(fila.habilitado);
    setMensaje(fila.mensaje);
    setRegreso(aCampoFecha(fila.regreso));
  }

  const regresoIso = deCampoFecha(regreso);
  const sucio = habilitado !== fila.habilitado || mensaje.trim() !== fila.mensaje.trim() || (regresoIso ?? null) !== (fila.regreso ? new Date(fila.regreso).toISOString() : null);
  const cerrando = fila.habilitado && !habilitado;
  const pasada = regresoIso !== null && new Date(regresoIso).getTime() <= Date.now();

  const guardar = useMutation({
    mutationFn: () => guardarPortal(fila.slug, { habilitado, mensaje, regreso: regresoIso }),
    onSuccess: () => {
      setConfirmar(false);
      setAviso({ tono: "ok", texto: habilitado ? "Guardado. El portal está abierto al público." : "Guardado. El portal quedó cerrado: el público verá la página de mantenimiento." });
      refrescar(queryClient);
    },
    onError: (e) => {
      setConfirmar(false);
      setAviso({ tono: "mal", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    },
  });

  const alGuardar = () => {
    setAviso(null);
    if (cerrando) setConfirmar(true);
    else guardar.mutate();
  };

  return (
    <article className="ppa-tarjeta" data-cerrado={!fila.habilitado || undefined} data-enfocado={enfocar || undefined} aria-labelledby={`${id}-n`}>
      <header className="ppa-tarjeta__cabeza">
        <div>
          <h2 id={`${id}-n`}>{fila.nombre}</h2>
          <p>{fila.descripcion}</p>
        </div>
        <span className="ppa-sello" data-tono={fila.habilitado ? "ok" : "mal"}>
          <Icon name={fila.habilitado ? "check" : "eye-off"} size={14} />
          {fila.habilitado ? "Abierto" : "Deshabilitado"}
        </span>
      </header>

      <p className="ppa-rutas">
        <span>Gobierna:</span>
        {fila.rutas.map((r) => (
          <code key={r}>{r === "/" ? "/ (solo la portada)" : `${r}/…`}</code>
        ))}
      </p>

      <label className="ppa-interruptor">
        <input type="checkbox" role="switch" checked={habilitado} onChange={(e) => setHabilitado(e.target.checked)} />
        <span className="ppa-interruptor__pista" aria-hidden="true" />
        <span>
          <strong>{habilitado ? "Abierto al público" : "Cerrado al público"}</strong>
          <small>{habilitado ? "Se ve en el menú, en el buscador y por su enlace." : "Mantenimiento por su enlace; fuera del menú y del buscador."}</small>
        </span>
      </label>

      {!habilitado && (
        <div className="ppa-mant-campos">
          <label className="admin-field admin-field--wide">
            <span>
              Mensaje de mantenimiento <output>{mensaje.length} / {LIMITE_MENSAJE}</output>
            </span>
            <textarea rows={3} maxLength={LIMITE_MENSAJE} value={mensaje} placeholder={MENSAJE_PREDETERMINADO} onChange={(e) => setMensaje(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Fecha de regreso (opcional)</span>
            <input type="datetime-local" value={regreso} onChange={(e) => setRegreso(e.target.value)} />
          </label>
          {pasada && <p className="ppa-chica">Esa fecha ya pasó: la página no la mostrará. El portal no se reabre solo; hay que volver a habilitarlo.</p>}
          {!pasada && regresoIso && <p className="ppa-chica">La fecha solo se muestra en la página: el portal no se reabre solo. Habilítelo cuando termine el mantenimiento.</p>}
        </div>
      )}

      {fila.slug === "planeacion" && !habilitado && (
        <Nota tono="aviso">
          Planeación es la portada del sitio: cerrada, <code>/</code> mostrará mantenimiento a todo el público. La intranet y el ingreso (<code>/acceso-intranet</code>) siguen abiertos para que pueda volver a habilitarla.
        </Nota>
      )}

      <div className="ppa-acciones">
        <button type="button" className="button-primary" disabled={!sucio || guardar.isPending} onClick={alGuardar}>
          {guardar.isPending && !confirmar ? "Guardando…" : "Guardar cambios"}
        </button>
        {sucio && (
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setHabilitado(fila.habilitado);
              setMensaje(fila.mensaje);
              setRegreso(aCampoFecha(fila.regreso));
              setAviso(null);
            }}
          >
            Descartar
          </button>
        )}
        <button type="button" className="button-secondary" aria-expanded={previa} aria-controls={`${id}-previa`} onClick={() => setPrevia((v) => !v)}>
          <Icon name="eye" size={15} /> {previa ? "Ocultar la vista previa" : "Ver la página de mantenimiento"}
        </button>
        {aviso && (
          <span className="ppa-estado" data-tono={aviso.tono} role="status">
            <Icon name={aviso.tono === "ok" ? "check" : "alert"} size={15} /> {aviso.texto}
          </span>
        )}
      </div>

      {previa && (
        <div id={`${id}-previa`} className="ppa-previa" role="group" aria-label={`Vista previa de la página de mantenimiento de ${fila.nombre}`}>
          <span className="ppa-previa__rotulo">Así la verá el público (con lo que tiene escrito arriba)</span>
          <div className="ppa-previa__marco">
            <Mantenimiento vistaPrevia nombre={fila.nombre} mensaje={mensaje} regreso={regresoIso} enlazarPortada={fila.slug !== "planeacion"} />
          </div>
        </div>
      )}

      <Confirmar
        abierto={confirmar}
        titulo={`¿Cerrar «${fila.nombre}» al público?`}
        textoConfirmar="Sí, cerrar el portal"
        peligro
        trabajando={guardar.isPending}
        onConfirmar={() => guardar.mutate()}
        onCancelar={() => setConfirmar(false)}
      >
        <ul className="ppa-efectos">
          <li>Quien entre por el enlace verá la página de mantenimiento, no el portal.</li>
          <li>Desaparece del menú público y del buscador (Ctrl + K).</li>
          <li>No se indexa mientras esté cerrado.</li>
          <li>Usted y la administración lo siguen viendo, con una franja de aviso.</li>
          <li>El cambio queda en el historial con su nombre.</li>
        </ul>
        <p className="ppa-chica">
          Alcanza a: {fila.rutas.map((r) => (r === "/" ? "la portada (/)" : `${r}/…`)).join(", ")}.
        </p>
      </Confirmar>
    </article>
  );
}
