const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHost } = require('../helpers/host');
const { isAdmin } = require('../helpers/admin');
const { loadCommands } = require('../helpers/commands');
const dev = require('../commands/dev/dev');
const nowplaying = require('../commands/radio/nowplaying');
const leaderboard = require('../commands/radio/leaderboard');
const queue = require('../commands/radio/queue');
const stats = require('../commands/radio/stats');
const vibe = require('../commands/radio/vibe');
const { snapshot, interaction, button } = require('./fixtures');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'creeper-'));

// A radio directory with logs and a genre state, and fakes for everything else.
function context(overrides = {}) {
  const djDir = tmp();
  fs.mkdirSync(path.join(djDir, '.data', 'logs'), { recursive: true });
  const announced = [];
  const ran = [];
  const ctx = {
    config: { adminRoleId: 'ADMIN', guildId: 'G', djService: 'dj', djDir, githubRepo: 'o/r', radioUrl: 'https://dj.hashir.tech' },
    radio: { get: async () => snapshot() },
    host: {
      serviceInfo: async () => ({ active: 'active', sub: 'running', startedAt: Date.now() - 3 * 3600 * 1000, head: { sha: 'abc1234', subject: 'Merge pull request #82' }, staleFiles: [] }),
      speaker: async () => ({ status: 'playing', title: 'Showdown', positionMs: 61000, context: 'spotify:list:jam-list:x', upcoming: [{ source: 'queue', title: 'Lined up' }, { source: 'context', title: 'expectations' }] }),
      pending: async () => ({ commits: ['def5678 Add a thing'], files: ['src/a.js'], needsInstall: false }),
      pull: async () => ({ commits: ['def5678 Add a thing'], files: ['src/a.js'], needsInstall: false, output: 'ok' }),
      restart: async () => { ran.push('restart'); }
    },
    run: async (command, args) => { ran.push([command, ...args]); return '[{"number":84,"title":"Add a thing","author":{"login":"hashir"},"url":"https://github.com/o/r/pull/84"}]'; },
    announce: async (text) => { announced.push(text); },
    announced,
    ran,
    ...overrides
  };
  return ctx;
}

const text = (call) => (typeof call[1] === 'string' ? call[1] : call[1].content ?? JSON.stringify(call[1]));

test('the admin gate needs the guild, the role, and a configured role', () => {
  const asker = (roles, guildId = 'G') => ({ guildId, member: { roles } });
  const options = { adminRoleId: 'ADMIN', guildId: 'G' };
  assert.equal(isAdmin(asker(['ADMIN']), options), true, 'raw member');
  assert.equal(isAdmin(asker({ cache: new Map([['ADMIN', {}]]) }), options), true, 'cached member');
  assert.equal(isAdmin(asker(['OTHER']), options), false);
  assert.equal(isAdmin(asker({ cache: new Map() }), options), false);
  assert.equal(isAdmin(asker(['ADMIN'], 'OTHER_GUILD'), options), false);
  assert.equal(isAdmin(asker(['ADMIN']), { adminRoleId: '', guildId: 'G' }), false, 'no role configured: nobody');
  assert.equal(isAdmin({ guildId: 'G', member: null }, options), false, 'a DM');
});

test('every command loads, with its own name, and the old music commands are gone', () => {
  const commands = loadCommands(path.join(__dirname, '..', 'commands'));
  const names = commands.map((command) => command.data.name).sort();
  assert.deepEqual(names, ['dev', 'leaderboard', 'nowplaying', 'queue', 'stats', 'vibe']);
  for (const command of commands) assert.doesNotThrow(() => command.data.toJSON());
  assert.deepEqual(dev.data.toJSON().options.map((option) => option.name), ['status', 'logs', 'speaker', 'prs', 'restart', 'deploy']);
});

test('/dev turns away everyone without the admin role, before doing anything', async () => {
  for (const sub of ['status', 'logs', 'speaker', 'prs', 'restart', 'deploy']) {
    const ctx = context();
    const asked = interaction({ sub, roles: ['SOMETHING_ELSE'] });
    await dev.execute(asked, ctx);
    assert.equal(asked.calls.length, 1, sub);
    assert.equal(asked.calls[0][1].flags, 64, 'only they see it');
    assert.match(asked.calls[0][1].content, /admin role/);
    assert.deepEqual(ctx.ran, [], `${sub} ran nothing`);
  }
});

test('/dev status gathers the service, speaker, room and recent trouble in one private reply', async () => {
  const ctx = context();
  const asked = interaction({ sub: 'status', roles: ['ADMIN'] });
  await dev.execute(asked, ctx);
  assert.equal(asked.calls[0][1].flags, 64);
  const card = asked.calls.at(-1)[1].embeds[0].toJSON();
  const field = (name) => card.fields.find((entry) => entry.name === name).value;
  assert.match(field('dj'), /active \(running\), up 3h 0m/);
  assert.match(field('Code'), /abc1234.*running the latest code on disk/s);
  assert.match(field('Speaker (soloist)'), /playing: Showdown at 1:01/);
  assert.match(field('Room'), /3 listeners, 1 song queued, host device online/);

  // The service lookup failing leaves the rest of the reply intact.
  const broken = context();
  broken.host.serviceInfo = async () => { throw new Error('systemctl missing'); };
  broken.host.speaker = async () => { throw new Error('the speaker did not answer'); };
  const second = interaction({ sub: 'status', roles: ['ADMIN'] });
  await dev.execute(second, broken);
  const fields = second.calls.at(-1)[1].embeds[0].toJSON().fields;
  assert.match(fields.find((entry) => entry.name === 'Service').value, /systemctl missing/);
  assert.match(fields.find((entry) => entry.name === 'Speaker (soloist)').value, /did not answer/);

  const stale = context();
  stale.host.serviceInfo = async () => ({ active: 'active', sub: 'running', startedAt: Date.now() - 60000, head: { sha: 'a', subject: 's' }, staleFiles: ['src/rooms.js'] });
  const third = interaction({ sub: 'status', roles: ['ADMIN'] });
  await dev.execute(third, stale);
  assert.match(third.calls.at(-1)[1].embeds[0].toJSON().fields.find((entry) => entry.name === 'Code').value, /1 file changed since it started \(restart needed\): src\/rooms.js/);
});

test('/dev logs counts recent warnings and errors, and says so when there are none', async () => {
  const ctx = context();
  const none = interaction({ sub: 'logs', roles: ['ADMIN'] });
  await dev.execute(none, ctx);
  assert.match(none.calls.at(-1)[1], /No warnings or errors in the last 30 minutes/);

  const day = new Date().toISOString().slice(0, 10);
  const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
  fs.writeFileSync(path.join(ctx.config.djDir, '.data', 'logs', `radio-${day}.log`), [
    JSON.stringify({ time: at(120), level: 'warn', event: 'poll.unexpected-song' }),
    JSON.stringify({ time: at(90), level: 'warn', event: 'poll.unexpected-song' }),
    JSON.stringify({ time: at(60), level: 'error', event: 'idle.playlist-load-failed', error: { message: 'boom' } })
  ].join('\n'));
  const some = interaction({ sub: 'logs', roles: ['ADMIN'] });
  await dev.execute(some, ctx);
  const reply = some.calls.at(-1)[1];
  assert.match(reply, /3 entries/);
  assert.match(reply, /2× warn poll.unexpected-song/);
  assert.match(reply, /idle.playlist-load-failed — boom/);
  const errorsOnly = interaction({ sub: 'logs', roles: ['ADMIN'], options: { level: 'error' } });
  await dev.execute(errorsOnly, ctx);
  assert.match(errorsOnly.calls.at(-1)[1], /1 entry/);
});

test('/dev speaker shows what the Jam will actually play, with where each entry came from', async () => {
  const asked = interaction({ sub: 'speaker', roles: ['ADMIN'] });
  await dev.execute(asked, context());
  const reply = asked.calls.at(-1)[1];
  assert.match(reply, /1\. \[queue\] Lined up/);
  assert.match(reply, /2\. \[context\] expectations/);
});

test('/dev prs lists open pull requests through gh', async () => {
  const ctx = context();
  const asked = interaction({ sub: 'prs', roles: ['ADMIN'] });
  await dev.execute(asked, ctx);
  assert.deepEqual(ctx.ran[0].slice(0, 3), ['gh', 'pr', 'list']);
  assert.match(asked.calls.at(-1)[1], /\[#84\]\(https:\/\/github.com\/o\/r\/pull\/84\) Add a thing · hashir/);
});

test('/dev restart does nothing until the same admin presses the button, and logs who did it', async () => {
  // Cancelled.
  const cancelled = context();
  const cancel = button('dev-cancel');
  await dev.execute(interaction({ sub: 'restart', roles: ['ADMIN'], press: cancel }), cancelled);
  assert.deepEqual(cancelled.ran, []);
  assert.match(cancel.updated.content, /Cancelled/);

  // No answer.
  const silent = context();
  const waited = interaction({ sub: 'restart', roles: ['ADMIN'] });
  await dev.execute(waited, silent);
  assert.deepEqual(silent.ran, []);
  assert.match(waited.calls.at(-1)[1].content, /No answer in 30 seconds/);

  // Someone else's button press is not accepted.
  const other = context();
  const stranger = interaction({ sub: 'restart', roles: ['ADMIN'], press: button('dev-confirm', 'SOMEONE_ELSE') });
  await dev.execute(stranger, other);
  assert.deepEqual(other.ran, []);

  // Confirmed.
  const ctx = context();
  const asked = interaction({ sub: 'restart', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(asked, ctx);
  assert.deepEqual(ctx.ran, ['restart']);
  assert.match(text(asked.calls.at(-1)), /Restarted/);
  assert.deepEqual(ctx.announced, ['🛠️ <@U1> restarted the radio.']);

  // A restart a few seconds after the last one is turned away without even asking.
  const fresh = context();
  fresh.host.serviceInfo = async () => ({ startedAt: Date.now() - 10000, head: {}, staleFiles: [], active: 'active', sub: 'running' });
  const tooSoon = interaction({ sub: 'restart', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(tooSoon, fresh);
  assert.deepEqual(fresh.ran, []);
  assert.match(tooSoon.calls[0][1].content, /under a minute ago/);

  // A failed restart is reported, not announced as done.
  const failing = context();
  failing.host.restart = async () => { throw new Error('sudo: a password is required'); };
  const failed = interaction({ sub: 'restart', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(failed, failing);
  assert.match(text(failed.calls.at(-1)), /Restart failed: sudo: a password is required/);
  assert.deepEqual(failing.announced, []);
});

test('/dev deploy shows what is coming, then pulls and restarts only when confirmed', async () => {
  const none = context();
  none.host.pending = async () => ({ commits: [], files: [], needsInstall: false });
  const upToDate = interaction({ sub: 'deploy', roles: ['ADMIN'] });
  await dev.execute(upToDate, none);
  assert.match(upToDate.calls[0][1].content, /already up to date/);

  const ctx = context();
  const order = [];
  ctx.host.pull = async () => { order.push('pull'); return { commits: ['def5678 Add a thing'], output: 'ok' }; };
  ctx.host.restart = async () => { order.push('restart'); };
  const asked = interaction({ sub: 'deploy', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(asked, ctx);
  assert.match(asked.calls[0][1].content, /Deploy 1 commit.*def5678 Add a thing.*1 file change/s);
  assert.deepEqual(order, ['pull', 'restart']);
  assert.match(ctx.announced[0], /<@U1> deployed 1 commit/);

  // Changed dependencies are for a person to install: nothing runs.
  const deps = context();
  deps.host.pending = async () => ({ commits: ['aaa Bump ws'], files: ['package.json'], needsInstall: true });
  deps.host.pull = async () => { throw new Error('must not pull'); };
  const blocked = interaction({ sub: 'deploy', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(blocked, deps);
  assert.match(blocked.calls[0][1].content, /npm ci/);
  assert.equal(blocked.calls.length, 1, 'no confirm offered');

  // A failed pull leaves the service alone.
  const failing = context();
  const steps = [];
  failing.host.pull = async () => { steps.push('pull'); throw new Error('Not possible to fast-forward'); };
  failing.host.restart = async () => { steps.push('restart'); };
  const failed = interaction({ sub: 'deploy', roles: ['ADMIN'], press: button('dev-confirm') });
  await dev.execute(failed, failing);
  assert.deepEqual(steps, ['pull']);
  assert.match(text(failed.calls.at(-1)), /Deploy failed: Not possible to fast-forward/);
});

test('the fun commands answer anyone, from the radio snapshot', async () => {
  const ctx = context();
  const now = interaction();
  await nowplaying.execute(now, ctx);
  assert.equal(now.calls[0][1].embeds[0].toJSON().title, 'Showdown');

  const board = interaction({ options: { top: 2 } });
  await leaderboard.execute(board, ctx);
  const description = board.calls[0][1].embeds[0].toJSON().description;
  assert.equal(description.split('\n').length, 2);
  assert.match(description, /🥇 \*\*hash1r\*\* · \+50 \(👍 54 · 👎 4\)/);

  const empty = context({ radio: { get: async () => snapshot({ leaderboard: [] }) } });
  const none = interaction();
  await leaderboard.execute(none, empty);
  assert.match(none.calls[0][1], /Nobody is on the board/);

  const list = interaction();
  await queue.execute(list, ctx);
  const fields = list.calls[0][1].embeds[0].toJSON().fields;
  assert.match(fields[0].value, /1\. \*\*Next One\*\*/);
  assert.match(fields[1].value, /A Pick.*lined up in the Jam/);

  const down = context({ radio: { get: async () => null } });
  for (const command of [leaderboard, queue]) {
    const asked = interaction();
    await command.execute(asked, down);
    assert.match(asked.calls[0][1].content, /can't reach the radio/);
    assert.equal(asked.calls[0][1].flags, 64);
  }
  const offline = interaction();
  await nowplaying.execute(offline, down);
  assert.equal(offline.calls[0][1].embeds[0].toJSON().title, "The radio isn't answering");
});

test('/stats and /vibe read the radio\'s own files', async () => {
  const ctx = context();
  const day = new Date().toISOString().slice(0, 10);
  const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
  fs.writeFileSync(path.join(ctx.config.djDir, '.data', 'logs', `radio-${day}.log`), [
    JSON.stringify({ time: at(300), level: 'info', event: 'playback.started', song: { uri: 'u1', title: 'One', by: 'ava' } }),
    JSON.stringify({ time: at(200), level: 'info', event: 'poll.natural-change', song: { uri: 'u2', title: 'Two', by: 'ava' } }),
    JSON.stringify({ time: at(150), level: 'info', event: 'idle.genre-change', from: 'rock', to: 'indie' }),
    JSON.stringify({ time: at(100), level: 'info', event: 'idle.play', genre: 'indie' })
  ].join('\n'));
  const asked = interaction({ options: { days: 1 } });
  await stats.execute(asked, ctx);
  const card = asked.calls.at(-1)[1].embeds[0].toJSON();
  assert.equal(card.title, '📊 The radio, last 24 hours');
  assert.equal(card.fields.find((entry) => entry.name === 'Songs played').value, '2 (2 different)');
  assert.equal(card.fields.find((entry) => entry.name === 'Most songs added').value, 'ava (2)');
  assert.equal(card.fields.find((entry) => entry.name === 'Genre blocks the DJ played').value, 'indie (1)');

  const quiet = context();
  const nothing = interaction();
  await stats.execute(nothing, quiet);
  assert.match(nothing.calls.at(-1)[1], /No songs in that time/);

  fs.writeFileSync(path.join(ctx.config.djDir, '.data', 'genre-cycle.json'), JSON.stringify({ bucket: 'indie', playedInBlock: 3, direction: -1 }));
  const mood = interaction();
  await vibe.execute(mood, ctx);
  const vibeCard = mood.calls[0][1].embeds[0].toJSON();
  assert.equal(vibeCard.title, '🎛️ Indie & Alternative');
  assert.match(vibeCard.description, /●●●○○  song 3 of 5/);
  assert.match(vibeCard.footer.text, /back/);
  const missing = interaction();
  await vibe.execute(missing, quiet);
  assert.equal(missing.calls[0][1].flags, 64);
});

// The host module runs fixed commands; here with a fake that records them.
test('the host actions are fixed commands, read what they should, and only restart and pull change anything', async () => {
  const djDir = tmp();
  fs.mkdirSync(path.join(djDir, 'src'));
  fs.writeFileSync(path.join(djDir, 'src', 'old.js'), '');
  fs.writeFileSync(path.join(djDir, 'src', 'new.js'), '');
  fs.writeFileSync(path.join(djDir, '.env'), 'SECRET=hunter2\nSPEAKER_WS_URL=ws://100.1.2.3:7681\n');
  const started = Date.now() - 3600 * 1000;
  fs.utimesSync(path.join(djDir, 'src', 'old.js'), new Date(started - 60000), new Date(started - 60000));
  const ran = [];
  const replies = {
    systemctl: 'ActiveState=active\nSubState=running\nMainPID=4242\n',
    ps: ' 3600\n',
    'log -1': 'abc1234\x1fMerge pull request #82\n',
    fetch: '',
    'log --format': 'def5678 Add a thing\n',
    'diff --name-only': 'src/a.js\npackage-lock.json\n',
    pull: 'Updating abc..def\n'
  };
  const run = async (command, args) => {
    ran.push([command, ...args].join(' '));
    const key = Object.keys(replies).find((name) => [command, ...args].join(' ').includes(name));
    return key ? replies[key] : '';
  };
  const asked = [];
  const soloist = async (url, payload, accept) => {
    asked.push([url, payload.command]);
    const message = payload.command === 'get_state'
      ? { type: 'playback_state', status: 'playing', item: { uri: 'spotify:track:x', decorations: { identity: { name: 'Showdown' } } }, position: { position_ms: 5000 }, context: { uri: 'spotify:list:jam-list:s' } }
      : { type: 'queue_changed', upcoming: [{ source: 'context', item: { uri: 'spotify:track:g', decorations: { identity: { name: 'expectations' } } } }] };
    return accept(message);
  };
  const host = createHost({ djDir, service: 'dj', run, soloist, now: () => started + 3600 * 1000 });

  const info = await host.serviceInfo();
  assert.deepEqual([info.active, info.sub, info.head.sha], ['active', 'running', 'abc1234']);
  assert.equal(Math.round((Date.now() - info.startedAt) / 60000), 60, 'started an hour ago');
  assert.deepEqual(info.staleFiles, ['src/new.js'], 'only what changed since it started');

  const incoming = await host.pending();
  assert.deepEqual(incoming.commits, ['def5678 Add a thing']);
  assert.equal(incoming.needsInstall, true);

  const speaker = await host.speaker();
  assert.deepEqual(asked.map((entry) => entry[0]), ['ws://100.1.2.3:7681', 'ws://100.1.2.3:7681']);
  assert.deepEqual([speaker.status, speaker.title, speaker.positionMs, speaker.context], ['playing', 'Showdown', 5000, 'spotify:list:jam-list:s']);
  assert.deepEqual(speaker.upcoming, [{ source: 'context', title: 'expectations' }]);
  assert.deepEqual([...new Set(asked.map((entry) => entry[1]))].sort(), ['get_queue', 'get_state'], 'only reads');

  ran.length = 0;
  await host.restart();
  assert.deepEqual(ran, ['sudo -n systemctl restart dj']);
  await host.pull();
  assert.ok(ran.some((line) => line.includes('pull --ff-only origin main')));

  // Nothing to pull: no pull is run.
  ran.length = 0;
  replies['log --format'] = '';
  assert.equal((await host.pull()).output, 'Already up to date.');
  assert.ok(!ran.some((line) => line.includes(' pull ')));

  // The radio's .env is only ever read for the speaker address.
  fs.writeFileSync(path.join(djDir, '.env'), 'SECRET=hunter2\n');
  await assert.rejects(createHost({ djDir, service: 'dj', run, soloist }).speaker(), /SPEAKER_WS_URL is not set/);
});
