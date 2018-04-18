'use strict';

const http = require('http');
const bunyan = require('bunyan');
const config = require('./config')();

const logger = bunyan.createLogger({
  name: 'web',
  stream: process.stdout,
  level: config.appLogLevel
});

module.exports = () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('CTO Bot');
  });
  const port = process.env.PORT || 1337;
  logger.info(`[APP]: Started webserver on port ${port}`);
  server.listen(port);
}