# =============================================================================
# Mapa de origen por municipio (informe Diversidad, Equidad e Inclusión).
#
# Lee los microdatos de bi/ (que nunca salen de la máquina: la carpeta está en
# .gitignore), ubica el municipio de origen de cada estudiante en la DIVIPOLA
# del DANE y escribe solo conteos en
#   supabase/migrations/0045_mapa_origen.sql
# con un mapa «municipio» (0044) del informe DE: por año, sede y municipio, y
# el total exacto de cada departamento.
#
# Reglas, las mismas del resto de agregados (build-bi-agregados.py):
#  · Reserva estadística: una celda municipio × sede × año con menos de 5
#    estudiantes se guarda reservada, sin su cifra. Los totales de
#    departamento se publican exactos salvo que ellos mismos sean menores de 5.
#  · Bogotá se suma a Bucaramanga. Cada respuesta cuenta en el año de su periodo.
#  · Lo que no se puede ubicar (vacío, «No registra», un nombre ambiguo sin
#    departamento, un municipio del exterior) no se inventa: se cuenta y se
#    informa en la salida, y no entra al mapa.
#
# Fuente por defecto: la caracterización estudiantil multicampus, que es una
# ENCUESTA (la base es quien respondió ese año, no la matrícula). El mapa lo
# dice en su descripción. Con --fuente se usa otro libro de bi/.
#
# Qué columna es «el origen» lo decide Planeación: procedencia, residencia y
# nacimiento no miden lo mismo. El script busca en este orden y dice cuál usó;
# --columna la fija a mano. Con --revisar solo informa, no escribe nada.
#
# Ejecutar con:
#   python scripts/build-mapa-origen.py --revisar
#   python scripts/build-mapa-origen.py [--columna "MUNICIPIO DE PROCEDENCIA"]
#                                       [--fuente "caracterizacion multicampus.xlsx"]
# =============================================================================

import argparse
import collections
import importlib.util
import json
import pathlib
import sys
import urllib.request

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Constantes y utilidades compartidas con el generador de agregados.
_spec = importlib.util.spec_from_file_location("agregados", ROOT / "scripts" / "build-bi-agregados.py")
agregados = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agregados)
plano, q, ref_informe = agregados.plano, agregados.q, agregados.ref_informe
ANIOS, PERIODOS, CAMPUS, SEDES, MIN_CELDA = agregados.ANIOS, agregados.PERIODOS, agregados.CAMPUS, agregados.SEDES, agregados.MIN_CELDA

FUENTE = ROOT / "bi"
MIGRACION = ROOT / "supabase" / "migrations" / "0045_mapa_origen.sql"
DIVIPOLA = "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000"
INFORME = "diversidad-equidad-inclusion"
CLAVE_MAPA = "origen-municipio"
OFICINA = "Bienestar Universitario"

# Candidatas, en orden de preferencia: un código DIVIPOLA vale más que un nombre.
COLUMNAS_CODIGO = [
    "CODIGO MUNICIPIO PROCEDENCIA", "COD MUNICIPIO PROCEDENCIA", "CODIGO MUNICIPIO RESIDENCIA",
    "COD MUNICIPIO RESIDENCIA", "CODIGO MUNICIPIO", "COD MUNICIPIO", "DIVIPOLA",
]
COLUMNAS_NOMBRE = [
    "CIUDAD DE ORIGEN", "MUNICIPIO DE ORIGEN", "MUNICIPIO DE PROCEDENCIA", "MUNICIPIO PROCEDENCIA", "CIUDAD DE PROCEDENCIA", "CIUDAD PROCEDENCIA",
    "MUNICIPIO DE RESIDENCIA", "MUNICIPIO RESIDENCIA", "CIUDAD DE RESIDENCIA", "CIUDAD RESIDENCIA",
    "LUGAR DE RESIDENCIA", "MUNICIPIO DE NACIMIENTO", "CIUDAD DE NACIMIENTO", "LUGAR DE NACIMIENTO",
]
COLUMNAS_DEPTO = [
    "DEPARTAMENTO DE PROCEDENCIA", "DEPARTAMENTO PROCEDENCIA", "DEPARTAMENTO DE RESIDENCIA",
    "DEPARTAMENTO RESIDENCIA", "DEPARTAMENTO DE NACIMIENTO", "DEPARTAMENTO",
]

COLUMNAS_PAIS = ["PAIS DE ORIGEN", "PAIS DE PROCEDENCIA", "PAIS DE RESIDENCIA", "PAIS"]

# Nombres de uso corriente que no son el oficial.
ALIAS = {"BARRANCA": "BARRANCABERMEJA", "CARTAGENA DE INDIAS": "CARTAGENA", "SANTA MARTA DTCH": "SANTA MARTA"}

VACIOS = {"", "NO REGISTRA", "NO APLICA", "NO INFORMA", "SIN INFORMACION", "N/A", "NA", "0"}


# --- DIVIPOLA -------------------------------------------------------------------

def cargar_divipola():
    with urllib.request.urlopen(DIVIPOLA, timeout=60) as r:
        filas = json.load(r)
    if len(filas) < 1000:
        sys.exit(f"DIVIPOLA incompleta: {len(filas)} filas")
    return filas


def variantes(nombre):
    """Formas en que suele escribirse un municipio en un formulario."""
    base = plano(nombre).replace(".", "").replace(",", " ")
    base = " ".join(base.split())
    out = {base}
    for prefijo in ("SAN JOSE DE ", "SANTIAGO DE ", "VILLA DE "):
        if base.startswith(prefijo):
            out.add(base[len(prefijo):])
    for sufijo in (" DC", " D C", " DE INDIAS", " DISTRITO CAPITAL"):
        if base.endswith(sufijo):
            out.add(base[: -len(sufijo)].strip())
    return out


def indices(divipola):
    por_codigo = {f["cod_mpio"]: f for f in divipola}
    por_nombre = collections.defaultdict(list)
    for f in divipola:
        for v in variantes(f["nom_mpio"]):
            por_nombre[v].append(f)
    deptos = {}
    for f in divipola:
        for v in variantes(f["dpto"]):
            deptos[v] = f["cod_dpto"]
    deptos.update({"BOGOTA": "11", "BOGOTA DC": "11", "NORTE SANTANDER": "54", "SAN ANDRES": "88", "GUAJIRA": "44"})
    return por_codigo, por_nombre, deptos


def ubicar(valor, depto, por_codigo, por_nombre, deptos):
    """Código DIVIPOLA del municipio, o (None, motivo)."""
    crudo = plano(valor)
    if crudo in VACIOS:
        return None, "sin dato"
    digitos = "".join(c for c in crudo if c.isdigit())
    if len(digitos) in (4, 5) and not any(c.isalpha() for c in crudo):
        codigo = digitos.zfill(5)
        return (codigo, None) if codigo in por_codigo else (None, "código inexistente")
    # "BUCARAMANGA (SANTANDER)", "BUCARAMANGA - SANTANDER", "SARAVENA-ARAUCA"
    crudo = " ".join(crudo.replace("-", " ").replace(",", " ").replace(".", " ").replace("(", " ( ").split())
    crudo = ALIAS.get(crudo, crudo)
    nombre, _, resto = crudo.partition("(")
    nombre = nombre.strip()
    cod_dpto = deptos.get(plano(depto).replace(".", "").strip()) if depto else None
    if not cod_dpto and resto:
        cod_dpto = deptos.get(resto.strip(" )").replace(".", ""))
    # Solo el departamento ("LA GUAJIRA"): cuenta para el calor del departamento.
    if not por_nombre.get(nombre) and nombre in deptos:
        return deptos[nombre], None
    # "VALLEDUPAR CESAR": el departamento al final, sin separador.
    if not cod_dpto and not por_nombre.get(nombre):
        for dep in sorted(deptos, key=len, reverse=True):
            cabeza = nombre[: -len(dep) - 1].strip()
            if nombre.endswith(" " + dep) and por_nombre.get(cabeza):
                nombre, cod_dpto = cabeza, deptos[dep]
                break
    candidatos = []
    for v in variantes(nombre):
        candidatos = por_nombre.get(v, [])
        if candidatos:
            break
    if cod_dpto:
        candidatos = [c for c in candidatos if c["cod_dpto"] == cod_dpto]
    if len(candidatos) == 1:
        return candidatos[0]["cod_mpio"], None
    return None, "ambiguo" if candidatos else "no encontrado"


# --- lectura --------------------------------------------------------------------

def elegir(col, candidatas, forzada=None):
    if forzada:
        clave = plano(forzada)
        if clave not in col:
            sys.exit(f"La columna «{forzada}» no está en el archivo.")
        return clave
    return next((c for c in candidatas if c in col), None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fuente", default="caracterizacion multicampus.xlsx")
    ap.add_argument("--columna", help="columna del municipio de origen, tal como viene en el archivo")
    ap.add_argument("--depto", help="columna del departamento de origen, si viene aparte")
    ap.add_argument("--revisar", action="store_true", help="solo informar; no escribir la migración")
    args = ap.parse_args()

    ruta = FUENTE / args.fuente
    if not ruta.exists():
        sys.exit(f"No está {ruta.relative_to(ROOT)}. Los microdatos van en bi/, que git no sube.")

    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = libro.worksheets[0]
    filas = hoja.iter_rows(values_only=True)
    cab = next(filas)
    col = {plano(h): i for i, h in enumerate(cab) if h is not None}

    c_codigo = None if args.columna else elegir(col, COLUMNAS_CODIGO)
    c_nombre = elegir(col, COLUMNAS_NOMBRE, args.columna)
    c_depto = elegir(col, COLUMNAS_DEPTO, args.depto)
    c_pais = elegir(col, COLUMNAS_PAIS)
    c_origen = c_codigo or c_nombre
    if not c_origen:
        print("No encontré una columna de municipio de origen. Columnas del archivo:")
        for h in cab:
            if h is not None:
                print("  ·", h)
        sys.exit("Indica cuál es con --columna \"NOMBRE DE LA COLUMNA\".")
    for requerida in ("PERIODO", "CAMPUS"):
        if requerida not in col:
            sys.exit(f"Falta la columna {requerida} en {ruta.name}.")

    print(f"Fuente: {ruta.name}")
    print(f"Origen: {c_origen}" + (f" · departamento: {c_depto}" if c_depto else " · sin columna de departamento"))

    divipola = cargar_divipola()
    por_codigo, por_nombre, deptos = indices(divipola)

    conteo = collections.Counter()  # (año, sede, código municipio)
    fallos = collections.Counter()
    ejemplos = collections.defaultdict(collections.Counter)
    total = 0
    for fila in filas:
        # La encuesta se responde en cualquier periodo del año: cuenta en su año.
        periodo = plano(fila[col["PERIODO"]])
        anio = int(periodo[:4]) if periodo[:4].isdigit() and 2015 <= int(periodo[:4]) <= 2035 else None
        sede = CAMPUS.get(plano(fila[col["CAMPUS"]]))
        if anio is None or sede is None:
            continue
        total += 1
        # Quien viene de otro país no se ubica en el mapa de Colombia: se cuenta aparte.
        if c_pais and plano(fila[col[c_pais]]) not in ("", "COLOMBIA", "NO REGISTRA"):
            fallos["exterior"] += 1
            ejemplos["exterior"][str(fila[col[c_pais]]).strip()] += 1
            continue
        depto = fila[col[c_depto]] if c_depto else None
        codigo, motivo = ubicar(fila[col[c_origen]], depto, por_codigo, por_nombre, deptos)
        if codigo:
            conteo[(anio, sede, codigo)] += 1
        else:
            fallos[motivo] += 1
            ejemplos[motivo][str(fila[col[c_origen]] or "").strip()] += 1
    libro.close()

    ubicados = sum(conteo.values())
    print(f"Registros del periodo: {total} · ubicados en un municipio: {ubicados} ({ubicados / max(1, total):.1%})")
    for motivo, n in fallos.most_common():
        muestra = ", ".join(f"{k or '(vacío)'} ×{v}" for k, v in ejemplos[motivo].most_common(6))
        print(f"  sin ubicar · {motivo}: {n}  → {muestra}")
    municipios = {c for (_, _, c) in conteo if len(c) == 5}
    solo_depto = sum(n for (_, _, c), n in conteo.items() if len(c) == 2)
    if solo_depto:
        print(f"  solo departamento (suma al calor, sin punto de ciudad): {solo_depto}")
    print(f"Municipios distintos: {len(municipios)}")
    if args.revisar:
        return

    # --- agregación con reserva -------------------------------------------------
    depto_n = collections.Counter()
    for (anio, sede, codigo), n in conteo.items():
        depto_n[(anio, sede, codigo[:2])] += n
    # Lo que solo trae el departamento suma a su departamento, no a un municipio.
    for clave in [k for k in conteo if len(k[2]) == 2]:
        del conteo[clave]

    filas_sql = []
    reservadas = 0
    ref_mapa = (
        f"(select id from public.od_maps where key = {q(CLAVE_MAPA)} and report_id = {ref_informe(INFORME)})"
    )
    for (anio, sede, codigo), n in sorted(list(conteo.items()) + list(depto_n.items())):
        campus = f"(select id from public.campuses where slug = {q(sede)})"
        if n < MIN_CELDA:
            reservadas += 1
            filas_sql.append(f"  ({ref_mapa}, {anio}, {campus}, {q(codigo)}, null, true)")
        else:
            filas_sql.append(f"  ({ref_mapa}, {anio}, {campus}, {q(codigo)}, {n}, false)")

    anios = sorted({a for (a, _, _) in conteo})
    sql = [
        "-- =============================================================================",
        "-- PDI · 0045 · Mapa de origen por municipio (Diversidad, Equidad e Inclusión)",
        "--",
        "-- GENERADO por scripts/build-mapa-origen.py a partir de los microdatos de bi/.",
        "-- No editar a mano: cambiar el script y volver a generar.",
        "--",
        f"-- Fuente: {ruta.name}, columna «{c_origen}». {ubicados} de {total} registros",
        f"-- ubicados en {len(municipios)} municipios. Celdas con menos de {MIN_CELDA} estudiantes",
        f"-- guardadas como reservadas: {reservadas}.",
        "--",
        "-- Requiere 0041 y 0044. Idempotente.",
        "-- =============================================================================",
        "",
        "insert into public.od_maps (report_id, key, title, description, mode, unit, office_id, years, position)",
        f"values ({ref_informe(INFORME)}, {q(CLAVE_MAPA)}, 'De dónde vienen los estudiantes',",
        "  'Según la caracterización estudiantil multicampus: calor por departamento de origen y, al acercarse, un punto por municipio. La base es quien respondió la encuesta ese año. Menos de 5 se publica como «< 5».',",
        f"  'municipio', 'estudiantes', (select id from public.od_offices where name = {q(OFICINA)}),",
        f"  '{{{','.join(str(a) for a in anios)}}}'::smallint[], 1)",
        "on conflict (report_id, key) do update",
        "  set title = excluded.title, description = excluded.description, mode = excluded.mode,",
        "      unit = excluded.unit, office_id = excluded.office_id, years = excluded.years;",
        "",
        f"delete from public.od_map_values where map_id = {ref_mapa};",
        "insert into public.od_map_values (map_id, year, campus_id, department_code, value, reserved) values",
        ",\n".join(filas_sql) + ";",
        "",
    ]
    MIGRACION.write_text("\n".join(sql), encoding="utf-8")
    print(f"escrito {MIGRACION.relative_to(ROOT)} ({MIGRACION.stat().st_size // 1024} KB, {len(filas_sql)} filas)")


if __name__ == "__main__":
    main()
