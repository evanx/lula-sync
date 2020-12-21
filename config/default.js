module.exports = {
  redis: {
    consumerGroup: 'lula-sync-group',
    readCount: 1,
    readBlock: 1000,
    connect: {},
    deprecated: {
      keyPrefix: 'lula-sync:',
    },
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
