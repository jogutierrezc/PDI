/* =============================================================================
   Datos de Sostenibilidad · el explorador de libros de una oficina.

   Carpetas (las dos fijas y las propias) y los libros con su resumen: filas,
   errores de validación, estado y a qué indicadores responde. De aquí se abre
   el editor, se crea una carpeta o se arranca el asistente de nuevo libro.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../../admin/udes-en-cifras/ui";
import { esFaltaMigracion, useBorrarLibro, useCarpetas, useCrearCarpeta, useEstructura, useIndicadores, useMarcarListo, useResumenLibros, useRespuestas } from "../datos";
import { puedeEditar } from "../lib/permisos";
import { SLOTS, coberturaDelMapa } from "../lib/indicadores";
import type { DsOficina, DsYo } from "../tipos";
import { AsistenteLibro } from "./AsistenteLibro";

export function ExploradorLibros({ yo, oficina, onAbrir }: { yo: DsYo; oficina: DsOficina; onAbrir: (libro: string) => void }) {
  const id = oficina.oficina_id;
  const editable = puedeEditar(yo, id);
  const carpetas = useCarpetas(id);
  const estructura = useEstructura(id);
  const resumen = useResumenLibros(id);
  const respuestas = useRespuestas(id);
  const indicadores = useIndicadores();
  const crearCarpeta = useCrearCarpeta(id);
  const borrarLibro = useBorrarLibro(id);
  const marcar = useMarcarListo(id);
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [asistente, setAsistente] = useState(false);

  const falla = ([carpetas, estructura, resumen, respuestas].find((q) => q.error)?.error ?? null) as Error | null;
  const libros = estructura.data ?? [];
  const mapaResumen = useMemo(() => new Map((resumen.data ?? []).map((r) => [r.libro_id, r])), [resumen.data]);
  const nombreDe = (u: string | null) => carpetas.data?.find((c) => c.id === u)?.nombre ?? "";

  if (falla) {
    const mensaje = String(falla.message ?? "No se pudieron cargar los libros.");
    return (
      <Panel title="Libros de datos" description="">
        <p className="oda-banner" role="alert">
          <Icon name="alert" size={16} /> {esFaltaMigracion(falla) ? mensaje : `No se pudieron cargar los libros: ${mensaje}`}
        </p>
      </Panel>
    );
  }

  const visibles = carpeta ? libros.filter((l) => l.carpeta_id === carpeta) : libros;

  return (
    <div className="oda-stack">
      <Panel
        title="Libros de datos"
        description="Cada libro es una tabla o una lista con columnas tipadas, como en Programas en Cifras. El que responde a un indicador lleva su conexión a la vista."
        actions={
          <>
            <SaveState pending={crearCarpeta.isPending || borrarLibro.isPending || marcar.isPending} error={crearCarpeta.error ?? borrarLibro.error ?? marcar.error} success={crearCarpeta.isSuccess || marcar.isSuccess} />
            {editable && (
              <>
                <button type="button" className="button-secondary" onClick={() => setNuevaCarpeta((v) => !v)}>
                  <Icon name="folder" size={15} /> Nueva carpeta
                </button>
                <button type="button" className="button-primary" onClick={() => setAsistente(true)}>
                  <Icon name="plus" size={15} /> Nuevo libro
                </button>
              </>
            )}
          </>
        }
      >
        <div className="ds-carpetas" role="tablist" aria-label="Carpetas">
          <button type="button" role="tab" aria-selected={carpeta === null} onClick={() => setCarpeta(null)}>
            Todos
          </button>
          {(carpetas.data ?? []).map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={carpeta === c.id} onClick={() => setCarpeta(c.id)}>
              {c.nombre}
              {!c.fija && (
                <small>{libros.filter((l) => l.carpeta_id === c.id).length}</small>
              )}
            </button>
          ))}
        </div>

        {nuevaCarpeta && editable && (
          <form
            className="tb-invite"
            onSubmit={(e) => {
              e.preventDefault();
              const nombre = nombreCarpeta.trim();
              if (!nombre) return;
              crearCarpeta.mutate(
                { nombre, clave: nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carpeta" },
                { onSuccess: () => { setNuevaCarpeta(false); setNombreCarpeta(""); } },
              );
            }}
          >
            <label className="admin-field">
              <span>Nombre de la carpeta</span>
              <input value={nombreCarpeta} onChange={(e) => setNombreCarpeta(e.target.value)} placeholder="Energía" autoFocus />
            </label>
            <button type="submit" className="button-secondary" disabled={!nombreCarpeta.trim() || crearCarpeta.isPending}>
              Crearla
            </button>
          </form>
        )}

        {estructura.isPending ? (
          <p className="admin-loading">Cargando los libros…</p>
        ) : visibles.length === 0 ? (
          <StageEmpty title="Todavía no hay libros aquí">
            {editable
              ? "Cree el primero: puede ser en blanco o subiendo un Excel que ya tengan."
              : "Los crea la gente de la oficina."}
          </StageEmpty>
        ) : (
          <ul className="ds-libros">
            {visibles.map((l) => {
              const r = mapaResumen.get(l.id);
              const conexiones = (respuestas.data ?? []).filter((x) => x.libro_id === l.id);
              const estado = l.estado === "listo" ? "Listo" : "Borrador";
              return (
                <li key={l.id} className="ds-libros__row" data-estado={l.estado}>
                  <button type="button" className="ds-libros__main" onClick={() => onAbrir(l.id)}>
                    <Icon name={l.tipo === "lista" ? "list" : "table"} size={18} />
                    <span>
                      <strong>{l.nombre}</strong>
                      <small>
                        {nombreDe(l.carpeta_id)} · {l.tipo === "lista" ? "Lista" : "Tabla"} · {r?.filas ?? 0} {(r?.filas ?? 0) === 1 ? "fila" : "filas"}
                        {r && r.errores > 0 && <em className="ds-libros__errores">{r.errores} con error</em>}
                      </small>
                    </span>
                  </button>
                  <span className="ds-libros__conexiones">
                    {conexiones.length === 0 ? (
                      <small>Sin indicador</small>
                    ) : (
                      conexiones.map((x) => {
                        const ind = (indicadores.data ?? []).find((i) => i.id === x.indicador_id);
                        const cob = coberturaDelMapa(x.mapa);
                        return (
                          <span key={x.id} className="ds-libros__chip" title={SLOTS.filter((s) => x.mapa[s.clave]).map((s) => s.etiqueta).join(" · ")}>
                            ODS {ind?.ods} · {ind?.nombre ?? x.indicador_id} <b>{cob.conectados}/{cob.total}</b>
                          </span>
                        );
                      })
                    )}
                  </span>
                  <span className={`ds-libros__estado ${l.estado}`}>{estado}</span>
                  <span className="ds-libros__acciones">
                    {editable && l.estado !== "listo" && (r?.errores ?? 0) === 0 && (
                      <button type="button" className="oda-link-button" onClick={() => marcar.mutate({ libro: l.id, listo: true })}>
                        Marcar listo
                      </button>
                    )}
                    {editable && l.estado === "listo" && (
                      <button type="button" className="oda-link-button" onClick={() => marcar.mutate({ libro: l.id, listo: false })}>
                        Volver a borrador
                      </button>
                    )}
                    {editable && (
                      <ConfirmButton label="Borrar" confirmLabel={`Borrar «${l.nombre}»`} onConfirm={() => borrarLibro.mutate(l.id, { onSuccess: () => undefined })} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {asistente && editable && (
        <AsistenteLibro oficina={id} carpetas={carpetas.data ?? []} onCerrar={() => setAsistente(false)} onCreado={onAbrir} />
      )}
    </div>
  );
}
