module.exports = {
  logger: {
    level: 'debug',
    prettyPrint: process.env.LOG_PRETTY && {
      colorize: false,
      translateTime: true,
    },
    base: {
      hostname: null,
    },
  },
  redis: {
    hostKey: 'localhost',
    streamKey: 'test:x',
    connect: {
      url: 'redis://localhost:6379',
    },
  },
  postgresql: {
    connect: {
      connectionString: 'postgresql://app:password@localhost:5432/lula',
    },
  },
}
