set -eu

_echo() {
  >&2 echo "${*}"
}

_redis() {
  _echo "> $*"
  redis-cli --raw "$@"
}

_redis smembers 'lula-sync:app:running:s'

echo "pgrep -f 'testing:pretty'"
pgrep -f 'testing:pretty'
