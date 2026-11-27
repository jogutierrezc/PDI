#!/bin/bash
# Sube la búsqueda por significado con el servidor de Pilo Astra (0298):
#   1. busca la base de PDI (la supabase-db* que tiene pilo_ai_settings) y le aplica la 0298;
#   2. sube pilo-work (trae proveedor.ts, que pilo-ia importa) sin reiniciar;
#   3. sube pilo-ia y reinicia el contenedor de funciones de esa misma instalación.
#
# En Coolify puede haber varias instalaciones de Supabase: la base y las funciones de una
# misma instalación comparten el sufijo (supabase-db-XXXX, supabase-edge-functions-XXXX).
#
# Uso (en el Mac, desde cualquier carpeta):
#   SERVIDOR=usuario@direccion-del-servidor scripts/subir-embeddings-astra.sh
#
# Variables opcionales:
#   SERVIDOR      usuario@host por SSH (obligatoria)
#   CONTENEDOR_DB contenedor de la base (por defecto: el supabase-db* que tiene pilo_ai_settings)
#   CONTENEDOR    contenedor de funciones (por defecto: supabase-edge-functions con el mismo sufijo)
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

ID="$$"
SQL_REMOTO="/tmp/0298-$ID.sql"
REMOTO_SCRIPT="/tmp/0298-$ID.sh"
REMOTO_LOCAL="$(mktemp)"
SALIDA="$(mktemp)"
trap 'rm -f "$REMOTO_LOCAL" "$SALIDA"' EXIT

# Parte remota: halla la base de PDI, aplica la migración (si toca) y dice el sufijo de la instalación.
cat > "$REMOTO_LOCAL" <<'REMOTO'
set -euo pipefail
SQL="$1"; DB="${2:--}"; SIN_MIGRACION="${3:--}"
[ "$DB" != "-" ] || DB=""
[ "$SIN_MIGRACION" != "-" ] || SIN_MIGRACION=""
trap 'rm -f "$SQL"' EXIT

BASES="$(sudo docker ps --format '{{.Names}}' | grep '^supabase-db' || true)"
if [ -z "$DB" ]; then
  for c in $BASES; do
    tiene="$(sudo docker exec "$c" psql -U postgres -d postgres -tAc "select to_regclass('public.pilo_ai_settings') is not null" 2>/dev/null | tr -d '[:space:]' || true)"
    echo "  · $c: ${tiene:-sin respuesta}"
    if [ "$tiene" = "t" ]; then DB="$c"; break; fi
  done
fi
if [ -z "$DB" ]; then
  echo "Ninguna base supabase-db* tiene public.pilo_ai_settings. Bases encontradas:"
  echo "${BASES:-  (ninguna)}"
  echo "Pase CONTENEDOR_DB=<nombre> si la base de PDI tiene otro nombre."
  exit 1
fi
echo "→ Base de PDI: $DB"
DUENO="$(sudo docker exec "$DB" psql -U postgres -d postgres -tAc "select tableowner from pg_tables where schemaname = 'public' and tablename = 'pilo_ai_settings'" | tr -d '[:space:]')"
DUENO="${DUENO:-supabase_admin}"
echo "→ Dueño de pilo_ai_settings: $DUENO"

if [ -z "$SIN_MIGRACION" ]; then
  sudo docker cp "$SQL" "$DB":/tmp/0298.sql >/dev/null
  # Las tablas son de supabase_admin (postgres no es dueño): la migración va con ese usuario.
  sudo docker exec "$DB" psql -v ON_ERROR_STOP=1 -U "$DUENO" -d postgres -f /tmp/0298.sql
  sudo docker exec "$DB" rm -f /tmp/0298.sql
  # Que PostgREST vea la columna nueva sin esperar.
  sudo docker exec "$DB" psql -U "$DUENO" -d postgres -c "notify pgrst, 'reload schema';" >/dev/null
  echo "→ Migración 0298 aplicada."
else
  echo "→ Migración 0298 omitida (SIN_MIGRACION=1)."
fi
echo "SUFIJO=${DB#supabase-db}"
REMOTO

echo "== 1/3 · Base de PDI y migración 0298"
scp -q "$MIGRACION" "$SERVIDOR:$SQL_REMOTO"
scp -q "$REMOTO_LOCAL" "$SERVIDOR:$REMOTO_SCRIPT"
ssh -t "$SERVIDOR" "bash $REMOTO_SCRIPT '$SQL_REMOTO' '${CONTENEDOR_DB:--}' '${SIN_MIGRACION:--}'; r=\$?; rm -f $REMOTO_SCRIPT; exit \$r" | tee "$SALIDA"

SUFIJO="$(grep -a '^SUFIJO=' "$SALIDA" | tail -1 | tr -d '\r' | cut -d= -f2-)"
if [ -z "${CONTENEDOR:-}" ]; then
  [ -n "$SUFIJO" ] || { echo "No supe el sufijo de la instalación: pase CONTENEDOR=supabase-edge-functions-..."; exit 1; }
  CONTENEDOR="supabase-edge-functions$SUFIJO"
fi
export CONTENEDOR
echo "→ Funciones en: $CONTENEDOR"

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
