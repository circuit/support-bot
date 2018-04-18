/**
 * Circuit FAQs Bot
 *
 */

'use strict';

const bunyan = require('bunyan');
const Entities = require('html-entities').XmlEntities;
const entities = new Entities();
const util = require('util');
const htmlToText = require('html-to-text');
const request = require('request');
const Circuit = require('circuit-sdk');
const config = require('./config')();
const converter = require('./converter');

// App and SDK loggers
const logger = bunyan.createLogger({
  name: 'app',
  stream: process.stdout,
  level: config.appLogLevel
});
logger.info('[APP]: app logger set to level: ' + config.appLogLevel);

Circuit.setLogger(bunyan.createLogger({
  name: 'sdk',
  stream: process.stdout,
  level: config.sdkLogLevel
}));
logger.info('[APP]: sdk logger set to level: ' + config.sdkLogLevel);


// Local variables
let client;
const conversations = {};

config.circuit.client_id = process.env.CLIENT_ID || config.circuit.client_id;
config.circuit.client_secret = process.env.CLIENT_SECRET || config.circuit.client_secret;
config.circuit.domain = process.env.DOMAIN || config.circuit.domain;
config.qna_subscription = process.env.QNA_SUBSCRIPTION || config.qna_subscription;
logger.info('Configuration:', config);

client = new Circuit.Client(config.circuit);

async function run() {
  const user = await client.logon();
  logger.info(`[APP]: Logged on as ${user.emailAddress}`);

  await client.setPresence({state: Circuit.Enums.PresenceState.AVAILABLE});
  logger.info('[APP]: Presence set to AVAILABLE');

  // Handle new conversation item events
  client.addEventListener('itemAdded', processItem);
}


/**
 * Process Conversation Item
 * @param {Object} evt
 */
async function processItem(evt) {
  const item = evt.item;

  try {
    let responseText;

    if (!conversations[item.convId]) {
      conversations[item.convId] = await client.getConversationById(item.convId);
    }

    switch (item.type) {
      case Circuit.Enums.ConversationItemType.TEXT:
        responseText = await processTextItem(item);
        break;

      default:
        logger.debug(`[APP]: Unhandled item type: ${item.type}`);
    }

    if (responseText) {
      await client.addTextItem(item.convId, {
        contentType: Circuit.Enums.TextItemContentType.RICH,
        parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
        content: responseText
      });
    }
  } catch (err) {
    logger.error('[APP]: Error processing item', item);
    const msg = 'There was an error processing your request. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.';
    await client.addTextItem(item.convId, {
      contentType: Circuit.Enums.TextItemContentType.RICH,
      parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
      content: msg
    });
  }
}

/**
 * Process Text Item
 * @param {Object} item
 */
function processTextItem(item) {
  return new Promise((resolve, reject) => {
    let question = item.text && (item.text.content || item.text.subject);
    if (!question) {
      logger.debug(`[APP]: Skip text item as it has no content`);
      return;
    }
    if (client.loggedOnUser.userId === item.creatorId) {
      logger.debug(`[APP]: Skip text item as it is sent by the bot itself`);
      return;
    }

    const conv = conversations[item.convId];
    if (conv.type === Circuit.Enums.ConversationType.GROUP) {
      // Only process if bot is mentioned
      const mentionedUsers = Circuit.Utils.createMentionedUsersArray(question);
      if (!mentionedUsers.includes(client.loggedOnUser.userId)) {
        logger.debug('Group conversation message without being mentioned. Skip it.');
        return;
      }
    } else if (conv.type === Circuit.Enums.ConversationType.DIRECT) {
      // go on
    } else {
      logger.info('Not supported conversation type: ' + conv.type);
      return;
    }

    // Remove mentions (spans)
    question = question.replace(/<span[^>]*>([^<]+)<\/span>/g, '');

    var options = {
      uri: 'https://westus.api.cognitive.microsoft.com/qnamaker/v2.0/knowledgebases/a6bc926f-c382-4133-bd2c-e52dce88f0d7/generateAnswer',
      method: 'POST',
      json: {
        'question': htmlToText.fromString(question)
      },
      headers: {
        'Ocp-Apim-Subscription-Key': config.qna_subscription
      }
    };

    request(options, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        let firstAnswer = body.answers[0];
        if (firstAnswer.score > 40) {
          let answer = entities.decode(firstAnswer.answer);
          logger.debug(`[APP]: Answer to '${question}':`, answer);
          resolve(answer);
          return;
        }

        resolve('Sorry, could not find a good answer. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.');
        return;
      }
      reject(error);
    });
  })
}

run()
  .then(() => logger.info('[APP]: Started sucessfully'))
  .catch(err => logger.error('[APP]:', err));
