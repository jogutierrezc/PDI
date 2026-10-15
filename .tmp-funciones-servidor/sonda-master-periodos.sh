#!/bin/bash
# Sonda: ¿puede Master entregar el rendimiento por grupo de un periodo anterior?
ENVJSON=$(echo 'Ud3s2028!' | sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
BASE="https://master-buc.udes.edu.co:81"
R=$(curl -sk --max-time 25 -X POST "$BASE/master/mod_auth/login/" -H 'Content-Type: application/json;charset=UTF-8' -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
API=$(printf '%s' "$R" | sed -n 's/.*"api_key": *"\([^"]*\)".*/\1/p')
[ -z "$TOKEN" ] && { echo "LOGIN_FALLA"; exit 1; }
TQ="token=$TOKEN&api_key=$API"

echo "--- 1) get_periods en Master ---"
curl -sk --max-time 20 "$BASE/master/mod_reports/reports/get_periods/?$TQ" | head -c 400; echo

probe() { # $1 etiqueta  $2 ruta  $3 cuerpo-json
  R=$(curl -sk --max-time 40 -o /tmp/probe.json -w '%{http_code}' -X POST "$BASE$2?$TQ" -H 'Content-Type: application/json;charset=UTF-8' -d "$3" 2>/dev/null)
  MSJ=$(head -c 90 /tmp/probe.json 2>/dev/null)
  TIPO="?"
  head -c 20 /tmp/probe.json 2>/dev/null | grep -q 'UEsDB' && TIPO="EXCEL"
  echo "[$1] http=$R tipo=$TIPO ${MSJ:0:80}"
}

echo "--- 2) variantes de peticion con periodo 2025b ---"
probe "baseline-2026b" "/master/mod_reports/reports/matriculated_mortality/download/" '{"period":"1","title":"Sonda corte 1 BUCARAMANGA 2026B"}'
probe "cuerpo-semester" "/master/mod_reports/reports/matriculated_mortality/download/" '{"period":"1","semester":"2025b","title":"Sonda corte 1 BUCARAMANGA 2025B"}'
probe "cuerpo-selected" "/master/mod_reports/reports/matriculated_mortality/download/" '{"period":"1","selected_period":"2025b","title":"Sonda corte 1 BUCARAMANGA 2025B"}'
probe "ruta-2025b" "/master/mod_reports/reports/matriculated_mortality/2025b/download/" '{"period":"1","title":"Sonda corte 1 BUCARAMANGA 2025B"}'
rm -f /tmp/probe.json
curl -sk --max-time 10 "$BASE/master/mod_auth/logout/?$TQ" >/dev/null 2>&1
