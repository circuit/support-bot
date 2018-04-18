const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const json2xls = require('json2xls');
const converter = require('./converter');

const DITA_DIR = './EN';
const HTML_DIR = './EN_HTML';
const OUT_FILE = 'faq.xlsx';
const DITA_PATH = '/Users/roger2/Downloads/dita-ot-3.0.3/bin';

try {
  const dirCont = fs.readdirSync(DITA_DIR);
  const files = dirCont.filter(elm => elm.match(/.*\.(dita)$/ig));

  // Convert dita files to html files
  console.log('Converting dita files...');
  const htmlFiles = files.map(file => {
    // dita -i ~/github/circuit-faq-bot/EN/d93392.dita --format=html5 -o ~/github/circuit-faq-bot/EN/aaa.html
    const dita = file.replace('.dita', '');
    const htmlFile = `${dita}/${dita}.html`;
    console.log(`  ${file} > ${htmlFile}`);
    //child_process.execSync(`${DITA_PATH}/dita -i ${DITA_DIR}/${file} --format=html5 -o ${HTML_DIR}/${dita}`, {stdio:[0,1,2]});
    return htmlFile;
  });

  console.log('\nParsing html files...');
  let data = [];
  htmlFiles.forEach(file => {
    file = path.join(HTML_DIR, file);
    if (!fs.existsSync(file)) {
      console.log('File does not exist: ' + file);
      return;
    }
    const html = fs.readFileSync(file, 'utf8');
    const res = converter.convert(html);
    res && data.push(res);
  });

  fs.writeFileSync(OUT_FILE, json2xls(data), 'binary');
  console.log(`Exported ${data.length} out of ${files.length} files.`);
} catch (err) {
  console.error(err);
}
