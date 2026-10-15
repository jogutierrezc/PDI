#!/bin/bash
# ¿Acepta matriculated_mortality selected_period=2025b en la QUERY?
ENVJSON=$(echo 'Ud3s2028!' | sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
BASE="https://master-buc.udes.edu.co:81"
R=$(curl -sk --max-time 25 -X POST "$BASE/master/mod_auth/login/" -H 'Content-Type: application/json;charset=UTF-8' -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
API=$(printf '%s' "$R" | sed -n 's/.*"api_key": *"\([^"]*\)".*/\1/p')
TQ="token=$TOKEN&api_key=$API"

dl() { # $1 salida $2 query-extra
  curl -sk --max-time 90 -X POST "$BASE/master/mod_reports/reports/matriculated_mortality/download/?$TQ$2" -H 'Content-Type: application/json;charset=UTF-8' -d '{"period":"1","title":"Sonda corte 1"}' 2>/dev/null > "$1"
  python3 - "$1" <<'PY'
import base64, json, sys, zipfile, io, hashlib, re
try:
    j = json.load(open(sys.argv[1]))
except Exception:
    print("  RESPUESTA_NO_JSON"); raise SystemExit
if not isinstance(j.get("msg"), str) or not j["msg"].startswith("UEsDB"):
    print(f"  msg={str(j.get('msg'))[:100]} code={j.get('code')}"); raise SystemExit
b = base64.b64decode(j["msg"])
z = zipfile.ZipFile(io.BytesIO(b))
sheet = z.read("xl/worksheets/sheet1.xml")
shared = z.read("xl/sharedStrings.xml") if "xl/sharedStrings.xml" in z.namelist() else b""
txt = shared.decode("utf-8", "ignore")
m = re.findall(r"<t[^>]*>([^<]*)</t>", txt)[:3]
print(f"  bytes={len(b)} md5_sheet={hashlib.md5(sheet).hexdigest()[:12]} primeras_celdas={m}")
PY
}
echo "--- baseline (sin selected_period) ---"; dl /tmp/a.json ""
echo "--- selected_period=2025b en query ---"; dl /tmp/b.json "&selected_period=2025b"
echo "--- selected_period=2026a en query ---"; dl /tmp/c.json "&selected_period=2026a"
rm -f /tmp/a.json /tmp/b.json /tmp/c.json
curl -sk --max-time 10 "$BASE/master/mod_auth/logout/?$TQ" >/dev/null 2>&1
