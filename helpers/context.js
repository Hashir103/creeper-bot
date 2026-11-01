const config = require('./config');
const { createRadio } = require('./radio');
const { createHost, execRun } = require('./host');

// What the commands share, so each one doesn't build its own. main.js gives it
// a way to post to the updates channel (used to log dev actions there).
let announcer = async () => {};

module.exports = {
  config,
  radio: createRadio(),
  host: createHost({ djDir: config.djDir, service: config.djService }),
  run: execRun,
  announce: (text) => announcer(text),
  setAnnouncer: (fn) => { announcer = fn; }
};
