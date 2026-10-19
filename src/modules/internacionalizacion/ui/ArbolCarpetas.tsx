/* =============================================================================
   Internacionalización · el árbol de carpetas (0166).

   La barra lateral del explorador: «Todas las tablas», «Multicampus», las
   carpetas con sus subcarpetas, «Sin carpeta». Quien puede crear (Director,
   Planeación o un Coordinador) añade carpetas; quien las creó (o el Director y
   Planeación) las renombra, las mueve o las borra si están vacías. La base
   comprueba permisos, ciclos y los 5 niveles; aquí solo se evita ofrecer lo
   imposible. Sin animación en el árbol: se usa muchas veces al día.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useActualizarCarpeta, useBorrarCarpeta, useCrearCarpeta } from "../datos";
import { aplanar, armarArbol, carpetaVacia, librosDe, librosEnRama, nombreCarpetaValido, puedeCrearDentro, puedeMoverCarpeta, rutaDe } from "../lib/carpetas";
import type { NodoCarpeta } from "../lib/carpetas";
import type { IntCarpetaRow, IntLibroRow } from "../tipos";
import type { useAviso } from "./comunes";

/** Lo que el explorador puede tener elegido: una vista especial o el id de una carpeta. */
export type SeleccionCarpeta = "todas" | "multicampus" | "sin" | (string & {});

type LibroMin = Pick<IntLibroRow, "id" | "carpeta_id" | "captura">;

type Formulario = { modo: "nueva"; parent: string | null } | { modo: "editar"; id: string };

export function ArbolCarpetas({
  carpetas,
  libros,
  seleccion,
  onElegir,
  puedeCrear,
  puedeCambiar,
  aviso,
  nuevaPedida = 0,
}: {
  carpetas: IntCarpetaRow[];
  libros: LibroMin[];
  seleccion: SeleccionCarpeta;
  onElegir: (id: SeleccionCarpeta) => void;
  puedeCrear: boolean;
  /** ¿Puede renombrar, mover o borrar esta carpeta? (su autora, el Director o Planeación). */
  puedeCambiar: (c: IntCarpetaRow) => boolean;
  aviso: ReturnType<typeof useAviso>;
  /** Cada vez que sube, abre el formulario de carpeta nueva (lo pide el menú «Nuevo»). */
  nuevaPedida?: number;
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(rutaDe(carpetas, seleccion).map((c) => c.id)));
  const [form, setForm] = useState<Formulario | null>(null);
  const arbol = armarArbol(carpetas);

  useEffect(() => {
    if (nuevaPedida > 0) setForm({ modo: "nueva", parent: carpetas.some((c) => c.id === seleccion) ? seleccion : null });
  }, [nuevaPedida]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reacciona a la petición

  const alternar = (id: string) =>
    setAbiertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const multi = libros.filter((l) => l.captura === "multicampus").length;
  const sin = librosDe(libros, null).length;

  const nodo = (n: NodoCarpeta<IntCarpetaRow>) => {
    const c = n.carpeta;
    const abierta = abiertas.has(c.id);
    const cuenta = librosEnRama(libros, carpetas, c.id).length;
    const activa = seleccion === c.id;
    return (
      <li key={c.id} className="it-arbol__nodo">
        <div className="it-arbol__fila" data-activa={activa} style={{ paddingLeft: 6 + (n.nivel - 1) * 14 }}>
          {n.hijas.length ? (
            <button type="button" className="it-arbol__tog" aria-expanded={abierta} aria-label={`${abierta ? "Cerrar" : "Abrir"} ${c.nombre}`} onClick={() => alternar(c.id)}>
              <Icon name={abierta ? "chevron-down" : "chevron-right"} size={14} />
            </button>
          ) : (
            <span className="it-arbol__tog" aria-hidden="true" />
          )}
          <button type="button" className="it-arbol__ir" aria-current={activa ? "page" : undefined} onClick={() => onElegir(c.id)}>
            <Icon name="folder" size={16} />
            <span className="it-arbol__nm">{c.nombre}</span>
            <span className="it-arbol__n it-num">{cuenta}</span>
          </button>
          {puedeCrear && puedeCrearDentro(carpetas, c.id) ? (
            <button
              type="button"
              className="it-arbol__mas"
              aria-label={`Nueva subcarpeta en ${c.nombre}`}
              title="Nueva subcarpeta"
              onClick={() => {
                setForm({ modo: "nueva", parent: c.id });
                setAbiertas((a) => new Set(a).add(c.id));
              }}
            >
              <Icon name="plus" size={14} />
            </button>
          ) : null}
          {puedeCambiar(c) ? (
            <button type="button" className="it-arbol__mas" aria-label={`Cambiar la carpeta ${c.nombre}`} title="Renombrar, mover o borrar" onClick={() => setForm({ modo: "editar", id: c.id })}>
              <Icon name="pen" size={14} />
            </button>
          ) : null}
        </div>
        {abierta && n.hijas.length ? <ul className="it-arbol__lista">{n.hijas.map(nodo)}</ul> : null}
      </li>
    );
  };

  return (
    <nav className="it-arbol" aria-label="Carpetas de tablas">
      <button type="button" className="it-arbol__top" aria-current={seleccion === "todas" ? "page" : undefined} onClick={() => onElegir("todas")}>
        <Icon name="table" size={16} />
        <span className="it-arbol__nm">Todas las tablas</span>
        <span className="it-arbol__n it-num">{libros.length}</span>
      </button>
      <button type="button" className="it-arbol__top" aria-current={seleccion === "multicampus" ? "page" : undefined} onClick={() => onElegir("multicampus")}>
        <Icon name="users" size={16} />
        <span className="it-arbol__nm">Multicampus</span>
        <span className="it-arbol__n it-num">{multi}</span>
      </button>

      <div className="it-arbol__rot">Carpetas</div>
      {arbol.length ? <ul className="it-arbol__lista">{arbol.map(nodo)}</ul> : <p className="it-arbol__vacio">Todavía no hay carpetas.</p>}
      <button type="button" className="it-arbol__top it-arbol__top--sin" aria-current={seleccion === "sin" ? "page" : undefined} onClick={() => onElegir("sin")}>
        <Icon name="folder" size={16} />
        <span className="it-arbol__nm">Sin carpeta</span>
        <span className="it-arbol__n it-num">{sin}</span>
      </button>

      {puedeCrear && !form ? (
        <button type="button" className="it-arbol__nueva" onClick={() => setForm({ modo: "nueva", parent: carpetas.some((c) => c.id === seleccion) ? seleccion : null })}>
          <Icon name="plus" size={14} />
          Nueva carpeta
        </button>
      ) : null}

      {form ? <FormularioCarpeta key={form.modo === "editar" ? form.id : `nueva-${form.parent ?? "raiz"}`} form={form} carpetas={carpetas} libros={libros} onCerrar={() => setForm(null)} onElegir={onElegir} seleccion={seleccion} aviso={aviso} /> : null}
    </nav>
  );
}

function FormularioCarpeta({
  form,
  carpetas,
  libros,
  onCerrar,
  onElegir,
  seleccion,
  aviso,
}: {
  form: Formulario;
  carpetas: IntCarpetaRow[];
  libros: LibroMin[];
  onCerrar: () => void;
  onElegir: (id: SeleccionCarpeta) => void;
  seleccion: SeleccionCarpeta;
  aviso: ReturnType<typeof useAviso>;
}) {
  const crear = useCrearCarpeta();
  const actualizar = useActualizarCarpeta();
  const borrar = useBorrarCarpeta();
  const actual = form.modo === "editar" ? carpetas.find((c) => c.id === form.id) : undefined;
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [padre, setPadre] = useState<string | null>(form.modo === "editar" ? (actual?.parent_id ?? null) : form.parent);
  const [error, setError] = useState<string | null>(null);
  const ocupado = crear.isPending || actualizar.isPending || borrar.isPending;

  // Dónde se puede poner: sin pasar de 5 niveles y, al mover, sin entrar en sí misma ni en sus subcarpetas.
  const destinos = aplanar(armarArbol(carpetas)).filter(({ carpeta }) =>
    form.modo === "editar" ? puedeMoverCarpeta(carpetas, form.id, carpeta.id) : puedeCrearDentro(carpetas, carpeta.id),
  );
  const etiqueta = (id: string) => rutaDe(carpetas, id).map((c) => c.nombre).join(" / ");

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const limpio = nombreCarpetaValido(carpetas, padre, nombre, actual?.id);
    if (!limpio) return setError(nombre.trim() ? "Ya hay una carpeta con ese nombre en este lugar." : "Escriba el nombre de la carpeta.");
    if (form.modo === "nueva") {
      crear.mutate(
        { nombre: limpio, parent_id: padre },
        {
          onSuccess: (id) => {
            aviso.ok(`Carpeta «${limpio}» creada.`);
            onElegir(id);
            onCerrar();
          },
          onError: (err) => setError(err.message),
        },
      );
    } else {
      actualizar.mutate(
        { id: form.id, nombre: limpio, parent_id: padre },
        {
          onSuccess: () => {
            aviso.ok("Carpeta actualizada.");
            onCerrar();
          },
          onError: (err) => setError(err.message),
        },
      );
    }
  };

  const vacia = actual ? carpetaVacia(libros, carpetas, actual.id) : false;
  const quitar = () => {
    if (!actual) return;
    borrar.mutate(actual.id, {
      onSuccess: () => {
        aviso.ok(`Se borró la carpeta «${actual.nombre}».`);
        if (seleccion === actual.id) onElegir(actual.parent_id ?? "todas");
        onCerrar();
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <form className="it-arbol__form" onSubmit={guardar} aria-label={form.modo === "nueva" ? "Nueva carpeta" : "Cambiar carpeta"}>
      <b>{form.modo === "nueva" ? "Nueva carpeta" : "Cambiar carpeta"}</b>
      <label className="it-campo">
        <span>Nombre</span>
        <input data-autofocus type="text" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label className="it-campo">
        <span>{form.modo === "nueva" ? "Dentro de" : "Mover a"}</span>
        <select value={padre ?? ""} onChange={(e) => setPadre(e.target.value || null)}>
          <option value="">Primer nivel</option>
          {destinos.map(({ carpeta }) => (
            <option key={carpeta.id} value={carpeta.id}>
              {etiqueta(carpeta.id)}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="it-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="it-arbol__acc">
        <button type="submit" className="es-btn es-btn--pri es-btn--sm" disabled={ocupado}>
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="es-btn es-btn--sm" onClick={onCerrar}>
          Cancelar
        </button>
        {actual ? (
          <button type="button" className="es-btn es-btn--sm" disabled={!vacia || ocupado} title={vacia ? undefined : "Solo se borra una carpeta vacía: mueva antes sus tablas y subcarpetas."} onClick={quitar}>
            <Icon name="trash" size={14} />
            Borrar
          </button>
        ) : null}
      </div>
    </form>
  );
}
