
const request = require('request');

let config;
const answerToIdHashtable = {};

function init(cfg) {
  config = cfg;

  // Get mapping of article ID to unique answer ID, but only for
  // answers entered by import of faq-articles.xlsx
  download()
    .then(res =>
      res.forEach(item => {
        if (item.source === 'faq-articles.xlsx') {
          answerToIdHashtable[item.answer] = item.id;
        }
      })
    )
    .catch(err => console.error('Error downloading knowledgebase', err));
}

/**
 * Download complete knowledgebase
 * @returns {Object} Promise with answer object
 */
function download() {
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}/Prod/qna`,
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': `${config.subscriptionKey}`,
        'Content-Type': 'application/json'
      }
    };

    request(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        const res = JSON.parse(body);
        resolve(res.qnaDocuments);
        return;
      }
      reject(error);
    });
  });
}

/**
 * Ask AI service "QnA Maker" for an answer (id) to a question.
 * @param {String} question
 * @returns {Object} Promise with literal object with `id` and `score` properties, or `undefined` if no answer found.
 */
function ask(question) {
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.host}/knowledgebases/${config.knowledgebase}/generateAnswer`,
      method: 'POST',
      json: {
        'question': question,
        'top': 3
      },
      headers: {
        'Authorization': `EndpointKey ${config.key}`
      }
    };

    request(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        resolve(body.answers);
        return;
      }
      reject(error);
    });
  });
}

function publish() {
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}`,
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': `${config.subscriptionKey}`,
        'Content-Type': 'application/json'
      }
    };

    request(options, (error, response, body) => {
      if (!error) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

/**
 * Teach AI service "QnA Maker" with one or more alternate questions to an existing answer,
 * and publish the changes.
 * @param {Number|String} id ID for answer, or if a string is passed then assume its the answer (article ID)
 * @param {String[]} questions Alternate questions
 * @returns {Object} Promise without data
 */
function addAlternateQuestions(id, questions) {
  if (typeof id === 'string') {
    id = answerToIdHashtable[id];
  }
  if (!id) {
    throw new Error('Article ID not found for ID: ' + id);
  }

  questions = Array.isArray(questions) ? questions : [questions];
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}`,
      method: 'PATCH',
      json: {
        update: {
          qnaList: [{
            id: id,
            questions: {
              add: questions
            }
          }]
        }
      },
      headers: {
        'Ocp-Apim-Subscription-Key': `${config.subscriptionKey}`,
        'Content-Type': 'application/json'
      }
    };

    request(options, (error, response, body) => {
      if (!error) {
        publish()
          .then(resolve)
          .catch(reject);
        return;
      }
      reject(error);
    });
  });
}

/**
 * Teach AI service "QnA Maker" with a new question and answer pair and publish
 * the changes.
 * @param {String[]} questions Questions
 * @param {String} answer Answer text
 * @returns {Object} Promise without data
 */
async function addNewAnswer(questions, answer, creatorId) {
  questions = Array.isArray(questions) ? questions : [questions];
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}`,
      method: 'PATCH',
      json: {
        "add": {
          "qnaList": [
            {
              "id": Math.floor(Date.now() / 1000),
              "answer": answer,
              "questions": questions,
              "source": "admin-bot",
              "metadata": [
                {
                  "name": "creator",
                  "value": creatorId || -1
                }
              ]
            }
          ]
        }
      },
      headers: {
        'Ocp-Apim-Subscription-Key': `${config.subscriptionKey}`,
        'Content-Type': 'application/json'
      }
    };

    request(options, (error, response, body) => {
      if (!error) {
        publish()
          .then(resolve)
          .catch(reject);
        return;
      }
      reject(error);
    });
  });
}

module.exports = {
  init,
  ask,
  addAlternateQuestions,
  addNewAnswer
}