#!/bin/bash
# Login de la cuenta de servicio a las tres plataformas por sede, desde el contenedor.
# Nunca imprime credenciales ni tokens.
U="$WAREHOUSE_MASTER_USER"
P="$WAREHOUSE_MASTER_PASSWORD"
[ -z "$U" ] || [ -z "$P" ] && { echo "FALTAN_CREDENCIALES"; exit 1; }
for s in buc cuc val bog; do
  H=master-$s.udes.edu.co
  for sis in master galileo davinci; do
    printf "%-4s %-8s " "$s" "$sis"
    BODY=$(printf '{"login":"%s","password":"%s"}' "$U" "$P")
    LEN=${#BODY}
    R=$(printf 'POST /%s/mod_auth/login/ HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json;charset=UTF-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' "$sis" "$H" "$LEN" "$BODY" \
      | timeout 25 openssl s_client -quiet -connect "$H:81" -servername "$H" 2>/dev/null)
    CODE=$(printf '%s' "$R" | grep -o '"code": *[0-9]*' | grep -o '[0-9]*$' | head -1)
    HAS_TOKEN=$(printf '%s' "$R" | grep -c '"access_token"')
    echo "code=${CODE:-?} token=$HAS_TOKEN"
  done
done
