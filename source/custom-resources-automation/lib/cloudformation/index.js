const AWS = require('aws-sdk');

const {
  mxBaseResponse,
} = require('../shared/mxBaseResponse');

const REQUIRED_PROPERTIES = [
  'ServiceToken',
  'FunctionName',
  'StackName',
];

/**
 * @function ParseMedia2CloudStack
 * @param {object} event
 * @param {object} context
 */
exports.ParseMedia2CloudStack = async (event, context) => {
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

    const instance = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    const response = await instance.describeStacks({
      StackName: Props.StackName,
    }).promise();

    console.log(JSON.stringify(response, null, 2));

    const stack = response.Stacks.find(x =>
      x.StackName === Props.StackName);

    stack.Outputs.forEach((output) => {
      switch (output.OutputKey) {
        /* passthrough to outputs */
        case 'SNSTopicArn':
        case 'SNSTopicName':
        case 'Media2CloudApiId':
        case 'Media2CloudEndpoint':
          x0.storeResponseData(output.OutputKey, output.OutputValue);
          break;
        default:
          break;
      }
    });

    x0.storeResponseData('Status', 'SUCCESS');
    return x0.responseData;
  } catch (e) {
    e.message = `ParseMedia2CloudStack: ${e.message}`;
    throw e;
  }
};
