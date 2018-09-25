
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
 * @param {Boolean} prod If true, the download production dataset
 * @returns {Object} Promise with answer object
 */
function download(prod) {
  const db = prod ? 'Prod' : 'Test';
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}/${db}/qna`,
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
 * @param {Boolean} prod If true, the published production dataset is queried
 * @returns {Object} Promise with literal object with `id` and `score` properties, or `undefined` if no answer found.
 */
function ask(question, prod) {
  return new Promise((resolve, reject) => {
    const options = {
      uri: `${config.host}/knowledgebases/${config.knowledgebase}/generateAnswer`,
      method: 'POST',
      json: {
        'question': question,
        'top': 3,
        'isTest': !prod
      },
      headers: {
        'Authorization': `EndpointKey ${config.key}`
      }
    };

    console.debug('generateAnswer request', options);

    request(options, (error, response, body) => {
      console.debug('Response for generateAnswer request', response);
      if (!error && response.statusCode === 200) {
        console.info('Answers:', body.answers);
        resolve(body.answers);
        return;
      }
      reject(error);
    });
  });
}

function publish() {
  console.log('AI service publish started');
  return new Promise((resolve, reject) => {
    var options = {
      uri: `${config.hostv4}/${config.knowledgebase}`,
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': `${config.subscriptionKey}`,
        'Content-Type': 'application/json'
      }
    };

    setTimeout(() => {
      request(options, (error, response, body) => {
        if (!error) {
          console.log('AI service published');
          resolve();
          return;
        }
        console.error('AI service publish error', error);
        reject(error);
      });
    }, 5000);
  });
}

/**
 * Teach AI service "QnA Maker" with one or more alternate questions to an existing answer.
 * @param {Number|String} id ID for answer, or if a string is passed then assume its the answer (article ID)
 * @param {String[]} questions Alternate questions
 * @returns {Object} Promise without data
 */
function addAlternateQuestions(id, questions) {
  const idStr = id;
  if (typeof id === 'string') {
    id = answerToIdHashtable[id];
  }
  if (!id) {
    console.error('Article not found with ID: ' + id);
    return Promise.reject(`Article ID ${idStr} not supported. Reason may be that this is a newly added article.`);
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

    console.debug('addAlternateQuestions request', options);

    request(options, (error, response, body) => {
      if (!error) {
        console.info('Alternate question added to ' + id, questions);
        resolve();
        return;
      }
      reject(error);
    });
  });
}

/**
 * Teach AI service "QnA Maker" with a new question and answer pair.
 * @param {String[]} questions Questions
 * @param {String} answer Answer text
 * @returns {Object} Promise without data
 */
async function addNewAnswer(questions, answer, creatorId) {
  questions = Array.isArray(questions) ? questions : [questions];
  return new Promise((resolve, reject) => {
    const options = {
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

    console.debug('addNewAnswer request', options);

    request(options, (error, response, body) => {
      if (!error) {
        resolve();
        console.info('New answer added', questions, answer, creatorId);
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