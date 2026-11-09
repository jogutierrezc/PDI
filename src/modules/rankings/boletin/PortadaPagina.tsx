/* =============================================================================
   Boletín PDF de los informes ODS · la hoja de portada.

   La misma hoja que Informes Institucionales (PaginaPortada, en milímetros), en
   A4. `ctxDe` arma el contexto que esa hoja necesita; el boletín no tiene
   unidad ni «cifras en vivo», así que la marca va vacía.
   ========================================================================== */

import { useEffect, useMemo } from "react";
import { useUrlImagen } from "../../informes/datos";
import { Escalado } from "../../informes/vista/Escalado";
import { PaginaPortada } from "../../informes/vista/Hoja";
import type { ContextoHoja } from "../../informes/vista/Hoja";
import { PAPELES, evaluarAcento, monogramaPorDefecto, normalizarMonograma } from "../../informes/vista/perfil";
import type { PerfilOficina, PortadaDiseno } from "../../informes/vista/perfil";
import { loadBulletinFont } from "../../boletin/fonts";
import "../../informes/vista/vista.css";

/** El contexto de la hoja de portada del boletín (A4). `escudoUrl`: el escudo propio, ya firmado, si lo hay. */
export function ctxDe(perfil: PerfilOficina, anio: string, escudoUrl: string | null): ContextoHoja {
  return {
    papel: "a4",
    perfil: { ...perfil, monograma: normalizarMonograma(perfil.monograma) || monogramaPorDefecto(perfil.nombre) },
    acento: evaluarAcento(perfil.acento),
    anio,
    escudoUrl,
    marca: { e: "vivo", texto: "" },
  };
}

export function PortadaPagina({ portada, perfil, escalar }: { portada: PortadaDiseno; perfil: PerfilOficina; escalar: boolean }) {
  const foto = useUrlImagen(portada.foto?.ruta);
  const escudo = useUrlImagen(perfil.logoRuta);
  useEffect(() => {
    void loadBulletinFont("Montserrat");
  }, []);
  const ctx = useMemo(() => ctxDe(perfil, portada.anio, escudo.data ?? null), [perfil, portada.anio, escudo.data]);
  const hoja = <PaginaPortada ctx={ctx} portada={portada} fotoUrl={portada.foto ? (foto.data ?? null) : null} />;
  return escalar ? <Escalado anchoMm={PAPELES.a4.ancho}>{hoja}</Escalado> : hoja;
}
