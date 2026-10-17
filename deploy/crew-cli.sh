#!/bin/sh
set -eu
tool="${1:?usage: crew-cli <sync|webhook-test> [args]}"
shift
exec /usr/local/bin/entrypoint.sh node "/app/dist/${tool}.js" "$@"
