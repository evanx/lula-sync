const assert = require('assert')

const syncItem = async (
  { config, logger, redis, pg, utils },
  { streamKey, syncKey },
  item,
) => {
  assert.strictEqual(item.length, 2, 'syncItem')
  const [itemId, data] = item
  const dataObject = utils.reduceRedisFields(data)
  const timestamp = dataObject.time ? new Date(parseInt(dataObject.time)) : null
  logger.info({ itemId, dataObject, timestamp }, 'syncItem')
  await pg.query(
    'insert into lula_sync_stream_' +
      syncKey +
      ' (_id, _ref, _time, _source, _subject, _data) ' +
      'values ($1, $2, $3, $4, $5, $6)',
    [
      itemId,
      dataObject.ref,
      timestamp,
      dataObject.source,
      dataObject.subject,
      dataObject.data,
    ],
  )
  await redis.xack(streamKey, config.redis.consumerGroup, itemId)
}

module.exports = async (app) => {
  const { config, logger, redis, blockingRedis, pg } = app
  const mutables = {}
  const redisTimeRes = await redis.time()
  const redisTime = parseInt(redisTimeRes[0])
  const streamsRes = await pg.query(
    'select * from lula_sync_stream where _enabled = true and redis_host_key = $1',
    [config.redis.hostKey],
  )
  const streamRows = streamsRes.rows
  assert.strictEqual(streamRows.length, 1, 'streamRows.length')
  const { redis_stream_key: streamKey, lula_sync_key: syncKey } = streamRows[0]
  const streamInfo = { streamKey, syncKey }
  const { consumerGroup } = config.redis
  const xreadgroupArgs = [
    'group',
    consumerGroup,
    app.instanceId,
    'count',
    config.redis.readCount,
    'block',
    config.redis.readBlock,
    'streams',
    streamKey,
    '>',
  ]
  logger.info({ redisTime, streamKey, consumerGroup, xreadgroupArgs }, 'sync')

  const claimItem = async () => {
    const pendingRes = await redis.xpending(streamKey, consumerGroup)
    if (pendingRes[0]) {
      const timestamp = parseInt(pendingRes[1])
      if (app.clock() - timestamp > config.claim.minIdleTime) {
        const claimRes = await redis.xclaim(
          streamKey,
          consumerGroup,
          app.instanceId,
          config.claim.minIdleTime,
          pendingRes[1],
        )
        if (claimRes.length) {
          assert.strictEqual(claimRes.length, 1, 'claimRes.length')
          return claimRes[0]
        }
      }
    }
  }

  return {
    async start() {
      mutables.timeout = setTimeout(async () => {
        if (process.env.NODE_ENV === 'development') {
          redis.xadd(
            'lula-sync:test:x',
            '*',
            'ref',
            'abc-123',
            'type',
            'ping',
            'source',
            'client-1',
            'time',
            '1608478567772',
            'data',
            '{}',
          )
        }
      }, 2000)
      mutables.interval = setInterval(async () => {
        if (mutables.claimedItem) {
          if (!mutables.claimedItemWarned) {
            mutables.claimedItemWarned = true
            logger.warn('Already exists: claimedItem')
          }
          return
        }
        try {
          const claimedItem = await claimItem()
          if (claimedItem) {
            const claimedId = claimedItem[0]
            if (mutables.claimedItem) {
              logger.warn({ claimedId }, 'Conflict: claimedItem')
            } else {
              logger.info({ claimedId, claimedItem }, 'Claimed')
              mutables.claimedItem = claimedItem
              mutables.claimedItemWarned = false
            }
          }
        } catch (err) {
          app.exit('sync interval', err)
        }
      }, config.claim.interval)
    },
    async end() {
      logger.info('end')
    },
    async loop() {
      if (mutables.claimedItem) {
        await syncItem(app, streamInfo, mutables.claimedItem)
        mutables.claimedItem = null
      }
      const readRes = await blockingRedis.xreadgroup(...xreadgroupArgs)
      if (readRes) {
        const item = readRes[0][1][0]
        logger.info({ item }, 'xreadgroup')
        await syncItem(app, streamInfo, item)
      }
    },
  }
}
