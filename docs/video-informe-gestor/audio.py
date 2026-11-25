#!/usr/bin/env python3
"""Arma el audio y los tiempos del video.

  python3 audio.py demo               voz de prueba (Paulina, macOS) por escena -> audio/voz.wav
  python3 audio.py final ARCHIVO.wav  usa la voz grabada en VoiceStudio (una sola toma)
Luego transcribe (faster-whisper, local) y escribe timing.js con el inicio de cada escena y el tiempo de cada palabra.
El video busca sus pistas por frase ("T('05','Pilo redacta un borrador')"), así que una voz nueva solo pide volver a correr esto y renderizar."""
import json, subprocess, sys, re, pathlib, unicodedata
AQUI = pathlib.Path(__file__).parent
ASR = "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/fd4aae02-2dd2-4a00-a672-e37f73af5c77/scratchpad/asr/bin/python"
GAP = 0.9          # silencio entre escenas (s) en la voz de prueba
ESC = sorted(p.stem for p in (AQUI/"narracion").glob("[0-9][0-9].txt"))
def run(*a): subprocess.run(a, check=True)
def dur(f): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(f)]).decode())
modo = sys.argv[1] if len(sys.argv) > 1 else "demo"
(AQUI/"audio").mkdir(exist_ok=True)
if modo == "demo":
    partes, t = [], 0.0
    sil = AQUI/"audio/_sil.wav"; run("ffmpeg","-y","-loglevel","error","-f","lavfi","-i","anullsrc=r=22050:cl=mono","-t",str(GAP),str(sil))
    lista = []
    for e in ESC:
        txt = re.sub(r"\[[a-z\-]+\]", "", (AQUI/f"narracion/{e}.txt").read_text()).strip()
        aif = AQUI/f"audio/_{e}.aiff"; wav = AQUI/f"audio/_{e}.wav"
        run("say","-v","Paulina","-r","165","-o",str(aif),txt)
        run("ffmpeg","-y","-loglevel","error","-i",str(aif),"-ar","22050","-ac","1",str(wav))
        lista += [wav, sil]
    (AQUI/"audio/_lista.txt").write_text("".join(f"file '{p}'\n" for p in lista))
    run("ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",str(AQUI/"audio/_lista.txt"),"-ar","48000",str(AQUI/"audio/voz.wav"))
    t = 0.0; ini = {}
    for e in ESC:
        ini[e] = t; t += dur(AQUI/f"audio/_{e}.wav") + GAP
    (AQUI/"audio/escenas.json").write_text(json.dumps(ini))
else:
    src = pathlib.Path(sys.argv[2]).resolve()
    run("ffmpeg","-y","-loglevel","error","-i",str(src),"-ar","48000","-ac","1",str(AQUI/"audio/voz.wav"))
    if not (AQUI/"audio/escenas.json").exists(): print("aviso: sin escenas.json; las escenas se ubican por su primera frase")
# transcribir
run("ffmpeg","-y","-loglevel","error","-i",str(AQUI/"audio/voz.wav"),"-ar","16000","-ac","1",str(AQUI/"audio/_16k.wav"))
code = r'''
import json,sys
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
seg,_ = m.transcribe(sys.argv[1], language="es", word_timestamps=True, vad_filter=False, beam_size=5)
out=[]
for s in seg:
    for w in s.words: out.append([w.word.strip(), round(w.start,2), round(w.end,2)])
json.dump(out, open(sys.argv[2],"w"), ensure_ascii=False)
'''
run(ASR,"-c",code,str(AQUI/"audio/_16k.wav"),str(AQUI/"audio/transcripcion.json"))
palabras = json.loads((AQUI/"audio/transcripcion.json").read_text())
escenas = json.loads((AQUI/"audio/escenas.json").read_text()) if (AQUI/"audio/escenas.json").exists() else {}
D = dur(AQUI/"audio/voz.wav")
(AQUI/"timing.js").write_text("window.TIMING = " + json.dumps({"duracion": round(D,2), "escenas": escenas, "palabras": palabras}, ensure_ascii=False) + ";\n")
print("escenas:", len(ESC), "duración:", round(D,1), "s · palabras:", len(palabras))
