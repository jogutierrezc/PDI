#!/bin/sh
# Diagnóstico: qué responde Master al login (sin imprimir credenciales ni token completo).
U="$WAREHOUSE_MASTER_USER"
P="$WAREHOUSE_MASTER_PASSWORD"
echo "usuario_longitud=${#U}"
H=master-buc
curl -sk --max-time 20 -o /tmp/r.json -w "HTTP=%{http_code}\n" -X POST "https://$H.udes.edu.co:81/master/mod_auth/login/" \
  -H 'Content-Type: application/json;charset=UTF-8' \
  -d "{\"login\":\"$U\",\"password\":\"$P\"}"
echo "--- cuerpo (primeros 300, token enmascarado) ---"
head -c 300 /tmp/r.json | sed 's/"access_token":"[^"]*"/"access_token":"***"/; s/"api_key":"[^"]*"/"api_key":"***"/'
echo
rm -f /tmp/r.json
