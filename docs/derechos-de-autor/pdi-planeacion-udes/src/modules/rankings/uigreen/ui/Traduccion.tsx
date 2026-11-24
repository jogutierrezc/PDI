/* =============================================================================
   UI GreenMetric · pestaña English: el texto original al lado, «Traducir con
   Pilo», edición a mano y revisión humana obligatoria antes de enviar.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { traducirConPilo, useGlosario, useGuardarTraducciones, useMarcarTraduccionRevisada, usePendientesTraduccion, useTraducciones } from "../datos";
import type { TextoATraducir } from "../datos";
import type { FilaTabla, PreguntaCiclo, RespuestaUgm } from "../lib/tipos";
import { Alerta, Campo, mensajeDe } from "./comunes";
import { useUgm } from "./contexto";
import { TablaEditor } from "./Formulario";
import type { Borrador, Cambiar } from "./Formulario";

const LOTE = 12;
const MAX = 4000;

export function Traduccion({ p, r, b, cambiar, editable, sucio, guardar }: { p: PreguntaCiclo; r: RespuestaUgm; b: Borrador; cambiar: Cambiar; editable: boolean; sucio: boolean; guardar: () => Promise<boolean> }) {
  const u = useUgm();
  const trad = useTraducciones(r.id);
  const pend = usePendientesTraduccion(r.id);
  const glosario = useGlosario();
  const guardarTrad = useGuardarTraducciones();
  const revisada = useMarcarTraduccionRevisada();
  const [ocupado, setOcupado] = useState(false);
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  const [fallos, setFallos] = useState<string[]>([]);
  const [leida, setLeida] = useState(false);

  const traducibles = useMemo(() => p.esquema.campos.filter((c) => c.traducible), [p]);
  const tablasTexto = useMemo(() => p.esquema.tablas.filter((t) => t.columnas.some((c) => c.tipo === "texto")), [p]);
  const estadoDe = (campo: string) => {
    if (pend.data?.includes(campo)) return (trad.data?.find((t) => t.campo === campo)?.estado === "borrador" ? "Borrador" : "Sin revisar");
    return trad.data?.find((t) => t.campo === campo)?.estado === "revisada" ? "Revisada" : "Sin revisar";
  };

  /** Los textos que Pilo puede traducir: campos con español y celdas de texto de las tablas. */
  const itemsPorTraducir = (): TextoATraducir[] => {
    const items: TextoATraducir[] = [];
    for (const c of traducibles) {
      const es = (b.textos_es[c.k] ?? "").trim();
      if (es) items.push({ ref: c.k, es: es.slice(0, MAX) });
    }
    for (const t of tablasTexto) {
      (b.tablas[t.k] ?? []).forEach((f, i) => {
        for (const c of t.columnas) if (c.tipo === "texto" && String(f[c.k] ?? "").trim()) items.push({ ref: `tabla:${t.k}:${i}:${c.k}`, es: String(f[c.k]).slice(0, MAX) });
      });
    }
    return items;
  };

  const traducir = async () => {
    const items = itemsPorTraducir();
    if (!items.length) {
      u.avisar("Escriba primero el texto en español.", "error");
      return;
    }
    setOcupado(true);
    setFallos([]);
    try {
      if (!(await guardar())) return;
      const gl = (glosario.data ?? []).map((g) => ({ es: g.termino_es, en: g.termino_en }));
      const en: Record<string, string> = {};
      const warns: Record<string, string> = {};
      const malos: string[] = [];
      for (let i = 0; i < items.length; i += LOTE) {
        const res = await traducirConPilo(u.ciclo.id, items.slice(i, i + LOTE), gl);
        res.traducciones.forEach((t) => {
          en[t.ref] = t.en;
          if (t.warn) warns[t.ref] = t.warn;
        });
        res.fallos.forEach((f) => malos.push(`${f.ref}: ${f.error}`));
      }
      const guardables: { campo: string; en?: string; filas?: FilaTabla[]; origen: "pilo" }[] = [];
      const nuevosEn = { ...b.textos_en };
      for (const c of traducibles) if (en[c.k] !== undefined) { nuevosEn[c.k] = en[c.k]; guardables.push({ campo: c.k, en: en[c.k], origen: "pilo" }); }
      const nuevasTablas = { ...b.tablas_en };
      for (const t of tablasTexto) {
        const filas: FilaTabla[] = (b.tablas[t.k] ?? []).map((f, i) => {
          const o: FilaTabla = {};
          for (const c of t.columnas) if (c.tipo === "texto") o[c.k] = en[`tabla:${t.k}:${i}:${c.k}`] ?? String(b.tablas_en[t.k]?.[i]?.[c.k] ?? "");
          return o;
        });
        if (filas.some((f) => Object.values(f).some((v) => v))) { nuevasTablas[t.k] = filas; guardables.push({ campo: `tabla:${t.k}`, filas, origen: "pilo" }); }
      }
      if (guardables.length) {
        const ok = await u.hacer(() => guardarTrad.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id, items: guardables }), "Pilo tradujo. Revise el inglés antes de enviar.");
        if (ok) cambiar((x) => ({ ...x, textos_en: nuevosEn, tablas_en: nuevasTablas }));
      }
      setAvisos(warns);
      setFallos(malos);
      setLeida(false);
    } catch (e) {
      u.avisar(mensajeDe(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const marcar = async () => {
    if (sucio && !(await guardar())) return;
    await u.hacer(() => revisada.mutateAsync({ ciclo: u.ciclo.id, respuesta: r.id }), "Traducción marcada como revisada.");
  };

  if (!traducibles.length && !tablasTexto.length) return <Alerta>Este indicador no lleva texto que traducir.</Alerta>;
  const faltan = pend.data?.length ?? 0;

  return (
    <div className="ugm-form">
      <div className="ugm-acciones">
        {editable && (
          <button type="button" className="ugm-btn ugm-btn--pri" disabled={ocupado} onClick={() => void traducir()}>
            <Icon name="spark" size={16} /> {ocupado ? "Pilo está traduciendo…" : "Traducir con Pilo"}
          </button>
        )}
        <span className={`ugm-etq ${faltan ? "ugm-etq--aviso" : "ugm-etq--ok"}`}>
          {pend.isLoading ? "Revisando…" : faltan ? `${faltan} ${faltan === 1 ? "campo" : "campos"} sin revisar` : "Traducción revisada"}
        </span>
      </div>
      {fallos.length > 0 && (
        <Alerta tipo="error">
          Pilo no pudo con: {fallos.join("; ")}. Escriba esa traducción a mano.
        </Alerta>
      )}
      {traducibles.map((c) => {
        const id = `en-${c.k}`;
        const es = b.textos_es[c.k] ?? "";
        return (
          <div key={c.k} className="ugm-par">
            <div className="ugm-par__es">
              <span className="ugm-et">Original en español</span>
              <p>{es || <span className="ugm-muted">Sin texto todavía.</span>}</p>
            </div>
            <Campo id={id} etiqueta={`${c.en} · ${estadoDe(c.k)}`}>
              <textarea id={id} lang="en" className="ugm-input ugm-area" rows={5} value={b.textos_en[c.k] ?? ""} readOnly={!editable} onChange={(e) => cambiar((x) => ({ ...x, textos_en: { ...x.textos_en, [c.k]: e.target.value } }))} />
              {avisos[c.k] && <span className="ugm-falta">Pilo avisa: {avisos[c.k]}</span>}
            </Campo>
          </div>
        );
      })}
      {tablasTexto.map((t) => {
        const es = b.tablas[t.k] ?? [];
        const en = Array.from({ length: es.length }, (_, i) => b.tablas_en[t.k]?.[i] ?? {});
        return <TablaEditor key={t.k} t={t} en filas={en} editable={editable} onChange={(f) => cambiar((x) => ({ ...x, tablas_en: { ...x.tablas_en, [t.k]: f } }))} />;
      })}
      {editable && (
        <section className="ugm-revision-humana">
          <h3>Revisión humana</h3>
          <p className="ugm-muted">Nadie envía una traducción de máquina sin leerla. Si cambia el español o el inglés, hay que revisarla otra vez.</p>
          <label className="ugm-check">
            <input type="checkbox" checked={leida} onChange={(e) => setLeida(e.target.checked)} />
            <span>Leí la traducción completa; las cifras, siglas y nombres propios coinciden con el original.</span>
          </label>
          <button type="button" className="ugm-btn" disabled={!leida || revisada.isPending || ocupado} onClick={() => void marcar()}>
            <Icon name="check" size={16} /> Marcar como revisada
          </button>
        </section>
      )}
    </div>
  );
}
