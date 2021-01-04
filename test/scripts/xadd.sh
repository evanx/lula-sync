set -eu

_echo() {
  >&2 echo "${*}"
}

_redis() {
  _echo "> $*"
  redis-cli --raw "$@"
}

LOOP_DELAY=1 LOOP_LIMIT=100000 node test/xadd |
  pino-pretty -t -c