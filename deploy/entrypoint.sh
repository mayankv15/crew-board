#!/bin/sh
set -eu
SECRET_FILE=/data/.webhook-secret
if [ -z "${HR_WEBHOOK_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    umask 077
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE"
  fi
  HR_WEBHOOK_SECRET="$(cat "$SECRET_FILE")"
  export HR_WEBHOOK_SECRET
fi
exec "$@"
