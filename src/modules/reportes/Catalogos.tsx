/* =============================================================================
   Catálogos: donde cada nombre que se ve en las hojas tiene su código oficial.
   · Sedes: el municipio (DIVIPOLA) de cada sede de la estructura
     institucional. De ahí sale la oferta al «Traer programas» (0104).
   · Programas, Municipios y Países se editan aquí: nombre, código,
     departamento (municipios) y sedes donde se ofrece (programas).
   · Los dominios del manual (tipo de documento, zona…) se consultan con
     candado: no se editan.
   · Al renombrar, las hojas que usaban el nombre viejo se actualizan
     (useRenombrarEnFilas) en todas las plantillas que usan ese catálogo.
   · «Quitar» se deshabilita si el ítem está en uso en las hojas del periodo.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { motor } from "./motor";
import { DOMINIOS } from "./snies/dominios";
import { PLANTILLAS } from "./snies/plantillas";
import {
  useCatalogos,
  useFilas,
  useGuardarItem,
  useImportarCatalogo,
  useGuardarSede,
  usePermisosReportes,
  useProgramasDesdeEstructura,
  useQuitarItem,
  useRenombrarEnFilas,
  useSedes,
} from "./store";
import type { Sede } from "./store";
import type { CatalogoId, ItemCatalogo, PeriodoCodigo } from "./tipos";
import { CATALOGOS_VACIOS, normalizarEncabezado, normalizarTexto, vacio } from "./util";

const CONFIG: Record<CatalogoId, { rotulo: string; codigo: string; formato: RegExp; mensaje: string }> = {
  // Igual que la base (0103): letras, números, guion y guion bajo, hasta 20.
  programa: {
    rotulo: "Programas",
    codigo: "Código SNIES",
    formato: /^[0-9A-Za-z_-]{1,20}$/,
    mensaje: "El código SNIES del programa lleva números o letras, sin espacios (hasta 20).",
  },
  municipio: { rotulo: "Municipios", codigo: "Código DIVIPOLA", formato: /^\d{5}$/, mensaje: "El código DIVIPOLA tiene 5 dígitos." },
  pais: { rotulo: "Países", codigo: "Código de país", formato: /^\d{3}$/, mensaje: "El código de país tiene 3 dígitos (Colombia es 170; Brasil, 076)." },
};
const EDITABLES: CatalogoId[] = ["programa", "municipio", "pais"];
const LOTE = 200;

/** Las plantillas que ya se capturan: de ellas sale el uso de cada ítem. */
const DISPONIBLES = PLANTILLAS.filter((p) => p.disponible);

/** Campo.codigo de todas las plantillas que llenan un catálogo. */
function camposDe(catalogo: CatalogoId): string[] {
  const out = new Set<string>();
  for (const p of PLANTILLAS)
    for (const c of p.campos) if (c.fuente?.tipo === "catalogo" && c.fuente.catalogo === catalogo) out.add(c.codigo);
  return [...out];
}

type Pestana = CatalogoId | "sedes" | `dominio:${string}`;

export function Catalogos({ periodo }: { periodo: PeriodoCodigo }) {
  const consulta = useCatalogos();
  const sedes = useSedes();
  const [pestana, setPestana] = useState<Pestana>("programa");
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  // Uso en las hojas del periodo: una consulta por plantilla disponible (lista fija).
  const hojas = DISPONIBLES.map((p) => ({ spec: p, q: useFilas(p.id, periodo) }));
  const firmaHojas = hojas.map((h) => h.q.dataUpdatedAt).join(",");
  const uso = useMemo(() => {
    const out: Record<CatalogoId, Map<string, number>> = { programa: new Map(), municipio: new Map(), pais: new Map() };
    for (const { spec, q: h } of hojas) {
      const filas = h.data?.filas ?? [];
      for (const c of spec.campos) {
        if (c.fuente?.tipo !== "catalogo") continue;
        const m = out[c.fuente.catalogo];
        for (const f of filas) {
          const v = f[c.codigo];
          if (!vacio(v)) m.set(v, (m.get(v) ?? 0) + 1);
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaHojas]);

  if (consulta.isPending) return <LoadingBlock rows={6} label="Cargando los catálogos" />;
  if (consulta.error) return <ErrorBlock error={consulta.error} onRetry={() => void consulta.refetch()} />;
  const catalogos = consulta.data ?? CATALOGOS_VACIOS;
  const dominios = Object.values(DOMINIOS);

  return (
    <div className="ri-admin">
      <p className="ri-hint">
        Cada nombre que se ve en las hojas tiene aquí su código oficial. Al cambiar un código, el archivo para HECAA sale con el
        nuevo sin tocar las hojas. Las tablas oficiales se descargan en HECAA › Administración › Descargar tablas de referencia.
      </p>

      <div className="ri-cat-tabs" role="tablist" aria-label="Catálogos">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "sedes"}
          onClick={() => {
            setPestana("sedes");
            setQ("");
          }}
        >
          Sedes <span className="ri-n">{sedes.data?.length ?? 0}</span>
        </button>
        {EDITABLES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => {
              setPestana(id);
              setQ("");
            }}
          >
            {CONFIG[id].rotulo} <span className="ri-n">{catalogos[id]?.length ?? 0}</span>
          </button>
        ))}
        {dominios.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={pestana === `dominio:${d.id}`}
            onClick={() => {
              setPestana(`dominio:${d.id}`);
              setQ("");
            }}
          >
            <Icon name="lock" size={12} />
            {d.etiqueta} <span className="ri-n">{d.valores.length}</span>
          </button>
        ))}
      </div>

      {aviso && (
        <p className="ri-aviso" role="status">
          <span>{aviso}</span>
          <button type="button" className="ri-icon-btn" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}>
            <Icon name="close" size={15} />
          </button>
        </p>
      )}

      {pestana === "sedes" ? (
        sedes.isPending ? (
          <LoadingBlock rows={4} label="Cargando las sedes" />
        ) : sedes.error ? (
          <ErrorBlock error={sedes.error} onRetry={() => void sedes.refetch()} />
        ) : (
          <TablaSedes sedes={sedes.data ?? []} municipios={catalogos.municipio ?? []} avisar={setAviso} />
        )
      ) : pestana.startsWith("dominio:") ? (
        <TablaDominio id={pestana.slice(8)} q={q} setQ={setQ} />
      ) : (
        <TablaCatalogo
          key={pestana}
          catalogo={pestana as CatalogoId}
          catalogos={catalogos}
          sedes={sedes.data ?? []}
          uso={uso[pestana as CatalogoId]}
          periodo={periodo}
          q={q}
          setQ={setQ}
          avisar={setAviso}
        />
      )}
    </div>
  );
}

/* ---------- sedes: el municipio de cada una ---------- */

function TablaSedes({ sedes, municipios, avisar }: { sedes: Sede[]; municipios: ItemCatalogo[]; avisar: (m: string | null) => void }) {
  const permisos = usePermisosReportes();
  const guardar = useGuardarSede();
  const opciones = useMemo(
    () =>
      municipios
        .map((m) => ({ codigo: m.codigo, etiqueta: motor.etiqueta(m) }))
        .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es")),
    [municipios],
  );
  const etiqueta = new Map(opciones.map((o) => [o.codigo, o.etiqueta]));

  function cambiar(sede: Sede, municipio: string) {
    avisar(null);
    guardar.mutate(
      { campus_id: sede.campus_id, municipio: municipio || null },
      {
        onSuccess: () =>
          avisar(
            municipio
              ? `${sede.nombre}: ${etiqueta.get(municipio) ?? municipio}. Traiga de nuevo los programas para actualizar su oferta.`
              : `${sede.nombre} quedó sin municipio.`,
          ),
        onError: (e) => avisar(e instanceof Error ? e.message : "No se pudo guardar la sede."),
      },
    );
  }

  return (
    <>
      <p className="ri-hint">
        Las sedes vienen de la estructura institucional. Su municipio es el que SNIES recibe como lugar donde se ofrece cada
        programa: «Traer programas de Estructura institucional» lo toma de aquí.
      </p>
      <div className="ri-catwrap">
        <table className="ri-cat">
          <thead>
            <tr>
              <th scope="col">Sede</th>
              <th scope="col">Municipio</th>
              <th scope="col">Código DIVIPOLA</th>
            </tr>
          </thead>
          <tbody>
            {sedes.map((sede) => (
              <tr key={sede.campus_id}>
                <td className="ri-ro">{sede.nombre}</td>
                <td className="ri-pad" data-err={sede.municipio ? undefined : ""}>
                  {permisos.catalogos ? (
                    <select
                      aria-label={`Municipio de la sede ${sede.nombre}`}
                      value={sede.municipio ?? ""}
                      disabled={guardar.isPending}
                      onChange={(e) => cambiar(sede, e.target.value)}
                    >
                      <option value="">Sin municipio</option>
                      {opciones.map((o) => (
                        <option key={o.codigo} value={o.codigo}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (sede.municipio ? etiqueta.get(sede.municipio) ?? sede.municipio : "Sin municipio")
                  )}
                  {!sede.municipio && <span className="ri-errmsg">Sin municipio: sus programas no llevan esta sede en la oferta.</span>}
                </td>
                <td className="ri-ro ri-code">{sede.municipio ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sedes.length === 0 && <p className="ri-sheet-empty">La estructura institucional no tiene sedes.</p>}
      </div>
    </>
  );
}

/* ---------- dominios del manual: solo lectura ---------- */

function TablaDominio({ id, q, setQ }: { id: string; q: string; setQ: (v: string) => void }) {
  const d = DOMINIOS[id];
  if (!d) return null;
  const n = normalizarTexto(q);
  const valores = d.valores.filter((v) => !n || normalizarTexto(`${v.nombre} ${v.codigo}`).includes(n));
  return (
    <>
      <div className="ri-toolbar">
        <label className="sr-only" htmlFor="ri-cat-q">
          Buscar en el catálogo
        </label>
        <input id="ri-cat-q" type="search" placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="ri-lock">
        <Icon name="lock" size={15} />
        <span>
          Valores fijados por el manual del SNIES ({d.seccion}). Se consultan aquí, pero no se editan.
        </span>
      </p>
      <div className="ri-catwrap">
        <table className="ri-cat">
          <thead>
            <tr>
              <th scope="col">Nombre que se ve en las hojas</th>
              <th scope="col">Código</th>
            </tr>
          </thead>
          <tbody>
            {valores.map((v) => (
              <tr key={v.codigo}>
                <td className="ri-ro">{v.nombre}</td>
                <td className="ri-ro ri-code">{v.codigo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- catálogos editables ---------- */

interface TablaCatalogoProps {
  catalogo: CatalogoId;
  catalogos: Record<CatalogoId, ItemCatalogo[]>;
  sedes: Sede[];
  uso: Map<string, number>;
  periodo: PeriodoCodigo;
  q: string;
  setQ: (v: string) => void;
  avisar: (m: string | null) => void;
}

function TablaCatalogo({ catalogo, catalogos, sedes, uso, periodo, q, setQ, avisar }: TablaCatalogoProps) {
  const cfg = CONFIG[catalogo];
  const items = catalogos[catalogo] ?? [];
  const [mostrar, setMostrar] = useState(LOTE);
  const [nuevo, setNuevo] = useState(false);
  const importar = useImportarCatalogo();
  const traer = useProgramasDesdeEstructura();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);

  const n = normalizarTexto(q);
  const filtrados = useMemo(
    () =>
      items
        .filter((it) => !n || normalizarTexto(`${it.nombre} ${it.codigo} ${it.departamento ?? ""}`).includes(n))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [items, n],
  );

  const municipios = catalogos.municipio ?? [];
  const etiquetaMunicipio = useMemo(() => new Map(municipios.map((m) => [m.codigo, motor.etiqueta(m)])), [municipios]);
  // La oferta se guarda en DIVIPOLA y se muestra como sede: el nombre de la
  // sede con ese municipio o, si no hay, el municipio.
  const etiquetaOferta = useMemo(() => {
    const out = new Map(etiquetaMunicipio);
    for (const sede of sedes) if (sede.municipio) out.set(sede.municipio, sede.nombre);
    return out;
  }, [etiquetaMunicipio, sedes]);

  async function importarTabla(archivo: File) {
    setTrabajando(true);
    avisar(null);
    try {
      const matriz = await motor.leerArchivo(archivo);
      const cabeza = (matriz[0] ?? []).map(normalizarEncabezado);
      const ci = cabeza.findIndex((h) => /^(ID_|COD|PRO_CONSECUTIVO)/.test(h));
      const ni = cabeza.findIndex((h, k) => k !== ci && /(DESC|NOMBRE|NOM_)/.test(h));
      const di = cabeza.findIndex((h) => /DEPART/.test(h));
      if (ci < 0 || ni < 0) {
        avisar("No encontré columnas de código y nombre. El archivo debe traer, por ejemplo, ID_MUNICIPIO y DESC_MUNICIPIO.");
        return;
      }
      let descartados = 0;
      const porCodigo = new Map(items.map((it) => [it.codigo, it]));
      const nuevos: ItemCatalogo[] = [];
      for (const fila of matriz.slice(1)) {
        // Excel se come los ceros a la izquierda («05001» → 5001, «076» → 76): se reponen.
        const crudo = String(fila[ci] ?? "").trim();
        const ancho = catalogo === "municipio" ? 5 : catalogo === "pais" ? 3 : 0;
        const codigo = ancho && /^\d+$/.test(crudo) && crudo.length < ancho ? crudo.padStart(ancho, "0") : crudo;
        const nombre = String(fila[ni] ?? "").trim();
        if (!codigo && !nombre) continue;
        if (!codigo || !nombre || !cfg.formato.test(codigo)) {
          descartados++;
          continue;
        }
        const previo = porCodigo.get(codigo);
        nuevos.push({
          catalogo,
          codigo,
          nombre,
          departamento: catalogo === "municipio" ? (di >= 0 ? String(fila[di] ?? "").trim() : previo?.departamento ?? null) : null,
          oferta: catalogo === "programa" ? previo?.oferta ?? [] : undefined,
          activo: true,
        });
      }
      const r = await importar.mutateAsync({ catalogo, items: nuevos });
      avisar(
        `${archivo.name}: ${r.nuevos} nuevos y ${r.actualizados} actualizados en ${cfg.rotulo.toLowerCase()}.` +
          (descartados ? ` ${descartados} filas sin código válido se dejaron fuera.` : ""),
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo importar la tabla.");
    } finally {
      setTrabajando(false);
    }
  }

  async function traerProgramas() {
    setTrabajando(true);
    avisar(null);
    try {
      const r = await traer.mutateAsync();
      avisar(
        `Estructura institucional: ${r.nuevos} programas nuevos y ${r.actualizados} actualizados.` + (r.aviso ? ` ${r.aviso}` : ""),
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudieron traer los programas.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      <div className="ri-toolbar">
        <label className="sr-only" htmlFor="ri-cat-q">
          Buscar en el catálogo
        </label>
        <input id="ri-cat-q" type="search" placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="button-secondary ri-sm" onClick={() => setNuevo(true)} disabled={nuevo}>
          <Icon name="plus" size={15} />
          Agregar
        </button>
        <button type="button" className="button-secondary ri-sm" disabled={trabajando} onClick={() => archivoRef.current?.click()}>
          <Icon name="upload" size={15} />
          Importar tabla
        </button>
        <input
          ref={archivoRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importarTabla(f);
          }}
        />
        {catalogo === "programa" && (
          <button type="button" className="button-ghost ri-sm" disabled={trabajando} onClick={() => void traerProgramas()}>
            <Icon name="layers" size={15} />
            Traer programas de Estructura institucional
          </button>
        )}
      </div>

      <div className="ri-catwrap">
        <table className="ri-cat">
          <thead>
            <tr>
              <th scope="col">Nombre que se ve en las hojas</th>
              <th scope="col">{cfg.codigo}</th>
              {catalogo === "municipio" && <th scope="col">Departamento</th>}
              {catalogo === "programa" && <th scope="col">Sedes</th>}
              <th scope="col">En uso · {periodo}</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {nuevo && (
              <FilaItem
                key="nuevo"
                catalogo={catalogo}
                item={{ catalogo, codigo: "", nombre: "", departamento: catalogo === "municipio" ? "" : null, oferta: catalogo === "programa" ? [] : undefined, activo: true }}
                esNuevo
                items={items}
                usos={0}
                etiquetaMunicipio={etiquetaOferta}
                municipios={municipios}
                sedes={sedes}
                avisar={avisar}
                onFin={() => setNuevo(false)}
              />
            )}
            {filtrados.slice(0, mostrar).map((it) => (
              <FilaItem
                key={it.codigo}
                catalogo={catalogo}
                item={it}
                items={items}
                usos={uso.get(motor.etiqueta(it)) ?? 0}
                etiquetaMunicipio={etiquetaOferta}
                municipios={municipios}
                sedes={sedes}
                avisar={avisar}
              />
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && !nuevo && <p className="ri-sheet-empty">{q ? "Nada coincide con la búsqueda." : "El catálogo está vacío."}</p>}
      </div>
      {filtrados.length > mostrar && (
        <div>
          <button type="button" className="ri-link" onClick={() => setMostrar(mostrar + LOTE)}>
            Ver {Math.min(LOTE, filtrados.length - mostrar)} más de {filtrados.length - mostrar} restantes
          </button>
        </div>
      )}
    </>
  );
}

interface FilaItemProps {
  catalogo: CatalogoId;
  item: ItemCatalogo;
  items: ItemCatalogo[];
  usos: number;
  esNuevo?: boolean;
  /** DIVIPOLA → nombre de la sede (o del municipio si no hay sede). */
  etiquetaMunicipio: Map<string, string>;
  municipios: ItemCatalogo[];
  sedes: Sede[];
  avisar: (m: string | null) => void;
  onFin?: () => void;
}

function FilaItem({ catalogo, item, items, usos, esNuevo, etiquetaMunicipio, municipios, sedes, avisar, onFin }: FilaItemProps) {
  const cfg = CONFIG[catalogo];
  const guardar = useGuardarItem();
  const quitar = useQuitarItem();
  const renombrar = useRenombrarEnFilas();
  const [borrador, setBorrador] = useState({ nombre: item.nombre, codigo: item.codigo, departamento: item.departamento ?? "" });
  const [confirmar, setConfirmar] = useState(false);

  // Errores del borrador: vacío, formato y código repetido.
  const errNombre = vacio(borrador.nombre) ? "Falta el nombre." : null;
  const errCodigo = vacio(borrador.codigo)
    ? "Falta el código."
    : !cfg.formato.test(borrador.codigo.trim())
      ? cfg.mensaje
      : items.some((o) => o.codigo === borrador.codigo.trim() && o.codigo !== item.codigo)
        ? "Ese código ya está en el catálogo."
        : null;
  const cambio =
    borrador.nombre.trim() !== item.nombre ||
    borrador.codigo.trim() !== item.codigo ||
    (catalogo === "municipio" && borrador.departamento.trim() !== (item.departamento ?? ""));

  async function confirmarCambios(extra?: Partial<ItemCatalogo>) {
    if (errNombre || errCodigo) return;
    if (!cambio && !extra) return;
    const siguiente: ItemCatalogo = {
      ...item,
      nombre: borrador.nombre.trim(),
      codigo: borrador.codigo.trim(),
      departamento: catalogo === "municipio" ? borrador.departamento.trim() || null : item.departamento ?? null,
      ...extra,
    };
    const anterior = motor.etiqueta(item);
    const nuevo = motor.etiqueta(siguiente);
    try {
      await guardar.mutateAsync({ item: siguiente, codigoAnterior: esNuevo || item.codigo === siguiente.codigo ? undefined : item.codigo });
      if (esNuevo) {
        avisar(`«${nuevo}» agregado a ${cfg.rotulo.toLowerCase()}.`);
        onFin?.();
        return;
      }
      if (anterior !== nuevo) {
        const n = await renombrar.mutateAsync({ campos: camposDe(catalogo), anterior, nuevo });
        avisar(n ? `Se actualizó el nombre en ${n} ${n === 1 ? "casilla" : "casillas"} de las hojas.` : "Nombre actualizado.");
      } else if (siguiente.codigo !== item.codigo) avisar("Código actualizado. El próximo archivo para HECAA ya lo usa.");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    }
  }

  // En un ítem existente cada casilla se guarda al salir de ella.
  const alSalir = () => {
    if (!esNuevo) void confirmarCambios();
  };

  const oferta = item.oferta ?? [];
  const setOferta = (lista: string[]) => void confirmarCambios({ oferta: lista });

  return (
    <>
      <tr>
        <td data-err={errNombre && (!esNuevo || cambio) ? "" : undefined}>
          <input
            aria-label="Nombre"
            value={borrador.nombre}
            autoFocus={esNuevo}
            onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            onBlur={alSalir}
          />
          {errNombre && (!esNuevo || cambio) && <span className="ri-errmsg">{errNombre}</span>}
        </td>
        <td className="ri-code" data-err={errCodigo && (!esNuevo || !vacio(borrador.codigo)) ? "" : undefined}>
          <input
            aria-label={cfg.codigo}
            inputMode={catalogo === "programa" ? "text" : "numeric"}
            value={borrador.codigo}
            onChange={(e) => setBorrador({ ...borrador, codigo: e.target.value })}
            onBlur={alSalir}
          />
          {errCodigo && (!esNuevo || !vacio(borrador.codigo)) && <span className="ri-errmsg">{errCodigo}</span>}
        </td>
        {catalogo === "municipio" && (
          <td>
            <input
              aria-label="Departamento"
              value={borrador.departamento}
              onChange={(e) => setBorrador({ ...borrador, departamento: e.target.value })}
              onBlur={alSalir}
            />
          </td>
        )}
        {catalogo === "programa" && (
          <td className="ri-pad">
            <div className="ri-ofe">
              {oferta.map((c) => (
                <span key={c} className="ri-chip">
                  {etiquetaMunicipio.get(c) ?? c}
                  {!esNuevo && (
                    <button type="button" aria-label={`Quitar ${etiquetaMunicipio.get(c) ?? c}`} onClick={() => setOferta(oferta.filter((o) => o !== c))}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
              {!esNuevo && (
                <select
                  aria-label="Agregar sede donde se ofrece"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setOferta([...oferta, e.target.value]);
                  }}
                >
                  <option value="">+ Sede</option>
                  {sedes
                    .filter((sd) => sd.municipio && !oferta.includes(sd.municipio))
                    .map((sd) => (
                      <option key={sd.campus_id} value={sd.municipio ?? ""}>
                        {sd.nombre}
                      </option>
                    ))}
                  <optgroup label="Otros municipios">
                    {municipios
                      .filter((m) => !oferta.includes(m.codigo) && !sedes.some((sd) => sd.municipio === m.codigo))
                      .map((m) => (
                        <option key={m.codigo} value={m.codigo}>
                          {etiquetaMunicipio.get(m.codigo)}
                        </option>
                      ))}
                  </optgroup>
                </select>
              )}
            </div>
          </td>
        )}
        <td className="ri-use ri-pad">{usos ? `${usos} ${usos === 1 ? "casilla" : "casillas"}` : "—"}</td>
        <td className="ri-pad ri-actions">
          {esNuevo ? (
            <>
              <button
                type="button"
                className="button-secondary ri-sm"
                disabled={Boolean(errNombre || errCodigo) || guardar.isPending}
                onClick={() => void confirmarCambios()}
              >
                Guardar
              </button>
              <button type="button" className="ri-link" onClick={onFin}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ri-link ri-link--danger"
              disabled={usos > 0}
              title={usos > 0 ? `No se puede quitar: lo usan ${usos} casillas de las hojas del periodo` : undefined}
              onClick={() => setConfirmar(true)}
            >
              Quitar
            </button>
          )}
        </td>
      </tr>
      {confirmar && (
        <tr>
          <td colSpan={catalogo === "pais" ? 4 : 5}>
            <div className="ri-confirm" role="alert">
              <span>
                «{motor.etiqueta(item)}» sale del catálogo de {cfg.rotulo.toLowerCase()} y deja de ofrecerse en las hojas.
              </span>
              <button
                type="button"
                className="button-secondary ri-sm"
                disabled={quitar.isPending}
                onClick={() =>
                  quitar.mutate(
                    { catalogo, codigo: item.codigo, campos: camposDe(catalogo) },
                    {
                      onSuccess: () => avisar("Quitado del catálogo."),
                      onError: (e) => avisar(e instanceof Error ? e.message : "No se pudo quitar."),
                    },
                  )
                }
              >
                Quitar
              </button>
              <button type="button" className="ri-link" onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
