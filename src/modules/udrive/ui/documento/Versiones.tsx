/* =============================================================================
   UDrive · versiones del documento.

   Cada versión guarda el contenido del documento y una instantánea de las
   tablas y gráficas que usaba, así que se puede ver tal como estaba, con los
   datos de entonces. Se puede comparar una versión con la actual (o dos
   entre sí, por fechas) y restaurar: antes de restaurar se guarda
   automáticamente la situación presente.
   ========================================================================== */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ventana } from "../../../../components/espacio/Ventana";
import { leerVersion, useGuardarVersion, useRestaurarVersion, useVersiones } from "../../datosDocumento";
import type { VersionFila } from "../../datosDocumento";
import { normalizarDocumento } from "../../lib/documento";
import type { Documento } from "../../lib/documento";
import { ETIQUETA_CAMBIO, compararDocumentos } from "../../lib/versiones";
import { fechaLarga } from "../piezas";

function useVersionLeida(id: string | null) {
  return useQuery({
    queryKey: ["ud", "version", id],
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const v = await leerVersion(id!);
      return { documento: normalizarDocumento(v.contenido).documento, datos: v.datos };
    },
  });
}

export function Versiones({
  documentoId,
  actual,
  editable,
  antesDeGuardar,
  recolectar,
  onVer,
  onRestaurado,
  onCerrar,
  decir,
}: {
  documentoId: string;
  actual: Documento;
  editable: boolean;
  /** Guarda lo pendiente del editor; falso si no se pudo. */
  antesDeGuardar(): Promise<boolean>;
  /** Lee el contenido de las tablas y gráficas que usa el documento. */
  recolectar(): Promise<Record<string, unknown>>;
  onVer(doc: Documento, datos: Record<string, unknown>, rotulo: string): void;
  onRestaurado(): void;
  onCerrar(): void;
  decir(m: string): void;
}) {
  const lista = useVersiones(documentoId, true);
  const guardar = useGuardarVersion();
  const restaurar = useRestaurarVersion();
  const [nota, setNota] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const filas = lista.data ?? [];
  const numero = (id: string) => filas.find((f) => f.id === id)?.numero;

  // Con una marcada se compara con la actual; con dos, entre sí (la más vieja primero).
  const ordenadas = marcadas.slice().sort((x, y) => (numero(x) ?? 0) - (numero(y) ?? 0));
  const a = useVersionLeida(ordenadas[0] ?? null);
  const b = useVersionLeida(ordenadas[1] ?? null);
  const cambios = a.data ? compararDocumentos(a.data.documento, ordenadas[1] ? (b.data?.documento ?? actual) : actual) : null;

  const guardarAhora = async () => {
    setOcupado(true);
    try {
      if (!(await antesDeGuardar())) return decir("No se pudo guardar el documento antes de la versión.");
      const datos = await recolectar();
      await guardar.mutateAsync({ id: documentoId, nota: nota.trim(), datos });
      setNota("");
      decir("Versión guardada.");
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo guardar la versión.");
    } finally {
      setOcupado(false);
    }
  };

  const ver = async (f: VersionFila) => {
    setOcupado(true);
    try {
      const v = await leerVersion(f.id);
      onVer(normalizarDocumento(v.contenido).documento, v.datos, `Versión ${f.numero}`);
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo abrir la versión.");
    } finally {
      setOcupado(false);
    }
  };

  const restaurarVersion = (f: VersionFila) => {
    restaurar.mutate(
      { id: documentoId, version: f.id },
      {
        onSuccess: () => {
          setConfirmar(null);
          decir(`Se restauró la versión ${f.numero}. Antes se guardó la anterior.`);
          onRestaurado();
        },
        onError: (e) => decir(e.message),
      },
    );
  };

  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m.slice(-1), id]));

  return (
    <Ventana titulo="Versiones del documento" onCerrar={onCerrar} pie={<><span className="es-note">Marque una versión para compararla con la actual, o dos para compararlas entre sí.</span><button type="button" className="es-btn" onClick={onCerrar}>Cerrar</button></>}>
      <div className="es-dbody">
        {editable ? (
          <form className="ud-doc-pie-der" onSubmit={(e) => (e.preventDefault(), void guardarAhora())}>
            <label className="es-fl">
              Guardar una versión ahora (con una nota opcional)
              <input type="text" className="es-inp" data-foco maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Antes de enviar a revisión" />
            </label>
            <button type="submit" className="es-btn es-btn--pri" disabled={ocupado} style={{ justifySelf: "start" }}>Guardar versión</button>
          </form>
        ) : null}

        {lista.isPending ? <p className="es-note">Leyendo las versiones…</p> : null}
        {lista.error ? <p className="ud-aviso" data-t="error" role="alert">{lista.error.message}</p> : null}
        {!lista.isPending && !filas.length ? <p className="ud-vacio" role="status">Todavía no hay versiones. Se guarda una al aprobar, al restaurar o cuando usted lo pida.</p> : null}

        <ul className="ud-lista-cambios" aria-label="Versiones guardadas">
          {filas.map((f) => (
            <li key={f.id} data-t="cambiado">
              <label className="es-ck">
                <input type="checkbox" checked={marcadas.includes(f.id)} onChange={() => alternar(f.id)} />
                <b>Versión {f.numero}</b> · {fechaLarga(f.created_at)} · {f.autor_nombre ?? "—"} · {f.bloques} bloques
              </label>
              {f.nota ? <span>{f.nota}</span> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="es-btn es-btn--sm" disabled={ocupado} onClick={() => void ver(f)}>Ver con los datos de entonces</button>
                {editable ? (
                  confirmar === f.id ? (
                    <>
                      <button type="button" className="es-btn es-btn--sm es-btn--pri" disabled={restaurar.isPending} onClick={() => restaurarVersion(f)}>Sí, restaurar</button>
                      <button type="button" className="es-btn es-btn--sm" onClick={() => setConfirmar(null)}>No</button>
                    </>
                  ) : (
                    <button type="button" className="es-btn es-btn--sm" onClick={() => setConfirmar(f.id)}>Restaurar</button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {ordenadas.length ? (
          <section aria-live="polite">
            <h3>{ordenadas[1] ? `Versión ${numero(ordenadas[0])} frente a la versión ${numero(ordenadas[1])}` : `Versión ${numero(ordenadas[0])} frente a la actual`}</h3>
            {a.isPending || (ordenadas[1] && b.isPending) ? <p className="es-note">Comparando…</p> : null}
            {cambios && !cambios.length ? <p className="es-note">No hay diferencias.</p> : null}
            <ul className="ud-lista-cambios">
              {(cambios ?? []).map((c, n) => (
                <li key={n} data-t={c.tipo}>
                  <b>{ETIQUETA_CAMBIO[c.tipo]} · {c.clase}</b>
                  {c.antes ? <span>Antes: {c.antes}</span> : null}
                  {c.despues ? <span>{c.antes ? "Ahora" : "Texto"}: {c.despues}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Ventana>
  );
}
