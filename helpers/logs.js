const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

// The radio writes one JSON line per event to .data/logs/radio-YYYY-MM-DD.log,
// dated in UTC, and keeps two weeks. This only reads them.
const DAY_MS = 24 * 60 * 60 * 1000;

const logDir = (djDir) => path.join(djDir, '.data', 'logs');
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const logFile = (djDir, ms) => path.join(logDir(djDir), `radio-${dayOf(ms)}.log`);

// Events in a time range. prefilter gets each raw line first, so lines that
// can't matter aren't parsed (a day's log is mostly debug lines).
async function readEvents({ djDir, sinceMs, untilMs = Date.now(), prefilter = () => true }) {
  const events = [];
  for (let day = Date.parse(`${dayOf(sinceMs)}T00:00:00Z`); day <= untilMs; day += DAY_MS) {
    const file = logFile(djDir, day);
    if (!fs.existsSync(file)) continue;
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!prefilter(line)) continue;
      try {
        const entry = JSON.parse(line);
        const time = Date.parse(entry.time);
        if (time >= sinceMs && time <= untilMs) events.push({ ...entry, at: time });
      } catch (error) {
        // A half-written line.
      }
    }
  }
  return events;
}

const isWarnOrError = (line) => line.includes('"level":"warn"') || line.includes('"level":"error"');

// Counts of each event, for a quick read of what has been going wrong.
function summarize(events) {
  const counts = new Map();
  for (const entry of events) {
    const key = `${entry.level} ${entry.event}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const STAT_EVENTS = ['playback.started', 'poll.natural-change', 'idle.play', 'idle.genre-change', 'vote.skip', 'poll.skipped-in-spotify', 'host.device-online-changed', 'server.started'];
const isStatEvent = (line) => STAT_EVENTS.some((name) => line.includes(`"event":"${name}"`));

function top(counts, limit = 5) {
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

// The fun numbers: what played, who asked for it, which genres, and how the
// speaker behaved. A song is counted when the radio starts it, or when Spotify
// moves on to the one that was lined up (poll.natural-change, which says when
// that was one of the DJ's own picks). The DJ plays five songs per genre, so
// genres are counted by blocks, which is the same whichever way a song started.
function radioStats(events) {
  const plays = [];
  const adders = new Map();
  const genres = new Map();
  let djPicks = 0;
  let skips = 0;
  let speakerDrops = 0;
  let restarts = 0;
  for (const entry of events) {
    if ((entry.event === 'playback.started' || entry.event === 'poll.natural-change') && entry.song?.uri) {
      plays.push(entry.song);
      if (entry.event === 'poll.natural-change' && entry.idle) djPicks += 1;
    } else if (entry.event === 'idle.play') {
      djPicks += 1;
    } else if (entry.event === 'idle.genre-change' && entry.to) {
      genres.set(entry.to, (genres.get(entry.to) || 0) + 1);
    } else if ((entry.event === 'vote.skip' && entry.passed) || entry.event === 'poll.skipped-in-spotify') {
      skips += 1;
    } else if (entry.event === 'host.device-online-changed' && entry.online === false) {
      speakerDrops += 1;
    } else if (entry.event === 'server.started') {
      restarts += 1;
    }
  }
  for (const song of plays) {
    if (song.by && song.by !== 'Added in Spotify') adders.set(song.by, (adders.get(song.by) || 0) + 1);
  }
  return {
    plays: plays.length,
    uniqueSongs: new Set(plays.map((song) => song.uri)).size,
    djPicks,
    skips,
    speakerDrops,
    restarts,
    topAdders: top(adders),
    topGenres: top(genres)
  };
}

module.exports = { readEvents, isWarnOrError, isStatEvent, summarize, radioStats, logFile, dayOf };
