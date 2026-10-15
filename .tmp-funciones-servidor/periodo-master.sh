#!/bin/bash
# Periodo abierto por sede (host). Credenciales del contenedor; nunca se imprimen.
ENVJSON=$(echo 'Ud3s2028!' | sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
for s in buc cuc val bog; do
  H=master-$s.udes.edu.co
  printf "%-4s " "$s"
  R=$(curl -sk --max-time 25 -X POST "https://$H:81/master/mod_auth/login/" \
    -H 'Content-Type: application/json;charset=UTF-8' \
    -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
  TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
  API=$(printf '%s' "$R" | sed -n 's/.*"api_key": *"\([^"]*\)".*/\1/p')
  if [ -z "$TOKEN" ]; then echo "LOGIN_RECHAZADO"; continue; fi
  PER=$(curl -sk --max-time 20 "https://$H:81/master/mod_auth/current_period/?token=$TOKEN&api_key=$API" 2>/dev/null \
    | sed -n 's/.*"period": *"\([^"]*\)".*/\1/p')
  echo "LOGIN_OK periodo=${PER:-SIN_PERIODO}"
  curl -sk --max-time 15 "https://$H:81/master/mod_auth/logout/?token=$TOKEN&api_key=$API" >/dev/null 2>&1
done
