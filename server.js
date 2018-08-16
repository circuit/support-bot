
/**
 * Circuit FAQs Bot
 *
 */

'use strict';

const util = require('util');
const htmlToText = require('html-to-text');
const EventEmitter = require('events');
const Circuit = require('circuit-sdk');
const config = require('./config')();
const webserver = require('./webserver');
const ai = require('./ai/qnamaker');
const answers = require('./answers');

console.log('process.env.ENDPOINT_KEY:', process.env.ENDPOINT_KEY)
console.log('process.env.CLIENT_SECRET:', process.env.CLIENT_SECRET)

// Overwrite config with env variables (production)
config.circuit.client_id = process.env.CLIENT_ID || config.circuit.client_id;
config.circuit.client_secret = process.env.CLIENT_SECRET || config.circuit.client_secret;
config.circuit.domain = process.env.DOMAIN || config.circuit.domain;
config.qna_subscription = process.env.QNA_SUBSCRIPTION || config.qna_subscription;
config.key = process.env.ENDPOINT_KEY || config.key;
config.subscriptionKey = process.env.SUBSCRIPTION_KEY || config.subscriptionKey;

// Main emitter for communication
const emitter = new EventEmitter();

// Create circuit client instance
// Circuit.setLogger(console);
const client = new Circuit.Client(config.circuit);

// Start webserver
webserver(emitter);

// Cache conversations the bot is added to so we know if its a Direct or Group conv
const conversations = {};

// Cache possible questions until answer is posted
const pendingQuestions = new Map();

async function logon() {
  const user = await client.logon();
  console.info(`[APP]: Logged on as ${user.emailAddress}`);

  await client.setPresence({state: Circuit.Enums.PresenceState.AVAILABLE});
  console.info('[APP]: Presence set to AVAILABLE');

  // Handle new conversation item events
  client.addEventListener('itemAdded', processItem);

  // Handle form submissions
  client.addEventListener('formSubmission', processForm);
}

/**
 * Process Conversation Item
 * @param {Object} evt
 */
async function processItem(evt) {
  const item = evt.item;

  try {
    if (!conversations[item.convId]) {
      // Cache conversation
      conversations[item.convId] = await client.getConversationById(item.convId);
    }

    switch (item.type) {
      case Circuit.Enums.ConversationItemType.TEXT:
        await processTextItem(item);
        break;

      default:
      console.debug(`[APP]: Unhandled item type: ${item.type}`);
    }
  } catch (err) {
    console.error(`[APP]: Error processing itemId: ${item && item.itemId}`, err);
    const msg = 'There was an error processing your request. Check if you find an answer on <a href="https://www.circuit.com/support">Circuit Support</a>.';
    await client.addTextItem(item.convId, {
      contentType: Circuit.Enums.TextItemContentType.RICH,
      parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
      content: msg
    });
  }
}

/**
 * Process Form submitted by the user
 * @param {Object} evt
 */
async function processForm(evt) {
  const {itemId, form, submitterId} = evt;

  try {
    if (!form.data || !form.data.length) {
      // Invalid form data
      return;
    }

    let reply;
    const pending = pendingQuestions.get(form.id);
    if (!pending) {
      console.error('Form or question not found in cache', pending);
      reply = `Sorry, there has been a problem with this older question. Please ask again.`;
      await updateTextItem(itemId, reply, form.id);
      return;
    }

    if (form.data[0].name === 'betterQuestion') {
      // This the form posted by the moderator with either the article ID or an answer, and
      // optionally a better question
      if (form.data[3].value !== 'answered') {
        reply = `This question was marked as not relevenat and will not be answered.`;
        await updateTextItem(pending.itemId, reply, form.id);
        return;
      }

      const betterQuestion = form.data[0].value;
      const articleId = form.data[1].value;
      let answerText = form.data[2].value;

      if (articleId) {
         // ArticleID is provided. Add the asked question and optionally a 'better' question to this answer
        await ai.addAlternateQuestions(articleId, [pending.question, betterQuestion]);

        answerText = await answers.lookup(articleId);
      } else if (answerText) {
         // New answer is provided. Add a new answer with the question and optionally a 'better' question
        await ai.addNewAnswer([pending.question, betterQuestion], answerText, submitterId);
      } else {
        console.error('Moderator did not specify either an articleId or an answer');
        return;
      }

      if (!answerText) {
        console.error('No answer found even though AI server was just taught.');
        return;
      }

      // Update question posted by user with new answer, and better question (if provided).
      reply = `<u>${betterQuestion || pending.question}</u><br><br>${answerText}`;
      await updateTextItem(pending.itemId, reply, form.id);

      // Update moderator item
      reply = 'AI database updated.<br><br>';
      reply += `<i>Original question</i>: ${pending.question}<br>`;
      reply += `<i>Better question</i>: ${betterQuestion ? betterQuestion : 'Not provided'}<br>`;
      reply += `<i>Answer</i>: ${answerText}`;
      await updateTextItem(itemId, reply, form.id);

      return;
    }

    // This is the form posted by the user
    const selection = parseInt(form.data[0].value);
    if (selection === -1) {
      // 'None of the above' selected
      reply = `Let me check with a Circuit expert if we can find an answer for you. Might not be until tomorrow though.<br>You may also try to ask the question in a different way.`;
      await updateTextItem(itemId, reply, form.id);

      // Post question in moderator conversation. Moderators can then assign the question
      // to an answer, or create a new answer for the question.
      postInModerationConv(pending.question, form.id)
    } else {
      const questions = [];
      const res = pending.aiRes.find(res => res.id === selection);
      if (!res) {
        console.error('Form or question not found in cache', pending);
        reply = `Sorry, there has been a problem with this older question. Please ask again.`;
      } else {
        reply = `<u>${res.questions[0]}</u><br><br>${await answers.lookup(res.answer)}`;
      }
      await updateTextItem(itemId, reply, form.id);
      // teach service
      await ai.addAlternateQuestions(res.id, pending.question);

      pendingQuestions.delete(form.id);
    }
  } catch (err) {
    console.error(`[APP]: Error processing form for item ${itemId}`, err);
  }
}

async function postInModerationConv(question, formId) {
  if (!config.moderatorConvId) {
    return;
  }

  const questionShort = question.length > 50 ? question.substring(0, 49) + '...' : question;

  const textItem = {
    subject: 'Unanswered question: ' + questionShort,
    contentType: Circuit.Enums.TextItemContentType.RICH,
    content: 'No matching question was found. Provide the article ID for the answer of this question. If no answer exists yet, enter one. The answer will then be added to the AI database and also replied to the user.'
  }

  textItem.form = {
    id: formId,
    controls: [{
      type: Circuit.Enums.FormControlType.LABEL,
      text: `<b>${question}</b>`
    }, {
      type: Circuit.Enums.FormControlType.LABEL,
      text: 'Opionally provide a better question, then provide the article ID for an existing answer, <b>or</b> create a new answer.'
    }, {
      name: 'betterQuestion',
      type: Circuit.Enums.FormControlType.INPUT,
      text: 'Better question (optionally)'
    }, {
      name: 'article',
      type: Circuit.Enums.FormControlType.INPUT,
      text: 'Article ID'
    }, {
      name: 'answer',
      type: Circuit.Enums.FormControlType.INPUT,
      text: 'Answer',
      rows: 3
    }, {
      name: 'selection',
      type: Circuit.Enums.FormControlType.BUTTON,
      options: [{
        value: 'answered',
        text: 'Submit',
        notification: 'Answer submitted'
      }, {
        value: 'rejected',
        text: 'Reject question',
        notification: 'Question rejected'
      }]
    }]
  }

  await client.addTextItem(config.moderatorConvId, textItem);
}

async function updateTextItem(itemId, text, formId) {
  // Need to fetch item to get the convId as this is needed to send a reply
  // Ideally this is cached so this lookup can be skipped
  const item = await client.getItemById(itemId);

  await client.updateTextItem({
    itemId: itemId,
    contentType: Circuit.Enums.TextItemContentType.RICH,
    parentId: (item.parentItemId) ? item.parentItemId : item.itemId,
    content: text,
    form: { id: formId } // Remove form
  });
}

/**
 * Process Text Item
 * @param {Object} item
 */
async function processTextItem(item) {
  let question = item.text && (item.text.content || item.text.subject);
  if (!question) {
    console.debug(`[APP]: Skip text item as it has no content`);
    return;
  }
  if (client.loggedOnUser.userId === item.creatorId) {
    console.debug(`[APP]: Skip text item as it is sent by the bot itself`);
    return;
  }

  const conv = conversations[item.convId];
  if (conv.type === Circuit.Enums.ConversationType.GROUP || conv.type === Circuit.Enums.ConversationType.COMMUNITY) {
    // Only process if bot is mentioned
    const mentionedUsers = Circuit.Utils.createMentionedUsersArray(question);
    if (!mentionedUsers.includes(client.loggedOnUser.userId)) {
      console.debug('Group conversation message without being mentioned. Skip it.');
      return;
    }
  }

  // Remove mentions (spans)
  question = question.replace(/<span[^>]*>([^<]+)<\/span>/g, '');

  // Remove html if any in the question
  question = htmlToText.fromString(question);

  console.log(`[APP]: Lookup AI service for question: '${question}'`);
  let aiRes = await ai.ask(question);

  // Expects an array of answer objects as per Microsoft QnA service response.
  /* E.g.
  [{
    "questions": ["Can I delete files and conversation items?"],
    "answer": "38334",
    "score": 51.48,
    "id": 323
  }, {
    ...
  }]
  */
  console.log('[APP]: AI response: ', aiRes);
  if (!aiRes) {
    throw new Error('Invalid response from AI module');
  }

  // Apply thresholds
  aiRes = applyThresholds(aiRes);

  // Reply to be posted
  const replyTextItem = {
    contentType: Circuit.Enums.TextItemContentType.RICH,
    parentId: (item.parentItemId) ? item.parentItemId : item.itemId
  }

  const pending = { question, aiRes };

  // Add to pendingQuestions cache
  const formId = generateFormId();
  pendingQuestions.set(formId, pending);

  if (!aiRes.length) {
    // No matching question found with required threshold
    replyTextItem.content = `I don't have an answer for that right now. Let me check with a Circuit expert and get back to you. Might not be until tomorrow though.`;

    // Post question in moderator conversation. Moderators can then assign the question
    // to an answer, or create a new answer for the question.
    postInModerationConv(pending.question, formId)
  } else {
    // Multiple possible answers found. Show the top ones to the user to choose.
    replyTextItem.content = 'Select one of the questions to view the answer.';
    replyTextItem.form = buildMatchingQuestionsForm(formId, aiRes);
  }

  // Send reply
  const newItem = await client.addTextItem(item.convId, replyTextItem);
  pending.itemId = newItem.itemId;
}

function applyThresholds(aiRes) {
  // Sort by score
  aiRes.sort((a, b) => b.score - a.score);

  // Get first 3 (or less if there are not even 3)
  aiRes = aiRes.slice(0, Math.min(aiRes.length, 3));

  // Only get answers with scores above threshold
  aiRes = aiRes.filter(answer => answer.score > 30);

  return aiRes;
}

function buildMatchingQuestionsForm(formId, aiRes) {
  const form = {
    id: formId,
    controls: [{
      type: Circuit.Enums.FormControlType.RADIO,
      name: 'question',
      options: []
    }, {
      type: Circuit.Enums.FormControlType.BUTTON,
      text: 'View answer',
      action: 'submit'
    }]
  }

  // Only show the first question which is the official one.
  // I.e. Don't display questions learned by user entry
  aiRes.forEach(res => {
    form.controls[0].options.push({
      text: `${res.questions[0]} (${res.score}, ${res.answer}, ${res.id})`,
      value: res.id.toString()
    });
  });

  form.controls[0].options.push({
    text: 'None of the above',
    value: '-1'
  });

  return form;
}

function generateFormId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

console.info('Starting app with configuration:', config);

ai.init(config.qnamaker);

logon()
  .then(() => console.log('[APP]: App started sucessfully'))
  .catch(err => console.error('[APP]:', err));
