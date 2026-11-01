const config = require('./config');
const { EmbedBuilder } = require('discord.js');
const { formatTime, progressBar, truncate, trackUrl } = require('./format');

// The radio's room snapshot (GET /api/now on the DJ server), shared for a
// couple of seconds so the status, the presence and a command that all ask at
// once make one request. null when the radio can't be reached.
function createRadio({ url = config.djUrl, fetchImpl = (...args) => fetch(...args), now = Date.now, ttlMs = 2000, timeoutMs = 4000 } = {}) {
  let cached = null;
  let inflight = null;

  async function load() {
    try {
      const response = await fetchImpl(`${url}/api/now`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body?.ok) throw new Error('not ok');
      cached = { at: now(), snapshot: { ...body, receivedAt: now() } };
      return cached.snapshot;
    } catch (error) {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  }

  async function get({ fresh = false } = {}) {
    if (!fresh && cached && now() - cached.at < ttlMs) return cached.snapshot;
    if (!inflight) inflight = load();
    return inflight;
  }

  return { get };
}

// Where the song is now: the position the radio reported, plus the time since
// if it is playing.
function livePosition(snapshot, at = Date.now()) {
  const track = snapshot?.track;
  if (!track) return 0;
  const position = (track.progressMs || 0) + (track.isPlaying ? Math.max(0, at - snapshot.receivedAt) : 0);
  return track.durationMs ? Math.min(position, track.durationMs) : position;
}

// The leaderboard row for a song's adder, if they are on it.
function boardEntry(snapshot, name) {
  const board = snapshot?.leaderboard || [];
  const index = board.findIndex((entry) => entry.username === name);
  return index < 0 ? null : { rank: index + 1, ...board[index] };
}

const GREEN = 0x4caf50;
const GREY = 0x95a5a6;
const RED = 0xed4245;

function nextLine(snapshot) {
  const queued = snapshot.queue || [];
  if (queued.length) {
    const first = queued[0];
    const more = queued.length > 1 ? ` (+${queued.length - 1} more)` : '';
    return `**${truncate(first.title, 60)}** · ${truncate(first.artist, 40)}${first.addedBy ? ` · added by ${first.addedBy}` : ''}${more}`;
  }
  const pick = (snapshot.djUpNext || [])[0];
  if (!pick) return 'Nothing queued: add a song on the site';
  return `**${truncate(pick.title, 60)}** · ${truncate(pick.artist, 40)} · ${pick.queued ? "the DJ's pick, lined up in the Jam" : "the DJ's next pick"}`;
}

// The now playing card, for the live status message and /nowplaying.
function buildNowEmbed(snapshot, { radioUrl = config.radioUrl, at = Date.now() } = {}) {
  const embed = new EmbedBuilder().setFooter({ text: `Listen along at ${radioUrl.replace(/^https?:\/\//, '')}` });
  if (!snapshot) return embed.setColor(RED).setTitle("The radio isn't answering").setDescription('I can\'t reach the radio server right now.');
  const track = snapshot.track;
  const speaker = snapshot.hostDeviceOnline ? '🟢 online' : '🔴 offline';
  if (!track) {
    return embed.setColor(GREY).setTitle('Nothing playing').setDescription(nextLine(snapshot))
      .addFields({ name: 'Speaker', value: speaker, inline: true }, { name: 'Listeners', value: String(snapshot.listeners ?? 0), inline: true });
  }
  const position = livePosition(snapshot, at);
  const bar = progressBar(position, track.durationMs);
  const adder = track.addedBy ? boardEntry(snapshot, track.addedBy) : null;
  const addedBy = track.addedBy
    ? `${track.addedBy}${adder ? ` · 🏆 #${adder.rank}` : ''}`
    : 'The DJ';
  embed.setColor(track.isPlaying ? GREEN : GREY)
    .setTitle(truncate(track.title, 250))
    .setDescription(`by **${truncate(track.artist, 100)}**${bar ? `\n${bar} ${formatTime(position)} / ${formatTime(track.durationMs)}` : ''}${track.isPlaying ? '' : '\n⏸ Paused'}`)
    .addFields(
      { name: 'Added by', value: truncate(addedBy, 100), inline: true },
      { name: 'Listeners', value: String(snapshot.listeners ?? 0), inline: true },
      { name: 'Speaker', value: speaker, inline: true },
      { name: 'Up next', value: nextLine(snapshot) }
    );
  const url = trackUrl(track.uri);
  if (url) embed.setURL(url);
  if (track.albumArt) embed.setThumbnail(track.albumArt);
  return embed;
}

module.exports = { createRadio, livePosition, boardEntry, buildNowEmbed, nextLine };
