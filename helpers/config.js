const path = require('node:path');
require('dotenv').config();

const env = process.env;
const url = (value, fallback) => String(value || fallback).trim().replace(/\/+$/, '');

// token, clientId and guildId keep the names the first version of the bot used.
module.exports = {
  token: env.token,
  clientId: env.clientId,
  guildId: env.guildId,
  // Only people with this role can use /dev. Unset, nobody can.
  adminRoleId: String(env.ADMIN_ROLE_ID || '').trim(),
  // The live status message, alerts and dev activity go here.
  updatesChannelId: String(env.UPDATES_CHANNEL_ID || '').trim(),
  alertsChannelId: String(env.ALERTS_CHANNEL_ID || env.UPDATES_CHANNEL_ID || '').trim(),
  // The radio's own server, read on this machine, and where its code and logs are.
  djUrl: url(env.DJ_URL, 'http://127.0.0.1:20032'),
  djDir: String(env.DJ_DIR || '/home/ubuntu/dj').trim(),
  djService: String(env.DJ_SERVICE || 'dj').trim(),
  radioUrl: url(env.RADIO_URL, 'https://dj.hashir.tech'),
  githubRepo: String(env.GITHUB_REPO || 'Hashir103/public-dj-project').trim(),
  dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
  statusEveryMs: 15000,
  githubEveryMs: 3 * 60 * 1000,
  logEveryMs: 2000
};
