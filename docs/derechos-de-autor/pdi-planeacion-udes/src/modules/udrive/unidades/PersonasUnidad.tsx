/* =============================================================================
   UDrive · Unidades de trabajo · personas de una unidad ya creada.

   Cada cambio va a la base (drive_unidad_miembro_fijar y compañía), que
   comprueba el papel de quien lo pide, el vencimiento de las personas externas
   y que la unidad nunca se quede sin quien la administre. Aquí también se pasa
   la administración y se archiva o restaura la unidad.
   ========================================================================== */

import { useMemo, useState } from "react";
import { fechaDeCampo } from "./lib";
import { errorDe, useArchivar, useFijarMiembro, useMiembros, useQuitarMiembro, useTransferir, useVaciarPapeleraUnidad } from "./datos";
import { MatrizPapeles, PersonasEditor } from "./Personas";
import type { FilaPersona, NuevaPersona } from "./Personas";
import type { RolUnidad, UnidadFila } from "./tipos";
import { NOMBRE_ROL } from "./tipos";

export function PersonasUnidad({ u }: { u: UnidadFila }) {
  const q = useMiembros(u.id);
  const fijar = useFijarMiembro();
  const quitar = useQuitarMiembro();
  const transferir = useTransferir();
  const archivar = useArchivar();
  const vaciar = useVaciarPapeleraUnidad();
  const admin = u.mi_rol === "admin";
  const general = !u.es_miembro;
  const editable = admin && !u.archivada_en;
  const [destino, setDestino] = useState("");
  const [dejar, setDejar] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const filas: FilaPersona[] = useMemo(() => (q.data ?? []).map((m) => ({ usuario_id: m.usuario_id, correo: m.correo, nombre: m.nombre, rol: m.rol, externo: m.externo, vence_en: m.vence_en, vigente: m.vigente, es_yo: m.es_yo })), [q.data]);
  const candidatos = filas.filter((f) => f.rol !== "admin" && f.vigente !== false && !f.externo);

  const anadir = async (nuevas: NuevaPersona[]) => {
    for (const n of nuevas) await fijar.mutateAsync({ unidad: u.id, usuario: n.persona.id, rol: n.rol, vence: n.vence ? fechaDeCampo(n.vence) : null });
  };
  const cambiarRol = async (usuario: string, rol: RolUnidad) => {
    const f = filas.find((x) => x.usuario_id === usuario);
    await fijar.mutateAsync({ unidad: u.id, usuario, rol, vence: f?.vence_en ?? null });
  };
  const cambiarVence = async (usuario: string, v: string) => {
    const f = filas.find((x) => x.usuario_id === usuario);
    if (!f) return;
    await fijar.mutateAsync({ unidad: u.id, usuario, rol: f.rol, vence: fechaDeCampo(v) });
  };
  const quitarVarias = async (us: string[]) => {
    for (const x of us) await quitar.mutateAsync({ unidad: u.id, usuario: x });
  };

  const pasar = () => {
    if (!destino) return;
    setError("");
    transferir.mutate(
      { unidad: u.id, a: destino, dejar },
      {
        onSuccess: () => { setAviso(`${filas.find((f) => f.usuario_id === destino)?.nombre ?? "La persona"} ahora administra la unidad.`); setDestino(""); setDejar(false); },
        onError: (e) => setError(errorDe(e as Error).message),
      },
    );
  };

  return (
    <div className="un-pagina un-pagina--angosta">
      <header className="un-cab">
        <div>
          <p className="un-kicker">{u.nombre}</p>
          <h1>Personas</h1>
          <p className="un-ayuda un-cab__d">{admin ? (general ? "Cambia a las personas como administración general. Cada cambio queda en el registro." : "Usted administra esta unidad: añade, quita y cambia papeles.") : `Su papel es ${NOMBRE_ROL[u.mi_rol]}. Solo quien administra la unidad cambia a las personas; usted puede ver quién tiene acceso.`}</p>
        </div>
      </header>

      {q.isPending ? <p className="un-ayuda">Cargando personas…</p> : null}
      {q.isError ? <p className="un-nota un-nota--error" role="alert">{errorDe(q.error as Error).message}</p> : null}
      {u.sin_admin ? <p className="un-nota un-nota--aviso">La unidad no tiene a nadie con papel Administra vigente. {admin ? "Asigne ese papel a alguien de la lista." : ""}</p> : null}
      {u.archivada_en ? <p className="un-nota un-nota--aviso">La unidad está archivada: no se pueden cambiar sus personas hasta restaurarla.</p> : null}

      {q.data ? (
        <PersonasEditor
          idBase="un-u"
          filas={filas}
          puedeEditar={editable}
          protegerUnicoAdmin
          ocupado={fijar.isPending || quitar.isPending}
          onAnadir={anadir}
          onRol={cambiarRol}
          onVence={cambiarVence}
          onQuitar={quitarVarias}
        />
      ) : null}

      <details className="un-mas">
        <summary>Qué puede hacer cada papel</summary>
        <div className="un-mas__c"><MatrizPapeles /></div>
      </details>

      {admin ? (
        <section className="un-caja" aria-labelledby="un-t-tr">
          <h2 id="un-t-tr">{general ? "Reasignar la administración" : "Pasar la administración"}</h2>
          <p className="un-ayuda">La persona elegida pasa a Administra. {general ? "Queda registrado como una acción de administración general." : "Usted puede seguir administrando o pasar a Editar."} Una persona externa no puede administrar.</p>
          <div className="un-fila">
            <div className="un-fld un-fld--crece">
              <label htmlFor="un-tr-a">Persona</label>
              <select id="un-tr-a" value={destino} onChange={(e) => setDestino(e.target.value)} disabled={!editable || !candidatos.length}>
                <option value="">{candidatos.length ? "Elija a una persona de la unidad" : "No hay a quién pasarla"}</option>
                {candidatos.map((f) => <option key={f.usuario_id} value={f.usuario_id}>{f.nombre || f.correo}</option>)}
              </select>
            </div>
            {!general ? <label className="un-check"><input type="checkbox" checked={dejar} onChange={(e) => setDejar(e.target.checked)} /> Pasar mi papel a Editar</label> : null}
            <button type="button" className="un-btn un-btn--sec" disabled={!destino || transferir.isPending || !editable} onClick={pasar}>{general ? "Reasignar" : "Pasar la administración"}</button>
          </div>
          {aviso ? <p className="un-nota un-nota--info" role="status">{aviso}</p> : null}
          {error ? <p className="un-nota un-nota--error" role="alert">{error}</p> : null}
        </section>
      ) : null}

      {admin ? (
        <section className="un-caja" aria-labelledby="un-t-ar">
          <h2 id="un-t-ar">{u.archivada_en ? "Restaurar la unidad" : "Archivar la unidad"}</h2>
          <p className="un-ayuda">{u.archivada_en ? "Vuelve a Unidades de trabajo con todas sus carpetas y personas." : "Se oculta de la lista principal y queda de solo lectura. No borra nada y se puede restaurar."}</p>
          {confirmarArchivo ? (
            <div className="un-fila" role="group" aria-label="Confirmar">
              <button type="button" className={`un-btn${u.archivada_en ? "" : " un-btn--peligro"}`} disabled={archivar.isPending}
                onClick={() => archivar.mutate({ unidad: u.id, archivar: !u.archivada_en }, { onSuccess: () => { setConfirmarArchivo(false); setAviso(u.archivada_en ? "Unidad restaurada." : "Unidad archivada. Sigue en el filtro Archivadas."); }, onError: (e) => setError(errorDe(e as Error).message) })}>
                {u.archivada_en ? "Sí, restaurar" : "Sí, archivar"}
              </button>
              <button type="button" className="un-btn un-btn--texto" onClick={() => setConfirmarArchivo(false)}>Cancelar</button>
            </div>
          ) : <div><button type="button" className={`un-btn ${u.archivada_en ? "un-btn--sec" : "un-btn--peligro"}`} onClick={() => setConfirmarArchivo(true)}>{u.archivada_en ? "Restaurar" : "Archivar"}</button></div>}
          {!u.archivada_en ? (
            <div>
              <button type="button" className="un-btn un-btn--sec" disabled={vaciar.isPending} onClick={() => vaciar.mutate(u.id, { onSuccess: (n) => setAviso(n ? `Se borraron para siempre ${n} archivos que llevaban más de 30 días en la papelera.` : "No había nada vencido en la papelera."), onError: (e) => setError(errorDe(e as Error).message) })}>Vaciar lo vencido de la papelera</button>
              <p className="un-ayuda">Borra para siempre lo que lleva más de 30 días en la papelera de la unidad y libera espacio.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
