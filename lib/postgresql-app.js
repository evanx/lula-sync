const config = require('config')
const httpServer = require('http').createServer()
const pino = require('pino')
const Redis = require('ioredis')
const { Client } = require('pg')
const { logger } = require('../config/default')
const { v4: uuidv4 } = require('uuid')
const { assert } = require('console')

module.exports = async (setup) => {
  if (config.logger.prettifierInspector) {
    config.logger.prettifier = require('pino-inspector')
  }

  const makeRedisClient = () => {
    if (process.env.TEST_ERROR === 'connect-redis') {
      throw new Error(`TEST_ERROR: ${process.env.TEST_ERROR}`)
    }
    return new Redis(config.redis.connect)
  }

  const app = {
    instanceId: uuidv4(),
    config,
    makeRedisClient,
    redis: makeRedisClient(),
    blockingRedis: makeRedisClient(),
    pg: new Client(config.postgresql.connect),
    httpServer,
    logger: pino(config.logger),
    clock: () => Date.now(),
    utils: require('./utils'),
  }

  const [restartCount] = await app.utils.multiAsync(app.redis, [
    ['hincrby', 'meter:upDownCounter:h', 'restart', 1],
  ])

  const endHooks = async (err) => {
    if (app.hooks && app.hooks.end) {
      try {
        await app.hooks.end(err)
      } catch (e) {
        app.logger.warn({ err }, 'endHooks')
      }
    }
  }

  app.exit = async (source, err) => {
    app.logger.error({ err, source }, 'Exit app')
    try {
      if (app.hooks.end) {
        await endHooks(err)
      }
      await app.redis.end()
    } catch (e) {
      app.logger.warn({ err: e }, 'Exit app: endHooks')
    }
    process.exit(1)
  }

  if (config.http && config.http.disabled != 'true') {
    httpServer.listen(parseInt(config.http.port), () => {
      app.logger.info(`HTTP server listening on port ${config.http.port}`)
    })
  }

  try {
    if (process.env.TEST_ERROR === 'connect-postgresql') {
      throw new Error(`TEST_ERROR: ${process.env.TEST_ERROR}`)
    }
    await app.pg.connect()
    const res = await app.pg.query('SELECT $1::text as message', [
      'Test PostgreSQL connection',
    ])
    app.logger.info(res.rows[0].message)
    if (process.env.TEST_ERROR === 'start') {
      throw new Error(`TEST_ERROR: ${process.env.TEST_ERROR}`)
    }
    app.logger.info({ restartCount }, 'Ready')
    app.hooks = await setup(app)
    if (app.hooks.start) {
      await app.hooks.start()
    }
    while (app.hooks.loop) {
      await app.hooks.loop()
    }
  } catch (err) {
    await endHooks(err)
    app.exit('run', err)
  }
}
