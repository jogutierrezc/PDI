#!/bin/bash
# Instala o actualiza el plugin local_pilo (Pilo en el Aula) en un servidor de Moodle por SSH,
# lo deja configurado y purga las cachés.
#
# Uso (en el Mac, desde cualquier carpeta):
#   SERVIDOR_MOODLE=usuario@aula.udes.edu.co SITIO=aula-bga scripts/subir-plugin-moodle.sh
#
# Variables:
#   SERVIDOR_MOODLE    usuario@host del servidor de Moodle por SSH (obligatoria)
#   SITIO              el id del sitio en Mr. Pilo en Enseñanza › Memoria › Moodle (obligatoria)
#   MOODLE_DIR         carpeta de Moodle en el servidor (la que tiene config.php). Por defecto se busca.
#   CONTENEDOR_MOODLE  si Moodle corre en Docker: el nombre del contenedor (MOODLE_DIR es la ruta dentro)
#   PHP_USER           usuario del servidor web (por defecto www-data)
#   URL_PILO           por defecto https://planeacion.udes.edu.co
#   ALCANCE            cursos (por defecto) o todo
#   SIN_CLAVE=1        no pide la clave: la pega usted en Moodle (Extensiones › Locales › Pilo en el Aula)
#
# La clave se pide dentro de la sesión SSH, sin que se vea: no queda en el historial, en la línea
# de comandos del servidor ni en ningún archivo. Pide sudo cuando hace falta.
set -euo pipefail

[ -n "${SERVIDOR_MOODLE:-}" ] || { echo "Falta SERVIDOR_MOODLE=usuario@host"; exit 1; }
[ -n "${SITIO:-}" ] || { echo "Falta SITIO=<id del sitio en Pilo>, por ejemplo aula-bga"; exit 1; }
[[ "$SITIO" =~ ^[a-z][a-z0-9-]{1,23}$ ]] || { echo "SITIO no es válido (minúsculas, números y guiones)"; exit 1; }
URL_PILO="${URL_PILO:-https://planeacion.udes.edu.co}"
ALCANCE="${ALCANCE:-cursos}"
PHP_USER="${PHP_USER:-www-data}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$RAIZ/moodle-plugin/local_pilo"
[ -f "$PLUGIN/version.php" ] || { echo "No encontré $PLUGIN"; exit 1; }

# 0. Revisión local: que ningún archivo PHP tenga errores de sintaxis.
if command -v php >/dev/null; then
  for f in $(find "$PLUGIN" -name '*.php'); do php -l "$f" >/dev/null || { echo "Error de sintaxis en $f"; exit 1; }; done
  echo "→ Sintaxis PHP revisada."
fi

CON_CLAVE="si"
[ -z "${SIN_CLAVE:-}" ] || CON_CLAVE="no"

ID="$$"
PAQUETE="/tmp/local_pilo-$ID.tgz"
REMOTO_LOCAL="$(mktemp)"
trap 'rm -f "$PAQUETE" "$REMOTO_LOCAL"' EXIT
tar -czf "$PAQUETE" -C "$RAIZ/moodle-plugin" local_pilo
echo "→ Paquete listo ($(du -h "$PAQUETE" | cut -f1))."

cat > "$REMOTO_LOCAL" <<'REMOTO'
set -euo pipefail
PAQUETE="$1"; MOODLE_DIR="${2:--}"; CONT="${3:--}"; PHP_USER="$4"; SITIO="$5"; URL_PILO="$6"; ALCANCE="$7"; CON_CLAVE="$8"
[ "$MOODLE_DIR" != "-" ] || MOODLE_DIR=""
[ "$CONT" != "-" ] || CONT=""
trap 'rm -f "$PAQUETE"' EXIT

# La clave se pide primero, en la terminal de esta sesión, y solo vive en esta variable.
CLAVE=""
if [ "$CON_CLAVE" = "si" ]; then
  read -r -s -p "Pegue la clave del plugin que creó Pilo (no se verá): " CLAVE; echo
  [ ${#CLAVE} -ge 32 ] || { echo "La clave es muy corta: cópiela de nuevo desde Pilo."; exit 1; }
fi

# Ejecuta dentro de Moodle: en el servidor o en su contenedor, como el usuario web.
corre() { if [ -n "$CONT" ]; then sudo docker exec -i -u "$PHP_USER" "$CONT" "$@"; else sudo -u "$PHP_USER" "$@"; fi; }
existe() { if [ -n "$CONT" ]; then sudo docker exec "$CONT" test -f "$1"; else sudo test -f "$1"; fi; }

if [ -z "$MOODLE_DIR" ]; then
  for d in /var/www/html/moodle /var/www/moodle /var/www/html /bitnami/moodle /opt/bitnami/moodle /srv/moodle; do
    if existe "$d/config.php" && existe "$d/version.php"; then MOODLE_DIR="$d"; break; fi
  done
fi
[ -n "$MOODLE_DIR" ] || { echo "No encontré Moodle. Pase MOODLE_DIR=<carpeta con config.php>."; exit 1; }
echo "→ Moodle en: ${CONT:+$CONT:}$MOODLE_DIR"

DESTINO="$MOODLE_DIR/local/pilo"
if [ -n "$CONT" ]; then
  sudo docker cp "$PAQUETE" "$CONT:/tmp/local_pilo.tgz"
  sudo docker exec "$CONT" sh -c "if [ -d '$DESTINO' ]; then cp -a '$DESTINO' /tmp/pilo.bak-\$(date +%Y%m%d-%H%M%S); fi; rm -rf '$DESTINO' && mkdir -p '$DESTINO' && tar -xzf /tmp/local_pilo.tgz -C '$DESTINO' --strip-components=1 && chown -R $PHP_USER '$DESTINO' && rm -f /tmp/local_pilo.tgz"
else
  if sudo test -d "$DESTINO"; then sudo cp -a "$DESTINO" "/tmp/local_pilo.bak-$(date +%Y%m%d-%H%M%S)"; echo "→ Respaldo de la versión anterior en /tmp."; fi
  sudo rm -rf "$DESTINO" && sudo mkdir -p "$DESTINO"
  sudo tar -xzf "$PAQUETE" -C "$DESTINO" --strip-components=1
  sudo chown -R "$PHP_USER" "$DESTINO"
fi
echo "→ Plugin copiado en local/pilo."

corre php "$MOODLE_DIR/admin/cli/upgrade.php" --non-interactive
echo "→ Moodle actualizado."

corre php "$MOODLE_DIR/admin/cli/cfg.php" --component=local_pilo --name=url --set="$URL_PILO"
corre php "$MOODLE_DIR/admin/cli/cfg.php" --component=local_pilo --name=sitio --set="$SITIO"
corre php "$MOODLE_DIR/admin/cli/cfg.php" --component=local_pilo --name=alcance --set="$ALCANCE"
if [ "$CON_CLAVE" = "si" ]; then
  # La clave entra por la entrada estándar de php: nunca en la línea de comandos.
  printf '%s' "$CLAVE" | corre php -r 'define("CLI_SCRIPT", true); require $argv[1] . "/config.php"; $k = trim(stream_get_contents(STDIN)); if (strlen($k) < 32) { fwrite(STDERR, "Clave vacía o corta\n"); exit(1); } set_config("clave", $k, "local_pilo"); set_config("activo", 1, "local_pilo"); echo "→ Clave guardada y Pilo encendido.\n";' "$MOODLE_DIR"
  CLAVE=""
else
  echo "→ Sin clave: péguela en Administración del sitio › Extensiones › Locales › Pilo en el Aula y encienda «Mostrar a Pilo»."
fi
corre php "$MOODLE_DIR/admin/cli/purge_caches.php"
echo "→ Cachés purgadas."
REMOTO

REMOTO_SCRIPT="/tmp/local_pilo-$ID.sh"
scp -q "$PAQUETE" "$SERVIDOR_MOODLE:$PAQUETE"
scp -q "$REMOTO_LOCAL" "$SERVIDOR_MOODLE:$REMOTO_SCRIPT"
ARGS="'$PAQUETE' '${MOODLE_DIR:--}' '${CONTENEDOR_MOODLE:--}' '$PHP_USER' '$SITIO' '$URL_PILO' '$ALCANCE' '$CON_CLAVE'"
ssh -t "$SERVIDOR_MOODLE" "bash $REMOTO_SCRIPT $ARGS; r=\$?; rm -f $REMOTO_SCRIPT; exit \$r"

cat <<FIN

✓ local_pilo instalado en $SERVIDOR_MOODLE (sitio $SITIO).
  Abra un curso de ese Moodle: Pilo debe aparecer en la esquina.
  Si no aparece: revise que la dirección del Moodle esté en los portales permitidos del
  chat emergente de Enseñanza, y que pilo-aula y la migración 0299 estén subidas.
FIN
