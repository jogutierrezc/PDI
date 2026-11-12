#!/usr/bin/env bash
# Pilo Astra 1.0 en producción (pila exc75yz…):
#   - migración 0278: columnas astra_* en pw_config, astra_aviso_visto_en en pw_perfiles,
#     pw_astra_publica() y pw_astra_aviso_visto() (idempotente, una transacción, apagado por defecto)
#   - función de borde `pilo-work` (index.ts y proveedor.ts), con respaldo FUERA de la carpeta de
#     funciones, un reinicio del contenedor y una prueba de arranque
#   - la web (el chat, el aviso y el panel de administración) NO sube con este script: se despliega
#     desde git (Coolify con el Dockerfile). Con --publicar-web este script hace el commit de los
#     archivos de Astra y el push, pidiéndole confirmación antes.
#
# Uso, desde la carpeta del proyecto (pide la contraseña de «administrador» varias veces: ssh, scp y sudo):
#   bash supabase/actualizar-pilo-astra.sh                 (pruebas locales, migración y función)
#   bash supabase/actualizar-pilo-astra.sh --solo-sql      (solo la migración)
#   bash supabase/actualizar-pilo-astra.sh --solo-funcion  (solo la función; la migración ya debe estar)
#   bash supabase/actualizar-pilo-astra.sh --sin-pruebas   (omite tsc y vitest locales)
#   bash supabase/actualizar-pilo-astra.sh --publicar-web  (además, commit y push de la web de Astra)
# Las opciones se pueden combinar.
#
# Después: en /admin/pilo-work, tarjeta «Pilo Astra 1.0» → habilitar, «Probar Pilo Astra 1.0».
# Astra viene APAGADO: nadie lo ve hasta que la administración lo habilite.
set -euo pipefail

SRV="administrador@planeacion.udes.edu.co"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ_PROYECTO="$(cd "$AQUI/.." && pwd)"
TMPR="$(mktemp)"
STAMP="$(date +%Y%m%d-%H%M)"

SQL=1; FUNCION=1; PRUEBAS=1; WEB=0
for a in "$@"; do
  case "$a" in
    --solo-sql) FUNCION=0 ;;
    --solo-funcion) SQL=0 ;;
    --sin-pruebas) PRUEBAS=0 ;;
    --publicar-web) WEB=1 ;;
    -h|--help) sed -n 2,22p "$0"; exit 0 ;;
    *) echo "Opción desconocida: $a (use --help)"; exit 1 ;;
  esac
done
[ "$SQL" = 0 ] && [ "$FUNCION" = 0 ] && { echo "Nada que hacer: --solo-sql y --solo-funcion a la vez."; exit 1; }

# Archivos de la web que forman parte de Pilo Astra (los únicos que --publicar-web sube).
WEB_ARCHIVOS=(
  "src/modules/pilo-work/astra.ts"
  "src/modules/pilo-work/astra.test.ts"
  "src/modules/pilo-work/vistas/Astra.tsx"
  "src/modules/pilo-work/vistas/Chat.tsx"
  "src/modules/pilo-work/ui.tsx"
  "src/modules/pilo-work/PiloWork.tsx"
  "src/modules/pilo-work/work.css"
  "src/modules/admin/pilo-work/PiloWorkSettings.tsx"
  "public/pilo-moods/astronauta-160.webp"
  "public/pilo-moods/astronauta-320.webp"
  "public/pilo-moods/astronauta-640.webp"
  "supabase/migrations/0278_pw_astra.sql"
  "supabase/functions/pilo-work/index.ts"
  "supabase/functions/pilo-work/proveedor.ts"
  "supabase/actualizar-pilo-astra.sh"
)

# ---------------------------------------------------------------------------------------------
if [ "$PRUEBAS" = 1 ]; then
  echo "0/3 Pruebas locales (tipos y pruebas de Astra)…"
  ( cd "$RAIZ_PROYECTO" && [ -d node_modules ] || npm ci --no-audit --no-fund )
  ( cd "$RAIZ_PROYECTO" && npx tsc --noEmit -p tsconfig.json && npx vitest run src/modules/pilo-work ) \
    || { echo "Las pruebas locales fallaron: no se sube nada."; exit 1; }
  echo "  tipos y pruebas: bien"
fi

echo "1/3 Copiando archivos al servidor (carpeta temporal)…"
ssh "$SRV" "rm -rf /tmp/astra-nuevo && mkdir -p /tmp/astra-nuevo/pilo-work"
[ "$SQL" = 1 ] && scp "$AQUI/migrations/0278_pw_astra.sql" "$SRV:/tmp/astra-nuevo/"
[ "$FUNCION" = 1 ] && scp "$AQUI"/functions/pilo-work/*.ts "$SRV:/tmp/astra-nuevo/pilo-work/"

cat > "$TMPR" <<'REMOTO'
set -euo pipefail
STAMP="$1"; SQL="$2"; FUNCION="$3"
RAIZ=/data/coolify/services/exc75yzkfkbkoglxzpckecjp
BASE=$RAIZ/volumes/functions
RESP=$RAIZ/backups-funciones/$STAMP
CONT=supabase-edge-functions-exc75yzkfkbkoglxzpckecjp
DB=supabase-db-exc75yzkfkbkoglxzpckecjp
NUEVO=/tmp/astra-nuevo
psqlq() { docker exec -i "$DB" psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu() { docker exec -i "$DB" psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }
psqlsu -c "select 1" >/dev/null 2>&1 || psqlsu() { psqlq "$@"; }

if [ "$SQL" = 1 ]; then
  echo "2/3 Comprobando la base y aplicando 0278…"
  [ "$(psqlq -c "select to_regclass('public.pw_config') is not null and to_regclass('public.pw_perfiles') is not null and to_regprocedure('public.pw_mi_nivel()') is not null")" = "t" ] \
    || { echo "FALTAN las migraciones 0243-0261 (Pilo at Work): no se aplica nada."; exit 1; }
  sed -i 's/\r$//' "$NUEVO"/*.sql
  DUENO=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.pw_config')")
  DUENO2=$(psqlq -c "select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('public.pw_perfiles')")
  [ "$DUENO" = "$DUENO2" ] || { echo "pw_config ($DUENO) y pw_perfiles ($DUENO2) tienen distinto dueño: no se aplica nada."; exit 1; }
  echo "  dueño de pw_config y pw_perfiles: $DUENO"
  { echo "set role \"$DUENO\";"; cat "$NUEVO/0278_pw_astra.sql"; } | psqlsu -1 2>&1 | grep -v '^$' | sed 's/^/    /' || true
  COLS=$(psqlq -c "select count(*) from information_schema.columns where table_schema='public' and table_name='pw_config' and column_name like 'astra\_%'")
  [ "$COLS" = "11" ] && echo "  pw_config: 11 columnas astra_*" || { echo "  pw_config tiene $COLS columnas astra_* (se esperaban 11): la migración falló, revise los mensajes de arriba."; exit 1; }
  [ "$(psqlq -c "select to_regprocedure('public.pw_astra_publica()') is not null and to_regprocedure('public.pw_astra_aviso_visto()') is not null")" = "t" ] \
    && echo "  funciones pw_astra_publica y pw_astra_aviso_visto: listas" || { echo "  faltan las funciones de Astra"; exit 1; }
  echo "  Astra habilitado: $(psqlq -c "select astra_habilitado from public.pw_config where id = 1")  (debe seguir en f hasta que la administración lo habilite)"
else
  echo "2/3 La migración no se toca (--solo-funcion)."
fi

if [ "$FUNCION" = 1 ]; then
  echo "3/3 Instalando la función pilo-work (respaldo en $RESP)…"
  [ -d "$BASE/pilo-work" ] || { echo "FALTA la carpeta pilo-work en el servidor: no se toca nada."; exit 1; }
  [ "$(psqlq -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='pw_config' and column_name='astra_habilitado')")" = "t" ] \
    || { echo "La migración 0278 no está aplicada: la función no se instala (Astra quedaría sin configuración)."; exit 1; }
  mkdir -p "$RESP"
  sed -i 's/\r$//' "$NUEVO"/pilo-work/*.ts
  cp -a "$BASE/pilo-work" "$RESP/pilo-work"; echo "  respaldo: $RESP/pilo-work"
  cp "$NUEVO"/pilo-work/*.ts "$BASE/pilo-work/"
  chown -R --reference="$RESP/pilo-work" "$BASE/pilo-work"
  ( cd "$NUEVO/pilo-work" && sha256sum *.ts ) > /tmp/astra-hash-o.txt
  ( cd "$BASE/pilo-work" && sha256sum $(cd "$NUEVO/pilo-work" && ls *.ts) ) > /tmp/astra-hash-d.txt
  diff -q /tmp/astra-hash-o.txt /tmp/astra-hash-d.txt >/dev/null && echo "  hashes iguales" || { echo "  LOS HASHES NO COINCIDEN"; exit 1; }
  docker restart "$CONT" >/dev/null; echo "  reiniciando $CONT…"
  s=""; for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' "$CONT" 2>/dev/null || echo ""); [ "$s" = "healthy" ] && break; sleep 2; done
  echo "  estado: $s"
  sleep 3
  ANON=$(docker exec "$CONT" printenv SUPABASE_ANON_KEY 2>/dev/null || true)
  c=$(curl -s -o /tmp/astra-resp.txt -m 30 -w '%{http_code}' -X POST "https://planeacion.udes.edu.co/functions/v1/pilo-work" -H 'Content-Type: application/json' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"action":"estado"}' 2>/dev/null || echo 000)
  case "$c" in 400|401|403) echo "  OK pilo-work ($c) $(head -c 90 /tmp/astra-resp.txt)";; *) echo "  MAL pilo-work ($c) $(head -c 160 /tmp/astra-resp.txt)";; esac
  rm -f /tmp/astra-hash-o.txt /tmp/astra-hash-d.txt /tmp/astra-resp.txt
  echo "  Para volver atrás: copie $RESP/pilo-work sobre $BASE/pilo-work y reinicie el contenedor."
else
  echo "3/3 La función de borde no se toca (--solo-sql)."
fi
rm -rf "$NUEVO"
REMOTO

scp "$TMPR" "$SRV:/tmp/astra-remoto.sh"
echo "Ahora sudo (pide la contraseña otra vez)…"
ssh -t "$SRV" "sudo bash /tmp/astra-remoto.sh $STAMP $SQL $FUNCION; rm -f /tmp/astra-remoto.sh"
rm -f "$TMPR"

# ---------------------------------------------------------------------------------------------
if [ "$WEB" = 1 ]; then
  echo
  echo "Web: se subirán SOLO estos archivos de Pilo Astra (nada más del árbol de trabajo):"
  ( cd "$RAIZ_PROYECTO" && printf '  %s\n' "${WEB_ARCHIVOS[@]}" && echo && git status --short -- "${WEB_ARCHIVOS[@]}" )
  RAMA="$(cd "$RAIZ_PROYECTO" && git branch --show-current)"
  read -r -p "¿Hacer commit y push a origin/$RAMA? (escriba «si»): " R
  if [ "$R" = "si" ]; then
    ( cd "$RAIZ_PROYECTO" && git add -- "${WEB_ARCHIVOS[@]}" && git commit -m "feat: Pilo Astra 1.0 en Pilo at Work (selector, aviso, administración y servidor)" && git push origin "$RAMA" )
    echo "Web enviada. Coolify compila y publica; espere a que termine el despliegue."
  else
    echo "No se subió la web."
  fi
else
  echo
  echo "La web no se sube con este script. Para publicarla: bash supabase/actualizar-pilo-astra.sh --solo-funcion --sin-pruebas --publicar-web"
  echo "(o haga commit y push de los archivos de Pilo Astra, y Coolify la compila)."
fi

echo
echo "Listo. Siguiente:"
echo "  1. Recargue con Ctrl+F5 y abra /admin/pilo-work → «Pilo Astra 1.0»."
echo "  2. Compruebe que el servidor de voz (Mr. Pilo → voz) tiene la dirección https vigente y la clave."
echo "     En su Mac debe estar encendido Ollama con el alias pilo-astra:1.0 y el proxy con el túnel."
echo "  3. Pulse «Probar Pilo Astra 1.0»; si responde, active «Habilitar Pilo Astra 1.0»."
