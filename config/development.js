module.exports = {
  logger: {
    level: 'debug',
    prettyPrint: true,
    base: {
      hostname: null,
    },
  },
  redis: {
    hostKey: 'localhost',
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
