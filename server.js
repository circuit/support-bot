
/**
 * Circuit FAQs Bot
 *
 */

'use strict';

const util = require('util');
const htmlToText = require('html-to-text');
const Circuit = require('circuit-sdk');
const config = require('./config')();
const webserver = require('./webserver');
const ai = require('./qnamaker');
const answers = require('./answers');

// Circuit.setLogger(console);

// Local variables
let client;
const conversations = {};

config.circuit.client_id = process.env.CLIENT_ID || config.circuit.client_id;
config.circuit.client_secret = process.env.CLIENT_SECRET || config.circuit.client_secret;
config.circuit.domain = process.env.DOMAIN || config.circuit.domain;
config.qna_subscription = process.env.QNA_SUBSCRIPTION || config.qna_subscription;
console.info('Starting with configuration:', config);

client = new Circuit.Client(config.circuit);
ai.init({
  key: config.qna_subscription
});

async function logon() {
  const user = await client.logon();
  console.info(`[APP]: Logged on as ${user.emailAddress}`);

  await client.setPresence({state: Circuit.Enums.PresenceState.AVAILABLE});
  console.info('[APP]: Presence set to AVAILABLE');

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
      console.debug(`[APP]: Unhandled item type: ${item.type}`);
    }

    if (responseText) {
      console.log(`[APP]: Answer with:`, responseText);

      await client.addTextItem(item.convId, {
        contentType: Circuit.Enums.TextItemContentType.RICH,
        parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
        content: responseText
      });
    }
  } catch (err) {
    console.error('[APP]: Error processing item', item, err);
    try {
      const msg = 'There was an error processing your request. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.';
      await client.addTextItem(item.convId, {
        contentType: Circuit.Enums.TextItemContentType.RICH,
        parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
        content: msg
      });
    } catch (err2) {
      console.error('[APP]: Error processing item, and error sending error message in Circuit', err);
    }
  }
}

/**
 * Process Text Item
 * @param {Object} item
 */
function processTextItem(item) {
  let question = item.text && (item.text.content || item.text.subject);
  if (!question) {
    console.debug(`[APP]: Skip text item as it has no content`);
    return Promise.resolve();
  }
  if (client.loggedOnUser.userId === item.creatorId) {
    console.debug(`[APP]: Skip text item as it is sent by the bot itself`);
    return Promise.resolve();
  }

  const conv = conversations[item.convId];
  if (conv.type === Circuit.Enums.ConversationType.GROUP || conv.type === Circuit.Enums.ConversationType.COMMUNITY) {
    // Only process if bot is mentioned
    const mentionedUsers = Circuit.Utils.createMentionedUsersArray(question);
    if (!mentionedUsers.includes(client.loggedOnUser.userId)) {
      console.debug('Group conversation message without being mentioned. Skip it.');
      return Promise.resolve();
    }
  }

  // Remove mentions (spans)
  question = question.replace(/<span[^>]*>([^<]+)<\/span>/g, '');

  // Remove html if any in the question
  question = htmlToText.fromString(question);

  console.log('[APP]: Lookup AI service for question: ' + question);

  return ai.ask(question)
    .then(res => {
      console.info('AI response abc : ', res);

      // Expects an array of objects with a 'answer' and 'score' property (0..99)
      if (!res) {
        return('Sorry, could not find an answer. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.');
      }

      // Only handle first answer for now
      res = res[0];
      if (res.score !== undefined && res.score < 40) {
        return('Sorry, could not find a good answer. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.');
      }

      if (res.id) {
        // Need to look up answer text via 'answers' module
        return answers.lookup(res.id);
      } else {
        return res.answer;
      }
    });
}

// Start webserver just to check if app is running
webserver();

logon()
  .then(() => console.log('[APP]: Started sucessfully'))
  .catch(err => console.error('[APP]:', err));
