const {
  CloudFormationResponse,
} = require('./lib/shared/cfResponse');


exports.handler = async (event, context) => {
  console.log(`\nconst event = ${JSON.stringify(event, null, 2)};\nconst context = ${JSON.stringify(context, null, 2)}`);

  const cfResponse = new CloudFormationResponse(event, context);

  let response;

  try {
    const {
      FunctionName,
    } = (event || {}).ResourceProperties || {};

    let handler;
    switch (FunctionName) {
      /* cloudformation */
      case 'ParseMedia2CloudStack':
        handler = require('./lib/cloudformation').ParseMedia2CloudStack;
        break;
      /* dynamodb */
      case 'CreateAtomicCounter':
        handler = require('./lib/dynamodb').CreateAtomicCounter;
        break;
      default:
        break;
    }

    if (!handler) {
      throw Error(`${FunctionName} not implemented`);
    }

    response = await handler(event, context);
    console.log(`response = ${JSON.stringify(response, null, 2)}`);

    response = await cfResponse.send(response);

    return response;
  } catch (e) {
    console.error(e);
    response = await cfResponse.send(e);

    return response;
  }
};
