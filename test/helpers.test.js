const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, progressBar, truncate, statusText, trackUrl, formatScore, rankLabel, formatDuration, plural } = require('../helpers/format');
const { createRadio, livePosition, boardEntry, buildNowEmbed } = require('../helpers/radio');
const { buildPresence, presenceKey, createPresence, RADIO_NAME } = require('../helpers/presence');
const { snapshot } = require('./fixtures');

test('times, bars and text are formatted the way the radio shows them', () => {
  assert.equal(formatTime(61000), '1:01');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(progressBar(50000, 200000, 8), '▰▰▱▱▱▱▱▱');
  assert.equal(progressBar(1, 0), '');
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(statusText('x'), 'x ');
  assert.equal(statusText(''), undefined);
  assert.equal(statusText('a'.repeat(200)).length, 128);
  assert.equal(trackUrl('spotify:track:abc123'), 'https://open.spotify.com/track/abc123');
  assert.equal(trackUrl('spotify:album:abc'), undefined);
  assert.equal(formatScore(4), '+4');
  assert.equal(formatScore(-2), '-2');
  assert.equal(rankLabel(0), '🥇');
  assert.equal(rankLabel(5), '**6.**');
  assert.equal(formatDuration(30 * 1000), 'under a minute');
  assert.equal(formatDuration(125 * 60000), '2h 5m');
  assert.equal(plural(1, 'song'), '1 song');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
});

test('the radio client shares a short-lived answer, and says null when the radio is down', async () => {
  let requests = 0;
  let clock = 1000;
  const radio = createRadio({ now: () => clock, fetchImpl: async () => { requests += 1; return { ok: true, json: async () => ({ ok: true, listeners: requests }) }; } });
  const [a, b] = await Promise.all([radio.get(), radio.get()]);
  assert.equal(requests, 1);
  assert.equal(a, b);
  assert.equal(a.receivedAt, 1000);
  clock += 1000;
  assert.equal((await radio.get()).listeners, 1, 'still fresh');
  clock += 1500;
  assert.equal((await radio.get()).listeners, 2, 'stale: asked again');
  assert.equal((await radio.get({ fresh: true })).listeners, 3);

  const down = createRadio({ fetchImpl: async () => { throw new Error('refused'); } });
  assert.equal(await down.get(), null);
  const bad = createRadio({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(await bad.get(), null);
});

test('the position moves on while playing and stops at the end or when paused', () => {
  const playing = snapshot();
  assert.equal(livePosition(playing, 1010000), 60000);
  assert.equal(livePosition(playing, 1000000 + 999999), 200000);
  assert.equal(livePosition(snapshot({ track: { ...playing.track, isPlaying: false } }), 1010000), 50000);
  assert.equal(livePosition(snapshot({ track: null })), 0);
  assert.deepEqual(boardEntry(playing, 'jackie'), { rank: 2, username: 'jackie', likes: 38, dislikes: 1, score: 37 });
  assert.equal(boardEntry(playing, 'nobody'), null);
});

test('the now playing card carries the song, who added it, the speaker and what is next', () => {
  const card = buildNowEmbed(snapshot(), { radioUrl: 'https://dj.hashir.tech', at: 1010000 }).toJSON();
  assert.equal(card.title, 'Showdown');
  assert.equal(card.url, 'https://open.spotify.com/track/3dkeGDiZUvM4aipctvLapz');
  assert.match(card.description, /by \*\*Flummoxed Buffer\*\*/);
  assert.match(card.description, /1:00 \/ 3:20/);
  assert.equal(card.thumbnail.url, 'https://i.scdn.co/art.jpg');
  const field = (name) => card.fields.find((entry) => entry.name === name).value;
  assert.equal(field('Added by'), 'jackie · 🏆 #2');
  assert.equal(field('Speaker'), '🟢 online');
  assert.match(field('Up next'), /Next One/);
  assert.equal(card.footer.text, 'Listen along at dj.hashir.tech');

  const noQueue = buildNowEmbed(snapshot({ queue: [] })).toJSON();
  assert.match(noQueue.fields.find((entry) => entry.name === 'Up next').value, /A Pick.*lined up in the Jam/);
  assert.match(buildNowEmbed(snapshot({ track: { ...snapshot().track, isPlaying: false } })).toJSON().description, /Paused/);
  assert.equal(buildNowEmbed(snapshot({ track: null })).toJSON().title, 'Nothing playing');
  assert.equal(buildNowEmbed(null).toJSON().title, "The radio isn't answering");
  assert.equal(buildNowEmbed(snapshot({ hostDeviceOnline: false })).toJSON().fields.find((entry) => entry.name === 'Speaker').value, '🔴 offline');
});

test('the bot\'s status says the same things the desktop app shows', () => {
  const playing = buildPresence(snapshot());
  assert.equal(playing.status, 'online');
  assert.equal(playing.activities[0].type, 2, 'Listening');
  assert.equal(playing.activities[0].name, 'Showdown');
  assert.equal(playing.activities[0].state, 'by Flummoxed Buffer · added by jackie (🏆 #2 · +37)');

  assert.equal(buildPresence(snapshot({ track: { ...snapshot().track, addedBy: null } })).activities[0].state, 'by Flummoxed Buffer');
  assert.equal(buildPresence(snapshot({ track: { ...snapshot().track, addedBy: 'Added in Spotify' } })).activities[0].state, 'by Flummoxed Buffer · added in Spotify');
  const paused = buildPresence(snapshot({ track: { ...snapshot().track, isPlaying: false } }));
  assert.deepEqual([paused.status, paused.activities[0].name, paused.activities[0].state], ['idle', RADIO_NAME, 'Paused']);
  assert.equal(buildPresence(snapshot({ track: null })).activities[0].state, 'Nothing playing');
  const offline = buildPresence(snapshot({ hostDeviceOnline: false }));
  assert.deepEqual([offline.status, offline.activities[0].name], ['dnd', `${RADIO_NAME} · speaker offline`]);
  assert.equal(buildPresence(null).status, 'dnd');
});

test('the status is only sent again when what it says changes', async () => {
  const sent = [];
  let current = snapshot();
  const presence = createPresence({ client: { user: { setPresence: (value) => sent.push(value) } }, radio: { get: async () => current } });
  assert.equal(await presence.update(), true);
  // The song moving on a few seconds changes nothing it says.
  current = snapshot({ track: { ...current.track, progressMs: 90000 } });
  assert.equal(await presence.update(), false);
  current = snapshot({ track: { ...current.track, title: 'Another' } });
  assert.equal(await presence.update(), true);
  assert.equal(sent.length, 2);
  assert.notEqual(presenceKey(sent[0]), presenceKey(sent[1]));
});
