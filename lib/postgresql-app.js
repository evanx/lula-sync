const assert = require('assert')
const config = require('config')
const httpServer = require('http').createServer()
const pino = require('pino')
const Redis = require('ioredis')
const { Client } = require('pg')
const { v4: uuidv4 } = require('uuid')

module.exports = async (setup) => {
  if (config.logger.prettifierInspector) {
    config.logger.prettifier = require('pino-inspector')
  }

  const makeRedisClient = () => {
    if (process.env.TEST_ERR === 'connect-redis') {
      throw new Error(`TEST_ERR: ${process.env.TEST_ERR}`)
    }
    return new Redis(config.get('redis').connect)
  }

  const parseIntStrict = (string) => {
    const value = parseInt(string)
    assert.strictEqual(String(value), string, 'parseInt')
    return value
  }

  const parsedConfig = {
    app: {
      loop: {
        delay: parseIntStrict(config.app.loop.delay),
        limit: parseIntStrict(config.app.loop.limit),
      },
    },
  }

  const redisKeys = {
    s: {
      running: 'app:running:s',
    },
    z: {
      appCounters: 'app:counters:z',
      errorCounters: 'error:counters:z',
    },
  }

  const logger = pino(config.logger)
  const redis = makeRedisClient()

  const app = {
    config,
    counters: {
      loop: 0,
    },
    timers: {
      created: Date.now(),
    },
    logger,
    instanceId: uuidv4(),
    redis,
    blockingRedis: new Redis(config.get('redis').connect),
    tmpRedis: new Redis(
      Object.assign({}, config.get('redis').connect, config.get('redis').tmp),
    ),
    pg: new Client(config.postgresql.connect),
    httpServer,
    utils: require('./utils'),
  }

  const notifyJson = (redisListKey, eventObject) => {
    const notifyExpireSeconds = 45
    logger.info(
      {
        redisListKey,
        eventObject,
        notifyExpireSeconds,
      },
      'notifyJson',
    )
    return app.utils.multiAsync(app.tmpRedis, [
      ['lpush', redisListKey, JSON.stringify(eventObject)],
      ['expire', redisListKey, notifyExpireSeconds],
    ])
  }

  const closeApp = async (value) => {
    try {
      let errorCode = 'unknown'
      if (!value.error) {
        errorCode = 'ok'
      } else {
        errorCode = value.error.message
      }
      const commands = [
        ['srem', redisKeys.s.running, String(process.pid)],
        ['zincrby', redisKeys.z.appCounters, 1, 'close'],
        ['zincrby', redisKeys.z.errorCounters, 1, errorCode],
      ]
      logger.info({ commands }, 'closeApp')
      await app.utils.multiAsync(app.redis, commands)
      if (process.env.EXIT_NOTIFY) {
        await notifyJson(process.env.EXIT_NOTIFY, value)
      }
    } catch (err) {
      logger.warn({ err }, 'closeApp')
    }
  }

  const finish = async (error) => {
    if (app.hooks && app.hooks.finish) {
      try {
        await app.hooks.finish(error)
      } catch (err) {
        logger.warn({ err }, 'finish app')
      }
    }
    if (error) {
      await closeApp({
        error: {
          message: error.message,
          code: error.code,
        },
      })
    } else {
      await closeApp({})
    }
    try {
      if (app.redis) {
        await redis.quit()
      }
    } catch (err) {
      logger.warn({ err }, 'finish redis')
    }
  }

  app.exit = async (source, err) => {
    if (err) {
      logger.error({ err, source }, 'Exit app')
      await finish(err)
      process.exit(1)
    } else {
      logger.info({ source }, 'Exit app')
      await finish(null)
      process.exit(0)
    }
  }

  const [restartCount] = await app.utils.multiAsync(app.redis, [
    ['hincrby', 'meter:counter:h', 'restart', 1],
    ['sadd', redisKeys.s.running, String(process.pid)],
  ])

  if (config.http && config.http.disabled != 'true') {
    httpServer.listen(parseInt(config.http.port), () => {
      logger.info(`HTTP server listening on port ${config.http.port}`)
    })
  }

  try {
    if (process.env.TEST_ERR === 'connect-postgresql') {
      throw new Error(`TEST_ERR: ${process.env.TEST_ERR}`)
    }
    await app.pg.connect()
    const res = await app.pg.query('SELECT $1::text as message', [
      'Test PostgreSQL connection',
    ])
    logger.info(res.rows[0].message)
    if (process.env.TEST_ERR === 'start') {
      throw new Error(`TEST_ERR: ${process.env.TEST_ERR}`)
    }
    logger.info({ restartCount, config, pid: process.pid }, 'Ready')
    app.hooks = await setup(app)
    if (app.hooks.start) {
      await app.hooks.start()
    }
    while (!app.closed && app.hooks.loop) {
      app.counters.loop++
      await app.hooks.loop()
      if (!(await redis.sismember(redisKeys.s.running, String(process.pid)))) {
        throw new Error(`Stopped via Redis key: '${redisKeys.s.running}'`)
      }
      if (parsedConfig.app.loop.limit > 0) {
        if (app.counters.loop >= parsedConfig.app.loop.limit) {
          app.closed = true
          logger.info(app.counters, 'Loop limit reached')
          break
        }
      }
      if (parsedConfig.app.loop.delay) {
        await app.utils.delay(parsedConfig.app.loop.delay)
      }
    }
    app.exit('run')
  } catch (err) {
    app.exit('run', err)
  }
}
