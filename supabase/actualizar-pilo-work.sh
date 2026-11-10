#!/usr/bin/env bash
# Actualiza en producción (pila exc75yz…) las funciones pilo-work y pw-microsoft, con respaldo y reinicio del
# contenedor de funciones. Esta versión agrega tiempos por fase a los registros (sin contenidos ni claves):
#   docker logs --since 10m supabase-edge-functions-exc75yzkfkbkoglxzpckecjp | grep -E "pilo-work|pw-microsoft"
# Los respaldos quedan FUERA de la carpeta de funciones (backups-funciones/), para que el runtime no los sirva.
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-work.sh
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/pw-nuevo && mkdir -p /tmp/pw-nuevo/pilo-work /tmp/pw-nuevo/pw-microsoft"
scp "$AQUI"/functions/pilo-work/*.ts "$SRV:/tmp/pw-nuevo/pilo-work/"
scp "$AQUI"/functions/pw-microsoft/*.ts "$SRV:/tmp/pw-nuevo/pw-microsoft/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/pw-nuevo

echo "2/3 Instalando…"
for f in pilo-work pw-microsoft; do
  [ -d "$BASE/$f" ] || { echo "FALTA la carpeta $f en el servidor: no se toca nada."; exit 1; }
done
mkdir -p "$RESP"
sed -i 's/\r$//' "$NUEVO"/pilo-work/*.ts "$NUEVO"/pw-microsoft/*.ts
for f in pilo-work pw-microsoft; do
  cp -a "$BASE/$f" "$RESP/$f"; echo "  respaldo: $RESP/$f"
  cp "$NUEVO/$f"/*.ts "$BASE/$f/"
  chown -R --reference="$RESP/$f" "$BASE/$f"
  ( cd "$NUEVO/$f" && sha256sum *.ts ) > /tmp/pw-hash-origen.txt
  ( cd "$BASE/$f" && sha256sum $(cd "$NUEVO/$f" && ls *.ts) ) > /tmp/pw-hash-destino.txt
  diff -q /tmp/pw-hash-origen.txt /tmp/pw-hash-destino.txt >/dev/null && echo "  $f: hashes iguales" || { echo "  $f: LOS HASHES NO COINCIDEN"; exit 1; }
done

echo "3/3 Reiniciando $CONT…"
docker restart "$CONT" >/dev/null
s=""; for i in $(seq 1 30); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
echo "  estado: $s"
rm -rf "$NUEVO" /tmp/pw-hash-origen.txt /tmp/pw-hash-destino.txt
echo
echo "Para volver atrás: copie $RESP/pilo-work y $RESP/pw-microsoft sobre $BASE y reinicie el contenedor."
REMOTO

scp "$TMPR" "$SRV:/tmp/pw-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/pw-remoto.sh $STAMP; rm -f /tmp/pw-remoto.sh"
rm -f "$TMPR"
echo "Listo. Pruebe Pilo At Work (el chat y la vista Correo) y luego pida los registros:"
echo "  ssh $SRV \"sudo docker logs --since 10m supabase-edge-functions-exc75yzkfkbkoglxzpckecjp 2>&1 | grep -E 'pilo-work|pw-microsoft'\""
