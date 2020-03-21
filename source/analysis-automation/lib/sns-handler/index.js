const {
  BaseHandler,
} = require('../shared/baseHandler');

class SnsHandler extends BaseHandler {
  parseSnsEvent(event) {
    try {
      return JSON.parse(event.Records[0].Sns.Message);
    } catch (e) {
      return undefined;
    }
  }

  async process() {
    this.checkEnvironment();
    const parsed = this.parseSnsEvent(this.event);
    if (!parsed) {
      return undefined;
    }

    if (parsed.stateMachine.indexOf('-ingest') > 0 && parsed.status === 'COMPLETED') {
      return this.pushQ(parsed.uuid);
    }

    if (parsed.stateMachine.indexOf('-analysis') > 0) {
      if (parsed.status === 'COMPLETED') {
        return this.popQ(parsed.uuid);
      }
      if (parsed.status === 'ERROR') {
        return this.popQ(parsed.uuid, {
          status: 'error',
          errorMessage: parsed.errorMessage || 'unknown error',
        });
      }
    }
    return undefined;
  }
}

module.exports = {
  SnsHandler,
};
