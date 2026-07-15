#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="${1:?usage: deploy-ec2.sh <extracted-package-directory>}"
APP_ROOT="${APP_ROOT:-/opt/stocknite}"
CONFIG_DIR="${CONFIG_DIR:-/etc/stocknite}"
DATA_DIR="${DATA_DIR:-/var/lib/stocknite}"
SECRET_ID="${SECRET_ID:-stocknite/postgres/credentials}"
AWS_REGION="${AWS_REGION:-us-west-2}"
SERVICE_NAME="stocknite"
RELEASE="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE"

log() { printf '[stocknite-deploy] %s\n' "$*"; }
fail() {
  log "deployment failed near line $1"
  systemctl status "$SERVICE_NAME" --no-pager || true
}
trap 'fail $LINENO' ERR

if [[ "${EUID}" -ne 0 ]]; then
  echo "deploy script must run as root" >&2
  exit 1
fi

log "checking runtime"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(`.`)[0]')" -lt 22 ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nodejs npm
fi
command -v aws >/dev/null
command -v psql >/dev/null

id stocknite >/dev/null 2>&1 || \
  useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin stocknite
install -d -o stocknite -g stocknite -m 755 "$APP_ROOT/releases" "$DATA_DIR"
install -d -o root -g stocknite -m 750 "$CONFIG_DIR"
install -d -o stocknite -g stocknite -m 755 "$RELEASE_DIR"

log "installing release $RELEASE"
cp -a "$SOURCE_DIR/." "$RELEASE_DIR/"
cd "$RELEASE_DIR"
npm ci --omit=dev --ignore-scripts
chown -R stocknite:stocknite "$RELEASE_DIR"

log "rendering protected environment file"
TEMP_ENV="$(mktemp)"
aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_ID" \
  --query SecretString \
  --output text \
  | python3 "$RELEASE_DIR/scripts/render-env.py" "$CONFIG_DIR/stocknite.env" \
  > "$TEMP_ENV"
install -o root -g stocknite -m 640 "$TEMP_ENV" "$CONFIG_DIR/stocknite.env"
rm -f "$TEMP_ENV"

log "applying database migrations"
for migration in "$RELEASE_DIR"/sql/*.sql; do
  log "applying $(basename "$migration")"
  runuser -u postgres -- psql \
    --dbname stocknite \
    --set ON_ERROR_STOP=1 \
    --file "$migration"
done

log "activating release"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
install -o root -g root -m 644 \
  "$RELEASE_DIR/deploy/stocknite.service" \
  "/etc/systemd/system/stocknite.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

log "verifying service"
for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health; then
    printf '\n'
    break
  fi
  if [[ "$attempt" -eq 15 ]]; then
    log "health check failed"
    exit 1
  fi
  sleep 2
done
systemctl is-active --quiet "$SERVICE_NAME"

log "removing old releases"
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d \
  ! -path "$RELEASE_DIR" -printf '%T@ %p\n' \
  | sort -nr | tail -n +4 | cut -d' ' -f2- | xargs -r rm -rf
log "release $RELEASE deployed with Node $(node --version)"
