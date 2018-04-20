'use strict';

const http = require('http');
const config = require('./config')();

module.exports = () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Circuit Support Bot is running');
  });
  const port = process.env.PORT || 1337;
  console.info(`[APP]: Started webserver on port ${port}`);
  server.listen(port);
}