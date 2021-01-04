
set -eufo pipefail

_echo() {
  >&2 echo "${*}"  
}

_exit() {
  _echo "exit ${*}"  
  exit ${1:-2}
}

_redis() {
  _echo "> $*"
  redis-cli "$@"
}

_kill() {
  _echo "$ kill $*"
  for pid in "$@"
  do
    kill "${pid}" || echo "Failed to kill: $*"
  done
}

if [ `date +%s` -gt 1611763264 -o "${NODE_ENV}" != "testing" ]
then
  echo "Unexpected NODE_ENV: ${NODE_ENV}" 
  exit 1
fi

# prepare output folder

outDir=~/tmp/lula-sync-out
if [ -n "${RESUME:-}" ]
then
  rm -rf ~/tmp/lula-sync-out
fi
mkdir -p ${outDir}

# statics

_reviewInstances() {
  echo "# Review instances"
  _redis zcard 'lula-sync:app:running:z'
  pgrep -f 'testing:pretty' || echo 'No processes'
}

_reviewCount() {
  echo "# Review counts"
  redisCount=`
    redis-cli xinfo stream lula-sync:test:x | 
      grep length -A1 | 
      tail -1
  `
  pgCount=`
    psql -h localhost -d lula -U app -t -c '
      select count(1) from lula_sync_stream_test
    ' | 
    head -1 |
    sed 's/[^0-9]//g'
  `
   echo "counters: redis=${redisCount} pg=${pgCount}" 
}

_reviewProcesses() {
  echo "# Review processes"
  pgrep -f 'testing:pretty' | echo "No processes"
  _redis zrevrange 'lula-sync:app:running:z' 0 99
}

_review() {
  _reviewProcesses
  _reviewInstances
  _reviewCount
}

_xadd() {
  local out=${outDir}/xadd
  local limit=${1:-100000}
  echo "xadd ${limit} > $out"
  LOOP_DELAY=10 LOOP_LIMIT=${limit} node test/xadd > ${out} 2>&1 &
}

_start() {
  startCount=`redis-cli hincrby lula-sync-test:h startCount 1`
  TEST_ERR=${1}
  LOOP_LIMIT=${2}
  local outName=start-${TEST_ERR}-${startCount}
  local out=${outDir}/${outName}
  _echo "start ${startCount} $@ > $out"
  EXIT_NOTIFY="notify:${startCount}:t"
  # Check initial() LOOP_LIMIT
  LOOP_DELAY=1 \
    EXIT_NOTIFY="${EXIT_NOTIFY}" \
    TEST_ERR=${TEST_ERR} \
    LOOP_LIMIT=${LOOP_LIMIT} \
    yarn testing:pretty \
    > ${out} 2>&1 &
  sleep .25
  redis-cli hincrby 'lula-sync-test:h' "err:${TEST_ERR}" 1 >/dev/null
  redis-cli hincrby 'lula-sync-test:h' 'loopCount' ${LOOP_LIMIT} >/dev/null
}


_chaosLoop() {
  count=`
    redis-cli scard 'lula-sync:app:running:s'
  `
  rand="${RANDOM:0:2}"
  pid=`redis-cli --raw srandmember 'lula-sync:app:running:s'`
  if [ ${count} -lt 4 ]
  then
    limit="${rand}00"
    echo "chaos: count=${count} limit=${limit}"
    _start ok ${limit}
  elif [ ${rand} -lt 30 ]
  then
    _kill -TERM ${pid}
  elif [ ${rand} -lt 60 ]
  then
    _kill -KILL ${pid}
  elif [ ${rand} -lt 90 ]
  then
    _kill -HUP ${pid}
  elif [ ${rand} -lt 90 ]
  then
    _redis srem 'lula-sync:app:running:s' ${pid}
  else
    echo "chaos: count=${count} xack"
    _start xack 1
  fi
  sleep 2
  if [ -n "${pid}" ]
  then
    if ! ps -p ${pid} > /dev/null
    then
      _redis srem 'lula-sync:app:running:s' ${pid}
    fi
  fi
}

_chaos() {
  while [ 1 ]
  do
    if redis-cli info persistence | 
      grep -q '^loading:1$'
    then
      _echo 'Redis loading'
    elif ! _chaosLoop
    then
      echo "WARN _chaosLoop"
    fi
    sleep 1
  done
}

_initial() {
  echo "# Initial run"
  streamLength=`
    _redis xinfo stream lula-sync:test:x | 
      grep '^length' -A1 | 
      tail -1
  `
  echo "streamLength=${streamLength}"
  _start ok 2 # Check start() LOOP_DELAY 
  _redis brpop lula-sync:notify:${startCount}:t 2 | grep -q '{}'
  _redis scard lula-sync:app:running:s | grep '^0$' 
}

_clean() {
  echo "# Clean"
  _redis hgetall 'lula-sync-test:h'
  _redis del 'lula-sync-test:h'
  _redis del 'lula-sync:error:counters:z'
  _redis del 'lula-sync:app:counters:z'
  if _redis scard 'lula-sync:app:running:s' | grep -q '^[1-9]'
  then
    _redis del 'lula-sync:app:running:s'
    _exit 9 'clean running'
  fi
  if pgrep -f testing:pretty
  then
    kill `pgrep -f testing:pretty`
    _exit 9 'clean running'
  fi
  psql -h localhost -d lula -U app -t -c '
    truncate lula_sync_stream_test
  '
}

if [ -z "${RESUME:-}" ]
then
  _clean
  _redis hset 'lula-sync-test:h' 'pid' ${$}
  _redis hset 'lula-sync-test:h' 'startedAt' `date +%s`
  _redis expire 'lula-sync-test:h' 172800
fi

if [ -n "${DESTROY:-}" ]
then
  _redis del 'lula-sync:test:x'
  _redis xgroup create 'lula-sync:test:x' 'lula-sync-group' '$' mkstream
fi

if [ -n "${RESET:-}" ]
then
  _redis xgroup setid 'lula-sync:test:x' 'lula-sync-group' 0
fi

if [ -n "${XADD:-}" ]
then
  _xadd "${XADD:-}"
  sleep .25
  _redis xinfo stream 'lula-sync:test:x' | head -2
fi

if [ -z "${RESUME:-}" ]
then
  _initial
  _start connect-redis 5
  _start start 1 
  _start xack 1
  _start ok 10 
fi

if [ -n "${CHAOS:-}" ]
then
  _chaos
fi

_review

if [ -n "${CLEAN}:-}" ]
then
  _clean
fi

echo "OK" `basename $0`
