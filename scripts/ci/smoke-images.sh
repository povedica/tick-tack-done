#!/usr/bin/env bash
# Disposable image smoke; no host ports, production data or private env files.
set -euo pipefail
api=${1:?API image}; web=${2:?Web image}; sha=${3:?Expected API SHA}
name="ttd-smoke-$$"
# shellcheck disable=SC2329 # Invoked by EXIT trap.
cleanup() {
  docker rm -f "$name-api" "$name-web" "$name-pg" "$name-redis" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$name" >/dev/null
docker run -d --name "$name-pg" --network "$name" --network-alias postgres \
  -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke postgres:17-alpine >/dev/null
docker run -d --name "$name-redis" --network "$name" --network-alias redis redis:7-alpine >/dev/null
for _ in {1..30}; do
  docker exec "$name-pg" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker run -d --name "$name-api" --network "$name" --read-only --tmpfs /tmp \
  -e NODE_ENV=development -e AUTH_MODE=dev -e SCHEDULER_AUTOSTART=false -e BUS_AUTOSTART=false \
  -e DATABASE_URL=postgresql://postgres:smoke@postgres:5432/smoke -e REDIS_URL=redis://redis:6379 \
  "$api" >/dev/null
ok=0
for _ in {1..60}; do
  if docker exec "$name-api" node -e 'fetch("http://127.0.0.1:3000/api/v1/health").then(async r=>{const h=await r.json();if(!r.ok||h.status!=="ok"||!h.commit.startsWith(process.argv[1]))process.exit(1)}).catch(()=>process.exit(1))' "$sha" >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 1
done
[[ $ok == 1 ]] || { echo 'API smoke failed' >&2; exit 1; }
docker run -d --name "$name-web" --network "$name" --network-alias web --read-only --tmpfs /tmp --tmpfs /var/cache/nginx --tmpfs /var/run "$web" >/dev/null
for _ in {1..15}; do
  if docker exec "$name-web" wget -q -O /dev/null http://127.0.0.1:8080/; then
    echo 'Image smoke OK'; exit 0
  fi
  sleep 1
done
exit 1
