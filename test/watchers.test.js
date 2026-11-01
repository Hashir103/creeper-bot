const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAlerts, createTailer } = require('../helpers/alerts');
const { readEvents, summarize, radioStats, isWarnOrError, isStatEvent, logFile } = require('../helpers/logs');
const { createGithubWatcher, createDeployWatcher } = require('../helpers/github');
const { createStatusMessage } = require('../helpers/statusMessage');
const { createStore } = require('../helpers/store');
const { snapshot } = require('./fixtures');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'creeper-'));
const memoryStore = (initial = {}) => { const data = { ...initial }; return { get: (key) => data[key], set: (key, value) => { data[key] = value; }, data }; };

// Timers a test can run by hand.
function fakeTimers() {
  const pending = [];
  return {
    setTimer: (fn, ms) => { const timer = { fn, ms }; pending.push(timer); return timer; },
    clearTimer: (timer) => { const index = pending.indexOf(timer); if (index >= 0) pending.splice(index, 1); },
    fire: () => pending.splice(0).forEach((timer) => timer.fn()),
    pending
  };
}

test('a speaker drop is only announced if it lasts, and its return only if it was announced', () => {
  const sent = [];
  const timers = fakeTimers();
  const alerts = createAlerts({ send: (text) => sent.push(text), setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  // A blip: offline then back inside the grace period says nothing.
  alerts.handle({ event: 'host.device-online-changed', online: false });
  alerts.handle({ event: 'host.device-online-changed', online: true });
  timers.fire();
  assert.deepEqual(sent, []);
  // A real drop: announced once the grace passes, then the return.
  alerts.handle({ event: 'host.device-online-changed', online: false });
  alerts.handle({ event: 'host.device-online-changed', online: false });
  assert.equal(timers.pending.length, 1);
  timers.fire();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /speaker is offline/);
  alerts.handle({ event: 'host.device-online-changed', online: true });
  assert.equal(sent.length, 2);
  assert.match(sent[1], /speaker is back/);
});

test('restarts, guest controls, logouts and errors are announced, each held back for a while', () => {
  const sent = [];
  let clock = 1000000;
  const alerts = createAlerts({ send: (text) => sent.push(text), now: () => clock });
  const fire = (entry) => alerts.handle(entry);
  fire({ event: 'server.started' });
  fire({ event: 'server.started' });
  fire({ event: 'jam.guest-controls-on', fix: 'x' });
  fire({ event: 'speaker.call-failed', error: { message: 'speaker is not logged in to Spotify' } });
  fire({ event: 'speaker.call-failed', error: { message: 'Opening handshake has timed out' } });
  fire({ level: 'error', event: 'idle.playlist-load-failed', error: { message: 'boom' } });
  fire({ level: 'error', event: 'idle.playlist-load-failed', error: { message: 'boom' } });
  fire({ level: 'warn', event: 'poll.unexpected-song' });
  assert.equal(sent.length, 4);
  assert.match(sent[0], /restarted/);
  assert.match(sent[1], /Guest controls/);
  assert.match(sent[2], /logged out/);
  assert.match(sent[3], /idle.playlist-load-failed.*boom/);
  clock += 11 * 60 * 1000;
  fire({ level: 'error', event: 'idle.playlist-load-failed', error: { message: 'boom' } });
  assert.equal(sent.length, 5, 'after the hold-back');
});

test('the log follower reads only new lines, waits for a line to finish, and moves to the next day', () => {
  const djDir = tmp();
  fs.mkdirSync(path.join(djDir, '.data', 'logs'), { recursive: true });
  let clock = Date.parse('2026-10-31T23:59:50Z');
  const seen = [];
  fs.writeFileSync(logFile(djDir, clock), `${JSON.stringify({ event: 'old' })}\n`);
  const tailer = createTailer({ djDir, now: () => clock, onEntry: (entry) => seen.push(entry.event) });
  tailer.poll();
  assert.deepEqual(seen, [], 'history is not replayed');
  fs.appendFileSync(logFile(djDir, clock), `${JSON.stringify({ event: 'a' })}\n{"event":"b"`);
  tailer.poll();
  assert.deepEqual(seen, ['a']);
  fs.appendFileSync(logFile(djDir, clock), '}\n');
  tailer.poll();
  assert.deepEqual(seen, ['a', 'b']);
  // Past midnight UTC: the rest of yesterday's file, then today's from its start.
  fs.appendFileSync(logFile(djDir, clock), `${JSON.stringify({ event: 'late' })}\n`);
  clock = Date.parse('2026-11-01T00:00:05Z');
  fs.writeFileSync(logFile(djDir, clock), `${JSON.stringify({ event: 'new-day' })}\n`);
  tailer.poll();
  assert.deepEqual(seen, ['a', 'b', 'late', 'new-day']);
});

test('logs are read by time range across days, and boiled down to counts and stats', async () => {
  const djDir = tmp();
  fs.mkdirSync(path.join(djDir, '.data', 'logs'), { recursive: true });
  const line = (time, level, event, extra = {}) => JSON.stringify({ time, level, event, ...extra });
  fs.writeFileSync(path.join(djDir, '.data', 'logs', 'radio-2026-10-30.log'), [
    line('2026-10-30T23:00:00Z', 'info', 'playback.started', { song: { uri: 'u1', title: 'One', by: 'ava' } }),
    line('2026-10-30T23:30:00Z', 'warn', 'host.device-online-changed', { online: false }),
    line('2026-10-30T23:31:00Z', 'debug', 'speaker.call')
  ].join('\n'));
  fs.writeFileSync(path.join(djDir, '.data', 'logs', 'radio-2026-10-31.log'), [
    line('2026-10-31T00:05:00Z', 'info', 'poll.natural-change', { song: { uri: 'u2', title: 'Two', by: 'ben' } }),
    line('2026-10-31T00:06:00Z', 'info', 'idle.play', { genre: 'indie', song: { uri: 'u3' } }),
    line('2026-10-31T00:06:30Z', 'info', 'idle.genre-change', { from: 'rock', to: 'indie' }),
    line('2026-10-31T00:06:40Z', 'info', 'poll.natural-change', { idle: true, song: { uri: 'u4', title: 'Four', by: 'ava' } }),
    line('2026-10-31T00:06:01Z', 'info', 'playback.started', { song: { uri: 'u3', title: 'Three', by: 'ava' } }),
    line('2026-10-31T00:07:00Z', 'info', 'vote.skip', { passed: true }),
    line('2026-10-31T00:08:00Z', 'info', 'vote.skip', { passed: false }),
    line('2026-10-31T00:09:00Z', 'info', 'server.started'),
    line('2026-10-31T00:10:00Z', 'error', 'idle.playlist-load-failed', { error: { message: 'boom' } }),
    'not json at all'
  ].join('\n'));
  const sinceMs = Date.parse('2026-10-30T22:00:00Z');
  const untilMs = Date.parse('2026-10-31T01:00:00Z');

  const problems = await readEvents({ djDir, sinceMs, untilMs, prefilter: isWarnOrError });
  assert.deepEqual(problems.map((entry) => entry.event), ['host.device-online-changed', 'idle.playlist-load-failed']);
  assert.deepEqual(summarize(problems).map((row) => row.key), ['warn host.device-online-changed', 'error idle.playlist-load-failed']);
  assert.equal((await readEvents({ djDir, sinceMs: Date.parse('2026-10-31T00:00:00Z'), untilMs, prefilter: isWarnOrError })).length, 1, 'range');

  const stats = radioStats(await readEvents({ djDir, sinceMs, untilMs, prefilter: isStatEvent }));
  assert.equal(stats.plays, 4);
  assert.equal(stats.uniqueSongs, 4);
  assert.equal(stats.djPicks, 2, 'idle.play and a natural change into one of the DJ\'s own picks');
  assert.equal(stats.skips, 1);
  assert.equal(stats.speakerDrops, 1);
  assert.equal(stats.restarts, 1);
  assert.deepEqual(stats.topAdders, [{ name: 'ava', count: 3 }, { name: 'ben', count: 1 }]);
  assert.deepEqual(stats.topGenres, [{ name: 'indie', count: 1 }]);
  assert.deepEqual(await readEvents({ djDir: tmp(), sinceMs, untilMs }), [], 'no logs is not an error');
});

const pull = (number, state, extra = {}) => ({ number, title: `PR ${number}`, html_url: `https://github.com/o/r/pull/${number}`, state, merged_at: null, user: { login: 'hashir' }, ...extra });

test('pull requests are announced when they open, merge or close, and the first look stays quiet', async () => {
  const sent = [];
  const store = memoryStore();
  let pulls = [pull(1, 'open'), pull(2, 'closed', { merged_at: '2026-10-31T00:00:00Z' })];
  const watcher = createGithubWatcher({ run: async () => JSON.stringify(pulls), repo: 'o/r', store, send: (text) => sent.push(text) });
  await watcher.poll();
  assert.deepEqual(sent, [], 'first poll only remembers');
  await watcher.poll();
  assert.deepEqual(sent, []);
  pulls = [pull(3, 'open'), pull(1, 'closed', { merged_at: '2026-11-01T00:00:00Z' }), pull(2, 'closed', { merged_at: '2026-10-31T00:00:00Z' })];
  await watcher.poll();
  assert.equal(sent.length, 2);
  assert.match(sent[0], /New pull request: \[#3 PR 3\]\(https:\/\/github.com\/o\/r\/pull\/3\) by hashir/);
  assert.match(sent[1], /Merged: \[#1/);
  pulls = [pull(3, 'closed')];
  await watcher.poll();
  assert.match(sent[2], /Closed without merging: \[#3/);
  await watcher.poll();
  assert.equal(sent.length, 3, 'nothing repeated');
});

test('the radio\'s code changing on the machine is announced, but not the first time it is seen', async () => {
  const sent = [];
  const store = memoryStore();
  let head = 'abc1234\x1fMerge pull request #82';
  const watcher = createDeployWatcher({ run: async () => head, djDir: '/x', store, send: (text) => sent.push(text) });
  await watcher.poll();
  await watcher.poll();
  assert.deepEqual(sent, []);
  head = 'def5678\x1fMerge pull request #83';
  await watcher.poll();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /def5678.*Merge pull request #83.*restarts/);
});

test('the live status message is posted once, then edited, and posted again if it was deleted', async () => {
  const store = memoryStore();
  const posts = [];
  const edits = [];
  let exists = true;
  const message = { id: 'M1', edit: async (payload) => { if (!exists) throw new Error('Unknown Message'); edits.push(payload); } };
  const channel = {
    isTextBased: () => true,
    send: async (payload) => { posts.push(payload); return { id: `M${posts.length}` }; },
    messages: { fetch: async () => { if (!exists) throw new Error('Unknown Message'); return message; } }
  };
  const client = { channels: { cache: new Map([['C1', channel]]), fetch: async () => channel } };
  let current = snapshot();
  const status = createStatusMessage({ client, channelId: 'C1', radio: { get: async () => current }, store, radioUrl: 'https://dj.hashir.tech', now: () => 1010000 });

  assert.equal(await status.update(), true);
  assert.equal(posts.length, 1);
  assert.equal(store.get('statusMessageId'), 'M1');
  assert.equal(await status.update(), false, 'nothing changed');
  current = snapshot({ listeners: 9 });
  assert.equal(await status.update(), true);
  assert.equal(edits.length, 1);
  exists = false;
  current = snapshot({ listeners: 10 });
  assert.equal(await status.update(), true);
  assert.equal(posts.length, 2, 'deleted: a new one');
  assert.equal(store.get('statusMessageId'), 'M2');
  assert.equal(await createStatusMessage({ client, channelId: '', radio: { get: async () => current }, store }).update(), false, 'no channel set');
});

test('the bot remembers things across restarts in a small file, and survives a bad one', () => {
  const dir = tmp();
  const file = path.join(dir, 'sub', 'state.json');
  const first = createStore(file);
  first.set('statusMessageId', 'M9');
  assert.equal(createStore(file).get('statusMessageId'), 'M9');
  fs.writeFileSync(file, '{broken');
  assert.equal(createStore(file).get('statusMessageId'), undefined);
});
