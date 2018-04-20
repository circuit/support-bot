const jsdom = require('jsdom');
const { JSDOM } = jsdom;

function convert(html) {
  const { document } = (new JSDOM(html)).window;

  // Get title
  let title = document.querySelector('.title');
  if (!title) {
    return;
  }
  title = title.textContent;

  // Get body
  let taskbody = document.querySelector('.taskbody');
  if (!taskbody) {
    taskbody = document.querySelector('.conbody');
  }
  if (!taskbody) {
    return;
  }

  // Remove p tags and leave content
  const pTags = taskbody.querySelectorAll('p');
  for (let el of pTags) {
    el.insertAdjacentHTML('afterend', el.innerHTML);
    el.parentNode.removeChild(el);
  }

  // convert img tags
  const imgTags = taskbody.querySelectorAll('img');
  for (let el of imgTags) {
    el.classList = '';
    el.classList.add('emoticon-icon');
    el.classList.add('pill');
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.src = 'https://www.circuit.com' + el.src;
  }

  // remove 'type' attribute
  const typeAttrs = document.querySelectorAll('[type]');
  for (let el of typeAttrs) {
    el.removeAttribute('type');
  }

  // remove 'headers' attribute
  const headersAttrs = document.querySelectorAll('[headers]');
  for (let el of headersAttrs) {
    el.removeAttribute('headers');
  }

  // remove 'id' attribute
  const idAttrs = document.querySelectorAll('[id]');
  for (let el of idAttrs) {
    el.removeAttribute('id');
  }

  // remove 'caption' tags
  const captionTags = document.querySelectorAll('caption');
  for (let el of captionTags) {
    el.parentNode.removeChild(el);
  }

  // backend doesn't like empty td or samp (span) tags
  const tdTags = document.querySelectorAll('td');
  for (let el of tdTags) {
    if (!el.textContent) {
      el.textContent = '&nbsp;';
    }
  }

  const sampTags = document.querySelectorAll('samp');
  for (let el of sampTags) {
    if (!el.textContent) {
      el.textContent = '&nbsp;';
    }
  }

  let content = taskbody.innerHTML;
  content = content.replace(/(<\s*\/?\s*)section(\s*([^>]*)?\s*>)/gi ,'$1div$2'); // switch section to div
  content = content.replace(/(<\s*\/?\s*)abbr(\s*([^>]*)?\s*>)/gi ,'$1span$2'); // switch abbr to span
  content = content.replace(/(<\s*\/?\s*)samp(\s*([^>]*)?\s*>)/gi ,'$1span$2'); // switch samp to span
  content = content.replace(/(<\s*\/?\s*)strong(\s*([^>]*)?\s*>)/gi ,'$b$2'); // switch samp to span
  content = content.replace(/  +/g, ' ');  // remove multiple spaces
  content = content.replace(/(\r\n\t|\n|\r\t)/gm, ' '); // replace newlines with a space
  content = content.replace(/\> +/g, ">"); // remove spaces after closing tag
  content = content.replace(/ +</g, " <");  // remove multiple spaces before closing tag

  content = '<b>' + title + '</b><br><br>' + content;
  return {
    title: title,
    answer: content
  };
}

module.exports = {
  convert
}
