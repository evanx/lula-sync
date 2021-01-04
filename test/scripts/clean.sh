set -eu

_echo() {
  >&2 echo "${*}"
}

_redis() {
  _echo "> $*"
  redis-cli --raw "$@"
}

devDeadline=1611763264

if [ `date +%s` -gt ${devDeadline} ]
then
  if [ "${NODE_ENV}" != "development" ]
  then
    echo "Expired: devDeadline: ${devDeadline}" 
    exit 1
  fi
fi

if ! redis-cli zcard lula-sync:app:running:control:z | grep ^0
then
  redis-cli del lula-sync:app:running:control:z
  sleep 2
fi
pgrep -f 'testing:pretty' || echo 'No processes'

