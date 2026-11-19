#!/usr/bin/env bash
# Pilo · ¿por qué el servidor no alcanza a Aluna por su dirección pública? Solo lee; no cambia nada ni muestra secretos.
#   bash supabase/probar-red-aluna.sh
set -euo pipefail
SRV="administrador@planeacion.udes.edu.co"
TMPR="$(mktemp)"
cat > "$TMPR" <<'REMOTO'
H=planeacion.udes.edu.co
R=/2/functions/v1/pilo-puente
CUERPO='{"accion":"estado","correo":"diagnostico@mail.udes.edu.co"}'
echo "== 1. Nombre =="
echo "  resuelve a: $(getent hosts $H | awk '{print $1}' | head -3 | tr '\n' ' ')"
echo "  IPs de este servidor: $(hostname -I 2>/dev/null)"
echo "== 2. Por el nombre público =="
curl -s -m 12 -o /dev/null -w "  HTTP %{http_code}\n" -X POST "https://$H$R" -H 'Content-Type: application/json' -d "$CUERPO" 2>&1 || true
curl -sS -m 12 -o /dev/null -X POST "https://$H$R" 2>&1 | head -2 | sed 's/^/  curl: /' || true
echo "== 3. Por esta misma máquina (sin salir a Internet), con el nombre de siempre =="
for ip in 127.0.0.1 $(hostname -I 2>/dev/null | awk '{print $1}'); do
  c=$(curl -sk -m 12 -o /tmp/d.txt -w '%{http_code}' --resolve "$H:443:$ip" -X POST "https://$H$R" -H 'Content-Type: application/json' -d "$CUERPO" 2>/dev/null) || c="fallo"
  echo "  vía $ip -> HTTP $c  $(head -c 90 /tmp/d.txt 2>/dev/null)"
done
rm -f /tmp/d.txt
echo "== 4. Redes de los dos contenedores de funciones (¿comparten alguna?) =="
for c in $(docker ps --format '{{.Names}}' | grep edge-functions); do echo "  $c: $(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' $c)"; done
echo "  proxy: $(docker ps --format '{{.Names}} {{.Ports}}' | grep -i -E 'proxy|traefik|caddy' | head -2)"
REMOTO
scp -q "$TMPR" "$SRV:/tmp/pilored.sh"
ssh -t "$SRV" "sudo bash /tmp/pilored.sh; rm -f /tmp/pilored.sh"
rm -f "$TMPR"
