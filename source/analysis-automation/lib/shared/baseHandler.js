const HTTPS = require('https');

const {
  DDB,
} = require('./ddb');

const {
  SigV4,
} = require('./sigv4');

class BaseHandler {
  constructor(event, context) {
    this.$event = event;
    this.$context = context;
  }

  get event() {
    return this.$event;
  }

  get context() {
    return this.$context;
  }

  static get Env() {
    return {
      Media2Cloud: {
        Endpoint: process.env.ENV_M2C_ENDPOINT,
      },
      DDB: {
        Table: {
          Name: process.env.ENV_DDB_QUEUE_TABLE,
          Partition: {
            Key: process.env.ENV_DDB_QUEUE_PARTITION_KEY,
          },
        },
        GSI: {
          Name: process.env.ENV_DDB_GSI_INDEX_NAME,
          Partition: {
            Key: process.env.ENV_DDB_GSI_INDEX_PARTITION_KEY,
          },
          Sort: {
            Key: process.env.ENV_DDB_GSI_INDEX_PARTITION_KEY,
          },
        },
      },
    };
  }

  makeAIOptions() {
    return {
      celeb: true,
      face: false,
      faceMatch: false,
      label: false,
      moderation: false,
      person: false,
      text: false,
      transcript: false,
      entity: false,
      keyphrase: false,
      sentiment: false,
      topic: false,
      document: false,
    };
  }

  checkEnvironment() {
    const missing = [
      'ENV_M2C_ENDPOINT',
      'ENV_DDB_QUEUE_TABLE',
      'ENV_DDB_QUEUE_PARTITION_KEY',
      'ENV_DDB_GSI_INDEX_NAME',
      'ENV_DDB_GSI_INDEX_PARTITION_KEY',
      'ENV_DDB_GSI_INDEX_SORT_KEY',
    ].filter(x => process.env[x] === undefined);

    if (missing.length) {
      const e = new Error(`missing environment variables, ${missing.join(', ')}`);
      console.error(e);
      throw e;
    }
  }

  async pushQ(uuid, options) {
    const params = {
      status: 'queued',
      ...options,
    };

    const ddb = this.createDDBInstance();
    const avail = await ddb.acquireSlot();
    if (avail > 0) {
      await this.startAnalysis(uuid)
        .then((data) => {
          params.status = 'started';
          params.executionArn = data.executionArn;
        })
        .catch(async (e) => {
          await ddb.releaseSlot();
          params.status = 'error';
          params.errorMessage = e.message;
          throw e;
        });
    }

    return ddb.update(uuid, undefined, {
      timestamp: new Date().getTime(),
      ...params,
    });
  }

  async popQ(uuid, options) {
    const params = {
      status: 'completed',
      ...options,
    };

    const ddb = this.createDDBInstance();
    await ddb.releaseSlot();

    return ddb.update(uuid, params.status, {
      ...params,
      endTime: new Date().getTime(),
    });
  }

  async startAnalysis(uuid) {
    const endpoint = BaseHandler.Env.Media2Cloud.Endpoint;
    const method = 'POST';
    const path = '/analysis';
    const body = {
      uuid,
      input: {
        aiOptions: this.makeAIOptions(),
      },
    };

    const sigv4 = new SigV4({
      endpoint,
    });

    const signed = sigv4.signRequest({
      method,
      path,
      body: JSON.stringify(body),
    });

    const response = await new Promise((resolve, reject) => {
      const data = [];
      const request = HTTPS.request(signed.url, {
        method,
        headers: signed.headers,
      }, (res) => {
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode} ${res.statusMessage}`));
          } else {
            resolve(JSON.parse(Buffer.concat(data)));
          }
        });
      });
      request.on('error', e => reject(e));
      request.write(JSON.stringify(body));
      request.end();
    });

    return response;
  }

  async scanRecords(type = 'queued') {
    const indexName = BaseHandler.Env.DDB.GSI.Name;
    const indexKey = BaseHandler.Env.DDB.GSI.Partition.Key;

    const ddb = this.createDDBInstance();
    return ddb.scanGSI({
      Name: indexName,
      Key: indexKey,
      Value: type,
      PageSize: 30,
    });
  }

  createDDBInstance(table, partitionKey) {
    return new DDB(
      table || BaseHandler.Env.DDB.Table.Name,
      partitionKey || BaseHandler.Env.DDB.Table.Partition.Key
    );
  }

  async process() {
    throw new Error('dervied class to impl');
  }
}

module.exports = {
  BaseHandler,
};
