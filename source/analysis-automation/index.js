const {
  SnsHandler,
} = require('./lib/sns-handler');

const {
  CronJobHandler,
} = require('./lib/cronjob-handler');


function isCronJobEvent(event) {
  return event.service === 'events.amazonaws.com';
}

function isSNSEvent(event) {
  try {
    JSON.parse(event.Records[0].Sns.Message);
    return true;
  } catch (e) {
    return false;
  }
}

exports.handler = async (event, context) => {
  console.log(`event = ${JSON.stringify(event, null, 2)}; context = ${JSON.stringify(context, null, 2)};`);
  try {
    const instance = (isCronJobEvent(event))
      ? new CronJobHandler(event, context)
      : (isSNSEvent(event))
        ? new SnsHandler(event, context)
        : undefined;

    if (!instance) {
      return undefined;
    }

    const response = await instance.process();
    console.log(JSON.stringify(response, null, 2));

    return response;
  } catch (e) {
    console.error(e);
    throw e;
  }
};
