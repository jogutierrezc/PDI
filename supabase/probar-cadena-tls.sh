#!/usr/bin/env bash
# Pilo · ¿el servidor entrega la cadena completa de certificados de planeacion.udes.edu.co? Solo lee; no cambia nada.
#   bash supabase/probar-cadena-tls.sh
set -euo pipefail
SRV="administrador@planeacion.udes.edu.co"
TMPR="$(mktemp)"
cat > "$TMPR" <<'REMOTO'
H=planeacion.udes.edu.co
echo "== Certificados que entrega el servidor (de la hoja hacia la raíz) =="
openssl s_client -connect 127.0.0.1:443 -servername $H -showcerts </dev/null 2>/dev/null | grep -E "^ *[0-9]+ s:|^ *i:|Verify return code|Verification" | sed 's/^/  /'
echo
echo "== Quién lo emitió y cuándo vence =="
openssl s_client -connect 127.0.0.1:443 -servername $H </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates | sed 's/^/  /'
echo
echo "== ¿Dónde se ve ese certificado? (Traefik/Coolify) =="
docker ps --format '  {{.Names}}  {{.Image}}' | grep -i -E "traefik|proxy|caddy|nginx" | grep -v imgproxy | head -3
REMOTO
scp -q "$TMPR" "$SRV:/tmp/pilotls.sh"
ssh -t "$SRV" "sudo bash /tmp/pilotls.sh; rm -f /tmp/pilotls.sh"
rm -f "$TMPR"
