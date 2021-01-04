const pino = require('pino')
const Redis = require('ioredis')
const { delay } = require('../../lib/utils')

module.exports = async (config, appFactory) => {
  const logger = pino(config.logger)
  const app = {
    config,
    logger,
  }
  app.exit = async (source, err) => {
    if (err) {
      logger.error({ source, err }, 'exit')
    } else {
      logger.info({ source }, 'exit')
    }
    try {
      if (app.appHooks && app.appHooks.end) {
        await app.appHooks.end(err)
      }
    } catch (e) {
      logger.warn({ err: e }, 'end')
    }
    try {
      if (app.redis) {
        await app.redis.quit()
      }
    } catch (e) {
      logger.warn({ err: e }, 'redis.quit')
    }
    process.exit(err ? 1 : 0)
  }

  process.on('unhandledRejection', (err) => {
    app.exit('unhandledRejection', err)
  })

  process.on('uncaughtException', (err) => {
    app.exit('uncaughtException', err)
  })

  if (process.env.TEST_ERR === 'redis') {
    throw new Error(process.env.TEST_ERR)
  }

  app.redis = new Redis(config.redis.connect)
  app.blockingRedis = new Redis(config.redis.connect)

  app.appHooks = appFactory(app)

  await app.appHooks.start()

  let count = 0
  while (config.loop.limit === 0 || count++ < config.loop.limit) {
    await app.appHooks.loop()
    if (config.loop.delay) {
      await delay(config.loop.delay)
    }
  }
  app.exit('loop limit')
}
