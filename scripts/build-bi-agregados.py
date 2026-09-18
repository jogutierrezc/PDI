# =============================================================================
# Agregados de Diversidad, Equidad e Inclusión y de Bienestar Institucional.
#
# Lee los microdatos de bi/ (que NUNCA salen de la máquina de quien reporta:
# la carpeta está en .gitignore) y escribe solo conteos agregados en dos sitios:
#  · supabase/migrations/0041_diversidad_y_bienestar.sql, que es lo que consume
#    el portal (lee de Supabase, no del seed);
#  · scripts/fixtures/dei-agregados.ts, constancia versionada de lo publicado,
#    que existe porque los microdatos de origen no se versionan.
#
# Los microdatos traen nombre, correo, código de estudiante, lugar de
# nacimiento y, en la caracterización, datos sensibles en el sentido del
# artículo 5 de la Ley 1581 de 2012 (salud, orientación sexual, consumo).
# Nada de eso cruza esta frontera: de aquí solo salen números.
#
# Reglas aplicadas, todas decididas por Planeación:
#  · Reserva estadística: toda celda con menos de MIN_CELDA registros se
#    publica como reservada ("< 5"), no como su número. Los totales por
#    categoría y el total institucional siguen siendo exactos.
#  · Bogotá se suma a Bucaramanga, con nota aclaratoria (la sede de Bogotá
#    no es un campus del portal).
#  · Tres vacíos distintos y con sentido distinto: "No aplica" sale de la base
#    de cálculo, "No registra" es vacío de captura, "No informa" es una
#    categoría propia porque es una decisión de la persona.
#  · Pertenencia étnica en dos niveles: el grupo (DANE) y, debajo, el pueblo
#    con su nombre propio. Nadie termina en "Otros".
#
# Va en Python y no en .mjs como el resto de scripts/ por una razón concreta:
# read-excel-file devuelve 1 fila en estos libros (formato del exportador del
# sistema académico), mientras que openpyxl los lee completos y en streaming,
# que es lo que permite recorrer 97.180 filas sin cargarlas en memoria.
#
# Ejecutar con: python scripts/build-bi-agregados.py
# =============================================================================

import collections
import datetime as dt
import pathlib
import sys
import unicodedata

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
FUENTE = ROOT / "bi"
SALIDA = ROOT / "scripts" / "fixtures" / "dei-agregados.ts"

MIN_CELDA = 5
ANIOS = [2021, 2022, 2023, 2024, 2025]
# Cada año se lee en su segundo periodo, igual que la matrícula del informe
# Poblacional. 2026-1 existe en la fuente pero el año no ha cerrado.
PERIODOS = {a: f"{a}-2" for a in ANIOS}

CAMPUS = {
    "BUCARAMANGA": "bucaramanga",
    "BOGOTA": "bucaramanga",  # sede de Bogotá, adscrita a Bucaramanga
    "CUCUTA": "cucuta",
    "VALLEDUPAR": "valledupar",
}
SEDES = ["bucaramanga", "cucuta", "valledupar"]

NO_DATO = {"NO REGISTRA", ""}
NO_APLICA = {"NO APLICA"}
NO_INFORMA = {"NO INFORMA"}
NEGATIVO = {"NO", "NO PERTENECE"}


def plano(valor):
    """Sin tildes y en mayúsculas, para comparar sin depender del encoding."""
    if valor is None:
        return ""
    texto = str(valor).strip().upper()
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def titulo(valor):
    """'DISCAPACIDAD SENSORIAL-BAJA VISIÓN' -> 'Sensorial · baja visión'."""
    texto = str(valor).strip()
    texto = texto.replace("DISCAPACIDAD ", "").replace("-", " · ")
    return texto.capitalize() if texto.isupper() else texto


# --- lectura -----------------------------------------------------------------

def columnas(hoja):
    cabecera = next(hoja.iter_rows(values_only=True))
    return {plano(h): i for i, h in enumerate(cabecera) if h is not None}


def leer_heterogeneidad():
    ruta = FUENTE / "Heterogenidad social.xlsx"
    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = libro.worksheets[0]
    filas = hoja.iter_rows(values_only=True)
    cab = next(filas)
    col = {plano(h): i for i, h in enumerate(cab) if h is not None}

    need = [
        "PERIODO", "CAMPUS", "GENERO", "ESTRATO", "ZONA DE RESIDENCIA",
        "TIPO DE DISCAPACIDAD", "PERTENECE A COMUNIDAD NEGRA",
        "PERTENECE A PUEBLO INDIGENA", "AFECTADO POR LA VIOLENCIA",
        "PERTENECE GRUPO ESPECIAL",
    ]
    faltan = [n for n in need if n not in col]
    if faltan:
        sys.exit(f"Faltan columnas en {ruta.name}: {faltan}")

    inverso = {v: k for k, v in PERIODOS.items()}
    registros = []
    bogota = 0
    for fila in filas:
        periodo = plano(fila[col["PERIODO"]])
        anio = inverso.get(periodo)
        if anio is None:
            continue
        bruto = plano(fila[col["CAMPUS"]])
        sede = CAMPUS.get(bruto)
        if sede is None:
            continue
        if bruto == "BOGOTA":
            bogota += 1
        registros.append({
            "anio": anio,
            "sede": sede,
            "genero": str(fila[col["GENERO"]] or "").strip(),
            "estrato": str(fila[col["ESTRATO"]] or "").strip(),
            "zona": str(fila[col["ZONA DE RESIDENCIA"]] or "").strip(),
            "discapacidad": str(fila[col["TIPO DE DISCAPACIDAD"]] or "").strip(),
            "negra": str(fila[col["PERTENECE A COMUNIDAD NEGRA"]] or "").strip(),
            "indigena": str(fila[col["PERTENECE A PUEBLO INDIGENA"]] or "").strip(),
            "violencia": str(fila[col["AFECTADO POR LA VIOLENCIA"]] or "").strip(),
            "especial": str(fila[col["PERTENECE GRUPO ESPECIAL"]] or "").strip(),
        })
    libro.close()
    return registros, bogota


# --- caracterización estudiantil (Bienestar) ----------------------------------
#
# Ojo: esto es una ENCUESTA de 6.657 respuestas, no el censo de la matrícula.
# Todo lo que salga de aquí se publica como porcentaje de quienes respondieron
# y se rotula como caracterización, nunca como cifra institucional.
#
# De las 118 columnas solo se leen las de servicios y apoyos. Las de salud,
# orientación sexual, vida sexual, consumo de sustancias y violencia familiar
# no se agregan ni se publican: son datos sensibles del artículo 5 de la Ley
# 1581 de 2012 y el portal no tiene por qué tocarlos.
BI_ANIOS = [2022, 2023, 2024, 2025]

BI_COLUMNAS = {
    "actividad": "REALIZA ACTIVIDAD FISICA?",
    "frecuencia": "SI SU RESPUESTA ANTERIOR FUE SI, CUANTAS VECES A LA SEMANA LO PRACTICA?",
    "deporte": "PRACTICA ALGUN DEPORTE?",
    "arte": "CUENTA CON ALGUNA HABILIDAD ARTISTICA?",
    "disciplina": "CUALES DE LAS SIGUIENTES DISCIPLINAS ARTISTICAS LE ATRAE?",
    "primera": "USTED ES EL PRIMERO EN SU FAMILIA INMEDIATA EN ASISTIR A LA UNIVERSIDAD?",
    "matricula": "QUIEN CUBRE SUS GASTOS DE MATRICULA?",
}

# "Si" y "Sí" son la misma respuesta escrita de dos maneras; se unifican por su
# forma sin tildes y se publican con la ortografía correcta.
CANON = {
    "SI": "Sí",
    "NO": "No",
    "A VECES": "A veces",
    "1 A 2 VECES": "1 a 2 veces",
    "3 A 4 VECES": "3 a 4 veces",
    "MAS DE 5 VECES": "Más de 5 veces",
}


def canon(valor):
    p = plano(valor)
    if p in CANON:
        return CANON[p]
    texto = str(valor).strip()
    return texto[:1].upper() + texto[1:] if texto else ""


def leer_caracterizacion():
    ruta = FUENTE / "caracterizacion multicampus.xlsx"
    if not ruta.exists():
        return [], {}
    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = libro.worksheets[0]
    filas = hoja.iter_rows(values_only=True)
    cab = list(next(filas))
    indice = {}
    for clave, buscado in BI_COLUMNAS.items():
        for i, h in enumerate(cab):
            if h is not None and plano(h).replace("¿", "").strip().startswith(plano(buscado)[:40]):
                indice[clave] = i
                break
    i_campus = next((i for i, h in enumerate(cab) if plano(h) == "CAMPUS"), None)
    i_periodo = next((i for i, h in enumerate(cab) if plano(h) == "PERIODO"), None)

    registros = []
    for fila in filas:
        if all(c is None for c in fila):
            continue
        periodo = str(fila[i_periodo] or "").strip() if i_periodo is not None else ""
        anio = int(periodo[:4]) if periodo[:4].isdigit() else None
        if anio not in BI_ANIOS:
            continue
        sede = CAMPUS.get(plano(fila[i_campus])) if i_campus is not None else None
        if sede is None:
            continue
        registros.append({
            "anio": anio,
            "sede": sede,
            **{c: (str(fila[indice[c]] or "").strip() if c in indice else "") for c in BI_COLUMNAS},
        })
    libro.close()
    return registros, indice


def leer_ines():
    ruta = FUENTE / "INES.xlsx"
    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = libro.worksheets[0]
    filas = hoja.iter_rows(values_only=True)
    cab = list(next(filas))

    # Las 25 preguntas vienen rotuladas "<factor>.<n> <enunciado>".
    preguntas = []
    for i, h in enumerate(cab):
        if h is None:
            continue
        texto = str(h).strip()
        cabeza = texto.split(" ")[0]
        if "." in cabeza and cabeza.split(".")[0].isdigit():
            factor, sub = cabeza.split(".")[:2]
            preguntas.append({"col": i, "factor": int(factor), "sub": int(sub), "texto": texto})

    idx_grupo = next((i for i, h in enumerate(cab) if plano(h) == "GRUPO DE INTERES"), None)
    idx_anio = next((i for i, h in enumerate(cab) if plano(h) == "ANO"), None)

    respuestas = []
    for fila in filas:
        if all(c is None for c in fila):
            continue
        respuestas.append({
            "grupo": str(fila[idx_grupo] or "").strip() if idx_grupo is not None else "",
            "anio": str(fila[idx_anio] or "").strip() if idx_anio is not None else "",
            "valores": {p["col"]: plano(fila[p["col"]]) for p in preguntas},
        })
    libro.close()
    return preguntas, respuestas


# --- puntuación del INES ------------------------------------------------------

# Tres escalas, cada una normalizada a 0-100. "No sabe" no puntúa: sale de la
# base y se reporta aparte como cobertura, porque desconocer una política no es
# lo mismo que afirmar que no existe.
ESCALA = {
    "EXISTE Y SE IMPLEMENTA": 100.0,
    "EXISTE Y NO SE IMPLEMENTA": 50.0,
    "NO EXISTE": 0.0,
    "SIEMPRE": 100.0,
    "ALGUNAS VECES": 50.0,
    "NUNCA": 0.0,
    "SI": 100.0,
    "NO": 0.0,
}
NO_SABE = "NO SABE"

FACTORES = {
    1: "Misión y proyecto institucional",
    2: "Estudiantes",
    3: "Profesores",
    4: "Procesos académicos",
    5: "Visibilidad nacional e internacional",
    6: "Investigación y creación artística",
    7: "Pertinencia e impacto social",
    8: "Autoevaluación y autorregulación",
    9: "Organización, administración y gestión",
    10: "Planta física y recursos de apoyo",
    11: "Bienestar institucional",
    12: "Recursos financieros",
}


def puntuar(preguntas, respuestas, filtro=None):
    """Media por factor (0-100) y proporción de 'No sabe'."""
    suma = collections.defaultdict(float)
    base = collections.Counter()
    nosabe = collections.Counter()
    total = collections.Counter()
    for r in respuestas:
        if filtro and not filtro(r):
            continue
        for p in preguntas:
            v = r["valores"].get(p["col"], "")
            if not v or v == "(VACIO)":
                continue
            total[p["factor"]] += 1
            if v == NO_SABE:
                nosabe[p["factor"]] += 1
                continue
            if v in ESCALA:
                suma[p["factor"]] += ESCALA[v]
                base[p["factor"]] += 1
    out = {}
    for f in FACTORES:
        if base[f] == 0:
            out[f] = {"puntaje": None, "nosabe": None, "base": 0}
        else:
            out[f] = {
                "puntaje": round(suma[f] / base[f], 1),
                "nosabe": round(100.0 * nosabe[f] / total[f], 1) if total[f] else None,
                "base": base[f],
            }
    return out


# --- agregación de heterogeneidad ---------------------------------------------

def reservar(n):
    """Devuelve (valor, reservado). Una celda pequeña señala a una persona."""
    if n == 0:
        return 0, False
    if n < MIN_CELDA:
        return None, True
    return n, False


def conteo_por_sede(registros, predicado, anios=None):
    """{año: {sede: n, 'todas': n}} con el total exacto y las sedes reservadas."""
    anios = anios or ANIOS
    crudo = collections.Counter()
    for r in registros:
        if predicado(r):
            crudo[(r["anio"], r["sede"])] += 1
    valores = {}
    for anio in anios:
        celda = {}
        total = 0
        for sede in SEDES:
            n = crudo[(anio, sede)]
            total += n
            valor, _ = reservar(n)
            celda[sede] = valor
        celda["todas"] = total
        valores[anio] = celda
    return valores


def tasa_por_sede(registros, numerador, denominador, anios=None):
    """Porcentaje: el total se reporta, no se suma."""
    anios = anios or ANIOS
    num = collections.Counter()
    den = collections.Counter()
    for r in registros:
        if not denominador(r):
            continue
        den[(r["anio"], r["sede"])] += 1
        den[(r["anio"], "todas")] += 1
        if numerador(r):
            num[(r["anio"], r["sede"])] += 1
            num[(r["anio"], "todas")] += 1
    valores = {}
    for anio in anios:
        celda = {}
        for sede in SEDES + ["todas"]:
            d = den[(anio, sede)]
            celda[sede] = round(100.0 * num[(anio, sede)] / d, 1) if d else None
        valores[anio] = celda
    return valores


def desglose(registros, clave, etiquetar, incluir, anios=None, multiple=False):
    """{año: [{label, value, reserved}]} ordenado por el total del periodo."""
    anios = anios or ANIOS
    crudo = collections.Counter()
    for r in registros:
        v = r[clave]
        if not incluir(v):
            continue
        # Multirespuesta ("Música;Danzas;"): cada opción cuenta una vez, así que
        # las partes suman más que las personas y el desglose no es un reparto.
        for parte in (p for p in str(v).split(";") if p.strip()) if multiple else [v]:
            if not incluir(parte):
                continue
            crudo[(r["anio"], etiquetar(parte))] += 1
    etiquetas = sorted({k for _, k in crudo}, key=lambda e: -sum(crudo[(a, e)] for a in anios))
    return etiquetas, {
        anio: [
            {"label": e, **dict(zip(("value", "reserved"), reservar(crudo[(anio, e)])))}
            for e in etiquetas
        ]
        for anio in anios
    }


# --- emisión ------------------------------------------------------------------

def ts(valor):
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return repr(valor)
    return '"' + str(valor).replace("\\", "\\\\").replace('"', '\\"') + '"'


def emitir_valores(valores, anios=None):
    filas = []
    for anio in anios or ANIOS:
        celda = valores[anio]
        partes = ", ".join(f"{k}: {ts(v)}" for k, v in celda.items())
        filas.append(f"    {anio}: {{ {partes} }},")
    return "\n".join(filas)


def emitir_desglose(etiquetas, por_anio, anios=None):
    filas = []
    for anio in anios or ANIOS:
        items = ", ".join(
            "{ label: %s, value: %s%s }"
            % (ts(i["label"]), ts(i["value"]), ", reserved: true" if i["reserved"] else "")
            for i in por_anio[anio]
        )
        filas.append(f"    {anio}: [{items}],")
    return "\n".join(filas)


# --- migración SQL ------------------------------------------------------------
#
# El portal lee de Supabase, no del seed: para que los dos informes existan hay
# que emitir su migración. Se enlaza todo por claves legibles (etiqueta del
# periodo, slug del informe, clave del indicador, slug del campus), así que
# ejecutarla dos veces actualiza en vez de duplicar.

PERIODO_SQL = "2020-2025"
MIGRACION = ROOT / "supabase" / "migrations" / "0041_diversidad_y_bienestar.sql"

OFICINA_DEI = "Admisiones y Registro Académico"
OFICINA_INES = "Aseguramiento de la Calidad"
OFICINA_BI = "Bienestar Universitario"

# Metadatos editoriales de los dos informes. Se editan aquí.
INFORMES = {
    "diversidad-equidad-inclusion": {
        "code": "DE",
        "name": "Diversidad, Equidad e Inclusión",
        "line": 10,
        "position": 10,
        "summary": "Quiénes integran los grupos de protección constitucional y cómo los reconoce la universidad.",
        "description": (
            "Estudiantes con pertenencia étnica, con discapacidad, afectados por el conflicto armado, "
            "de zona rural y de los estratos más bajos, contados campus a campus en el segundo periodo "
            "de cada año, junto con el Índice de Inclusión para la Educación Superior (INES) del "
            "Ministerio de Educación Nacional."
        ),
        "note": (
            "Las categorías con menos de 5 registros se publican como «< 5»: en un campus pequeño, "
            "la cifra exacta señalaría a personas concretas. Los totales siguen siendo exactos. "
            "La sede de Bogotá se cuenta dentro de Bucaramanga."
        ),
    },
    "bienestar-institucional": {
        "code": "BI",
        "name": "Bienestar Institucional",
        "line": 11,
        "position": 11,
        "summary": "Qué servicios de bienestar usan los estudiantes y quién paga la matrícula.",
        "description": (
            "Cobertura de los servicios de deporte, actividad física y formación artística, y origen "
            "de la financiación de la matrícula, según la caracterización estudiantil multicampus."
        ),
        "note": (
            "Estas cifras salen de una encuesta de caracterización, no de la matrícula: la base de "
            "cada porcentaje es quien respondió ese año. Lo que mide permanencia y acompañamiento "
            "académico vive en el informe Permanencia y no se repite aquí."
        ),
    },
}


def q(texto):
    """Literal SQL."""
    return "'" + str(texto).replace("'", "''") + "'"


def ref_informe(slug):
    return (
        f"(select id from public.od_reports where slug = {q(slug)} "
        f"and period_id = (select id from public.od_periods where label = {q(PERIODO_SQL)}))"
    )


def sql_indicador(slug, clave, meta, valores, anios, agregacion, regla, term):
    """Indicador con sus valores. Las tasas guardan además el total institucional."""
    out = [
        "insert into public.od_indicators",
        "  (report_id, key, label, unit, format, direction, aggregation, annual_rule, years, definition, office_id,"
        "   position, is_kpi, kpi_position, is_headline)",
        f"values ({ref_informe(slug)}, {q(clave)}, {q(meta['label'])}, {q(meta['unit'])}, {q(meta['format'])},"
        f" {q(meta['direction'])}, {q(agregacion)}, {q(regla)}, "
        f"'{{{','.join(str(a) for a in anios)}}}'::smallint[], {q(meta['definition'])},"
        f" (select id from public.od_offices where name = {q(meta['office'])}), {meta['position']},"
        f" {str(meta.get('kpi', False)).lower()}, {meta.get('kpi_position', 'null')},"
        f" {str(meta.get('headline', False)).lower()})",
        "on conflict (report_id, key) do update",
        "  set label = excluded.label, unit = excluded.unit, format = excluded.format,",
        "      direction = excluded.direction, aggregation = excluded.aggregation,",
        "      annual_rule = excluded.annual_rule, years = excluded.years,",
        "      definition = excluded.definition, office_id = excluded.office_id,",
        "      position = excluded.position, is_kpi = excluded.is_kpi,",
        "      kpi_position = excluded.kpi_position, is_headline = excluded.is_headline;",
        "",
    ]
    ref_ind = (
        f"(select id from public.od_indicators where key = {q(clave)} and report_id = {ref_informe(slug)})"
    )
    filas = []
    for anio in anios:
        celda = valores[anio]
        for sede in SEDES:
            v = celda.get(sede)
            filas.append(
                f"  ({ref_ind}, {anio}, {q(term)},"
                f" (select id from public.campuses where slug = {q(sede)}),"
                f" {'null' if v is None else v})"
            )
        if agregacion == "reportado":
            v = celda.get("todas")
            filas.append(f"  ({ref_ind}, {anio}, {q(term)}, null, {'null' if v is None else v})")
    if filas:
        out.append("insert into public.od_values (indicator_id, year, term, campus_id, value) values")
        out.append(",\n".join(filas))
        # Por nombre de restricción, no por lista de columnas: el índice es
        # `nulls not distinct` y Postgres no lo infiere desde las columnas.
        out.append("on conflict on constraint od_values_term_unique do update set value = excluded.value;")
        out.append("")
    return out


def sql_desglose(slug, clave, meta, etiquetas, por_anio, anios, term):
    ref = f"(select id from public.od_breakdowns where key = {q(clave)} and report_id = {ref_informe(slug)})"
    out = [
        "insert into public.od_breakdowns",
        "  (report_id, key, title, unit, format, office_id, default_chart, annual_rule, years,"
        "   reserve_threshold, position)",
        f"values ({ref_informe(slug)}, {q(clave)}, {q(meta['title'])}, {q(meta['unit'])}, {q(meta['format'])},"
        f" (select id from public.od_offices where name = {q(meta['office'])}), {q(meta['chart'])},"
        f" 'reportado', '{{{','.join(str(a) for a in anios)}}}'::smallint[],"
        f" {meta.get('reserve') or 'null'}, {meta['position']})",
        "on conflict (report_id, key) do update",
        "  set title = excluded.title, unit = excluded.unit, format = excluded.format,",
        "      office_id = excluded.office_id, default_chart = excluded.default_chart,",
        "      annual_rule = excluded.annual_rule, years = excluded.years,",
        "      reserve_threshold = excluded.reserve_threshold, position = excluded.position;",
        "",
    ]
    filas = []
    for anio in anios:
        for pos, item in enumerate(por_anio[anio]):
            filas.append(
                f"  ({ref}, {anio}, {q(term)}, {q(item['label'])}, {pos},"
                f" {'null' if item['value'] is None else item['value']},"
                f" {str(bool(item['reserved'])).lower()})"
            )
    if filas:
        out.append(
            "insert into public.od_breakdown_values (breakdown_id, year, term, label, position, value, reserved) values"
        )
        out.append(",\n".join(filas))
        out.append(
            "on conflict on constraint od_breakdown_values_term_unique do update"
            "\n  set value = excluded.value, position = excluded.position, reserved = excluded.reserved;"
        )
        out.append("")
    return out


def sql_mapa_calor(slug, clave, titulo_, descripcion, filas_, columnas_, matriz, oficina, posicion):
    ref = f"(select id from public.od_heatmaps where key = {q(clave)} and report_id = {ref_informe(slug)})"
    out = [
        "insert into public.od_heatmaps",
        "  (report_id, key, title, description, row_label, column_label, rows, columns, unit, format,"
        "   office_id, empty_meaning, position)",
        f"values ({ref_informe(slug)}, {q(clave)}, {q(titulo_)}, {q(descripcion)}, 'Factor', 'Grupo de interés',",
        f"  array[{', '.join(q(f) for f in filas_)}], array[{', '.join(q(c) for c in columnas_)}],",
        f"  'puntos', 'decimal', (select id from public.od_offices where name = {q(oficina)}),",
        f"  'sin respuestas', {posicion})",
        "on conflict (report_id, key) do update",
        "  set title = excluded.title, description = excluded.description, rows = excluded.rows,",
        "      columns = excluded.columns, unit = excluded.unit, format = excluded.format,",
        "      office_id = excluded.office_id, position = excluded.position;",
        "",
    ]
    celdas = [
        f"  ({ref}, {i}, {j}, {'null' if v is None else v})"
        for i, fila in enumerate(matriz)
        for j, v in enumerate(fila)
    ]
    out.append("insert into public.od_heatmap_cells (heatmap_id, row_index, column_index, value) values")
    out.append(",\n".join(celdas))
    out.append("on conflict (heatmap_id, row_index, column_index) do update set value = excluded.value;")
    out.append("")
    return out


def sql_bloques(slug, bloques):
    """Se borran y se vuelven a insertar.

    0029 cambió la restricción de esta tabla por un índice único que incluye
    `section_id` y `settings ->> 'slot'`, así que no hay una lista de columnas
    estable sobre la que hacer `on conflict`. Borrar los bloques del informe y
    volver a escribirlos deja el mismo resultado y no depende de qué índice
    tenga la base en este momento.
    """
    filas = [
        f"  ({ref_informe(slug)}, {q(kind)}, {pos}, true, {q(ajustes)}::jsonb)"
        for pos, (kind, ajustes) in enumerate(bloques, start=1)
    ]
    return [
        f"delete from public.od_report_blocks where report_id = {ref_informe(slug)};",
        "insert into public.od_report_blocks (report_id, kind, position, visible, settings) values",
        ",\n".join(filas) + ";",
        "",
    ]


def main():
    if not FUENTE.exists():
        sys.exit("No existe la carpeta bi/. Es local y no se versiona: pídesela a Planeación.")

    registros, bogota = leer_heterogeneidad()
    preguntas, respuestas = leer_ines()
    print(f"heterogeneidad: {len(registros)} registros en {len(ANIOS)} cortes "
          f"({bogota} de la sede de Bogotá sumados a Bucaramanga)")
    print(f"INES: {len(respuestas)} respuestas, {len(preguntas)} indicadores")

    es_discapacidad = lambda v: plano(v) not in NO_DATO | NO_APLICA | NO_INFORMA
    es_indigena = lambda v: plano(v) not in NO_DATO | NO_APLICA | NO_INFORMA | NEGATIVO
    es_negra = lambda v: plano(v) not in NO_DATO | NO_APLICA | NO_INFORMA | NEGATIVO

    indicadores = {
        "grupo-especial": conteo_por_sede(registros, lambda r: plano(r["especial"]) == "SI"),
        "discapacidad": conteo_por_sede(registros, lambda r: es_discapacidad(r["discapacidad"])),
        "etnico": conteo_por_sede(
            registros, lambda r: es_indigena(r["indigena"]) or es_negra(r["negra"])
        ),
        "victima": conteo_por_sede(registros, lambda r: plano(r["violencia"]) == "SI"),
        "rural": conteo_por_sede(registros, lambda r: plano(r["zona"]) == "RURAL"),
    }
    tasas = {
        "estrato-bajo": tasa_por_sede(
            registros,
            lambda r: r["estrato"] in {"0", "1", "2"},
            lambda r: r["estrato"] not in {"", "NO REGISTRA"},
        ),
        "cobertura-discapacidad": tasa_por_sede(
            registros,
            lambda r: plano(r["discapacidad"]) not in NO_DATO,
            lambda r: True,
        ),
    }

    desgloses = {
        "tipo-discapacidad": desglose(registros, "discapacidad", titulo, es_discapacidad),
        "pueblo-indigena": desglose(registros, "indigena", titulo, es_indigena),
        "comunidad-negra": desglose(registros, "negra", titulo, es_negra),
        "estrato": desglose(
            registros, "estrato", lambda v: f"Estrato {v}", lambda v: v in {"1", "2", "3", "4", "5", "6"}
        ),
        "genero": desglose(registros, "genero", titulo, lambda v: plano(v) not in NO_DATO),
        "zona": desglose(registros, "zona", titulo, lambda v: plano(v) not in NO_DATO),
    }

    # --- Bienestar Institucional: cobertura de servicios, sobre la encuesta ---
    bi, bi_cols = leer_caracterizacion()
    print(f"caracterización: {len(bi)} respuestas en {sorted({r['anio'] for r in bi})} "
          f"({len(bi_cols)}/{len(BI_COLUMNAS)} columnas de servicios halladas)")
    hay = lambda v: plano(v) not in NO_DATO
    si = lambda v: plano(v) == "SI"
    bi_tasas = {
        "actividad-fisica": tasa_por_sede(bi, lambda r: si(r["actividad"]), lambda r: hay(r["actividad"]), BI_ANIOS),
        "practica-deporte": tasa_por_sede(bi, lambda r: si(r["deporte"]), lambda r: hay(r["deporte"]), BI_ANIOS),
        "habilidad-artistica": tasa_por_sede(bi, lambda r: si(r["arte"]), lambda r: hay(r["arte"]), BI_ANIOS),
        "primera-generacion": tasa_por_sede(bi, lambda r: si(r["primera"]), lambda r: hay(r["primera"]), BI_ANIOS),
    }
    bi_desgloses = {
        "actividad-fisica": desglose(bi, "actividad", canon, hay, BI_ANIOS),
        "frecuencia-actividad": desglose(bi, "frecuencia", canon, hay, BI_ANIOS),
        "disciplina-artistica": desglose(bi, "disciplina", canon, hay, BI_ANIOS, multiple=True),
        "financiacion-matricula": desglose(bi, "matricula", canon, hay, BI_ANIOS),
    }
    bi_respuestas = {a: sum(1 for r in bi if r["anio"] == a) for a in BI_ANIOS}

    ines_global = puntuar(preguntas, respuestas)
    ines_grupo = {
        g: puntuar(preguntas, respuestas, lambda r, g=g: r["grupo"] == g)
        for g in sorted({r["grupo"] for r in respuestas if r["grupo"]})
    }
    anios_ines = sorted({r["anio"] for r in respuestas if r["anio"]})
    ines_anio = {
        a: puntuar(preguntas, respuestas, lambda r, a=a: r["anio"] == a) for a in anios_ines
    }

    reservadas = sum(
        1 for _, por_anio in desgloses.values() for anio in ANIOS
        for i in por_anio[anio] if i["reserved"]
    )
    print(f"celdas reservadas por umbral (< {MIN_CELDA}): {reservadas}")

    partes = [
        "/* =============================================================================",
        "   GENERADO por scripts/build-bi-agregados.py — no editar a mano.",
        "   Constancia de lo publicado; el portal lee de Supabase, no de este archivo.",
        "",
        "   Agregados de Diversidad, Equidad e Inclusión. Los microdatos de origen",
        "   viven solo en bi/ (ignorada por git) y no llegan aquí: de allá salen",
        f"   conteos, nunca registros. Celdas con menos de {MIN_CELDA} registros van",
        '   reservadas (reserved: true) y el portal las escribe "< 5".',
        "",
        f"   Fuente: Heterogeneidad social · {len(registros)} registros en los cortes",
        f"   {', '.join(PERIODOS[a] for a in ANIOS)}; INES · {len(respuestas)} respuestas.",
        f"   Generado el {dt.date.today().isoformat()}.",
        "   ========================================================================== */",
        "",
        "export interface DeiItem {",
        "  label: string;",
        "  value: number | null;",
        "  /** La celda existe pero no se publica: menos de 5 registros identifican. */",
        "  reserved?: boolean;",
        "}",
        "",
        "export type DeiValues = Record<number, Record<string, number | null>>;",
        "",
        f"export const DEI_ANIOS = [{', '.join(str(a) for a in ANIOS)}];",
        f"export const DEI_MIN_CELDA = {MIN_CELDA};",
        f"export const DEI_BOGOTA = {bogota};",
        f"export const DEI_CORTES: Record<number, string> = {{ {', '.join(f'{a}: \"{PERIODOS[a]}\"' for a in ANIOS)} }};",
        "",
    ]

    for nombre, valores in list(indicadores.items()) + list(tasas.items()):
        clave = nombre.replace("-", "_")
        partes.append(f"export const dei_{clave}: DeiValues = {{")
        partes.append(emitir_valores(valores))
        partes.append("};")
        partes.append("")

    for nombre, (etiquetas, por_anio) in desgloses.items():
        clave = nombre.replace("-", "_")
        partes.append(f"/** {len(etiquetas)} categorías, ordenadas por volumen del periodo. */")
        partes.append(f"export const dei_desglose_{clave}: Record<number, DeiItem[]> = {{")
        partes.append(emitir_desglose(etiquetas, por_anio))
        partes.append("};")
        partes.append("")

    partes.append("/* --- Bienestar Institucional -----------------------------------------------")
    partes.append("   Porcentajes de la caracterización estudiantil, que es una ENCUESTA: la base")
    partes.append("   es quien respondió ese año, no la matrícula. Se rotula así en la ficha para")
    partes.append("   que nadie lea una cobertura institucional donde hay una muestra. */")
    partes.append("")
    partes.append(f"export const BI_ANIOS = [{', '.join(str(a) for a in BI_ANIOS)}];")
    partes.append(
        "export const BI_RESPUESTAS: Record<number, number> = { "
        + ", ".join(f"{a}: {bi_respuestas[a]}" for a in BI_ANIOS)
        + " };"
    )
    partes.append("")

    for nombre, valores in bi_tasas.items():
        clave = nombre.replace("-", "_")
        partes.append(f"export const bi_{clave}: DeiValues = {{")
        partes.append(emitir_valores(valores, BI_ANIOS))
        partes.append("};")
        partes.append("")

    for nombre, (etiquetas, por_anio) in bi_desgloses.items():
        clave = nombre.replace("-", "_")
        nota = " Multirespuesta: las partes suman más que las personas." if nombre == "disciplina-artistica" else ""
        partes.append(f"/** {len(etiquetas)} categorías.{nota} */")
        partes.append(f"export const bi_desglose_{clave}: Record<number, DeiItem[]> = {{")
        partes.append(emitir_desglose(etiquetas, por_anio, BI_ANIOS))
        partes.append("};")
        partes.append("")

    partes.append("export interface InesFactor {")
    partes.append("  factor: number;")
    partes.append("  label: string;")
    partes.append("  /** 0-100. Base: respuestas que no son 'No sabe'. */")
    partes.append("  puntaje: number | null;")
    partes.append("  /** % de 'No sabe' sobre el total de respuestas del factor. */")
    partes.append("  nosabe: number | null;")
    partes.append("}")
    partes.append("")

    def emitir_ines(nombre, datos):
        filas = [f"export const {nombre}: InesFactor[] = ["]
        for f, label in FACTORES.items():
            d = datos[f]
            filas.append(
                f"  {{ factor: {f}, label: {ts(label)}, "
                f"puntaje: {ts(d['puntaje'])}, nosabe: {ts(d['nosabe'])} }},"
            )
        filas.append("];")
        filas.append("")
        return filas

    partes += emitir_ines("inesGlobal", ines_global)
    for g, datos in ines_grupo.items():
        clave = plano(g).lower().replace(" ", "_")
        partes += emitir_ines(f"ines_{clave}", datos)
    partes.append("export const INES_ANIOS = [" + ", ".join(ts(a) for a in anios_ines) + "];")
    partes.append("")
    partes.append("export const inesPorAnio: Record<string, InesFactor[]> = {")
    for a in anios_ines:
        items = ", ".join(
            f"{{ factor: {f}, label: {ts(FACTORES[f])}, "
            f"puntaje: {ts(ines_anio[a][f]['puntaje'])}, nosabe: {ts(ines_anio[a][f]['nosabe'])} }}"
            for f in FACTORES
        )
        partes.append(f"  {ts(a)}: [{items}],")
    partes.append("};")
    partes.append("")

    SALIDA.write_text("\n".join(partes), encoding="utf-8")
    print(f"escrito {SALIDA.relative_to(ROOT)} ({SALIDA.stat().st_size // 1024} KB)")

    # --- migración -----------------------------------------------------------
    D = "diversidad-equidad-inclusion"
    B = "bienestar-institucional"
    OD, OI, OB = OFICINA_DEI, OFICINA_INES, OFICINA_BI

    ind_dei = {
        "grupo-especial": dict(label="Estudiantes de grupos de protección constitucional", unit="estudiantes",
                               format="entero", direction="sube", office=OD, position=1, kpi=True, kpi_position=1,
                               headline=True,
                               definition="Estudiantes marcados como pertenecientes a un grupo especial en el registro académico del segundo periodo del año."),
        "etnico": dict(label="Estudiantes con pertenencia étnica", unit="estudiantes", format="entero",
                       direction="sube", office=OD, position=2, kpi=True, kpi_position=2,
                       definition="Estudiantes que declaran pertenecer a un pueblo indígena o a una comunidad negra, afrocolombiana, raizal o palenquera."),
        "discapacidad": dict(label="Estudiantes con discapacidad declarada", unit="estudiantes", format="entero",
                             direction="sube", office=OD, position=3, kpi=True, kpi_position=3,
                             definition="Estudiantes con un tipo de discapacidad registrado. No incluye a quienes el sistema marca como «no registra» ni «no aplica»."),
        "victima": dict(label="Estudiantes afectados por el conflicto armado", unit="estudiantes", format="entero",
                        direction="neutro", office=OD, position=4, kpi=True, kpi_position=4,
                        definition="Estudiantes que declaran haber sido afectados por la violencia."),
        "rural": dict(label="Estudiantes de zona rural", unit="estudiantes", format="entero", direction="sube",
                      office=OD, position=5,
                      definition="Estudiantes cuya zona de residencia registrada es rural."),
    }
    tasa_dei = {
        "estrato-bajo": dict(label="Estudiantes de estratos 1 y 2", unit="%", format="porcentaje", direction="neutro",
                             office=OD, position=6,
                             definition="Porcentaje sobre los estudiantes con estrato registrado; los que no lo tienen salen de la base."),
        "cobertura-discapacidad": dict(label="Cobertura del registro de discapacidad", unit="%", format="porcentaje",
                                       direction="sube", office=OD, position=7,
                                       definition="Porcentaje de matriculados cuyo campo de discapacidad tiene una respuesta, sea cual sea. Mide la captura, no la discapacidad."),
    }
    des_dei = {
        "tipo-discapacidad": dict(title="Tipo de discapacidad declarada", unit="estudiantes", format="entero",
                                  office=OD, chart="barras", reserve=MIN_CELDA, position=1),
        "pueblo-indigena": dict(title="Pueblo indígena", unit="estudiantes", format="entero", office=OD,
                                chart="barras", reserve=MIN_CELDA, position=2),
        "comunidad-negra": dict(title="Comunidad negra, afrocolombiana, raizal o palenquera", unit="estudiantes",
                                format="entero", office=OD, chart="barras", reserve=MIN_CELDA, position=3),
        "estrato": dict(title="Estrato socioeconómico", unit="estudiantes", format="entero", office=OD,
                        chart="barras", reserve=None, position=4),
        "genero": dict(title="Género registrado", unit="estudiantes", format="entero", office=OD,
                       chart="circular", reserve=None, position=5),
        "zona": dict(title="Zona de residencia", unit="estudiantes", format="entero", office=OD,
                     chart="circular", reserve=None, position=6),
    }
    ind_bi = {
        "actividad-fisica": dict(label="Estudiantes que realizan actividad física", unit="%", format="porcentaje",
                                 direction="sube", office=OB, position=1, kpi=True, kpi_position=1, headline=True,
                                 definition="Porcentaje de quienes respondieron la caracterización y declaran realizar actividad física."),
        "practica-deporte": dict(label="Estudiantes que practican un deporte", unit="%", format="porcentaje",
                                 direction="sube", office=OB, position=2, kpi=True, kpi_position=2,
                                 definition="Porcentaje de encuestados que practica algún deporte."),
        "habilidad-artistica": dict(label="Estudiantes con habilidad artística", unit="%", format="porcentaje",
                                    direction="sube", office=OB, position=3, kpi=True, kpi_position=3,
                                    definition="Porcentaje de encuestados que declara contar con alguna habilidad artística."),
        "primera-generacion": dict(label="Primera generación universitaria", unit="%", format="porcentaje",
                                   direction="neutro", office=OB, position=4, kpi=True, kpi_position=4,
                                   definition="Porcentaje de encuestados que es el primero de su familia inmediata en asistir a la universidad."),
    }
    des_bi = {
        "actividad-fisica": dict(title="Frecuencia con que se realiza actividad física", unit="respuestas",
                                 format="entero", office=OB, chart="circular", reserve=None, position=1),
        "frecuencia-actividad": dict(title="Veces por semana que se practica", unit="respuestas", format="entero",
                                     office=OB, chart="barras", reserve=None, position=2),
        "disciplina-artistica": dict(title="Disciplinas artísticas que atraen (multirespuesta)", unit="menciones",
                                     format="entero", office=OB, chart="barras", reserve=None, position=3),
        "financiacion-matricula": dict(title="Quién cubre la matrícula", unit="respuestas", format="entero",
                                       office=OB, chart="barras", reserve=None, position=4),
    }

    sql = [
        "-- =============================================================================",
        "-- PDI · 0041 · Diversidad, Equidad e Inclusión y Bienestar Institucional",
        "--",
        "-- Generado por scripts/build-bi-agregados.py a partir de los microdatos de bi/.",
        "-- No editar a mano: cambiar el script y volver a generar.",
        "--",
        "-- Amplía la escala de informes de nueve a once y añade la reserva estadística a",
        "-- los desgloses: una celda con menos de 5 registros se publica como «< 5»,",
        "-- porque su cifra exacta señalaría a personas concretas.",
        "--",
        "-- Requiere 0019 a 0040. Idempotente.",
        "-- =============================================================================",
        "",
        "-- 1. La escala de líneas pasa de nueve a once informes.",
        "alter table public.od_reports drop constraint if exists od_reports_line_range;",
        "alter table public.od_reports add constraint od_reports_line_range check (line between 1 and 11);",
        "",
        "-- 2. Reserva estadística.",
        "alter table public.od_breakdowns add column if not exists reserve_threshold smallint;",
        "comment on column public.od_breakdowns.reserve_threshold is",
        "  'Bajo este número de registros la celda se publica como «< n», nunca con su cifra.';",
        "alter table public.od_breakdown_values add column if not exists reserved boolean not null default false;",
        "comment on column public.od_breakdown_values.reserved is",
        "  'La celda tiene dato pero se calla: no es un vacío ni un cero.';",
        "",
        "-- 3. Los dos informes.",
        "insert into public.od_reports",
        "  (period_id, slug, code, name, summary, description, image_url, image_alt, image_credit, line, note, position, status)",
        "values",
    ]
    filas = []
    for slug, meta in INFORMES.items():
        filas.append(
            f"  ((select id from public.od_periods where label = {q(PERIODO_SQL)}), {q(slug)}, {q(meta['code'])},"
            f" {q(meta['name'])}, {q(meta['summary'])}, {q(meta['description'])}, '', '', '',"
            f" {meta['line']}, {q(meta['note'])}, {meta['position']}, 'publicado')"
        )
    sql.append(",\n".join(filas))
    sql += [
        "on conflict (period_id, slug) do update",
        "  set code = excluded.code, name = excluded.name, summary = excluded.summary,",
        "      description = excluded.description, line = excluded.line, note = excluded.note,",
        "      position = excluded.position, status = excluded.status;",
        "",
        "-- 4. Diversidad, Equidad e Inclusión.",
    ]
    for clave, meta in ind_dei.items():
        sql += sql_indicador(D, clave, meta, indicadores[clave], ANIOS, "suma", "ultimo", "B")
    for clave, meta in tasa_dei.items():
        sql += sql_indicador(D, clave, meta, tasas[clave], ANIOS, "reportado", "ultimo", "B")
    for clave, meta in des_dei.items():
        etiquetas, por_anio = desgloses[clave]
        sql += sql_desglose(D, clave, meta, etiquetas, por_anio, ANIOS, "B")

    grupos = ["Estudiantes", "Profesores", "Administrativos"]
    matriz = [[ines_grupo.get(g, {}).get(f, {}).get("puntaje") for g in grupos] for f in FACTORES]
    sql += sql_mapa_calor(
        D, "ines-grupos", "INES · los doce factores según quién responde",
        "Puntaje 0-100 de cada factor del Índice de Inclusión para la Educación Superior, por grupo de interés. "
        "Las respuestas «No sabe» salen de la base y se reportan aparte.",
        [FACTORES[f] for f in FACTORES], grupos, matriz, OI, 1,
    )

    sql += ["-- 5. Bienestar Institucional.", ""]
    for clave, meta in ind_bi.items():
        sql += sql_indicador(B, clave, meta, bi_tasas[clave], BI_ANIOS, "reportado", "reportado", "anual")
    for clave, meta in des_bi.items():
        etiquetas, por_anio = bi_desgloses[clave]
        sql += sql_desglose(B, clave, meta, etiquetas, por_anio, BI_ANIOS, "anual")

    sql += ["-- 6. Qué bloques muestra cada ficha.", ""]
    sql += sql_bloques(D, [("kpis", "{}"), ("evolucion", "{}"), ("desgloses", "{}"),
                           ("mapa_calor", "{}"), ("metodologia", "{}")])
    sql += sql_bloques(B, [("kpis", "{}"), ("evolucion", "{}"), ("desgloses", "{}"), ("metodologia", "{}")])

    MIGRACION.write_text("\n".join(sql) + "\n", encoding="utf-8")
    print(f"escrito {MIGRACION.relative_to(ROOT)} ({MIGRACION.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
