#!/bin/bash
# Sube una función de supabase/functions/<nombre> al servidor propio (Supabase autoalojado en
# Coolify, donde no existe `supabase functions deploy`) y reinicia el contenedor de funciones.
#
# Uso (desde cualquier carpeta, en el Mac):
#   SERVIDOR=usuario@direccion-del-servidor scripts/subir-funcion.sh pilo-work
#
# Variables opcionales:
#   SERVIDOR    usuario@host por SSH (obligatoria)
#   CONTENEDOR  nombre del contenedor (por defecto: el que empieza por supabase-edge-functions)
#   SIN_REINICIO=1  copia los archivos pero no reinicia el contenedor
#
# Pide la contraseña de sudo del servidor cuando haga falta. No guarda ninguna clave.
set -euo pipefail

FN="${1:-}"
[ -n "$FN" ] || { echo "Uso: SERVIDOR=usuario@host $0 <nombre-de-la-funcion>  (ej. pilo-work)"; exit 1; }
[ -n "${SERVIDOR:-}" ] || { echo "Falta SERVIDOR=usuario@host"; exit 1; }

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ORIGEN="$RAIZ/supabase/functions/$FN"
[ -d "$ORIGEN" ] || { echo "No existe $ORIGEN"; exit 1; }
[ -f "$ORIGEN/index.ts" ] || { echo "$ORIGEN no tiene index.ts"; exit 1; }

PAQUETE="/tmp/subir-$FN-$$.tgz"
trap 'rm -f "$PAQUETE"' EXIT
tar -czf "$PAQUETE" -C "$ORIGEN" .
echo "→ Paquete de $FN: $(ls "$ORIGEN" | tr '\n' ' ')"

scp -q "$PAQUETE" "$SERVIDOR:$PAQUETE"

# Parte remota: halla la carpeta de funciones montada en el contenedor, respalda y copia.
ssh -t "$SERVIDOR" bash -s -- "$FN" "$PAQUETE" "${CONTENEDOR:-}" "${SIN_REINICIO:-}" <<'REMOTO'
set -euo pipefail
FN="$1"; PAQUETE="$2"; CONTENEDOR="$3"; SIN_REINICIO="$4"
trap 'rm -f "$PAQUETE"' EXIT

[ -n "$CONTENEDOR" ] || CONTENEDOR="$(sudo docker ps --format '{{.Names}}' | grep '^supabase-edge-functions' | head -1)"
[ -n "$CONTENEDOR" ] || { echo "No encontré el contenedor de funciones (pase CONTENEDOR=...)"; exit 1; }

CARPETA="$(sudo docker inspect "$CONTENEDOR" --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}')"
[ -n "$CARPETA" ] && [ -d "$CARPETA" ] || { echo "No encontré la carpeta de funciones del contenedor $CONTENEDOR"; exit 1; }
echo "→ Contenedor: $CONTENEDOR"
echo "→ Carpeta:    $CARPETA/$FN"

DESTINO="$CARPETA/$FN"
sudo mkdir -p "$DESTINO"
if [ -n "$(sudo ls -A "$DESTINO")" ]; then
  RESPALDO="$CARPETA/$FN.bak-$(date +%Y%m%d-%H%M%S)"
  sudo cp -a "$DESTINO" "$RESPALDO"
  echo "→ Respaldo:   $RESPALDO"
fi
sudo tar -xzf "$PAQUETE" -C "$DESTINO"
echo "→ Archivos copiados."

if [ -z "$SIN_REINICIO" ]; then
  sudo docker restart "$CONTENEDOR" >/dev/null
  echo "→ Contenedor reiniciado."
fi
REMOTO

echo "✓ $FN subida. Pruebe en el chat de At Work."
