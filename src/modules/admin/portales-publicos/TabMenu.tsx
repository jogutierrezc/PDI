/* =============================================================================
   Portales públicos · pestaña «Menú».

   Todos los vínculos públicos que se pueden cambiar, agrupados por portal y
   por lugar (barra, cajón del celular, pie, mosaicos…), cada uno con su clave.
   Por vínculo: ocultarlo, cambiar la etiqueta, cambiar el destino y fijar un
   periodo (desde/hasta) para que vuelva solo al original. No se reordena ni se
   agregan vínculos nuevos: son sobreescrituras. Sin fila, el vínculo es el del
   código.
   ========================================================================== */

import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { aCampoFecha, deCampoFecha, estadoDe, guardarMenu, refrescar, restaurarMenu } from "./datos";
import type { EstadoVinculo, MenuFila, PortalFila } from "./datos";
import { destinoSeguro } from "./estado";
import { Confirmar, Cargando, Nota } from "./Piezas";
import { useVinculos } from "./registro";
import type { Vinculo } from "./registro";

const ESTADOS: Record<EstadoVinculo, { texto: string; ayuda: string; icono: "check" | "pen" | "eye-off" | "clock" | "alert" }> = {
  original: { texto: "Original", ayuda: "Se ve como está en el código.", icono: "check" },
  cambiado: { texto: "Cambiado", ayuda: "Rige hoy una etiqueta o un destino distintos.", icono: "pen" },
  oculto: { texto: "Oculto", ayuda: "No se muestra al público.", icono: "eye-off" },
  programado: { texto: "Programado", ayuda: "Todavía no empieza: hoy se ve el original.", icono: "clock" },
  vencido: { texto: "Vencido", ayuda: "Ya terminó su periodo: se ve el original.", icono: "alert" },
};

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const cuando = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : "");

export function TabMenu({ portales, filas }: { portales: PortalFila[]; filas: MenuFila[] }) {
  const { vinculos, cargando } = useVinculos();
  const [buscar, setBuscar] = useState("");
  const [soloCambios, setSoloCambios] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const porClave = useMemo(() => new Map(filas.map((f) => [f.clave, f])), [filas]);
  const claves = useMemo(() => new Set(vinculos.map((v) => v.clave)), [vinculos]);
  // Una sobreescritura cuya clave ya no existe en el código (un pilar o informe que se quitó) no se pierde de vista.
  const huerfanas = filas.filter((f) => !claves.has(f.clave));

  const grupos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const visibles = vinculos.filter((v) => {
      const estado = estadoDe(porClave.get(v.clave));
      if (soloCambios && estado === "original") return false;
      return !q || `${v.clave} ${v.etiqueta} ${v.destino ?? ""} ${v.donde}`.toLowerCase().includes(q);
    });
    return portales
      .map((p) => {
        const delPortal = visibles.filter((v) => v.portal === p.slug);
        const lugares = [...new Set(delPortal.map((v) => v.donde))].map((donde) => ({ donde, items: delPortal.filter((v) => v.donde === donde) }));
        return { portal: p, lugares, total: delPortal.length };
      })
      .filter((g) => g.total > 0);
  }, [vinculos, portales, porClave, buscar, soloCambios]);

  const conCambios = filas.filter((f) => estadoDe(f) !== "original").length;

  return (
    <div className="ppa-pestana">
      <p className="ppa-intro">
        Cambie por un tiempo los vínculos del menú público: ocúltelos, renómbrelos o apúntelos a otro lugar, y fije un periodo para que vuelvan solos al original. Un vínculo que lleva a un portal cerrado desaparece por sí mismo. El ingreso a
        la intranet no se puede cambiar.
      </p>

      <div className="ppa-filtros" role="search">
        <label className="admin-field">
          <span>Buscar un vínculo</span>
          <input type="search" value={buscar} placeholder="Etiqueta, clave o destino" onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <label className="ppa-check">
          <input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
          Solo los que tienen cambios ({conCambios})
        </label>
      </div>

      {cargando && <Cargando que="Cargando también los pilares y los informes del menú…" />}

      {grupos.length === 0 ? (
        <p className="admin-empty">{soloCambios && !buscar ? "Ningún vínculo tiene cambios: todos se ven como están en el código." : "Ningún vínculo coincide con la búsqueda."}</p>
      ) : (
        grupos.map((g) => (
          <section key={g.portal.slug} className="ppa-grupo" aria-labelledby={`ppa-g-${g.portal.slug}`}>
            <h2 id={`ppa-g-${g.portal.slug}`}>
              {g.portal.nombre} {!g.portal.habilitado && <span className="ppa-sello" data-tono="mal"><Icon name="eye-off" size={13} /> Deshabilitado</span>}
            </h2>
            {g.lugares.map((l) => (
              <div key={l.donde} className="ppa-lugar">
                <h3>{l.donde}</h3>
                <ul>
                  {l.items.map((v) => (
                    <li key={v.clave}>
                      <FilaVinculo vinculo={v} fila={porClave.get(v.clave)} abierto={editando === v.clave} onAbrir={() => setEditando(editando === v.clave ? null : v.clave)} onCerrar={() => setEditando(null)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {huerfanas.length > 0 && (
        <section className="ppa-grupo" aria-labelledby="ppa-huerfanas">
          <h2 id="ppa-huerfanas">Cambios sin vínculo en el sitio</h2>
          <Nota tono="info">Estas sobreescrituras apuntan a una clave que el sitio ya no pinta (por ejemplo, un pilar o un informe que se quitó). No hacen nada; puede restaurarlas para limpiar la lista.</Nota>
          <ul>
            {huerfanas.map((f) => (
              <li key={f.clave}>
                <FilaVinculo
                  vinculo={{ clave: f.clave, portal: f.portal, donde: "Sin lugar", etiqueta: f.etiqueta_original || f.clave, destino: null }}
                  fila={f}
                  abierto={editando === f.clave}
                  onAbrir={() => setEditando(editando === f.clave ? null : f.clave)}
                  onCerrar={() => setEditando(null)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilaVinculo({ vinculo, fila, abierto, onAbrir, onCerrar }: { vinculo: Vinculo; fila: MenuFila | undefined; abierto: boolean; onAbrir: () => void; onCerrar: () => void }) {
  const id = useId();
  const estado = estadoDe(fila);
  const info = ESTADOS[estado];
  return (
    <div className="ppa-vinculo" data-estado={estado} data-abierto={abierto || undefined}>
      <div className="ppa-vinculo__fila">
        <div className="ppa-vinculo__texto">
          <strong>{vinculo.etiqueta}</strong>
          <code>{vinculo.clave}</code>
          <small>{vinculo.destino ? `Lleva a ${vinculo.destino}` : "Abre un menú (no tiene destino propio)"}</small>
          {fila && estado !== "original" && (
            <small className="ppa-vinculo__cambio">
              {fila.oculto ? "Oculto" : [fila.etiqueta && `se llama «${fila.etiqueta}»`, fila.destino && `lleva a ${fila.destino}`].filter(Boolean).join(" y ")}
              {(fila.desde || fila.hasta) && ` · ${fila.desde ? `desde ${cuando(fila.desde)}` : ""}${fila.desde && fila.hasta ? " " : ""}${fila.hasta ? `hasta ${cuando(fila.hasta)}` : ""}`}
            </small>
          )}
        </div>
        <span className="ppa-estado-vinculo" data-estado={estado} title={info.ayuda}>
          <Icon name={info.icono} size={14} /> {info.texto}
        </span>
        <button type="button" className="button-secondary" aria-expanded={abierto} aria-controls={`${id}-editor`} onClick={onAbrir}>
          {abierto ? "Cerrar" : estado === "original" ? "Cambiar" : "Editar"}
        </button>
      </div>
      {abierto && <Editor idBase={id} vinculo={vinculo} fila={fila} onCerrar={onCerrar} />}
    </div>
  );
}

function Editor({ idBase, vinculo, fila, onCerrar }: { idBase: string; vinculo: Vinculo; fila: MenuFila | undefined; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [oculto, setOculto] = useState(fila?.oculto ?? false);
  const [etiqueta, setEtiqueta] = useState(fila?.etiqueta ?? "");
  const [destino, setDestino] = useState(fila?.destino ?? "");
  const [desde, setDesde] = useState(aCampoFecha(fila?.desde ?? null));
  const [hasta, setHasta] = useState(aCampoFecha(fila?.hasta ?? null));
  const [nota, setNota] = useState(fila?.nota ?? "");
  const [confirma, setConfirma] = useState<"ocultar" | "restaurar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sinDestino = vinculo.destino === null;
  const desdeIso = deCampoFecha(desde);
  const hastaIso = deCampoFecha(hasta);

  const problemas: string[] = [];
  if (etiqueta.trim().length > 80) problemas.push("La etiqueta admite hasta 80 letras.");
  if (destino.trim() && !destinoSeguro(destino.trim())) problemas.push("El destino debe ser una ruta del sitio que empiece con «/» (por ejemplo /documentos) o una dirección que empiece con https://.");
  if (desdeIso && hastaIso && new Date(hastaIso) <= new Date(desdeIso)) problemas.push("«Hasta» debe ser posterior a «Desde».");
  if (hastaIso && new Date(hastaIso).getTime() <= Date.now()) problemas.push("«Hasta» ya pasó: el cambio nacería vencido.");

  const hayCambio = oculto || etiqueta.trim() !== "" || (!sinDestino && destino.trim() !== "");
  const etiquetaFinal = etiqueta.trim() || vinculo.etiqueta;
  const destinoFinal = sinDestino ? null : destino.trim() || vinculo.destino;

  const guardar = useMutation({
    mutationFn: () =>
      guardarMenu({
        clave: vinculo.clave,
        portal: vinculo.portal,
        etiqueta_original: vinculo.etiqueta,
        oculto,
        etiqueta: etiqueta.trim() || null,
        destino: sinDestino ? null : destino.trim() || null,
        desde: desdeIso,
        hasta: hastaIso,
        nota: nota.trim(),
      }),
    onSuccess: () => {
      refrescar(queryClient);
      onCerrar();
    },
    onError: (e) => {
      setConfirma(null);
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    },
  });
  const restaurar = useMutation({
    mutationFn: () => restaurarMenu(vinculo.clave),
    onSuccess: () => {
      refrescar(queryClient);
      onCerrar();
    },
    onError: (e) => {
      setConfirma(null);
      setError(e instanceof Error ? e.message : "No se pudo restaurar.");
    },
  });

  const alGuardar = () => {
    setError(null);
    if (!hayCambio) {
      // Sin ningún cambio, «guardar» es volver al original.
      if (fila) setConfirma("restaurar");
      else onCerrar();
      return;
    }
    if (oculto && !fila?.oculto) setConfirma("ocultar");
    else guardar.mutate();
  };

  return (
    <div id={`${idBase}-editor`} className="ppa-editor" role="group" aria-label={`Cambiar el vínculo ${vinculo.etiqueta}`}>
      <label className="ppa-check">
        <input type="checkbox" checked={oculto} onChange={(e) => setOculto(e.target.checked)} />
        <span>
          <strong>Ocultar este vínculo</strong>
          <small>No se muestra en el sitio ni en el buscador.</small>
        </span>
      </label>

      <div className="ppa-editor__campos" data-oculto={oculto || undefined}>
        <label className="admin-field">
          <span>Etiqueta nueva</span>
          <input type="text" value={etiqueta} maxLength={80} placeholder={vinculo.etiqueta} disabled={oculto} onChange={(e) => setEtiqueta(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Destino nuevo</span>
          <input
            type="text"
            inputMode="url"
            value={destino}
            placeholder={vinculo.destino ?? "No aplica: este vínculo abre un menú"}
            disabled={oculto || sinDestino}
            onChange={(e) => setDestino(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="admin-field">
          <span>Desde (opcional)</span>
          <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Hasta (opcional)</span>
          <input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Nota para el historial (opcional)</span>
          <input type="text" value={nota} maxLength={400} placeholder="Por qué se cambia" onChange={(e) => setNota(e.target.value)} />
        </label>
      </div>
      <p className="ppa-chica">
        Sin fechas, el cambio rige hasta que lo restaure. Con «Hasta», el vínculo vuelve solo al original en ese momento. Un destino externo (https://) abre con <code>rel=&quot;noopener noreferrer&quot;</code>.
      </p>

      <div className="ppa-vista" aria-live="polite">
        <span className="ppa-vista__rotulo">Cómo queda</span>
        {oculto ? (
          <span className="ppa-vista__valor">
            <Icon name="eye-off" size={15} /> No se muestra
          </span>
        ) : (
          <span className="ppa-vista__valor">
            <span className="ppa-vista__pastilla">{etiquetaFinal}</span>
            {destinoFinal ? (
              <>
                <Icon name="arrow-right" size={14} /> <code>{destinoFinal}</code>
              </>
            ) : (
              <small>(abre un menú)</small>
            )}
          </span>
        )}
      </div>

      {problemas.length > 0 && (
        <ul className="ppa-problemas" role="alert">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <Nota tono="mal">{error}</Nota>}

      <div className="ppa-acciones">
        <button type="button" className="button-primary" disabled={problemas.length > 0 || guardar.isPending} onClick={alGuardar}>
          {guardar.isPending && !confirma ? "Guardando…" : "Guardar"}
        </button>
        {fila && (
          <button type="button" className="button-secondary" disabled={restaurar.isPending} onClick={() => setConfirma("restaurar")}>
            Restaurar original
          </button>
        )}
        <button type="button" className="button-ghost" onClick={onCerrar}>
          Cancelar
        </button>
      </div>

      <Confirmar
        abierto={confirma === "ocultar"}
        titulo={`¿Ocultar «${vinculo.etiqueta}»?`}
        textoConfirmar="Sí, ocultarlo"
        peligro
        trabajando={guardar.isPending}
        onConfirmar={() => guardar.mutate()}
        onCancelar={() => setConfirma(null)}
      >
        <p>El vínculo dejará de verse en el sitio público y en el buscador {desdeIso ? `desde ${cuando(desdeIso)}` : "desde ahora"}{hastaIso ? ` hasta ${cuando(hastaIso)}` : ", hasta que lo restaure"}.</p>
        <p className="ppa-chica">La página a la que lleva sigue abierta para quien tenga su dirección. Para cerrar un portal entero use la pestaña «Portales».</p>
      </Confirmar>
      <Confirmar
        abierto={confirma === "restaurar"}
        titulo="¿Restaurar el vínculo original?"
        textoConfirmar="Sí, restaurarlo"
        trabajando={restaurar.isPending}
        onConfirmar={() => restaurar.mutate()}
        onCancelar={() => setConfirma(null)}
      >
        <p>Se borra la sobreescritura y el vínculo vuelve a verse como está en el código. Queda anotado en el historial.</p>
      </Confirmar>
    </div>
  );
}
