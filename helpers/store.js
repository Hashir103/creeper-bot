const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

// A small JSON file for what the bot has to remember across restarts: which
// message is the live status, and which pull requests it has already announced.
function createStore(file = path.join(config.dataDir, 'state.json')) {
  let data = null;
  function load() {
    if (data) return data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch (error) {
      data = {};
    }
    return data;
  }
  return {
    get(key) {
      return load()[key];
    },
    set(key, value) {
      load()[key] = value;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      } catch (error) {
        console.warn('Could not save the bot state:', error.message);
      }
    }
  };
}

module.exports = { createStore };
