#!/usr/bin/env bash
# Pilo · completa la cadena del certificado *.udes.edu.co (agrega el intermedio de GoDaddy) en el proxy de Coolify (Traefik).
#   Por qué: el servidor entrega solo la hoja y los clientes estrictos (Deno, curl, Node) no pueden verificarla; por eso `pilo-roomy`
#   no alcanza a Aluna. Los navegadores lo resuelven solos, así que nada de lo que hoy funciona cambia.
#   Seguridad: copia de la hoja en /data/coolify/proxy/backups/, el intermedio se verifica contra la hoja ANTES de instalarlo,
#   y si el sitio deja de responder o la cadena no sale completa, se restaura la copia.
#   Si hace falta, reinicia coolify-proxy: los sitios del servidor se cortan unos segundos. Hágalo en un momento tranquilo.
# Uso, desde la carpeta del proyecto:  bash supabase/agregar-intermedio-tls.sh
set -euo pipefail
SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
INTER="$AQUI/certificados/godaddy-gdig2-intermedio.pem"
[ -f "$INTER" ] || { echo "Falta $INTER"; exit 1; }
openssl x509 -in "$INTER" -noout -subject | grep -q "Go Daddy Secure Certificate Authority - G2" || { echo "El archivo no es el intermedio esperado."; exit 1; }
STAMP="$(date +%Y%m%d-%H%M)"
TMPR="$(mktemp)"

echo "1/2 Copiando el intermedio al servidor (carpeta temporal)…"
scp -q "$INTER" "$SRV:/tmp/gdig2.pem"

cat > "$TMPR" <<'REMOTO'
set -uo pipefail
STAMP="$1"
F=/data/coolify/proxy/certs/udes.edu.co.crt
INTER=/tmp/gdig2.pem
RESP=/data/coolify/proxy/backups/udes.edu.co.crt.$STAMP
H=planeacion.udes.edu.co
NUEVO=/tmp/udes-cadena.crt

cadena() { openssl s_client -connect 127.0.0.1:443 -servername $H -showcerts </dev/null 2>/dev/null | grep -c -E "^ *[0-9]+ s:"; }
volver() { echo "  RESTAURANDO la copia…"; cp -a "$RESP" "$F"; docker restart coolify-proxy >/dev/null; sleep 12; echo "  restaurado. Cadena servida: $(cadena) certificado(s)"; rm -f "$INTER" "$NUEVO"; exit 1; }

[ -f "$F" ] || { echo "No existe $F"; exit 1; }
n=$(grep -c "BEGIN CERTIFICATE" "$F")
echo "  $F trae $n certificado(s); el servidor entrega ahora $(cadena)."
[ "$n" -ge 2 ] && { echo "  Ya tiene la cadena en el archivo. No hago nada."; rm -f "$INTER"; exit 0; }

echo "2/2 Verificando que el intermedio sirve para ESTA hoja…"
openssl x509 -in "$F" -noout -subject -enddate | sed 's/^/  /'
HOJA=/tmp/udes-hoja.crt; cp "$F" "$HOJA"
if ! openssl verify -untrusted "$INTER" "$HOJA" 2>&1 | tee /tmp/udes-verif.txt | grep -q ": OK"; then
  cat /tmp/udes-verif.txt | sed 's/^/  /'; echo "  El intermedio NO valida la hoja con las raíces de este servidor. No se instala nada."; rm -f "$INTER" "$HOJA" /tmp/udes-verif.txt; exit 1
fi
echo "  OK: la hoja verifica con el intermedio."
rm -f "$HOJA" /tmp/udes-verif.txt

mkdir -p /data/coolify/proxy/backups; cp -a "$F" "$RESP"; echo "  copia: $RESP"
{ cat "$F"; printf '\n'; cat "$INTER"; } | sed 's/\r$//' | awk 'NF' > "$NUEVO"
[ "$(grep -c 'BEGIN CERTIFICATE' "$NUEVO")" = "2" ] || { echo "  El archivo nuevo no quedó con 2 certificados. No se instala."; rm -f "$INTER" "$NUEVO"; exit 1; }
cat "$NUEVO" > "$F"
echo "  instalado (el archivo conserva dueño y permisos). Esperando a que Traefik lo lea…"
touch /data/coolify/proxy/dynamic/udes-certificates.yaml /data/coolify/proxy/dynamic/SSL.yaml 2>/dev/null; sleep 6
if [ "$(cadena)" -lt 2 ]; then
  echo "  Traefik no lo tomó solo: reinicio coolify-proxy (corte de unos segundos)…"
  docker restart coolify-proxy >/dev/null
  for i in $(seq 1 30); do sleep 2; [ "$(docker inspect -f '{{.State.Running}}' coolify-proxy 2>/dev/null)" = "true" ] && [ "$(cadena)" -ge 1 ] && break; done
fi
sleep 3
c=$(cadena); echo "  Certificados que entrega ahora: $c"
[ "$c" -ge 2 ] || { echo "  La cadena no salió completa."; volver; }
# El sitio tiene que seguir respondiendo y ahora SIN saltarse la verificación.
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' --resolve "$H:443:127.0.0.1" "https://$H/" 2>/dev/null || echo 000)
echo "  https://$H/ sin -k -> HTTP $code"
case "$code" in 000) echo "  El sitio no responde o el certificado sigue sin verificar."; volver;; esac
p=$(curl -s -m 15 -o /tmp/pp.txt -w '%{http_code}' --resolve "$H:443:127.0.0.1" -X POST "https://$H/2/functions/v1/pilo-puente" -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo 000)
echo "  pilo-puente sin -k -> HTTP $p  $(head -c 80 /tmp/pp.txt 2>/dev/null)"; rm -f /tmp/pp.txt
[ "$p" = "000" ] && { echo "  Sigue sin verificar."; volver; }
rm -f "$INTER" "$NUEVO"
echo "LISTO. Copia por si hiciera falta volver: $RESP"
REMOTO
scp -q "$TMPR" "$SRV:/tmp/pilotlsfix.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pilotlsfix.sh $STAMP; rm -f /tmp/pilotlsfix.sh /tmp/gdig2.pem"
rm -f "$TMPR"
