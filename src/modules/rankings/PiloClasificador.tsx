/* =============================================================================
   «Pilo lee las noticias»: el panel compacto que pone a Mr. Pilo a leer las
   notas candidatas del recolector (0144, función noticias-pilo).

   Iniciar / Detener, el avance en vivo (aria-live), el interruptor «Que Pilo
   apruebe lo claro» con su umbral y un aviso honesto: lo que Pilo aprueba se
   publica, queda marcado y se puede revertir. Si falta la migración o la IA
   no está lista, lo dice; nunca queda en blanco.

   Estilos: pilo-noticias.css (prefijo rk-pilo-).
   ========================================================================== */

import { useEffect, useId, useState } from "react";
import { useAuth } from "../../lib/auth";
import { FaltaMigracion } from "./noticias";
import { reintentarErrores, useEstadoPilo, useNewsSettings, usePiloNoticias, useSaveNewsSettings } from "./pilo-noticias";
import "./pilo-noticias.css";

export interface PiloClasificadorProps {
  /** Notas por llamada a la función (1 a 3). Por defecto 2. */
  limite?: number;
  /** Cada cuántos lotes se refresca la bandeja. Por defecto 3. */
  invalidarCada?: number;
  className?: string;
}

const fmt = (n: number) => n.toLocaleString("es-CO");

export function PiloClasificador({ limite = 2, invalidarCada = 3, className = "" }: PiloClasificadorProps) {
  const { profile } = useAuth();
  const titulo = useId();
  const umbralId = useId();
  const estado = useEstadoPilo();
  const ajustes = useNewsSettings();
  const guardar = useSaveNewsSettings();
  const ciclo = usePiloNoticias({ limite, invalidarCada });
  const [umbral, setUmbral] = useState("85");
  const [reintentando, setReintentando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (ajustes.data) setUmbral(String(ajustes.data.umbral));
  }, [ajustes.data]);

  const faltaMigracion = ciclo.faltaMigracion || estado.error instanceof FaltaMigracion || ajustes.error instanceof FaltaMigracion;
  const e = estado.data;
  const iaLista = Boolean(e?.ia);
  const pendientes = ciclo.quedan ?? e?.pendientes ?? 0;
  const total = ciclo.procesadas + (ciclo.quedan ?? 0);
  const aprueba = ajustes.data?.pilo_aprueba === true;

  const guardarAjustes = (pilo_aprueba: boolean, valor: string) => {
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n) || n < 50 || n > 100) {
      setAviso("El umbral va de 50 a 100.");
      setUmbral(String(ajustes.data?.umbral ?? 85));
      return;
    }
    setAviso(null);
    guardar.mutate({ ajustes: { pilo_aprueba, umbral: n }, by: profile?.id ?? null }, { onError: (err) => setAviso(err instanceof Error ? err.message : String(err)) });
  };

  const reintentar = async () => {
    setReintentando(true);
    setAviso(null);
    try {
      const r = await reintentarErrores();
      setAviso(r.devueltas ? `${fmt(r.devueltas)} ${r.devueltas === 1 ? "nota volvió" : "notas volvieron"} a la fila de Pilo.` : "No había notas con error.");
      void estado.refetch();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    } finally {
      setReintentando(false);
    }
  };

  if (faltaMigracion) {
    return (
      <section className={`rk-pilo ${className}`} aria-labelledby={titulo}>
        <h3 id={titulo} className="rk-pilo__title">Pilo lee las noticias</h3>
        <p className="rk-pilo__note rk-pilo__note--warn" role="status">
          Falta aplicar la migración 0144 (Pilo clasifica noticias). Mientras tanto, la bandeja funciona como siempre, solo con el léxico.
        </p>
      </section>
    );
  }

  return (
    <section className={`rk-pilo ${className}`} aria-labelledby={titulo} aria-busy={ciclo.corriendo}>
      <div className="rk-pilo__head">
        <h3 id={titulo} className="rk-pilo__title">Pilo lee las noticias</h3>
        <p className="rk-pilo__sub">
          {estado.isLoading
            ? "Consultando la fila de Pilo…"
            : estado.error
              ? estado.error.message
              : pendientes
                ? `${fmt(pendientes)} ${pendientes === 1 ? "nota espera" : "notas esperan"} a Pilo.`
                : "No hay notas esperando a Pilo."}
        </p>
      </div>

      {e && !iaLista && (
        <p className="rk-pilo__note rk-pilo__note--warn" role="status">
          {e.motivo ?? "Mr. Pilo con IA no está disponible."}
        </p>
      )}

      <div className="rk-pilo__actions">
        {ciclo.corriendo ? (
          <button type="button" className="button-secondary rk-pilo__btn" onClick={ciclo.detener}>
            Detener
          </button>
        ) : (
          <button type="button" className="button-primary rk-pilo__btn" onClick={ciclo.iniciar} disabled={!iaLista || !pendientes || estado.isLoading}>
            {ciclo.procesadas ? "Seguir leyendo" : "Iniciar"}
          </button>
        )}
        {!ciclo.corriendo && (e?.errores ?? 0) > 0 && (
          <button type="button" className="button-ghost rk-pilo__btn" onClick={reintentar} disabled={reintentando || !iaLista}>
            {reintentando ? "Devolviendo…" : `Reintentar ${fmt(e?.errores ?? 0)} con error`}
          </button>
        )}
      </div>

      <div className="rk-pilo__live" aria-live="polite">
        {(ciclo.corriendo || ciclo.procesadas > 0) && (
          <>
            <progress className="rk-pilo__bar" max={Math.max(1, total)} value={ciclo.procesadas} aria-label="Avance de la lectura" />
            <p className="rk-pilo__now">
              {ciclo.corriendo ? "Pilo está leyendo (cada nota tarda de unos segundos a minuto y medio)…" : "Pilo terminó esta tanda."}
            </p>
            <dl className="rk-pilo__counts">
              <div>
                <dt>Leídas</dt>
                <dd className="rk-pilo__num">{fmt(ciclo.procesadas)}</dd>
              </div>
              <div>
                <dt>Aprobadas por Pilo</dt>
                <dd className="rk-pilo__num">{fmt(ciclo.aprobadas)}</dd>
              </div>
              <div>
                <dt>Para revisar</dt>
                <dd className="rk-pilo__num">{fmt(ciclo.paraRevisar)}</dd>
              </div>
              <div>
                <dt>Descartadas</dt>
                <dd className="rk-pilo__num">{fmt(ciclo.descartadas)}</dd>
              </div>
              <div>
                <dt>Con error</dt>
                <dd className="rk-pilo__num">{fmt(ciclo.errores)}</dd>
              </div>
              <div>
                <dt>Quedan</dt>
                <dd className="rk-pilo__num">{ciclo.quedan === null ? "…" : fmt(ciclo.quedan)}</dd>
              </div>
            </dl>
          </>
        )}
        {ciclo.error && (
          <p className="rk-pilo__note rk-pilo__note--error" role="alert">
            {ciclo.error}
          </p>
        )}
        {aviso && <p className="rk-pilo__note">{aviso}</p>}
      </div>

      <div className="rk-pilo__settings">
        <label className="rk-pilo__switch">
          <input
            type="checkbox"
            role="switch"
            checked={aprueba}
            disabled={!ajustes.data || guardar.isPending}
            onChange={(ev) => guardarAjustes(ev.target.checked, umbral)}
          />
          <span>Que Pilo apruebe lo claro</span>
        </label>
        <span className="rk-pilo__threshold">
          <label htmlFor={umbralId}>confianza ≥</label>
          <input
            id={umbralId}
            className="rk-pilo__num-input"
            type="number"
            inputMode="numeric"
            min={50}
            max={100}
            step={1}
            value={umbral}
            disabled={!ajustes.data || guardar.isPending}
            onChange={(ev) => setUmbral(ev.target.value)}
            onBlur={() => umbral !== String(ajustes.data?.umbral ?? "") && guardarAjustes(aprueba, umbral)}
            onKeyDown={(ev) => ev.key === "Enter" && (ev.currentTarget as HTMLInputElement).blur()}
          />
        </span>
      </div>
      <p className="rk-pilo__hint">
        {aprueba
          ? "Lo que Pilo aprueba se publica en los informes, queda marcado «Aprobada por Pilo» y se puede revertir desde la bandeja. Lo dudoso queda para revisión; lo que ya decidió una persona, Pilo no lo toca."
          : "Apagado: Pilo solo propone ODS, indicador y resumen; cada nota espera tu decisión. Si lo enciendes, lo que Pilo aprueba se publica en los informes, queda marcado y se puede revertir."}
      </p>
    </section>
  );
}

export default PiloClasificador;
