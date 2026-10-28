#!/bin/bash
set -e
docker rm -f vocespilo-web 2>/dev/null || true
docker run -d --name vocespilo-web --restart unless-stopped \
  --network dfghn4pk53yzqkipnzracsjx \
  -v /data/coolify/applications/dfghn4pk53yzqkipnzracsjx/vocespilo-nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  --label traefik.enable=true \
  --label 'traefik.http.routers.vocespilo.rule=Host(`planeacion.udes.edu.co`) && PathPrefix(`/vocespilo`)' \
  --label traefik.http.routers.vocespilo.entryPoints=https \
  --label traefik.http.routers.vocespilo.tls=true \
  --label traefik.http.routers.vocespilo.tls.certresolver=letsencrypt \
  --label traefik.http.services.vocespilo.loadbalancer.server.port=80 \
  --label traefik.docker.network=coolify \
  nginx:1.27-alpine
docker network connect coolify vocespilo-web
sleep 2
echo '--- LABELS ---'
docker inspect vocespilo-web --format '{{range .Config.Labels}}{{println .}}{{end}}' | grep -E 'rule|80|network' || true
echo '--- NGINX CONF ---'
docker exec vocespilo-web head -6 /etc/nginx/conf.d/default.conf
echo '--- ESTADO ---'
docker ps --filter name=vocespilo-web --format '{{.Names}} | {{.Status}}'
