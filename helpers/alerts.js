const fs = require('node:fs');
const { logFile } = require('./logs');
const { truncate } = require('./format');

// Turns the radio's own log events into messages worth a ping: the speaker
// dropping and coming back, a restart, the Jam's guest controls being on,
// soloist logging out. Each kind is held back for a while after it fires so a
// flapping link doesn't flood the channel.
function createAlerts({ send, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, offlineGraceMs = 45000, cooldownMs = 10 * 60 * 1000 }) {
  const last = new Map();
  let offlineTimer = null;
  let offlineAnnounced = false;

  const cooled = (key, ms = cooldownMs) => {
    const before = last.get(key);
    if (before !== undefined && now() - before < ms) return false;
    last.set(key, now());
    return true;
  };

  function speakerChanged(online) {
    if (!online) {
      // A drop of under a minute isn't news: the radio rides those out.
      if (offlineTimer || offlineAnnounced) return;
      offlineTimer = setTimer(() => {
        offlineTimer = null;
        offlineAnnounced = true;
        send('🔴 **The speaker is offline.** The Pi hasn\'t answered for a while, so the radio can\'t play.');
      }, offlineGraceMs);
      return;
    }
    if (offlineTimer) {
      clearTimer(offlineTimer);
      offlineTimer = null;
    } else if (offlineAnnounced) {
      offlineAnnounced = false;
      send('🟢 **The speaker is back.**');
    }
  }

  function handle(entry) {
    switch (entry.event) {
      case 'host.device-online-changed':
        return speakerChanged(entry.online !== false);
      case 'server.started':
        if (cooled('started', 60000)) send('🔄 **The radio server restarted.**');
        return;
      case 'jam.guest-controls-on':
        if (cooled('guest-controls', 60 * 60 * 1000)) send('⚠️ **Guest controls are on in the Jam**, so guests can add songs the radio can\'t see or remove. In the Spotify app on the DJ account: Jam details › Guest settings › Guest controls off.');
        return;
      case 'speaker.call-failed':
        if (/not logged in/i.test(entry.error?.message || '') && cooled('logged-out')) {
          send('🔑 **soloist is logged out of Spotify.** The Pi\'s watchdog restarts it after 3 checks in a row.');
        }
        return;
      default:
        if (entry.level === 'error' && cooled(`error:${entry.event}`)) {
          send(`❗ \`${entry.event}\`: ${truncate(entry.error?.message || entry.error?.detail || entry.message || 'see the log', 300)}`);
        }
    }
  }

  return { handle };
}

// Follows today's log file from where it is now (the history isn't replayed),
// moving to the next day's file after UTC midnight. Calls onEntry for each new
// complete line.
function createTailer({ djDir, onEntry, now = Date.now }) {
  let file = null;
  let offset = 0;
  let carry = '';

  function size(path) {
    try {
      return fs.statSync(path).size;
    } catch (error) {
      return null;
    }
  }

  function drain(path) {
    const end = size(path);
    if (end === null) return;
    if (end < offset) {
      offset = 0;
      carry = '';
    }
    if (end === offset) return;
    const fd = fs.openSync(path, 'r');
    try {
      const buffer = Buffer.alloc(end - offset);
      fs.readSync(fd, buffer, 0, buffer.length, offset);
      offset = end;
      const lines = (carry + buffer.toString('utf8')).split('\n');
      carry = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onEntry(JSON.parse(line));
        } catch (error) {
          // Not a log line we understand.
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  function poll() {
    const today = logFile(djDir, now());
    if (today !== file) {
      if (file) drain(file);
      const first = !file;
      file = today;
      offset = first ? (size(today) ?? 0) : 0;
      carry = '';
    }
    drain(file);
  }

  return { poll };
}

module.exports = { createAlerts, createTailer };
