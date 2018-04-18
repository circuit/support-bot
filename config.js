'use strict';

const fs = require('fs');
const merge = require('deepmerge');
const env = require('./config.json');

let config = env;
try {
  fs.statSync('./config-override.json') && (config = merge(env, require('./config-override.json')));
} catch (err) {}

module.exports = () => {
  const node_env = process.env.NODE_ENV || 'development';
  return config[node_env];
};