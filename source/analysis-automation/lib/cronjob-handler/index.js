const {
  BaseHandler,
} = require('../shared/baseHandler');

class CronJobHandler extends BaseHandler {
  async process() {
    this.checkEnvironment();

    let queued = await this.scanRecords('queued');
    if (!queued.Items.length) {
      queued = await this.scanRecords('error');
    }

    const stats = {
      scanned: queued.Items.length,
      processed: 0,
    };

    while (queued.Items.length) {
      const item = queued.Items.shift();
      const started = await this.pushQIfAvailable(item);
      if (!started) {
        break;
      }
      stats.processed++;
    }
    return stats;
  }

  async pushQIfAvailable(item) {
    const ddb = this.createDDBInstance();
    const avail = await ddb.acquireSlot();

    if (avail < 0) {
      return undefined;
    }

    return this.startAnalysis(item.uuid)
      .then(async (data) =>
        ddb.update(item.uuid, undefined, {
          status: 'started',
          executionArn: data.executionArn,
        }))
      .catch(async (e) => {
        await ddb.releaseSlot();
        return undefined;
      });
  }
}

module.exports = {
  CronJobHandler,
};
