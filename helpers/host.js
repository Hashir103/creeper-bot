const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const WebSocket = require('ws');

// The few things the admin commands can do on this machine. Each is a fixed
// command with no user text in it: there is no way to run something else from
// Discord. Everything but restart and pull only reads.

function execRun(command, args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(new Error((stderr || error.message).trim().split('\n').slice(-3).join(' ')), { code: error.code }));
      else resolve(stdout);
    });
  });
}

// One question to soloist's WebSocket API on the speaker (read-only: its
// state and its queue), answered by accept() returning something other than
// undefined.
function soloistRequest(url, payload, accept, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: timeoutMs });
    const done = (error, value) => {
      clearTimeout(timer);
      ws.removeAllListeners();
      ws.on('error', () => {});
      ws.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => done(new Error('the speaker did not answer')), timeoutMs);
    ws.on('open', () => ws.send(JSON.stringify(payload)));
    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch (error) {
        return;
      }
      if (message.type === 'auth_state' && message.logged_in === false) return done(new Error('soloist is logged out of Spotify'));
      const value = accept(message);
      if (value !== undefined) done(null, value);
    });
    ws.on('error', (error) => done(error));
    ws.on('close', () => done(new Error('the speaker closed the connection')));
  });
}

function keyValues(text) {
  return Object.fromEntries(String(text).split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

function createHost({ djDir, service, run = execRun, now = Date.now, soloist = soloistRequest }) {
  const git = (...args) => run('git', ['-C', djDir, ...args]);

  // Only this one variable is read from the radio's .env: it holds secrets.
  function speakerUrl() {
    try {
      const line = fs.readFileSync(path.join(djDir, '.env'), 'utf8').split('\n').find((entry) => entry.startsWith('SPEAKER_WS_URL='));
      return line ? line.slice('SPEAKER_WS_URL='.length).trim() : '';
    } catch (error) {
      return '';
    }
  }

  // Source files changed after the service started: the running code is older.
  function changedSince(startedAt) {
    if (!startedAt) return [];
    const changed = [];
    const visit = (target) => {
      let stat;
      try {
        stat = fs.statSync(path.join(djDir, target));
      } catch (error) {
        return;
      }
      if (stat.isDirectory()) fs.readdirSync(path.join(djDir, target)).forEach((name) => visit(path.join(target, name)));
      else if (stat.mtimeMs > startedAt + 2000) changed.push(target);
    };
    ['src', 'public', 'server.js', 'package.json'].forEach(visit);
    return changed;
  }

  async function serviceInfo() {
    const show = keyValues(await run('systemctl', ['show', service, '-p', 'ActiveState', '-p', 'SubState', '-p', 'MainPID']));
    let startedAt = null;
    if (Number(show.MainPID) > 0) {
      const seconds = Number((await run('ps', ['-o', 'etimes=', '-p', show.MainPID]).catch(() => '')).trim());
      if (Number.isFinite(seconds) && seconds >= 0) startedAt = now() - seconds * 1000;
    }
    const [sha, subject] = (await git('log', '-1', '--format=%h%x1f%s')).trim().split('\x1f');
    return { active: show.ActiveState, sub: show.SubState, startedAt, head: { sha, subject }, staleFiles: changedSince(startedAt) };
  }

  // What a pull would bring in.
  async function pending() {
    await git('fetch', '--quiet', 'origin');
    const commits = (await git('log', '--format=%h %s', 'HEAD..origin/main')).trim().split('\n').filter(Boolean);
    const files = (await git('diff', '--name-only', 'HEAD', 'origin/main')).trim().split('\n').filter(Boolean);
    return { commits, files, needsInstall: files.some((file) => file === 'package.json' || file === 'package-lock.json') };
  }

  async function pull() {
    const info = await pending();
    if (!info.commits.length) return { ...info, output: 'Already up to date.' };
    const output = await git('pull', '--ff-only', 'origin', 'main');
    return { ...info, output: output.trim() };
  }

  const restart = () => run('sudo', ['-n', 'systemctl', 'restart', service]);

  async function speaker() {
    const url = speakerUrl();
    if (!url) throw new Error('SPEAKER_WS_URL is not set in the radio\'s .env');
    const [state, queue] = await Promise.all([
      soloist(url, { type: 'command', command: 'get_state' }, (m) => (m.type === 'playback_state' ? m : undefined)),
      soloist(url, { type: 'command', command: 'get_queue', limit: 10 }, (m) => (m.type === 'queue_changed' ? m : undefined))
    ]);
    const name = (entry) => entry.item?.decorations?.identity?.name || entry.item?.uri;
    return {
      status: state.status,
      title: state.item ? name(state) : null,
      positionMs: state.position?.position_ms || 0,
      context: state.context?.uri || null,
      upcoming: (queue.upcoming || []).map((entry) => ({ source: entry.source, title: name(entry) }))
    };
  }

  return { serviceInfo, pending, pull, restart, speaker };
}

module.exports = { createHost, execRun, soloistRequest };
