"""
Lee UDES_Matriz_Impacto_Institucional_vr7.xlsx y escribe
src/modules/impacto/data/matriz.generated.ts para el prototipo del módulo Impacto.

No corrige la matriz: normaliza lo mínimo para poder mostrarla (saltos de línea,
nivel de la cadena, estado sugerido, códigos de proyecto y ODS) y conserva cada
valor original. Las inconsistencias se cuentan como hallazgos.

Uso: python scripts/build-impacto-matriz.py
"""

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "UDES_Matriz_Impacto_Institucional_vr7.xlsx"
TARGET = ROOT / "src/modules/impacto/data/matriz.generated.ts"

SHEETS = [
    ("1. INVESTIGACIÓN", "investigacion", "I"),
    ("2. ENSEÑANZA", "ensenanza", "E"),
    ("3. EXTENSIÓN", "extension", "X"),
]

NIVELES = {"1": "insumos", "2": "procesos", "3": "productos", "4": "impacto"}


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\r", "\n")
    return re.sub(r"[ \t]+", " ", text).strip()


def one_line(value):
    return re.sub(r"\s+", " ", clean(value)).strip()


def header_key(value):
    return one_line(value).upper()


def split_lines(value):
    return [one_line(part) for part in clean(value).split("\n") if one_line(part)]


def projects(value):
    found = set()
    for match in re.finditer(r"\b(?:PR|PROYECTO)\s*\.?\s*(\d)", clean(value).upper()):
        found.add(f"Pr{match.group(1)}")
    return sorted(found)


def ods(value):
    return sorted({int(n) for n in re.findall(r"ODS\s*(\d{1,2})", clean(value).upper())})


def pillars(value):
    found = set()
    for line in split_lines(value):
        match = re.match(r"(?:PILAR\s*)?(\d)\b", line.upper())
        if match:
            found.add(int(match.group(1)))
    return sorted(found)


def main():
    if not SOURCE.exists():
        sys.exit(f"No encuentro {SOURCE.name} en la raíz del repositorio.")
    book = openpyxl.load_workbook(SOURCE, data_only=True)
    indicators = []
    findings = {"nivel_variante": 0, "unidad_numerica": 0, "linea_base_por_definir": 0, "dimension_por_definir": 0}
    units = set()

    for sheet_name, function, prefix in SHEETS:
        sheet = book[sheet_name]
        header = None
        count = 0
        for row in sheet.iter_rows(values_only=True):
            cells = list(row[1:])
            first = next((clean(c) for c in cells if clean(c)), "")
            if header is None:
                if first.upper().startswith("NIVEL"):
                    header = [header_key(c) for c in cells]
                continue
            if not first[:1].isdigit():
                continue

            def col(prefix_text):
                for i, name in enumerate(header):
                    if name.startswith(prefix_text) and i < len(cells):
                        return cells[i]
                return None

            meta_year = next((int(n[-4:]) for n in header if re.match(r"META 20(25|26)$", n)), 2026)
            level_raw = one_line(col("NIVEL"))
            if re.search(r"PROCESO\b", level_raw.upper()) and "PROCESOS" not in level_raw.upper():
                findings["nivel_variante"] += 1
            unit = one_line(col("UNIDAD"))
            units.add(unit)
            if re.fullmatch(r"[\d.,]+", unit):
                findings["unidad_numerica"] += 1
            base = one_line(col("LÍNEA BASE"))
            if base.lower() == "por definir":
                findings["linea_base_por_definir"] += 1
            dimension = one_line(col("DIMENSI"))
            if dimension.lower() == "por definir":
                findings["dimension_por_definir"] += 1
            count += 1
            indicators.append({
                "codigo": f"{prefix}{count:02d}",
                "funcion": function,
                "nivel": NIVELES.get(level_raw[:1], "procesos"),
                "estado": "sugerido" if "SUGERIDO" in level_raw.upper() else "oficial",
                "nombre": one_line(col("INDICADOR")),
                "descripcion": one_line(col("DESCRIPCI")),
                "unidad": unit,
                "lineaBase": base,
                "meta": {"anio": meta_year, "valor": one_line(col(f"META {meta_year}"))},
                "meta2028": one_line(col("META 2028")),
                "responsable": one_line(col("RESPONSABLE")),
                "fuente": one_line(col("FUENTE")),
                "dimension": "" if dimension.lower() == "por definir" else dimension,
                "pilares": pillars(col("PILARES")),
                "proyectos": projects(col("PROYECTOS")),
                "ods": ods(col("ODS")),
                "origen": one_line(col("ORIGEN")),
            })

    findings["variantes_unidad"] = len(units)
    body = (
        "/* Generado por scripts/build-impacto-matriz.py desde "
        f"{SOURCE.name}. No editar a mano. */\n\n"
        "import type { MatrixIndicator } from \"./types\";\n\n"
        f"export const MATRIX_SOURCE = {json.dumps(SOURCE.name)};\n\n"
        f"export const MATRIX_FINDINGS = {json.dumps(findings, ensure_ascii=False)} as const;\n\n"
        "export const MATRIX: MatrixIndicator[] = "
        + json.dumps(indicators, ensure_ascii=False, indent=2)
        + ";\n"
    )
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(body, encoding="utf-8")
    by_function = {f: sum(1 for i in indicators if i["funcion"] == f) for _, f, _ in SHEETS}
    suggested = sum(1 for i in indicators if i["estado"] == "sugerido")
    print(f"{len(indicators)} indicadores {by_function}; sugeridos {suggested}; hallazgos {findings}")


if __name__ == "__main__":
    main()
