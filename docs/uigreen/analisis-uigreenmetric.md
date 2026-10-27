# UI GreenMetric 2026: análisis para el módulo de reporte

Fase 1 (analizar). Fuentes: `uigreen/2026_Guideline_UI-GreenMetric-SUR-spn_compressed.pdf` (80 páginas, citada como «p. N») y las 86 plantillas `.docx` de `uigreen/Evidencias Ranking/Evidence/`. No se construyó nada: ni migraciones, ni código en `src/`, ni pruebas.

Cómo se leyó: el texto del PDF se extrajo con PyMuPDF. Las páginas 56 a 70 (tablas de puntaje del Apéndice 1 para EC en adelante) se contrastaron con la Tabla 3 de las pp. 10-13, no se leyeron línea por línea. Los `.docx` se abrieron como zip de solo lectura (`word/document.xml`), sin ejecutar nada.

---

## A. Resumen de la guía

**Qué es.** Desde 2026 el ranking se llama *UI GreenMetric Sustainable University Rankings* (UIGM SUR; antes WUR). Tema 2026: «Advancing Sustainable Campuses through Governance, Digitalization, and Integrated Performance» (p. 3). 2026 agregó la categoría Governance and Digitalization (p. 8). En la edición 2025 participaron 1.745 universidades de 105 países (p. 3); la UDES organizó un taller nacional en 2025 (p. 18).

**Siete categorías, 60 indicadores con puntaje, 10.000 puntos** (Tablas 2 y 3, pp. 10-13):

| Cat. | Categoría | Peso | Indicadores | Puntos |
|---|---|---|---|---|
| SI | Setting and Infrastructure | 11 % | 8 (SI1-SI8) | 1.100 |
| EC | Energy and Climate Change | 20 % | 10 (EC1-EC10) | 2.000 |
| WS | Waste | 17 % | 6 (WS1-WS6) | 1.700 |
| WR | Water | 11 % | 6 (WR1-WR6) | 1.100 |
| TR | Transportation | 17 % | 8 (TR1-TR8) | 1.700 |
| ED | Education and Research | 13 % | 10 (ED1-ED10) | 1.300 |
| GD | Governance and Digitalization | 11 % | 12 (GD1-GD12) | 1.100 |
| | Total | 100 % | 60 | 10.000 |

**Cuestionario real: 117 preguntas numeradas** (SI 19, EC 15, WS 17, WR 7, TR 18, ED 20, GD 21; pp. 19-51). Solo 60 son indicadores con puntaje; las otras 57 son datos de entrada (áreas, poblaciones, volúmenes), selecciones sin puntaje (1.1 tipo de institución, 1.2 clima, 1.4 entorno) o URL. Las 86 plantillas de evidencia se nombran con el número de pregunta (`University_Country_<cat>_<pregunta>_...`), no con el código de indicador.

**Puntuación** (p. 13 y Apéndice 1, pp. 53-70). Cada indicador se contesta con una opción [1]-[5] o con un conteo; la opción da un factor 0,05 / 0,25 / 0,50 / 0,75 / 1,00 (o 0 para «ninguno») multiplicado por los puntos del indicador. Ejemplo EC1: «> 75 %» da 1,00 × 200 (p. 56). El puntaje final lo da la revisión de los validadores de UI, no el reporte (p. 53). Luego se pondera por el peso de la categoría (p. 14). **Los puntos y los pesos son un dato interno de la administración del ranking: la intranet los usa para estimar el avance y priorizar, y no se publican en la web (ver G.2).**

**Desempate** (p. 14): EC, luego WS, luego TR, luego ED, luego SI, WR y GD.

**Etapas y fechas** (p. 14):
- Envío de datos en el sistema en línea: febrero a junio de 2026.
- Periodo de referencia: un año calendario (enero a diciembre de 2025) o 12 meses móviles (por ejemplo mayo 2025 a mayo 2026).
- Resultados finales: septiembre de 2026.
- Hoy (27 de octubre de 2026) esa ventana ya cerró. Ver decisión 1.

**Periodos de datos y «datos de años anteriores»** (pp. 14, 51 y plantillas):
- Enviar «los datos anuales más recientes disponibles» según el ciclo de 12 meses (p. 51).
- La guía pide pares «este año» y «el año pasado» solo para volúmenes de residuos: 3.2/3.3, 3.5/3.6, 3.9/3.10, 3.13/3.14 (pp. 32-34).
- Promedios o totales de 3 años: 5.14 (programa de estacionamiento), 6.5 y 6.6 (fondos de investigación), 6.11 (eventos), 6.16 (start-ups), 6.17-6.19 (egresados), 7.1 y 7.2 (presupuestos), 7.6 y 7.8 (regularidad anual de informes) (pp. 42-48).
- La guía no define una regla de arrastre de respuestas del ciclo anterior. La reutilización de datos de 2025 es una decisión del módulo (decisión 5).

**Reglas de cálculo clave** (Fórmulas):
- Población del campus = 1.11 (estudiantes regulares) + 1.13 (personal). Los estudiantes en línea (1.12) no entran en SI4, EC4, EC8, TR1 ni TR4 (pp. 22-40).
- SI1 = (1.5 − 1.6) / 1.5 × 100. SI4 = (1.5 − 1.6) / (1.11 + 1.13). Ambas usan 1.6 (huella en planta baja), que no tiene plantilla.
- EC2 = 2.2 / 1.7 × 100. EC4 = 2.6 / población. EC8 = 2.11 / población.
- TR1 = (5.1 + 5.2 + 5.3) / población. TR4 = 5.10 / población. TR5 = 5.12 / 1.5 × 100.
- ED1 = 6.1 / 6.2. ED2 = 6.5 / 6.6. ED3 = 6.9 / 6.8. ED10 = 6.17 / 6.18.
- GD1 = 7.2 / 7.1. GD8 = 7.16 / 7.15.
- Huella de carbono 2.11 (p. 30, Apéndice 4 pp. 77-79): excluir vuelos y fuentes secundarias (alimentos, vajilla, ropa); informar en toneladas métricas de CO₂e; documentar factores de emisión (valor, unidad, año, fuente), hoja de cálculo y límites.
- Edificio inteligente: al menos 5 de 22 requisitos del Apéndice 3 (pp. 26 y 75-76; la plantilla 2.3 lo repite: «mínimo cinco requisitos por edificio»).
- Elementos de edificio verde: clasificación GBI del Apéndice 2 (pp. 71-74).
- Las sedes múltiples: «todos los datos deben aplicarse de manera consistente en todos los campus listados» (p. 20).

**Qué cuenta como «programa»** (la guía no lo define en un solo lugar; se deduce de cada pregunta):
- Programa de innovación (2.13): creado y desarrollado por la universidad; tecnología comprada a terceros no califica (p. 31).
- Programa de cambio climático (2.14): capacitación, materiales o seminarios, con lista de participantes (p. 31).
- Programa de reducción de papel y plástico (3.4): políticas o prácticas formales, se cuentan en bandas 1-3, 4-6, 7-10 y más de 10 (p. 32).
- Curso de sostenibilidad (6.1): la sostenibilidad es parte significativa de los resultados de aprendizaje, no una mención breve (p. 42).
- Start-up (6.16): creada en los últimos 3 años (p. 45).
- Empleo verde (6.17): empleo decente que preserva o restaura el ambiente (p. 45).

**Evidencia** (pp. 9, 19, 51-52):
1. Obligatoria, salvo preguntas donde puede ser opcional o cargarse aparte. Sin evidencia el ítem puede perder puntaje o anularse.
2. Debe seguir la plantilla oficial (`bit.ly/UIGreenmetricEvidences2026`, la carpeta analizada).
3. Formas válidas: fotos, gráficos, tablas, conjuntos de datos, documentos.
4. Cada evidencia lleva una explicación cuantitativa (cifras, porcentajes, áreas, fechas).
5. Mapas del campus o plan maestro son «muy recomendables» y obligatorios para la mayoría de las preguntas (p. 19).
6. **Todas las descripciones en inglés; si el original no está en inglés, se entrega traducción** (p. 52).
7. **Cada archivo de evidencia: máximo 2 MB y formato `.pdf`**; si se da un enlace, debe ser de acceso público (p. 52).

**Formato de presentación de la información.** Las plantillas `.docx` repiten la misma estructura (ver sección B.3): encabezado con Universidad / País / Dirección web, la categoría, el número y nombre de la pregunta con su código de indicador, una imagen de muestra con marca «SAMPLE», figuras con pie, «Description:» con la instrucción y un ejemplo, y al final «Additional evidence link (i.e., for videos, more images, or other files that are not included in this file)».

Se asume que el sistema en línea de UI (no la plantilla) recibe las respuestas numéricas y las selecciones. La guía no describe ese formulario ni su API.

---

## B. Catálogo de las 86 plantillas y de las 117 preguntas

### B.1 Cómo leer la tabla

Se listan las 117 preguntas de la guía más la plantilla huérfana 3.18 (118 filas). Las 32 preguntas sin plantilla y la plantilla sin pregunta aparecen resaltadas.

- **Ind.**: código de indicador con puntaje; «—» si la pregunta es un dato de entrada.
- **Tipo**: Selección (sin puntos), Número, Razón calculada (la plataforma calcula con otras respuestas), Área + banda (m² y banda % a elegir), Escala / programa (opción 1-5 con narrativa y evidencia), Impacto ODS (opción 1-5 según n.º de ODS más narrativa), URL.
- **Plantilla**: «NO» = no hay `.docx`.
- **Años**: «año actual» y «año anterior» son preguntas separadas en la guía (la plantilla trae ambas columnas en una sola tabla); «3 años» es promedio o suma de tres años.
- **Evid. guía**: la guía dice «Se requiere evidencia» en esa pregunta.
- **Pág.**: página de la guía donde empieza la pregunta.

El texto de «Campos» resume lo que la plantilla pide llenar; las plantillas de narrativa terminan todas con el campo «enlace adicional». Los nombres en español son traducción y abreviatura propia de los títulos de la guía.


#### 1. SI · Setting and Infrastructure (Entorno e infraestructura) · 11 % · 1100 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | — | Tipo de institución de educación superior | Selección (sin puntos) | — | — | **NO** | — | no | — | 19 |
| 1.2 | — | Clima | Selección (sin puntos) | — | — | **NO** | — | no | — | 19 |
| 1.3 | — | Número de sedes del campus | Número | sedes | — | Sí | Descripción por sede (área, fecha de creación, historia, instalaciones) + fotos | Sí | — | 19 |
| 1.4 | — | Entorno del campus | Selección (sin puntos) | — | — | Sí | Descripción del entorno + fotos | Sí | — | 20 |
| 1.5 | — | Área total del campus (m²) | Número | m² | — | Sí | Área total (m²) y perímetro (km) + mapa/foto | Sí | — | 20 |
| 1.6 | — | Área total de la planta baja de los edificios del campus (m²) | Número | m² | — | **NO** | — | no | — | 20 |
| 1.7 | — | Área total construida de los edificios del campus (m²) | Número | m² | — | Sí | Tabla edificio–área (m²) con total + fotos y mapa | Sí | — | 20 |
| 1.8 | SI1 | Proporción del área de espacio abierto respecto al área total | Razón calculada | % | 200 | Sí | % de espacio abierto + tabla espacio abierto/área/horas por semana | Sí | — | 20 |
| 1.9 | SI2 | Vegetación forestal usada en investigación, docencia o vinculación | Área + banda | m² y % | 100 | Sí | Área forestal (m²), perímetro, fotos | Sí | — | 21 |
| 1.10 | SI3 | Área total cubierta por vegetación plantada | Área + banda | m² y % | 200 | Sí | Área plantada (m²), área total, % + fotos | Sí | — | 22 |
| 1.11 | — | Número total de estudiantes regulares | Número | personas | — | **NO** | — | Sí | — | 22 |
| 1.12 | — | Número total de estudiantes en línea | Número | personas | — | **NO** | — | no | — | 22 |
| 1.13 | — | Personal académico y administrativo (total) | Número | personas | — | **NO** | — | no | — | 22 |
| 1.14 | SI4 | Área de espacio abierto por población del campus | Razón calculada | m²/persona | 200 | **NO** | — | Sí | — | 22 |
| 1.15 | SI5 | Instalaciones para discapacidad, necesidades especiales y maternidad | Escala / programa | — | 100 | Sí | Instalación por tipo + mapa y tabla edificio–instalación + fotos | Sí | — | 23 |
| 1.16 | SI6 | Instalaciones de seguridad y protección | Escala / programa | — | 100 | Sí | Descripción por instalación (CCTV, hidrantes…) + fotos | Sí | — | 23 |
| 1.17 | SI7 | Infraestructura de salud y bienestar | Escala / programa | — | 100 | Sí | Descripción de servicios de salud + fotos | Sí | — | 24 |
| 1.18 | SI8 | Conservación de flora, fauna y recursos genéticos | Escala / programa | — | 100 | Sí | Descripción por área/programa de conservación + fotos | Sí | — | 24 |
| 1.19 | — | Impacto de los programas de Entorno e Infraestructura en los ODS | Impacto ODS | — | — | Sí | Descripción + fotos/enlaces | Sí | — | 25 |

#### 2. EC · Energy and Climate Change (Energía y cambio climático) · 20 % · 2000 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | EC1 | Uso de aparatos energéticamente eficientes | Razón calculada | % | 200 | Sí | Tabla aparato/total/eficientes/% + descripción + fotos | Sí | — | 25 |
| 2.2 | — | Área total de edificios inteligentes en el campus (m²) | Número | m² | — | **NO** | — | no | — | 26 |
| 2.3 | EC2 | Edificios inteligentes (% del área construida) | Razón calculada | % | 300 | Sí | Matriz por edificio de 22 requisitos (B1–L4), área (m²), suma de área inteligente + fotos | Sí | — | 27 |
| 2.4 | EC3 | Número de fuentes de energía renovable en el campus | Escala / programa | — | 300 | **NO** | — | no | — | 27 |
| 2.5 | — | Fuentes de energía renovable y kWh producidos | Número | kWh | — | Sí | Descripción por fuente renovable (kWh) + fotos | Sí | — | 27 |
| 2.6 | — | Consumo de electricidad por año (kWh) | Número | kWh | — | Sí | Consumo anual (kWh) + gráfico/facturas | Sí | — | 28 |
| 2.7 | EC4 | Consumo de electricidad por población del campus (kWh por persona) | Razón calculada | kWh/persona | 200 | **NO** | — | no | — | 28 |
| 2.8 | EC5 | Energía renovable producida frente al consumo total | Razón calculada | % | 200 | Sí | Tabla fuente–kWh, cálculo producción/consumo (%) | Sí | — | 28 |
| 2.9 | EC6 | Elementos de edificio verde | Escala / programa | — | 200 | Sí | Matriz de elementos GBI por edificio (V) + certificados/fotos | Sí | — | 28 |
| 2.10 | EC7 | Programa de reducción de gases de efecto invernadero | Escala / programa | — | 200 | Sí | Descripción de programas por alcance 1/2/3 + fotos (la instrucción de la plantilla es copia de la de 2.9) | Sí | — | 29 |
| 2.11 | — | Huella de carbono total (tCO2e, 12 meses) | Número | tCO2e | — | Sí | Descripción + cálculo de huella (electricidad, bus, autos, motos = total) | Sí | — | 30 |
| 2.12 | EC8 | Huella de carbono por persona | Razón calculada | t/persona | 200 | **NO** | — | no | — | 30 |
| 2.13 | EC9 | Programas innovadores en energía y cambio climático | Escala / programa | — | 100 | Sí | Descripción de programas innovadores + fotos | Sí | — | 30 |
| 2.14 | EC10 | Programas con impacto sobre el cambio climático | Escala / programa | — | 100 | Sí | Tabla n.º/programa/alcance/participantes/foto/URL/descripción + lista de participantes | Sí | — | 31 |
| 2.15 | — | Impacto de los programas de Energía y Clima en los ODS | Impacto ODS | — | — | Sí | Descripción + fotos/enlaces | Sí | — | 31 |

#### 3. WS · Waste (Residuos) · 17 % · 1700 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | WS1 | Programa 3R (reducir, reutilizar, reciclar) | Escala / programa | — | 200 | Sí | Descripción del programa 3R + fotos | Sí | — | 32 |
| 3.2 | — | Volumen total de papel y plástico producido este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 32 |
| 3.3 | — | Volumen total de papel y plástico producido el año pasado (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año anterior | 32 |
| 3.4 | WS2 | Programa para reducir papel y plástico | Escala / programa | — | 300 | Sí | Descripción de los programas + fotos | Sí | — | 32 |
| 3.5 | — | Volumen total de residuos orgánicos producido este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 32 |
| 3.6 | — | Volumen total de residuos orgánicos producido el año pasado (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año anterior | 33 |
| 3.7 | — | Volumen total de residuos orgánicos tratado este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 33 |
| 3.8 | WS3 | Tratamiento de residuos orgánicos | Escala / programa | — | 300 | Sí | Descripción del tratamiento + fotos | Sí | — | 33 |
| 3.9 | — | Volumen total de residuos inorgánicos producido este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 33 |
| 3.10 | — | Volumen total de residuos inorgánicos producido el año pasado (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año anterior | 33 |
| 3.11 | — | Volumen total de residuos inorgánicos tratado este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 33 |
| 3.12 | WS4 | Tratamiento de residuos inorgánicos | Escala / programa | — | 300 | Sí | Descripción del tratamiento + fotos | Sí | — | 33 |
| 3.13 | — | Volumen total de residuos tóxicos producido este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 34 |
| 3.14 | — | Volumen total de residuos tóxicos producido el año pasado (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año anterior | 34 |
| 3.15 | — | Volumen total de residuos tóxicos tratado este año (tons) | Número | toneladas | — | Sí | Descripción + fotos/enlaces | Sí | año actual | 34 |
| 3.16 | WS5 | Tratamiento de residuos tóxicos | Escala / programa | — | 300 | Sí | Descripción del manejo de residuos tóxicos + fotos | Sí | — | 34 |
| 3.17 | WS6 | Eliminación de aguas residuales | Escala / programa | — | 300 | Sí | Descripción del tratamiento de aguas residuales + fotos | Sí | — | 34 |
| 3.18 | — | Impacto de los programas de Residuos en los ODS | Impacto ODS | n.º de ODS | — | Sí | Narrativa de programas y lista de ODS (1–17) + fotos | — | — | — |

#### 4. WR · Water (Agua) · 11 % · 1100 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | WR1 | Área de absorción de agua (sin bosque ni vegetación plantada) | Área + banda | m² y % | 100 | Sí | Área de absorción, área total, % + fotos | Sí | — | 35 |
| 4.2 | WR2 | Programa de conservación del agua e implementación | Escala / programa | — | 200 | Sí | Descripción + tabla lluvia/caudal/embalses/lagos/pozos (capacidad L) por campus | Sí | — | 35 |
| 4.3 | WR3 | Implementación del programa de reciclaje de agua | Escala / programa | — | 200 | Sí | Descripción del reciclaje de agua + fotos | Sí | — | 36 |
| 4.4 | WR4 | Uso de aparatos eficientes en agua | Razón calculada | % | 200 | Sí | Tabla aparato/total/eficientes/% + fotos | Sí | — | 36 |
| 4.5 | WR5 | Consumo de agua tratada | Razón calculada | % | 200 | Sí | Descripción del consumo de agua tratada + fotos | Sí | — | 36 |
| 4.6 | WR6 | Control de la contaminación del agua en el área del campus | Escala / programa | — | 200 | Sí | Política, monitoreo y programas (secciones) + fotos | Sí | — | 37 |
| 4.7 | — | Impacto de los programas de Agua en los ODS | Impacto ODS | — | — | Sí | Descripción + fotos/enlaces | Sí | — | 37 |

#### 5. TR · Transportation (Transporte) · 17 % · 1700 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | — | Número de autos utilizados activamente y gestionados por la universidad | Número | vehículos | — | **NO** | — | no | — | 38 |
| 5.2 | — | Número de autos que ingresan diariamente a la universidad | Número | vehículos/día | — | **NO** | — | no | — | 38 |
| 5.3 | — | Número de motocicletas que ingresan diariamente a la universidad | Número | motos/día | — | **NO** | — | no | — | 38 |
| 5.4 | TR1 | Vehículos con emisiones por persona del campus | Razón calculada | veh./persona | 200 | Sí | Tabla vehículo/cantidad (autos de la universidad, autos y motos que entran) y razón por población | Sí | — | 38 |
| 5.5 | TR2 | Servicios de shuttle | Escala / programa | — | 250 | Sí | Descripción del servicio (rutas, horarios, costo) + enlaces + fotos | Sí | — | 38 |
| 5.6 | — | Número de shuttles operando en la universidad | Número | buses | — | **NO** | — | no | — | 39 |
| 5.7 | — | Número promedio de pasajeros por viaje de shuttle | Número | pasajeros/viaje | — | **NO** | — | no | — | 39 |
| 5.8 | — | Número total de viajes de shuttle por día | Número | viajes/día | — | **NO** | — | no | — | 39 |
| 5.9 | TR3 | Disponibilidad de vehículos de cero emisiones (ZEV) | Escala / programa | — | 200 | Sí | Tabla tipo de ZEV/total + descripción + fotos | Sí | — | 39 |
| 5.10 | — | Número promedio de Vehículos de Cero Emisiones (ZEV) en el campus por día | Número | ZEV/día | — | **NO** | — | no | — | 39 |
| 5.11 | TR4 | Número total de ZEV dividido por la población total del campus | Razón calculada | ZEV/persona | 200 | **NO** | — | no | — | 39 |
| 5.12 | — | Área total de estacionamiento a nivel del suelo (m²) | Número | m² | — | **NO** | — | no | — | 40 |
| 5.13 | TR5 | Estacionamiento en superficie frente al área del campus | Razón calculada | % | 200 | Sí | Área total, área de estacionamiento, razón + mapa | Sí | — | 40 |
| 5.14 | TR6 | Programa para limitar o reducir el estacionamiento (3 años) | Escala / programa | — | 200 | Sí | Descripción de la reducción (antes/después) + fotos | Sí | 3 años | 40 |
| 5.15 | TR7 | Iniciativas para reducir vehículos privados | Escala / programa | — | 200 | Sí | Lista de iniciativas + fotos | Sí | — | 40 |
| 5.16 | TR8 | Senderos peatonales en el campus | Escala / programa | — | 250 | Sí | Descripción de senderos (seguridad, comodidad, accesibilidad) + fotos | Sí | — | 41 |
| 5.17 | — | Distancia diaria aproximada recorrida por vehículos solo dentro del campus (km) | Número | km/día | — | **NO** | — | no | — | 41 |
| 5.18 | — | Impacto de los programas de Transporte en los ODS | Impacto ODS | — | — | Sí | Descripción + fotos/enlaces | Sí | — | 41 |

#### 6. ED · Education and Research (Educación e investigación) · 13 % · 1300 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 6.1 | — | Cursos relacionados con sostenibilidad | Número | cursos | — | Sí | Lista de cursos + total | Sí | — | 42 |
| 6.2 | — | Total de cursos ofrecidos | Número | cursos | — | Sí | Total de cursos por año (tabla) | Sí | serie de años | 42 |
| 6.3 | — | Programas de estudio relacionados con sostenibilidad | Número | programas | — | Sí | Lista de programas de estudio | Sí | — | 42 |
| 6.4 | ED1 | Proporción de cursos relacionados con sostenibilidad respecto al total de cursos/asignaturas | Razón calculada | % | 200 | **NO** | — | no | — | 42 |
| 6.5 | — | Total de fondos de investigación dedicados a investigación en sostenibilidad (USD) | Número | USD (prom. 3 años) | — | Sí | Fondos por año (3) y promedio (USD) | Sí | 3 años | 42 |
| 6.6 | — | Total de fondos de investigación (USD) | Número | USD (prom. 3 años) | — | Sí | Fondos por año (3) y promedio (USD) | Sí | 3 años | 43 |
| 6.7 | ED2 | Proporción del financiamiento de investigación en sostenibilidad respecto al financiamiento total | Razón calculada | % | 200 | **NO** | — | no | — | 43 |
| 6.8 | — | Número de docentes e investigadores en un año | Número | personas | — | Sí | Cifra de docentes e investigadores + soporte | Sí | — | 43 |
| 6.9 | — | Número de publicaciones académicas indexadas sobre sostenibilidad en un año | Número | publicaciones | — | Sí | Cifra de publicaciones + soporte | Sí | — | 43 |
| 6.10 | ED3 | Publicaciones de sostenibilidad por docente o investigador | Razón calculada | pub./docente | 200 | Sí | Publicaciones ÷ docentes, con ambas cifras | Sí | — | 43 |
| 6.11 | ED4 | Número de eventos relacionados con sostenibilidad | Escala / programa | — | 100 | Sí | Eventos por año (3) y promedio + fotos | Sí | 3 años | 43 |
| 6.12 | ED5 | Actividades de organizaciones estudiantiles en sostenibilidad | Escala / programa | — | 150 | Sí | Lista de actividades estudiantiles + fotos/enlaces | Sí | — | 44 |
| 6.13 | ED6 | Número de actividades culturales en el campus | Escala / programa | — | 100 | Sí | Lista de actividades culturales + fotos | Sí | — | 44 |
| 6.14 | ED7 | Programas de sostenibilidad con colaboración internacional | Escala / programa | — | 100 | Sí | Programas con colaboración internacional (nombre, descripción) + fotos | Sí | — | 44 |
| 6.15 | ED8 | Proyectos de servicio comunitario con estudiantes | Escala / programa | — | 100 | Sí | Tabla proyecto/participantes/duración/área (SI…ED) | Sí | — | 45 |
| 6.16 | ED9 | Número de start-ups relacionadas con sostenibilidad | Escala / programa | — | 100 | Sí | Tabla por start-up: nombre, categoría, URL, fecha, ingresos, empleados, descripción, fotos | Sí | 3 años | 45 |
| 6.17 | — | Número total de egresados con empleos verdes (últimos 3 años) | Número | egresados (3 años) | — | Sí | Tabla año académico/facultad/egresados/con empleo verde/descripción/fuente | Sí | 3 años | 45 |
| 6.18 | — | Número total de egresados (últimos 3 años) | Número | egresados (3 años) | — | Sí | Tabla año académico/facultad/total egresados | Sí | 3 años | 45 |
| 6.19 | ED10 | Egresados con empleos verdes (%, 3 años) | Razón calculada | % | 50 | Sí | Misma tabla de 6.17 + cálculo del porcentaje | Sí | — | 46 |
| 6.20 | — | Impacto de los programas de Educación e Investigación en los ODS | Impacto ODS | — | — | Sí | Descripción + fotos/enlaces | Sí | — | 46 |

#### 7. GD · Governance and Digitalization (Gobernanza y digitalización) · 11 % · 1100 puntos

| Preg. | Ind. | Nombre | Tipo | Unidad | Pts | Plantilla | Campos que pide la plantilla | Evid. guía | Años | Pág. |
|---|---|---|---|---|---|---|---|---|---|---|
| 7.1 | — | Presupuesto total de la universidad (USD) | Número | USD (prom. 3 años) | — | **NO** | — | no | 3 años | 46 |
| 7.2 | — | Presupuesto para sostenibilidad (USD, 3 años) | Número | USD (prom. 3 años) | — | Sí | Tabla presupuesto total/sostenibilidad por año (3), promedio y % | no | 3 años | 46 |
| 7.3 | GD1 | Porcentaje del presupuesto universitario para esfuerzos de sostenibilidad | Razón calculada | % | 200 | **NO** | — | no | — | 47 |
| 7.4 | GD2 | Sitio web de sostenibilidad gestionado por la universidad | Escala / programa | — | 200 | **NO** | — | no | — | 47 |
| 7.5 | — | URL del sitio web de sostenibilidad (si está disponible) | URL | — | — | **NO** | — | Sí | — | 47 |
| 7.6 | GD3 | Informe de sostenibilidad | Escala / programa | — | 100 | Sí | Enlace/URL del informe + prueba de regularidad anual (3 años) + capturas | Sí | — | 47 |
| 7.7 | — | URL del informe de sostenibilidad (si está disponible) | URL | — | — | **NO** | — | Sí | — | 47 |
| 7.8 | GD4 | Informe financiero | Escala / programa | — | 100 | Sí | Enlace/URL del informe + regularidad (3 años) | Sí | — | 47 |
| 7.9 | — | URL del informe financiero (si está disponible) | URL | — | — | **NO** | — | Sí | — | 48 |
| 7.10 | GD5 | Unidad u oficina que coordina la sostenibilidad | Escala / programa | — | 100 | Sí | Decreto de creación, estructura, funciones, n.º de personal + enlace | Sí | — | 48 |
| 7.11 | — | Número de personal dedicado que apoya la coordinación de sostenibilidad | Número | personas | — | **NO** | — | no | — | 48 |
| 7.12 | GD6 | Uso de TIC para gestionar los programas de sostenibilidad | Escala / programa | — | 50 | Sí | Tres tablas A (gestión), B (conectividad), C (seguridad/continuidad): iniciativa, función, descripción, captura/enlace | Sí | — | 48 |
| 7.13 | GD7 | Política sobre tecnologías digitales avanzadas (IA, IoT) | Escala / programa | — | 50 | Sí | Tabla iniciativa/base de política/alcance/evidencia | Sí | — | 49 |
| 7.14 | — | Cumplimiento de protección de datos (GDPR o equivalente) | Número | — | — | Sí | Políticas, responsable, consentimiento, avisos (enlaces) | Sí | — | 49 |
| 7.15 | — | Número total de líderes institucionales y líderes adjuntos | Número | líderes | — | **NO** | — | Sí | — | 49 |
| 7.16 | — | Número de mujeres en posiciones de liderazgo | Número | mujeres líderes | — | **NO** | — | Sí | — | 49 |
| 7.17 | GD8 | Mujeres en liderazgo frente al total de líderes | Razón calculada | % | 100 | Sí | Tabla nivel de liderazgo (universidad, facultad, programa)/total/mujeres | no | — | 50 |
| 7.18 | GD9 | Sistema anticorrupción e integridad de la universidad | Escala / programa | — | 50 | Sí | Descripción y enlaces del sistema | Sí | — | 50 |
| 7.19 | GD10 | Sistema de denuncias (whistleblowing) y quejas de la universidad | Escala / programa | — | 50 | Sí | Descripción y enlaces del sistema | Sí | — | 50 |
| 7.20 | GD11 | Alfabetización digital apoyada en LMS | Escala / programa | — | 50 | Sí | Programas por unidad con fuentes/enlaces | Sí | — | 50 |
| 7.21 | GD12 | Código de ética escrito | Escala / programa | — | 50 | Sí | Documento oficial (decreto, reglamento) + enlace | Sí | — | 51 |

### B.2 Numeración sin plantilla (32 preguntas)

| Categoría | Preguntas sin plantilla | Por qué |
|---|---|---|
| SI | 1.1, 1.2, 1.6, 1.11, 1.12, 1.13, 1.14 | 1.1 y 1.2 son selecciones sin evidencia. 1.6, 1.11, 1.12, 1.13 son cifras de entrada. 1.14 (SI4) es calculada. 1.11 y 1.14 exigen evidencia en la guía y no tienen formato |
| EC | 2.2, 2.4, 2.7, 2.12 | 2.2 (área inteligente) se declara en la plantilla 2.3. 2.4 (n.º de fuentes) se deduce de 2.5/2.8. 2.7 (EC4) y 2.12 (EC8) son calculadas |
| TR | 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.10, 5.11, 5.12, 5.17 | 5.1-5.3 van en la tabla de la plantilla 5.4. 5.6-5.8 son datos del servicio 5.5. 5.10 va en la tabla de 5.9. 5.11 (TR4) es calculada. 5.12 y 5.17 no tienen formato |
| ED | 6.4, 6.7 | Calculadas (ED1, ED2) |
| GD | 7.1, 7.3, 7.4, 7.5, 7.7, 7.9, 7.11, 7.15, 7.16 | 7.1 va en la tabla de 7.2. 7.3 y 7.17 son razones. 7.4 es selección del estado del sitio. 7.5, 7.7 y 7.9 son URL que sí exigen evidencia. 7.11, 7.15, 7.16 son cifras (7.15 y 7.16 con evidencia exigida) |
| WS, WR | ninguna | Cubiertas por completo |

Plantilla sin pregunta: **3.18** («Impact of Waste Management programs in supporting SDGs»). La guía no tiene pregunta de impacto ODS para Residuos ni para Gobernanza; sí la tiene para SI (1.19), EC (2.15), WR (4.7), TR (5.18) y ED (6.20).

### B.3 Estructura común de las plantillas (patrón)

Las 86 plantillas tienen la misma estructura. Se detectó en el XML (`w:p`, `w:tbl`, `w:drawing`):
1. Encabezado: «Template for Evidence(s)», «UI GreenMetric Questionnaire», `University :`, `Country :`, `Web Address :` (el encabezado va en `header1.xml`; las plantillas 1.3 y 1.9 traen además encabezados y pies adicionales).
2. Línea de categoría `[n] Nombre (CÓD)`.
3. Marca de agua «SAMPLE» (dibujos) alrededor del contenido de ejemplo. Todo lo que está en la plantilla es un **ejemplo de otra universidad** (UI, Nottingham, Wageningen, Mahidol, UC Davis): hay que reemplazarlo, no completarlo.
4. Título `[n.m] Nombre (CÓD.n)`.
5. Figuras de ejemplo en tabla con pie («Example of …, Universidad, País»). Entre 1 y 7 imágenes por plantilla.
6. `Description:` + instrucción entre paréntesis («Please describe … You can describe more related items if needed») + nota de mapas.
7. Texto de ejemplo y, según la plantilla, una o varias tablas de datos.
8. `Additional evidence link (…)`.

No hay controles de contenido (`w:sdt`), ni campos de formulario (`w:ffData`), ni macros. **No existen marcadores de posición**: toda la plantilla es texto fijo con ejemplo. La exportación tendrá que reconstruir el contenido (ver sección E). Tampoco hay límites de longitud en las plantillas; el único tope explícito es el de la guía (2 MB por archivo, .pdf).

**Patrones repetidos:**

| Patrón | Plantillas | Qué implica |
|---|---|---|
| Narrativa + fotos + enlace adicional | La mayoría de las de tipo Escala / programa (37 de 86 son de ese tipo) | Un campo de texto largo (inglés), N figuras con pie y un enlace |
| Impacto en ODS (opción 1-5 por n.º de ODS + narrativa con lista de ODS) | 1.19, 2.15, 3.18, 4.7, 5.18, 6.20 | Un selector de n.º de ODS, el texto de programas y los números de ODS apoyados. La opción 1-5 sale de contar los ODS marcados |
| Pares «este año / el año pasado» | 3.2/3.3, 3.5/3.6, 3.9/3.10, 3.13/3.14 (y «tratado» 3.7, 3.11, 3.15) | Las 12 plantillas de volúmenes de residuos son la misma tabla (tipo de residuo × producido año pasado / este año / reducido / tratado; reutilizado / reciclado hacia abajo / hacia arriba). Se captura una vez y se exporta a las 12 |
| Razón calculada con tabla | 1.8, 2.1, 2.8, 4.4, 5.4, 6.10, 6.19, 7.2, 7.17 | La plantilla pide la tabla y el cálculo escrito (p. ej. «26.500 / 100.000 = 26,5 %»). La razón debe calcularse en vivo y escribirse en el texto exportado |
| Tabla de egresados | 6.17, 6.18, 6.19 | Las tres traen la misma tabla año académico × facultad. 6.19 repite 6.17 más el cálculo |
| Tabla de 3 años | 6.5, 6.6, 7.2, 6.11 | Año 1, 2, 3 y promedio (el promedio lo calcula la plataforma) |
| Matriz por edificio | 2.3 (22 requisitos B1-L4), 2.9 (elementos GBI) | Edificios × requisitos marcados con X o V. La 2.3 pide «una fila por edificio» y sumar el área de los inteligentes |
| Tablas A/B/C | 7.12 | Tres tablas: gestión TIC, conectividad, seguridad y continuidad |
| Lista con enlaces | 5.5, 6.12, 6.13, 7.14, 7.18-7.21 | Varios enlaces o URL de documentos |

---

## C. Modelo de datos propuesto

### C.1 Qué se reutiliza de lo que ya existe

| Existente | Uso en el módulo nuevo |
|---|---|
| `ranking_cycles` (0149): un ciclo por (ranking, año), año de datos, fecha límite, estado | **Se reutiliza tal cual** con `ranking = 'ui-greenmetric'`. Las columnas `ods_priorizados` no aplican (se ignora el valor por defecto) |
| `ranking_indicators` (0149) | **No se puede reutilizar**: `ods` es obligatorio (1 a 17), `nivel` es metric/indicator/option, `tipo` ev/doc/dato/inv. UIGM tiene categorías, no ODS |
| `ranking_assignments` (0149): indicador × oficina, principal o apoyo | Concepto reutilizable, pero asigna **oficinas**; aquí se asigna a **personas** (decisión 3). Tabla nueva |
| `ranking_responses` (0149): valores numéricos, `si_no`, estado none/draft/sent/back/ok, comentario ≤ 1000 | **No cabe**: el estado tiene 5 valores, el comentario tiene tope de 1000 caracteres y los valores son solo numéricos. La narrativa de UIGM es larga, con tablas y versión en inglés. Tabla nueva |
| `ranking_transicion_permitida` y `ranking_responses_guard` | Se copia el patrón (disparador que hace cumplir las transiciones en la base) con los estados nuevos |
| `ranking_evidence` + bucket `ranking-evidencias` (0149), tope de 15 MB | **No se reutiliza para UIGM** (cambio respecto de la versión anterior de este análisis). La evidencia de UIGM vive en **UDrive, dentro de la unidad «Datos de Sostenibilidad»** (`drive_archivos`, sección H). Ese bucket y esa tabla siguen siendo de THE Impact, sin tocarlos |
| `ranking_biblioteca` (0152): ZIP de evidencias, hash único, texto leído, propuestas de Pilo | **Se reutiliza solo como índice y clasificador.** Sus archivos son de THE y están en el bucket `ranking-biblioteca`. Para UIGM, «Desde la biblioteca» copia el archivo elegido a la carpeta de la pregunta en UDrive (queda un archivo nuevo con su id) y registra el origen. No se migra lo que ya hay. El clasificador (`clasificar.ts`) necesita reglas por pregunta UIGM; es trabajo nuevo |
| `src/modules/rankings/reporte/` (`estados.ts`, `envio.ts`, `traducir.ts`, `analisis-evidencia.ts`) | Se reutilizan los patrones; `traducir.ts` pasa de un comentario a campos múltiples |
| `pilo-rankingsod`, acción `traducir-texto` (verificación de cifras y siglas) | Se reutiliza para la traducción. Se amplía con un modo «campo estructurado» y glosario UIGM |
| Módulo de correos (0137): `correo_templates`, `correo_identities`, `correo_log`, función `correos` | Se reutiliza: plantillas editables con `{{nombre}}`, bitácora de envíos. **Falta** una acción de envío transaccional: la función hoy atiende el gancho de Supabase Auth y las acciones `probar` y `prueba`. Hay que agregar `enviar` con clave de plantilla y datos |
| `units`, `unit_members`, roles Gestor/Contribuyente/Consulta | Se reutilizan para el alcance; el rol de «responsable de dato» y «revisor» es nuevo (por ciclo) |
| `RankingsAdmin.tsx` (tablero con la tarjeta «UI GreenMetric», datos ilustrativos) | Punto de entrada. Hoy esa tarjeta no tiene datos reales |
| `src/modules/sostenible` (ranking de UDES Sostenible, `data.ts`) | Muestra el puntaje total sobre 10.000. El módulo nuevo puede alimentar esa cifra |

### C.2 Tablas nuevas (prefijo `ugm_`)

Todas con RLS, sin acceso anónimo, DELETE con WHERE (regla de `safeupdate`, 0095). Nombres tentativos.

**`ugm_questions`**: catálogo por ciclo (las 117 preguntas + 3.18). Se carga una vez desde el catálogo de este análisis.
- `ciclo` (uuid, FK `ranking_cycles`), `q` (text, «1.8»), `categoria` (SI, EC, WS, WR, TR, ED, GD), `numero` (int)
- `indicador` (text nulo, «SI1»), `puntos` (int nulo), `nombre_en`, `nombre_es`
- `tipo` (seleccion, numero, razon, area_banda, escala, impacto_ods, url)
- `unidad`, `periodo` (actual, anterior, tres_anios, serie), `requiere_evidencia` (bool), `pagina_guia` (int)
- `opciones` (jsonb: `[{valor, es, en, factor}]`), `formula` (text), `depende_de` (text[]: `{1.5,1.6}`)
- `plantilla` (text nulo: nombre del `.docx`), `esquema` (jsonb: definición de campos y tablas que pinta el formulario y llena la plantilla), `orden`
- PK (`ciclo`, `q`).

**`ugm_cycle_config`**: `ciclo`, universidad, país, dirección web (los tres datos del encabezado), `periodo_ref_desde`, `periodo_ref_hasta`, `envio_desde`, `envio_hasta`, `poblacion_regla` (jsonb opcional), `idioma_revision`.

**`ugm_assignments`**: `ciclo`, `q`, `usuario` (FK profiles), `unidad` (FK units, nulo), `rol` (responsable | apoyo | revisor), `fecha_limite`, `asignado_por`, `created_at`. Único: un responsable por pregunta; revisor por categoría o por pregunta.

**`ugm_responses`**: una fila por (ciclo, q).
- `id`, `ciclo`, `q`
- `estado` (sin_asignar, asignado, en_captura, enviado, en_revision, devuelto, aprobado, listo)
- `valores` (jsonb: campos y tablas capturados, con sus unidades)
- `opcion` (smallint 1-5 nulo; la elegida o la calculada), `opcion_calculada` (bool), `calculo` (jsonb: insumos, resultado, fórmula usada)
- `narrativa_es`, `narrativa_en`, `pies_es`/`pies_en` (en `ugm_evidencias`)
- `estado_traduccion` (sin_traducir, borrador_pilo, revisada), `traduccion_revisada_por`, `traduccion_revisada_at`
- `version` (int), `completitud` (0-100), `nota_revision`, `updated_by`, `updated_at`
- Único (`ciclo`, `q`).

**`ugm_response_versions`**: historial: `response_id`, `version`, `snapshot` (jsonb), `autor`, `motivo` (guardado, envío, devolución, aprobación, importación), `created_at`. Se guarda una versión por envío y por cada cambio de revisor; el borrador de captura solo se sobrescribe.

**`ugm_evidencias`** (reemplaza a `ugm_evidence_links`): `response_id`, `archivo_id` (FK a `drive_archivos`, **por id, sin copia**), `figura` (n.º en la plantilla), `pie_es`, `pie_en`, `orden`, `es_mapa` (bool), `idioma` (en | es), `publica` (bool, por defecto `false`), `url_publica` (estable, derivada del id). Una evidencia que el responsable sube a la carpeta de su pregunta se vincula aquí; si alguien reemplaza el archivo en UDrive (versión nueva), el vínculo sigue apuntando al mismo id y la hoja, el paquete y la web usan la versión nueva. `unique (response_id, archivo_id)`.

**`ugm_comments`**: `response_id`, `autor`, `tipo` (comentario, devolucion, aprobacion), `campo` (nulo: a qué campo se refiere), `texto`, `resuelto`, `created_at`.

**`ugm_translations`**: la traducción por campo, para no mezclar traducción con captura: `response_id`, `campo`, `es`, `en`, `origen` (pilo, humano), `modelo`, `estado` (borrador, revisada), `revisor`, `revisado_at`, `hash_es` (hash del español traducido; si cambia el español, la traducción queda «desactualizada»).

**`ugm_activity`** (bitácora): `ciclo`, `response_id`, `actor`, `accion`, `de`, `a`, `detalle` (jsonb), `created_at`. Solo inserción.

**`ugm_notifications`**: `ciclo`, `response_id`, `destinatario`, `plantilla` (clave de `correo_templates`), `estado` (en_cola, enviado, error, omitido), `correo_log_id`, `programada_para`, `enviado_at`, `error`.

**`ugm_exports`**: `ciclo`, `alcance` (indicador, categoria, todo), `q`/`categoria`, `ruta` (bucket privado), `hash`, `manifiesto` (jsonb: archivos y versiones incluidas), `generado_por`, `created_at`.

**`ugm_imports`**: `ciclo`, `archivo`, `hash`, `q_detectada`, `resultado` (jsonb: campos reconocidos, conflictos, advertencias), `estado` (analizado, aplicado, descartado), `aplicado_por`.

### C.3 Cálculos

Las razones (SI1, SI4, EC2, EC4, EC5, EC8, TR1, TR4, TR5, ED1-ED3, ED10, GD1, GD8, y los porcentajes de 2.1, 4.4, 4.5) y la banda 1-5 se calculan en una función pura (TypeScript en `src/` y copia en la función de borde, igual que `logic.ts` de Pilo). La base solo guarda el resultado y los insumos. Cada pregunta calculada lleva `depende_de` para marcar «faltan datos» cuando un insumo no está capturado.

---

## D. Flujo, estados, roles y correos

### D.1 Roles

| Rol | Quién es | Puede |
|---|---|---|
| **Administrador del ranking** | Planeación (y la administración del sistema) | Abrir el ciclo, cargar el catálogo, asignar, reasignar, ver todo, recordar, devolver o aprobar, exportar, importar |
| **Responsable de dato** | Una persona de una oficina (Infraestructura, Bienestar, Biblioteca, Investigaciones…) | Capturar su pregunta, subir evidencias, traducir con Pilo, enviar |
| **Revisor** | Persona de Planeación o de Sostenibilidad designada por categoría | Aprobar o devolver con comentario; revisar la traducción al inglés |

Un administrador puede tener también los otros roles. «Consulta» (rol de unidad existente) solo lee.

### D.2 Estados y transiciones

```
sin asignar → asignado → en captura → enviado → en revisión → aprobado → listo para exportar
                              ↑                       │
                              └──────── devuelto ←────┘
```

| De → a | Quién | Disparador |
|---|---|---|
| sin asignar → asignado | Administrador | Asignar responsable |
| asignado → en captura | Responsable | Primer guardado |
| en captura → enviado | Responsable (o administrador) | «Enviar para revisión». Bloqueado si falta un campo obligatorio, la evidencia o la traducción al inglés sin revisar |
| enviado → en revisión | Revisor | Abre o toma la respuesta (marca quién la revisa) |
| en revisión → aprobado | Revisor / administrador | «Aprobar» |
| en revisión → devuelto | Revisor / administrador | «Devolver» con comentario obligatorio |
| devuelto → en captura | Responsable | Vuelve a editar |
| aprobado → devuelto | Administrador | Reabrir una aprobada |
| aprobado → listo para exportar | Automático | Aprobada, con traducción revisada y evidencia completa |
| listo → aprobado | Automático | Cambia cualquier campo, evidencia o traducción |

Mientras la respuesta está enviada, en revisión o aprobada, el responsable no la edita (mismo criterio de 0149). Lo hace cumplir un disparador en la base.

### D.3 Correos que dispara cada transición

Plantillas nuevas en `correo_templates`, identidad «Planeación» (editables desde el módulo de correos, con `{{nombre}}` y los datos nuevos `{{pregunta}}`, `{{indicador}}`, `{{categoria}}`, `{{fecha_limite}}`, `{{enlace}}`, `{{comentario}}`, `{{revisor}}`). Todo correo lleva el enlace directo al indicador.

| Transición | Destinatario | Clave | Asunto |
|---|---|---|---|
| Asignación (o reasignación) | Responsable (copia al administrador) | `ugm_asignacion` | Le asignaron el indicador {{indicador}} de UI GreenMetric |
| Envío | Administrador del ranking y revisor de la categoría; copia a los responsables de datos | `ugm_enviado` | Se presentó {{indicador}}: pendiente de revisión |
| Devolución | Responsable | `ugm_devuelto` | {{indicador}} volvió con comentarios |
| Aprobación | Responsable (copia al administrador) | `ugm_aprobado` | Aprobaron {{indicador}} |
| Recordatorio | Responsable | `ugm_recordatorio` | Faltan {{dias}} días para entregar {{indicador}} |
| Vencido | Responsable y administrador | `ugm_vencido` | {{indicador}} está vencido |
| Categoría lista | Administrador | `ugm_categoria_lista` | Todos los indicadores de {{categoria}} están listos |

Recordatorios: a 7, 3 y 1 día antes del vencimiento y el día del vencimiento; no más de uno por persona y día, agrupando varios indicadores en un solo correo.

**Texto de ejemplo, asignación**

> **Asunto:** Le asignaron el indicador SI3 de UI GreenMetric
>
> Hola, Marcela.
>
> Planeación le asignó el indicador **1.10 · Área cubierta por vegetación plantada (SI3)** del reporte de UI GreenMetric 2026. Es de la categoría Entorno e infraestructura.
>
> Qué se necesita: el área plantada en m², el área total del campus, un mapa o fotos que muestren dónde está la vegetación y una descripción corta. Puede escribir todo en español; Pilo lo traduce al inglés y usted revisa la traducción.
>
> Fecha límite: 15 de noviembre de 2026.
>
> [Abrir el indicador]

**Texto de ejemplo, envío («se presentó»)**

> **Asunto:** Se presentó SI3: pendiente de revisión
>
> Hola, Planeación.
>
> Marcela Quintero (Infraestructura Física) envió el indicador **1.10 · SI3** para revisión, con 3 evidencias y la traducción al inglés revisada por ella.
>
> [Revisar ahora]

**Texto de ejemplo, devolución**

> **Asunto:** SI3 volvió con comentarios
>
> Hola, Marcela.
>
> El revisor devolvió el indicador 1.10. Comentario: «El mapa no muestra los nombres de los edificios. La guía pide marcar la ubicación exacta de cada área plantada.»
>
> [Corregir el indicador]

---

## E. Importación y exportación de las plantillas `.docx`

### E.1 Hallazgo que condiciona todo

Las plantillas no tienen marcadores de posición ni campos: son documentos de ejemplo. «Llenar la plantilla» es entonces **generar un `.docx` por pregunta con la misma estructura** (encabezado, categoría, título, figuras con pie, descripción, tablas, enlace) y reemplazar el contenido de muestra por el real.

### E.2 Exportación

1. **Base visual.** Tomar cada `.docx` original como plantilla de estilo (fuentes, encabezado/pie con `header1.xml`, márgenes) y generar el cuerpo nuevo. Opción A: reconstruir `document.xml` por pregunta con una librería (`docx` o `docxtemplater` en el navegador o en una función de borde). Opción B: insertar *marcadores* `{{campo}}` en una copia de cada plantilla (una vez, a mano o con script) y llenarla con `docxtemplater`. La B conserva el formato casi intacto; cuesta una pasada de 86 plantillas. **Recomendación: B**, con la copia con marcadores guardada en el repositorio como plantilla propia (derivada, sin la marca «SAMPLE» ni los ejemplos).
2. **Qué se escribe.** Universidad / País / Web del ciclo; `[n.m]` y nombre en inglés; descripción en inglés (la traducción revisada); tablas con los números del formulario; el cálculo escrito de la razón; figuras con pie en inglés; enlace adicional.
3. **Evidencias.** Se leen de la carpeta de la pregunta en Datos de Sostenibilidad › UI GreenMetric › Edición › categoría › pregunta (`archivo_id` de `ugm_evidencias`). Las imágenes (JPG/PNG) se incrustan en la figura correspondiente; los PDF se copian al paquete como anexo; los enlaces públicos van en «Additional evidence link». Un archivo mayor de 2 MB se comprime y uno que no es PDF se convierte al armar el paquete (límite de la guía, p. 52); el original queda intacto en UDrive.
4. **Formato de salida.** La guía pide `.pdf` (p. 52). El módulo exporta `.docx` (editable) y, si se puede, `.pdf` de cada uno. Convertir a PDF en servidor exige LibreOffice o un servicio externo; no está en la pila actual (decisión 7).
5. **Paquete `.zip`.** Estructura que replica la carpeta oficial: El paquete **se arma leyendo esas carpetas**, no un bucket aparte: cada subcarpeta `evidencias/<n.º>/` del `.zip` es el contenido, con su nombre normalizado, de la carpeta de UDrive de esa pregunta.
   ```
   UIGM-2026_UDES/
     manifest.json                (qué contiene, versión de cada respuesta, hash)
     1_Setting_and_Infrastructure_SI/
       University_Country_1_10_Total_area_on_campus_covered_in_planted_vegetation.docx
       evidencias/1_10/…
     2_Energy_and_Climate_Change_EC/ … hasta 7_Governance_and_Digitalization/
   ```
   Alcance: un indicador (un `.docx`), una categoría (su carpeta) o todo. Solo se exportan respuestas **listas**; las demás aparecen como advertencia en el manifiesto.
6. **Preguntas sin plantilla.** Las 32 preguntas sin `.docx` no se exportan como archivo: sus valores van en una hoja de resumen `datos_para_el_sistema_en_linea.xlsx`, con cifras, bandas y razones, lista para digitarla en el sistema de UI.
7. **Reglas.** Nunca se llena una plantilla con una respuesta sin traducción revisada. Los nombres de archivo conservan los de la plantilla oficial.

### E.3 Importación (de un `.docx` ya diligenciado en inglés)

1. Se sube el archivo; el servidor lo abre en solo lectura, no ejecuta macros ni contenido externo, y rechaza `.docm`, vínculos externos y archivos grandes.
2. Se reconoce la pregunta por el título `[n.m]` (o por el nombre del archivo). Si no coincide con ninguna, se rechaza con un mensaje claro.
3. Se extraen: la descripción (texto bajo «Description:»), las tablas (por posición y encabezados), los pies de figura, el enlace adicional y las imágenes.
4. **Asistente de revisión** antes de aplicar: tabla «campo reconocido → valor actual → valor importado» con tres estados: *nuevo*, *igual*, *en conflicto*. La persona elige por campo qué conservar. Los textos de ejemplo de la plantilla original («Wageningen…», «University X») se detectan y se descartan.
5. El inglés importado entra como `narrativa_en` (origen humano). Si el español está vacío, Pilo ofrece la traducción inversa al español como borrador (marcada «sin revisar»).
6. El `.docx` importado se guarda como archivo en la carpeta de su pregunta (nombre normalizado, versión nueva si ya había uno) y sus imágenes extraídas, como archivos vinculados por id. Cada importación crea una versión en `ugm_response_versions` y queda en la bitácora.

### E.4 Traducción con Pilo (español → inglés)

Se reutiliza la acción `traducir-texto` de `pilo-rankingsod` (misma verificación de cifras y siglas que los informes). Cambios:
- **Qué se traduce:** narrativa, pies de figura, nombres de filas de tablas y descripciones de tabla. Los números, las unidades, las URL y los nombres propios no se tocan.
- **Verificación:** la traducción debe conservar cada cifra y sigla del original; si no, se rechaza y se avisa.
- **Glosario fijo** (por ejemplo «Sedes» = *campus sites*, «Vinculación» = *community engagement*, «Empleos verdes» = *green jobs*, «Semillero» = *research seedbed*). El glosario vive en la base y lo edita el administrador.
- **Estados:** `sin_traducir` → `borrador_pilo` → `revisada` (la persona marca «revisada» y queda su nombre y fecha). Si se edita el español después, la traducción pasa a «desactualizada» (hash distinto).
- **Regla de envío:** no se envía con una traducción en `borrador_pilo` o desactualizada.
- **Inversa (EN → ES):** solo para importar; siempre queda como borrador.
- **Costo y espera:** la memoria del proyecto registra que NVIDIA es lenta y retira modelos; la traducción debe ser asíncrona, con estado «traduciendo» y reintento.
- Los textos de evidencia son revisados por un LLM de THE en otro ranking; para UIGM la guía no lo dice. La regla de THE «una página, sin enlaces múltiples» **no** se traslada aquí sin confirmarla.

---

## F. Riesgos, dudas abiertas y decisiones

**Riesgos**
1. **Calendario.** La ventana 2026 (feb-jun) ya pasó. Si el módulo se prepara para la edición 2027, las preguntas pueden cambiar (la guía cambia cada año: pp. 7-8). El catálogo debe ser por ciclo y reimportable.
2. **Evidencia en UDrive: cuota, permisos y borrado.** La unidad «Datos de Sostenibilidad» tiene cuota de 5 GB (0191), compartida con tablas y gráficas; 86 carpetas por ciclo con PDF de hasta 2 MB caben de sobra, pero conviene vigilar el uso. Los permisos son por papel en la carpeta (Crea para el responsable, Administra para la administradora), así que asignar debe otorgarlo y reasignar debe retirarlo. Quitar una evidencia la manda a la papelera de UDrive; si estaba publicada, su enlace público deja de funcionar (la web debe mostrar un aviso, no un error).
3. **Plantillas sin marcadores.** La exportación fiel exige trabajo previo sobre 86 `.docx`.
4. **Plantillas inconsistentes con la guía** (lista abajo).
5. **Pilo traduce mal una cifra o una sigla.** Mitigado con la verificación de cifras, el glosario y la revisión humana obligatoria.
6. **Envío de correos.** La función `correos` hoy no tiene un endpoint de envío transaccional; hay que agregarlo y probarlo con el SMTP real (la propia memoria del módulo dice que el envío real no se verificó).
7. **Permisos.** Un responsable de dato por persona (no por oficina) cambia el modelo de RLS de 0149 (unidad), y 0152 ya tuvo una corrección porque Planeación sin rol de administración no veía las respuestas de las oficinas.

**Inconsistencias detectadas** (guía contra plantillas)
- Plantilla 3.18 (ODS de Residuos) sin pregunta en la guía. Residuos y Gobernanza no tienen pregunta de impacto ODS.
- 32 preguntas sin plantilla (sección B.2); 7 de ellas exigen evidencia en la guía y no tienen formato (1.11, 1.14, 7.5, 7.7, 7.9, 7.15, 7.16).
- Plantillas 7.2 y 7.17 existen y la guía no dice «Se requiere evidencia» en esas preguntas (sí lo dice en 7.15/7.16).
- Plantilla 2.3 mezcla 2.2 (área) y 2.3 (EC2); no trae título `[2.3]`.
- Plantilla 2.10 (GEI): la instrucción repite la de 2.9 («elements of green building implementation»).
- Plantillas 2.5 y 2.8 (renovables) piden casi lo mismo: descripción de fuentes y kWh producidos.
- Plantillas 6.17, 6.18 y 6.19: la misma tabla en tres archivos.
- Plantillas 3.2/3.3, 3.5/3.6, 3.9/3.10, 3.13/3.14: una sola tabla con ambos años en dos archivos.
- Términos distintos: plantilla 6.1 dice *courses or modules*; la guía, *cursos/asignaturas*; la 6.2 aclara «(not modules)».
- Plantilla 1.7: título «Total campus buildings area» contra la guía «área total construida (todos los pisos)»; el ejemplo suma el área de cada edificio sin aclarar si es huella o piso total (1.6 vs 1.7).
- Los títulos de varias plantillas tienen errores de ortografía de UI («facliities», «Eduaction», «sustainablity»); no hay que corregirlos en la exportación para que coincidan.
- La guía indica que el verde claro marca los indicadores nuevos de 2026 (p. 13); el texto extraído no conserva el color. **No se pudo determinar cuáles son.** Solo se sabe que GD es nueva como categoría.
- Indicadores calculados que no se capturan (sin plantilla): SI4 (1.14), EC4 (2.7), EC8 (2.12), TR4 (5.11), ED1 (6.4), ED2 (6.7) y GD1 (7.3); se derivan de otras respuestas. Otros calculados sí tienen plantilla de apoyo: SI1, EC2, EC5, TR1, TR5, ED3, ED10, GD8.

**Decisiones que debe tomar el usuario (máximo 10, con recomendación)**

1. **¿Qué edición se reporta?** La ventana 2026 cerró. *Recomendación:* modelar el ciclo «Edición 2027 (datos 2026)» con fechas configurables; si 2026 sigue abierto por una extensión, usar la misma estructura. Confirmar con la secretaría de UI GreenMetric.
2. **¿Dónde vive la evidencia?** *Recomendación (cambió):* en UDrive, unidad «Datos de Sostenibilidad», con carpetas creadas solas por ciclo, categoría y pregunta; `ranking_cycles`, la biblioteca (solo como índice) y los correos se reutilizan; las tablas `ugm_*` guardan el vínculo por id de archivo.
3. **¿Se asigna a personas o a oficinas?** El flujo pedido es por persona (responsable de dato), el reporte THE es por oficina. *Recomendación:* persona con oficina visible; el jefe de oficina puede reasignar.
4. **¿Quién revisa?** *Recomendación:* un revisor por categoría (Planeación o Sostenibilidad) y el administrador como respaldo.
5. **¿Se arrastran respuestas del ciclo anterior?** *Recomendación:* copiar como borrador «para actualizar», marcando qué campos dependen del año de datos. Nunca aprobar automáticamente.
6. **¿Quién escribe en inglés?** *Recomendación:* siempre español primero, traducción de Pilo y revisión humana obligatoria antes de enviar (el responsable) y antes de exportar (el revisor).
7. **Salida `.pdf` de 2 MB.** *Recomendación:* exportar `.docx` y `.pdf` si se consigue una conversión confiable; si no, entregar `.docx` y dejar el PDF manual al principio. Validar en la subida (PDF, ≤ 2 MB, inglés) y comprimir o convertir al armar el paquete; el original no se toca.
8. **¿Se construyen las 32 «preguntas sin plantilla» como captura?** *Recomendación:* sí, porque alimentan los cálculos (1.6, 1.11, 1.13, 5.x); van en la hoja de datos para el sistema en línea.
9. **Preparar las plantillas con marcadores (opción B de E.2).** *Recomendación:* sí, una sola vez, y guardarlas como plantillas propias.
10. **Alcance del correo y del recordatorio.** *Recomendación:* recordatorios agrupados por persona a 7, 3 y 1 día y el día del vencimiento; el administrador recibe un resumen semanal, no un correo por cada cambio.

**Lo que no se pudo leer o verificar:** colores de la guía (indicadores nuevos); el sistema en línea de UI (formulario y límites reales de captura); las pp. 59-70 del Apéndice 1 solo se contrastaron con la Tabla 3; el enlace `bit.ly/UIGreenmetricEvidences2026` (no se abrió); el aspecto visual de las plantillas (se analizó su XML, no se renderizó).


---

## G. Página pública `/sostenible/green`

Referencia leída: `SostenibleRanking.tsx` y `data.ts` (la página de hoy); `OdsPortal.tsx`, `OdsShell.tsx`, `ods-portal-wall.ts`, `ods-portal.css`, `ods.css`, `OdsEvidence.tsx` (el diseño que se debe seguir). El prototipo muestra la página nueva en la sección «Página pública» (conmutador «Intranet | Página pública» de la barra) y el panel de la intranet «Publicación».

### G.1 Qué está desactualizado hoy (`data.ts`, ranking `green`)

| Hoy | Guía 2026 | Dónde |
|---|---|---|
| Seis categorías (SI, EC, WS, WR, TR, ED); el texto dice «seis categorías con pesos distintos» | **Siete**: se agrega Governance and Digitalization (GD) | p. 8 y 9 |
| Pesos 15 / 21 / 18 / 10 / 18 / 18 (SI, EC, WS, WR, TR, ED) | SI 11 %, EC 20 %, WS 17 %, WR 11 %, TR 17 %, ED 13 %, GD 11 % | Tabla 2, p. 10 |
| Nombre «UI GreenMetric» y «Universitas Indonesia» como `publisher` | Desde 2026 se llama *UI GreenMetric Sustainable University Rankings* (antes *World* University Rankings) | p. 3 y 8 |
| «de 1.400+ universidades» | 1.745 universidades de 105 países en la edición 2025 | p. 3 |
| Puntaje total `score: [4650…6700]` y posiciones `world`, `national` | Son cifras de muestra. El puntaje oficial lo asigna UI tras su revisión (p. 53). **La página nueva no muestra puntaje, puntos ni pesos** (decisión 2026-10: son internos) | p. 53 |
| Puntajes por categoría `scores: [52, 58, …]` en 0-100 y pesos `weight` | Son muestra y los pesos están desactualizados. La web no muestra pesos ni puntos; la intranet sí (11 %, 20 %, 17 %, 11 %, 17 %, 13 %, 11 % y puntos máximos 1.100, 2.000, 1.700, 1.100, 1.700, 1.300, 1.100) | Tabla 2 y 3, pp. 10-13 |
| Los `indicators` de cada categoría apuntan a claves de ejemplo (`verde`, `arboles`, `energia`…) | La categoría debe listar sus indicadores reales (SI1-SI8, EC1-EC10, WS1-WS6, WR1-WR6, TR1-TR8, ED1-ED10, GD1-GD12) y los datos de entrada | pp. 19-51 |
| `categoryLabel: "Categorías"` con cifras por edición | La página debe leer la edición/ciclo vigente de la base, no de un arreglo fijo | — |

### G.2 Qué se reutiliza y qué hay que generalizar

**Se reutiliza tal cual (sin duplicar):**
- Tokens `--o-*` y el marco `.odsx` de `ods.css`: tema siempre claro, esquinas vivas (`--o-radius: 0`), tinta #14233b, azul institucional #014898, verde #3f7e44. La paleta del prototipo es esa; el contraste de los carteles se calcula como en `OdsPortalPoster` (texto blanco o tinta oscura según el color).
- `ods-portal-wall.ts` (`wallLayout`): coloca carteles de tamaño s, w y xl sin huecos y sirve para 7 categorías.
- `useSlidingRule` (filete que se desliza en los conmutadores), `OdsPortalArrow`, `reduced()` de `widgets.tsx`, los conmutadores `.opt-switch` y el buscador `.opt-search`.
- El patrón de la página de evidencia (`OdsEvidence`, `ods-evidence.css`): hoja limpia, sin menú ni enlaces, inglés primero y español a un clic.
- `LangSwitch`, `tr()`/`useLang` y el diccionario (`i18n.ts`) para ES | EN.

**Hay que generalizar para no duplicar:**
1. **`OdsPortal` → un portal por ranking.** Hoy `OdsPortal` depende de `ODS_LIST` (17 ODS), de `odsArt()` (ilustraciones por ODS), del filtro «THE» y de `ODS_ROUTES`. Se propone un `RankingPortal` que reciba una configuración `{ranking, edición, items[], rutas, arte?, filtros}`. Los 17 ODS y las 7 categorías son dos configuraciones del mismo componente. Los carteles de categoría llevan un icono de trazo único en lugar de personaje recortado.
2. **`OdsShell`:** hoy fija «THE Impact Rankings» y sus pestañas. Pasa a recibir el ranking (título, ruta de regreso, pestañas).
3. **`OdsReport` → informe de grupo de indicadores.** El informe por ODS y el informe por categoría comparten: cabecera de color, cifras, lista de indicadores con evidencias, programas. Se extrae a piezas (`OdsReportParts.tsx` ya va en esa dirección) y la categoría usa las mismas con otras fuentes.
4. **`OdsEvidence`:** hoy lee `useEvidenciaPublica(ods, indicador)` (THE). Para UIGM se agrega una fuente `useEvidenciaUigm(q)`; la hoja (`EvidenciaHoja`) se reutiliza.
5. **`data.ts`:** el ranking `green` deja de ser un objeto fijo; sus categorías y pesos salen de `ugm_questions`/`ugm_cycle_config` (G.3). THE World y Times quedan como están.

### G.3 Modelo de publicación

Sobre el modelo de la sección C se agregan estos campos y una vista pública. **Regla central: la página pública solo lee una vista pública; nunca lee las tablas de trabajo.**

**En `ugm_responses`:**
- `publicar` (bool, por defecto `false`): el interruptor «Publicar en la web».
- `publicado_at`, `publicado_por`, `retirado_at`: auditoría.
- `sensible` (bool nulo): dato sensible; si es `true` no se puede publicar.
- `version_publicada` (int, de `ugm_response_versions`): la versión que ve el público. Mientras se corrige un borrador, el público sigue viendo la última versión aprobada (o nada, si se devolvió: ver abajo).

**Reglas de publicación (las hace cumplir un disparador, no solo la pantalla):** solo se enciende si el estado es *aprobado* o *listo*, la traducción está *revisada*, hay al menos una evidencia y el dato no es sensible. Si algo de eso deja de cumplirse (la traducción cambia, se devuelve, se quita la última evidencia), `publicar` pasa a `false` y se registra «Se retiró del portal: motivo» en `ugm_activity`. No vuelve a encenderse solo.

**Indicadores calculados** (SI4, EC4, EC8, TR4, ED1, ED2, GD1): no se capturan ni se publican a mano. La vista los calcula solo cuando **todos** sus datos de entrada están publicados y los retira cuando alguno deja de estarlo. TR4 se calcula con la tabla de 5.9 y la población, porque 5.10 no tiene plantilla. La población del campus (1.11 + 1.13) es un dato base del ciclo.

**Sin puntos en la web (decisión 2026-10).** La página pública no muestra puntos posibles, máximos ni estimados, ni pesos (%), ni medidores que los insinúen. Los puntos y pesos existen **solo en la intranet**, para la administración: estiman el avance y ordenan prioridades con la regla de la guía (factor de la opción × puntos del indicador, Apéndice 1). **No se publican porque** (1) el puntaje oficial lo asigna UI GreenMetric tras su revisión, no la universidad (p. 53); (2) una estimación propia publicada puede leerse como un resultado o compararse con otras universidades y contradecir el oficial; (3) los factores dependen de la validación de las evidencias. La web publica en cambio **narrativas** (programas, políticas, iniciativas), **cifras reportadas** con unidad, año y año anterior, **gráficas y tablas** de Datos de Sostenibilidad y **evidencias** publicadas.

**Cómo se expresa el avance sin puntos:** una **regleta de cuadros**, uno por indicador de la categoría, que se llena cuando el indicador se publica, junto a «N de M indicadores publicados». Es un inventario, no una escala: no hay porcentaje, ni barra continua, ni umbrales. El conteo "M" es el de indicadores y datos de la categoría (en el prototipo 93 en total, 86 plantillas más 7 calculados).

**Vista y RPC pública (sin datos personales):**
- `ugm_publico_resumen(ciclo)`: por categoría, `{categoria, publicados, total, graficas, tablas, evidencias_publicas, actualizado_at}` y un total. **No devuelve puntos ni pesos.** Es `security definer`, con `search_path` fijo, `grant execute` a `anon` y `authenticated`.
- `ugm_publico_categoria(ciclo, categoria, idioma)`: los indicadores publicados con `{q, indicador, nombre_es, nombre_en, valor, unidad, anio, valor_anio_anterior, descripcion (es|en), graficas[], tablas[], evidencias[], calculado}`. Para los indicadores de escala se entrega la frase de la opción elegida, no el número de nivel (que se leería como puntaje).
- `ugm_publico_evidencia(ciclo, q)`: la hoja de un indicador.
- **Lo que nunca sale:** borradores, comentarios, devoluciones, bitácora, `updated_by`, nombres, correos o unidades de las personas, nombres internos de archivos, versiones no publicadas, traducciones sin revisar. La descripción pública es la versión revisada en el idioma pedido; si falta la inglesa, no se publica el indicador.
- Las evidencias públicas se entregan como etiquetas («Documento de soporte 1», «PDF ≤ 2 MB · en inglés») o enlaces https públicos; los archivos privados se sirven por una URL firmada y solo si el indicador está publicado.
- **Edición/ciclo:** `ranking_cycles` con `ranking = 'ui-greenmetric'`. El selector de edición lista los ciclos con `estado` abierto o cerrado que tengan algo publicado; un ciclo sin nada publicado muestra el estado vacío.
- **Actualización en vivo:** la página lee la RPC con TanStack Query y se invalida con un canal de Realtime sobre `ugm_publico_version` (una fila que sube cuando algo se publica o retira) o, más simple, por intervalo de 60 s. La transición (cifras, medidores, aviso «actualizado hace…») es la del prototipo.

### G.4 Integración con el CMS y con las tarjetas del portal

- **Bloque «Ranking» del CMS (`admin/cms/bloques.ts`).** Un bloque nuevo `ranking` con campos `ranking` (green | impact), `edicion`, `modo` (pared | avance | cifras) y `categorias` (todas o un subconjunto). Muestra la pared de carteles o el avance en cualquier página que el equipo arme. Usa el mismo `RankingPortal` en modo compacto y la misma RPC. Tiene que pasar `bloques.test.ts` (valor de partida válido, grupo y movimiento válidos).
- **`SostenibleCms`** ya envuelve `/sostenible/:ranking`; con página publicada en el CMS manda el CMS y sin ella cae a la página fija. El bloque permite que `/sostenible/green` sea una página del CMS con el bloque `ranking` más texto editorial.
- **Tarjetas de `/sostenible` (`SostenibleHome`, `RANKINGS.map`):** la tarjeta de UI GreenMetric deja las cifras fijas y muestra «n de 93 publicados» y la fecha de última actualización de la RPC resumen. Los puntajes y puestos de muestra se quitan; no se muestra ningún puntaje.
- **`RankingsAdmin`** (tarjeta «UI GreenMetric» con datos ilustrativos): se conecta a la nueva sección Publicación.

### G.5 SEO y compartir

- `<title>` y descripción propios por vista: «UI GreenMetric 2026 · UDES Sostenible», «Energía y cambio climático · UI GreenMetric 2026», «Evidence 1.10 · …». Idioma en `lang` y `hreflang` es/en (`?lang=en`).
- Etiquetas Open Graph y Twitter con título, descripción y una imagen generada (cartel de la categoría) para compartir.
- La aplicación es una SPA: para que los buscadores y los modelos de lenguaje lean el contenido, la página de evidencia y el resumen de la categoría necesitan HTML pre-renderizado o un prerender en el borde (la página de evidencia de THE tiene el mismo requisito, porque la lee un modelo de lenguaje). Datos estructurados `Dataset` o `Report` con la fecha de actualización.
- `robots`: la hoja de evidencia se indexa; el panel de la intranet no. Ninguna URL pública contiene ids de respuesta ni de personas.
- `sitemap.xml` con las siete categorías y los indicadores publicados.

### G.6 Privacidad y seguridad (regla visible en el prototipo)

El prototipo la dice en tres sitios: el bloque «Regla de publicación» de la portada pública, el panel «Regla de privacidad» de la vista previa de la intranet y la línea bajo el interruptor de cada indicador. En términos técnicos:
1. La web pública lee solo funciones `ugm_publico_*`; el rol `anon` no tiene acceso a ninguna tabla `ugm_*` ni a `ranking_*`.
2. Esas funciones devuelven agregados y textos revisados; no hay columna de persona ni de unidad en el resultado.
3. Los textos libres pasan por la revisión humana, pero un responsable puede escribir un nombre propio o un dato personal en la narrativa. El paso de revisión incluye la comprobación «sin datos personales» y existe la marca de dato sensible. Se recomienda un aviso automático (correos, números de documento) antes de aprobar.
4. Retirar es inmediato: la vista deja de entregar el indicador y la caché pública se invalida.

### G.7 Decisiones que necesita del usuario (máximo 6)

1. **¿La página nueva reemplaza a la actual de `/sostenible/green` o convive?** *Recomendación:* reemplaza el contenido de UIGM y deja THE World y Times como están; la página actual de UIGM tiene cifras de muestra que contradicen la guía 2026.
2. **¿Qué se muestra mientras faltan indicadores?** *Recomendación:* solo «N de M indicadores publicados» con la regleta de cuadros, sin puntos, sin pesos y sin puesto. El puesto se publica cuando UI entregue resultados.
3. **¿Quién enciende «Publicar en la web»?** *Recomendación:* solo la administradora del ranking. El revisor aprueba; no publica.
4. **¿Se publican las descripciones en español, en inglés o en ambos?** *Recomendación:* ambos, y un indicador sin traducción revisada no se publica (regla ya implementada en el prototipo).
5. **¿Qué datos se consideran sensibles por defecto?** *Recomendación:* los de 7.14 (políticas de protección de datos) y 7.19 (canales de denuncia), más cualquiera que la administradora marque.
6. **¿Edición 2026 o 2027 como primera edición pública?** Depende de la decisión 1 de la sección F. *Recomendación:* publicar la edición que se esté reportando y dejar la anterior como «no cargada» hasta que haya datos reales.


### G.8 Datos, gráficas y tablas desde Datos de Sostenibilidad

Fuentes leídas: `src/modules/datos-sostenibilidad/README.md` y las migraciones 0202, 0204, 0205, 0206 y 0207. «Datos de Sostenibilidad» es una unidad de UDrive con carpetas; las tablas y gráficas viven allí; las gráficas se publican por sección (`sos_publicaciones`) y la web pública solo lee lo publicado y agregado (`sos_graficas_publicas()`, `sos_cifras_publicas()`).

**Qué se conecta.** Cada campo numérico de un indicador puede salir de una tabla de la unidad. El prototipo lo muestra en la captura, en la sección «Datos y gráficas»:
- **Elegir una tabla de Datos de Sostenibilidad:** selector con vista previa; se elige el campo del indicador, la columna numérica (nunca una marcada sensible), cómo se junta (suma, promedio, último valor) y el año (último, anterior, dos atrás).
- **Crear tabla nueva** (en la carpeta que se elija) y **Crear gráfica con esta tabla** (barras o líneas, eje X y Y, sumar los nombres repetidos, filtrar por rango de años). Es la misma lógica de 0207 (agrupar y filtrar por fecha).
- **Conectado frente a escrito a mano**, con indicación de cuál manda: «Manda la tabla» (el campo queda de solo lectura y se recalcula si la tabla cambia) o «Manda lo escrito a mano» (muestra lo que daría la tabla y ofrece «Usar la de la tabla»). Esto reutiliza el vínculo `sos_vinculos` de 0202 y 0206 (`valor`, `periodo`, filtro por valor); el campo del indicador pasa a leer ese vínculo.

**Qué se publica.** La página del indicador dibuja las gráficas y tablas **publicadas** y agregadas (la gráfica con su configuración mínima y máximo 500 filas, la tabla sin columnas sensibles), con el pie «Fuente: Datos de Sostenibilidad · actualizado …». El navegador no recibe filas de libros en borrador.

**Reglas de publicación nuevas.**
- Si un campo está conectado a una tabla que **no está publicada**, el indicador no sale (motivo «Tabla sin publicar en Datos de Sostenibilidad»). El valor que se mostraría es un agregado de esa tabla y no puede salir de una fuente privada.
- Si el indicador sale pero su **gráfica** no está publicada, el indicador se publica sin ella y el panel «Publicación» de la intranet lo lista en «Salen incompletos». Es una decisión (la alternativa es bloquear el indicador).
- Las columnas sensibles (p. ej. un documento de identidad) no se pueden usar en una gráfica ni conectar, y nunca se publican.
- Publicar una tabla o gráfica se hace en Datos de Sostenibilidad («Publicar en el portal»); el prototipo deja probar el interruptor para ver el efecto.

**Modelo.** `ugm_datos_vinculos (response_id, campo, archivo_id → drive_archivos, columna, agregacion, anio, modo conectado|manual)` y `ugm_datos_graficas (response_id, archivo_id)`; ambos por id de archivo. La RPC pública resuelve el vínculo con las funciones de 0202.

---

## H. Evidencias en UDrive, dentro de Datos de Sostenibilidad

Esta sección **corrige** lo que el análisis proponía antes (reutilizar `ranking_evidence` y su bucket de 15 MB): para UIGM la evidencia vive en UDrive.

### H.1 Estructura de carpetas (creada sola)

```
Datos de Sostenibilidad › UI GreenMetric › Edición 2026 ›
  1_Setting_and_Infrastructure_SI › 1_10_Total_area_on_campus_covered_in_planted_vegetation › 1_10_mapa-zonas-verdes_2025.pdf
  2_Energy_and_Climate_Change_EC › …   (… hasta 7_Governance_and_Digitalization)
```
Los nombres de categoría y de pregunta son los de las plantillas (`d.f` sin el prefijo `University_Country_`). Se crean:
1. **Al crear el ciclo:** la edición, las 7 categorías y las 86 carpetas de pregunta, con lectura abierta heredada de la unidad. Queda en la bitácora.
2. **Al asignar:** si falta la carpeta de la pregunta, se crea; y el sistema **otorga al responsable el papel «Crea»** en ella (papeles de UDrive: lector, editor, creador = «Crea», admin = «Administra»; 0191). Reasignar retira el papel al anterior y lo da al nuevo.

### H.2 Subida desde la captura
- Arrastrar y soltar (o elegir). Antes de guardar, una ventana muestra el **destino** (la carpeta), el nombre normalizado y la validación de cada archivo.
- **Nombre normalizado:** `<pregunta>_<descripción>_<año>.<ext>`, por ejemplo `1_10_mapa-zonas-verdes_2025.pdf` (sin acentos ni espacios; compatible con la restricción de 0205: `[A-Za-z0-9._-]{1,150}`).
- **Validación (guía p. 52):** PDF y máximo 2 MB y en inglés. PDF mayor de 2 MB: aviso, se comprime al exportar. No PDF (imagen, Word, Excel): se acepta como material de trabajo y se convierte al exportar. Documento en español: aviso («la guía pide inglés»). Formatos no admitidos (.exe): se rechazan. El idioma lo declara quien sube; no se detecta.
- **Botón «Abrir carpeta en Datos de Sostenibilidad»:** abre la carpeta en el explorador de UDrive acotado a la unidad (`/admin/datos-sostenibilidad`), con la ruta y la cuota.
- **Ruta de Storage (0191 y 0205):** `unidades/<unidad_id>/<archivo_id>/<nombre>`. La unidad la fija el disparador desde la carpeta; el cliente no la manda.

### H.3 Quién ve y quién edita
- **Lectura abierta de la unidad** (`lectura_abierta`, 0202): cualquier persona con acceso a Datos de Sostenibilidad ve las carpetas.
- **Responsable del indicador:** papel «Crea» en la carpeta de su pregunta (lo otorga la asignación). Sube, reemplaza y quita en su carpeta; no toca las demás.
- **Administradora del ranking:** «Administra» en la unidad.
- **Revisor:** solo ve (la lectura abierta alcanza).
- El rango dentro de la unidad sale solo del papel; la autoría de una subcarpeta no da propiedad (0191).

### H.4 Vínculo evidencia ↔ respuesta por id de archivo
`ugm_evidencias.archivo_id → drive_archivos(id)`. No hay copia: reemplazar el archivo en UDrive (versión nueva) actualiza la hoja de evidencia, el paquete y la web. Quitar un archivo lo manda a la papelera; el vínculo queda huérfano y la respuesta pierde esa evidencia (el panel «Publicación» lo detecta: sin evidencia, no sale).

### H.5 Qué evidencias se publican
- Solo las que la administradora marca «En la web»; por defecto ninguna.
- Cada una recibe una **URL pública estable derivada del id** (`/sostenible/green/archivo/<id>`) que no cambia al reemplazar el archivo. Se sirve por URL firmada de corta vida.
- **Advertencia de la guía (p. 52):** si la evidencia es un enlace, debe ser de acceso público. Al marcar una evidencia como pública, el prototipo avisa que cualquiera podrá abrirla y que hay que revisar que no tenga datos personales.
- Un indicador sin ninguna evidencia pública se publica con la frase «La evidencia la conserva la universidad y se entrega a UI GreenMetric en su revisión» y el panel lo lista.
- La página pública muestra etiquetas («Documento de soporte 1», «PDF ≤ 2 MB · en inglés»), nunca el nombre original del archivo.

### H.6 Exportación e importación
- **Exportación:** el paquete `.zip` por categoría se arma **leyendo las carpetas** de UDrive (sección E.2); el árbol del prototipo lo muestra con su origen.
- **Importación:** la plantilla diligenciada queda como archivo en su carpeta y sus imágenes se guardan como archivos vinculados (sección E.3).

### H.7 Qué pasa con `ranking_evidence` y `ranking_biblioteca`
- `ranking_evidence` y el bucket `ranking-evidencias` **no se tocan** y siguen siendo de THE Impact. UIGM no escribe en ellos.
- `ranking_biblioteca` se reutiliza **solo como índice** (texto leído y propuestas de Pilo). «Desde la biblioteca» copia el archivo a la carpeta de la pregunta en UDrive.
- No se migra nada de lo existente: UIGM no tiene evidencias previas en el módulo.

### H.8 Cambios en el modelo `ugm_` y riesgos
- **Cambia:** `ugm_evidence_links` pasa a `ugm_evidencias` con `archivo_id` (FK a `drive_archivos`); se agregan `ugm_datos_vinculos` y `ugm_datos_graficas`; `ugm_cycle_config` guarda `carpeta_raiz` (id de la carpeta de la edición en UDrive); `ugm_questions` guarda `carpeta_nombre`. `ugm_exports.manifiesto` lista ids de archivo y versión.
- **Cuota:** 5 GB por unidad (0191, editable), compartida con tablas y gráficas. Se comprueba al subir; el panel de la carpeta muestra el uso.
- **Permisos por carpeta:** asignar y reasignar deben otorgar y retirar «Crea»; un error deja a alguien sin poder subir o con acceso de más.
- **Borrado:** la papelera de UDrive conserva 30 días; una evidencia publicada y borrada rompe su enlace público.
- **Dependencia:** UIGM depende de que 0191, 0202 y 0205 estén aplicadas.
- **Datos personales en PDF públicos:** la revisión humana es la única barrera; el aviso de publicación lo recuerda.

### H.9 Decisiones que cambian
- La decisión 2 de la sección F ya no es «reutilizar `ranking_evidence`»; es «la evidencia va a UDrive».
- Se suma a la decisión 2 de G.7: **¿una gráfica sin publicar bloquea el indicador?** *Recomendación:* no, que salga sin ella y se avise en el panel (así una gráfica pendiente no retrasa una cifra ya aprobada); sí bloquea cuando la que no está publicada es la tabla de la que sale el valor.
