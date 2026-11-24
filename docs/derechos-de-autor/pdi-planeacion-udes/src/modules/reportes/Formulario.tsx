/* =============================================================================
   Formulario: un registro a la vez, agrupado como la plantilla (campo.grupo).
   Para quien reporta pocos registros. Lo que no aplica no estorba:
   · el municipio de nacimiento solo se llena si el país es Colombia;
   · el año y el semestre de primer curso solo aparecen si es reintegro;
   · el municipio donde estudia se limita a donde el programa tiene registro.
   Quitar un registro se confirma en el mismo sitio, nunca con un modal.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ayudas, motor } from "./motor";
import type { Campo, Contexto, Fila, PlantillaSpec } from "./tipos";
import type { ErroresPorFila } from "./Hoja";
import { vacio } from "./util";

interface FormularioProps {
  spec: PlantillaSpec;
  filas: Fila[];
  indice: number;
  setIndice: (i: number) => void;
  ctx: Contexto;
  errores: ErroresPorFila;
  soloLectura: boolean;
  onCambiar: (fila: number, campo: string, valor: string) => void;
  onNuevo: () => void;
  onQuitar: (fila: number) => void;
}

const esCatalogo = (c: Campo, cat: string) => c.fuente?.tipo === "catalogo" && c.fuente.catalogo === cat;
const deNacimiento = (c: Campo) => /NACIMIENTO/.test(c.codigo);

/** Qué campos se ocultan, cuáles se deshabilitan y qué opciones se filtran, según la fila. */
function reglasDeVista(spec: PlantillaSpec, fila: Fila, ctx: Contexto) {
  const ocultos = new Set<string>();
  const deshabilitados = new Set<string>();
  const notas: Record<string, string> = {};
  const oferta: Record<string, Set<string>> = {};
  const campos = spec.campos;
  const resolver = (c: Campo) => (c.fuente && !vacio(fila[c.codigo]) ? ayudas.resolver(c.fuente, fila[c.codigo], ctx) : null);

  // País de nacimiento → municipio de nacimiento.
  const pais = campos.find((c) => esCatalogo(c, "pais") && deNacimiento(c));
  const munNac = campos.find((c) => esCatalogo(c, "municipio") && deNacimiento(c));
  if (pais && munNac) {
    const p = resolver(pais);
    if (!(p && p.codigo === "170")) {
      if (vacio(fila[munNac.codigo])) deshabilitados.add(munNac.codigo);
      notas[munNac.codigo] = "Solo si nació en Colombia.";
    }
  }

  // Reintegro → año y semestre de primer curso.
  const reintegro = campos.find((c) => /REINTEGRO/.test(c.codigo));
  if (reintegro) {
    const r = resolver(reintegro);
    if (!(r && r.codigo === "S"))
      for (const c of campos) if (/PRIMER_CURSO/.test(c.codigo) && vacio(fila[c.codigo])) ocultos.add(c.codigo);
  }

  // Programa → municipios donde se ofrece.
  const programa = campos.find((c) => esCatalogo(c, "programa"));
  const munOferta = campos.find((c) => esCatalogo(c, "municipio") && !deNacimiento(c));
  if (programa && munOferta) {
    const p = resolver(programa);
    const lista = p?.item?.oferta;
    if (p && lista && lista.length) {
      oferta[munOferta.codigo] = new Set(lista);
      notas[munOferta.codigo] = `Donde ${p.nombre} tiene registro calificado.`;
    }
  }
  return { ocultos, deshabilitados, notas, oferta };
}

export function Formulario({ spec, filas, indice, setIndice, ctx, errores, soloLectura, onCambiar, onNuevo, onQuitar }: FormularioProps) {
  const [confirmar, setConfirmar] = useState(false);
  const i = Math.max(0, Math.min(indice, filas.length - 1));
  const fila = filas[i];

  const opciones = useMemo(() => {
    const out: Record<string, { codigo: string; nombre: string }[]> = {};
    for (const c of spec.campos) if (c.fuente) out[c.codigo] = motor.opciones(c.fuente, ctx);
    return out;
  }, [spec, ctx]);

  const grupos = useMemo(() => {
    const orden: string[] = [];
    for (const c of spec.campos) if (!orden.includes(c.grupo)) orden.push(c.grupo);
    return orden.map((g) => ({ grupo: g, campos: spec.campos.filter((c) => c.grupo === g) }));
  }, [spec]);

  if (!fila) {
    return (
      <div className="ri-form">
        <p className="ri-hint">Todavía no hay registros en esta plantilla.</p>
        {!soloLectura && (
          <div>
            <button type="button" className="button-secondary ri-sm" onClick={onNuevo}>
              <Icon name="plus" size={16} />
              Nuevo registro
            </button>
          </div>
        )}
      </div>
    );
  }

  const vista = reglasDeVista(spec, fila, ctx);
  const errs = errores.get(i);
  const ir = (n: number) => {
    setConfirmar(false);
    setIndice(n);
  };

  return (
    <div className="ri-form">
      <div className="ri-rec">
        <button type="button" className="button-ghost ri-sm ri-icon" disabled={i === 0} aria-label="Registro anterior" onClick={() => ir(i - 1)}>
          <Icon name="arrow-left" size={15} />
        </button>
        <span>
          Registro <b className="ri-num">{i + 1}</b> de <b className="ri-num">{filas.length}</b>
        </span>
        <button
          type="button"
          className="button-ghost ri-sm ri-icon"
          disabled={i >= filas.length - 1}
          aria-label="Registro siguiente"
          onClick={() => ir(i + 1)}
        >
          <Icon name="arrow-right" size={15} />
        </button>
        {!soloLectura && (
          <>
            <button
              type="button"
              className="button-secondary ri-sm"
              onClick={() => {
                setConfirmar(false);
                onNuevo();
              }}
            >
              <Icon name="plus" size={16} />
              Nuevo registro
            </button>
            <button type="button" className="ri-link ri-link--danger ri-push" onClick={() => setConfirmar(true)}>
              Quitar este registro
            </button>
          </>
        )}
      </div>

      {confirmar && (
        <div className="ri-confirm" role="alert">
          <span>
            La fila {i + 1} sale de la plantilla {spec.nombre}.
          </span>
          <button
            type="button"
            className="button-secondary ri-sm"
            onClick={() => {
              setConfirmar(false);
              onQuitar(i);
            }}
          >
            Quitar fila
          </button>
          <button type="button" className="ri-link" onClick={() => setConfirmar(false)}>
            Cancelar
          </button>
        </div>
      )}

      {grupos.map(({ grupo, campos }) => {
        const visibles = campos.filter((c) => !vista.ocultos.has(c.codigo));
        if (visibles.length === 0) return null;
        return (
          <fieldset key={grupo} className="ri-fieldset">
            <legend>{grupo}</legend>
            {visibles.map((c) => {
              const id = `ri-f-${c.codigo}`;
              const valor = fila[c.codigo] ?? "";
              const msg = errs?.[c.codigo]?.[0];
              const nota = vista.notas[c.codigo] ?? c.ayuda;
              const deshabilitado = soloLectura || vista.deshabilitados.has(c.codigo);
              let control;
              if (c.fuente) {
                const filtro = vista.oferta[c.codigo];
                const lista = filtro ? opciones[c.codigo].filter((o) => filtro.has(o.codigo)) : opciones[c.codigo];
                const suelto = !vacio(valor) && !lista.some((o) => o.nombre === valor);
                control = (
                  <select id={id} value={valor} disabled={deshabilitado} aria-invalid={msg ? true : undefined} onChange={(e) => onCambiar(i, c.codigo, e.target.value)}>
                    <option value="">Elegir…</option>
                    {suelto && <option value={valor}>{valor}</option>}
                    {lista.map((o) => (
                      <option key={o.codigo} value={o.nombre}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                );
              } else {
                control = (
                  <input
                    id={id}
                    value={valor}
                    placeholder={c.placeholder}
                    readOnly={soloLectura}
                    disabled={!soloLectura && deshabilitado}
                    aria-invalid={msg ? true : undefined}
                    autoComplete="off"
                    inputMode={c.formato === "entero" || c.formato === "anio" || c.formato === "dinero" || c.formato === "telefono" ? "numeric" : undefined}
                    onChange={(e) => onCambiar(i, c.codigo, e.target.value)}
                  />
                );
              }
              return (
                <div className="ri-field" key={c.codigo} data-err={msg ? "" : undefined}>
                  <label htmlFor={id}>
                    {c.etiqueta}
                    {c.obligatorio && <span aria-hidden="true"> *</span>}
                    {c.obligatorio && <span className="sr-only"> (obligatorio)</span>}
                  </label>
                  {control}
                  {msg ? (
                    <span className="ri-msg">
                      <Icon name="alert" size={13} />
                      {msg}
                    </span>
                  ) : (
                    nota && <span className="ri-note">{nota}</span>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
