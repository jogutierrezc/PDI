/* Las cifras de una sección de resultados: vivas o fotografiadas, con su
   fuente, el aviso «cambió», la justificación que pide Planeación y los datos
   propios de la unidad (con fuente y pilar). */

import { useState } from "react";
import { ETIQUETA_FUENTE, esViva, formatoCifra, numeroDe, semaforo, variacion } from "../cifras-vivas";
import type { CifraVista } from "../cifras-vivas";
import type { DatosCifra } from "../datos";
import { DIMS } from "../plantillas";
import type { CifraRow, DimId, FuenteTipo, PilarRef } from "../types";
import { SemaforoPill, fmtFecha } from "./comunes";

const TIPOS: FuenteTipo[] = ["auto", "pdi", "excel", "manual", "url"];


function Candado() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

/** Fuente de la cifra: estado (en vivo, foto, propia), nombre, corte y el editor de la fuente. */
function Fuente({ c, editable, guardar }: { c: CifraVista; editable: boolean; guardar: (d: DatosCifra) => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      {c.cambio && editable && (
        <div className="inf-chg" role="status">
          Cambió desde que lo revisó:{" "}
          <b className="inf-num">
            {formatoCifra(c.cambio.de, c.unidad)} → {formatoCifra(c.cambio.a, c.unidad)}
          </b>
          <button type="button" className="inf-link" onClick={() => guardar({ visto: c.cambio?.a ?? null })}>
            Aceptar
          </button>
        </div>
      )}
      <div className="inf-tile__s">
        {c.congelada ? (
          <span className="inf-pill">Foto del {fmtFecha(c.corte)}</span>
        ) : c.viva ? (
          <span className="inf-pill is-teal">
            <i className="inf-live" aria-hidden="true" />
            En vivo
          </span>
        ) : (
          <span className="inf-pill is-own">Fuente propia</span>
        )}
        <span>
          {c.fuente || "Sin nombre de fuente"}
          {c.viva && c.corte ? ` · corte ${fmtFecha(c.corte)}` : ""}
        </span>
        {editable && (
          <button type="button" className="inf-link" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
            {abierta ? "Cerrar" : "Cambiar fuente"}
          </button>
        )}
      </div>
      {editable && abierta && <EditorFuente c={c} guardar={guardar} />}
    </>
  );
}

function EditorFuente({ c, guardar }: { c: CifraVista; guardar: (d: DatosCifra) => void }) {
  const propia = !esViva(c.fuenteTipo);
  const n = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  return (
    <div className="inf-srced">
      <select className="inf-in" value={c.fuenteTipo} onChange={(e) => guardar({ fuente_tipo: e.target.value as FuenteTipo })} aria-label="Fuente">
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_FUENTE[t]}
          </option>
        ))}
      </select>
      {propia && (
        <>
          <input
            className="inf-in"
            defaultValue={c.fuente}
            placeholder="Nombre de la fuente (obligatorio)"
            aria-label="Nombre de la fuente"
            onBlur={(e) => e.target.value !== c.fuente && guardar({ fuente_nombre: e.target.value.trim() })}
          />
          <input className="inf-in inf-num" inputMode="decimal" defaultValue={n(c.valor)} aria-label="Valor" onBlur={(e) => guardar({ valor: numeroDe(e.target.value) })} />
          <span className="inf-hint">Un dato propio queda marcado en el informe como «fuente propia». El archivo de soporte va en Evidencias.</span>
        </>
      )}
      <div className="inf-form">
        <label className="inf-lab">
          Valor 2025
          <input className="inf-in inf-num" inputMode="decimal" defaultValue={n(c.anterior)} onBlur={(e) => guardar({ anterior: numeroDe(e.target.value) })} />
        </label>
        <label className="inf-lab">
          Meta
          <input className="inf-in inf-num" inputMode="decimal" defaultValue={n(c.meta)} onBlur={(e) => guardar({ meta: numeroDe(e.target.value) })} />
        </label>
      </div>
    </div>
  );
}

export function TileCifra({ c, editable, guardar }: { c: CifraVista; editable: boolean; guardar: (d: DatosCifra) => void }) {
  const [nota, setNota] = useState(c.justificacion);
  const delta = variacion(c.valor, c.anterior, c.unidad);
  const pide = c.condicion === "justificar";
  return (
    <div className={`inf-tile${c.incluida ? "" : " is-off"}`}>
      <div className="inf-tile__top">
        <span className="inf-tile__l">{c.etiqueta}</span>
        {pide ? (
          <span className="inf-lock" title="Planeación pide este dato">
            <Candado /> Lo pide Planeación
          </span>
        ) : (
          <label className="inf-chk">
            <input type="checkbox" checked={c.incluida} disabled={!editable} onChange={(e) => guardar({ incluida: e.target.checked })} /> Incluir
          </label>
        )}
      </div>
      <div className="inf-tile__v inf-num">
        {formatoCifra(c.valor)}
        <small>{c.unidad}</small>
      </div>
      <div className="inf-tile__cmp inf-num">
        <span>2025: {formatoCifra(c.anterior, c.unidad)}</span>
        {delta && <span>{delta}</span>}
        {c.meta !== null && <span>Meta {formatoCifra(c.meta, c.unidad)}</span>}
        <SemaforoPill s={semaforo(c.valor, c.meta, c.mayorMejor)} />
      </div>
      <Fuente c={c} editable={editable} guardar={guardar} />
      {c.incluida && pide && (
        <input
          className={`inf-just${nota.trim() ? "" : " is-need"}`}
          value={nota}
          readOnly={!editable}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => nota !== c.justificacion && guardar({ justificacion: nota.trim() })}
          placeholder="Explique este resultado en una línea"
          aria-label={`Justificación de ${c.etiqueta}`}
        />
      )}
    </div>
  );
}

function TilePropia({ c, fila, pilares, editable, quitar }: { c: CifraVista; fila: CifraRow; pilares: PilarRef[]; editable: boolean; quitar: () => void }) {
  const pilar = pilares.find((p) => p.id === fila.pilar);
  return (
    <div className="inf-tile is-own">
      <div className="inf-tile__top">
        <span className="inf-tile__l">{c.etiqueta}</span>
        <span className="inf-pill is-own">Dato propio</span>
      </div>
      <div className="inf-tile__v inf-num">
        {formatoCifra(c.valor)}
        <small>{c.unidad}</small>
      </div>
      <div className="inf-tile__s">
        Fuente: {c.fuente || "—"} · Pilar: {pilar ? `${pilar.numeral}. ${pilar.name}` : "sin pilar"}
      </div>
      {editable && (
        <button type="button" className="inf-link" style={{ justifySelf: "start" }} onClick={quitar}>
          Quitar
        </button>
      )}
    </div>
  );
}

export interface NuevoPropio {
  etiqueta: string;
  valor: number;
  fuente: string;
  pilar: string | null;
}

function FormPropio({ exigirFuente, exigirPilar, pilares, agregar, cancelar }: { exigirFuente: boolean; exigirPilar: boolean; pilares: PilarRef[]; agregar: (p: NuevoPropio) => void; cancelar: () => void }) {
  const [f, setF] = useState({ etiqueta: "", valor: "", fuente: "", pilar: "" });
  const [error, setError] = useState("");
  const enviar = () => {
    const valor = numeroDe(f.valor);
    if (!f.etiqueta.trim() || valor === null) return setError("Ponga nombre y un valor numérico.");
    if (exigirFuente && !f.fuente.trim()) return setError("Falta la fuente.");
    if (exigirPilar && !f.pilar) return setError("Elija el pilar del PDI.");
    agregar({ etiqueta: f.etiqueta.trim(), valor, fuente: f.fuente.trim(), pilar: f.pilar || null });
  };
  return (
    <div className="inf-own-form">
      <label className="inf-lab">
        Nombre del dato
        <input className="inf-in" value={f.etiqueta} onChange={(e) => setF({ ...f, etiqueta: e.target.value })} placeholder="Ej.: Estudiantes en movilidad" />
      </label>
      <label className="inf-lab">
        Valor
        <input className="inf-in inf-num" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="Ej.: 38" />
      </label>
      <label className="inf-lab">
        Fuente{exigirFuente ? " (obligatoria)" : ""}
        <input className="inf-in" value={f.fuente} onChange={(e) => setF({ ...f, fuente: e.target.value })} placeholder="Ej.: Oficina de Internacionalización" />
      </label>
      <label className="inf-lab">
        Pilar del PDI{exigirPilar ? " (obligatorio)" : ""}
        <select className="inf-in" value={f.pilar} onChange={(e) => setF({ ...f, pilar: e.target.value })}>
          <option value="">Sin pilar</option>
          {pilares.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numeral}. {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="acts">
        <button type="button" className="inf-btn inf-btn--pri inf-btn--sm" onClick={enviar}>
          Añadir
        </button>
        <button type="button" className="inf-btn inf-btn--sm" onClick={cancelar}>
          Cancelar
        </button>
        {error && (
          <span className="inf-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** El bloque automático de una sección de resultados. */
export function BloqueCifras({
  dims,
  vista,
  propias,
  editable,
  limite,
  exigirFuente,
  exigirPilar,
  pilares,
  guardar,
  agregarPropio,
  quitarPropio,
}: {
  dims: DimId[];
  vista: (clave: string) => CifraVista;
  propias: { fila: CifraRow; vista: CifraVista }[];
  editable: boolean;
  limite: number;
  exigirFuente: boolean;
  exigirPilar: boolean;
  pilares: PilarRef[];
  guardar: (clave: string, d: DatosCifra) => void;
  agregarPropio: (p: NuevoPropio) => void;
  quitarPropio: (clave: string) => void;
}) {
  const [form, setForm] = useState(false);
  return (
    <div className="inf-autobox">
      {dims.map((d, i) => {
        const cifras = DIMS[d].cifras.map(vista).filter((c) => c.condicion !== "no");
        return (
          <div key={d}>
            <h4 className="inf-eyebrow">{DIMS[d].titulo}</h4>
            <div className="inf-tiles">
              {cifras.map((c) => (
                <TileCifra key={c.clave} c={c} editable={editable} guardar={(x) => guardar(c.clave, x)} />
              ))}
              {i === dims.length - 1 &&
                propias.map((p) => <TilePropia key={p.fila.clave} c={p.vista} fila={p.fila} pilares={pilares} editable={editable} quitar={() => quitarPropio(p.fila.clave)} />)}
            </div>
          </div>
        );
      })}
      {editable && (
        <div className="inf-row" style={{ marginTop: "var(--space-4)" }}>
          <button type="button" className="inf-btn inf-btn--sm" onClick={() => setForm(true)} disabled={propias.length >= limite || form}>
            Añadir un dato propio
          </button>
          <span className="inf-hint inf-num">
            {propias.length} de {limite} datos propios que permite Planeación
          </span>
        </div>
      )}
      {editable && form && (
        <FormPropio
          exigirFuente={exigirFuente}
          exigirPilar={exigirPilar}
          pilares={pilares}
          cancelar={() => setForm(false)}
          agregar={(p) => {
            agregarPropio(p);
            setForm(false);
          }}
        />
      )}
    </div>
  );
}
