set -eu

_echo() {
  >&2 echo "${*}"
}

_redis() {
  _echo "> $*"
  redis-cli --raw "$@"
}

_redis smembers 'lula-sync:app:running:s'
_redis del 'lula-sync:app:running:s'
sleep 2

echo "pgrep -f 'testing:pretty'"
pgrep -f 'testing:pretty' | wc -l
