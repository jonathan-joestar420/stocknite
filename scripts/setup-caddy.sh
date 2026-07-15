#!/usr/bin/env bash
# 在 EC2 上安裝並啟用 Caddy（Let's Encrypt 正式憑證），
# 反向代理 https://stocknite.zzeric.com -> 127.0.0.1:3000，
# 更新 PUBLIC_BASE_URL，並透過 LINE API 設定 + 測試 webhook。
set -uo pipefail

DOMAIN="${DOMAIN:-stocknite.zzeric.com}"
APP_PORT="${APP_PORT:-3000}"
ENV_FILE="/etc/stocknite/stocknite.env"
WEBHOOK_URL="https://${DOMAIN}/api/line/webhook"

log() { printf '[setup-caddy] %s\n' "$*"; }

if [[ "${EUID}" -ne 0 ]]; then echo "must run as root" >&2; exit 1; fi

log "installing caddy if missing"
if ! command -v caddy >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null 2>&1 || true
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg >/dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y >/dev/null 2>&1
  apt-get install -y caddy >/dev/null 2>&1
fi
caddy version || { echo "caddy install failed"; exit 1; }

log "writing /etc/caddy/Caddyfile for ${DOMAIN}"
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:${APP_PORT}
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options SAMEORIGIN
  }
}
EOF

log "enabling + restarting caddy"
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
sleep 2
systemctl is-active caddy || { journalctl -u caddy --no-pager -n 20; exit 1; }

log "updating PUBLIC_BASE_URL in ${ENV_FILE}"
if grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE"; then
  sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=https://${DOMAIN}#" "$ENV_FILE"
else
  echo "PUBLIC_BASE_URL=https://${DOMAIN}" >> "$ENV_FILE"
fi
systemctl restart stocknite
sleep 2

log "waiting for TLS certificate + HTTPS health (up to ~60s)"
ok=""
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "https://${DOMAIN}/api/health" 2>/dev/null || true)
  log "attempt $i: https health http_code=${code}"
  if [[ "$code" == "200" ]]; then ok="yes"; break; fi
  sleep 4
done
if [[ -z "$ok" ]]; then
  log "HTTPS not healthy yet; recent caddy logs:"; journalctl -u caddy --no-pager -n 20
fi

log "reading LINE token from env"
TOKEN=$(grep '^LINE_CHANNEL_ACCESS_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
if [[ -z "$TOKEN" ]]; then log "no LINE token; skip webhook setup"; exit 0; fi

log "setting LINE webhook endpoint -> ${WEBHOOK_URL}"
curl -s -X PUT https://api.line.me/v2/bot/channel/webhook/endpoint \
  -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d "{\"endpoint\":\"${WEBHOOK_URL}\"}"; echo

log "enabling webhook (setusing set)"
curl -s -X PUT https://api.line.me/v2/bot/channel/webhook/endpoint \
  -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d "{\"endpoint\":\"${WEBHOOK_URL}\",\"active\":true}"; echo

log "testing webhook via LINE API"
curl -s -X POST https://api.line.me/v2/bot/channel/webhook/test \
  -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d "{\"endpoint\":\"${WEBHOOK_URL}\"}"; echo

log "current webhook endpoint:"
curl -s -X GET https://api.line.me/v2/bot/channel/webhook/endpoint \
  -H "Authorization: Bearer ${TOKEN}"; echo

log "done"
