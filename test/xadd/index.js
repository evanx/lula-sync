require('./redis-app')(
  {
    redis: {
      hostKey: 'localhost',
      streamKey: 'lula-sync:test:x',
      connect: {
        url: 'redis://localhost:6379',
      },
    },
    loop: {
      delay: parseInt(process.env.LOOP_DELAY || '10'),
      limit: parseInt(process.env.LOOP_LIMIT || '10'),
    },
    logger: {
      name: 'xadd',
      level: 'debug',
      prettyPrint: process.env.PRETTY && {
        colorize: true,
        translateTime: false,
      },
    },
  },
  ({ config, logger, redis, exit }) => {
    const mutables = { count: 0 }
    return {
      async start() {
        logger.info('start')
        if (process.env.TEST_ERR === 'start') {
          throw new Error(process.env.TEST_ERR)
        }
      },
      async loop() {
        mutables.count++
        logger.info('loop')
        const entry = {
          ref: String(mutables.count),
          type: 'ping',
          source: `client-${mutables.count % 10}`,
          subject: 'status',
          time: Date.now(),
          data: '{}',
        }
        const fields = Object.entries(entry).flat()
        const id = await redis.xadd(config.redis.streamKey, '*', ...fields)
        logger.info({ id, fields }, 'xadd')
      },
      async end() {
        logger.info('end')
      },
    }
  },
)
