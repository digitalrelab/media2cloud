const AWS = require('aws-sdk');

const {
  mxBaseResponse,
} = require('../shared/mxBaseResponse');

const REQUIRED_PROPERTIES = [
  'ServiceToken',
  'FunctionName',
  'Parameters',
];

/**
 * @function CreateAtomicCounter
 * @param {object} event
 * @param {object} context
 */
exports.CreateAtomicCounter = async (event, context) => {
  try {
    class X0 extends mxBaseResponse(class {}) {}
    const x0 = new X0(event, context);

    if (x0.isRequestType('Delete')) {
      x0.storeResponseData('Status', 'SKIPPED');
      return x0.responseData;
    }

    const {
      ResourceProperties: Props = {},
    } = event || {};

    /* sanity check */
    const missing = REQUIRED_PROPERTIES.filter(x => Props[x] === undefined);
    if (missing.length) {
      throw new Error(`event.ResourceProperties missing ${missing.join(', ')}`);
    }

    const params = {
      TableName: Props.Parameters.TableName,
      Item: Props.Parameters.Attributes.reduce((a0, c0) => ({
        ...a0,
        [c0.Key]: /^[0-9]+$/.test(c0.Value) ? Number.parseInt(c0.Value, 10) : c0.Value,
      }), {}),
      ReturnValues: 'NONE',
    };

    const instance = new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10',
    });
    const response = await instance.put(params).promise();

    console.log(JSON.stringify(response, null, 2));

    x0.storeResponseData('Status', 'SUCCESS');
    return x0.responseData;
  } catch (e) {
    e.message = `CreateAtomicCounter: ${e.message}`;
    throw e;
  }
};
