'use strict';

const express = require('express');
const app = express()
const config = require('./config')();
const PORT = process.env.PORT || 1337;

module.exports = emitter => {
  app.get('/', (req, res) => res.send('Circuit QnA Bot is running'));

  app.listen(PORT, () => console.log(`[APP]: Started webserver on port ${PORT}`))
}