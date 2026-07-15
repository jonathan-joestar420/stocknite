#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_REGION="${AWS_REGION:-us-west-2}"
INSTANCE_ID="${INSTANCE_ID:-i-0405f0c7e4bdae5c4}"
DEPLOY_BUCKET="${DEPLOY_BUCKET:-aic-cmoney-resource}"
EXPECTED_AWS_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-116659181302}"
HEALTH_URL="${HEALTH_URL:-https://stocknite.zzeric.com/api/health}"
DELIVERY_TIMEOUT_SECONDS="${DELIVERY_TIMEOUT_SECONDS:-120}"
EXECUTION_TIMEOUT_SECONDS="${EXECUTION_TIMEOUT_SECONDS:-900}"
PRESIGN_TTL_SECONDS="${PRESIGN_TTL_SECONDS:-1800}"
POLL_INTERVAL_SECONDS=3
POLL_TIMEOUT_SECONDS=$((DELIVERY_TIMEOUT_SECONDS + EXECUTION_TIMEOUT_SECONDS + 120))
COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SHORT_COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
BUILD_ROOT="$(mktemp -d -t stocknite-build.XXXXXX)"
BUILD_DIR="$BUILD_ROOT/source"
STAGE_DIR="$BUILD_ROOT/stage"
PACKAGE="$(mktemp -t stocknite-release.XXXXXX.tgz)"
PARAMS="$(mktemp -t stocknite-ssm.XXXXXX.json)"
S3_KEY="stocknite/releases/${COMMIT}-${TIMESTAMP}.tgz"
S3_URI="s3://${DEPLOY_BUCKET}/${S3_KEY}"
UPLOADED=false
COMMAND_ID=""
COMMAND_TERMINAL=false

log() { printf '[stocknite-ssm] %s\n' "$*"; }
is_terminal() {
  case "$1" in
    Success|Failed|Cancelled|TimedOut|Undeliverable|Terminated) return 0 ;;
    *) return 1 ;;
  esac
}
command_status() {
  aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query Status \
    --output text 2>/dev/null || printf 'Pending'
}
cleanup() {
  local status=$?
  local safe_to_delete=true
  set +e

  if [[ -n "$COMMAND_ID" && "$COMMAND_TERMINAL" != true ]]; then
    local remote_status
    remote_status="$(command_status)"
    if ! is_terminal "$remote_status"; then
      log "cancelling unfinished SSM command $COMMAND_ID"
      aws ssm cancel-command \
        --region "$AWS_REGION" \
        --command-id "$COMMAND_ID" \
        --instance-ids "$INSTANCE_ID" >/dev/null 2>&1
      for _ in $(seq 1 20); do
        remote_status="$(command_status)"
        is_terminal "$remote_status" && break
        sleep "$POLL_INTERVAL_SECONDS"
      done
    fi
    if is_terminal "$remote_status"; then
      COMMAND_TERMINAL=true
    else
      safe_to_delete=false
      echo "warning: SSM command status is unknown; preserving $S3_URI until its state is checked" >&2
    fi
  fi

  if [[ "$UPLOADED" == true && "$safe_to_delete" == true ]]; then
    if ! aws s3api delete-object \
      --region "$AWS_REGION" \
      --bucket "$DEPLOY_BUCKET" \
      --key "$S3_KEY" >/dev/null; then
      echo "warning: failed to delete temporary artifact $S3_URI" >&2
    fi
  fi

  if [[ -e "$BUILD_DIR/.git" ]]; then
    git -C "$ROOT_DIR" worktree remove --force "$BUILD_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$BUILD_ROOT"
  rm -f "$PACKAGE" "$PARAMS"
  return "$status"
}
trap 'exit 130' INT
trap 'exit 143' TERM
trap cleanup EXIT

for command in aws curl git npm python3 shasum tar; do
  command -v "$command" >/dev/null || {
    echo "missing required command: $command" >&2
    exit 1
  }
done

if ((PRESIGN_TTL_SECONDS <= DELIVERY_TIMEOUT_SECONDS + EXECUTION_TIMEOUT_SECONDS + 60)); then
  echo "PRESIGN_TTL_SECONDS must exceed delivery + execution timeouts with safety margin" >&2
  exit 1
fi

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  echo "refusing to deploy a dirty working tree; commit all changes first" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity \
  --region "$AWS_REGION" \
  --query Account \
  --output text)"
if [[ "$ACCOUNT_ID" != "$EXPECTED_AWS_ACCOUNT_ID" ]]; then
  echo "unexpected AWS account: $ACCOUNT_ID" >&2
  exit 1
fi

PING_STATUS="$(aws ssm describe-instance-information \
  --region "$AWS_REGION" \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text)"
if [[ "$PING_STATUS" != "Online" ]]; then
  echo "SSM instance is not online: $INSTANCE_ID ($PING_STATUS)" >&2
  exit 1
fi

log "checking out detached commit $SHORT_COMMIT"
git -C "$ROOT_DIR" worktree add --detach "$BUILD_DIR" "$COMMIT" >/dev/null
cd "$BUILD_DIR"
npm ci --ignore-scripts
rm -rf dist
npm run typecheck
npm test
npm run build

log "packaging exact commit $SHORT_COMMIT"
mkdir -p "$STAGE_DIR"
cp package.json package-lock.json "$STAGE_DIR/"
cp -R dist deploy scripts sql "$STAGE_DIR/"
printf '%s\n' "$COMMIT" > "$STAGE_DIR/DEPLOY_COMMIT"
tar -C "$STAGE_DIR" -czf "$PACKAGE" .
ARTIFACT_SHA256="$(shasum -a 256 "$PACKAGE" | awk '{print $1}')"

log "uploading temporary artifact to s3://$DEPLOY_BUCKET"
aws s3 cp "$PACKAGE" "$S3_URI" \
  --region "$AWS_REGION" \
  --only-show-errors
UPLOADED=true
ARTIFACT_URL="$(aws s3 presign "$S3_URI" \
  --region "$AWS_REGION" \
  --expires-in "$PRESIGN_TTL_SECONDS")"

# Keep the remote shell body literal; inject dynamic values as POSIX-safe assignments.
shell_quote() {
  python3 -c 'import shlex, sys; print(shlex.quote(sys.argv[1]))' "$1"
}
REMOTE_BODY="$(cat <<'REMOTE_EOF'
set -eu
WORK_DIR=$(mktemp -d /tmp/stocknite-deploy.XXXXXX)
PREVIOUS_RELEASE=$(readlink -f /opt/stocknite/current 2>/dev/null || true)
ENV_PATH=/etc/stocknite/stocknite.env
UNIT_PATH=/etc/systemd/system/stocknite.service
ENV_EXISTED=false
UNIT_EXISTED=false
if [ -f "$ENV_PATH" ]; then cp -p "$ENV_PATH" "$WORK_DIR/stocknite.env"; ENV_EXISTED=true; fi
if [ -f "$UNIT_PATH" ]; then cp -p "$UNIT_PATH" "$WORK_DIR/stocknite.service"; UNIT_EXISTED=true; fi
finish() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    set +e
    failed_release=$(readlink -f /opt/stocknite/current 2>/dev/null || true)
    echo "deployment failed; restoring previous application state" >&2
    if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
      ln -sfn "$PREVIOUS_RELEASE" /opt/stocknite/current
    fi
    if [ "$ENV_EXISTED" = true ]; then cp -p "$WORK_DIR/stocknite.env" "$ENV_PATH"; else rm -f "$ENV_PATH"; fi
    if [ "$UNIT_EXISTED" = true ]; then cp -p "$WORK_DIR/stocknite.service" "$UNIT_PATH"; else rm -f "$UNIT_PATH"; fi
    systemctl daemon-reload
    rollback_ok=true
    systemctl restart stocknite.service || rollback_ok=false
    curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null || rollback_ok=false
    if [ "$rollback_ok" != true ]; then echo "critical: rollback health check failed" >&2; fi
    if [ "${failed_release#/opt/stocknite/releases/}" != "$failed_release" ] && [ "$failed_release" != "$PREVIOUS_RELEASE" ]; then
      rm -rf "$failed_release"
    fi
  fi
  rm -rf "$WORK_DIR"
  exit "$status"
}
trap finish EXIT INT TERM
curl --fail --silent --show-error --location "$ARTIFACT_URL" --output "$WORK_DIR/release.tgz"
echo "$ARTIFACT_SHA256  $WORK_DIR/release.tgz" | sha256sum --check --status
mkdir "$WORK_DIR/source"
tar -xzf "$WORK_DIR/release.tgz" -C "$WORK_DIR/source"
manifest=$(cat "$WORK_DIR/source/DEPLOY_COMMIT")
if [ "$manifest" != "$EXPECTED_COMMIT" ]; then echo "commit manifest mismatch: $manifest" >&2; exit 1; fi
AWS_REGION="$TARGET_AWS_REGION" bash "$WORK_DIR/source/scripts/deploy-ec2.sh" "$WORK_DIR/source"
privileges=$(runuser -u postgres -- psql --dbname stocknite --tuples-only --no-align --command "SELECT has_table_privilege('stocknite_app','app_data.credit_ledger','SELECT'), has_table_privilege('stocknite_app','app_data.credit_ledger','INSERT'), has_table_privilege('stocknite_app','app_data.credit_ledger','UPDATE'), has_table_privilege('stocknite_app','app_data.credit_ledger','DELETE'), has_table_privilege('stocknite_app','app_data.credit_ledger','TRUNCATE'), has_schema_privilege('stocknite_app','app_data','USAGE'), has_sequence_privilege('stocknite_app','app_data.credit_ledger_id_seq','USAGE'), has_sequence_privilege('stocknite_app','app_data.credit_ledger_id_seq','SELECT');")
if [ "$privileges" != 't|t|f|f|f|t|t|t' ]; then
  echo "unexpected credit ledger privileges: $privileges" >&2
  exit 1
fi
current_manifest=$(cat /opt/stocknite/current/DEPLOY_COMMIT)
if [ "$current_manifest" != "$EXPECTED_COMMIT" ]; then echo "active release manifest mismatch: $current_manifest" >&2; exit 1; fi
curl --fail --silent --show-error "$PUBLIC_HEALTH_URL" >/dev/null
echo "deployed_commit=$EXPECTED_COMMIT"
echo "credit_ledger_privileges=$privileges"
REMOTE_EOF
)"
REMOTE_COMMAND="ARTIFACT_URL=$(shell_quote "$ARTIFACT_URL")
ARTIFACT_SHA256=$(shell_quote "$ARTIFACT_SHA256")
EXPECTED_COMMIT=$(shell_quote "$COMMIT")
TARGET_AWS_REGION=$(shell_quote "$AWS_REGION")
PUBLIC_HEALTH_URL=$(shell_quote "$HEALTH_URL")
$REMOTE_BODY"

if ! printf '%s\n' "$REMOTE_COMMAND" | /bin/sh -n; then
  echo "generated remote deployment payload is not valid POSIX shell" >&2
  exit 1
fi

printf '%s' "$REMOTE_COMMAND" | python3 -c '
import json
import sys
print(json.dumps({"commands": [sys.stdin.read()], "executionTimeout": [sys.argv[1]]}))
' "$EXECUTION_TIMEOUT_SECONDS" > "$PARAMS"

log "deploying commit $SHORT_COMMIT through SSM"
COMMAND_ID="$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "Deploy StockNite $SHORT_COMMIT" \
  --timeout-seconds "$DELIVERY_TIMEOUT_SECONDS" \
  --parameters "file://$PARAMS" \
  --query 'Command.CommandId' \
  --output text)"

STATUS=Pending
POLL_ATTEMPTS=$((POLL_TIMEOUT_SECONDS / POLL_INTERVAL_SECONDS))
for _ in $(seq 1 "$POLL_ATTEMPTS"); do
  STATUS="$(command_status)"
  if is_terminal "$STATUS"; then
    COMMAND_TERMINAL=true
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

if [[ "$COMMAND_TERMINAL" != true ]]; then
  echo "SSM command did not reach a terminal state before local deadline" >&2
  exit 1
fi

aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json

if [[ "$STATUS" != "Success" ]]; then
  echo "deployment failed with SSM status: $STATUS" >&2
  exit 1
fi

log "checking public health endpoint"
curl --fail --silent --show-error "$HEALTH_URL"
printf '\n'
log "commit $SHORT_COMMIT deployed successfully"
