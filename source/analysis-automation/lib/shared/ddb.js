const AWS = require('aws-sdk');

/**
 * @class DDB
 * @description DynamoDB connector
 */
class DDB {
  constructor(tableName, partitionKeyName, sortKeyName) {
    this.$table = {
      name: tableName,
      partitionKey: {
        name: partitionKeyName,
      },
      sortKey: {
        name: sortKeyName,
      },
    };
  }

  static get Constants() {
    return {
      PageSize: 10,
      Slot: {
        Partition: {
          Value: 'counter',
        },
        Attribute: {
          Max: 'max',
          Min: 'min',
          Count: 'count',
        },
        OutOfRange: -1,
      },
    };
  }

  get table() {
    return this.$table;
  }

  makeKeys(partitionValue, sortValue) {
    return (this.table.sortKey.name)
      ? {
        [this.table.partitionKey.name]: partitionValue,
        [this.table.sortKey.name]: sortValue,
      }
      : {
        [this.table.partitionKey.name]: partitionValue,
      };
  }

  async fetch(partitionValue, sortValue) {
    let params = (this.table.sortKey.name)
      ? {
        ExpressionAttributeNames: {
          '#k0': this.table.partitionKey.name,
          '#k1': this.table.sortKey.name,
        },
        ExpressionAttributeValues: {
          ':v0': partitionValue,
          ':v1': sortValue,
        },
        KeyConditionExpression: '#k0 = :v0 and begins_with(#k1, :v1)',
      }
      : {
        ExpressionAttributeNames: {
          '#k0': this.table.partitionKey.name,
        },
        ExpressionAttributeValues: {
          ':v0': partitionValue,
        },
        KeyConditionExpression: '#k0 = :v0',
      };

    params = {
      ...params,
      TableName: this.table.name,
      ConsistentRead: true,
    };

    const result = await (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).query(params).promise().catch(() => undefined);

    return (!result || !result.Count)
      ? undefined
      : result.Items.shift();
  }

  async purge(partitionValue, sortValue) {
    const params = {
      TableName: this.table.name,
      Key: this.makeKeys(partitionValue, sortValue),
    };

    return (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).delete(params).promise().catch(() => undefined);
  }

  async update(partitionValue, sortValue, data) {
    const attributes = JSON.parse(JSON.stringify({
      ...data,
    }));

    delete attributes[this.table.partitionKey.name];
    delete attributes[this.table.sortKey.name];

    const params = {
      TableName: this.table.name,
      Key: this.makeKeys(partitionValue, sortValue),
      AttributeUpdates: Object.keys(attributes).reduce((a0, c0) => ({
        ...a0,
        [c0]: {
          Action: 'PUT',
          Value: attributes[c0],
        },
      }), {}),
      ReturnValues: 'UPDATED_NEW',
    };

    return (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).update(params).promise();
  }

  async acquireSlot() {
    const params = {
      TableName: this.table.name,
      Key: this.makeKeys(DDB.Constants.Slot.Partition.Value),
      ExpressionAttributeNames: {
        '#key': DDB.Constants.Slot.Attribute.Count,
        '#max': DDB.Constants.Slot.Attribute.Max,
      },
      ExpressionAttributeValues: {
        ':inc': 1,
      },
      ConditionExpression: '#key < #max',
      UpdateExpression: 'SET #key = #key + :inc',
      ReturnValues: 'UPDATED_NEW',
    };

    return (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).update(params).promise()
      .then(data =>
        data.Attributes[DDB.Constants.Slot.Attribute.Count])
      .catch((e) => {
        if (e.code === 'ConditionalCheckFailedException') {
          return DDB.Constants.Slot.OutOfRange;
        }
        throw e;
      });
  }

  async releaseSlot() {
    const params = {
      TableName: this.table.name,
      Key: this.makeKeys(DDB.Constants.Slot.Partition.Value),
      ExpressionAttributeNames: {
        '#key': DDB.Constants.Slot.Attribute.Count,
        '#min': DDB.Constants.Slot.Attribute.Min,
      },
      ExpressionAttributeValues: {
        ':dec': 1,
      },
      ConditionExpression: '#key > #min',
      UpdateExpression: 'SET #key = #key - :dec',
      ReturnValues: 'UPDATED_NEW',
    };

    return (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).update(params).promise()
      .then(data =>
        data.Attributes[DDB.Constants.Slot.Attribute.Count])
      .catch((e) => {
        if (e.code === 'ConditionalCheckFailedException') {
          return DDB.Constants.Slot.OutOfRange;
        }
        throw e;
      });
  }

  /**
   * @function scanGSI
   * @description scan GSI index
   * @param {*} data
   * @param {string} data.Name - GSI index name
   * @param {string} data.Key - GSI index partition key
   * @param {string} data.Value - GSI index partition value
   * @param {string} [data.Token] - base64 encoded ExclusiveStartKey used to continue from last scan
   * @param {number} [data.PageSize] - number of items per page
   * @param {boolean} [data.Ascending] - ascending or decending
   * @return {*} payload
   * @return {Array} payload.Items
   * @return {string} [payload.NextKey] - base64 encoded of LastEvaluatedKey
   */
  async scanGSI(data) {
    const missing = [
      'Name',
      'Key',
      'Value',
      // 'Token',
      // 'PageSize',
      // 'Ascending',
    ].filter(x => data[x] === undefined);

    if (missing.length) {
      throw new Error(`scanIndex missing ${missing.join(', ')}`);
    }

    const params = {
      TableName: this.table.name,
      IndexName: data.Name,
      ExpressionAttributeNames: {
        '#x0': data.Key,
      },
      ExpressionAttributeValues: {
        ':v0': data.Value,
      },
      KeyConditionExpression: '#x0 = :v0',
      ScanIndexForward: !!(data.Ascending),
      Limit: Number.parseInt(data.PageSize || DDB.Constants.PageSize, 10),
      ExclusiveStartKey: data.Token && JSON.parse(Buffer.from(data.Token, 'base64').toString()),
    };

    const {
      Items,
      LastEvaluatedKey,
    } = await (new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    })).query(params).promise();

    return {
      Items,
      NextToken: LastEvaluatedKey && Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64'),
    };
  }
}

module.exports = {
  DDB,
};
