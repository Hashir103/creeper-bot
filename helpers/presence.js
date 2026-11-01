const { ActivityType } = require('discord.js');
const { statusText } = require('./format');

const RADIO_NAME = 'The Public Radio Project';

// "A, B, C" becomes "A +2": the status has room for one short line.
function leadArtist(artist) {
  const names = String(artist || '').split(',').map((name) => name.trim()).filter(Boolean);
  if (!names.length) return '';
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}

// The bot's own "Listening to" status. Discord only lets a bot set the
// activity's name and one line of state (no album art, progress bar or buttons;
// the desktop app gets those because it sets the status on a person's own
// account), so it is kept to the song and its lead artist. Who added it, the
// progress and the rest are in the live status message.
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
  const artist = leadArtist(track.artist);
  return {
    status: 'online',
    activities: [{ type: ActivityType.Listening, name: statusText(track.title) || RADIO_NAME, state: artist ? statusText(`by ${artist}`) : undefined }]
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
