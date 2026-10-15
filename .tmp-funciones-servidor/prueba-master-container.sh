#!/bin/bash
# Prueba desde DENTRO del contenedor edge-runtime (el entorno real de la función).
# TCP por bash /dev/tcp + login TLS por openssl s_client. Nunca imprime credenciales ni tokens.
U="$WAREHOUSE_MASTER_USER"
P="$WAREHOUSE_MASTER_PASSWORD"
[ -z "$U" ] || [ -z "$P" ] && { echo "FALTAN_CREDENCIALES"; exit 1; }
for s in buc cuc val bog; do
  H=master-$s.udes.edu.co
  printf "%-4s " "$s"
  timeout 6 bash -c "echo > /dev/tcp/$H/81" 2>/dev/null || { echo "TCP_81_CERRADO"; continue; }
  BODY=$(printf '{"login":"%s","password":"%s"}' "$U" "$P")
  LEN=${#BODY}
  R=$(printf 'POST /master/mod_auth/login/ HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json;charset=UTF-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' "$H" "$LEN" "$BODY" \
    | timeout 25 openssl s_client -quiet -connect "$H:81" -servername "$H" 2>/dev/null)
  HTTP=$(printf '%s' "$R" | head -1 | tr -d '\r')
  CODE=$(printf '%s' "$R" | grep -o '"code": *[0-9]*' | grep -o '[0-9]*$' | head -1)
  HAS_TOKEN=$(printf '%s' "$R" | grep -c '"access_token"')
  echo "tcp81=ABIERTO http=${HTTP%% *} code=${CODE:-?} token=${HAS_TOKEN}"
done
