#!/bin/sh
# Prueba de la cuenta de servicio de Master por sede: login -> periodo abierto -> logout.
# Nunca imprime usuario, clave ni token.
U="$WAREHOUSE_MASTER_USER"
P="$WAREHOUSE_MASTER_PASSWORD"
if [ -z "$U" ] || [ -z "$P" ]; then echo "FALTAN_CREDENCIALES"; exit 1; fi
for s in buc cuc val bog; do
  case $s in
    buc) H=master-buc ;;
    cuc) H=master-cuc ;;
    val) H=master-val ;;
    bog) H=master-bog ;;
  esac
  printf "%-4s " "$s"
  R=$(curl -sk --max-time 20 -X POST "https://$H.udes.edu.co:81/master/mod_auth/login/" \
    -H 'Content-Type: application/json;charset=UTF-8' \
    -d "{\"login\":\"$U\",\"password\":\"$P\"}" 2>/dev/null)
  CODE=$(printf '%s' "$R" | sed -n 's/.*"code":\([0-9]*\).*/\1/p')
  if [ "$CODE" != "200" ]; then echo "LOGIN_RECHAZADO (code=$CODE)"; continue; fi
  TOKEN=$(printf '%s' "$R" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  API=$(printf '%s' "$R" | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')
  PR=$(curl -sk --max-time 20 "https://$H.udes.edu.co:81/master/mod_auth/current_period/?token=$TOKEN&api_key=$API" 2>/dev/null)
  PERIODO=$(printf '%s' "$PR" | sed -n 's/.*"period":"\([^"]*\)".*/\1/p')
  if [ -n "$PERIODO" ]; then echo "LOGIN_OK periodo=$PERIODO"; else echo "LOGIN_OK_SIN_PERIODO"; fi
  curl -sk --max-time 15 "https://$H.udes.edu.co:81/master/mod_auth/logout/?token=$TOKEN&api_key=$API" >/dev/null 2>&1
done
