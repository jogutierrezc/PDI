#!/bin/bash
# Prueba de la cuenta de servicio de Master por sede, desde el host.
# Lee las credenciales del contenedor edge-runtime; nunca las imprime.
ENVJSON=$(sudo -S docker inspect supabase-edge-functions-exc75yzkfkbkoglxzpckecjp --format '{{range .Config.Env}}{{println .}}{{end}}' <<< 'Ud3s2028!' 2>/dev/null)
U=$(grep '^WAREHOUSE_MASTER_USER=' <<< "$ENVJSON" | cut -d= -f2-)
P=$(grep '^WAREHOUSE_MASTER_PASSWORD=' <<< "$ENVJSON" | cut -d= -f2-)
if [ -z "$U" ] || [ -z "$P" ]; then echo "FALTAN_CREDENCIALES"; exit 1; fi
for s in buc cuc val bog; do
  H=master-$s
  printf "%-4s " "$s"
  R=$(curl -sk --max-time 20 -X POST "https://$H.udes.edu.co:81/master/mod_auth/login/" \
    -H 'Content-Type: application/json;charset=UTF-8' \
    -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
  CODE=$(printf '%s' "$R" | sed -n 's/.*"code":\([0-9]*\).*/\1/p')
  if [ "$CODE" != "200" ]; then
    MSJ=$(printf '%s' "$R" | sed -n 's/.*"msg":"\([^"]*\)".*/\1/p' | head -c 80)
    echo "LOGIN_RECHAZADO (code=${CODE:-sin-respuesta} ${MSJ})"
    continue
  fi
  TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  API=$(printf '%s' "$R" | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')
  PERIODO=$(curl -sk --max-time 20 "https://$H.udes.edu.co:81/master/mod_auth/current_period/?token=$TOKEN&api_key=$API" 2>/dev/null \
    | sed -n 's/.*"period":"\([^"]*\)".*/\1/p')
  if [ -n "$PERIODO" ]; then echo "LOGIN_OK periodo=$PERIODO"; else echo "LOGIN_OK_SIN_PERIODO"; fi
  curl -sk --max-time 15 "https://$H.udes.edu.co:81/master/mod_auth/logout/?token=$TOKEN&api_key=$API" >/dev/null 2>&1
done
