"""Del Saber 11 al Saber PRO, agregado por programa.

Lee el Excel con el cruce Saber PRO + Saber 11 (una fila por estudiante, con
datos personales) y escribe SOLO agregados en
src/modules/datos-abiertos/data/saber-trayectoria.data.json. Ninguna fila ni
identificador de estudiante sale de este script.

Uso: python scripts/saber-trayectoria.py Resultado_SaberPro_con_Saber11.xlsx

Entrada y salida se miden en percentil dentro de la cohorte UDES del mismo
periodo de Saber PRO, porque Saber 11 (0-100 por área, 0-500 global) y Saber
PRO (0-300) no comparten escala. Un cero en un módulo de Saber PRO es dato
ausente, no puntaje.
"""
import json, re, sys, unicodedata
from pathlib import Path
import pandas as pd

MIN_PROGRAMA = 10   # evaluados con par entrada-salida para publicar un programa
MIN_GRUPO = 5       # evaluados para publicar un cuarto de entrada dentro de un programa

COMP = {  # clave: (columna Saber 11, columna Saber PRO)
    "global": ("sb11_punt_global", "punt_global"),
    "lc": ("sb11_punt_lectura_critica", "mod_lectura_critica_punt"),
    "rc": ("sb11_punt_matematicas", "mod_razona_cuantitat_punt"),
    "cc": ("sb11_punt_sociales_ciudadanas", "mod_competen_ciudada_punt"),
    "ing": ("sb11_punt_ingles", "mod_ingles_punt"),
}

NOMBRES = {
    "MEDICINA": "Medicina", "FISIOTERAPIA": "Fisioterapia", "DERECHO": "Derecho",
    "BACTERIOLOGIA Y LABORATORIO CLINICO": "Bacteriología", "ENFERMERIA": "Enfermería",
    "INSTRUMENTACION QUIRURGICA": "Instrumentación Quirúrgica", "PSICOLOGIA": "Psicología",
    "MERCADEO Y PUBLICIDAD": "Mercadeo", "INGENIERIA INDUSTRIAL": "Ingeniería Industrial",
    "MEDICINA VETERINARIA": "Medicina Veterinaria", "MEDICINA VETERINARIA Y ZOOTECNIA": "Medicina Veterinaria",
    "COMERCIO EXTERIOR": "Comercio Exterior", "TERAPIA OCUPACIONAL": "Terapia",
    "ADMINISTRACION FINANCIERA": "Administración Financiera", "FONOAUDIOLOGIA": "Fonoaudiología",
    "CONTADURIA PUBLICA": "Contaduría Pública", "INGENIERIA CIVIL": "Ingeniería Civil",
    "DISENO GRAFICO": "Diseño Gráfico", "COMUNICACION SOCIAL Y PERIODISMO": "Comunicación Social",
    "ADMINISTRACION DE NEGOCIOS INTERNACIONALES": "Administración de Negocios",
    "GEOLOGIA": "Geología", "MICROBIOLOGIA INDUSTRIAL": "Microbiología Industrial",
    "INGENIERIA DE SISTEMAS": "Ingeniería de Software", "INGENIERIA DE SOFTWARE": "Ingeniería de Software",
    "INGENIERIA DE SOFTWARE Y COMUNICACIONES": "Ingeniería de Software", "ANTROPOLOGIA": "Antropología",
    "INGENIERIA AGROINDUSTRIAL": "Ingeniería Agroindustrial", "INGENIERIA PETROQUIMICA": "Ingeniería Petroquímica",
    "LICENCIATURA EN EDUCACION INFANTIL": "Licenciatura en Educación Infantil",
}

def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def programa(s):
    clave = re.sub(r"\s+", " ", sin_tildes(str(s)).upper().replace("\ufffd", "")).strip()
    return NOMBRES.get(clave) or NOMBRES.get(clave.replace("DISENO", "DISENO")) or str(s).title()

def main(ruta):
    df = pd.read_excel(ruta, sheet_name="Resultado", dtype=str)
    df["programa"] = df["estu_prgm_academico"].map(programa)
    sedes = {"BUCARAMANGA": "Bucaramanga", "CUCUTA": "Cúcuta", "VALLEDUPAR": "Valledupar", "BOGOTA": "Bogotá"}
    df["sede"] = df["estu_prgm_municipio"].map(lambda m: sedes.get(sin_tildes(str(m)).replace("D.C.", "").strip().upper(), str(m).title()))
    df["periodo"] = df["periodo"].str[:4]
    for _, (a, b) in COMP.items():
        df[a] = pd.to_numeric(df[a], errors="coerce")
        df[b] = pd.to_numeric(df[b], errors="coerce").where(lambda x: x > 0)
    out = {"periodos": sorted(df["periodo"].unique().tolist()), "programas": {}, "total": {}}
    for k, (a, b) in COMP.items():
        par = df[df[a].notna() & df[b].notna()].copy()
        par["pe"] = par.groupby("periodo")[a].rank(pct=True) * 100
        par["ps"] = par.groupby("periodo")[b].rank(pct=True) * 100
        par["cuarto"] = pd.cut(par["pe"], [0, 25, 50, 75, 100.0001], labels=[1, 2, 3, 4], include_lowest=True).astype(int)
        out["total"][k] = {"n": int(len(par))}
        for (prog, sede), g in par.groupby(["programa", "sede"]):
            if len(g) < MIN_PROGRAMA:
                continue
            e = out["programas"].setdefault(f"{prog} · {sede}", {"programa": prog, "sede": sede})
            cuartos = []
            for q in (1, 2, 3, 4):
                h = g[g["cuarto"] == q]
                cuartos.append({"n": int(len(h)), "salida": round(float(h["ps"].mean()), 1)} if len(h) >= MIN_GRUPO else None)
            e[k] = {
                "n": int(len(g)),
                "entrada": round(float(g[a].mean()), 1), "salida": round(float(g[b].mean()), 1),
                "pEntrada": round(float(g["pe"].mean()), 1), "pSalida": round(float(g["ps"].mean()), 1),
                "cuartos": cuartos,
            }
    out["programas"] = dict(sorted(out["programas"].items()))
    destino = Path(__file__).resolve().parent.parent / "src/modules/datos-abiertos/data/saber-trayectoria.data.json"
    destino.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("programas publicados:", len(out["programas"]), "->", destino)

main(sys.argv[1])
