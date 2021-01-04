module.exports = {
  app: {
    name: 'lula-sync',
    loop: {
      delay: '200',
      limit: '0',
    },
  },
  redis: {
    tmp: { db: 0 },
    connect: {
      keyPrefix: 'lula-sync:',
    },
  },
  xreadgroup: {
    consumerGroup: 'lula-sync-group',
    count: 1,
    block: 1000,
  },
  claim: {
    interval: 4000,
    minIdleTime: 8000,
  },
  logger: {
    name: 'lula-sync',
    level: 'info',
  },
}
