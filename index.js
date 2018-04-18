/**
 * Circuit FAQs Bot
 *
 */

'use strict';

const Entities = require('html-entities').XmlEntities;
const entities = new Entities();
const util = require('util');
const htmlToText = require('html-to-text');
const request = require('request');
const Circuit = require('circuit-sdk');
const config = require('./config')();
const converter = require('./converter');

// Local variables
let client;

//Circuit.setLogger(console);
const logger = Circuit.logger;

config.circuit.client_secret = process.env.CLIENT_SECRET || config.circuit.client_secret;
client = new Circuit.Client(config.circuit);

async function run() {
  const user = await client.logon();
  console.log(`[APP]: Logged on as ${user.emailAddress}`);

  await client.setPresence({state: Circuit.Enums.PresenceState.AVAILABLE});
  console.log('[APP]: Presence set to AVAILABLE');

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

    switch (item.type) {
      case Circuit.Enums.ConversationItemType.TEXT:
        responseText = await processTextItem(item);
        break;

      default:
        console.debug(`[APP]: Unhandled item type: ${item.type}`);
    }

    if (responseText) {
      await client.addTextItem(item.convId, {
        contentType: Circuit.Enums.TextItemContentType.RICH,
        parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
        content: responseText
      });
    }
  } catch (err) {
    console.error('[APP]: Error processing item', item);
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
      console.debug(`[APP]: Skip text item as it has no content`);
      return;
    }
    if (client.loggedOnUser.userId === item.creatorId) {
      console.debug(`[APP]: Skip text item as it is sent by the bot itself`);
      return;
    }

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
          console.debug(`[APP]: Answer to '${question}':`, answer);
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
  .then(() => console.log('[APP]: Started sucessfully'))
  .catch(err => console.error('[APP]:', err));
