
const request = require('request');

let config;

function init(cfg) {
  config = cfg;
}

/**
 * Ask AI service "QnA Maker" for an answer (id) to a question.
 * @param {String} question
 * @returns {Object} Promise with literal object with `id` and `score` properties, or `undefined` if no answer found.
 */
function ask(question) {
  return new Promise((resolve, reject) => {
    var options = {
      uri: 'https://westus.api.cognitive.microsoft.com/qnamaker/v2.0/knowledgebases/e6fa0d6e-36aa-4da8-a9c3-40d967cf8f34/generateAnswer',
      method: 'POST',
      json: {
        'question': question
      },
      headers: {
        'Ocp-Apim-Subscription-Key': config.key
      }
    };

    request(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        const res = body.answers.map(a => {
           const r = { score: a.score };
          if (Number.isInteger(a.answer)) {
            r.id = a.answer;
          } else {
            r.answer = a.answer;
          }
          return r;
        });
        resolve(res);
        return;
      }
      reject(error);
    });
  });
}

module.exports = {
  init,
  ask
}