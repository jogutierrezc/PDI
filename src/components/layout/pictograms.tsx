/* =============================================================================
   Pictogramas de navegación (señalética).

   Cada destino del menú —un informe de UDES en Cifras, un tema del
   Observatorio, una página del PDI— tiene su pictograma, siempre junto a su
   nombre, su color y su código: ninguno depende solo del color. Misma rejilla
   de 24, trazo de 1,8 y remates redondos que el set de íconos del portal.
   ========================================================================== */

const P = {
  people: "M6 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5 M14.6 9a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0 M15.5 14.6c2.4-.3 4.3 1 5 4.4",
  route: "M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M16 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6",
  eye: "M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z M9.2 12a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5",
  rays: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1",
  flask: "M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3 M7.5 15h9",
  building: "M4 21V8l8-5 8 5v13 M9 21v-6h6v6 M8 11h.01 M12 11h.01 M16 11h.01",
  leaf: "M5 19c0-8 5-14 15-14 0 10-6 15-14 15 M5 19 13 11",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  globe: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M3 12h18 M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  circles: "M4 9a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M12 9a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M8 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  bars: "M4 20V10 M10 20V4 M16 20v-7 M21 20H3",
  trend: "M3.5 17.5 9 11.5l4 3.5 7.5-8.5 M15.5 6.5h5v5",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
  board: "M4 4h16v11H4z M8 20l4-5 4 5 M8 8h8 M8 11h5",
  briefcase: "M4 8h16v11H4z M9 8V5.5h6V8 M4 13h16",
  card: "M3 6h18v12H3z M7 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5.5 15.5c.6-1.5 1.8-2.3 3.5-2.3s2.9.8 3.5 2.3 M14 10h4 M14 13h3",
  medal: "M8 3l2.5 5 M16 3l-2.5 5 M7 14.5a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M12 12.5v4",
  target: "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0 M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  cap: "M3 10 12 5l9 5-9 5z M7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4",
  home: "M3 11.5 12 4l9 7.5 M5.5 9.5V20h13V9.5 M10 20v-5h4v5",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  pin: "M12 21c4.2-4.4 6.3-7.7 6.3-10.3a6.3 6.3 0 1 0-12.6 0C5.7 13.3 7.8 16.6 12 21Z M9.6 10.5a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0",
  clock: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 3v9l6 4",
  code: "M8.5 8l-5 4 5 4 M15.5 8l5 4-5 4 M13.8 4.5l-3.6 15",
  exit: "M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10",
  document: "M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z M13.5 3.5v5h5 M8.8 13h6.4 M8.8 16.4h4.4",
} as const;

export type PictogramName = keyof typeof P;

/** Informes de UDES en Cifras, por slug. */
export const REPORT_PICTOGRAM: Record<string, PictogramName> = {
  poblacional: "people",
  permanencia: "route",
  visibilidad: "eye",
  ensenanza: "book",
  extension: "rays",
  investigacion: "flask",
  infraestructura: "building",
  sostenible: "leaf",
  "plan-desarrollo": "flag",
  internacionalizacion: "globe",
  "diversidad-equidad-inclusion": "circles",
  "bienestar-institucional": "heart",
};

/** Temas del Observatorio, por slug. */
export const TOPIC_PICTOGRAM: Record<string, PictogramName> = {
  "presentacion-institucional": "building",
  "oferta-academica": "book",
  "alertas-tempranas": "bell",
  "poblacion-estudiantil": "people",
  profesores: "board",
  "diversidad-equidad-inclusion": "circles",
  "valor-agregado": "trend",
  "vinculacion-laboral": "briefcase",
  "desercion-academica": "exit",
  internacionalizacion: "globe",
  "caracterizacion-estudiante": "card",
  "calidad-institucional": "medal",
  "factores-rendimiento": "target",
  "seguimiento-graduados": "cap",
};

export function Pictogram({ name, size = 24, strokeWidth = 1.8 }: { name: PictogramName; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
