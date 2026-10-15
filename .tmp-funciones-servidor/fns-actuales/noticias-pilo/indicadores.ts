/* =============================================================================
   Los indicadores de THE Impact Rankings que Mr. Pilo puede nombrar al
   clasificar una noticia, por ODS. Un mapa que se amplía: un ODS sin lista
   lleva indicador = null.

   Los del ODS 13 son los de src/modules/sostenible/ods-data.ts (constante
   ODS13). Esta copia existe porque la función no importa de src/; la prueba
   tests/noticias/pilo-noticias.test.ts vigila que digan lo mismo.

   Sin Deno ni red: lo importan la función `noticias-pilo` y las pruebas.
   ========================================================================== */

export interface IndicadorOds {
  id: string;
  es: string;
  en: string;
}

export const INDICADORES: Partial<Record<number, IndicadorOds[]>> = {
  13: [
    { id: "13.1", es: "Investigación sobre acción climática", en: "Research on climate action" },
    { id: "13.2", es: "Energía con bajas emisiones", en: "Low-carbon energy use" },
    { id: "13.3", es: "Educación ambiental", en: "Environmental education" },
    { id: "13.4", es: "Compromiso carbono neutral", en: "Carbon-neutral commitment" },
  ],
};
