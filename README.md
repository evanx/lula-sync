# lula-sync

Sync Redis Stream to PostgreSQL

## Development setup

### PostgreSQL

```
cd test/postgresql
docker-compose up
```

### Create stream and group

```
xgroup create lula-sync:test:x lula-sync-group $ mkstream
```

### Add an entry

```
xadd lula-sync:test:x '*' data '{}' type ping source client-1 subject heartbeat time 1608478567772 ref 123
```

### Reset consumer group

To force all consumers to handle all entries in the stream e.g. for repetitive development and testing:

```
xgroup setid lula-sync:test:x lula-sync-group 0
```

### Generate entries

```
LOOP_DELAY=1000 LOOP_LIMIT=10 node test/xadd
```

### Start

```
LOOP_DELAY=1000 LOOP_LIMIT=10 NODE_ENV=development npm start
```

### Test

```
NODE_ENV=testing ./test/scripts/test.sh
```

### Stop

The process monitors its entry in the following sorted set, and should exit if removed.

```
redis-cli del lula-sync:app:running:s
```

The `test.sh` script will start instances using `yarn testing:pretty` which enables processes to be found as follows:

```
pgrep -f 'testing:pretty'
```
