#!/bin/bash
# Qué periodos ofrece Davinci y qué pasa si se pide uno viejo (global_scores 2025b).
ENVJSON=$(echo 'Ud3s2028!' | sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
H=master-buc.udes.edu.co
BASE="https://$H:81"
R=$(curl -sk --max-time 25 -X POST "$BASE/davinci/mod_auth/login/" -H 'Content-Type: application/json;charset=UTF-8' -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
API=$(printf '%s' "$R" | sed -n 's/.*"api_key": *"\([^"]*\)".*/\1/p')
echo "--- periodos de Davinci (get_periods) ---"
curl -sk --max-time 25 "$BASE/davinci/mod_reports/reports/get_periods/?token=$TOKEN&api_key=$API" 2>/dev/null | head -c 600
echo
echo "--- global_scores 2025b (solo estado, primeros 200 chars) ---"
curl -sk --max-time 60 -o /tmp/g2025b.json -w 'HTTP=%{http_code} bytes=%{size_download}\n' -X POST "$BASE/davinci/mod_reports/reports/global_scores/2025b/download/" -H 'Content-Type: application/json;charset=UTF-8' -d '{"type":"pdf","title":"Reporte global de notas BUCARAMANGA 2025b","title_doc":"Reporte global de notas BUCARAMANGA 2025b","report":"Reporte global de notas BUCARAMANGA 2025b","token":"'"$TOKEN"'","api_key":"'"$API"'"}' 2>/dev/null || true
if [ -f /tmp/g2025b.json ]; then head -c 200 /tmp/g2025b.json | sed 's/UEsDB.*/[EXCEL_BASE64]/'; echo; rm -f /tmp/g2025b.json; fi
curl -sk --max-time 10 "$BASE/davinci/mod_auth/logout/?token=$TOKEN&api_key=$API" >/dev/null 2>&1
