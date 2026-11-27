#!/bin/bash
# Sube la búsqueda por significado con el servidor de Pilo Astra (0298):
#   1. aplica la migración 0298 (columna embed_provider) en la base del servidor;
#   2. sube pilo-work (trae proveedor.ts, que pilo-ia importa) sin reiniciar;
#   3. sube pilo-ia y reinicia el contenedor de funciones.
#
# Uso (en el Mac, desde cualquier carpeta):
#   SERVIDOR=usuario@direccion-del-servidor scripts/subir-embeddings-astra.sh
#
# Variables opcionales:
#   SERVIDOR      usuario@host por SSH (obligatoria)
#   CONTENEDOR    contenedor de funciones (por defecto: supabase-edge-functions*)
#   CONTENEDOR_DB contenedor de la base (por defecto: supabase-db*)
#   SIN_MIGRACION=1  no aplica la 0298 (por ejemplo, si ya la pegó en el editor SQL)
#
# Pide la contraseña de sudo del servidor cuando haga falta. No guarda ninguna clave.
set -euo pipefail

[ -n "${SERVIDOR:-}" ] || { echo "Falta SERVIDOR=usuario@host"; exit 1; }

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
MIGRACION="$RAIZ/supabase/migrations/0298_pilo_embeddings_astra.sql"
SUBIR="$RAIZ/scripts/subir-funcion.sh"
[ -f "$MIGRACION" ] || { echo "No existe $MIGRACION"; exit 1; }
[ -x "$SUBIR" ] || chmod +x "$SUBIR"

# 1. La migración: se copia y se corre con psql dentro del contenedor de la base.
if [ -z "${SIN_MIGRACION:-}" ]; then
  echo "== 1/3 · Migración 0298"
  SQL_REMOTO="/tmp/0298-$$.sql"
  scp -q "$MIGRACION" "$SERVIDOR:$SQL_REMOTO"
  ssh -t "$SERVIDOR" "set -e
    DB='${CONTENEDOR_DB:-}'
    [ -n \"\$DB\" ] || DB=\"\$(sudo docker ps --format '{{.Names}}' | grep '^supabase-db' | head -1)\"
    [ -n \"\$DB\" ] || { echo 'No encontré el contenedor de la base (pase CONTENEDOR_DB=...)'; rm -f $SQL_REMOTO; exit 1; }
    echo \"→ Base: \$DB\"
    sudo docker cp $SQL_REMOTO \"\$DB\":/tmp/0298.sql
    rm -f $SQL_REMOTO
    sudo docker exec \"\$DB\" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/0298.sql
    sudo docker exec \"\$DB\" rm -f /tmp/0298.sql
    # Que PostgREST vea la columna nueva sin esperar.
    sudo docker exec \"\$DB\" psql -U postgres -d postgres -c \"notify pgrst, 'reload schema';\" >/dev/null
    echo '→ Migración 0298 aplicada.'"
else
  echo "== 1/3 · Migración 0298: omitida (SIN_MIGRACION=1)"
fi

# 2. pilo-work: solo copiar (su proveedor.ts lo usa pilo-ia); el reinicio va con pilo-ia.
echo "== 2/3 · pilo-work (proveedor.ts)"
SIN_REINICIO=1 "$SUBIR" pilo-work

# 3. pilo-ia, y se reinicia el contenedor una sola vez.
echo "== 3/3 · pilo-ia"
SIN_REINICIO="" "$SUBIR" pilo-ia

cat <<'FIN'

✓ Listo. Falta, en Mr. Pilo › Búsqueda por significado › Opciones avanzadas:
  1. «De dónde salen los embeddings» → El servidor de Pilo Astra (Ollama).
  2. Modelo: bge-m3 (o el que instaló; debe dar 1024 dimensiones o más).
  3. Guardar y pulsar «Indexar por significado».
Si el indexado dice 404, el proxy de Astra no deja pasar /v1/embeddings.
FIN
