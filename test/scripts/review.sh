set -eu

_echo() {
  >&2 echo "${*}"
}

_redis() {
  _echo "> $*"
  redis-cli --raw "$@"
}

_redis zrevrange lula-sync:app:running:control:z 0 99

echo '> pgrep -f 'testing:pretty''
pgrep -f 'testing:pretty' || echo 'No processes'
