#!/usr/bin/env bash
# Pilo · ¿dónde guarda Traefik (Coolify) el certificado *.udes.edu.co? Solo lee; no cambia nada.
#   bash supabase/buscar-certificado-proxy.sh
set -euo pipefail
SRV="administrador@planeacion.udes.edu.co"
TMPR="$(mktemp)"
cat > "$TMPR" <<'REMOTO'
P=/data/coolify/proxy
echo "== Carpetas del proxy =="; ls -la $P 2>&1 | head -20
echo; echo "== Configuración dinámica que habla de certificados =="
grep -rn -i -E "certFile|keyFile|tls:|certificates" $P/dynamic 2>/dev/null | head -20
echo; echo "== Archivos de certificados =="
find $P /data/coolify -maxdepth 4 \( -name "*.crt" -o -name "*.pem" -o -name "*.cer" \) 2>/dev/null | grep -v -E "/backups|node_modules" | head -20
echo; echo "== De esos, el que dice *.udes.edu.co y cuántos certificados trae =="
for f in $(find $P /data/coolify -maxdepth 4 \( -name "*.crt" -o -name "*.pem" -o -name "*.cer" \) 2>/dev/null | grep -v -E "/backups|node_modules" | head -30); do
  n=$(grep -c "BEGIN CERTIFICATE" "$f" 2>/dev/null || echo 0)
  s=$(openssl x509 -in "$f" -noout -subject 2>/dev/null | head -1)
  [ -n "$s" ] && echo "  $f  ($n certificado(s))  $s"
done
echo; echo "== Cómo arranca Traefik =="
docker inspect coolify-proxy -f '{{range .Mounts}}  {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null | grep -i -E "proxy|ssl|cert" | head
REMOTO
scp -q "$TMPR" "$SRV:/tmp/piloprox.sh"
ssh -t "$SRV" "sudo bash /tmp/piloprox.sh; rm -f /tmp/piloprox.sh"
rm -f "$TMPR"
