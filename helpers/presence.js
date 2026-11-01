const { ActivityType } = require('discord.js');
const { statusText, formatScore } = require('./format');
const { boardEntry } = require('./radio');

const RADIO_NAME = 'The Public Radio Project';
const ADDED_IN_SPOTIFY = 'Added in Spotify';

// The bot's own "Listening to" status, with the same song data the desktop app
// puts on a listener's profile. Discord only lets a bot set the activity's name
// and one line of state (no album art, progress bar or buttons), so the song is
// the name and "by Artist · Added by …" is the state; the live status message
// carries the rest.
function buildPresence(snapshot) {
  if (!snapshot) {
    return { status: 'dnd', activities: [{ type: ActivityType.Watching, name: 'the radio (not answering)' }] };
  }
  if (!snapshot.hostDeviceOnline) {
    return { status: 'dnd', activities: [{ type: ActivityType.Listening, name: statusText(`${RADIO_NAME} · speaker offline`) }] };
  }
  const track = snapshot.track;
  if (!track || !track.isPlaying) {
    return { status: 'idle', activities: [{ type: ActivityType.Listening, name: RADIO_NAME, state: track ? 'Paused' : 'Nothing playing' }] };
  }
  const adder = track.addedBy ? boardEntry(snapshot, track.addedBy) : null;
  // What the radio calls songs someone started straight in Spotify; not a person.
  const who = track.addedBy === ADDED_IN_SPOTIFY
    ? 'added in Spotify'
    : track.addedBy ? `added by ${track.addedBy}${adder ? ` (🏆 #${adder.rank} · ${formatScore(adder.score)})` : ''}` : '';
  const state = [track.artist ? `by ${track.artist}` : '', who].filter(Boolean).join(' · ');
  return {
    status: 'online',
    activities: [{ type: ActivityType.Listening, name: statusText(track.title) || RADIO_NAME, state: statusText(state) }]
  };
}

// Presence changes are rate limited, so only a change of what it says is sent.
function presenceKey(presence) {
  const [activity] = presence.activities;
  return JSON.stringify([presence.status, activity.type, activity.name, activity.state || null]);
}

function createPresence({ client, radio }) {
  let shown = null;
  async function update() {
    const presence = buildPresence(await radio.get());
    const key = presenceKey(presence);
    if (key === shown) return false;
    client.user.setPresence(presence);
    shown = key;
    return true;
  }
  return { update };
}

module.exports = { buildPresence, presenceKey, createPresence, RADIO_NAME };
