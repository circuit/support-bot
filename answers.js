const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const request = require('request');

/**
 * Lookup the answer text by the article ID on the Circuit support pages
 * @param {String} articleId
 */
function lookup(articleId) {
  return new Promise((resolve, reject) => {
    var options = {
      uri: 'https://www.circuit.com/unifyportalfaqdetail?articleId=' + articleId,
      method: 'GET'
    };
    request(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        const { document } = (new JSDOM(body)).window;

        let el = document.querySelector('.UnifyPortalJournalArticleDisplayDate').nextSibling;
        while (el.tagName !== 'DIV') {
          el = el.nextSibling;
        }
        if (el.tagName === 'DIV') {
          const res = convert(el);
          resolve(res);
          return;
        }
      }
      reject(error);
    });
  });


}

function convert(elem) {

  // Remove p tags and leave content
  const pTags = elem.querySelectorAll('p');
  for (let el of pTags) {
    el.insertAdjacentHTML('afterend', el.innerHTML);
    el.parentNode.removeChild(el);
  }

  // convert img tags
  const imgTags = elem.querySelectorAll('img');
  for (let el of imgTags) {
    el.classList = '';
    el.classList.add('emoticon-icon');
    el.classList.add('pill');
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.src = 'https://www.circuit.com' + el.src;
  }

  const elems = elem.querySelectorAll(`[href]`);
  for (let el of elems) {
    if (el.href.indexOf('/') === 0) {
      el.href = 'https://www.circuit.com' + el.href;
    }
  }

  var stripAttrs = ['summary', 'type', 'headers', 'frame', 'rules', 'id', 'target'];
  stripAttrs.forEach(attr => {
    const elems = elem.querySelectorAll(`[${attr}]`);
    for (let el of elems) {
      el.removeAttribute(attr);
    }
  });

  // remove 'caption' tags
  const captionTags = elem.querySelectorAll('caption');
  for (let el of captionTags) {
    el.parentNode.removeChild(el);
  }

  // backend doesn't like empty td or samp (span) tags
  const tdTags = elem.querySelectorAll('td');
  for (let el of tdTags) {
    if (!el.textContent) {
      el.textContent = '&nbsp;';
    }
  }

  const sampTags = elem.querySelectorAll('samp');
  for (let el of sampTags) {
    if (!el.textContent) {
      el.textContent = '&nbsp;';
    }
  }

  let content = elem.innerHTML;
  content = content.replace(/(<\s*\/?\s*)section(\s*([^>]*)?\s*>)/gi ,'$1div$2'); // switch section to div
  content = content.replace(/(<\s*\/?\s*)abbr(\s*([^>]*)?\s*>)/gi ,'$1span$2'); // switch abbr to span
  content = content.replace(/(<\s*\/?\s*)samp(\s*([^>]*)?\s*>)/gi ,'$1span$2'); // switch samp to span
  content = content.replace(/(<\s*\/?\s*)strong(\s*([^>]*)?\s*>)/gi ,'$1b$2'); // switch strong to b
  content = content.replace(/><\//g, ">&nbsp;</"); // more empty tags

  content = content.replace(/  +/g, ' ');  // remove multiple spaces
  content = content.replace(/(\r\n\t|\n|\r\t)/gm, ' '); // replace newlines with a space
  content = content.replace(/\> +/g, ">"); // remove spaces after closing tag
  content = content.replace(/ +</g, " <");  // remove multiple spaces before closing tag
  content = content.replace(/width="NaN%"/g, '');
  content = content.replace(/height="NaN%"/g, '') ;

  return content;
}

module.exports = {
  lookup
}