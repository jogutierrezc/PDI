/* =============================================================================
   Reportes Institucionales · valores fijos del manual SNIES (v2.11, 2023).

   Cada dominio es una lista cerrada que el manual define y HECAA valida. La
   persona ve el «nombre»; al archivo plano va el «codigo». No se editan desde
   la intranet: si el MEN cambia un valor, se cambia aquí citando la sección.
   ========================================================================== */

import type { Dominio } from "../tipos";

export const DOMINIOS: Record<string, Dominio> = {
  // Participante (§3.1.1) y las plantillas de estudiantes (§3.4.7, §3.4.8)
  // usan la misma lista de siete. La lista larga (CO, NP, RC, SNP, VA…) es
  // solo para ID_TIPO_DOCUMENTO_ANTERIOR de «Actualizar documento» (§3.1.2).
  tipo_documento: {
    id: "tipo_documento",
    etiqueta: "Tipo de documento",
    seccion: "§3.1.1 Participante",
    valores: [
      { codigo: "CC", nombre: "Cédula de ciudadanía" },
      { codigo: "DE", nombre: "Documento de identidad extranjera" },
      { codigo: "CE", nombre: "Cédula de extranjería" },
      { codigo: "TI", nombre: "Tarjeta de identidad" },
      { codigo: "PS", nombre: "Pasaporte" },
      { codigo: "CA", nombre: "Certificado de cabildo" },
      { codigo: "PT", nombre: "Permiso por protección temporal (PPT)" },
    ],
  },

  sexo_biologico: {
    id: "sexo_biologico",
    etiqueta: "Sexo biológico",
    seccion: "§3.1.1 Participante",
    valores: [
      { codigo: "1", nombre: "Hombre" },
      { codigo: "2", nombre: "Mujer" },
    ],
  },

  // El manual salta el 7: no es un error de transcripción.
  estado_civil: {
    id: "estado_civil",
    etiqueta: "Estado civil",
    seccion: "§3.1.1 Participante",
    valores: [
      { codigo: "1", nombre: "Soltero(a)" },
      { codigo: "2", nombre: "Casado(a)" },
      { codigo: "3", nombre: "Divorciado(a)" },
      { codigo: "4", nombre: "Viudo(a)" },
      { codigo: "5", nombre: "Unión libre" },
      { codigo: "6", nombre: "Religioso(a)" },
      { codigo: "8", nombre: "Separado(a)" },
    ],
  },

  zona_residencia: {
    id: "zona_residencia",
    etiqueta: "Zona de residencia",
    seccion: "§3.4.7 Matriculados",
    valores: [
      { codigo: "1", nombre: "Urbana" },
      { codigo: "2", nombre: "Rural" },
    ],
  },

  // ES_REINTEGRO_ESTUDIANTE_ANTES_DE_1998: «se registra S o N».
  si_no: {
    id: "si_no",
    etiqueta: "Sí / No",
    seccion: "§3.4.7 Matriculados",
    valores: [
      { codigo: "S", nombre: "Sí" },
      { codigo: "N", nombre: "No" },
    ],
  },

  // La tabla de valores está en Docentes; Matriculados y Graduados la usan igual.
  semestre: {
    id: "semestre",
    etiqueta: "Semestre",
    seccion: "§3.3.1 Docentes",
    valores: [
      { codigo: "1", nombre: "Primer semestre" },
      { codigo: "2", nombre: "Segundo semestre" },
    ],
  },

  /* ---------- Admitidos (§3.4.3) ---------- */

  // Obligatorio solo para IES públicas (Matrícula Cero).
  estrato: {
    id: "estrato",
    etiqueta: "Estrato",
    seccion: "§3.4.3 Admitidos",
    valores: [
      { codigo: "0", nombre: "No informa" },
      { codigo: "1", nombre: "Bajo-bajo (1)" },
      { codigo: "2", nombre: "Bajo (2)" },
      { codigo: "3", nombre: "Medio-bajo (3)" },
      { codigo: "4", nombre: "Medio (4)" },
      { codigo: "5", nombre: "Medio-alto (5)" },
      { codigo: "6", nombre: "Alto (6)" },
      { codigo: "7", nombre: "Sin estrato" },
    ],
  },

  // Ley 1979 de 2019, obligatorio desde 2023-1.
  beneficiario_veteranos: {
    id: "beneficiario_veteranos",
    etiqueta: "Beneficiario Ley de Veteranos",
    seccion: "§3.4.3 Admitidos",
    valores: [
      { codigo: "1", nombre: "Veterano" },
      { codigo: "2", nombre: "Cónyuge o compañero(a) permanente del veterano" },
      { codigo: "3", nombre: "Hijo(a) de veterano hasta los 25 años" },
      { codigo: "4", nombre: "Padre o madre del veterano" },
      { codigo: "5", nombre: "No aplica" },
    ],
  },

  /* ---------- Estudiantes de primer curso (§3.4.6) ---------- */

  tipo_vinculacion: {
    id: "tipo_vinculacion",
    etiqueta: "Tipo de vinculación",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "1", nombre: "Nuevo" },
      { codigo: "2", nombre: "Transferencia interna" },
      { codigo: "3", nombre: "Transferencia externa" },
      { codigo: "4", nombre: "Transferencia entre seccionales" },
      { codigo: "5", nombre: "Doble programa" },
      { codigo: "6", nombre: "Ciclo propedéutico" },
      { codigo: "7", nombre: "Co-titulación, titulación conjunta o doble titulación" },
      { codigo: "8", nombre: "Estudiante de articulación" },
      { codigo: "9", nombre: "Estudiante SPP" },
      { codigo: "10", nombre: "Opción de grado" },
      { codigo: "11", nombre: "Semestre de intercambio académico" },
      { codigo: "12", nombre: "Requisito para convalidar título u homologación" },
    ],
  },

  grupo_etnico: {
    id: "grupo_etnico",
    etiqueta: "Grupo étnico",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "0", nombre: "No informa" },
      { codigo: "1", nombre: "Pueblo indígena" },
      { codigo: "2", nombre: "Comunidad negra" },
      { codigo: "3", nombre: "Pueblo Rrom" },
      { codigo: "4", nombre: "No pertenece" },
    ],
  },

  // «0 No aplica» si el grupo étnico no es «Pueblo indígena».
  pueblo_indigena: {
    id: "pueblo_indigena",
    etiqueta: "Pueblo indígena",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "0", nombre: "No aplica" },
      { codigo: "1", nombre: "Achagua" },
      { codigo: "2", nombre: "Amorúa" },
      { codigo: "3", nombre: "Andoque o andoke" },
      { codigo: "4", nombre: "Arhuaco (ijka)" },
      { codigo: "5", nombre: "Awa (cuaiker)" },
      { codigo: "6", nombre: "Barea" },
      { codigo: "7", nombre: "Barí (motilón)" },
      { codigo: "8", nombre: "Betoye" },
      { codigo: "9", nombre: "Bara" },
      { codigo: "10", nombre: "Cañamomo" },
      { codigo: "11", nombre: "Carapana" },
      { codigo: "12", nombre: "Carijona o karijona" },
      { codigo: "13", nombre: "Chimila (ette e'neka)" },
      { codigo: "14", nombre: "Chiricoa" },
      { codigo: "15", nombre: "Cocama" },
      { codigo: "16", nombre: "Coconuco" },
      { codigo: "17", nombre: "Coyaima-Natagaima" },
      { codigo: "18", nombre: "Pijaos" },
      { codigo: "19", nombre: "Cubeo o kubeo" },
      { codigo: "20", nombre: "Cuiba o kuiba" },
      { codigo: "21", nombre: "Curripaco o kurripaco" },
      { codigo: "22", nombre: "Desano" },
      { codigo: "23", nombre: "Dujos" },
      { codigo: "24", nombre: "Embera catio o katío" },
      { codigo: "25", nombre: "Embera chami" },
      { codigo: "26", nombre: "Eperara siapidara" },
      { codigo: "27", nombre: "Guambiano" },
      { codigo: "28", nombre: "Guanaca" },
      { codigo: "29", nombre: "Guane" },
      { codigo: "30", nombre: "Guyabero" },
      { codigo: "31", nombre: "Hitnú" },
      { codigo: "32", nombre: "Hupdu" },
      { codigo: "33", nombre: "Inga" },
      { codigo: "34", nombre: "Juhup" },
      { codigo: "35", nombre: "Kamsa o kamëntsá" },
      { codigo: "36", nombre: "Kankuamo" },
      { codigo: "37", nombre: "Kakua" },
      { codigo: "38", nombre: "Kogui" },
      { codigo: "39", nombre: "Koreguaje o coreguaje" },
      { codigo: "40", nombre: "Letuama" },
      { codigo: "41", nombre: "Macaguaje o makaguaje" },
      { codigo: "42", nombre: "Nukak (makú)" },
      { codigo: "43", nombre: "Macuna o makuna (sara)" },
      { codigo: "44", nombre: "Masiguare" },
      { codigo: "45", nombre: "Matapí" },
      { codigo: "46", nombre: "Miraña" },
      { codigo: "47", nombre: "Mokaná" },
      { codigo: "48", nombre: "Muinane" },
      { codigo: "49", nombre: "Muisca" },
      { codigo: "50", nombre: "Nonuya" },
      { codigo: "51", nombre: "Ocaina" },
      { codigo: "52", nombre: "Nasa (paéz)" },
      { codigo: "53", nombre: "Pastos" },
      { codigo: "54", nombre: "Piapoco (dzase)" },
      { codigo: "55", nombre: "Piaroa" },
      { codigo: "56", nombre: "Piratapuyo" },
      { codigo: "57", nombre: "Pisamira" },
      { codigo: "58", nombre: "Puinave" },
      { codigo: "59", nombre: "Sánha" },
      { codigo: "60", nombre: "Sikuani" },
      { codigo: "61", nombre: "Siona" },
      { codigo: "62", nombre: "Siriano" },
      { codigo: "63", nombre: "Siripu o tsiripu (mariposo)" },
      { codigo: "64", nombre: "Taiwano (tajuano)" },
      { codigo: "65", nombre: "Tanimuka" },
      { codigo: "66", nombre: "Tariano" },
      { codigo: "67", nombre: "Tatuyo" },
      { codigo: "68", nombre: "Tikuna" },
      { codigo: "69", nombre: "Tororó" },
      { codigo: "70", nombre: "Tucano (desea) o tukano" },
      { codigo: "71", nombre: "Tule (kuna)" },
      { codigo: "72", nombre: "Tuyuka (dojkapuara)" },
      { codigo: "73", nombre: "U'wa(tunebo)" },
      { codigo: "74", nombre: "Wanano" },
      { codigo: "75", nombre: "Wayuu" },
      { codigo: "76", nombre: "Witoto - huitoto" },
      { codigo: "77", nombre: "Wiwa (arzario)" },
      { codigo: "78", nombre: "Waunan (wuanana)" },
      { codigo: "79", nombre: "Yagua" },
      { codigo: "80", nombre: "Yanacona" },
      { codigo: "81", nombre: "Yauna" },
      { codigo: "82", nombre: "Yukuna" },
      { codigo: "83", nombre: "Yuko (yukpa)" },
      { codigo: "84", nombre: "Yurí (carabayo)" },
      { codigo: "85", nombre: "Yuruti" },
      { codigo: "86", nombre: "Zenú / senú" },
      { codigo: "87", nombre: "Quillacingas" },
      { codigo: "88", nombre: "No informa" },
      { codigo: "89", nombre: "Otro" },
    ],
  },

  // «0 No aplica» si el grupo étnico no es «Comunidad negra».
  comunidad_negra: {
    id: "comunidad_negra",
    etiqueta: "Comunidad negra",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "0", nombre: "No aplica" },
      { codigo: "1", nombre: "Afrocolombianos" },
      { codigo: "2", nombre: "Raizales" },
      { codigo: "3", nombre: "Palenqueros" },
      { codigo: "4", nombre: "Otras comunidades negras" },
    ],
  },

  // PERSONA_CON_DISCAPACIDAD: 1 Sí, 2 No, 0 No informa (no es el si_no de S/N).
  persona_discapacidad: {
    id: "persona_discapacidad",
    etiqueta: "¿Persona con discapacidad?",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "1", nombre: "Sí" },
      { codigo: "2", nombre: "No" },
      { codigo: "0", nombre: "No informa" },
    ],
  },

  // El texto dice «valores 1 al 9», pero la tabla trae hasta el 10 (sistémica).
  tipo_discapacidad: {
    id: "tipo_discapacidad",
    etiqueta: "Tipo de discapacidad",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "0", nombre: "No aplica" },
      { codigo: "1", nombre: "Sensorial: sordera profunda" },
      { codigo: "2", nombre: "Sensorial: hipoacusia" },
      { codigo: "3", nombre: "Sensorial: ceguera" },
      { codigo: "4", nombre: "Sensorial: baja visión" },
      { codigo: "5", nombre: "Sensorial: sordoceguera" },
      { codigo: "6", nombre: "Intelectual" },
      { codigo: "7", nombre: "Psicosocial" },
      { codigo: "8", nombre: "Múltiple" },
      { codigo: "9", nombre: "Física" },
      { codigo: "10", nombre: "Sistémica" },
    ],
  },

  capacidad_excepcional: {
    id: "capacidad_excepcional",
    etiqueta: "Capacidad excepcional",
    seccion: "§3.4.6 Primer curso",
    valores: [
      { codigo: "0", nombre: "No aplica" },
      { codigo: "1", nombre: "Talento excepcional general" },
      { codigo: "2", nombre: "Talento excepcional específico" },
    ],
  },
};
