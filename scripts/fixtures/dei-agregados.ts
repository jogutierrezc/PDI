/* =============================================================================
   GENERADO por scripts/build-bi-agregados.py — no editar a mano.
   Constancia de lo publicado; el portal lee de Supabase, no de este archivo.

   Agregados de Diversidad, Equidad e Inclusión. Los microdatos de origen
   viven solo en bi/ (ignorada por git) y no llegan aquí: de allá salen
   conteos, nunca registros. Celdas con menos de 5 registros van
   reservadas (reserved: true) y el portal las escribe "< 5".

   Fuente: Heterogeneidad social · 48026 registros en los cortes
   2021-2, 2022-2, 2023-2, 2024-2, 2025-2; INES · 2084 respuestas.
   Generado el 2026-09-18.
   ========================================================================== */

export interface DeiItem {
  label: string;
  value: number | null;
  /** La celda existe pero no se publica: menos de 5 registros identifican. */
  reserved?: boolean;
}

export type DeiValues = Record<number, Record<string, number | null>>;

export const DEI_ANIOS = [2021, 2022, 2023, 2024, 2025];
export const DEI_MIN_CELDA = 5;
export const DEI_BOGOTA = 888;
export const DEI_CORTES: Record<number, string> = { 2021: "2021-2", 2022: "2022-2", 2023: "2023-2", 2024: "2024-2", 2025: "2025-2" };

export const dei_grupo_especial: DeiValues = {
    2021: { bucaramanga: 474, cucuta: 151, valledupar: 532, todas: 1157 },
    2022: { bucaramanga: 383, cucuta: 131, valledupar: 542, todas: 1056 },
    2023: { bucaramanga: 323, cucuta: 103, valledupar: 1482, todas: 1908 },
    2024: { bucaramanga: 263, cucuta: 73, valledupar: 1575, todas: 1911 },
    2025: { bucaramanga: 661, cucuta: 254, valledupar: 1439, todas: 2354 },
};

export const dei_discapacidad: DeiValues = {
    2021: { bucaramanga: 80, cucuta: 20, valledupar: 42, todas: 142 },
    2022: { bucaramanga: 69, cucuta: 15, valledupar: 39, todas: 123 },
    2023: { bucaramanga: 54, cucuta: 14, valledupar: 121, todas: 189 },
    2024: { bucaramanga: 34, cucuta: 12, valledupar: 126, todas: 172 },
    2025: { bucaramanga: 93, cucuta: 50, valledupar: 111, todas: 254 },
};

export const dei_etnico: DeiValues = {
    2021: { bucaramanga: 167, cucuta: 17, valledupar: 362, todas: 546 },
    2022: { bucaramanga: 152, cucuta: 16, valledupar: 380, todas: 548 },
    2023: { bucaramanga: 141, cucuta: 10, valledupar: 1100, todas: 1251 },
    2024: { bucaramanga: 120, cucuta: 5, valledupar: 1181, todas: 1306 },
    2025: { bucaramanga: 307, cucuta: 43, valledupar: 1108, todas: 1458 },
};

export const dei_victima: DeiValues = {
    2021: { bucaramanga: 270, cucuta: 118, valledupar: 250, todas: 638 },
    2022: { bucaramanga: 197, cucuta: 100, valledupar: 244, todas: 541 },
    2023: { bucaramanga: 160, cucuta: 83, valledupar: 569, todas: 812 },
    2024: { bucaramanga: 132, cucuta: 58, valledupar: 622, todas: 812 },
    2025: { bucaramanga: 415, cucuta: 217, valledupar: 617, todas: 1249 },
};

export const dei_rural: DeiValues = {
    2021: { bucaramanga: 264, cucuta: 67, valledupar: 105, todas: 436 },
    2022: { bucaramanga: 215, cucuta: 52, valledupar: 109, todas: 376 },
    2023: { bucaramanga: 228, cucuta: 58, valledupar: 289, todas: 575 },
    2024: { bucaramanga: 253, cucuta: 75, valledupar: 269, todas: 597 },
    2025: { bucaramanga: 363, cucuta: 128, valledupar: 261, todas: 752 },
};

export const dei_estrato_bajo: DeiValues = {
    2021: { bucaramanga: 47.0, cucuta: 53.7, valledupar: 73.4, todas: 55.1 },
    2022: { bucaramanga: 48.9, cucuta: 54.3, valledupar: 77.6, todas: 57.6 },
    2023: { bucaramanga: 50.1, cucuta: 54.5, valledupar: 79.4, todas: 59.1 },
    2024: { bucaramanga: 51.5, cucuta: 53.7, valledupar: 77.8, todas: 59.3 },
    2025: { bucaramanga: 44.0, cucuta: 45.2, valledupar: 76.5, todas: 52.9 },
};

export const dei_cobertura_discapacidad: DeiValues = {
    2021: { bucaramanga: 1.8, cucuta: 0.8, valledupar: 1.9, todas: 1.5 },
    2022: { bucaramanga: 1.5, cucuta: 0.6, valledupar: 1.6, todas: 1.3 },
    2023: { bucaramanga: 1.2, cucuta: 0.6, valledupar: 4.6, todas: 1.9 },
    2024: { bucaramanga: 44.3, cucuta: 24.5, valledupar: 99.8, todas: 54.4 },
    2025: { bucaramanga: 94.8, cucuta: 96.6, valledupar: 99.8, todas: 96.6 },
};

/** 9 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_tipo_discapacidad: Record<number, DeiItem[]> = {
    2021: [{ label: "Sensorial · baja visión", value: 97 }, { label: "Física o motora", value: 17 }, { label: "Sensorial · hipoacusia", value: 10 }, { label: "Sensorial · sordera profunda", value: 8 }, { label: "Psicosocial", value: null, reserved: true }, { label: "Sensorial · ceguera", value: null, reserved: true }, { label: "Múltiple", value: null, reserved: true }, { label: "Intelectual", value: 0 }, { label: "Sensorial · sordoceguera", value: null, reserved: true }],
    2022: [{ label: "Sensorial · baja visión", value: 87 }, { label: "Física o motora", value: 17 }, { label: "Sensorial · hipoacusia", value: 7 }, { label: "Sensorial · sordera profunda", value: 5 }, { label: "Psicosocial", value: null, reserved: true }, { label: "Sensorial · ceguera", value: null, reserved: true }, { label: "Múltiple", value: null, reserved: true }, { label: "Intelectual", value: 0 }, { label: "Sensorial · sordoceguera", value: 0 }],
    2023: [{ label: "Sensorial · baja visión", value: 137 }, { label: "Física o motora", value: 18 }, { label: "Sensorial · hipoacusia", value: 7 }, { label: "Sensorial · sordera profunda", value: 6 }, { label: "Psicosocial", value: 6 }, { label: "Sensorial · ceguera", value: 6 }, { label: "Múltiple", value: null, reserved: true }, { label: "Intelectual", value: null, reserved: true }, { label: "Sensorial · sordoceguera", value: null, reserved: true }],
    2024: [{ label: "Sensorial · baja visión", value: 125 }, { label: "Física o motora", value: 14 }, { label: "Sensorial · hipoacusia", value: 9 }, { label: "Sensorial · sordera profunda", value: 8 }, { label: "Psicosocial", value: null, reserved: true }, { label: "Sensorial · ceguera", value: 8 }, { label: "Múltiple", value: null, reserved: true }, { label: "Intelectual", value: null, reserved: true }, { label: "Sensorial · sordoceguera", value: null, reserved: true }],
    2025: [{ label: "Sensorial · baja visión", value: 157 }, { label: "Física o motora", value: 25 }, { label: "Sensorial · hipoacusia", value: 12 }, { label: "Sensorial · sordera profunda", value: 15 }, { label: "Psicosocial", value: 18 }, { label: "Sensorial · ceguera", value: 11 }, { label: "Múltiple", value: 7 }, { label: "Intelectual", value: 9 }, { label: "Sensorial · sordoceguera", value: 0 }],
};

/** 33 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_pueblo_indigena: Record<number, DeiItem[]> = {
    2021: [{ label: "Wayuu", value: 98 }, { label: "Otro", value: 27 }, { label: "Kakuamo", value: 28 }, { label: "Arhuaco (ijka)", value: 10 }, { label: "Wiwa (arzario)", value: 9 }, { label: "Zenú / senú", value: 13 }, { label: "Yuko (yukpa)", value: null, reserved: true }, { label: "Chimila (ette e'neka", value: null, reserved: true }, { label: "Achagua", value: 0 }, { label: "Barí (motilón)", value: null, reserved: true }, { label: "Kogui", value: 0 }, { label: "Pijaos", value: null, reserved: true }, { label: "Barea", value: 0 }, { label: "Awa (cuaiker)", value: 0 }, { label: "Bara", value: 0 }, { label: "Yagua", value: 0 }, { label: "Tikuna", value: null, reserved: true }, { label: "Kakua", value: 0 }, { label: "U'wa (tunebo)", value: 0 }, { label: "Pueblo indígena", value: 0 }, { label: "Hitnú", value: 0 }, { label: "Muisca", value: 0 }, { label: "Guane", value: 0 }, { label: "Comunidad negra", value: 0 }, { label: "Tororó", value: 0 }, { label: "Embera chami", value: 0 }, { label: "Yuruti", value: 0 }, { label: "Quillacingas", value: 0 }, { label: "Cañamomo", value: 0 }, { label: "Andoque o andoke", value: null, reserved: true }, { label: "Mokaná", value: 0 }, { label: "Inga", value: 0 }, { label: "Amorúa", value: 0 }],
    2022: [{ label: "Wayuu", value: 99 }, { label: "Otro", value: 48 }, { label: "Kakuamo", value: 31 }, { label: "Arhuaco (ijka)", value: 11 }, { label: "Wiwa (arzario)", value: 11 }, { label: "Zenú / senú", value: 11 }, { label: "Yuko (yukpa)", value: null, reserved: true }, { label: "Chimila (ette e'neka", value: null, reserved: true }, { label: "Achagua", value: null, reserved: true }, { label: "Barí (motilón)", value: null, reserved: true }, { label: "Kogui", value: 0 }, { label: "Pijaos", value: null, reserved: true }, { label: "Barea", value: null, reserved: true }, { label: "Awa (cuaiker)", value: 0 }, { label: "Bara", value: 0 }, { label: "Yagua", value: 0 }, { label: "Tikuna", value: 0 }, { label: "Kakua", value: 0 }, { label: "U'wa (tunebo)", value: 0 }, { label: "Pueblo indígena", value: null, reserved: true }, { label: "Hitnú", value: 0 }, { label: "Muisca", value: 0 }, { label: "Guane", value: 0 }, { label: "Comunidad negra", value: null, reserved: true }, { label: "Tororó", value: 0 }, { label: "Embera chami", value: 0 }, { label: "Yuruti", value: 0 }, { label: "Quillacingas", value: 0 }, { label: "Cañamomo", value: 0 }, { label: "Andoque o andoke", value: 0 }, { label: "Mokaná", value: 0 }, { label: "Inga", value: 0 }, { label: "Amorúa", value: 0 }],
    2023: [{ label: "Wayuu", value: 164 }, { label: "Otro", value: 122 }, { label: "Kakuamo", value: 66 }, { label: "Arhuaco (ijka)", value: 28 }, { label: "Wiwa (arzario)", value: 22 }, { label: "Zenú / senú", value: 11 }, { label: "Yuko (yukpa)", value: 7 }, { label: "Chimila (ette e'neka", value: 5 }, { label: "Achagua", value: 0 }, { label: "Barí (motilón)", value: null, reserved: true }, { label: "Kogui", value: 0 }, { label: "Pijaos", value: null, reserved: true }, { label: "Barea", value: null, reserved: true }, { label: "Awa (cuaiker)", value: null, reserved: true }, { label: "Bara", value: 0 }, { label: "Yagua", value: null, reserved: true }, { label: "Tikuna", value: null, reserved: true }, { label: "Kakua", value: 0 }, { label: "U'wa (tunebo)", value: null, reserved: true }, { label: "Pueblo indígena", value: 0 }, { label: "Hitnú", value: 0 }, { label: "Muisca", value: 0 }, { label: "Guane", value: 0 }, { label: "Comunidad negra", value: 0 }, { label: "Tororó", value: 0 }, { label: "Embera chami", value: 0 }, { label: "Yuruti", value: 0 }, { label: "Quillacingas", value: 0 }, { label: "Cañamomo", value: null, reserved: true }, { label: "Andoque o andoke", value: 0 }, { label: "Mokaná", value: 0 }, { label: "Inga", value: 0 }, { label: "Amorúa", value: 0 }],
    2024: [{ label: "Wayuu", value: 194 }, { label: "Otro", value: 131 }, { label: "Kakuamo", value: 73 }, { label: "Arhuaco (ijka)", value: 28 }, { label: "Wiwa (arzario)", value: 25 }, { label: "Zenú / senú", value: 18 }, { label: "Yuko (yukpa)", value: 8 }, { label: "Chimila (ette e'neka", value: 6 }, { label: "Achagua", value: null, reserved: true }, { label: "Barí (motilón)", value: null, reserved: true }, { label: "Kogui", value: 5 }, { label: "Pijaos", value: null, reserved: true }, { label: "Barea", value: null, reserved: true }, { label: "Awa (cuaiker)", value: null, reserved: true }, { label: "Bara", value: 0 }, { label: "Yagua", value: null, reserved: true }, { label: "Tikuna", value: null, reserved: true }, { label: "Kakua", value: null, reserved: true }, { label: "U'wa (tunebo)", value: 0 }, { label: "Pueblo indígena", value: 0 }, { label: "Hitnú", value: 0 }, { label: "Muisca", value: 0 }, { label: "Guane", value: 0 }, { label: "Comunidad negra", value: 0 }, { label: "Tororó", value: 0 }, { label: "Embera chami", value: 0 }, { label: "Yuruti", value: 0 }, { label: "Quillacingas", value: 0 }, { label: "Cañamomo", value: 0 }, { label: "Andoque o andoke", value: 0 }, { label: "Mokaná", value: 0 }, { label: "Inga", value: 0 }, { label: "Amorúa", value: 0 }],
    2025: [{ label: "Wayuu", value: 224 }, { label: "Otro", value: 152 }, { label: "Kakuamo", value: 88 }, { label: "Arhuaco (ijka)", value: 23 }, { label: "Wiwa (arzario)", value: 25 }, { label: "Zenú / senú", value: 28 }, { label: "Yuko (yukpa)", value: 7 }, { label: "Chimila (ette e'neka", value: null, reserved: true }, { label: "Achagua", value: 16 }, { label: "Barí (motilón)", value: 6 }, { label: "Kogui", value: 5 }, { label: "Pijaos", value: null, reserved: true }, { label: "Barea", value: null, reserved: true }, { label: "Awa (cuaiker)", value: null, reserved: true }, { label: "Bara", value: null, reserved: true }, { label: "Yagua", value: null, reserved: true }, { label: "Tikuna", value: 0 }, { label: "Kakua", value: null, reserved: true }, { label: "U'wa (tunebo)", value: null, reserved: true }, { label: "Pueblo indígena", value: 0 }, { label: "Hitnú", value: null, reserved: true }, { label: "Muisca", value: null, reserved: true }, { label: "Guane", value: null, reserved: true }, { label: "Comunidad negra", value: 0 }, { label: "Tororó", value: null, reserved: true }, { label: "Embera chami", value: null, reserved: true }, { label: "Yuruti", value: null, reserved: true }, { label: "Quillacingas", value: null, reserved: true }, { label: "Cañamomo", value: 0 }, { label: "Andoque o andoke", value: 0 }, { label: "Mokaná", value: null, reserved: true }, { label: "Inga", value: null, reserved: true }, { label: "Amorúa", value: null, reserved: true }],
};

/** 4 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_comunidad_negra: Record<number, DeiItem[]> = {
    2021: [{ label: "Afrocolombianos", value: 360 }, { label: "Otras comunidades negras", value: 14 }, { label: "Palenqueros", value: null, reserved: true }, { label: "Raizales", value: 8 }],
    2022: [{ label: "Afrocolombianos", value: 347 }, { label: "Otras comunidades negras", value: 8 }, { label: "Palenqueros", value: null, reserved: true }, { label: "Raizales", value: 7 }],
    2023: [{ label: "Afrocolombianos", value: 881 }, { label: "Otras comunidades negras", value: 31 }, { label: "Palenqueros", value: 9 }, { label: "Raizales", value: 5 }],
    2024: [{ label: "Afrocolombianos", value: 875 }, { label: "Otras comunidades negras", value: 27 }, { label: "Palenqueros", value: 11 }, { label: "Raizales", value: 6 }],
    2025: [{ label: "Afrocolombianos", value: 941 }, { label: "Otras comunidades negras", value: 33 }, { label: "Palenqueros", value: 13 }, { label: "Raizales", value: 10 }],
};

/** 6 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_estrato: Record<number, DeiItem[]> = {
    2021: [{ label: "Estrato 2", value: 3057 }, { label: "Estrato 3", value: 2604 }, { label: "Estrato 1", value: 2048 }, { label: "Estrato 4", value: 1271 }, { label: "Estrato 5", value: 212 }, { label: "Estrato 6", value: 80 }],
    2022: [{ label: "Estrato 2", value: 3210 }, { label: "Estrato 3", value: 2551 }, { label: "Estrato 1", value: 2351 }, { label: "Estrato 4", value: 1260 }, { label: "Estrato 5", value: 207 }, { label: "Estrato 6", value: 74 }],
    2023: [{ label: "Estrato 2", value: 3207 }, { label: "Estrato 3", value: 2484 }, { label: "Estrato 1", value: 2525 }, { label: "Estrato 4", value: 1201 }, { label: "Estrato 5", value: 206 }, { label: "Estrato 6", value: 71 }],
    2024: [{ label: "Estrato 2", value: 3204 }, { label: "Estrato 3", value: 2458 }, { label: "Estrato 1", value: 2513 }, { label: "Estrato 4", value: 1192 }, { label: "Estrato 5", value: 203 }, { label: "Estrato 6", value: 63 }],
    2025: [{ label: "Estrato 2", value: 2957 }, { label: "Estrato 3", value: 2821 }, { label: "Estrato 1", value: 2176 }, { label: "Estrato 4", value: 1389 }, { label: "Estrato 5", value: 276 }, { label: "Estrato 6", value: 79 }],
};

/** 2 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_genero: Record<number, DeiItem[]> = {
    2021: [{ label: "Femenino", value: 5928 }, { label: "Masculino", value: 3405 }],
    2022: [{ label: "Femenino", value: 6071 }, { label: "Masculino", value: 3597 }],
    2023: [{ label: "Femenino", value: 6159 }, { label: "Masculino", value: 3535 }],
    2024: [{ label: "Femenino", value: 6095 }, { label: "Masculino", value: 3538 }],
    2025: [{ label: "Femenino", value: 6134 }, { label: "Masculino", value: 3564 }],
};

/** 2 categorías, ordenadas por volumen del periodo. */
export const dei_desglose_zona: Record<number, DeiItem[]> = {
    2021: [{ label: "Urbano", value: 7758 }, { label: "Rural", value: 436 }],
    2022: [{ label: "Urbano", value: 7375 }, { label: "Rural", value: 376 }],
    2023: [{ label: "Urbano", value: 8459 }, { label: "Rural", value: 575 }],
    2024: [{ label: "Urbano", value: 8469 }, { label: "Rural", value: 597 }],
    2025: [{ label: "Urbano", value: 8946 }, { label: "Rural", value: 752 }],
};

/* --- Bienestar Institucional -----------------------------------------------
   Porcentajes de la caracterización estudiantil, que es una ENCUESTA: la base
   es quien respondió ese año, no la matrícula. Se rotula así en la ficha para
   que nadie lea una cobertura institucional donde hay una muestra. */

export const BI_ANIOS = [2022, 2023, 2024, 2025];
export const BI_RESPUESTAS: Record<number, number> = { 2022: 904, 2023: 2340, 2024: 2151, 2025: 1262 };

export const bi_actividad_fisica: DeiValues = {
    2022: { bucaramanga: 38.5, cucuta: 51.3, valledupar: 39.1, todas: 42.6 },
    2023: { bucaramanga: 43.6, cucuta: 48.6, valledupar: 45.2, todas: 45.4 },
    2024: { bucaramanga: 45.7, cucuta: 53.0, valledupar: 44.2, todas: 47.5 },
    2025: { bucaramanga: 45.8, cucuta: 58.7, valledupar: 46.1, todas: 49.8 },
};

export const bi_practica_deporte: DeiValues = {
    2022: { bucaramanga: 43.8, cucuta: 48.7, valledupar: 36.8, todas: 42.9 },
    2023: { bucaramanga: 41.2, cucuta: 38.2, valledupar: 39.6, todas: 40.0 },
    2024: { bucaramanga: 43.8, cucuta: 40.9, valledupar: 45.2, todas: 43.3 },
    2025: { bucaramanga: 42.4, cucuta: 42.6, valledupar: 43.3, todas: 42.6 },
};

export const bi_habilidad_artistica: DeiValues = {
    2022: { bucaramanga: 29.2, cucuta: 29.8, valledupar: 31.9, todas: 30.3 },
    2023: { bucaramanga: 30.6, cucuta: 28.1, valledupar: 34.8, todas: 31.0 },
    2024: { bucaramanga: 29.2, cucuta: 31.0, valledupar: 28.8, todas: 29.6 },
    2025: { bucaramanga: 36.9, cucuta: 26.2, valledupar: 32.3, todas: 32.6 },
};

export const bi_primera_generacion: DeiValues = {
    2022: { bucaramanga: 33.5, cucuta: 31.6, valledupar: 30.6, todas: 32.0 },
    2023: { bucaramanga: 27.2, cucuta: 30.0, valledupar: 30.1, todas: 28.8 },
    2024: { bucaramanga: 24.7, cucuta: 23.5, valledupar: 25.0, todas: 24.4 },
    2025: { bucaramanga: 23.1, cucuta: 25.4, valledupar: 30.1, todas: 25.4 },
};

/** 3 categorías. */
export const bi_desglose_actividad_fisica: Record<number, DeiItem[]> = {
    2022: [{ label: "Sí", value: 385 }, { label: "A veces", value: 317 }, { label: "No", value: 202 }],
    2023: [{ label: "Sí", value: 1063 }, { label: "A veces", value: 811 }, { label: "No", value: 466 }],
    2024: [{ label: "Sí", value: 1021 }, { label: "A veces", value: 773 }, { label: "No", value: 357 }],
    2025: [{ label: "Sí", value: 629 }, { label: "A veces", value: 428 }, { label: "No", value: 205 }],
};

/** 3 categorías. */
export const bi_desglose_frecuencia_actividad: Record<number, DeiItem[]> = {
    2022: [{ label: "1 a 2 veces", value: 345 }, { label: "3 a 4 veces", value: 227 }, { label: "Más de 5 veces", value: 130 }],
    2023: [{ label: "1 a 2 veces", value: 841 }, { label: "3 a 4 veces", value: 609 }, { label: "Más de 5 veces", value: 424 }],
    2024: [{ label: "1 a 2 veces", value: 795 }, { label: "3 a 4 veces", value: 635 }, { label: "Más de 5 veces", value: 364 }],
    2025: [{ label: "1 a 2 veces", value: 433 }, { label: "3 a 4 veces", value: 398 }, { label: "Más de 5 veces", value: 226 }],
};

/** 7 categorías. Multirespuesta: las partes suman más que las personas. */
export const bi_desglose_disciplina_artistica: Record<number, DeiItem[]> = {
    2022: [{ label: "Música", value: 549 }, { label: "Artes y manualidades", value: 356 }, { label: "Pintura y dibujo", value: 325 }, { label: "Danzas", value: 314 }, { label: "Literatura", value: 160 }, { label: "Teatro", value: 137 }, { label: "Museología", value: 74 }],
    2023: [{ label: "Música", value: 1322 }, { label: "Artes y manualidades", value: 915 }, { label: "Pintura y dibujo", value: 913 }, { label: "Danzas", value: 852 }, { label: "Literatura", value: 486 }, { label: "Teatro", value: 355 }, { label: "Museología", value: 186 }],
    2024: [{ label: "Música", value: 1219 }, { label: "Artes y manualidades", value: 846 }, { label: "Pintura y dibujo", value: 754 }, { label: "Danzas", value: 731 }, { label: "Literatura", value: 362 }, { label: "Teatro", value: 286 }, { label: "Museología", value: 135 }],
    2025: [{ label: "Música", value: 695 }, { label: "Artes y manualidades", value: 467 }, { label: "Pintura y dibujo", value: 425 }, { label: "Danzas", value: 433 }, { label: "Literatura", value: 225 }, { label: "Teatro", value: 167 }, { label: "Museología", value: 67 }],
};

/** 7 categorías. */
export const bi_desglose_financiacion_matricula: Record<number, DeiItem[]> = {
    2022: [{ label: "Padres", value: 307 }, { label: "Sólo el padre", value: 152 }, { label: "Entidad financiera", value: 150 }, { label: "Sólo la madre", value: 119 }, { label: "Financiación propia", value: 61 }, { label: "Otros familiares", value: 62 }, { label: "Becas", value: 53 }],
    2023: [{ label: "Padres", value: 940 }, { label: "Sólo el padre", value: 387 }, { label: "Entidad financiera", value: 342 }, { label: "Sólo la madre", value: 292 }, { label: "Financiación propia", value: 172 }, { label: "Otros familiares", value: 116 }, { label: "Becas", value: 91 }],
    2024: [{ label: "Padres", value: 911 }, { label: "Sólo el padre", value: 342 }, { label: "Entidad financiera", value: 391 }, { label: "Sólo la madre", value: 247 }, { label: "Financiación propia", value: 124 }, { label: "Otros familiares", value: 90 }, { label: "Becas", value: 46 }],
    2025: [{ label: "Padres", value: 599 }, { label: "Sólo el padre", value: 268 }, { label: "Entidad financiera", value: 112 }, { label: "Sólo la madre", value: 159 }, { label: "Financiación propia", value: 62 }, { label: "Otros familiares", value: 54 }, { label: "Becas", value: 8 }],
};

export interface InesFactor {
  factor: number;
  label: string;
  /** 0-100. Base: respuestas que no son 'No sabe'. */
  puntaje: number | null;
  /** % de 'No sabe' sobre el total de respuestas del factor. */
  nosabe: number | null;
}

export const inesGlobal: InesFactor[] = [
  { factor: 1, label: "Misión y proyecto institucional", puntaje: 91.4, nosabe: 6.8 },
  { factor: 2, label: "Estudiantes", puntaje: 96.4, nosabe: 3.0 },
  { factor: 3, label: "Profesores", puntaje: 93.1, nosabe: 4.2 },
  { factor: 4, label: "Procesos académicos", puntaje: 91.3, nosabe: 3.9 },
  { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 96.9, nosabe: 5.8 },
  { factor: 6, label: "Investigación y creación artística", puntaje: 93.1, nosabe: 7.1 },
  { factor: 7, label: "Pertinencia e impacto social", puntaje: 94.8, nosabe: 11.2 },
  { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 92.2, nosabe: 5.4 },
  { factor: 9, label: "Organización, administración y gestión", puntaje: 89.4, nosabe: 4.9 },
  { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 90.4, nosabe: 6.4 },
  { factor: 11, label: "Bienestar institucional", puntaje: 92.4, nosabe: 3.7 },
  { factor: 12, label: "Recursos financieros", puntaje: 89.4, nosabe: 8.6 },
];

export const ines_administrativos: InesFactor[] = [
  { factor: 1, label: "Misión y proyecto institucional", puntaje: 92.9, nosabe: 8.0 },
  { factor: 2, label: "Estudiantes", puntaje: 99.1, nosabe: 3.5 },
  { factor: 3, label: "Profesores", puntaje: 96.7, nosabe: 4.1 },
  { factor: 4, label: "Procesos académicos", puntaje: 95.3, nosabe: 8.0 },
  { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 98.7, nosabe: 7.6 },
  { factor: 6, label: "Investigación y creación artística", puntaje: 94.8, nosabe: 10.0 },
  { factor: 7, label: "Pertinencia e impacto social", puntaje: 99.1, nosabe: 10.0 },
  { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 95.3, nosabe: 7.6 },
  { factor: 9, label: "Organización, administración y gestión", puntaje: 92.2, nosabe: 6.9 },
  { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 92.0, nosabe: 9.2 },
  { factor: 11, label: "Bienestar institucional", puntaje: 96.2, nosabe: 4.3 },
  { factor: 12, label: "Recursos financieros", puntaje: 93.5, nosabe: 10.4 },
];

export const ines_estudiantes: InesFactor[] = [
  { factor: 1, label: "Misión y proyecto institucional", puntaje: 91.5, nosabe: 6.0 },
  { factor: 2, label: "Estudiantes", puntaje: 95.8, nosabe: 2.8 },
  { factor: 3, label: "Profesores", puntaje: 92.5, nosabe: 4.8 },
  { factor: 4, label: "Procesos académicos", puntaje: 90.6, nosabe: 3.5 },
  { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 96.3, nosabe: 6.1 },
  { factor: 6, label: "Investigación y creación artística", puntaje: 93.3, nosabe: 6.2 },
  { factor: 7, label: "Pertinencia e impacto social", puntaje: 93.6, nosabe: 12.2 },
  { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 91.9, nosabe: 4.8 },
  { factor: 9, label: "Organización, administración y gestión", puntaje: 89.3, nosabe: 3.9 },
  { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 91.4, nosabe: 5.4 },
  { factor: 11, label: "Bienestar institucional", puntaje: 91.6, nosabe: 3.5 },
  { factor: 12, label: "Recursos financieros", puntaje: 88.8, nosabe: 6.7 },
];

export const ines_profesores: InesFactor[] = [
  { factor: 1, label: "Misión y proyecto institucional", puntaje: 90.0, nosabe: 8.7 },
  { factor: 2, label: "Estudiantes", puntaje: 96.7, nosabe: 3.1 },
  { factor: 3, label: "Profesores", puntaje: 92.6, nosabe: 2.4 },
  { factor: 4, label: "Procesos académicos", puntaje: 91.3, nosabe: 2.8 },
  { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 98.1, nosabe: 3.9 },
  { factor: 6, label: "Investigación y creación artística", puntaje: 91.3, nosabe: 8.4 },
  { factor: 7, label: "Pertinencia e impacto social", puntaje: 96.2, nosabe: 8.6 },
  { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 91.5, nosabe: 6.1 },
  { factor: 9, label: "Organización, administración y gestión", puntaje: 88.0, nosabe: 6.8 },
  { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 86.4, nosabe: 7.7 },
  { factor: 11, label: "Bienestar institucional", puntaje: 92.4, nosabe: 3.9 },
  { factor: 12, label: "Recursos financieros", puntaje: 88.8, nosabe: 13.6 },
];

export const INES_ANIOS = ["2020", "2021", "2023", "2024"];

export const inesPorAnio: Record<string, InesFactor[]> = {
  "2020": [{ factor: 1, label: "Misión y proyecto institucional", puntaje: 90.5, nosabe: 7.5 }, { factor: 2, label: "Estudiantes", puntaje: 96.5, nosabe: 3.0 }, { factor: 3, label: "Profesores", puntaje: 93.2, nosabe: 3.2 }, { factor: 4, label: "Procesos académicos", puntaje: 90.7, nosabe: 3.8 }, { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 97.4, nosabe: 5.1 }, { factor: 6, label: "Investigación y creación artística", puntaje: 92.1, nosabe: 7.7 }, { factor: 7, label: "Pertinencia e impacto social", puntaje: 95.9, nosabe: 11.4 }, { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 91.9, nosabe: 5.7 }, { factor: 9, label: "Organización, administración y gestión", puntaje: 88.4, nosabe: 6.2 }, { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 88.8, nosabe: 7.4 }, { factor: 11, label: "Bienestar institucional", puntaje: 92.2, nosabe: 4.3 }, { factor: 12, label: "Recursos financieros", puntaje: 89.1, nosabe: 10.7 }],
  "2021": [{ factor: 1, label: "Misión y proyecto institucional", puntaje: 90.3, nosabe: 5.0 }, { factor: 2, label: "Estudiantes", puntaje: 95.7, nosabe: 2.2 }, { factor: 3, label: "Profesores", puntaje: 92.6, nosabe: 4.9 }, { factor: 4, label: "Procesos académicos", puntaje: 89.8, nosabe: 3.2 }, { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 95.5, nosabe: 5.1 }, { factor: 6, label: "Investigación y creación artística", puntaje: 92.2, nosabe: 5.7 }, { factor: 7, label: "Pertinencia e impacto social", puntaje: 92.6, nosabe: 11.2 }, { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 91.1, nosabe: 3.7 }, { factor: 9, label: "Organización, administración y gestión", puntaje: 89.1, nosabe: 4.0 }, { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 90.8, nosabe: 5.5 }, { factor: 11, label: "Bienestar institucional", puntaje: 91.6, nosabe: 3.2 }, { factor: 12, label: "Recursos financieros", puntaje: 87.9, nosabe: 5.0 }],
  "2023": [{ factor: 1, label: "Misión y proyecto institucional", puntaje: 91.8, nosabe: 7.5 }, { factor: 2, label: "Estudiantes", puntaje: 96.0, nosabe: 3.5 }, { factor: 3, label: "Profesores", puntaje: 92.6, nosabe: 4.6 }, { factor: 4, label: "Procesos académicos", puntaje: 91.7, nosabe: 4.8 }, { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 96.9, nosabe: 6.5 }, { factor: 6, label: "Investigación y creación artística", puntaje: 93.4, nosabe: 7.9 }, { factor: 7, label: "Pertinencia e impacto social", puntaje: 94.7, nosabe: 11.9 }, { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 92.0, nosabe: 6.0 }, { factor: 9, label: "Organización, administración y gestión", puntaje: 88.8, nosabe: 4.2 }, { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 90.3, nosabe: 6.4 }, { factor: 11, label: "Bienestar institucional", puntaje: 91.7, nosabe: 3.5 }, { factor: 12, label: "Recursos financieros", puntaje: 89.4, nosabe: 8.9 }],
  "2024": [{ factor: 1, label: "Misión y proyecto institucional", puntaje: 93.4, nosabe: 6.4 }, { factor: 2, label: "Estudiantes", puntaje: 97.2, nosabe: 2.8 }, { factor: 3, label: "Profesores", puntaje: 93.9, nosabe: 4.9 }, { factor: 4, label: "Procesos académicos", puntaje: 93.2, nosabe: 3.4 }, { factor: 5, label: "Visibilidad nacional e internacional", puntaje: 97.4, nosabe: 7.0 }, { factor: 6, label: "Investigación y creación artística", puntaje: 95.2, nosabe: 6.3 }, { factor: 7, label: "Pertinencia e impacto social", puntaje: 95.1, nosabe: 9.6 }, { factor: 8, label: "Autoevaluación y autorregulación", puntaje: 94.3, nosabe: 5.4 }, { factor: 9, label: "Organización, administración y gestión", puntaje: 92.4, nosabe: 4.0 }, { factor: 10, label: "Planta física y recursos de apoyo", puntaje: 93.2, nosabe: 5.1 }, { factor: 11, label: "Bienestar institucional", puntaje: 94.2, nosabe: 3.1 }, { factor: 12, label: "Recursos financieros", puntaje: 91.4, nosabe: 7.3 }],
};
