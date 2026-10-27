/* =============================================================================
   UI GreenMetric · catálogo de la guía 2026 (118 filas: 117 preguntas + la plantilla 3.18).

   GENERADO a partir de la guía 2026, de las plantillas oficiales y del análisis
   (docs/uigreen/analisis-uigreenmetric.md). Es el mismo contenido que siembra la
   migración 0209 en `ugm_catalogo_base`: si cambia uno, cambia el otro.

   Los puntos, los factores y las bandas son de uso INTERNO (estimar avance y
   priorizar); la página pública no los muestra. El «primer factor» de cada
   indicador (0 o 0,05) se leyó del Apéndice 1 con una regla automática: confirmar
   contra la guía antes de usar la estimación como cifra de gestión.
   ========================================================================== */

import type { CategoriaCatalogo, PreguntaCatalogo } from "../lib/tipos";

export const GUIA_CATALOGO = "2026";

export const CATEGORIAS: CategoriaCatalogo[] = [
 {
  "categoria": "SI",
  "numero": 1,
  "nombre_es": "Entorno e infraestructura",
  "nombre_en": "Setting and Infrastructure",
  "peso_pct": 11,
  "puntos_max": 1100,
  "carpeta_nombre": "1_Setting_and_Infrastructure_SI"
 },
 {
  "categoria": "EC",
  "numero": 2,
  "nombre_es": "Energía y cambio climático",
  "nombre_en": "Energy and Climate Change",
  "peso_pct": 20,
  "puntos_max": 2000,
  "carpeta_nombre": "2_Energy_and_Climate_Change_EC"
 },
 {
  "categoria": "WS",
  "numero": 3,
  "nombre_es": "Residuos",
  "nombre_en": "Waste",
  "peso_pct": 17,
  "puntos_max": 1700,
  "carpeta_nombre": "3_Waste_WS"
 },
 {
  "categoria": "WR",
  "numero": 4,
  "nombre_es": "Agua",
  "nombre_en": "Water",
  "peso_pct": 11,
  "puntos_max": 1100,
  "carpeta_nombre": "4_Water_WR"
 },
 {
  "categoria": "TR",
  "numero": 5,
  "nombre_es": "Transporte",
  "nombre_en": "Transportation",
  "peso_pct": 17,
  "puntos_max": 1700,
  "carpeta_nombre": "5_Transportation_TR"
 },
 {
  "categoria": "ED",
  "numero": 6,
  "nombre_es": "Educación e investigación",
  "nombre_en": "Education and Research",
  "peso_pct": 13,
  "puntos_max": 1300,
  "carpeta_nombre": "6_Education_ED"
 },
 {
  "categoria": "GD",
  "numero": 7,
  "nombre_es": "Gobernanza y digitalización",
  "nombre_en": "Governance and Digitalization",
  "peso_pct": 11,
  "puntos_max": 1100,
  "carpeta_nombre": "7_Governance_and_Digitalization"
 }
];

export const CATALOGO_2026: PreguntaCatalogo[] = [
 {
  "q": "1.1",
  "categoria": "SI",
  "numero": 1,
  "orden": 0,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Tipo de institución de educación superior",
  "nombre_en": "Type of higher education institution",
  "tipo": "seleccion",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 19,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Integral (Comprehensive)",
    "en": "Comprehensive"
   },
   {
    "valor": 2,
    "es": "Institución de educación superior especializada",
    "en": "Specialized higher education institution"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Opción",
     "en": "Option",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.2",
  "categoria": "SI",
  "numero": 2,
  "orden": 1,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Clima",
  "nombre_en": "Climate",
  "tipo": "seleccion",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 19,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Tropical húmedo",
    "en": "Humid tropical"
   },
   {
    "valor": 2,
    "es": "Tropical húmedo y seco",
    "en": "Wet and dry tropical"
   },
   {
    "valor": 3,
    "es": "Semiárido",
    "en": "Semi-arid"
   },
   {
    "valor": 4,
    "es": "Árido",
    "en": "Arid"
   },
   {
    "valor": 5,
    "es": "Mediterráneo",
    "en": "Mediterranean"
   },
   {
    "valor": 6,
    "es": "Subtropical húmedo",
    "en": "Humid subtropical"
   },
   {
    "valor": 7,
    "es": "Clima oceánico / costa oeste marina",
    "en": "Oceanic / marine west coast"
   },
   {
    "valor": 8,
    "es": "Continental húmedo",
    "en": "Humid continental"
   },
   {
    "valor": 9,
    "es": "Subártico",
    "en": "Subarctic"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Opción",
     "en": "Option",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.3",
  "categoria": "SI",
  "numero": 3,
  "orden": 2,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de sedes del campus",
  "nombre_en": "Number of Campus Sites",
  "tipo": "numero",
  "unidad": "sedes",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 19,
  "calculada": false,
  "plantilla": "University_Country_1_3_Number_of_Campus_sites.docx",
  "carpeta_nombre": "1_3_Number_of_Campus_sites",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de sedes del campus",
     "en": "Number of Campus Sites",
     "unidad": "sedes",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "sedes",
     "es": "Sedes del campus",
     "en": "Campus sites",
     "columnas": [
      {
       "k": "sede",
       "es": "Sede",
       "en": "Site",
       "tipo": "texto"
      },
      {
       "k": "area",
       "es": "Área",
       "en": "Area",
       "tipo": "numero",
       "unidad": "m²"
      },
      {
       "k": "creacion",
       "es": "Fecha de creación",
       "en": "Creation date",
       "tipo": "fecha"
      },
      {
       "k": "detalle",
       "es": "Historia e instalaciones",
       "en": "History and facilities",
       "tipo": "texto"
      }
     ],
     "min": 1
    }
   ]
  }
 },
 {
  "q": "1.4",
  "categoria": "SI",
  "numero": 4,
  "orden": 3,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Entorno del campus",
  "nombre_en": "Campus Setting",
  "tipo": "seleccion",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 20,
  "calculada": false,
  "plantilla": "University_Country_1_4_Main_campus_setting.docx",
  "carpeta_nombre": "1_4_Main_campus_setting",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Rural"
   },
   {
    "valor": 2,
    "es": "Suburbano"
   },
   {
    "valor": 3,
    "es": "Urbano"
   },
   {
    "valor": 4,
    "es": "Centro de la ciudad"
   },
   {
    "valor": 5,
    "es": "Zona de edificios altos"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Opción",
     "en": "Option",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.5",
  "categoria": "SI",
  "numero": 5,
  "orden": 4,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Área total del campus (m²)",
  "nombre_en": "Total Campus Area (meter2)",
  "tipo": "numero",
  "unidad": "m²",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 20,
  "calculada": false,
  "plantilla": "University_Country_1_5_Total_main_campus_area.docx",
  "carpeta_nombre": "1_5_Total_main_campus_area",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Área total del campus (m²)",
     "en": "Total Campus Area (meter2)",
     "unidad": "m²",
     "obligatorio": true
    },
    {
     "k": "perimetro",
     "tipo": "numero",
     "es": "Perímetro del campus",
     "en": "Campus perimeter",
     "unidad": "km"
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.6",
  "categoria": "SI",
  "numero": 6,
  "orden": 5,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Área total de la planta baja de los edificios del campus (m²)",
  "nombre_en": "Total ground-floor area of campus buildings (m2)",
  "tipo": "numero",
  "unidad": "m²",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 20,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Área total de la planta baja de los edificios del campus (m²)",
     "en": "Total ground-floor area of campus buildings (m2)",
     "unidad": "m²",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.7",
  "categoria": "SI",
  "numero": 7,
  "orden": 6,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Área total construida de los edificios del campus (m²)",
  "nombre_en": "Total campus buildings area",
  "tipo": "numero",
  "unidad": "m²",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 20,
  "calculada": false,
  "plantilla": "University_Country_1_7_Total_campus_buildings_area.docx",
  "carpeta_nombre": "1_7_Total_campus_buildings_area",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Área total construida de los edificios del campus (m²)",
     "en": "Total campus buildings area",
     "unidad": "m²",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "edificios",
     "es": "Edificios",
     "en": "Buildings",
     "columnas": [
      {
       "k": "edificio",
       "es": "Edificio",
       "en": "Building",
       "tipo": "texto"
      },
      {
       "k": "area",
       "es": "Área total construida",
       "en": "Total built area",
       "tipo": "numero",
       "unidad": "m²"
      }
     ],
     "min": 1
    }
   ]
  }
 },
 {
  "q": "1.8",
  "categoria": "SI",
  "numero": 8,
  "orden": 7,
  "indicador": "SI1",
  "puntos": 200,
  "nombre_es": "Proporción del área de espacio abierto respecto al área total",
  "nombre_en": "The ratio of open space area to total area",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 20,
  "calculada": false,
  "plantilla": "University_Country_1_8_Ratio of open space area to total area.docx",
  "carpeta_nombre": "1_8_Ratio_of_open_space_area_to_total_area",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 1%"
   },
   {
    "valor": 2,
    "es": "> 1% a 80%"
   },
   {
    "valor": 3,
    "es": "> 80% a 90%"
   },
   {
    "valor": 4,
    "es": "> 90% a 95%"
   },
   {
    "valor": 5,
    "es": "> 95%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    80,
    90,
    95
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "espacios",
     "es": "Espacios abiertos",
     "en": "Open spaces",
     "columnas": [
      {
       "k": "espacio",
       "es": "Espacio abierto",
       "en": "Open space",
       "tipo": "texto"
      },
      {
       "k": "area",
       "es": "Área",
       "en": "Area",
       "tipo": "numero",
       "unidad": "m²"
      },
      {
       "k": "horas",
       "es": "Horas por semana",
       "en": "Hours per week",
       "tipo": "numero",
       "unidad": "h"
      }
     ]
    }
   ],
   "calculo": {
    "id": "SI1",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "1.5.valor"
     },
     {
      "k": "b",
      "desde": "1.6.valor"
     }
    ]
   }
  }
 },
 {
  "q": "1.9",
  "categoria": "SI",
  "numero": 9,
  "orden": 8,
  "indicador": "SI2",
  "puntos": 100,
  "nombre_es": "Vegetación forestal usada en investigación, docencia o vinculación",
  "nombre_en": "Total area on campus covered in forest vegetation used for research, teaching, and/or community engagement (meter2)",
  "tipo": "area_banda",
  "unidad": "m² y %",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 21,
  "calculada": false,
  "plantilla": "University_Country_1_9_Total_area_on_campus_covered_in_forest_vegetation.docx",
  "carpeta_nombre": "1_9_Total_area_on_campus_covered_in_forest_vegetation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 2%"
   },
   {
    "valor": 2,
    "es": "> 2% a 10%"
   },
   {
    "valor": 3,
    "es": "> 10% a 25%"
   },
   {
    "valor": 4,
    "es": "> 25% a 35%"
   },
   {
    "valor": 5,
    "es": "> 35%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    2,
    10,
    25,
    35
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "area",
     "tipo": "numero",
     "es": "Área con vegetación forestal para investigación, docencia o vinculación",
     "en": "Forest vegetation area used for research, teaching or outreach",
     "unidad": "m²",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "SI2",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.area"
     },
     {
      "k": "b",
      "desde": "1.5.valor"
     }
    ]
   }
  }
 },
 {
  "q": "1.10",
  "categoria": "SI",
  "numero": 10,
  "orden": 9,
  "indicador": "SI3",
  "puntos": 200,
  "nombre_es": "Área total cubierta por vegetación plantada",
  "nombre_en": "Total area on campus covered in planted vegetation  (meter2)",
  "tipo": "area_banda",
  "unidad": "m² y %",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 22,
  "calculada": false,
  "plantilla": "University_Country_1_10_Total_area_on_campus_covered_in_planted_vegetation.docx",
  "carpeta_nombre": "1_10_Total_area_on_campus_covered_in_planted_vegetation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 10%"
   },
   {
    "valor": 2,
    "es": "> 10% a 20%"
   },
   {
    "valor": 3,
    "es": "> 20% a 30%"
   },
   {
    "valor": 4,
    "es": "> 30% a 50%"
   },
   {
    "valor": 5,
    "es": "> 50%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    10,
    20,
    30,
    50
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "area",
     "tipo": "numero",
     "es": "Área con vegetación plantada",
     "en": "Area covered by planted vegetation",
     "unidad": "m²",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "SI3",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.area"
     },
     {
      "k": "b",
      "desde": "1.5.valor"
     }
    ]
   }
  }
 },
 {
  "q": "1.11",
  "categoria": "SI",
  "numero": 11,
  "orden": 10,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de estudiantes regulares",
  "nombre_en": "Total number of regular students",
  "tipo": "numero",
  "unidad": "personas",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 22,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "1_11_Total_number_of_regular_students",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de estudiantes regulares",
     "en": "Total number of regular students",
     "unidad": "personas",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.12",
  "categoria": "SI",
  "numero": 12,
  "orden": 11,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de estudiantes en línea",
  "nombre_en": "Total number of online students",
  "tipo": "numero",
  "unidad": "personas",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 22,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de estudiantes en línea",
     "en": "Total number of online students",
     "unidad": "personas",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.13",
  "categoria": "SI",
  "numero": 13,
  "orden": 12,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Personal académico y administrativo (total)",
  "nombre_en": "Total number of academic and administrative staff",
  "tipo": "numero",
  "unidad": "personas",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 22,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Personal académico y administrativo (total)",
     "en": "Total number of academic and administrative staff",
     "unidad": "personas",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.14",
  "categoria": "SI",
  "numero": 14,
  "orden": 13,
  "indicador": "SI4",
  "puntos": 200,
  "nombre_es": "Área de espacio abierto por población del campus",
  "nombre_en": "Open space area divided by campus population",
  "tipo": "razon",
  "unidad": "m²/persona",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 22,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "asc",
   "cortes": [
    10,
    20,
    40,
    70
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "SI4",
    "unidad": "m² por persona",
    "entradas": [
     {
      "k": "a",
      "desde": "1.5.valor"
     },
     {
      "k": "b",
      "desde": "1.6.valor"
     },
     {
      "k": "p",
      "desde": "poblacion"
     }
    ]
   }
  }
 },
 {
  "q": "1.15",
  "categoria": "SI",
  "numero": 15,
  "orden": 14,
  "indicador": "SI5",
  "puntos": 100,
  "nombre_es": "Instalaciones para discapacidad, necesidades especiales y maternidad",
  "nombre_en": "Campus facliities for disable, special needs and or maternity care",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 23,
  "calculada": false,
  "plantilla": "University_Country_1_15_Campus_facliities_for_disable_special_needs_and_or_maternity_care.docx",
  "carpeta_nombre": "1_15_Campus_facliities_for_disable_special_needs_and_or_maternity_care",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguna"
   },
   {
    "valor": 2,
    "es": "Existe una polÃtica"
   },
   {
    "valor": 3,
    "es": "Las instalaciones estÃ¡n en etapa de planificaciÃ³n"
   },
   {
    "valor": 4,
    "es": "Las instalaciones estÃ¡n parcialmente disponibles y operativas"
   },
   {
    "valor": 5,
    "es": "Las instalaciones existen en todos los edificios y estÃ¡n totalmente operativas"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "instalaciones",
     "es": "Instalaciones por edificio",
     "en": "Facilities by building",
     "columnas": [
      {
       "k": "edificio",
       "es": "Edificio",
       "en": "Building",
       "tipo": "texto"
      },
      {
       "k": "instalacion",
       "es": "Instalación",
       "en": "Facility",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "1.16",
  "categoria": "SI",
  "numero": 16,
  "orden": 15,
  "indicador": "SI6",
  "puntos": 100,
  "nombre_es": "Instalaciones de seguridad y protección",
  "nombre_en": "Security and safety facilites",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 23,
  "calculada": false,
  "plantilla": "University_Country_1_16_Security_and_safety_facilites.docx",
  "carpeta_nombre": "1_16_Security_and_safety_facilites",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Sistema pasivo de seguridad y protecciÃ³n"
   },
   {
    "valor": 2,
    "es": "Infraestructura de seguridad y protecciÃ³n (CCTV, lÃnea/botÃ³n de emergencia) disponible y plenamente funcional"
   },
   {
    "valor": 3,
    "es": "Infraestructura de seguridad y protecciÃ³n (CCTV, lÃnea/botÃ³n de emergencia, personal certificado, extintor, hidrante) disponible y plenamente funcional"
   },
   {
    "valor": 4,
    "es": "Infraestructura de seguridad y protecciÃ³n disponible y plenamente funcional, y el tiempo de respuesta ante accidentes, delitos, incendios y desastres naturales es mayor a 5 minutos"
   },
   {
    "valor": 5,
    "es": "Infraestructura de seguridad y protecciÃ³n disponible y plenamente funcional, y el tiempo de respuesta ante accidentes, delitos, incendios y desastres naturales es menor a 5 minutos"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.17",
  "categoria": "SI",
  "numero": 17,
  "orden": 16,
  "indicador": "SI7",
  "puntos": 100,
  "nombre_es": "Infraestructura de salud y bienestar",
  "nombre_en": "Health infrastructure facilities for students, academics and administrative staffs' wellbeing",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 24,
  "calculada": false,
  "plantilla": "University_Country_1_17_Health_infrastructure_facilities.docx",
  "carpeta_nombre": "1_17_Health_infrastructure_facilities",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Infraestructura de salud (primeros auxilios) no disponible"
   },
   {
    "valor": 2,
    "es": "Infraestructura de salud (primeros auxilios, sala de emergencias, clÃnica y personal) disponible"
   },
   {
    "valor": 3,
    "es": "Infraestructura de salud (primeros auxilios, sala de emergencias, clÃnica y personal certificado) disponible"
   },
   {
    "valor": 4,
    "es": "Infraestructura de salud (primeros auxilios, sala de emergencias, clÃnica, hospital y personal certificado) disponible"
   },
   {
    "valor": 5,
    "es": "Infraestructura de salud (primeros auxilios, sala de emergencias, clÃnica, hospital y personal certificado) disponible, sistematizada y accesible al pÃºblico"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.18",
  "categoria": "SI",
  "numero": 18,
  "orden": 17,
  "indicador": "SI8",
  "puntos": 100,
  "nombre_es": "Conservación de flora, fauna y recursos genéticos",
  "nombre_en": "Conservation: plant, animal, and wildlife, genetic resources for food and agriculture secured in either medium or long-term conservation facilities",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 24,
  "calculada": false,
  "plantilla": "University_Country_1_18_Conservation_Area.docx",
  "carpeta_nombre": "1_18_Conservation_Area",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "El programa de conservaciÃ³n estÃ¡ en preparaciÃ³n"
   },
   {
    "valor": 2,
    "es": "El programa de conservaciÃ³n estÃ¡ implementado en 1% a 25%"
   },
   {
    "valor": 3,
    "es": "El programa de conservaciÃ³n estÃ¡ implementado en 25% a 50%"
   },
   {
    "valor": 4,
    "es": "El programa de conservaciÃ³n estÃ¡ implementado en 50% a 75%"
   },
   {
    "valor": 5,
    "es": "El programa de conservaciÃ³n estÃ¡ implementado en mÃ¡s de 75% Si las actividades de conservaciÃ³n se realizan en otra ubicaciÃ³n, su universidad puede incluirlas en el documento de evidencias e incluir esa Ã¡rea de conservaciÃ³n en el Ã¡rea total del campus (Pregunta 1.5)."
   }
  ],
  "bandas": null,
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "1.19",
  "categoria": "SI",
  "numero": 19,
  "orden": 18,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Entorno e Infraestructura en los ODS",
  "nombre_en": "Impact of Setting and Infrastructure programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 25,
  "calculada": false,
  "plantilla": "University_Country_1_19_Impact_of_Setting_and_Infrastructure_programs_in_supporting_SDGs.docx",
  "carpeta_nombre": "1_19_Impact_of_Setting_and_Infrastructure_programs_in_supporting_SDGs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Bajo impacto (apoya 1 a 2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (apoya 3 a 5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (apoya 6 a 9 ODS)"
   },
   {
    "valor": 4,
    "es": "Alto impacto (apoya 10 a 13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (apoya 14 a 17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.1",
  "categoria": "EC",
  "numero": 1,
  "orden": 19,
  "indicador": "EC1",
  "puntos": 200,
  "nombre_es": "Uso de aparatos energéticamente eficientes",
  "nombre_en": "Energy Efficient Appliances Usage",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 25,
  "calculada": false,
  "plantilla": "University_Country_2_1_Energy_efficient_appliances_usage.docx",
  "carpeta_nombre": "2_1_Energy_efficient_appliances_usage",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "< 1%"
   },
   {
    "valor": 2,
    "es": "1% a 25%"
   },
   {
    "valor": 3,
    "es": "> 25% a 50%"
   },
   {
    "valor": 4,
    "es": "> 50% a 75%"
   },
   {
    "valor": 5,
    "es": "> 75%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    25,
    50,
    75
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "aparatos",
     "es": "Aparatos",
     "en": "Appliances",
     "columnas": [
      {
       "k": "aparato",
       "es": "Aparato",
       "en": "Appliance",
       "tipo": "texto"
      },
      {
       "k": "total",
       "es": "Total",
       "en": "Total",
       "tipo": "numero"
      },
      {
       "k": "eficientes",
       "es": "Energéticamente eficientes",
       "en": "Energy-efficient",
       "tipo": "numero"
      }
     ],
     "filas": [
      "Luminarias LED",
      "Aires acondicionados eficientes",
      "Computadores certificados"
     ],
     "min": 1
    }
   ],
   "calculo": {
    "id": "EC1",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.aparatos.eficientes.suma"
     },
     {
      "k": "b",
      "desde": "own.aparatos.total.suma"
     }
    ]
   }
  }
 },
 {
  "q": "2.2",
  "categoria": "EC",
  "numero": 2,
  "orden": 20,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Área total de edificios inteligentes en el campus (m²)",
  "nombre_en": "Total area of smart buildings on campus (m2)",
  "tipo": "numero",
  "unidad": "m²",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 26,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Área total de edificios inteligentes en el campus (m²)",
     "en": "Total area of smart buildings on campus (m2)",
     "unidad": "m²",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.3",
  "categoria": "EC",
  "numero": 3,
  "orden": 21,
  "indicador": "EC2",
  "puntos": 300,
  "nombre_es": "Edificios inteligentes (% del área construida)",
  "nombre_en": "Smart building implementation",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 27,
  "calculada": false,
  "plantilla": "University_Country_2_3_Smart_Building_implementation.docx",
  "carpeta_nombre": "2_3_Smart_Building_implementation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "< 1%"
   },
   {
    "valor": 2,
    "es": "1% a 25%"
   },
   {
    "valor": 3,
    "es": "> 25% a 50%"
   },
   {
    "valor": 4,
    "es": "> 50% a 75%"
   },
   {
    "valor": 5,
    "es": "> 75%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    25,
    50,
    75
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "edificios",
     "es": "Edificios inteligentes",
     "en": "Smart buildings",
     "columnas": [
      {
       "k": "edificio",
       "es": "Edificio",
       "en": "Building",
       "tipo": "texto"
      },
      {
       "k": "area",
       "es": "Área",
       "en": "Area",
       "tipo": "numero",
       "unidad": "m²"
      },
      {
       "k": "requisitos",
       "es": "Requisitos cumplidos (de 22)",
       "en": "Requirements met (of 22)",
       "tipo": "numero"
      }
     ],
     "min": 1
    }
   ],
   "calculo": {
    "id": "EC2",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.edificios.area.suma_si.requisitos>=5"
     },
     {
      "k": "b",
      "desde": "1.7.valor"
     }
    ]
   }
  }
 },
 {
  "q": "2.4",
  "categoria": "EC",
  "numero": 4,
  "orden": 22,
  "indicador": "EC3",
  "puntos": 300,
  "nombre_es": "Número de fuentes de energía renovable en el campus",
  "nombre_en": "Number of renewable energy sources on campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 27,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguna",
    "en": "None"
   },
   {
    "valor": 2,
    "es": "1 fuente",
    "en": "1 source"
   },
   {
    "valor": 3,
    "es": "2 fuentes",
    "en": "2 sources"
   },
   {
    "valor": 4,
    "es": "3 fuentes",
    "en": "3 sources"
   },
   {
    "valor": 5,
    "es": "Más de 3 fuentes",
    "en": "More than 3 sources"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.5",
  "categoria": "EC",
  "numero": 5,
  "orden": 23,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Fuentes de energía renovable y kWh producidos",
  "nombre_en": "Renewable Energy Sources in Campus",
  "tipo": "numero",
  "unidad": "kWh",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 27,
  "calculada": false,
  "plantilla": "University_Country_2_5_Renewable_energy_produce_inside_campus.docx",
  "carpeta_nombre": "2_5_Renewable_energy_produce_inside_campus",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Fuentes de energía renovable y kWh producidos",
     "en": "Renewable Energy Sources in Campus",
     "unidad": "kWh",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "fuentes",
     "es": "Fuentes renovables",
     "en": "Renewable sources",
     "columnas": [
      {
       "k": "fuente",
       "es": "Fuente",
       "en": "Source",
       "tipo": "texto"
      },
      {
       "k": "kwh",
       "es": "Producción",
       "en": "Production",
       "tipo": "numero",
       "unidad": "kWh"
      }
     ],
     "filas": [
      "Energía solar",
      "Biomasa limpia",
      "Energía eólica",
      "Hidroenergía",
      "Geotérmica",
      "Biodiésel",
      "Calor y electricidad combinados (CHP)"
     ]
    }
   ]
  }
 },
 {
  "q": "2.6",
  "categoria": "EC",
  "numero": 6,
  "orden": 24,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Consumo de electricidad por año (kWh)",
  "nombre_en": "Electricity Usage per Year (in Kilowatt hour)",
  "tipo": "numero",
  "unidad": "kWh",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 28,
  "calculada": false,
  "plantilla": "University_Country_2_6_Electricity_usage_per_year.docx",
  "carpeta_nombre": "2_6_Electricity_usage_per_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Consumo de electricidad por año (kWh)",
     "en": "Electricity Usage per Year (in Kilowatt hour)",
     "unidad": "kWh",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.7",
  "categoria": "EC",
  "numero": 7,
  "orden": 25,
  "indicador": "EC4",
  "puntos": 200,
  "nombre_es": "Consumo de electricidad por población del campus (kWh por persona)",
  "nombre_en": "Electricity use per campus population (kWh per person)",
  "tipo": "razon",
  "unidad": "kWh/persona",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 28,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "desc",
   "cortes": [
    2400,
    1500,
    600,
    250
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "EC4",
    "unidad": "kWh por persona",
    "entradas": [
     {
      "k": "a",
      "desde": "2.6.valor"
     },
     {
      "k": "p",
      "desde": "poblacion"
     }
    ]
   }
  }
 },
 {
  "q": "2.8",
  "categoria": "EC",
  "numero": 8,
  "orden": 26,
  "indicador": "EC5",
  "puntos": 200,
  "nombre_es": "Energía renovable producida frente al consumo total",
  "nombre_en": "ratio of renewable energy production divided by total energy usage per year",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 28,
  "calculada": false,
  "plantilla": "University_Country_2_8_ratio_of_renewable_energy_production.docx",
  "carpeta_nombre": "2_8_ratio_of_renewable_energy_production",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 0.5%"
   },
   {
    "valor": 2,
    "es": "> 0.5% a 1%"
   },
   {
    "valor": 3,
    "es": "> 1% a 2%"
   },
   {
    "valor": 4,
    "es": "> 2% a 25%"
   },
   {
    "valor": 5,
    "es": "> 25%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    0.5,
    1,
    2,
    25
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "EC5",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "2.5.valor"
     },
     {
      "k": "b",
      "desde": "2.6.valor"
     }
    ]
   }
  }
 },
 {
  "q": "2.9",
  "categoria": "EC",
  "numero": 9,
  "orden": 27,
  "indicador": "EC6",
  "puntos": 200,
  "nombre_es": "Elementos de edificio verde",
  "nombre_en": "Elements of Green Building Implementation as Reflected in All Buildings",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 28,
  "calculada": false,
  "plantilla": "University_Country_2_9_Elements_of_green_building_implementation.docx",
  "carpeta_nombre": "2_9_Elements_of_green_building_implementation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno (no hay implementaciÃ³n de edificio verde)"
   },
   {
    "valor": 2,
    "es": "1 elemento"
   },
   {
    "valor": 3,
    "es": "2 elementos"
   },
   {
    "valor": 4,
    "es": "3 elementos"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 3 elementos"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "elementos",
     "es": "Elementos de edificio verde",
     "en": "Green building elements",
     "columnas": [
      {
       "k": "edificio",
       "es": "Edificio",
       "en": "Building",
       "tipo": "texto"
      },
      {
       "k": "elementos",
       "es": "Elementos (Apéndice 2)",
       "en": "Elements (Appendix 2)",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "2.10",
  "categoria": "EC",
  "numero": 10,
  "orden": 28,
  "indicador": "EC7",
  "puntos": 200,
  "nombre_es": "Programa de reducción de gases de efecto invernadero",
  "nombre_en": "Greenhouse gas emission reduction program",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 29,
  "calculada": false,
  "plantilla": "University_Country_2_10_Greenhouse_gas_emission_reduction_program.docx",
  "carpeta_nombre": "2_10_Greenhouse_gas_emission_reduction_program",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno (se necesita un programa, pero no se ha hecho nada)"
   },
   {
    "valor": 2,
    "es": "Programa en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "Programa(s) abordan emisiones en un alcance (Alcance 1 o 2 o 3)"
   },
   {
    "valor": 4,
    "es": "Programa(s) abordan emisiones en dos alcances (Alcance 1 y 2, o Alcance 1 y 3, o Alcance 2 y 3)"
   },
   {
    "valor": 5,
    "es": "Programa(s) abordan emisiones en los tres alcances (Alcance 1, 2 y 3)"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.11",
  "categoria": "EC",
  "numero": 11,
  "orden": 29,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Huella de carbono total (tCO2e, 12 meses)",
  "nombre_en": "Please Provide The Total Carbon Footprint (CO2 emission in the last 12 months, in metric tons)",
  "tipo": "numero",
  "unidad": "tCO2e",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 30,
  "calculada": false,
  "plantilla": "University_Country_2_11_Please_provide_total_carbon_footprint.docx",
  "carpeta_nombre": "2_11_Please_provide_total_carbon_footprint",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Huella de carbono total (tCO2e, 12 meses)",
     "en": "Please Provide The Total Carbon Footprint (CO2 emission in the last 12 months, in metric tons)",
     "unidad": "tCO2e",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "huella",
     "es": "Cálculo de la huella de carbono",
     "en": "Carbon footprint calculation",
     "columnas": [
      {
       "k": "fuente",
       "es": "Fuente",
       "en": "Source",
       "tipo": "texto"
      },
      {
       "k": "tco2e",
       "es": "Emisiones",
       "en": "Emissions",
       "tipo": "numero",
       "unidad": "tCO2e"
      }
     ],
     "filas": [
      "Electricidad",
      "Bus del campus",
      "Autos",
      "Motocicletas"
     ]
    }
   ]
  }
 },
 {
  "q": "2.12",
  "categoria": "EC",
  "numero": 12,
  "orden": 30,
  "indicador": "EC8",
  "puntos": 200,
  "nombre_es": "Huella de carbono por persona",
  "nombre_en": "Total carbon footprint per campus population",
  "tipo": "razon",
  "unidad": "t/persona",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 30,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "desc",
   "cortes": [
    2.05,
    1.11,
    0.42,
    0.1
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "EC8",
    "unidad": "tCO2e por persona",
    "entradas": [
     {
      "k": "a",
      "desde": "2.11.valor"
     },
     {
      "k": "p",
      "desde": "poblacion"
     }
    ]
   }
  }
 },
 {
  "q": "2.13",
  "categoria": "EC",
  "numero": 13,
  "orden": 31,
  "indicador": "EC9",
  "puntos": 100,
  "nombre_es": "Programas innovadores en energía y cambio climático",
  "nombre_en": "Number of innovative program(s) in energy and climate change",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 30,
  "calculada": false,
  "plantilla": "University_Country_2_13_Number_of_innovative_program(s)_in energy and climate change.docx",
  "carpeta_nombre": "2_13_Number_of_innovative_program_s_in_energy_and_climate_change",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "1 programa"
   },
   {
    "valor": 3,
    "es": "2 programas"
   },
   {
    "valor": 4,
    "es": "3 programas"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 3 programas"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "2.14",
  "categoria": "EC",
  "numero": 14,
  "orden": 32,
  "indicador": "EC10",
  "puntos": 100,
  "nombre_es": "Programas con impacto sobre el cambio climático",
  "nombre_en": "Impactful university program(s) on climate change",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 31,
  "calculada": false,
  "plantilla": "University_Country_2_14_Impactful_university_program(s)_on_climate_change.docx",
  "carpeta_nombre": "2_14_Impactful_university_program_s_on_climate_change",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "Programa en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "CapacitaciÃ³n/materiales/seminarios/actividades implementados con comunidades del entorno (nivel local)"
   },
   {
    "valor": 4,
    "es": "CapacitaciÃ³n/materiales/seminarios/actividades implementados a nivel nacional"
   },
   {
    "valor": 5,
    "es": "CapacitaciÃ³n/materiales/seminarios/actividades implementados a nivel internacional"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "programas",
     "es": "Programas",
     "en": "Programs",
     "columnas": [
      {
       "k": "programa",
       "es": "Programa",
       "en": "Program",
       "tipo": "texto"
      },
      {
       "k": "alcance",
       "es": "Alcance",
       "en": "Scope",
       "tipo": "texto"
      },
      {
       "k": "participantes",
       "es": "Participantes",
       "en": "Participants",
       "tipo": "numero"
      },
      {
       "k": "url",
       "es": "URL",
       "en": "URL",
       "tipo": "url"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "2.15",
  "categoria": "EC",
  "numero": 15,
  "orden": 33,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Energía y Clima en los ODS",
  "nombre_en": "Impact of Energy and Climate Change programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 31,
  "calculada": false,
  "plantilla": "University_Country_2_15_Impact_of_Energy_and_Climate_Change_programs_in_supporting_the_SDGs.docx",
  "carpeta_nombre": "2_15_Impact_of_Energy_and_Climate_Change_programs_in_supporting_the_SDGs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Impacto bajo (apoya 1 a 2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (apoya 3 a 5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (apoya 6 a 9 ODS)"
   },
   {
    "valor": 4,
    "es": "Impacto alto (apoya 10 a 13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (apoya 14 a 17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.1",
  "categoria": "WS",
  "numero": 1,
  "orden": 34,
  "indicador": "WS1",
  "puntos": 200,
  "nombre_es": "Programa 3R (reducir, reutilizar, reciclar)",
  "nombre_en": "3R (Reduce, Reuse and Recycle) Program for University Waste",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 32,
  "calculada": false,
  "plantilla": "University_Country_3_1_Recycling_Program_For_University_Waste.docx",
  "carpeta_nombre": "3_1_Recycling_Program_For_University_Waste",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "Programa 3R en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "Programa 3R implementado en 1% a 50%"
   },
   {
    "valor": 4,
    "es": "Programa 3R implementado en mÃ¡s de 50% a 75%"
   },
   {
    "valor": 5,
    "es": "Programa 3R implementado en mÃ¡s de 75%"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.2",
  "categoria": "WS",
  "numero": 2,
  "orden": 35,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de papel y plástico producido este año (tons)",
  "nombre_en": "Total volume of paper and plastic produced this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 32,
  "calculada": false,
  "plantilla": "University_Country_3_2_Total_volume_of_paper_and_plastic_produced_this_year.docx",
  "carpeta_nombre": "3_2_Total_volume_of_paper_and_plastic_produced_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de papel y plástico producido este año (tons)",
     "en": "Total volume of paper and plastic produced this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.3",
  "categoria": "WS",
  "numero": 3,
  "orden": 36,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de papel y plástico producido el año pasado (tons)",
  "nombre_en": "Total volume of paper and plastic produced last year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "anterior",
  "requiere_evidencia": true,
  "pagina_guia": 32,
  "calculada": false,
  "plantilla": "University_Country_3_3_Total_volume_of_paper_and_plastic_produced_last_year.docx",
  "carpeta_nombre": "3_3_Total_volume_of_paper_and_plastic_produced_last_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de papel y plástico producido el año pasado (tons)",
     "en": "Total volume of paper and plastic produced last year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.4",
  "categoria": "WS",
  "numero": 4,
  "orden": 37,
  "indicador": "WS2",
  "puntos": 300,
  "nombre_es": "Programa para reducir papel y plástico",
  "nombre_en": "Program to Reduce the Use of Paper and Plastic on Campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 32,
  "calculada": false,
  "plantilla": "University_Country_3_4_Program_to_Reduce_The_Use_of_Paper_and_Plastic_in_Campus.docx",
  "carpeta_nombre": "3_4_Program_to_Reduce_The_Use_of_Paper_and_Plastic_in_Campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "1 a 3 programas"
   },
   {
    "valor": 3,
    "es": "4 a 6 programas"
   },
   {
    "valor": 4,
    "es": "7 a 10 programas"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 10 programas"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.5",
  "categoria": "WS",
  "numero": 5,
  "orden": 38,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos orgánicos producido este año (tons)",
  "nombre_en": "Total volume organic waste produced this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 32,
  "calculada": false,
  "plantilla": "University_Country_3_5_Total_volume_organic_waste_produced_this_year.docx",
  "carpeta_nombre": "3_5_Total_volume_organic_waste_produced_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos orgánicos producido este año (tons)",
     "en": "Total volume organic waste produced this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.6",
  "categoria": "WS",
  "numero": 6,
  "orden": 39,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos orgánicos producido el año pasado (tons)",
  "nombre_en": "Total volume organic waste produced last year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "anterior",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_6_Total_volume_organic_waste_produced_last_year.docx",
  "carpeta_nombre": "3_6_Total_volume_organic_waste_produced_last_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos orgánicos producido el año pasado (tons)",
     "en": "Total volume organic waste produced last year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.7",
  "categoria": "WS",
  "numero": 7,
  "orden": 40,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos orgánicos tratado este año (tons)",
  "nombre_en": "Total volume organic waste treated this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_7_Total_volume_organic_waste_treated_this_year.docx",
  "carpeta_nombre": "3_7_Total_volume_organic_waste_treated_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos orgánicos tratado este año (tons)",
     "en": "Total volume organic waste treated this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.8",
  "categoria": "WS",
  "numero": 8,
  "orden": 41,
  "indicador": "WS3",
  "puntos": 300,
  "nombre_es": "Tratamiento de residuos orgánicos",
  "nombre_en": "Organic Waste Treatment",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_8_Organic_Waste_Treatment.docx",
  "carpeta_nombre": "3_8_Organic_Waste_Treatment",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Vertido a cielo abierto (Open dumping)"
   },
   {
    "valor": 2,
    "es": "Parcial (1% a 35% tratado)"
   },
   {
    "valor": 3,
    "es": "Parcial (mÃ¡s de 35% a 65% tratado)"
   },
   {
    "valor": 4,
    "es": "Parcial (mÃ¡s de 65% a 85% tratado)"
   },
   {
    "valor": 5,
    "es": "Amplio (mÃ¡s de 85% tratado)"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.9",
  "categoria": "WS",
  "numero": 9,
  "orden": 42,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos inorgánicos producido este año (tons)",
  "nombre_en": "Total volume inorganic waste produced this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_9_Total_volume_inorganic_waste_produced_this_year.docx",
  "carpeta_nombre": "3_9_Total_volume_inorganic_waste_produced_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos inorgánicos producido este año (tons)",
     "en": "Total volume inorganic waste produced this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.10",
  "categoria": "WS",
  "numero": 10,
  "orden": 43,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos inorgánicos producido el año pasado (tons)",
  "nombre_en": "Total volume inorganic waste produced last year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "anterior",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_10_Total_volume_inorganic_waste_produced_last_year.docx",
  "carpeta_nombre": "3_10_Total_volume_inorganic_waste_produced_last_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos inorgánicos producido el año pasado (tons)",
     "en": "Total volume inorganic waste produced last year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.11",
  "categoria": "WS",
  "numero": 11,
  "orden": 44,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos inorgánicos tratado este año (tons)",
  "nombre_en": "Total volume inorganic waste treated this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_11_Total_volume_inorganic_waste_treated_this_year.docx",
  "carpeta_nombre": "3_11_Total_volume_inorganic_waste_treated_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos inorgánicos tratado este año (tons)",
     "en": "Total volume inorganic waste treated this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.12",
  "categoria": "WS",
  "numero": 12,
  "orden": 45,
  "indicador": "WS4",
  "puntos": 300,
  "nombre_es": "Tratamiento de residuos inorgánicos",
  "nombre_en": "Inorganic Waste Treatment",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 33,
  "calculada": false,
  "plantilla": "University_Country_3_12_Inorganic_Waste_Treatment.docx",
  "carpeta_nombre": "3_12_Inorganic_Waste_Treatment",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Quemados en Ã¡reas abiertas"
   },
   {
    "valor": 2,
    "es": "Parcial (1% a 35% tratado)"
   },
   {
    "valor": 3,
    "es": "Parcial (mÃ¡s de 35% a 65% tratado)"
   },
   {
    "valor": 4,
    "es": "Parcial (mÃ¡s de 65% a 85% tratado)"
   },
   {
    "valor": 5,
    "es": "Amplio (mÃ¡s de 85% tratado)"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.13",
  "categoria": "WS",
  "numero": 13,
  "orden": 46,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos tóxicos producido este año (tons)",
  "nombre_en": "Total volume toxic waste produced this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 34,
  "calculada": false,
  "plantilla": "University_Country_3_13_Total_volume_toxic_waste_produced_this_year.docx",
  "carpeta_nombre": "3_13_Total_volume_toxic_waste_produced_this_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos tóxicos producido este año (tons)",
     "en": "Total volume toxic waste produced this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.14",
  "categoria": "WS",
  "numero": 14,
  "orden": 47,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos tóxicos producido el año pasado (tons)",
  "nombre_en": "Total volume toxic waste produced last year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "anterior",
  "requiere_evidencia": true,
  "pagina_guia": 34,
  "calculada": false,
  "plantilla": "University_Country_3_14_Total_volume_toxic_waste_produced_last_year.docx",
  "carpeta_nombre": "3_14_Total_volume_toxic_waste_produced_last_year",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos tóxicos producido el año pasado (tons)",
     "en": "Total volume toxic waste produced last year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.15",
  "categoria": "WS",
  "numero": 15,
  "orden": 48,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Volumen total de residuos tóxicos tratado este año (tons)",
  "nombre_en": "Total volume toxic waste treated this year",
  "tipo": "numero",
  "unidad": "toneladas",
  "periodo": "actual",
  "requiere_evidencia": true,
  "pagina_guia": 34,
  "calculada": false,
  "plantilla": "University_Country_3_15_Total_volume_toxic_waste_treated.docx",
  "carpeta_nombre": "3_15_Total_volume_toxic_waste_treated",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Volumen total de residuos tóxicos tratado este año (tons)",
     "en": "Total volume toxic waste treated this year",
     "unidad": "toneladas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.16",
  "categoria": "WS",
  "numero": 16,
  "orden": 49,
  "indicador": "WS5",
  "puntos": 300,
  "nombre_es": "Tratamiento de residuos tóxicos",
  "nombre_en": "Toxic Waste Treatment",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 34,
  "calculada": false,
  "plantilla": "University_Country_3_16_Toxic_Waste_Handled.docx",
  "carpeta_nombre": "3_16_Toxic_Waste_Handled",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No gestionados"
   },
   {
    "valor": 2,
    "es": "Parcial (1% a 35% tratado)"
   },
   {
    "valor": 3,
    "es": "Parcial (mÃ¡s de 35% a 65% tratado)"
   },
   {
    "valor": 4,
    "es": "Parcial (mÃ¡s de 65% a 85% tratado)"
   },
   {
    "valor": 5,
    "es": "Amplio (mÃ¡s de 85% tratado) o el campus genera una cantidad mÃnima de residuos tÃ³xicos"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.17",
  "categoria": "WS",
  "numero": 17,
  "orden": 50,
  "indicador": "WS6",
  "puntos": 300,
  "nombre_es": "Eliminación de aguas residuales",
  "nombre_en": "Sewage Disposal",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 34,
  "calculada": false,
  "plantilla": "University_Country_3_17_Sewage_Disposal.docx",
  "carpeta_nombre": "3_17_Sewage_Disposal",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Descarga sin tratar a vÃas fluviales"
   },
   {
    "valor": 2,
    "es": "Tratadas con tratamiento preliminar"
   },
   {
    "valor": 3,
    "es": "Tratadas con tratamiento primario"
   },
   {
    "valor": 4,
    "es": "Tratadas con tratamiento secundario"
   },
   {
    "valor": 5,
    "es": "Tratadas con tratamiento terciario"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "3.18",
  "categoria": "WS",
  "numero": 18,
  "orden": 51,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Residuos en los ODS",
  "nombre_en": "Impact of Waste Management programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": "n.º de ODS",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": null,
  "calculada": false,
  "plantilla": "University_Country_3_18_Impact_of_Waste_Management_programs_in_supporting_SDGs.docx",
  "carpeta_nombre": "3_18_Impact_of_Waste_Management_programs_in_supporting_SDGs",
  "sin_guia": true,
  "opciones": [
   {
    "valor": 1,
    "es": "Impacto bajo (1 a 2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (3 a 5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (6 a 9 ODS)"
   },
   {
    "valor": 4,
    "es": "Impacto alto (10 a 13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (14 a 17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "4.1",
  "categoria": "WR",
  "numero": 1,
  "orden": 52,
  "indicador": "WR1",
  "puntos": 100,
  "nombre_es": "Área de absorción de agua (sin bosque ni vegetación plantada)",
  "nombre_en": "Total area on campus for water absorption besides the forest and planted vegetation (meter2)",
  "tipo": "area_banda",
  "unidad": "m² y %",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 35,
  "calculada": false,
  "plantilla": "University_Country_4_1_Total_area_on_campus_for_water_absorption.docx",
  "carpeta_nombre": "4_1_Total_area_on_campus_for_water_absorption",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 2% (indique el Ã¡rea total en mÂ²)"
   },
   {
    "valor": 2,
    "es": "> 2% a 10% (indique el Ã¡rea total en mÂ²)"
   },
   {
    "valor": 3,
    "es": "> 10% a 20% (indique el Ã¡rea total en mÂ²)"
   },
   {
    "valor": 4,
    "es": "> 20% a 40% (indique el Ã¡rea total en mÂ²)"
   },
   {
    "valor": 5,
    "es": "> 40% (indique el Ã¡rea total en mÂ²)"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    2,
    10,
    20,
    40
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "area",
     "tipo": "numero",
     "es": "Área de absorción de agua",
     "en": "Water absorption area",
     "unidad": "m²",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "WR1",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.area"
     },
     {
      "k": "b",
      "desde": "1.5.valor"
     }
    ]
   }
  }
 },
 {
  "q": "4.2",
  "categoria": "WR",
  "numero": 2,
  "orden": 53,
  "indicador": "WR2",
  "puntos": 200,
  "nombre_es": "Programa de conservación del agua e implementación",
  "nombre_en": "Water Conservation Program Implementation",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 35,
  "calculada": false,
  "plantilla": "University_Country_4_2_Water_Conservation_Program_Implementation.docx",
  "carpeta_nombre": "4_2_Water_Conservation_Program_Implementation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno (se necesita el programa, pero no se ha tomado ninguna acciÃ³n)"
   },
   {
    "valor": 2,
    "es": "Programa en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "1% a 25% de agua conservada"
   },
   {
    "valor": 4,
    "es": "MÃ¡s de 25% a 50% de agua conservada"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 50% de agua conservada"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "captacion",
     "es": "Captación de agua por campus",
     "en": "Water capture by campus",
     "columnas": [
      {
       "k": "campus",
       "es": "Campus",
       "en": "Campus",
       "tipo": "texto"
      },
      {
       "k": "lluvia",
       "es": "Lluvia",
       "en": "Rainfall",
       "tipo": "numero",
       "unidad": "mm/h"
      },
      {
       "k": "caudal",
       "es": "Caudal",
       "en": "Flow",
       "tipo": "numero",
       "unidad": "L/h"
      },
      {
       "k": "embalses",
       "es": "N.º de embalses",
       "en": "Number of reservoirs",
       "tipo": "numero"
      },
      {
       "k": "capacidad",
       "es": "Capacidad",
       "en": "Capacity",
       "tipo": "numero",
       "unidad": "L"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "4.3",
  "categoria": "WR",
  "numero": 3,
  "orden": 54,
  "indicador": "WR3",
  "puntos": 200,
  "nombre_es": "Implementación del programa de reciclaje de agua",
  "nombre_en": "Water Recycling Program Implementation",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 36,
  "calculada": false,
  "plantilla": "University_Country_4_3_Water_Recycling_Program_Implementation.docx",
  "carpeta_nombre": "4_3_Water_Recycling_Program_Implementation",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno (se necesita el programa, pero no se ha tomado ninguna acciÃ³n)"
   },
   {
    "valor": 2,
    "es": "Programa en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "1% a 25% de agua reciclada"
   },
   {
    "valor": 4,
    "es": "MÃ¡s de 25% a 50% de agua reciclada"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 50% de agua reciclada"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "4.4",
  "categoria": "WR",
  "numero": 4,
  "orden": 55,
  "indicador": "WR4",
  "puntos": 200,
  "nombre_es": "Uso de aparatos eficientes en agua",
  "nombre_en": "Water Efficient Appliances Usage (e.g. hand washing taps, toilet flush, etc.)",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 36,
  "calculada": false,
  "plantilla": "University_Country_4_4_The_Use of_Water_Efficient_Appliances-Water_tap_toilet_flush_etc.docx",
  "carpeta_nombre": "4_4_The_Use_of_Water_Efficient_Appliances-Water_tap_toilet_flush_etc",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "< 20% de aparatos eficientes en agua instalados"
   },
   {
    "valor": 2,
    "es": "20% a 40% instalados"
   },
   {
    "valor": 3,
    "es": "> 40% a 60% instalados"
   },
   {
    "valor": 4,
    "es": "> 60% a 80% instalados"
   },
   {
    "valor": 5,
    "es": "> 80% instalados"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    20,
    40,
    60,
    80
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "aparatos",
     "es": "Aparatos",
     "en": "Appliances",
     "columnas": [
      {
       "k": "aparato",
       "es": "Aparato",
       "en": "Appliance",
       "tipo": "texto"
      },
      {
       "k": "total",
       "es": "Total",
       "en": "Total",
       "tipo": "numero"
      },
      {
       "k": "eficientes",
       "es": "Eficientes en agua",
       "en": "Water-efficient",
       "tipo": "numero"
      }
     ],
     "filas": [
      "Sanitarios de doble descarga",
      "Grifos con sensor",
      "Duchas ahorradoras"
     ],
     "min": 1
    }
   ],
   "calculo": {
    "id": "WR4",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.aparatos.eficientes.suma"
     },
     {
      "k": "b",
      "desde": "own.aparatos.total.suma"
     }
    ]
   }
  }
 },
 {
  "q": "4.5",
  "categoria": "WR",
  "numero": 5,
  "orden": 56,
  "indicador": "WR5",
  "puntos": 200,
  "nombre_es": "Consumo de agua tratada",
  "nombre_en": "Consumption of treated water",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 36,
  "calculada": false,
  "plantilla": "University_Country_4_5_Consumption_Of_Treated_Wate.docx",
  "carpeta_nombre": "4_5_Consumption_Of_Treated_Wate",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "1% a 25% de agua tratada consumida"
   },
   {
    "valor": 3,
    "es": "> 25% a 50% de agua tratada consumida"
   },
   {
    "valor": 4,
    "es": "> 50% a 75% de agua tratada consumida"
   },
   {
    "valor": 5,
    "es": "> 75% de agua tratada consumida"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    0,
    25,
    50,
    75
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "tratada",
     "tipo": "numero",
     "es": "Agua tratada consumida",
     "en": "Treated water consumed",
     "unidad": "m³",
     "obligatorio": true
    },
    {
     "k": "total",
     "tipo": "numero",
     "es": "Agua consumida de todas las fuentes",
     "en": "Water consumed from all sources",
     "unidad": "m³",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "WR5",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "own.tratada"
     },
     {
      "k": "b",
      "desde": "own.total"
     }
    ]
   }
  }
 },
 {
  "q": "4.6",
  "categoria": "WR",
  "numero": 6,
  "orden": 57,
  "indicador": "WR6",
  "puntos": 200,
  "nombre_es": "Control de la contaminación del agua en el área del campus",
  "nombre_en": "Water pollution control in campus area",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 37,
  "calculada": false,
  "plantilla": "University_Country_4_6_Water pollution control in campus area.docx",
  "carpeta_nombre": "4_6_Water_pollution_control_in_campus_area",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Las polÃticas y programas para el control de la contaminaciÃ³n del agua estÃ¡n en etapa de diseÃ±o"
   },
   {
    "valor": 2,
    "es": "Las polÃticas y programas para el control de la contaminaciÃ³n del agua estÃ¡n en etapa de construcciÃ³n"
   },
   {
    "valor": 3,
    "es": "Las polÃticas y programas para el control de la contaminaciÃ³n del agua estÃ¡n en etapa inicial de implementaciÃ³n"
   },
   {
    "valor": 4,
    "es": "Las polÃticas y programas para el control de la contaminaciÃ³n del agua estÃ¡n completamente implementados y se monitorean ocasionalmente"
   },
   {
    "valor": 5,
    "es": "Las polÃticas y programas para el control de la contaminaciÃ³n del agua estÃ¡n completamente implementados y se monitorean regularmente"
   }
  ],
  "bandas": null,
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "politica",
     "tipo": "texto_largo",
     "es": "Política",
     "en": "Policy",
     "traducible": true
    },
    {
     "k": "monitoreo",
     "tipo": "texto_largo",
     "es": "Monitoreo",
     "en": "Monitoring",
     "traducible": true
    },
    {
     "k": "programas",
     "tipo": "texto_largo",
     "es": "Programas",
     "en": "Programs",
     "traducible": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "4.7",
  "categoria": "WR",
  "numero": 7,
  "orden": 58,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Agua en los ODS",
  "nombre_en": "Impact of Water Management programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 37,
  "calculada": false,
  "plantilla": "University_Country_4_7_Impact_of_Water_Management_programs_in_supporting_SDGs.docx",
  "carpeta_nombre": "4_7_Impact_of_Water_Management_programs_in_supporting_SDGs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Impacto bajo (apoya 1 a 2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (apoya 3 a 5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (apoya 6 a 9 ODS)"
   },
   {
    "valor": 4,
    "es": "Impacto alto (apoya 10 a 13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (apoya 14 a 17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.1",
  "categoria": "TR",
  "numero": 1,
  "orden": 59,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de autos utilizados activamente y gestionados por la universidad",
  "nombre_en": "Number of cars actively used and managed by the university",
  "tipo": "numero",
  "unidad": "vehículos",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 38,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de autos utilizados activamente y gestionados por la universidad",
     "en": "Number of cars actively used and managed by the university",
     "unidad": "vehículos",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.2",
  "categoria": "TR",
  "numero": 2,
  "orden": 60,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de autos que ingresan diariamente a la universidad",
  "nombre_en": "Number of cars entering the university daily",
  "tipo": "numero",
  "unidad": "vehículos/día",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 38,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de autos que ingresan diariamente a la universidad",
     "en": "Number of cars entering the university daily",
     "unidad": "vehículos/día",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.3",
  "categoria": "TR",
  "numero": 3,
  "orden": 61,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de motocicletas que ingresan diariamente a la universidad",
  "nombre_en": "Number of motorcycles entering the university daily",
  "tipo": "numero",
  "unidad": "motos/día",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 38,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de motocicletas que ingresan diariamente a la universidad",
     "en": "Number of motorcycles entering the university daily",
     "unidad": "motos/día",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.4",
  "categoria": "TR",
  "numero": 4,
  "orden": 62,
  "indicador": "TR1",
  "puntos": 200,
  "nombre_es": "Vehículos con emisiones por persona del campus",
  "nombre_en": "The total number of vehicles (cars and motorcycles) divided by total campus' population",
  "tipo": "razon",
  "unidad": "veh./persona",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 38,
  "calculada": false,
  "plantilla": "University_Country_5_4_total_number_of_vehicles_divided_by_population.docx",
  "carpeta_nombre": "5_4_total_number_of_vehicles_divided_by_population",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¥ 1"
   },
   {
    "valor": 2,
    "es": "> 0.5 a 1"
   },
   {
    "valor": 3,
    "es": "> 0.125 a 0.5"
   },
   {
    "valor": 4,
    "es": "> 0.045 a 0.125"
   },
   {
    "valor": 5,
    "es": "< 0.045"
   }
  ],
  "bandas": {
   "sentido": "desc",
   "cortes": [
    1,
    0.5,
    0.125,
    0.045
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "TR1",
    "unidad": "vehículos por persona",
    "entradas": [
     {
      "k": "a",
      "desde": "5.1.valor"
     },
     {
      "k": "b",
      "desde": "5.2.valor"
     },
     {
      "k": "c",
      "desde": "5.3.valor"
     },
     {
      "k": "p",
      "desde": "poblacion"
     }
    ]
   }
  }
 },
 {
  "q": "5.5",
  "categoria": "TR",
  "numero": 5,
  "orden": 63,
  "indicador": "TR2",
  "puntos": 250,
  "nombre_es": "Servicios de shuttle",
  "nombre_en": "Shuttle Services",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 38,
  "calculada": false,
  "plantilla": "University_Country_5_5_Shuttle_services.docx",
  "carpeta_nombre": "5_5_Shuttle_services",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Es posible, pero no lo proporciona la universidad"
   },
   {
    "valor": 2,
    "es": "Proporcionado (por la universidad u otras partes), regular, pero no gratuito"
   },
   {
    "valor": 3,
    "es": "Proporcionado (por la universidad u otras partes), y la universidad subsidia parte del costo"
   },
   {
    "valor": 4,
    "es": "Proporcionado por la universidad, regular y gratuito"
   },
   {
    "valor": 5,
    "es": "Proporcionado por la universidad, regular, y operado usando vehÃculos de cero emisiones; o el uso de shuttle no es aplicable"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.6",
  "categoria": "TR",
  "numero": 6,
  "orden": 64,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de shuttles operando en la universidad",
  "nombre_en": "Number of shuttles operating at the university",
  "tipo": "numero",
  "unidad": "buses",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 39,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de shuttles operando en la universidad",
     "en": "Number of shuttles operating at the university",
     "unidad": "buses",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.7",
  "categoria": "TR",
  "numero": 7,
  "orden": 65,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número promedio de pasajeros por viaje de shuttle",
  "nombre_en": "Average number of passengers per shuttle trip",
  "tipo": "numero",
  "unidad": "pasajeros/viaje",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 39,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número promedio de pasajeros por viaje de shuttle",
     "en": "Average number of passengers per shuttle trip",
     "unidad": "pasajeros/viaje",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.8",
  "categoria": "TR",
  "numero": 8,
  "orden": 66,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de viajes de shuttle por día",
  "nombre_en": "Total number of shuttle trips per day",
  "tipo": "numero",
  "unidad": "viajes/día",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 39,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de viajes de shuttle por día",
     "en": "Total number of shuttle trips per day",
     "unidad": "viajes/día",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.9",
  "categoria": "TR",
  "numero": 9,
  "orden": 67,
  "indicador": "TR3",
  "puntos": 200,
  "nombre_es": "Disponibilidad de vehículos de cero emisiones (ZEV)",
  "nombre_en": "Zero Emission Vehicles (ZEV) availability on campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 39,
  "calculada": false,
  "plantilla": "University_Country_5_9_Zero Emission Vehicles_availability_on_campus.docx",
  "carpeta_nombre": "5_9_Zero_Emission_Vehicles_availability_on_campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Los ZEV no estÃ¡n disponibles"
   },
   {
    "valor": 2,
    "es": "El uso de ZEV no es posible o prÃ¡ctico"
   },
   {
    "valor": 3,
    "es": "Los ZEV estÃ¡n disponibles, pero no los proporciona la universidad"
   },
   {
    "valor": 4,
    "es": "Los ZEV estÃ¡n disponibles, los proporciona la universidad y son de pago (uso pagado)"
   },
   {
    "valor": 5,
    "es": "Los ZEV estÃ¡n disponibles y los proporciona la universidad de forma gratuita*"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "zev",
     "es": "Vehículos de cero emisiones",
     "en": "Zero-emission vehicles",
     "columnas": [
      {
       "k": "tipo",
       "es": "Tipo de ZEV",
       "en": "ZEV type",
       "tipo": "texto"
      },
      {
       "k": "total",
       "es": "Total",
       "en": "Total",
       "tipo": "numero"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "5.10",
  "categoria": "TR",
  "numero": 10,
  "orden": 68,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número promedio de Vehículos de Cero Emisiones (ZEV) en el campus por día",
  "nombre_en": "Average number of zero-emission vehicles (ZEV) on campus per day",
  "tipo": "numero",
  "unidad": "ZEV/día",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 39,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número promedio de Vehículos de Cero Emisiones (ZEV) en el campus por día",
     "en": "Average number of zero-emission vehicles (ZEV) on campus per day",
     "unidad": "ZEV/día",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.11",
  "categoria": "TR",
  "numero": 11,
  "orden": 69,
  "indicador": "TR4",
  "puntos": 200,
  "nombre_es": "Número total de ZEV dividido por la población total del campus",
  "nombre_en": "Total ZEV divided by total campus population",
  "tipo": "razon",
  "unidad": "ZEV/persona",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 39,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "asc",
   "cortes": [
    0.002,
    0.004,
    0.008,
    0.02
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "TR4",
    "unidad": "ZEV por persona",
    "entradas": [
     {
      "k": "a",
      "desde": "5.10.valor"
     },
     {
      "k": "p",
      "desde": "poblacion"
     }
    ]
   }
  }
 },
 {
  "q": "5.12",
  "categoria": "TR",
  "numero": 12,
  "orden": 70,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Área total de estacionamiento a nivel del suelo (m²)",
  "nombre_en": "Total ground-level parking area (m2)",
  "tipo": "numero",
  "unidad": "m²",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 40,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Área total de estacionamiento a nivel del suelo (m²)",
     "en": "Total ground-level parking area (m2)",
     "unidad": "m²",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.13",
  "categoria": "TR",
  "numero": 13,
  "orden": 71,
  "indicador": "TR5",
  "puntos": 200,
  "nombre_es": "Estacionamiento en superficie frente al área del campus",
  "nombre_en": "Ratio of Parking Area to Total Campus Area",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 40,
  "calculada": false,
  "plantilla": "University_Country_5_13_Parking_area.docx",
  "carpeta_nombre": "5_13_Parking_area",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "> 11%"
   },
   {
    "valor": 2,
    "es": "> 7% a 11%"
   },
   {
    "valor": 3,
    "es": "> 4% a 7%"
   },
   {
    "valor": 4,
    "es": "> 1% a 4%"
   },
   {
    "valor": 5,
    "es": "< 1%"
   }
  ],
  "bandas": {
   "sentido": "desc",
   "cortes": [
    11,
    7,
    4,
    1
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "TR5",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "5.12.valor"
     },
     {
      "k": "b",
      "desde": "1.5.valor"
     }
    ]
   }
  }
 },
 {
  "q": "5.14",
  "categoria": "TR",
  "numero": 14,
  "orden": 72,
  "indicador": "TR6",
  "puntos": 200,
  "nombre_es": "Programa para limitar o reducir el estacionamiento (3 años)",
  "nombre_en": "Program to limit or decrease the parking area on campus for the last 3 years",
  "tipo": "escala",
  "unidad": null,
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 40,
  "calculada": false,
  "plantilla": "University_Country_5_14_Program_to_limit_or_decrease_the_parking_area_on_campus.docx",
  "carpeta_nombre": "5_14_Program_to_limit_or_decrease_the_parking_area_on_campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "En preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "ReducciÃ³n de menos del 10% del Ã¡rea de estacionamiento"
   },
   {
    "valor": 4,
    "es": "ReducciÃ³n del 10% al 30% del Ã¡rea de estacionamiento"
   },
   {
    "valor": 5,
    "es": "ReducciÃ³n de mÃ¡s del 30% del Ã¡rea de estacionamiento, o la reducciÃ³n del estacionamiento ha alcanzado su lÃmite prÃ¡ctico"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.15",
  "categoria": "TR",
  "numero": 15,
  "orden": 73,
  "indicador": "TR7",
  "puntos": 200,
  "nombre_es": "Iniciativas para reducir vehículos privados",
  "nombre_en": "Number of Transportation Initiatives to Decrease Private Vehicles on Campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 40,
  "calculada": false,
  "plantilla": "University_Country_5_15_Number of Transportation Initiatives to Decrease Private Vehicles on Campus.docx",
  "carpeta_nombre": "5_15_Number_of_Transportation_Initiatives_to_Decrease_Private_Vehicles_on_Campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguna iniciativa"
   },
   {
    "valor": 2,
    "es": "1 iniciativa"
   },
   {
    "valor": 3,
    "es": "2 iniciativas"
   },
   {
    "valor": 4,
    "es": "3 iniciativas"
   },
   {
    "valor": 5,
    "es": "> 3 iniciativas, o la iniciativa ya no es necesaria"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.16",
  "categoria": "TR",
  "numero": 16,
  "orden": 74,
  "indicador": "TR8",
  "puntos": 250,
  "nombre_es": "Senderos peatonales en el campus",
  "nombre_en": "Pedestrian Path Policy on Campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 41,
  "calculada": false,
  "plantilla": "University_Country_5_16_Pedestrian Path Policy on Campus.docx",
  "carpeta_nombre": "5_16_Pedestrian_Path_Policy_on_Campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "Disponible"
   },
   {
    "valor": 3,
    "es": "Disponible y diseÃ±ado para la seguridad"
   },
   {
    "valor": 4,
    "es": "Disponible y diseÃ±ado para seguridad y conveniencia"
   },
   {
    "valor": 5,
    "es": "Disponible, diseÃ±ado para seguridad y conveniencia, y en algunas partes con caracterÃsticas adaptadas para personas con discapacidad"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.17",
  "categoria": "TR",
  "numero": 17,
  "orden": 75,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Distancia diaria aproximada recorrida por vehículos solo dentro del campus (km)",
  "nombre_en": "Approximate daily distance traveled by vehicles inside the campus only (km)",
  "tipo": "numero",
  "unidad": "km/día",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 41,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Distancia diaria aproximada recorrida por vehículos solo dentro del campus (km)",
     "en": "Approximate daily distance traveled by vehicles inside the campus only (km)",
     "unidad": "km/día",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "5.18",
  "categoria": "TR",
  "numero": 18,
  "orden": 76,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Transporte en los ODS",
  "nombre_en": "Impact of Transportation programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 41,
  "calculada": false,
  "plantilla": "University_Country_5_18_Impact_of_Transportation_programs_in_supporting_SDGs.docx",
  "carpeta_nombre": "5_18_Impact_of_Transportation_programs_in_supporting_SDGs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Impacto bajo (apoya 1 a 2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (apoya 3 a 5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (apoya 6 a 9 ODS)"
   },
   {
    "valor": 4,
    "es": "Impacto alto (apoya 10 a 13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (apoya 14 a 17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.1",
  "categoria": "ED",
  "numero": 1,
  "orden": 77,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Cursos relacionados con sostenibilidad",
  "nombre_en": "Number of courses/subjects related to sustainability offered",
  "tipo": "numero",
  "unidad": "cursos",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 42,
  "calculada": false,
  "plantilla": "University_Country_6_1_Number_of_courses_or_modules_related_to_environment_and_sustainability_offered.docx",
  "carpeta_nombre": "6_1_Number_of_courses_or_modules_related_to_environment_and_sustainability_offered",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Cursos relacionados con sostenibilidad",
     "en": "Number of courses/subjects related to sustainability offered",
     "unidad": "cursos",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "cursos",
     "es": "Cursos de sostenibilidad",
     "en": "Sustainability courses",
     "columnas": [
      {
       "k": "curso",
       "es": "Curso",
       "en": "Course",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.2",
  "categoria": "ED",
  "numero": 2,
  "orden": 78,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Total de cursos ofrecidos",
  "nombre_en": "Total Number of Courses/Subjects Offered",
  "tipo": "numero",
  "unidad": "cursos",
  "periodo": "serie",
  "requiere_evidencia": true,
  "pagina_guia": 42,
  "calculada": false,
  "plantilla": "University_Country_6_2_Total_number_of_courses_or_modules_offered.docx",
  "carpeta_nombre": "6_2_Total_number_of_courses_or_modules_offered",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Total de cursos ofrecidos",
     "en": "Total Number of Courses/Subjects Offered",
     "unidad": "cursos",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "anios",
     "es": "Total de cursos por año",
     "en": "Total courses per year",
     "columnas": [
      {
       "k": "anio",
       "es": "Año",
       "en": "Year",
       "tipo": "texto"
      },
      {
       "k": "total",
       "es": "Total de cursos",
       "en": "Total courses",
       "tipo": "numero"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.3",
  "categoria": "ED",
  "numero": 3,
  "orden": 79,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Programas de estudio relacionados con sostenibilidad",
  "nombre_en": "Total number of study program related to sustainability offered",
  "tipo": "numero",
  "unidad": "programas",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 42,
  "calculada": false,
  "plantilla": "University_Country_6_3_Total_number_of_study_program_related_to_sustainability_offered.docx",
  "carpeta_nombre": "6_3_Total_number_of_study_program_related_to_sustainability_offered",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Programas de estudio relacionados con sostenibilidad",
     "en": "Total number of study program related to sustainability offered",
     "unidad": "programas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "programas",
     "es": "Programas de estudio",
     "en": "Study programs",
     "columnas": [
      {
       "k": "programa",
       "es": "Programa",
       "en": "Program",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.4",
  "categoria": "ED",
  "numero": 4,
  "orden": 80,
  "indicador": "ED1",
  "puntos": 200,
  "nombre_es": "Proporción de cursos relacionados con sostenibilidad respecto al total de cursos/asignaturas",
  "nombre_en": "Ratio of sustainability courses to total courses",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 42,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    5,
    10,
    20
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "ED1",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "6.1.valor"
     },
     {
      "k": "b",
      "desde": "6.2.valor"
     }
    ]
   }
  }
 },
 {
  "q": "6.5",
  "categoria": "ED",
  "numero": 5,
  "orden": 81,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Total de fondos de investigación dedicados a investigación en sostenibilidad (USD)",
  "nombre_en": "Total Research Funds Dedicated to Sustainability Research (in US Dollars)",
  "tipo": "numero",
  "unidad": "USD (prom. 3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 42,
  "calculada": false,
  "plantilla": "University_Country_6_5_Total Research Funds Dedicated to Sustainability Research (in US Dollars).docx",
  "carpeta_nombre": "6_5_Total_Research_Funds_Dedicated_to_Sustainability_Research_in_US_Dollars",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "y1",
     "tipo": "numero",
     "es": "Año 1",
     "en": "Year 1",
     "unidad": "USD",
     "obligatorio": true
    },
    {
     "k": "y2",
     "tipo": "numero",
     "es": "Año 2",
     "en": "Year 2",
     "unidad": "USD"
    },
    {
     "k": "y3",
     "tipo": "numero",
     "es": "Año 3",
     "en": "Year 3",
     "unidad": "USD"
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.6",
  "categoria": "ED",
  "numero": 6,
  "orden": 82,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Total de fondos de investigación (USD)",
  "nombre_en": "Total Research Funds (in US Dollars)",
  "tipo": "numero",
  "unidad": "USD (prom. 3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 43,
  "calculada": false,
  "plantilla": "University_Country_6_6_Total Research Funds (in US Dollars).docx",
  "carpeta_nombre": "6_6_Total_Research_Funds_in_US_Dollars",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "y1",
     "tipo": "numero",
     "es": "Año 1",
     "en": "Year 1",
     "unidad": "USD",
     "obligatorio": true
    },
    {
     "k": "y2",
     "tipo": "numero",
     "es": "Año 2",
     "en": "Year 2",
     "unidad": "USD"
    },
    {
     "k": "y3",
     "tipo": "numero",
     "es": "Año 3",
     "en": "Year 3",
     "unidad": "USD"
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.7",
  "categoria": "ED",
  "numero": 7,
  "orden": 83,
  "indicador": "ED2",
  "puntos": 200,
  "nombre_es": "Proporción del financiamiento de investigación en sostenibilidad respecto al financiamiento total",
  "nombre_en": "Ratio of sustainability research funding to total research funding",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 43,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    10,
    20,
    40
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "ED2",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "6.5.promedio"
     },
     {
      "k": "b",
      "desde": "6.6.promedio"
     }
    ]
   }
  }
 },
 {
  "q": "6.8",
  "categoria": "ED",
  "numero": 8,
  "orden": 84,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de docentes e investigadores en un año",
  "nombre_en": "Number of lecturers and researchers on campus in one year period",
  "tipo": "numero",
  "unidad": "personas",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 43,
  "calculada": false,
  "plantilla": "University_Country_6_8_Number_of_lecturers_and_researchers_on_campus_in_one_year_period.docx",
  "carpeta_nombre": "6_8_Number_of_lecturers_and_researchers_on_campus_in_one_year_period",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de docentes e investigadores en un año",
     "en": "Number of lecturers and researchers on campus in one year period",
     "unidad": "personas",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.9",
  "categoria": "ED",
  "numero": 9,
  "orden": 85,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de publicaciones académicas indexadas sobre sostenibilidad en un año",
  "nombre_en": "Number of scholarly publications on sustainability in one year period",
  "tipo": "numero",
  "unidad": "publicaciones",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 43,
  "calculada": false,
  "plantilla": "University_Country_6_9_Number_of_scholarly_publications_on_sustainability_in_one_year_period.docx",
  "carpeta_nombre": "6_9_Number_of_scholarly_publications_on_sustainability_in_one_year_period",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de publicaciones académicas indexadas sobre sostenibilidad en un año",
     "en": "Number of scholarly publications on sustainability in one year period",
     "unidad": "publicaciones",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.10",
  "categoria": "ED",
  "numero": 10,
  "orden": 86,
  "indicador": "ED3",
  "puntos": 200,
  "nombre_es": "Publicaciones de sostenibilidad por docente o investigador",
  "nombre_en": "Ratio of scholarly publications on sustainability to lecturers and researchers on campus in one year period",
  "tipo": "razon",
  "unidad": "pub./docente",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 43,
  "calculada": false,
  "plantilla": "University_Country_6_10_Ratio_of_scholarly_publications_on_sustainability_to_lecturers_and_researchers_on_campus.docx",
  "carpeta_nombre": "6_10_Ratio_of_scholarly_publications_on_sustainability_to_lecturers_and_researchers_on_campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "< 0.5"
   },
   {
    "valor": 2,
    "es": "0.5â€“1"
   },
   {
    "valor": 3,
    "es": "> 1â€“2"
   },
   {
    "valor": 4,
    "es": "> 2â€“3"
   },
   {
    "valor": 5,
    "es": "> 3"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    0.5,
    1,
    2,
    3
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "ED3",
    "unidad": "publicaciones por docente",
    "entradas": [
     {
      "k": "a",
      "desde": "6.9.valor"
     },
     {
      "k": "b",
      "desde": "6.8.valor"
     }
    ]
   }
  }
 },
 {
  "q": "6.11",
  "categoria": "ED",
  "numero": 11,
  "orden": 87,
  "indicador": "ED4",
  "puntos": 100,
  "nombre_es": "Número de eventos relacionados con sostenibilidad",
  "nombre_en": "Number of Events Related to Sustainability",
  "tipo": "escala",
  "unidad": null,
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 43,
  "calculada": false,
  "plantilla": "University_Country_6_11_Number_of_events_related_to_environment_and_sustainability.docx",
  "carpeta_nombre": "6_11_Number_of_events_related_to_environment_and_sustainability",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "0"
   },
   {
    "valor": 2,
    "es": "1â€“5"
   },
   {
    "valor": 3,
    "es": "6â€“20"
   },
   {
    "valor": 4,
    "es": "21â€“50"
   },
   {
    "valor": 5,
    "es": "> 50"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    0,
    5,
    20,
    50
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "derivada": true
    },
    {
     "k": "y1",
     "tipo": "numero",
     "es": "Año 1",
     "en": "Year 1",
     "unidad": "eventos",
     "obligatorio": true
    },
    {
     "k": "y2",
     "tipo": "numero",
     "es": "Año 2",
     "en": "Year 2",
     "unidad": "eventos"
    },
    {
     "k": "y3",
     "tipo": "numero",
     "es": "Año 3",
     "en": "Year 3",
     "unidad": "eventos"
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.12",
  "categoria": "ED",
  "numero": 12,
  "orden": 88,
  "indicador": "ED5",
  "puntos": 150,
  "nombre_es": "Actividades de organizaciones estudiantiles en sostenibilidad",
  "nombre_en": "Number of activities organized by student organizations related to sustainability per year",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 44,
  "calculada": false,
  "plantilla": "University_Country_6_12_Number_of_activities_organized_by_student_organizations_related_to_sustainability_per_year.docx",
  "carpeta_nombre": "6_12_Number_of_activities_organized_by_student_organizations_related_to_sustainability_per_year",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "0"
   },
   {
    "valor": 2,
    "es": "1â€“5"
   },
   {
    "valor": 3,
    "es": "6â€“10"
   },
   {
    "valor": 4,
    "es": "11â€“20"
   },
   {
    "valor": 5,
    "es": "> 20"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.13",
  "categoria": "ED",
  "numero": 13,
  "orden": 89,
  "indicador": "ED6",
  "puntos": 100,
  "nombre_es": "Número de actividades culturales en el campus",
  "nombre_en": "Number of cultural activities on campus (e.g.Cultural Festival)",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 44,
  "calculada": false,
  "plantilla": "University_Country_6_13_cultural_activities_on_campus.docx",
  "carpeta_nombre": "6_13_cultural_activities_on_campus",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguna"
   },
   {
    "valor": 2,
    "es": "1â€“3 eventos por aÃ±o"
   },
   {
    "valor": 3,
    "es": "4â€“6 eventos por aÃ±o"
   },
   {
    "valor": 4,
    "es": "7â€“10 eventos por aÃ±o"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 10 eventos por aÃ±o"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.14",
  "categoria": "ED",
  "numero": 14,
  "orden": 90,
  "indicador": "ED7",
  "puntos": 100,
  "nombre_es": "Programas de sostenibilidad con colaboración internacional",
  "nombre_en": "Number of university sustainability program(s) with international collaborations",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 44,
  "calculada": false,
  "plantilla": "University_Country_6_14_Number_of_university_sustainability_program(s)_with_international_collaborations.docx",
  "carpeta_nombre": "6_14_Number_of_university_sustainability_program_s_with_international_collaborations",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "1â€“3 programas por aÃ±o"
   },
   {
    "valor": 3,
    "es": "4â€“6 programas por aÃ±o"
   },
   {
    "valor": 4,
    "es": "7â€“10 programas por aÃ±o"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 10 programas por aÃ±o"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "6.15",
  "categoria": "ED",
  "numero": 15,
  "orden": 91,
  "indicador": "ED8",
  "puntos": 100,
  "nombre_es": "Proyectos de servicio comunitario con estudiantes",
  "nombre_en": "Number of sustainablity community services project organised and/or involving students",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 45,
  "calculada": false,
  "plantilla": "University_Country_6_15_Number of sustainablity community services project.docx",
  "carpeta_nombre": "6_15_Number_of_sustainablity_community_services_project",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "1â€“3 proyectos por aÃ±o"
   },
   {
    "valor": 3,
    "es": "4â€“6 proyectos por aÃ±o"
   },
   {
    "valor": 4,
    "es": "7â€“10 proyectos por aÃ±o"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 10 proyectos por aÃ±o"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "proyectos",
     "es": "Proyectos de servicio comunitario",
     "en": "Community service projects",
     "columnas": [
      {
       "k": "proyecto",
       "es": "Proyecto",
       "en": "Project",
       "tipo": "texto"
      },
      {
       "k": "participantes",
       "es": "Participantes",
       "en": "Participants",
       "tipo": "numero"
      },
      {
       "k": "duracion",
       "es": "Duración",
       "en": "Duration",
       "tipo": "texto"
      },
      {
       "k": "area",
       "es": "Área (SI…ED)",
       "en": "Area (SI…ED)",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.16",
  "categoria": "ED",
  "numero": 16,
  "orden": 92,
  "indicador": "ED9",
  "puntos": 100,
  "nombre_es": "Número de start-ups relacionadas con sostenibilidad",
  "nombre_en": "Number of sustainability-related startups",
  "tipo": "escala",
  "unidad": null,
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 45,
  "calculada": false,
  "plantilla": "University_Country_6_16_Number of sustainability-related startups.docx",
  "carpeta_nombre": "6_16_Number_of_sustainability-related_startups",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguna"
   },
   {
    "valor": 2,
    "es": "1â€“5 start-ups"
   },
   {
    "valor": 3,
    "es": "6â€“10 start-ups"
   },
   {
    "valor": 4,
    "es": "11â€“15 start-ups"
   },
   {
    "valor": 5,
    "es": "MÃ¡s de 15 start-ups"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "startups",
     "es": "Start-ups",
     "en": "Start-ups",
     "columnas": [
      {
       "k": "nombre",
       "es": "Start-up",
       "en": "Start-up",
       "tipo": "texto"
      },
      {
       "k": "categoria",
       "es": "Categoría",
       "en": "Category",
       "tipo": "texto"
      },
      {
       "k": "url",
       "es": "URL",
       "en": "URL",
       "tipo": "url"
      },
      {
       "k": "fecha",
       "es": "Fecha de creación",
       "en": "Creation date",
       "tipo": "fecha"
      },
      {
       "k": "ingresos",
       "es": "Ingresos",
       "en": "Revenue",
       "tipo": "numero",
       "unidad": "USD"
      },
      {
       "k": "empleados",
       "es": "Empleados",
       "en": "Employees",
       "tipo": "numero"
      },
      {
       "k": "descripcion",
       "es": "Descripción",
       "en": "Description",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.17",
  "categoria": "ED",
  "numero": 17,
  "orden": 93,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de egresados con empleos verdes (últimos 3 años)",
  "nombre_en": "Total number of graduates with green jobs (for theÂ lastÂ 3Â years)",
  "tipo": "numero",
  "unidad": "egresados (3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 45,
  "calculada": false,
  "plantilla": "University_Country_6_17_Total_number_of_graduates_with_green_jobs.docx",
  "carpeta_nombre": "6_17_Total_number_of_graduates_with_green_jobs",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de egresados con empleos verdes (últimos 3 años)",
     "en": "Total number of graduates with green jobs (for theÂ lastÂ 3Â years)",
     "unidad": "egresados (3 años)",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "egresados",
     "es": "Egresados con empleo verde",
     "en": "Graduates in green jobs",
     "columnas": [
      {
       "k": "anio",
       "es": "Año académico",
       "en": "Academic year",
       "tipo": "texto"
      },
      {
       "k": "facultad",
       "es": "Facultad",
       "en": "Faculty",
       "tipo": "texto"
      },
      {
       "k": "egresados",
       "es": "Egresados",
       "en": "Graduates",
       "tipo": "numero"
      },
      {
       "k": "verdes",
       "es": "Con empleo verde",
       "en": "In green jobs",
       "tipo": "numero"
      },
      {
       "k": "fuente",
       "es": "Fuente",
       "en": "Source",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.18",
  "categoria": "ED",
  "numero": 18,
  "orden": 94,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de egresados (últimos 3 años)",
  "nombre_en": "Total number of graduates (for the last 3 years)",
  "tipo": "numero",
  "unidad": "egresados (3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": true,
  "pagina_guia": 45,
  "calculada": false,
  "plantilla": "University_Country_6_18_Total_number_of_graduates.docx",
  "carpeta_nombre": "6_18_Total_number_of_graduates",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de egresados (últimos 3 años)",
     "en": "Total number of graduates (for the last 3 years)",
     "unidad": "egresados (3 años)",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "egresados",
     "es": "Egresados",
     "en": "Graduates",
     "columnas": [
      {
       "k": "anio",
       "es": "Año académico",
       "en": "Academic year",
       "tipo": "texto"
      },
      {
       "k": "facultad",
       "es": "Facultad",
       "en": "Faculty",
       "tipo": "texto"
      },
      {
       "k": "egresados",
       "es": "Egresados",
       "en": "Graduates",
       "tipo": "numero"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "6.19",
  "categoria": "ED",
  "numero": 19,
  "orden": 95,
  "indicador": "ED10",
  "puntos": 50,
  "nombre_es": "Egresados con empleos verdes (%, 3 años)",
  "nombre_en": "Percentage of number of graduates with green jobs (for the last 3 years)",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 46,
  "calculada": false,
  "plantilla": "University_Country_6_19_Percentage_of_number_of_graduates_with_green_jobs.docx",
  "carpeta_nombre": "6_19_Percentage_of_number_of_graduates_with_green_jobs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 1%"
   },
   {
    "valor": 2,
    "es": "> 1â€“5%"
   },
   {
    "valor": 3,
    "es": "> 5â€“10%"
   },
   {
    "valor": 4,
    "es": "> 10â€“20%"
   },
   {
    "valor": 5,
    "es": "> 20%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    5,
    10,
    20
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [],
   "calculo": {
    "id": "ED10",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "6.17.valor"
     },
     {
      "k": "b",
      "desde": "6.18.valor"
     }
    ]
   }
  }
 },
 {
  "q": "6.20",
  "categoria": "ED",
  "numero": 20,
  "orden": 96,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Impacto de los programas de Educación e Investigación en los ODS",
  "nombre_en": "Impact of Eduaction and Research programs in supporting the Sustainable Development Goals (SDGs)",
  "tipo": "impacto_ods",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 46,
  "calculada": false,
  "plantilla": "University_Country_6_20_Impact_of_Education_and_Research_programs_in_SDGs.docx",
  "carpeta_nombre": "6_20_Impact_of_Education_and_Research_programs_in_SDGs",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Impacto bajo (apoya 1â€“2 ODS)"
   },
   {
    "valor": 2,
    "es": "Impacto moderado (apoya 3â€“5 ODS)"
   },
   {
    "valor": 3,
    "es": "Impacto significativo (apoya 6â€“9 ODS)"
   },
   {
    "valor": 4,
    "es": "Impacto alto (apoya 10â€“13 ODS)"
   },
   {
    "valor": 5,
    "es": "Impacto muy alto (apoya 14â€“17 ODS)"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "ods",
     "tipo": "ods",
     "es": "ODS que apoyan los programas",
     "en": "SDGs supported by the programs",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.1",
  "categoria": "GD",
  "numero": 1,
  "orden": 97,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Presupuesto total de la universidad (USD)",
  "nombre_en": "Total university budget (USD)",
  "tipo": "numero",
  "unidad": "USD (prom. 3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": false,
  "pagina_guia": 46,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "y1",
     "tipo": "numero",
     "es": "Año 1",
     "en": "Year 1",
     "unidad": "USD",
     "obligatorio": true
    },
    {
     "k": "y2",
     "tipo": "numero",
     "es": "Año 2",
     "en": "Year 2",
     "unidad": "USD"
    },
    {
     "k": "y3",
     "tipo": "numero",
     "es": "Año 3",
     "en": "Year 3",
     "unidad": "USD"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.2",
  "categoria": "GD",
  "numero": 2,
  "orden": 98,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Presupuesto para sostenibilidad (USD, 3 años)",
  "nombre_en": "University budget for sustainability effort  (in US Dollars)",
  "tipo": "numero",
  "unidad": "USD (prom. 3 años)",
  "periodo": "tres_anios",
  "requiere_evidencia": false,
  "pagina_guia": 46,
  "calculada": false,
  "plantilla": "University_Country_7_2_University_budget_for_sustainability_effort.docx",
  "carpeta_nombre": "7_2_University_budget_for_sustainability_effort",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "y1",
     "tipo": "numero",
     "es": "Año 1",
     "en": "Year 1",
     "unidad": "USD",
     "obligatorio": true
    },
    {
     "k": "y2",
     "tipo": "numero",
     "es": "Año 2",
     "en": "Year 2",
     "unidad": "USD"
    },
    {
     "k": "y3",
     "tipo": "numero",
     "es": "Año 3",
     "en": "Year 3",
     "unidad": "USD"
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.3",
  "categoria": "GD",
  "numero": 3,
  "orden": 99,
  "indicador": "GD1",
  "puntos": 200,
  "nombre_es": "Porcentaje del presupuesto universitario para esfuerzos de sostenibilidad",
  "nombre_en": "Percentage of university budget for sustainability efforts",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 47,
  "calculada": true,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": {
   "sentido": "asc",
   "cortes": [
    1,
    5,
    10,
    15
   ]
  },
  "factores": [
   0.05,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [],
   "tablas": [],
   "calculo": {
    "id": "GD1",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "7.2.promedio"
     },
     {
      "k": "b",
      "desde": "7.1.promedio"
     }
    ]
   }
  }
 },
 {
  "q": "7.4",
  "categoria": "GD",
  "numero": 4,
  "orden": 100,
  "indicador": "GD2",
  "puntos": 200,
  "nombre_es": "Sitio web de sostenibilidad gestionado por la universidad",
  "nombre_en": "University-run sustainability website",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 47,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No disponible",
    "en": "Not available"
   },
   {
    "valor": 2,
    "es": "Sitio web en progreso o en construcción",
    "en": "Website in progress or under construction"
   },
   {
    "valor": 3,
    "es": "El sitio web está disponible y es accesible",
    "en": "Website available and accessible"
   },
   {
    "valor": 4,
    "es": "El sitio web está disponible, es accesible y se actualiza ocasionalmente",
    "en": "Website available, accessible and updated occasionally"
   },
   {
    "valor": 5,
    "es": "El sitio web está disponible, es accesible y se actualiza regularmente",
    "en": "Website available, accessible and updated regularly"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.5",
  "categoria": "GD",
  "numero": 5,
  "orden": 101,
  "indicador": null,
  "puntos": null,
  "nombre_es": "URL del sitio web de sostenibilidad (si está disponible)",
  "nombre_en": "Sustainability website URL (if available)",
  "tipo": "url",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 47,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "7_5_Sustainability_website_URL_if_available",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "url",
     "es": "URL",
     "en": "URL",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.6",
  "categoria": "GD",
  "numero": 6,
  "orden": 102,
  "indicador": "GD3",
  "puntos": 100,
  "nombre_es": "Informe de sostenibilidad",
  "nombre_en": "Sustainability Report",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 47,
  "calculada": false,
  "plantilla": "University_Country_7_6_Sustainability_Report.docx",
  "carpeta_nombre": "7_6_Sustainability_Report",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No disponible"
   },
   {
    "valor": 2,
    "es": "El informe de sostenibilidad estÃ¡ en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "Disponible pero no accesible pÃºblicamente"
   },
   {
    "valor": 4,
    "es": "El informe de sostenibilidad es accesible y se publica ocasionalmente"
   },
   {
    "valor": 5,
    "es": "El informe de sostenibilidad es accesible y se publica anualmente"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "anios",
     "es": "Informe por año",
     "en": "Report by year",
     "columnas": [
      {
       "k": "anio",
       "es": "Año",
       "en": "Year",
       "tipo": "texto"
      },
      {
       "k": "url",
       "es": "URL",
       "en": "URL",
       "tipo": "url"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "7.7",
  "categoria": "GD",
  "numero": 7,
  "orden": 103,
  "indicador": null,
  "puntos": null,
  "nombre_es": "URL del informe de sostenibilidad (si está disponible)",
  "nombre_en": "Sustainability report URL (if available)",
  "tipo": "url",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 47,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "7_7_Sustainability_report_URL_if_available",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "url",
     "es": "URL",
     "en": "URL",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.8",
  "categoria": "GD",
  "numero": 8,
  "orden": 104,
  "indicador": "GD4",
  "puntos": 100,
  "nombre_es": "Informe financiero",
  "nombre_en": "Financial Report",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 47,
  "calculada": false,
  "plantilla": "University_Country_7_8_Financial_Report.docx",
  "carpeta_nombre": "7_8_Financial_Report",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No disponible"
   },
   {
    "valor": 2,
    "es": "El informe financiero estÃ¡ en preparaciÃ³n"
   },
   {
    "valor": 3,
    "es": "Disponible pero no accesible pÃºblicamente"
   },
   {
    "valor": 4,
    "es": "El informe financiero es accesible y se publica ocasionalmente"
   },
   {
    "valor": 5,
    "es": "El informe financiero es accesible y se publica anualmente"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "anios",
     "es": "Informe por año",
     "en": "Report by year",
     "columnas": [
      {
       "k": "anio",
       "es": "Año",
       "en": "Year",
       "tipo": "texto"
      },
      {
       "k": "url",
       "es": "URL",
       "en": "URL",
       "tipo": "url"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "7.9",
  "categoria": "GD",
  "numero": 9,
  "orden": 105,
  "indicador": null,
  "puntos": null,
  "nombre_es": "URL del informe financiero (si está disponible)",
  "nombre_en": "Financial report URL (if available)",
  "tipo": "url",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 48,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "7_9_Financial_report_URL_if_available",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "url",
     "es": "URL",
     "en": "URL",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.10",
  "categoria": "GD",
  "numero": 10,
  "orden": 106,
  "indicador": "GD5",
  "puntos": 100,
  "nombre_es": "Unidad u oficina que coordina la sostenibilidad",
  "nombre_en": "Availability of unit(s) or office(s) that coordinate sustainability on campus",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 48,
  "calculada": false,
  "plantilla": "University_Country_7_10_Availability_of_unit(s)_or_office(s)_that_coordinate.docx",
  "carpeta_nombre": "7_10_Availability_of_unit_s_or_office_s_that_coordinate",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ad hoc / task force"
   },
   {
    "valor": 2,
    "es": "Unidad u oficina en desarrollo"
   },
   {
    "valor": 3,
    "es": "Unidad u oficina con decreto de creaciÃ³n del lÃder universitario, estructura y funciones en etapa inicial"
   },
   {
    "valor": 4,
    "es": "Unidad u oficina con decreto de creaciÃ³n del lÃder universitario, estructura y funciones, ya operativa"
   },
   {
    "valor": 5,
    "es": "Unidad u oficina con decreto de creaciÃ³n del lÃder universitario, estructura y funciones, operativa y lidera la implementaciÃ³n de sostenibilidad en la universidad"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.11",
  "categoria": "GD",
  "numero": 11,
  "orden": 107,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de personal dedicado que apoya la coordinación de sostenibilidad",
  "nombre_en": "Number of dedicated staff supporting sustainability coordination",
  "tipo": "numero",
  "unidad": "personas",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 48,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": null,
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de personal dedicado que apoya la coordinación de sostenibilidad",
     "en": "Number of dedicated staff supporting sustainability coordination",
     "unidad": "personas",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.12",
  "categoria": "GD",
  "numero": 12,
  "orden": 108,
  "indicador": "GD6",
  "puntos": 50,
  "nombre_es": "Uso de TIC para gestionar los programas de sostenibilidad",
  "nombre_en": "Implementation of sustainability programs through the utilization of Information and Communication Technology (ICT) aligned with UI GreenMetric criteria",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 48,
  "calculada": false,
  "plantilla": "University_Country_7_12_Utilization_of_Information_and_Communication_Technology_ICT.docx",
  "carpeta_nombre": "7_12_Utilization_of_Information_and_Communication_Technology_ICT",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "Etapa de planificaciÃ³n"
   },
   {
    "valor": 3,
    "es": "Implementado"
   },
   {
    "valor": 4,
    "es": "Implementado y evaluado"
   },
   {
    "valor": 5,
    "es": "Implementado, evaluado y actualmente se estÃ¡ revisando/mejorando"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "gestion",
     "es": "A. Gestión de programas",
     "en": "A. Program management",
     "columnas": [
      {
       "k": "iniciativa",
       "es": "Iniciativa",
       "en": "Initiative",
       "tipo": "texto"
      },
      {
       "k": "funcion",
       "es": "Función",
       "en": "Function",
       "tipo": "texto"
      },
      {
       "k": "descripcion",
       "es": "Descripción",
       "en": "Description",
       "tipo": "texto"
      },
      {
       "k": "enlace",
       "es": "Captura o enlace",
       "en": "Screenshot or link",
       "tipo": "texto"
      }
     ]
    },
    {
     "k": "conectividad",
     "es": "B. Conectividad",
     "en": "B. Connectivity",
     "columnas": [
      {
       "k": "iniciativa",
       "es": "Iniciativa",
       "en": "Initiative",
       "tipo": "texto"
      },
      {
       "k": "funcion",
       "es": "Función",
       "en": "Function",
       "tipo": "texto"
      },
      {
       "k": "descripcion",
       "es": "Descripción",
       "en": "Description",
       "tipo": "texto"
      },
      {
       "k": "enlace",
       "es": "Captura o enlace",
       "en": "Screenshot or link",
       "tipo": "texto"
      }
     ]
    },
    {
     "k": "seguridad",
     "es": "C. Seguridad y continuidad",
     "en": "C. Security and continuity",
     "columnas": [
      {
       "k": "iniciativa",
       "es": "Iniciativa",
       "en": "Initiative",
       "tipo": "texto"
      },
      {
       "k": "funcion",
       "es": "Función",
       "en": "Function",
       "tipo": "texto"
      },
      {
       "k": "descripcion",
       "es": "Descripción",
       "en": "Description",
       "tipo": "texto"
      },
      {
       "k": "enlace",
       "es": "Captura o enlace",
       "en": "Screenshot or link",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "7.13",
  "categoria": "GD",
  "numero": 13,
  "orden": 109,
  "indicador": "GD7",
  "puntos": 50,
  "nombre_es": "Política sobre tecnologías digitales avanzadas (IA, IoT)",
  "nombre_en": "Policy on advanced digital technologies (AI/IoT, etc.) to support decision-making, efficiency, and service delivery",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 49,
  "calculada": false,
  "plantilla": "University_Country_7_13_Advanced_Digital_Technologies_Policy.docx",
  "carpeta_nombre": "7_13_Advanced_Digital_Technologies_Policy",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Sin polÃtica"
   },
   {
    "valor": 2,
    "es": "AdopciÃ³n inicial de la polÃtica. ImplementaciÃ³n limitada de la polÃtica en unidades especÃficas."
   },
   {
    "valor": 3,
    "es": "ImplementaciÃ³n parcial. La polÃtica se utiliza en varios procesos administrativos o acadÃ©micos, pero no estÃ¡ integrada en toda la instituciÃ³n."
   },
   {
    "valor": 4,
    "es": "ImplementaciÃ³n amplia. La polÃtica estÃ¡ integrada en mÃºltiples funciones administrativas y acadÃ©micas y apoya la toma de decisiones rutinaria y la prestaciÃ³n de servicios."
   },
   {
    "valor": 5,
    "es": "ImplementaciÃ³n avanzada e integrada. La polÃtica se implementa en toda la instituciÃ³n, apoya de manera sistemÃ¡tica la toma de decisiones estratÃ©gicas, la optimizaciÃ³n operativa y la prestaciÃ³n de servicios, y se evalÃºa y mejora continuamente."
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "iniciativas",
     "es": "Iniciativas",
     "en": "Initiatives",
     "columnas": [
      {
       "k": "iniciativa",
       "es": "Iniciativa",
       "en": "Initiative",
       "tipo": "texto"
      },
      {
       "k": "base",
       "es": "Base de política",
       "en": "Policy basis",
       "tipo": "texto"
      },
      {
       "k": "alcance",
       "es": "Alcance",
       "en": "Scope",
       "tipo": "texto"
      },
      {
       "k": "enlace",
       "es": "Evidencia o enlace",
       "en": "Evidence or link",
       "tipo": "texto"
      }
     ]
    }
   ]
  }
 },
 {
  "q": "7.14",
  "categoria": "GD",
  "numero": 14,
  "orden": 110,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Cumplimiento de protección de datos (GDPR o equivalente)",
  "nombre_en": "Compliance with the General Data Protection Regulation (GDPR) or Equivalent National Data Protection Regulations",
  "tipo": "seleccion",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 49,
  "calculada": false,
  "plantilla": "University_Country_7_14_Compliance_GDPR_or_Equivalent.docx",
  "carpeta_nombre": "7_14_Compliance_GDPR_or_Equivalent",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No existe ninguna polÃtica o mecanismo de protecciÃ³n de datos"
   },
   {
    "valor": 2,
    "es": "El marco de cumplimiento estÃ¡ en preparaciÃ³n, incluyendo borradores de polÃticas o procedimientos"
   },
   {
    "valor": 3,
    "es": "El cumplimiento estÃ¡ parcialmente implementado, con polÃticas vigentes pero con aplicaciÃ³n o cobertura limitada"
   },
   {
    "valor": 4,
    "es": "El cumplimiento estÃ¡ totalmente implementado, monitoreado y aplicado en la mayorÃa de las unidades universitarias y sistemas digitales"
   },
   {
    "valor": 5,
    "es": "El cumplimiento estÃ¡ totalmente implementado, auditado regularmente, mejorado continuamente y comunicado de forma transparente a los actores relevantes"
   }
  ],
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Opción",
     "en": "Option",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.15",
  "categoria": "GD",
  "numero": 15,
  "orden": 111,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número total de líderes institucionales y líderes adjuntos",
  "nombre_en": "Total number of institutional leaders and deputy leaders",
  "tipo": "numero",
  "unidad": "líderes",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 49,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "7_15_Total_number_of_institutional_leaders_and_deputy_leaders",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número total de líderes institucionales y líderes adjuntos",
     "en": "Total number of institutional leaders and deputy leaders",
     "unidad": "líderes",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.16",
  "categoria": "GD",
  "numero": 16,
  "orden": 112,
  "indicador": null,
  "puntos": null,
  "nombre_es": "Número de mujeres en posiciones de liderazgo",
  "nombre_en": "Number of women in leadership positions",
  "tipo": "numero",
  "unidad": "mujeres líderes",
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 49,
  "calculada": false,
  "plantilla": null,
  "carpeta_nombre": "7_16_Number_of_women_in_leadership_positions",
  "sin_guia": false,
  "opciones": null,
  "bandas": null,
  "factores": null,
  "esquema": {
   "campos": [
    {
     "k": "valor",
     "tipo": "numero",
     "es": "Número de mujeres en posiciones de liderazgo",
     "en": "Number of women in leadership positions",
     "unidad": "mujeres líderes",
     "obligatorio": true
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.17",
  "categoria": "GD",
  "numero": 17,
  "orden": 113,
  "indicador": "GD8",
  "puntos": 100,
  "nombre_es": "Mujeres en liderazgo frente al total de líderes",
  "nombre_en": "Ratio of Female Leaders to Total Institutional Leaders",
  "tipo": "razon",
  "unidad": "%",
  "periodo": "ninguno",
  "requiere_evidencia": false,
  "pagina_guia": 50,
  "calculada": false,
  "plantilla": "University_Country_7_17_Ratio_Female_Leaders_to_Total_Institution_Leaders.docx",
  "carpeta_nombre": "7_17_Ratio_Female_Leaders_to_Total_Institution_Leaders",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "â‰¤ 5%"
   },
   {
    "valor": 2,
    "es": "> 5â€“20%"
   },
   {
    "valor": 3,
    "es": "> 20â€“35%"
   },
   {
    "valor": 4,
    "es": "> 35â€“50%"
   },
   {
    "valor": 5,
    "es": "> 50%"
   }
  ],
  "bandas": {
   "sentido": "asc",
   "cortes": [
    5,
    20,
    35,
    50
   ]
  },
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": [
    {
     "k": "niveles",
     "es": "Liderazgo por nivel",
     "en": "Leadership by level",
     "columnas": [
      {
       "k": "nivel",
       "es": "Nivel (universidad, facultad, programa)",
       "en": "Level (university, faculty, program)",
       "tipo": "texto"
      },
      {
       "k": "total",
       "es": "Total de líderes",
       "en": "Total leaders",
       "tipo": "numero"
      },
      {
       "k": "mujeres",
       "es": "Mujeres líderes",
       "en": "Women leaders",
       "tipo": "numero"
      }
     ]
    }
   ],
   "calculo": {
    "id": "GD8",
    "unidad": "%",
    "entradas": [
     {
      "k": "a",
      "desde": "7.16.valor"
     },
     {
      "k": "b",
      "desde": "7.15.valor"
     }
    ]
   }
  }
 },
 {
  "q": "7.18",
  "categoria": "GD",
  "numero": 18,
  "orden": 114,
  "indicador": "GD9",
  "puntos": 50,
  "nombre_es": "Sistema anticorrupción e integridad de la universidad",
  "nombre_en": "Anti-Corruption and Integrity System of the University",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 50,
  "calculada": false,
  "plantilla": "University_Country_7_18_Anti_Corruption_and_Integrity_System.docx",
  "carpeta_nombre": "7_18_Anti_Corruption_and_Integrity_System",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "El sistema anticorrupciÃ³n e integridad estÃ¡ en etapa de planificaciÃ³n"
   },
   {
    "valor": 3,
    "es": "El sistema anticorrupciÃ³n e integridad se ha implementado"
   },
   {
    "valor": 4,
    "es": "El sistema anticorrupciÃ³n e integridad se ha implementado y evaluado"
   },
   {
    "valor": 5,
    "es": "El sistema anticorrupciÃ³n e integridad se ha implementado, evaluado y actualmente se estÃ¡ revisando"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.19",
  "categoria": "GD",
  "numero": 19,
  "orden": 115,
  "indicador": "GD10",
  "puntos": 50,
  "nombre_es": "Sistema de denuncias (whistleblowing) y quejas de la universidad",
  "nombre_en": "Whistle Blowing and Complaint System of the University",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 50,
  "calculada": false,
  "plantilla": "University_Country_7_19_Whistle_Blowing_and_Complaint_System.docx",
  "carpeta_nombre": "7_19_Whistle_Blowing_and_Complaint_System",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "El sistema de denuncias y quejas estÃ¡ en etapa de planificaciÃ³n"
   },
   {
    "valor": 3,
    "es": "El sistema de denuncias y quejas se ha implementado"
   },
   {
    "valor": 4,
    "es": "El sistema de denuncias y quejas se ha implementado y evaluado"
   },
   {
    "valor": 5,
    "es": "El sistema de denuncias y quejas se ha implementado, evaluado y actualmente se estÃ¡ revisando"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.20",
  "categoria": "GD",
  "numero": 20,
  "orden": 116,
  "indicador": "GD11",
  "puntos": 50,
  "nombre_es": "Alfabetización digital apoyada en LMS",
  "nombre_en": "LMS-Enabled Digital Literacy Program",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 50,
  "calculada": false,
  "plantilla": "University_Country_7_20_Implementation_of_Digital_Literacy.docx",
  "carpeta_nombre": "7_20_Implementation_of_Digital_Literacy",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "Ninguno"
   },
   {
    "valor": 2,
    "es": "El programa estÃ¡ en etapa de planificaciÃ³n"
   },
   {
    "valor": 3,
    "es": "El programa se ha implementado"
   },
   {
    "valor": 4,
    "es": "El programa se ha implementado y evaluado"
   },
   {
    "valor": 5,
    "es": "El programa se ha implementado, evaluado y actualmente se estÃ¡ revisando"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 },
 {
  "q": "7.21",
  "categoria": "GD",
  "numero": 21,
  "orden": 117,
  "indicador": "GD12",
  "puntos": 50,
  "nombre_es": "Código de ética escrito",
  "nombre_en": "Written Code of Ethics that applies to university leaders, academic staff, administrative staff, and students",
  "tipo": "escala",
  "unidad": null,
  "periodo": "ninguno",
  "requiere_evidencia": true,
  "pagina_guia": 51,
  "calculada": false,
  "plantilla": "University_Country_7_21_Written_Code_of_Ethics.docx",
  "carpeta_nombre": "7_21_Written_Code_of_Ethics",
  "sin_guia": false,
  "opciones": [
   {
    "valor": 1,
    "es": "No existe un cÃ³digo de Ã©tica escrito"
   },
   {
    "valor": 2,
    "es": "El cÃ³digo de Ã©tica estÃ¡ en preparaciÃ³n o en borrador"
   },
   {
    "valor": 3,
    "es": "El cÃ³digo de Ã©tica escrito estÃ¡ formalmente establecido, pero aplica solo a ciertos grupos o no se aplica de manera consistente"
   },
   {
    "valor": 4,
    "es": "El cÃ³digo de Ã©tica escrito aplica a todos los grupos y se implementa y monitorea"
   },
   {
    "valor": 5,
    "es": "El cÃ³digo de Ã©tica escrito aplica a todos los grupos, estÃ¡ completamente implementado, se revisa regularmente y se hace cumplir activamente mediante mecanismos institucionales"
   }
  ],
  "bandas": null,
  "factores": [
   0.0,
   0.25,
   0.5,
   0.75,
   1.0
  ],
  "esquema": {
   "campos": [
    {
     "k": "opcion",
     "tipo": "opcion",
     "es": "Nivel que describe a la universidad",
     "en": "Level that describes the university",
     "obligatorio": true
    },
    {
     "k": "descripcion",
     "tipo": "texto_largo",
     "es": "Descripción",
     "en": "Description",
     "obligatorio": true,
     "traducible": true
    },
    {
     "k": "enlace",
     "tipo": "url",
     "es": "Enlace adicional de evidencia",
     "en": "Additional evidence link"
    }
   ],
   "tablas": []
  }
 }
];
