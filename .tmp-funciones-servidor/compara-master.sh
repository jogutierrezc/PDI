#!/bin/bash
# Compara: ¿el Excel con semester=2025b es distinto al del periodo abierto?
ENVJSON=$(echo 'Ud3s2028!' | sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
BASE="https://master-buc.udes.edu.co:81"
R=$(curl -sk --max-time 25 -X POST "$BASE/master/mod_auth/login/" -H 'Content-Type: application/json;charset=UTF-8' -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
API=$(printf '%s' "$R" | sed -n 's/.*"api_key": *"\([^"]*\)".*/\1/p')
TQ="token=$TOKEN&api_key=$API"
dl() { # $1 salida.json $2 cuerpo
  curl -sk --max-time 60 -X POST "$BASE/master/mod_reports/reports/matriculated_mortality/download/?$TQ" -H 'Content-Type: application/json;charset=UTF-8' -d "$2" 2>/dev/null > "$1"
  python3 - "$1" <<'PY'
import base64, json, sys, zipfile, io, hashlib
j = json.load(open(sys.argv[1]))
b = base64.b64decode(j["msg"])
z = zipfile.ZipFile(io.BytesIO(b))
sheet = z.read("xl/worksheets/sheet1.xml")
shared = z.read("xl/sharedStrings.xml") if "xl/sharedStrings.xml" in z.namelist() else b""
print(f"  bytes={len(b)} sheet={len(sheet)} md5_sheet={hashlib.md5(sheet).hexdigest()[:12]} md5_shared={hashlib.md5(shared).hexdigest()[:12]}")
PY
}
echo "--- baseline (sesion 2026b) ---"; dl /tmp/a.json '{"period":"1","title":"Sonda corte 1"}'
echo "--- con semester=2025b ---"; dl /tmp/b.json '{"period":"1","semester":"2025b","title":"Sonda corte 1"}'
echo "--- con selected_period=2025b ---"; dl /tmp/c.json '{"period":"1","selected_period":"2025b","title":"Sonda corte 1"}'
rm -f /tmp/a.json /tmp/b.json /tmp/c.json
curl -sk --max-time 10 "$BASE/master/mod_auth/logout/?$TQ" >/dev/null 2>&1
